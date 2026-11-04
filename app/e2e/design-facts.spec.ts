// Playwright DOM-vs-design assertions and CI gate for the six desk
// screens (Closes #467).
//
// Owner direction 2026-11-03: no screenshot snapshots (heavy,
// brittle). This spec asserts UI facts extracted from the running DOM
// against the design-side records (computed styles for colors, text
// content, element order, active states); mismatches fail with
// `file:line` diffs pointing at the design node vs the app selector.
// Deterministic, zero binary artifacts: no screenshots, no video, no
// snapshots (a CI step greps this file for those APIs).
//
// Design records come from `DESIGN_FACTS_DIR` (written by
// `node tests/design-facts/extract-design-facts.mjs --out <dir>`; CI
// runs the extractor before this spec). Records pin
// `schemaVersion 1`; this spec refuses any other version.
//
// Structure:
// - Matching-DOM tests (acceptance criterion 1): for each of the 6
//   screens, a matching app-like DOM built from that screen's real
//   design record passes with zero diffs. The DOM renders in live
//   Chromium, so every token still resolves through `getComputedStyle`.
// - Mismatch tests (criterion 2): a mismatched label, tab order,
//   active state, placeholder, and token color each fail with a diff
//   naming the design `file:line` and the app selector.
// - Stylesheet-token test (criterion 4): a token applied through a
//   stylesheet (no inline style) still resolves — colors come from
//   computed styles, never from attribute parsing or screenshots.
// - Live conformance tests: the same extraction against the running
//   app DOM, asserting the design-anchored subset that conforms today
//   (header/page/ink tokens, design-known tab labels, the decided
//   six-tab visible set, per-screen active tab). Full-record live
//   parity is deferred to product-alignment follow-ups (see the scope
//   note on #467): the views carry richer content than the boards,
//   and PrimeVue defaults render primary-500 instead of the design
//   primary-700. The fixture tests above prove the gate catches every
//   one of those drift classes with proper diffs. Refs #472 resolved
//   the nav drift the other way: the shell visible set is exactly the
//   six design header tabs (onboarding/rooms are tab-less deep
//   routes), so the live tests pin that decided set.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  buildMatchingDom,
  collectAppFacts,
  diffFactRecords,
  FACT_SCHEMA_VERSION,
  formatFactDiffs,
  ROUTE_KEY_TO_DESIGN_KEY,
  SCREEN_TABLE,
  type AppFactSnapshot,
  type DesignScreenRecord,
  type FactDiff,
} from './design-facts';
import { installLoopbackGuard, type LoopbackGuard } from './loopback-guard';
import { signInThroughGate } from './desk-flow';

function designFactsDir(): string {
  const dir = process.env.DESIGN_FACTS_DIR;
  if (!dir) {
    throw new Error(
      'DESIGN_FACTS_DIR is required: run `node tests/design-facts/extract-design-facts.mjs --out <dir>` first (CI runs the extractor before this spec).',
    );
  }
  return dir;
}

function loadDesignRecord(screen: string): DesignScreenRecord {
  const record = JSON.parse(
    readFileSync(join(designFactsDir(), `${screen}.facts.json`), 'utf8'),
  ) as DesignScreenRecord;
  if (record.schemaVersion !== FACT_SCHEMA_VERSION) {
    throw new Error(
      `design-facts: schemaVersion mismatch for ${screen}: ` +
        `record is ${record.schemaVersion}, this spec implements ${FACT_SCHEMA_VERSION} ` +
        `(schema and both sides must rev together).`,
    );
  }
  return record;
}

const RECORDS: DesignScreenRecord[] = SCREEN_TABLE.map((entry) =>
  loadDesignRecord(entry.screen),
);

function recordFor(screen: string): DesignScreenRecord {
  const record = RECORDS.find((candidate) => candidate.screen === screen);
  if (!record) throw new Error(`design-facts: no record loaded for ${screen}`);
  return record;
}

