import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5187',
    viewport: { width: 390, height: 844 },
    browserName: 'chromium',
    channel: 'chrome',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream'] },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    { command: 'node tests/fixture-server.mjs', url: 'http://127.0.0.1:3347/health', reuseExistingServer: false },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5187 --strictPort', url: 'http://127.0.0.1:5187', reuseExistingServer: false },
  ],
})
