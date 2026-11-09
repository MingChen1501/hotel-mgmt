// Guards for the rooms and rates management desk screen (Refs #590,
// T2; `docs/testing/rooms-rates-management-test-traceability.md`).
//
// M1 entry and states, M2 room-type list, M3 room-type create/edit,
// M4 add or update a room, M5 floor move with read-back, M6 nightly
// grid read, M7 per-night range write, M8 unknown plan and partial
// save/resume, M9 the no-price state, M10 the refusal path — each
// case drives the same operation the section drives against the
// existing contracts, so no backend change is implied.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ManageView from './ManageView.vue';
import { setLocale } from '../i18n';
import { resetConnectivityForTests } from '../api/client';
import { useSessionStore } from '../stores/session';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface FakeRoomType {
  id: string;
  name: string;
  capacity: number | null;
  bedType: string | null;
}

interface FakeRoom {
  roomId: string;
  number: string;
  roomTypeId: string;
  state: string;
  floor: string;
}

interface FakeBackend {
  types: FakeRoomType[];
  rooms: FakeRoom[];
  plans: Set<string>;
  prices: Map<string, number>;
  features: Record<string, Record<string, unknown>>;
  calls: Array<{ url: string; body: Record<string, unknown> }>;
  failStates: Set<string>;
  failNights: Set<string>;
  refuseWrites: boolean;
  hangWrites: boolean;
}

function priceKey(plan: string, roomTypeId: string, night: string): string {
  return `${plan}|${roomTypeId}|${night}`;
}

function seedBackend(): FakeBackend {
  return {
    types: [
      { id: 'standard', name: 'Standard', capacity: 2, bedType: 'double' },
      { id: 'deluxe', name: 'Deluxe', capacity: 2, bedType: 'twin' },
      { id: 'suite', name: 'Suite', capacity: null, bedType: null },
    ],
    rooms: [
      { roomId: 'r-101', number: '101', roomTypeId: 'deluxe', state: 'occupied', floor: '1' },
      { roomId: 'r-201', number: '201', roomTypeId: 'deluxe', state: 'vacant-inspected', floor: '2' },
      { roomId: 'r-301', number: '301', roomTypeId: 'standard', state: 'vacant-dirty', floor: '' },
    ],
    plans: new Set(['Giá chuẩn']),
    prices: new Map(),
    features: { standard: { balcony: true }, deluxe: {}, suite: {} },
    calls: [],
    failStates: new Set(),
    failNights: new Set(),
    refuseWrites: false,
    hangWrites: false,
  };
}

