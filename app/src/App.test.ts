// Guard for NFR-SHL-3 at shell level: the offline banner names
// the disconnect, offers a safe manual retry, and no desk write is
// queued (Refs #291, LLD §11.3).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ShellApp from './App.vue';
import router from './router';
import {
  apiFetch,
  attachConnectivityListeners,
  connectivity,
  resetConnectivityForTests,
} from './api/client';
import { useSessionStore } from './stores/session';

describe('shell offline banner', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    setActivePinia(createPinia());
    resetConnectivityForTests();
    attachConnectivityListeners();
    // Placeholder path on purpose: '/' now renders the desk screen
    // (Refs #293), whose reload auto-refresh would consume the fetch
    // stubs below. These banner tests need a fetch-quiet screen.
    await router.replace('/shell');
  });

  it('hides the banner while online', () => {
    const wrapper = mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(false);
  });

  it('names the disconnect and offers a retry with nothing queued', async () => {
    connectivity.online = false;
    connectivity.lastError = 'Load failed';
    const wrapper = mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    const banner = wrapper.find('[data-testid="offline-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.attributes('role')).toBe('alert');
    expect(wrapper.find('[data-testid="offline-text"]').text()).toContain('Connection lost');
    expect(wrapper.find('[data-testid="offline-text"]').text()).toContain('Load failed');
    expect(wrapper.find('[data-testid="offline-text"]').text()).toContain('nothing is queued');
    await wrapper.find('[data-testid="offline-retry"]').trigger('click');
    expect(wrapper.find('[data-testid="offline-retry-result"]').text()).toBe(
      'Nothing to retry.',
    );
  });

  it('retries the failed request only on staff action', async () => {
    useSessionStore().signIn('tok-1');
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    try {
      await expect(
        apiFetch('/v1/billing/PostCharge', { method: 'POST', body: '{}' }),
      ).rejects.toMatchObject({ code: 'OFFLINE' });
      expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await wrapper.find('[data-testid="offline-retry"]').trigger('click');
      // A successful manual retry clears the offline state, which
      // hides the banner (LLD §11.3 H–I): there is no result line
      // left to read, so assert the cleared state instead.
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(false);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(connectivity.online).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the banner with the failure reason when the retry still fails', async () => {
    useSessionStore().signIn('tok-1');
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Load failed'));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    try {
      await expect(
        apiFetch('/v1/billing/PostCharge', { method: 'POST', body: '{}' }),
      ).rejects.toMatchObject({ code: 'OFFLINE' });
      await wrapper.find('[data-testid="offline-retry"]').trigger('click');
      // LLD §11.3 edge H–C: a retry that still fails returns to the
      // blocked banner with the reason shown.
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="offline-retry-result"]').text()).toContain(
          'Load failed',
        );
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(true);
      expect(connectivity.online).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
