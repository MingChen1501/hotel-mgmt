// R6 Rooms map restyle guard (Refs #523; restyle spec section 5.5,
// AC-RST-6; traceability `docs/testing/desk-restyle-test-traceability.md`
// section 3 R6) plus the R9 rooms-surface half (traceability section
// 3 R9: each child PR audits its own surface for the 44px touch
// targets and the no-token-fork pin).
//
// Pins the owner-design Rooms screen at the source plus the live
// render contract: the title row (`26px/700` h1, muted `14px`
// summary lines, primary reload button), the status-chip row
// (`999px` pills with `12px` dots at radius `3px` in the status
// accents), the floor sections (h2 `18px`, `repeat(6,1fr)` grids
// with `gap:12px`), and the room cards (status tint, `radius:12px`,
// `padding:14px`, `gap:6px`, `min-height:104px`; `22px` number;
// `12px/600` badge with `radius:6px padding:4px 8px`; `13px`
// `#3B4A48` type; `14px` note) per
// `docs/design/Rooms.dc.html:2`, while live room-state rendering,
// the summary-counts-match-cards invariant, housekeeping buttons,
// floor grouping, and the shared chip wording run exactly as today
// (parity suite `RoomsView.test.ts` owns the behaviour half; this
// file owns the design values plus the rooms-surface R9 audit).
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import roomsViewSource from './views/RoomsView.vue?raw';
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

