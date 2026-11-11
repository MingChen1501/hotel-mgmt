// Browser stay flow (plan section 1 flow 3, #338 M6; v2 board
// rebuild Refs #541).
//
// Arrival-select check-in and departing-select check-out behind
// the folio gate: the open-balance refusal reads in plain words,
// an approval is recorded, check-out closes through the confirm
// dialog, and the committed close releases the departed room so the
// board reads it vacant (Refs #588, `AC-DSK-18`).
import { expect, test, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installLoopbackGuard } from './loopback-guard';
import {
  apiOp,
  ownerToken,
  setupFlowContext,
  signInThroughGate,
  stayWindow,
  type FlowContext,
} from './desk-flow';

let guard!: ReturnType<typeof installLoopbackGuard>;

test.beforeEach(async ({ page }) => {
  guard = installLoopbackGuard(page);
});

test.afterEach(() => {
  guard.assertClean();
});

// One API-side booking for tonight (mirrors
// `script/e2e-desk-loop.sh`): the UI drives everything from check-in
// on. Shared by the #647 switch scenarios.
async function bookArrival(
  request: APIRequestContext,
  token: string,
  ctx: FlowContext,
  idDocument: string,
): Promise<string> {
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
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  return booking.reservationRef as string;
}

test('check-in, unpaid refusal, approval, dialog check-out, and room release', async ({ page, request }) => {
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
  // styling pass). #586: the pick alone loads the booking and the
  // booked-type ready rooms into the picker; picking a room and
  // clicking Check in once commits the check-in.
  await page.getByTestId('stay-checkin-arrival').selectOption(reservationRef);
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Booked: ${ctx.roomTypeName}.`);
  await page.getByTestId('stay-checkin-room').selectOption({ label: ctx.roomNumbers[0] });
  await expect(page.getByTestId('stay-checkin-error')).toHaveCount(0);
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Checked in for booking ${reservationRef} in room ${ctx.roomNumbers[0]}`);

  // Check out by picking the departing stay (guest plus room).
  await page.getByTestId('stay-checkout-stay').selectOption({
    label: `${ctx.guestName} · ${ctx.roomNumbers[0]}`,
  });

  // The desk check-out posts the stay's room charge on its own (Refs
  // #600): the review resolves the stay's booking, reads its frozen
  // quoted total, and posts one nightly room charge, so the folio the
  // close presents carries the room it paid for. The open balance then
  // refuses check-out in plain words naming the approval next step.
  const stayId = await stayIdFromStatus(page);
  await page.getByTestId('stay-review').click();
  await expect(page.getByTestId('stay-folio-status')).toContainText('Folio balance:');
  await expect(page.getByTestId('stay-checkout-error')).toContainText('open balance');
  await expect(page.getByTestId('stay-approval-section')).toBeVisible();
  // The posted line is the booking's own quoted total, one charge for
  // the stay — never an amount the desk typed.
  const reviewedFolio = await apiOp(request, 'billing', 'GetFolioBalance', {
    stayId,
    actor: 'browser-e2e',
  }, token);
  const roomChargeLines = ((reviewedFolio.charges ?? []) as Array<{
    itemKind: string;
    itemName: string;
    amountMinor: number;
  }>).filter((line) => line.itemKind === 'nightly-room-charge');
  expect(roomChargeLines).toHaveLength(1);
  expect(roomChargeLines[0]?.amountMinor).toBe(Number(quote.totalMinor));
  expect(roomChargeLines[0]?.itemName).toBe(`Room ${ctx.roomNumbers[0]}`);
  // Every route to the close is gated (Refs #588, AC-DSK-18): the
  // unpaid reviewed folio leaves the Check out button disabled, so the
  // dialog cannot even open before an approval is recorded.
  await expect(page.getByTestId('stay-checkout')).toBeDisabled();

  // Record the approval, then close through the confirm dialog.
  await page.getByTestId('stay-approval-by').selectOption('manager');
  await page.getByTestId('stay-approval-role').selectOption('manager');
  await page.getByTestId('stay-approve').click();
  await expect(page.getByTestId('stay-checkout-status')).toContainText('Approved by manager (Manager) at');
  await page.getByTestId('stay-checkout').click();
  await expect(page.getByTestId('stay-checkout-dialog')).toContainText('Check out this stay now?');
  await page.getByTestId('stay-checkout-confirm').click();
  await expect(page.getByTestId('stay-checkout-status')).toContainText(`Checked out for ${ctx.guestName}`);
  // The close carries the invoice ref (FR-FDK-2, FR-BIL-4
  // presentation: the reviewed folio id is the invoice).
  await expect(page.getByTestId('stay-checkout-status')).toContainText('invoice');

  // Room release (Refs #588, AC-DSK-18, FR-CKO-1/FR-CKO-3): the
  // committed close releases the room it just vacated, so no surface
  // keeps showing it occupied without a manual desk reload.
  await expect(page.getByTestId('stay-room-release')).toContainText(
    `Room ${ctx.roomNumbers[0]} is now vacant and dirty.`,
  );
  const released = await apiOp(request, 'rooms', 'ListRoomsByState', { state: 'vacant-dirty' }, token);
  const dirtyNumbers = ((released.rooms ?? []) as Array<{ number: string }>).map((room) => room.number);
  expect(dirtyNumbers).toContain(ctx.roomNumbers[0]);
  // The desk lists the close re-read (#588, AC-DSK-18): the closed stay
  // has left the in-house list, the departing list keeps today's
  // checkout, and the departing select still offers it exactly once.
  const lists = await apiOp(request, 'stay', 'ListArrivalsDepartures', {
    businessDate: window.arrival,
  }, token);
  const stayIds = (rows: unknown): string[] =>
    ((rows ?? []) as Array<{ stayId: string }>).map((row) => row.stayId);
  expect(stayIds(lists.inHouse)).not.toContain(stayId);
  expect(stayIds(lists.departures)).toContain(stayId);
  const departingOption = page
    .getByTestId('stay-checkout-stay')
    .locator(`option[value="${stayId}"]`);
  await expect(departingOption).toHaveCount(1);
  await expect(departingOption).toHaveText(`${ctx.guestName} · ${ctx.roomNumbers[0]}`);
  // The Main board and the Rooms map read that state on their own load:
  // the room sits in the dirty lane, never the occupied one.
  await page.goto('/app/');
  await expect(
    page.getByTestId('desk-board-lane-dirty').getByTestId(`desk-board-cell-${ctx.roomNumbers[0]}`),
  ).toHaveCount(1);
  await expect(
    page.getByTestId('desk-board-lane-occupied').getByTestId(`desk-board-cell-${ctx.roomNumbers[0]}`),
  ).toHaveCount(0);
  await page.goto('/app/rooms');
  await expect(page.getByTestId(`rooms-card-chip-${ctx.roomNumbers[0]}`)).toContainText('Dirty');
});

