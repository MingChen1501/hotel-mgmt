// Playwright full-tree DOM diff gate: owner design HTML vs running desk
// UI (Closes #480).
//
// Owner direction: a CI check must diff the full DOM tree between the
// owner design HTML files (`docs/design/*.dc.html`, served local) and
// the running desk UI — open both pages, extract full DOM trees (tags,
// text, computed colors/fonts/visibility/order), and diff node-by-node
// with an allowlist for owner-approved dynamic data. Text diffs only,
// deterministic, no screenshots. No product behaviour change.
//
// Structure:
// - Fixture gate tests (criteria 1-4): both pages open fixture DOMs via
//   `setContent`, the gate extracts a full tree from each live Chromium
//   page and diffs them. A matching pair passes with zero diffs; each
//   drift class (tag, exact text incl. redundant characters, color,
//   background, font, line-height, layout, visibility, order)
//   fails with a diff naming the node path. Colors resolve through
//   computed styles even when applied via stylesheet.
// - Allowlist test (criterion 3): a dynamic node whose text differs on
//   both sides passes once its path is allowlisted, while the rest of
//   the tree still diffs.
// - Determinism tests (criterion 4): the same page extracts
//   byte-identical trees twice, and the same comparison formats
//   byte-identical output twice.
// - Live extraction test (criterion 1): opens the real local design
//   file bytes and the running desk UI route for each of the seven
//   covered screens (the seventh v2 board, Admin, joined when #546
//   landed, Refs #549), waits for the bundler shell to finish rendering the board, extracts both full trees,
//   and proves the output is text-only and deterministic across
//   runs. It does NOT assert zero diffs: full structural parity stays an architecture decision
//   (Refs #495 S1, PrimeVue-first shell vs design-literal markup),
//   and owner-approved dynamic data is exempted through the
//   per-screen allowlist (Refs #495 S7, #496, #497, #498, #499; #500
//   confirms Onboarding carries no dynamic-data nodes and stays on
//   EMPTY_ALLOWLIST) — so the live run reports
//   the remaining diff count instead of gating on it.
// - No screenshots, video, or snapshots anywhere in this gate (a CI
//   guard greps the gate sources for those APIs); the lab-state matrix
//   (Onboarding redirect mock) mirrors `design-facts.spec.ts`.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import {
  collectDomTree,
  diffDomTrees,
  EMPTY_ALLOWLIST,
  formatDomDiffs,
  isAllowlisted,
  MAIN_SCREEN_ALLOWLIST,
  BOOK_SCREEN_ALLOWLIST,
  STAY_SCREEN_ALLOWLIST,
  FOLIO_SCREEN_ALLOWLIST,
  ROOMS_SCREEN_ALLOWLIST,
  serializeDomTree,
  type DomDiffAllowlist,
  type DomNode,
  unusedAllowlistEntries,
} from './dom-diff';
import { SCREEN_TABLE } from './design-facts';
import { installLoopbackGuard, type LoopbackGuard } from './loopback-guard';
import { signInThroughGate } from './desk-flow';

const SHELL_STYLE =
  'background:#ffffff;color:#111111;font-family:Arial,sans-serif;font-size:16px;font-weight:400';

function fixtureDom(body: string, head = ''): string {
  return (
    `<!doctype html><html lang="vi"><head><meta charset="utf-8">${head}</head>` +
    `<body><div id="shell" style="${SHELL_STYLE}">${body}</div></body></html>`
  );
}

const MATCHING_BODY =
  '<h1>Desk board</h1>' +
  '<p>Today: <span>static</span></p>' +
  '<button type="button" style="background:#0f766e;color:#ffffff">Refresh</button>' +
  '<button type="button" style="background:#0f766e;color:#ffffff">Reload</button>';

// Full-inventory defaults (#515): fixture-built nodes carry the same
// computed typography/layout values on both sides, so the drift
// tests below exercise only the field under test. Live-extracted
// trees always carry real computed values from `collectDomTree`.
const LAYOUT_DEFAULTS = {
  lineHeight: 'normal',
  display: 'block',
  flexDirection: 'row',
  gap: 'normal normal',
  padding: '0px 0px 0px 0px',
  margin: '0px 0px 0px 0px',
} as const;

// Opens both pages like the gate does (design source on its own page,
// app DOM on another) and extracts a full tree from each live page.
async function extractPair(
  browser: Browser,
  designHtml: string,
  appHtml: string,
): Promise<{ design: DomNode[]; actual: DomNode[] }> {
  const designPage = await browser.newPage();
  const appPage = await browser.newPage();
  try {
    await designPage.setContent(designHtml);
    await appPage.setContent(appHtml);
    const design = await designPage.evaluate(collectDomTree);
    const actual = await appPage.evaluate(collectDomTree);
    return { design, actual };
  } finally {
    await designPage.close();
    await appPage.close();
  }
}