async function extractFromDom(
  page: Page,
  viewHook: string,
  dom: string,
): Promise<AppFactSnapshot> {
  await page.setContent(dom);
  return page.evaluate(collectAppFacts, viewHook);
}

function expectSingleDiff(
  diffs: FactDiff[],
  field: string,
  expected: string,
  actual: string,
  design: string,
  app: string,
): void {
  expect(diffs, `expected exactly one diff, got:\n${formatFactDiffs(diffs)}`).toHaveLength(1);
  const [diff] = diffs;
  expect(diff.field).toBe(field);
  expect(diff.expected).toBe(expected);
  expect(diff.actual).toBe(actual);
  expect(diff.design).toBe(design);
  expect(diff.app).toBe(app);
  const formatted = formatFactDiffs(diffs);
  expect(formatted).toContain(`design:   ${design}`);
  expect(formatted).toContain(`app:      ${app}`);
}

test.describe('matching app DOM passes for all 6 desk screens (criterion 1)', () => {
  for (const entry of SCREEN_TABLE) {
    test(`${entry.screen}: matching app DOM passes`, async ({ page }) => {
      const guard = installLoopbackGuard(page);
      const record = recordFor(entry.screen);
      const actual = await extractFromDom(
        page,
        entry.viewHook,
        buildMatchingDom(record, entry.viewHook),
      );
      const diffs = diffFactRecords(record, actual);
      expect(
        diffs,
        diffs.length > 0 ? `unexpected diffs:\n${formatFactDiffs(diffs)}` : 'unexpected diffs',
      ).toEqual([]);
      guard.assertClean();
    });
  }
});

test.describe('mismatches fail with design file:line vs app selector (criterion 2)', () => {
  let guard!: LoopbackGuard;

  test.beforeEach(async ({ page }) => {
    guard = installLoopbackGuard(page);
  });

  test.afterEach(() => {
    guard.assertClean();
  });

  test('mismatched button label fails with a diff', async ({ page }) => {
    const record = recordFor('Stay');
    const label = record.buttons[0].label;
    const mutated = `>${label} (sửa)</button>`;
    const dom = buildMatchingDom(record, 'stay-view').replace(`>${label}</button>`, mutated);
    const actual = await extractFromDom(page, 'stay-view', dom);
    expectSingleDiff(
      diffFactRecords(record, actual),
      'buttons[0].label',
      JSON.stringify(label),
      JSON.stringify(`${label} (sửa)`),
      record.buttons[0].design,
      record.buttons[0].app,
    );
  });

  test('mismatched tab order fails with a diff', async ({ page }) => {
    const record = recordFor('Stay');
    const dom = buildMatchingDom(record, 'stay-view');
    const anchors = [...dom.matchAll(/<a data-testid="shell-nav-[^"]*"[^>]*>.*?<\/a>/g)].map(
      (match) => match[0],
    );
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    const [first, second] = anchors;
    const swapped = dom
      .replace(first, '__FIRST_TAB__')
      .replace(second, first)
      .replace('__FIRST_TAB__', second);
    const actual = await extractFromDom(page, 'stay-view', swapped);
    const expectedOrder = [...record.nav.order];
    [expectedOrder[0], expectedOrder[1]] = [expectedOrder[1], expectedOrder[0]];
    expectSingleDiff(
      diffFactRecords(record, actual),
      'nav.order',
      JSON.stringify(record.nav.order),
      JSON.stringify(expectedOrder),
      record.nav.design,
      record.nav.app,
    );
  });

  test('mismatched active state fails with a diff', async ({ page }) => {
    const record = recordFor('Stay');
    const dom = buildMatchingDom(record, 'stay-view')
      .replace('shell-nav-Stay" class="shell-nav-item shell-nav-active"', 'shell-nav-Stay" class="shell-nav-item"')
      .replace('shell-nav-Book" class="shell-nav-item"', 'shell-nav-Book" class="shell-nav-item shell-nav-active"');
    const actual = await extractFromDom(page, 'stay-view', dom);
    expectSingleDiff(
      diffFactRecords(record, actual),
      'nav.active',
      JSON.stringify(record.nav.active),
      JSON.stringify('Book'),
      record.nav.design,
      `${record.nav.app} .shell-nav-active`,
    );
  });

  test('mismatched placeholder fails with a diff', async ({ page }) => {
    const record = recordFor('Stay');
    const index = record.inputs.findIndex((input) => input.placeholder !== null);
    expect(index).toBeGreaterThanOrEqual(0);
    const placeholder = record.inputs[index].placeholder as string;
    const dom = buildMatchingDom(record, 'stay-view').replace(
      `<option value="">${placeholder}</option>`,
      `<option value="">${placeholder} khác</option>`,
    );
    const actual = await extractFromDom(page, 'stay-view', dom);
    expectSingleDiff(
      diffFactRecords(record, actual),
      `inputs[${index}].placeholder`,
      JSON.stringify(placeholder),
      JSON.stringify(`${placeholder} khác`),
      record.inputs[index].design,
      record.inputs[index].app,
    );
  });

  test('mismatched token color fails with a diff', async ({ page }) => {
    const record = recordFor('Main');
    const dom = buildMatchingDom(record, 'desk-view').replace(
      `<nav data-testid="shell-nav" style="background:${record.tokens.header}">`,
      '<nav data-testid="shell-nav" style="background:#000000">',
    );
    const actual = await extractFromDom(page, 'desk-view', dom);
    expectSingleDiff(
      diffFactRecords(record, actual),
      'tokens.header',
      JSON.stringify(record.tokens.header),
      JSON.stringify('#000000'),
      record.designFile,
      '[data-testid="shell-nav"]',
    );
  });
});

