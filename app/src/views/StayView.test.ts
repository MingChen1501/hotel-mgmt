// Characterization guard for the stay screen migration
// (Refs #295, ADR-0003; v2 board rebuild Refs #541): StayView
// replicates the `frontend/stay.html` inline-script behaviour —
// sign-in plus the arrival select (arrival-pick check-in, #586:
// the pick loads GetReservation plus the ready rooms of the booked
// type, one Check in click then AssignRoom with the
// client-generated stayId as stayLink, CheckIn carrying the roomId
// from the AssignRoom echo, and CheckInReservation) and the
// folio-gated check-out
// (GetFolioBalance review, RecordOpenBalanceApproval, CheckOut
// with the reviewed folio id plus balance plus the provenanced
// approval, then ReleaseRoom for the departed room,
// SETTLEMENT_REQUIRED surfacing) — through the shared Bearer
// client and the catalogue `t()` wrapper (Refs #588: every route
// to the close re-reads the folio and refuses an unpaid close, and a
// committed close releases the room it vacated). Expected arrivals
// (Refs #349) resolve from the reservation calendar because live
// stay rows never carry booking references; the departing pick
// resolves from the in-house and departures lists. The pre-v2
// lists, move, and actual-times sections are gone (zero extras
// vs the v2 board). No Playwright harness exists in this repo
// yet, so these Vitest component tests are the characterization
// coverage for the stay flows.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import StayView from './StayView.vue';
import stayViewSource from './StayView.vue?raw';
import enCatalogueDocument from '../../../messages/en.json';
import viCatalogueDocument from '../../../messages/vi.json';
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

function parseBody(init?: RequestInit): Record<string, unknown> {
  return init?.body !== undefined ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
}

