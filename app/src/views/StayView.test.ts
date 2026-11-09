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
    // source for the arrival select. Empty by default; tests with
    // live arrival rows override this handler.
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
      return Promise.resolve(
        jsonResponse({ folioId: 'f-1', stayId: body.stayId, balanceMinor: 0, openBalanceApproval: null }),
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
    if (url === '/v1/rooms/ReleaseRoom') {
      expect(body.toState).toBe('vacant-dirty');
      expect(body.actor).toBe('Ada Owner');
      const roomNumber = String(body.roomNumber);
      return Promise.resolve(
        jsonResponse({ roomNumber, oldState: 'occupied', newState: 'vacant-dirty' }),
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
    // Zero extras vs the board: the lists, move, and times
    // sections are gone.
    for (const hook of [
      'stay-main',
      'stay-lists-card',
      'stay-business-date',
      'stay-move-card',
      'stay-times-card',
      'stay-booking-ref',
    ]) {
      expect(wrapper.find(`[data-testid="${hook}"]`).exists()).toBe(false);
    }
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

    // Review reads zero, then a room charge lands before the confirm:
    // #588 (`FR-CKO-4`) the confirm re-reads and refuses on the fresh
    // value instead of closing on the reviewed one.
    let folioCalls = 0;
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        folioCalls += 1;
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-1',
            stayId: 's-1',
            balanceMinor: folioCalls === 1 ? 0 : 120000,
            openBalanceApproval: null,
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

    // Review reads zero, a charge lands afterwards, and Stay would
    // refuse SETTLEMENT_REQUIRED: #588 makes the desk refuse first on
    // its own fresh read, so no CheckOut is even sent.
    let folioCalls = 0;
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        folioCalls += 1;
        if (folioCalls === 1) {
          return Promise.resolve(
            jsonResponse({ folioId: 'f-1', stayId: 's-1', balanceMinor: 0, openBalanceApproval: null }),
          );
        }
        return Promise.resolve(
          jsonResponse({ folioId: 'f-1', stayId: 's-1', balanceMinor: 900, openBalanceApproval: null }),
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
    '/v1/reservations/CheckInReservation',
    '/v1/billing/GetFolioBalance',
    '/v1/billing/RecordOpenBalanceApproval',
    '/v1/stay/CheckOut',
    '/v1/rooms/ReleaseRoom',
  ];

  it.each(requiredOps)('keeps the check-in/out op %s', (op) => {
    expect(stayViewSource).toContain(op);
  });

  it.each(['SETTLEMENT_REQUIRED', 'STATE_ILLEGAL', 'refused_open_balance', 'refused_already_closed', 'refused_approval_incomplete', 'room_release_failed', 'room_released', 'room_already_free', 'approval_recorded_by', 'idempotencyKey'])(
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
