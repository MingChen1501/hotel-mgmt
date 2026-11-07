// Onboarding design-value guard (Refs #542; v2 board
// `docs/design/Onboarding.dc.html:3`, AC-RST-7) plus the onboarding-surface R9 halves (traceability section
// 3 R9: each child PR audits its own surface for the 44px touch targets
// and the no-token-fork pin) plus the seven-surface R9 rollup (this is the
// last child PR to merge, so it records the rollup for all seven surfaces).
//
// Pins the v2 Onboarding board at the source plus the live
// render contract: no screen title or intro (zero extras), the
// centred `560px` column, the muted `14px` board-phase progress
// line, the `8px` track (`#D9E0DE`, radius `4px`) with the primary bar at
// 25/50/75/100 percent, the white cards (`radius:12px`, `padding:18px`,
// `gap:10px`) with `16px` step heads, full-width `44px` controls with
// `margin-top:6px`, muted `14px` helpers, and the full-width primary
// continue action with the secondary Back (steps 2–4 only), all per
// `docs/design/Onboarding.dc.html:3`, while launch gating, the four steps
// with progress and back/continue navigation, per-step validation,
// hotel-name persistence and surfacing, and the step wording run exactly
// as today (parity suite `OnboardingView.test.ts` owns the behaviour half;
// this file owns the design values plus the R9 audits).
import { describe, expect, it } from 'vitest';
import { deskTokens } from './theme/tokens';
import appSource from './App.vue?raw';
import onboardingViewSource from './views/OnboardingView.vue?raw';
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

