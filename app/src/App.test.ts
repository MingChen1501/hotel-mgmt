// Guard for NFR-SHL-3 at shell level: the offline banner names
// the disconnect, offers a safe manual retry, and no desk write is
// queued (Refs #291, LLD section 11.3).
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
    // The mount-time hotel-name read (Refs #420) resolves, so the
    // PostCharge below stays the request under test.
    let postChargeFailed = false;
    const fetchMock = vi.fn((url: string) => {
      if (url === '/v1/admin/GetHotelConfig') {
        return Promise.resolve(
          new Response(JSON.stringify({ values: { name: 'T Hotel' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (url === '/v1/billing/PostCharge' && !postChargeFailed) {
        postChargeFailed = true;
        return Promise.reject(new TypeError('Load failed'));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(ShellApp, {
      global: { plugins: [createPinia(), router] },
    });
    try {
      await expect(
        apiFetch('/v1/billing/PostCharge', { method: 'POST', body: '{}' }),
      ).rejects.toMatchObject({ code: 'OFFLINE' });
      expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(true);
      // Hotel-name read plus the failed PostCharge (Refs #420).
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await wrapper.find('[data-testid="offline-retry"]').trigger('click');
      // A successful manual retry clears the offline state, which
      // hides the banner (LLD section 11.3 H–I): there is no result line
      // left to read, so assert the cleared state instead.
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(false);
      });
      // Hotel-name read plus the failed PostCharge plus the manual
      // retry (Refs #420).
      expect(fetchMock).toHaveBeenCalledTimes(3);
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
      // LLD section 11.3 edge H–C: a retry that still fails returns to the
      // blocked banner with the reason shown.
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="offline-retry-result"]').text()).toContain(
          'Load failed',
        );
      });
      // Hotel-name read plus the failed PostCharge plus the failed
      // manual retry (Refs #420).
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(wrapper.find('[data-testid="offline-banner"]').exists()).toBe(true);
      expect(connectivity.online).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// Shell navigation + single sign-in gate (Refs #338, FR-DSP-1,
// FR-DSP-2, LLD section 12.3–section 12.4). The per-screen sign-in round trips
// moved here from the six view suites: the shell owns the one
// sign-in form, the top nav, and sign-out.
describe('shell navigation', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function quietFetch() {
    return vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  async function mountShellWith(pinia: ReturnType<typeof createPinia>, path: string) {
    await router.replace(path);
    const wrapper = mount(ShellApp, {
      global: { plugins: [pinia, router] },
    });
    await router.isReady();
    return wrapper;
  }

  it('renders the six destinations in contract order plus the user plus sign-out', async () => {
    vi.stubGlobal('fetch', quietFetch());
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
      const wrapper = await mountShellWith(pinia, '/');
      const items = wrapper.findAll('[data-testid^="shell-nav-"]');
      expect(items.map((item) => item.text())).toEqual([
        'Desk',
        'Book',
        'Stay',
        'Folio',
        'Print',
        'Admin',
      ]);
      expect(items.map((item) => item.attributes('href'))).toEqual([
        '/app/',
        '/app/book',
        '/app/stay',
        '/app/folio',
        '/app/print',
        '/app/admin',
      ]);
      expect(wrapper.find('[data-testid="shell-brand"]').text()).toContain('Hotel Management');
      expect(wrapper.find('[data-testid="shell-user"]').text()).toBe('Ada Owner');
      expect(wrapper.find('[data-testid="shell-signout"]').exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // D1 header half (Refs #419, #420, FR-DSK-1, AC-DSK-8): the teal
  // header shows the configured hotel name from the hotel
  // configuration surface, never the design's example content.
  it('shows the configured hotel name in the header once signed in', async () => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn((url: string) => {
      if (url === '/v1/admin/GetHotelConfig') {
        return Promise.resolve(
          new Response(JSON.stringify({ schemaVersion: 1, values: { name: 'Sunrise Hotel' } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
      const wrapper = await mountShellWith(pinia, '/');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-brand"]').text()).toBe('Sunrise Hotel');
      });
      expect(fetchMock.mock.calls.some((call) => call[0] === '/v1/admin/GetHotelConfig')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back to the catalogue brand when no hotel name is configured', async () => {
    vi.stubGlobal('fetch', quietFetch());
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
      const wrapper = await mountShellWith(pinia, '/');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="shell-brand"]').text()).toContain('Hotel Management');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ['/', 'shell-nav-desk'],
    ['/book', 'shell-nav-book'],
    ['/stay', 'shell-nav-stay'],
    ['/folio', 'shell-nav-folio'],
    ['/print', 'shell-nav-print'],
    ['/admin', 'shell-nav-admin'],
  ])('highlights exactly the %s destination on %s', async (path, active) => {
    vi.stubGlobal('fetch', quietFetch());
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
      const wrapper = await mountShellWith(pinia, path);
      const highlighted = wrapper.findAll('.shell-nav-active');
      expect(highlighted).toHaveLength(1);
      expect(highlighted[0]?.attributes('data-testid')).toBe(active);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the nav with no active destination on unknown paths', async () => {
    vi.stubGlobal('fetch', quietFetch());
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
      const wrapper = await mountShellWith(pinia, '/shell');
      expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(true);
      expect(wrapper.findAll('.shell-nav-active')).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('shell sign-in gate', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async function mountGate(path = '/book') {
    const pinia = createPinia();
    setActivePinia(pinia);
    await router.replace(path);
    const wrapper = mount(ShellApp, {
      global: { plugins: [pinia, router] },
    });
    await router.isReady();
    return wrapper;
  }

  it.each(['/', '/book', '/stay', '/folio', '/print', '/admin'])(
    'shows only the gate to a signed-out visitor on %s',
    async (path) => {
      const wrapper = await mountGate(path);
      expect(wrapper.find('[data-testid="shell-gate"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="shell-signin-form"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="shell-signin-error"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="shell-expired-notice"]').exists()).toBe(false);
    },
  );

  it('signs in through the gate and lands on the requested screen', async () => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const wrapper = await mountGate('/book');
      await wrapper.find('[data-testid="shell-signin-identity"]').setValue('owner');
      await wrapper.find('[data-testid="shell-signin-secret"] input').setValue('s3cret');
      await wrapper.find('[data-testid="shell-signin-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(true);
      });
      // The SignIn call itself carries no token; the session lands
      // in the store with the display name for the nav.
      const signInCall = fetchMock.mock.calls.find((call) => call[0] === '/v1/admin/SignIn');
      expect((signInCall?.[1]?.headers as Headers).get('Authorization')).toBeNull();
      expect(useSessionStore().token).toBe('tok-1');
      expect(wrapper.find('[data-testid="shell-user"]').text()).toBe('Ada Owner');
      expect(wrapper.find('[data-testid="book-view"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="shell-gate"]').exists()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads a wrong secret as one plain sentence without signing in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ code: 'UNAUTHENTICATED', message: 'Unknown identity or wrong secret.' }, 401),
      ),
    );
    try {
      const wrapper = await mountGate('/');
      await wrapper.find('[data-testid="shell-signin-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-signin-error"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="shell-signin-error"]').text()).toContain(
        'That sign-in did not work. Check the name and password and try again.',
      );
      expect(useSessionStore().isSignedIn).toBe(false);
      expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads a validation failure as the same plain sentence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ code: 'VALIDATION_FAILED', message: 'secret is required.' }, 400),
      ),
    );
    try {
      const wrapper = await mountGate('/');
      await wrapper.find('[data-testid="shell-signin-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-signin-error"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="shell-signin-error"]').text()).toContain(
        'That sign-in did not work.',
      );
      expect(useSessionStore().isSignedIn).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads a locked identity distinctly from a wrong secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { code: 'IDENTITY_LOCKED', message: 'Identity owner is locked after repeated failures.' },
          401,
        ),
      ),
    );
    try {
      const wrapper = await mountGate('/');
      await wrapper.find('[data-testid="shell-signin-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-signin-error"]').exists()).toBe(true);
      });
      // Refs #319: a locked identity shows the locked wording, not
      // the plain failure sentence and not the expired notice.
      expect(wrapper.find('[data-testid="shell-signin-error"]').text()).toContain('locked');
      expect(wrapper.find('[data-testid="shell-signin-error"]').text()).not.toContain(
        'did not work',
      );
      expect(wrapper.find('[data-testid="shell-signin-error"]').text()).not.toContain(
        'Session expired',
      );
      expect(useSessionStore().isSignedIn).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('signs out back to the gate and clears the token', async () => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      if (url === '/v1/admin/SignOut') {
        return Promise.resolve(jsonResponse({ ok: true }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const wrapper = await mountGate('/');
      await wrapper.find('[data-testid="shell-signin-identity"]').setValue('owner');
      await wrapper.find('[data-testid="shell-signin-secret"] input').setValue('s3cret');
      await wrapper.find('[data-testid="shell-signin-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="shell-signout"]').trigger('click');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-gate"]').exists()).toBe(true);
      });
      expect(useSessionStore().token).toBeNull();
      expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(false);
      expect(fetchMock.mock.calls.some((call) => call[0] === '/v1/admin/SignOut')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('signs out locally even when the SignOut call fails', async () => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      if (url === '/v1/admin/SignOut') {
        return Promise.resolve(new Response('{}', { status: 401 }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const wrapper = await mountGate('/');
      await wrapper.find('[data-testid="shell-signin-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="shell-signout"]').trigger('click');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-gate"]').exists()).toBe(true);
      });
      expect(useSessionStore().token).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows the expired notice on the gate after a 401 mid-session', async () => {
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn((url: string) => {
      if (url === '/v1/admin/SignIn') {
        return Promise.resolve(
          jsonResponse({ token: 'tok-1', displayName: 'Ada Owner', role: 'owner' }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const wrapper = await mountGate('/');
      await wrapper.find('[data-testid="shell-signin-form"]').trigger('submit');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(true);
      });
      fetchMock.mockResolvedValue(new Response('', { status: 401 }));
      await wrapper.find('[data-testid="desk-refresh"]').trigger('click');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-gate"]').exists()).toBe(true);
      });
      expect(wrapper.find('[data-testid="shell-expired-notice"]').text()).toContain(
        'Session expired. Sign in again.',
      );
      expect(useSessionStore().token).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
