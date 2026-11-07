// R5 Folio invoice restyle guard (Refs #522; restyle spec section 5.4,
// AC-RST-5; traceability `docs/testing/desk-restyle-test-traceability.md`
// section 3 R5) plus the R8 served-print half owned by this screen PR
// (traceability section 3 R8: the folio restyle is the print-screen
// PR, so the no-leak assertions land here).
//
// Pins the owner-design Folio screen at the source plus the live
// render contract: the h1 `22px` title with the muted `14px`
// intro, the `folio-main` column stacking the open card above the
// design `1fr 1fr` grid, the three design cards with `16px`
// titles, the lines table with `15px` rows and `1px solid
// #EEF1F0` top dividers under quiet `14px` muted headers, `14px`
// labels with full-width `44px` controls (`margin-top:6px`), the
// `30px/700 #8A4B08` balance-due figure, and primary action
// buttons per `docs/design/Folio.dc.html:2`, while the per-stay
// open form, charge posting, payment recording, the running
// balance, and the print output run exactly as today (parity
// suite `FolioView.test.ts` owns the behaviour half, the print
// suite `PrintView.test.ts` owns the printed values; this file
// owns the design values plus the print-isolation half).
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import folioViewSource from './views/FolioView.vue?raw';
import printSource from './views/PrintView.vue?raw';

