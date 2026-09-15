import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against the PRODUCTION build served under a repository-style
 * sub-path, which is how the app is deployed to GitHub Pages. Testing the dev
 * server instead would not prove the base path works.
 */
const BASE_URL = 'http://127.0.0.1:4173/QuadChess/';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],

  webServer: {
    command: 'npm run build && node tests/e2e/server.mjs',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
