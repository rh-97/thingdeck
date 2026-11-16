import type { Page } from '@playwright/test';

let counter = 0;

/**
 * Creates a fresh account through the API (the cookie lands in the page's
 * context) and stores the chosen mode, so a test starts inside the app.
 */
export async function signUp(
  page: Page,
  { mode = 'demo', theme }: { mode?: 'demo' | 'live' | null; theme?: 'light' | 'dark' } = {},
) {
  const email = `alex.${Date.now().toString(36)}${++counter}@example.com`;
  const headers = { 'X-Requested-With': 'thingsdeck' };
  const res = await page.request.post('/api/auth/register', {
    data: { email, password: 'e2e-password-1', name: 'Alex Rivera' },
    headers,
  });
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`);
  const prefs: Record<string, unknown> = {};
  if (mode) prefs.mode = mode;
  if (theme) prefs.theme = theme;
  if (Object.keys(prefs).length) await page.request.put('/api/me/preferences', { data: prefs, headers });
  if (theme) {
    await page.addInitScript(
      (t) => localStorage.setItem('thingsdeck.settings', JSON.stringify({ state: { theme: t }, version: 2 })),
      theme,
    );
  }
  return { email, password: 'e2e-password-1' };
}
