import { defineConfig, devices } from '@playwright/test';

// E2E runs against the production build served by `vite preview`, in both
// Chromium and Firefox, at a desktop and a mobile (Pixel-class) viewport.
// Firefox does not support Playwright's isMobile emulation, so the mobile
// Firefox project sets the viewport only.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
    {
      name: 'firefox-desktop',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 900 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'firefox-mobile',
      use: {
        browserName: 'firefox',
        viewport: { width: 393, height: 727 },
        deviceScaleFactor: undefined,
        isMobile: undefined,
        hasTouch: undefined,
      },
    },
  ],
});
