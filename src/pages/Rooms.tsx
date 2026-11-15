import { useMemo } from 'react';
import { Link } from 'react-router';
import { DoorOpen, Droplets, LightbulbOff, Thermometer } from 'lucide-react';
import { useClient } from '@/api/clientContext';
import { describeError } from '@/api/client';
import { deviceAlerts, deviceKind, has, primaryAction, value } from '@/capabilities/device';
import { formatTemperature, toTemperature } from '@/capabilities/format';
import { useDeviceSnapshots, useRooms } from '@/hooks/queries';
import { useSettings } from '@/store/settings';
import { toast } from '@/store/toasts';
import { useQueryClient } from '@tanstack/react-query';
import { keys } from '@/hooks/queries';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';

export default function Rooms() {
  const rooms = useRooms();
  const { snapshots, isLoading } = useDeviceSnapshots();
  const unit = useSettings((s) => s.temperatureUnit);
  const client = useClient();
  const queryClient = useQueryClient();

  const cards = useMemo(
    () =>
      (rooms.data ?? []).map((room) => {
        const items = snapshots.filter((s) => s.device.roomId === room.roomId);
        const temps = items
          .map((s) => s.status?.components.main?.temperatureMeasurement?.temperature)
          .filter((t): t is NonNullable<typeof t> => !!t && typeof t.value === 'number');
        const humid = items
          .map((s) => Number(value(s.status, 'relativeHumidityMeasurement', 'humidity')))
          .filter(Number.isFinite);
        const lightsOn = items.filter(
          (s) =>
            has(s.device, 'switch') &&
            deviceKind(s.device).label === 'Light' &&
            value(s.status, 'switch', 'switch') === 'on',
        );
        const active = items.filter((s) => primaryAction(s.device, s.status)?.active);
        const alerts = items
          .flatMap((s) => deviceAlerts(s.device, s.status, s.health, unit))
          .filter((a) => a.severity !== 'info');
        return {
          room,
          items,
          temp: temps.length
            ? temps.reduce((sum, t) => sum + toTemperature(Number(t.value), t.unit, unit), 0) / temps.length
            : null,
          humidity: humid.length ? Math.round(humid.reduce((a, b) => a + b, 0) / humid.length) : null,
          lightsOn,
          active,
          alerts,
        };
      }),
    [rooms.data, snapshots, unit],
  );

  const allOff = async (deviceIds: string[], roomName: string) => {
    const results = await Promise.allSettled(
      deviceIds.map((id) =>
        client.executeCommands(id, [{ component: 'main', capability: 'switch', command: 'off' }]),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length)
      toast.error(
        `Some lights in ${roomName} didn't respond`,
        describeError((failed[0] as PromiseRejectedResult).reason),
      );
    else toast.success(`Lights off in ${roomName}`);
    if (client.kind === 'live')
      deviceIds.forEach((id) => queryClient.invalidateQueries({ queryKey: keys.status(id) }));
  };

  if (isLoading || rooms.isLoading) return <PageSkeleton />;
  if (!cards.length)
    return (
      <EmptyState
        icon={DoorOpen}
        title="No rooms yet"
        description="Rooms you create in the SmartThings app show up here."
      />
    );

  return (
    <div>
      <PageHeader title="Rooms" description="Climate, lights and activity at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ room, items, temp, humidity, lightsOn, active, alerts }) => (
          <div
            key={room.roomId}
            className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  to={`/devices?room=${room.roomId}`}
                  className="text-base font-semibold hover:text-accent"
                >
                  {room.name}
                </Link>
                <p className="text-xs text-muted">
                  {items.length} device{items.length === 1 ? '' : 's'} · {active.length} active
                </p>
              </div>
              {alerts.length ? (
                <Badge tone="warn">
                  {alerts.length} alert{alerts.length > 1 ? 's' : ''}
                </Badge>
              ) : null}
            </div>

            {temp !== null || humidity !== null ? (
              <div className="mt-4 flex gap-5 text-sm">
                <span className="flex items-center gap-1.5">
                  <Thermometer className="h-4 w-4 text-muted" aria-hidden />
                  <span className="font-semibold tabular-nums">
                    {temp === null ? '—' : formatTemperature(temp, unit, unit)}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Droplets className="h-4 w-4 text-muted" aria-hidden />
                  <span className="font-semibold tabular-nums">
                    {humidity === null ? '—' : `${humidity}%`}
                  </span>
                </span>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-1.5">
              {items.map(({ device, status, health }) => {
                const Icon = deviceKind(device).icon;
                const on = primaryAction(device, status)?.active;
                return (
                  <Link
                    key={device.deviceId}
                    to={`/devices/${device.deviceId}`}
                    title={device.label}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition hover:border-accent/50',
                      health?.state === 'OFFLINE'
                        ? 'border-dashed border-line text-subtle'
                        : on
                          ? 'border-accent/40 bg-accent-soft text-accent'
                          : 'border-line text-muted',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    <span className="max-w-[9rem] truncate">{device.label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-auto pt-5">
              <Button
                size="sm"
                variant="outline"
                disabled={!lightsOn.length}
                onClick={() =>
                  allOff(
                    lightsOn.map((s) => s.device.deviceId),
                    room.name,
                  )
                }
              >
                <LightbulbOff className="h-3.5 w-3.5" />
                {lightsOn.length
                  ? `Turn off ${lightsOn.length} light${lightsOn.length > 1 ? 's' : ''}`
                  : 'Lights are off'}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
