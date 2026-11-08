// Styling-slice guards for the desk UI pass (Refs #338).
//
// M4 (FR-DSP-4, served-print no-leak): the screen stylesheet lives
// only inside `@media screen` in `App.vue`, the two print views
// keep print-only stylesheets, and every other view carries no
// `<style>` block at all — so no screen rule can leak into print.
// The exact print selectors stay pinned in the view suites
// (`PrintView.test.ts`, `BookView.test.ts`); this file pins the
// separation itself at the SFC source.
//
// M5 (NFR-DSP-2, keyboard-focus visibility): the focus-ring rule
// is pinned at the source, and every focusable element on each of
// the six routes is inventoried as visible (a hidden control can
// never show its focus ring).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import ShellApp from './App.vue';
import router from './router';
import { resetConnectivityForTests } from './api/client';
import { useSessionStore } from './stores/session';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import adminSource from './views/AdminView.vue?raw';
import bookSource from './views/BookView.vue?raw';
import deskSource from './views/DeskView.vue?raw';
import folioSource from './views/FolioView.vue?raw';
import printSource from './views/PrintView.vue?raw';
import staySource from './views/StayView.vue?raw';

function styleBlocks(source: string): string[] {
  const blocks: string[] = [];
  const pattern = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Remove every balanced `@media <name> { ... }` block so the
// remainder shows what would apply outside that medium.
function stripMedia(css: string, name: string): string {
  let out = '';
  let i = 0;
  const marker = `@media ${name}`;
  while (i < css.length) {
    const at = css.indexOf(marker, i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    let depth = 0;
    let j = css.indexOf('{', at);
    if (j === -1) {
      break;
    }
    for (; j < css.length; j += 1) {
      if (css[j] === '{') {
        depth += 1;
      } else if (css[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
    }
    i = j;
  }
  return out;
}

describe('served-print style isolation (M4)', () => {
  it('keeps the shell screen stylesheet entirely inside @media screen', () => {
    const blocks = styleBlocks(appSource);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('@media screen');
    expect(withoutComments(blocks[0])).not.toContain('@media print');
    // Nothing outside the screen medium: stripping the screen
    // block must leave only comments and whitespace.
    expect(stripMedia(withoutComments(blocks[0]), 'screen').trim()).toBe('');
  });

  it.each([
    ['desk', deskSource],
    ['stay', staySource],
    ['folio', folioSource],
    ['admin', adminSource],
  ])('carries no style block in the %s view', (_name, source) => {
    expect(styleBlocks(source)).toHaveLength(0);
  });

  it.each([
    ['book', bookSource],
    ['print', printSource],
  ])('keeps the %s stylesheet print-only', (_name, source) => {
    const blocks = styleBlocks(source);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain('@media print');
    // Stripping the print block must leave only comments and
    // whitespace: no screen rule lives in these views.
    expect(stripMedia(withoutComments(blocks[0]), 'print').trim()).toBe('');
  });
});

describe('locale-label and locale-pill ink contrast (Refs #455, #571)', () => {
  // Relative luminance per WCAG 2.1, sRGB branch.
  function luminance(hexColor: string): number {
    const hex = hexColor.replace('#', '');
    const channels = [0, 2, 4].map((i) => {
      const value = parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(foreground: string, background: string): number {
    const lighter = luminance(foreground) > luminance(background)
      ? luminance(foreground)
      : luminance(background);
    const darker = lighter === luminance(foreground)
      ? luminance(background)
      : luminance(foreground);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // First `color` declaration inside the given selector's rule.
  function ruleColor(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escaped}\\s*\\{[^}]*?color\\s*:\\s*(#[0-9A-Fa-f]{6})`).exec(css);
    expect(match, `missing color rule for ${selector}`).not.toBeNull();
    return (match as RegExpExecArray)[1].toUpperCase();
  }

  // Same, but `null` when no such rule exists or the rule declares no
  // `color`: a state rule that sets none inherits the base rule's ink.
  function optionalRuleColor(css: string, selector: string): string | null {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
    if (match === null) {
      return null;
    }
    const declared = /color\s*:\s*(#[0-9A-Fa-f]{6})/.exec(match[1]);
    return declared === null ? null : declared[1].toUpperCase();
  }

  it('keeps the gate locale label readable on the page background', () => {
    const blocks = styleBlocks(appSource);
    // The base (non-header) rule is what the sign-in gate inherits:
    // it must not be the header mint, which is invisible on #F4F6F5.
    const label = ruleColor(blocks[0], '#shell .shell-locale-label');
    expect(label).not.toBe('#D7E8E6');
    expect(contrastRatio(label, '#F4F6F5')).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the header-scoped locale label readable on the teal bar', () => {
    const blocks = styleBlocks(appSource);
    const label = ruleColor(blocks[0], '#shell .shell-nav .shell-locale-label');
    expect(contrastRatio(label, '#0F4C47')).toBeGreaterThanOrEqual(4.5);
  });

  // Refs #571: the pill buttons share one `.shell-locale` block
  // between the pale gate and the teal header, so the ink needs the
  // same split as the label — resting and pressed buttons alike.
  // Pressed adds emphasis only (weight + underline), so it declares
  // no ink of its own and both scopes keep their resting ink; that
  // inheritance is what the two scope tests below assert.
  it('leaves the pressed locale pill buttons on their scope ink', () => {
    const blocks = styleBlocks(appSource);
    expect(blocks[0]).toContain('.shell-locale .p-button[aria-pressed="true"]');
    expect(
      optionalRuleColor(blocks[0], '#shell .shell-locale .p-button[aria-pressed="true"]'),
    ).toBeNull();
  });

  it('keeps the gate locale pill buttons readable on the page background', () => {
    const blocks = styleBlocks(appSource);
    const resting = ruleColor(blocks[0], '#shell .shell-locale .p-button');
    const pressed = optionalRuleColor(
      blocks[0],
      '#shell .shell-locale .p-button[aria-pressed="true"]',
    ) ?? resting;
    // The pre-fix source painted the header white here, which is
    // ~1.1:1 on the gate background: fail on that value explicitly
    // instead of only through the ratio.
    expect(resting, 'gate pill ink is the header white (#FFFFFF)').not.toBe('#FFFFFF');
    expect(pressed, 'pressed gate pill ink is the header white (#FFFFFF)').not.toBe('#FFFFFF');
    expect(contrastRatio(resting, '#F4F6F5')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(pressed, '#F4F6F5')).toBeGreaterThanOrEqual(4.5);
    // No forked literal: the ink resolves through the rendered-colour
    // catalogue (`app/src/theme/tokens.ts`, R9 rollup).
    expect(resting).toBe(deskTokens.shell.pillInk.toUpperCase());
    expect(pressed).toBe(deskTokens.shell.pillInk.toUpperCase());
  });

  it('keeps the header-scoped locale pill buttons readable on the teal bar', () => {
    const blocks = styleBlocks(appSource);
    const resting = ruleColor(blocks[0], '#shell .shell-nav .shell-locale .p-button');
    const pressed = optionalRuleColor(
      blocks[0],
      '#shell .shell-nav .shell-locale .p-button[aria-pressed="true"]',
    ) ?? resting;
    expect(contrastRatio(resting, '#0F4C47')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(pressed, '#0F4C47')).toBeGreaterThanOrEqual(4.5);
    expect(resting).toBe(deskTokens.shell.pillInkOnTeal.toUpperCase());
    expect(pressed).toBe(deskTokens.shell.pillInkOnTeal.toUpperCase());
  });
});

describe('keyboard-focus visibility (M5)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    resetConnectivityForTests();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('pins the 2px teal focus ring at the shell source', () => {
    expect(appSource).toContain(':focus-visible');
    expect(appSource).toContain('2px solid #0F766E');
  });

  it.each(['/','/book', '/stay', '/folio', '/print', '/admin'])(
    'shows every focusable control on %s as visible',
    async (path) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      );
      try {
        const pinia = createPinia();
        setActivePinia(pinia);
        useSessionStore().signIn('tok-1', 'Ada Owner', 'owner');
        await router.replace(path);
        const wrapper = mount(ShellApp, {
          global: { plugins: [pinia, router] },
        });
        await router.isReady();
        const controls = wrapper.findAll(
          'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        );
        // Every screen exposes real controls; a disabled control
        // cannot take focus, so only enabled ones must be visible.
        const enabled = controls.filter(
          (control) => (control.element as HTMLElement).tagName !== 'BUTTON' ||
            !(control.element as HTMLButtonElement).disabled,
        );
        expect(controls.length).toBeGreaterThan(0);
        // Refs #564: the session menu is a disclosure that starts
        // closed, so its controls are legitimately hidden until the
        // trigger opens it (pinned by `shell-restyle.test.ts`); every
        // other focusable control must be visible.
        const sessionMenu = wrapper.find('[data-testid="shell-session-menu"]');
        const inClosedSessionMenu = (control: (typeof controls)[number]): boolean =>
          sessionMenu.exists() &&
          !sessionMenu.isVisible() &&
          (control.element as HTMLElement).closest('[data-testid="shell-session-menu"]') !== null;
        const hidden = enabled.filter(
          (control) => !control.isVisible() && !inClosedSessionMenu(control),
        );
        expect(
          hidden.map((control) => control.html().slice(0, 120)),
        ).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});
