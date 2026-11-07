// Browser stay flow (plan section 1 flow 3, #338 M6; v2 board
// rebuild Refs #541).
//
// Arrival-select check-in and departing-select check-out behind
// the folio gate: the open-balance refusal reads in plain words,
// an approval is recorded, and check-out closes through the
// confirm dialog.
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installLoopbackGuard } from './loopback-guard';
import {
  apiOp,
  ownerToken,
  setupFlowContext,
  signInThroughGate,
  stayWindow,
} from './desk-flow';

let guard!: ReturnType<typeof installLoopbackGuard>;

test.beforeEach(async ({ page }) => {
  guard = installLoopbackGuard(page);
});

test.afterEach(() => {
  guard.assertClean();
});

test('check-in, approval, and dialog check-out', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(0, 2);
  const ctx = await setupFlowContext(request, token, 'stay', window);
  // API-side booking for tonight (mirrors script/e2e-desk-loop.sh):
  // the UI drives everything from check-in on.
  const quote = await apiOp(request, 'rates', 'QuotePrice', {
    roomTypeId: ctx.roomTypeId,
    arrivalDate: window.arrival,
    departureDate: window.departure,
    ratePlanName: ctx.ratePlan,
  }, token);
  const sellable = await apiOp(request, 'rooms', 'CheckRoomTypeSellability', {
    roomType: ctx.roomTypeId,
    dateFrom: window.arrival,
    dateTo: window.departure,
  }, token);
  const booking = await apiOp(request, 'reservations', 'CreateReservation', {
    roomTypeId: ctx.roomTypeId,
    arrivalDate: window.arrival,
    departureDate: window.departure,
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument: 'UI-STAY-1' },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  const reservationRef = booking.reservationRef as string;

  await signInThroughGate(page);
  await page.goto('/app/stay');

  // Check in by picking the arrival (the human ref from booking;
  // the arrival pick needs a reservationRef the stay lists API
  // does not emit — backend contract gap, out of scope for the
  // styling pass).
  await page.getByTestId('stay-checkin-arrival').selectOption(reservationRef);
  // First click loads the booking and the ready rooms of the
  // booked type into the picker; pick one, then click again to
  // commit the check-in.
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Booked: ${ctx.roomTypeName}.`);
  await page.getByTestId('stay-checkin-room').selectOption({ label: ctx.roomNumbers[0] });
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Checked in for booking ${reservationRef} in room ${ctx.roomNumbers[0]}`);

  // Check out by picking the departing stay (guest plus room).
  await page.getByTestId('stay-checkout-stay').selectOption({
    label: `${ctx.guestName} · ${ctx.roomNumbers[0]}`,
  });

  // An open balance refuses check-out in plain words naming the
  // approval next step.
  await apiOp(request, 'billing', 'PostCharge', {
    stayId: await stayIdFromStatus(page),
    itemKind: 'nightly-room-charge',
    itemName: 'Room charge',
    amountMinor: 120000,
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  await page.getByTestId('stay-review').click();
  await expect(page.getByTestId('stay-checkout-error')).toContainText('open balance');
  await expect(page.getByTestId('stay-approval-section')).toBeVisible();

  // Record the approval, then close through the confirm dialog.
  await page.getByTestId('stay-approval-by').fill('Night Manager');
  await page.getByTestId('stay-approval-role').fill('manager');
  await page.getByTestId('stay-approve').click();
  await expect(page.getByTestId('stay-checkout-status')).toContainText('Approval recorded');
  await page.getByTestId('stay-checkout').click();
  await expect(page.getByTestId('stay-checkout-dialog')).toContainText('Check out this stay now?');
  await page.getByTestId('stay-checkout-confirm').click();
  await expect(page.getByTestId('stay-checkout-status')).toContainText(`Checked out for ${ctx.guestName}`);
  // The close carries the invoice ref (FR-FDK-2, FR-BIL-4
  // presentation: the reviewed folio id is the invoice).
  // Room release stays API-loop-covered: the desk loop calls rooms
  // ReleaseRoom explicitly and asserts vacant-dirty there, while the
  // desk screens (legacy page and this view alike) never release —
  // no screen action can produce it, so the browser suite does not
  // re-prove it here.
  await expect(page.getByTestId('stay-checkout-status')).toContainText('invoice');
});

// The already-closed refusal (STATE_ILLEGAL naming the closed stay)
// is pinned at the component level instead
// (StayView.test.ts names an already-closed stay on the second
// close): the v2 departing select only lists in-house and
// departing stays, so a closed stay cannot be re-picked for review
// on screen.
async function stayIdFromStatus(page: Page): Promise<string> {
  // The check-in status names the booking ref and room; the exact
  // stay ID lives in the section reference details (issue #372),
  // hidden until staff open the disclosure for verification.
  await page.getByTestId('stay-checkin-details-toggle').click();
  const body = page.getByTestId('stay-checkin-details-body');
  await expect(body).toContainText('Stay ID');
  const stayId = ((await body.getByRole('definition').textContent()) ?? '').trim();
  if (!stayId) {
    throw new Error(`cannot read the stay id from: ${(await body.textContent()) ?? ''}`);
  }
  return stayId;
}
