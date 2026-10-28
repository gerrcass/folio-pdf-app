import { defineConfig } from '@playwright/test';
import fs from 'node:fs';

const localChromium =
  process.env.PLAYWRIGHT_CHROMIUM_PATH ??
  (fs.existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
    permissions: ['camera'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: localChromium,
      args: [
        '--no-sandbox',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
      ],
    },
  },
  webServer: {
    command: 'node scripts/e2e-preview.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
  projects: [
    { name: 'browser', testIgnore: /electron\.spec/ },
    { name: 'electron', testMatch: /electron\.spec/ },
  ],
});
