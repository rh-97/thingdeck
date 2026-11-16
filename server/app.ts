import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import type { Db, TokenStatus, User } from './db.ts';
import { hashPassword, newSessionToken, open, seal, sha256, verifyPassword } from './crypto.ts';
import { createLimiter } from './rateLimit.ts';

const DAY = 86_400_000;
const SESSION_TTL = 30 * DAY;
const COOKIE = 'td_session';
/** Personal access tokens created after Dec 2024 live for 24 hours. */
const PAT_LIFETIME = DAY;
/** Re-check a stored token against SmartThings at most this often. */
const TOKEN_RECHECK = 5 * 60_000;

export interface AppOptions {
  db: Db;
  /** 32-byte key used to encrypt stored SmartThings tokens. */
  secretKey: Buffer;
  signup: 'open' | 'closed';
  smartThingsApi?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: boolean;
}

/** Preferences the client may store; anything else is dropped. */
const PREFERENCE_KEYS = {
  mode: (v: unknown) => v === 'demo' || v === 'live',
  theme: (v: unknown) => v === 'system' || v === 'light' || v === 'dark',
  temperatureUnit: (v: unknown) => v === 'C' || v === 'F',
  simulationSpeed: (v: unknown) => typeof v === 'number' && v >= 0 && v <= 100,
  failureRate: (v: unknown) => typeof v === 'number' && v >= 0 && v <= 1,
  locationId: (v: unknown) => v === null || (typeof v === 'string' && v.length < 200),
  favorites: (v: unknown) =>
    v === null || (Array.isArray(v) && v.length < 500 && v.every((x) => typeof x === 'string')),
  energyRate: (v: unknown) => typeof v === 'number' && v >= 0 && v < 100,
  currency: (v: unknown) => typeof v === 'string' && v.length <= 4,
} as const;

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    sessionHash?: string;
  }
}

class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function buildApp(options: AppOptions) {
  const { db, secretKey, signup } = options;
  const now = options.now ?? Date.now;
  const fetchImpl = options.fetchImpl ?? fetch;
  const api = (options.smartThingsApi ?? 'https://api.smartthings.com/v1').replace(/\/$/, '');
  const limiter = createLimiter({ max: 8, windowMs: 15 * 60_000, now });