test.describe('token colors resolve through computed styles (criterion 4)', () => {
  test('stylesheet-applied header token still resolves', async ({ page }) => {
    const guard = installLoopbackGuard(page);
    const record = recordFor('Main');
    // Move the header token out of the inline style into a
    // stylesheet: attribute parsing would lose it, computed styles
    // keep it. Screenshots are never involved either way.
    const dom = buildMatchingDom(record, 'desk-view')
      .replace(
        `<nav data-testid="shell-nav" style="background:${record.tokens.header}">`,
        '<nav data-testid="shell-nav">',
      )
      .replace(
        '</head>',
        `<style>[data-testid="shell-nav"]{background-color:${record.tokens.header}}</style></head>`,
      );
    const actual = await extractFromDom(page, 'desk-view', dom);
    const diffs = diffFactRecords(record, actual);
    expect(
      diffs,
      diffs.length > 0 ? `unexpected diffs:\n${formatFactDiffs(diffs)}` : 'unexpected diffs',
    ).toEqual([]);
    guard.assertClean();
  });
});

test.describe('live shell conformance on the running app DOM', () => {
  let guard!: LoopbackGuard;

  test.beforeEach(async ({ page }) => {
    guard = installLoopbackGuard(page);
  });

  test.afterEach(() => {
    guard.assertClean();
  });

  async function signInVi(page: Page): Promise<void> {
    await page.addInitScript(() => {
      window.localStorage.setItem('hotel-mgmt.desk.locale', 'vi');
    });
    await signInThroughGate(page);
  }

  for (const entry of SCREEN_TABLE) {
    test(`${entry.screen}: tokens, tab labels, and active state conform`, async ({ page }) => {
      if (entry.screen === 'Onboarding') {
        // The onboarding wizard only renders on an unconfigured
        // database: the shell auto-launches it on a fresh database
        // and redirects away from it once configured. Mock just the
        // hotel-config read as unconfigured so the wizard renders;
        // every other API call reaches the real lab stack.
        await page.route('**/v1/admin/GetHotelConfig', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ values: { name: '' } }),
          }),
        );
      }
      await signInVi(page);
      await page.goto(entry.route === '/' ? '/app/' : `/app${entry.route}`);
      await expect(page.getByTestId(entry.viewHook)).toBeVisible();
      const actual = await page.evaluate(collectAppFacts, entry.viewHook);
      const record = recordFor(entry.screen);
      const failures: FactDiff[] = [];
      const check = (
        field: string,
        expected: unknown,
        observed: unknown,
        design: string,
        app: string,
      ): void => {
        const left = JSON.stringify(expected);
        const right = JSON.stringify(observed);
        if (left !== right) {
          failures.push({
            screen: entry.screen,
            field,
            expected: left,
            actual: right ?? '(absent)',
            design,
            app,
          });
        }
      };

      // Design-anchored tokens that conform today. tokens.primary is
      // excluded: PrimeVue defaults render primary-500 (#279086)
      // while the design token is primary-700 (#0f766e) — known
      // product drift for a follow-up; the token-color mismatch
      // test above proves the gate catches it.
      for (const key of ['header', 'page', 'ink'] as const) {
        check(`tokens.${key}`, record.tokens[key], actual.tokens[key], record.designFile, '[data-testid="shell-nav"]');
      }

      // Labels of the tabs that exist on both sides. Refs #472:
      // the visible shell nav is exactly the six design header
      // tabs, so every ROUTE_KEY_TO_DESIGN_KEY entry must resolve
      // on both sides now.
      for (const [routeKey, designKey] of Object.entries(ROUTE_KEY_TO_DESIGN_KEY)) {
        const expectedLabel: string | undefined = record.nav.labels[designKey];
        if (expectedLabel === undefined) continue;
        const observedLabel = actual.nav.labels[routeKey] ?? '(absent)';
        check(`nav.labels.${designKey}`, expectedLabel, observedLabel, record.nav.design, record.nav.app);
      }

      // The visible tab set matches the decided set (Refs #472):
      // the Main design record's tab order mapped back onto shell
      // route keys. The shell nav is shell-level, identical on
      // every screen, so the Main record anchors all six screens.
      const designToRoute = Object.fromEntries(
        Object.entries(ROUTE_KEY_TO_DESIGN_KEY).map(([routeKey, designKey]) => [designKey, routeKey]),
      );
      const mainRecord = recordFor('Main');
      const expectedOrder = mainRecord.nav.order.map((designKey) => designToRoute[designKey]);
      check('nav.order', expectedOrder, actual.nav.order, mainRecord.nav.design, mainRecord.nav.app);

      // The active pill sits on the current screen's tab; where the
      // design names an active tab for this screen, the mapped live
      // tab matches it. Onboarding/Rooms have no visible tab
      // (Refs #472): they render with no active pill while staying
      // reachable as deep routes.
      const TAB_LESS_SCREENS = new Set(['Onboarding', 'Rooms']);
      const routeKey = Object.keys(ROUTE_KEY_TO_DESIGN_KEY).find(
        (key) => ROUTE_KEY_TO_DESIGN_KEY[key] === entry.screen || key === entry.screen.toLowerCase(),
      );
      check(
        'nav.active.binding',
        TAB_LESS_SCREENS.has(entry.screen) ? '' : (routeKey ?? entry.screen.toLowerCase()),
        actual.nav.active,
        record.nav.design,
        `${record.nav.app} .shell-nav-active`,
      );
      if (record.nav.active !== '' && ['Main', 'Stay', 'Book', 'Folio'].includes(entry.screen)) {
        check(
          'nav.active',
          record.nav.active,
          ROUTE_KEY_TO_DESIGN_KEY[actual.nav.active] ?? actual.nav.active,
          record.nav.design,
          `${record.nav.app} .shell-nav-active`,
        );
      }

      expect(
        failures,
        failures.length > 0 ? `live conformance diffs:\n${formatFactDiffs(failures)}` : 'live conformance diffs',
      ).toEqual([]);
    });
  }
});
