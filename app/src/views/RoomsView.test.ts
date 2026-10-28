// D6 guards for the Rooms visual map (Refs #424, AC-DSK-6,
// FR-DSK-6, LLD section 13.3): a read-only floor-grouped map whose
// summary counts always match the rendered cards, with per-card
// status chip, room type, and live note — and no per-card action
// buttons until the product-owner action-placement decision lands.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import RoomsView from './RoomsView.vue';
import { setLocale } from '../i18n';
import { resetConnectivityForTests } from '../api/client';
import { useSessionStore } from '../stores/session';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function localBusinessDate(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Seeded floors and statuses (AC-DSK-6): rooms across three floors
// in a mix of all five statuses, plus one room whose payload
// carries no floor.
function roomsByState(state: string): unknown[] {
  const all: Record<string, unknown[]> = {
    occupied: [
      { roomId: 'r-101', number: '101', roomTypeId: 'standard', state: 'occupied', floor: '1' },
      { roomId: 'r-104', number: '104', roomTypeId: 'suite', state: 'occupied', floor: '1' },
    ],
    'vacant-dirty': [
      { roomId: 'r-201', number: '201', roomTypeId: 'standard', state: 'vacant-dirty', floor: '2' },
    ],
    'vacant-clean': [
      { roomId: 'r-202', number: '202', roomTypeId: 'standard', state: 'vacant-clean', floor: '2' },
    ],
    'vacant-inspected': [
      { roomId: 'r-103', number: '103', roomTypeId: 'standard', state: 'vacant-inspected', floor: '1' },
      { roomId: 'r-106', number: '106', roomTypeId: 'deluxe', state: 'vacant-inspected', floor: '1' },
      { roomId: 'r-301', number: '301', roomTypeId: 'suite', state: 'vacant-inspected', floor: '3' },
    ],
    'out-of-order': [
      { roomId: 'r-102', number: '102', roomTypeId: 'standard', state: 'out-of-order', floor: '1' },
      { roomId: 'r-105', number: '105', roomTypeId: 'standard', state: 'out-of-order', floor: '1' },
      { roomId: 'r-401', number: '401', roomTypeId: 'standard', state: 'out-of-order' },
    ],
  };
  return all[state] ?? [];
}

function stubHappyPath(fetchMock: ReturnType<typeof vi.fn>, excludeRoomId?: string): void {
  const states = (state: string): unknown[] =>
    roomsByState(state).filter((room) => (room as { roomId?: string }).roomId !== excludeRoomId);
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const body = init?.body !== undefined ? JSON.parse(init.body as string) : {};
    if (url === '/v1/rooms/ListRoomsByState') {
      return Promise.resolve(jsonResponse({ state: body.state, rooms: states(body.state) }));
    }
    if (url === '/v1/rooms/ListRoomTypes') {
      return Promise.resolve(
        jsonResponse({
          roomTypes: [
            { id: 'standard', name: 'Standard' },
            { id: 'suite', name: 'Suite' },
            { id: 'deluxe', name: 'Deluxe' },
          ],
        }),
      );
    }
    if (url === '/v1/stay/ListArrivalsDepartures') {
      return Promise.resolve(
        jsonResponse({
          businessDate: body.businessDate,
          // Stay-a arrives today into room 103 (the upcoming-arrival
          // note); stay-b and stay-d are in house in rooms 101 and
          // 104; stay-c leaves without a room reference.
          arrivals: [{ stayId: 'stay-a', guestId: 'g-1', currentRoomId: 'r-103' }],
          inHouse: [
            { stayId: 'stay-b', guestId: 'g-2', roomId: 'r-101' },
            { stayId: 'stay-d', guestId: 'g-4', roomId: 'r-104' },
          ],
          departures: [{ stayId: 'stay-c' }],
        }),
      );
    }
    if (url === '/v1/guests/GetGuest') {
      const names: Record<string, string> = { 'g-1': 'Guest One', 'g-2': 'Guest Two', 'g-4': 'Guest Four' };
      return Promise.resolve(
        jsonResponse({ guestId: body.guestId, fullName: names[body.guestId] ?? body.guestId }),
      );
    }
    if (url === '/v1/reservations/QueryCalendar') {
      // Only stay-b carries a planned checkout date; stay-d has
      // none, so room 104 renders the guest-only note.
      return Promise.resolve(
        jsonResponse({
          dateFrom: body.dateFrom,
          dateTo: body.dateTo,
          reservations: [{ reservationRef: 'RSV-1', roomTypeId: 'standard', arrivalDate: '2026-10-26', departureDate: '2026-11-02', state: 'checked-in', stayId: 'stay-b' }],
        }),
      );
    }
    if (url === '/v1/rooms/CheckRoomTypeSellability') {
      // Room 102 carries a covering block (reason plus date per
      // the design); every other room reads as sellable today.
      if (body.roomNumber === '102') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'STATE_ILLEGAL',
              message: 'Room 102 is blocked.',
              details: {
                roomNumber: '102',
                dateFrom: '2026-10-28',
                dateTo: '2026-10-29',
                reason: 'AC repair',
              },
            },
            422,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({ roomType: body.roomType, dateFrom: body.dateFrom, dateTo: body.dateTo, totalCount: 1, sellableCount: 1, blockedRooms: [] }),
      );
    }
    throw new Error(`unexpected call ${url}`);
  });
}

