import { defineConfig, devices } from '@playwright/test';

// Browser tests of the built standalone viewer (dist/viewer), served by e2e/server.mjs under a strict CSP.
// Build first: npm run build. PORT picks another port, e.g. to run two checkouts side by side.
const port = Number(process.env.PORT ?? 4180);

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: { timeout: 10_000 },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        contextOptions: { reducedMotion: 'reduce' },
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
        { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
        { name: 'chromium-phone', use: { ...devices['Pixel 7'] } },
    ],
    webServer: {
        command: 'node e2e/server.mjs',
        url: `http://127.0.0.1:${port}/f/database-sqlite-indexes/`,
        reuseExistingServer: !process.env.CI,
    },
});
