import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: 'output/browser/results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/browser/report', open: 'never' }],
    ['json', { outputFile: 'output/browser/results.json' }],
  ],
  workers: 1,
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4175/my-ebird-map/', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    url: 'http://127.0.0.1:4175/my-ebird-map/',
    env: { VITE_MAPBOX_ACCESS_TOKEN: process.env.BROWSER_MAPBOX_TOKEN || '', VITE_GOOGLE_CLIENT_ID: '' },
    reuseExistingServer: false,
  },
});
