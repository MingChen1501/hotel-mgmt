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
  await expect(page.getByTestId('shell-user')).not.toBeEmpty();
  await expect(page.getByTestId('shell-nav-desk')).toHaveClass(/shell-nav-active/);
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
