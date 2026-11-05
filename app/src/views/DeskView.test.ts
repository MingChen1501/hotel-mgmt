// Characterization guard for the desk screen migration
// (Refs #293, ADR-0003): DeskView replicates the `frontend/desk.html`
// inline-script behaviour — sign-in plus the read-only morning view
// (arrivals, in-house, departures, rooms needing attention, and the
// DailySheet cross-check line) — through the shared Bearer client
// and the catalogue `t()` wrapper. No Playwright harness exists in
// this repo yet, so these Vitest component tests are the
// characterization coverage for the desk flows.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount, RouterLinkStub } from '@vue/test-utils';
import DeskView from './DeskView.vue';
import { useSessionStore } from '../stores/session';
import { setLocale } from '../i18n';
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

function localBusinessDate(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface StayPayload {
  stayId: string;
  guestId?: string;
  currentRoomId?: string;
  roomId?: string;
}

// Full happy-path backend: sign-in, the three stay lists with one
// stay each, guest reads, the three room-state lists, DailySheet.
function stubHappyPath(fetchMock: ReturnType<typeof vi.fn>): void {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const body = init?.body !== undefined ? JSON.parse(init.body as string) : {};
    if (url === '/v1/admin/SignIn') {
      return Promise.resolve(
        jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
      );
    }
    if (url === '/v1/stay/ListArrivalsDepartures') {
      expect(body.businessDate).toBe(localBusinessDate());
      return Promise.resolve(
        jsonResponse({
          businessDate: body.businessDate,
          arrivals: [{ stayId: 'stay-a', guestId: 'g-1', currentRoomId: 'r-101' }],
          inHouse: [{ stayId: 'stay-b', guestId: 'g-2', roomId: 'r-102' }],
          departures: [{ stayId: 'stay-c' }],
        }),
      );
    }
    if (url === '/v1/guests/GetGuest') {
      const names: Record<string, string> = { 'g-1': 'Guest One', 'g-2': 'Guest Two' };
      return Promise.resolve(
        jsonResponse({ guestId: body.guestId, fullName: names[body.guestId] ?? body.guestId }),
      );
    }
    if (url === '/v1/rooms/ListRoomsByState') {
      // Refs #370: stay rooms resolve through the occupied state,
      // attention rooms through their own states. Floors ride the
      // same payload (Refs #479): the desk room map groups by them.
      const rooms: Record<string, unknown[]> = {
        'vacant-dirty': [{ roomId: 'r-1', number: '101', roomTypeId: 'standard', state: 'vacant-dirty', floor: '1' }],
        'vacant-clean': [{ roomId: 'r-2', number: '102', roomTypeId: 'standard', state: 'vacant-clean', floor: '1' }],
        'out-of-order': [{ roomId: 'r-3', number: '103', roomTypeId: 'suite', state: 'out-of-order' }],
        occupied: [
          { roomId: 'r-101', number: '201', roomTypeId: 'standard', state: 'occupied', floor: '2' },
          { roomId: 'r-102', number: '202', roomTypeId: 'standard', state: 'occupied', floor: '2' },
        ],
      };
      return Promise.resolve(jsonResponse({ state: body.state, rooms: rooms[body.state] ?? [] }));
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
    if (url === '/v1/rooms/UpdateRoomState') {
      return Promise.resolve(
        jsonResponse({
          roomNumber: body.roomNumber,
          oldState: body.newState === 'vacant-inspected' ? 'vacant-clean' : 'vacant-dirty',
          newState: body.newState,
        }),
      );
    }
    if (url === '/v1/rooms/CheckRoomTypeSellability') {
      // Room 103 carries a covering block (reason plus date per
      // the design); every other room reads as sellable today.
      if (body.roomNumber === '103') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'STATE_ILLEGAL',
              message: 'Room 103 is blocked.',
              details: {
                roomNumber: '103',
                dateFrom: '2026-10-28',
                dateTo: '2026-10-30',
                reason: 'Pipe repair',
              },
            },
            422,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({ roomTypeId: body.roomType, dateFrom: body.dateFrom, dateTo: body.dateTo, totalCount: 1, sellableCount: 1, blockedRooms: [] }),
      );
    }
    if (url === '/v1/reservations/QueryCalendar') {
      // Stay-b is the only in-house stay: its planned checkout
      // date rides the calendar join (Refs #420).
      return Promise.resolve(
        jsonResponse({
          dateFrom: body.dateFrom,
          dateTo: body.dateTo,
          reservations: [{ reservationRef: 'RSV-1', roomTypeId: 'standard', arrivalDate: '2026-10-26', departureDate: '2026-11-02', state: 'checked-in', stayId: 'stay-b' }],
        }),
      );
    }
    if (url === '/v1/reporting/DailySheet') {
      return Promise.resolve(
        jsonResponse({
          businessDate: body.businessDate,
          arrivals: [{ kind: 'stay', ref: 'stay-a' }],
          inHouse: [{ kind: 'stay', ref: 'stay-b' }],
          departures: [{ kind: 'stay', ref: 'stay-c' }],
          openBalances: [{ kind: 'stay', ref: 'stay-b' }],
          asOf: '2026-10-26T08:00:00Z',
        }),
      );
    }
    if (url === '/v1/admin/SignOut') {
      return Promise.resolve(jsonResponse({ ok: true }));
    }
    throw new Error(`unexpected call ${url}`);
  });
}

