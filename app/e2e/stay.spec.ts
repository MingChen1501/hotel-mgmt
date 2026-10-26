// Browser stay flow (plan §1 flow 3, #338 M6).
//
// Arrival pick, check-in, mid-stay move, time recording, and
// check-out behind the folio gate: the open-balance refusal reads
// in plain words, an approval is recorded, and check-out closes
// through the confirm dialog.
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

test('check-in, move, times, approval, and dialog check-out', async ({ page, request }) => {
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

  // Check in by typing the booking reference (the human ref
  // from booking; the arrival pick needs a reservationRef the
  // lists API does not emit — backend contract gap, out of scope
  // for the styling pass).
  await page.getByTestId('stay-booking-ref').fill(reservationRef);
  // First click loads the booking and the ready rooms of the
  // booked type into the picker; pick one, then click again to
  // commit the check-in.
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText('Booked room type');
  await page.getByTestId('stay-checkin-room').selectOption({ label: ctx.roomNumbers[0] });
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText('Checked in: stay');

  // Move mid-stay to the second ready room.
  const inHouseRow = page
    .getByTestId('stay-inhouse-table')
    .getByRole('row', { name: new RegExp(ctx.guestName) });
  await inHouseRow.getByRole('button', { name: 'Use this stay' }).click();
  await expect(page.getByTestId('stay-move-status')).toContainText('Working with stay');
  await page.getByTestId('stay-move-room').selectOption({ label: ctx.roomNumbers[1] });
  await page.getByTestId('stay-move').click();
  await expect(page.getByTestId('stay-move-status')).toContainText(`to room ${ctx.roomNumbers[1]}`);

  // Record the early arrival; the kept values stay visible.
  await page.getByTestId('stay-times-arrival').fill(`${window.arrival}T05:30`);
  await page.getByTestId('stay-times').click();
  await expect(page.getByTestId('stay-times-status')).toContainText('kept');

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
  await expect(page.getByTestId('stay-checkout-status')).toContainText('Checked out: stay');
});

async function stayIdFromStatus(page: Page): Promise<string> {
  // The check-in status reads "Checked in: stay {stayId} in room …".
  const text = (await page.getByTestId('stay-checkin-status').textContent()) ?? '';
  const match = /stay (\S+) in room/.exec(text);
  if (!match) {
    throw new Error(`cannot read the stay id from: ${text}`);
  }
  return match[1];
}
