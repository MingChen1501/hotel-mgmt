// Characterization guard for the book screen migration
// (Refs #294, ADR-0003): BookView replicates the
// `frontend/book.html` inline-script behaviour — sign-in plus the
// quote-before-book flow (IdentifyGuest / UpsertGuest walk-in,
// QuotePrice nights plus total, CreateReservation with the guest
// full-name snapshot, the frozen price basis and the searched
// sellable count, GetReservation read-back,
// GetReservation read-back,
// ProduceConfirmation with print/copy, the in-flight confirm guard
// with one idempotencyKey per quote, and the code-switched refusal
// strings) — through the shared Bearer client and the catalogue
// `t()` wrapper. No Playwright harness exists in this repo yet, so
// these Vitest component tests are the characterization coverage
// for the booking flows.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import BookView from './BookView.vue';
import bookViewSource from './BookView.vue?raw';
import { useSessionStore } from '../stores/session';
import { resetConnectivityForTests } from '../api/client';
import router from '../router';

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

// Full happy-path backend: sign-in, guest identify by name and by
// id, walk-in registration, a two-night quote, reservation create
// with the frozen price basis, read-back, and confirmation.
// Returns the handler so a test can wrap it (e.g. to fail only the
// create) while the rest of the flow stays on the happy path.
function stubHappyPath(
  fetchMock: ReturnType<typeof vi.fn>,
): (url: string, init?: RequestInit) => Promise<Response> {
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
      expect(body.actor).toBe('Ada Owner');
      return Promise.resolve(jsonResponse({ guestId: 'g-2', fullName: body.fullName }));
    }
    if (url === '/v1/rooms/ListRoomTypes') {
      return Promise.resolve(
        jsonResponse({
          roomTypes: [
            { id: 'standard', name: 'Standard' },
            { id: 'suite', name: 'Suite' },
            { id: '82405026-2acf-4e8d-9943-5c70d2e8a898', name: 'QA Type' },
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

async function signIn(wrapper: ReturnType<typeof mountBook>, fetchMock: ReturnType<typeof vi.fn>) {
  // The shell owns the one sign-in gate (Refs #338): views mount
  // with a signed-in session preset, then work directly.
  stubHappyPath(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.vm.$nextTick();
}

async function fillStay(wrapper: ReturnType<typeof mountBook>) {
  // The type picker loads its catalogue after sign-in; wait for the
  // options so the select takes the value instead of clearing it.
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="book-room-type-id"] option[value="standard"]').exists()).toBe(true);
  });
  await wrapper.find('[data-testid="book-arrival-date"]').setValue('2026-11-01');
  await wrapper.find('[data-testid="book-departure-date"]').setValue('2026-11-03');
  await wrapper.find('[data-testid="book-room-type-id"]').setValue('standard');
}

async function quote(wrapper: ReturnType<typeof mountBook>) {
  await fillStay(wrapper);
  await wrapper.find('[data-testid="book-quote"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
  });
}

async function quoteAndConfirm(wrapper: ReturnType<typeof mountBook>) {
  await quote(wrapper);
  await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
  await wrapper.find('[data-testid="book-confirm"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(true);
  });
}

describe('book view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the booking form with no per-screen sign-in copy', () => {
    const wrapper = mountBook();
    expect(wrapper.find('[data-testid="book-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the heading resolves through t().
    expect(wrapper.find('[data-testid="book-view"] h1').text()).toContain('Book a room');
    // The shell owns the one sign-in gate (Refs #338, FR-DSP-2):
    // no per-screen sign-in copy renders here anymore.
    expect(wrapper.find('[data-testid="book-signin"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="book-booking"]').exists()).toBe(true);
  });

  it('works under the shell session with Bearer calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);
    await quote(wrapper);

    // Bearer session handling: the shared client attaches the token
    // to every call (the sign-in itself happened in the shell gate).
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
    expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
  });

  it('finds a returning guest by name and fills the guest id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="book-guest-name"]').setValue('Guest One');
    await wrapper.find('[data-testid="book-find-guest"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-guest-status"]').text()).toContain('Guest found');
    });
    expect(wrapper.find('[data-testid="book-guest-status"]').text()).toContain('3 past stays');
    const guestId = wrapper.find('[data-testid="book-guest-id"]');
    expect((guestId.element as HTMLInputElement).value).toBe('g-1');
  });

  it('shows the not-found catalogue string for an unknown guest name', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [] }));
      }
      if (url === '/v1/guests/IdentifyGuest') {
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'unknown guest' }, 404));
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountBook();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');

    await wrapper.find('[data-testid="book-guest-name"]').setValue('Nobody Here');
    await wrapper.find('[data-testid="book-find-guest"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-guest-status"]').text()).toContain(
        'No guest with that name',
      );
    });
  });

  it('registers a walk-in guest under the sign-in name', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="book-guest-name"]').setValue('Walk In');
    await wrapper.find('[data-testid="book-register-guest"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-guest-status"]').text()).toContain(
        'New guest registered',
      );
    });
    const guestId = wrapper.find('[data-testid="book-guest-id"]');
    expect((guestId.element as HTMLInputElement).value).toBe('g-2');
    // The walk-in registration carries the sign-in name as actor
    // (asserted inside the UpsertGuest stub above).
    const upsert = fetchMock.mock.calls.find((call) => call[0] === '/v1/guests/UpsertGuest');
    expect(upsert).toBeDefined();
  });

  it('quotes the price with nightly lines and the total', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quote(wrapper);
    const nights = wrapper.find('[data-testid="book-quote-nights"]').text();
    expect(nights).toContain('2026-11-01');
    expect(nights).toContain('100.00');
    expect(nights).toContain('2026-11-02');
    expect(nights).toContain('120.00');
    expect(wrapper.find('[data-testid="book-quote-total"]').text()).toContain('220.00');
  });

  it('confirms the booking with the guest snapshot, frozen price basis, searched sellable count, and one idempotency key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quoteAndConfirm(wrapper);
    // The confirm reads the searched sellable count first (the
    // desk-loop search step), using the quoted type and dates.
    const sellable = fetchMock.mock.calls.find(
      (call) => call[0] === '/v1/rooms/CheckRoomTypeSellability',
    );
    expect(sellable).toBeDefined();
    expect(parseBody(sellable?.[1] as RequestInit)).toEqual({
      roomType: 'standard',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-03',
    });
    const create = fetchMock.mock.calls.find(
      (call) => call[0] === '/v1/reservations/CreateReservation',
    );
    expect(create).toBeDefined();
    const sent = parseBody(create?.[1] as RequestInit);
    expect(sent.roomTypeId).toBe('standard');
    expect(sent.arrivalDate).toBe('2026-11-01');
    expect(sent.departureDate).toBe('2026-11-03');
    expect(sent.guest).toEqual({ guestId: 'g-1', fullName: 'Guest One' });
    expect(sent.sellableUnits).toBe(2);
    expect(sent.priceBasis).toEqual({ totalMinor: 22000, discountName: null });
    expect(typeof sent.idempotencyKey).toBe('string');
    expect(String(sent.idempotencyKey).length).toBeGreaterThan(0);

    // Read-back: the reservation ref passes through onto the result.
    expect(wrapper.find('[data-testid="book-booking-reference"]').text()).toContain('RSV-1');
    expect(wrapper.find('[data-testid="book-booking-readback"]').text()).toContain('Guest One');
    expect(wrapper.find('[data-testid="book-booking-readback"]').text()).toContain('220.00');

    // Confirmation document with the currency-formatted price.
    const confirmation = wrapper.find('[data-testid="book-confirmation-body"]').text();
    expect(confirmation).toContain('Grand Hotel');
    expect(confirmation).toContain('Guest One');
    expect(confirmation).toContain('RSV-1');
    expect(confirmation).toContain('USD 220.00');

    // The quote clears after a confirmed booking (legacy parity).
    expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(false);
  });

  it('confirms the QA booking with the guest full name snapshot (issue #321)', async () => {
    // Regression for the live refusal on a hotel with
    // requiredGuestFields ["fullName"]: the confirm must send the
    // full guest snapshot, not the guestId alone, using the exact
    // QA scenario values (guest QA Booker, priced window
    // 2026-11-25 to 2026-11-27, total 240000).
    const qaGuestId = 'eb9176db-74a8-4a79-805b-60da897d785f';
    const qaRoomTypeId = '82405026-2acf-4e8d-9943-5c70d2e8a898';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(
          jsonResponse({ roomTypes: [{ id: qaRoomTypeId, name: 'QA Type' }] }),
        );
      }
      if (url === '/v1/guests/IdentifyGuest') {
        return Promise.resolve(
          jsonResponse({ guestId: qaGuestId, fullName: 'QA Booker', pastStayCount: 1 }),
        );
      }
      if (url === '/v1/rates/QuotePrice') {
        return Promise.resolve(
          jsonResponse({
            roomTypeId: qaRoomTypeId,
            arrivalDate: '2026-11-25',
            departureDate: '2026-11-27',
            discountName: null,
            nights: [
              { nightDate: '2026-11-25', priceMinor: 120000 },
              { nightDate: '2026-11-26', priceMinor: 120000 },
            ],
            totalMinor: 240000,
          }),
        );
      }
      if (url === '/v1/rooms/CheckRoomTypeSellability') {
        return Promise.resolve(
          jsonResponse({
            roomTypeId: qaRoomTypeId,
            dateFrom: '2026-11-25',
            dateTo: '2026-11-27',
            totalCount: 2,
            sellableCount: 2,
            blockedRooms: [],
          }),
        );
      }
      if (url === '/v1/reservations/CreateReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            state: 'confirmed',
            quotedTotal: 240000,
            reservationId: 'r-9',
            stayId: null,
          }),
        );
      }
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            roomTypeId: qaRoomTypeId,
            arrivalDate: '2026-11-25',
            departureDate: '2026-11-27',
            guest: { guestId: qaGuestId, fullName: 'QA Booker' },
            priceBasis: { totalMinor: 240000, discountName: null },
            state: 'confirmed',
            reservationId: 'r-9',
            stayId: null,
          }),
        );
      }
      if (url === '/v1/guests/AttachReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            hotel: { hotelId: 'h-1', name: 'Skeleton Hotel' },
            guest: { guestId: qaGuestId, fullName: 'QA Booker' },
            dates: { checkIn: '2026-11-25', checkOut: '2026-11-27' },
            type: qaRoomTypeId,
            price: { amountMinor: 240000, currency: 'USD' },
          }),
        );
      }
      if (url === '/v1/guests/ProduceConfirmation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            hotel: { hotelId: 'h-1', name: 'Skeleton Hotel' },
            guest: { guestId: qaGuestId, fullName: 'QA Booker' },
            dates: { checkIn: '2026-11-25', checkOut: '2026-11-27' },
            type: qaRoomTypeId,
            price: { amountMinor: 240000, currency: 'USD' },
          }),
        );
      }
      if (url === '/v1/admin/SignOut') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountBook();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');

    // Find/register path: the remembered QA Booker name travels
    // into the confirm without an extra lookup.
    await wrapper.find('[data-testid="book-guest-name"]').setValue('QA Booker');
    await wrapper.find('[data-testid="book-find-guest"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-guest-status"]').text()).toContain('Guest found');
    });
    expect((wrapper.find('[data-testid="book-guest-id"]').element as HTMLInputElement).value).toBe(
      qaGuestId,
    );

    await wrapper.find('[data-testid="book-arrival-date"]').setValue('2026-11-25');
    await wrapper.find('[data-testid="book-departure-date"]').setValue('2026-11-27');
    await vi.waitFor(() => {
      expect(
        wrapper.find(`[data-testid="book-room-type-id"] option[value="${qaRoomTypeId}"]`).exists(),
      ).toBe(true);
    });
    await wrapper.find('[data-testid="book-room-type-id"]').setValue(qaRoomTypeId);
    await wrapper.find('[data-testid="book-quote"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(true);
    });

    const create = fetchMock.mock.calls.find(
      (call) => call[0] === '/v1/reservations/CreateReservation',
    );
    expect(create).toBeDefined();
    const sent = parseBody(create?.[1] as RequestInit);
    expect(sent.guest).toEqual({ guestId: qaGuestId, fullName: 'QA Booker' });
    // Issue #322: the searched sellable count (2 rooms on the QA
    // type) travels into the confirm, not the hardcoded 1.
    expect(sent.sellableUnits).toBe(2);
    expect(sent.priceBasis).toEqual({ totalMinor: 240000, discountName: null });
    expect(wrapper.find('[data-testid="book-booking-readback"]').text()).toContain('QA Booker');
    // Issue #323: the RES-side read-back snapshot is attached for
    // the Guests store before the human ref is produced.
    const attach = fetchMock.mock.calls.find(
      (call) => call[0] === '/v1/guests/AttachReservation',
    );
    expect(attach).toBeDefined();
    expect(parseBody(attach?.[1] as RequestInit)).toEqual({
      reservationRef: 'RSV-9',
      guest: { guestId: qaGuestId, fullName: 'QA Booker' },
      dates: { checkIn: '2026-11-25', checkOut: '2026-11-27' },
      type: qaRoomTypeId,
      price: { amountMinor: 240000 },
    });
    const produce = fetchMock.mock.calls.find(
      (call) => call[0] === '/v1/guests/ProduceConfirmation',
    );
    expect(parseBody(produce?.[1] as RequestInit)).toEqual({ reservationRef: 'RSV-9' });
  });

  it('confirms a second overlapping booking with the searched sellable count (issue #322)', async () => {
    // Live QA shape: room type with 2 rooms and 1 overlapping
    // confirmed booking for 2026-11-25 to 2026-11-27. The searched
    // sellable count is 2, so the confirm must send
    // sellableUnits 2 — the hardcoded 1 was refused as sold out.
    const qaGuestId = 'eb9176db-74a8-4a79-805b-60da897d785f';
    const qaRoomTypeId = '82405026-2acf-4e8d-9943-5c70d2e8a898';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = parseBody(init);
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(
          jsonResponse({ roomTypes: [{ id: qaRoomTypeId, name: 'QA Type' }] }),
        );
      }
      if (url === '/v1/guests/IdentifyGuest') {
        return Promise.resolve(
          jsonResponse({ guestId: body.guestId ?? qaGuestId, fullName: 'QA Booker' }),
        );
      }
      if (url === '/v1/rates/QuotePrice') {
        return Promise.resolve(
          jsonResponse({
            roomTypeId: qaRoomTypeId,
            arrivalDate: '2026-11-25',
            departureDate: '2026-11-27',
            discountName: null,
            nights: [
              { nightDate: '2026-11-25', priceMinor: 120000 },
              { nightDate: '2026-11-26', priceMinor: 120000 },
            ],
            totalMinor: 240000,
          }),
        );
      }
      if (url === '/v1/rooms/CheckRoomTypeSellability') {
        expect(body).toEqual({
          roomType: qaRoomTypeId,
          dateFrom: '2026-11-25',
          dateTo: '2026-11-27',
        });
        return Promise.resolve(
          jsonResponse({
            roomTypeId: qaRoomTypeId,
            dateFrom: '2026-11-25',
            dateTo: '2026-11-27',
            totalCount: 2,
            sellableCount: 2,
            blockedRooms: [],
          }),
        );
      }
      if (url === '/v1/reservations/CreateReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-QG3DQN4T',
            state: 'confirmed',
            quotedTotal: 240000,
            reservationId: 'r-322',
            stayId: null,
          }),
        );
      }
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-QG3DQN4T',
            roomTypeId: qaRoomTypeId,
            arrivalDate: '2026-11-25',
            departureDate: '2026-11-27',
            guest: { guestId: qaGuestId, fullName: 'QA Booker' },
            priceBasis: { totalMinor: 240000, discountName: null },
            state: 'confirmed',
            reservationId: 'r-322',
            stayId: null,
          }),
        );
      }
      if (url === '/v1/guests/AttachReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-QG3DQN4T',
            hotel: { hotelId: 'h-1', name: 'Skeleton Hotel' },
            guest: { guestId: qaGuestId, fullName: 'QA Booker' },
            dates: { checkIn: '2026-11-25', checkOut: '2026-11-27' },
            type: qaRoomTypeId,
            price: { amountMinor: 240000, currency: 'USD' },
          }),
        );
      }
      if (url === '/v1/guests/ProduceConfirmation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-QG3DQN4T',
            hotel: { hotelId: 'h-1', name: 'Skeleton Hotel' },
            guest: { guestId: qaGuestId, fullName: 'QA Booker' },
            dates: { checkIn: '2026-11-25', checkOut: '2026-11-27' },
            type: qaRoomTypeId,
            price: { amountMinor: 240000, currency: 'USD' },
          }),
        );
      }
      if (url === '/v1/admin/SignOut') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountBook();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');

    await wrapper.find('[data-testid="book-arrival-date"]').setValue('2026-11-25');
    await wrapper.find('[data-testid="book-departure-date"]').setValue('2026-11-27');
    await vi.waitFor(() => {
      expect(
        wrapper.find(`[data-testid="book-room-type-id"] option[value="${qaRoomTypeId}"]`).exists(),
      ).toBe(true);
    });
    await wrapper.find('[data-testid="book-room-type-id"]').setValue(qaRoomTypeId);
    await wrapper.find('[data-testid="book-quote"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="book-guest-id"]').setValue(qaGuestId);
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(true);
    });

    const create = fetchMock.mock.calls.find(
      (call) => call[0] === '/v1/reservations/CreateReservation',
    );
    expect(create).toBeDefined();
    const sent = parseBody(create?.[1] as RequestInit);
    expect(sent.sellableUnits).toBe(2);
    expect(wrapper.find('[data-testid="book-booking-reference"]').text()).toContain('RSV-QG3DQN4T');
  });

  it('refuses to confirm without creating when nothing is sellable (issue #322)', async () => {
    // The searched count is 0 (fully blocked type): the confirm
    // surfaces the sold-out string and never calls CreateReservation.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/CheckRoomTypeSellability') {
        return Promise.resolve(
          jsonResponse({
            roomTypeId: 'standard',
            dateFrom: '2026-11-01',
            dateTo: '2026-11-03',
            totalCount: 1,
            sellableCount: 0,
            blockedRooms: ['101'],
          }),
        );
      }
      return happy(url, init);
    });

    await quote(wrapper);
    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-confirm-error"]').text()).toContain(
        'No rooms of this type are free',
      );
    });
    expect(
      fetchMock.mock.calls.some((call) => call[0] === '/v1/reservations/CreateReservation'),
    ).toBe(false);
    expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(false);
  });

  it('refuses to confirm without a guest and without a quote', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quote(wrapper);
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-confirm-error"]').text()).toContain(
        'Find or register the guest first',
      );
    });

    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
    await wrapper.find('[data-testid="book-room-type-id"]').setValue('suite');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(false);
    });
    // No quote section means no confirm button to press; the guard
    // path is covered by confirming the button is gone with the
    // cleared quote.
    expect(wrapper.find('[data-testid="book-confirm"]').exists()).toBe(false);
  });

  it('maps an unpriced quote to the refused_noprice catalogue string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [{ id: 'standard', name: 'Standard' }] }));
      }
      if (url === '/v1/rates/QuotePrice') {
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'no price' }, 404));
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountBook();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');

    await fillStay(wrapper);
    await wrapper.find('[data-testid="book-quote"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-error"]').text()).toContain(
        'No price exists for this room type',
      );
    });
    expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(false);
  });

  it('maps a sold-out confirm to the refused_soldout catalogue string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/CreateReservation') {
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'sold out' }, 409));
      }
      return happy(url, init);
    });
    await quote(wrapper);
    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-confirm-error"]').text()).toContain(
        'No rooms of this type are free',
      );
    });
    expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(false);
  });

  it('maps a restriction refusal to the refused_restriction catalogue string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/CreateReservation') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'STATE_ILLEGAL',
              message: 'breaks a rule',
              details: { restriction: 'min-stay-2' },
            },
            409,
          ),
        );
      }
      return happy(url, init);
    });
    await quote(wrapper);
    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-confirm-error"]').text()).toContain('min-stay-2');
    });
    expect(wrapper.find('[data-testid="book-confirm-error"]').text()).toContain(
      'breaks a booking rule',
    );
  });

  it('ignores a double-clicked confirm: one CreateReservation per quote key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);
    await quote(wrapper);
    await wrapper.find('[data-testid="book-guest-id"]').setValue('g-1');

    let releaseCreate: (value: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => {
      releaseCreate = resolve;
    });
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/CreateReservation') {
        return gate;
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [{ id: 'standard', name: 'Standard' }] }));
      }
      const body = parseBody(init);
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
      if (url === '/v1/guests/IdentifyGuest') {
        return Promise.resolve(jsonResponse({ guestId: body.guestId, fullName: 'Guest One' }));
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
      throw new Error(`unexpected call ${url}`);
    });

    // The confirm button disables while the first confirm is in
    // flight; the in-flight guard drops the second press even if it
    // lands, so the store sees exactly one create per quote key.
    // (The first confirm resolves the guest name before creating,
    // so the create lands a tick after the clicks.)
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.filter((call) => call[0] === '/v1/reservations/CreateReservation'),
      ).toHaveLength(1);
    });
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
    expect(
      fetchMock.mock.calls.filter((call) => call[0] === '/v1/reservations/CreateReservation'),
    ).toHaveLength(1);
  });

  it('clears the quote when any stay input changes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quote(wrapper);
    expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
    await wrapper.find('[data-testid="book-room-type-id"]').setValue('suite');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(false);
    });
  });

  it('expires the session with the gate notice when quoting gets a 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    // The picker catalogue stays readable while the quote itself
    // gets the 401, so the test reaches the quote step.
    fetchMock.mockImplementation((url: string) =>
      url === '/v1/rooms/ListRoomTypes'
        ? Promise.resolve(jsonResponse({ roomTypes: [{ id: 'standard', name: 'Standard' }] }))
        : Promise.resolve(new Response('', { status: 401 })),
    );
    await fillStay(wrapper);
    await wrapper.find('[data-testid="book-quote"]').trigger('click');
    // The shared client expires the session and routes to the
    // gate (covered in the shell gate suite); the view keeps no
    // sign-in copy.
    await vi.waitFor(() => {
      expect(useSessionStore().token).toBeNull();
    });
    expect(useSessionStore().signOutNotice).toBe('session-expired');
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  // Sign-out moved to the shell gate (Refs #338, FR-DSP-2):
  // covered in the shell gate suite in `app/src/App.test.ts`.

  it('starts a new booking with cleared fields after a confirmation', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quoteAndConfirm(wrapper);
    expect(wrapper.find('[data-testid="book-confirmation"]').exists()).toBe(true);
    await wrapper.find('[data-testid="book-new-booking"]').trigger('click');
    expect((wrapper.find('[data-testid="book-guest-name"]').element as HTMLInputElement).value).toBe(
      '',
    );
    expect((wrapper.find('[data-testid="book-guest-id"]').element as HTMLInputElement).value).toBe(
      '',
    );
    expect(
      (wrapper.find('[data-testid="book-room-type-id"]').element as HTMLInputElement).value,
    ).toBe('');
    expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="book-confirmation"]').exists()).toBe(false);
  });

  it('copies the confirmation through the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quoteAndConfirm(wrapper);
    await wrapper.find('[data-testid="book-copy"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-copy-status"]').text()).toContain(
        'Confirmation copied',
      );
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(String(writeText.mock.calls[0]?.[0])).toContain('RSV-1');
  });

  it('reports a copy failure when no clipboard is available', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quoteAndConfirm(wrapper);
    // jsdom ships no navigator.clipboard: the hand-copy fallback
    // string renders (legacy parity for clipboard-less terminals).
    await wrapper.find('[data-testid="book-copy"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-copy-status"]').text()).toContain(
        'Select the confirmation text by hand',
      );
    });
  });

  it('prints the confirmation on staff action', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountBook();
    await signIn(wrapper, fetchMock);

    await quoteAndConfirm(wrapper);
    await wrapper.find('[data-testid="book-print"]').trigger('click');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('isolates the confirmation for print (legacy book.html parity)', () => {
    // jsdom applies no @media print rules, so this pins the
    // isolation at the SFC source: the port of
    // `frontend/book.html:8-19` must hide everything except the
    // booking wrapper, and within it everything except the
    // confirmation section.
    expect(bookViewSource).toContain('@media print');
    expect(bookViewSource).toContain(
      "[data-testid='book-view'] > :not([data-testid='book-booking'])",
    );
    expect(bookViewSource).toContain(
      "[data-testid='book-booking'] > :not([data-testid='book-confirmation'])",
    );
  });
});
