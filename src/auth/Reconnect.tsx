import { useSettings } from '@/store/settings';
import { Button } from '@/components/ui/Button';
import type { Me } from './api';
import { AuthLayout } from './AuthLayout';
import { ConnectSmartThings } from './ConnectSmartThings';
import { useSignOut } from './hooks';

/** Shown to live-mode users whose token is missing or has expired. */
export function Reconnect({ me }: { me: Me }) {
  const setMode = useSettings((s) => s.setMode);
  const signOut = useSignOut();
  const expired = me.live.connected;
  return (
    <AuthLayout
      title={expired ? 'Reconnect SmartThings' : 'Connect SmartThings'}
      description={
        expired
          ? 'Your SmartThings token has expired. Personal access tokens last 24 hours — paste a fresh one to pick up where you left off.'
          : 'Live mode needs a SmartThings personal access token.'
      }
    >
      <ConnectSmartThings submitLabel={expired ? 'Reconnect' : 'Connect'} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
        <Button variant="ghost" size="sm" onClick={() => setMode('demo')}>
          Use the demo home instead
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </AuthLayout>
  );
}
