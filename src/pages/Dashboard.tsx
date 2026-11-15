import { useMemo } from 'react';
import { Link } from 'react-router';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Gauge, Lightbulb, ShieldCheck, Star, Thermometer, Wifi } from 'lucide-react';
import { deviceAlerts, has, value } from '@/capabilities/device';
import { isFeedWorthy } from '@/capabilities/events';
import { formatPower, formatTemperature, toTemperature } from '@/capabilities/format';
import { useCurrentLocation, useDeviceSnapshots, useFavorites, useHistory, useRooms } from '@/hooks/queries';
import { useChartColors } from '@/hooks/useChartColors';
import { useNow } from '@/hooks/useNow';
import { useActivity } from '@/store/activity';
import { useSettings } from '@/store/settings';
import { totalPowerSeries } from '@/lib/series';
import { clockTime, greeting } from '@/lib/time';
import { ActivityFeed } from '@/components/ActivityFeed';
import { AlertsList } from '@/components/AlertsList';
import { DeviceCard } from '@/components/device/DeviceCard';
import { PageSkeleton } from '@/components/PageSkeleton';
import { SceneStrip } from '@/components/SceneStrip';
import { StatTile } from '@/components/StatTile';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

const HOUR = 3_600_000;

export default function Dashboard() {
  const { location } = useCurrentLocation();
  const { snapshots, isLoading } = useDeviceSnapshots();
  const rooms = useRooms();
  const favorites = useFavorites(snapshots);
  const unit = useSettings((s) => s.temperatureUnit);
  const liveEvents = useActivity((s) => s.events);
  const roomName = useMemo(() => new Map(rooms.data?.map((r) => [r.roomId, r.name])), [rooms.data]);

  const stats = useMemo(() => {
    const online = snapshots.filter((s) => s.health?.state === 'ONLINE').length;
    const lights = snapshots.filter(
      (s) =>
        (s.device.components[0]?.categories[0]?.name === 'Light' || has(s.device, 'switchLevel')) &&
        value(s.status, 'switch', 'switch') === 'on',
    );
    const power = snapshots.reduce(
      (sum, s) => sum + (Number(value(s.status, 'powerMeter', 'power')) || 0),
      0,
    );
    const temps = snapshots
      .filter(
        (s) =>
          has(s.device, 'temperatureMeasurement') &&
          ['Thermostat', 'MotionSensor', 'AirQualityDetector'].includes(
            s.device.components[0]?.categories[0]?.name ?? '',
          ),
      )
      .map((s) => s.status?.components.main?.temperatureMeasurement?.temperature)
      .filter((t): t is NonNullable<typeof t> => !!t && typeof t.value === 'number');
    const avgTemp = temps.length
      ? temps.reduce((sum, t) => sum + toTemperature(Number(t.value), t.unit, unit), 0) / temps.length
      : null;
    const securable = snapshots.filter(
      (s) =>
        has(s.device, 'lock') ||
        has(s.device, 'doorControl') ||
        (has(s.device, 'contactSensor') && s.device.components.length === 1),
    );
    const insecure = securable.filter(
      (s) =>
        value(s.status, 'lock', 'lock') === 'unlocked' ||
        ['open', 'opening'].includes(String(value(s.status, 'doorControl', 'door'))) ||
        value(s.status, 'contactSensor', 'contact') === 'open',
    );
    return {
      online,
      total: snapshots.length,
      lights: lights.length,
      power,
      avgTemp,
      securable: securable.length,
      insecure,
    };
  }, [snapshots, unit]);

  const alerts = useMemo(
    () =>
      snapshots
        .flatMap((s) => deviceAlerts(s.device, s.status, s.health, unit))
        .sort(
          (a, b) =>
            ['critical', 'warning', 'info'].indexOf(a.severity) -
            ['critical', 'warning', 'info'].indexOf(b.severity),
        ),
    [snapshots, unit],
  );

  const favoriteSnapshots = snapshots.filter((s) => favorites.isFavorite(s.device.deviceId));
  const feed = liveEvents.filter(isFeedWorthy).slice(0, 8);
  const recent = useHistory({ limit: 600 }, { enabled: feed.length < 8 });
  const feedKeys = new Set(feed.map((e) => `${e.deviceId}:${e.epoch}:${e.attribute}`));
  const fallbackFeed = (recent.data ?? [])
    .filter((e) => isFeedWorthy(e) && !feedKeys.has(`${e.deviceId}:${e.epoch}:${e.attribute}`))
    .slice(0, 8 - feed.length);

  if (isLoading) return <PageSkeleton />;

  if (!snapshots.length) {
    return (
      <EmptyState
        icon={Wifi}
        title="No devices in this location"
        description="Add devices in the SmartThings app, then refresh."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
          {greeting()} — {location?.name}
        </h1>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Wifi}
          label="Devices online"
          value={`${stats.online}/${stats.total}`}
          sub={stats.online < stats.total ? `${stats.total - stats.online} offline` : 'All reachable'}
          tone={stats.online < stats.total ? 'warn' : 'good'}
        />
        <StatTile
          icon={Lightbulb}
          label="Lights on"
          value={stats.lights}
          sub={stats.lights ? 'Tap a card to switch off' : 'All lights off'}
          tone={stats.lights ? 'accent' : 'neutral'}
        />
        <StatTile
          icon={Gauge}
          label="Power now"
          value={formatPower(stats.power)}
          sub="Across metered devices"
          tone="neutral"
        />
        <StatTile
          icon={stats.insecure.length ? Thermometer : ShieldCheck}
          label={stats.insecure.length ? 'Indoor average' : 'Security'}
          value={
            stats.insecure.length
              ? stats.avgTemp === null
                ? '—'
                : formatTemperature(stats.avgTemp, unit, unit)
              : 'Secure'
          }
          sub={
            stats.insecure.length
              ? `${stats.insecure.length} door/lock not secured`
              : `${stats.securable} doors & locks secured`
          }
          tone={stats.insecure.length ? 'warn' : 'good'}
        />
      </section>

      <SceneStrip />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section aria-labelledby="favorites-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="favorites-heading" className="flex items-center gap-2 text-sm font-semibold">
                <Star className="h-4 w-4 text-warn" aria-hidden /> Favorites
              </h2>
              <Link
                to="/devices"
                className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                All devices <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {favoriteSnapshots.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteSnapshots.map((s) => (
                  <DeviceCard
                    key={s.device.deviceId}
                    {...s}
                    roomName={roomName.get(s.device.roomId ?? '')}
                    favorite
                    onToggleFavorite={() => favorites.toggle(s.device.deviceId)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Star}
                title="No favorites yet"
                description="Star devices on the Devices page to pin them here."
              />
            )}
          </section>

          <PowerCard />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Needs attention"
              description={alerts.length ? `${alerts.length} item${alerts.length > 1 ? 's' : ''}` : undefined}
            />
            <div className="px-5 pb-5">
              {alerts.length ? (
                <AlertsList alerts={alerts.slice(0, 6)} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-good">
                  <ShieldCheck className="h-4 w-4" /> Everything looks good.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  Live activity <span className="live-dot h-2 w-2 rounded-full bg-good" aria-hidden />
                </span>
              }
              action={
                <Link to="/activity" className="text-xs font-medium text-accent hover:underline">
                  View all
                </Link>
              }
            />
            <div className="pb-2">
              <ActivityFeed events={[...feed, ...fallbackFeed]} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PowerCard() {
  const colors = useChartColors();
  const now = useNow(60_000);
  const since = now - 24 * HOUR;
  const history = useHistory(
    { attribute: 'power', since: since - HOUR, limit: 20_000 },
    { refetchMs: 60_000 },
  );
  const data = useMemo(
    () =>
      totalPowerSeries(history.data ?? [], HOUR / 2, since, now).map((p) => ({
        t: p.t,
        watts: Math.round(p.v),
      })),
    [history.data, since, now],
  );
  const peak = data.reduce((max, p) => Math.max(max, p.watts), 0);

  return (
    <Card>
      <CardHeader
        title="Power, last 24 hours"
        description={peak ? `Peak ${formatPower(peak)}` : 'Waiting for readings'}
        action={
          <Link
            to="/energy"
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Energy <ArrowRight className="h-3 w-3" />
          </Link>
        }
      />
      <div className="h-56 px-2 pb-4">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="powerFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.accent} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => clockTime(t)}
                tick={{ fill: colors.subtle, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                tick={{ fill: colors.subtle, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: colors.surface,
                  border: `1px solid ${colors.line}`,
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelFormatter={(t) => clockTime(Number(t))}
                formatter={(v) => [formatPower(v), 'Total']}
              />
              <Area
                type="monotone"
                dataKey="watts"
                stroke={colors.accent}
                strokeWidth={2}
                fill="url(#powerFill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">No power data yet.</div>
        )}
      </div>
    </Card>
  );
}
