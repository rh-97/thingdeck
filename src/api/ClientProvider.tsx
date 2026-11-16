import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/store/settings';
import type { SmartThingsClient } from './client';
import { ClientContext, getDemoClient, useDemoVersion } from './clientContext';
import { LiveClient } from './live/liveClient';
import { MockClient } from './mock/mockClient';

const AUTH_QUERY_ROOTS = new Set(['me', 'auth-config']);

export function ClientProvider({
  children,
  client: override,
}: {
  children: ReactNode;
  client?: SmartThingsClient;
}) {
  const mode = useSettings((s) => s.mode);
  const liveReady = useSettings((s) => s.liveReady);
  const speed = useSettings((s) => s.simulationSpeed);
  const failureRate = useSettings((s) => s.failureRate);
  const demoVersion = useDemoVersion((s) => s.version);
  const queryClient = useQueryClient();

  const client = useMemo<SmartThingsClient>(() => {
    if (override) return override;
    if (mode === 'live' && liveReady) return new LiveClient();
    void demoVersion;
    return getDemoClient();
  }, [override, mode, liveReady, demoVersion]);

  // Reset cached data whenever the backend changes so screens never mix homes.
  // (Skipped on first mount, where it would orphan the initial requests.)
  const previous = useRef(client);
  useEffect(() => {
    if (previous.current === client) return;
    previous.current = client;
    // Only home data belongs to a backend; the session and auth config don't.
    queryClient.resetQueries({ predicate: (query) => !AUTH_QUERY_ROOTS.has(String(query.queryKey[0])) });
  }, [client, queryClient]);

  useEffect(() => {
    if (!(client instanceof MockClient)) return;
    client.configure({ failureRate });
    client.start(speed);
    return () => client.stop();
  }, [client, speed, failureRate]);

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
