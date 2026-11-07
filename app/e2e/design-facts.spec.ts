// Playwright DOM-vs-design assertions and CI gate for the six covered
// desk screens (Closes #467; the seventh v2 board, Admin, is deferred
// — no app screen yet, Refs #546, Refs #549).
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
//   covered screens, a matching app-like DOM built from that screen's
//   real design record passes with zero diffs. The DOM renders in live
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
//   seven-tab visible set, per-screen active tab) plus the decided
//   per-screen content from issue #473 (exact heading/input sequences
//   for Stay and Book; Rooms pins its static heading prefix plus the
//   seed room labels and checks the data-driven tail structurally;
//   required-button-label subsets everywhere so dynamic extras never
//   break the gate) plus the Main room-map section (Refs #479: Main
//   pins its static heading prefix through the embedded map heads
//   with the same structural tail rule and seed labels as Rooms;
//   Refs #489 pins the removed backup-report section's absence so
//   its return fails the gate; Refs #490 pins the three Main
//   stay-table header orders plus the empty-state wording with one
//   structural cell-per-header rule per data row) plus the Main
//   room-map section (Refs #491: the five status chips in decided
//   order with counts equal to their cards, floor-group titles, and
//   one card per room carrying number, chip, type, and note lines).
//   Full-record live parity stays deferred for the data-driven and flow-state panels the
//   decision excludes (stay list rows, room-card bodies, approval,
//   dialogs, quote/result/confirmation): the fixture tests above
//   prove the gate catches every one of those drift classes with
//   proper diffs. Refs #472 resolved
//   the nav drift the other way: the shell visible set is exactly
//   the seven v2 design header tabs (onboarding is the tab-less
//   deep route), so the live tests pin that decided set.
// - Lab-state matrix (issue #474): the CI lab runs on a configured
//   database (the e2e job applies `deploy/config/hotel.json` with a
//   real hotel name), so `/onboarding` would redirect to `/` and one
//   lab state cannot render all 6 screens. Five screens run against
//   the real configured stack; Onboarding renders through a targeted
//   `page.route` mock of `POST /v1/admin/GetHotelConfig` answering
//   unconfigured (`{ values: { name: '' } }`) — both redirect readers
//   (the shell auto-launch in `app/src/App.vue` and the wizard guard
//   in `app/src/views/OnboardingView.vue`, both via
//   `configuredHotelName` in `app/src/onboardingGate.ts`) consult
//   that one endpoint, so the single mock covers both while every
//   other API call still reaches the real lab stack. Product redirect
//   behavior is untouched. No-silent-skip rule: the Onboarding live
//   test asserts the mock was actually consulted and the URL is still
//   `/app/onboarding` after navigation, so a redirect regression
//   fails loudly naming the redirect instead of timing out on the
//   view hook. Future redirect-gated screens follow the same pattern:
//   add the screen to this matrix with a route mock for the gating
//   read, keep the product redirect as-is, and assert the gating read
//   plus the final URL.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  buildMatchingDom,
  collectAppFacts,
  collectRoomMapFacts,
  collectTableFacts,
  DECIDED_CONTENT,
  diffFactRecords,
  diffRoomMapFacts,
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

