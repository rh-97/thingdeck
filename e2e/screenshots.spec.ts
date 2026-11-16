import { expect, test, type Page } from '@playwright/test';
import { signUp } from './helpers';

/**
 * Regenerates the README screenshots. Skipped unless SCREENSHOTS=1
 * (run via `make screenshots`).
 */
test.skip(!process.env.SCREENSHOTS, 'screenshots only on demand');

const out = (name: string) => `docs/screenshots/${name}.png`;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(800);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await signUp(page, { theme });
}

test('dashboard (dark)', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/');
  await expect(page.getByText('Power, last 24 hours')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('dashboard-dark') });
});

test('dashboard (light)', async ({ page }) => {
  await setTheme(page, 'light');
  await page.goto('/');
  await expect(page.getByText('Power, last 24 hours')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('dashboard-light') });
});

test('devices', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/devices');
  await settle(page);
  await page.screenshot({ path: out('devices') });
});

test('device detail', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/devices?q=thermostat');
  await page.getByRole('link', { name: 'Thermostat' }).first().click();
  await settle(page);
  await page.screenshot({ path: out('device-thermostat') });
  await page.getByRole('tab', { name: 'History' }).click();
  await settle(page);
  await page.screenshot({ path: out('device-history') });
});

test('energy', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/energy');
  await settle(page);
  await page.screenshot({ path: out('energy') });
});

test('automation builder', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/automations');
  await settle(page);
  await page.getByRole('button', { name: 'New automation' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#trigger-device').selectOption({ label: 'Air Quality Monitor' });
  await dialog.locator('#trigger-attr').selectOption('carbonDioxideMeasurement.carbonDioxide');
  await dialog.locator('#action-device').selectOption({ label: 'Air Purifier' });
  await dialog.getByText('Request body (POST /rules)').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('automation-builder') });
});

test('api inspector', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/');
  await settle(page);
  await page.getByRole('link', { name: 'API Inspector' }).click();
  await settle(page);
  await page.screenshot({ path: out('inspector') });
});

test('command palette', async ({ page }) => {
  await setTheme(page, 'dark');
  await page.goto('/');
  await settle(page);
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Search commands' }).fill('lock');
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('command-palette') });
});

test('sign in', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('thingsdeck.settings', JSON.stringify({ state: { theme: 'dark' }, version: 2 })),
  );
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('sign-in') });
});

test('welcome choice', async ({ page }) => {
  await signUp(page, { mode: null, theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('welcome') });
});

test('mobile', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await setTheme(page, 'dark');
  await page.goto('/');
  await expect(page.getByText('Devices online')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('mobile-dashboard') });
  await page.goto('/devices?q=washer');
  await page.getByRole('link', { name: 'Washer' }).click();
  await settle(page);
  await page.screenshot({ path: out('mobile-washer') });
  await context.close();
});