function expectSingleFieldDiff(
  design: DomNode[],
  actual: DomNode[],
  path: string,
  field: string,
  allowlist: DomDiffAllowlist = EMPTY_ALLOWLIST,
): void {
  const diffs = diffDomTrees(design, actual, allowlist);
  expect(diffs, `expected exactly one diff, got:\n${formatDomDiffs(diffs)}`).toHaveLength(1);
  expect(diffs[0].path).toBe(path);
  expect(diffs[0].field).toBe(field);
  const formatted = formatDomDiffs(diffs);
  expect(formatted).toContain(`[${path}] ${field} mismatch`);
}

test.describe('matching fixture DOMs pass with zero diffs (criterion 1)', () => {
  test('identical trees on both pages diff clean', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY),
    );
    expect(design.length).toBeGreaterThan(0);
    const diffs = diffDomTrees(design, actual);
    expect(diffs, diffs.length > 0 ? `unexpected diffs:\n${formatDomDiffs(diffs)}` : 'unexpected diffs').toEqual([]);
  });

  test('stylesheet-applied color still resolves through computed styles', async ({ browser }) => {
    const styled = fixtureDom('<h1>Desk board</h1>', '<style>#shell h1{color:#0f4c47}</style>');
    const inline = fixtureDom('<h1 style="color:#0f4c47">Desk board</h1>');
    const { design, actual } = await extractPair(browser, styled, inline);
    const diffs = diffDomTrees(design, actual);
    expect(diffs, diffs.length > 0 ? `unexpected diffs:\n${formatDomDiffs(diffs)}` : 'unexpected diffs').toEqual([]);
  });

  test('siblings after a skipped script/style node are still extracted', async ({ page }) => {
    // Regression: the sibling loop must skip one child, not abort the
    // whole parent walk — nodes after a mid-tree script/style must
    // still appear in the tree.
    await page.setContent(
      fixtureDom(
        `${MATCHING_BODY}<script>window.__domDiffProbe = 1;</script><p>After script</p>`,
        '<style>#shell h1{color:#0f4c47}</style>',
      ),
    );
    const tree = await page.evaluate(collectDomTree);
    const paths = tree.map((node) => node.path);
    expect(paths).toContain('/html[0]/body[0]/div[0]/p[1]');
    expect(tree.every((node) => node.tag !== 'script' && node.tag !== 'style')).toBe(true);
  });
});