// First rule body for a single-selector rule inside the shell stylesheet.
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(appSource);
  expect(match, `missing style rule for ${selector}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

// Rule body for a combined-selector rule: the block starting at the
// marker through its closing brace.
function combinedRuleBody(marker: string): string {
  const at = appSource.indexOf(marker);
  expect(at, `missing style marker ${marker}`).toBeGreaterThanOrEqual(0);
  const open = appSource.indexOf('{', at);
  const close = appSource.indexOf('}', open);
  expect(open).toBeGreaterThanOrEqual(0);
  expect(close).toBeGreaterThan(open);
  return appSource.slice(open + 1, close);
}

describe('R5 Folio design values (Refs #522)', () => {
  it('pins the Folio design tokens to the design board', () => {
    // `docs/design/Folio.dc.html:2` (restyle spec section 3): primary
    // action `#0F766E`, muted `#4B5D5B`, card border `#D9E0DE`,
    // row divider `#EEF1F0`, balance-due accent `#8A4B08`.
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.colors.rowDivider).toBe('#EEF1F0');
    expect(deskTokens.colors.balanceDue).toBe('#8A4B08');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Folio behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="folio-view"',
      'data-testid="folio-main"',
      'data-testid="folio-open-card"',
      'data-testid="folio-stay-id"',
      'data-testid="folio-open"',
      'data-testid="folio-opening"',
      'data-testid="folio-open-error"',
      'data-testid="folio-layout"',
      'data-testid="folio-charges-card"',
      'data-testid="folio-table"',
      'testid-prefix="folio-details"',
      'data-testid="folio-charge-kind"',
      'data-testid="folio-charge-name"',
      'data-testid="folio-charge-amount"',
      'data-testid="folio-charge"',
      'data-testid="folio-charging"',
      'data-testid="folio-charge-status"',
      'data-testid="folio-charge-error"',
      'data-testid="folio-payments-card"',
      'data-testid="folio-status"',
      'data-testid="folio-payment-method"',
      'data-testid="folio-payment-amount"',
      'data-testid="folio-pay"',
      'data-testid="folio-paying"',
      'data-testid="folio-payment-status"',
      'data-testid="folio-payment-error"',
    ]) {
      expect(folioViewSource, `missing hook ${hook}`).toContain(hook);
    }
    // Logic carriers stay: per-stay open form, charge posting and
    // payment recording with the running balance re-read, the
    // in-flight guards with one idempotencyKey per mutation, and
    // all refusal paths (Refs #522 keep).
    for (const logic of [
      '/v1/billing/GetFolioBalance',
      '/v1/billing/PostCharge',
      '/v1/billing/RecordPayment',
      'idempotencyKey',
      'onOpen',
      'onCharge',
      'onPay',
      'onStayIdInput',
    ]) {
      expect(folioViewSource, `missing logic ${logic}`).toContain(logic);
    }
    // The old left/right column wrappers are gone: the design grid
    // carries the two cards directly (same precedent as the Book
    // restyle, Refs #520).
    expect(folioViewSource).not.toContain('data-testid="folio-left"');
    expect(folioViewSource).not.toContain('data-testid="folio-right"');
  });

  it('renders the h1 title at 22px with the muted 14px intro', () => {
    const title = ruleBody('#shell [data-testid="folio-view"] .folio-title');
    expect(title).toContain('font-size: 22px');
    expect(title).toContain('margin: 0');
    const intro = ruleBody('#shell [data-testid="folio-view"] .folio-intro');
    expect(intro).toContain('font-size: 14px');
    expect(intro).toContain('color: #4B5D5B');
    expect(intro).toContain('margin: 0');
    // The template wears the design classes; hooks and copy stay.
    expect(folioViewSource).toContain('class="folio-title"');
    expect(folioViewSource).toContain('class="folio-intro"');
  });

  it('stacks the open card above the 1fr 1fr design grid', () => {
    const main = ruleBody('#shell [data-testid="folio-main"]');
    expect(main).toContain('display: flex');
    expect(main).toContain('flex-direction: column');
    expect(main).toContain('gap: 16px');
    const layout = ruleBody('#shell .folio-layout');
    expect(layout).toContain('display: grid');
    expect(layout).toContain('grid-template-columns: 1fr 1fr');
    expect(layout).toContain('gap: 16px');
    expect(layout).toContain('align-items: start');
    // DOM order carries the design columns: the charges card sits
    // directly in the grid before the payments card.
    const layoutAt = folioViewSource.indexOf('data-testid="folio-layout"');
    const chargesAt = folioViewSource.indexOf('data-testid="folio-charges-card"');
    const paymentsAt = folioViewSource.indexOf('data-testid="folio-payments-card"');
    expect(layoutAt).toBeGreaterThanOrEqual(0);
    expect(chargesAt).toBeGreaterThan(layoutAt);
    expect(paymentsAt).toBeGreaterThan(chargesAt);
  });

  it('renders the design cards with 16px titles', () => {
    const card = combinedRuleBody('#shell [data-testid="folio-open-card"].p-card,');
    expect(card).toContain('background: #FFFFFF');
    expect(card).toContain('border: 1px solid #D9E0DE');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('box-shadow: none');
    const body = combinedRuleBody('#shell [data-testid="folio-open-card"] .p-card-body,');
    expect(body).toContain('padding: 18px');
    expect(body).toContain('display: flex');
    expect(body).toContain('flex-direction: column');
    expect(body).toContain('gap: 10px');
    // Card titles keep their h2 elements (heading hooks stay exact)
    // and render the design h3 16px values; the charge-form h3
    // takes the same treatment.
    const title = combinedRuleBody(
      '#shell [data-testid="folio-open-card"] .p-card-title h2,',
    );
    expect(title).toContain('font-size: 16px');
    expect(title).toContain('margin: 0');
    expect(folioViewSource).toContain('class="folio-section-title"');
  });

  it('renders the lines table at 15px with dividers under quiet headers', () => {
    const table = ruleBody(
      '#shell [data-testid="folio-charges-card"] .p-datatable .p-datatable-table',
    );
    expect(table).toContain('font-size: 15px');
    // The header row carries no design counterpart (the board shows
    // rows only), so it renders quiet muted labels while the
    // decided header sequences stay exact (design-facts gate).
    const head = ruleBody('#shell [data-testid="folio-charges-card"] .p-datatable th');
    expect(head).toContain('font-size: 14px');
    expect(head).toContain('color: #4B5D5B');
    expect(head).toContain('border: 0');
    expect(head).toContain('background: transparent');
    const cell = ruleBody('#shell [data-testid="folio-charges-card"] .p-datatable td');
    expect(cell).toContain('font-size: 15px');
    expect(cell).toContain('padding: 10px 0');
    expect(cell).toContain('border-top: 1px solid #EEF1F0');
    expect(cell).toContain('background: transparent');
    const empty = ruleBody(
      '#shell [data-testid="folio-charges-card"] .p-datatable .p-datatable-emptymessage td',
    );
    expect(empty).toContain('font-size: 15px');
    expect(empty).toContain('color: #4B5D5B');
  });

  it('renders 14px labels with full-width 44px controls', () => {
    const label = ruleBody('#shell [data-testid="folio-view"] label');
    expect(label).toContain('font-size: 14px');
    const controls = combinedRuleBody('#shell [data-testid="folio-view"] label input,');
    expect(controls).toContain('display: block');
    expect(controls).toContain('width: 100%');
    expect(controls).toContain('min-height: 44px');
    expect(controls).toContain('margin-top: 6px');
    expect(controls).toContain('box-sizing: border-box');
  });

  it('renders the balance due at 30px 700 in the balance-due accent', () => {
    const balance = ruleBody('#shell .folio-balance-due');
    expect(balance).toContain('font-size: 30px');
    expect(balance).toContain('font-weight: 700');
    // The accent resolves through the shared token, never a
    // per-surface fork.
    expect(balance).toContain(`color: ${deskTokens.colors.balanceDue}`);
    expect(balance).toContain('color: #8A4B08');
  });

  it('renders open, charge, and pay buttons at the design primary values', () => {
    const buttons = ruleBody('#shell [data-testid="folio-view"] .folio-action.p-button');
    expect(buttons).toContain('min-height: 44px');
    expect(buttons).toContain('padding: 0 18px');
    expect(buttons).toContain('border-radius: 8px');
    expect(buttons).toContain('border: 0');
    expect(buttons).toContain('background: #0F766E');
    expect(buttons).toContain('color: #FFFFFF');
    expect(buttons).toContain('font-weight: 600');
    // The template wears the design class on all three actions.
    expect(folioViewSource.match(/class="folio-action"/g)).toHaveLength(3);
  });
});

