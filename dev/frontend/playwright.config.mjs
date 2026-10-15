// E2E for the TV launcher and phone remote against the contract mock.
//   npm ci && npm run test:e2e
// Uses the system Google Chrome (channel "chrome") — the same engine the add-on runs.
// Set E2E_SCREENSHOT_DIR to keep 1920×1080 and iPhone screenshots.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.MOCK_PORT || 8099);
const channel = process.env.PW_CHANNEL || 'chrome';

export default defineConfig({
  testDir: '../../tests/e2e',
  fullyParallel: false,
  workers: 1, // one shared mock backend
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30000,
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: `node mock-server.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/v3/health`,
    reuseExistingServer: !process.env.CI,
    env: { MOCK_STEP_MS: '150' },
  },
  projects: [
    {
      name: 'tv-launcher',
      testMatch: /launcher\.spec\.mjs/,
      use: { browserName: 'chromium', channel, viewport: { width: 1920, height: 1080 }, baseURL: `http://127.0.0.1:${PORT}` },
    },
    {
      name: 'phone-remote',
      testMatch: /remote\.spec\.mjs/,
      use: { ...devices['iPhone 14'], browserName: 'chromium', channel, baseURL: `http://localhost:${PORT}` },
    },
  ],
});