test.describe('each drift class fails with a path-named diff (criterion 2)', () => {
  test('text drift fails with a text diff', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<span>static</span>', '<span>changed</span>')),
    );
    expectSingleFieldDiff(design, actual, '/html[0]/body[0]/div[0]/p[0]/span[0]', 'text');
  });

  test('tag drift fails as an absent/present node pair', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<p>Today:', '<section>Today:').replace('</span></p>', '</span></section>')),
    );
    const diffs = diffDomTrees(design, actual);
    const formatted = formatDomDiffs(diffs);
    expect(formatted).toContain('[/html[0]/body[0]/div[0]/p[0]] node mismatch');
    expect(formatted).toContain('[/html[0]/body[0]/div[0]/section[0]] node mismatch');
  });

  test('color drift fails with a color diff', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('background:#0f766e', 'background:#b00020')),
    );
    expectSingleFieldDiff(design, actual, '/html[0]/body[0]/div[0]/button[0]', 'background');
  });

  test('font drift fails with a font diff', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<p>Today:', '<p style="font-size:20px;font-weight:700">Today:')),
    );
    const diffs = diffDomTrees(design, actual);
    // The span inherits the changed size/weight, so it diffs too: the
    // gate compares computed values per node, inheritance included.
    // The paragraph's UA-stylesheet margin (`1em`) resolves against
    // the font size, so the deeper box-model inventory reports the
    // resulting margin shift as well.
    expect(diffs.map((diff) => `${diff.path} ${diff.field}`).sort()).toEqual([
      '/html[0]/body[0]/div[0]/p[0] fontSize',
      '/html[0]/body[0]/div[0]/p[0] fontWeight',
      '/html[0]/body[0]/div[0]/p[0] margin',
      '/html[0]/body[0]/div[0]/p[0]/span[0] fontSize',
      '/html[0]/body[0]/div[0]/p[0]/span[0] fontWeight',
    ]);
  });

  test('redundant characters fail with an exact-text diff', async ({ browser }) => {
    // The "gate green but eyes red" class from #515: a stray
    // character the eye catches must fail the text gate.
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<h1>Desk board</h1>', '<h1>Desk board *</h1>')),
    );
    expectSingleFieldDiff(design, actual, '/html[0]/body[0]/div[0]/h1[0]', 'text');
    const diffs = diffDomTrees(design, actual);
    expect(diffs[0].expected).toBe('"Desk board"');
    expect(diffs[0].actual).toBe('"Desk board *"');
  });

  test('line-height drift fails with lineHeight diffs', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<p>Today:', '<p style="line-height:32px">Today:')),
    );
    const diffs = diffDomTrees(design, actual);
    // The span inherits the changed line-height, so it diffs too: the
    // gate compares computed values per node, inheritance included.
    expect(diffs.map((diff) => `${diff.path} ${diff.field}`).sort()).toEqual([
      '/html[0]/body[0]/div[0]/p[0] lineHeight',
      '/html[0]/body[0]/div[0]/p[0]/span[0] lineHeight',
    ]);
  });

  test('display drift fails with display and flex-direction diffs', async ({ browser }) => {
    const box = '<div><span>box</span></div>';
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(`${MATCHING_BODY}${box}`),
      fixtureDom(`${MATCHING_BODY}${box.replace('<div>', '<div style="display:flex;flex-direction:column">')}`),
    );
    const diffs = diffDomTrees(design, actual);
    // The container's display and flex-direction diff; the child
    // span is blockified into a flex item, so its computed display
    // diffs too — the inventory records what the engine computes,
    // not what the markup declares.
    expect(diffs.map((diff) => `${diff.path} ${diff.field}`).sort()).toEqual([
      '/html[0]/body[0]/div[0]/div[0] display',
      '/html[0]/body[0]/div[0]/div[0] flexDirection',
      '/html[0]/body[0]/div[0]/div[0]/span[0] display',
    ]);
  });

  test('box-model drift fails with gap, padding, and margin diffs', async ({ browser }) => {
    const box =
      '<div style="display:flex;flex-direction:column;gap:8px;padding:4px;margin:2px"><span>a</span><span>b</span></div>';
    const drifted = box
      .replace('gap:8px', 'gap:16px')
      .replace('padding:4px', 'padding:12px')
      .replace('margin:2px', 'margin:6px');
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(`${MATCHING_BODY}${box}`),
      fixtureDom(`${MATCHING_BODY}${drifted}`),
    );
    const diffs = diffDomTrees(design, actual);
    // Only the container diffs: gap, padding, and margin do not
    // inherit, so the child spans stay clean.
    expect(diffs.map((diff) => `${diff.path} ${diff.field}`).sort()).toEqual([
      '/html[0]/body[0]/div[0]/div[0] gap',
      '/html[0]/body[0]/div[0]/div[0] margin',
      '/html[0]/body[0]/div[0]/div[0] padding',
    ]);
  });

  test('visibility drift fails with visible and display diffs', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<h1>Desk board</h1>', '<h1 style="display:none">Desk board</h1>')),
    );
    // Hiding the node flips both the computed display and the
    // visibility flag: the deeper inventory names the display change
    // behind the visibility change.
    const diffs = diffDomTrees(design, actual);
    expect(diffs.map((diff) => `${diff.path} ${diff.field}`).sort()).toEqual([
      '/html[0]/body[0]/div[0]/h1[0] display',
      '/html[0]/body[0]/div[0]/h1[0] visible',
    ]);
  });

  test('order drift fails with path-named diffs', async ({ browser }) => {
    const swapped = MATCHING_BODY.replace(
      '<button type="button" style="background:#0f766e;color:#ffffff">Refresh</button><button type="button" style="background:#0f766e;color:#ffffff">Reload</button>',
      '<button type="button" style="background:#0f766e;color:#ffffff">Reload</button><button type="button" style="background:#0f766e;color:#ffffff">Refresh</button>',
    );
    const { design, actual } = await extractPair(browser, fixtureDom(MATCHING_BODY), fixtureDom(swapped));
    const diffs = diffDomTrees(design, actual);
    expect(diffs.length).toBeGreaterThan(0);
    const formatted = formatDomDiffs(diffs);
    expect(formatted).toContain('button[0]');
    expect(formatted).toContain('button[1]');
  });
});

