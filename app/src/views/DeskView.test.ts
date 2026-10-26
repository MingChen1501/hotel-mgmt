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
import { mount } from '@vue/test-utils';
import DeskView from './DeskView.vue';
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
      const rooms: Record<string, unknown[]> = {
        'vacant-dirty': [{ roomId: 'r-1', number: '101', roomTypeId: 'standard', state: 'vacant-dirty' }],
        'vacant-clean': [{ roomId: 'r-2', number: '102', roomTypeId: 'standard', state: 'vacant-clean' }],
        'out-of-order': [{ roomId: 'r-3', number: '103', roomTypeId: 'suite', state: 'out-of-order' }],
      };
      return Promise.resolve(jsonResponse({ state: body.state, rooms: rooms[body.state] ?? [] }));
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
  return mount(DeskView, {
    global: { plugins: [pinia] },
  });
}

async function signIn(wrapper: ReturnType<typeof mountDesk>, fetchMock: ReturnType<typeof vi.fn>) {
  stubHappyPath(fetchMock);
  await wrapper.find('[data-testid="desk-signin-identity"]').setValue('owner');
  await wrapper.find('[data-testid="desk-signin-secret"]').setValue('s3cret');
  await wrapper.find('[data-testid="desk-signin-form"]').trigger('submit');
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

  it('renders the sign-in form when signed out', () => {
    const wrapper = mountDesk();
    expect(wrapper.find('[data-testid="desk-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the heading resolves through t().
    expect(wrapper.find('[data-testid="desk-view"] h1').text()).toContain('Desk Today');
    expect(wrapper.find('[data-testid="desk-signin"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="desk-dashboard"]').exists()).toBe(false);
  });

  it('signs in with identity plus secret and shows the dashboard', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    // Bearer session handling: the shared client attaches the token
    // to every call made after sign-in (the SignIn call itself
    // carries none — no token exists yet at that point).
    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect((calls[0]?.[1]?.headers as Headers).get('Authorization')).toBeNull();
    for (const call of calls.slice(1)) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
    // Role display, same as the legacy whoami/myrole line.
    expect(wrapper.find('[data-testid="desk-whoami"]').text()).toBe('Ada Owner');
    expect(wrapper.find('[data-testid="desk-myrole"]').text()).toBe('owner');
    expect(wrapper.find('[data-testid="desk-signin-error"]').exists()).toBe(false);
  });

  it('renders arrivals, in-house, and departures with resolved guest names', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    expect(wrapper.find('[data-testid="desk-business-date"]').text()).toBe(localBusinessDate());
    const arrivals = wrapper.find('[data-testid="desk-arrivals-table"]').text();
    expect(arrivals).toContain('Guest One');
    expect(arrivals).toContain('Room r-101');
    const inHouse = wrapper.find('[data-testid="desk-inhouse-table"]').text();
    expect(inHouse).toContain('Guest Two');
    expect(inHouse).toContain('Room r-102');
    // A stay with no room reference renders the catalogue fallback.
    const departures = wrapper.find('[data-testid="desk-departures-table"]').text();
    expect(departures).toContain('Not assigned');
  });

  it('renders the attention lists and the DailySheet cross-check line', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).toContain('101');
    expect(wrapper.find('[data-testid="desk-uninspected-list"]').text()).toContain('102');
    expect(wrapper.find('[data-testid="desk-outoforder-list"]').text()).toContain('103');
    const sheet = wrapper.find('[data-testid="desk-sheet-line"]').text();
    expect(sheet).toContain('1 arriving');
    expect(sheet).toContain('1 in house');
    expect(sheet).toContain('1 leaving');
    expect(sheet).toContain('1 open balances');
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
    await wrapper.find('[data-testid="desk-signin-identity"]').setValue('owner');
    await wrapper.find('[data-testid="desk-signin-secret"]').setValue('s3cret');
    await wrapper.find('[data-testid="desk-signin-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-arrivals-table"]').text()).toContain('Unknown guest');
    });
  });

  it('shows the empty catalogue string when every list is empty', async () => {
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
    await wrapper.find('[data-testid="desk-signin-identity"]').setValue('owner');
    await wrapper.find('[data-testid="desk-signin-secret"]').setValue('s3cret');
    await wrapper.find('[data-testid="desk-signin-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-arrivals-table"]').text()).toContain('No entries yet.');
    });
    expect(wrapper.find('[data-testid="desk-dirty-list"]').text()).toContain('No entries yet.');
  });

  it('surfaces sign-in failures without signing in', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ code: 'UNAUTHENTICATED', message: 'bad secret' }, 401),
    );
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await wrapper.find('[data-testid="desk-signin-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-signin-error"]').exists()).toBe(true);
    });
    expect(useSessionStore().isSignedIn).toBe(false);
    expect(wrapper.find('[data-testid="desk-dashboard"]').exists()).toBe(false);
  });

  it('returns to sign-in with the session-expired string when refresh gets a 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-signin"]').exists()).toBe(true);
    });
    expect(useSessionStore().token).toBeNull();
    // The expiry string lands a microtask after the sign-out
    // re-render, so wait for it explicitly (legacy parity: the
    // session-expired catalogue string on the sign-in form).
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-signin-error"]').text()).toContain('Session expired');
    });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('signs out back to the sign-in form', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountDesk();
    await signIn(wrapper, fetchMock);

    await wrapper.find('[data-testid="desk-signout"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="desk-signin"]').exists()).toBe(true);
    });
    expect(useSessionStore().token).toBeNull();
    expect(fetchMock.mock.calls.some((call) => call[0] === '/v1/admin/SignOut')).toBe(true);
  });

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
});
