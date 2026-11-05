import { defineConfig, devices } from '@playwright/test';

const parallelIndex = process.env.TEST_PARALLEL_INDEX
  ? parseInt(process.env.TEST_PARALLEL_INDEX, 10)
  : 0;

const defaultBaseUrl = process.env.E2E_BASE_PORT
  ? `http://localhost:${parseInt(process.env.E2E_BASE_PORT, 10) + parallelIndex}`
  : (process.env.BASE_URL || 'http://localhost:80');

const configuredWorkers = process.env.E2E_WORKERS
  ? parseInt(process.env.E2E_WORKERS, 10)
  : (process.env.CI ? 4 : 1);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: process.env.FULLY_PARALLEL === 'true',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: configuredWorkers,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: defaultBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: ['--disable-features=NetworkChangeNotifier'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
