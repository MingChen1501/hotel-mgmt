// Browser book flow (plan §1 flow 2, #338 M6).
//
// Quote-then-confirm on the restyled book screen: a walk-in
// registration, a priced quote with nightly lines and a total, and
// a confirmed booking with a readable reference — plus the two key
// refusal paths (unpriced dates, sold-out second booking), each in
// plain words.
import { expect, test, type Page } from '@playwright/test';
import { installLoopbackGuard } from './loopback-guard';
import {
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

async function bookOnce(
  page: Page,
  guestName: string,
  arrival: string,
  departure: string,
  roomTypeId: string,
  ratePlan: string,
): Promise<void> {
  await page.getByTestId('book-guest-name').fill(guestName);
  await page.getByTestId('book-register-guest').click();
  await expect(page.getByTestId('book-guest-status')).toContainText('registered');
  await page.getByTestId('book-arrival-date').fill(arrival);
  await page.getByTestId('book-departure-date').fill(departure);
  await page.getByTestId('book-room-type-id').fill(roomTypeId);
  await page.getByTestId('book-rate-plan').fill(ratePlan);
  await page.getByTestId('book-quote').click();
  await expect(page.getByTestId('book-quote-section')).toBeVisible();
}

test('walk-in booking quotes and confirms with a readable reference', async ({
  page,
  request,
}) => {
  const token = await ownerToken(request);
  const window = stayWindow(30, 2);
  const ctx = await setupFlowContext(request, token, 'book', window);
  await signInThroughGate(page);
  await page.goto('/app/book');
  await bookOnce(page, ctx.guestName, window.arrival, window.departure, ctx.roomTypeId, ctx.ratePlan);
  await expect(page.getByTestId('book-quote-total')).toContainText('2400');
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-result')).toBeVisible();
  await expect(page.getByTestId('book-booking-reference')).toContainText('Booking reference:');
  await expect(page.getByTestId('book-booking-readback')).toContainText(ctx.guestName);
  await expect(page.getByTestId('book-confirmation-body')).toContainText('reference');
});

test('unpriced dates refuse the quote in plain words', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(30, 2);
  const ctx = await setupFlowContext(request, token, 'bookref', window);
  await signInThroughGate(page);
  await page.goto('/app/book');
  await page.getByTestId('book-arrival-date').fill('2031-01-01');
  await page.getByTestId('book-departure-date').fill('2031-01-03');
  await page.getByTestId('book-room-type-id').fill(ctx.roomTypeId);
  await page.getByTestId('book-quote').click();
  await expect(page.getByTestId('book-quote-error')).toContainText('No price exists');
});

test('second overlapping booking is refused as sold out', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(34, 2);
  // A single room: the first confirm takes the last sellable unit,
  // so the second overlapping confirm is refused (NFR-CON-1).
  const ctx = await setupFlowContext(request, token, 'booksold', window, 1);
  await signInThroughGate(page);
  await page.goto('/app/book');
  // A single room: the first confirm takes the last sellable
  // unit, so the second overlapping confirm is refused.
  await bookOnce(page, ctx.guestName, window.arrival, window.departure, ctx.roomTypeId, ctx.ratePlan);
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-result')).toBeVisible();
  await page.getByTestId('book-new-booking').click();
  await bookOnce(page, ctx.guestName, window.arrival, window.departure, ctx.roomTypeId, ctx.ratePlan);
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-confirm-error')).toContainText('No rooms of this type are free');
});

test('confirm without a guest names the missing guest first', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(40, 2);
  const ctx = await setupFlowContext(request, token, 'booknoguest', window);
  await signInThroughGate(page);
  await page.goto('/app/book');
  // A priced quote with no guest resolved: the confirm must name
  // the missing mandatory guest (FR-CUS-1) instead of booking.
  await page.getByTestId('book-arrival-date').fill(window.arrival);
  await page.getByTestId('book-departure-date').fill(window.departure);
  await page.getByTestId('book-room-type-id').fill(ctx.roomTypeId);
  await page.getByTestId('book-rate-plan').fill(ctx.ratePlan);
  await page.getByTestId('book-quote').click();
  await expect(page.getByTestId('book-quote-section')).toBeVisible();
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-confirm-error')).toContainText('Find or register the guest first');
  await expect(page.getByTestId('book-result')).toHaveCount(0);
});

test('restriction refusal names the restriction on screen', async ({ page, request }) => {
  const token = await ownerToken(request);
  const window = stayWindow(44, 2);
  const ctx = await setupFlowContext(request, token, 'bookrestr', window);
  await signInThroughGate(page);
  await page.goto('/app/book');
  await bookOnce(page, ctx.guestName, window.arrival, window.departure, ctx.roomTypeId, ctx.ratePlan);
  // Server-side stay-restriction enforcement (the reservations
  // CheckRestrictionsHook) is not wired yet, so the documented
  // STATE_ILLEGAL envelope (contracts/http/CreateReservation.json,
  // FR-RTE-4) is simulated at the contract boundary. The mapping
  // under test is still the real view code: the refusal must name
  // the restriction, never a generic failure.
  await page.route('**/v1/reservations/CreateReservation', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'STATE_ILLEGAL',
        message: 'stay restriction violated',
        details: { restriction: 'closed-to-arrival' },
        traceId: 'browser-e2e',
      }),
    }),
  );
  await page.getByTestId('book-confirm').click();
  await expect(page.getByTestId('book-confirm-error')).toContainText('booking rule');
  await expect(page.getByTestId('book-confirm-error')).toContainText('closed-to-arrival');
});