test.describe('allowlist exempts owner-approved dynamic data (criterion 3)', () => {
  test('allowlisted dynamic nodes pass while the rest still diffs', async ({ browser }) => {
    const dynamic = '<p>Business date: <span>28/10/2026</span></p>';
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(`${MATCHING_BODY}${dynamic}`),
      fixtureDom(`${MATCHING_BODY}${dynamic.replace('28/10/2026', '29/10/2026')}`.replace('>Refresh<', '>REFRESH<')),
    );
    const dynamicPath = '/html[0]/body[0]/div[0]/p[1]/span[0]';
    const withoutAllowlist = diffDomTrees(design, actual);
    expect(withoutAllowlist.length).toBeGreaterThanOrEqual(2);
    const allowlist: DomDiffAllowlist = { skipPaths: ['/html[0]/body[0]/div[0]/p[1]'] };
    expect(isAllowlisted(dynamicPath, allowlist)).toBe(true);
    expect(isAllowlisted('/html[0]/body[0]/div[0]/p[0]/span[0]', allowlist)).toBe(false);
    const diffs = diffDomTrees(design, actual, allowlist);
    expect(diffs, `expected only the non-allowlisted drift, got:\n${formatDomDiffs(diffs)}`).toHaveLength(1);
    expect(diffs[0].field).toBe('text');
    expect(diffs[0].path).toBe('/html[0]/body[0]/div[0]/button[0]');
    expect(unusedAllowlistEntries(design, actual, allowlist)).toEqual([]);
    expect(
      unusedAllowlistEntries(design, actual, { skipPaths: ['/html[0]/body[0]/div[0]/p[9]'] }),
    ).toEqual(['/html[0]/body[0]/div[0]/p[9]']);
  });

  // Refs #495 S7: the Main-screen allowlist carries exactly the
  // owner-approved dynamic-data paths (DD-01..DD-07 in
  // docs/testing/dom-diff-allowlist.md section 3) — no more, no
  // fewer — so wiring drift fails here instead of silently
  // re-noising the gate. Refs #549: design paths target the rendered
  // v2 board root (no `<x-dc>` wrapper); the v2 Main board keeps the
  // v1 node structure, so the fixture below is the same tree with
  // the root re-pointed.
  test('MAIN_SCREEN_ALLOWLIST exempts the approved Main dynamic paths only', () => {
    const node = (path: string, text: string): DomNode => ({
      path,
      tag: path.endsWith('strong[0]') ? 'strong' : 'div',
      text,
      color: '#111111',
      background: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontWeight: '400',
      visible: true,
      ...LAYOUT_DEFAULTS,
    });
    const design: DomNode[] = [
      node('/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]', 'Thứ Tư, 28/10/2026'),
      node('/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]', 'Khách sạn Hoa Mai'),
      node('/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[0]/h3[0]', 'Khách đến hôm nay (2)'),
      node('/html[0]/body[0]/div[0]/div[0]/div[0]/div[9]/p[0]', 'static copy'),
    ];
    const actual: DomNode[] = [
      node(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/p[0]/strong[0]',
        '2026-11-06',
      ),
      node('/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]', 'Lab Parity Hotel'),
      node(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[0]/h3[0]',
        'Đang có khách (0)',
      ),
      node('/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/p[1]', 'changed copy'),
    ];
    expect(MAIN_SCREEN_ALLOWLIST.skipPaths).toHaveLength(22);
    const withoutAllowlist = diffDomTrees(design, actual);
    expect(withoutAllowlist.length).toBeGreaterThan(1);
    const diffs = diffDomTrees(design, actual, MAIN_SCREEN_ALLOWLIST);
    expect(
      diffs,
      `expected only the non-allowlisted nodes, got:\n${formatDomDiffs(diffs)}`,
    ).toHaveLength(2);
    expect(diffs.map((diff) => diff.path).sort()).toEqual([
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/p[1]',
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[9]/p[0]',
    ]);
    // Stale-entry detection still sees every wired path: the
    // fixture covers the DD-01/DD-02 samples (not reported stale)
    // while the uncovered DD-04 in-house heading is reported, proving
    // the hook tracks the wired strings exactly.
    const unused = unusedAllowlistEntries(design, actual, MAIN_SCREEN_ALLOWLIST);
    expect(unused).not.toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]');
    expect(unused).not.toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]');
    expect(unused).toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[1]/h3[0]');
  });

  // Refs #496: the Book-screen allowlist carries exactly the
  // owner-approved dynamic-data paths (DD-08..DD-09 in
  // docs/testing/dom-diff-allowlist.md section 3) — no more, no
  // fewer — so wiring drift fails here instead of silently
  // re-noising the gate. The design quote rows carry no entry:
  // the fresh lab renders the empty quote state instead, a
  // flow-state divergence reported on #496 rather than exempted.
  // Refs #549: the fixture below is v2-shaped (rendered root, no
  // `<x-dc>` wrapper). DD-08 re-points to the rendered root; the
  // DD-09 design select has no v2 counterpart (the v2 board carries
  // no select) and stays wired, so the v2-shaped option node no
  // longer exempts and the entry surfaces as stale — the section-5
  // tracking signal, asserted below. Refs #544: the app-side option
  // path re-points to the v2 stay-card select subtree observed on
  // hotel-lab-775 (orchestrator decision on #544).
  test('BOOK_SCREEN_ALLOWLIST exempts the approved Book dynamic paths only', () => {
    const bookNode = (path: string, tag: string, text: string): DomNode => ({
      path,
      tag,
      text,
      color: '#111111',
      background: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontWeight: '400',
      visible: true,
      ...LAYOUT_DEFAULTS,
    });
    const design: DomNode[] = [
      bookNode('/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]', 'strong', 'Khách sạn Hoa Mai'),
      bookNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[2]/select[0]/option[1]',
        'option',
        'Phòng đôi',
      ),
      bookNode('/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/h3[0]', 'h3', 'Báo giá'),
    ];
    const actual: DomNode[] = [
      bookNode('/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]', 'span', 'Lab Parity Hotel'),
      bookNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/form[0]/div[1]/div[0]/div[1]/div[0]/label[2]/select[0]/option[1]',
        'option',
        'Standard Double',
      ),
      bookNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/form[0]/div[1]/div[0]/div[1]/div[1]/button[0]',
        'button',
        'Lấy báo giá',
      ),
    ];
    expect(BOOK_SCREEN_ALLOWLIST.skipPaths).toHaveLength(4);
    const withoutAllowlist = diffDomTrees(design, actual);
    expect(withoutAllowlist.length).toBeGreaterThan(1);
    const diffs = diffDomTrees(design, actual, BOOK_SCREEN_ALLOWLIST);
    expect(
      diffs,
      `expected only the non-allowlisted nodes, got:\n${formatDomDiffs(diffs)}`,
    ).toHaveLength(3);
    expect(diffs.map((diff) => diff.path).sort()).toEqual([
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/form[0]/div[1]/div[0]/div[1]/div[1]/button[0]',
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[2]/select[0]/option[1]',
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/h3[0]',
    ]);
    // Stale-entry detection tracks the wired paths: the hotel-name
    // strong and the app-side option select are covered, while the
    // DD-09 design select (no v2 counterpart, Refs #549) is reported
    // stale — that warning, not a silent pass, is the section-5
    // signal to retire it.
    const unused = unusedAllowlistEntries(design, actual, BOOK_SCREEN_ALLOWLIST);
    expect(unused).toEqual([
      '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[1]/div[0]/label[2]/select[0]',
    ]);
  });

  // Refs #497: the Stay-screen allowlist carries exactly the
  // owner-approved dynamic-data paths (DD-10..DD-13 in
  // docs/testing/dom-diff-allowlist.md section 3) — no more, no
  // fewer — so wiring drift fails here instead of silently
  // re-noising the gate. Refs #549: the fixture below is v2-shaped
  // (rendered root, check-in/checkout panels): DD-10 re-points to
  // the rendered root, DD-13 re-points to the three reshaped panel
  // selects (orchestrator decision on #549), and the static panel
  // heading carries no entry — while DD-11 (business date) and
  // DD-12 (example list rows) have no v2 counterpart, stay wired,
  // and surface as stale below (the section-5 tracking signal).
  // App-side list rows carry no entry yet (the fresh lab renders
  // empty tables — flow-state, not dynamic data).
  test('STAY_SCREEN_ALLOWLIST exempts the approved Stay dynamic paths only', () => {
    const stayNode = (path: string, tag: string, text: string): DomNode => ({
      path,
      tag,
      text,
      color: '#111111',
      background: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontWeight: '400',
      visible: true,
      ...LAYOUT_DEFAULTS,
    });
    const design: DomNode[] = [
      stayNode('/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]', 'strong', 'Khách sạn Hoa Mai'),
      stayNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[0]/select[0]/option[0]',
        'option',
        'Nguyễn Văn An · ABC123',
      ),
      stayNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[1]/select[0]/option[0]',
        'option',
        'Chọn phòng...',
      ),
      stayNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/label[0]/select[0]/option[0]',
        'option',
        'Lê Minh · P.201',
      ),
      stayNode('/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/h3[0]', 'h3', 'Nhận phòng'),
    ];
    const actual: DomNode[] = [
      stayNode('/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]', 'span', 'Lab Parity Hotel'),
      stayNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/div[0]/div[1]/label[0]/select[0]/option[1]',
        'option',
        'Guest One',
      ),
      stayNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/div[0]/div[1]/label[1]/select[0]/option[1]',
        'option',
        '101',
      ),
      stayNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[1]/div[0]/div[1]/label[0]/select[0]/option[1]',
        'option',
        'Guest Two',
      ),
      stayNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/div[0]/div[1]/button[0]',
        'button',
        'Check in',
      ),
    ];
    expect(STAY_SCREEN_ALLOWLIST.skipPaths).toHaveLength(12);
    const withoutAllowlist = diffDomTrees(design, actual);
    expect(withoutAllowlist.length).toBeGreaterThan(1);
    const diffs = diffDomTrees(design, actual, STAY_SCREEN_ALLOWLIST);
    expect(
      diffs,
      `expected only the non-allowlisted nodes, got:\n${formatDomDiffs(diffs)}`,
    ).toHaveLength(2);
    expect(diffs.map((diff) => diff.path).sort()).toEqual([
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/div[0]/div[1]/button[0]',
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/h3[0]',
    ]);
    // Stale-entry detection tracks every wired path: the hotel-name
    // pair and all six wired catalogue selects (three reshaped
    // design panel selects plus the three v2 app panel selects) are
    // covered — while the DD-11 design date
    // and the three DD-12 example rows (no v2 counterpart, Refs
    // #549) are reported stale. That warning, not a silent pass, is
    // the section-5 signal to retire them.
    const unused = unusedAllowlistEntries(design, actual, STAY_SCREEN_ALLOWLIST);
    expect(unused).toEqual([
      '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[0]/strong[0]',
      '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[1]',
      '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[2]',
      '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[3]',
    ]);
  });

  // Refs #498: the Folio-screen allowlist carries exactly the
  // owner-approved dynamic-data paths (DD-14..DD-16 in
  // docs/testing/dom-diff-allowlist.md section 3) — no more, no
  // fewer — so wiring drift fails here instead of silently
  // re-noising the gate. Refs #549: the fixture below is v2-shaped
  // (rendered root, no `<x-dc>` wrapper); the v2 Folio board keeps
  // the v1 node structure, so this is the same tree re-pointed.
  // Only value-bearing example nodes are
  // exempted: the static board copy around them (both card
  // headings, the `Còn phải trả` due label, all four input labels,
  // both buttons) stays out and keeps reporting as `node` diffs
  // under the accepted S1 shape divergence; app-side folio lines
  // carry no entry yet (the fresh lab opens no folio — flow-state,
  // rows proposed when a run with folio data shows them).
  test('FOLIO_SCREEN_ALLOWLIST exempts the approved Folio dynamic paths only', () => {
    const folioNode = (path: string, tag: string, text: string): DomNode => ({
      path,
      tag,
      text,
      color: '#111111',
      background: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontWeight: '400',
      visible: true,
      ...LAYOUT_DEFAULTS,
    });
    const design: DomNode[] = [
      folioNode('/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]', 'strong', 'Khách sạn Hoa Mai'),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/h3[0]',
        'h3',
        'Khoản phí · Lê Minh · P.201',
      ),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[0]/span[0]',
        'span',
        'Tiền phòng 2 đêm',
      ),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[0]/strong[0]',
        'strong',
        '1.800.000 đ',
      ),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]/span[0]',
        'span',
        'Nước uống',
      ),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/div[1]',
        'div',
        '960.000 đ',
      ),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/div[2]/strong[0]',
        'strong',
        '900.000 đ',
      ),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/h3[0]',
        'h3',
        'Thanh toán',
      ),
    ];
    const actual: DomNode[] = [
      folioNode('/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]', 'span', 'Lab Parity Hotel'),
      folioNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/div[0]/div[0]/div[0]/div[1]/div[1]/button[0]/span[0]',
        'span',
        'Ghi phí',
      ),
    ];
    expect(FOLIO_SCREEN_ALLOWLIST.skipPaths).toHaveLength(7);
    const withoutAllowlist = diffDomTrees(design, actual);
    expect(withoutAllowlist.length).toBeGreaterThan(1);
    const diffs = diffDomTrees(design, actual, FOLIO_SCREEN_ALLOWLIST);
    expect(
      diffs,
      `expected only the non-allowlisted nodes, got:\n${formatDomDiffs(diffs)}`,
    ).toHaveLength(2);
    expect(diffs.map((diff) => diff.path).sort()).toEqual([
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/div[0]/div[0]/div[0]/div[1]/div[1]/button[0]/span[0]',
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/h3[0]',
    ]);
    // Stale-entry detection tracks every wired path: the
    // hotel-name strong, the charge heading plus both charge rows
    // (via the fixture nodes beneath them), and both payment value
    // nodes are covered, so nothing is reported stale.
    const unused = unusedAllowlistEntries(design, actual, FOLIO_SCREEN_ALLOWLIST);
    expect(unused).toEqual([]);
  });

  // Refs #499: the Rooms-screen allowlist carries exactly the
  // owner-approved dynamic-data paths (DD-17..DD-20 in
  // docs/testing/dom-diff-allowlist.md section 3) — no more, no
  // fewer — so wiring drift fails here instead of silently
  // re-noising the gate. Refs #549: the fixture below is v2-shaped
  // (rendered root, no `<x-dc>` wrapper): DD-17 re-points to the
  // rendered root, DD-18 to the date node only (the split-off
  // counts line deliberately stays out — orchestrator decision on
  // #549 — and serves as the static residual below, proving the
  // tight coverage), DD-19/DD-20 shift one level with identical
  // nodes. Only value-bearing example nodes are exempted: the
  // static board copy around them (the title lines, the `Làm mới`
  // button) stays out and keeps reporting as `node` diffs under the
  // accepted S1 shape divergence; app-side room cards carry no entry
  // yet (the fresh-lab cards for seed rooms 101/102 are flow-state,
  // rows proposed when a run with richer room data shows them).
  test('ROOMS_SCREEN_ALLOWLIST exempts the approved Rooms dynamic paths only', () => {
    const roomsNode = (path: string, tag: string, text: string): DomNode => ({
      path,
      tag,
      text,
      color: '#111111',
      background: '#ffffff',
      fontFamily: 'Arial',
      fontSize: '16px',
      fontWeight: '400',
      visible: true,
      ...LAYOUT_DEFAULTS,
    });
    const design: DomNode[] = [
      roomsNode('/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]', 'strong', 'Khách sạn Hoa Mai'),
      roomsNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[0]',
        'div',
        'Sơ đồ phòng · 28/10/2026',
      ),
      roomsNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[0]',
        'span',
        'Sẵn sàng · 8',
      ),
      roomsNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[1]/div[0]/div[0]/strong[0]',
        'strong',
        '101',
      ),
      roomsNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]',
        'div',
        '18 phòng, 6 phòng có khách',
      ),
    ];
    const actual: DomNode[] = [
      roomsNode('/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]', 'span', 'Lab Parity Hotel'),
      roomsNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/h1[0]/strong[0]',
        'strong',
        '2026-11-06',
      ),
      roomsNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[0]/span[0]/span[0]',
        'span',
        'Sẵn sàng (đã kiểm tra)',
      ),
      roomsNode(
        '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[1]/div[0]/div[0]/div[0]/div[1]/p[1]',
        'p',
        'Standard Double',
      ),
    ];
    expect(ROOMS_SCREEN_ALLOWLIST.skipPaths).toHaveLength(17);
    const withoutAllowlist = diffDomTrees(design, actual);
    expect(withoutAllowlist.length).toBeGreaterThan(1);
    const diffs = diffDomTrees(design, actual, ROOMS_SCREEN_ALLOWLIST);
    expect(
      diffs,
      `expected only the non-allowlisted nodes, got:\n${formatDomDiffs(diffs)}`,
    ).toHaveLength(2);
    expect(diffs.map((diff) => diff.path).sort()).toEqual([
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[1]/div[0]/div[0]/div[0]/div[1]/p[1]',
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]',
    ]);
    // Stale-entry detection tracks every wired path: the
    // hotel-name strong, the summary date node, the first chip span
    // and chip li (via the fixture nodes beneath them), and the
    // first card-grid number are covered — the remaining chips, lis,
    // and grids are reported, proving the hook tracks the wired
    // strings exactly.
    const unused = unusedAllowlistEntries(design, actual, ROOMS_SCREEN_ALLOWLIST);
    expect(unused).not.toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]');
    expect(unused).not.toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[0]');
    expect(unused).not.toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[0]');
    expect(unused).not.toContain(
      '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[0]',
    );
    expect(unused).not.toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[1]');
    expect(unused).toContain('/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[4]');
  });
});

