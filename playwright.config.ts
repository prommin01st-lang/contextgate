import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for ContextGate Dashboard
 *
 * Prerequisites:
 *   - API server running on http://localhost:8899
 *   - Dashboard dev server running on http://localhost:5173
 *   - Admin user admin@contextgate.local / password123 exists
 */

const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'http://localhost:5173';
const API_URL = process.env.API_URL ?? 'http://localhost:8899';

export default defineConfig({
  testDir: './tests/e2e/playwright',
  fullyParallel: false, // sequential to avoid data conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: DASHBOARD_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    // Dashboard dev server (optional — comment out if you start it manually)
    {
      command: 'pnpm --filter dashboard dev',
      url: DASHBOARD_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    // API server (optional — comment out if you start it manually)
    {
      command: 'pnpm --filter @contextgate/server dev',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
