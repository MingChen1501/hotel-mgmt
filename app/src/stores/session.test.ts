// Guard for the FR-SHL-2 session half: the token persists in
// `sessionStorage` (survives reload, dies with the tab) and is the
// single source the shared client reads (Refs #291, LLD §11.2).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { SESSION_TOKEN_KEY, useSessionStore } from './session';

describe('session store', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('starts signed out with no persisted token', () => {
    const store = useSessionStore();
    expect(store.token).toBeNull();
    expect(store.isSignedIn).toBe(false);
  });

  it('persists sign-in to sessionStorage only, never localStorage', () => {
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    const store = useSessionStore();
    store.signIn('tok-1');
    expect(store.token).toBe('tok-1');
    expect(store.isSignedIn).toBe(true);
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe('tok-1');
    expect(setSpy).toHaveBeenCalledWith(SESSION_TOKEN_KEY, 'tok-1');
    expect(localStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    setSpy.mockRestore();
  });

  it('restores the token in a fresh store instance (survives reload)', () => {
    useSessionStore().signIn('tok-reload');
    // A reload recreates the store: the new instance must read the
    // persisted token back.
    setActivePinia(createPinia());
    const restored = useSessionStore();
    expect(restored.token).toBe('tok-reload');
    expect(restored.isSignedIn).toBe(true);
  });

  it('sign-out clears the token from the store and sessionStorage', () => {
    const store = useSessionStore();
    store.signIn('tok-1');
    store.signOut();
    expect(store.token).toBeNull();
    expect(store.isSignedIn).toBe(false);
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
  });
});
