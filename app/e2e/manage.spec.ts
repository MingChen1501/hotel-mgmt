// Browser flow for the rooms and rates management desk screen
// (Refs #590, `MR-1` browser half; traceability
// `docs/testing/rooms-rates-management-test-traceability.md`).
//
// The spec drives the screen the way a manager meets it: the Manage
// tab, one new room type, one new room on a floor, a floor move, and
// a nightly price range that has no plan yet (the explicit create
// action is the only plan write). Every write is read back through
// the same API the desk uses, so the stored state is proven after the
// click — and `QuotePrice` then quotes the type for those dates,
// which is acceptance criterion 4.
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { installLoopbackGuard } from './loopback-guard';
import { apiOp, ownerToken, signInThroughGate, stayWindow } from './desk-flow';

let guard!: ReturnType<typeof installLoopbackGuard>;

test.beforeEach(async ({ page }) => {
  guard = installLoopbackGuard(page);
});

test.afterEach(() => {
  guard.assertClean();
});

// The desk date pickers render the app-locale form; the default
// browser-e2e locale is EN (`mm/dd/yyyy`), and payloads stay ISO.
function deskDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${month}/${day}/${year}`;
}

function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year as number, (month as number) - 1, day as number);
  date.setDate(date.getDate() + days);
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function uniqueSuffix(): string {
  return randomUUID().replace(/[^a-z0-9]/g, '').slice(0, 6);
}

async function fillDate(page: Page, testid: string, iso: string): Promise<void> {
  const field = page.getByTestId(testid);
  await field.fill(deskDate(iso));
  await field.press('Tab');
}

test('manage tab: create a type, add and move a room, and price a range', async ({ page, request }) => {
  const token = await ownerToken(request);
  const suffix = uniqueSuffix();
  const typeName = `Browser ${suffix}`;
  const roomNumber = `9${suffix.slice(0, 3)}`;
  const plan = `Plan ${suffix}`;
  // A future window on the hotel calendar: three nights, each one a
  // separate nightly price row.
  const window = stayWindow(30, 3);
  const firstNight = window.arrival;
  const lastNight = addDays(firstNight, 2);

  await signInThroughGate(page);
  await page.goto('/app/manage');
  await expect(page.getByTestId('manage-view')).toBeVisible();
  await expect(page.getByTestId('manage-types')).toBeVisible();
  await expect(page.getByTestId('manage-rooms')).toBeVisible();
  await expect(page.getByTestId('manage-rates')).toBeVisible();

  // The tab sits immediately after Rooms (owner decision O-1); the
  // read-only booking register adds the ninth tab after Book (#648).
  const tabs = page.locator('[data-testid^="shell-nav-"]');
  await expect(tabs).toHaveCount(9);
  await expect(page.getByTestId('shell-nav-manage')).toHaveText('Manage');
  await expect(page.getByTestId('shell-nav-manage')).toHaveClass(/shell-nav-active/);

  // Section A: create a room type.
  await page.getByTestId('manage-type-name').fill(typeName);
  await page.getByTestId('manage-type-capacity').fill('2');
  await page.getByTestId('manage-type-bed').selectOption('twin');
  await page.getByTestId('manage-type-save').click();
  await expect(page.getByTestId('manage-type-success')).toHaveText(`Saved ${typeName}.`);

  const listed = await apiOp(request, 'rooms', 'ListRoomTypes', {}, token);
  const roomTypes = (listed.roomTypes ?? []) as Array<{ id: string; name: string; capacity?: number }>;
  const created = roomTypes.find((type) => type.name === typeName);
  expect(created, 'the type persisted through ListRoomTypes').toBeDefined();
  expect(created?.capacity).toBe(2);
  const roomTypeId = created?.id as string;

  // Section B: add a room on a floor, then move it to another floor.
  await page.getByTestId('manage-room-number').fill(roomNumber);
  await page.getByTestId('manage-room-type').selectOption({ label: typeName });
  await page.getByTestId('manage-room-floor').fill('7');
  await page.getByTestId('manage-room-save').click();
  await expect(page.getByTestId('manage-room-success')).toHaveText(`Saved room ${roomNumber}.`);
  await expect(page.getByTestId(`manage-room-floor-${roomNumber}`)).toHaveValue('7');

  await page.getByTestId(`manage-room-floor-${roomNumber}`).fill('8');
  await page.getByTestId(`manage-room-save-${roomNumber}`).click();
  await expect(page.getByTestId(`manage-room-floor-${roomNumber}`)).toHaveValue('8');
  // The read-back comes from the five state reads.
  const inspected = await apiOp(request, 'rooms', 'ListRoomsByState', { state: 'vacant-inspected' }, token);
  const moved = ((inspected.rooms ?? []) as Array<{ number: string; floor?: string }>)
    .find((room) => room.number === roomNumber);
  expect(moved, 'the room persisted through ListRoomsByState').toBeDefined();
  expect(moved?.floor).toBe('8');

  // Section C: read the range with no plan yet, write it through the
  // explicit create action, and prove the quote afterwards.
  await page.getByTestId('manage-rate-type').selectOption({ label: typeName });
  await page.getByTestId('manage-rate-plan').fill(plan);
  await fillDate(page, 'manage-rate-from', firstNight);
  await fillDate(page, 'manage-rate-to', lastNight);
  await page.getByTestId('manage-rate-read').click();
  // The first read names the unknown plan (the only signal that it
  // does not exist) and offers the explicit create action. The read
  // itself creates nothing.
  await expect(page.getByTestId('manage-rate-plan-read-missing')).toBeVisible();

  await page.getByTestId('manage-rate-amount').fill('1200000');
  await page.getByTestId('manage-rate-save').click();
  await expect(page.getByTestId('manage-rate-plan-missing')).toBeVisible();
  await page.getByTestId('manage-rate-plan-create').click();
  await expect(page.getByTestId('manage-rates-success')).toHaveText(`Saved 3 nights for ${typeName}.`);
  // The grid re-reads the saved range: every night carries the price.
  for (const night of [firstNight, addDays(firstNight, 1), lastNight]) {
    await expect(page.getByTestId(`manage-rate-amount-${night}`)).toContainText(/1[.,]200[.,]000 đ/);
  }

  // A different future range on the same plan has no price at all:
  // the screen states the type is not open for booking and invents no
  // price.
  const emptyFrom = addDays(firstNight, 120);
  const emptyTo = addDays(emptyFrom, 1);
  await fillDate(page, 'manage-rate-from', emptyFrom);
  await fillDate(page, 'manage-rate-to', emptyTo);
  await page.getByTestId('manage-rate-read').click();
  await expect(page.getByTestId('manage-rate-empty')).toContainText('not open for booking');

  // One nightly row per night, and the desk can quote the type for
  // those dates (acceptance criterion 4).
  for (const night of [firstNight, addDays(firstNight, 1), lastNight]) {
    const quote = await apiOp(request, 'rates', 'QuotePrice', {
      roomTypeId,
      arrivalDate: night,
      departureDate: addDays(night, 1),
      ratePlanName: plan,
    }, token);
    expect(quote.totalMinor).toBe(120000000);
  }
});