function mountDesk() {
  const pinia = createPinia();
  setActivePinia(pinia);
  // RouterLink renders through the canonical stub: navigation stays
  // declarative (`:to="{ name: 'rooms' }"`) while tests assert the
  // target without a router instance (Refs #479).
  return mount(DeskView, {
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } },
  });
}

function roomLinkTo(wrapper: ReturnType<typeof mountDesk>, testid: string): unknown {
  const link = wrapper
    .findAllComponents(RouterLinkStub)
    .find((candidate) => candidate.attributes('data-testid') === testid);
  expect(link !== undefined, `expected a room-map link ${testid}`).toBe(true);
  return link?.props('to');
}

async function signIn(wrapper: ReturnType<typeof mountDesk>, fetchMock: ReturnType<typeof vi.fn>) {
  // The shell owns the one sign-in gate (Refs #338): views mount
  // with a signed-in session preset, then load like a reload.
  stubHappyPath(fetchMock);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="desk-dashboard"]').exists()).toBe(true);
  });
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="desk-sheet-line"]').text()).toContain('open balances');
  });
}

describe('desk view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the dashboard frame with no per-screen sign-in copy', () => {
    const wrapper = mountDesk();
    expect(wrapper.find('[data-testid="desk-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the heading resolves through t().
    expect(wrapper.find('[data-testid="desk-view"] h1').text()).toContain(
      'arrivals, stays, and rooms needing attention',
    );
    // The shell owns the one sign-in gate (Refs #338, FR-DSP-2):
    // no per-screen sign-in copy renders here anymore.
    expect(wrapper.find('[data-testid="desk-signin"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="desk-dashboard"]').exists()).toBe(true);
  });

  it('loads the dashboard for a signed-in session over Bearer calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    // Bearer session handling: the shared client attaches the token
    // to every call (the sign-in itself happened in the shell gate).
    // Refs #489: the desk no longer loads the backup feed, so every
    // fetch here carries the session token.
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
    expect(wrapper.find('[data-testid="desk-dashboard-error"]').exists()).toBe(false);
  });

  it('renders arrivals, in-house, and departures with resolved guest names', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    expect(wrapper.find('[data-testid="desk-business-date"]').text()).toBe(localBusinessDate());
    const arrivals = wrapper.find('[data-testid="desk-arrivals-table"]').text();
    expect(arrivals).toContain('Guest One');
    expect(arrivals).toContain('201');
    expect(arrivals).not.toContain('r-101');
    // Design card detail (Refs #420): arrivals name the room with
    // its human type label.
    expect(arrivals).toContain('Standard');
    const inHouse = wrapper.find('[data-testid="desk-inhouse-table"]').text();
    expect(inHouse).toContain('Guest Two');
    expect(inHouse).toContain('202');
    expect(inHouse).not.toContain('r-102');
    // Design card detail (Refs #420): in-house rows name the
    // planned checkout date joined from the calendar.
    expect(inHouse).toContain('Standard');
    expect(inHouse).toContain('Checkout 2026-11-02');
    // A stay with no room reference renders the catalogue fallback.
    const departures = wrapper.find('[data-testid="desk-departures-table"]').text();
    expect(departures).toContain('Not assigned');
  });

  // D2 (Refs #420, AC-DSK-2, FR-DSK-2): the Main board renders its
  // five design cards — arrivals, in-house, departures (or its
  // explicit empty state), need-cleaning with the two housekeeping
  // buttons, and out-of-service with reason and date.
  it('renders the five design cards with housekeeping buttons and the out-of-service note', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    for (const card of [
      'desk-arrivals-card',
      'desk-inhouse-card',
      'desk-departures-card',
      'desk-need-cleaning-card',
      'desk-outofservice-card',
    ]) {
      expect(wrapper.find(`[data-testid="${card}"]`).exists()).toBe(true);
    }
    // The two housekeeping buttons ride the need-cleaning card.
    expect(wrapper.find('[data-testid="desk-mark-cleaned-101"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="desk-mark-cleaned-101"]').text()).toContain('Mark cleaned');
    expect(wrapper.find('[data-testid="desk-mark-inspected-102"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="desk-mark-inspected-102"]').text()).toContain('Mark inspected');
    // Out-of-service room 103 names its covering-block reason plus
    // date (Refs #420), never a bare number.
    const note = wrapper.find('[data-testid="desk-outoforder-note-103"]').text();
    expect(note).toContain('Pipe repair');
    expect(note).toContain('2026-10-28');
    expect(note).toContain('2026-10-30');
    // VI-primary copy (AC-DSK-8): the whole card switches locale
    // with no mixed-locale copy.
    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="desk-mark-cleaned-101"]').text()).toContain('Đánh dấu đã dọn');
      expect(wrapper.find('[data-testid="desk-mark-inspected-102"]').text()).toContain('Đánh dấu đã kiểm tra');
    } finally {
      setLocale('en');
    }
  });

  // Refs #420: the out-of-service note resolves through the
  // CheckRoomTypeSellability contract, whose request field is
  // `roomType` (name or id) — never `roomTypeId`.
  it('queries sellability with the contract roomType field', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    const sellabilityCalls = fetchMock.mock.calls.filter(
      (call) => call[0] === '/v1/rooms/CheckRoomTypeSellability',
    );
    expect(sellabilityCalls.length).toBeGreaterThan(0);
    for (const call of sellabilityCalls) {
      const body = JSON.parse(call[1].body as string);
      expect(body.roomType).toBeTruthy();
      expect(body).not.toHaveProperty('roomTypeId');
    }
    // Room 103 (a suite) still resolves its covering-block note.
    const bodies = sellabilityCalls.map((call) => JSON.parse(call[1].body as string));
    expect(bodies.find((body) => body.roomNumber === '103')?.roomType).toBe('suite');
  });

  it('advances dirty-to-clean through the clean button and refreshes the board counts', async () => {
    const states: Record<string, Array<{ roomId: string; number: string; roomTypeId: string; state: string }>> = {
      'vacant-dirty': [{ roomId: 'r-1', number: '101', roomTypeId: 'standard', state: 'vacant-dirty' }],
      'vacant-clean': [{ roomId: 'r-2', number: '102', roomTypeId: 'standard', state: 'vacant-clean' }],
      'vacant-inspected': [],
      occupied: [],
      'out-of-order': [],
    };
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const body = init?.body !== undefined ? JSON.parse(init.body as string) : {};
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(jsonResponse({ businessDate: body.businessDate, arrivals: [], inHouse: [], departures: [] }));
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [{ id: 'standard', name: 'Standard' }] }));
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        return Promise.resolve(jsonResponse({ state: body.state, rooms: states[body.state] ?? [] }));
      }
      if (url === '/v1/rooms/UpdateRoomState') {
        expect(body.roomNumber).toBe('101');
        expect(body.newState).toBe('vacant-clean');
        expect(body.actor).toBe('Ada Owner');
        for (const list of Object.values(states)) {
          const at = list.findIndex((room) => room.number === body.roomNumber);
          if (at >= 0) {
            const [moved] = list.splice(at, 1);
            states[body.newState]?.push({ ...(moved as { roomId: string; number: string; roomTypeId: string; state: string }), state: body.newState });
          }
        }
        return Promise.resolve(jsonResponse({ roomNumber: body.roomNumber, oldState: 'vacant-dirty', newState: body.newState }));
      }
      if (url === '/v1/reporting/DailySheet') {
        return Promise.resolve(
          jsonResponse({ businessDate: body.businessDate, arrivals: [], inHouse: [], departures: [], openBalances: [], asOf: '' }),
        );
      }
      throw new Error(`unexpected call ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-mark-cleaned-101"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="desk-board-lane-dirty"]').text()).toContain('(1)');

    await wrapper.find('[data-testid="desk-mark-cleaned-101"]').trigger('click');
    // Success reloads the board: room 101 leaves the dirty lane and
    // the counts match the rendered lanes by construction.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).not.toContain('101');
    });
    expect(wrapper.find('[data-testid="desk-uninspected-list"]').text()).toContain('101');
    expect(wrapper.find('[data-testid="desk-board-lane-dirty"]').text()).toContain('(0)');
    expect(wrapper.find('[data-testid="desk-board-lane-clean"]').text()).toContain('(2)');
    expect(wrapper.find('[data-testid="desk-housekeeping-error"]').exists()).toBe(false);
  });

  it('advances clean-to-inspected through the inspect button', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    stubHappyPath(fetchMock);
    const happyImpl = fetchMock.getMockImplementation();
    // Inspect moves room 102 clean-to-inspected (Refs #420).
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/UpdateRoomState') {
        const body = init?.body !== undefined ? JSON.parse(init.body as string) : {};
        expect(body).toMatchObject({ roomNumber: '102', newState: 'vacant-inspected', actor: 'Ada Owner' });
        return Promise.resolve(jsonResponse({ roomNumber: '102', oldState: 'vacant-clean', newState: 'vacant-inspected' }));
      }
      return (happyImpl as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    const wrapper = mountDesk();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-mark-inspected-102"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="desk-mark-inspected-102"]').trigger('click');
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) => call[0] === '/v1/rooms/UpdateRoomState' && JSON.parse(call[1].body as string).newState === 'vacant-inspected',
        ),
      ).toBe(true);
    });
    expect(wrapper.find('[data-testid="desk-housekeeping-error"]').exists()).toBe(false);
  });

  it('reads a refused housekeeping transition as one plain sentence with the board untouched', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    stubHappyPath(fetchMock);
    const happyImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/UpdateRoomState') {
        return Promise.resolve(
          jsonResponse(
            { code: 'STATE_ILLEGAL', message: 'Illegal transition.', details: { roomNumber: '101', oldState: 'vacant-dirty', newState: 'vacant-clean' } },
            422,
          ),
        );
      }
      return (happyImpl as (url: string, init?: RequestInit) => Promise<Response>)(url, init);
    });
    const wrapper = mountDesk();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-mark-cleaned-101"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="desk-mark-cleaned-101"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-housekeeping-error"]').exists()).toBe(true);
    });
    // Plain words naming the room (FR-DSP-3): no technical code.
    expect(wrapper.find('[data-testid="desk-housekeeping-error"]').text()).toContain('Could not update room 101');
    expect(wrapper.find('[data-testid="desk-housekeeping-error"]').text()).not.toContain('STATE_ILLEGAL');
    // The refused press changes nothing: room 101 still needs cleaning.
    expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).toContain('101');
  });

  it('renders the attention lists and the DailySheet cross-check line', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).toContain('101');
    expect(wrapper.find('[data-testid="desk-uninspected-list"]').text()).toContain('102');
    expect(wrapper.find('[data-testid="desk-outoforder-list"]').text()).toContain('103');
    // Attention rows name the room number with the resolved type
    // name (issue #372), never the raw type UUID.
    expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).toContain('Standard');
    expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).not.toContain('standard');
    expect(wrapper.find('[data-testid="desk-outoforder-list"]').text()).toContain('Suite');
    expect(wrapper.find('[data-testid="desk-outoforder-list"]').text()).not.toContain('suite');
    const sheet = wrapper.find('[data-testid="desk-sheet-line"]').text();
    expect(sheet).toContain('1 arriving');
    expect(sheet).toContain('1 in house');
    expect(sheet).toContain('1 leaving');
    expect(sheet).toContain('1 open balances');
  });

  it('renders the five-lane room board with occupants on the occupied lane', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    // Refs #371: the board reuses the five ListRoomsByState reads —
    // every room appears exactly once, grouped by state.
    expect(wrapper.find('[data-testid="desk-board"]').exists()).toBe(true);
    const occupiedLane = wrapper.find('[data-testid="desk-board-lane-occupied"]');
    expect(occupiedLane.text()).toContain('201');
    expect(occupiedLane.text()).toContain('Guest One');
    expect(occupiedLane.text()).toContain('202');
    expect(occupiedLane.text()).toContain('Guest Two');
    expect(wrapper.find('[data-testid="desk-board-lane-dirty"]').text()).toContain('101');
    expect(wrapper.find('[data-testid="desk-board-lane-clean"]').text()).toContain('102');
    expect(wrapper.find('[data-testid="desk-board-lane-out-of-order"]').text()).toContain('103');
    // The inspected-ready lane is empty in this stub: a plain-words
    // empty state, same pattern as the attention lists.
    expect(wrapper.find('[data-testid="desk-board-lane-ready"]').text()).toContain(
      'No rooms in this state right now.',
    );
    // Board cells carry human numbers, never raw room UUIDs.
    expect(wrapper.find('[data-testid="desk-board"]').text()).not.toContain('r-101');
    expect(wrapper.find('[data-testid="desk-board"]').text()).not.toContain('r-102');
  });

  it('falls back to the unknown-guest catalogue string when GetGuest fails', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada', role: 'owner' }),
        );
      }
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(
          jsonResponse({
            businessDate: localBusinessDate(),
            arrivals: [{ stayId: 'stay-x', guestId: 'g-missing' } as StayPayload],
            inHouse: [],
            departures: [],
          }),
        );
      }
      if (url === '/v1/guests/GetGuest') {
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'unknown guest' }, 404));
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        return Promise.resolve(jsonResponse({ state: 'x', rooms: [] }));
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
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountDesk();
    useSessionStore().signIn('tok-1', 'Ada', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-arrivals-table"]').text()).toContain('Unknown guest');
    });
  });

  it('shows plain-words empty states when every list is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada', role: 'owner' }),
        );
      }
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(
          jsonResponse({ businessDate: localBusinessDate(), arrivals: [], inHouse: [], departures: [] }),
        );
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        return Promise.resolve(jsonResponse({ state: 'x', rooms: [] }));
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
      throw new Error(`unexpected call ${url}`);
    });
    const wrapper = mountDesk();
    useSessionStore().signIn('tok-1', 'Ada', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-arrivals-table"]').text()).toContain(
        'No arrivals today. New bookings appear here.',
      );
    });
    expect(wrapper.find('[data-testid="desk-inhouse-table"]').text()).toContain(
      'No guests in house right now.',
    );
    expect(wrapper.find('[data-testid="desk-departures-table"]').text()).toContain(
      'No departures today.',
    );
    expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).toContain(
      'No dirty rooms right now.',
    );
    // Refs #371: all five board lanes share the same empty wording.
    expect(wrapper.find('[data-testid="desk-board-lane-occupied"]').text()).toContain(
      'No rooms in this state right now.',
    );
  });

  it('reads a transport failure as one plain sentence with no technical code', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    // A 500 carries no envelope code: the dashboard error must
    // still read as a plain sentence (FR-DSP-3, M3).
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-dashboard-error"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="desk-dashboard-error"]').text()).toContain(
      'That did not work. Try again; if it keeps failing, tell the manager.',
    );
    expect(wrapper.find('[data-testid="desk-dashboard-error"]').text()).not.toContain('500');
  });

  it('expires the session with the gate notice when refresh gets a 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    // The shared client expires the session and routes to the
    // gate (the shell shows the expired notice there — covered
    // in the shell gate suite); the view keeps no sign-in copy.
    await vi.waitFor(() => {
      expect(useSessionStore().token).toBeNull();
    });
    expect(useSessionStore().signOutNotice).toBe('session-expired');
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  // Sign-in failure, locked-identity, and sign-out round trips
  // moved to the shell gate suite (Refs #338, FR-DSP-2): the shell
  // owns the one sign-in form, so `app/src/App.test.ts` covers the
  // plain-sentence failure, the distinct locked wording, the
  // expired notice, and sign-out back to the gate.

  it('reloads straight into the dashboard when the token is persisted', async () => {
    sessionStorage.setItem('hotel-mgmt.session.token', 'tok-1');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    stubHappyPath(fetchMock);
    const wrapper = mountDesk();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-dashboard"]').exists()).toBe(true);
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-sheet-line"]').text()).toContain('open balances');
    });
    expect(fetchMock.mock.calls.some((call) => call[0] === '/v1/admin/SignIn')).toBe(false);
  });

  // Refs #489: the backup-report section is gone from the desk
  // screen (no design counterpart; FR-ADM-5/NFR-BKP-2 direct the
  // report to the owner/manager via the admin audit surface), so no
  // desk backup-feed cases remain here.

  // Refs #479: the embedded room map shows floor groups with
  // per-status chips and counts, reusing the /rooms vocabulary.
  it('renders the room-map section with chips, counts, and floor groups', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-roommap"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="desk-roommap"] h2').text()).toContain('Room map');
    const summary = wrapper.find('[data-testid="desk-roommap-summary"]');
    expect(summary.text()).toContain('Rooms by status');
    // Chips match the cards by construction: two occupied, one
    // dirty, one awaiting inspection, one out of service, none
    // ready.
    expect(wrapper.find('[data-testid="desk-roommap-chip-occupied"]').text()).toContain('(2)');
    expect(wrapper.find('[data-testid="desk-roommap-chip-needs-cleaning"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="desk-roommap-chip-awaiting-inspection"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="desk-roommap-chip-out-of-service"]').text()).toContain('(1)');
    expect(wrapper.find('[data-testid="desk-roommap-chip-ready"]').text()).toContain('(0)');
    // Floor groups from the same payload: floor 1, floor 2, then
    // the room without a listed floor.
    const floors = wrapper.findAll('[data-testid="desk-roommap-floor"]');
    expect(floors.map((floor) => floor.find('h2').text())).toEqual(['Floor 1', 'Floor 2']);
    expect(wrapper.find('[data-testid="desk-roommap-floor-unknown"] h2').text()).toContain(
      'Rooms without a listed floor',
    );
    expect(wrapper.find('[data-testid="desk-roommap-room-101"]').text()).toContain('101');
    expect(wrapper.find('[data-testid="desk-roommap-room-103"]').exists()).toBe(true);
    // Map rows resolve the human type name, never the raw type id.
    expect(wrapper.find('[data-testid="desk-roommap-card-type-101"]').text()).toContain('Standard');
    expect(wrapper.find('[data-testid="desk-roommap-card-type-101"]').text()).not.toContain('standard');
    // VI-primary copy (AC-DSK-8): the map switches locale with no
    // mixed-locale copy.
    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="desk-roommap"] h2').text()).toContain('Sơ đồ phòng');
      expect(wrapper.find('[data-testid="desk-roommap-manage"]').text()).toContain('Quản lý phòng');
      expect(wrapper.find('[data-testid="desk-roommap-chip-needs-cleaning"]').text()).toContain('Phòng bẩn');
    } finally {
      setLocale('en');
    }
  });

  // Refs #479: every map entry links through to /rooms for actions;
  // the desk screen itself performs no room writes for the map.
  it('links every room-map entry through to the rooms screen', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-roommap-manage"]').exists()).toBe(true);
    });
    expect(roomLinkTo(wrapper, 'desk-roommap-manage')).toEqual({ name: 'rooms' });
    for (const number of ['101', '102', '103', '201', '202']) {
      expect(roomLinkTo(wrapper, `desk-roommap-open-${number}`)).toEqual({ name: 'rooms' });
    }
    // Read-only render: the map derives from the five state reads
    // plus the dashboard joins, with no room writes.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/rooms/UpdateRoomState');
    expect(urls.filter((url) => url === '/v1/rooms/ListRoomsByState')).toHaveLength(5);
  });

  // Refs #479: an empty estate renders the catalogue empty state,
  // never a blank map.
  it('renders the room-map empty state when no rooms exist', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(
          jsonResponse({ businessDate: localBusinessDate(), arrivals: [], inHouse: [], departures: [] }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [] }));
      }
      if (url === '/v1/rooms/ListRoomsByState') {
        return Promise.resolve(jsonResponse({ state: 'x', rooms: [] }));
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
      throw new Error(`unexpected call ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    useSessionStore().signIn('tok-1', 'Ada', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-roommap-empty"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="desk-roommap-empty"]').text()).toContain(
      'No rooms yet. Rooms appear here once they are set up.',
    );
  });

  // Refs #479: padded floor labels merge into one group instead of
  // splitting a floor into duplicate sections.
  it('merges padded floor labels into a single floor group', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ListRoomsByState') {
        const state = String(JSON.parse(String(init?.body ?? '{}')).state ?? '');
        const rooms: Record<string, unknown[]> = {
          'vacant-dirty': [
            { roomId: 'r-1', number: '101', roomTypeId: 'standard', state, floor: '1' },
          ],
          'vacant-clean': [
            { roomId: 'r-2', number: '102', roomTypeId: 'standard', state, floor: ' 1 ' },
          ],
        };
        return Promise.resolve(jsonResponse({ state, rooms: rooms[state] ?? [] }));
      }
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(
          jsonResponse({ businessDate: localBusinessDate(), arrivals: [], inHouse: [], departures: [] }),
        );
      }
      if (url === '/v1/rooms/ListRoomTypes') {
        return Promise.resolve(jsonResponse({ roomTypes: [] }));
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
      throw new Error(`unexpected call ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    useSessionStore().signIn('tok-1', 'Ada', 'owner');
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-roommap"]').exists()).toBe(true);
    });
    const floors = wrapper.findAll('[data-testid="desk-roommap-floor"]');
    expect(floors.map((floor) => floor.find('h2').text())).toEqual(['Floor 1']);
    expect(wrapper.find('[data-testid="desk-roommap-room-101"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="desk-roommap-room-102"]').exists()).toBe(true);
  });
});