describe('R8 Folio restyle print isolation (Refs #522)', () => {
  it('keeps every folio restyle rule inside the screen stylesheet', () => {
    // The view carries no style block (M4 suite pins the
    // separation at the SFC source); the shell screen stylesheet
    // owns every folio rule, and that stylesheet renders screen
    // only with no print medium.
    expect(folioViewSource).not.toContain('<style');
    for (const selector of ['.folio-layout', '.folio-balance-due', '.folio-action']) {
      expect(appSource, `shell owns ${selector}`).toContain(selector);
    }
    const screenAt = appSource.indexOf('@media screen');
    expect(screenAt).toBeGreaterThanOrEqual(0);
    expect(appSource.indexOf('.folio-layout')).toBeGreaterThan(screenAt);
    // No print medium in the shell stylesheet (comments stripped —
    // the M4 suite pins this at the SFC source; this extends it to
    // the folio selectors above).
    expect(appSource.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('@media print');
  });

  it('keeps the restyle out of the printed documents', () => {
    // No folio screen selector leaks into the print source, which
    // keeps its own print-only stylesheet (M4 suite); the
    // confirmation still renders the configured hotel name, and
    // the printed invoice/receipt values stay pinned by the
    // untouched PrintView suite (values match the folio exactly).
    for (const selector of ['folio-layout', 'folio-balance-due', 'folio-action']) {
      expect(printSource, `no print leak of ${selector}`).not.toContain(selector);
    }
    expect(printSource).toContain('@media print');
    expect(printSource).toContain('hotel?.name');
  });
});
