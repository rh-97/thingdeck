// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.ts';
import { openDb } from './db.ts';
import { open, seal } from './crypto.ts';

const GOOD = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const EXPIRED = 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee';

function setup(signup: 'open' | 'closed' = 'open') {
  let now = Date.parse('2026-11-17T10:00:00Z');
  const db = openDb(':memory:');
  const key = randomBytes(32);
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const auth = (init?.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer ${GOOD}`)
      return new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 });
    const url = String(input);
    if (url.endsWith('/locations')) return Response.json({ items: [{ locationId: 'L1', name: 'Home' }] });
    if (url.includes('/commands')) return Response.json({ results: [{ status: 'ACCEPTED' }] });
    return Response.json({ items: [] });
  });
  const app = buildApp({
    db,
    secretKey: key,
    signup,
    fetchImpl,
    now: () => now,
    smartThingsApi: 'https://st.test/v1',
  });
  return { app, db, key, fetchImpl, advance: (ms: number) => (now += ms) };
}

type App = ReturnType<typeof setup>['app'];

async function register(app: App, email = 'alex@example.com', password = 'correct horse') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password, name: 'Alex' },
  });
  const cookie = res.cookies.find((c) => c.name === 'td_session');
  return { res, cookie: cookie ? `td_session=${cookie.value}` : '' };
}

describe('auth server', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('registers, sets an httpOnly session cookie and returns the profile', async () => {
    const { res, cookie } = await register(ctx.app);
    expect(res.statusCode).toBe(201);
    const set = res.cookies.find((c) => c.name === 'td_session')!;
    expect(set.httpOnly).toBe(true);
    expect(set.sameSite).toBe('Lax');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json()).toMatchObject({
      user: { email: 'alex@example.com', name: 'Alex' },
      preferences: {},
      live: { connected: false },
    });
  });

  it('rejects duplicate emails, weak passwords and bad emails', async () => {
    await register(ctx.app);
    expect((await register(ctx.app)).res.statusCode).toBe(409);
    expect((await register(ctx.app, 'b@example.com', 'short')).res.statusCode).toBe(422);
    expect((await register(ctx.app, 'not-an-email')).res.statusCode).toBe(422);
  });

  it('logs in with the right password only, and logs out', async () => {
    await register(ctx.app);
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alex@example.com', password: 'nope nope' },
    });
    expect(bad.statusCode).toBe(401);
    const ok = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'ALEX@example.com ', password: 'correct horse' },
    });
    expect(ok.statusCode).toBe(200);
    const cookie = `td_session=${ok.cookies.find((c) => c.name === 'td_session')!.value}`;
    await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, 'x-requested-with': 'thingsdeck' },
    });
    expect((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(
      401,
    );
  });

  it('rate-limits repeated failed logins', async () => {
    await register(ctx.app);
    const attempt = () =>
      ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'alex@example.com', password: 'wrong pass' },
      });
    for (let i = 0; i < 8; i++) expect((await attempt()).statusCode).toBe(401);
    expect((await attempt()).statusCode).toBe(429);
    ctx.advance(16 * 60_000);
    expect((await attempt()).statusCode).toBe(401);
  });

  it('expires sessions after 30 days of inactivity', async () => {
    const { cookie } = await register(ctx.app);
    ctx.advance(31 * 86_400_000);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(
      401,
    );
  });

  it('honours closed sign-up', async () => {
    const closed = setup('closed');
    expect((await closed.app.inject({ method: 'GET', url: '/api/auth/config' })).json()).toEqual({
      signup: 'closed',
    });
    expect((await register(closed.app)).res.statusCode).toBe(403);
  });

  it('blocks cross-site style requests (no JSON, no custom header)', async () => {
    const { cookie } = await register(ctx.app);
    const form = await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/preferences',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'mode=live',
    });
    expect(form.statusCode).toBe(415);
    const bare = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(bare.statusCode).toBe(403);
  });

  it('stores whitelisted preferences per account', async () => {
    const { cookie } = await register(ctx.app);
    const put = await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/preferences',
      headers: { cookie },
      payload: { mode: 'demo', theme: 'dark', favorites: ['a'], evil: 'x' },
    });
    expect(put.json().preferences).toEqual({ mode: 'demo', theme: 'dark', favorites: ['a'] });
    const invalid = await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/preferences',
      headers: { cookie },
      payload: { mode: 'admin' },
    });
    expect(invalid.statusCode).toBe(422);
    const other = await register(ctx.app, 'sam@example.com');
    const theirs = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: other.cookie } });
    expect(theirs.json().preferences).toEqual({});
  });

  it('validates, encrypts and stores a SmartThings token', async () => {
    const { cookie } = await register(ctx.app);
    const rejected = await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/token',
      headers: { cookie },
      payload: { token: EXPIRED },
    });
    expect(rejected.statusCode).toBe(422);
    const saved = await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/token',
      headers: { cookie },
      payload: { token: GOOD },
    });
    expect(saved.json().live).toMatchObject({ connected: true, status: 'valid' });

    const row = ctx.db.raw.prepare('SELECT * FROM tokens').get() as {
      ciphertext: string;
      iv: string;
      tag: string;
    };
    expect(row.ciphertext).not.toContain(GOOD);
    expect(open(row, ctx.key)).toBe(GOOD);
    expect(() => open(row, randomBytes(32))).toThrow();
  });

  it('proxies SmartThings calls with the stored token', async () => {
    const { cookie } = await register(ctx.app);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/st/locations', headers: { cookie } })).statusCode,
    ).toBe(409);
    await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/token',
      headers: { cookie },
      payload: { token: GOOD },
    });

    const locations = await ctx.app.inject({ method: 'GET', url: '/api/st/locations', headers: { cookie } });
    expect(locations.json()).toEqual({ items: [{ locationId: 'L1', name: 'Home' }] });

    const command = await ctx.app.inject({
      method: 'POST',
      url: '/api/st/devices/d1/commands',
      headers: { cookie },
      payload: { commands: [{ component: 'main', capability: 'switch', command: 'on' }] },
    });
    expect(command.statusCode).toBe(200);
    const [url, init] = ctx.fetchImpl.mock.calls.at(-1)!;
    expect(url).toBe('https://st.test/v1/devices/d1/commands');
    expect(JSON.parse(String(init!.body))).toEqual({
      commands: [{ component: 'main', capability: 'switch', command: 'on' }],
    });

    // Anonymous users can't use the proxy.
    expect((await ctx.app.inject({ method: 'GET', url: '/api/st/locations' })).statusCode).toBe(401);
  });

  it('marks the token expired when SmartThings starts rejecting it', async () => {
    const { cookie } = await register(ctx.app);
    // Store a token directly, as if it had been valid when saved.
    const user = ctx.db.userByEmail('alex@example.com')!;
    ctx.db.saveToken(user.id, seal(EXPIRED, ctx.key), Date.parse('2026-11-17T10:00:00Z'));

    const call = await ctx.app.inject({ method: 'GET', url: '/api/st/devices', headers: { cookie } });
    expect(call.statusCode).toBe(401);
    expect(call.json().error.code).toBe('TOKEN_EXPIRED');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.json().live.status).toBe('expired');
  });

  it('re-checks a stored token on /api/me after a while', async () => {
    const { cookie } = await register(ctx.app);
    const user = ctx.db.userByEmail('alex@example.com')!;
    ctx.db.saveToken(user.id, seal(EXPIRED, ctx.key), Date.parse('2026-11-17T10:00:00Z'));
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().live.status,
    ).toBe('valid');
    ctx.advance(6 * 60_000);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json().live.status,
    ).toBe('expired');
  });

  it('changes password (signing out other sessions) and deletes the account', async () => {
    const { cookie } = await register(ctx.app);
    const second = await ctx.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'alex@example.com', password: 'correct horse' },
    });
    const otherCookie = `td_session=${second.cookies.find((c) => c.name === 'td_session')!.value}`;

    const wrong = await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/password',
      headers: { cookie },
      payload: { current: 'nope', next: 'new password!' },
    });
    expect(wrong.statusCode).toBe(403);
    const ok = await ctx.app.inject({
      method: 'PUT',
      url: '/api/me/password',
      headers: { cookie },
      payload: { current: 'correct horse', next: 'new password!' },
    });
    expect(ok.statusCode).toBe(200);
    expect(
      (await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie: otherCookie } })).statusCode,
    ).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode).toBe(
      200,
    );

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: '/api/me',
      headers: { cookie },
      payload: { password: 'new password!' },
    });
    expect(del.statusCode).toBe(200);
    expect(ctx.db.userByEmail('alex@example.com')).toBeUndefined();
  });
});
