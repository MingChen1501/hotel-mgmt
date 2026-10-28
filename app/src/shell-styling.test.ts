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
        const hidden = enabled.filter((control) => !control.isVisible());
        expect(
          hidden.map((control) => control.html().slice(0, 120)),
        ).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );
});
