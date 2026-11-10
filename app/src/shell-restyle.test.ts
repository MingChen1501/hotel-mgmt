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

// Refs #590: the app-only `manage` tab sits immediately after
// `Rooms` (owner decision O-1); the seven design tabs keep their
// order around it.
const EN_NAV = ['Desk', 'Rooms', 'Manage', 'Book', 'Stay', 'Folio', 'Print', 'Admin'];
const VI_NAV = ['Lễ tân', 'Sơ đồ phòng', 'Quản lý', 'Đặt phòng', 'Lưu trú', 'Hoá đơn', 'In', 'Quản trị'];

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
    // Locale pill ink (Refs #571): the gate-safe page ink plus the
    // header light ink the teal scope re-applies.
    expect(deskTokens.shell.pillInk).toBe('#1B2B2A');
    expect(deskTokens.shell.pillInkOnTeal).toBe('#FFFFFF');
    // Restyle spec section 3: the boards render a 1200px column.
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('renders the teal header at the design height, padding, and brand size', () => {
    const nav = ruleBody('#shell .shell-nav');
    expect(nav).toContain('background: #0F4C47');
    // Refs #564: a fixed 60px single row — `height` plus `nowrap`
    // stop the trailing controls from wrapping to a second row (the
    // 111px regression this guard pins).
    expect(nav).toContain('height: 60px');
    expect(nav).toContain('min-height: 60px');
    expect(nav).toContain('flex-wrap: nowrap');
    expect(nav).not.toContain('flex-wrap: wrap');
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
    expect(inner).toContain('min-height: 44px');
    // Refs #571: the shared block serves the pale gate too, so the
    // base ink is the gate-safe token; the header scope re-applies
    // the light ink that reads on the teal bar.
    expect(inner).toContain(`color: ${deskTokens.shell.pillInk}`);
    const headerInner = ruleBody('#shell .shell-nav .shell-locale .p-button');
    expect(headerInner).toContain(`color: ${deskTokens.shell.pillInkOnTeal}`);
  });

  it('centres the content column at the design width', () => {
    expect(ruleBody('#shell .shell-column')).toContain('max-width: 1200px');
  });

  it('keeps every header button at the 44px target', () => {
    // Refs #564: the session trigger and the menu's Sign out are
    // PrimeVue buttons under `.shell-nav`, so the header button rule
    // supplies the NFR-DSK-3 target.
    expect(ruleBody('#shell .shell-nav .p-button')).toContain('min-height: 44px');
  });

  it('leaves the account panel Sign out on the shell default focus ring', () => {
    // Refs #564 (NFR-DSP-2): Sign out renders inside the white
    // account panel, not on the teal bar, so the header's white ring
    // painted at ~1:1 there and hid the keyboard indicator. The
    // control must stay out of the teal-bar scope list and inherit
    // the shell default `#0F766E` ring, which reads on the white
    // panel. This is the fast source-level backstop: the RENDERED
    // ring is pinned in Chromium by `app/e2e/signin.spec.ts`
    // ("keeps Sign out's focus ring visible on the white account
    // panel"), because jsdom cannot resolve the `:focus-visible`
    // cascade. The contrast of that ring on the panel surface is
    // asserted in `shell-styling.test.ts`.
    expect(appSource).not.toContain('[data-testid="shell-signout"]:focus-visible');
    // The control keeps keyboard focus by inheriting the one default
    // ring, so that rule has to exist and carry the ring token.
    expect(ruleBody('#shell :focus-visible')).toContain(
      `2px solid ${deskTokens.focus.ringColor}`,
    );
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

  async function mountSignedIn(path: string, attachTo?: HTMLElement) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
    await router.replace(path);
    const wrapper = mount(ShellApp, {
      global: { plugins: [pinia, router] },
      ...(attachTo ? { attachTo } : {}),
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
      // Refs #564: the compact design codes fit the single row.
      expect(pill.text().replace(/\s/g, '')).toBe('VI|EN');
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

  it('keeps the session controls in a compact disclosure on the bar', async () => {
    vi.stubGlobal('fetch', configuredFetch());
    // Mounted into the document so the Escape assertion can read
    // `document.activeElement` (Refs #564).
    const host = document.createElement('div');
    document.body.appendChild(host);
    const wrapper = await mountSignedIn('/', host);
    try {
      // Refs #564: the identity and Sign out live in a menu instead
      // of inline on the bar (which wrapped the header to 111px).
      const trigger = wrapper.find('[data-testid="shell-session-trigger"]');
      const menu = wrapper.find('[data-testid="shell-session-menu"]');
      expect(trigger.exists()).toBe(true);
      // PrimeVue buttons under the bar carry the 44px target
      // (`#shell .shell-nav .p-button`), so both the trigger and the
      // menu's Sign out stay keyboard/pointer reachable (NFR-DSK-3).
      expect(trigger.classes()).toContain('p-button');
      expect(trigger.attributes('aria-expanded')).toBe('false');
      expect(menu.isVisible()).toBe(false);
      expect(menu.find('[data-testid="shell-user"]').text()).toBe('Ada Owner');

      await trigger.trigger('click');
      expect(trigger.attributes('aria-expanded')).toBe('true');
      expect(menu.isVisible()).toBe(true);
      expect(menu.find('[data-testid="shell-signout"]').classes()).toContain('p-button');

      // Escape closes the disclosure from inside and hands focus back
      // to the trigger, so the keyboard path never loses its place
      // (keyboard reachability, NFR-DSP-2).
      await menu.find('[data-testid="shell-signout"]').trigger('keydown', { key: 'Escape' });
      expect(trigger.attributes('aria-expanded')).toBe('false');
      expect(menu.isVisible()).toBe(false);
      expect(document.activeElement).toBe(trigger.element);
    } finally {
      wrapper.unmount();
      host.remove();
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
