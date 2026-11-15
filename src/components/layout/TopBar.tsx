import { Menu, Moon, Search, Sun, SunMoon } from 'lucide-react';
import { useModes, useSetMode } from '@/hooks/queries';
import { useSettings, type Theme } from '@/store/settings';
import { Button } from '@/components/ui/Button';

const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const themeIcon = { system: SunMoon, light: Sun, dark: Moon };

export function TopBar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const { modes, current } = useModes();
  const setMode = useSetMode();
  const ThemeIcon = themeIcon[theme];
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      <button
        onClick={onSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-subtle hover:border-accent/50 sm:max-w-xs"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search devices, scenes…</span>
        <kbd className="ml-auto hidden rounded border border-line px-1.5 text-[10px] font-medium sm:inline">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        {modes.data && current.data ? (
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="hidden sm:inline">Mode</span>
            <select
              aria-label="Location mode"
              value={current.data.id}
              onChange={(e) => setMode.mutate(e.target.value)}
              disabled={setMode.isPending}
              className="h-9 rounded-lg border border-line bg-surface px-2 text-sm font-medium text-fg"
            >
              {modes.data.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(nextTheme[theme])}
          aria-label={`Theme: ${theme}. Switch to ${nextTheme[theme]}`}
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