test.describe('output is deterministic text only (criteria 2 and 4)', () => {
  test('same page extracts byte-identical trees twice', async ({ page }) => {
    await page.setContent(fixtureDom(MATCHING_BODY));
    const first = serializeDomTree(await page.evaluate(collectDomTree));
    const second = serializeDomTree(await page.evaluate(collectDomTree));
    expect(second).toBe(first);
  });

  test('same comparison formats byte-identical output twice', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<span>static</span>', '<span>changed</span>')),
    );
    const first = formatDomDiffs(diffDomTrees(design, actual));
    const second = formatDomDiffs(diffDomTrees(design, actual));
    expect(second).toBe(first);
    expect(first).toContain('[/html[0]/body[0]/div[0]/p[0]/span[0]] text mismatch');
  });

  test('formatted diffs carry paths and values as plain text', () => {
    const formatted = formatDomDiffs([
      { path: '/html[0]/body[0]/div[0]/h1[0]', field: 'text', expected: '"Desk"', actual: '"Lobby"' },
    ]);
    expect(formatted).toBe(
      '[/html[0]/body[0]/div[0]/h1[0]] text mismatch\n' +
        '  expected: "Desk"\n' +
        '  actual:   "Lobby"',
    );
    expect(formatDomDiffs([])).toBe('');
  });
});

