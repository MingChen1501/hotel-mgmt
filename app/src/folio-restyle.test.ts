// Folio v2 board guard (Refs #545; v2 board adoption, epic #537;
// traceability `docs/testing/desk-restyle-test-traceability.md`
// section 3 R5) plus the R8 served-print half owned by this screen
// PR (traceability section 3 R8: the folio screen is the
// print-screen PR, so the no-leak assertions land here).
//
// Pins the owner-design Folio screen at the source plus the live
// render contract: no screen title or intro, the stay-ID open step
// (F3 flow state, orchestrator decision on #545) above the design
// `1fr 1fr` grid, the two design cards with `16px` h3 titles, the
// plain `15px` name-plus-amount rows with `1px solid #EEF1F0` top
// dividers, `14px` labels with full-width `44px` controls
// (`margin-top:6px`), the muted `14px` due label above the
// `30px/700 #8A4B08` due figure, and primary action buttons per
// `docs/design/Folio.dc.html:3`, while the per-stay open form,
// charge posting, payment recording, the running balance, and the
// print output run exactly as today (parity suite
// `FolioView.test.ts` owns the behaviour half, the print suite
// `PrintView.test.ts` owns the printed values; this file owns the
// design values plus the print-isolation half).
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

describe('Folio v2 design values (Refs #545)', () => {
  it('pins the Folio design tokens to the design board', () => {
    // `docs/design/Folio.dc.html:3`: primary action `#0F766E`,
    // muted `#4B5D5B`, card border `#D9E0DE`, row divider
    // `#EEF1F0`, balance-due accent `#8A4B08`.
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
      'data-testid="folio-charge-lines"',
      'testid-prefix="folio-details"',
      'data-testid="folio-charge-kind"',
      'data-testid="folio-charge-name"',
      'data-testid="folio-charge-amount"',
      'data-testid="folio-charge"',
      'data-testid="folio-charging"',
      'data-testid="folio-charge-status"',
      'data-testid="folio-charge-error"',
      'data-testid="folio-payments-card"',
      'data-testid="folio-balance"',
      'data-testid="folio-status"',
      'data-testid="folio-payment-lines"',
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
    // all refusal paths (Refs #545 keep).
    for (const logic of [
      '/v1/billing/GetFolioBalance',
      '/v1/billing/PostCharge',
      '/v1/billing/RecordPayment',
      'idempotencyKey',
      'onOpen',
      'onCharge',
      'onPay',
      'onStayIdInput',
      'chargeRows',
      'paymentRows',
      'folioBalance',
    ]) {
      expect(folioViewSource, `missing logic ${logic}`).toContain(logic);
    }
    // The old left/right column wrappers are gone: the design grid
    // carries the two cards directly (same precedent as the Book
    // restyle, Refs #520).
    expect(folioViewSource).not.toContain('data-testid="folio-left"');
    expect(folioViewSource).not.toContain('data-testid="folio-right"');
  });

  it('keeps the retired v1 chrome absent (zero extras vs the board)', () => {
    // The v2 board carries no screen title, no intro, no charge
    // form sub-heading, and no lines table — the open step, the
    // kind/method selects, and the status readouts stay as flow
    // state (orchestrator decision on #545), everything else goes.
    for (const hook of [
      'folio-title',
      'folio-intro',
      'folio-section-title',
      'data-testid="folio-table"',
      'desk.folio.title',
      'desk.folio.intro',
      'desk.folio.charge_heading',
      'DataTable',
      'entryRows',
    ]) {
      expect(folioViewSource, `retired hook still present: ${hook}`).not.toContain(hook);
    }
    // The v2 board carries no screen title: no h1 or h2 renders —
    // every card title is an h3.
    expect(folioViewSource).not.toContain('<h1');
    expect(folioViewSource).not.toContain('<h2');
  });

  it('stacks the open step above the 1fr 1fr design grid', () => {
    const main = ruleBody('#shell [data-testid="folio-main"]');
    expect(main).toContain('display: flex');
    expect(main).toContain('flex-direction: column');
    expect(main).toContain('gap: 16px');
    const layout = ruleBody('#shell .folio-layout');
    expect(layout).toContain('display: grid');
    expect(layout).toContain('grid-template-columns: 1fr 1fr');
    expect(layout).toContain('gap: 16px');
    expect(layout).toContain('align-items: start');
    // DOM order carries the design columns: the open step sits
    // above the grid, and the charges card sits directly in the
    // grid before the payments card.
    const mainAt = folioViewSource.indexOf('data-testid="folio-main"');
    const openAt = folioViewSource.indexOf('data-testid="folio-open-card"');
    const layoutAt = folioViewSource.indexOf('data-testid="folio-layout"');
    const chargesAt = folioViewSource.indexOf('data-testid="folio-charges-card"');
    const paymentsAt = folioViewSource.indexOf('data-testid="folio-payments-card"');
    expect(mainAt).toBeGreaterThanOrEqual(0);
    expect(openAt).toBeGreaterThan(mainAt);
    expect(layoutAt).toBeGreaterThan(openAt);
    expect(chargesAt).toBeGreaterThan(layoutAt);
    expect(paymentsAt).toBeGreaterThan(chargesAt);
  });

  it('renders the design cards with 16px h3 titles', () => {
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
    // Card titles are h3 elements rendering the design h3
    // `16px` values.
    const title = combinedRuleBody(
      '#shell [data-testid="folio-open-card"] .p-card-title h3,',
    );
    expect(title).toContain('font-size: 16px');
    expect(title).toContain('margin: 0');
  });

  it('renders the board rows at 15px with top dividers', () => {
    const lines = ruleBody('#shell [data-testid="folio-view"] .folio-lines');
    expect(lines).toContain('display: flex');
    expect(lines).toContain('flex-direction: column');
    const row = ruleBody('#shell [data-testid="folio-view"] .folio-line');
    expect(row).toContain('display: flex');
    expect(row).toContain('justify-content: space-between');
    expect(row).toContain('font-size: 15px');
    expect(row).toContain('padding: 10px 0');
    expect(row).toContain('border-top: 1px solid #EEF1F0');
    const empty = ruleBody('#shell [data-testid="folio-view"] .folio-empty');
    expect(empty).toContain('font-size: 15px');
    expect(empty).toContain('color: #4B5D5B');
    // The template wears the design classes on both cards'
    // line groups.
    expect(folioViewSource).toContain('data-testid="folio-charge-lines"');
    expect(folioViewSource).toContain('data-testid="folio-payment-lines"');
    expect(folioViewSource).toContain('class="folio-line"');
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

  it('renders the due label at 14px muted above the 30px 700 due figure', () => {
    const due = ruleBody('#shell [data-testid="folio-view"] .folio-due-label');
    expect(due).toContain('font-size: 14px');
    expect(due).toContain('color: #4B5D5B');
    const balance = ruleBody('#shell .folio-balance-due');
    expect(balance).toContain('font-size: 30px');
    expect(balance).toContain('font-weight: 700');
    // The accent resolves through the shared token, never a
    // per-surface fork.
    expect(balance).toContain(`color: ${deskTokens.colors.balanceDue}`);
    expect(balance).toContain('color: #8A4B08');
    const status = ruleBody('#shell [data-testid="folio-view"] .folio-status-line');
    expect(status).toContain('font-size: 14px');
    expect(status).toContain('color: #4B5D5B');
    // The template wears the design classes on the due block.
    expect(folioViewSource).toContain('class="folio-due-label"');
    expect(folioViewSource).toContain('data-testid="folio-balance"');
    expect(folioViewSource).toContain('class="folio-status-line"');
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

describe('Folio v2 board print isolation (Refs #545)', () => {
  it('keeps every folio board rule inside the screen stylesheet', () => {
    // The view carries no style block (M4 suite pins the
    // separation at the SFC source); the shell screen stylesheet
    // owns every folio rule, and that stylesheet renders screen
    // only with no print medium.
    expect(folioViewSource).not.toContain('<style');
    for (const selector of ['.folio-layout', '.folio-lines', '.folio-due-label', '.folio-balance-due', '.folio-action']) {
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

  it('keeps the board adoption out of the printed documents', () => {
    // No folio screen selector leaks into the print source, which
    // keeps its own print-only stylesheet (M4 suite); the
    // confirmation still renders the configured hotel name, and
    // the printed invoice/receipt values stay pinned by the
    // untouched PrintView suite (values match the folio exactly).
    for (const selector of ['folio-layout', 'folio-lines', 'folio-due-label', 'folio-balance-due', 'folio-action']) {
      expect(printSource, `no print leak of ${selector}`).not.toContain(selector);
    }
    expect(printSource).toContain('@media print');
    expect(printSource).toContain('hotel?.name');
  });
});
