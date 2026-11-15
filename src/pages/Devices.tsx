import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LayoutGrid, List, SearchX, Star } from 'lucide-react';
import { deviceAlerts, deviceKind, deviceLabel, deviceSummary, primaryAction } from '@/capabilities/device';
import { useDeviceSnapshots, useFavorites, useRooms, type DeviceSnapshot } from '@/hooks/queries';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/cn';
import { timeAgo } from '@/lib/time';
import { DeviceCard } from '@/components/device/DeviceCard';
import { DeviceIcon } from '@/components/device/DeviceIcon';
import { PageHeader } from '@/components/PageHeader';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Badge } from '@/components/ui/Badge';
import { toneText } from '@/components/ui/tone';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'On / active' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'offline', label: 'Offline' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

export default function Devices() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const room = params.get('room') ?? 'all';
  const filter = (params.get('filter') as FilterId) ?? 'all';
  const view = params.get('view') === 'list' ? 'list' : 'grid';
  const update = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const { snapshots, isLoading } = useDeviceSnapshots();
  const rooms = useRooms();
  const favorites = useFavorites(snapshots);
  const unit = useSettings((s) => s.temperatureUnit);
  const roomName = useMemo(() => new Map(rooms.data?.map((r) => [r.roomId, r.name])), [rooms.data]);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return snapshots
      .filter((s) => room === 'all' || s.device.roomId === room)
      .filter((s) => {
        const hay =
          `${deviceLabel(s.device)} ${s.device.name} ${deviceKind(s.device).label} ${s.device.manufacturerName ?? ''} ${roomName.get(s.device.roomId ?? '') ?? ''}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .filter((s) => {
        switch (filter) {
          case 'active':
            return (
              (primaryAction(s.device, s.status)?.active ?? false) ||
              deviceSummary(s.device, s.status, unit).tone === 'accent'
            );
          case 'favorites':
            return favorites.isFavorite(s.device.deviceId);
          case 'attention':
            return deviceAlerts(s.device, s.status, s.health, unit).some((a) => a.severity !== 'info');
          case 'offline':
            return s.health?.state === 'OFFLINE';
          default:
            return true;
        }
      })
      .sort((a, b) => deviceLabel(a.device).localeCompare(deviceLabel(b.device)));
  }, [snapshots, q, room, filter, favorites, unit, roomName]);

  const grouped = useMemo(() => {
    const groups = new Map<string, DeviceSnapshot[]>();
    for (const s of filtered) {
      const key = roomName.get(s.device.roomId ?? '') ?? 'Unassigned';
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, roomName]);

  if (isLoading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="Devices"
        description={`${snapshots.length} devices in ${rooms.data?.length ?? 0} rooms`}
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input
          type="search"
          placeholder="Search by name, type, room or brand"
          value={q}
          onChange={(e) => update('q', e.target.value, '')}
          aria-label="Search devices"
          className="lg:max-w-xs"
        />
        <Select
          value={room}
          onChange={(e) => update('room', e.target.value, 'all')}
          aria-label="Filter by room"
          className="lg:max-w-[12rem]"
        >
          <option value="all">All rooms</option>
          {rooms.data?.map((r) => (
            <option key={r.roomId} value={r.roomId}>
              {r.name}
            </option>
          ))}
        </Select>
        <div
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0"
          role="group"
          aria-label="Filter"
        >
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => update('filter', f.id, 'all')}
              aria-pressed={filter === f.id}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition',
                filter === f.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface text-muted hover:text-fg',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 lg:ml-auto" role="group" aria-label="View">
          <Button
            size="icon"
            variant={view === 'grid' ? 'secondary' : 'ghost'}
            onClick={() => update('view', 'grid', 'grid')}
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={view === 'list' ? 'secondary' : 'ghost'}
            onClick={() => update('view', 'list', 'grid')}
            aria-label="List view"
            aria-pressed={view === 'list'}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState
          icon={SearchX}
          title="No devices match"
          description="Try a different search or clear the filters."
          action={
            <Button variant="outline" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <div className="space-y-8">
          {grouped.map(([name, items]) => (
            <section key={name} aria-label={name}>
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
                {name} <span className="font-normal text-subtle">· {items.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {items.map((s) => (
                  <DeviceCard
                    key={s.device.deviceId}
                    {...s}
                    roomName={name}
                    favorite={favorites.isFavorite(s.device.deviceId)}
                    onToggleFavorite={() => favorites.toggle(s.device.deviceId)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Device</th>
                <th className="px-4 py-3 font-medium">Room</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Last update</th>
                <th className="px-4 py-3" aria-label="Favorite" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const summary = deviceSummary(s.device, s.status, unit);
                const offline = s.health?.state === 'OFFLINE';
                const fav = favorites.isFavorite(s.device.deviceId);
                return (
                  <tr
                    key={s.device.deviceId}
                    className="border-b border-line last:border-0 hover:bg-surface-2/60"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/devices/${s.device.deviceId}`}
                        className="flex items-center gap-3 font-medium hover:text-accent"
                      >
                        <DeviceIcon
                          device={s.device}
                          size="sm"
                          offline={offline}
                          active={summary.tone === 'accent'}
                        />
                        {deviceLabel(s.device)}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{roomName.get(s.device.roomId ?? '') ?? '—'}</td>
                    <td className={cn('px-4 py-2.5', offline ? 'text-warn' : toneText[summary.tone])}>
                      {offline ? 'Offline' : summary.text}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge>{s.device.type ?? 'Device'}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{timeAgo(s.health?.lastUpdatedDate)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => favorites.toggle(s.device.deviceId)}
                        aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                        aria-pressed={fav}
                        className={fav ? 'text-warn' : 'text-subtle hover:text-fg'}
                      >
                        <Star className="h-4 w-4" fill={fav ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
