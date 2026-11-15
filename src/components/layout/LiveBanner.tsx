import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { KeyRound } from 'lucide-react';
import { ApiError, describeError } from '@/api/client';
import { useLocations } from '@/hooks/queries';
import { useSettings } from '@/store/settings';

/** Surfaces live-mode connection problems (expired token, proxy missing) app-wide. */
export function LiveBanner() {
  const mode = useSettings((s) => s.mode);
  const token = useSettings((s) => s.token);
  const { error } = useLocations();
  if (mode !== 'live') return null;
  if (!token) {
    return (
      <Banner>
        Live mode is on but no token is set.{' '}
        <Link className="font-semibold underline" to="/settings">
          Add a token
        </Link>{' '}
        or switch back to the demo home.
      </Banner>
    );
  }
  if (!error) return null;
  return (
    <Banner>
      {describeError(error)}{' '}
      {error instanceof ApiError && error.isAuthError ? (
        <Link className="font-semibold underline" to="/settings">
          Update token
        </Link>
      ) : null}
    </Banner>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn lg:px-8"
    >
      <KeyRound className="h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}
