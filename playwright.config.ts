import { defineConfig } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT || 5173);
const url = `http://localhost:${port}`;
export default defineConfig({
  testDir: './tests',
  workers: 1,
  expect: { timeout: 15000 },
  use: { baseURL: url, locale: 'en-US', screenshot: 'only-on-failure', trace: 'retain-on-failure', channel: 'msedge', launchOptions: { args: ['--use-angle=swiftshader', '--enable-webgl'] } },
  webServer: {
    command: process.env.PLAYWRIGHT_PREVIEW === '1' ? `npm run preview -- --port ${port} --strictPort` : `npm run dev -- --port ${port} --strictPort`,
    url,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1'
  },
  timeout: 60000
});
