import type { ReactNode } from 'react';
import { Logo } from '@/components/layout/Logo';
import { Toaster } from '@/components/Toaster';
import { useThemeEffect } from '@/hooks/useThemeEffect';

/** Centered card layout for sign-in, registration and first-run screens. */
export function AuthLayout({
  title,
  description,
  children,
  wide,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useThemeEffect();
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className={wide ? 'w-full max-w-3xl' : 'w-full max-w-sm'}>
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-subtle">
          ThingsDeck is an independent project, not affiliated with Samsung or SmartThings.
        </p>
      </div>
      <Toaster />
    </div>
  );
}

export function Splash() {
  useThemeEffect();
  return (
    <div className="flex min-h-full items-center justify-center" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}
