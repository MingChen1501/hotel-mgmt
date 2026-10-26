// Shared Bearer API client for the /app/ migration shell
// (Refs #291, LLD §11.2–11.3, ADR-0003 criteria 4 and 9).
//
// Contract (LLD §11 shared-client contract):
// - Every call carries `Authorization: Bearer <token>` from the
//   session store, never from page-local state.
// - Any `401` / `UNAUTHENTICATED` response clears the store token
//   and routes to sign-in: the single 401 path replacing the former
//   per-page handlers (deleted with the legacy static pages in #299:
//   `frontend/desk.html:83`, `book.html:112`,
//   `frontend/admin.html:69`).
// - The client owns connectivity state (`online`/`offline` events
//   plus failed-fetch detection) and drives the offline banner with
//   a safe manual retry. Explicitly NO write queueing: desk writes
//   are synchronous authoritative ops and queueing risks
//   double-charge, so a disconnect means clearly blocked — the same
//   as the former static pages.
import { reactive } from 'vue';
import { useSessionStore } from '../stores/session';
import router from '../router';

export interface ApiError extends Error {
  status?: number;
  code?: string;
  // Envelope `details` (e.g. `{ restriction }` on STATE_ILLEGAL),
  // carried so screens can map code+detail to catalogue strings
  // without branching on resolved wording (Refs #294).
  details?: unknown;
}

interface PendingRequest {
  path: string;
  init: RequestInit;
}

function apiError(message: string, status?: number, code?: string, details?: unknown): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  err.code = code;
  err.details = details ?? null;
  return err;
}

export const connectivity = reactive({
  online: true,
  lastError: null as string | null,
});

// The last request that failed on connectivity, kept ONLY so staff
// can retry it manually from the offline banner. It is never
// replayed automatically: there is no write queue in this shell.
let lastFailedRequest: PendingRequest | null = null;
let listenersAttached = false;

function setOffline(reason: string, req: PendingRequest | null): void {
  connectivity.online = false;
  connectivity.lastError = reason;
  lastFailedRequest = req;
}

function setOnline(): void {
  connectivity.online = true;
  connectivity.lastError = null;
}

// Idempotent: safe to call from both `main.ts` and tests.
export function attachConnectivityListeners(): void {
  if (listenersAttached || typeof window === 'undefined') {
    return;
  }
  listenersAttached = true;
  window.addEventListener('offline', () => {
    setOffline('Browser reported the connection is offline.', null);
  });
  window.addEventListener('online', () => {
    // Reconnect alone clears nothing until staff retries: the
    // banner stays until a manual retry succeeds (LLD §11.3 H–C).
    // Only the banner state refreshes here; no request is replayed.
    setOnline();
  });
}

export function resetConnectivityForTests(): void {
  connectivity.online = true;
  connectivity.lastError = null;
  lastFailedRequest = null;
}

async function handleUnauthorized(status: number, code?: string): Promise<never> {
  const store = useSessionStore();
  store.signOut();
  await router.replace('/');
  throw apiError('Session expired. Sign in again.', status, code ?? 'UNAUTHENTICATED');
}

function isUnauthenticatedEnvelope(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === 'UNAUTHENTICATED'
  );
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const store = useSessionStore();
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (store.token !== null) {
    headers.set('Authorization', `Bearer ${store.token}`);
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Network request failed';
    setOffline(reason, { path, init });
    throw apiError(`Request failed: the desk is offline (${reason}).`, undefined, 'OFFLINE');
  }

  if (res.status === 401) {
    return handleUnauthorized(res.status);
  }

  const text = await res.text();
  let body: unknown = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      // Non-JSON payload (e.g. a plain-text health check): not an
      // envelope, so only the HTTP status above can sign us out.
    }
  }
  if (isUnauthenticatedEnvelope(body)) {
    return handleUnauthorized(res.status, 'UNAUTHENTICATED');
  }
  if (!res.ok) {
    const envelope =
      typeof body === 'object' && body !== null
        ? (body as { code?: unknown; details?: unknown })
        : null;
    const code = envelope !== null ? String(envelope.code ?? res.status) : String(res.status);
    throw apiError(
      `Request failed with status ${res.status}.`,
      res.status,
      code,
      envelope?.details,
    );
  }
  setOnline();
  return body as T;
}

// Staff-initiated retry of the last connectivity-failed request
// (offline banner button, LLD §11.3 E–G). Returns false when there
// is nothing to retry. Never called automatically.
export async function retryLastRequest<T>(): Promise<T | false> {
  const pending = lastFailedRequest;
  if (pending === null) {
    return false;
  }
  lastFailedRequest = null;
  return apiFetch<T>(pending.path, pending.init);
}
