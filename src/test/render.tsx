import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { ClientProvider } from '@/api/ClientProvider';
import { MockClient } from '@/api/mock/mockClient';

/** Renders UI against a fresh, latency-free demo home. */
export function renderWithHome(ui: ReactElement, { route = '/' } = {}) {
  const client = new MockClient({
    latency: false,
    backfillDays: 1,
    now: () => Date.parse('2026-11-16T18:00:00Z'),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </ClientProvider>
    </QueryClientProvider>,
  );
  return { ...result, client, queryClient };
}