  const app = Fastify({ logger: options.logger ?? false, trustProxy: true, bodyLimit: 1_048_576 });
  app.register(cookie);

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
    const status = error instanceof HttpError ? error.statusCode : (error.statusCode ?? 500);
    if (status >= 500) app.log.error(error);
    reply.status(status).send({
      error: {
        message: status >= 500 ? 'Internal server error' : error.message,
        ...(error instanceof HttpError && error.code ? { code: error.code } : {}),
      },
    });
  });

  /* ----------------------------- helpers ----------------------------- */

  const setSession = (reply: FastifyReply, request: FastifyRequest, userId: number) => {
    const token = newSessionToken();
    db.createSession(sha256(token), userId, now(), now() + SESSION_TTL);
    reply.setCookie(COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: request.protocol === 'https',
      maxAge: SESSION_TTL / 1000,
    });
  };

  const publicUser = (u: User) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: new Date(u.created_at).toISOString(),
  });

  const requireUser = (request: FastifyRequest) => {
    if (!request.user) throw new HttpError(401, 'Please sign in', 'UNAUTHENTICATED');
    return request.user;
  };

  const decryptToken = (userId: number) => {
    const stored = db.token(userId);
    if (!stored) return undefined;
    try {
      return { stored, token: open(stored, secretKey) };
    } catch {
      // Key rotated or data tampered with: treat as missing.
      db.deleteToken(userId);
      return undefined;
    }
  };

  /** Calls SmartThings with the user's token; returns the HTTP status (0 on network error). */
  const probeToken = async (token: string) => {
    try {
      const res = await fetchImpl(`${api}/locations`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      return res.status;
    } catch {
      return 0;
    }
  };

  const liveStatus = async (userId: number, recheck: boolean) => {
    const found = decryptToken(userId);
    if (!found) return { connected: false as const, status: 'missing' as const };
    let status: TokenStatus = found.stored.status;
    if (status === 'valid' && recheck && now() - found.stored.checked_at > TOKEN_RECHECK) {
      const code = await probeToken(found.token);
      if (code === 401 || code === 403) status = 'expired';
      else if (code >= 200 && code < 300) status = 'valid';
      db.setTokenStatus(userId, status, now());
    }
    return {
      connected: true as const,
      status,
      savedAt: new Date(found.stored.saved_at).toISOString(),
      /** Best-effort: PATs last 24 h from creation, and we only know when it was saved. */
      likelyExpiresAt: new Date(found.stored.saved_at + PAT_LIFETIME).toISOString(),
    };
  };

  const credentials = (body: unknown) => {
    const b = (body ?? {}) as { email?: unknown; password?: unknown; name?: unknown };
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const password = typeof b.password === 'string' ? b.password : '';
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 80) : '';
    return { email, password, name };
  };

  const validatePassword = (password: string) => {
    if (password.length < 8) throw new HttpError(422, 'Password must be at least 8 characters');
    if (password.length > 200) throw new HttpError(422, 'Password is too long');
  };

  /* ----------------------------- hooks ----------------------------- */

  app.addHook('onRequest', async (request) => {
    // CSRF defence: state-changing API calls must be JSON (forms can't send that cross-site).
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.url.startsWith('/api/')) {
      const type = request.headers['content-type'] ?? '';
      const hasBody =
        Number(request.headers['content-length'] ?? 0) > 0 || !!request.headers['transfer-encoding'];
      if (hasBody && !type.includes('application/json'))
        throw new HttpError(415, 'Expected application/json');
      if (!hasBody && request.headers['x-requested-with'] !== 'thingsdeck') {
        throw new HttpError(403, 'Missing X-Requested-With header');
      }
    }
    const token = request.cookies[COOKIE];
    if (!token) return;
    const hash = sha256(token);
    const user = db.sessionUser(hash, now());
    if (user) {
      request.user = user;
      request.sessionHash = hash;
    }
  });

  /* ----------------------------- auth ----------------------------- */

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/auth/config', async () => ({ signup }));

  app.post('/api/auth/register', async (request, reply) => {
    if (signup !== 'open') throw new HttpError(403, 'Registration is closed on this server', 'SIGNUP_CLOSED');
    const { email, password, name } = credentials(request.body);
    const key = `register:${request.ip}`;
    const wait = limiter.check(key);
    if (wait) throw new HttpError(429, `Too many attempts. Try again in ${wait}s`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200)
      throw new HttpError(422, 'Enter a valid email address');
    validatePassword(password);
    if (db.userByEmail(email)) {
      limiter.fail(key);
      throw new HttpError(409, 'An account with this email already exists');
    }
    const user = db.createUser(email, name, await hashPassword(password), now());
    setSession(reply, request, user.id);
    reply.status(201);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = credentials(request.body);
    const key = `login:${request.ip}:${email}`;
    const wait = limiter.check(key);
    if (wait) throw new HttpError(429, `Too many attempts. Try again in ${wait}s`);
    const user = email ? db.userByEmail(email) : undefined;
    // Always run a hash so response time doesn't reveal whether the email exists.
    const ok = user
      ? await verifyPassword(password, user.password_hash)
      : (await hashPassword(password), false);
    if (!user || !ok) {
      limiter.fail(key);
      throw new HttpError(401, 'Email or password is incorrect', 'BAD_CREDENTIALS');
    }
    limiter.reset(key);
    db.purgeExpiredSessions(now());
    setSession(reply, request, user.id);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionHash) db.deleteSession(request.sessionHash);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  /* ----------------------------- account ----------------------------- */

  app.get('/api/me', async (request) => {
    const user = requireUser(request);
    // Slide the session forward on activity.
    if (request.sessionHash) db.touchSession(request.sessionHash, now() + SESSION_TTL);
    return {
      user: publicUser(user),
      preferences: db.preferences(user.id),
      live: await liveStatus(user.id, true),
    };
  });

  app.put('/api/me/preferences', async (request) => {
    const user = requireUser(request);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const next = { ...db.preferences(user.id) };
    for (const [key, valid] of Object.entries(PREFERENCE_KEYS)) {
      if (key in body) {
        if (!valid(body[key])) throw new HttpError(422, `Invalid value for ${key}`);
        next[key] = body[key];
      }
    }
    db.savePreferences(user.id, next, now());
    return { preferences: next };
  });

  app.put('/api/me/password', async (request) => {
    const user = requireUser(request);
    const { current, next } = (request.body ?? {}) as { current?: string; next?: string };
    if (!current || !(await verifyPassword(current, user.password_hash)))
      throw new HttpError(403, 'Current password is incorrect');
    validatePassword(next ?? '');
    db.updatePassword(user.id, await hashPassword(next!));
    db.deleteSessionsFor(user.id, request.sessionHash); // sign out other devices
    return { ok: true };
  });

  app.delete('/api/me', async (request, reply) => {
    const user = requireUser(request);
    const { password } = (request.body ?? {}) as { password?: string };
    if (!password || !(await verifyPassword(password, user.password_hash)))
      throw new HttpError(403, 'Password is incorrect');
    db.deleteUser(user.id);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  /* ----------------------------- SmartThings token ----------------------------- */

  app.put('/api/me/token', async (request) => {
    const user = requireUser(request);
    const { token } = (request.body ?? {}) as { token?: unknown };
    if (typeof token !== 'string' || !/^[\w-]{20,200}$/.test(token.trim())) {
      throw new HttpError(422, 'That doesn’t look like a SmartThings token');
    }
    const code = await probeToken(token.trim());
    if (code === 401 || code === 403)
      throw new HttpError(
        422,
        'SmartThings rejected this token. It may be expired or missing scopes.',
        'TOKEN_REJECTED',
      );
    if (code === 0 || code >= 500)
      throw new HttpError(502, 'Could not reach SmartThings to check the token. Try again.');
    if (code < 200 || code >= 300) throw new HttpError(422, `SmartThings answered HTTP ${code}`);
    db.saveToken(user.id, seal(token.trim(), secretKey), now());
    return { live: await liveStatus(user.id, false) };
  });

  app.delete('/api/me/token', async (request) => {
    const user = requireUser(request);
    db.deleteToken(user.id);
    return { ok: true };
  });

  /* ----------------------------- SmartThings proxy ----------------------------- */

  const proxy = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = requireUser(request);
    const found = decryptToken(user.id);
    if (!found) throw new HttpError(409, 'Connect a SmartThings token first', 'TOKEN_MISSING');
    const path = request.url.replace(/^\/api\/st/, '');
    let upstream: Response;
    try {
      upstream = await fetchImpl(`${api}${path}`, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${found.token}`,
          Accept: 'application/json',
          ...(request.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
      });
    } catch {
      throw new HttpError(502, 'Could not reach SmartThings');
    }
    if (upstream.status === 401) {
      db.setTokenStatus(user.id, 'expired', now());
      throw new HttpError(401, 'Your SmartThings token has expired', 'TOKEN_EXPIRED');
    }
    const text = await upstream.text();
    reply
      .status(upstream.status)
      .header('content-type', upstream.headers.get('content-type') ?? 'application/json');
    return reply.send(text);
  };

  app.all('/api/st/*', proxy);

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { message: 'Not found' } }));

  return app;
}
