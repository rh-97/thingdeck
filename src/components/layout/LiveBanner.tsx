import type { ReactNode } from 'react';
import { CloudOff } from 'lucide-react';
import { ApiError, describeError } from '@/api/client';
import { useLocations } from '@/hooks/queries';
import { useSettings } from '@/store/settings';

/**
 * Surfaces live-mode problems the auth gate doesn't already handle
 * (expired tokens show the reconnect screen instead).
 */
export function LiveBanner() {
  const mode = useSettings((s) => s.mode);
  const { error } = useLocations();
  if (mode !== 'live' || !error) return null;
  if (error instanceof ApiError && (error.code === 'TOKEN_EXPIRED' || error.code === 'UNAUTHENTICATED'))
    return null;
  return <Banner>{describeError(error)}</Banner>;
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn lg:px-8"
    >
      <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
