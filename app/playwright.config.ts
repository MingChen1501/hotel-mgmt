// Playwright browser-E2E configuration (issue #337, plan
// docs/testing/browser-e2e-plan.md section 2–section 5).
//
// - CI gate: `chromium` project only (headless, 1280x800 — the desk
//   kiosk viewport). `npx playwright test --project=chromium`.
// - `chromium-headed` is local-only pre-push sanity, never gated.
// - `workers: 1`: specs share one fresh stack (plan section 8 seed
//   discipline), so files run sequentially against distinct
//   per-run entities.
// - `retries: 1` on CI only; a second consecutive failure is a bug,
//   not a retry bump (plan section 5.4).
// - HTML report is uploaded as a CI artifact; it is served locally,
//   never from a CDN (plan section 4.3).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1/app/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'chromium-headed',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        headless: false,
      },
    },
  ],
});
