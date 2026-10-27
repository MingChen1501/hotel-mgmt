// Guard for FR-SHL-2 (shared-client 401-to-sign-in) + NFR-SHL-3
// (offline banner with manual retry, zero queued writes) at client
// level (Refs #291, LLD section 11.2–11.3). Served halves live in
// `script/shell-served-check.sh`; the banner rendering guard lives
// in `src/App.test.ts`.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  apiFetch,
  attachConnectivityListeners,
  connectivity,
  resetConnectivityForTests,
  retryLastRequest,
} from './client';
import { useSessionStore } from '../stores/session';
import router from '../router';

vi.mock('../router', () => ({
  default: { replace: vi.fn() },
  createAppRouter: vi.fn(),
}));

const routerReplace = router.replace as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('shared Bearer API client', () => {
  beforeEach(() => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    resetConnectivityForTests();
    routerReplace.mockClear();
    attachConnectivityListeners();
  });

  it('attaches the session token as a Bearer header', async () => {
    useSessionStore().signIn('tok-1');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await apiFetch('/v1/admin/healthz', { method: 'GET' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('clears the store token and routes to sign-in on a 401', async () => {
    useSessionStore().signIn('tok-1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    try {
      await expect(apiFetch('/v1/stay/CheckIn')).rejects.toThrow('Session expired. Sign in again.');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(useSessionStore().token).toBeNull();
    expect(sessionStorage.getItem('hotel-mgmt.session.token')).toBeNull();
    expect(routerReplace).toHaveBeenCalledWith('/');
  });

  it('treats an UNAUTHENTICATED envelope as sign-out even on HTTP 200', async () => {
    useSessionStore().signIn('tok-1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { code: 'UNAUTHENTICATED', message: 'stale' })),
    );
    try {
      await expect(apiFetch('/v1/stay/CheckIn')).rejects.toThrow('Session expired. Sign in again.');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(useSessionStore().token).toBeNull();
    expect(routerReplace).toHaveBeenCalledWith('/');
  });

  it('preserves the locked code and wording on a locked-identity 401', async () => {
    useSessionStore().signIn('tok-1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          code: 'IDENTITY_LOCKED',
          message: 'Identity owner is locked after repeated failures.',
          details: { signinIdentity: 'owner' },
        }),
      ),
    );
    try {
      // Locked sign-ins still clear the store and route to sign-in
      // (the single 401 path), but keep the locked envelope so the
      // sign-in screens show a locked-specific message instead of
      // the session-expired notice (Refs #319).
      const failure = await apiFetch('/v1/admin/SignIn').then(
        () => null,
        (err: unknown) => err,
      );
      expect(failure).toMatchObject({
        code: 'IDENTITY_LOCKED',
        status: 401,
        details: { signinIdentity: 'owner' },
      });
      expect((failure as Error).message).toBe('Identity owner is locked after repeated failures.');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(useSessionStore().token).toBeNull();
    expect(routerReplace).toHaveBeenCalledWith('/');
  });

  it('keeps the expired-session notice for a non-locked 401 envelope', async () => {
    useSessionStore().signIn('tok-1');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Unknown identity or wrong secret.' }),
      ),
    );
    try {
      const failure = await apiFetch('/v1/admin/SignIn').then(
        () => null,
        (err: unknown) => err,
      );
      expect(failure).toMatchObject({ code: 'UNAUTHENTICATED' });
      expect((failure as Error).message).toBe('Session expired. Sign in again.');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('marks the desk offline on a network failure and queues zero writes', async () => {
    useSessionStore().signIn('tok-1');
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(
        apiFetch('/v1/billing/PostCharge', { method: 'POST', body: '{}' }),
      ).rejects.toMatchObject({ code: 'OFFLINE' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(connectivity.online).toBe(false);
    expect(connectivity.lastError).toContain('Load failed');
    // Exactly one attempt: the failed write is never queued or replayed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reconnect alone replays nothing; only a manual retry re-issues', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await expect(apiFetch('/v1/billing/PostCharge', { method: 'POST', body: '{}' })).rejects.toMatchObject({
        code: 'OFFLINE',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event('online'));
      // No automatic replay on reconnect (LLD section 11.3: retry is
      // always staff-initiated).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const retried = await retryLastRequest();
      expect(retried).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(connectivity.online).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('retry reports false when nothing failed', async () => {
    await expect(retryLastRequest()).resolves.toBe(false);
  });

  it('marks the desk offline on the browser offline event', () => {
    window.dispatchEvent(new Event('offline'));
    expect(connectivity.online).toBe(false);
    expect(connectivity.lastError).toContain('offline');
  });
});
