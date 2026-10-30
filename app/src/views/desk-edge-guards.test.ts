// Automated guards for the scriptable halves of the desk-UI
// validation + edge-case matrix (Refs #451; dev follow-up to the
// qa-lead matrix #450, QA-EDGE-1..12 in
// docs/testing/manual-qa-testsuite.md). Each guard cites its
// QA-EDGE case and its AC-DSK trace. Human-only checks (UX feel,
// wording nuance, highlight, tab order) stay manual and out of
// scope. Test code only: every stub below asserts current
// behaviour, and no product source file is touched.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import BookView from './BookView.vue';
import StayView from './StayView.vue';
import FolioView from './FolioView.vue';
import RoomsView from './RoomsView.vue';
import { useSessionStore } from '../stores/session';
import { setLocale } from '../i18n';
import { resetConnectivityForTests } from '../api/client';

vi.mock('../router', () => ({
  default: { replace: vi.fn() },
  createAppRouter: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  return init?.body !== undefined ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
}

// A rendered API failure must read as the plain-words sentence
// with none of the raw envelope leaking onto the screen
// (FR-DSP-3, QA-EDGE-9).
function expectNoRawLeak(text: string): void {
  expect(text).not.toMatch(/INTERNAL|VALIDATION_FAILED|NOT_FOUND|CONFLICT|STATE_ILLEGAL/);
  expect(text).not.toMatch(/\b\d{3}\b/);
  expect(text).not.toContain('{');
  expect(text).not.toMatch(/stack|trace/i);
}

function digitsOf(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

// ---- Book helpers (happy path mirrors BookView.test.ts) ----

function stubBookHappy(fetchMock: ReturnType<typeof vi.fn>) {
  const happy = (url: string, init?: RequestInit): Promise<Response> => {
    const body = parseBody(init);
    if (url === '/v1/admin/SignIn') {
      return Promise.resolve(
        jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
      );
    }
    if (url === '/v1/guests/IdentifyGuest') {
      if (typeof body.guestId === 'string') {
        return Promise.resolve(
          jsonResponse({ guestId: body.guestId, fullName: 'Guest One' }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          guestId: 'g-1',
          fullName: 'Guest One',
          returningFlag: true,
          pastStayCount: 3,
          stayLinks: [],
        }),
      );
    }
    if (url === '/v1/guests/UpsertGuest') {
      return Promise.resolve(jsonResponse({ guestId: 'g-2', fullName: body.fullName }));
    }
    if (url === '/v1/rooms/ListRoomTypes') {
      return Promise.resolve(
        jsonResponse({
          roomTypes: [
            { id: 'standard', name: 'Standard' },
            { id: 'suite', name: 'Suite' },
          ],
        }),
      );
    }
    if (url === '/v1/rates/QuotePrice') {
      return Promise.resolve(
        jsonResponse({
          roomTypeId: 'standard',
          arrivalDate: '2026-11-01',
          departureDate: '2026-11-03',
          discountName: null,
          nights: [
            { nightDate: '2026-11-01', priceMinor: 10000 },
            { nightDate: '2026-11-02', priceMinor: 12000 },
          ],
          totalMinor: 22000,
        }),
      );
    }
    if (url === '/v1/rooms/CheckRoomTypeSellability') {
      return Promise.resolve(
        jsonResponse({
          roomTypeId: 'standard',
          dateFrom: '2026-11-01',
          dateTo: '2026-11-03',
          totalCount: 2,
          sellableCount: 2,
          blockedRooms: [],
        }),
      );
    }
    if (url === '/v1/reservations/CreateReservation') {
      return Promise.resolve(
        jsonResponse({
          reservationRef: 'RSV-1',
          state: 'confirmed',
          quotedTotal: 22000,
          reservationId: 'r-1',
          stayId: null,
        }),
      );
    }
    if (url === '/v1/reservations/GetReservation') {
      return Promise.resolve(
        jsonResponse({
          reservationRef: 'RSV-1',
          roomTypeId: 'standard',
          arrivalDate: '2026-11-01',
          departureDate: '2026-11-03',
          guest: { guestId: 'g-1' },
          priceBasis: { totalMinor: 22000, discountName: null },
          state: 'confirmed',
          reservationId: 'r-1',
          stayId: null,
        }),
      );
    }
    if (url === '/v1/guests/AttachReservation') {
      return Promise.resolve(
        jsonResponse({
          reservationRef: 'RSV-1',
          hotel: { hotelId: 'h-1', name: 'Grand Hotel' },
          guest: { guestId: 'g-1', fullName: 'Guest One' },
          dates: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
          type: 'standard',
          price: { amountMinor: 22000, currency: 'USD' },
        }),
      );
    }
    if (url === '/v1/guests/ProduceConfirmation') {
      return Promise.resolve(
        jsonResponse({
          reservationRef: 'RSV-1',
          hotel: { hotelId: 'h-1', name: 'Grand Hotel' },
          guest: { guestId: 'g-1', fullName: 'Guest One' },
          dates: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
          type: 'standard',
          price: { amountMinor: 22000, currency: 'USD' },
        }),
      );
    }
    if (url === '/v1/admin/SignOut') {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    throw new Error(`unexpected call ${url}`);
  };
  fetchMock.mockImplementation(happy);
  return happy;
}

function mountBook() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(BookView, {
    global: { plugins: [pinia] },
  });
}

async function signInBook(wrapper: ReturnType<typeof mountBook>, fetchMock: ReturnType<typeof vi.fn>) {
  stubBookHappy(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.vm.$nextTick();
}

async function fillStayBook(wrapper: ReturnType<typeof mountBook>) {
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="book-room-type-id"] option[value="standard"]').exists()).toBe(true);
  });
  await wrapper.find('[data-testid="book-arrival-date"]').setValue('2026-11-01');
  await wrapper.find('[data-testid="book-departure-date"]').setValue('2026-11-03');
  await wrapper.find('[data-testid="book-room-type-id"]').setValue('standard');
}

async function quoteBook(wrapper: ReturnType<typeof mountBook>) {
  await fillStayBook(wrapper);
  await wrapper.find('[data-testid="book-quote"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
  });
}

