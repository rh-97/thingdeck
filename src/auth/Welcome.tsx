import { useState } from 'react';
import { ArrowLeft, FlaskConical, Radio } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '@/api/client';
import { useSettings, type DataMode } from '@/store/settings';
import { toast } from '@/store/toasts';
import { Button } from '@/components/ui/Button';
import { authApi, type Me } from './api';
import { AuthLayout } from './AuthLayout';
import { ConnectSmartThings } from './ConnectSmartThings';
import { meKey, useSignOut } from './hooks';

/** First-run choice after registering: demo home or the user's own SmartThings. */
export function Welcome({ me }: { me: Me }) {
  const [step, setStep] = useState<'choose' | 'connect'>('choose');
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const signOut = useSignOut();

  const choose = async (mode: DataMode) => {
    setBusy(true);
    try {
      await authApi.savePreferences({ mode });
      useSettings.setState({ mode, locationId: null });
      await queryClient.invalidateQueries({ queryKey: meKey });
    } catch (err) {
      toast.error("Couldn't save your choice", describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const firstName = me.user.name.split(' ')[0];

  if (step === 'connect') {
    return (
      <AuthLayout
        title="Connect your SmartThings"
        description="ThingsDeck uses a personal access token to read and control your devices."
      >
        <ConnectSmartThings onConnected={() => void choose('live')} submitLabel="Connect and continue" />
        <Button variant="ghost" className="mt-4" onClick={() => setStep('choose')}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      wide
      title={firstName ? `Welcome, ${firstName}!` : 'Welcome to ThingsDeck'}
      description="How would you like to start? You can switch any time in Settings."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void choose('demo')}
          className="flex flex-col items-start justify-start rounded-xl border border-line p-5 text-left transition hover:border-accent hover:bg-accent-soft/40 disabled:opacity-60"
        >
          <FlaskConical className="h-6 w-6 text-accent" aria-hidden />
          <h2 className="mt-3 font-semibold">Explore the demo home</h2>
          <p className="mt-1 text-sm text-muted">
            A simulated two-location home with 27 devices, scenes and automations. No SmartThings account
            needed.
          </p>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStep('connect')}
          className="flex flex-col items-start justify-start rounded-xl border border-line p-5 text-left transition hover:border-accent hover:bg-accent-soft/40 disabled:opacity-60"
        >
          <Radio className="h-6 w-6 text-good" aria-hidden />
          <h2 className="mt-3 font-semibold">Connect my SmartThings</h2>
          <p className="mt-1 text-sm text-muted">
            See and control your real devices with a free personal access token.
          </p>
        </button>
      </div>
      <p className="mt-6 text-center text-xs text-muted">
        Signed in as {me.user.email} ·{' '}
        <button className="font-medium text-accent hover:underline" onClick={() => void signOut()}>
          Sign out
        </button>
      </p>
    </AuthLayout>
  );
}
