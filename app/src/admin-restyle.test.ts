// Admin v2 board guard (Refs #546; v2 board adoption, epic #537).
//
// Pins the owner-design Admin screen at the source plus the live
// render contract: no screen title or intro, the top `1.2fr 1fr`
// grid (users card left, create-account card right) above the
// bottom `1fr 1fr` grid (config card left, audit card right), the
// four design cards with `16px` h3 titles, the plain `15px`
// label-plus-value rows with `1px solid #EEF1F0` top dividers, the
// `14px` create-form labels with full-width `44px` controls
// (`margin-top:6px`), the locked note in the balance-due accent,
// and primary plus secondary action buttons per
// `docs/design/Admin.dc.html:3`, while users/roles management, the
// read-only config display, the audit view, and the role gate run
// exactly as today (parity suite `AdminView.test.ts` owns the
// behaviour half; this file owns the design values plus the
// print-isolation half).
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import adminViewSource from './views/AdminView.vue?raw';
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

describe('Admin v2 design values (Refs #546)', () => {
  it('pins the Admin design tokens to the design board', () => {
    // `docs/design/Admin.dc.html:3`: primary action `#0F766E`,
    // muted `#4B5D5B`, card border `#D9E0DE`, row divider
    // `#EEF1F0`, locked-note accent `#8A4B08` (the shared
    // balance-due token, never a per-surface fork).
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.colors.rowDivider).toBe('#EEF1F0');
    expect(deskTokens.colors.balanceDue).toBe('#8A4B08');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Admin behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="admin-view"',
      'data-testid="admin-restricted-notice"',
      'data-testid="admin-console"',
      'data-testid="admin-grid-top"',
      'data-testid="admin-users-card"',
      'data-testid="admin-users-error"',
      'data-testid="admin-user-rows"',
      'data-testid="admin-user-row"',
      'admin-role-select-${',
      'admin-role-save-${',
      'admin-unlock-${',
      'data-testid="admin-create-card"',
      'data-testid="admin-create-form"',
      'data-testid="admin-create-name"',
      'data-testid="admin-create-identity"',
      'data-testid="admin-create-secret"',
      'data-testid="admin-create-role"',
      'data-testid="admin-create-submit"',
      'data-testid="admin-config-card"',
      'data-testid="admin-config-version"',
      'data-testid="admin-config-error"',
      'data-testid="admin-config-list"',
      'data-testid="admin-audit-card"',
      'data-testid="admin-audit-rows"',
      'data-testid="admin-audit-row"',
      'data-testid="admin-audit-refresh"',
      'data-testid="admin-audit-error"',
    ]) {
      expect(adminViewSource, `missing hook ${hook}`).toContain(hook);
    }
    // Logic carriers stay: the five admin reads/mutations, the
    // create/save/unlock/refresh handlers, the row helpers, the
    // draft-role flow, and the four cards.
    for (const logic of [
      '/v1/admin/ListUsers',
      '/v1/admin/CreateUser',
      '/v1/admin/UpdateUserRole',
      '/v1/admin/UnlockIdentity',
      '/v1/admin/GetHotelConfig',
      '/v1/admin/QueryAuditLog',
      'onCreate',
      'onSaveRole',
      'onUnlock',
      'onAuditRefresh',
      'auditSummary',
      'roleLabel',
      'checkinEntry',
      'checkoutEntry',
      'otherConfigEntries',
      'draftRole',
      'Card',
    ]) {
      expect(adminViewSource, `missing logic ${logic}`).toContain(logic);
    }
  });

  it('keeps the retired v1 chrome absent (zero extras vs the board)', () => {
    // The v2 board carries no screen title, no intro, no
    // config/audit notes, and no data tables — the per-row
    // save/unlock actions, the role selects, the empty states,
    // and the status readouts stay as flow state (same precedent
    // as the Folio kind/method selects, Refs #545), everything
    // else goes.
    for (const hook of [
      'desk.admin.title',
      'desk.admin.intro',
      'desk.admin.config_note',
      'desk.admin.audit_note',
      'desk.admin.th_name',
      'desk.admin.th_time',
      'data-testid="admin-users-table"',
      'data-testid="admin-audit-table"',
    ]) {
      expect(adminViewSource, `retired hook still present: ${hook}`).not.toContain(hook);
    }
    // The v2 board carries no screen title: no h1 or h2 renders —
    // every card title is an h3.
    expect(adminViewSource).not.toContain('<h1');
    expect(adminViewSource).not.toContain('<h2');
  });

  it('stacks the top 1.2fr 1fr grid above the bottom 1fr 1fr grid', () => {
    const main = ruleBody('#shell [data-testid="admin-console"]');
    expect(main).toContain('display: flex');
    expect(main).toContain('flex-direction: column');
    expect(main).toContain('gap: 20px');
    const top = ruleBody('#shell .admin-grid-top');
    expect(top).toContain('display: grid');
    expect(top).toContain('grid-template-columns: 1.2fr 1fr');
    expect(top).toContain('gap: 16px');
    expect(top).toContain('align-items: start');
    const bottom = ruleBody('#shell .admin-grid-bottom');
    expect(bottom).toContain('display: grid');
    expect(bottom).toContain('grid-template-columns: 1fr 1fr');
    expect(bottom).toContain('gap: 16px');
    expect(bottom).toContain('align-items: start');
    // DOM order carries the design columns: the users card sits
    // directly in the top grid before the create card, and the
    // config card sits directly in the bottom grid before the
    // audit card.
    const topAt = adminViewSource.indexOf('data-testid="admin-grid-top"');
    const usersAt = adminViewSource.indexOf('data-testid="admin-users-card"');
    const createAt = adminViewSource.indexOf('data-testid="admin-create-card"');
    const bottomAt = adminViewSource.indexOf('data-testid="admin-grid-bottom"');
    const configAt = adminViewSource.indexOf('data-testid="admin-config-card"');
    const auditAt = adminViewSource.indexOf('data-testid="admin-audit-card"');
    expect(topAt).toBeGreaterThanOrEqual(0);
    expect(usersAt).toBeGreaterThan(topAt);
    expect(createAt).toBeGreaterThan(usersAt);
    expect(bottomAt).toBeGreaterThan(createAt);
    expect(configAt).toBeGreaterThan(bottomAt);
    expect(auditAt).toBeGreaterThan(configAt);
  });

  it('renders the design cards with 16px h3 titles', () => {
    const card = combinedRuleBody('#shell [data-testid="admin-users-card"].p-card,');
    expect(card).toContain('background: #FFFFFF');
    expect(card).toContain('border: 1px solid #D9E0DE');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('box-shadow: none');
    const body = combinedRuleBody('#shell [data-testid="admin-users-card"] .p-card-body,');
    expect(body).toContain('padding: 18px');
    expect(body).toContain('display: flex');
    expect(body).toContain('flex-direction: column');
    expect(body).toContain('gap: 10px');
    // Card titles are h3 elements rendering the design h3
    // `16px` values.
    const title = combinedRuleBody(
      '#shell [data-testid="admin-users-card"] .p-card-title h3,',
    );
    expect(title).toContain('font-size: 16px');
    expect(title).toContain('margin: 0');
  });

  it('renders the board rows at 15px with top dividers', () => {
    const rows = ruleBody('#shell [data-testid="admin-view"] .admin-rows');
    expect(rows).toContain('display: flex');
    expect(rows).toContain('flex-direction: column');
    const row = ruleBody('#shell [data-testid="admin-view"] .admin-row');
    expect(row).toContain('display: flex');
    expect(row).toContain('justify-content: space-between');
    expect(row).toContain('font-size: 15px');
    expect(row).toContain('padding: 10px 0');
    expect(row).toContain('border-top: 1px solid #EEF1F0');
    // The locked note renders in the balance-due accent, resolved
    // through the shared token.
    const locked = ruleBody('#shell [data-testid="admin-view"] .admin-locked');
    expect(locked).toContain(`color: ${deskTokens.colors.balanceDue}`);
    expect(locked).toContain('color: #8A4B08');
    const empty = ruleBody('#shell [data-testid="admin-view"] .admin-empty');
    expect(empty).toContain('font-size: 15px');
    expect(empty).toContain('color: #4B5D5B');
    // The template wears the design classes on all three row groups.
    expect(adminViewSource).toContain('data-testid="admin-user-rows"');
    expect(adminViewSource).toContain('data-testid="admin-config-list"');
    expect(adminViewSource).toContain('data-testid="admin-audit-rows"');
    expect(adminViewSource).toContain('class="admin-row"');
  });

  it('renders the 1fr 1fr create grid with 14px labels and full-width 44px controls', () => {
    const grid = ruleBody('#shell [data-testid="admin-view"] .admin-form-grid');
    expect(grid).toContain('display: grid');
    expect(grid).toContain('grid-template-columns: 1fr 1fr');
    expect(grid).toContain('gap: 12px');
    const label = ruleBody('#shell [data-testid="admin-view"] label');
    expect(label).toContain('font-size: 14px');
    const controls = combinedRuleBody('#shell [data-testid="admin-view"] label input,');
    expect(controls).toContain('display: block');
    expect(controls).toContain('width: 100%');
    expect(controls).toContain('min-height: 44px');
    expect(controls).toContain('margin-top: 6px');
    expect(controls).toContain('box-sizing: border-box');
    // The board draws the role selects and the secret input with
    // no visible label line of their own: the row selects carry
    // the users-heading catalogue string as their accessible name
    // and the standalone secret control carries the secret
    // catalogue string (same precedent as the Onboarding
    // hotel-name input, Refs #542) — the live gate collects the
    // identical strings the design extractor falls back to.
    expect(adminViewSource).toContain(':aria-label="t(\'desk.admin.users_heading\'');
    expect(adminViewSource).toContain(':aria-label="t(\'desk.admin.create_secret_label\'');
    const secret = ruleBody('#shell [data-testid="admin-view"] .admin-form-grid .p-password');
    expect(secret).toContain('display: block');
    expect(secret).toContain('width: 100%');
    expect(secret).toContain('margin-top: 6px');
    const secretInput = ruleBody('#shell [data-testid="admin-view"] .admin-form-grid .p-password input');
    expect(secretInput).toContain('width: 100%');
    expect(secretInput).toContain('min-height: 44px');
  });

  it('renders save and create at the design primary values, unlock and refresh secondary', () => {
    const primary = ruleBody('#shell [data-testid="admin-view"] .admin-action.p-button');
    expect(primary).toContain('min-height: 44px');
    expect(primary).toContain('padding: 0 18px');
    expect(primary).toContain('border-radius: 8px');
    expect(primary).toContain('border: 0');
    expect(primary).toContain('background: #0F766E');
    expect(primary).toContain('color: #FFFFFF');
    expect(primary).toContain('font-weight: 600');
    const secondary = ruleBody('#shell [data-testid="admin-view"] .admin-action-secondary.p-button');
    expect(secondary).toContain('min-height: 44px');
    expect(secondary).toContain('padding: 0 18px');
    expect(secondary).toContain('border-radius: 8px');
    expect(secondary).toContain('border: 1px solid #0F766E');
    expect(secondary).toContain('background: #FFFFFF');
    expect(secondary).toContain('color: #0F766E');
    expect(secondary).toContain('font-weight: 600');
    // The template wears the design classes: save plus create at
    // the primary treatment, unlock plus refresh secondary.
    expect(adminViewSource.match(/class="admin-action"/g)).toHaveLength(2);
    expect(adminViewSource.match(/class="admin-action-secondary"/g)).toHaveLength(2);
  });
});

