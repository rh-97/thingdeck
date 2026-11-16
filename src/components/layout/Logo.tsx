export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M8 15.5 16 9l8 6.5V24a1 1 0 0 1-1 1h-4.5v-5h-5v5H9a1 1 0 0 1-1-1z" fill="var(--surface)" />
        <circle cx="16" cy="16.5" r="1.6" fill="var(--accent)" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">ThingsDeck</div>
        <div className="text-[11px] text-subtle">SmartThings console</div>
      </div>
    </div>
  );
}
