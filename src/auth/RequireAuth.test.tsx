import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ClientProvider } from '@/api/ClientProvider';
import { useClient } from '@/api/clientContext';
import { DEFAULT_PREFERENCES, useSettings } from '@/store/settings';
import { RequireAuth } from './RequireAuth';

function Probe() {
  const client = useClient();
  return <p>backend: {client.kind}</p>;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const me = (status: 'valid' | 'expired') => ({
  user: { id: 7, email: 'sam@example.com', name: 'Sam', createdAt: '2026-11-17T00:00:00Z' },
  preferences: { mode: 'live' },
  live: { connected: true, status, savedAt: '2026-11-17T00:00:00Z', likelyExpiresAt: '2026-11-18T00:00:00Z' },
});

describe('auth gate with a live account', () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    useSettings.setState({ ...DEFAULT_PREFERENCES, hydratedUserId: null, liveReady: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  function renderGate(status: 'valid' | 'expired') {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        // Real network latency: the loop only shows when the session refetch is in flight.
        await new Promise((r) => setTimeout(r, 25));
        if (url.endsWith('/api/me')) return json(me(status));
        if (url.includes('/api/st/locations')) return json({ items: [{ locationId: 'L1', name: 'Home' }] });
        return json({ items: [] });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <ClientProvider>
          <MemoryRouter>
            <RequireAuth>
              <Probe />
            </RequireAuth>
          </MemoryRouter>
        </ClientProvider>
      </QueryClientProvider>,
    );
  }

  it('switches to the live backend once, without re-fetching the session in a loop', async () => {
    renderGate('valid');
    expect(await screen.findByText('backend: live')).toBeInTheDocument();
    // Give a feedback loop time to show itself.
    await new Promise((r) => setTimeout(r, 600));
    expect(calls.filter((u) => u.endsWith('/api/me')).length).toBeLessThanOrEqual(2);
    expect(screen.getByText('backend: live')).toBeInTheDocument();
  });

  it('shows the reconnect screen when the stored token has expired', async () => {
    renderGate('expired');
    expect(await screen.findByRole('heading', { name: 'Reconnect SmartThings' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(calls.filter((u) => u.endsWith('/api/me')).length).toBeLessThanOrEqual(2);
  });
});