// ---- Stay helpers (happy path mirrors StayView.test.ts) ----

function stubStayHappy(fetchMock: ReturnType<typeof vi.fn>) {
  const happy = (url: string, init?: RequestInit): Promise<Response> => {
    const body = parseBody(init);
    if (url === '/v1/admin/SignIn') {
      return Promise.resolve(
        jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
      );
    }
    if (url === '/v1/stay/ListArrivalsDepartures') {
      return Promise.resolve(
        jsonResponse({
          businessDate: '2026-10-26',
          arrivals: [
            {
              reservationRef: 'RSV-1',
              guestId: 'g-1',
              roomId: null,
              actualArrival: null,
              actualDeparture: null,
            },
          ],
          inHouse: [
            {
              stayId: 's-1',
              guestId: 'g-2',
              roomId: 'room-9',
              actualArrival: '2026-10-25T14:00:00.000Z',
              actualDeparture: null,
            },
          ],
          departures: [],
        }),
      );
    }
    if (url === '/v1/rooms/ListRoomsByState') {
      if (body.state === 'vacant-inspected') {
        return Promise.resolve(
          jsonResponse({
            state: 'vacant-inspected',
            rooms: [
              { roomId: 'room-1', number: '101', roomTypeId: 'standard', state: 'vacant-inspected' },
              { roomId: 'room-2', number: '102', roomTypeId: 'standard', state: 'vacant-inspected' },
            ],
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          state: body.state,
          rooms: [{ roomId: 'room-9', number: '109', roomTypeId: 'standard', state: 'occupied' }],
        }),
      );
    }
    if (url === '/v1/guests/GetGuest') {
      const names: Record<string, string> = { 'g-1': 'Guest One', 'g-2': 'Guest Two' };
      const guestId = String(body.guestId ?? '');
      return Promise.resolve(jsonResponse({ guestId, fullName: names[guestId] ?? guestId }));
    }
    if (url === '/v1/rooms/ListRoomTypes') {
      return Promise.resolve(jsonResponse({ roomTypes: [{ id: 'standard', name: 'Standard' }] }));
    }
    if (url === '/v1/reservations/QueryCalendar') {
      return Promise.resolve(
        jsonResponse({ dateFrom: body.dateFrom ?? null, dateTo: body.dateTo ?? null, reservations: [] }),
      );
    }
    if (url === '/v1/reservations/GetReservation') {
      return Promise.resolve(
        jsonResponse({
          reservationId: 'r-1',
          reservationRef: 'RSV-1',
          roomTypeId: 'standard',
          guest: { guestId: 'g-1' },
        }),
      );
    }
    if (url === '/v1/rooms/AssignRoom') {
      const number = String(body.roomNumber);
      return Promise.resolve(
        jsonResponse({ roomId: `echo-${number}`, roomNumber: number, stayLink: body.stayLink, state: 'occupied' }),
      );
    }
    if (url === '/v1/stay/CheckIn') {
      return Promise.resolve(
        jsonResponse({
          stayId: body.stayId,
          reservationId: 'r-1',
          guestId: 'g-1',
          roomId: body.roomId,
          state: 'in-house',
        }),
      );
    }
    if (url === '/v1/reservations/CheckInReservation') {
      return Promise.resolve(jsonResponse({ reservationRef: 'RSV-1', stayId: body.stayId }));
    }
    if (url === '/v1/billing/GetFolioBalance') {
      return Promise.resolve(
        jsonResponse({ folioId: 'f-1', stayId: body.stayId, balanceMinor: 0, openBalanceApproval: null }),
      );
    }
    if (url === '/v1/stay/CheckOut') {
      return Promise.resolve(jsonResponse({ stayId: body.stayId, invoiceRef: 'INV-1' }));
    }
    if (url === '/v1/admin/SignOut') {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    throw new Error(`unexpected call ${url}`);
  };
  fetchMock.mockImplementation(happy);
  return happy;
}

function mountStay() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(StayView, {
    global: { plugins: [pinia] },
  });
}

async function signInStay(wrapper: ReturnType<typeof mountStay>, fetchMock: ReturnType<typeof vi.fn>) {
  stubStayHappy(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.find('[data-testid="stay-refresh"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="stay-main"]').exists()).toBe(true);
  });
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="stay-arrivals-table"] tbody tr td').text()).toContain(
      'Guest One',
    );
  });
}

