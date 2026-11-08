// Browser sign-in flow (plan section 1 flow 1, #338 M6).
//
// The shell owns the one sign-in gate (FR-DSP-2): owner sign-in
// lands on the desk dashboard, a wrong secret reads as one plain
// sentence with no navigation, and a locked identity reads
// distinctly. The lockout victim is a throwaway front-desk account
// so the owner stays usable for the other flow specs.
import { expect, test } from '@playwright/test';
import { installLoopbackGuard } from './loopback-guard';
import {
  ADMIN_IDENTITY,
  apiOp,
  ownerToken,
  requireSecret,
  signInThroughGate,
} from './desk-flow';

let guard!: ReturnType<typeof installLoopbackGuard>;

test.beforeEach(async ({ page }) => {
  guard = installLoopbackGuard(page);
});

test.afterEach(() => {
  guard.assertClean();
});

test('owner sign-in lands on the desk dashboard', async ({ page }) => {
  await signInThroughGate(page);
  await expect(page.getByTestId('desk-dashboard')).toBeVisible();
  // Refs #564: the signed-in name lives in the account disclosure,
  // so open it first — asserting a hidden node would not prove the
  // identity is visible to the staff member.
  await page.getByTestId('shell-session-trigger').click();
  await expect(page.getByTestId('shell-session-menu')).toBeVisible();
  await expect(page.getByTestId('shell-user')).toBeVisible();
  await expect(page.getByTestId('shell-user')).not.toBeEmpty();
  await expect(page.getByTestId('shell-nav-desk')).toHaveClass(/shell-nav-active/);
});

// Refs #564: the authorised desk header is a single 60px row —
// brand, the seven tabs, and the compact VI | EN pill — at the
// design's 1200px width. The Vitest suite pins the stylesheet; this
// pins the rendered geometry in a real browser, including VI (the
// widest label set).
test('header keeps the design 60px single row at 1200px', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await signInThroughGate(page);
  const nav = page.getByTestId('shell-nav');
  await expect(nav).toBeVisible();

  async function headerMetrics() {
    return nav.evaluate((el) => {
      const bar = el.getBoundingClientRect();
      const spill = [...el.children]
        .filter((child) => {
          const box = child.getBoundingClientRect();
          return box.top < bar.top - 0.5 || box.bottom > bar.bottom + 0.5 || box.right > bar.right + 0.5;
        })
        .map((child) => child.getAttribute('data-testid') ?? child.className);
      return { height: Math.round(bar.height), spill };
    });
  }

  expect(await headerMetrics()).toEqual({ height: 60, spill: [] });
  // A configured hotel name longer than the free space truncates
  // (the brand is the only shrinkable item); it must never wrap the
  // bar, and it still renders in the row.
  await expect(page.getByTestId('shell-brand')).toBeVisible();

  await page.getByTestId('locale-vi').click();
  expect(await headerMetrics()).toEqual({ height: 60, spill: [] });
});

