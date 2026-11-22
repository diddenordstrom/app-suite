import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: isCI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4200',
    // Specs set up data through the `request` fixture. The server's CSRF check (hono/csrf, as in every
    // suite app) wants an Origin on writes without a JSON body, which browsers send and this fixture doesn't.
    extraHTTPHeaders: { Origin: 'http://localhost:4200' },
    headless: true,
    trace: isCI ? 'retain-on-failure' : 'off',
    screenshot: isCI ? 'only-on-failure' : 'off',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // CI: the built server serves the client and API on :4200. Locally: Vite on :4200 proxying /api/ to the API on :3500.
    command: isCI ? 'node dist/server/index.js' : 'npm run dev',
    url: 'http://localhost:4200',
    // No Pocket ID in tests: every request runs as the fixed dev user.
    env: { AUTH_MODE: 'dev', ...(isCI && { PORT: '4200' }) },
    reuseExistingServer: !isCI,
    // Generous for a cold local dev start; the built server boots in under two seconds.
    timeout: 120_000,
  },
});
