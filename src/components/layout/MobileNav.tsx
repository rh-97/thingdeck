import { NavLink } from 'react-router';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { MOBILE_NAV } from './nav';

export function MobileNav({ onMore }: { onMore: () => void }) {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {MOBILE_NAV.map(({ to, label, icon: Icon, ...rest }) => (
        <NavLink
          key={to}
          to={to}
          end={'end' in rest}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
              isActive ? 'text-accent' : 'text-muted',
            )
          }
        >
          <Icon className="h-5 w-5" aria-hidden />
          {label}
        </NavLink>
      ))}
      <button
        onClick={onMore}
        className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
        More
      </button>
    </nav>
  );
}
