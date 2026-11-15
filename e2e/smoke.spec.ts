import { expect, test } from '@playwright/test';

test.describe('demo home', () => {
  test('dashboard shows the home at a glance', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Maple Street Home');
    await expect(page.getByText('Devices online')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeVisible();
    await expect(page.getByText('Power, last 24 hours')).toBeVisible();
  });

  test('toggle a light from the devices page', async ({ page }) => {
    await page.goto('/devices');
    const toggle = page.getByRole('switch', { name: 'Floor Lamp power' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  test('command palette runs a scene', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Devices online')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox').fill('movie');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Movie Night is running')).toBeVisible();
  });

  test('simulated motion fires an automation', async ({ page }) => {
    await page.goto('/devices?q=motion');
    await page.getByRole('link', { name: 'Living Room Motion' }).click();
    await page.getByRole('button', { name: 'Detect motion' }).click();
    await expect(page.getByText('Automation ran')).toBeVisible();
  });

  test('build and save an automation', async ({ page }) => {
    await page.goto('/automations');
    await page.getByRole('button', { name: 'New automation' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#trigger-device').selectOption({ label: 'Front Door' });
    await dialog.locator('#action-device').selectOption({ label: 'Garage Door' });
    await dialog.getByRole('button', { name: 'Create automation' }).click();
    await expect(page.getByRole('heading', { name: /Front Door contact open/ })).toBeVisible();
  });

  test('every page renders without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const path of [
      '/',
      '/devices',
      '/rooms',
      '/scenes',
      '/automations',
      '/energy',
      '/activity',
      '/inspector',
      '/settings',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});