function installFetch(backend: FakeBackend) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const body = init?.body !== undefined
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : {};
    backend.calls.push({ url, body });
    const forbidden = (): Response =>
      jsonResponse({ code: 'FORBIDDEN', message: 'Refused.' }, 403);

    if (url === '/v1/rooms/ListRoomTypes') {
      return Promise.resolve(jsonResponse({ roomTypes: backend.types }));
    }
    if (url === '/v1/rooms/ListRoomsByState') {
      const state = String(body['state']);
      if (backend.failStates.has(state)) {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'nope' }, 500));
      }
      return Promise.resolve(
        jsonResponse({
          state,
          rooms: backend.rooms
            .filter((room) => room.state === state)
            .map((room) => (room.floor === ''
              ? { roomId: room.roomId, number: room.number, roomTypeId: room.roomTypeId, state: room.state }
              : room)),
        }),
      );
    }
    if (url === '/v1/rooms/UpsertRoomType') {
      if (backend.refuseWrites) {
        return Promise.resolve(forbidden());
      }
      const name = String(body['name']);
      const existing = backend.types.find((type) => type.name === name);
      if (existing) {
        // Features are preserved because the body never carries them
        // (G1); capacity/bedType update only when supplied.
        existing.capacity = body['capacity'] !== undefined
          ? Number(body['capacity'])
          : existing.capacity;
        existing.bedType = body['bedType'] !== undefined
          ? String(body['bedType'])
          : existing.bedType;
        return Promise.resolve(jsonResponse({ ...existing, features: backend.features[existing.id] ?? {} }));
      }
      const created: FakeRoomType = {
        id: `type-${name.toLowerCase()}`,
        name,
        capacity: body['capacity'] !== undefined ? Number(body['capacity']) : null,
        bedType: body['bedType'] !== undefined ? String(body['bedType']) : null,
      };
      backend.types.push(created);
      backend.features[created.id] = {};
      return Promise.resolve(jsonResponse({ ...created, features: {} }));
    }
    if (url === '/v1/rooms/UpsertRoom') {
      if (backend.refuseWrites) {
        return Promise.resolve(forbidden());
      }
      const number = String(body['number']);
      const type = backend.types.find((candidate) => candidate.name === String(body['roomType']));
      if (type === undefined) {
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'Unknown room type.' }, 404));
      }
      const existing = backend.rooms.find((room) => room.number === number);
      if (existing) {
        existing.roomTypeId = type.id;
        if (body['floor'] !== undefined) {
          existing.floor = String(body['floor']);
        }
        return Promise.resolve(jsonResponse(existing));
      }
      const created: FakeRoom = {
        roomId: `r-${number}`,
        number,
        roomTypeId: type.id,
        state: 'vacant-inspected',
        floor: body['floor'] !== undefined ? String(body['floor']) : '',
      };
      backend.rooms.push(created);
      return Promise.resolve(jsonResponse(created));
    }
    if (url === '/v1/rates/UpsertRatePlan') {
      if (backend.refuseWrites) {
        return Promise.resolve(forbidden());
      }
      const name = String(body['name']);
      backend.plans.add(name);
      return Promise.resolve(jsonResponse({ id: `plan-${name}`, name }));
    }
    if (url === '/v1/rates/UpsertRatePrice') {
      if (backend.refuseWrites) {
        return Promise.resolve(forbidden());
      }
      const plan = String(body['ratePlanName']);
      if (!backend.plans.has(plan)) {
        return Promise.resolve(
          jsonResponse({ code: 'NOT_FOUND', message: 'Unknown rate plan.', details: { ratePlanName: plan } }, 404),
        );
      }
      const night = String(body['nightDate']);
      if (backend.failNights.has(night)) {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'nope' }, 500));
      }
      backend.prices.set(
        priceKey(plan, String(body['roomTypeId']), night),
        Number(body['priceMinor']),
      );
      return Promise.resolve(
        jsonResponse({
          ratePlanName: plan,
          roomTypeId: body['roomTypeId'],
          nightDate: night,
          priceMinor: body['priceMinor'],
        }),
      );
    }
    if (url === '/v1/rates/QuotePrice') {
      const plan = String(body['ratePlanName']);
      if (!backend.plans.has(plan)) {
        return Promise.resolve(
          jsonResponse({ code: 'NOT_FOUND', message: 'Unknown rate plan.', details: { ratePlanName: plan } }, 404),
        );
      }
      const night = String(body['arrivalDate']);
      const priced = backend.prices.get(priceKey(plan, String(body['roomTypeId']), night));
      if (priced === undefined) {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'NOT_FOUND',
              message: 'No rate price for that night.',
              details: { roomTypeId: body['roomTypeId'], nightDate: night, reason: 'no_rate_price' },
            },
            404,
          ),
        );
      }
      return Promise.resolve(
        jsonResponse({
          roomTypeId: body['roomTypeId'],
          arrivalDate: night,
          departureDate: body['departureDate'],
          nights: [{ nightDate: night, priceMinor: priced }],
          discountName: null,
          totalMinor: priced,
        }),
      );
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function callsTo(backend: FakeBackend, url: string): Array<Record<string, unknown>> {
  return backend.calls.filter((call) => call.url === url).map((call) => call.body);
}

function mountView(role: 'owner' | 'manager' | 'front-desk' = 'owner') {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().signIn('tok-1', 'Ada Owner', role);
  return mount(ManageView, { global: { plugins: [pinia] } });
}