// Refs #564 (NFR-DSP-2): Sign out renders inside the white account
// panel, so it must keep the shell's default teal focus ring — the
// header's white ring painted at ~1:1 on that panel and made the
// keyboard indicator invisible. This asserts the RENDERED ring in
// Chromium, reached through the keyboard only (a programmatic
// `.focus()` would not reliably turn on `:focus-visible`), so it
// fails on a stylesheet-text change that a source grep would miss.
test("keeps Sign out's focus ring visible on the white account panel", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await signInThroughGate(page);

  async function pressTabUntil(testId: string, max = 30): Promise<void> {
    for (let i = 0; i < max; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(
        () => (document.activeElement as HTMLElement | null)?.getAttribute('data-testid') ?? '',
      );
      if (focused === testId) {
        return;
      }
    }
    throw new Error(`keyboard focus never reached ${testId}`);
  }

  function luminance(rgb: string): number {
    const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map((part) => {
      const value = Number(part) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function contrast(a: string, b: string): number {
    const [lighter, darker] = luminance(a) > luminance(b) ? [a, b] : [b, a];
    return (luminance(lighter) + 0.05) / (luminance(darker) + 0.05);
  }

  async function focusRing(testId: string) {
    return page.getByTestId(testId).evaluate((el) => {
      const style = getComputedStyle(el);
      const panel = el.closest('[data-testid="shell-session-menu"]');
      return {
        color: style.outlineColor,
        width: style.outlineWidth,
        line: style.outlineStyle,
        surface: getComputedStyle(el.closest('[data-testid="shell-nav"]') as Element)
          .backgroundColor,
        panel: panel === null ? '' : getComputedStyle(panel).backgroundColor,
      };
    });
  }

  // The trigger sits on the teal bar, so it keeps the white ring.
  // PrimeVue's button transition fades `outline-color` in, so poll
  // for the settled value instead of reading the first painted frame.
  await pressTabUntil('shell-session-trigger');
  await expect.poll(
    async () => (await focusRing('shell-session-trigger')).color,
  ).toBe('rgb(255, 255, 255)');
  const triggerRing = await focusRing('shell-session-trigger');
  expect(triggerRing.line).toBe('solid');
  expect(triggerRing.width).toBe('2px');
  expect(contrast(triggerRing.color, triggerRing.surface)).toBeGreaterThanOrEqual(3);

  // Enter opens the disclosure; the next Tab lands on Sign out.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('shell-session-menu')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('shell-signout')).toBeFocused();

  // The regression value is white on the white panel: load the page
  // again and let the settled colour decide, so a stylesheet change
  // that re-scopes Sign out to the white ring fails here.
  await expect.poll(
    async () => (await focusRing('shell-signout')).color,
    { message: "Sign out's focus ring settled on the wrong colour for the white panel" },
  ).toBe('rgb(15, 118, 110)');

  const ring = await focusRing('shell-signout');
  // The panel really is the white surface the ring has to read on.
  expect(ring.panel).toBe('rgb(255, 255, 255)');
  expect(ring.line).toBe('solid');
  expect(ring.width).toBe('2px');
  expect(ring.color).not.toBe('rgb(255, 255, 255)');
  expect(contrast(ring.color, ring.panel)).toBeGreaterThanOrEqual(4.5);
});

test('wrong secret surfaces the plain sentence with no navigation', async ({ page }) => {
  await page.goto('/app/');
  await page.getByTestId('shell-signin-identity').fill(ADMIN_IDENTITY);
  await page.getByTestId('shell-signin-secret').locator('input').fill('wrong-secret');
  await page.getByTestId('shell-signin-submit').click();
  await expect(page.getByTestId('shell-signin-error')).toContainText('did not work');
  await expect(page.getByTestId('shell-gate')).toBeVisible();
  await expect(page.getByTestId('shell-nav')).toHaveCount(0);
});

test('locked identity surfaces the locked wording distinctly', async ({ page, request }) => {
  requireSecret();
  const token = await ownerToken(request);
  const victim = `lockvictim-${Date.now().toString(36)}`;
  await apiOp(request, 'admin', 'CreateUser', {
    displayName: 'Lock Victim',
    signinIdentity: victim,
    secret: 'victim-secret-1',
    role: 'front-desk',
  }, token);
  // Five wrong secrets trip the 5-strike lockout (LLD section 0).
  for (let i = 0; i < 5; i += 1) {
    await request.post('/v1/admin/SignIn', {
      data: { signinIdentity: victim, secret: 'wrong-secret' },
    });
  }
  await page.goto('/app/');
  await page.getByTestId('shell-signin-identity').fill(victim);
  await page.getByTestId('shell-signin-secret').locator('input').fill('victim-secret-1');
  await page.getByTestId('shell-signin-submit').click();
  await expect(page.getByTestId('shell-signin-error')).toContainText(/locked/i);
  await expect(page.getByTestId('shell-gate')).toBeVisible();
});

test('signed-out session routes back to the gate on the next write', async ({ page, request }) => {
  await ownerToken(request);
  await signInThroughGate(page);
  await expect(page.getByTestId('desk-dashboard')).toBeVisible();
  // Invalidate the UI's own session behind the shell's back (no UI
  // sign-out), then touch the admin console: only the admin
  // service enforces revocation, so the ListUsers read trips the
  // shared-client 401 path (FR-ADM-2, NFR-SEC-2) back to the gate
  // with the session-expired notice, not a dead dashboard.
  const uiToken = await page.evaluate(() => sessionStorage.getItem('hotel-mgmt.session.token'));
  if (typeof uiToken !== 'string' || !uiToken) {
    throw new Error('UI sign-in stored no session token');
  }
  await apiOp(request, 'admin', 'SignOut', {}, uiToken);
  await page.goto('/app/admin');
  await expect(page.getByTestId('shell-gate')).toBeVisible();
  await expect(page.getByTestId('shell-expired-notice')).toContainText('Session expired');
  await expect(page.getByTestId('shell-nav')).toHaveCount(0);
});
