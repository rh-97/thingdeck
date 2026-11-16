import { NavLink } from 'react-router';
import { FlaskConical, LogOut, Radio } from 'lucide-react';
import { useCurrentLocation } from '@/hooks/queries';
import { useSettings } from '@/store/settings';
import { useMe, useSignOut } from '@/auth/hooks';
import { STATIC_DEMO } from '@/lib/env';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { NAV } from './nav';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const mode = useSettings((s) => s.mode);
  const liveReady = useSettings((s) => s.liveReady);
  const setLocationId = useSettings((s) => s.setLocationId);
  const { data: locations, locationId } = useCurrentLocation();
  const live = mode === 'live' && liveReady;
  const me = useMe(!STATIC_DEMO);
  const signOut = useSignOut();

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <Logo />

      {locations && locations.length > 0 ? (
        <label className="block">
          <span className="sr-only">Location</span>
          <select
            value={locationId ?? ''}
            onChange={(e) => {
              setLocationId(e.target.value);
              onNavigate?.();
            }}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm font-medium"
          >
            {locations.map((l) => (
              <option key={l.locationId} value={l.locationId}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <NavLink
        to="/settings"
        onClick={onNavigate}
        className="rounded-xl border border-line bg-surface-2/60 p-3 text-xs hover:border-accent/50"
      >
        <div className="flex items-center gap-2 font-semibold">
          {live ? (
            <Radio className="h-3.5 w-3.5 text-good" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5 text-accent" />
          )}
          {live ? 'Live account' : 'Demo home'}
        </div>
        <p className="mt-1 text-muted">
          {live
            ? 'Connected with a personal access token.'
            : 'Simulated devices — nothing touches a real home.'}
        </p>
      </NavLink>

      {me.data ? (
        <div className="flex items-center gap-2 border-t border-line pt-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent uppercase">
            {(me.data.user.name || me.data.user.email).slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            {me.data.user.name ? <div className="truncate font-medium">{me.data.user.name}</div> : null}
            <div className="truncate text-muted">{me.data.user.email}</div>
          </div>
          <button
            onClick={() => void signOut()}
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
