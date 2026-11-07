// R1 shell/nav restyle guard (Refs #518; restyle spec section 4,
// AC-RST-1; traceability `docs/testing/desk-restyle-test-traceability.md`
// section 3 R1).
//
// Pins the owner-design shell chrome at the source plus the live
// render contract: the teal header shows the configured hotel name
// (never the design example content) at the design height,
// padding, and brand size; nav tabs render the design
// padding/radius with the active tab inverted; the locale pill
// renders the design border/radius/padding and the toggle switches
// the whole screen EN/VI with no mixed-locale copy; the sign-in
// gate behaves exactly as today. The six screen PRs (#519–#524)
// reuse these assertions, never duplicate them.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ShellApp from './App.vue';
import router from './router';
import { resetConnectivityForTests } from './api/client';
import { setLocale } from './i18n';
import { useSessionStore } from './stores/session';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';

const EN_NAV = ['Desk', 'Rooms', 'Book', 'Stay', 'Folio', 'Print', 'Admin'];
const VI_NAV = ['Lễ tân', 'Sơ đồ phòng', 'Đặt phòng', 'Lưu trú', 'Hoá đơn', 'In', 'Quản trị'];

// First rule body for a selector inside the shell stylesheet.
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(appSource);
  expect(match, `missing style rule for ${selector}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe('R1 shell/nav design values (Refs #518)', () => {
  it('pins the shared shell tokens to the design boards', () => {
    // Every tabbed board line 2 (`docs/design/Main.dc.html:2`,
    // `Book.dc.html:2`, `Stay.dc.html:2`, `Folio.dc.html:2`,
    // `Rooms.dc.html:2`).
    expect(deskTokens.colors.header).toBe('#0F4C47');
    expect(deskTokens.shell.headerHeightPx).toBe(60);
    expect(deskTokens.shell.headerPadXPx).toBe(24);
    expect(deskTokens.shell.brandPx).toBe(18);
    expect(deskTokens.shell.brandGapPx).toBe(24);
    expect(deskTokens.shell.tabPadYPx).toBe(10);
    expect(deskTokens.shell.tabPadXPx).toBe(16);
    expect(deskTokens.shell.tabRadiusPx).toBe(8);
    expect(deskTokens.shell.pillBorder).toBe('#9CC9C4');
    expect(deskTokens.shell.pillRadiusPx).toBe(8);
    expect(deskTokens.shell.pillPadYPx).toBe(6);
    expect(deskTokens.shell.pillPadXPx).toBe(12);
    // Restyle spec section 3: the boards render a 1200px column.
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('renders the teal header at the design height, padding, and brand size', () => {
    const nav = ruleBody('#shell .shell-nav');
    expect(nav).toContain('background: #0F4C47');
    expect(nav).toContain('min-height: 60px');
    expect(nav).toContain('padding: 0 24px');
    const brand = ruleBody('#shell .shell-brand');
    expect(brand).toContain('font-size: 18px');
    expect(brand).toContain('margin-right: 24px');
  });

  it('renders every nav tab at the design padding and radius', () => {
    const item = ruleBody('#shell .shell-nav-item');
    expect(item).toContain('padding: 10px 16px');
    expect(item).toContain('border-radius: 8px');
    expect(item).toContain('min-height: 44px');
  });

  it('inverts the active tab white-on-teal at semibold weight', () => {
    const active = ruleBody('#shell .shell-nav-item.shell-nav-active');
    expect(active).toContain('background: #FFFFFF');
    expect(active).toContain('color: #0F4C47');
    expect(active).toContain('font-weight: 600');
    expect(active).toContain('border-radius: 8px');
    expect(active).toContain('padding: 10px 16px');
  });

  it('renders the locale pill at the design border, radius, and padding', () => {
    const pill = ruleBody('#shell .shell-locale');
    expect(pill).toContain('margin-left: auto');
    expect(pill).toContain('border: 1px solid #9CC9C4');
    expect(pill).toContain('border-radius: 8px');
    expect(pill).toContain('padding: 6px 12px');
  });

  it('drops the PrimeVue button fill inside the locale pill', () => {
    // The pill container owns the visuals (restyle spec section 2:
    // PrimeVue stays a logic carrier only where it diverges); the
    // buttons keep behaviour, testids, and 44px targets.
    const inner = ruleBody('#shell .shell-locale .p-button');
    expect(inner).toContain('background: transparent');
    expect(inner).toContain('color: #FFFFFF');
    expect(inner).toContain('min-height: 44px');
  });

  it('centres the content column at the design width', () => {
    expect(ruleBody('#shell .shell-column')).toContain('max-width: 1200px');
  });

  it('keeps focus visible on the header sign-out button', () => {
    // NFR-DSP-2 on the teal bar (Refs #518): the shell default
    // teal ring would vanish on #0F4C47, so the sign-out button
    // takes the white ring like the other header controls.
    expect(appSource).toContain('[data-testid="shell-signout"]:focus-visible');
    const override = /([^{}]*shell-signout[^:{\n]*:focus-visible[^{}]*)\{([^}]*)\}/.exec(appSource);
    expect(override, 'missing sign-out focus override').not.toBeNull();
    expect((override as RegExpExecArray)[2]).toContain('outline-color: #FFFFFF');
  });
});

describe('R1 shell/nav render contract (Refs #518)', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setLocale('en');
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  function configuredFetch() {
    return vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url === '/v1/admin/GetHotelConfig'
              ? { schemaVersion: 1, values: { name: 'Sunrise Hotel' } }
              : {},
          ),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
  }

  async function mountSignedIn(path: string) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await router.replace(path);
    const wrapper = mount(ShellApp, {
      global: { plugins: [pinia, router] },
    });
    await router.isReady();
    return wrapper;
  }

  it('shows the configured hotel name, never the design example content', async () => {
    vi.stubGlobal('fetch', configuredFetch());
    try {
      const wrapper = await mountSignedIn('/');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-brand"]').text()).toBe('Sunrise Hotel');
      });
      // The boards' example hotel name is content, not chrome: it
      // must never render from configuration.
      expect(wrapper.find('[data-testid="shell-brand"]').text()).not.toContain('Hoa Mai');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('highlights the active screen tab per destination', async () => {
    vi.stubGlobal('fetch', configuredFetch());
    try {
      const wrapper = await mountSignedIn('/');
      expect(wrapper.find('[data-testid="shell-nav-desk"]').classes()).toContain(
        'shell-nav-active',
      );
      await router.replace('/book');
      await vi.waitFor(() => {
        expect(wrapper.find('[data-testid="shell-nav-book"]').classes()).toContain(
          'shell-nav-active',
        );
      });
      expect(wrapper.find('[data-testid="shell-nav-desk"]').classes()).not.toContain(
        'shell-nav-active',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('switches the whole shell EN/VI through the locale pill with no mixed copy', async () => {
    vi.stubGlobal('fetch', configuredFetch());
    try {
      const wrapper = await mountSignedIn('/');
      const pill = wrapper.find('[data-testid="locale-switcher"]');
      expect(pill.exists()).toBe(true);
      await wrapper.find('[data-testid="locale-vi"]').trigger('click');
      expect(wrapper.findAll('[data-testid^="shell-nav-"]').map((item) => item.text())).toEqual(
        VI_NAV,
      );
      expect(wrapper.find('[data-testid="shell-brand"]').text()).toBe('Quản lý khách sạn');
      expect(wrapper.html()).not.toContain('message-missing:');
      await wrapper.find('[data-testid="locale-en"]').trigger('click');
      expect(wrapper.findAll('[data-testid^="shell-nav-"]').map((item) => item.text())).toEqual(
        EN_NAV,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps the sign-in gate with no nav for signed-out visitors', async () => {
    vi.stubGlobal('fetch', configuredFetch());
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      await router.replace('/book');
      const wrapper = mount(ShellApp, {
        global: { plugins: [pinia, router] },
      });
      await router.isReady();
      expect(wrapper.find('[data-testid="shell-gate"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="shell-nav"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="locale-switcher"]').exists()).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
