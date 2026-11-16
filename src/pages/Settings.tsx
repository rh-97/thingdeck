import { useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  KeyRound,
  LogOut,
  Radio,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { resetDemoClient, useClient } from '@/api/clientContext';
import { describeError } from '@/api/client';
import { authApi } from '@/auth/api';
import { ConnectSmartThings } from '@/auth/ConnectSmartThings';
import { meKey, useMe, useSignOut } from '@/auth/hooks';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toasts';
import { STATIC_DEMO } from '@/lib/env';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';

export default function SettingsPage() {
  const settings = useSettings();
  const client = useClient();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Your data source, SmartThings connection, display and account."
      />

      <DataSourceCard />
      {STATIC_DEMO ? (
        <Card className="p-5 text-sm text-muted">
          This hosted copy is demo-only: it has no ThingsDeck server, so it can&apos;t hold accounts or talk
          to SmartThings. Run it with Docker to use live mode — see the README.
        </Card>
      ) : (
        <ConnectionCard />
      )}

      <Card>
        <CardHeader title="Display" />
        <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2">
          <Field label="Theme">
            <Segmented
              label="Theme"
              value={settings.theme}
              onChange={settings.setTheme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Field>
          <Field label="Temperature">
            <Segmented
              label="Temperature unit"
              value={settings.temperatureUnit}
              onChange={settings.setTemperatureUnit}
              options={[
                { value: 'C', label: '°C' },
                { value: 'F', label: '°F' },
              ]}
            />
          </Field>
        </div>
      </Card>

      <Card className={cn(client.kind !== 'mock' && 'opacity-60')}>
        <CardHeader
          title="Demo simulation"
          description={
            client.kind === 'mock' ? 'Tune how the simulated home behaves.' : 'Only applies to the demo home.'
          }
        />
        <div className="grid gap-5 px-5 pb-5 sm:grid-cols-2">
          <Field label="Simulation speed" hint="Speeds up sensor drift, wash cycles and timers.">
            <Segmented
              label="Simulation speed"
              value={settings.simulationSpeed}
              onChange={settings.setSimulationSpeed}
              disabled={client.kind !== 'mock'}
              options={[
                { value: 0, label: 'Paused' },
                { value: 1, label: '1×' },
                { value: 5, label: '5×' },
                { value: 20, label: '20×' },
              ]}
            />
          </Field>
          <Field label="Network failures" hint="Makes some commands fail to show optimistic rollback.">
            <Segmented
              label="Failure rate"
              value={settings.failureRate}
              onChange={settings.setFailureRate}
              disabled={client.kind !== 'mock'}
              options={[
                { value: 0, label: 'None' },
                { value: 0.1, label: '10%' },
                { value: 0.3, label: '30%' },
              ]}
            />
          </Field>
          <div className="sm:col-span-2">
            <Button
              variant="outline"
              disabled={client.kind !== 'mock'}
              onClick={() => {
                resetDemoClient();
                toast.success('Demo home reset');
              }}
            >
              <RotateCcw className="h-4 w-4" /> Reset demo home
            </Button>
          </div>
        </div>
      </Card>

      {STATIC_DEMO ? null : <AccountCard />}

      <p className="pb-4 text-xs text-subtle">
        ThingsDeck is an independent open-source project. It is not affiliated with, endorsed by, or sponsored
        by Samsung or SmartThings. SmartThings is a trademark of its respective owner.
      </p>
    </div>
  );
}

function DataSourceCard() {
  const mode = useSettings((s) => s.mode);
  const setMode = useSettings((s) => s.setMode);
  const liveReady = useSettings((s) => s.liveReady);

  const options = [
    {
      id: 'demo',
      icon: FlaskConical,
      title: 'Demo home',
      body: 'A simulated two-location home with 27 devices. Nothing touches a real home.',
    },
    {
      id: 'live',
      icon: Radio,
      title: 'My SmartThings',
      body: 'Your real devices through your SmartThings personal access token.',
    },
  ] as const;

  return (
    <Card>
      <CardHeader
        title="Data source"
        description="Remembered on your account. Everything works the same in both modes."
      />
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
        {options.map((option) => {
          const selected = mode === option.id;
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              aria-pressed={selected}
              disabled={option.id === 'live' && STATIC_DEMO}
              onClick={() => {
                if (option.id === 'live' && !liveReady) {
                  document.getElementById('st-token')?.focus();
                  toast.info('Connect SmartThings first', 'Paste a personal access token below.');
                  return;
                }
                setMode(option.id);
              }}
              className={cn(
                'rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50',
                selected ? 'border-accent bg-accent-soft' : 'border-line hover:border-accent/40',
              )}
            >
              <div className="flex items-center gap-2 font-semibold">
                <Icon className={cn('h-4 w-4', selected ? 'text-accent' : 'text-muted')} /> {option.title}
                {selected ? <CheckCircle2 className="ml-auto h-4 w-4 text-accent" /> : null}
              </div>
              <p className="mt-1 text-sm text-muted">{option.body}</p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ConnectionCard() {
  const me = useMe();
  const queryClient = useQueryClient();
  const mode = useSettings((s) => s.mode);
  const setMode = useSettings((s) => s.setMode);
  const live = me.data?.live;

  const disconnect = async () => {
    try {
      await authApi.deleteToken();
      if (mode === 'live') setMode('demo');
      await queryClient.invalidateQueries({ queryKey: meKey });
      toast.info('SmartThings disconnected', 'Your token was deleted from the server.');
    } catch (error) {
      toast.error("Couldn't disconnect", describeError(error));
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> SmartThings connection
          </span>
        }
        description="Free personal access token — no paid SmartThings Developer Plan needed."
        action={
          live?.connected ? (
            <Badge tone={live.status === 'valid' ? 'good' : 'warn'}>
              {live.status === 'valid' ? 'Connected' : 'Expired'}
            </Badge>
          ) : (
            <Badge>Not connected</Badge>
          )
        }
      />
      <div className="space-y-5 px-5 pb-5">
        {live?.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-4 text-sm">
            <div className="flex items-start gap-2">
              <ShieldCheck
                className={cn('mt-0.5 h-4 w-4', live.status === 'valid' ? 'text-good' : 'text-warn')}
              />
              <div>
                <p className="font-medium">
                  {live.status === 'valid'
                    ? 'Token stored, encrypted on the server'
                    : 'Token expired — paste a new one'}
                </p>
                <p className="text-xs text-muted">
                  Saved {timeAgo(live.savedAt)} · personal tokens usually expire{' '}
                  {new Date(live.likelyExpiresAt).toLocaleString([], {
                    weekday: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
              Disconnect
            </Button>
          </div>
        ) : null}
        <ConnectSmartThings submitLabel={live?.connected ? 'Replace token' : 'Connect'} />
      </div>
    </Card>
  );
}

function AccountCard() {
  const me = useMe();
  const signOut = useSignOut();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      toast.success('Password changed', 'Other devices have been signed out.');
    } catch (error) {
      toast.error("Couldn't change password", describeError(error));
    } finally {
      setBusy(false);
    }
  };

  if (!me.data) return null;
  const { user } = me.data;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <UserRound className="h-4 w-4" /> Account
          </span>
        }
        description={`Signed in as ${user.email}${user.name ? ` (${user.name})` : ''} · member since ${new Date(user.createdAt).toLocaleDateString()}`}
        action={
          <Button variant="outline" size="sm" onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </Button>
        }
      />
      <form onSubmit={changePassword} className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
        <Field label="Current password" htmlFor="current-password">
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap justify-between gap-2 sm:col-span-2">
          <Button type="submit" variant="secondary" loading={busy} disabled={!current || next.length < 8}>
            Change password
          </Button>
          <Button type="button" variant="ghost" className="text-bad" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" /> Delete account
          </Button>
        </div>
      </form>
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} />
    </Card>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const signOut = useSignOut();

  const confirm = async () => {
    setBusy(true);
    try {
      await authApi.deleteAccount(password);
      toast.info('Account deleted');
      await signOut();
    } catch (error) {
      toast.error("Couldn't delete account", describeError(error));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete your account?"
      description="Your preferences and stored SmartThings token are erased. This can't be undone."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!password} onClick={() => void confirm()}>
            Delete account
          </Button>
        </>
      }
    >
      <Field label="Confirm with your password" htmlFor="delete-password">
        <Input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
    </Dialog>
  );
}