// ---- Folio helpers (ledger mirrors FolioView.test.ts) ----

interface FolioChargeRecord {
  itemKind: string;
  itemName: string;
  amountMinor: number;
  taxMinor?: number;
  feeMinor?: number;
  postedAt: string;
}

interface FolioPaymentRecord {
  method: string;
  amountMinor: number;
  paidAt: string;
}

function stubFolioHappy(fetchMock: ReturnType<typeof vi.fn>) {
  const charges: FolioChargeRecord[] = [
    {
      itemKind: 'nightly-room-charge',
      itemName: 'Room night',
      amountMinor: 10000,
      taxMinor: 500,
      feeMinor: 200,
      postedAt: '2026-10-26T08:00:00.000Z',
    },
  ];
  const payments: FolioPaymentRecord[] = [
    { method: 'cash', amountMinor: 3000, paidAt: '2026-10-26T09:00:00.000Z' },
  ];
  const balanceMinor = (): number =>
    charges.reduce((sum, line) => sum + line.amountMinor + (line.taxMinor ?? 0) + (line.feeMinor ?? 0), 0) -
    payments.reduce((sum, line) => sum + line.amountMinor, 0);

  const happy = (url: string, init?: RequestInit): Promise<Response> => {
    const body = parseBody(init);
    if (url === '/v1/admin/SignIn') {
      return Promise.resolve(
        jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
      );
    }
    if (url === '/v1/billing/GetFolioBalance') {
      return Promise.resolve(
        jsonResponse({
          folioId: 'f-1',
          stayId: body.stayId,
          balanceMinor: balanceMinor(),
          charges,
          payments,
        }),
      );
    }
    if (url === '/v1/billing/PostCharge') {
      const posted: FolioChargeRecord = {
        itemKind: String(body.itemKind),
        itemName: String(body.itemName),
        amountMinor: Number(body.amountMinor),
        taxMinor: 0,
        feeMinor: 0,
        postedAt: '2026-10-26T10:00:00.000Z',
      };
      charges.push(posted);
      return Promise.resolve(jsonResponse(posted));
    }
    if (url === '/v1/billing/RecordPayment') {
      const recorded: FolioPaymentRecord = {
        method: String(body.method),
        amountMinor: Number(body.amountMinor),
        paidAt: '2026-10-26T11:00:00.000Z',
      };
      payments.push(recorded);
      return Promise.resolve(jsonResponse(recorded));
    }
    if (url === '/v1/admin/SignOut') {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    throw new Error(`unexpected call ${url}`);
  };
  fetchMock.mockImplementation(happy);
  return happy;
}

function mountFolio() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(FolioView, {
    global: { plugins: [pinia] },
  });
}