// Full happy-path backend: sign-in, daily lists (one arrival, one
// in-house stay, one departure) with guest names, ready plus
// occupied rooms, the booking read-back, the assign/check-in/
// check-in-reservation chain, and the folio
// review/approval/check-out chain. Returns the handler so a test
// can wrap it (e.g. to fail only one op) while the rest of the
// flow stays on the happy path.
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
          departures: [
            {
              stayId: 's-2',
              guestId: 'g-3',
              roomId: 'room-7',
              actualArrival: '2026-10-24T14:00:00.000Z',
              actualDeparture: null,
            },
          ],
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
      const names: Record<string, string> = { 'g-1': 'Guest One', 'g-2': 'Guest Two', 'g-3': 'Guest Three' };
      const guestId = String(body.guestId ?? '');
      return Promise.resolve(jsonResponse({ guestId, fullName: names[guestId] ?? guestId }));
    }
    if (url === '/v1/rooms/ListRoomTypes') {
      return Promise.resolve(jsonResponse({ roomTypes: [{ id: 'standard', name: 'Standard' }] }));
    }
    // Reservation calendar (Refs #349): the expected-arrivals
    // source for the arrival select, and (#600) the stay-link read
    // that resolves a departing stay's booking for its room charge.
    // Tests with live arrival rows override this handler; the
    // default keeps the two happy-path stays resolvable.
    if (url === '/v1/reservations/QueryCalendar') {
      return Promise.resolve(
        jsonResponse({
          dateFrom: body.dateFrom ?? null,
          dateTo: body.dateTo ?? null,
          reservations: [
            {
              reservationRef: 'RSV-1',
              stayId: 's-1',
              roomTypeId: 'standard',
              arrivalDate: '2026-10-25',
              departureDate: '2026-10-27',
              state: 'checked-in',
            },
            {
              reservationRef: 'RSV-2',
              stayId: 's-2',
              roomTypeId: 'standard',
              arrivalDate: '2026-10-24',
              departureDate: '2026-10-26',
              state: 'checked-in',
            },
          ],
        }),
      );
    }
    if (url === '/v1/reservations/GetReservation') {
      return Promise.resolve(
        jsonResponse({
          reservationId: 'r-1',
          reservationRef: 'RSV-1',
          roomTypeId: 'standard',
          guest: { guestId: 'g-1' },
          // The frozen quoted total the desk posts as the room
          // charge on the check-out review (#600).
          priceBasis: { totalMinor: 120000, discountName: null },
        }),
      );
    }
    if (url === '/v1/rooms/AssignRoom') {
      expect(body.roomNumber).toBeTruthy();
      expect(body.businessDate).toBeTruthy();
      expect(body.actor).toBe('Ada Owner');
      expect(body.idempotencyKey).toBeTruthy();
      const number = String(body.roomNumber);
      return Promise.resolve(
        jsonResponse({ roomId: `echo-${number}`, roomNumber: number, stayLink: body.stayLink, state: 'occupied' }),
      );
    }
    if (url === '/v1/stay/CheckIn') {
      // The roomId must come from the AssignRoom echo, never from
      // the picker value directly (Refs #295).
      expect(String(body.roomId)).toMatch(/^echo-/);
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
      expect(body.reservationRef).toBe('RSV-1');
      return Promise.resolve(jsonResponse({ reservationRef: 'RSV-1', stayId: body.stayId }));
    }
    if (url === '/v1/billing/GetFolioBalance') {
      // Default happy folio (#600): the stay's room charge is already
      // posted and settled, so the review posts nothing and the
      // settled close path stays a settled close.
      return Promise.resolve(
        jsonResponse({
          folioId: 'f-1',
          stayId: body.stayId,
          balanceMinor: 0,
          openBalanceApproval: null,
          charges: [
            {
              itemKind: 'nightly-room-charge',
              itemName: 'Room 109',
              amountMinor: 120000,
              taxMinor: 0,
              feeMinor: 0,
              postedAt: '2026-10-26T08:00:00.000Z',
            },
          ],
          payments: [
            { method: 'cash', amountMinor: 120000, paidAt: '2026-10-26T09:00:00.000Z' },
          ],
        }),
      );
    }
    if (url === '/v1/billing/PostCharge') {
      return Promise.resolve(
        jsonResponse({
          lineId: 'line-1',
          folioId: 'f-1',
          stayId: body.stayId,
          itemKind: body.itemKind,
          itemName: body.itemName,
          amountMinor: body.amountMinor,
          taxMinor: 0,
          feeMinor: 0,
          postedAt: '2026-10-26T08:00:00.000Z',
        }),
      );
    }
    if (url === '/v1/billing/RecordOpenBalanceApproval') {
      expect(body.idempotencyKey).toBeTruthy();
      // #588: a recorded approval carries the approver identity, the
      // hotel role, and the recorded time the desk shows.
      return Promise.resolve(
        jsonResponse({
          openBalanceApproval: {
            approvedBy: body.approvedBy,
            role: body.role,
            approvedAt: '2026-11-09T10:15:00.000Z',
          },
          balanceMinor: 1500,
        }),
      );
    }
    if (url === '/v1/stay/CheckOut') {
      expect(body.idempotencyKey).toBeTruthy();
      return Promise.resolve(jsonResponse({ stayId: body.stayId, invoiceRef: 'INV-1' }));
    }
    // #588 (`FR-CKO-1`): a committed close releases the departed room.
    // Refs #647: the same operation also carries the arrival
    // compensation (`vacant-inspected`) and the vacated-room release
    // (`vacant-dirty`), so the stub echoes the requested target.
    if (url === '/v1/rooms/ReleaseRoom') {
      expect(['vacant-inspected', 'vacant-dirty']).toContain(String(body.toState));
      expect(body.actor).toBe('Ada Owner');
      const roomNumber = String(body.roomNumber);
      return Promise.resolve(
        jsonResponse({ roomNumber, oldState: 'occupied', newState: body.toState }),
      );
    }
    // Refs #647 (`FR-REA-2`/`FR-REA-4`): the move keeps the stay in
    // house and returns the echo the desk releases from.
    if (url === '/v1/stay/MoveRoom') {
      expect(body.stayId).toBeTruthy();
      expect(body.toRoomId).toBeTruthy();
      expect(body.idempotencyKey).toBeTruthy();
      return Promise.resolve(
        jsonResponse({
          stayId: body.stayId,
          reservationId: 'r-1',
          guestId: 'g-2',
          roomId: body.toRoomId,
          state: 'in-house',
          move: {
            fromRoomId: 'room-9',
            toRoomId: body.toRoomId,
            movedAt: '2026-11-11T09:30:00.000Z',
          },
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

function localToday(): string {
  const now = new Date();
  const pad = (value: number): string => (value < 10 ? '0' : '') + String(value);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function mountStay() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(StayView, {
    global: { plugins: [pinia] },
  });
}

// The v2 screen loads its panel data on mount for a signed-in
// session (same as the desk screen): preset the session, mount,
// then wait for the arrival option the list reads resolve.
async function mountSignedIn(fetchMock: ReturnType<typeof vi.fn>) {
  stubHappyPath(fetchMock);
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  const wrapper = mount(StayView, { global: { plugins: [pinia] } });
  await vi.waitFor(() => {
    expect(
      wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-1"]').exists(),
    ).toBe(true);
  });
  await vi.waitFor(() => {
    expect(
      wrapper.find('[data-testid="stay-checkout-stay"] option[value="s-1"]').exists(),
    ).toBe(true);
  });
  return wrapper;
}

// Check-out now asks once through the shell confirm dialog
// (Refs #338, LLD section 12.2): open the dialog, then confirm.
async function confirmCheckout(wrapper: ReturnType<typeof mountStay>) {
  await wrapper.find('[data-testid="stay-checkout"]').trigger('click');
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="stay-checkout-dialog"]').exists()).toBe(true);
  });
  await wrapper.find('[data-testid="stay-checkout-confirm"]').trigger('click');
}

describe('stay view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the two v2 panels with no v1 sections and no per-screen sign-in copy', () => {
    const wrapper = mountStay();
    expect(wrapper.find('[data-testid="stay-view"]').exists()).toBe(true);
    // The v2 board carries no screen title: no h1 renders here.
    expect(wrapper.find('[data-testid="stay-view"] h1').exists()).toBe(false);
    // The shell owns the one sign-in gate (Refs #338, FR-DSP-2):
    // no per-screen sign-in copy renders here anymore.
    expect(wrapper.find('[data-testid="stay-signin"]').exists()).toBe(false);
    // Two-panel board: check-in left, check-out right.
    expect(wrapper.find('[data-testid="stay-panels"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stay-checkin-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stay-checkout-card"]').exists()).toBe(true);
    // Zero extras vs the board, plus the one decided additive card
    // (Refs #647): the lists and times sections stay gone, the move
    // card now exists by owner decision.
    for (const hook of [
      'stay-main',
      'stay-lists-card',
      'stay-business-date',
      'stay-times-card',
      'stay-booking-ref',
    ]) {
      expect(wrapper.find(`[data-testid="${hook}"]`).exists()).toBe(false);
    }
    expect(wrapper.find('[data-testid="stay-move-card"]').exists()).toBe(true);
  });

  it('loads the panel data with bearer auth under the shell session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // Bearer session handling: the shared client attaches the token
    // to every call (the sign-in itself happened in the shell gate).
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
    // The reads still go out on the wire (business date stays ISO).
    const listBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/stay/ListArrivalsDepartures')?.[1],
    );
    expect(listBody.businessDate).toBe(localToday());
    // Panel options resolve names through GetGuest: arrivals feed
    // the check-in select, in-house plus departures feed the
    // departing select.
    expect(wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-1"]').text()).toContain(
      'Guest One',
    );
    expect(wrapper.find('[data-testid="stay-checkout-stay"] option[value="s-1"]').text()).toContain(
      'Guest Two',
    );
    expect(wrapper.find('[data-testid="stay-checkout-stay"] option[value="s-2"]').text()).toContain(
      'Guest Three',
    );
    expect(wrapper.find('[data-testid="stay-checkin-error"]').exists()).toBe(false);
  });

  // #586 (AC-DSK-17): the arrival pick loads the booking and the
  // booked-type ready rooms into the picker on its own; the commit
  // stays on the Check in button. This rewrites the pre-#586 guard
  // that loaded on the first click and committed on the second.
  it('loads the ready rooms on the arrival pick and commits on one click', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const readyRoomReads = (): number =>
      fetchMock.mock.calls.filter(
        (call) =>
          String(call[0]) === '/v1/rooms/ListRoomsByState' &&
          parseBody(call[1]).state === 'vacant-inspected',
      ).length;
    // The panel data load already reads every housekeeping state
    // once for the room-number map; the pick adds exactly one
    // booked-type candidate read and the commit adds none.
    const panelReads = readyRoomReads();

    // The arrival select replaces the retired booking-ref entry,
    // and the pick alone loads the candidates: no click first.
    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    expect(readyRoomReads()).toBe(panelReads + 1);
    const options = wrapper.findAll('[data-testid="stay-checkin-room"] option');
    // Refs #411: the picker opens on an explicit empty placeholder
    // so the shown value always matches the bound room id.
    expect(options.map((option) => option.text())).toEqual(['Choose a room...', '101', '102']);
    expect(options[0].element.getAttribute('value')).toBe('');
    // The amber hint shows until a room is picked.
    expect(wrapper.find('[data-testid="stay-checkin-room-hint"]').exists()).toBe(true);

    // One Check in click commits: AssignRoom (roomNumber plus
    // stayLink) then CheckIn with the roomId from the AssignRoom
    // echo, then CheckInReservation, with no extra candidate read
    // (the only later housekeeping read is the post-commit panel
    // refresh).
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    const readsBeforeCommit = readyRoomReads();
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    expect(readyRoomReads()).toBe(readsBeforeCommit + 1);
    // One preload read plus one commit read-back, never a reload.
    expect(
      fetchMock.mock.calls.filter(
        (call) =>
          String(call[0]) === '/v1/reservations/GetReservation' &&
          parseBody(call[1]).reservationRef === 'RSV-1',
      ),
    ).toHaveLength(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => url === '/v1/rooms/AssignRoom')).toHaveLength(1);
    expect(urls.filter((url) => url === '/v1/stay/CheckIn')).toHaveLength(1);
    expect(urls.filter((url) => url === '/v1/reservations/CheckInReservation')).toHaveLength(1);
    const assignBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/rooms/AssignRoom')?.[1],
    );
    expect(assignBody.roomNumber).toBe('101');
    expect(assignBody.stayLink).toBeTruthy();
    const checkinBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/stay/CheckIn')?.[1],
    );
    // Room id comes from the AssignRoom echo, never the picker.
    expect(checkinBody.roomId).toBe('echo-101');
    expect(checkinBody.stayId).toBe(assignBody.stayLink);
  });

  // #586 symptom 2: selecting a valid room resolves the
  // multi-candidate `need_room` guard immediately — no second
  // click and no stale red message next to a valid pick.
  it('clears the room guard when a valid room is picked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    // Several ready rooms keep today's loaded guard message.
    expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
      'Pick a ready room first.',
    );

    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-2');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').exists()).toBe(false);
    });
    expect(wrapper.find('[data-testid="stay-checkin-room-hint"]').exists()).toBe(false);
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('room-2');

    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    const assignBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/rooms/AssignRoom')?.[1],
    );
    expect(assignBody.roomNumber).toBe('102');
  });

  it('keeps the need_arrival guard when no arriving guest is picked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
      'Choose an arriving guest first.',
    );
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/reservations/GetReservation');
  });

  // Refs #411: with candidates loaded but no room picked, the
  // select shows the empty placeholder (no phantom selection) and
  // a Check in click keeps the need_room guard without calling
  // AssignRoom. #586 moves the load to the arrival pick; the guard
  // and the placeholder rule stay.
  it('keeps the need_room guard when no ready room is picked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    // The placeholder is selected: nothing is bound yet.
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('');
    expect(wrapper.find('[data-testid="stay-checkin-room"]').text()).toContain(
      'Choose a room...',
    );

    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'Pick a ready room first.',
      );
    });
    // Re-picking the placeholder leaves the guard in place at
    // commit time (a valid id is still required).
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'Pick a ready room first.',
      );
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/rooms/AssignRoom');
  });

  // Refs #411: with exactly one ready room there is nothing to
  // choose, so the picker binds it directly and one Check in
  // click commits without touching the guard. #586 loads it on
  // the arrival pick instead of on the first click.
  it('auto-selects the single ready room candidate', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ListRoomsByState' && parseBody(init).state === 'vacant-inspected') {
        return Promise.resolve(
          jsonResponse({
            state: 'vacant-inspected',
            rooms: [
              { roomId: 'room-1', number: '101', roomTypeId: 'standard', state: 'vacant-inspected' },
            ],
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    // Bound directly: no placeholder selection, no guard message.
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('room-1');
    expect(wrapper.find('[data-testid="stay-checkin-error"]').exists()).toBe(false);

    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/v1/rooms/AssignRoom');
  });

  // #586 (AC-DSK-17 / D17, FR-CIP-2, FR-CIP-4): zero ready rooms of
  // the booked type keep the booked-type status plus the plain
  // no-ready-rooms error, bind nothing (the explicit placeholder
  // stays), and a Check in click retries the load instead of
  // committing.
  it('shows the plain no-ready-rooms error and retries the load on a click', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    // Only the reads after the mount are counted: the panel data load
    // already reads every housekeeping state once for the room-number
    // map.
    let candidateReads = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ListRoomsByState' && parseBody(init).state === 'vacant-inspected') {
        candidateReads += 1;
        return Promise.resolve(
          jsonResponse({
            state: 'vacant-inspected',
            rooms:
              candidateReads === 1
                ? // The pick's read: a deluxe room is ready but the
                  // booking is standard, so the booked-type filter
                  // leaves zero candidates.
                  [{ roomId: 'room-3', number: '201', roomTypeId: 'deluxe', state: 'vacant-inspected' }]
                : [
                    { roomId: 'room-1', number: '101', roomTypeId: 'standard', state: 'vacant-inspected' },
                    { roomId: 'room-2', number: '102', roomTypeId: 'standard', state: 'vacant-inspected' },
                  ],
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
      'No ready rooms of the booked type right now.',
    );
    // Nothing is bound: the select stays on the explicit placeholder.
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('');
    expect(wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text())).toEqual(
      ['Choose a room...'],
    );

    // The click retries the booked-type load instead of committing;
    // the retry read offers the booked type and keeps the guard.
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text())).toEqual(
        ['Choose a room...', '101', '102'],
      );
    });
    expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
      'Pick a ready room first.',
    );
    expect(candidateReads).toBe(2);
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/rooms/AssignRoom');
  });

  // #586 (AC-DSK-17 / D17, FR-CIP-4): a failed preload leaves the
  // picker empty; the Check in click retries the read pair instead
  // of committing, and only the next click after a successful retry
  // commits once.
  it('retries the preload on a click after a failed arrival-pick load', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    let bookingReads = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation' && parseBody(init).reservationRef === 'RSV-1') {
        bookingReads += 1;
        if (bookingReads === 1) {
          return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'boom' }, 500));
        }
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'That did not work',
      );
    });
    expect(wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text())).toEqual(
      ['Choose a room...'],
    );

    // The click retries the read pair: the picker fills, nothing
    // commits.
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    expect(bookingReads).toBe(2);
    expect(wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text())).toEqual(
      ['Choose a room...', '101', '102'],
    );
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContain(
      '/v1/rooms/AssignRoom',
    );

    // Only a later room pick plus one click commits, once.
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/rooms/AssignRoom'),
    ).toHaveLength(1);
  });

  // #586 (AC-DSK-17): clearing the arrival pick while the preload is
  // in flight supersedes the load without leaving the panel stuck in
  // the checking-in state (disabled button plus the progress line
  // until the next pick).
  it('releases the in-flight state when the arrival pick is cleared mid-load', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    const gate: { release?: () => void } = {};
    const held = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation' && parseBody(init).reservationRef === 'RSV-1') {
        await held;
      }
      return happy(url, init);
    });

    const arrival = wrapper.find('[data-testid="stay-checkin-arrival"]');
    await arrival.setValue('RSV-1');
    await vi.waitFor(() => {
      expect((wrapper.find('[data-testid="stay-checkin"]').element as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
    expect(wrapper.find('[data-testid="stay-checking-in"]').exists()).toBe(true);

    // Re-selecting the placeholder supersedes the load before it
    // resolves: the panel is usable again immediately.
    await arrival.setValue('');
    await vi.waitFor(() => {
      expect((wrapper.find('[data-testid="stay-checkin"]').element as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
    expect(wrapper.find('[data-testid="stay-checking-in"]').exists()).toBe(false);

    // The late read for the cleared pick paints nothing and never
    // re-locks the panel.
    gate.release?.();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text())).toEqual(
        ['Choose a room...'],
      );
    });
    expect((wrapper.find('[data-testid="stay-checkin"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('');
  });

  // #586 (AC-DSK-17): the latest arrival pick owns the candidate
  // list — a booked-type read that returns late for an earlier
  // pick never paints into the current picker, and clearing the
  // arrival pick empties the picker again.
  it('keeps the latest arrival pick when an earlier load returns late', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const happy = stubHappyPath(fetchMock);
    const gate: { release?: () => void } = {};
    const firstGate = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = parseBody(init);
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return jsonResponse({
          businessDate: '2026-10-26',
          arrivals: [
            { reservationRef: 'RSV-1', guestId: 'g-1', roomId: null, actualArrival: null, actualDeparture: null },
            { reservationRef: 'RSV-2', guestId: 'g-1', roomId: null, actualArrival: null, actualDeparture: null },
          ],
          inHouse: [],
          departures: [],
        });
      }
      if (url === '/v1/reservations/GetReservation' && body.reservationRef === 'RSV-1') {
        await firstGate;
        return jsonResponse({
          reservationId: 'r-1',
          reservationRef: 'RSV-1',
          roomTypeId: 'deluxe',
          guest: { guestId: 'g-1' },
        });
      }
      if (url === '/v1/reservations/GetReservation' && body.reservationRef === 'RSV-2') {
        return jsonResponse({
          reservationId: 'r-2',
          reservationRef: 'RSV-2',
          roomTypeId: 'standard',
          guest: { guestId: 'g-1' },
        });
      }
      if (url === '/v1/rooms/ListRoomsByState' && body.state === 'vacant-inspected') {
        return jsonResponse({
          state: 'vacant-inspected',
          rooms: [
            { roomId: 'room-1', number: '101', roomTypeId: 'standard', state: 'vacant-inspected' },
            { roomId: 'room-2', number: '102', roomTypeId: 'standard', state: 'vacant-inspected' },
            { roomId: 'room-3', number: '201', roomTypeId: 'deluxe', state: 'vacant-inspected' },
          ],
        });
      }
      return happy(url, init);
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    const wrapper = mount(StayView, { global: { plugins: [pinia] } });
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-2"]').exists(),
      ).toBe(true);
    });

    const arrival = wrapper.find('[data-testid="stay-checkin-arrival"]');
    await arrival.setValue('RSV-1');
    await arrival.setValue('RSV-2');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    // The stale deluxe read lands after the current pick: it paints
    // nothing.
    gate.release?.();
    await vi.waitFor(() => {
      expect(
        (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
      ).toBe('');
    });
    expect(wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text())).toEqual(
      ['Choose a room...', '101', '102'],
    );
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');

    // Clearing the arrival pick empties the picker again.
    await arrival.setValue('');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text())).toEqual(
        ['Choose a room...'],
      );
    });
  });

  // Refs #349: live stay rows never carry booking references, so
  // the arrival select renders from the reservation calendar
  // (confirmed bookings due today, verified per row) instead.
  it('picks a live arrival from the reservation calendar without stay-list refs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const today = localToday();
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/ListArrivalsDepartures') {
        // Live shape: stay rows carry reservationId UUIDs, never
        // booking references.
        return Promise.resolve(
          jsonResponse({
            businessDate: today,
            arrivals: [
              {
                stayId: 's-9',
                reservationId: 'r-9',
                guestId: 'g-2',
                roomId: 'room-9',
                actualArrival: `${today}T06:00:00.000Z`,
                actualDeparture: null,
              },
            ],
            inHouse: [],
            departures: [],
          }),
        );
      }
      if (url === '/v1/reservations/QueryCalendar') {
        const body = parseBody(init);
        expect(body.dateFrom).toBe(today);
        return Promise.resolve(
          jsonResponse({
            dateFrom: body.dateFrom,
            dateTo: body.dateTo,
            reservations: [
              {
                reservationRef: 'RSV-LIVE',
                roomTypeId: 'standard',
                arrivalDate: today,
                departureDate: '2026-10-28',
                state: 'confirmed',
              },
              {
                reservationRef: 'RSV-OLD',
                roomTypeId: 'standard',
                arrivalDate: today,
                departureDate: '2026-10-28',
                state: 'checked-in',
              },
              {
                reservationRef: 'RSV-CX',
                roomTypeId: 'standard',
                arrivalDate: today,
                departureDate: '2026-10-28',
                state: 'cancelled',
              },
            ],
          }),
        );
      }
      if (url === '/v1/reservations/GetReservation') {
        const body = parseBody(init);
        if (body.reservationRef === 'RSV-LIVE') {
          return Promise.resolve(
            jsonResponse({
              reservationId: 'r-live',
              reservationRef: 'RSV-LIVE',
              roomTypeId: 'standard',
              arrivalDate: today,
              departureDate: '2026-10-28',
              state: 'confirmed',
              guest: { guestId: 'g-live', fullName: 'Live Guest' },
            }),
          );
        }
        return happy(url, init);
      }
      return happy(url, init);
    });
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    const wrapper = mountStay();

    // Only the verified due reference renders an option; the
    // checked-in and cancelled calendar rows never do.
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-LIVE"]').exists(),
      ).toBe(true);
    });
    expect(
      wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-OLD"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-CX"]').exists(),
    ).toBe(false);

    // The select drives the check-in quote step against the real
    // booking.
    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-LIVE');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
  });

  it('keeps the panel data when the reservation calendar is down', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/QueryCalendar') {
        return Promise.resolve(jsonResponse({ code: 'VALIDATION_FAILED', message: 'calendar down' }, 400));
      }
      return happy(url, init);
    });
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    const wrapper = mountStay();

    // The stay lists still load (with their stubbed reference row),
    // so the arrival select keeps working without the calendar.
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-1"]').exists(),
      ).toBe(true);
    });
    expect(wrapper.find('[data-testid="stay-checkin-error"]').exists()).toBe(false);
  });

  it('maps an unknown booking reference to the catalogue refusal string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'no such booking' }, 404));
      }
      return happy(url, init);
    });

    // #586 moves the load to the arrival pick, so the pick alone
    // raises the refusal; there is no Check in click here (it
    // would be a no-op while the pick's load is in flight).
    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'Unknown booking reference',
      );
    });
  });

  it('maps a taken room to the catalogue refusal string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    let assigns = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/AssignRoom') {
        assigns += 1;
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'taken' }, 409));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'just taken',
      );
    });
    expect(assigns).toBe(1);
  });

  it('maps an already-checked-in booking to the catalogue refusal string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckIn') {
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'already in' }, 409));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-2');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'already checked in',
      );
    });
  });

  it('reviews a zero-balance folio, checks out, releases the departed room, and refreshes the desk lists', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // #588 (`AC-DSK-18`): the reload after the committed close reads
    // the desk lists again. The post-close lists move the closed stay
    // (s-1) out of `inHouse` and into `departures`, so the departing
    // select must drop the in-house row and keep today's checkout from
    // the departing list; a panel that reloaded nothing, or painted a
    // stale in-house row, leads with s-1 or lists it twice.
    const happy = stubHappyPath(fetchMock);
    let listReads = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/ListArrivalsDepartures') {
        listReads += 1;
        return Promise.resolve(
          jsonResponse({
            businessDate: '2026-10-26',
            arrivals: [],
            inHouse: [],
            departures: [
              {
                stayId: 's-2',
                guestId: 'g-3',
                roomId: 'room-7',
                actualArrival: '2026-10-24T14:00:00.000Z',
                actualDeparture: null,
              },
              {
                stayId: 's-1',
                guestId: 'g-2',
                roomId: 'room-9',
                actualArrival: '2026-10-25T14:00:00.000Z',
                actualDeparture: '2026-10-26T11:00:00.000Z',
              },
            ],
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    expect(wrapper.find('[data-testid="stay-folio-status"]').text()).toContain('Folio balance: 0.00.');
    // The exact folio and stay IDs hide behind the reference details.
    expect(wrapper.find('[data-testid="stay-folio-status"]').text()).not.toContain('f-1');
    await wrapper.find('[data-testid="stay-checkout-details-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="stay-checkout-details-body"]').text()).toContain('f-1');
    expect(wrapper.find('[data-testid="stay-checkout-details-body"]').text()).toContain('s-1');
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(false);

    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'Checked out for Guest Two',
      );
    });
    // The invoice ref hides behind the reference details too.
    expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain('invoice balance 0.00');
    expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).not.toContain('INV-1');
    expect(wrapper.find('[data-testid="stay-checkout-details-body"]').text()).toContain('INV-1');
    const checkoutBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/stay/CheckOut')?.[1],
    );
    expect(checkoutBody.folioId).toBe('f-1');
    expect(checkoutBody.folioBalanceMinor).toBe(0);
    // #588 (`AC-DSK-18`, `FR-CKO-1`/`FR-CKO-2`): the committed close
    // releases the room the stay held (109, resolved through the
    // loaded room-state map, never typed) to vacant-dirty, exactly
    // once, and the release line names it.
    const releaseCalls = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === '/v1/rooms/ReleaseRoom',
    );
    expect(releaseCalls).toHaveLength(1);
    expect(parseBody(releaseCalls[0]?.[1])).toEqual({
      roomNumber: '109',
      toState: 'vacant-dirty',
      actor: 'Ada Owner',
    });
    expect(wrapper.find('[data-testid="stay-room-release"]').text()).toContain(
      'Room 109 is now vacant and dirty.',
    );
    // Order (#588): close, then release, then the panel reload — so the
    // lists and every surface read the corrected room state.
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    const closeAt = urls.lastIndexOf('/v1/stay/CheckOut');
    const releaseAt = urls.indexOf('/v1/rooms/ReleaseRoom');
    const reloadAt = urls.lastIndexOf('/v1/stay/ListArrivalsDepartures');
    expect(closeAt).toBeGreaterThan(0);
    expect(releaseAt).toBeGreaterThan(closeAt);
    expect(reloadAt).toBeGreaterThan(releaseAt);
    // The reloaded lists are the ones on screen (#588, `AC-DSK-18`):
    // the closed stay left the in-house list, the departing list keeps
    // today's checkout, and the panel paints both without a manual
    // reload. In-house rows come first and the in-house list is empty
    // after the close, so the closed stay can come only from the
    // departing list — a stale in-house row would lead the select.
    expect(listReads).toBe(1);
    const departingOptions = wrapper
      .findAll('[data-testid="stay-checkout-stay"] option')
      .filter((option) => (option.element as HTMLOptionElement).value !== '');
    expect(departingOptions.map((option) => (option.element as HTMLOptionElement).value)).toEqual([
      's-2',
      's-1',
    ]);
    expect(departingOptions.map((option) => option.text())).toEqual([
      'Guest Three · Room number unavailable',
      'Guest Two · 109',
    ]);
  });

  // #646 (`FR-DEP-5`, `DR13`): a committed close whose booking
  // completion could not be recorded reports the split in plain words
  // and never claims the booking is completed.
  it('reports a booking completion that could not be recorded without claiming it', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckOut') {
        return Promise.resolve(
          jsonResponse({
            stayId: parseBody(init).stayId,
            invoiceRef: 'INV-1',
            bookingCompletion: { state: 'not-recorded', reason: 'UPSTREAM_UNAVAILABLE' },
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-booking-completion"]').exists()).toBe(true);
    });
    const split = wrapper.find('[data-testid="stay-booking-completion"]').text();
    expect(split).toContain('still reads in house');
    expect(split).not.toContain('UPSTREAM_UNAVAILABLE');
    expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
      'Checked out for Guest Two',
    );
  });

  it('claims no split when the booking completion is recorded', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckOut') {
        return Promise.resolve(
          jsonResponse({
            stayId: parseBody(init).stayId,
            invoiceRef: 'INV-1',
            bookingCompletion: { state: 'completed', reservationRef: 'RSV-1' },
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'Checked out for Guest Two',
      );
    });
    expect(wrapper.find('[data-testid="stay-booking-completion"]').exists()).toBe(false);
  });

  // #600: the desk check-out posts the stay's room charge before the
  // review shows a balance, so a stay checked in and out through the
  // desk ends with a folio that carries the room it paid for.
  it('posts the stay room charge on the check-out review and gates the close on it', async () => {    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // A desk-checked-in stay with a fresh folio: the review posts the
    // stay's frozen quoted total as one nightly room charge and then
    // shows the balance that charge creates.
    const charges: Array<Record<string, unknown>> = [];
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/PostCharge') {
        const body = parseBody(init);
        const posted = {
          itemKind: body.itemKind,
          itemName: body.itemName,
          amountMinor: body.amountMinor,
          postedAt: '2026-10-26T08:00:00.000Z',
        };
        charges.push(posted);
        return Promise.resolve(
          jsonResponse({ lineId: 'line-600', folioId: 'f-1', stayId: body.stayId, ...posted }),
        );
      }
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: parseBody(init).stayId,
            balanceMinor: charges.reduce((sum, line) => sum + Number(line.amountMinor), 0),
            openBalanceApproval: null,
            charges,
            payments: [],
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-folio-status"]').text()).toContain(
        'Folio balance: 1200.00.',
      );
    });

    const chargeBodies = fetchMock.mock.calls
      .filter((call) => String(call[0]) === '/v1/billing/PostCharge')
      .map((call) => parseBody(call[1]));
    expect(chargeBodies).toHaveLength(1);
    expect(chargeBodies[0]).toMatchObject({
      stayId: 's-1',
      itemKind: 'nightly-room-charge',
      itemName: 'Room 109',
      amountMinor: 120000,
      actor: 'Ada Owner',
      idempotencyKey: 'room-charge:s-1',
    });
    // The posted charge opens the balance, so the close stays gated on
    // a payment or a recorded approval (`AC-DSK-18` holds for a folio
    // that now carries the room charge).
    expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain('open balance');
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);

    // A repeated review re-reads the folio and posts nothing: the line
    // is already there, so the stay is never charged twice.
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-folio-status"]').text()).toContain(
        'Folio balance: 1200.00.',
      );
    });
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/billing/PostCharge'),
    ).toHaveLength(1);
  });

  it('leaves a folio that already carries a room charge untouched', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // The lab path (and the Folio screen) can post the room charge
    // before the review: the desk sees the existing nightly line, posts
    // nothing, and still reviews the settled folio.
    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/billing/PostCharge'),
    ).toHaveLength(0);
  });

  it('refuses the review when the stay booking cannot be resolved for its room charge', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // No booking links the stay, so no room charge can be posted: the
    // desk refuses the review instead of closing an uncharged folio.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: parseBody(init).stayId,
            balanceMinor: 0,
            openBalanceApproval: null,
            charges: [],
            payments: [],
          }),
        );
      }
      if (url === '/v1/reservations/QueryCalendar') {
        return Promise.resolve(
          jsonResponse({ dateFrom: null, dateTo: null, reservations: [] }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain(
        'room charge could not be posted',
      );
    });
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/billing/PostCharge'),
    ).toHaveLength(0);
    // Nothing is reviewed, so no route to the close exists.
    expect(wrapper.find('[data-testid="stay-folio-status"]').text()).toBe('');
    expect(wrapper.find('[data-testid="stay-checkout"]').exists()).toBe(false);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
  });

  it('posts nothing for a zero quoted total and still clears the free stay to close', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // #600 (`FR-CKP-3`, CKP-5): a stay booked at a zero frozen quote is
    // free, so the review must not invent a zero-amount room-charge
    // line. It posts nothing, reviews the empty folio as read, and the
    // free stay still closes on the zero balance `BR-17` allows.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(
          jsonResponse({
            reservationId: 'r-1',
            reservationRef: 'RSV-1',
            roomTypeId: 'standard',
            guest: { guestId: 'g-1' },
            priceBasis: { totalMinor: 0, discountName: 'Complimentary' },
          }),
        );
      }
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: parseBody(init).stayId,
            balanceMinor: 0,
            openBalanceApproval: null,
            charges: [],
            payments: [],
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });

    // Nothing is charged and nothing is faked: zero `PostCharge`, no
    // fabricated line in the reviewed folio.
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/billing/PostCharge'),
    ).toHaveLength(0);
    expect(wrapper.find('[data-testid="stay-folio-status"]').text()).toContain('Folio balance: 0.00.');
    expect(wrapper.find('[data-testid="stay-checkout-error"]').exists()).toBe(false);
    expect(
      (wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled,
    ).toBe(false);

    // The free stay still closes, against the folio as read.
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'Checked out for Guest Two',
      );
    });
    const checkoutBodies = fetchMock.mock.calls
      .filter((call) => String(call[0]) === '/v1/stay/CheckOut')
      .map((call) => parseBody(call[1]));
    expect(checkoutBodies).toHaveLength(1);
    expect(checkoutBodies[0]).toMatchObject({ folioId: 'f-1', folioBalanceMinor: 0 });
  });

  it('ends the review in the plain panel error when the room-charge post is refused', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // #600 (`FR-CKP-4`, CKP-6): a `PostCharge` the service refuses ends
    // the review in the plain panel error sentence for that refusal —
    // no balance, no close route, no raw envelope, and the stay stays
    // in house because nothing was reviewed.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: parseBody(init).stayId,
            balanceMinor: 0,
            openBalanceApproval: null,
            charges: [],
            payments: [],
          }),
        );
      }
      if (url === '/v1/billing/PostCharge') {
        return Promise.resolve(
          jsonResponse({ code: 'VALIDATION_FAILED', message: 'charge refused' }, 400),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain(
        'That did not work',
      );
    });

    // One attempt, never a retry loop, and never a raw envelope.
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/billing/PostCharge'),
    ).toHaveLength(1);
    expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).not.toContain(
      'VALIDATION_FAILED',
    );
    // Nothing is reviewed: no balance line, no checkout control, no close.
    expect(wrapper.find('[data-testid="stay-folio-status"]').text()).toBe('');
    expect(wrapper.find('[data-testid="stay-checkout"]').exists()).toBe(false);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
  });

  it('ends the review in the plain panel error when the room-charge post fails on transport', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // #600 (`FR-CKP-4`, CKP-6): a `PostCharge` that fails on transport
    // (the desk drops offline mid-review) ends the review the same way
    // as a refusal — the plain panel error, no balance, no close route.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: parseBody(init).stayId,
            balanceMinor: 0,
            openBalanceApproval: null,
            charges: [],
            payments: [],
          }),
        );
      }
      if (url === '/v1/billing/PostCharge') {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain(
        'That did not work',
      );
    });

    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/billing/PostCharge'),
    ).toHaveLength(1);
    // The offline reason never surfaces raw on the panel (FR-DSP-3).
    expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).not.toContain('Failed to fetch');
    expect(wrapper.find('[data-testid="stay-folio-status"]').text()).toBe('');
    expect(wrapper.find('[data-testid="stay-checkout"]').exists()).toBe(false);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
  });

  it('gates check-out behind the approval form for an open balance', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({ folioId: 'f-2', stayId: 's-1', balanceMinor: 1500, openBalanceApproval: null }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain('open balance');
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    expect((wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled).toBe(
      true,
    );

    await wrapper.find('[data-testid="stay-approval-by"]').setValue('owner');
    await wrapper.find('[data-testid="stay-approval-role"]').setValue('manager');
    await wrapper.find('[data-testid="stay-approve"]').trigger('click');
    // #588 (`FR-CKO-5`): the recorded approval is shown with its
    // approver identity, hotel role, and recorded time — an explicit
    // exception, not a silent bypass.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'Approved by owner (Manager) at',
      );
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(false);
    expect((wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );
    const approvalBody = parseBody(
      fetchMock.mock.calls.find(
        (call) => String(call[0]) === '/v1/billing/RecordOpenBalanceApproval',
      )?.[1],
    );
    expect(approvalBody.approvedBy).toBe('owner');
    expect(approvalBody.role).toBe('manager');
    expect(approvalBody.idempotencyKey).toBeTruthy();
  });

  it('offers the catalogue reviewer roles as select options in both locales', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const select = wrapper.find('[data-testid="stay-approval-by"]');
    expect(select.element.tagName).toBe('SELECT');
    const optionLabels = (): string[] => select.findAll('option').map((option) => option.text());
    const optionValues = (): string[] =>
      select.findAll('option').map((option) => (option.element as HTMLOptionElement).value);

    // The MVP's fixed role catalogue (requirements section 3.2), with
    // manager first: the board illustrates the manager as reviewer and
    // the select carries no placeholder option.
    expect(optionValues()).toEqual(['manager', 'owner', 'front-desk']);
    expect(optionLabels()).toEqual(['Manager', 'Owner', 'Front desk']);
    expect((select.element as HTMLSelectElement).value).toBe('manager');

    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();
      expect(optionLabels()).toEqual(['Quản lý', 'Chủ', 'Lễ tân']);
    } finally {
      setLocale('en');
    }
  });

  it('offers the same fixed role set on the approver-role select', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // #588 (`FR-CKO-5`): a free-form approver role cannot be recorded
    // from the desk — the approver role is a select over the same
    // fixed catalogue the reviewer field offers.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({ folioId: 'f-2', stayId: 's-1', balanceMinor: 1500, openBalanceApproval: null }),
        );
      }
      return happy(url, init);
    });
    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    });

    const select = wrapper.find('[data-testid="stay-approval-role"]');
    expect(select.element.tagName).toBe('SELECT');
    const optionLabels = (): string[] => select.findAll('option').map((option) => option.text());
    const optionValues = (): string[] =>
      select.findAll('option').map((option) => (option.element as HTMLOptionElement).value);
    expect(optionValues()).toEqual(['manager', 'owner', 'front-desk']);
    expect(optionLabels()).toEqual(['Manager', 'Owner', 'Front desk']);
    expect((select.element as HTMLSelectElement).value).toBe('manager');

    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      await wrapper.vm.$nextTick();
      expect(optionLabels()).toEqual(['Quản lý', 'Chủ', 'Lễ tân']);
    } finally {
      setLocale('en');
    }
  });

  it('closes an open balance only with a provenanced recorded approval', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // The approval Billing stored: identity, hotel role, recorded time.
    const recorded = {
      approvedBy: 'Night Manager',
      role: 'manager',
      approvedAt: '2026-11-09T10:15:00.000Z',
    };
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({ folioId: 'f-2', stayId: 's-1', balanceMinor: 1500, openBalanceApproval: recorded }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'Approved by Night Manager (Manager) at',
      );
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(false);
    expect((wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );

    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain('Checked out');
    });
    // The close carries the recorded approval and then releases the
    // room (#588): the approved exception is the close's evidence.
    const checkoutBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/stay/CheckOut')?.[1],
    );
    expect(checkoutBody.folioBalanceMinor).toBe(1500);
    expect(checkoutBody.openBalanceApproval).toEqual(recorded);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/rooms/ReleaseRoom'),
    ).toHaveLength(1);
  });

  it.each([
    [
      'no recorded time',
      { approvedBy: 'Night Manager', role: 'manager' },
    ],
    [
      'no approver identity',
      { role: 'manager', approvedAt: '2026-11-09T10:15:00.000Z' },
    ],
    [
      'a role outside the fixed set',
      { approvedBy: 'Night Manager', role: 'night-auditor', approvedAt: '2026-11-09T10:15:00.000Z' },
    ],
  ])('refuses an approval with %s as not an approval', async (_label, stored) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({ folioId: 'f-2', stayId: 's-1', balanceMinor: 1500, openBalanceApproval: stored }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain(
        'Record the approval again',
      );
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    // No route commits and no room is released.
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/rooms/ReleaseRoom'),
    ).toHaveLength(0);
  });

  it('does not accept a free-form note as an approval', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // BR-17 (#588): a free-form note standing in for the record is not
    // an approval, so the plain open-balance refusal stands and the
    // approval form opens for a real record.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-2',
            stayId: 's-1',
            balanceMinor: 1500,
            openBalanceApproval: 'note: manager said it is fine',
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain('open balance');
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    expect(
      (wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
  });

  it('refuses a charge added between review and confirm on the confirm route', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // Review reads a settled, charged folio, then a room charge lands
    // before the confirm: #588 (`FR-CKO-4`) the confirm re-reads and
    // refuses on the fresh value instead of closing on the reviewed one.
    let balanceMinor = 0;
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: parseBody(init).stayId,
            balanceMinor,
            openBalanceApproval: null,
            charges: [
              {
                itemKind: 'nightly-room-charge',
                itemName: 'Room 109',
                amountMinor: 120000,
                postedAt: '2026-10-26T08:00:00.000Z',
              },
            ],
            payments: [],
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    // The charge lands after the review and before the dialog confirm.
    balanceMinor = 120000;
    await wrapper.find('[data-testid="stay-checkout"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-dialog"]').exists()).toBe(true);
    });
    await wrapper.find('[data-testid="stay-checkout-confirm"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain('open balance');
    });
    // Nothing commits, nothing is released, the dialog closes, the stay
    // stays picked in house, and the approval form opens.
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/rooms/ReleaseRoom'),
    ).toHaveLength(0);
    expect(wrapper.find('[data-testid="stay-checkout-dialog"]').exists()).toBe(false);
    expect((wrapper.find('[data-testid="stay-checkout-stay"]').element as HTMLSelectElement).value).toBe(
      's-1',
    );
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
  });

  it('keeps the close unreachable while the reviewed folio is unpaid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({ folioId: 'f-2', stayId: 's-1', balanceMinor: 1500, openBalanceApproval: null }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    });
    // #588 (`FR-CKO-4`): the confirm carries the same gate as the
    // Check out button, so an unpaid reviewed folio cannot be closed
    // from any route — the button is disabled and nothing commits.
    expect(
      (wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
  });

  it('refuses a stale review locally on the confirm route with no close', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // Review reads a settled, charged folio, a charge lands afterwards,
    // and Stay would refuse SETTLEMENT_REQUIRED: #588 makes the desk
    // refuse first on its own fresh read, so no CheckOut is even sent.
    let balanceMinor = 0;
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: parseBody(init).stayId,
            balanceMinor,
            openBalanceApproval: null,
            charges: [
              {
                itemKind: 'nightly-room-charge',
                itemName: 'Room 109',
                amountMinor: 120000,
                postedAt: '2026-10-26T08:00:00.000Z',
              },
            ],
            payments: [],
          }),
        );
      }
      if (url === '/v1/stay/CheckOut') {
        return Promise.resolve(
          jsonResponse({ code: 'SETTLEMENT_REQUIRED', message: 'settle first' }, 409),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    // The charge lands after the review and before the confirm.
    balanceMinor = 900;
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain('open balance');
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/rooms/ReleaseRoom'),
    ).toHaveLength(0);
  });

  it('still maps a server SETTLEMENT_REQUIRED reply to the plain refusal', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // Defence in depth: the desk gate passes but Stay refuses the
    // close, and the desk still shows the plain refusal with the
    // approval form open (#588 keeps the server branch).
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckOut') {
        return Promise.resolve(
          jsonResponse({ code: 'SETTLEMENT_REQUIRED', message: 'settle first' }, 409),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain('open balance');
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/rooms/ReleaseRoom'),
    ).toHaveLength(0);
  });

  it('keeps the close when the room release fails and names the next step', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ReleaseRoom') {
        return Promise.resolve(
          jsonResponse({ code: 'INTERNAL', message: 'rooms down' }, 500),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    await confirmCheckout(wrapper);
    // #588 (`FR-CKO-2`): the close stands and is reported closed; the
    // release failure is its own plain sentence naming the next step.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-room-release"]').text()).toContain(
        'still reads occupied',
      );
    });
    expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
      'Checked out for Guest Two',
    );
    expect(wrapper.find('[data-testid="stay-room-release"]').text()).toContain('Reload the desk');
    expect(wrapper.find('[data-testid="stay-checkout-error"]').exists()).toBe(false);
    // No retry, no second close.
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/rooms/ReleaseRoom'),
    ).toHaveLength(1);
  });

  it('says the room is already free when the release finds it unoccupied', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ReleaseRoom') {
        return Promise.resolve(
          jsonResponse({ code: 'STATE_ILLEGAL', message: 'Room 109 is vacant-dirty, not occupied.' }, 422),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-room-release"]').text()).toContain(
        'Room 109 is already free.',
      );
    });
    // No housekeeping state is claimed the panel did not set.
    expect(wrapper.find('[data-testid="stay-room-release"]').text()).not.toContain('dirty');
    expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain('Checked out');
  });

  it('names an already-closed stay on the second close instead of the raw envelope', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // The stay service refuses the second close with STATE_ILLEGAL
    // naming the stay and its closed state (Refs #365): the view
    // must name the closed stay in plain words.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckOut') {
        return Promise.resolve(
          jsonResponse(
            {
              code: 'STATE_ILLEGAL',
              message: 'Stay s-1 is closed, not in house.',
              details: { stayId: 's-1', state: 'closed' },
            },
            422,
          ),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain(
        'already checked out',
      );
    });
    expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain(
      'closing it again is refused',
    );
  });

  it('normalizes a stringified folio approval to the contracted object on check-out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    // Billing serves the recorded approval as a JSON string while
    // the contract types it as an object (Refs #338): the view
    // must send the parsed object or the stay gate refuses it.
    // #588 adds the provenance the approval needs: identity, hotel
    // role, and the recorded time.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-2',
            stayId: 's-1',
            balanceMinor: 1500,
            openBalanceApproval:
              '{"approvedBy":"Night Manager","role":"manager","approvedAt":"2026-11-09T10:15:00.000Z"}',
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'Approved by Night Manager (Manager) at',
      );
    });
    await confirmCheckout(wrapper);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain('Checked out');
    });
    const checkoutBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/stay/CheckOut')?.[1],
    );
    expect(checkoutBody.openBalanceApproval).toEqual({
      approvedBy: 'Night Manager',
      role: 'manager',
      approvedAt: '2026-11-09T10:15:00.000Z',
    });
  });

  it('asks once through the confirm dialog before checking out', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain(
        'balance is zero',
      );
    });

    // Opening the dialog performs no call by itself.
    const before = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === '/v1/stay/CheckOut',
    ).length;
    await wrapper.find('[data-testid="stay-checkout"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-dialog"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="stay-checkout-dialog"]').text()).toContain(
      'Check out this stay now?',
    );
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(before);

    // Cancelling closes the dialog with no check-out call.
    await wrapper.find('[data-testid="stay-checkout-cancel"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-dialog"]').exists()).toBe(false);
    });
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]) === '/v1/stay/CheckOut'),
    ).toHaveLength(before);
  });

  it('returns the in-flight guard: a double-clicked check-in assigns once', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    const before = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === '/v1/rooms/AssignRoom',
    ).length;
    await Promise.all([
      wrapper.find('[data-testid="stay-checkin"]').trigger('click'),
      wrapper.find('[data-testid="stay-checkin"]').trigger('click'),
    ]);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    const after = fetchMock.mock.calls.filter(
      (call) => String(call[0]) === '/v1/rooms/AssignRoom',
    ).length;
    expect(after - before).toBe(1);
  });

  it('expires the session with the gate notice on 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401));
      }
      return Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401));
    });
    // Any panel action hits the expired session: reviewing the
    // picked stay surfaces the gate through the shared client.
    await wrapper.find('[data-testid="stay-checkout-stay"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    // The shared client expires the session and routes to the
    // gate (covered in the shell gate suite); the view keeps no
    // sign-in copy.
    await vi.waitFor(() => {
      expect(useSessionStore().token).toBeNull();
    });
    expect(useSessionStore().signOutNotice).toBe('session-expired');
    expect(useSessionStore().isSignedIn).toBe(false);
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  // Stay v2 board (Refs #541, `docs/design/Stay.dc.html:3`): the
  // check-in card carries the arrival select and the room select
  // with the explicit empty prompt plus the amber pick-a-ready-room
  // note and the check-in action; the check-out card carries the
  // departing-guest select, the reviewer input, the review-folio
  // action, and the fully-paid gate note.
  it('renders the v2 panels with the board copy in both locales', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    const checkinCard = wrapper.find('[data-testid="stay-checkin-card"]');
    const checkoutCard = wrapper.find('[data-testid="stay-checkout-card"]');
    // Actions ride their design cards: arrival plus room plus
    // check-in on the check-in card; departing guest plus reviewer
    // plus review on the check-out card.
    expect(checkinCard.find('[data-testid="stay-checkin-arrival"]').exists()).toBe(true);
    expect(checkinCard.find('[data-testid="stay-checkin-room"]').exists()).toBe(true);
    expect(checkinCard.find('[data-testid="stay-checkin"]').exists()).toBe(true);
    expect(checkoutCard.find('[data-testid="stay-checkout-stay"]').exists()).toBe(true);
    expect(checkoutCard.find('[data-testid="stay-approval-by"]').exists()).toBe(true);
    expect(checkoutCard.find('[data-testid="stay-review"]').exists()).toBe(true);
    // The static board carries no check-out button: it appears only
    // once a folio review produces a context (flow state).
    expect(checkoutCard.find('[data-testid="stay-checkout"]').exists()).toBe(false);
    // The card titles match the board.
    expect(checkinCard.find('h3').text()).toBe('Check in');
    expect(checkoutCard.find('h3').text()).toBe('Check out');
    // The fully-paid gate note names the next step in plain words.
    expect(checkoutCard.find('[data-testid="stay-checkout-gate-note"]').text()).toContain(
      'fully paid',
    );

    // The empty prompt ships with the hint: with candidates
    // loaded but nothing picked, the select shows the explicit
    // empty option, the hint reads the plain-words next step, and
    // check-in stays blocked without calling AssignRoom.
    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
        'Booked: Standard',
      );
    });
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('');
    const hint = checkinCard.find('[data-testid="stay-checkin-room-hint"]');
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toContain('Choose a ready room first.');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'Pick a ready room first.',
      );
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/rooms/AssignRoom');

    // VI-primary copy (AC-DSK-8): the panels switch locale with no
    // mixed-locale copy.
    try {
      setLocale('vi');
      await wrapper.vm.$nextTick();
      expect(checkinCard.find('h3').text()).toBe('Nhận phòng');
      expect(checkoutCard.find('h3').text()).toBe('Trả phòng');
      expect(checkinCard.find('[data-testid="stay-checkin-room-hint"]').text()).toContain(
        'Hãy chọn một phòng sẵn sàng trước.',
      );
      expect(checkoutCard.find('[data-testid="stay-checkout-gate-note"]').text()).toContain(
        'Hoá đơn phải thanh toán đủ trước khi trả phòng.',
      );
      expect(checkoutCard.find('[data-testid="stay-review"]').text()).toContain('Xem hoá đơn');
    } finally {
      setLocale('en');
    }
  });

  // #596 (Refs #586, AC-DSK-17): the arrival select stays enabled
  // during the commit, so a pick inside that window starts a
  // preload of its own. The commit success reset owns the picker:
  // it bumps the load sequence and drops the pending load, so the
  // late read for that pick paints nothing into the cleared panel,
  // never re-locks the Check in button, and commits nothing again.
  it('drops a preload picked inside the commit window when the reset clears the panel', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const happy = stubHappyPath(fetchMock);
    const gates: { assign?: () => void; late?: () => void } = {};
    const commitHeld = new Promise<void>((resolve) => {
      gates.assign = resolve;
    });
    const lateHeld = new Promise<void>((resolve) => {
      gates.late = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = parseBody(init);
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return jsonResponse({
          businessDate: '2026-10-26',
          arrivals: [
            { reservationRef: 'RSV-1', guestId: 'g-1', roomId: null, actualArrival: null, actualDeparture: null },
            { reservationRef: 'RSV-2', guestId: 'g-1', roomId: null, actualArrival: null, actualDeparture: null },
          ],
          inHouse: [],
          departures: [],
        });
      }
      // The commit-window pick's preload is the late read: it only
      // resolves once the test releases it, after the commit.
      if (url === '/v1/reservations/GetReservation' && body.reservationRef === 'RSV-2') {
        await lateHeld;
        return jsonResponse({
          reservationId: 'r-2',
          reservationRef: 'RSV-2',
          roomTypeId: 'standard',
          guest: { guestId: 'g-1' },
        });
      }
      // The commit itself is held open so the pick lands mid-commit.
      if (url === '/v1/rooms/AssignRoom') {
        await commitHeld;
      }
      return happy(url, init);
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    const wrapper = mount(StayView, { global: { plugins: [pinia] } });
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-2"]').exists(),
      ).toBe(true);
    });

    const urls = (): string[] => fetchMock.mock.calls.map((call) => String(call[0]));
    const arrival = wrapper.find('[data-testid="stay-checkin-arrival"]');

    // The unchanged #594 flow: the pick preloads the booked-type
    // candidates and the one Check in click starts the commit.
    await arrival.setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(urls()).toContain('/v1/rooms/AssignRoom');
    });

    // A pick inside the commit window: the arrival select is still
    // enabled, so it starts a candidate preload for that pick.
    await arrival.setValue('RSV-2');
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(
          (call) =>
            String(call[0]) === '/v1/reservations/GetReservation' &&
            parseBody(call[1]).reservationRef === 'RSV-2',
        ),
      ).toHaveLength(1);
    });

    // The commit succeeds and clears the panel: the arrival pick is
    // gone, the button is usable again, and nothing stays in flight.
    gates.assign?.();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    await vi.waitFor(() => {
      expect((wrapper.find('[data-testid="stay-checkin"]').element as HTMLButtonElement).disabled).toBe(
        false,
      );
    });
    expect((arrival.element as HTMLSelectElement).value).toBe('');
    expect(wrapper.find('[data-testid="stay-checking-in"]').exists()).toBe(false);

    // The late read resolves after the reset: it paints no
    // candidate, no status, and no error into the cleared panel and
    // never re-locks the panel.
    gates.late?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();
    expect(
      wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text()),
    ).toEqual(['Choose a room...']);
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('');
    expect((arrival.element as HTMLSelectElement).value).toBe('');
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).not.toContain('Booked');
    expect(wrapper.find('[data-testid="stay-checkin-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stay-checking-in"]').exists()).toBe(false);
    expect((wrapper.find('[data-testid="stay-checkin"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );
    // One commit, once: no second AssignRoom / CheckIn /
    // CheckInReservation ever runs for the dropped pick.
    for (const op of [
      '/v1/rooms/AssignRoom',
      '/v1/stay/CheckIn',
      '/v1/reservations/CheckInReservation',
    ]) {
      expect(urls().filter((url) => url === op)).toHaveLength(1);
    }

    // The dropped pick cannot commit either (Refs #596): the panel
    // is empty again, so another Check in click keeps the plain
    // need_arrival guard and starts no second commit.
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
      'Choose an arriving guest first.',
    );
    for (const op of [
      '/v1/rooms/AssignRoom',
      '/v1/stay/CheckIn',
      '/v1/reservations/CheckInReservation',
    ]) {
      expect(urls().filter((url) => url === op)).toHaveLength(1);
    }
  });

  // #614 (Refs #586, #596, AC-DSK-17): the mirror half of the
  // commit-window race. A pick made inside the commit starts a
  // preload of its own; when that preload settles *before* the
  // commit does, it must not release the commit's in-flight state.
  // The Check in button stays disabled, a second click starts no
  // second commit, and once the commit settles exactly one
  // AssignRoom / CheckIn / CheckInReservation ran and the panel
  // shows the commit's own result, not the preload's.
  it('keeps the commit in flight when a commit-window preload settles first', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const happy = stubHappyPath(fetchMock);
    const gates: { assign?: () => void } = {};
    const commitHeld = new Promise<void>((resolve) => {
      gates.assign = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const body = parseBody(init);
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return jsonResponse({
          businessDate: '2026-10-26',
          arrivals: [
            { reservationRef: 'RSV-1', guestId: 'g-1', roomId: null, actualArrival: null, actualDeparture: null },
            { reservationRef: 'RSV-2', guestId: 'g-1', roomId: null, actualArrival: null, actualDeparture: null },
          ],
          inHouse: [],
          departures: [],
        });
      }
      // The commit-window pick is the deluxe type with a single
      // ready room, so its preload settles to a bound room while
      // the commit is still held: an observable mid-commit paint
      // whose `finally` is the release this case pins.
      if (url === '/v1/reservations/GetReservation' && body.reservationRef === 'RSV-2') {
        return jsonResponse({
          reservationId: 'r-2',
          reservationRef: 'RSV-2',
          roomTypeId: 'deluxe',
          guest: { guestId: 'g-1' },
        });
      }
      if (url === '/v1/rooms/ListRoomsByState' && body.state === 'vacant-inspected') {
        return jsonResponse({
          state: 'vacant-inspected',
          rooms: [
            { roomId: 'room-1', number: '101', roomTypeId: 'standard', state: 'vacant-inspected' },
            { roomId: 'room-2', number: '102', roomTypeId: 'standard', state: 'vacant-inspected' },
            { roomId: 'room-3', number: '201', roomTypeId: 'deluxe', state: 'vacant-inspected' },
          ],
        });
      }
      // The commit itself is held open so the pick and its preload
      // land mid-commit.
      if (url === '/v1/rooms/AssignRoom') {
        await commitHeld;
      }
      return happy(url, init);
    });

    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    const wrapper = mount(StayView, { global: { plugins: [pinia] } });
    await vi.waitFor(() => {
      expect(
        wrapper.find('[data-testid="stay-checkin-arrival"] option[value="RSV-2"]').exists(),
      ).toBe(true);
    });

    const urls = (): string[] => fetchMock.mock.calls.map((call) => String(call[0]));
    const commits = (): number[] => [
      urls().filter((url) => url === '/v1/rooms/AssignRoom').length,
      urls().filter((url) => url === '/v1/stay/CheckIn').length,
      urls().filter((url) => url === '/v1/reservations/CheckInReservation').length,
    ];
    const checkinButton = (): HTMLButtonElement =>
      wrapper.find('[data-testid="stay-checkin"]').element as HTMLButtonElement;
    const arrival = wrapper.find('[data-testid="stay-checkin-arrival"]');

    // The unchanged #594 flow: pick RSV-1, let the preload fill the
    // picker, and click Check in once to start the commit.
    await arrival.setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(commits()).toEqual([1, 0, 0]);
    });

    // A pick inside the commit window starts a candidate preload of
    // its own, and it settles (the deluxe room binds) before the
    // held commit does.
    await arrival.setValue('RSV-2');
    await vi.waitFor(() => {
      expect(
        (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
      ).toBe('room-3');
    });

    // The settled preload must not release the commit's in-flight
    // state: the panel still reads as busy and a click is a no-op,
    // so no second commit starts.
    expect(checkinButton().disabled).toBe(true);
    expect(wrapper.find('[data-testid="stay-checking-in"]').exists()).toBe(true);
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(commits()).toEqual([1, 0, 0]);

    // The commit settles: exactly one call of each commit operation,
    // the button usable again, and the panel shows the commit's own
    // result (no candidate, status, or error from the preload).
    gates.assign?.();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    await vi.waitFor(() => {
      expect(checkinButton().disabled).toBe(false);
    });
    expect(commits()).toEqual([1, 1, 1]);
    expect(wrapper.find('[data-testid="stay-checking-in"]').exists()).toBe(false);
    expect((arrival.element as HTMLSelectElement).value).toBe('');
    expect(
      wrapper.findAll('[data-testid="stay-checkin-room"] option').map((option) => option.text()),
    ).toEqual(['Choose a room...']);
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('');
    expect(wrapper.find('[data-testid="stay-checkin-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('RSV-1');
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).not.toContain('Deluxe');
  });
});

