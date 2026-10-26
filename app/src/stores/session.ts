// Pinia session store for the /app/ migration shell
// (Refs #291, LLD §11 shared-client contract, ADR-0003).
//
// One shared store replaces the per-page copy-pasted token blocks
// (`frontend/desk.html`, `book.html`, `admin.html`). The token lives
// in `sessionStorage`: it survives a tab reload and dies with the
// tab (threat-model delta in
// `docs/technical/security-threat-model.md` §4).
import { defineStore } from 'pinia';

export const SESSION_TOKEN_KEY = 'hotel-mgmt.session.token';

function readPersistedToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    // Read at store creation so a reload restores the session.
    token: readPersistedToken() as string | null,
  }),
  getters: {
    isSignedIn: (state): boolean => state.token !== null,
  },
  actions: {
    signIn(token: string): void {
      this.token = token;
      try {
        sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      } catch {
        // Storage unavailable (private mode quota): keep the
        // in-memory token; the session still works until reload.
      }
    },
    signOut(): void {
      this.token = null;
      try {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
      } catch {
        // Already cleared or unavailable; in-memory state is clean.
      }
    },
  },
});