async function signInFolio(wrapper: ReturnType<typeof mountFolio>, fetchMock: ReturnType<typeof vi.fn>) {
  stubFolioHappy(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.vm.$nextTick();
}

async function openFolio(wrapper: ReturnType<typeof mountFolio>, stayId: string) {
  await wrapper.find('[data-testid="folio-stay-id"]').setValue(stayId);
  await wrapper.find('[data-testid="folio-open"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="folio-status"]').text()).toContain('Folio balance:');
  });
}

beforeEach(() => {
  sessionStorage.clear();
  resetConnectivityForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  setLocale('en');
});

// QA-EDGE-1 (trace AC-DSK-4): an unknown booking reference is
// refused naming the reference, and no room assignment starts.
describe('QA-EDGE-1 unknown booking ref', () => {
  it('refuses the unknown ref with no room assignment call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signInStay(wrapper, fetchMock);

    const happy = stubStayHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'no such booking' }, 404));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-booking-ref"]').setValue('NOPE-0000');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'Unknown booking reference',
      );
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/rooms/AssignRoom');
    expect(urls).not.toContain('/v1/stay/CheckIn');
    expect(urls).not.toContain('/v1/reservations/CheckInReservation');
  });
});

// QA-EDGE-2 (trace AC-DSK-5): negative amounts are refused naming
// the amount field; the ledger and its balance stay untouched.
describe('QA-EDGE-2 negative amounts', () => {
  it('blocks a negative charge and a zero payment with the balance unchanged', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signInFolio(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    const before = wrapper.find('[data-testid="folio-status"]').text();
    expect(before).toContain('Folio balance: 77.00.');

    await wrapper.find('[data-testid="folio-charge-name"]').setValue('Minibar');
    await wrapper.find('[data-testid="folio-charge-amount"]').setValue('-1');
    await wrapper.find('[data-testid="folio-charge"]').trigger('click');
    expect(wrapper.find('[data-testid="folio-charge-status"]').text()).toContain(
      'Enter the item name and a non-negative amount first.',
    );

    await wrapper.find('[data-testid="folio-payment-amount"]').setValue('0');
    await wrapper.find('[data-testid="folio-pay"]').trigger('click');
    expect(wrapper.find('[data-testid="folio-payment-status"]').text()).toContain(
      'Enter a positive amount first.',
    );

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/billing/PostCharge');
    expect(urls).not.toContain('/v1/billing/RecordPayment');
    expect(wrapper.find('[data-testid="folio-status"]').text()).toBe(before);
  });
});

// QA-EDGE-3 (trace AC-DSK-3): a departure-before-arrival range is
// refused in plain words and creates no booking.
describe('QA-EDGE-3 departure before arrival', () => {
  it('refuses the reversed range without quoting or booking', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signInBook(wrapper, fetchMock);

    const happy = stubBookHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rates/QuotePrice') {
        return Promise.resolve(
          jsonResponse({ code: 'VALIDATION_FAILED', message: 'arrival after departure' }, 400),
        );
      }
      return happy(url, init);
    });

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-room-type-id"] option[value="standard"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="book-arrival-date"]').setValue('2026-11-03');
    await wrapper.find('[data-testid="book-departure-date"]').setValue('2026-11-01');
    await wrapper.find('[data-testid="book-room-type-id"]').setValue('standard');
    await wrapper.find('[data-testid="book-quote"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-error"]').exists()).toBe(true);
    });
    const errorText = wrapper.find('[data-testid="book-quote-error"]').text();
    expect(errorText).toContain('That did not work');
    expectNoRawLeak(errorText);
    expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(false);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/reservations/CreateReservation');
  });
});

// QA-EDGE-4 (trace AC-DSK-3, AC-DSK-4, AC-DSK-5), scriptable half
// only: every blank required field blocks the submit and persists
// nothing. Highlight/focus/tab order stay human-only.
describe('QA-EDGE-4 empty required fields', () => {
  it('stay: an empty booking ref names the field and reads nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signInStay(wrapper, fetchMock);

    const readsBefore = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === '/v1/reservations/GetReservation',
    ).length;
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
      'Enter the booking reference first.',
    );
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/reservations/GetReservation'),
    ).toHaveLength(readsBefore);
  });

  it('book: registering with a blank name persists no guest', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signInBook(wrapper, fetchMock);

    await wrapper.find('[data-testid="book-register-guest"]').trigger('click');
    expect(wrapper.find('[data-testid="book-guest-status"]').exists()).toBe(true);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/guests/UpsertGuest');
    expect((wrapper.find('[data-testid="book-guest-id"]').element as HTMLInputElement).value).toBe('');
  });
});

