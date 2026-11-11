// Browser flow for the read-only booking register desk screen
// (Refs #648, `BM13`; traceability
// `docs/testing/booking-management-view-test-traceability.md`).
//
// The spec drives the screen the way desk staff meet it: a booking is
// created through the public contract, the register finds it again on
// `/app/bookings` with its guest, room type, dates, and quoted total,
// and selecting the row re-reads the same booking through
// `GetReservation`. The far-future range proves the plain empty
// sentence, route interception proves the plain read-failure wording
// with a usable retry, and the tab row proves the ninth tab, its
// label, position after `Book`, and active pill.
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installLoopbackGuard } from './loopback-guard';
import {
  apiOp,
  deskDateField,
  ownerToken,
  setupFlowContext,
  signInThroughGate,
  stayWindow,
  todayLocal,
} from './desk-flow';

let guard!: ReturnType<typeof installLoopbackGuard>;

test.beforeEach(async ({ page }) => {
  guard = installLoopbackGuard(page);
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  guard.assertClean();
});

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  date.setDate(date.getDate() + days);
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The desk money form (`formatVnd`): locale grouping, no decimals, `đ`.
function money(minor: number): string {
  return `${new Intl.NumberFormat('en', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100)} đ`;
}

async function applyRange(page: Page, from: string, to: string): Promise<void> {
  await page.getByTestId('bookings-range-from').fill(deskDateField(from));
  await page.getByTestId('bookings-range-from').press('Tab');
  await page.getByTestId('bookings-range-to').fill(deskDateField(to));
  await page.getByTestId('bookings-range-to').press('Tab');
  await page.getByTestId('bookings-show').click();
}

test('bookings tab: a created booking is found again and its row opens the read-back', async ({
  page,
  request,
}) => {
  const token = await ownerToken(request);
  const window = stayWindow(30, 2);
  const ctx = await setupFlowContext(request, token, 'bookings', window);
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
    guest: { guestId: ctx.guestId, fullName: ctx.guestName, idDocument: 'UI-BOOKINGS-1' },
    sellableUnits: sellable.sellableCount,
    priceBasis: { totalMinor: quote.totalMinor },
    idempotencyKey: randomUUID(),
    actor: 'browser-e2e',
  }, token);
  expect(booking.state, 'the created booking is confirmed').toBe('confirmed');

  await signInThroughGate(page);
  await page.goto('/app/bookings');
  await expect(page.getByTestId('bookings-view')).toBeVisible();
  await expect(page.getByTestId('bookings-title')).toHaveText('Bookings');

  // The ninth tab, immediately after Book, with the active pill.
  const tabs = page.locator('[data-testid^="shell-nav-"]');
  await expect(tabs).toHaveCount(9);
  const labels = await tabs.allTextContents();
  expect(labels[labels.indexOf('Book') + 1]).toBe('Bookings');
  await expect(page.getByTestId('shell-nav-bookings')).toHaveClass(/shell-nav-active/);
  await expect(page.getByTestId('shell-nav-bookings')).toHaveAttribute('href', '/app/bookings');

  // Apply the booking's window (the default range is the business
  // date plus six nights).
  await applyRange(page, window.arrival, window.departure);
  const row = page.getByTestId('bookings-row').filter({ hasText: ctx.guestName });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('bookings-row-ref')).toHaveText(booking.reservationRef as string);
  await expect(row.getByTestId('bookings-row-room-type')).toHaveText(ctx.roomTypeName);
  // A confirmed booking holds a type, not a room.
  await expect(row.getByTestId('bookings-row-room')).toHaveText('—');
  await expect(row.getByTestId('bookings-row-arrival')).toHaveText(deskDateField(window.arrival));
  await expect(row.getByTestId('bookings-row-departure')).toHaveText(deskDateField(window.departure));
  await expect(row.getByTestId('bookings-row-nights')).toHaveText('2');
  await expect(row.getByTestId('bookings-row-total')).toHaveText(money(Number(quote.totalMinor)));
  await expect(row.getByTestId('bookings-row-state')).toHaveText('Booked');

  // Selecting the row reads the same booking back.
  await row.getByTestId('bookings-row-open').click();
  const detail = page.getByTestId('bookings-detail');
  await expect(detail).toBeVisible();
  await expect(page.getByTestId('bookings-detail-ref')).toHaveText(
    `Booking reference: ${booking.reservationRef}`,
  );
  await expect(page.getByTestId('bookings-detail-guest')).toHaveText(ctx.guestName);
  await expect(page.getByTestId('bookings-detail-room-type')).toHaveText(ctx.roomTypeName);
  await expect(page.getByTestId('bookings-detail-room')).toHaveText('—');
  await expect(page.getByTestId('bookings-detail-arrival')).toHaveText(deskDateField(window.arrival));
  await expect(page.getByTestId('bookings-detail-departure')).toHaveText(deskDateField(window.departure));
  await expect(page.getByTestId('bookings-detail-nights')).toHaveText('Nights: 2');
  await expect(page.getByTestId('bookings-detail-total')).toHaveText(
    `Total: ${money(Number(quote.totalMinor))}`,
  );
  await expect(page.getByTestId('bookings-detail-state')).toHaveText('Booked');
  // The detail is read-only.
  await expect(detail.locator('button')).toHaveCount(0);

  // An empty range is one plain sentence naming the range.
  const farFrom = addDays(todayLocal(), 400);
  await applyRange(page, farFrom, addDays(farFrom, 6));
  await expect(page.getByTestId('bookings-empty')).toContainText('No booking stays between');
  await expect(page.getByTestId('bookings-empty')).toContainText(deskDateField(farFrom));
  await expect(page.getByTestId('bookings-row')).toHaveCount(0);

  // A failed list read renders plain catalogue words with a usable
  // retry (route interception, so the wording is proven in the
  // browser and not only in jsdom).
  await page.route('**/v1/reservations/QueryCalendar', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'INTERNAL', message: 'intercepted failure' }),
    }),
  );
  await applyRange(page, window.arrival, window.departure);
  await expect(page.getByTestId('bookings-list-error')).toContainText(
    'Could not read the booking register.',
  );
  await expect(page.getByTestId('bookings-list-error')).not.toContainText('INTERNAL');
  await expect(page.getByTestId('bookings-row')).toHaveCount(0);
  await page.unroute('**/v1/reservations/QueryCalendar');
  await page.getByTestId('bookings-retry').click();
  await expect(page.getByTestId('bookings-row').filter({ hasText: ctx.guestName })).toHaveCount(1);
});
