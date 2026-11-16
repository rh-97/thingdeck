import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test.describe('accounts', () => {
  test('signed-out visitors are sent to sign in, then back where they were going', async ({ page }) => {
    await page.goto('/energy');
    await expect(page).toHaveURL(/\/login\?next=%2Fenergy/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('register → choose demo → remembered after sign out and in', async ({ page }) => {
    const email = `journey-${Date.now()}@thingsdeck.test`;
    await page.goto('/register');
    await page.getByLabel('Name').fill('Sam Lee');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('a-strong-password');
    await page.getByLabel('Confirm password').fill('a-strong-password');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByRole('heading', { name: 'Welcome, Sam!' })).toBeVisible();
    await page.getByRole('button', { name: /Explore the demo home/ }).click();
    await expect(page.getByText('Devices online')).toBeVisible();

    await page.reload();
    await expect(page.getByText('Devices online')).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('a-strong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Devices online')).toBeVisible();
  });

  test('wrong password shows an error', async ({ page }) => {
    const { email } = await signUp(page);
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect');
  });

  test('live mode without a token asks to connect, with a way back to the demo', async ({ page }) => {
    await signUp(page, { mode: 'live' });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Connect SmartThings' })).toBeVisible();
    await page.getByRole('button', { name: 'Use the demo home instead' }).click();
    await expect(page.getByText('Devices online')).toBeVisible();
  });
});
