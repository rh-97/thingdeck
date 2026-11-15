import { cn } from '@/lib/cn';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/** Accessible switch (role="switch") used for on/off style controls. */
export function Toggle({ checked, onChange, label, disabled, size = 'md' }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onChange(!checked);
      }}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'md' ? 'h-6 w-11' : 'h-5 w-9',
        checked ? 'bg-accent' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'inline-block rounded-full bg-white shadow transition-transform',
          size === 'md' ? 'h-5 w-5' : 'h-4 w-4',
          checked ? (size === 'md' ? 'translate-x-5.5' : 'translate-x-4.5') : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
