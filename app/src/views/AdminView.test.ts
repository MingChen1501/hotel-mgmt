// Characterization guard for the admin console migration
// (Refs #298, ADR-0003): AdminView replicates the
// `frontend/admin.html` inline-script behaviour — sessions
// (SignIn/SignOut), users/roles management (ListUsers, CreateUser,
// UpdateUserRole, UnlockIdentity), and the read-only audit view
// (QueryAuditLog) — plus the read-only hotel-config display over
// the existing GetHotelConfig op, through the shared Bearer client
// and the catalogue `t()` wrapper. Role gating (Refs #340, BR-35)
// hides every management section from front-desk callers behind a
// read-only notice with zero admin calls; owner/manager render the
// full console. No Playwright harness exists in
// this repo yet, so these Vitest component tests are the
// characterization coverage for the admin flows.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import AdminView from './AdminView.vue';
import { useSessionStore } from '../stores/session';
import { resetConnectivityForTests } from '../api/client';
import router from '../router';

vi.mock('../router', () => ({
  default: { replace: vi.fn() },
  createAppRouter: vi.fn(),
}));

interface StubUser {
  userId: string;
  displayName: string;
  signinIdentity: string;
  role: string;
  locked: boolean;
}

interface StubState {
  users: StubUser[];
  audit: Array<{ at: string; actor: string; action: string; entity: string; detail?: string }>;
  listUsersStatus: number;
  listUsersBody: unknown;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function freshState(): StubState {
  return {
    users: [
      { userId: 'u-1', displayName: 'Ada Owner', signinIdentity: 'owner', role: 'owner', locked: false },
      { userId: 'u-2', displayName: 'Cara Clerk', signinIdentity: 'cara', role: 'front-desk', locked: true },
    ],
    audit: [
      { at: '2026-10-26T08:00:00Z', actor: 'owner', action: 'user.created', entity: 'cara', detail: 'role=front-desk' },
      { at: '2026-10-26T07:00:00Z', actor: 'owner', action: 'config.updated', entity: 'hotel-config' },
    ],
    listUsersStatus: 200,
    listUsersBody: null,
  };
}

// Mutable backend stub: mutations change later reads, so refresh
// behaviour is pinned, not just request bodies.
function stubBackend(fetchMock: ReturnType<typeof vi.fn>, state: StubState): void {
  state.listUsersBody = null;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const body = init?.body !== undefined && init.body !== '' ? JSON.parse(init.body as string) : {};
    if (url === '/v1/admin/SignIn') {
      return Promise.resolve(
        jsonResponse({ token: 'tok-1', userId: 'u-1', displayName: 'Ada Owner', role: 'owner' }),
      );
    }
    if (url === '/v1/admin/ListUsers') {
      if (state.listUsersStatus !== 200) {
        return Promise.resolve(jsonResponse({ code: 'FORBIDDEN', message: 'Forbidden.' }, state.listUsersStatus));
      }
      state.listUsersBody = body;
      return Promise.resolve(jsonResponse({ users: state.users }));
    }
    if (url === '/v1/admin/CreateUser') {
      state.users.push({
        userId: 'u-3',
        displayName: body.displayName,
        signinIdentity: body.signinIdentity,
        role: body.role,
        locked: false,
      });
      state.audit.unshift({
        at: '2026-10-26T09:00:00Z',
        actor: 'owner',
        action: 'user.created',
        entity: body.signinIdentity,
      });
      return Promise.resolve(
        jsonResponse({
          userId: 'u-3',
          displayName: body.displayName,
          signinIdentity: body.signinIdentity,
          role: body.role,
        }),
      );
    }
    if (url === '/v1/admin/UpdateUserRole') {
      const user = state.users.find((candidate) => candidate.signinIdentity === body.signinIdentity);
      if (user !== undefined) {
        user.role = body.role;
      }
      state.audit.unshift({
        at: '2026-10-26T09:00:00Z',
        actor: 'owner',
        action: 'user.updated',
        entity: body.signinIdentity,
      });
      return Promise.resolve(
        jsonResponse({
          userId: user?.userId ?? 'u-x',
          displayName: user?.displayName ?? body.signinIdentity,
          signinIdentity: body.signinIdentity,
          role: body.role,
        }),
      );
    }
    if (url === '/v1/admin/UnlockIdentity') {
      const user = state.users.find((candidate) => candidate.signinIdentity === body.signinIdentity);
      if (user !== undefined) {
        user.locked = false;
      }
      return Promise.resolve(jsonResponse({ signinIdentity: body.signinIdentity, unlocked: true }));
    }
    if (url === '/v1/admin/GetHotelConfig') {
      return Promise.resolve(
        jsonResponse({ schemaVersion: 3, values: { timezone: 'Asia/Ho_Chi_Minh', maxStayNights: 30 } }),
      );
    }
    if (url === '/v1/admin/QueryAuditLog') {
      expect(body.limit).toBe(50);
      return Promise.resolve(jsonResponse({ entries: state.audit }));
    }
    if (url === '/v1/admin/SignOut') {
      return Promise.resolve(jsonResponse({ signedOut: true }));
    }
    throw new Error(`unexpected call ${url}`);
  });
}

