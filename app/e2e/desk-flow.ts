// Shared browser-E2E flow helpers (Refs #338 M6, plan
// docs/testing/browser-e2e-plan.md section 8 seed discipline).
//
// Every spec builds its own per-run entities (unique suffix) over
// the same fresh stack the API loop proves, so reruns and
// CI retries never collide. No spec writes to the seed files;
// hotel values come from the applied hotel config, dates derive
// from the business clock (today-relative), and UI assertions use
// the `data-testid` hooks (shell gate hooks `shell-*` after the
// #338 single-gate move).
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const ADMIN_IDENTITY = process.env.ADMIN_IDENTITY ?? 'owner';
export const ADMIN_SECRET = process.env.ADMIN_BOOT_SECRET ?? '';

export function requireSecret(): string {
  if (!ADMIN_SECRET) {
    throw new Error(
      'ADMIN_BOOT_SECRET is required for the browser desk flows (CI sets it per job; export it locally).',
    );
  }
  return ADMIN_SECRET;
}

export async function apiOp(
  request: APIRequestContext,
  contract: string,
  operation: string,
  payload: unknown,
  token?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await request.post(`/v1/${contract}/${operation}`, {
    data: payload,
    headers,
  });
  if (!res.ok()) {
    throw new Error(
      `POST /v1/${contract}/${operation} failed: ${res.status()} ${await res.text()}`,
    );
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function ownerToken(request: APIRequestContext): Promise<string> {
  const body = await apiOp(request, 'admin', 'SignIn', {
    signinIdentity: ADMIN_IDENTITY,
    secret: requireSecret(),
  });
  const token = body.token;
  if (typeof token !== 'string' || !token) {
    throw new Error('owner sign-in returned no token');
  }
  return token;
}

export interface StayWindow {
  arrival: string;
  departure: string;
  night1: string;
  night2: string;
}

export function stayWindow(daysOut: number, nights: number): StayWindow {
  const day = 24 * 60 * 60 * 1000;
  // Hotel-local calendar day (matches the desk business date and
  // the API loop's `date +%F`, never UTC): midnight edges must not
  // shift the window away from the screen's business date.
  const fmt = (t: number): string => {
    const d = new Date(t);
    const pad = (n: number): string => (n < 10 ? '0' : '') + String(n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const now = Date.now();
  return {
    arrival: fmt(now + daysOut * day),
    departure: fmt(now + (daysOut + nights) * day),
    night1: fmt(now + daysOut * day),
    night2: fmt(now + (daysOut + 1) * day),
  };
}

export function todayLocal(): string {
  const d = new Date();
  const pad = (n: number): string => (n < 10 ? '0' : '') + String(n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface FlowContext {
  tag: string;
  guestId: string;
  guestName: string;
  roomTypeId: string;
  roomTypeName: string;
  roomNumbers: string[];
  roomIds: string[];
  ratePlan: string;
  window: StayWindow;
}

// Per-run bookable context: one guest, one room type with two
// ready rooms, one rate plan pricing the whole window.
export async function setupFlowContext(
  request: APIRequestContext,
  token: string,
  tag: string,
  window: StayWindow,
  roomCount = 2,
): Promise<FlowContext> {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;
  const name = (stem: string): string => `${stem}-${tag}-${suffix}`;
  const guestName = name('UI Guest');
  const guestId = randomUUID();
  await apiOp(request, 'guests', 'UpsertGuest', {
    guestId,
    fullName: guestName,
    contact: { idDocument: `UI-${suffix}` },
    actor: 'browser-e2e',
  }, token);
  const roomTypeName = name('UI Standard');
  const roomType = (await apiOp(request, 'rooms', 'UpsertRoomType', {
    name: roomTypeName,
    capacity: 2,
    bedType: 'double',
    actor: 'browser-e2e',
  }, token)).id as string;
  const roomNumbers = Array.from(
    { length: roomCount },
    (_, i) => name(`UIR-10${i + 1}`).slice(0, 24),
  );
  const roomIds: string[] = [];
  for (const number of roomNumbers) {
    const room = await apiOp(request, 'rooms', 'UpsertRoom', {
      number,
      roomType,
      actor: 'browser-e2e',
    }, token);
    roomIds.push(room.id as string);
  }
  const ratePlan = name('UI-RACK').slice(0, 24);
  await apiOp(request, 'rates', 'UpsertRatePlan', {
    name: ratePlan,
    description: 'browser E2E rack rate',
    defaultUnits: 1,
  }, token);
  for (const nightDate of [window.night1, window.night2]) {
    await apiOp(request, 'rates', 'UpsertRatePrice', {
      ratePlanName: ratePlan,
      roomTypeId: roomType,
      nightDate,
      priceMinor: 120000,
    }, token);
  }
  return { tag, guestId, guestName, roomTypeId: roomType, roomTypeName, roomNumbers, roomIds, ratePlan, window };
}

export async function signInThroughGate(page: Page, identity?: string, secret?: string): Promise<void> {
  await page.goto('/app/');
  await page.getByTestId('shell-signin-identity').fill(identity ?? ADMIN_IDENTITY);
  await page.getByTestId('shell-signin-secret').locator('input').fill(secret ?? requireSecret());
  await page.getByTestId('shell-signin-submit').click();
  await expect(page.getByTestId('shell-nav')).toBeVisible();
}
