// Browser desk-dashboard flow (plan section 1 flow 6, #338 M6).
//
// Refs #489: the legacy backup-report section is gone from the desk
// screen (no design counterpart; FR-ADM-5/NFR-BKP-2 direct the report
// to the owner/manager via the admin audit surface). The daily lists
// and cross-check line render, and keyboard focus stays visible
// (NFR-DSP-2 over the real stylesheet: every tab stop shows the 2px
// desk-blue outline).
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

test('lists and cross-check line render, and no backup section remains', async ({
  page,
  request,
}) => {
  await ownerToken(request);
  await signInThroughGate(page);
  await expect(page.getByTestId('desk-arrivals-table')).toBeVisible();
  await expect(page.getByTestId('desk-inhouse-table')).toBeVisible();
  await expect(page.getByTestId('desk-departures-table')).toBeVisible();
  // The compose stack carries no reporting rebuild job yet, so
  // DailySheet answers from an empty read model (Go's zero as-of).
  // The desk shows the explicit no-report-time state and never the
  // year-0001 timestamp the #563 audit caught in the Main evidence.
  await expect(page.getByTestId('desk-sheet-line')).toContainText(
    /report figures are not available/i,
  );
  await expect(page.getByTestId('desk-sheet-line')).not.toContainText('0001-01-01');
  // Refs #489: the removed backup-report section stays absent — the
  // design carries no such card, so a regression reintroducing it
  // fails here instead of drifting silently.
  await expect(page.getByTestId('desk-backup')).toHaveCount(0);
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
