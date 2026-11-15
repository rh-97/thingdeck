import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useClient } from '@/api/clientContext';
import { MockClient } from '@/api/mock/mockClient';
import type { DeviceStatus } from '@/api/types';
import { useActivity } from '@/store/activity';
import { toast } from '@/store/toasts';
import { applyEvent } from './optimistic';
import { keys } from './queries';

/**
 * Wires push events (demo simulation) into the React Query cache, so every
 * screen updates in real time without polling, and records API traffic for
 * the inspector.
 */
export function useLiveUpdates() {
  const client = useClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    const { addEvent, addRequest, reset } = useActivity.getState();
    reset();
    const offRequests = client.onRequest(addRequest);
    const offEvents = client.subscribe?.((event) => {
      queryClient.setQueryData<DeviceStatus>(keys.status(event.deviceId), (status) =>
        status ? applyEvent(status, event) : status,
      );
      addEvent(event);
    });
    const offRules =
      client instanceof MockClient
        ? client.onRuleRun(({ rule }) => toast.info('Automation ran', rule.name))
        : undefined;
    return () => {
      offRequests();
      offEvents?.();
      offRules?.();
    };
  }, [client, queryClient]);
}
