import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Check, Copy, FlaskConical, SearchX, Star, WifiOff } from 'lucide-react';
import { useClient } from '@/api/clientContext';
import { MockClient } from '@/api/mock/mockClient';
import type { Device, DeviceStatus } from '@/api/types';
import { chartableSeries, deviceKind, deviceLabel, has, value, type Series } from '@/capabilities/device';
import { formatAttribute, toTemperature } from '@/capabilities/format';
import {
  useDevice,
  useDeviceHealth,
  useDeviceSnapshots,
  useDeviceStatus,
  useFavorites,
  useHistory,
  useRooms,
} from '@/hooks/queries';
import { useChartColors } from '@/hooks/useChartColors';
import { useNow } from '@/hooks/useNow';
import { useSettings, type TemperatureUnit } from '@/store/settings';
import { toast } from '@/store/toasts';
import { useActivity } from '@/store/activity';
import { bucketAverage } from '@/lib/series';
import { clockTime, shortDateTime, timeAgo } from '@/lib/time';
import { cn } from '@/lib/cn';
import { ActivityFeed } from '@/components/ActivityFeed';
import { DeviceControls } from '@/components/device/controls';
import { DeviceIcon } from '@/components/device/DeviceIcon';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Segmented } from '@/components/ui/Segmented';

const TABS = [
  { id: 'controls', label: 'Controls' },
  { id: 'history', label: 'History' },
  { id: 'activity', label: 'Activity' },
  { id: 'details', label: 'Details' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function DeviceDetail() {
  const { deviceId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'controls') as TabId;
  const { device, isLoading } = useDevice(deviceId);
  const status = useDeviceStatus(deviceId);
  const health = useDeviceHealth(deviceId);
  const rooms = useRooms();
  const { snapshots } = useDeviceSnapshots();
  const favorites = useFavorites(snapshots);

  if (isLoading) return <PageSkeleton />;
  if (!device) {
    return (
      <EmptyState
        icon={SearchX}
        title="Device not found"
        description="It may belong to another location, or it was removed."
        action={
          <Link to="/devices" className="text-sm font-medium text-accent">
            Back to devices
          </Link>
        }
      />
    );
  }

  const offline = health.data?.state === 'OFFLINE';
  const room = rooms.data?.find((r) => r.roomId === device.roomId);
  const fav = favorites.isFavorite(device.deviceId);

  return (
    <div className="space-y-6">
      <Link to="/devices" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Devices
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <DeviceIcon device={device} size="lg" offline={offline} active={!offline} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{deviceLabel(device)}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span>{room?.name ?? 'No room'}</span>
            <span aria-hidden>·</span>
            <span>{deviceKind(device).label}</span>
            <Badge>{device.type ?? 'Device'}</Badge>
            {offline ? (
              <Badge tone="warn">
                <WifiOff className="h-3 w-3" /> Offline since {timeAgo(health.data?.lastUpdatedDate)}
              </Badge>
            ) : (
              <Badge tone="good">Online</Badge>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => favorites.toggle(device.deviceId)} aria-pressed={fav}>
          <Star className={cn('h-4 w-4', fav && 'text-warn')} fill={fav ? 'currentColor' : 'none'} />
          {fav ? 'Favorited' : 'Favorite'}
        </Button>
      </div>

      <div role="tablist" aria-label="Device sections" className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              const next = new URLSearchParams(params);
              if (t.id === 'controls') next.delete('tab');
              else next.set('tab', t.id);
              setParams(next, { replace: true });
            }}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
              tab === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'controls' ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {offline ? (
                <EmptyState
                  icon={WifiOff}
                  title="This device is offline"
                  description="Controls are disabled until it reconnects."
                />
              ) : (
                <DeviceControls device={device} status={status.data} disabled={offline} />
              )}
            </div>
            <div className="space-y-6">
              <SimulatePanel device={device} status={status.data} />
              <Card>
                <CardHeader title="Recent activity" />
                <DeviceActivity deviceId={device.deviceId} limit={8} />
              </Card>
            </div>
          </div>
        ) : null}
        {tab === 'history' ? <HistoryTab device={device} /> : null}
        {tab === 'activity' ? (
          <Card>
            <CardHeader title="Event history" description="Every reported state change, newest first." />
            <DeviceActivity deviceId={device.deviceId} limit={150} all />
          </Card>
        ) : null}
        {tab === 'details' ? (
          <DetailsTab device={device} status={status.data} lastUpdated={health.data?.lastUpdatedDate} />
        ) : null}
      </div>
    </div>
  );
}

