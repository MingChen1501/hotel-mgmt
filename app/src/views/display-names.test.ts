// Characterization guard for issue #370 (desk UI shows human names,
// not IDs): every covered screen resolves room UUIDs to room numbers,
// guest UUIDs to guest names, and room-type UUIDs to an explicit
// catalogue label (no room-type name read exists yet — the follow-up
// tracks it) so no UUID leaks into user-visible entity text.
//
// Out of scope here, by the issue: stay/folio/invoice/payment/receipt
// document numbers stay system references in status lines and print
// documents, so the assertions below cover entity-display areas
// (lists, room labels, type labels, guest names, read-backs, folio
// item lines, confirmation pairs) rather than the whole view text.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import BookView from './BookView.vue';
import DeskView from './DeskView.vue';
import FolioView from './FolioView.vue';
import PrintView from './PrintView.vue';
import StayView from './StayView.vue';
import { useSessionStore } from '../stores/session';
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

function localBusinessDate(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// UUID-shaped fixtures: the backend identifies rooms, guests, and
// room types by UUID, so the stubs below prove the UI never renders
// those values as-is.
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ROOM_TYPE_UUID = '11111111-2222-3333-4444-555555555555';
const GUEST_UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const ROOM_UUID = '99999999-8888-7777-6666-555555555555';
const UNMAPPED_ROOM_UUID = '00000000-1111-2222-3333-444444444444';

function mountView(component: Parameters<typeof mount>[0]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(component, {
    global: { plugins: [pinia] },
  });
}

describe('display names instead of IDs (issue #370)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('desk lists show guest names and room numbers, never raw UUIDs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = parseBody(init);
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(
          jsonResponse({
            businessDate: localBusinessDate(),
            arrivals: [{ stayId: 'stay-a', guestId: GUEST_UUID, currentRoomId: ROOM_UUID }],
            inHouse: [{ stayId: 'stay-b', guestId: 'g-missing', roomId: UNMAPPED_ROOM_UUID }],
            departures: [],
          }),
        );
      }
      if (url === '/v1/guests/GetGuest') {
        if (body.guestId === GUEST_UUID) {
          return Promise.resolve(jsonResponse({ guestId: GUEST_UUID, fullName: 'Guest One' }));
        }
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'unknown guest' }, 404));
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(
          jsonResponse({ roomTypes: [{ id: ROOM_TYPE_UUID, name: 'Deluxe' }] }),
        );
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        if (body.state === 'occupied') {
          return Promise.resolve(
            jsonResponse({
              state: 'occupied',
              rooms: [{ roomId: ROOM_UUID, number: '201', roomTypeId: ROOM_TYPE_UUID, state: 'occupied' }],
            }),
          );
        }
        if (body.state === 'vacant-dirty') {
          return Promise.resolve(
            jsonResponse({
              state: 'vacant-dirty',
              rooms: [{ roomId: 'r-dirty', number: '101', roomTypeId: ROOM_TYPE_UUID, state: 'vacant-dirty' }],
            }),
          );
        }
        return Promise.resolve(jsonResponse({ state: body.state, rooms: [] }));
      }
      if (url === '/v1/reporting/DailySheet') {
        return Promise.resolve(
          jsonResponse({
            businessDate: localBusinessDate(),
            arrivals: [],
            inHouse: [],
            departures: [],
            openBalances: [],
            asOf: '',
          }),
        );
      }
      if (url === '/backup-report.json') {
        return Promise.resolve(jsonResponse({ outcome: 'success', line: 'Backup ok', support: '' }));
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountView(DeskView);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-arrivals-table"]').text()).toContain('Guest One');
    });

    const arrivals = wrapper.find('[data-testid="desk-arrivals-table"]').text();
    expect(arrivals).toContain('201');
    expect(arrivals).not.toMatch(UUID_PATTERN);
    // A stay whose room is in no housekeeping state names no number,
    // and a failed guest lookup names no guest ID.
    const inHouse = wrapper.find('[data-testid="desk-inhouse-table"]').text();
    expect(inHouse).toContain('Room number unavailable');
    expect(inHouse).toContain('Unknown guest');
    expect(inHouse).not.toMatch(UUID_PATTERN);
    // Attention rows name the number with the resolved type name.
    const dirty = wrapper.find('[data-testid="desk-dirty-list"]').text();
    expect(dirty).toContain('101');
    expect(dirty).toContain('Deluxe');
    expect(dirty).not.toMatch(UUID_PATTERN);
  });

  it('stay lists and check-in status show names and numbers, never raw UUIDs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = parseBody(init);
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(
          jsonResponse({
            businessDate: localBusinessDate(),
            arrivals: [],
            inHouse: [
              { stayId: 'stay-1', guestId: GUEST_UUID, roomId: ROOM_UUID },
              { stayId: 'stay-2', guestId: 'g-missing', roomId: UNMAPPED_ROOM_UUID },
            ],
            departures: [],
          }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(
          jsonResponse({ roomTypes: [{ id: ROOM_TYPE_UUID, name: 'Deluxe' }] }),
        );
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        if (body.state === 'occupied') {
          return Promise.resolve(
            jsonResponse({
              state: 'occupied',
              rooms: [{ roomId: ROOM_UUID, number: '201', roomTypeId: ROOM_TYPE_UUID, state: 'occupied' }],
            }),
          );
        }
        if (body.state === 'vacant-inspected') {
          return Promise.resolve(
            jsonResponse({
              state: 'vacant-inspected',
              rooms: [{ roomId: 'room-1', number: '101', roomTypeId: ROOM_TYPE_UUID, state: 'vacant-inspected' }],
            }),
          );
        }
        return Promise.resolve(jsonResponse({ state: body.state, rooms: [] }));
      }
      if (url === '/v1/guests/GetGuest') {
        if (body.guestId === GUEST_UUID) {
          return Promise.resolve(jsonResponse({ guestId: GUEST_UUID, fullName: 'Guest One' }));
        }
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'unknown guest' }, 404));
      }
      if (url === '/v1/reservations/QueryCalendar') {
        return Promise.resolve(
          jsonResponse({
            dateFrom: body.dateFrom ?? null,
            dateTo: body.dateTo ?? null,
            reservations: [
              {
                reservationRef: 'RSV-9',
                roomTypeId: ROOM_TYPE_UUID,
                arrivalDate: localBusinessDate(),
                departureDate: localBusinessDate(),
                state: 'confirmed',
              },
            ],
          }),
        );
      }
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            roomTypeId: ROOM_TYPE_UUID,
            arrivalDate: localBusinessDate(),
            departureDate: localBusinessDate(),
            guest: { guestId: GUEST_UUID, fullName: 'Guest Nine' },
            state: 'confirmed',
          }),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountView(StayView);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="stay-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-inhouse-table"]').text()).toContain('Guest One');
    });

    const inHouse = wrapper.find('[data-testid="stay-inhouse-table"]').text();
    expect(inHouse).toContain('201');
    expect(inHouse).toContain('Room number unavailable');
    expect(inHouse).toContain('Unknown guest');
    expect(inHouse).not.toMatch(UUID_PATTERN);
    // Expected arrivals (calendar-backed) name the guest with the
    // resolved type name instead of the raw type UUID.
    const arrivals = wrapper.find('[data-testid="stay-arrivals-table"]').text();
    expect(arrivals).toContain('Guest Nine');
    expect(arrivals).toContain('Deluxe');
    expect(arrivals).not.toMatch(UUID_PATTERN);
  });

  it('book confirmation names the guest and labels the room type, never raw UUIDs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/guests/IdentifyGuest') {
        return Promise.resolve(jsonResponse({ guestId: GUEST_UUID, fullName: 'Guest One' }));
      }
      if (url === '/v1/rates/QuotePrice') {
        return Promise.resolve(
          jsonResponse({
            roomTypeId: ROOM_TYPE_UUID,
            arrivalDate: '2026-11-01',
            departureDate: '2026-11-03',
            discountName: null,
            nights: [{ nightDate: '2026-11-01', priceMinor: 10000 }],
            totalMinor: 10000,
          }),
        );
      }
      if (url === '/v1/rooms/CheckRoomTypeSellability') {
        return Promise.resolve(jsonResponse({ sellableCount: 2 }));
      }
      if (url === '/v1/reservations/CreateReservation') {
        return Promise.resolve(
          jsonResponse({ reservationRef: 'RSV-9', quotedTotal: 10000, reservationId: 'r-1', stayId: null }),
        );
      }
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            roomTypeId: ROOM_TYPE_UUID,
            arrivalDate: '2026-11-01',
            departureDate: '2026-11-03',
            guest: { guestId: GUEST_UUID, fullName: 'Guest One' },
            priceBasis: { totalMinor: 10000, discountName: null },
            state: 'confirmed',
          }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(
          jsonResponse({ roomTypes: [{ id: ROOM_TYPE_UUID, name: 'Deluxe' }] }),
        );
      }
      if (url === '/v1/guests/AttachReservation') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (url === '/v1/guests/ProduceConfirmation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            hotel: { name: 'Grand Hotel' },
            guest: { fullName: 'Guest One' },
            dates: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
            type: ROOM_TYPE_UUID,
            price: { amountMinor: 10000, currency: 'USD' },
          }),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountView(BookView);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.vm.$nextTick();
    await vi.waitFor(() => {
      expect(
        wrapper.find(`[data-testid="book-room-type-id"] option[value="${ROOM_TYPE_UUID}"]`).exists(),
      ).toBe(true);
    });
    await wrapper.find('[data-testid="book-arrival-date"]').setValue('2026-11-01');
    await wrapper.find('[data-testid="book-departure-date"]').setValue('2026-11-03');
    await wrapper.find('[data-testid="book-room-type-id"]').setValue(ROOM_TYPE_UUID);
    await wrapper.find('[data-testid="book-quote"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-quote-section"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="book-guest-id"]').setValue(GUEST_UUID);
    await wrapper.find('[data-testid="book-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="book-result"]').exists()).toBe(true);
    });

    const readback = wrapper.find('[data-testid="book-booking-readback"]').text();
    expect(readback).toContain('Guest One');
    expect(readback).not.toMatch(UUID_PATTERN);
    const confirmation = wrapper.find('[data-testid="book-confirmation-body"]').text();
    expect(confirmation).toContain('Guest One');
    expect(confirmation).toContain('Deluxe');
    expect(confirmation).not.toMatch(UUID_PATTERN);
    // The exact room-type ID hides behind the reference details.
    await wrapper.find('[data-testid="book-details-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="book-details-body"]').text()).toContain(ROOM_TYPE_UUID);
  });

  it('folio lines name items and methods, never raw UUIDs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: 's-1',
            balanceMinor: 7700,
            charges: [
              { itemKind: 'nightly-room-charge', itemName: 'Room night', amountMinor: 7200, postedAt: '2026-10-26T10:00:00Z' },
            ],
            payments: [{ method: 'cash', amountMinor: 500, paidAt: '2026-10-26T11:00:00Z' }],
          }),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountView(FolioView);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="folio-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="folio-open"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="folio-table"]').text()).toContain('Room night');
    });

    const table = wrapper.find('[data-testid="folio-table"]').text();
    expect(table).toContain('Room night');
    expect(table).toContain('cash payment');
    expect(table).not.toMatch(UUID_PATTERN);
  });

  it('print confirmation labels the room type instead of the raw UUID', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            roomTypeId: ROOM_TYPE_UUID,
            arrivalDate: '2026-11-01',
            departureDate: '2026-11-03',
            guest: { guestId: GUEST_UUID, fullName: 'Guest One' },
            priceBasis: { totalMinor: 10000 },
          }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(
          jsonResponse({ roomTypes: [{ id: ROOM_TYPE_UUID, name: 'Deluxe' }] }),
        );
      }
      if (url === '/v1/guests/AttachReservation') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      if (url === '/v1/guests/ProduceConfirmation') {
        return Promise.resolve(
          jsonResponse({
            reservationRef: 'RSV-9',
            hotel: { name: 'Grand Hotel' },
            guest: { fullName: 'Guest One' },
            dates: { checkIn: '2026-11-01', checkOut: '2026-11-03' },
            type: ROOM_TYPE_UUID,
            price: { amountMinor: 10000, currency: 'USD' },
          }),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountView(PrintView);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="print-ref"]').setValue('RSV-9');
    await wrapper.find('[data-testid="print-load"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="print-confirmation-body"]').exists()).toBe(true);
    });

    const confirmation = wrapper.find('[data-testid="print-confirmation-body"]').text();
    expect(confirmation).toContain('Guest One');
    expect(confirmation).toContain('Deluxe');
    expect(confirmation).not.toMatch(UUID_PATTERN);
    // The exact room-type ID hides behind the reference details.
    await wrapper.find('[data-testid="print-confirmation-details-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="print-confirmation-details-body"]').text()).toContain(
      ROOM_TYPE_UUID,
    );
  });
});
