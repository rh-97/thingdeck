import { memo, useState } from 'react';
import { Link } from 'react-router';
import { Star, WifiOff } from 'lucide-react';
import type { DeviceHealth, DeviceStatus, Device } from '@/api/types';
import { deviceLabel, deviceSummary, primaryAction, has } from '@/capabilities/device';
import { useDeviceCommand } from '@/hooks/queries';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/cn';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { toneText } from '@/components/ui/tone';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DeviceIcon } from './DeviceIcon';

export interface DeviceCardProps {
  device: Device;
  status: DeviceStatus | undefined;
  health: DeviceHealth | undefined;
  roomName?: string;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

export const DeviceCard = memo(function DeviceCard({
  device,
  status,
  health,
  roomName,
  favorite,
  onToggleFavorite,
}: DeviceCardProps) {
  const unit = useSettings((s) => s.temperatureUnit);
  const command = useDeviceCommand(device);
  const [confirming, setConfirming] = useState(false);
  const offline = health?.state === 'OFFLINE';
  const action = primaryAction(device, status);
  const summary = deviceSummary(device, status, unit);
  const label = deviceLabel(device);
  const isSwitch = action && has(device, 'switch') && !has(device, 'lock') && !has(device, 'doorControl');

  const run = () => {
    if (!action) return;
    if (action.sensitive) setConfirming(true);
    else command.mutate(action.next);
  };

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent/40',
        offline && 'opacity-70',
      )}
    >
      <div className="flex items-start gap-3">
        <DeviceIcon device={device} active={action?.active || summary.tone === 'accent'} offline={offline} />
        <div className="min-w-0 flex-1">
          <Link
            to={`/devices/${device.deviceId}`}
            className="block truncate text-sm font-semibold after:absolute after:inset-0 after:rounded-2xl focus:outline-none"
          >
            {label}
          </Link>
          <p className="truncate text-xs text-subtle">{roomName ?? 'No room'}</p>
        </div>
        {onToggleFavorite ? (
          <button
            onClick={onToggleFavorite}
            className={cn(
              'relative z-10 rounded-md p-1 transition',
              favorite ? 'text-warn' : 'text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100',
            )}
            aria-label={favorite ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
            aria-pressed={favorite}
          >
            <Star className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-9 items-center justify-between gap-2">
        {offline ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-warn">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> Offline
          </span>
        ) : (
          <span className={cn('truncate text-xs font-medium', toneText[summary.tone])} title={summary.text}>
            {summary.text}
          </span>
        )}
        {action && !offline ? (
          <div className="relative z-10">
            {isSwitch ? (
              <Toggle checked={action.active} onChange={run} label={`${label} power`} disabled={!status} />
            ) : (
              <Button
                size="sm"
                variant={action.active ? 'secondary' : 'outline'}
                onClick={run}
                disabled={!status}
              >
                {action.label}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {action ? (
        <ConfirmDialog
          open={confirming}
          title={`${action.label} ${label}?`}
          description="This affects the physical security of your home."
          confirmLabel={action.label}
          onConfirm={() => command.mutate(action.next)}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
});
