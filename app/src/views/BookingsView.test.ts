// Guards for the read-only booking register desk screen (Refs #648, T2;
// `docs/testing/booking-management-view-test-traceability.md`).
//
// BM1's shell pins live in `App.test.ts`, `shell-restyle.test.ts`,
// `router.test.ts`, and `shell-titles.test.ts`; this suite carries the
// register's own cases: BM1 (title and intro), BM2 (call set and
// no-write), BM3 (default range and the inclusive-night mapping), BM4
// (validation, one read per apply, in-flight no-op, selection clear),
// BM5 (row fields from the five reads), BM6 (assigned room by rule),
// BM7 (ordering and the 50-row cap), BM8 (state coverage), BM9 (empty
// range), BM10 (list failure and retry), BM11 (partial rows and
// partial columns), BM12 (detail read-back and failure), and BM15's
// catalogue half.
//
// Every list case also asserts the exact call list and the values it
// returned, because the screen composes five reads and a cell can be
// right while the read behind it is wrong.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import BookingsView from './BookingsView.vue';
import { setLocale } from '../i18n';
import { resetConnectivityForTests } from '../api/client';
import { useSessionStore } from '../stores/session';
import { localBusinessDate } from '../stay-options';

const QUERY_CALENDAR = '/v1/reservations/QueryCalendar';
const GET_RESERVATION = '/v1/reservations/GetReservation';
const LIST_ROOM_TYPES = '/v1/rooms/ListRoomTypes';
const LIST_ARRIVALS_DEPARTURES = '/v1/stay/ListArrivalsDepartures';
const LIST_ROOMS_BY_STATE = '/v1/rooms/ListRoomsByState';

// BM2: the suite accepts exactly the five operations the register may
// call; any other path is recorded and fails the case.
const READ_PATHS = new Set([
  QUERY_CALENDAR,
  GET_RESERVATION,
  LIST_ROOM_TYPES,
  LIST_ARRIVALS_DEPARTURES,
  LIST_ROOMS_BY_STATE,
]);

const TODAY = localBusinessDate();
const SUITE_TYPE = 'type-uuid-suite';
const DELUXE_TYPE = 'type-uuid-deluxe';

