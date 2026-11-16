import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError, describeError } from '@/api/client';
import { useSettings } from '@/store/settings';
import { Button } from '@/components/ui/Button';
import { AuthLayout, Splash } from './AuthLayout';
import { usePreferenceSync, useMe } from './hooks';
import { Reconnect } from './Reconnect';
import { Welcome } from './Welcome';

/**
 * Gate for the whole app: signed in → preferences loaded → mode chosen →
 * (live mode) token valid. Each unmet step shows its own screen.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const location = useLocation();
  const hydratedUserId = useSettings((s) => s.hydratedUserId);
  const mode = useSettings((s) => s.mode);
  const userId = me.data?.user.id;
  const hydrated = !!userId && hydratedUserId === userId;

  useEffect(() => {
    if (me.data && useSettings.getState().hydratedUserId !== me.data.user.id) {
      useSettings.getState().hydrate(me.data.user.id, me.data.preferences);
    }
  }, [me.data]);

  useEffect(() => {
    // Only react to real answers: "still loading" must not flip live mode off,
    // or switching backends would refetch the session and loop.
    if (me.data) useSettings.getState().setLiveReady(me.data.live.status === 'valid');
  }, [me.data]);

  usePreferenceSync(userId, hydrated);

  if (me.isLoading) return <Splash />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) {
      const next = `${location.pathname}${location.search}`;
      return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />;
    }
    return (
      <AuthLayout title="Can't reach ThingsDeck" description={describeError(me.error)}>
        <Button variant="primary" onClick={() => void me.refetch()}>
          Try again
        </Button>
      </AuthLayout>
    );
  }
  if (!me.data || !hydrated) return <Splash />;
  if (!me.data.preferences.mode) return <Welcome me={me.data} />;
  if (mode === 'live' && me.data.live.status !== 'valid') return <Reconnect me={me.data} />;
  return <>{children}</>;
}