function DeviceActivity({ deviceId, limit, all }: { deviceId: string; limit: number; all?: boolean }) {
  const history = useHistory({ deviceId, limit: all ? limit : 200 });
  const live = useActivity((s) => s.events);
  const merged = useMemo(() => {
    const fresh = live.filter((e) => e.deviceId === deviceId);
    const seen = new Set(fresh.map((e) => `${e.epoch}:${e.attribute}`));
    return [...fresh, ...(history.data ?? []).filter((e) => !seen.has(`${e.epoch}:${e.attribute}`))];
  }, [live, history.data, deviceId]);
  const events = merged.filter(
    (e) =>
      all ||
      ![
        'power',
        'energy',
        'illuminance',
        'humidity',
        'airQuality',
        'carbonDioxide',
        'temperature',
        'completionTime',
      ].includes(e.attribute),
  );
  return (
    <div className="pb-2">
      <ActivityFeed
        events={events.slice(0, limit)}
        empty={history.isLoading ? 'Loading…' : 'No events recorded yet.'}
      />
    </div>
  );
}

/* ----------------------------- History ----------------------------- */

const RANGES = [
  { value: '6h', label: '6h', ms: 6 * 3_600_000, bucket: 5 * 60_000 },
  { value: '24h', label: '24h', ms: 24 * 3_600_000, bucket: 30 * 60_000 },
  { value: '7d', label: '7d', ms: 7 * 24 * 3_600_000, bucket: 3 * 3_600_000 },
] as const;

function HistoryTab({ device }: { device: Device }) {
  const series = chartableSeries(device);
  const [selected, setSelected] = useState<string>(series[0]?.key ?? '');
  const [range, setRange] = useState<(typeof RANGES)[number]['value']>('24h');
  const current = series.find((s) => s.key === selected) ?? series[0];

  if (!current) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nothing to chart"
        description="This device doesn't report numeric readings. Check the Activity tab for its state changes."
      />
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
        <div className="-mx-1 flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button
              key={s.key}
              onClick={() => setSelected(s.key)}
              aria-pressed={s.key === current.key}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium',
                s.key === current.key
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line text-muted hover:text-fg',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <Segmented
          label="Range"
          size="sm"
          value={range}
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          onChange={setRange}
        />
      </div>
      <SeriesChart device={device} series={current} range={RANGES.find((r) => r.value === range)!} />
    </Card>
  );
}