function designFileFor(screen: string): string {
  const file = `${screen}.dc.html`;
  const candidates = [
    join(process.cwd(), '..', 'docs', 'design', file),
    join(process.cwd(), 'docs', 'design', file),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`dom-diff: design file not found for ${screen} (tried ${candidates.join(', ')})`);
}

test.describe('live extraction from design HTML and the running desk UI (criterion 1)', () => {
  let guard!: LoopbackGuard;

  test.beforeEach(async ({ page }) => {
    guard = installLoopbackGuard(page);
  });

  test.afterEach(() => {
    guard.assertClean();
  });

  for (const entry of SCREEN_TABLE) {
    test(`${entry.screen}: both pages extract deterministic text-only trees`, async ({ page }) => {
      // Lab-state matrix (mirrors design-facts.spec.ts): the wizard
      // renders on an unconfigured database only. Mock just the
      // hotel-config read as unconfigured so the wizard renders;
      // every other API call reaches the real lab stack.
      if (entry.screen === 'Onboarding') {
        await page.route('**/v1/admin/GetHotelConfig', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ values: { name: '' } }),
          }),
        );
      }
      await page.addInitScript(() => {
        window.localStorage.setItem('hotel-mgmt.desk.locale', 'vi');
      });
      await signInThroughGate(page);
      await page.goto(entry.route === '/' ? '/app/' : `/app${entry.route}`);
      await expect(page.getByTestId(entry.viewHook)).toBeVisible();
      if (entry.screen === 'Main') {
        // The room-map lanes (DD-07 allowlist paths) render only
        // once the dashboard load clears; extracting earlier would
        // race the load and spam stale-entry warnings.
        await expect(page.getByTestId('desk-roommap')).toBeVisible({ timeout: 30000 });
      }

      const designPage = await page.context().newPage();
      try {
        await designPage.setContent(readFileSync(designFileFor(entry.screen), 'utf8'));
        // v2 boards are bundler shells (Refs #538, Refs #549): the
        // shell replaces the document with the template payload and
        // React renders it without the `<x-dc>` wrapper, so the design
        // tree only exists after that async render. Both conjuncts
        // are load-bearing with no race: the fresh shell has the
        // loading marker but no `x-dc`, the installed template has
        // `x-dc` but no loading marker, and only the rendered board
        // has neither. A timeout here names a broken shell or a
        // blocked CDN render — never design drift.
        await designPage.waitForFunction(
          () =>
            document.getElementById('__bundler_loading') === null &&
            document.querySelector('x-dc') === null,
          undefined,
          { timeout: 60000 },
        );
        const design = await designPage.evaluate(collectDomTree);
        const actual = await page.evaluate(collectDomTree);
        expect(design.length).toBeGreaterThan(0);
        expect(actual.length).toBeGreaterThan(0);
        // Deterministic across runs (criterion 4): re-extracting the
        // live app DOM yields byte-identical output.
        const second = serializeDomTree(await page.evaluate(collectDomTree));
        expect(second).toBe(serializeDomTree(actual));
        // Text-only output (criteria 2 and 5): the diff renders as a
        // string, never binary. Full parity is NOT asserted here —
        // owner-approved dynamic data is exempted through the
        // per-screen allowlist (Refs #495 S7, #496, #497, #498, #499) while the accepted
        // structural divergence (PrimeVue shell vs design-literal
        // markup) still reports — so the run reports the remaining
        // diff count for that follow-up instead of gating on it.
        // The loop covers SCREEN_TABLE (all seven boards with a
        // running app screen since #546; Admin carries no allowlist
        // entry yet, so it reports on EMPTY_ALLOWLIST) — the Admin
        // board reached this switch when #546 landed (Refs #546,
        // Refs #549).
        const allowlist =
          entry.screen === 'Main'
            ? MAIN_SCREEN_ALLOWLIST
            : entry.screen === 'Book'
              ? BOOK_SCREEN_ALLOWLIST
              : entry.screen === 'Stay'
                ? STAY_SCREEN_ALLOWLIST
                : entry.screen === 'Folio'
                  ? FOLIO_SCREEN_ALLOWLIST
                  : entry.screen === 'Rooms'
                    ? ROOMS_SCREEN_ALLOWLIST
                    : EMPTY_ALLOWLIST;
        const diffs = diffDomTrees(design, actual, allowlist);
        const formatted = formatDomDiffs(diffs);
        expect(typeof formatted).toBe('string');
        test.info().annotations.push({
          type: 'dom-diff-count',
          description: `${entry.screen}: ${diffs.length} non-allowlisted diffs`,
        });
      } finally {
        await designPage.close();
      }
    });
  }
});
