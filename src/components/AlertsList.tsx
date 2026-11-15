import { Link } from 'react-router';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import type { DeviceAlert } from '@/capabilities/device';
import { cn } from '@/lib/cn';

const styles = {
  critical: { icon: AlertOctagon, cls: 'bg-bad-soft text-bad' },
  warning: { icon: AlertTriangle, cls: 'bg-warn-soft text-warn' },
  info: { icon: Info, cls: 'bg-info-soft text-info' },
};

export function AlertsList({ alerts }: { alerts: DeviceAlert[] }) {
  return (
    <ul className="space-y-2">
      {alerts.map((a) => {
        const { icon: Icon, cls } = styles[a.severity];
        return (
          <li key={a.id}>
            <Link
              to={`/devices/${a.deviceId}`}
              className={cn(
                'flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:brightness-95',
                cls,
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{a.title}</p>
                {a.detail ? <p className="text-xs opacity-80">{a.detail}</p> : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
