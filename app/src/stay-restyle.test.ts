// R4 Stay check-in/out restyle guard (Refs #521; restyle spec section 5.3,
// AC-RST-4; traceability `docs/testing/desk-restyle-test-traceability.md`
// section 3 R4).
//
// Pins the owner-design Stay screen at the source plus the live
// render contract: the h1 `22px` title with the muted `14px`
// intro, the five stacked cards (`gap:16px`) with `18px` titles,
// the lists card with the business-date row, `16px` section
// headings, and `14px` rows with no dividers, `14px` labels with
// full-width `44px` controls (`margin-top:6px`), the muted `14px`
// room-picker hint and folio-reconciliation hint, and primary
// action buttons per `docs/design/Stay.dc.html:2-:7`, while the
// two-step check-in flow, the empty room-select placeholder gate,
// the move/times flows, and the settled-folio checkout gate run
// exactly as today (parity suite `StayView.test.ts` owns the
// behaviour half; this file owns the design values only).
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import stayViewSource from './views/StayView.vue?raw';

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

describe('R4 Stay design values (Refs #521)', () => {
  it('pins the Stay design tokens to the design board', () => {
    // `docs/design/Stay.dc.html:2` (restyle spec section 3): primary
    // action `#0F766E`, muted `#4B5D5B`, card border `#D9E0DE`
    // (Stay uses the card border only — no row-divider rule on
    // this surface).
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Stay behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="stay-view"',
      'data-testid="stay-main"',
      'data-testid="stay-lists-card"',
      'data-testid="stay-business-date"',
      'data-testid="stay-refresh"',
      'data-testid="stay-lists-loading"',
      'data-testid="stay-lists-error"',
      'data-testid="stay-arrivals-table"',
      'data-testid="stay-inhouse-table"',
      'data-testid="stay-departures-table"',
      'stay-use-arrival-',
      'stay-use-stay-',
      'data-testid="stay-checkin-card"',
      'data-testid="stay-booking-ref"',
      'data-testid="stay-checkin-arrival"',
      'data-testid="stay-checkin-room"',
      'data-testid="stay-checkin-room-hint"',
      'data-testid="stay-checkin"',
      'data-testid="stay-checking-in"',
      'data-testid="stay-checkin-status"',
      'data-testid="stay-checkin-error"',
      'data-testid="stay-move-card"',
      'data-testid="stay-move-stay-id"',
      'data-testid="stay-move-room"',
      'data-testid="stay-move"',
      'data-testid="stay-moving"',
      'data-testid="stay-move-status"',
      'data-testid="stay-move-error"',
      'data-testid="stay-times-card"',
      'data-testid="stay-times-stay-id"',
      'data-testid="stay-times-arrival"',
      'data-testid="stay-times-departure"',
      'data-testid="stay-times"',
      'data-testid="stay-recording"',
      'data-testid="stay-times-status"',
      'data-testid="stay-times-error"',
      'data-testid="stay-checkout-card"',
      'data-testid="stay-checkout-gate-note"',
      'data-testid="stay-checkout-stay-id"',
      'data-testid="stay-checkout-departure"',
      'data-testid="stay-review"',
      'data-testid="stay-reviewing"',
      'data-testid="stay-folio-status"',
      'data-testid="stay-approval-section"',
      'data-testid="stay-approval-by"',
      'data-testid="stay-approval-role"',
      'data-testid="stay-approval-reason"',
      'data-testid="stay-approve"',
      'data-testid="stay-approving"',
      'data-testid="stay-checkout"',
      'data-testid="stay-checkout-dialog"',
      'data-testid="stay-checkout-cancel"',
      'data-testid="stay-checkout-confirm"',
      'data-testid="stay-checking-out"',
      'data-testid="stay-checkout-status"',
      'data-testid="stay-checkout-error"',
    ]) {
      expect(stayViewSource, `missing hook ${hook}`).toContain(hook);
    }
    // Logic carriers stay: the two-step check-in flow with the
    // room-select placeholder gate, move/times flows, and the
    // settled-folio checkout gate with all refusal paths
    // (Refs #521 keep).
    for (const logic of [
      '/v1/stay/ListArrivalsDepartures',
      '/v1/stay/CheckIn',
      '/v1/stay/MoveRoom',
      '/v1/stay/RecordActualTimes',
      '/v1/stay/CheckOut',
      '/v1/reservations/QueryCalendar',
      '/v1/reservations/GetReservation',
      '/v1/reservations/CheckInReservation',
      '/v1/rooms/AssignRoom',
      '/v1/rooms/ListRoomsByState',
      '/v1/rooms/ListRoomTypes',
      '/v1/guests/GetGuest',
      '/v1/billing/GetFolioBalance',
      '/v1/billing/RecordOpenBalanceApproval',
      'onRefresh',
      'onCheckIn',
      'onMove',
      'onRecordTimes',
      'onReview',
      'onApprove',
      'onCheckOut',
      'pickArrival',
      'pickStay',
    ]) {
      expect(stayViewSource, `missing logic ${logic}`).toContain(logic);
    }
  });

  it('renders the h1 title at 22px with the muted 14px intro', () => {
    const title = ruleBody('#shell [data-testid="stay-view"] .stay-title');
    expect(title).toContain('font-size: 22px');
    expect(title).toContain('margin: 0');
    const intro = ruleBody('#shell [data-testid="stay-view"] .stay-intro');
    expect(intro).toContain('font-size: 14px');
    expect(intro).toContain('color: #4B5D5B');
    expect(intro).toContain('margin: 0');
    // The five cards stack in one column per the design.
    const main = ruleBody('#shell [data-testid="stay-main"]');
    expect(main).toContain('display: flex');
    expect(main).toContain('flex-direction: column');
    expect(main).toContain('gap: 16px');
    // DOM order carries the five stacked cards: lists, check-in,
    // move, times, check-out.
    const order = [
      'data-testid="stay-lists-card"',
      'data-testid="stay-checkin-card"',
      'data-testid="stay-move-card"',
      'data-testid="stay-times-card"',
      'data-testid="stay-checkout-card"',
    ];
    let previous = -1;
    for (const hook of order) {
      const at = stayViewSource.indexOf(hook);
      expect(at, `missing card ${hook}`).toBeGreaterThan(previous);
      previous = at;
    }
    // The template wears the design classes on the title, intro,
    // and business row.
    expect(stayViewSource).toContain('class="stay-title"');
    expect(stayViewSource).toContain('class="stay-intro"');
    expect(stayViewSource).toContain('class="stay-business-row"');
  });

  it('renders the five stacked cards with 18px titles', () => {
    const card = combinedRuleBody('#shell [data-testid="stay-lists-card"].p-card,');
    expect(card).toContain('background: #FFFFFF');
    expect(card).toContain('border: 1px solid #D9E0DE');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('box-shadow: none');
    const body = combinedRuleBody('#shell [data-testid="stay-lists-card"] .p-card-body,');
    expect(body).toContain('padding: 18px');
    expect(body).toContain('display: flex');
    expect(body).toContain('flex-direction: column');
    expect(body).toContain('gap: 10px');
    const caption = combinedRuleBody('#shell [data-testid="stay-lists-card"] .p-card-caption,');
    expect(caption).toContain('padding: 0');
    const title = combinedRuleBody('#shell [data-testid="stay-lists-card"] .p-card-title h2,');
    expect(title).toContain('font-size: 18px');
    expect(title).toContain('margin: 0');
    // All five cards share the same design card.
    for (const hook of [
      'stay-checkin-card',
      'stay-move-card',
      'stay-times-card',
      'stay-checkout-card',
    ]) {
      expect(appSource).toContain(`#shell [data-testid="${hook}"].p-card`);
      expect(appSource).toContain(`#shell [data-testid="${hook}"] .p-card-title h2`);
    }
  });

  it('renders the business-date row, 16px section headings, and 14px divider-free rows', () => {
    const row = ruleBody('#shell [data-testid="stay-view"] .stay-business-row');
    expect(row).toContain('display: flex');
    expect(row).toContain('align-items: center');
    const label = ruleBody('#shell [data-testid="stay-view"] .stay-business-label');
    expect(label).toContain('font-size: 14px');
    const section = ruleBody('#shell [data-testid="stay-lists-card"] h3');
    expect(section).toContain('font-size: 16px');
    expect(section).toContain('margin: 0');
    // Stay rows are `14px` with no dividers: Stay uses the card
    // border only (restyle spec section 3,
    // `docs/design/Stay.dc.html:3`).
    const table = ruleBody('#shell [data-testid="stay-lists-card"] .p-datatable .p-datatable-table');
    expect(table).toContain('font-size: 14px');
    const head = ruleBody('#shell [data-testid="stay-lists-card"] .p-datatable th');
    expect(head).toContain('font-size: 14px');
    expect(head).toContain('color: #4B5D5B');
    const cell = ruleBody('#shell [data-testid="stay-lists-card"] .p-datatable td');
    expect(cell).toContain('font-size: 14px');
    expect(cell).toContain('border: 0');
    expect(cell).not.toContain('border-top');
    const empty = ruleBody(
      '#shell [data-testid="stay-lists-card"] .p-datatable .p-datatable-emptymessage td',
    );
    expect(empty).toContain('font-size: 14px');
    expect(empty).toContain('color: #4B5D5B');
    expect(empty).toContain('padding: 18px 0');
  });

  it('renders 14px labels with full-width 44px controls', () => {
    const label = ruleBody('#shell [data-testid="stay-view"] label');
    expect(label).toContain('font-size: 14px');
    const controls = combinedRuleBody('#shell [data-testid="stay-view"] label input,');
    expect(controls).toContain('display: block');
    expect(controls).toContain('width: 100%');
    expect(controls).toContain('min-height: 44px');
    expect(controls).toContain('margin-top: 6px');
    expect(controls).toContain('box-sizing: border-box');
    // The template carries no presentational line breaks: the
    // card `gap: 10px` owns the spacing.
    expect(stayViewSource).not.toContain('<br');
  });

  it('renders the room-picker hint and the folio gate note muted at 14px', () => {
    const hint = ruleBody('#shell [data-testid="stay-view"] .stay-hint');
    expect(hint).toContain('font-size: 14px');
    expect(hint).toContain('color: #4B5D5B');
    expect(hint).toContain('margin: 0');
    // The template wears the design class on both hints.
    expect(stayViewSource).toContain('data-testid="stay-checkin-room-hint"');
    expect(stayViewSource).toContain('data-testid="stay-checkout-gate-note"');
    const hintCount = stayViewSource.split('class="stay-hint"').length - 1;
    expect(hintCount).toBe(2);
  });

  it('renders the refresh, pick, and flow buttons at the design primary values', () => {
    const buttons = ruleBody('#shell [data-testid="stay-view"] .stay-action.p-button');
    expect(buttons).toContain('min-height: 44px');
    expect(buttons).toContain('padding: 0 18px');
    expect(buttons).toContain('border-radius: 8px');
    expect(buttons).toContain('border: 0');
    expect(buttons).toContain('background: #0F766E');
    expect(buttons).toContain('color: #FFFFFF');
    expect(buttons).toContain('font-weight: 600');
    // The template wears the design class on every primary
    // action (the dialog cancel keeps its secondary
    // logic-carrier styling).
    const actionCount = stayViewSource.split('class="stay-action"').length - 1;
    expect(actionCount).toBe(11);
  });
});