function mountRooms() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(RoomsView, {
    global: { plugins: [pinia] },
  });
}

async function loadMap(wrapper: ReturnType<typeof mountRooms>, fetchMock: ReturnType<typeof vi.fn>) {
  // The shell owns the one sign-in gate (Refs #338): the view
  // mounts with a signed-in session preset, then loads like a
  // reload.
  stubHappyPath(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.find('[data-testid="rooms-refresh"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="rooms-summary"]').exists()).toBe(true);
  });
}

describe('rooms view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setLocale('en');
  });

  it('renders the map frame with the refresh action only', () => {
    const wrapper = mountRooms();
    expect(wrapper.find('[data-testid="rooms-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="rooms-view"] h1').text()).toBe('Room map');
    expect(wrapper.find('[data-testid="rooms-refresh"]').exists()).toBe(true);
  });

  // D6 (Refs #424, AC-DSK-6, FR-DSK-6, LLD section 13.3): the
  // summary counts always match the rendered room cards across all
  // five statuses — chips and cards derive from the one payload.
  it('renders summary counts that match the rendered cards across all five statuses', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountRooms();
    await loadMap(wrapper, fetchMock);

    const chipStatuses = [
      'ready',
      'occupied',
      'needs-cleaning',
      'awaiting-inspection',
      'out-of-service',
    ];
    let total = 0;
    for (const status of chipStatuses) {
      const chip = wrapper.find(`[data-testid="rooms-chip-${status}"]`);
      expect(chip.exists()).toBe(true);
      const match = chip.text().match(/\((\d+)\)/);
      expect(match).not.toBeNull();
      const count = Number(match?.[1]);
      expect(count).toBeGreaterThan(0);
      total += count;
    }
    const cards = wrapper.findAll('[data-testid^="rooms-card-"]')
      .filter((node) => /^rooms-card-\d+$/.test(String(node.attributes('data-testid'))));
    expect(cards).toHaveLength(total);
    expect(total).toBe(10);
    expect(wrapper.find('[data-testid="rooms-chip-ready"]').text()).toContain('(3)');
    expect(wrapper.find('[data-testid="rooms-chip-occupied"]').text()).toContain('(2)');
    expect(wrapper.find('[data-testid="rooms-chip-out-of-service"]').text()).toContain('(3)');
  });

  // D6 card half: every card shows its status chip, room type, and
  // the live note — occupant plus checkout date, out-of-service
  // reason plus date, or upcoming arrival.
  it('renders per-card chips, types, and live notes from live state', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountRooms();
    await loadMap(wrapper, fetchMock);

    // Occupied with a planned checkout date.
    expect(wrapper.find('[data-testid="rooms-card-chip-101"]').text()).toBe('Occupied');
    expect(wrapper.find('[data-testid="rooms-card-type-101"]').text()).toBe('Standard');
    expect(wrapper.find('[data-testid="rooms-card-note-101"]').text()).toBe('Guest Two · Checkout 2026-11-02');
    // Occupied with no joined checkout date renders the guest only.
    expect(wrapper.find('[data-testid="rooms-card-note-104"]').text()).toBe('Guest Four');
    // Out-of-service with a covering block names reason plus date.
    expect(wrapper.find('[data-testid="rooms-card-chip-102"]').text()).toBe('Out of order');
    expect(wrapper.find('[data-testid="rooms-card-note-102"]').text()).toBe('AC repair · 2026-10-28–2026-10-29');
    // Out-of-service with no covering block renders the catalogue
    // unknown-reason line, never blank.
    expect(wrapper.find('[data-testid="rooms-card-note-105"]').text()).toContain('Reason not recorded');
    // Ready with a linked arrival names the guest plus arrival date.
    expect(wrapper.find('[data-testid="rooms-card-chip-103"]').text()).toBe('Ready (inspected)');
    expect(wrapper.find('[data-testid="rooms-card-note-103"]').text()).toBe(`Guest One · Arriving ${localBusinessDate()}`);
    // Ready with no linked arrival still carries a note line.
    expect(wrapper.find('[data-testid="rooms-card-note-301"]').text()).toBe('Ready for check-in.');
    // Needs-cleaning and awaiting-inspection fallbacks.
    expect(wrapper.find('[data-testid="rooms-card-note-201"]').text()).toBe('Needs cleaning.');
    expect(wrapper.find('[data-testid="rooms-card-note-202"]').text()).toBe('Cleaned, awaiting inspection.');
    // No card ever renders a raw room-type UUID.
    expect(wrapper.find('[data-testid="rooms-view"]').text()).not.toContain('deluxe');
    expect(wrapper.find('[data-testid="rooms-card-type-106"]').text()).toBe('Deluxe');
  });

  // D6 read-only half (Refs #424 open question): the map offers
  // refresh only — no per-card action buttons render.
  it('is read-only with refresh as the only action', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountRooms();
    await loadMap(wrapper, fetchMock);

    const cardNodes = wrapper.findAll('[data-testid^="rooms-card-"]')
      .filter((node) => /^rooms-card-\d+$/.test(String(node.attributes('data-testid'))));
    for (const card of cardNodes) {
      expect(card.find('button').exists()).toBe(false);
    }
    expect(wrapper.findAll('button')).toHaveLength(1);
    expect(wrapper.findAll('button')[0]?.attributes('data-testid')).toBe('rooms-refresh');
  });

  it('groups cards by floor with an unknown-floor section for rooms without one', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountRooms();
    await loadMap(wrapper, fetchMock);

    const floorSections = wrapper.findAll('[data-testid="rooms-floor"]');
    expect(floorSections.map((section) => section.find('h2').text())).toEqual([
      'Floor 1',
      'Floor 2',
      'Floor 3',
    ]);
    // The [data-testid^="rooms-card-"] selector also matches the
    // per-card chip/type/note nodes, so count the card roots only.
    const cardRoots = (section: (typeof floorSections)[number]): number =>
      section
        .findAll('[data-testid^="rooms-card-"]')
        .filter((node) => /^rooms-card-\d+$/.test(String(node.attributes('data-testid')))).length;
    expect(cardRoots(floorSections[0]!)).toBe(6);
    expect(cardRoots(floorSections[1]!)).toBe(2);
    expect(cardRoots(floorSections[2]!)).toBe(1);
    // The room whose payload carries no floor still renders.
    const unknown = wrapper.find('[data-testid="rooms-floor-unknown"]');
    expect(unknown.exists()).toBe(true);
    expect(unknown.find('h2').text()).toBe('Rooms without a listed floor');
    expect(unknown.find('[data-testid="rooms-card-401"]').exists()).toBe(true);
  });

  // Refs #420 fix, re-pinned here: the out-of-service note resolves
  // through CheckRoomTypeSellability, whose request field is
  // roomType (name or id) — the contract rejects roomTypeId.
  it('sends roomType, never roomTypeId, on every sellability read', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountRooms();
    await loadMap(wrapper, fetchMock);

    const calls = fetchMock.mock.calls.filter((call) => call[0] === '/v1/rooms/CheckRoomTypeSellability');
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const body = JSON.parse(call[1].body as string) as Record<string, unknown>;
      expect(body.roomType).toBeTruthy();
      expect(body).not.toHaveProperty('roomTypeId');
    }
  });

  it('refreshes counts from the latest payload on refresh', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountRooms();
    await loadMap(wrapper, fetchMock);
    expect(wrapper.find('[data-testid="rooms-chip-ready"]').text()).toContain('(3)');

    // Housekeeping completes overnight: room 106 leaves the ready
    // pool, so the next refresh recomputes the chips.
    stubHappyPath(fetchMock, 'r-106');
    await wrapper.find('[data-testid="rooms-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="rooms-chip-ready"]').text()).toContain('(2)');
    });
  });

  it('renders one plain-words error when the state read fails', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [] }));
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        return Promise.resolve(jsonResponse({ code: 'VALIDATION_FAILED', message: 'Nope.' }, 500));
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
    expect(wrapper.find('[data-testid="rooms-summary"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid^="rooms-card-"]').length).toBe(0);
  });

  it('renders the explicit empty state when no rooms exist', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const body = init?.body !== undefined ? JSON.parse(init.body as string) : {};
      if (url === '/v1/rooms/ListRoomsByState') {
        return Promise.resolve(jsonResponse({ state: body.state, rooms: [] }));
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [] }));
      }
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(jsonResponse({ businessDate: body.businessDate, arrivals: [], inHouse: [], departures: [] }));
      }
      throw new Error(`unexpected call ${url}`);
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    const wrapper = mount(RoomsView, { global: { plugins: [pinia] } });
    await wrapper.find('[data-testid="rooms-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="rooms-empty"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="rooms-summary"]').exists()).toBe(false);
  });

  it('renders VI copy after the locale switch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountRooms();
    await loadMap(wrapper, fetchMock);
    setLocale('vi');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="rooms-view"] h1').text()).toBe('Sơ đồ phòng');
    expect(wrapper.find('[data-testid="rooms-chip-ready"]').text()).toContain('Sẵn sàng (đã kiểm tra)');
  });
});
