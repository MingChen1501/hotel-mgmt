// R3 Book screen design guard (Refs #544; v2 board
// `docs/design/Book.dc.html:3`; traceability
// `docs/testing/desk-restyle-test-traceability.md` section 3 R3).
//
// Pins the owner-design Book screen at the source plus the live
// render contract: no screen title and no section heading (the
// shell header owns the board tabs), the numbered board h3 card
// titles at `16px`, the `1.3fr 1fr` top grid (guest card left,
// quote card right) with the stay card full-width below, stay
// fields in a `repeat(4,1fr)` grid, `14px` labels with full-width
// `44px` controls, `15px` quote rows with dividers, muted `14px`
// helpers, and primary action buttons per
// `docs/design/Book.dc.html:3`, while guest search, walk-in
// registration, get-quote-then-confirm flow, and refusals run
// exactly as today (parity suite `BookView.test.ts` owns the
// behaviour half; this file owns the design values only). The v1
// helpers, guest-ID input, and rate-plan input are gone (zero
// extras vs the board, orchestrator decision on #544).
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import bookViewSource from './views/BookView.vue?raw';

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

describe('R3 Book design values (Refs #544)', () => {
  it('pins the Book design tokens to the design board', () => {
    // `docs/design/Book.dc.html:3` (restyle spec section 3): primary
    // action `#0F766E`, muted `#4B5D5B`, card border `#D9E0DE`,
    // row divider `#EEF1F0`.
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.colors.rowDivider).toBe('#EEF1F0');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Book behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="book-view"',
      'data-testid="book-booking"',
      'data-testid="book-layout"',
      'data-testid="book-guest-card"',
      'data-testid="book-guest-name"',
      'data-testid="book-find-guest"',
      'data-testid="book-register-guest"',
      'data-testid="book-guest-status"',
      'data-testid="book-quote-card"',
      'data-testid="book-quote-section"',
      'data-testid="book-quote-nights-count"',
      'data-testid="book-quote-nights"',
      'data-testid="book-quote-total"',
      'data-testid="book-confirm"',
      'data-testid="book-confirm-error"',
      'data-testid="book-quote-empty"',
      'data-testid="book-quote-error"',
      'data-testid="book-stay-card"',
      'data-testid="book-room-type-id"',
      'data-testid="book-room-type-loading"',
      'data-testid="book-room-type-empty"',
      'data-testid="book-discount-name"',
      'data-testid="book-quote"',
    ]) {
      expect(bookViewSource, `missing hook ${hook}`).toContain(hook);
    }
    // Refs #581: the date-picker hooks ride the DatePicker's inner
    // input through the pass-through object (the DatePicker root is a
    // span), so the pair is pinned in that shape instead.
    for (const hook of ['book-arrival-date', 'book-departure-date']) {
      expect(bookViewSource, `missing picker hook ${hook}`).toContain(`'data-testid': '${hook}'`);
    }
    // Logic carriers stay: guest search, walk-in registration,
    // get-quote-then-confirm flow with the frozen price basis and
    // the searched sellable count, plus all refusal paths
    // (Refs #520 keep).
    for (const logic of [
      '/v1/guests/IdentifyGuest',
      '/v1/guests/UpsertGuest',
      '/v1/rates/QuotePrice',
      '/v1/rooms/CheckRoomTypeSellability',
      '/v1/reservations/CreateReservation',
      '/v1/reservations/GetReservation',
      '/v1/guests/AttachReservation',
      '/v1/guests/ProduceConfirmation',
      '/v1/rooms/ListRoomTypes',
      'onFindGuest',
      'onRegisterGuest',
      'onQuote',
      'onConfirm',
      'onStayInput',
    ]) {
      expect(bookViewSource, `missing logic ${logic}`).toContain(logic);
    }
  });

  it('carries no screen title or section heading (v2 board has neither)', () => {
    // `docs/design/Book.dc.html:3`: the board heads straight into
    // the card grid under the shell header — the v1 h1 and the
    // `New booking` section h2 are gone, so their style rules and
    // template classes go with them. The booking section keeps its
    // flex-column surface for the form stack.
    expect(appSource).not.toContain('.book-title');
    expect(appSource).not.toContain('.book-section-title');
    expect(bookViewSource).not.toContain('class="book-title"');
    expect(bookViewSource).not.toContain('class="book-section-title"');
    expect(bookViewSource).not.toContain('desk.book.title');
    expect(bookViewSource).not.toContain('desk.book.form_heading');
    const booking = ruleBody('#shell [data-testid="book-booking"]');
    expect(booking).toContain('display: flex');
    expect(booking).toContain('flex-direction: column');
    expect(booking).toContain('gap: 16px');
  });

  it('lays the top grid out as 1.3fr 1fr with the stay card full-width below', () => {
    const layout = ruleBody('#shell .book-layout');
    expect(layout).toContain('grid-template-columns: 1.3fr 1fr');
    expect(layout).toContain('gap: 16px');
    expect(layout).toContain('align-items: start');
    // The form stacks the top grid above the full-width stay card.
    const form = ruleBody('#shell [data-testid="book-booking"] form');
    expect(form).toContain('display: flex');
    expect(form).toContain('flex-direction: column');
    expect(form).toContain('gap: 16px');
    // Guest card above nothing: the guest and quote cards sit
    // directly in the top grid in DOM order.
    const guestAt = bookViewSource.indexOf('data-testid="book-guest-card"');
    const quoteAt = bookViewSource.indexOf('data-testid="book-quote-card"');
    const stayAt = bookViewSource.indexOf('data-testid="book-stay-card"');
    const layoutClose = bookViewSource.indexOf('data-testid="book-stay-card"');
    expect(guestAt).toBeGreaterThanOrEqual(0);
    expect(quoteAt).toBeGreaterThan(guestAt);
    expect(stayAt).toBeGreaterThan(quoteAt);
    expect(layoutClose).toBeGreaterThan(quoteAt);
    // The old left/right column wrappers are gone: the design grid
    // carries the columns instead. The v1 guest-ID and rate-plan
    // inputs are gone too (zero extras vs the board, orchestrator
    // decision on #544): find/register-by-name sets the internal
    // guest ID and quotes resolve the single pricing plan.
    expect(bookViewSource).not.toContain('data-testid="book-left"');
    expect(bookViewSource).not.toContain('data-testid="book-right"');
    expect(bookViewSource).not.toContain('data-testid="book-guest-id"');
    expect(bookViewSource).not.toContain('data-testid="book-rate-plan"');
  });

  it('renders the design cards with numbered 16px board titles', () => {
    const card = combinedRuleBody('#shell .book-layout .p-card,');
    expect(card).toContain('background: #FFFFFF');
    expect(card).toContain('border: 1px solid #D9E0DE');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('box-shadow: none');
    const body = combinedRuleBody('#shell .book-layout .p-card-body,');
    expect(body).toContain('padding: 18px');
    expect(body).toContain('display: flex');
    expect(body).toContain('flex-direction: column');
    expect(body).toContain('gap: 10px');
    const title = combinedRuleBody('#shell .book-layout .p-card-title h3,');
    expect(title).toContain('font-size: 16px');
    expect(title).toContain('margin: 0');
    // The stay card below the grid shares the same design card.
    expect(appSource).toContain('#shell [data-testid="book-stay-card"].p-card');
    expect(appSource).toContain('#shell [data-testid="book-stay-card"] .p-card-title h3');
    // The three card headings carry the numbered board copy in DOM order.
    const guestTitle = bookViewSource.indexOf('data-testid="book-guest-card"');
    const quoteTitle = bookViewSource.indexOf('data-testid="book-quote-card"');
    const stayTitle = bookViewSource.indexOf('data-testid="book-stay-card"');
    expect(bookViewSource.slice(guestTitle, quoteTitle)).toContain('desk.book.guest_heading');
    expect(bookViewSource.slice(quoteTitle, stayTitle)).toContain('desk.book.quote_heading');
    expect(bookViewSource.slice(stayTitle)).toContain('desk.book.stay_heading');
  });

  it('renders 14px labels with full-width 44px controls', () => {
    const label = ruleBody('#shell [data-testid="book-view"] label');
    expect(label).toContain('font-size: 14px');
    const controls = combinedRuleBody('#shell [data-testid="book-view"] label input,');
    expect(controls).toContain('display: block');
    expect(controls).toContain('width: 100%');
    expect(controls).toContain('min-height: 44px');
    expect(controls).toContain('margin-top: 6px');
    expect(controls).toContain('box-sizing: border-box');
    const stayGrid = ruleBody('#shell [data-testid="book-view"] .book-stay-grid');
    expect(stayGrid).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(stayGrid).toContain('gap: 12px');
    const guestActions = ruleBody('#shell [data-testid="book-view"] .book-guest-actions');
    expect(guestActions).toContain('display: flex');
    expect(guestActions).toContain('gap: 10px');
    // The stay fields sit in the 4-column grid in DOM order.
    expect(bookViewSource).toContain('class="book-stay-grid"');
    expect(bookViewSource).toContain('class="book-guest-actions"');
  });

  it('renders quote rows at 15px with dividers and helpers muted at 14px', () => {
    const rows = combinedRuleBody(
      '#shell [data-testid="book-view"] [data-testid="book-quote-nights-count"],',
    );
    expect(rows).toContain('font-size: 15px');
    expect(rows).toContain('padding: 10px 0');
    expect(rows).toContain('border-top: 1px solid #EEF1F0');
    const item = ruleBody('#shell [data-testid="book-view"] [data-testid="book-quote-nights"] li');
    expect(item).toContain('font-size: 15px');
    expect(item).toContain('padding: 10px 0');
    expect(item).toContain('border-top: 1px solid #EEF1F0');
    const empty = ruleBody('#shell [data-testid="book-view"] [data-testid="book-quote-empty"]');
    expect(empty).toContain('font-size: 14px');
    expect(empty).toContain('color: #4B5D5B');
    const helper = ruleBody('#shell [data-testid="book-view"] .book-helper');
    expect(helper).toContain('font-size: 14px');
    expect(helper).toContain('color: #4B5D5B');
  });

  it('renders guest, confirm, and quote buttons at the design primary values', () => {
    const buttons = ruleBody('#shell [data-testid="book-view"] .book-action.p-button');
    expect(buttons).toContain('min-height: 44px');
    expect(buttons).toContain('padding: 0 18px');
    expect(buttons).toContain('border-radius: 8px');
    expect(buttons).toContain('border: 0');
    expect(buttons).toContain('background: #0F766E');
    expect(buttons).toContain('color: #FFFFFF');
    expect(buttons).toContain('font-weight: 600');
    // The shared action rule carries no width: the guest actions
    // stay auto-width in their flex row.
    expect(buttons).not.toContain('width');
    // The board draws the quote and confirm actions full-width
    // (`docs/design/Book.dc.html:3`): each is the only primary
    // action in its card/section scope.
    const fullWidth = combinedRuleBody(
      '#shell [data-testid="book-stay-card"] .book-action.p-button,',
    );
    expect(fullWidth).toContain('width: 100%');
    // The template wears the design class on all four actions.
    expect(bookViewSource).toContain('class="book-action"');
  });
});
