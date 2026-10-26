// Guard for FR-SHL-1/FR-SHL-2 at view level: the placeholder
// renders, signs in through the session store, and drives the
// shared client (Refs #291, LLD §11.1–11.2).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import PlaceholderView from './Placeholder.vue';
import { useSessionStore } from '../stores/session';
import { resetConnectivityForTests } from '../api/client';
import router from '../router';

vi.mock('../router', () => ({
  default: { replace: vi.fn() },
  createAppRouter: vi.fn(),
}));

function mountPlaceholder() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(PlaceholderView, {
    global: { plugins: [pinia] },
  });
}

describe('placeholder view', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
  });

  it('renders the placeholder marker with the sign-in panel when signed out', () => {
    const wrapper = mountPlaceholder();
    expect(wrapper.find('[data-testid="app-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="signin-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="session-panel"]').exists()).toBe(false);
  });

  it('signs in through the session store and shows the session panel', async () => {
    const wrapper = mountPlaceholder();
    await wrapper.find('[data-testid="signin-token"]').setValue('tok-1');
    await wrapper.find('form').trigger('submit');
    expect(useSessionStore().token).toBe('tok-1');
    expect(wrapper.find('[data-testid="session-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="signin-panel"]').exists()).toBe(false);
  });

  it('refuses an empty token with an error', async () => {
    const wrapper = mountPlaceholder();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.find('[data-testid="signin-error"]').exists()).toBe(true);
    expect(useSessionStore().isSignedIn).toBe(false);
  });

  it('signs out back to the sign-in panel', async () => {
    const wrapper = mountPlaceholder();
    await wrapper.find('[data-testid="signin-token"]').setValue('tok-1');
    await wrapper.find('form').trigger('submit');
    await wrapper.find('[data-testid="signout"]').trigger('click');
    expect(useSessionStore().token).toBeNull();
    expect(wrapper.find('[data-testid="signin-panel"]').exists()).toBe(true);
  });

  it('checks the connection through the shared client', async () => {
    const wrapper = mountPlaceholder();
    await wrapper.find('[data-testid="signin-token"]').setValue('tok-1');
    await wrapper.find('form').trigger('submit');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await wrapper.find('[data-testid="check-connection"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="connection-result"]').text()).toContain('API reachable');
    });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer tok-1');
  });

  it('returns to sign-in when the connection check gets a 401', async () => {
    const wrapper = mountPlaceholder();
    await wrapper.find('[data-testid="signin-token"]').setValue('tok-1');
    await wrapper.find('form').trigger('submit');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await wrapper.find('[data-testid="check-connection"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="signin-panel"]').exists()).toBe(true);
    });
    expect(useSessionStore().token).toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