// Dates stay relative to the desk business date, so every seeded
// booking overlaps the default range whatever day the suite runs.
function day(offset: number): string {
  const [year, month, date] = TODAY.split('-').map(Number);
  const value = new Date(year as number, (month as number) - 1, date as number);
  value.setDate(value.getDate() + offset);
  const pad = (part: number): string => (part < 10 ? '0' : '') + String(part);
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function deskDate(canonical: string): string {
  const [year, month, date] = canonical.split('-');
  return `${date}/${month}/${year}`;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface FakeEntry {
  reservationRef: string;
  roomTypeId: string;
  arrivalDate: string;
  departureDate: string;
  state: string;
  stayId?: string | null;
}

interface FakeRecord {
  guestFullName: string;
  totalMinor: number;
  discountName?: string | null;
}

interface FakeCall {
  url: string;
  body: Record<string, unknown>;
}

interface Gate {
  promise: Promise<void>;
  release: () => void;
}

function makeGate(): Gate {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

interface FakeBackend {
  calendar: FakeEntry[];
  records: Record<string, FakeRecord>;
  types: Array<{ id: string; name: string }>;
  inHouse: Array<{ stayId: string; roomId: string }>;
  occupied: Array<{ roomId: string; number: string }>;
  calls: FakeCall[];
  otherPaths: string[];
  failCalendar: 'offline' | 'server' | 'nonEnvelope' | 'unauthorized' | null;
  failTypes: boolean;
  failStay: boolean;
  failRooms: boolean;
  failRowRecords: Set<string>;
  failDetailRecords: Set<string>;
  calendarGate: Gate | null;
  reservationCounts: Record<string, number>;
}

function seedBackend(overrides: Partial<FakeBackend> = {}): FakeBackend {
  const backend: FakeBackend = {
    calendar: [
      {
        reservationRef: 'REF-1001',
        roomTypeId: SUITE_TYPE,
        arrivalDate: day(0),
        departureDate: day(3),
        state: 'checked-in',
        stayId: 'stay-uuid-1',
      },
      {
        reservationRef: 'REF-1002',
        roomTypeId: DELUXE_TYPE,
        arrivalDate: day(1),
        departureDate: day(4),
        state: 'confirmed',
        stayId: null,
      },
    ],
    records: {
      'REF-1001': { guestFullName: 'Linh Tran', totalMinor: 3600000 },
      'REF-1002': { guestFullName: 'Minh Le', totalMinor: 2400000 },
    },
    types: [
      { id: SUITE_TYPE, name: 'Suite' },
      { id: DELUXE_TYPE, name: 'Deluxe' },
    ],
    inHouse: [{ stayId: 'stay-uuid-1', roomId: 'room-uuid-101' }],
    occupied: [{ roomId: 'room-uuid-101', number: '101' }],
    calls: [],
    otherPaths: [],
    failCalendar: null,
    failTypes: false,
    failStay: false,
    failRooms: false,
    failRowRecords: new Set<string>(),
    failDetailRecords: new Set<string>(),
    calendarGate: null,
    reservationCounts: {},
    ...overrides,
  };
  return backend;
}

function overlaps(entry: FakeEntry, dateFrom: string, dateTo: string): boolean {
  // The contract's half-open window (the `overlaps` rule in
  // services/reservations/internal/store/store.go): arrival < dateTo
  // and departure > dateFrom.
  return entry.arrivalDate < dateTo && entry.departureDate > dateFrom;
}

function installFetch(backend: FakeBackend) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const body = init?.body !== undefined
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {};
    backend.calls.push({ url, body });
    if (!READ_PATHS.has(url)) {
      backend.otherPaths.push(url);
      return Promise.resolve(jsonResponse({ code: 'FORBIDDEN' }, 403));
    }
    if (url === QUERY_CALENDAR) {
      const respond = (): Response => {
        if (backend.failCalendar === 'server') {
          return jsonResponse({ code: 'INTERNAL', message: 'boom' }, 500);
        }
        if (backend.failCalendar === 'nonEnvelope') {
          return new Response('not-json', { status: 500 });
        }
        if (backend.failCalendar === 'unauthorized') {
          return jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401);
        }
        const from = String(body['dateFrom']);
        const to = String(body['dateTo']);
        return jsonResponse({
          dateFrom: from,
          dateTo: to,
          reservations: backend.calendar.filter((entry) => overlaps(entry, from, to)),
        });
      };
      if (backend.failCalendar === 'offline') {
        return Promise.reject(new Error('network down'));
      }
      if (backend.calendarGate !== null) {
        return backend.calendarGate.promise.then(respond);
      }
      return Promise.resolve(respond());
    }
    if (url === LIST_ROOM_TYPES) {
      if (backend.failTypes) {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL' }, 500));
      }
      return Promise.resolve(jsonResponse({ roomTypes: backend.types }));
    }
    if (url === LIST_ARRIVALS_DEPARTURES) {
      if (backend.failStay) {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL' }, 500));
      }
      return Promise.resolve(
        jsonResponse({
          businessDate: body['businessDate'],
          arrivals: [],
          inHouse: backend.inHouse,
          departures: [],
        }),
      );
    }
    if (url === LIST_ROOMS_BY_STATE) {
      if (backend.failRooms) {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL' }, 500));
      }
      return Promise.resolve(
        jsonResponse({
          state: body['state'],
          rooms: backend.occupied.map((room) => ({
            roomId: room.roomId,
            number: room.number,
            roomTypeId: SUITE_TYPE,
            state: 'occupied',
          })),
        }),
      );
    }
    // GET_RESERVATION
    const ref = String(body['reservationRef']);
    const count = backend.reservationCounts[ref] ?? 0;
    backend.reservationCounts[ref] = count + 1;
    // A detail failure means "the row read worked, the fresh read did
    // not": the first read for that reference succeeds.
    if (backend.failDetailRecords.has(ref) && count > 0) {
      return Promise.resolve(jsonResponse({ code: 'INTERNAL' }, 500));
    }
    if (backend.failRowRecords.has(ref)) {
      return Promise.resolve(jsonResponse({ code: 'INTERNAL' }, 500));
    }
    const entry = backend.calendar.find((candidate) => candidate.reservationRef === ref);
    const record = backend.records[ref];
    if (entry === undefined || record === undefined) {
      return Promise.resolve(jsonResponse({ code: 'NOT_FOUND' }, 404));
    }
    return Promise.resolve(
      jsonResponse({
        reservationRef: ref,
        roomTypeId: entry.roomTypeId,
        arrivalDate: entry.arrivalDate,
        departureDate: entry.departureDate,
        state: entry.state,
        stayId: entry.stayId ?? null,
        guest: { fullName: record.guestFullName },
        priceBasis: {
          totalMinor: record.totalMinor,
          discountName: record.discountName ?? null,
        },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function callsTo(backend: FakeBackend, url: string): Array<Record<string, unknown>> {
  return backend.calls.filter((call) => call.url === url).map((call) => call.body);
}

function readRefs(backend: FakeBackend): string[] {
  return callsTo(backend, GET_RESERVATION).map((body) => String(body['reservationRef']));
}

function mountView(role: 'owner' | 'manager' | 'front-desk' = 'front-desk') {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().signIn('tok-1', 'Freddy Desk', role);
  return mount(BookingsView, { global: { plugins: [pinia] } });
}

async function waitForLoad(wrapper: ReturnType<typeof mountView>): Promise<void> {
  // The mounted hook starts the read synchronously, so the first DOM
  // flush is still the loading state; settle the promise chain first so
  // the first poll cannot observe the pre-load DOM.
  await flushPromises();
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="bookings-loading"]').exists()).toBe(false);
  });
  await flushPromises();
}

function rows(wrapper: ReturnType<typeof mountView>) {
  return wrapper.findAll('[data-testid="bookings-row"]');
}

function cellText(wrapper: ReturnType<typeof mountView>, testid: string, index = 0): string {
  return wrapper.findAll(`[data-testid="${testid}"]`)[index]?.text() ?? '';
}

async function applyRange(
  wrapper: ReturnType<typeof mountView>,
  from: string,
  to: string,
): Promise<void> {
  await wrapper.find('[data-testid="bookings-range-from"]').setValue(from);
  await wrapper.find('[data-testid="bookings-range-to"]').setValue(to);
  await wrapper.find('[data-testid="bookings-filter-form"]').trigger('submit');
}

describe('booking register (Refs #648)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setLocale('en');
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // BM1 - entry content.
  it('renders the screen title and the read-only intro in both locales', async () => {
    const backend = seedBackend({ calendar: [] });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(wrapper.find('[data-testid="bookings-view"]').exists()).toBe(true);
    expect(wrapper.find('h1').text()).toBe('Bookings');
    expect(wrapper.text()).toContain('Every booking in the chosen dates. This page only reads.');

    setLocale('vi');
    const viWrapper = mountView();
    await waitForLoad(viWrapper);
    expect(viWrapper.find('h1').text()).toBe('Sổ đặt phòng');
    expect(viWrapper.text()).toContain('Mọi đặt phòng trong khoảng ngày đã chọn.');
    expect(viWrapper.html()).not.toContain('message-missing:');
  });

  // BM2 - read-only surface and the call set.
  it('calls only the five read operations and renders no write affordance', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(backend.otherPaths).toEqual([]);
    for (const call of backend.calls) {
      expect(READ_PATHS.has(call.url), `${call.url} is a read`).toBe(true);
    }
    const labels = wrapper.findAll('button').map((button) => button.text());
    expect(
      labels.some((label) => /edit|cancel|no-show|check-in|check-out|create/i.test(label)),
    ).toBe(false);
    expect(wrapper.html()).not.toContain('href="/app/');
  });

  // BM3 - default range on entry.
  it('reads the default range: the business date through six nights after it', async () => {
    const backend = seedBackend({ calendar: [] });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    const calls = callsTo(backend, QUERY_CALENDAR);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.['dateFrom']).toBe(TODAY);
    expect(calls[0]?.['dateTo']).toBe(day(7));
  });

  // BM3 - the inclusive-night mapping, both boundaries.
  it('maps the inclusive night range to the half-open calendar window', async () => {
    // Wednesday is both the first and the last night: A departs on it,
    // B stays it. A single-direction case would pass an off-by-one.
    const backend = seedBackend({
      calendar: [
        {
          reservationRef: 'REF-2001',
          roomTypeId: SUITE_TYPE,
          arrivalDate: '2026-12-08',
          departureDate: '2026-12-09',
          state: 'cancelled',
          stayId: null,
        },
        {
          reservationRef: 'REF-2002',
          roomTypeId: DELUXE_TYPE,
          arrivalDate: '2026-12-09',
          departureDate: '2026-12-10',
          state: 'confirmed',
          stayId: null,
        },
      ],
      records: {
        'REF-2001': { guestFullName: 'Leaving Early', totalMinor: 100000 },
        'REF-2002': { guestFullName: 'Staying Over', totalMinor: 200000 },
      },
    });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    await applyRange(wrapper, '12/09/2026', '12/09/2026');
    await waitForLoad(wrapper);
    const calls = callsTo(backend, QUERY_CALENDAR);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.['dateFrom']).toBe('2026-12-09');
    expect(calls[1]?.['dateTo']).toBe('2026-12-10');
    const listed = rows(wrapper);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.text()).toContain('Staying Over');
    expect(wrapper.text()).not.toContain('Leaving Early');
  });

  // BM4 - validation sends nothing.
  it('refuses an inverted range in plain words and sends nothing', async () => {
    const backend = seedBackend({ calendar: [] });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    const before = callsTo(backend, QUERY_CALENDAR).length;
    await applyRange(wrapper, '12/10/2026', '12/08/2026');
    expect(wrapper.find('[data-testid="bookings-range-error"]').text()).toBe(
      'The last night must not be before the first night.',
    );
    expect(callsTo(backend, QUERY_CALENDAR)).toHaveLength(before);
    expect(wrapper.find('[data-testid="bookings-empty"]').exists()).toBe(true);
  });

  // BM4 - one read per apply, disabled in flight, repeat apply a no-op.
  it('disables the filter in flight and issues one read per apply', async () => {
    const backend = seedBackend({ calendar: [] });
    const gate = makeGate();
    backend.calendarGate = gate;
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(callsTo(backend, QUERY_CALENDAR)).toHaveLength(1);
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="bookings-show"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="bookings-range-from"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="bookings-show"]').trigger('click');
    await wrapper.find('[data-testid="bookings-filter-form"]').trigger('submit');
    expect(callsTo(backend, QUERY_CALENDAR)).toHaveLength(1);
    gate.release();
    await waitForLoad(wrapper);
    expect(callsTo(backend, QUERY_CALENDAR)).toHaveLength(1);
  });

  // BM4 - applying a new range clears the selection.
  it('clears the selected row and the detail on every list read', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    await wrapper.findAll('[data-testid="bookings-row-open"]')[0]?.trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="bookings-detail"]').exists()).toBe(true);
    });
    await applyRange(wrapper, '12/01/2026', '12/31/2026');
    await waitForLoad(wrapper);
    expect(wrapper.find('[data-testid="bookings-detail"]').exists()).toBe(false);
    expect(wrapper.findAll('.bookings-row-selected')).toHaveLength(0);
  });

  // BM5 - the row fields and the exact read set.
  it('renders every row field from the five reads with one read per capped row', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(callsTo(backend, QUERY_CALENDAR)).toHaveLength(1);
    expect(callsTo(backend, LIST_ROOM_TYPES)).toHaveLength(1);
    const stayCalls = callsTo(backend, LIST_ARRIVALS_DEPARTURES);
    expect(stayCalls).toHaveLength(1);
    expect(stayCalls[0]?.['businessDate']).toBe(TODAY);
    expect(callsTo(backend, LIST_ROOMS_BY_STATE)).toHaveLength(1);
    expect(callsTo(backend, LIST_ROOMS_BY_STATE)[0]?.['state']).toBe('occupied');
    expect(readRefs(backend).sort()).toEqual(['REF-1001', 'REF-1002']);
    // No guest fan-out: the register never reads GetGuest and never
    // calls loadInHouseStayOptions (LLD section 24.2).
    expect(backend.calls.some((call) => call.url.includes('GetGuest'))).toBe(false);

    const first = rows(wrapper)[0];
    expect(first?.text()).toContain('Linh Tran');
    expect(first?.text()).toContain('REF-1001');
    expect(first?.text()).toContain('Suite');
    expect(first?.text()).toContain('101');
    expect(cellText(wrapper, 'bookings-row-arrival', 0)).toBe(deskDate(day(0)));
    expect(cellText(wrapper, 'bookings-row-departure', 0)).toBe(deskDate(day(3)));
    expect(cellText(wrapper, 'bookings-row-nights', 0)).toBe('3');
    // 3,600,000 minor units = 36,000.00 VND, rendered through formatVnd.
    expect(cellText(wrapper, 'bookings-row-total', 0)).toBe('36,000 đ');
    expect(cellText(wrapper, 'bookings-row-state', 0)).toBe('In house');
  });

  // BM6 - the assigned room by rule, never by guess.
  it('resolves the assigned room only for an in-house stay both reads agree on', async () => {
    const backend = seedBackend({
      calendar: [
        {
          reservationRef: 'REF-3001',
          roomTypeId: SUITE_TYPE,
          arrivalDate: day(0),
          departureDate: day(2),
          state: 'confirmed',
          stayId: null,
        },
        {
          reservationRef: 'REF-3002',
          roomTypeId: SUITE_TYPE,
          arrivalDate: day(0),
          departureDate: day(2),
          state: 'closed',
          stayId: 'stay-uuid-closed',
        },
        {
          reservationRef: 'REF-3003',
          roomTypeId: SUITE_TYPE,
          arrivalDate: day(0),
          departureDate: day(2),
          state: 'checked-in',
          stayId: 'stay-uuid-missing',
        },
        {
          reservationRef: 'REF-3004',
          roomTypeId: SUITE_TYPE,
          arrivalDate: day(0),
          departureDate: day(2),
          state: 'checked-in',
          stayId: 'stay-uuid-no-room',
        },
        {
          reservationRef: 'REF-3005',
          roomTypeId: SUITE_TYPE,
          arrivalDate: day(0),
          departureDate: day(2),
          state: 'checked-in',
          stayId: 'stay-uuid-1',
        },
      ],
      records: {
        'REF-3001': { guestFullName: 'Confirmed Guest', totalMinor: 100000 },
        'REF-3002': { guestFullName: 'Departed Guest', totalMinor: 100000 },
        'REF-3003': { guestFullName: 'Missing Stay', totalMinor: 100000 },
        'REF-3004': { guestFullName: 'Missing Room', totalMinor: 100000 },
        'REF-3005': { guestFullName: 'In House', totalMinor: 100000 },
      },
      inHouse: [
        { stayId: 'stay-uuid-1', roomId: 'room-uuid-101' },
        { stayId: 'stay-uuid-closed', roomId: 'room-uuid-101' },
        { stayId: 'stay-uuid-no-room', roomId: 'room-uuid-999' },
      ],
      occupied: [{ roomId: 'room-uuid-101', number: '101' }],
    });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    const refs = readRefs(backend);
    const roomFor = (ref: string): string => cellText(wrapper, 'bookings-row-room', refs.indexOf(ref));
    expect(roomFor('REF-3001')).toBe('—');
    expect(roomFor('REF-3002')).toBe('—');
    expect(roomFor('REF-3003')).toBe('—');
    expect(roomFor('REF-3004')).toBe('—');
    expect(roomFor('REF-3005')).toBe('101');
    // No raw room id or room-type id reaches the screen (#372).
    expect(wrapper.html()).not.toContain('room-uuid-');
    expect(wrapper.html()).not.toContain('type-uuid-');
    expect(wrapper.find('[data-testid="bookings-row-partial"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bookings-column-partial"]').exists()).toBe(false);
  });

  // BM7 - ordering and the 50-row cap.
  it('sorts by arrival then reference and reads only the earliest 50', async () => {
    const calendar: FakeEntry[] = [];
    const records: Record<string, FakeRecord> = {};
    for (let index = 1; index <= 51; index += 1) {
      const ref = `REF-${String(index).padStart(4, '0')}`;
      // Two arrivals share a date, so the reference decides that pair.
      const arrival = index <= 2 ? day(0) : day(1);
      calendar.push({
        reservationRef: ref,
        roomTypeId: SUITE_TYPE,
        arrivalDate: arrival,
        departureDate: day(10),
        state: 'confirmed',
        stayId: null,
      });
      records[ref] = { guestFullName: `Guest ${index}`, totalMinor: 100000 * index };
    }
    // Shuffled input: the screen must impose the order.
    calendar.reverse();
    const backend = seedBackend({ calendar, records });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(rows(wrapper)).toHaveLength(50);
    expect(cellText(wrapper, 'bookings-row-ref', 0)).toBe('REF-0001');
    expect(wrapper.find('[data-testid="bookings-capped"]').text()).toBe(
      'Showing the first 50 bookings. Narrow the dates to see the rest.',
    );
    // The cap is applied before the fan-out: the 51st booking is never
    // read.
    const read = readRefs(backend);
    expect(read).toHaveLength(50);
    expect(read).not.toContain('REF-0051');
  });

  // BM8 - every state is listed with catalogue wording.
  it('lists every state with its catalogue chip and never a raw code', async () => {
    const states = ['confirmed', 'checked-in', 'closed', 'cancelled', 'no-show', 'mystery'];
    const calendar: FakeEntry[] = states.map((state, index) => ({
      reservationRef: `REF-400${index + 1}`,
      roomTypeId: SUITE_TYPE,
      arrivalDate: day(index),
      departureDate: day(index + 9),
      state,
      stayId: null,
    }));
    const records: Record<string, FakeRecord> = {};
    for (const entry of calendar) {
      records[entry.reservationRef] = {
        guestFullName: `Guest ${entry.reservationRef}`,
        totalMinor: 100000,
      };
    }
    const backend = seedBackend({ calendar, records });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(wrapper.findAll('[data-testid="bookings-row-state"]').map((chip) => chip.text())).toEqual([
      'Booked',
      'In house',
      'Checked out',
      'Cancelled',
      'No-show',
      'Unknown',
    ]);
    expect(wrapper.text()).not.toContain('mystery');
    // A cancelled or no-show row reads as inactive (muted ink).
    expect(wrapper.findAll('.bookings-row-inactive')).toHaveLength(2);
  });

  // BM9 - the empty range.
  it('renders one plain sentence naming the range and keeps the filter usable', async () => {
    const backend = seedBackend({ calendar: [] });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(rows(wrapper)).toHaveLength(0);
    const empty = wrapper.find('[data-testid="bookings-empty"]').text();
    expect(empty).toMatch(
      new RegExp(`No booking stays between \\d{2}/\\d{2}/\\d{4} and \\d{2}/\\d{2}/\\d{4}\\.`),
    );
    const before = callsTo(backend, QUERY_CALENDAR).length;
    await applyRange(wrapper, '12/01/2026', '12/02/2026');
    await waitForLoad(wrapper);
    expect(callsTo(backend, QUERY_CALENDAR)).toHaveLength(before + 1);
  });

  // BM10 - list failure and retry.
  it.each(['offline', 'server', 'nonEnvelope'] as const)(
    'renders one plain read-failed sentence with a working retry on a %s failure',
    async (failure) => {
      const backend = seedBackend({ failCalendar: failure });
      installFetch(backend);
      const wrapper = mountView();
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="bookings-list-error"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="bookings-list-error"]').text()).toContain(
        'Could not read the booking register.',
      );
      expect(rows(wrapper)).toHaveLength(0);
      expect(wrapper.html()).not.toContain('INTERNAL');
      expect(wrapper.html()).not.toContain('network down');
      backend.failCalendar = null;
      const before = callsTo(backend, QUERY_CALENDAR);
      await wrapper.find('[data-testid="bookings-retry"]').trigger('click');
      await vi.waitFor(() => {
        expect(callsTo(backend, QUERY_CALENDAR)).toHaveLength(before.length + 1);
      });
      await waitForLoad(wrapper);
      const after = callsTo(backend, QUERY_CALENDAR);
      expect(after[after.length - 1]).toEqual(before[before.length - 1]);
      expect(rows(wrapper)).toHaveLength(2);
    },
  );

  it('rethrows a 401 to the sign-in gate instead of rendering a local error', async () => {
    const backend = seedBackend({ failCalendar: 'unauthorized' });
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(useSessionStore().isSignedIn).toBe(false);
    });
    expect(wrapper.find('[data-testid="bookings-list-error"]').exists()).toBe(false);
  });

  // BM11 - partial row.
  it('keeps a row whose booking read failed and counts it in one notice', async () => {
    const backend = seedBackend();
    backend.failRowRecords = new Set(['REF-1002']);
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(rows(wrapper)).toHaveLength(2);
    const index = readRefs(backend).indexOf('REF-1002');
    expect(cellText(wrapper, 'bookings-row-open', index)).toBe('could not read');
    expect(cellText(wrapper, 'bookings-row-total', index)).toBe('could not read');
    // The calendar fields survive, so the desk can still act on it.
    expect(cellText(wrapper, 'bookings-row-arrival', index)).toBe(deskDate(day(1)));
    expect(cellText(wrapper, 'bookings-row-room-type', index)).toBe('Deluxe');
    expect(wrapper.find('[data-testid="bookings-row-partial"]').text()).toBe(
      '1 bookings could not be completed: their guest name or total is unreadable.',
    );
    // The partial class has no retry of its own.
    expect(wrapper.find('[data-testid="bookings-notices"]').findAll('button')).toHaveLength(0);
  });

  // BM11 - partial column.
  it('marks a failed room-type read as unreadable and names the column', async () => {
    const backend = seedBackend({ failTypes: true });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(wrapper.findAll('[data-testid="bookings-row-room-type"]').map((cell) => cell.text())).toEqual([
      'could not read',
      'could not read',
    ]);
    expect(wrapper.find('[data-testid="bookings-column-partial"]').text()).toBe(
      'The Room type column could not be read.',
    );
    expect(wrapper.find('[data-testid="bookings-row-partial"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="bookings-notices"]').findAll('button')).toHaveLength(0);
    // Every other cell still renders.
    expect(cellText(wrapper, 'bookings-row-arrival', 0)).toBe(deskDate(day(0)));
  });

  it.each([
    ['stay list', { failStay: true }],
    ['occupied rooms', { failRooms: true }],
  ] as const)('marks the room column unreadable when the %s read fails', async (_label, overrides) => {
    const backend = seedBackend(overrides);
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(wrapper.findAll('[data-testid="bookings-row-room"]').map((cell) => cell.text())).toEqual([
      'could not read',
      'could not read',
    ]);
    expect(wrapper.find('[data-testid="bookings-column-partial"]').text()).toBe(
      'The Room column could not be read.',
    );
  });

  // BM12 - the detail read-back.
  it('opens the fresh GetReservation read-back and replaces it on a second selection', async () => {
    const backend = seedBackend();
    backend.records['REF-1001'] = {
      guestFullName: 'Linh Tran',
      totalMinor: 3600000,
      discountName: 'Returning guest',
    };
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    expect(wrapper.find('[data-testid="bookings-detail"]').exists()).toBe(false);
    await wrapper.findAll('[data-testid="bookings-row-open"]')[0]?.trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="bookings-detail-record"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="bookings-detail-ref"]').text()).toBe(
      'Booking reference: REF-1001',
    );
    expect(wrapper.find('[data-testid="bookings-detail-guest"]').text()).toBe('Linh Tran');
    expect(wrapper.find('[data-testid="bookings-detail-room-type"]').text()).toBe('Suite');
    expect(wrapper.find('[data-testid="bookings-detail-room"]').text()).toBe('101');
    expect(wrapper.find('[data-testid="bookings-detail-arrival"]').text()).toBe(deskDate(day(0)));
    expect(wrapper.find('[data-testid="bookings-detail-departure"]').text()).toBe(deskDate(day(3)));
    expect(wrapper.find('[data-testid="bookings-detail-nights"]').text()).toBe('Nights: 3');
    expect(wrapper.find('[data-testid="bookings-detail-total"]').text()).toBe('Total: 36,000 đ');
    expect(wrapper.find('[data-testid="bookings-detail-discount"]').text()).toBe(
      'Discount: Returning guest',
    );
    expect(wrapper.find('[data-testid="bookings-detail-state"]').text()).toBe('In house');
    // The detail carries no action.
    expect(wrapper.find('[data-testid="bookings-detail"]').findAll('button')).toHaveLength(0);
    // A second selection replaces it with a second, fresh read.
    expect(readRefs(backend).filter((ref) => ref === 'REF-1002')).toHaveLength(1);
    await wrapper.findAll('[data-testid="bookings-row-open"]')[1]?.trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="bookings-detail-ref"]').text()).toBe(
        'Booking reference: REF-1002',
      );
    });
    expect(readRefs(backend).filter((ref) => ref === 'REF-1002')).toHaveLength(2);
  });

  it('renders the detail failure with a retry, keeps the list, and drops the old detail', async () => {
    const backend = seedBackend({ failDetailRecords: new Set(['REF-1001']) });
    installFetch(backend);
    const wrapper = mountView();
    await waitForLoad(wrapper);
    await wrapper.findAll('[data-testid="bookings-row-open"]')[0]?.trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="bookings-detail-error-block"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="bookings-detail-error-block"]').text()).toContain(
      'Could not read booking REF-1001.',
    );
    expect(wrapper.find('[data-testid="bookings-detail-record"]').exists()).toBe(false);
    expect(rows(wrapper)).toHaveLength(2);
    backend.failDetailRecords = new Set();
    await wrapper.find('[data-testid="bookings-detail-retry"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="bookings-detail-record"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="bookings-detail-guest"]').text()).toBe('Linh Tran');
  });

  // BM15 - catalogue parity for the register's own keys.
  it('carries every register key in both catalogues with matching placeholders', async () => {
    const en = (await import('../../../messages/en.json')).default as {
      messages: Record<string, string>;
    };
    const vi = (await import('../../../messages/vi.json')).default as {
      messages: Record<string, string>;
    };
    const keys = [
      'desk.shell.nav_bookings',
      'desk.shell.doc_title_bookings',
      'desk.bookings.title',
      'desk.bookings.intro',
      'desk.bookings.range_from',
      'desk.bookings.range_to',
      'desk.bookings.range_hint',
      'desk.bookings.show',
      'desk.bookings.range_invalid',
      'desk.bookings.loading',
      'desk.bookings.empty',
      'desk.bookings.read_failed',
      'desk.bookings.retry',
      'desk.bookings.row_partial',
      'desk.bookings.column_partial',
      'desk.bookings.capped',
      'desk.bookings.cell_unreadable',
      'desk.bookings.col_guest',
      'desk.bookings.col_ref',
      'desk.bookings.col_room_type',
      'desk.bookings.col_room',
      'desk.bookings.col_arrival',
      'desk.bookings.col_departure',
      'desk.bookings.col_nights',
      'desk.bookings.col_total',
      'desk.bookings.col_state',
      'desk.bookings.open_row',
      'desk.bookings.state_confirmed',
      'desk.bookings.state_checked_in',
      'desk.bookings.state_closed',
      'desk.bookings.state_cancelled',
      'desk.bookings.state_no_show',
      'desk.bookings.state_unknown',
      'desk.bookings.detail_heading',
      'desk.bookings.detail_guest',
      'desk.bookings.detail_room_type',
      'desk.bookings.detail_room',
      'desk.bookings.detail_arrival',
      'desk.bookings.detail_departure',
      'desk.bookings.detail_discount',
      'desk.bookings.detail_failed',
    ];
    expect(keys).toHaveLength(41);
    const placeholders = (pattern: string): string[] =>
      [...pattern.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
        .map((match) => match[1] as string)
        .sort();
    for (const key of keys) {
      expect(en.messages[key], `en ${key}`).toBeTypeOf('string');
      expect(vi.messages[key], `vi ${key}`).toBeTypeOf('string');
      expect(placeholders(vi.messages[key] as string), `vi placeholders ${key}`).toEqual(
        placeholders(en.messages[key] as string),
      );
    }
  });
});
