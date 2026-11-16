import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../client';
import { LiveClient } from './liveClient';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('LiveClient', () => {
  it('calls the ThingsDeck proxy with cookies and follows pagination', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          items: [{ deviceId: 'a' }],
          _links: { next: { href: 'https://api.smartthings.com/v1/devices?locationId=L&page=1' } },
        }),
      )
      .mockResolvedValueOnce(json({ items: [{ deviceId: 'b' }], _links: {} }));
    const client = new LiveClient({ baseUrl: '/api/st', fetchImpl });

    const devices = await client.listDevices('L');

    expect(devices.map((d) => d.deviceId)).toEqual(['a', 'b']);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/st/devices?locationId=L',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/st/devices?locationId=L&page=1', expect.anything());
    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('thingsdeck');
    // The browser never sends a SmartThings token; the server attaches it.
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('posts commands as JSON', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ results: [] }));
    const client = new LiveClient({ baseUrl: '/api/st', fetchImpl });
    await client.executeCommands('dev 1', [{ component: 'main', capability: 'switch', command: 'on' }]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/st/devices/dev%201/commands');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(String(init!.body))).toEqual({
      commands: [{ component: 'main', capability: 'switch', command: 'on' }],
    });
  });

  it('maps API errors to ApiError with the server message', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ error: { message: 'Token expired', code: 'TOKEN_EXPIRED' } }, 401));
    const client = new LiveClient({ baseUrl: '/api/st', fetchImpl });
    const error = await client.listLocations().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).isAuthError).toBe(true);
    expect((error as ApiError).message).toBe('Token expired');
    expect((error as ApiError).code).toBe('TOKEN_EXPIRED');
  });

  it('reports network failures as status 0', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new LiveClient({ baseUrl: '/api/st', fetchImpl });
    await expect(client.listLocations()).rejects.toMatchObject({ status: 0 });
  });

  it('limits concurrent requests', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({ components: {} });
    });
    const client = new LiveClient({ baseUrl: '/api/st', fetchImpl, concurrency: 2 });
    await Promise.all(Array.from({ length: 6 }, (_, i) => client.getDeviceStatus(`d${i}`)));
    expect(peak).toBe(2);
  });

  it('normalises history events and applies client-side filters', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        items: [
          {
            deviceId: 'a',
            capability: 'switch',
            attribute: 'switch',
            value: 'on',
            time: '2026-11-16T10:00:00Z',
          },
          { deviceId: 'a', capability: 'powerMeter', attribute: 'power', value: 5, epoch: 1 },
        ],
      }),
    );
    const client = new LiveClient({ baseUrl: '/api/st', fetchImpl });
    const events = await client.getHistory({ locationId: 'L', attribute: 'switch' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      locationId: 'L',
      component: 'main',
      epoch: Date.parse('2026-11-16T10:00:00Z'),
    });
  });
});

describe('describeError', () => {
  it('keeps ThingsDeck server messages and explains SmartThings failures', async () => {
    const { describeError } = await import('../client');
    expect(
      describeError(new ApiError(401, '/auth/login', 'Email or password is incorrect', 'BAD_CREDENTIALS')),
    ).toBe('Email or password is incorrect');
    expect(describeError(new ApiError(401, '/devices', 'x', 'TOKEN_EXPIRED'))).toMatch(/expired/);
    expect(describeError(new ApiError(401, '/devices', 'Unauthorized'))).toMatch(/SmartThings rejected/);
  });
});
