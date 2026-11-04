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
//   drift class (tag, text, color, background, font, visibility, order)
//   fails with a diff naming the node path. Colors resolve through
//   computed styles even when applied via stylesheet.
// - Allowlist test (criterion 3): a dynamic node whose text differs on
//   both sides passes once its path is allowlisted, while the rest of
//   the tree still diffs.
// - Determinism tests (criterion 4): the same page extracts
//   byte-identical trees twice, and the same comparison formats
//   byte-identical output twice.
// - Live extraction test (criterion 1): opens the real local design
//   file bytes and the running desk UI route for each of the six
//   screens, extracts both full trees, and proves the output is
//   text-only and deterministic across runs. It does NOT assert zero
//   diffs: full parity and the approved allowlist data list are
//   separate issues, so the live run reports the diff count instead of
//   gating on it.
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
    expect(diffs.map((diff) => `${diff.path} ${diff.field}`).sort()).toEqual([
      '/html[0]/body[0]/div[0]/p[0] fontSize',
      '/html[0]/body[0]/div[0]/p[0] fontWeight',
      '/html[0]/body[0]/div[0]/p[0]/span[0] fontSize',
      '/html[0]/body[0]/div[0]/p[0]/span[0] fontWeight',
    ]);
  });

  test('visibility drift fails with a visible diff', async ({ browser }) => {
    const { design, actual } = await extractPair(
      browser,
      fixtureDom(MATCHING_BODY),
      fixtureDom(MATCHING_BODY.replace('<h1>Desk board</h1>', '<h1 style="display:none">Desk board</h1>')),
    );
    expectSingleFieldDiff(design, actual, '/html[0]/body[0]/div[0]/h1[0]', 'visible');
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

      const designPage = await page.context().newPage();
      try {
        await designPage.setContent(readFileSync(designFileFor(entry.screen), 'utf8'));
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
        // the approved allowlist data list is a separate issue — so
        // the run reports the diff count for that follow-up instead
        // of gating on it.
        const diffs = diffDomTrees(design, actual);
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