function mountAdmin() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(AdminView, {
    global: { plugins: [pinia] },
  });
}

// The shell owns the one sign-in gate (Refs #338) and gates the
// router on sign-in, so every signed-in visit mounts this view with
// the session already present: preset the session first, then mount
// (the onMounted reload path), then wait for the rows.
async function signIn(fetchMock: ReturnType<typeof vi.fn>, state: StubState) {
  stubBackend(fetchMock, state);
  useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
  const wrapper = mountAdmin();
  await vi.waitFor(() => {
    expect(wrapper.find('[data-testid="admin-console"]').exists()).toBe(true);
  });
  await vi.waitFor(() => {
    expect(wrapper.findAll('[data-testid="admin-user-row"]')).toHaveLength(state.users.length);
  });
  await vi.waitFor(() => {
    expect(wrapper.findAll('[data-testid="admin-audit-row"]')).toHaveLength(state.audit.length);
  });
  return wrapper;
}

function callsTo(fetchMock: ReturnType<typeof vi.fn>, url: string): unknown[] {
  return fetchMock.mock.calls
    .filter((call) => call[0] === url)
    .map((call) => (call[1]?.body !== undefined && call[1].body !== '' ? JSON.parse(call[1].body as string) : {}));
}

describe('admin view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders the restricted notice with no per-screen sign-in copy when unsigned', () => {
    const wrapper = mountAdmin();
    expect(wrapper.find('[data-testid="admin-view"]').exists()).toBe(true);
    // Catalogue wiring (Refs #292): the heading resolves through t().
    expect(wrapper.find('[data-testid="admin-view"] h1').text()).toContain(
      'Admin: staff, hotel setup, and audit',
    );
    // The shell owns the one sign-in gate (Refs #338, FR-DSP-2):
    // no per-screen sign-in copy renders here anymore.
    expect(wrapper.find('[data-testid="admin-signin"]').exists()).toBe(false);
    // Fail-closed role gate (Refs #340): without a signed-in
    // manager/owner role there is no console, only the read-only
    // notice.
    expect(wrapper.find('[data-testid="admin-console"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-restricted-notice"]').exists()).toBe(true);
  });

  it('loads users, config, and audit under the shell session', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await signIn(fetchMock, freshState());

    // Users table: both stubbed accounts render with catalogue
    // locked wording (Refs #292) and the Save role / Unlock labels
    // (Refs #275).
    const rows = wrapper.findAll('[data-testid="admin-user-row"]');
    expect(rows[0]?.text()).toContain('Ada Owner');
    expect(rows[0]?.text()).toContain('no');
    expect(rows[1]?.text()).toContain('Cara Clerk');
    expect(rows[1]?.text()).toContain('yes');
    expect(rows[0]?.text()).toContain('Save role');
    expect(rows[1]?.text()).toContain('Unlock');
    // Unlock appears only for the locked account.
    expect(wrapper.find('[data-testid="admin-unlock-cara"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-unlock-owner"]').exists()).toBe(false);
    // Read-only config display over GetHotelConfig.
    expect(wrapper.find('[data-testid="admin-config-version"]').text()).toContain('3');
    expect(wrapper.find('[data-testid="admin-config-list"]').text()).toContain('timezone');
    expect(wrapper.find('[data-testid="admin-config-list"]').text()).toContain('Asia/Ho_Chi_Minh');
    // Audit view: newest first, with detail text.
    const auditRows = wrapper.findAll('[data-testid="admin-audit-row"]');
    expect(auditRows[0]?.text()).toContain('user.created');
    expect(auditRows[0]?.text()).toContain('role=front-desk');
  });

  it('attaches the Bearer token to every call after sign-in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await signIn(fetchMock, freshState());

    const calls = fetchMock.mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    // The sign-in itself happened in the shell gate, so every call
    // the view makes already carries the session token.
    for (const call of calls) {
      expect((call[1].headers as Headers).get('Authorization')).toBe('Bearer tok-1');
    }
  });

  it('creates an account and refreshes users plus audit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = freshState();
    const wrapper = await signIn(fetchMock, state);

    await wrapper.find('[data-testid="admin-create-name"]').setValue('Bob Manager');
    await wrapper.find('[data-testid="admin-create-identity"]').setValue('bob');
    await wrapper.find('[data-testid="admin-create-secret"] input').setValue('s3cret');
    await wrapper.find('[data-testid="admin-create-role"]').setValue('manager');
    await wrapper.find('[data-testid="admin-create-form"]').trigger('submit');
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="admin-user-row"]')).toHaveLength(3);
    });

    expect(callsTo(fetchMock, '/v1/admin/CreateUser')).toEqual([
      { displayName: 'Bob Manager', signinIdentity: 'bob', secret: 's3cret', role: 'manager' },
    ]);
    const rows = wrapper.findAll('[data-testid="admin-user-row"]');
    expect(rows[2]?.text()).toContain('Bob Manager');
    // The form resets after a successful create (legacy parity).
    expect((wrapper.find('[data-testid="admin-create-identity"]').element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('[data-testid="admin-users-error"]').exists()).toBe(false);
  });

  it('saves a role change through UpdateUserRole', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = freshState();
    const wrapper = await signIn(fetchMock, state);

    await wrapper.find('[data-testid="admin-role-select-cara"]').setValue('manager');
    await wrapper.find('[data-testid="admin-role-save-cara"]').trigger('click');
    await vi.waitFor(() => {
      expect(callsTo(fetchMock, '/v1/admin/UpdateUserRole')).toEqual([
        { signinIdentity: 'cara', role: 'manager' },
      ]);
    });
    await vi.waitFor(() => {
      expect((wrapper.find('[data-testid="admin-role-select-cara"]').element as HTMLSelectElement).value).toBe(
        'manager',
      );
    });
  });

  it('unlocks a locked identity through UnlockIdentity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = freshState();
    const wrapper = await signIn(fetchMock, state);

    await wrapper.find('[data-testid="admin-unlock-cara"]').trigger('click');
    await vi.waitFor(() => {
      expect(callsTo(fetchMock, '/v1/admin/UnlockIdentity')).toEqual([{ signinIdentity: 'cara' }]);
    });
    // Refresh shows the unlocked state: no Unlock button, "no" in
    // the locked column (Refs #275 catalogue wording).
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="admin-unlock-cara"]').exists()).toBe(false);
    });
    const rows = wrapper.findAll('[data-testid="admin-user-row"]');
    expect(rows[1]?.text()).toContain('no');
  });

  it('re-queries the audit log on refresh', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await signIn(fetchMock, freshState());

    expect(callsTo(fetchMock, '/v1/admin/QueryAuditLog')).toHaveLength(1);
    await wrapper.find('[data-testid="admin-audit-refresh"]').trigger('click');
    await vi.waitFor(() => {
      expect(callsTo(fetchMock, '/v1/admin/QueryAuditLog')).toHaveLength(2);
    });
    expect(wrapper.find('[data-testid="admin-audit-error"]').exists()).toBe(false);
  });

  it('expires the session with the gate notice on 401', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    // A bare 401 expires through the shared client.
    fetchMock.mockImplementation((url: string) => {
      if (url === '/v1/admin/ListUsers') {
        return Promise.resolve(new Response('{}', { status: 401 }));
      }
      throw new Error(`unexpected call ${url}`);
    });
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    mountAdmin();
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

  // Wrong-secret, locked-identity, and validation sign-in
  // failures moved to the shell gate suite (Refs #338,
  // FR-DSP-2): the shell owns the one sign-in form, so
  // `app/src/App.test.ts` covers the plain-sentence failure, the
  // distinct locked wording, and the expired notice.

  it('renders the full console for the manager role', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = freshState();
    stubBackend(fetchMock, state);
    // Owner/manager view unchanged (Refs #340): the manager reaches
    // the same management sections as the owner.
    useSessionStore().signIn('tok-1', 'Bob Manager', 'manager');
    const wrapper = mountAdmin();
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="admin-user-row"]')).toHaveLength(state.users.length);
    });
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="admin-audit-row"]')).toHaveLength(state.audit.length);
    });
    expect(wrapper.find('[data-testid="admin-restricted-notice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-console"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-create-form"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-config-list"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-audit-table"]').exists()).toBe(true);
  });

  it('hides every management section from front-desk callers and issues no admin calls', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = freshState();
    stubBackend(fetchMock, state);
    useSessionStore().signIn('tok-1', 'Cara Clerk', 'front-desk');
    const wrapper = mountAdmin();
    // Cosmetic role gate (Refs #340, BR-35 least privilege): no
    // management section renders, only the read-only notice — no
    // management action is reachable or clickable.
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="admin-restricted-notice"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-testid="admin-console"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-users-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-create-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-config-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-audit-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-restricted-notice"]').text()).toContain(
      'managed by the owner or manager',
    );
    // The view issues no admin call at all, so no server refusal is
    // ever surfaced; the session survives untouched. Server
    // enforcement stays the real gate (still FORBIDDEN there).
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="admin-restricted-notice"]').exists()).toBe(true);
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useSessionStore().isSignedIn).toBe(true);
  });

  it('shows the empty-audit fallback when there are no entries', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const state = freshState();
    state.audit = [];
    const wrapper = await signIn(fetchMock, state);
    expect(wrapper.find('[data-testid="admin-audit-table"]').text()).toContain(
      'No audit entries yet.',
    );
  });

  // Sign-out moved to the shell gate (Refs #338, FR-DSP-2):
  // covered in the shell gate suite in `app/src/App.test.ts`, including
  // the dead-token path that signs out locally all the same.
});