describe('Admin v2 board print isolation (Refs #546)', () => {
  it('keeps every admin board rule inside the screen stylesheet', () => {
    // The view carries no style block (M4 suite pins the
    // separation at the SFC source); the shell screen stylesheet
    // owns every admin rule, and that stylesheet renders screen
    // only with no print medium.
    expect(adminViewSource).not.toContain('<style');
    for (const selector of ['.admin-grid-top', '.admin-grid-bottom', '.admin-rows', '.admin-row', '.admin-locked', '.admin-form-grid', '.admin-action', '.admin-action-secondary']) {
      expect(appSource, `shell owns ${selector}`).toContain(selector);
    }
    const screenAt = appSource.indexOf('@media screen');
    expect(screenAt).toBeGreaterThanOrEqual(0);
    expect(appSource.indexOf('.admin-grid-top')).toBeGreaterThan(screenAt);
    // No print medium in the shell stylesheet (comments stripped —
    // the M4 suite pins this at the SFC source; this extends it to
    // the admin selectors above).
    expect(appSource.replace(/\/\*[\s\S]*?\*\//g, '')).not.toContain('@media print');
  });

  it('keeps the board adoption out of the printed documents', () => {
    // No admin screen selector leaks into the print source, which
    // keeps its own print-only stylesheet (M4 suite); the
    // printed values stay pinned by the untouched PrintView suite.
    for (const selector of ['admin-grid-top', 'admin-grid-bottom', 'admin-rows', 'admin-row', 'admin-locked', 'admin-form-grid', 'admin-action']) {
      expect(printSource, `no print leak of ${selector}`).not.toContain(selector);
    }
    expect(printSource).toContain('@media print');
    expect(printSource).toContain('hotel?.name');
  });
});