// Arrival room reassignment and stale-hold release (Refs #647,
// `RR1`-`RR9`; LLD 23.2-23.4). Every case asserts the exact call
// list and order, not only the rendered sentence: the defect this
// slice fixes is an ordering defect.
describe('arrival reassignment and stale-hold release (Refs #647)', () => {
  const callsTo = (
    fetchMock: ReturnType<typeof vi.fn>,
    url: string,
  ): Array<{ url: string; body: Record<string, unknown> }> =>
    fetchMock.mock.calls
      .filter((call) => String(call[0]) === url)
      .map((call) => ({ url, body: parseBody(call[1]) }));

  const urlsOf = (fetchMock: ReturnType<typeof vi.fn>): string[] =>
    fetchMock.mock.calls.map((call) => String(call[0]));

  async function pickArrivalAndRoom(
    wrapper: Awaited<ReturnType<typeof mountSignedIn>>,
    roomId: string,
  ): Promise<void> {
    await wrapper.find('[data-testid="stay-checkin-arrival"]').setValue('RSV-1');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue(roomId);
  }

  it('RR1 assigns only the room picked after the preload', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await pickArrivalAndRoom(wrapper, 'room-2');
    // The preload assigned nothing, so changing the room after it is
    // the room the commit assigns.
    expect(callsTo(fetchMock, '/v1/rooms/AssignRoom')).toHaveLength(0);
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    const assigned = callsTo(fetchMock, '/v1/rooms/AssignRoom');
    expect(assigned).toHaveLength(1);
    expect(assigned[0].body.roomNumber).toBe('101');
    expect(assigned[0].body.stayLink).toBeTruthy();
    expect(
      fetchMock.mock.calls
        .map((call) => parseBody(call[1]).roomNumber)
        .filter((number) => number === '102'),
    ).toHaveLength(0);
    expect(callsTo(fetchMock, '/v1/rooms/ReleaseRoom')).toHaveLength(0);
  });

  it('RR2 takes back the assigned room when the booking read refuses definitively', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    let bookingReads = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation') {
        bookingReads += 1;
        // First read is the preload; the second is the commit's
        // read-back, which refuses definitively.
        if (bookingReads === 2) {
          return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'gone' }, 404));
        }
      }
      return happy(url, init);
    });

    await pickArrivalAndRoom(wrapper, 'room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
        'room 101 is free again',
      );
    });
    expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
      'Unknown booking reference',
    );
    const releases = callsTo(fetchMock, '/v1/rooms/ReleaseRoom');
    expect(releases).toHaveLength(1);
    expect(releases[0].body.roomNumber).toBe('101');
    expect(releases[0].body.toState).toBe('vacant-inspected');
    expect(callsTo(fetchMock, '/v1/stay/CheckIn')).toHaveLength(0);
    expect(callsTo(fetchMock, '/v1/reservations/CheckInReservation')).toHaveLength(0);
  });

  it('RR3 takes back the assigned room when the stay write refuses definitively', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckIn') {
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'already in' }, 409));
      }
      return happy(url, init);
    });

    await pickArrivalAndRoom(wrapper, 'room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
        'room 101 is free again',
      );
    });
    expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
      'already checked in',
    );
    const releases = callsTo(fetchMock, '/v1/rooms/ReleaseRoom');
    expect(releases).toHaveLength(1);
    expect(releases[0].body).toMatchObject({ roomNumber: '101', toState: 'vacant-inspected' });
    expect(callsTo(fetchMock, '/v1/reservations/CheckInReservation')).toHaveLength(0);
  });

  it('RR4 releases nothing when only the reservation link fails after the stay landed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/CheckInReservation') {
        return Promise.resolve(jsonResponse({ code: 'STATE_ILLEGAL', message: 'closed' }, 422));
      }
      return happy(url, init);
    });

    await pickArrivalAndRoom(wrapper, 'room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'booking link is not recorded',
      );
    });
    // The stay names the room, so a room a live stay names is never
    // freed (LLD R14 / `FR-REA-1`).
    expect(callsTo(fetchMock, '/v1/rooms/ReleaseRoom')).toHaveLength(0);
    expect(callsTo(fetchMock, '/v1/stay/CheckIn')).toHaveLength(1);
  });

  it('RR5 releases nothing on an unreadable booking read or assignment', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    let bookingReads = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation') {
        bookingReads += 1;
        if (bookingReads === 2) {
          return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'boom' }, 500));
        }
      }
      return happy(url, init);
    });

    await pickArrivalAndRoom(wrapper, 'room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'check-in result could not be read',
      );
    });
    expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain('room 101');
    expect(callsTo(fetchMock, '/v1/rooms/ReleaseRoom')).toHaveLength(0);

    // Same rule for an unreadable assignment: nothing is released.
    const second = vi.fn();
    vi.stubGlobal('fetch', second);
    const secondWrapper = await mountSignedIn(second);
    const secondHappy = second.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    second.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/AssignRoom') {
        return Promise.reject(new TypeError('offline'));
      }
      return secondHappy(url, init);
    });
    await pickArrivalAndRoom(secondWrapper, 'room-1');
    await secondWrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(secondWrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'check-in result could not be read',
      );
    });
    expect(callsTo(second, '/v1/rooms/ReleaseRoom')).toHaveLength(0);
  });

  it('RR6 names a compensation that fails and never claims a freed room', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckIn') {
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'already in' }, 409));
      }
      if (url === '/v1/rooms/ReleaseRoom') {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'rooms down' }, 500));
      }
      return happy(url, init);
    });

    await pickArrivalAndRoom(wrapper, 'room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
        'room 101 still reads occupied',
      );
    });
    expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).not.toContain('free again');
    expect(urlsOf(fetchMock)).not.toContain('/v1/rooms/UpdateRoomState');
  });

  it('RR6 reads an already-free compensation as free, not as a manual state edit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckIn') {
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'already in' }, 409));
      }
      if (url === '/v1/rooms/ReleaseRoom') {
        return Promise.resolve(jsonResponse({ code: 'STATE_ILLEGAL', message: 'free' }, 422));
      }
      return happy(url, init);
    });

    await pickArrivalAndRoom(wrapper, 'room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain(
        'room 101 is free again',
      );
    });
    expect(urlsOf(fetchMock)).not.toContain('/v1/rooms/UpdateRoomState');
  });

  it('RR7 reassigns after a committed check-in in assign, move, release order', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('Moved Guest Two');
    });

    const urls = urlsOf(fetchMock);
    const assignAt = urls.indexOf('/v1/rooms/AssignRoom');
    const moveAt = urls.indexOf('/v1/stay/MoveRoom');
    const releaseAt = urls.indexOf('/v1/rooms/ReleaseRoom');
    expect(assignAt).toBeGreaterThanOrEqual(0);
    expect(moveAt).toBeGreaterThan(assignAt);
    expect(releaseAt).toBeGreaterThan(moveAt);

    const assigned = callsTo(fetchMock, '/v1/rooms/AssignRoom');
    expect(assigned).toHaveLength(1);
    expect(assigned[0].body).toMatchObject({ roomNumber: '101', stayLink: 's-1' });
    const moved = callsTo(fetchMock, '/v1/stay/MoveRoom');
    expect(moved).toHaveLength(1);
    expect(moved[0].body).toMatchObject({ stayId: 's-1', toRoomId: 'echo-101' });
    const releases = callsTo(fetchMock, '/v1/rooms/ReleaseRoom');
    expect(releases).toHaveLength(1);
    // The release follows the echo (`fromRoomId` room-9 = 109), not
    // the picker, and it goes to housekeeping.
    expect(releases[0].body).toMatchObject({ roomNumber: '109', toState: 'vacant-dirty' });
    const status = wrapper.find('[data-testid="stay-move-status"]').text();
    expect(status).toContain('Moved Guest Two from room 109 to room 101 at');
    expect(wrapper.find('[data-testid="stay-move-error"]').exists()).toBe(false);
  });

  it('RR8 releases the echo from-room even when the panel row is stale', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/MoveRoom') {
        const body = parseBody(init);
        // Another desk moved the stay first: the echo's from-room is
        // room-2 (102), not the remembered room-9 (109).
        return Promise.resolve(
          jsonResponse({
            stayId: body.stayId,
            reservationId: 'r-1',
            guestId: 'g-2',
            roomId: body.toRoomId,
            state: 'in-house',
            move: {
              fromRoomId: 'room-2',
              toRoomId: body.toRoomId,
              movedAt: '2026-11-11T09:30:00.000Z',
            },
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('Moved Guest Two');
    });
    const releases = callsTo(fetchMock, '/v1/rooms/ReleaseRoom');
    expect(releases).toHaveLength(1);
    expect(releases[0].body).toMatchObject({ roomNumber: '102', toState: 'vacant-dirty' });
    expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('from room 102');
  });

  it('RR9 refuses a lead refusal without moving or releasing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/AssignRoom') {
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'taken' }, 409));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-error"]').text()).toContain('just taken');
    });
    expect(callsTo(fetchMock, '/v1/stay/MoveRoom')).toHaveLength(0);
    expect(callsTo(fetchMock, '/v1/rooms/ReleaseRoom')).toHaveLength(0);
    expect(wrapper.find('[data-testid="stay-move-status"]').text()).toBe('');
    // The ready pool reloads so the taken room leaves the picker.
    expect(
      fetchMock.mock.calls.filter(
        (call) =>
          String(call[0]) === '/v1/rooms/ListRoomsByState' &&
          parseBody(call[1]).state === 'vacant-inspected',
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('RR9 compensates the target once when the stay-side move refuses', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/MoveRoom') {
        return Promise.resolve(jsonResponse({ code: 'STATE_ILLEGAL', message: 'not in house' }, 422));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain(
        'room 101 is free again',
      );
    });
    expect(wrapper.find('[data-testid="stay-move-error"]').text()).toContain('no longer in house');
    const releases = callsTo(fetchMock, '/v1/rooms/ReleaseRoom');
    expect(releases).toHaveLength(1);
    expect(releases[0].body).toMatchObject({ roomNumber: '101', toState: 'vacant-inspected' });
    expect(callsTo(fetchMock, '/v1/rooms/AssignRoom')).toHaveLength(1);
  });

  it('RR9 names a release that fails after the move and rolls nothing back', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/rooms/ReleaseRoom') {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'rooms down' }, 500));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-release"]').text()).toContain(
        'room 109 still reads occupied',
      );
    });
    expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('Moved Guest Two');
    expect(callsTo(fetchMock, '/v1/rooms/AssignRoom')).toHaveLength(1);
    expect(callsTo(fetchMock, '/v1/stay/MoveRoom')).toHaveLength(1);
  });

  it('RR9 moves once, then an unreadable outcome releases nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);
    const happy = fetchMock.getMockImplementation() as (
      url: string,
      init?: RequestInit,
    ) => Promise<Response>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/MoveRoom') {
        return Promise.resolve(jsonResponse({ code: 'INTERNAL', message: 'boom' }, 500));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-error"]').text()).toContain(
        'move result could not be read',
      );
    });
    const error = wrapper.find('[data-testid="stay-move-error"]').text();
    expect(error).toContain('109');
    expect(error).toContain('101');
    expect(callsTo(fetchMock, '/v1/rooms/ReleaseRoom')).toHaveLength(0);
    expect(callsTo(fetchMock, '/v1/rooms/AssignRoom')).toHaveLength(1);
  });

  it('RR9 makes a double-clicked move assign once', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await Promise.all([
      wrapper.find('[data-testid="stay-move"]').trigger('click'),
      wrapper.find('[data-testid="stay-move"]').trigger('click'),
    ]);
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('Moved Guest Two');
    });
    expect(callsTo(fetchMock, '/v1/rooms/AssignRoom')).toHaveLength(1);
    expect(callsTo(fetchMock, '/v1/stay/MoveRoom')).toHaveLength(1);
  });

  it('RR9 refuses a missing guest or ready room without writing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountSignedIn(fetchMock);

    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-error"]').text()).toContain(
        'Choose a guest in house first',
      );
    });
    await wrapper.find('[data-testid="stay-move-guest"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-move-room"]').setValue('');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-error"]').text()).toContain(
        'Pick a ready room first',
      );
    });
    expect(callsTo(fetchMock, '/v1/rooms/AssignRoom')).toHaveLength(0);
  });
});

