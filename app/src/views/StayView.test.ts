// Characterization guard for the stay screen migration
// (Refs #295, ADR-0003): StayView replicates the
// `frontend/stay.html` inline-script behaviour — sign-in plus the
// arrival pick (two-click check-in: GetReservation plus ready rooms
// of the booked type, then AssignRoom with the client-generated
// stayId as stayLink, CheckIn carrying the roomId from the AssignRoom
// echo, and CheckInReservation), mid-stay move (AssignRoom plus
// MoveRoom with the echoed roomId and both room numbers visible),
// RecordActualTimes, and the folio-gated check-out (GetFolioBalance
// review, RecordOpenBalanceApproval, CheckOut with the reviewed
// folio id plus balance plus approval, SETTLEMENT_REQUIRED
// surfacing) — through the shared Bearer client and the catalogue
// `t()` wrapper. Expected arrivals (Refs #349) resolve from the
// reservation calendar because live stay rows never carry booking
// references. No Playwright harness exists in this repo yet, so
// these Vitest component tests are the characterization coverage
// for the stay flows.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import StayView from './StayView.vue';
import stayViewSource from './StayView.vue?raw';
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

// Full happy-path backend: sign-in, daily lists (one arrival, one
// in-house stay, one departure) with guest names, ready plus
// occupied rooms, the booking read-back, the assign/check-in/
// check-in-reservation chain, the move chain, time recording, and
// the folio review/approval/check-out chain. Returns the handler so
// a test can wrap it (e.g. to fail only one op) while the rest of
// the flow stays on the happy path.
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
    // source for the pick buttons. Empty by default; tests with
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
    if (url === '/v1/stay/MoveRoom') {
      expect(String(body.toRoomId)).toMatch(/^echo-/);
      return Promise.resolve(
        jsonResponse({
          stayId: body.stayId,
          reservationId: 'r-1',
          guestId: 'g-2',
          roomId: body.toRoomId,
          state: 'in-house',
          move: { movedAt: '2026-10-26T10:00:00.000Z' },
        }),
      );
    }
    if (url === '/v1/stay/RecordActualTimes') {
      return Promise.resolve(
        jsonResponse({
          stayId: body.stayId,
          actualArrival: body.actualArrival ?? '2026-10-25T14:00:00.000Z',
          actualDeparture: body.actualDeparture ?? null,
        }),
      );
    }
    if (url === '/v1/billing/GetFolioBalance') {
      return Promise.resolve(
        jsonResponse({ folioId: 'f-1', stayId: body.stayId, balanceMinor: 0, openBalanceApproval: null }),
      );
    }
    if (url === '/v1/billing/RecordOpenBalanceApproval') {
      expect(body.idempotencyKey).toBeTruthy();
      return Promise.resolve(
        jsonResponse({
          openBalanceApproval: { approvedBy: body.approvedBy },
          balanceMinor: 1500,
        }),
      );
    }
    if (url === '/v1/stay/CheckOut') {
      expect(body.idempotencyKey).toBeTruthy();
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

async function signIn(wrapper: ReturnType<typeof mountStay>, fetchMock: ReturnType<typeof vi.fn>) {
  // The shell owns the one sign-in gate (Refs #338): views mount
  // with a signed-in session preset, then load like a reload.
  stubHappyPath(fetchMock);
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

  it('renders the stay lists with no per-screen sign-in copy', () => {
    const wrapper = mountStay();
    expect(wrapper.find('[data-testid="stay-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the heading resolves through t().
    expect(wrapper.find('[data-testid="stay-view"] h1').text()).toContain(
      'Check guests in, move them, and check them out',
    );
    // The shell owns the one sign-in gate (Refs #338, FR-DSP-2):
    // no per-screen sign-in copy renders here anymore.
    expect(wrapper.find('[data-testid="stay-signin"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stay-main"]').exists()).toBe(true);
  });

  it('loads the three daily lists with bearer auth under the shell session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    // Bearer session handling: the shared client attaches the token
    // to every call (the sign-in itself happened in the shell gate).
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
    expect(wrapper.text()).toContain('Guest Two');
    expect(wrapper.text()).toContain('Guest Three');
    expect(wrapper.find('[data-testid="stay-lists-error"]').exists()).toBe(false);
  });

  it('drives the arrival pick to a checked-in stay through the echoed room id', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    // Arrival pick fills the booking reference (legacy parity).
    await wrapper.find('[data-testid="stay-use-arrival-RSV-1"]').trigger('click');
    expect((wrapper.find('[data-testid="stay-booking-ref"]').element as HTMLInputElement).value).toBe(
      'RSV-1',
    );

    // First click loads the booking plus the ready rooms of the
    // booked type into the picker.
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    const options = wrapper.findAll('[data-testid="stay-checkin-room"] option');
    // Refs #411: the picker opens on an explicit empty placeholder
    // so the shown value always matches the bound room id.
    expect(options.map((option) => option.text())).toEqual(['Pick a ready room…', '101', '102']);
    expect(options[0].element.getAttribute('value')).toBe('');

    // Second click commits: AssignRoom (roomNumber plus stayLink)
    // then CheckIn with the roomId from the AssignRoom echo, then
    // CheckInReservation.
    await wrapper.find('[data-testid="stay-checkin-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Checked in');
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).toContain('/v1/rooms/AssignRoom');
    expect(urls).toContain('/v1/stay/CheckIn');
    expect(urls).toContain('/v1/reservations/CheckInReservation');
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

  // Refs #411: with candidates loaded but no room picked, the
  // select shows the empty placeholder (no phantom selection) and
  // a second Check in click keeps the need_room guard without
  // calling AssignRoom.
  it('keeps the need_room guard when no ready room is picked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="stay-booking-ref"]').setValue('RSV-1');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
    // The placeholder is selected: nothing is bound yet.
    expect(
      (wrapper.find('[data-testid="stay-checkin-room"]').element as HTMLSelectElement).value,
    ).toBe('');
    expect(wrapper.find('[data-testid="stay-checkin-room"]').text()).toContain(
      'Pick a ready room…',
    );

    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'Pick a ready room first.',
      );
    });
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/rooms/AssignRoom');
  });

  // Refs #349: live stay rows never carry booking references, so
  // the pick buttons render from the reservation calendar
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
    const wrapper = mountStay();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="stay-refresh"]').trigger('click');

    // Only the verified due reference renders a pick button; the
    // checked-in and cancelled calendar rows never do.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-use-arrival-RSV-LIVE"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="stay-use-arrival-RSV-OLD"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stay-use-arrival-RSV-CX"]').exists()).toBe(false);
    // The already-checked-in stay row still renders with its guest
    // name, but without a pick button: there is nothing left to
    // check in.
    expect(wrapper.text()).toContain('Guest Two');

    // The pick fills the live reference and drives the check-in
    // quote step against the real booking.
    await wrapper.find('[data-testid="stay-use-arrival-RSV-LIVE"]').trigger('click');
    expect((wrapper.find('[data-testid="stay-booking-ref"]').element as HTMLInputElement).value).toBe(
      'RSV-LIVE',
    );
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-status"]').text()).toContain('Booked: Standard');
    });
  });

  it('keeps the stay lists when the reservation calendar is down', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/QueryCalendar') {
        return Promise.resolve(jsonResponse({ code: 'VALIDATION_FAILED', message: 'calendar down' }, 400));
      }
      return happy(url, init);
    });
    const wrapper = mountStay();
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await wrapper.find('[data-testid="stay-refresh"]').trigger('click');

    // The stay lists still load (with their stubbed pickable row),
    // so the typed-ref path keeps working without the calendar.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-arrivals-table"] tbody tr td').text()).toContain(
        'Guest One',
      );
    });
    expect(wrapper.find('[data-testid="stay-lists-error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="stay-use-arrival-RSV-1"]').exists()).toBe(true);
  });

  it('maps an unknown booking reference to the catalogue refusal string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/reservations/GetReservation') {
        return Promise.resolve(jsonResponse({ code: 'NOT_FOUND', message: 'no such booking' }, 404));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-booking-ref"]').setValue('RSV-NOPE');
    await wrapper.find('[data-testid="stay-checkin"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'Unknown booking reference',
      );
    });
  });

  it('maps a taken room to the catalogue refusal string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    const happy = stubHappyPath(fetchMock);
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
      expect(wrapper.find('[data-testid="stay-checkin-error"]').text()).toContain(
        'just taken',
      );
    });
    expect(assigns).toBe(1);
  });

  it('maps an already-checked-in booking to the catalogue refusal string', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/stay/CheckIn') {
        return Promise.resolve(jsonResponse({ code: 'CONFLICT', message: 'already in' }, 409));
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-booking-ref"]').setValue('RSV-1');
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

  it('moves a stay to the echoed room with both room numbers visible', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    // Use-this-stay fills all three stay id fields (legacy parity).
    await wrapper.find('[data-testid="stay-use-stay-s-1"]').trigger('click');
    expect((wrapper.find('[data-testid="stay-move-stay-id"]').element as HTMLInputElement).value).toBe(
      's-1',
    );
    expect((wrapper.find('[data-testid="stay-times-stay-id"]').element as HTMLInputElement).value).toBe(
      's-1',
    );
    expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain(
      'Working with Guest Two (109).',
    );
    // The exact stay ID hides behind the move reference details.
    expect(wrapper.find('[data-testid="stay-move-status"]').text()).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    await wrapper.find('[data-testid="stay-move-details-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="stay-move-details-body"]').text()).toContain('s-1');

    await wrapper.find('[data-testid="stay-move-room"]').setValue('room-1');
    await wrapper.find('[data-testid="stay-move"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('Moved from room');
    });
    // Both the old room (109, resolved through ListRoomsByState)
    // and the new room (101) surface in the status line.
    expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('109');
    expect(wrapper.find('[data-testid="stay-move-status"]').text()).toContain('101');
    const moveBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/stay/MoveRoom')?.[1],
    );
    expect(moveBody.toRoomId).toBe('echo-101');
  });

  it('records actual times and keeps the recorded values in the status', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="stay-times-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-times-arrival"]').setValue('2026-10-25T14:00');
    await wrapper.find('[data-testid="stay-times"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-times-status"]').text()).toContain(
        'Recorded times kept for Guest Two',
      );
    });
    // The exact stay ID hides behind the times reference details.
    await wrapper.find('[data-testid="stay-times-details-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="stay-times-details-body"]').text()).toContain('s-1');
    const timesBody = parseBody(
      fetchMock.mock.calls.find((call) => String(call[0]) === '/v1/stay/RecordActualTimes')?.[1],
    );
    expect(timesBody.stayId).toBe('s-1');
    expect(timesBody.actualArrival).toBeTruthy();
  });

  it('requires a stay and at least one time before recording', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="stay-times"]').trigger('click');
    expect(wrapper.find('[data-testid="stay-times-status"]').text()).toContain(
      'Choose a stay from the lists first',
    );
    await wrapper.find('[data-testid="stay-times-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-times"]').trigger('click');
    expect(wrapper.find('[data-testid="stay-times-status"]').text()).toContain(
      'Enter an arrival or a departure time first',
    );
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls).not.toContain('/v1/stay/RecordActualTimes');
  });

  it('reviews a zero-balance folio and checks out without approval', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="stay-checkout-stay-id"]').setValue('s-1');
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
  });

  it('gates check-out behind the approval form for an open balance', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({ folioId: 'f-2', stayId: 's-1', balanceMinor: 1500, openBalanceApproval: null }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-error"]').text()).toContain('open balance');
    });
    expect(wrapper.find('[data-testid="stay-approval-section"]').exists()).toBe(true);
    expect((wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled).toBe(
      true,
    );

    await wrapper.find('[data-testid="stay-approval-by"]').setValue('Night Manager');
    await wrapper.find('[data-testid="stay-approval-role"]').setValue('manager');
    await wrapper.find('[data-testid="stay-approve"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain('Approval recorded.');
    });
    expect((wrapper.find('[data-testid="stay-checkout"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );
    const approvalBody = parseBody(
      fetchMock.mock.calls.find(
        (call) => String(call[0]) === '/v1/billing/RecordOpenBalanceApproval',
      )?.[1],
    );
    expect(approvalBody.approvedBy).toBe('Night Manager');
    expect(approvalBody.idempotencyKey).toBeTruthy();
  });

  it('surfaces SETTLEMENT_REQUIRED by reopening the approval form', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

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

    await wrapper.find('[data-testid="stay-checkout-stay-id"]').setValue('s-1');
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
  });

  it('names an already-closed stay on the second close instead of the raw envelope', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

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

    await wrapper.find('[data-testid="stay-checkout-stay-id"]').setValue('s-1');
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
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    // Billing serves the recorded approval as a JSON string while
    // the contract types it as an object (Refs #338): the view
    // must send the parsed object or the stay gate refuses it.
    const happy = stubHappyPath(fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/v1/billing/GetFolioBalance') {
        return Promise.resolve(
          jsonResponse({
            folioId: 'f-2',
            stayId: 's-1',
            balanceMinor: 1500,
            openBalanceApproval: '{"approvedBy":"Night Manager","role":"manager"}',
          }),
        );
      }
      return happy(url, init);
    });

    await wrapper.find('[data-testid="stay-checkout-stay-id"]').setValue('s-1');
    await wrapper.find('[data-testid="stay-review"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="stay-checkout-status"]').text()).toContain('Approval recorded.');
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
    });
  });

  it('asks once through the confirm dialog before checking out', async () => {    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="stay-checkout-stay-id"]').setValue('s-1');
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
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="stay-booking-ref"]').setValue('RSV-1');
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
    const wrapper = mountStay();
    await signIn(wrapper, fetchMock);

    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/stay/ListArrivalsDepartures') {
        return Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401));
      }
      return Promise.resolve(jsonResponse({ code: 'UNAUTHENTICATED', message: 'expired' }, 401));
    });
    await wrapper.find('[data-testid="stay-refresh"]').trigger('click');
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
});