async function fillRange(
  wrapper: ReturnType<typeof mountView>,
  from = '12/01/2026',
  to = '12/07/2026',
  plan = 'Giá chuẩn',
) {
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="manage-rate-type"] option[value="deluxe"]').exists()).toBe(true);
  });
  await wrapper.find('[data-testid="manage-rate-type"]').setValue('deluxe');
  await wrapper.find('[data-testid="manage-rate-plan"]').setValue(plan);
  await wrapper.find('[data-testid="manage-rate-from"]').setValue(from);
  await wrapper.find('[data-testid="manage-rate-to"]').setValue(to);
}

describe('rooms and rates management screen (Refs #590)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setLocale('en');
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // M1 - entry and states.
  it('renders the screen title, intro, and the three setup sections in both locales', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    expect(wrapper.find('[data-testid="manage-view"]').exists()).toBe(true);
    expect(wrapper.find('h1').text()).toBe('Manage rooms and rates');
    expect(wrapper.text()).toContain('Set up room types, place rooms on floors');
    expect(wrapper.find('[data-testid="manage-types"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="manage-rooms"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="manage-rates"]').exists()).toBe(true);

    setLocale('vi');
    const viWrapper = mountView();
    await vi.waitFor(() => {
      expect(viWrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    expect(viWrapper.find('h1').text()).toBe('Quản lý phòng và giá');
    // Every state line and card heading tracks the locale, not only the
    // strings rendered through an inline t() call.
    expect(viWrapper.find('[data-testid="manage-type-form-card"] h3').text()).toBe('Loại phòng mới');
    expect(viWrapper.find('[data-testid="manage-types-card"] h3').text()).toBe('Loại phòng (3)');
    expect(viWrapper.html()).not.toContain('message-missing:');
  });

  it('renders a plain read-error sentence with a retry when a list read fails', async () => {
    const backend = seedBackend();
    backend.failStates = new Set(['occupied', 'vacant-dirty', 'vacant-clean', 'vacant-inspected', 'out-of-order']);
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rooms-error"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="manage-rooms-error"]').text()).toBe(
      'Could not read the setup. Try again.',
    );
    expect(wrapper.find('[data-testid="manage-rooms-retry"]').exists()).toBe(true);
  });

  // M2 - room-type list and empty state.
  it('lists every room type under a counted heading with placeholders for missing values', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    const rows = wrapper.findAll('[data-testid="manage-type-row"]');
    expect(wrapper.find('[data-testid="manage-types-card"] h3').text()).toBe('Room types (3)');
    expect(rows[0]?.text()).toContain('Standard');
    expect(rows[0]?.text()).toContain('2 guests · Double bed');
    // Never a guessed capacity or bed type.
    expect(rows[2]?.text()).toContain('— guests · —');
  });

  it('renders the empty sentence and no invented row on an empty database', async () => {
    const backend = seedBackend();
    backend.types = [];
    backend.rooms = [];
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-types-empty"]').text()).toBe(
        'No room types yet. Create the first type so rooms can be set up.',
      );
    });
    expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(0);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rooms-empty"]').exists()).toBe(true);
    });
  });

  // M3 - room-type create and edit.
  it('creates a type with only the filled fields and re-reads the list', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    const listReads = callsTo(backend, '/v1/rooms/ListRoomTypes').length;
    await wrapper.find('[data-testid="manage-type-name"]').setValue('Family');
    await wrapper.find('[data-testid="manage-type-capacity"]').setValue('4');
    await wrapper.find('[data-testid="manage-type-bed"]').setValue('twin');
    await wrapper.find('[data-testid="manage-type-form"]').trigger('submit');

    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/UpsertRoomType')).toHaveLength(1);
    });
    expect(callsTo(backend, '/v1/rooms/UpsertRoomType')[0]).toEqual({
      name: 'Family',
      actor: 'Ada Owner',
      capacity: 4,
      bedType: 'twin',
    });
    // Features are never sent, so the service preserves them.
    expect(callsTo(backend, '/v1/rooms/UpsertRoomType')[0]).not.toHaveProperty('features');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/ListRoomTypes').length).toBeGreaterThan(listReads);
    });
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(4);
    });
    expect(wrapper.find('[data-testid="manage-type-success"]').text()).toBe('Saved Family.');
    // The card returns to the create state.
    expect(wrapper.find('[data-testid="manage-type-form-card"] h3').text()).toBe('New room type');
    expect((wrapper.find('[data-testid="manage-type-name"]').element as HTMLInputElement).value).toBe('');
  });

  it('edits a type with the name locked and its features preserved', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-type-edit-standard"]').trigger('click');
    expect(wrapper.find('[data-testid="manage-type-form-card"] h3').text()).toBe('Edit room type');
    const name = wrapper.find('[data-testid="manage-type-name"]');
    expect(name.attributes('readonly')).toBeDefined();
    expect(wrapper.find('[data-testid="manage-type-name-locked"]').text()).toBe(
      'The name cannot be changed here. A different name creates a new room type.',
    );
    await wrapper.find('[data-testid="manage-type-capacity"]').setValue('3');
    await wrapper.find('[data-testid="manage-type-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/UpsertRoomType')).toHaveLength(1);
    });
    expect(callsTo(backend, '/v1/rooms/UpsertRoomType')[0]).toEqual({
      name: 'Standard',
      actor: 'Ada Owner',
      capacity: 3,
      bedType: 'double',
    });
    await vi.waitFor(() => {
      expect(backend.types.find((type) => type.name === 'Standard')?.capacity).toBe(3);
    });
    expect(backend.features['standard']).toEqual({ balcony: true });
  });

  it('names the field and sends nothing on invalid type input', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-type-form"]').trigger('submit');
    expect(wrapper.find('[data-testid="manage-type-error"]').text()).toBe('Enter a room type name.');

    await wrapper.find('[data-testid="manage-type-name"]').setValue('Family');
    await wrapper.find('[data-testid="manage-type-capacity"]').setValue('0');
    await wrapper.find('[data-testid="manage-type-form"]').trigger('submit');
    expect(wrapper.find('[data-testid="manage-type-error"]').text()).toContain('1 to 20');

    await wrapper.find('[data-testid="manage-type-capacity"]').setValue('21');
    await wrapper.find('[data-testid="manage-type-form"]').trigger('submit');
    expect(callsTo(backend, '/v1/rooms/UpsertRoomType')).toHaveLength(0);
  });

  // M4 - add or update a room.
  it('adds a room keyed by number, omits a blank floor, and groups it by floor after the re-read', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-room-number"]').setValue('305');
    await wrapper.find('[data-testid="manage-room-type"]').setValue('standard');
    await wrapper.find('[data-testid="manage-room-floor"]').setValue('3');
    await wrapper.find('[data-testid="manage-room-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/UpsertRoom')).toHaveLength(1);
    });
    expect(callsTo(backend, '/v1/rooms/UpsertRoom')[0]).toEqual({
      number: '305',
      roomType: 'Standard',
      actor: 'Ada Owner',
      floor: '3',
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-room-floor-305"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="manage-room-success"]').text()).toBe('Saved room 305.');
    // The new room appears in its own floor group, not a duplicate.
    const floorGroups = wrapper.findAll('[data-testid="manage-floor"]');
    expect(floorGroups.some((group) => group.text().includes('Floor 3'))).toBe(true);

    // A blank floor omits the member so the stored floor is kept.
    await wrapper.find('[data-testid="manage-room-number"]').setValue('401');
    await wrapper.find('[data-testid="manage-room-type"]').setValue('standard');
    await wrapper.find('[data-testid="manage-room-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/UpsertRoom')).toHaveLength(2);
    });
    expect(callsTo(backend, '/v1/rooms/UpsertRoom')[1]).not.toHaveProperty('floor');
    expect(callsTo(backend, '/v1/rooms/UpsertRoom')[1]).not.toHaveProperty('bedType');
  });

  it('updates an existing room number instead of adding a second room', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-room-number"]').setValue('101');
    await wrapper.find('[data-testid="manage-room-type"]').setValue('standard');
    await wrapper.find('[data-testid="manage-room-floor"]').setValue('2');
    await wrapper.find('[data-testid="manage-room-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/UpsertRoom')).toHaveLength(1);
    });
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    const saved = backend.rooms.filter((room) => room.number === '101');
    expect(saved).toHaveLength(1);
    expect(saved[0]?.floor).toBe('2');
    // A setup write never invents a state.
    expect(saved[0]?.state).toBe('occupied');
    expect(callsTo(backend, '/v1/rooms/UpsertRoom')[0]).not.toHaveProperty('state');
  });

  // M5 - floor move with read-back.
  it('moves a room to another floor, re-reads the five states, and keeps its state', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-room-floor-201"]').setValue('4');
    await wrapper.find('[data-testid="manage-room-save-201"]').trigger('click');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/UpsertRoom')).toHaveLength(1);
    });
    expect(callsTo(backend, '/v1/rooms/UpsertRoom')[0]).toEqual({
      number: '201',
      roomType: 'Deluxe',
      actor: 'Ada Owner',
      floor: '4',
    });
    // Five state reads merge by roomId after the write.
    await vi.waitFor(() => {
      expect(
        callsTo(backend, '/v1/rooms/ListRoomsByState').filter((body) => body['state'] === 'occupied').length,
      ).toBeGreaterThanOrEqual(2);
    });
    await vi.waitFor(() => {
      const groups = wrapper.findAll('[data-testid="manage-floor"]');
      expect(groups.some((group) => group.text().includes('Floor 4'))).toBe(true);
    });
    expect(backend.rooms.find((room) => room.number === '201')?.state).toBe('vacant-inspected');
    expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
  });

  it('keeps the stored floor when a row save leaves the floor blank', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-room-floor-201"]').setValue('');
    await wrapper.find('[data-testid="manage-room-save-201"]').trigger('click');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rooms/UpsertRoom')).toHaveLength(1);
    });
    expect(callsTo(backend, '/v1/rooms/UpsertRoom')[0]).not.toHaveProperty('floor');
    expect(backend.rooms.find((room) => room.number === '201')?.floor).toBe('2');
  });

  it('degrades only the failed state group and offers a retry', async () => {
    const backend = seedBackend();
    backend.failStates = new Set(['vacant-clean']);
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rooms-partial"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="manage-rooms-partial"]').text()).toContain(
      'Could not read the setup. Try again.',
    );
    // The other groups still render.
    expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    backend.failStates = new Set();
    await wrapper.find('[data-testid="manage-rooms-retry"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rooms-partial"]').exists()).toBe(false);
    });
  });

  // M6 - nightly grid read.
  it('reads one single-night quote per visible night and marks a missing price without inventing one', async () => {
    const backend = seedBackend();
    backend.prices.set(priceKey('Giá chuẩn', 'deluxe', '2026-12-01'), 85000000);
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper);
    await wrapper.find('[data-testid="manage-rate-read"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-rate-cell"]')).toHaveLength(7);
    });
    const quotes = callsTo(backend, '/v1/rates/QuotePrice');
    expect(quotes).toHaveLength(7);
    expect(quotes.map((body) => body['arrivalDate'])).toEqual([
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
      '2026-12-07',
    ]);
    // Each call quotes exactly one night.
    expect(quotes[0]).toMatchObject({ arrivalDate: '2026-12-01', departureDate: '2026-12-02' });
    expect(wrapper.find('[data-testid="manage-rate-amount-2026-12-01"]').text()).toBe('850,000 đ');
    // No carried, defaulted, or zero price for an unpriced night.
    expect(wrapper.find('[data-testid="manage-rate-amount-2026-12-02"]').text()).toBe('—');
    expect(wrapper.find('[data-testid="manage-rate-caption-2026-12-02"]').text()).toBe('no price');
    // No night renders a zero price.
    const amounts = wrapper.findAll('[data-testid^="manage-rate-amount-"]');
    expect(amounts.every((amount) => amount.text() !== '0 đ')).toBe(true);
  });

  it('pages a longer range seven nights at a time and reads only the visible page', async () => {
    const backend = seedBackend();
    for (let day = 1; day <= 10; day += 1) {
      backend.prices.set(
        priceKey('Giá chuẩn', 'deluxe', `2026-12-${String(day).padStart(2, '0')}`),
        85000000,
      );
    }
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper, '12/01/2026', '12/10/2026');
    await wrapper.find('[data-testid="manage-rate-read"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-rate-cell"]')).toHaveLength(7);
    });
    expect(callsTo(backend, '/v1/rates/QuotePrice')).toHaveLength(7);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-next"]').attributes('disabled')).toBeUndefined();
    });
    await wrapper.find('[data-testid="manage-rate-next"]').trigger('click');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rates/QuotePrice')).toHaveLength(10);
    });
    expect(wrapper.find('[data-testid="manage-rate-amount-2026-12-10"]').exists()).toBe(true);
  });

  it('offers the explicit plan creation when the read names an unknown plan, then re-reads', async () => {
    const backend = seedBackend();
    backend.prices.set(priceKey('Chưa có', 'deluxe', '2026-12-01'), 90000000);
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper, '12/01/2026', '12/02/2026', 'Chưa có');
    await wrapper.find('[data-testid="manage-rate-read"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-plan-read-missing"]').exists()).toBe(true);
    });
    // Nothing is created by the read itself.
    expect(callsTo(backend, '/v1/rates/UpsertRatePlan')).toHaveLength(0);
    expect(wrapper.find('[data-testid="manage-rate-amount-2026-12-01"]').text()).toBe('—');

    await wrapper.find('[data-testid="manage-rate-plan-read-create"]').trigger('click');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rates/UpsertRatePlan')).toHaveLength(1);
    });
    expect(callsTo(backend, '/v1/rates/UpsertRatePlan')[0]).toEqual({ name: 'Chưa có' });
    // The re-read shows the stored price now that the plan exists.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-plan-read-missing"]').exists()).toBe(false);
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-amount-2026-12-01"]').text()).toBe('900,000 đ');
    });
  });

  // M7 - per-night range write.
  it('writes one price row per night in date order with integer minor units', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper);
    await wrapper.find('[data-testid="manage-rate-amount"]').setValue('1200000');
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rates/UpsertRatePrice')).toHaveLength(7);
    });
    const writes = callsTo(backend, '/v1/rates/UpsertRatePrice');
    expect(writes.map((body) => body['nightDate'])).toEqual([
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
      '2026-12-07',
    ]);
    for (const body of writes) {
      expect(body['ratePlanName']).toBe('Giá chuẩn');
      expect(body['roomTypeId']).toBe('deluxe');
      expect(body['priceMinor']).toBe(120000000);
    }
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rates-success"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="manage-rates-success"]').text()).toBe(
      'Saved 7 nights for Deluxe.',
    );
    // The grid re-reads the saved range and shows the stored rows.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-amount-2026-12-07"]').text()).toBe('1,200,000 đ');
    });
    // The per-browser plan memory is a UI preference only.
    expect(localStorage.getItem('hotel-mgmt.desk.manage.rate-plan')).toBe('Giá chuẩn');
  });

  it('refuses an over-long range, a reversed range, and a bad amount before sending anything', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper, '12/01/2026', '01/01/2027');
    await wrapper.find('[data-testid="manage-rate-amount"]').setValue('1200000');
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    expect(wrapper.find('[data-testid="manage-rates-error"]').text()).toBe(
      'Choose at most 31 nights at a time.',
    );

    await wrapper.find('[data-testid="manage-rate-from"]').setValue('12/07/2026');
    await wrapper.find('[data-testid="manage-rate-to"]').setValue('12/01/2026');
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    expect(wrapper.find('[data-testid="manage-rates-error"]').text()).toBe(
      'The last night cannot be before the first night.',
    );

    await wrapper.find('[data-testid="manage-rate-from"]').setValue('12/01/2026');
    await wrapper.find('[data-testid="manage-rate-to"]').setValue('12/07/2026');
    await wrapper.find('[data-testid="manage-rate-amount"]').setValue('12,5');
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    expect(wrapper.find('[data-testid="manage-rates-error"]').text()).toBe(
      'Enter a whole amount between 0 and 100000000.',
    );
    expect(callsTo(backend, '/v1/rates/UpsertRatePrice')).toHaveLength(0);
    expect(callsTo(backend, '/v1/rates/UpsertRatePlan')).toHaveLength(0);
  });

  it('names the missing fields and sends nothing when the range is incomplete', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    expect(wrapper.find('[data-testid="manage-rates-error"]').text()).toBe(
      'Choose a room type, a rate plan, and both dates.',
    );
    expect(callsTo(backend, '/v1/rates/UpsertRatePrice')).toHaveLength(0);
  });

  // M8 - unknown plan, partial save, and resume.
  it('offers the explicit plan creation on the first unknown-plan refusal, then retries', async () => {
    const backend = seedBackend();
    backend.plans = new Set();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper);
    await wrapper.find('[data-testid="manage-rate-amount"]').setValue('1200000');
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-plan-missing"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="manage-rate-plan-missing"]').text()).toContain(
      'No rate plan has this name yet.',
    );
    // Nothing else was written and no plan was created by the save.
    expect(callsTo(backend, '/v1/rates/UpsertRatePrice')).toHaveLength(1);
    expect(callsTo(backend, '/v1/rates/UpsertRatePlan')).toHaveLength(0);

    await wrapper.find('[data-testid="manage-rate-plan-create"]').trigger('click');
    // The refused night was never written, so the retry writes all
    // seven: one refusal plus seven successful writes.
    await vi.waitFor(() => {
      expect(callsTo(backend, '/v1/rates/UpsertRatePrice')).toHaveLength(8);
    });
    const planWrites = callsTo(backend, '/v1/rates/UpsertRatePlan');
    expect(planWrites).toHaveLength(1);
    // The plan is created with the name only (a name conflict
    // overwrites the description).
    expect(planWrites[0]).toEqual({ name: 'Giá chuẩn' });
    expect(backend.prices.size).toBe(7);
  });

  it('stops at the first failed night, reports saved of total, and resumes from that night', async () => {
    const backend = seedBackend();
    backend.failNights = new Set(['2026-12-04']);
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper);
    await wrapper.find('[data-testid="manage-rate-amount"]').setValue('1200000');
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-partial"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="manage-rate-partial"]').text()).toBe(
      'Saved 3/7 nights. 04/12/2026 did not save; try again.',
    );
    // Writes stopped at the failure.
    expect(callsTo(backend, '/v1/rates/UpsertRatePrice')).toHaveLength(4);
    expect(backend.prices.size).toBe(3);

    backend.failNights = new Set();
    await wrapper.find('[data-testid="manage-rate-resume"]').trigger('click');
    await vi.waitFor(() => {
      expect(backend.prices.size).toBe(7);
    });
    // Resume starts at the first unsaved night: nothing written twice.
    const writes = callsTo(backend, '/v1/rates/UpsertRatePrice');
    expect(writes.map((body) => body['nightDate'])).toEqual([
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
      '2026-12-07',
    ]);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-partial"]').exists()).toBe(false);
    });
  });

  it('disables the save while a write is in flight and keeps the progress label', async () => {
    const backend = seedBackend();
    const fetchMock = installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper);
    await wrapper.find('[data-testid="manage-rate-amount"]').setValue('1200000');
    // Hold the first write so the in-flight state is observable.
    let release: (() => void) | null = null;
    const implementation = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rates/UpsertRatePrice' && release === null) {
        return new Promise<Response>((resolve) => {
          release = () => resolve(jsonResponse({ ok: true }));
        });
      }
      return implementation ? implementation(url, init) : Promise.resolve(jsonResponse({}));
    });
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-save"]').text()).toBe('Saving 0/7…');
    });
    expect(wrapper.find('[data-testid="manage-rate-save"]').attributes('disabled')).toBeDefined();
    (release as (() => void) | null)?.();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-save"]').text()).not.toContain('Saving');
    });
  });

  // M9 - the no-price empty state.
  it('shows the not-open-for-booking empty state with no price and the form still usable', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    });
    await fillRange(wrapper);
    await wrapper.find('[data-testid="manage-rate-read"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-rate-empty"]').exists()).toBe(true);
    });
    const empty = wrapper.find('[data-testid="manage-rate-empty"]');
    expect(empty.text()).toContain('not open for booking');
    expect(empty.text()).toContain('No price is set for these dates');
    expect(wrapper.find('[data-testid="manage-rate-grid"]').exists()).toBe(false);
    // Never a price, never a zero.
    expect(wrapper.text()).not.toContain('0 đ');
    // The pricing form stays usable inside the state.
    expect(wrapper.find('[data-testid="manage-rate-amount"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="manage-rate-save"]').exists()).toBe(true);
  });

  // M10 - the refusal path.
  it('renders the whole screen read-only for a front-desk role and sends no write', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView('front-desk');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    // Every list renders.
    expect(wrapper.findAll('[data-testid="manage-room-row"]')).toHaveLength(3);
    expect(wrapper.find('[data-testid="manage-readonly-notice"]').text()).toBe(
      'You can see the setup here; only the owner or a manager can change it.',
    );
    expect(wrapper.find('[data-testid="manage-refused-notice"]').text()).toBe(
      'Only the owner or a manager can change rooms and prices. Ask a manager if something needs changing.',
    );
    // Every create and save action is disabled.
    for (const testid of [
      'manage-type-save',
      'manage-room-save',
      'manage-rate-save',
      'manage-type-edit-standard',
      'manage-room-save-101',
    ]) {
      expect(wrapper.find(`[data-testid="${testid}"]`).attributes('disabled'), testid).toBeDefined();
    }
    // A triggered action sends nothing.
    await wrapper.find('[data-testid="manage-type-form"]').trigger('submit');
    await wrapper.find('[data-testid="manage-rate-form"]').trigger('submit');
    expect(callsTo(backend, '/v1/rooms/UpsertRoomType')).toHaveLength(0);
    expect(callsTo(backend, '/v1/rooms/UpsertRoom')).toHaveLength(0);
    expect(callsTo(backend, '/v1/rates/UpsertRatePrice')).toHaveLength(0);
    expect(callsTo(backend, '/v1/rates/UpsertRatePlan')).toHaveLength(0);
  });

  it('maps a server refusal to the same plain sentence with no envelope code', async () => {
    const backend = seedBackend();
    backend.refuseWrites = true;
    installFetch(backend);
    const wrapper = mountView('owner');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    await wrapper.find('[data-testid="manage-type-name"]').setValue('Family');
    await wrapper.find('[data-testid="manage-type-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="manage-type-error"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="manage-type-error"]').text()).toBe(
      'Only the owner or a manager can change rooms and prices. Ask a manager if something needs changing.',
    );
    expect(wrapper.html()).not.toContain('FORBIDDEN');
    expect(wrapper.html()).not.toContain('403');
  });

  it('keeps the owner and manager actions enabled with no refusal copy', async () => {
    const backend = seedBackend();
    installFetch(backend);
    const wrapper = mountView('manager');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="manage-type-row"]')).toHaveLength(3);
    });
    expect(wrapper.find('[data-testid="manage-readonly-notice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manage-refused-notice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manage-type-save"]').attributes('disabled')).toBeUndefined();
  });
});