// Source-level pins: the port keeps every check-in/out op and the
// folio gate vocabulary, and every paragraph stays in English.
describe('stay view source', () => {
  const requiredOps = [
    '/v1/stay/ListArrivalsDepartures',
    '/v1/rooms/ListRoomsByState',
    '/v1/guests/GetGuest',
    '/v1/rooms/AssignRoom',
    '/v1/stay/CheckIn',
    '/v1/stay/MoveRoom',
    '/v1/reservations/CheckInReservation',
    '/v1/billing/GetFolioBalance',
    '/v1/billing/PostCharge',
    '/v1/billing/RecordOpenBalanceApproval',
    '/v1/stay/CheckOut',
    '/v1/rooms/ReleaseRoom',
  ];

  it.each(requiredOps)('keeps the check-in/out op %s', (op) => {
    expect(stayViewSource).toContain(op);
  });

  it.each(['SETTLEMENT_REQUIRED', 'STATE_ILLEGAL', 'refused_open_balance', 'refused_already_closed', 'refused_approval_incomplete', 'refused_room_charge', 'room_release_failed', 'room_released', 'room_already_free', 'approval_recorded_by', 'idempotencyKey'])(
    'keeps the folio-gate vocabulary %s',
    (token) => {
      expect(stayViewSource).toContain(token);
    },
  );

  // #588: both routes to the close carry the same gate, so a later
  // change cannot quietly un-gate the dialog confirm.
  it('gates the Check out button and the dialog confirm together', () => {
    expect(stayViewSource).toContain(':disabled="!canCheckOut || checkingOut"');
    expect(stayViewSource).toContain('toState: \'vacant-dirty\'');
  });

  it('uses the session store plus the shared client and catalogue t()', () => {
    for (const token of ['useSessionStore', 'apiFetch', "t('desk.stay."]) {
      expect(stayViewSource).toContain(token);
    }
    expect(stayViewSource).not.toContain('DeskMessages');
    expect(stayViewSource).not.toContain('Authorization');
  });
});