// QA-EDGE-5 (trace AC-DSK-3): a repeated confirm replays one
// booking instead of creating two: one create per quote key, and
// the quote clears so no UI retry path remains.
describe('QA-EDGE-5 duplicate confirm idempotency', () => {
  it('double-clicked confirm sends one create with one key and leaves no retry', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signInBook(wrapper, fetchMock);
    await quoteBook(wrapper);
    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');

    let releaseCreate: (value: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      releaseCreate = resolve;
    });
    const happy = stubBookHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/CreateReservation') {
        return gate;
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    const creates = () =>
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/reservations/CreateReservation');
    await vi.waitFor(() => {
      expect(creates()).toHaveLength(1);
    });
    // One idempotency key travels on the single create.
    const sent = parseBody(creates()[0]?.[1] as RequestInit);
    expect(typeof sent.idempotencyKey).toBe('string');
    expect(String(sent.idempotencyKey).length).toBeGreaterThan(0);

    releaseCreate(
      jsonResponse({
        reservationRef: 'RSV-1',
        state: 'confirmed',
        quotedTotal: 22000,
        reservationId: 'r-1',
        stayId: null,
      }),
    );
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(true);
    });
    expect(creates()).toHaveLength(1);
    // The confirmed quote clears, so the confirm button is gone:
    // no UI retry can replay the booking.
    expect(wrapper.find('[data-testid="book-confirm"]').exists()).toBe(false);
  });
});

// QA-EDGE-6 (trace AC-DSK-3): booking past the last sellable unit
// is refused sold-out and creates no second reservation.
describe('QA-EDGE-6 overbooking past sellable units', () => {
  it('refuses the second booking sold-out with a single create', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signInBook(wrapper, fetchMock);

    let sellabilityReads = 0;
    const happy = stubBookHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/CheckRoomTypeSellability') {
        sellabilityReads += 1;
        return Promise.resolve(
          jsonResponse({
            roomTypeId: 'standard',
            dateFrom: '2026-11-01',
            dateTo: '2026-11-03',
            totalCount: 2,
            sellableCount: sellabilityReads === 1 ? 1 : 0,
            blockedRooms: [],
          }),
        );
      }
      return happy(url, init);
    });

    await quoteBook(wrapper);
    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(true);
    });

    await wrapper.find('[data-testid="book-new-booking"]').trigger('click');
    await quoteBook(wrapper);
    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-confirm-error"]').text()).toContain(
        'No rooms of this type are free',
      );
    });
    expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(false);
    expect(
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/reservations/CreateReservation'),
    ).toHaveLength(1);
  });
});

// QA-EDGE-7 (trace AC-DSK-4), scriptable half only: exactly one
// check-in takes the room; the loser reads refused_taken with no
// half-created stay. Wording friendliness stays human-only.
describe('QA-EDGE-7 concurrent check-in to the same room', () => {
  it('refuses the taken room with no check-in half-record', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signInStay(wrapper, fetchMock);

    const happy = stubStayHappy(fetchMock);
    let assigns = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/AssignRoom') {
        assigns += 1;
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'taken' }, 409));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-booking-ref"]').setValue('RSV-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain('just taken');
    });
    expect(assigns).toBe(1);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/stay/CheckIn');
    expect(urls).not.toContain('/v1/reservations/CheckInReservation');
  });
});

