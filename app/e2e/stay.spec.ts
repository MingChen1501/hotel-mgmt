// Browser stay flow (plan section 1 flow 3, #338 M6).
//
// Arrival pick, check-in, mid-stay move, time recording, and
// check-out behind the folio gate: the open-balance refusal reads
// in plain words, an approval is recorded, and check-out closes
// through the confirm dialog.
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installLoopbackGuard } from './loopback-guard';
import {
  apiOp,
  ownerToken,
  setupFlowContext,
  signInThroughGate,
  stayWindow,
  todayLocal,
  type FlowContext,
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
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Booked: ${ctx.roomTypeName}.`);
  await page.getByTestId('stay-checkin-room').selectOption({ label: ctx.roomNumbers[0] });
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Checked in for booking ${reservationRef} in room ${ctx.roomNumbers[0]}`);

  // Move mid-stay to the second ready room.
  const inHouseRow = page
    .getByTestId('stay-inhouse-table')
    .getByRole('row', { name: new RegExp(ctx.guestName) });
  await inHouseRow.getByRole('button', { name: 'Use this stay' }).click();
  await expect(page.getByTestId('stay-move-status')).toContainText(`Working with ${ctx.guestName}`);
  await page.getByTestId('stay-move-room').selectOption({ label: ctx.roomNumbers[1] });
  await page.getByTestId('stay-move').click();
  await expect(page.getByTestId('stay-move-status')).toContainText(`to room ${ctx.roomNumbers[1]}`);

  // Record the early arrival; the kept values stay visible.
  await page.getByTestId('stay-times-arrival').fill(`${window.arrival}T05:30`);
  await page.getByTestId('stay-times-departure').fill(`${window.departure}T18:45`);
  await page.getByTestId('stay-times').click();
  await expect(page.getByTestId('stay-times-status')).toContainText('kept');
  await expect(page.getByTestId('stay-times-status')).toContainText('Arrived');
  await expect(page.getByTestId('stay-times-status')).toContainText('leaving');

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

test('move to a taken room is refused with the cause named', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(1, 2);
  const ctx = await setupFlowContext(request, token, 'take', window);
  const stayA = await checkInStay(request, token, ctx, 'UI-TAKEN-A');

  await signInThroughGate(page);
  await page.goto('/app/stay');
  await page.getByTestId('stay-move-stay-id').fill(stayA);
  await page.getByTestId('stay-move-room').selectOption({ label: ctx.roomNumbers[1] });
  // Occupy the target only after the picker rendered it as ready:
  // the desk move then races the taken room and the AssignRoom
  // CONFLICT must surface naming the cause.
  await apiOp(request, 'rooms', 'AssignRoom', {
    roomNumber: ctx.roomNumbers[1],
    businessDate: todayLocal(),
    stayLink: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  await page.getByTestId('stay-move').click();
  await expect(page.getByTestId('stay-move-error')).toContainText('just taken');
});

test('closing an already-closed stay is refused on screen', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(2, 2);
  const ctx = await setupFlowContext(request, token, 'dbl', window);
  const stayId = await checkInStay(request, token, ctx, 'UI-DOUBLE-1');

  await signInThroughGate(page);
  await page.goto('/app/stay');
  // First close through the dialog, with no open balance so no
  // approval is needed.
  await page.getByTestId('stay-checkout-stay-id').fill(stayId);
  await page.getByTestId('stay-review').click();
  await expect(page.getByTestId('stay-checkout-status')).toContainText('balance is zero');
  await page.getByTestId('stay-checkout').click();
  await page.getByTestId('stay-checkout-confirm').click();
  await expect(page.getByTestId('stay-checkout-status')).toContainText(`Checked out for ${ctx.guestName}`);
  // The second close of the same stay is refused STATE_ILLEGAL by
  // the stay service: the refusal names the already-closed stay in
  // plain words instead of a silent accept or a raw envelope.
  await page.getByTestId('stay-checkout-stay-id').fill(stayId);
  await page.getByTestId('stay-review').click();
  await page.getByTestId('stay-checkout').click();
  await page.getByTestId('stay-checkout-confirm').click();
  await expect(page.getByTestId('stay-checkout-error')).toContainText('already checked out');
});

async function checkInStay(
  request: APIRequestContext,
  token: string,
  ctx: FlowContext,
  idDoc: string,
  roomIndex = 0,
): Promise<string> {
  const today = todayLocal();
  const quote = await apiOp(request, 'rates', 'QuotePrice', {
    roomTypeId: ctx.roomTypeId,
    arrivalDate: ctx.window.arrival,
    departureDate: ctx.window.departure,
    ratePlanName: ctx.ratePlan,
  }, token);
  const sellable = await apiOp(request, 'rooms', 'CheckRoomTypeSellability', {
    roomType: ctx.roomTypeId,
    dateFrom: ctx.window.arrival,
    dateTo: ctx.window.departure,
  }, token);
  const booking = await apiOp(request, 'reservations', 'CreateReservation', {
    roomTypeId: ctx.roomTypeId,
    arrivalDate: ctx.window.arrival,
    departureDate: ctx.window.departure,
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument: idDoc },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  const stayId = randomUUID();
  await apiOp(request, 'rooms', 'AssignRoom', {
    roomNumber: ctx.roomNumbers[roomIndex],
    businessDate: today,
    stayLink: stayId,
    actor: 'browser-e2e',
  }, token);
  await apiOp(request, 'stay', 'CheckIn', {
    stayId,
    reservationId: booking.reservationId,
    guestId: ctx.guestId,
    roomId: ctx.roomIds[roomIndex],
    actor: 'browser-e2e',
  }, token);
  await apiOp(request, 'reservations', 'CheckInReservation', {
    reservationRef: booking.reservationRef,
    stayId,
    actor: 'browser-e2e',
  }, token);
  return stayId;
}

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
