import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent';
}) {
  const ring = {
    neutral: 'bg-surface-2 text-muted',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
    accent: 'bg-accent-soft text-accent',
  }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-lg p-1.5', ring)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-xs font-medium text-muted">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub ? <div className="mt-0.5 truncate text-xs text-subtle">{sub}</div> : null}
    </div>
  );
}