test.describe('matching app DOM passes for all 6 covered desk screens (criterion 1)', () => {
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

test.describe('stay-table facts extract from matching table DOM (Refs #490)', () => {
  let guard!: LoopbackGuard;

  test.beforeEach(async ({ page }) => {
    guard = installLoopbackGuard(page);
  });

  test.afterEach(() => {
    guard.assertClean();
  });

  const ARRIVALS_BODY =
    '<table data-testid="desk-arrivals-table">' +
    '<thead><tr><th>Khách</th><th>Hạng phòng</th></tr></thead>' +
    '<tbody>' +
    '<tr><td>Nguyễn Văn An · ABC123</td><td>Phòng đôi</td></tr>' +
    '<tr><td>Trần Thị Bình · XYZ456</td><td>Phòng đơn</td></tr>' +
    '</tbody></table>';

  async function extractTable(page: Page, body: string, testId: string) {
    await page.setContent(
      `<!doctype html><html lang="vi"><head><meta charset="utf-8"></head><body>${body}</body></html>`,
    );
    return page.evaluate(collectTableFacts, testId);
  }

  test('data rows extract headers plus one cell array per row', async ({ page }) => {
    const facts = await extractTable(page, ARRIVALS_BODY, 'desk-arrivals-table');
    expect(facts.headers).toEqual(['Khách', 'Hạng phòng']);
    expect(facts.rows).toEqual([
      ['Nguyễn Văn An · ABC123', 'Phòng đôi'],
      ['Trần Thị Bình · XYZ456', 'Phòng đơn'],
    ]);
    expect(facts.empty).toBeNull();
  });

  test('empty table extracts the empty message with zero rows', async ({ page }) => {
    const facts = await extractTable(
      page,
      '<table data-testid="desk-departures-table">' +
        '<thead><tr><th>Khách</th><th>Hạng phòng</th></tr></thead>' +
        '<tbody><tr><td colspan="2">Hôm nay chưa có khách trả phòng.</td></tr></tbody></table>',
      'desk-departures-table',
    );
    expect(facts.headers).toEqual(['Khách', 'Hạng phòng']);
    expect(facts.rows).toEqual([]);
    expect(facts.empty).toBe('Hôm nay chưa có khách trả phòng.');
  });

  test('a ragged row fails loudly instead of passing silently', async ({ page }) => {
    await page.setContent(
      '<!doctype html><html lang="vi"><head><meta charset="utf-8"></head><body>' +
        '<table data-testid="desk-inhouse-table">' +
        '<thead><tr><th>Khách</th><th>Trả phòng</th></tr></thead>' +
        '<tbody><tr><td>Lê Minh</td><td>P.201</td><td>đến 30/10</td></tr></tbody></table>' +
        '</body></html>',
    );
    await expect(page.evaluate(collectTableFacts, 'desk-inhouse-table')).rejects.toThrow(
      /3-cell row against 2 headers/,
    );
  });
});

test.describe('room-map facts extract from matching grid DOM (Refs #491)', () => {
  let guard!: LoopbackGuard;

  test.beforeEach(async ({ page }) => {
    guard = installLoopbackGuard(page);
  });

  test.afterEach(() => {
    guard.assertClean();
  });

  // The five catalogue chips in status order, one floor group, and
  // one card per room carrying number, status chip, type line, and
  // note line — the decided Main room-map shape.
  const GRID_BODY =
    '<main data-testid="desk-roommap">' +
    '<section data-testid="desk-roommap-summary"><h2>Phòng theo trạng thái</h2><ul>' +
    '<li data-testid="desk-roommap-chip-ready"><span>Sẵn sàng (đã kiểm tra)</span> (1)</li>' +
    '<li data-testid="desk-roommap-chip-occupied"><span>Đang có khách</span> (1)</li>' +
    '<li data-testid="desk-roommap-chip-needs-cleaning"><span>Phòng bẩn</span> (1)</li>' +
    '<li data-testid="desk-roommap-chip-awaiting-inspection"><span>Sạch, chờ kiểm tra</span> (0)</li>' +
    '<li data-testid="desk-roommap-chip-out-of-service"><span>Ngưng bán</span> (0)</li>' +
    '</ul></section>' +
    '<section data-testid="desk-roommap-floor"><h2>Tầng 1</h2>' +
    '<div class="rooms-grid">' +
    '<div data-testid="desk-roommap-room-101"><h3>101</h3>' +
    '<span data-testid="desk-roommap-card-chip-101">Phòng bẩn</span>' +
    '<span data-testid="desk-roommap-card-type-101">Đơn</span>' +
    '<span data-testid="desk-roommap-card-note-101">Cần dọn phòng.</span></div>' +
    '<div data-testid="desk-roommap-room-201"><h3>201</h3>' +
    '<span data-testid="desk-roommap-card-chip-201">Đang có khách</span>' +
    '<span data-testid="desk-roommap-card-type-201">Đôi</span>' +
    '<span data-testid="desk-roommap-card-note-201">Lê Minh · Trả phòng 30/10</span></div>' +
    '<div data-testid="desk-roommap-room-301"><h3>301</h3>' +
    '<span data-testid="desk-roommap-card-chip-301">Sẵn sàng (đã kiểm tra)</span>' +
    '<span data-testid="desk-roommap-card-type-301">Đôi</span>' +
    '<span data-testid="desk-roommap-card-note-301">Trống, sẵn sàng</span></div>' +
    '</div></section></main>';

  function decidedRoomMap() {
    const decided = DECIDED_CONTENT.find((candidate) => candidate.screen === 'Main')?.roomMap;
    if (!decided) throw new Error('design-facts: no decided room map for Main');
    return decided;
  }

  async function extractMap(page: Page, body: string) {
    await page.setContent(
      `<!doctype html><html lang="vi"><head><meta charset="utf-8"></head><body>${body}</body></html>`,
    );
    return page.evaluate(collectRoomMapFacts);
  }

  test('extracts chips, floors, and cards from a matching grid', async ({ page }) => {
    const facts = await extractMap(page, GRID_BODY);
    expect(facts.chips).toEqual([
      { label: 'Sẵn sàng (đã kiểm tra)', count: 1 },
      { label: 'Đang có khách', count: 1 },
      { label: 'Phòng bẩn', count: 1 },
      { label: 'Sạch, chờ kiểm tra', count: 0 },
      { label: 'Ngưng bán', count: 0 },
    ]);
    expect(facts.floors).toEqual(['Tầng 1']);
    expect(facts.cards).toEqual([
      { number: '101', chip: 'Phòng bẩn', type: 'Đơn', note: 'Cần dọn phòng.' },
      { number: '201', chip: 'Đang có khách', type: 'Đôi', note: 'Lê Minh · Trả phòng 30/10' },
      { number: '301', chip: 'Sẵn sàng (đã kiểm tra)', type: 'Đôi', note: 'Trống, sẵn sàng' },
    ]);
  });

  test('matching room-map facts produce zero diffs', async ({ page }) => {
    const facts = await extractMap(page, GRID_BODY);
    expect(diffRoomMapFacts('Main', decidedRoomMap(), facts, '[data-testid="desk-roommap"]')).toEqual([]);
  });

  test('a count that disagrees with its cards fails with a diff', async ({ page }) => {
    const facts = await extractMap(
      page,
      GRID_BODY.replace(
        '<li data-testid="desk-roommap-chip-needs-cleaning"><span>Phòng bẩn</span> (1)</li>',
        '<li data-testid="desk-roommap-chip-needs-cleaning"><span>Phòng bẩn</span> (2)</li>',
      ),
    );
    const diffs = diffRoomMapFacts('Main', decidedRoomMap(), facts, '[data-testid="desk-roommap"]');
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('roomMap.chips[2].count');
    expect(diffs[0].expected).toBe('1');
    expect(diffs[0].actual).toBe('2');
    expect(diffs[0].design).toBe('docs/design/Rooms.dc.html:2');
    expect(diffs[0].app).toBe('[data-testid="desk-roommap"]-summary li');
  });

  test('a card with a blank note line fails with a diff', async ({ page }) => {
    const facts = await extractMap(
      page,
      GRID_BODY.replace(
        '<span data-testid="desk-roommap-card-note-101">Cần dọn phòng.</span>',
        '<span data-testid="desk-roommap-card-note-101"></span>',
      ),
    );
    const diffs = diffRoomMapFacts('Main', decidedRoomMap(), facts, '[data-testid="desk-roommap"]');
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('roomMap.cards[0].note');
    expect(diffs[0].design).toBe('docs/design/Rooms.dc.html:2');
  });

  test('a chip with no trailing count fails loudly instead of passing silently', async ({ page }) => {
    await page.setContent(
      '<!doctype html><html lang="vi"><head><meta charset="utf-8"></head><body>' +
        '<main data-testid="desk-roommap">' +
        '<section data-testid="desk-roommap-summary"><h2>Phòng theo trạng thái</h2><ul>' +
        '<li data-testid="desk-roommap-chip-ready"><span>Sẵn sàng (đã kiểm tra)</span></li>' +
        '</ul></section></main></body></html>',
    );
    await expect(page.evaluate(collectRoomMapFacts)).rejects.toThrow(/no trailing count/);
  });

  test('a room map with no floor groups fails with a diff', async ({ page }) => {
    const facts = await extractMap(
      page,
      '<main data-testid="desk-roommap">' +
        '<section data-testid="desk-roommap-summary"><h2>Phòng theo trạng thái</h2><ul>' +
        '<li data-testid="desk-roommap-chip-ready"><span>Sẵn sàng (đã kiểm tra)</span> (0)</li>' +
        '<li data-testid="desk-roommap-chip-occupied"><span>Đang có khách</span> (0)</li>' +
        '<li data-testid="desk-roommap-chip-needs-cleaning"><span>Phòng bẩn</span> (0)</li>' +
        '<li data-testid="desk-roommap-chip-awaiting-inspection"><span>Sạch, chờ kiểm tra</span> (0)</li>' +
        '<li data-testid="desk-roommap-chip-out-of-service"><span>Ngưng bán</span> (0)</li>' +
        '</ul></section></main>',
    );
    expect(facts.floors).toEqual([]);
    const diffs = diffRoomMapFacts('Main', decidedRoomMap(), facts, '[data-testid="desk-roommap"]');
    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('roomMap.floors');
    expect(diffs[0].actual).toBe('"(absent)"');
    expect(diffs[0].design).toBe('docs/design/Rooms.dc.html:2');
  });
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
    // v2 Stay board carries no placeholder-bearing input (bundle
    // 07-11 re-pin: Stay extracts exactly [[text, Người duyệt,
    // null]] — `tests/design-facts/extract-design-facts.test.mjs`),
    // so the placeholder-mismatch fixture uses the Onboarding
    // record, the one v2 screen with a placeholder input (a text
    // field, hence the attribute — not first-option — mutation).
    const record = recordFor('Onboarding');
    const index = record.inputs.findIndex((input) => input.placeholder !== null);
    expect(index).toBeGreaterThanOrEqual(0);
    const placeholder = record.inputs[index].placeholder as string;
    const dom = buildMatchingDom(record, 'onboarding-view').replace(
      `placeholder="${placeholder}"`,
      `placeholder="${placeholder} khác"`,
    );
    const actual = await extractFromDom(page, 'onboarding-view', dom);
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
      // Lab-state matrix (issue #474, see the header): the wizard
      // renders on an unconfigured database only. Mock just the
      // hotel-config read as unconfigured so the wizard renders;
      // every other API call reaches the real lab stack. The hit
      // counter below proves the mock was consulted (no vacuous
      // pass); product redirect behavior is untouched.
      let configReads = 0;
      if (entry.screen === 'Onboarding') {
        await page.route('**/v1/admin/GetHotelConfig', (route) => {
          configReads += 1;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ values: { name: '' } }),
          });
        });
      }
      await signInVi(page);
      await page.goto(entry.route === '/' ? '/app/' : `/app${entry.route}`);
      if (entry.screen === 'Onboarding') {
        // No screen silently skipped by the onboarding redirect: the
        // config mock must have been consulted and the URL must still
        // be the wizard route — a redirect regression fails here
        // naming the redirect, not as a view-hook timeout.
        expect(
          configReads,
          'onboarding gate never read GetHotelConfig: the unconfigured mock may be bypassed, so wizard coverage is unproven',
        ).toBeGreaterThan(0);
        expect(
          page.url(),
          'onboarding redirect fired on the configured lab DB: /app/onboarding did not survive navigation',
        ).toContain('/app/onboarding');
      }
      await expect(page.getByTestId(entry.viewHook)).toBeVisible();
      if (entry.screen === 'Rooms') {
        // The floor map renders only after its reads complete
        // (loading flag); the summary section is the positive
        // signal the decided content is on screen. A broken map
        // fails here loudly instead of extracting a half-empty DOM.
        await expect(page.getByTestId('rooms-summary')).toBeVisible();
      }
      if (entry.screen === 'Main') {
        // The embedded room map (Refs #479) renders only after the
        // dashboard reads complete; its section root is the positive
        // signal the decided map content is on screen.
        await expect(page.getByTestId('desk-roommap')).toBeVisible();
        // Refs #489: the legacy backup-report section has no design
        // counterpart and stays removed — its return fails here.
        await expect(page.getByTestId('desk-backup')).toHaveCount(0);
      }
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

      // Design-anchored tokens that conform today. Refs #502: the
      // semantic primary 500 step now carries the design token, so
      // `tokens.primary` (the first-button computed fill) conforms
      // alongside header/page/ink — no computed surface keeps the
      // PrimeVue default `#279086`. The token-color mismatch test
      // above still proves the gate catches drift.
      for (const key of ['header', 'primary', 'page', 'ink'] as const) {
        check(`tokens.${key}`, record.tokens[key], actual.tokens[key], record.designFile, '[data-testid="shell-nav"]');
      }

      // Labels of the tabs that exist on both sides. Refs #539:
      // the visible shell nav is exactly the seven design header
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
      // every screen, so the Main record anchors all six covered screens.
      const designToRoute = Object.fromEntries(
        Object.entries(ROUTE_KEY_TO_DESIGN_KEY).map(([routeKey, designKey]) => [designKey, routeKey]),
      );
      const mainRecord = recordFor('Main');
      const expectedOrder = mainRecord.nav.order.map((designKey) => designToRoute[designKey]);
      check('nav.order', expectedOrder, actual.nav.order, mainRecord.nav.design, mainRecord.nav.app);

      // The active pill sits on the current screen's tab; where the
      // design names an active tab for this screen, the mapped live
      // tab matches it. Onboarding has no visible tab (Refs #539):
      // it renders with no active pill while staying reachable as
      // a deep route.
      const TAB_LESS_SCREENS = new Set(['Onboarding']);
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
      if (record.nav.active !== '' && ['Main', 'Stay', 'Book', 'Rooms', 'Folio'].includes(entry.screen)) {
        check(
          'nav.active',
          record.nav.active,
          ROUTE_KEY_TO_DESIGN_KEY[actual.nav.active] ?? actual.nav.active,
          record.nav.design,
          `${record.nav.app} .shell-nav-active`,
        );
      }

      // Decided per-screen content (issue #473, extend-the-design):
      // exact heading/input sequences plus required button labels.
      // Buttons stay a subset check because the live DOM
      // legitimately renders extras (per-row pick buttons, dialog
      // confirmations); data-driven and flow-state panels stay out
      // (see DECIDED_CONTENT) and remain covered by their flow specs.
      const decided = DECIDED_CONTENT.find((candidate) => candidate.screen === entry.screen);
      if (decided !== undefined) {
        const contentApp = `[data-testid="${entry.viewHook}"]`;
        const expectedHeadings = decided.headingPrefix ?? decided.headings;
        const prefixLength = decided.headingPrefix !== undefined ? decided.headingPrefix.length : expectedHeadings.length;
        const headingCount = Math.max(expectedHeadings.length, actual.headings.length);
        for (let index = 0; index < headingCount; index += 1) {
          // A prefix-pinned screen (Rooms) checks the data-driven
          // tail structurally below; exact per-index checks cover
          // the static prefix only.
          if (decided.headingPrefix !== undefined && index >= decided.headingPrefix.length) break;
          const expected = expectedHeadings[index];
          const observed = actual.headings[index];
          check(
            `headings[${index}].level`,
            expected?.level ?? '(absent)',
            observed?.level ?? '(absent)',
            record.designFile,
            `${contentApp} h1`,
          );
          check(
            `headings[${index}].text`,
            expected?.text ?? '(absent)',
            observed?.text ?? '(absent)',
            record.designFile,
            `${contentApp} h1`,
          );
        }
        if (decided.headingPrefix !== undefined) {
          const tail = actual.headings.slice(prefixLength);
          const roomLabels = tail.filter((heading) => heading.level === 3).map((heading) => heading.text);
          tail.forEach((heading, offset) => {
            const index = prefixLength + offset;
            if (heading.level === 2) {
              const floorTitle = /^Tầng \S+$/.test(heading.text) || heading.text === 'Phòng chưa xếp tầng';
              if (!floorTitle) {
                failures.push({
                  screen: entry.screen,
                  field: `headings[${index}].text`,
                  expected: 'a floor title ("Tầng <n>") or "Phòng chưa xếp tầng"',
                  actual: JSON.stringify(heading.text),
                  design: record.designFile,
                  app: `${contentApp} h2`,
                });
              }
            } else if (heading.level === 3) {
              if (heading.text === '') {
                failures.push({
                  screen: entry.screen,
                  field: `headings[${index}].text`,
                  expected: 'a non-empty room label',
                  actual: JSON.stringify(heading.text),
                  design: record.designFile,
                  app: `${contentApp} h3`,
                });
              }
            } else {
              failures.push({
                screen: entry.screen,
                field: `headings[${index}].level`,
                expected: '2 or 3',
                actual: JSON.stringify(heading.level),
                design: record.designFile,
                app: `${contentApp} h1`,
              });
            }
          });
          for (const label of decided.requiredRoomLabels ?? []) {
            if (!roomLabels.includes(label)) {
              failures.push({
                screen: entry.screen,
                field: `headings[room=${label}]`,
                expected: JSON.stringify(label),
                actual: '(absent)',
                design: record.designFile,
                app: `${contentApp} h3`,
              });
            }
          }
        }
        for (const label of decided.buttons) {
          const found = actual.buttons.some((button) => button.label === label);
          if (!found) {
            failures.push({
              screen: entry.screen,
              field: `buttons[label=${label}]`,
              expected: JSON.stringify(label),
              actual: '(absent)',
              design: record.designFile,
              app: `${contentApp} button`,
            });
          }
        }
        const inputCount = Math.max(decided.inputs.length, actual.inputs.length);
        for (let index = 0; index < inputCount; index += 1) {
          const expected = decided.inputs[index];
          const observed = actual.inputs[index];
          check(
            `inputs[${index}].kind`,
            expected?.kind ?? '(absent)',
            observed?.kind ?? '(absent)',
            record.designFile,
            `${contentApp} input`,
          );
          check(
            `inputs[${index}].label`,
            expected?.label ?? '(absent)',
            observed?.label ?? '(absent)',
            record.designFile,
            `${contentApp} input`,
          );
          check(
            `inputs[${index}].placeholder`,
            expected?.placeholder ?? null,
            observed?.placeholder ?? null,
            record.designFile,
            `${contentApp} input`,
          );
        }
        // Decided table shapes (Refs #490, Main only): exact header
        // order per table, one cell per header on every data row,
        // and the exact empty-state wording whenever a table renders
        // no data rows. Row copy stays out (dynamic data per schema
        // section 5; the Vitest suite pins the content shapes).
        for (const table of decided.tables ?? []) {
          const tableApp = `[data-testid="${table.testId}"]`;
          const observed = await page.evaluate(collectTableFacts, table.testId);
          check(
            `tables[${table.testId}].headers`,
            table.headers,
            observed.headers,
            table.design,
            `${tableApp} thead th`,
          );
          for (const [index, row] of observed.rows.entries()) {
            check(
              `tables[${table.testId}].rows[${index}].cells`,
              table.headers.length,
              row.length,
              table.design,
              `${tableApp} tbody tr`,
            );
          }
          if (observed.rows.length === 0) {
            check(
              `tables[${table.testId}].empty`,
              table.empty,
              observed.empty ?? '(absent)',
              table.emptyDesign,
              `${tableApp} tbody tr`,
            );
          }
        }
        // Decided room-map shapes (Refs #491, Main only): the five
        // status chips in decided order with counts equal to their
        // cards, floor-group titles, and one card per room carrying
        // its number, status chip, type line, and note line — the
        // design Rooms board (`docs/design/Rooms.dc.html`).
        if (decided.roomMap !== undefined) {
          const roomMapApp = '[data-testid="desk-roommap"]';
          const observedMap = await page.evaluate(collectRoomMapFacts);
          for (const diff of diffRoomMapFacts(entry.screen, decided.roomMap, observedMap, roomMapApp)) {
            failures.push(diff);
          }
        }
      }

      expect(
        failures,
        failures.length > 0 ? `live conformance diffs:\n${formatFactDiffs(failures)}` : 'live conformance diffs',
      ).toEqual([]);
    });
  }
});
