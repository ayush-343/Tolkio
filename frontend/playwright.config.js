import { defineConfig, devices } from '@playwright/test';
import process from 'node:process';
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || undefined },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173', reuseExistingServer: false,
    env: { VITE_STREAM_API_KEY: '', VITE_VAPID_PUBLIC_KEY: '' },
  },
});
