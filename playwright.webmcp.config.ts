import { defineConfig } from '@playwright/test';

const target = process.env.OUTPOST_WEBMCP_URL;
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/native-webmcp.spec.ts',
  forbidOnly: !!process.env.CI,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: target || 'http://localhost:3018',
    channel: process.env.OUTPOST_WEBMCP_CHANNEL || 'chrome',
    trace: 'retain-on-failure',
    launchOptions: {
      args: ['--enable-features=WebMCP'],
      ignoreDefaultArgs: ['--disable-back-forward-cache'],
    },
  },
  webServer: target
    ? undefined
    : {
        command: 'pnpm start --port 3018',
        url: 'http://localhost:3018',
        reuseExistingServer: false,
        timeout: 120000,
      },
});
