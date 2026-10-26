// Browser desk-dashboard flow (plan §1 flow 6, #338 M6).
//
// The newest backup report renders as the success line after the
// installer's backup, the daily lists and cross-check line render,
// and keyboard focus stays visible (NFR-DSP-2 over the real
// stylesheet: every tab stop shows the 2px desk-blue outline).
import { expect, test } from '@playwright/test';
import { installLoopbackGuard } from './loopback-guard';
import { ownerToken, signInThroughGate } from './desk-flow';

let guard!: ReturnType<typeof installLoopbackGuard>;

test.beforeEach(async ({ page }) => {
  guard = installLoopbackGuard(page);
});

test.afterEach(() => {
  guard.assertClean();
});

test('backup success line, lists, and cross-check line render', async ({ page, request }) => {
  await ownerToken(request);
  await signInThroughGate(page);
  await expect(page.getByTestId('desk-backup-report')).toContainText('Backup succeeded at');
  await expect(page.getByTestId('desk-arrivals-table')).toBeVisible();
  await expect(page.getByTestId('desk-inhouse-table')).toBeVisible();
  await expect(page.getByTestId('desk-departures-table')).toBeVisible();
  await expect(page.getByTestId('desk-sheet-line')).toContainText(/arriving/);
  await expect(page.getByTestId('desk-sheet-line')).toContainText(/in house/);
});

test('keyboard focus shows the desk-blue outline on every tab stop', async ({
  page,
  request,
}) => {
  await ownerToken(request);
  await signInThroughGate(page);
  // Tab-first focus keeps keyboard modality, so :focus-visible
  // matches every stop exactly as it does for a keyboard user.
  // Read the active element directly (no :focus locator wait):
  // a Tab that lands nowhere ends the walk.
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) {
        return null;
      }
      return { tag: el.tagName.toLowerCase(), outline: getComputedStyle(el).outlineWidth };
    });
    if (info === null) {
      break;
    }
    expect(info.outline, `focus ring on <${info.tag}>`).toBe('2px');
  }
});