// Refs #647 (`RR13`, rollout 6.17): the move/compensation copy is the
// one copy addition, and both locales must carry the decided keys with
// their placeholders intact. A drifted or invented string fails here,
// not only on an absent key.
describe('reassignment catalogue copy (Refs #647)', () => {
  const en = (enCatalogueDocument as unknown as { messages: Record<string, string> }).messages;
  const vi = (viCatalogueDocument as unknown as { messages: Record<string, string> }).messages;
  const params = (pattern: string): string[] =>
    [...pattern.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();

  const expectedCopy: Array<[string, string, string]> = [
    ['desk.stay.move_heading', 'Move room', 'Chuyển phòng'],
    ['desk.stay.move_guest_label', 'Guest in house', 'Khách đang lưu trú'],
    ['desk.stay.move_choose_guest', 'Choose a guest in house...', 'Chọn khách đang lưu trú...'],
    ['desk.stay.move_room_label', 'New room', 'Phòng mới'],
    ['desk.stay.move_choose_room', 'Choose a ready room...', 'Chọn phòng sẵn sàng...'],
    ['desk.stay.move_hint', 'Pick a guest in house and a ready room first.', 'Chọn khách đang lưu trú và phòng sẵn sàng trước.'],
    ['desk.stay.move_button', 'Move guest', 'Chuyển khách'],
    ['desk.stay.moving', 'Moving the guest…', 'Đang chuyển khách…'],
    ['desk.stay.move_need_guest', 'Choose a guest in house first.', 'Chọn khách đang lưu trú trước.'],
    ['desk.stay.moved_named', 'Moved {guest} from room {fromRoom} to room {toRoom} at {time}.', 'Đã chuyển {guest} từ phòng {fromRoom} sang phòng {toRoom} lúc {time}.'],
    ['desk.stay.move_refused_taken', 'That room was just taken. Pick another ready room.', 'Phòng đó vừa có người nhận. Chọn phòng sẵn sàng khác.'],
    ['desk.stay.move_refused_stay', 'That guest is no longer in house, so the move is refused.', 'Khách này không còn lưu trú nên không chuyển phòng được.'],
    ['desk.stay.move_compensated', 'The move was refused and room {toRoom} is free again.', 'Không chuyển được phòng và phòng {toRoom} đã trống trở lại.'],
    ['desk.stay.move_release_failed', 'The guest is now in room {toRoom}, but room {fromRoom} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.', 'Khách đã ở phòng {toRoom}, nhưng phòng {fromRoom} vẫn hiện đang có khách. Tải lại bàn lễ tân và báo quản lý nếu phòng vẫn hiện đang có khách.'],
    ['desk.stay.move_target_stuck', 'The move was refused, but room {toRoom} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.', 'Không chuyển được phòng, nhưng phòng {toRoom} vẫn hiện đang có khách. Tải lại bàn lễ tân và báo quản lý nếu phòng vẫn hiện đang có khách.'],
    ['desk.stay.move_outcome_unknown', 'The move result could not be read. Reload the desk and check rooms {fromRoom} and {toRoom} before acting again.', 'Không đọc được kết quả chuyển phòng. Tải lại bàn lễ tân và kiểm tra phòng {fromRoom} và {toRoom} trước khi làm tiếp.'],
    ['desk.stay.checkin_release_failed', 'The check-in was refused, but room {roomNumber} still reads occupied. Reload the desk, and tell the manager if it still shows occupied.', 'Không nhận phòng được, nhưng phòng {roomNumber} vẫn hiện đang có khách. Tải lại bàn lễ tân và báo quản lý nếu phòng vẫn hiện đang có khách.'],
    ['desk.stay.checkin_outcome_unknown', 'The check-in result could not be read. Reload the desk and check room {roomNumber} before acting again.', 'Không đọc được kết quả nhận phòng. Tải lại bàn lễ tân và kiểm tra phòng {roomNumber} trước khi làm tiếp.'],
    ['desk.stay.checkin_compensated', 'The check-in was refused and room {roomNumber} is free again.', 'Không nhận phòng được và phòng {roomNumber} đã trống trở lại.'],
    ['desk.stay.checkin_link_not_recorded', 'The guest is in room {roomNumber}, but the booking link is not recorded. Reload the desk, and tell the manager if the booking still shows no check-in.', 'Khách đã ở phòng {roomNumber} nhưng chưa ghi nhận liên kết đặt phòng. Tải lại bàn lễ tân và báo quản lý nếu đặt phòng vẫn chưa hiển thị việc nhận phòng.'],
  ];

  it('carries the 20 decided keys in both locales with matching placeholders', () => {
    for (const [key, enCopy, viCopy] of expectedCopy) {
      expect(en[key], `en ${key}`).toBe(enCopy);
      expect(vi[key], `vi ${key}`).toBe(viCopy);
      expect(params(en[key]), `en params ${key}`).toEqual(params(vi[key]));
    }
  });
});
