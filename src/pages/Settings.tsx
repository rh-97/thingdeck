import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  KeyRound,
  Radio,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { resetDemoClient, useClient } from '@/api/clientContext';
import { describeError } from '@/api/client';
import { LiveClient } from '@/api/live/liveClient';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toasts';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';

/** Static hosts (GitHub Pages) have no API proxy, so live mode can't work there. */
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true';

const SCOPES = [
  'r:devices:*',
  'x:devices:*',
  'r:locations:*',
  'x:locations:*',
  'r:scenes:*',
  'x:scenes:*',
  'r:rules:*',
  'w:rules:*',
];

export default function SettingsPage() {
  const settings = useSettings();
  const client = useClient();
  const [draft, setDraft] = useState(settings.token);
  const [remember, setRemember] = useState(settings.rememberToken);
  const [testing, setTesting] = useState(false);
  const [verified, setVerified] = useState<string | null>(null);

  const connect = async () => {
    setTesting(true);
    setVerified(null);
    try {
      const locations = await new LiveClient({ token: draft }).listLocations();
      setVerified(
        `Found ${locations.length} location${locations.length === 1 ? '' : 's'}: ${locations.map((l) => l.name).join(', ')}`,
      );
      settings.setToken(draft, remember);
      settings.setMode('live');
      toast.success('Connected to SmartThings');
    } catch (error) {
      toast.error('Connection failed', describeError(error));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Settings"
        description="Choose a data source, tune the demo, and set display preferences."
      />

      <Card>
        <CardHeader title="Data source" description="Everything works the same in both modes." />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          {(
            [
              {
                id: 'demo',
                icon: FlaskConical,
                title: 'Demo home',
                body: 'A simulated two-location home with 27 devices. Runs entirely in your browser.',
              },
              {
                id: 'live',
                icon: Radio,
                title: 'My SmartThings',
                body: 'Your real devices via a personal access token. Requires the dev server or Docker proxy.',
              },
            ] as const
          ).map((option) => {
            const selected = settings.mode === option.id;
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                aria-pressed={selected}
                disabled={option.id === 'live' && STATIC_DEMO}
                onClick={() => {
                  if (option.id === 'live' && !settings.token) {
                    document.getElementById('token')?.focus();
                    toast.info('Add a token first', 'Paste a personal access token below and press Connect.');
                    return;
                  }
                  settings.setMode(option.id);
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

      {STATIC_DEMO ? (
        <Card className="p-5 text-sm text-muted">
          This hosted copy is demo-only: browsers can&apos;t call the SmartThings API directly, so live mode
          needs the local dev server or the Docker image, which proxy requests for you. See the README to run
          it locally.
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Personal access token
              </span>
            }
            description="Free to create; no paid SmartThings Developer Plan needed for personal tokens."
          />
          <div className="space-y-4 px-5 pb-5">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>
                Open{' '}
                <a
                  className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
                  href="https://account.smartthings.com/tokens"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  account.smartthings.com/tokens <ExternalLink className="h-3 w-3" />
                </a>{' '}
                and generate a token.
              </li>
              <li>
                Grant these scopes: <span className="font-mono text-xs">{SCOPES.join(' ')}</span>
              </li>
              <li>Paste it below. New tokens expire after 24 hours, so you may need to repeat this.</li>
            </ol>
            <Field
              label="Token"
              htmlFor="token"
              hint="Sent only to api.smartthings.com through the local proxy. Never logged."
            >
              <Input
                id="token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setVerified(null);
                }}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Remember on this device (otherwise it's forgotten when the tab closes)
            </label>
            {verified ? (
              <p className="flex items-center gap-2 text-sm text-good">
                <ShieldCheck className="h-4 w-4" /> {verified}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={connect} loading={testing} disabled={!draft.trim()}>
                Connect
              </Button>
              {settings.token ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    settings.clearToken();
                    setDraft('');
                    setVerified(null);
                    toast.info('Token removed', 'Switched back to the demo home.');
                  }}
                >
                  Forget token
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
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

      <p className="pb-4 text-xs text-subtle">
        ThingsDeck is an independent open-source project. It is not affiliated with, endorsed by, or sponsored
        by Samsung or SmartThings. SmartThings is a trademark of its respective owner.
      </p>
    </div>
  );
}
