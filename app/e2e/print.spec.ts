// Browser print flow (plan §1 flow 5, #338 M6).
//
// The invoice renders with the folio lines and total, each payment
// yields a matching receipt, the confirmation loads by reference,
// and an unknown folio shows the not-found state instead of a
// blank page. Print isolation (one document at a time, screen
// styles out of print) stays pinned at the SFC source in the unit
// suite; here the documents prove themselves against the folio.
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

test('invoice, receipt, and confirmation match the folio', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(0, 2);
  const ctx = await setupFlowContext(request, token, 'print', window);
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
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument: 'UI-PRINT-1' },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  const reservationRef = booking.reservationRef as string;
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
  await apiOp(request, 'billing', 'PostCharge', {
    stayId,
    itemKind: 'nightly-room-charge',
    itemName: 'Room charge',
    amountMinor: 120000,
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  await apiOp(request, 'billing', 'RecordPayment', {
    stayId,
    method: 'cash',
    amountMinor: 60000,
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);

  await signInThroughGate(page);
  await page.goto('/app/print');
  await page.getByTestId('print-stay-id').fill(stayId);
  await page.getByTestId('print-open').click();
  await expect(page.getByTestId('print-folio-status')).toContainText('balance 600.00');

  // Invoice lines and total equal the folio on screen.
  await page.getByTestId('print-invoice').click();
  const invoice = page.getByTestId('print-invoice-document');
  await expect(invoice).toBeVisible();
  await expect(invoice).toContainText('Room charge');
  await expect(invoice).toContainText('cash payment');
  await expect(invoice).toContainText('600.00');
  await expect(invoice).toHaveClass(/print-document/);

  // One receipt per payment, matching the recorded cash payment.
  await expect(page.getByTestId('print-payment-list')).toContainText('cash payment');
  await page.getByTestId('print-payment-list').getByRole('button', { name: 'Receipt' }).click();
  const receipt = page.getByTestId('print-receipt-document');
  await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('cash');
  await expect(receipt).toContainText('600.00');

  // The confirmation loads by booking reference.
  await page.getByTestId('print-ref').fill(reservationRef);
  await page.getByTestId('print-load').click();
  const confirmation = page.getByTestId('print-confirmation-document');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toContainText(reservationRef);
  await expect(confirmation).toContainText(ctx.guestName);

  // The Print button issues the print without leaving the screen.
  await page.getByTestId('print-invoice-print').click();
  await expect(page).toHaveURL(/\/app\/print/);
  await expect(page.getByTestId('print-invoice-document')).toBeVisible();

  // Print isolation (plan §1 flow 5): under print media only the
  // active document survives — the folio table and every other
  // screen section drop out, without ever hiding the active
  // document's ancestors. The class flip is the same synchronous
  // step the Print button performs before window.print().
  await page.getByTestId('print-invoice-document').evaluate((el) => el.classList.add('active'));
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByTestId('print-invoice-document')).toBeVisible();
  await expect(page.getByTestId('print-folio-table')).toBeHidden();
  await expect(page.getByTestId('print-open')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByTestId('print-invoice-document').evaluate((el) => el.classList.remove('active'));
});

test('unknown booking reference shows the not-found state', async ({ page, request }) => {
  await ownerToken(request);
  await signInThroughGate(page);
  await page.goto('/app/print');
  await page.getByTestId('print-ref').fill('RSV-NOSUCHREF');
  await page.getByTestId('print-load').click();
  await expect(page.getByTestId('print-load-error')).toContainText('Unknown booking reference');
  await expect(page.getByTestId('print-confirmation-document')).toHaveCount(0);
});

test('unknown folio shows the refusal state, not a blank page', async ({ page, request }) => {
  await ownerToken(request);
  await signInThroughGate(page);
  await page.goto('/app/print');
  // A stay id outside UUID shape never reaches a folio: billing
  // answers VALIDATION_FAILED and the refusal names the missing
  // folio in plain words instead of a blank page.
  await page.getByTestId('print-stay-id').fill('not-a-stay-id');
  await page.getByTestId('print-open').click();
  await expect(page.getByTestId('print-open-error')).toContainText('No folio for that stay');
  await expect(page.getByTestId('print-invoice-document')).toHaveCount(0);
});
