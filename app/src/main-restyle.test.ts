// R2 Main-board restyle guard (Refs #519; restyle spec section 5.1,
// AC-RST-2; traceability `docs/testing/desk-restyle-test-traceability.md`
// section 3 R2).
//
// Pins the owner-design Main board at the source plus the live
// render contract: the business-date row, the `repeat(3,1fr)`
// card grids over two rows, row dividers, the departures empty
// state, and the two housekeeping action buttons per
// `docs/design/Main.dc.html:2`, while the desk reads and the
// housekeeping state transitions with count refresh behave
// exactly as today (parity suite `DeskView.test.ts` owns the
// behaviour half; this file owns the design values only).
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import deskViewSource from './views/DeskView.vue?raw';

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
  // The combined selector list sits between the marker and the
  // opening brace; the declarations sit inside the braces.
  expect(appSource.slice(at, open)).toContain(
    '#shell [data-testid="desk-view"] .desk-action.p-button',
  );
  return appSource.slice(open + 1, close);
}

describe('R2 Main board design values (Refs #519)', () => {
  it('pins the Main design tokens to the design board', () => {
    // `docs/design/Main.dc.html:2` (restyle spec section 3): primary
    // action `#0F766E`, muted `#4B5D5B`, card border `#D9E0DE`,
    // row divider `#EEF1F0`.
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.colors.rowDivider).toBe('#EEF1F0');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Main behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="desk-dashboard"',
      'data-testid="desk-business-date"',
      'data-testid="desk-refresh"',
      'data-testid="desk-arrivals-table"',
      'data-testid="desk-inhouse-table"',
      'data-testid="desk-departures-table"',
      'data-testid="desk-need-cleaning-card"',
      'data-testid="desk-outofservice-card"',
      'desk-mark-cleaned-',
      'desk-mark-inspected-',
      'desk-outoforder-note-',
      'data-testid="desk-sheet-line"',
    ]) {
      expect(deskViewSource, `missing hook ${hook}`).toContain(hook);
    }
    // Logic carriers stay: desk reads, housekeeping transitions,
    // and the ISO business-date ref are untouched (Refs #519 keep).
    for (const logic of [
      '/v1/stay/ListArrivalsDepartures',
      '/v1/rooms/UpdateRoomState',
      'businessDate',
      'onMarkCleaned',
      'onMarkInspected',
    ]) {
      expect(deskViewSource, `missing logic ${logic}`).toContain(logic);
    }
  });

  it('renders the business-date row at the design sizes', () => {
    const row = ruleBody('#shell .desk-date-row');
    expect(row).toContain('display: flex');
    expect(row).toContain('justify-content: space-between');
    const label = ruleBody('#shell .desk-date-label');
    expect(label).toContain('font-size: 14px');
    expect(label).toContain('color: #4B5D5B');
    const value = ruleBody('#shell [data-testid="desk-business-date"]');
    expect(value).toContain('font-size: 26px');
    expect(value).toContain('font-weight: 700');
  });

  it('lays the design cards out in repeat(3,1fr) grids', () => {
    const grid = ruleBody('#shell .desk-cards');
    expect(grid).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(grid).toContain('gap: 16px');
    const card = ruleBody('#shell .desk-cards .p-card');
    expect(card).toContain('background: #FFFFFF');
    expect(card).toContain('border: 1px solid #D9E0DE');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('box-shadow: none');
    const body = ruleBody('#shell .desk-cards .p-card-body');
    expect(body).toContain('padding: 18px');
    expect(body).toContain('gap: 10px');
    const title = ruleBody('#shell .desk-cards .p-card-title h2');
    expect(title).toContain('font-size: 16px');
    expect(title).toContain('margin: 0');
  });

  it('renders card rows at 15px with the design top dividers', () => {
    const cell = ruleBody('#shell .desk-cards .p-datatable td');
    expect(cell).toContain('font-size: 15px');
    expect(cell).toContain('padding: 10px 0');
    expect(cell).toContain('border-top: 1px solid #EEF1F0');
    const item = ruleBody('#shell .desk-cards li');
    expect(item).toContain('font-size: 15px');
    expect(item).toContain('padding: 10px 0');
    expect(item).toContain('border-top: 1px solid #EEF1F0');
    expect(item).toContain('min-height: 44px');
  });

  it('renders empty states muted at the design size and padding', () => {
    const empty = ruleBody('#shell .desk-cards .p-datatable .p-datatable-emptymessage td');
    expect(empty).toContain('padding: 18px 0');
    expect(empty).toContain('color: #4B5D5B');
    expect(empty).toContain('font-size: 15px');
  });

  it('renders the refresh and housekeeping buttons at the design primary values', () => {
    const buttons = combinedRuleBody('#shell [data-testid="desk-view"] .desk-refresh.p-button');
    expect(buttons).toContain('min-height: 44px');
    expect(buttons).toContain('padding: 0 18px');
    expect(buttons).toContain('border-radius: 8px');
    expect(buttons).toContain('border: 0');
    expect(buttons).toContain('background: #0F766E');
    expect(buttons).toContain('color: #FFFFFF');
    expect(buttons).toContain('font-weight: 600');
    // The template wears both classes on the PrimeVue buttons.
    expect(deskViewSource).toContain('class="desk-refresh"');
    expect(deskViewSource).toContain('class="desk-action"');
    expect(deskViewSource).toContain('class="desk-date-row"');
  });
});
