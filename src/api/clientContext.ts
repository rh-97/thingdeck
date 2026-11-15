import { createContext, useContext } from 'react';
import { create } from 'zustand';
import type { SmartThingsClient } from './client';
import { MockClient } from './mock/mockClient';

export const ClientContext = createContext<SmartThingsClient | null>(null);

/** One demo home per page load so state survives navigation and mode switches. */
let demoClient: MockClient | undefined;
export function getDemoClient() {
  demoClient ??= new MockClient();
  return demoClient;
}

/** Bumped whenever the demo home is replaced so the provider picks up the new instance. */
export const useDemoVersion = create<{ version: number }>(() => ({ version: 0 }));

/** Replace the demo home with a fresh one (Settings → Reset demo). */
export function resetDemoClient() {
  demoClient?.stop();
  demoClient = new MockClient();
  useDemoVersion.setState((s) => ({ version: s.version + 1 }));
  return demoClient;
}

export function useClient(): SmartThingsClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient must be used inside <ClientProvider>');
  return client;
}
