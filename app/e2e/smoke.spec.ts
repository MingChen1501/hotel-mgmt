// MIME-type + blank-screen smoke (issue #337, plan section 5.2).
//
// Runs FIRST and blocks the flow specs: the regression net for the
// #335 white-screen class (missing `mime.types` include → every asset
// `text/plain` → the browser refuses the ES-module scripts → blank
// desk). Red here points at the Nginx config
// (`deploy/nginx/nginx.conf`), not at a wall of flow failures.
import { expect, test } from '@playwright/test';
import { installLoopbackGuard } from './loopback-guard';

let guard!: ReturnType<typeof installLoopbackGuard>;

test.beforeEach(async ({ page }) => {
  guard = installLoopbackGuard(page);
});

test.afterEach(() => {
  guard.assertClean();
});

test('served JS/CSS carry JavaScript and CSS MIME types through the proxy', async ({
  page,
  request,
}) => {
  const entry = await request.get('/app/');
  expect(entry.ok()).toBe(true);
  const html = await entry.text();
  const assetPaths = [
    ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
    ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
  ].map((m) => m[1]);
  expect(assetPaths.length).toBeGreaterThan(0);

  for (const assetPath of assetPaths) {
    const res = await request.get(assetPath);
    expect(res.ok()).toBe(true);
    const contentType = res.headers()['content-type'] ?? '';
    if (assetPath.endsWith('.js')) {
      // Fail closed: text/plain here means the browser refuses the
      // ES module and the desk stays blank (Refs #335).
      expect(
        contentType,
        `${assetPath} must not be served as text/plain`,
      ).not.toContain('text/plain');
      expect(contentType).toMatch(/javascript/);
    } else if (assetPath.endsWith('.css')) {
      expect(contentType).toContain('text/css');
    }
  }

  // The page load itself must emit no non-loopback requests either.
  await page.goto('/app/');
  await expect(page.locator('#shell')).toBeVisible();
});

test('the desk entry renders exactly one view root, never a blank page', async ({
  page,
}) => {
  await page.goto('/app/');
  await expect(page.locator('#shell')).toBeVisible();

  const viewRoots = page.locator('#shell main[data-testid]');
  await expect(viewRoots).toHaveCount(1);
  // The placeholder is the unknown-route fallback: it must never be
  // what the desk entry renders.
  await expect(page.getByTestId('app-placeholder')).toHaveCount(0);
  // A rendered shell with no text is the blank-desk failure mode.
  const text = (await page.locator('#shell').textContent()) ?? '';
  expect(text.trim().length).toBeGreaterThan(0);
});
