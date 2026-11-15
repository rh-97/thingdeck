import { NavLink } from 'react-router';
import { FlaskConical, Radio } from 'lucide-react';
import { useCurrentLocation } from '@/hooks/queries';
import { useSettings } from '@/store/settings';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';
import { NAV } from './nav';

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const mode = useSettings((s) => s.mode);
  const token = useSettings((s) => s.token);
  const setLocationId = useSettings((s) => s.setLocationId);
  const { data: locations, locationId } = useCurrentLocation();
  const live = mode === 'live' && !!token;

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
            : 'Simulated devices — nothing leaves your browser.'}
        </p>
      </NavLink>
    </div>
  );
}
