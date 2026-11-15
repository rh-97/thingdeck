import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSettings } from '@/store/settings';
import type { SmartThingsClient } from './client';
import { ClientContext, getDemoClient, useDemoVersion } from './clientContext';
import { LiveClient } from './live/liveClient';
import { MockClient } from './mock/mockClient';

export function ClientProvider({
  children,
  client: override,
}: {
  children: ReactNode;
  client?: SmartThingsClient;
}) {
  const mode = useSettings((s) => s.mode);
  const token = useSettings((s) => s.token);
  const speed = useSettings((s) => s.simulationSpeed);
  const failureRate = useSettings((s) => s.failureRate);
  const demoVersion = useDemoVersion((s) => s.version);
  const queryClient = useQueryClient();

  const client = useMemo<SmartThingsClient>(() => {
    if (override) return override;
    if (mode === 'live' && token) return new LiveClient({ token });
    void demoVersion;
    return getDemoClient();
  }, [override, mode, token, demoVersion]);

  // Reset cached data whenever the backend changes so screens never mix homes.
  // (Skipped on first mount, where it would orphan the initial requests.)
  const previous = useRef(client);
  useEffect(() => {
    if (previous.current === client) return;
    previous.current = client;
    queryClient.resetQueries();
  }, [client, queryClient]);

  useEffect(() => {
    if (!(client instanceof MockClient)) return;
    client.configure({ failureRate });
    client.start(speed);
    return () => client.stop();
  }, [client, speed, failureRate]);

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}
