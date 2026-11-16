import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { SYNCED_KEYS, useSettings, type SyncedPreferences } from '@/store/settings';
import { toast } from '@/store/toasts';
import { authApi } from './api';

export const meKey = ['me'] as const;

export function useMe(enabled = true) {
  return useQuery({
    queryKey: meKey,
    queryFn: authApi.me,
    enabled,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  });
}

export function useSignupConfig() {
  return useQuery({ queryKey: ['auth-config'], queryFn: authApi.config, staleTime: Infinity, retry: 1 });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try {
      await authApi.logout();
    } finally {
      useSettings.setState({ hydratedUserId: null, liveReady: false });
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  };
}

function pick(state: SyncedPreferences): SyncedPreferences {
  return Object.fromEntries(SYNCED_KEYS.map((k) => [k, state[k]])) as unknown as SyncedPreferences;
}

/**
 * Saves preference changes to the account (debounced). Starts only after the
 * account's preferences have been loaded, so defaults never overwrite them.
 */
export function usePreferenceSync(userId: number | undefined, hydrated: boolean) {
  useEffect(() => {
    if (!userId || !hydrated) return;
    let last = JSON.stringify(pick(useSettings.getState()));
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: SyncedPreferences | undefined;
    const flush = () => {
      if (!pending) return;
      const body = pending;
      pending = undefined;
      authApi
        .savePreferences(body)
        .catch(() => toast.error("Couldn't save your settings", 'They will apply to this tab only.'));
    };
    const unsubscribe = useSettings.subscribe((state) => {
      if (state.hydratedUserId !== userId) return;
      const next = pick(state);
      const serialized = JSON.stringify(next);
      if (serialized === last) return;
      last = serialized;
      pending = next;
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    });
    return () => {
      unsubscribe();
      clearTimeout(timer);
      flush();
    };
  }, [userId, hydrated]);
}
