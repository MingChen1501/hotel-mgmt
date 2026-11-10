// Stay v2 two-panel guard (Refs #541; v2 board adoption, epic
// #537; traceability `docs/testing/desk-restyle-test-traceability.md`
// section 3 R4).
//
// Pins the owner-design Stay screen at the source plus the live
// render contract: the `1fr 1fr` panels grid with the check-in
// card left and the check-out card right, `16px` h3 card titles,
// `14px` labels with full-width `44px` selects and inputs
// (`margin-top:6px`), the amber `14px` room-picker note and the
// muted `14px` folio gate note, and primary action buttons per
// `docs/design/Stay.dc.html:3`, while the select-driven check-in
// flow, the review-to-checkout flow state (folio status, approval
// form, confirm dialog), and the settled-folio checkout gate run
// exactly as before (parity suite `StayView.test.ts` owns the
// behaviour half; this file owns the design values only). The v2
// board carries no screen title, no lists, and no move/times
// sections — their hooks must stay absent (zero extras).
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

describe('Stay v2 design values (Refs #541)', () => {
  it('pins the Stay design tokens to the design board', () => {
    // `docs/design/Stay.dc.html:3`: primary action `#0F766E`,
    // muted `#4B5D5B`, card border `#D9E0DE`, board-amber
    // `#8A4B08` (the shared balance-due accent, never a
    // per-surface fork).
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.colors.balanceDue).toBe('#8A4B08');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Stay behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="stay-view"',
      'data-testid="stay-panels"',
      'data-testid="stay-checkin-card"',
      'data-testid="stay-checkin-arrival"',
      'data-testid="stay-checkin-room"',
      'data-testid="stay-checkin-room-hint"',
      'data-testid="stay-checkin"',
      'data-testid="stay-checking-in"',
      'data-testid="stay-checkin-status"',
      'data-testid="stay-checkin-error"',
      'data-testid="stay-checkout-card"',
      'data-testid="stay-checkout-stay"',
      'data-testid="stay-checkout-gate-note"',
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
    // Logic carriers stay: the select-driven check-in flow, the
    // panel data reads, and the settled-folio checkout gate with
    // all refusal paths (Refs #541 keep).
    for (const logic of [
      '/v1/stay/ListArrivalsDepartures',
      '/v1/stay/CheckIn',
      '/v1/stay/CheckOut',
      '/v1/reservations/QueryCalendar',
      '/v1/reservations/GetReservation',
      '/v1/reservations/CheckInReservation',
      '/v1/rooms/AssignRoom',
      '/v1/rooms/ListRoomsByState',
      '/v1/rooms/ListRoomTypes',
      '/v1/guests/GetGuest',
      '/v1/billing/GetFolioBalance',
      '/v1/billing/PostCharge',
      '/v1/billing/RecordOpenBalanceApproval',
      'onArrivalChange',
      'onDepartureChange',
      'onCheckIn',
      'onReview',
      'onApprove',
      'onCheckOut',
      'checkinOptions',
      'checkoutOptions',
    ]) {
      expect(stayViewSource, `missing logic ${logic}`).toContain(logic);
    }
  });

  it('keeps the retired v1 sections absent (zero extras vs the board)', () => {
    for (const hook of [
      'data-testid="stay-main"',
      'stay-title',
      'stay-intro',
      'data-testid="stay-lists-card"',
      'data-testid="stay-business-date"',
      'data-testid="stay-refresh"',
      'data-testid="stay-lists-loading"',
      'data-testid="stay-lists-error"',
      'stay-arrivals-table',
      'stay-inhouse-table',
      'stay-departures-table',
      'stay-use-arrival-',
      'stay-use-stay-',
      'data-testid="stay-booking-ref"',
      'data-testid="stay-move-card"',
      'data-testid="stay-move-stay-id"',
      'stay-move-room',
      'data-testid="stay-times-card"',
      'data-testid="stay-times-stay-id"',
      'data-testid="stay-checkin-arrival" type="datetime-local"',
      '/v1/stay/MoveRoom',
      '/v1/stay/RecordActualTimes',
      'onMove',
      'onRecordTimes',
      'pickArrival',
      'pickStay',
    ]) {
      expect(stayViewSource, `retired hook still present: ${hook}`).not.toContain(hook);
    }
    // The v2 board carries no screen title: no h1 renders.
    expect(stayViewSource).not.toContain('<h1');
  });

  it('renders the two-panel 1fr 1fr grid with check-in left of check-out', () => {
    const panels = ruleBody('#shell [data-testid="stay-view"] .stay-panels');
    expect(panels).toContain('display: grid');
    expect(panels).toContain('grid-template-columns: 1fr 1fr');
    expect(panels).toContain('gap: 16px');
    // DOM order carries the check-in card before the check-out card.
    const checkinAt = stayViewSource.indexOf('data-testid="stay-checkin-card"');
    const checkoutAt = stayViewSource.indexOf('data-testid="stay-checkout-card"');
    expect(checkinAt).toBeGreaterThanOrEqual(0);
    expect(checkoutAt).toBeGreaterThan(checkinAt);
    // The template wears the design class on the panels wrapper.
    expect(stayViewSource).toContain('class="stay-panels"');
  });

  it('renders the two cards with 16px h3 titles', () => {
    const card = combinedRuleBody('#shell [data-testid="stay-checkin-card"].p-card,');
    expect(card).toContain('background: #FFFFFF');
    expect(card).toContain('border: 1px solid #D9E0DE');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('box-shadow: none');
    const body = combinedRuleBody('#shell [data-testid="stay-checkin-card"] .p-card-body,');
    expect(body).toContain('padding: 18px');
    expect(body).toContain('display: flex');
    expect(body).toContain('flex-direction: column');
    expect(body).toContain('gap: 10px');
    const caption = combinedRuleBody('#shell [data-testid="stay-checkin-card"] .p-card-caption,');
    expect(caption).toContain('padding: 0');
    // The card content is the board column: labels, hints, and
    // buttons stretch as its direct flex items.
    const content = combinedRuleBody(
      `#shell [data-testid="stay-checkout-card"] .p-card-content {` +
        `\n    display: flex;`,
    );
    expect(content).toContain('display: flex');
    expect(content).toContain('flex-direction: column');
    expect(content).toContain('gap: 10px');
    const title = combinedRuleBody('#shell [data-testid="stay-checkin-card"] .p-card-title h3,');
    expect(title).toContain('font-size: 16px');
    expect(title).toContain('margin: 0');
    // Both cards share the same design card.
    expect(appSource).toContain('#shell [data-testid="stay-checkout-card"].p-card');
    expect(appSource).toContain('#shell [data-testid="stay-checkout-card"] .p-card-title h3');
    // The template wears h3 card titles, not the retired h2s.
    expect(stayViewSource).toContain('class="stay-card-title"');
    expect(stayViewSource).not.toContain('<h2>');
  });

  it('renders 14px labels with full-width 44px selects and inputs', () => {
    const label = ruleBody('#shell [data-testid="stay-view"] label');
    expect(label).toContain('font-size: 14px');
    const controls = combinedRuleBody('#shell [data-testid="stay-view"] label select,');
    expect(controls).toContain('display: block');
    expect(controls).toContain('width: 100%');
    expect(controls).toContain('min-height: 44px');
    expect(controls).toContain('margin-top: 6px');
    expect(controls).toContain('box-sizing: border-box');
    expect(appSource).toContain('#shell [data-testid="stay-view"] label .p-inputtext');
    // The template carries no presentational line breaks: the
    // card `gap: 10px` owns the spacing.
    expect(stayViewSource).not.toContain('<br');
  });

  it('renders the amber room-picker note and the muted folio gate note at 14px', () => {
    const amber = ruleBody('#shell [data-testid="stay-view"] .stay-hint-amber');
    expect(amber).toContain('font-size: 14px');
    expect(amber).toContain('color: #8A4B08');
    expect(amber).toContain('margin: 0');
    const hint = ruleBody('#shell [data-testid="stay-view"] .stay-hint');
    expect(hint).toContain('font-size: 14px');
    expect(hint).toContain('color: #4B5D5B');
    expect(hint).toContain('margin: 0');
    // The template wears the design class on both hints.
    expect(stayViewSource).toContain('data-testid="stay-checkin-room-hint"');
    expect(stayViewSource).toContain('data-testid="stay-checkout-gate-note"');
    expect(stayViewSource).toContain('class="stay-hint-amber"');
    expect(stayViewSource).toContain('class="stay-hint"');
  });

  it('renders the check-in, review, approval, and check-out buttons at the design primary values', () => {
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
    expect(actionCount).toBe(5);
  });
});