describe('R7 Onboarding design values (Refs #542)', () => {
  it('pins the Onboarding design tokens to the design board', () => {
    // `docs/design/Onboarding.dc.html:3` (Refs #542):
    // header teal `#0F4C47`, primary action `#0F766E`, page
    // `#F4F6F5`, ink `#1B2B2A`, muted `#4B5D5B`, surface `#FFFFFF`,
    // card border `#D9E0DE`, 1200px content column. The wizard
    // introduces no new token: every value resolves through the
    // shared tokens (catalogue impact recorded on #542).
    expect(deskTokens.colors.header).toBe('#0F4C47');
    expect(deskTokens.colors.primary).toBe('#0F766E');
    expect(deskTokens.colors.page).toBe('#F4F6F5');
    expect(deskTokens.colors.ink).toBe('#1B2B2A');
    expect(deskTokens.colors.muted).toBe('#4B5D5B');
    expect(deskTokens.colors.surface).toBe('#FFFFFF');
    expect(deskTokens.colors.cardBorder).toBe('#D9E0DE');
    expect(deskTokens.spacing.contentMaxPx).toBe(1200);
  });

  it('keeps every Onboarding behaviour hook the parity suite relies on', () => {
    for (const hook of [
      'data-testid="onboarding-view"',
      'data-testid="onboarding-loading"',
      'data-testid="onboarding-progress"',
      'data-testid="onboarding-progress-bar"',
      'data-testid="onboarding-step-1"',
      'data-testid="onboarding-step-2"',
      'data-testid="onboarding-step-3"',
      'data-testid="onboarding-step-4"',
      'data-testid="onboarding-step1-form"',
      'data-testid="onboarding-step2-form"',
      'data-testid="onboarding-step3-form"',
      'data-testid="onboarding-step4-form"',
      'data-testid="onboarding-hotel-name"',
      'data-testid="onboarding-hotel-name-helper"',
      'data-testid="onboarding-step2-note"',
      'data-testid="onboarding-address"',
      'data-testid="onboarding-phone"',
      'data-testid="onboarding-email"',
      'data-testid="onboarding-timezone"',
      'data-testid="onboarding-retention-floor"',
      'data-testid="onboarding-retention-floor-helper"',
      'data-testid="`onboarding-type-name-${typeIndex}`"',
      'data-testid="`onboarding-type-capacity-${typeIndex}`"',
      'data-testid="`onboarding-type-bed-${typeIndex}`"',
      'data-testid="`onboarding-remove-type-${typeIndex}`"',
      'data-testid="onboarding-add-type"',
      'data-testid="`onboarding-room-number-${roomIndex}`"',
      'data-testid="`onboarding-room-floor-${roomIndex}`"',
      'data-testid="`onboarding-room-type-${roomIndex}`"',
      'data-testid="`onboarding-remove-room-${roomIndex}`"',
      'data-testid="onboarding-add-room"',
      'data-testid="onboarding-role-note"',
      'data-testid="onboarding-display-name"',
      'data-testid="onboarding-signin-identity"',
      'data-testid="onboarding-secret"',
      'data-testid="onboarding-error"',
      'data-testid="onboarding-back"',
      'data-testid="onboarding-continue"',
      'data-testid="onboarding-retry"',
    ]) {
      expect(onboardingViewSource, `missing hook ${hook}`).toContain(hook);
    }
    // Zero extras vs the board (Refs #542): the removed screen
    // title/intro catalogue keys never render (the noscript
    // fallback keeps the muted intro class for its own note),
    // card heads are h3 per the board, and the step-1 input
    // carries its catalogue name as an accessible name instead
    // of a visible label line.
    expect(onboardingViewSource).not.toContain('desk.onboarding.title');
    expect(onboardingViewSource).not.toContain('desk.onboarding.intro,');
    expect(onboardingViewSource).not.toContain('<h1');
    expect(onboardingViewSource).not.toContain('<h2');
    expect(onboardingViewSource).toContain('<h3 class="onboarding-card-title"');
    expect(onboardingViewSource).toContain(':aria-label=');
    expect(onboardingViewSource).toContain('stepName');
    expect(onboardingViewSource).toContain('progress_step1_name');
  });

  it('keeps the logic carriers and reads PrimeVue-only behaviour relies on', () => {
    // PrimeVue stays as logic carrier (restyle spec section 2):
    // InputText/Button/Message/ProgressBar keep their behaviour;
    // only their rendered visuals are overridden in the shell
    // stylesheet.
    for (const logic of [
      "import Button from 'primevue/button'",
      "import InputText from 'primevue/inputtext'",
      "import Message from 'primevue/message'",
      "import ProgressBar from 'primevue/progressbar'",
      'components: { Button, InputText, Message, ProgressBar }',
      '/v1/admin/GetHotelConfig',
      '/v1/admin/UpdateHotelConfig',
      '/v1/rooms/UpsertRoomType',
      '/v1/rooms/UpsertRoom',
      '/v1/admin/CreateUser',
      'onContinueStep1',
      'onContinueStep2',
      'onContinueStep3',
      'onFinish',
      'goBack',
      'onRetry',
      'stepProgress',
      'stepName',
      'enteredTypeNames',
    ]) {
      expect(onboardingViewSource, `missing logic ${logic}`).toContain(logic);
    }
  });

  it('renders the centred 560px wizard column with no title or intro', () => {
    const view = ruleBody('#shell [data-testid="onboarding-view"]');
    expect(view).toContain('width: 560px');
    expect(view).toContain('margin: 0 auto');
    expect(view).toContain('display: flex');
    expect(view).toContain('flex-direction: column');
    expect(view).toContain('gap: 16px');
    // Zero extras vs the v2 board (Refs #542,
    // `docs/design/Onboarding.dc.html:3`): the board carries no
    // screen title or intro, so neither rule exists and neither
    // element renders.
    expect(appSource).not.toContain(
      '#shell [data-testid="onboarding-view"] .onboarding-title',
    );
    expect(appSource).not.toContain(
      '#shell [data-testid="onboarding-view"] .onboarding-intro',
    );
    expect(onboardingViewSource).not.toContain('class="onboarding-title"');
  });

  it('renders the muted progress line with the 8px track and primary bar', () => {
    const line = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-progress');
    expect(line).toContain('font-size: 14px');
    expect(line).toContain('color: #4B5D5B');
    const track = ruleBody(
      '#shell [data-testid="onboarding-view"] .onboarding-progress-bar.p-progressbar',
    );
    expect(track).toContain('height: 8px');
    expect(track).toContain('background: #D9E0DE');
    expect(track).toContain('border-radius: 4px');
    const bar = ruleBody(
      '#shell [data-testid="onboarding-view"] .onboarding-progress-bar.p-progressbar .p-progressbar-value',
    );
    expect(bar).toContain('background: #0F766E');
    expect(bar).toContain('border-radius: 4px');
    // The step math is untouched: 25/50/75/100 percent across the
    // four steps (`docs/design/Onboarding.dc.html:3` shows step 1
    // at 25 percent). The progress line reads the board phase
    // format with the drawn step-1 section name.
    expect(onboardingViewSource).toContain('step.value * 25');
    expect(onboardingViewSource).toContain(':value="stepProgress"');
    expect(onboardingViewSource).toContain('step: stepName');
    expect(onboardingViewSource).toContain('desk.onboarding.progress_step1_name');
    expect(onboardingViewSource).toContain('class="onboarding-progress"');
    expect(onboardingViewSource).toContain('class="onboarding-progress-bar"');
  });

  it('renders the white cards with 16px step heads', () => {
    const form = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-step-form');
    expect(form).toContain('display: flex');
    expect(form).toContain('flex-direction: column');
    expect(form).toContain('gap: 16px');
    const card = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-card');
    expect(card).toContain('background: #FFFFFF');
    expect(card).toContain('border: 1px solid #D9E0DE');
    expect(card).toContain('border-radius: 12px');
    expect(card).toContain('padding: 18px');
    expect(card).toContain('display: flex');
    expect(card).toContain('flex-direction: column');
    expect(card).toContain('gap: 10px');
    const head = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-card-title');
    expect(head).toContain('font-size: 16px');
    expect(head).toContain('margin: 0');
    expect(onboardingViewSource).toContain('class="onboarding-step-form"');
    expect(onboardingViewSource).toContain('class="onboarding-card"');
    expect(onboardingViewSource).toContain('class="onboarding-card-title"');
  });

  it('renders 14px labels with full-width 44px controls and muted helpers', () => {
    const label = ruleBody('#shell [data-testid="onboarding-view"] label');
    expect(label).toContain('font-size: 14px');
    const controls = combinedRuleBody('#shell [data-testid="onboarding-view"] label input,');
    expect(controls).toContain('display: block');
    expect(controls).toContain('width: 100%');
    expect(controls).toContain('min-height: 44px');
    expect(controls).toContain('margin-top: 6px');
    expect(controls).toContain('box-sizing: border-box');
    // The drawn step 1 shows its input bare under the h3 with no
    // label line (Refs #542): the hotel-name catalogue string
    // reaches the input as its accessible name exactly once, and
    // no step-1 label element renders.
    const nameLabelUses = onboardingViewSource.match(/desk\.onboarding\.hotel_name_label/g) ?? [];
    expect(nameLabelUses).toHaveLength(1);
    expect(onboardingViewSource).toContain(':aria-label="t(\'desk.onboarding.hotel_name_label\'');
    const helper = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-helper');
    expect(helper).toContain('font-size: 14px');
    expect(helper).toContain('color: #4B5D5B');
    // Steps 2–4 carry no board counterpart (Refs #542): fieldsets render
    // borderless in the card rhythm with quiet group titles.
    const group = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-group');
    expect(group).toContain('border: 0');
    expect(group).toContain('gap: 10px');
    const groupTitle = ruleBody(
      '#shell [data-testid="onboarding-view"] .onboarding-group-title',
    );
    expect(groupTitle).toContain('font-size: 14px');
    expect(onboardingViewSource).toContain('class="onboarding-helper"');
    expect(onboardingViewSource).toContain('class="onboarding-group"');
    expect(onboardingViewSource).toContain('class="onboarding-group-title"');
    expect(onboardingViewSource).toContain('class="onboarding-row"');
    expect(onboardingViewSource).not.toContain('<br');
  });

  it('renders the full-width primary continue with the secondary Back from step 2', () => {
    const actions = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-actions');
    expect(actions).toContain('display: flex');
    expect(actions).toContain('flex-direction: column');
    expect(actions).toContain('gap: 10px');
    const action = ruleBody(
      '#shell [data-testid="onboarding-view"] .onboarding-action.p-button',
    );
    expect(action).toContain('min-height: 44px');
    expect(action).toContain('padding: 0 18px');
    expect(action).toContain('border-radius: 8px');
    expect(action).toContain('border: 0');
    expect(action).toContain('background: #0F766E');
    expect(action).toContain('color: #FFFFFF');
    expect(action).toContain('font-weight: 600');
    expect(action).toContain('width: 100%');
    // Back renders from step 2 on (the drawn step shows a
    // single button) with its secondary logic-carrier styling
    // (Stay #521 dialog-cancel precedent); only the target is pinned.
    const back = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-back.p-button');
    expect(back).toContain('min-height: 44px');
    expect(onboardingViewSource).toContain('class="onboarding-actions"');
    expect(onboardingViewSource).toContain('class="onboarding-action"');
    expect(onboardingViewSource).toContain('class="onboarding-back"');
    const backCount = onboardingViewSource.match(/data-testid="onboarding-back"/g) ?? [];
    // Steps 2–4 carry the Back hook; step 1 carries none.
    expect(backCount).toHaveLength(3);
  });

  it('audits the onboarding-surface 44px targets (R9 onboarding-surface half)', () => {
    // Every interactive element on the Onboarding surface presents
    // at least a 44px hit target: the advance/remove/add/retry
    // buttons, Back, and every form input.
    const action = ruleBody(
      '#shell [data-testid="onboarding-view"] .onboarding-action.p-button',
    );
    expect(action).toContain('min-height: 44px');
    const back = ruleBody('#shell [data-testid="onboarding-view"] .onboarding-back.p-button');
    expect(back).toContain('min-height: 44px');
    const controls = combinedRuleBody('#shell [data-testid="onboarding-view"] label input,');
    expect(controls).toContain('min-height: 44px');
  });

  it('pins no per-surface token forks on the Onboarding surface (R9 no-fork half)', () => {
    // Every colour the Onboarding rules render resolves through
    // `app/src/theme/tokens.ts`: collect the token palette and
    // require each Onboarding hex to be a member.
    const palette = new Set<string>([
      ...Object.values(deskTokens.colors),
      ...Object.values(deskTokens.shell).filter((value) => typeof value === 'string'),
    ]);
    const onboardingCss = appSource.slice(
      appSource.indexOf('Onboarding wizard (Refs #542'),
      appSource.indexOf('Native controls stay native'),
    );
    expect(onboardingCss.length).toBeGreaterThan(0);
    for (const raw of onboardingCss.match(/#[0-9A-Fa-f]{6}\b/g) ?? []) {
      const upper = raw.toUpperCase();
      const hit = [...palette].some((token) => token.toUpperCase() === upper);
      expect(hit, `Onboarding colour ${raw} forks no token`).toBe(true);
    }
  });

  it('keeps the Onboarding restyle out of print', () => {
    expect(printSource).not.toContain('onboarding-');
    // The onboarding rules live inside the screen-only stylesheet
    // (the whole App.vue style block sits under `@media screen`,
    // so no screen rule can leak into print).
    expect(appSource.indexOf('@media screen')).toBeGreaterThanOrEqual(0);
    expect(appSource.indexOf('@media screen')).toBeLessThan(
      appSource.indexOf('Onboarding wizard (Refs #542'),
    );
  });
});

describe('R9 seven-surface rollup (Refs #542, last child PR)', () => {
  it('holds the 44px touch target on every interactive element of all seven surfaces', () => {
    // Shell/nav (#518): tabs and locale-pill buttons.
    expect(ruleBody('#shell .shell-nav-item')).toContain('min-height: 44px');
    expect(ruleBody('#shell .shell-locale .p-button')).toContain('min-height: 44px');
    // Main desk board (#519): refresh and housekeeping actions.
    expect(
      combinedRuleBody('#shell [data-testid="desk-view"] .desk-refresh.p-button,'),
    ).toContain('min-height: 44px');
    // Book (#520), Stay (#521), Folio (#522), Rooms (#523):
    // primary actions.
    for (const surface of ['book', 'stay', 'folio', 'rooms', 'onboarding'] as const) {
      const action = ruleBody(
        `#shell [data-testid="${surface}-view"] .${surface}-action.p-button`,
      );
      expect(action, `${surface} primary action`).toContain('min-height: 44px');
    }
    // Onboarding wizard navigation (Refs #542): Back (steps 2–4) plus every input.
    expect(ruleBody('#shell [data-testid="onboarding-view"] .onboarding-back.p-button')).toContain(
      'min-height: 44px',
    );
    expect(
      combinedRuleBody('#shell [data-testid="onboarding-view"] label input,'),
    ).toContain('min-height: 44px');
  });

  it('resolves every rendered screen colour through the shared tokens with zero forks', () => {
    // Whole `@media screen` block (all seven surfaces, one scan):
    // every 6-digit hex must be a token member. The palette spans
    // `colors` plus the string-valued `shell` entries (the header
    // locale-label mint lives there, Refs #455).
    const palette = new Set<string>([
      ...Object.values(deskTokens.colors),
      ...Object.values(deskTokens.shell).filter((value) => typeof value === 'string'),
    ]);
    const screenCss = appSource.slice(
      appSource.indexOf('@media screen'),
      appSource.indexOf('</style>'),
    );
    expect(screenCss.length).toBeGreaterThan(0);
    for (const raw of screenCss.match(/#[0-9A-Fa-f]{6}\b/g) ?? []) {
      const upper = raw.toUpperCase();
      const hit = [...palette].some((token) => token.toUpperCase() === upper);
      expect(hit, `screen colour ${raw} forks no token`).toBe(true);
    }
  });
});
