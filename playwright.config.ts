import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5180',
    trace: 'retain-on-failure',
  },
  // In CI (no BASE_URL) Playwright starts its own Vite server; locally the dockerised one is reused.
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5180',
        url: 'http://localhost:5180',
        reuseExistingServer: true,
        timeout: 60_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
});
