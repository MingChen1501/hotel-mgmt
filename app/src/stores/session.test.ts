// Guard for the FR-SHL-2 session half: the token persists in
// `sessionStorage` (survives reload, dies with the tab) and is the
// single source the shared client reads (Refs #291, LLD section 11.2).
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

  it('keeps the shell display name and role beside the token', () => {
    const store = useSessionStore();
    store.signIn('tok-1', 'Ada Owner', 'owner');
    expect(store.displayName).toBe('Ada Owner');
    expect(store.role).toBe('owner');
    // A reload restores the name and role together with the token.
    setActivePinia(createPinia());
    const restored = useSessionStore();
    expect(restored.token).toBe('tok-1');
    expect(restored.displayName).toBe('Ada Owner');
    expect(restored.role).toBe('owner');
  });

  it('sign-out clears the name, role, and any notice', () => {
    const store = useSessionStore();
    store.signIn('tok-1', 'Ada Owner', 'owner');
    store.signOut();
    expect(store.displayName).toBeNull();
    expect(store.role).toBeNull();
    expect(store.signOutNotice).toBeNull();
    expect(sessionStorage.getItem('hotel-mgmt.session.displayName')).toBeNull();
    expect(sessionStorage.getItem('hotel-mgmt.session.role')).toBeNull();
  });

  it('expiring the session keeps the gate notice without persisting it', () => {
    const store = useSessionStore();
    store.signIn('tok-1', 'Ada Owner', 'owner');
    store.expireSession();
    expect(store.token).toBeNull();
    expect(store.isSignedIn).toBe(false);
    expect(store.signOutNotice).toBe('session-expired');
    expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
    // A reload shows a clean gate: the notice is transient.
    setActivePinia(createPinia());
    expect(useSessionStore().signOutNotice).toBeNull();
  });

  it('signing in clears a previous notice', () => {
    const store = useSessionStore();
    store.expireSession();
    expect(store.signOutNotice).toBe('session-expired');
    store.signIn('tok-2');
    expect(store.signOutNotice).toBeNull();
    expect(store.isSignedIn).toBe(true);
  });

  it('clears the notice on demand', () => {
    const store = useSessionStore();
    store.expireSession();
    store.clearNotice();
    expect(store.signOutNotice).toBeNull();
  });
});
