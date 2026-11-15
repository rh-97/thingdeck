import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useLiveUpdates } from '@/hooks/useLiveUpdates';
import { useThemeEffect } from '@/hooks/useThemeEffect';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { CommandPalette } from '@/components/CommandPalette';
import { Toaster } from '@/components/Toaster';
import { Dialog } from '@/components/ui/Dialog';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import { LiveBanner } from './LiveBanner';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  useLiveUpdates();
  useThemeEffect();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-full">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-surface focus:p-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>

      <Dialog open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" side="left">
        <div className="-mx-5 -my-4">
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </div>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMenuOpen(true)} onSearch={() => setPaletteOpen(true)} />
        <LiveBanner />
        <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-12">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <MobileNav onMore={() => setMenuOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </div>
  );
}
