// Browser folio flow (plan section 1 flow 4, #338 M6).
//
// Open a stay folio, post room + extra charges, record a cash
// payment: every line and the running balance on screen agree with
// a direct GetFolioBalance read — plus the undefined-item refusal
// in plain words.
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installLoopbackGuard } from './loopback-guard';
import {
  apiOp,
  ownerToken,
  todayLocal,
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

test('charge, pay, and agree with the folio balance', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(0, 2);
  const ctx = await setupFlowContext(request, token, 'folio', window);
  const today = todayLocal();
  // API-side booking + check-in for tonight (mirrors
  // script/e2e-desk-loop.sh); the UI drives charge and pay.
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
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument: 'UI-FOLIO-1' },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  const stayId = randomUUID();
  await apiOp(request, 'rooms', 'AssignRoom', {
    roomNumber: ctx.roomNumbers[0],
    businessDate: today,
    stayLink: stayId,
    actor: 'browser-e2e',
  }, token);
  await apiOp(request, 'stay', 'CheckIn', {
    stayId,
    reservationId: booking.reservationId,
    guestId: ctx.guestId,
    roomId: ctx.roomIds[0],
    actor: 'browser-e2e',
  }, token);
  await apiOp(request, 'reservations', 'CheckInReservation', {
    reservationRef: booking.reservationRef,
    stayId,
    actor: 'browser-e2e',
  }, token);
  const extraName = `UI Breakfast ${Date.now().toString(36)}`;
  await apiOp(request, 'billing', 'UpsertChargeItem', {
    name: extraName,
    priceMinor: 2500,
    actor: 'browser-e2e',
  }, token);

  await signInThroughGate(page);
  await page.goto('/app/folio');
  await page.getByTestId('folio-stay-id').fill(stayId);
  await page.getByTestId('folio-open').click();
  await expect(page.getByTestId('folio-status')).toContainText('balance: 0 đ');

  await page.getByTestId('folio-charge-kind').selectOption('nightly-room-charge');
  await page.getByTestId('folio-charge-name').fill('Room charge');
  await page.getByTestId('folio-charge-amount').fill('1200');
  await page.getByTestId('folio-charge').click();
  await expect(page.getByTestId('folio-charge-status')).toContainText('Posted Room charge');

  await page.getByTestId('folio-charge-kind').selectOption('charge-item');
  await page.getByTestId('folio-charge-name').fill(extraName);
  await page.getByTestId('folio-charge-amount').fill('25');
  await page.getByTestId('folio-charge').click();
  await expect(page.getByTestId('folio-charge-status')).toContainText(`Posted ${extraName}`);

  await page.getByTestId('folio-payment-method').selectOption('cash');
  await page.getByTestId('folio-payment-amount').fill('600');
  await page.getByTestId('folio-pay').click();
  await expect(page.getByTestId('folio-payment-status')).toContainText('cash payment');

  // Screen-vs-API agreement: every line and the running balance
  // match a direct GetFolioBalance read.
  const folio = await apiOp(request, 'billing', 'GetFolioBalance', { stayId, actor: 'browser-e2e' }, token);
  // The API carries minor units (625.00 major); the desk renders
  // the design VND shape with no decimals and the `đ` suffix
  // (Refs #565, G-FO-2).
  expect(folio.balanceMinor).toBe(62500);
  await expect(page.getByTestId('folio-status')).toContainText('balance: 625 đ');
  await expect(page.getByTestId('folio-balance')).toHaveText('625 đ');
  const charges = await page.getByTestId('folio-charge-lines').textContent();
  expect(charges).toContain('Room charge');
  expect(charges).toContain(extraName);
  const payments = await page.getByTestId('folio-payment-lines').textContent();
  expect(payments).toContain('Cash payment');

  // The charges card names the open folio's guest and room like the
  // board (`Khoản phí · Lê Minh · P.201`, `docs/design/Folio.dc.html:3`,
  // Refs #568); the raw stay/folio IDs stay behind the reference
  // disclosure (issue #372).
  const title = page.getByTestId('folio-charges-title');
  await expect(title).toContainText(ctx.guestName);
  await expect(title).toContainText(`Room ${ctx.roomNumbers[0]}`);
  await expect(title).not.toContainText(stayId);
});

test('undefined charge item is refused with the cause named', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(0, 2);
  const ctx = await setupFlowContext(request, token, 'folioref', window);
  const today = todayLocal();
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
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument: 'UI-FOLIO-2' },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  const stayId = randomUUID();
  await apiOp(request, 'rooms', 'AssignRoom', {
    roomNumber: ctx.roomNumbers[0],
    businessDate: today,
    stayLink: stayId,
    actor: 'browser-e2e',
  }, token);
  await apiOp(request, 'stay', 'CheckIn', {
    stayId,
    reservationId: booking.reservationId,
    guestId: ctx.guestId,
    roomId: ctx.roomIds[0],
    actor: 'browser-e2e',
  }, token);

  await signInThroughGate(page);
  await page.goto('/app/folio');
  await page.getByTestId('folio-stay-id').fill(stayId);
  await page.getByTestId('folio-open').click();
  await expect(page.getByTestId('folio-status')).toContainText('balance: 0 đ');
  await page.getByTestId('folio-charge-kind').selectOption('charge-item');
  await page.getByTestId('folio-charge-name').fill('No Such Item Anywhere');
  await page.getByTestId('folio-charge-amount').fill('10');
  await page.getByTestId('folio-charge').click();
  await expect(page.getByTestId('folio-charge-error')).toContainText('not on the hotel list');
  await expect(page.getByTestId('folio-charge-error')).toContainText('No Such Item Anywhere');
});

test('bad payment method is refused on screen', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(0, 2);
  const ctx = await setupFlowContext(request, token, 'pay', window);
  const today = todayLocal();
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
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument: 'UI-FOLIO-3' },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  const stayId = randomUUID();
  await apiOp(request, 'rooms', 'AssignRoom', {
    roomNumber: ctx.roomNumbers[0],
    businessDate: today,
    stayLink: stayId,
    actor: 'browser-e2e',
  }, token);
  await apiOp(request, 'stay', 'CheckIn', {
    stayId,
    reservationId: booking.reservationId,
    guestId: ctx.guestId,
    roomId: ctx.roomIds[0],
    actor: 'browser-e2e',
  }, token);

  await signInThroughGate(page);
  await page.goto('/app/folio');
  await page.getByTestId('folio-stay-id').fill(stayId);
  await page.getByTestId('folio-open').click();
  await expect(page.getByTestId('folio-status')).toContainText('balance: 0 đ');
  // The method picker offers only cash/card, so the bad method
  // travels the way a mistyped desk integration would: force the
  // bound value, then pay. Billing answers VALIDATION_FAILED and
  // the refusal names the accepted methods in plain words, with the
  // balance untouched.
  await page.$eval('#folio-payment-method', (el) => {
    const select = el as HTMLSelectElement;
    select.value = 'voucher';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.getByTestId('folio-payment-amount').fill('100');
  await page.getByTestId('folio-pay').click();
  await expect(page.getByTestId('folio-payment-error')).toContainText('not accepted');
  await expect(page.getByTestId('folio-payment-error')).toContainText('cash or card');
  await expect(page.getByTestId('folio-status')).toContainText('balance: 0 đ');
});
