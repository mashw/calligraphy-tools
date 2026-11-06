import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:3000', headless: true },
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1', url: 'http://127.0.0.1:3000/guidelines', reuseExistingServer: !process.env.CI },
});
