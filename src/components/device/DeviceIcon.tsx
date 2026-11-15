import type { Device } from '@/api/types';
import { deviceKind } from '@/capabilities/device';
import { cn } from '@/lib/cn';

export function DeviceIcon({
  device,
  active,
  offline,
  size = 'md',
}: {
  device: Device;
  active?: boolean;
  offline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { icon: Icon } = deviceKind(device);
  const box = { sm: 'h-8 w-8 rounded-lg', md: 'h-10 w-10 rounded-xl', lg: 'h-14 w-14 rounded-2xl' }[size];
  const glyph = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' }[size];
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center transition-colors',
        box,
        offline
          ? 'bg-surface-2 text-subtle'
          : active
            ? 'bg-accent text-accent-fg'
            : 'bg-surface-2 text-muted',
      )}
    >
      <Icon className={glyph} aria-hidden />
    </div>
  );
}