// Refs #647 (`RR11`, `AC-REA-1`): switching the room after the
// arrival preload assigns only the room the guest is in. Room 101 is
// preloaded as a candidate, 102 is picked, and only 102 reads
// occupied — 101 stays ready because the preload assigns nothing.
test('switch after the arrival preload assigns only the room the guest is in', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(0, 2);
  const ctx = await setupFlowContext(request, token, 'rea-pre', window);
  const reservationRef = await bookArrival(request, token, ctx, 'UI-REA-PRE');
  const [first, second] = ctx.roomNumbers;

  await signInThroughGate(page);
  await page.goto('/app/stay');
  await page.getByTestId('stay-checkin-arrival').selectOption(reservationRef);
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Booked: ${ctx.roomTypeName}.`);
  // Preload the first candidate, then switch to the second before the
  // commit — the switch-after-preload case.
  await page.getByTestId('stay-checkin-room').selectOption({ label: first });
  await page.getByTestId('stay-checkin-room').selectOption({ label: second });
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText(
    `Checked in for booking ${reservationRef} in room ${second}`,
  );

  const occupied = await apiOp(request, 'rooms', 'ListRoomsByState', { state: 'occupied' }, token);
  const occupiedNumbers = ((occupied.rooms ?? []) as Array<{ number: string }>).map((room) => room.number);
  expect(occupiedNumbers).toContain(second);
  expect(occupiedNumbers).not.toContain(first);
  const ready = await apiOp(request, 'rooms', 'ListRoomsByState', { state: 'vacant-inspected' }, token);
  const readyNumbers = ((ready.rooms ?? []) as Array<{ number: string }>).map((room) => room.number);
  expect(readyNumbers).toContain(first);

  // The board and the Rooms map show only the room the guest is in.
  await page.goto('/app/');
  await expect(
    page.getByTestId('desk-board-lane-occupied').getByTestId(`desk-board-cell-${second}`),
  ).toHaveCount(1);
  await expect(
    page.getByTestId('desk-board-lane-occupied').getByTestId(`desk-board-cell-${first}`),
  ).toHaveCount(0);
  await page.goto('/app/rooms');
  await expect(page.getByTestId(`rooms-card-chip-${second}`)).toContainText('Occupied');
  await expect(page.getByTestId(`rooms-card-chip-${first}`)).toContainText('Ready');
});

// Refs #647 (`RR11`, `AC-REA-2`/`AC-REA-4`): the move card reassigns a
// committed check-in — assign the target, move the stay, release the
// vacated room to housekeeping — through the same single path a
// mid-stay move uses.
test('switch after a committed check-in releases the vacated room', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(0, 2);
  const ctx = await setupFlowContext(request, token, 'rea-commit', window);
  const reservationRef = await bookArrival(request, token, ctx, 'UI-REA-COMMIT');
  const [first, second] = ctx.roomNumbers;

  await signInThroughGate(page);
  await page.goto('/app/stay');
  await page.getByTestId('stay-checkin-arrival').selectOption(reservationRef);
  await expect(page.getByTestId('stay-checkin-status')).toContainText(`Booked: ${ctx.roomTypeName}.`);
  await page.getByTestId('stay-checkin-room').selectOption({ label: first });
  await page.getByTestId('stay-checkin').click();
  await expect(page.getByTestId('stay-checkin-status')).toContainText(
    `Checked in for booking ${reservationRef} in room ${first}`,
  );
  const stayId = await stayIdFromStatus(page);

  // Move the guest to the second ready room through the additive card.
  await page.getByTestId('stay-move-guest').selectOption({
    label: `${ctx.guestName} · ${first}`,
  });
  await page.getByTestId('stay-move-room').selectOption({ label: second });
  await page.getByTestId('stay-move').click();
  await expect(page.getByTestId('stay-move-status')).toContainText(
    `Moved ${ctx.guestName} from room ${first} to room ${second}`,
  );

  // The service read-backs: the stay names the new room and stays in
  // house; 102 is occupied and 101 is vacant and dirty.
  const stay = await apiOp(request, 'stay', 'GetStay', { stayId }, token);
  expect(stay.state).toBe('in-house');
  expect(stay.roomId).toBe(ctx.roomIds[1]);
  const occupied = await apiOp(request, 'rooms', 'ListRoomsByState', { state: 'occupied' }, token);
  const occupiedNumbers = ((occupied.rooms ?? []) as Array<{ number: string }>).map((room) => room.number);
  expect(occupiedNumbers).toContain(second);
  expect(occupiedNumbers).not.toContain(first);
  const dirty = await apiOp(request, 'rooms', 'ListRoomsByState', { state: 'vacant-dirty' }, token);
  const dirtyNumbers = ((dirty.rooms ?? []) as Array<{ number: string }>).map((room) => room.number);
  expect(dirtyNumbers).toContain(first);

  // The board and the Rooms map agree on their own load.
  await page.goto('/app/');
  await expect(
    page.getByTestId('desk-board-lane-occupied').getByTestId(`desk-board-cell-${second}`),
  ).toHaveCount(1);
  await expect(
    page.getByTestId('desk-board-lane-occupied').getByTestId(`desk-board-cell-${first}`),
  ).toHaveCount(0);
  await page.goto('/app/rooms');
  await expect(page.getByTestId(`rooms-card-chip-${second}`)).toContainText('Occupied');
  await expect(page.getByTestId(`rooms-card-chip-${first}`)).toContainText('Dirty');
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
