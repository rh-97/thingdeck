import { useEffect } from 'react';
import { useSettings } from '@/store/settings';

/** Keeps the `dark` class on <html> in sync with the chosen theme and the OS. */
export function useThemeEffect() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', dark ? '#0b0f17' : '#f6f7f9');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