// Source-level pins: the port keeps every legacy op and the folio
// gate vocabulary, and every paragraph stays in English.
describe('stay view source', () => {
  const requiredOps = [
    '/v1/stay/ListArrivalsDepartures',
    '/v1/rooms/ListRoomsByState',
    '/v1/guests/GetGuest',
    '/v1/rooms/AssignRoom',
    '/v1/stay/CheckIn',
    '/v1/reservations/CheckInReservation',
    '/v1/stay/MoveRoom',
    '/v1/stay/RecordActualTimes',
    '/v1/billing/GetFolioBalance',
    '/v1/billing/RecordOpenBalanceApproval',
    '/v1/stay/CheckOut',
  ];

  it.each(requiredOps)('keeps the legacy op %s', (op) => {
    expect(stayViewSource).toContain(op);
  });

  it.each(['SETTLEMENT_REQUIRED', 'STATE_ILLEGAL', 'refused_open_balance', 'refused_already_closed', 'idempotencyKey'])(
    'keeps the folio-gate vocabulary %s',
    (token) => {
      expect(stayViewSource).toContain(token);
    },
  );

  it('uses the session store plus the shared client and catalogue t()', () => {
    for (const token of ['useSessionStore', 'apiFetch', "t('desk.stay."]) {
      expect(stayViewSource).toContain(token);
    }
    expect(stayViewSource).not.toContain('DeskMessages');
    expect(stayViewSource).not.toContain('Authorization');
  });
});