function SeriesChart({
  device,
  series,
  range,
}: {
  device: Device;
  series: Series;
  range: (typeof RANGES)[number];
}) {
  const colors = useChartColors();
  const unit = useSettings((s) => s.temperatureUnit);
  const now = useNow(60_000);
  const since = now - range.ms;
  const history = useHistory({
    deviceId: device.deviceId,
    attribute: series.attribute,
    since,
    limit: 20_000,
  });
  const data = useMemo(() => {
    const events = (history.data ?? []).filter(
      (e) => e.component === series.component && e.capability === series.capability,
    );
    const isTemp = series.attribute === 'temperature';
    const sourceUnit = events[0]?.unit;
    return bucketAverage(events, range.bucket, since, now + 60_000).map((p) => ({
      t: p.t,
      v: Math.round((isTemp ? toTemperature(p.v, sourceUnit, unit) : p.v) * 10) / 10,
    }));
  }, [history.data, series, range.bucket, since, now, unit]);

  const values = data.map((d) => d.v);
  const stats = values.length
    ? {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length,
      }
    : null;
  const fmt = (v: number) =>
    formatAttribute(
      series.capability,
      series.attribute,
      v,
      series.attribute === 'temperature' ? unit : unitFor(series.attribute),
      unit as TemperatureUnit,
    );

  return (
    <div className="px-2 pt-4 pb-5">
      {stats ? (
        <dl className="mb-4 grid grid-cols-3 gap-3 px-3">
          {(['min', 'avg', 'max'] as const).map((k) => (
            <div key={k}>
              <dt className="text-[11px] font-medium text-muted uppercase">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{fmt(stats[k])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="h-72">
        {history.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">Loading history…</div>
        ) : data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Not enough data in this range yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) =>
                  range.value === '7d'
                    ? new Date(t).toLocaleDateString([], { weekday: 'short' })
                    : clockTime(t)
                }
                tick={{ fill: colors.subtle, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={36}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: colors.subtle, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={{
                  background: colors.surface,
                  border: `1px solid ${colors.line}`,
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={(t) => shortDateTime(Number(t))}
                formatter={(v) => [fmt(Number(v)), series.label]}
              />
              <Line
                type="monotone"
                dataKey="v"
                stroke={colors.accent}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function unitFor(attribute: string) {
  return attribute === 'humidity' || attribute === 'battery' ? '%' : undefined;
}

/* ----------------------------- Details ----------------------------- */

function DetailsTab({
  device,
  status,
  lastUpdated,
}: {
  device: Device;
  status: DeviceStatus | undefined;
  lastUpdated?: string;
}) {
  const [copied, setCopied] = useState(false);
  const rows: Array<[string, string]> = [
    ['Device ID', device.deviceId],
    ['Label', device.label ?? '—'],
    ['Name', device.name],
    ['Manufacturer', device.manufacturerName ?? '—'],
    ['Model code', device.deviceManufacturerCode ?? '—'],
    ['Presentation ID', device.presentationId ?? '—'],
    ['Integration', device.type ?? '—'],
    ['Added', device.createTime ? new Date(device.createTime).toLocaleDateString() : '—'],
    ['Last update', lastUpdated ? new Date(lastUpdated).toLocaleString() : '—'],
  ];
  const json = JSON.stringify({ device, status }, null, 2);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader title="Device information" />
          <dl className="divide-y divide-line px-5 pb-3">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                <dt className="text-muted">{k}</dt>
                <dd className="truncate text-right font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Components & capabilities" description="Straight from the device's profile." />
          <div className="space-y-4 px-5 pb-5">
            {device.components.map((c) => (
              <div key={c.id}>
                <div className="mb-2 text-xs font-semibold">
                  {c.id} {c.label ? <span className="font-normal text-muted">({c.label})</span> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.capabilities.map((cap) => (
                    <Badge key={cap.id} tone="info">
                      {cap.id}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader
          title="Raw API data"
          description="The /devices and /status payloads behind this screen."
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                navigator.clipboard
                  ?.writeText(json)
                  .then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => toast.error('Clipboard is not available'));
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          }
        />
        <pre className="max-h-[36rem] overflow-auto bg-surface-2 p-4 font-mono text-[11px] leading-relaxed">
          {json}
        </pre>
      </Card>
    </div>
  );
}

/* ----------------------------- Simulation ----------------------------- */

const SIMULATIONS: Array<{
  capability: string;
  attribute: string;
  label: string;
  values: Array<[string | number, string]>;
}> = [
  {
    capability: 'motionSensor',
    attribute: 'motion',
    label: 'Motion',
    values: [
      ['active', 'Detect motion'],
      ['inactive', 'Clear'],
    ],
  },
  {
    capability: 'contactSensor',
    attribute: 'contact',
    label: 'Contact',
    values: [
      ['open', 'Open'],
      ['closed', 'Close'],
    ],
  },
  {
    capability: 'waterSensor',
    attribute: 'water',
    label: 'Water',
    values: [
      ['wet', 'Trigger leak'],
      ['dry', 'Dry'],
    ],
  },
  {
    capability: 'smokeDetector',
    attribute: 'smoke',
    label: 'Smoke',
    values: [
      ['detected', 'Trigger alarm'],
      ['clear', 'Clear'],
    ],
  },
  {
    capability: 'presenceSensor',
    attribute: 'presence',
    label: 'Presence',
    values: [
      ['present', 'Arrive'],
      ['not present', 'Leave'],
    ],
  },
  {
    capability: 'carbonDioxideMeasurement',
    attribute: 'carbonDioxide',
    label: 'CO₂',
    values: [
      [1250, 'Spike to 1250 ppm'],
      [600, 'Fresh air'],
    ],
  },
  {
    capability: 'battery',
    attribute: 'battery',
    label: 'Battery',
    values: [
      [9, 'Drain to 9%'],
      [100, 'New battery'],
    ],
  },
];

/** Demo-only: lets visitors poke sensors to watch alerts and automations react. */
function SimulatePanel({ device, status }: { device: Device; status: DeviceStatus | undefined }) {
  const client = useClient();
  if (!(client instanceof MockClient)) return null;
  const available = SIMULATIONS.filter((s) => has(device, s.capability));
  if (!available.length) return null;
  return (
    <Card className="border-dashed">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-accent" /> Simulate
          </span>
        }
        description="Demo home only — fake a sensor reading to see alerts and automations react."
      />
      <div className="space-y-3 px-5 pb-5">
        {available.map((s) => {
          const current = value(status, s.capability, s.attribute);
          return (
            <div key={s.capability}>
              <div className="mb-1.5 text-xs font-medium text-muted">{s.label}</div>
              <div className="flex flex-wrap gap-2">
                {s.values.map(([v, label]) => (
                  <Button
                    key={String(v)}
                    size="sm"
                    variant={current === v ? 'secondary' : 'outline'}
                    onClick={() =>
                      client.engine.simulateAttribute(device.deviceId, 'main', s.capability, s.attribute, v)
                    }
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