// QA-EDGE-8 (trace AC-DSK-4, AC-DSK-6): check-in candidates come
// from vacant-inspected rooms only, so a dirty room is never
// offered. The dirty-to-clean-to-inspected walk itself rides the
// existing RoomsView guards.
describe('QA-EDGE-8 dirty-room checkout flow', () => {
  it('never offers the dirty room as a check-in candidate', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const happy = stubStayHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ListRoomsByState') {
        const state = String(parseBody(init).state ?? '');
        if (state === 'vacant-inspected') {
          return Promise.resolve(
            jsonResponse({
              state,
              rooms: [
                { roomId: 'room-1', number: '101', roomTypeId: 'standard', state },
              ],
            }),
          );
        }
        if (state === 'vacant-dirty') {
          return Promise.resolve(
            jsonResponse({
              state,
              rooms: [
                { roomId: 'room-9', number: '109', roomTypeId: 'standard', state },
              ],
            }),
          );
        }
        return Promise.resolve(jsonResponse({ state, rooms: [] }));
      }
      return happy(url, init);
    });
    const wrapper = mountStay();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="stay-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-main"]').exists()).toBe(true);
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-arrivals-table"] tbody tr td').text()).toContain(
        'Guest One',
      );
    });

    await wrapper.find('[data-testid="stay-booking-ref"]').setValue('RSV-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    // The candidate query is scoped to inspected rooms.
    const candidateReads = fetchMock.mock.calls.filter(
      (call) =>
        String(call[0]) === '/v1/rooms/ListRoomsByState' &&
        String((parseBody(call[1] as RequestInit).state ?? '')) === 'vacant-inspected',
    );
    expect(candidateReads.length).toBeGreaterThan(0);
    // The picker offers the inspected room and never the dirty one.
    const pickerText = wrapper.find('[data-testid="stay-checkin-room"]').text();
    expect(pickerText).toContain('101');
    expect(pickerText).not.toContain('109');
  });
});

// QA-EDGE-9 (trace AC-DSK-3, AC-DSK-8), scriptable half only: on
// an API failure every screen reads the plain catalogue sentence
// with no raw leak. Wording naturalness stays human-only.
describe('QA-EDGE-9 API-error rendering without raw leak', () => {
  it('book: a failed quote reads one plain sentence', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signInBook(wrapper, fetchMock);

    const happy = stubBookHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rates/QuotePrice') {
        return Promise.resolve(
          jsonResponse({ code: 'INTERNAL', message: 'boom\nstack trace {...}' }, 500),
        );
      }
      return happy(url, init);
    });

    await fillStayBook(wrapper);
    await wrapper.find('[data-testid="book-quote"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-error"]').exists()).toBe(true);
    });
    const errorText = wrapper.find('[data-testid="book-quote-error"]').text();
    expect(errorText).toContain('That did not work');
    expectNoRawLeak(errorText);
  });

  it('stay: failed lists read one plain sentence', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [] }));
      }
      return Promise.resolve(
        jsonResponse({ code: 'INTERNAL', message: 'boom\nstack trace {...}' }, 500),
      );
    });
    const wrapper = mountStay();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="stay-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-lists-error"]').exists()).toBe(true);
    });
    const errorText = wrapper.find('[data-testid="stay-lists-error"]').text();
    expect(errorText).toContain('That did not work');
    expectNoRawLeak(errorText);
  });

  it('folio: a failed open reads one plain sentence', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signInFolio(wrapper, fetchMock);

    const happy = stubFolioHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({ code: 'INTERNAL', message: 'boom\nstack trace {...}' }, 500),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="folio-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="folio-open"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-open-error"]').exists()).toBe(true);
    });
    const errorText = wrapper.find('[data-testid="folio-open-error"]').text();
    expect(errorText).toContain('That did not work');
    expectNoRawLeak(errorText);
  });

  it('rooms: a failed state read reads one plain sentence', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [] }));
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        return Promise.resolve(
          jsonResponse({ code: 'INTERNAL', message: 'boom\nstack trace {...}' }, 500),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    const wrapper = mount(RoomsView, { global: { plugins: [pinia] } });
    await wrapper.find('[data-testid="rooms-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="rooms-error"]').exists()).toBe(true);
    });
    const errorText = wrapper.find('[data-testid="rooms-error"]').text();
    expect(errorText).toContain('That did not work');
    expectNoRawLeak(errorText);
  });
});

