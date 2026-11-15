import { useMemo } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BatteryCharging, CalendarDays, Coins, Gauge, Zap } from 'lucide-react';
import { deviceLabel, has, value } from '@/capabilities/device';
import { formatEnergy, formatMoney, formatPower } from '@/capabilities/format';
import { useDeviceSnapshots, useHistory } from '@/hooks/queries';
import { SERIES_PALETTE, useChartColors } from '@/hooks/useChartColors';
import { useNow } from '@/hooks/useNow';
import { useSettings } from '@/store/settings';
import { dailyEnergyByDevice, dayKey } from '@/lib/series';
import { downloadFile, toCsv } from '@/lib/csv';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { StatTile } from '@/components/StatTile';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Field';

const DAY = 86_400_000;
const DAYS = 7;

export default function Energy() {
  const colors = useChartColors();
  const { snapshots, isLoading } = useDeviceSnapshots();
  const rate = useSettings((s) => s.energyRate);
  const currency = useSettings((s) => s.currency);
  const setRate = useSettings((s) => s.setEnergyRate);
  const now = useNow(5 * 60_000);
  const start = useMemo(() => {
    const d = new Date(now - (DAYS - 1) * DAY);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [now]);
  const history = useHistory(
    { attribute: 'power', since: start - 3_600_000, limit: 60_000 },
    { refetchMs: 60_000 },
  );

  const metered = snapshots.filter((s) => has(s.device, 'powerMeter'));
  const names = useMemo(
    () => new Map(snapshots.map((s) => [s.device.deviceId, deviceLabel(s.device)])),
    [snapshots],
  );

  const { days, perDevice, total, today } = useMemo(() => {
    const energy = dailyEnergyByDevice((history.data ?? []).filter((e) => e.epoch >= start));
    const perDevice = new Map<string, number>();
    for (const devices of energy.values())
      for (const [id, kwh] of devices) perDevice.set(id, (perDevice.get(id) ?? 0) + kwh);
    const ranked = [...perDevice.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 5).map(([id]) => id);
    const days = Array.from({ length: DAYS }, (_, i) => {
      const t = start + i * DAY;
      const devices = energy.get(dayKey(t)) ?? new Map<string, number>();
      const row: Record<string, number | string> = {
        day: new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric' }),
      };
      let other = 0;
      for (const [id, kwh] of devices) {
        if (top.includes(id)) row[id] = Math.round(kwh * 100) / 100;
        else other += kwh;
      }
      row.other = Math.round(other * 100) / 100;
      return row;
    });
    const total = ranked.reduce((sum, [, k]) => sum + k, 0);
    const todayMap = energy.get(dayKey(now)) ?? new Map<string, number>();
    const today = [...todayMap.values()].reduce((a, b) => a + b, 0);
    return { days, perDevice: ranked, total, today, top };
  }, [history.data, start, now]);

  const topIds = perDevice.slice(0, 5).map(([id]) => id);
  const current = metered.reduce((sum, s) => sum + (Number(value(s.status, 'powerMeter', 'power')) || 0), 0);

  if (isLoading) return <PageSkeleton />;
  if (!metered.length) {
    return (
      <EmptyState
        icon={Zap}
        title="No energy-metering devices"
        description="Smart plugs and appliances that report power show up here."
      />
    );
  }

  const exportCsv = () => {
    const rows = perDevice.map(([id, kwh]) => ({
      device: names.get(id) ?? id,
      kWh: kwh.toFixed(3),
      cost: (kwh * rate).toFixed(2),
    }));
    downloadFile(`energy-${dayKey(now)}.csv`, toCsv(rows, ['device', 'kWh', 'cost']));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Energy"
        description={`Estimated from power readings over the last ${DAYS} days.`}
        actions={
          <>
            <label className="flex items-center gap-2 text-xs whitespace-nowrap text-muted">
              Rate ({currency}/kWh)
              <Input
                type="number"
                min={0}
                step={0.01}
                value={rate}
                onChange={(e) => setRate(Math.max(0, Number(e.target.value) || 0))}
                className="h-9 w-24"
                aria-label="Electricity rate per kWh"
              />
            </label>
            <Button variant="outline" onClick={exportCsv} disabled={!perDevice.length}>
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Gauge}
          label="Drawing now"
          value={formatPower(current)}
          sub={`${metered.length} metered devices`}
          tone="accent"
        />
        <StatTile
          icon={BatteryCharging}
          label="Today"
          value={formatEnergy(today)}
          sub={formatMoney(today * rate, currency)}
        />
        <StatTile
          icon={CalendarDays}
          label={`Last ${DAYS} days`}
          value={formatEnergy(total)}
          sub={`${formatEnergy(total / DAYS)} per day`}
        />
        <StatTile
          icon={Coins}
          label="Projected month"
          value={formatMoney((total / DAYS) * 30 * rate, currency)}
          sub={`At ${currency}${rate.toFixed(2)}/kWh`}
          tone="warn"
        />
      </div>

      <Card>
        <CardHeader title="Daily consumption" description="Top five devices, everything else grouped." />
        <div className="h-80 px-2 pb-4">
          {history.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Crunching readings…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid stroke={colors.line} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fill: colors.subtle, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: colors.subtle, fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                  unit=" kWh"
                />
                <Tooltip
                  cursor={{ fill: colors.line, opacity: 0.4 }}
                  contentStyle={{
                    background: colors.surface,
                    border: `1px solid ${colors.line}`,
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v, key) => [
                    formatEnergy(v),
                    key === 'other' ? 'Other' : (names.get(String(key)) ?? String(key)),
                  ]}
                />
                <Legend
                  formatter={(key) => (key === 'other' ? 'Other' : (names.get(String(key)) ?? key))}
                  wrapperStyle={{ fontSize: 12 }}
                />
                {topIds.map((id, i) => (
                  <Bar
                    key={id}
                    dataKey={id}
                    stackId="kwh"
                    fill={SERIES_PALETTE[i % SERIES_PALETTE.length]}
                    isAnimationActive={false}
                  />
                ))}
                <Bar
                  dataKey="other"
                  stackId="kwh"
                  fill={colors.subtle}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="By device" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs text-muted">
                <th className="px-5 py-2.5 font-medium">Device</th>
                <th className="px-5 py-2.5 font-medium">Now</th>
                <th className="px-5 py-2.5 font-medium">{DAYS}-day energy</th>
                <th className="px-5 py-2.5 font-medium">Share</th>
                <th className="px-5 py-2.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {metered
                .map((s) => ({ s, kwh: perDevice.find(([id]) => id === s.device.deviceId)?.[1] ?? 0 }))
                .sort((a, b) => b.kwh - a.kwh)
                .map(({ s, kwh }) => {
                  const share = total ? (kwh / total) * 100 : 0;
                  return (
                    <tr key={s.device.deviceId} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">
                        <Link
                          to={`/devices/${s.device.deviceId}?tab=history`}
                          className="font-medium hover:text-accent"
                        >
                          {deviceLabel(s.device)}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5 tabular-nums">
                        {formatPower(value(s.status, 'powerMeter', 'power'))}
                      </td>
                      <td className="px-5 py-2.5 tabular-nums">{formatEnergy(kwh)}</td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-xs text-muted tabular-nums">{share.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {formatMoney(kwh * rate, currency)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
