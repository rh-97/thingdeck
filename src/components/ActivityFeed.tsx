import { Link } from 'react-router';
import type { DeviceEvent } from '@/api/types';
import { eventText, eventTone } from '@/capabilities/events';
import { useSettings } from '@/store/settings';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/cn';

const dot = { bad: 'bg-bad', warn: 'bg-warn', accent: 'bg-accent', neutral: 'bg-subtle' };

export function ActivityFeed({
  events,
  empty = 'Nothing has happened yet.',
}: {
  events: DeviceEvent[];
  empty?: string;
}) {
  const unit = useSettings((s) => s.temperatureUnit);
  if (!events.length) return <p className="px-5 py-6 text-sm text-muted">{empty}</p>;
  return (
    <ol className="divide-y divide-line">
      {events.map((e) => (
        <li
          key={`${e.deviceId}-${e.epoch}-${e.attribute}-${String(e.value)}`}
          className="flex items-center gap-3 px-5 py-2.5"
        >
          <span className={cn('h-2 w-2 shrink-0 rounded-full', dot[eventTone(e)])} aria-hidden />
          <div className="min-w-0 flex-1">
            <Link
              to={`/devices/${e.deviceId}`}
              className="block truncate text-sm font-medium hover:text-accent"
            >
              {e.deviceName}
            </Link>
            <p className="truncate text-xs text-muted">{eventText(e, unit)}</p>
          </div>
          <time
            dateTime={e.time}
            className="shrink-0 text-xs text-subtle"
            title={new Date(e.epoch).toLocaleString()}
          >
            {timeAgo(e.epoch)}
          </time>
        </li>
      ))}
    </ol>
  );
}
