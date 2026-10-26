// Pinia session store for the /app/ migration shell
// (Refs #291, LLD §11 shared-client contract, ADR-0003).
//
// One shared store replaces the former per-page copy-pasted token
// blocks (deleted with the legacy static pages in #299:
// `frontend/desk.html`, `book.html`, `admin.html`). The token lives
// in `sessionStorage`: it survives a tab reload and dies with the
// tab (threat-model delta in
// `docs/technical/security-threat-model.md` §4).
//
// Desk styling pass (Refs #338, LLD §12.4): the shell owns the one
// sign-in gate, so the store also carries the signed-in display
// name and role the shell nav shows (persisted beside the token so
// a reload restores them together) plus a transient sign-out
// notice. A 401/UNAUTHENTICATED expires the session through
// `expireSession()`, which keeps a session-expired notice for the
// gate to show; an explicit sign-out clears everything silently.
import { defineStore } from 'pinia';

export const SESSION_TOKEN_KEY = 'hotel-mgmt.session.token';
export const SESSION_NAME_KEY = 'hotel-mgmt.session.displayName';
export const SESSION_ROLE_KEY = 'hotel-mgmt.session.role';

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode quota): keep the
    // in-memory value; the session still works until reload.
  }
}

function clearStored(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Already cleared or unavailable; in-memory state is clean.
  }
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    // Read at store creation so a reload restores the session.
    token: readStored(SESSION_TOKEN_KEY) as string | null,
    displayName: readStored(SESSION_NAME_KEY) as string | null,
    role: readStored(SESSION_ROLE_KEY) as string | null,
    // Transient: why the session ended (shown once by the gate).
    // Never persisted — a reload shows a clean sign-in form.
    signOutNotice: null as string | null,
  }),
  getters: {
    isSignedIn: (state): boolean => state.token !== null,
  },
  actions: {
    signIn(token: string, displayName?: string, role?: string): void {
      this.token = token;
      writeStored(SESSION_TOKEN_KEY, token);
      if (displayName !== undefined) {
        this.displayName = displayName;
        writeStored(SESSION_NAME_KEY, displayName);
      }
      if (role !== undefined) {
        this.role = role;
        writeStored(SESSION_ROLE_KEY, role);
      }
      this.signOutNotice = null;
    },
    signOut(): void {
      this.token = null;
      this.displayName = null;
      this.role = null;
      this.signOutNotice = null;
      clearStored(SESSION_TOKEN_KEY);
      clearStored(SESSION_NAME_KEY);
      clearStored(SESSION_ROLE_KEY);
    },
    // The single 401 path (LLD §11.2): clear the session like a
    // sign-out, but leave the session-expired notice so the shell
    // gate can say what happened in plain words.
    expireSession(): void {
      this.token = null;
      this.displayName = null;
      this.role = null;
      this.signOutNotice = 'session-expired';
      clearStored(SESSION_TOKEN_KEY);
      clearStored(SESSION_NAME_KEY);
      clearStored(SESSION_ROLE_KEY);
    },
    clearNotice(): void {
      this.signOutNotice = null;
    },
  },
});
