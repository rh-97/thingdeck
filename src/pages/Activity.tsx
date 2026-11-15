import { useMemo, useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { Download, History } from 'lucide-react';
import type { DeviceEvent } from '@/api/types';
import { deviceLabel } from '@/capabilities/device';
import { attributeLabel, isFeedWorthy } from '@/capabilities/events';
import { useDevices, useHistory } from '@/hooks/queries';
import { downloadFile, toCsv } from '@/lib/csv';
import { ActivityFeed } from '@/components/ActivityFeed';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input, Select } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';

const DAY = 86_400_000;

export default function ActivityPage() {
  const devices = useDevices();
  const [deviceId, setDeviceId] = useState('');
  const [kind, setKind] = useState<'changes' | 'all'>('changes');
  const [q, setQ] = useState('');
  const since = useNow(60_000) - 2 * DAY;
  const history = useHistory({ deviceId: deviceId || undefined, since, limit: 4000 });

  const events = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (history.data ?? [])
      .filter((e) => kind === 'all' || isFeedWorthy(e))
      .filter((e) =>
        terms.every((t) =>
          `${e.deviceName} ${attributeLabel(e.attribute)} ${String(e.value)}`.toLowerCase().includes(t),
        ),
      );
  }, [history.data, kind, q]);

  const byDay = useMemo(() => {
    const groups = new Map<string, DeviceEvent[]>();
    for (const e of events.slice(0, 400)) {
      const label = new Date(e.epoch).toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
      groups.set(label, [...(groups.get(label) ?? []), e]);
    }
    return [...groups.entries()];
  }, [events]);

  const exportCsv = () =>
    downloadFile(
      'activity.csv',
      toCsv(
        events.map((e) => ({
          time: e.time,
          device: e.deviceName,
          component: e.component,
          capability: e.capability,
          attribute: e.attribute,
          value: e.value,
          unit: e.unit ?? '',
        })),
        ['time', 'device', 'component', 'capability', 'attribute', 'value', 'unit'],
      ),
    );

  return (
    <div>
      <PageHeader
        title="Activity"
        description="Device history for the last 48 hours, from the History API."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!events.length}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          type="search"
          placeholder="Filter events"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Filter events"
          className="md:max-w-xs"
        />
        <Select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          aria-label="Device"
          className="md:max-w-[14rem]"
        >
          <option value="">All devices</option>
          {devices.data?.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {deviceLabel(d)}
            </option>
          ))}
        </Select>
        <Segmented
          label="Event types"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'changes', label: 'State changes' },
            { value: 'all', label: 'All readings' },
          ]}
        />
        <span className="text-xs text-muted md:ml-auto">
          {events.length.toLocaleString()} events{events.length > 400 ? ' · showing latest 400' : ''}
        </span>
      </div>

      {history.isLoading ? (
        <Card className="p-6 text-sm text-muted">Loading history…</Card>
      ) : !byDay.length ? (
        <EmptyState icon={History} title="No events" description="Nothing matches these filters yet." />
      ) : (
        <div className="space-y-6">
          {byDay.map(([day, list]) => (
            <section key={day} aria-label={day}>
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{day}</h2>
              <Card>
                <ActivityFeed events={list} />
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