// QA-EDGE-10 (trace AC-DSK-3, AC-DSK-4, AC-DSK-5): a double submit
// writes exactly once per screen. The book-confirm and
// stay-check-in halves ride the existing in-flight guards
// (BookView.test.ts double-click confirm, StayView.test.ts
// double-click check-in); the folio-pay and stay-checkout halves
// are pinned here.
describe('QA-EDGE-10 double-submit', () => {
  it('folio: a double-clicked pay records one payment', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountFolio();
    await signInFolio(wrapper, fetchMock);
    await openFolio(wrapper, 's-1');

    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/RecordPayment') {
        return gate;
      }
      return stubFolioHappy(vi.fn())(url, init);
    });

    await wrapper.find('[data-testid="folio-payment-method"]').setValue('card');
    await wrapper.find('[data-testid="folio-payment-amount"]').setValue('7.00');
    const first = wrapper.find('[data-testid="folio-pay"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-pay"]').attributes('disabled')).toBeDefined();
    });
    await wrapper.find('[data-testid="folio-pay"]').trigger('click');
    const payCalls = () =>
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/billing/RecordPayment');
    expect(payCalls()).toHaveLength(1);
    expect(wrapper.find('[data-testid="folio-paying"]').exists()).toBe(true);
    release(
      jsonResponse({ method: 'card', amountMinor: 700, paidAt: '2026-10-26T11:00:00.000Z' }),
    );
    await first;
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-pay"]').attributes('disabled')).toBeUndefined();
    });
    expect(payCalls()).toHaveLength(1);
  });

  it('stay: a double-confirmed checkout closes once', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signInStay(wrapper, fetchMock);

    await wrapper.find('[data-testid="stay-checkout-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });

    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const happy = stubStayHappy(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckOut') {
        return gate;
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-dialog"]').exists()).toBe(true);
    });
    const first = wrapper.find('[data-testid="stay-checkout-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="stay-checkout-confirm"]').attributes('disabled'),
      ).toBeDefined();
    });
    await wrapper.find('[data-testid="stay-checkout-confirm"]').trigger('click');
    const checkoutCalls = () =>
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/stay/CheckOut');
    expect(checkoutCalls()).toHaveLength(1);
    release(jsonResponse({ stayId: 's-1', invoiceRef: 'INV-1' }));
    await first;
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain('Checked out');
    });
    expect(checkoutCalls()).toHaveLength(1);
  });
});

// QA-EDGE-11 (trace AC-DSK-3, AC-DSK-4, AC-DSK-7), scriptable half
// only: a mid-flow reload creates no half-record and lands valid.
// Wizard back-keeps-values rides the existing OnboardingView
// guards; focus/scroll position stay human-only.
describe('QA-EDGE-11 mid-flow refresh', () => {
  it('book: a reload after quoting creates no booking and lands valid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signInBook(wrapper, fetchMock);
    await quoteBook(wrapper);

    // The quoted-but-unconfirmed booking reloads: the component
    // remounts with a signed-in session, like a tab reload.
    wrapper.unmount();
    const reloaded = mountBook();
    stubBookHappy(fetchMock);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await reloaded.vm.$nextTick();

    expect(reloaded.find('[data-testid="book-view"]').exists()).toBe(true);
    expect(reloaded.find('[data-testid="book-quote-section"]').exists()).toBe(false);
    expect(reloaded.find('[data-testid="book-result"]').exists()).toBe(false);
    expect(reloaded.find('[data-testid="book-booking"]').exists()).toBe(true);
    expect(
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/reservations/CreateReservation'),
    ).toHaveLength(0);
  });
});

// QA-EDGE-12 (trace AC-DSK-1, AC-DSK-8), scriptable half only: a
// mid-flow locale switch keeps every entered value and the quoted
// price, and the flow still confirms. Translation naturalness,
// clipping, and tab order stay human-only. The folio
// amount-across-switch half rides the existing
// charges/payments-design-cards guard.
describe('QA-EDGE-12 mid-flow locale switch', () => {
  it('book: quoted inputs survive the switch and still confirm', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signInBook(wrapper, fetchMock);
    await quoteBook(wrapper);

    const totalBefore = digitsOf(wrapper.find('[data-testid="book-quote-total"]').text());
    expect(totalBefore).toContain('22000');
    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      // Entered values survive the switch untouched.
      expect(
        (wrapper.find('[data-testid="book-arrival-date"]').element as HTMLInputElement).value,
      ).toBe('2026-11-01');
      expect(
        (wrapper.find('[data-testid="book-departure-date"]').element as HTMLInputElement).value,
      ).toBe('2026-11-03');
      expect(
        (wrapper.find('[data-testid="book-room-type-id"]').element as HTMLSelectElement).value,
      ).toBe('standard');
      // The quote survives with the same priced value.
      expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
      expect(digitsOf(wrapper.find('[data-testid="book-quote-total"]').text())).toBe(totalBefore);
      // The switched screen reads Vietnamese on its actions.
      expect(wrapper.find('[data-testid="book-find-guest"]').text()).toContain('Tìm khách');

      // The flow still confirms after the switch.
      await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
      await wrapper.find('[data-testid="book-confirm"]').trigger('click');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="book-booking-reference"]').text()).toContain('RSV-1');
    } finally {
      setLocale('en');
    }
  });
});