describe('R6 Rooms design values (Refs #523)', () => {
  it('pins the Rooms design tokens to the design board', () => {
    // `docs/design/Rooms.dc.html:2` (restyle spec section 3): primary
    // action `#0F766E`, muted `#4B5D5B`, card border `#D9E0DE`,
    // status accents `#1D4E89` (occupied), `#8A4B08`
    // (needs-clean), `#5B3F9A` (awaiting-inspection), `#4B5563`
    // (out-of-service), card tints `#E3F3EC` / `#E1ECF9` /
    // `#FCEBD2` / `#ECE6F7` / `#E6E8E7`, room-note ink `#3B4A48`.
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.colors.roomReady).toBe('#0F766E');
    expect(deskTokens.colors.roomOccupied).toBe('#1D4E89');
    expect(deskTokens.colors.roomNeedsClean).toBe('#8A4B08');
    expect(deskTokens.colors.roomAwaitingInspection).toBe('#5B3F9A');
    expect(deskTokens.colors.roomOutOfService).toBe('#4B5563');
    expect(deskTokens.colors.roomTintReady).toBe('#E3F3EC');
    expect(deskTokens.colors.roomTintOccupied).toBe('#E1ECF9');
    expect(deskTokens.colors.roomTintNeedsClean).toBe('#FCEBD2');
    expect(deskTokens.colors.roomTintAwaitingInspection).toBe('#ECE6F7');
    expect(deskTokens.colors.roomTintOutOfService).toBe('#E6E8E7');
    expect(deskTokens.colors.roomNoteInk).toBe('#3B4A48');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Rooms behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="rooms-view"',
      'data-testid="rooms-business-date"',
      'data-testid="rooms-refresh"',
      'data-testid="rooms-loading"',
      'data-testid="rooms-error"',
      'data-testid="rooms-housekeeping-error"',
      'data-testid="rooms-empty"',
      'data-testid="rooms-summary"',
      'rooms-chip-${chip.status}',
      'rooms-floor-unknown',
      "'rooms-floor'",
      'rooms-card-${room.number}',
      'rooms-card-chip-${room.number}',
      'rooms-card-type-${room.number}',
      'rooms-card-note-${room.number}',
      'rooms-mark-cleaned-${room.number}',
      'rooms-mark-inspected-${room.number}',
    ]) {
      expect(roomsViewSource, `missing hook ${hook}`).toContain(hook);
    }
  });

  it('keeps the logic carriers and reads PrimeVue-only behaviour relies on', () => {
    // PrimeVue stays as logic carrier (restyle spec section 2):
    // Card/Tag/Button/Message keep their behaviour; only their
    // rendered visuals are overridden in the shell stylesheet.
    for (const logic of [
      "import Button from 'primevue/button'",
      "import Card from 'primevue/card'",
      "import Message from 'primevue/message'",
      "import Tag from 'primevue/tag'",
      'components: { Button, Card, Message, Tag }',
      '/v1/rooms/ListRoomTypes',
      '/v1/rooms/ListRoomsByState',
      '/v1/stay/ListArrivalsDepartures',
      '/v1/rooms/UpdateRoomState',
      'chipSeverity(room.display)',
      'chipLabel(room.display)',
      'typeName(room.roomTypeId)',
      'noteFor(room)',
      'onMarkCleaned(room)',
      'onMarkInspected(room)',
      'onRefresh',
    ]) {
      expect(roomsViewSource, `missing logic ${logic}`).toContain(logic);
    }
  });

  it('renders the 26px/700 title row with the muted summary lines and primary reload', () => {
    const title = ruleBody('#shell [data-testid="rooms-view"] .rooms-title');
    expect(title).toContain('font-size: 26px');
    expect(title).toContain('font-weight: 700');
    expect(title).toContain('margin: 0');
    const row = ruleBody('#shell [data-testid="rooms-view"] .rooms-title-row');
    expect(row).toContain('justify-content: space-between');
    expect(row).toContain('padding: 0 24px');
    const intro = ruleBody('#shell [data-testid="rooms-view"] .rooms-intro');
    expect(intro).toContain('font-size: 14px');
    expect(intro).toContain('color: #4B5D5B');
    const business = ruleBody('#shell [data-testid="rooms-view"] .rooms-business-row');
    expect(business).toContain('font-size: 14px');
    expect(business).toContain('color: #4B5D5B');
    const buttons = combinedRuleBody('#shell [data-testid="rooms-view"] .rooms-action.p-button');
    expect(buttons).toContain('min-height: 44px');
    expect(buttons).toContain('padding: 0 18px');
    expect(buttons).toContain('border-radius: 8px');
    expect(buttons).toContain('border: 0');
    expect(buttons).toContain('background: #0F766E');
    expect(buttons).toContain('color: #FFFFFF');
    expect(buttons).toContain('font-weight: 600');
    // The template wears the design classes on the PrimeVue buttons.
    expect(roomsViewSource).toContain('class="rooms-title-row"');
    expect(roomsViewSource).toContain('class="rooms-title"');
    expect(roomsViewSource).toContain('class="rooms-intro"');
    expect(roomsViewSource).toContain('class="rooms-business-row"');
    expect(roomsViewSource).toContain('class="rooms-action"');
  });

  it('renders the section heads and the 999px status-chip row with accent dots', () => {
    const head = ruleBody('#shell [data-testid="rooms-view"] .rooms-section-title');
    expect(head).toContain('font-size: 18px');
    expect(head).toContain('margin: 0 0 8px');
    const chips = ruleBody('#shell [data-testid="rooms-summary"] .rooms-chips');
    expect(chips).toContain('display: flex');
    expect(chips).toContain('gap: 10px');
    const chip = ruleBody('#shell [data-testid="rooms-summary"] .rooms-chip');
    expect(chip).toContain('background: #FFFFFF');
    expect(chip).toContain('border: 1px solid #D9E0DE');
    expect(chip).toContain('border-radius: 999px');
    expect(chip).toContain('padding: 8px 14px');
    expect(chip).toContain('font-size: 14px');
    const tag = combinedRuleBody('#shell [data-testid="rooms-summary"] .rooms-chip-tag.p-tag');
    expect(tag).toContain('background: transparent');
    expect(tag).toContain('font-size: 14px');
    const dot = ruleBody('#shell [data-testid="rooms-summary"] .rooms-chip-dot');
    expect(dot).toContain('width: 12px');
    expect(dot).toContain('height: 12px');
    expect(dot).toContain('border-radius: 3px');
    // One accent per status (`docs/design/Rooms.dc.html:2`).
    const dots: Array<[string, string]> = [
      ['ready', '#0F766E'],
      ['occupied', '#1D4E89'],
      ['needs-cleaning', '#8A4B08'],
      ['awaiting-inspection', '#5B3F9A'],
      ['out-of-service', '#4B5563'],
    ];
    for (const [status, accent] of dots) {
      const dotRule = combinedRuleBody(`.rooms-chip-${status} .rooms-chip-dot`);
      expect(dotRule).toContain(`background: ${accent}`);
    }
    expect(roomsViewSource).toContain('class="rooms-chips"');
    expect(roomsViewSource).toContain('class="rooms-chip-dot"');
    expect(roomsViewSource).toContain('class="rooms-chip-tag"');
    expect(roomsViewSource).toContain('class="rooms-section-title"');
  });

  it('renders the floor grids as fixed six-column design grids', () => {
    const grid = ruleBody('#shell [data-testid="rooms-view"] .rooms-grid');
    expect(grid).toContain('display: grid');
    expect(grid).toContain('grid-template-columns: repeat(6, 1fr)');
    expect(grid).toContain('gap: 12px');
    expect(roomsViewSource).toContain('class="rooms-floor"');
    expect(roomsViewSource).toContain('class="rooms-grid"');
  });

  it('renders the status-tint cards with the 22px number, accent badge, type, and note', () => {
    const card = combinedRuleBody('#shell [data-testid="rooms-view"] .room-card.p-card');
    expect(card).toContain('border: 0');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('box-shadow: none');
    // One tint per status (`docs/design/Rooms.dc.html:2`).
    const tints: Array<[string, string]> = [
      ['ready', '#E3F3EC'],
      ['occupied', '#E1ECF9'],
      ['needs-cleaning', '#FCEBD2'],
      ['awaiting-inspection', '#ECE6F7'],
      ['out-of-service', '#E6E8E7'],
    ];
    for (const [status, tint] of tints) {
      const tintRule = combinedRuleBody(`.room-card-${status}.p-card`);
      expect(tintRule).toContain(`background: ${tint}`);
    }
    const body = ruleBody('#shell [data-testid="rooms-view"] .room-card .p-card-body');
    expect(body).toContain('padding: 14px');
    expect(body).toContain('gap: 6px');
    expect(body).toContain('min-height: 104px');
    const head = ruleBody('#shell [data-testid="rooms-view"] .room-card-head');
    expect(head).toContain('justify-content: space-between');
    expect(head).toContain('align-items: center');
    const number = ruleBody('#shell [data-testid="rooms-view"] .room-card-number');
    expect(number).toContain('font-size: 22px');
    expect(number).toContain('margin: 0');
    const badge = combinedRuleBody('#shell [data-testid="rooms-view"] .room-card-badge.p-tag');
    expect(badge).toContain('border-radius: 6px');
    expect(badge).toContain('padding: 4px 8px');
    expect(badge).toContain('font-size: 12px');
    expect(badge).toContain('font-weight: 600');
    expect(badge).toContain('color: #FFFFFF');
    const badges: Array<[string, string]> = [
      ['ready', '#0F766E'],
      ['occupied', '#1D4E89'],
      ['needs-cleaning', '#8A4B08'],
      ['awaiting-inspection', '#5B3F9A'],
      ['out-of-service', '#4B5563'],
    ];
    for (const [status, accent] of badges) {
      const badgeRule = combinedRuleBody(`.room-card-${status} .room-card-badge.p-tag`);
      expect(badgeRule).toContain(`background: ${accent}`);
    }
    const type = ruleBody('#shell [data-testid="rooms-view"] .room-card-type');
    expect(type).toContain('font-size: 13px');
    expect(type).toContain('color: #3B4A48');
    const note = ruleBody('#shell [data-testid="rooms-view"] .room-card-note');
    expect(note).toContain('font-size: 14px');
    expect(roomsViewSource).toContain('class="room-card-head"');
    expect(roomsViewSource).toContain('class="room-card-number"');
    expect(roomsViewSource).toContain('class="room-card-badge"');
    expect(roomsViewSource).toContain('class="room-card-type"');
    expect(roomsViewSource).toContain('class="room-card-note"');
    expect(roomsViewSource).toContain('class="room-card-action"');
  });

  it('audits the rooms-surface 44px targets (R9 rooms-surface half)', () => {
    // Every interactive element on the Rooms surface presents at
    // least a 44px hit target: the reload button, every status
    // chip, and every housekeeping button.
    const reload = combinedRuleBody('#shell [data-testid="rooms-view"] .rooms-action.p-button');
    expect(reload).toContain('min-height: 44px');
    const chip = ruleBody('#shell [data-testid="rooms-summary"] .rooms-chip');
    expect(chip).toContain('min-height: 44px');
    const cardAction = combinedRuleBody(
      '#shell [data-testid="rooms-view"] .room-card-action .rooms-action.p-button',
    );
    expect(cardAction).toContain('width: 100%');
  });

  it('pins no per-surface token forks on the Rooms surface (R9 no-fork half)', () => {
    // Every colour the Rooms rules render resolves through
    // `app/src/theme/tokens.ts`: collect the token palette and
    // require each Rooms hex to be a member.
    const palette = new Set(Object.values(deskTokens.colors));
    const roomsCss = appSource.slice(
      appSource.indexOf('Rooms map screen (Refs #523'),
      appSource.indexOf('Native controls stay native'),
    );
    expect(roomsCss.length).toBeGreaterThan(0);
    for (const raw of roomsCss.match(/#[0-9A-Fa-f]{6}\b/g) ?? []) {
      const upper = raw.toUpperCase();
      const hit = [...palette].some((token) => token.toUpperCase() === upper);
      expect(hit, `Rooms colour ${raw} forks no token`).toBe(true);
    }
  });

  it('keeps the Rooms restyle out of print', () => {
    expect(printSource).not.toContain('rooms-');
    expect(printSource).not.toContain('room-card');
    // The rooms rules live inside the screen-only stylesheet (the
    // whole App.vue style block sits under `@media screen`, so no
    // screen rule can leak into print).
    expect(appSource.indexOf('@media screen')).toBeGreaterThanOrEqual(0);
    expect(appSource.indexOf('@media screen')).toBeLessThan(
      appSource.indexOf('Rooms map screen (Refs #523'),
    );
  });
});
