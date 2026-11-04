// Full-tree DOM diff gate: owner design HTML vs running desk UI (Closes #480).
//
// Playwright-based gate that opens both the local owner design HTML
// (`docs/design/*.dc.html`) and the running desk UI, extracts the full
// DOM tree from each page, and diffs the two trees node-by-node with
// text-only deterministic output. No screenshots, no video, no
// snapshots anywhere in this gate; no product behaviour change and no
// design-file changes (harness/test code only).
//
// What each node carries (acceptance criterion 2): the tag, the node's
// own direct text, the computed `color` and `background-color`, the
// computed font family/size/weight, a computed visibility flag, and the
// document order (the node's path carries its sibling position, and the
// tree serialises in document order).
//
// Dynamic data (criterion 3): nodes the owner approves as dynamic
// (dates, counts, names) are exempted through `DomDiffAllowlist`, a
// path-prefix hook. The approved data list is documented in
// `docs/testing/dom-diff-allowlist.md` (Closes #482): every
// `skipPaths` entry must cite an entry ID from that document, and
// no exemption exists outside it. This module only owns the hook.
//
// CI workflow wiring and path-filter triggers are a separate issue:
// this module plus `dom-diff.spec.ts` is the gate, runnable today via
// `npx playwright test dom-diff.spec.ts --project=chromium`.

// One element of the extracted full DOM tree. Paths locate the node
// deterministically: `/html[0]/body[0]/div[2]/h1[0]` (tag plus the
// index among same-tag siblings under the same parent). `text` is the
// node's own direct text only (descendant element text stays on the
// descendant's record), normalised (NFC, whitespace collapsed).
export interface DomNode {
  path: string;
  tag: string;
  text: string;
  color: string;
  background: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  visible: boolean;
}

export interface DomDiff {
  path: string;
  field: string;
  expected: string;
  actual: string;
}

// Allowlist hook for owner-approved dynamic data (criterion 3). Each
// entry is a node path: it exempts that node and its whole subtree
// (`entry` itself plus anything under `entry + '/'`). The approved
// data list is `docs/testing/dom-diff-allowlist.md` (Closes #482):
// wire a path here only with a comment citing its allowlist entry ID.
export interface DomDiffAllowlist {
  skipPaths: string[];
}

export const EMPTY_ALLOWLIST: DomDiffAllowlist = { skipPaths: [] };

export function isAllowlisted(path: string, allowlist: DomDiffAllowlist): boolean {
  return allowlist.skipPaths.some(
    (entry) => path === entry || path.startsWith(`${entry}/`),
  );
}

// Allowlist entries that match zero nodes on either side. A stale
// entry (after unrelated structural drift) silently stops exempting
// anything, turning owner-approved dynamic data back into gate noise
// with no signal — callers should surface these.
export function unusedAllowlistEntries(
  design: DomNode[],
  actual: DomNode[],
  allowlist: DomDiffAllowlist,
): string[] {
  return allowlist.skipPaths.filter(
    (entry) =>
      ![...design, ...actual].some(
        (node) => node.path === entry || node.path.startsWith(`${entry}/`),
      ),
  );
}

// Browser-side full-tree extraction. This function is serialised into
// the page by `page.evaluate`, so it must stay self-contained: no
// imports, no closure references, DOM APIs only. `script`, `style`,
// `noscript`, and `template` subtrees are not rendered UI (bundle code
// is not comparable UI copy), so those elements are skipped entirely;
// everything else is recorded in document order. Colours resolve
// through `getComputedStyle` only — never attribute parsing, never
// screenshots. An unparsable computed colour falls back to its raw
// normalised value so one exotic token cannot abort the whole tree;
// the fallback still diffs deterministically.
export function collectDomTree(): DomNode[] {
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);
  const norm = (value: string): string =>
    value.normalize('NFC').replace(/\s+/g, ' ').trim();
  const normColour = (raw: string): string => {
    const value = raw.trim().toLowerCase();
    if (value === 'transparent') return 'transparent';
    const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/);
    if (hex) {
      const digits = hex[1];
      return digits.length === 3
        ? `#${digits.split('').map((c) => c + c).join('')}`
        : `#${digits}`;
    }
    const rgb = value.match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
    );
    if (rgb) {
      const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
      if (alpha === 0) return 'transparent';
      if (alpha !== 1) return value;
      const parts: string[] = [];
      for (const n of [rgb[1], rgb[2], rgb[3]]) {
        const v = Number(n);
        if (!Number.isInteger(v) || v < 0 || v > 255) return value;
        parts.push(v.toString(16).padStart(2, '0'));
      }
      return `#${parts.join('')}`;
    }
    return value;
  };

  const nodes: DomNode[] = [];
  const walk = (el: Element, path: string): void => {
    const style = getComputedStyle(el);
    const ownTextParts: string[] = [];
    el.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        ownTextParts.push(child.textContent ?? '');
      }
    });
    nodes.push({
      path,
      tag: el.tagName.toLowerCase(),
      text: norm(ownTextParts.join('')),
      color: normColour(style.getPropertyValue('color')),
      background: normColour(style.getPropertyValue('background-color')),
      fontFamily: norm(style.getPropertyValue('font-family')),
      fontSize: norm(style.getPropertyValue('font-size')),
      fontWeight: norm(style.getPropertyValue('font-weight')),
      visible:
        style.getPropertyValue('display') !== 'none' &&
        style.getPropertyValue('visibility') !== 'hidden' &&
        style.getPropertyValue('visibility') !== 'collapse' &&
        style.getPropertyValue('opacity') !== '0' &&
        !el.hasAttribute('hidden'),
    });
    const counters: Record<string, number> = {};
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;
      const index = counters[tag] ?? 0;
      counters[tag] = index + 1;
      walk(child, `${path}/${tag}[${index}]`);
    }
  };
  walk(document.documentElement, '/html[0]');
  return nodes;
}

// Node-by-node diff (criterion 2): every non-allowlisted design node
// must exist at the same path on the app side with identical tag,
// text, computed colours, fonts, and visibility; app-side nodes with
// no design counterpart fail as extras. Output order is deterministic:
// design document order first, then app document order for extras.
export function diffDomTrees(
  design: DomNode[],
  actual: DomNode[],
  allowlist: DomDiffAllowlist = EMPTY_ALLOWLIST,
): DomDiff[] {
  const diffs: DomDiff[] = [];
  const actualByPath = new Map(actual.map((node) => [node.path, node]));
  const designPaths = new Set(design.map((node) => node.path));
  for (const entry of unusedAllowlistEntries(design, actual, allowlist)) {
    console.warn(`dom-diff: allowlist entry matched no nodes: ${entry}`);
  }
  const push = (path: string, field: string, expected: unknown, observed: unknown): void => {
    // JSON.stringify(undefined) yields undefined (not a string), so a
    // genuinely absent value renders explicitly instead of crashing
    // the push or printing nothing.
    const left = JSON.stringify(expected) ?? '(absent)';
    const right = JSON.stringify(observed) ?? '(absent)';
    if (left !== right) {
      diffs.push({ path, field, expected: left, actual: right });
    }
  };
  for (const designNode of design) {
    if (isAllowlisted(designNode.path, allowlist)) continue;
    const observed = actualByPath.get(designNode.path);
    if (observed === undefined) {
      diffs.push({ path: designNode.path, field: 'node', expected: 'present', actual: 'absent' });
      continue;
    }
    push(designNode.path, 'tag', designNode.tag, observed.tag);
    push(designNode.path, 'text', designNode.text, observed.text);
    push(designNode.path, 'color', designNode.color, observed.color);
    push(designNode.path, 'background', designNode.background, observed.background);
    push(designNode.path, 'fontFamily', designNode.fontFamily, observed.fontFamily);
    push(designNode.path, 'fontSize', designNode.fontSize, observed.fontSize);
    push(designNode.path, 'fontWeight', designNode.fontWeight, observed.fontWeight);
    push(designNode.path, 'visible', designNode.visible, observed.visible);
  }
  for (const observed of actual) {
    if (isAllowlisted(observed.path, allowlist)) continue;
    if (!designPaths.has(observed.path)) {
      diffs.push({ path: observed.path, field: 'node', expected: 'absent', actual: 'present' });
    }
  }
  return diffs;
}

// Text-only deterministic rendering (criteria 2 and 4): one block per
// diff in diff order, no timestamps, no binary artifacts. Returns ''
// when there are no diffs.
export function formatDomDiffs(diffs: DomDiff[]): string {
  return diffs
    .map(
      (diff) =>
        `[${diff.path}] ${diff.field} mismatch\n` +
        `  expected: ${diff.expected}\n` +
        `  actual:   ${diff.actual}`,
    )
    .join('\n');
}

// Deterministic serialisation for byte-identical comparisons
// (criterion 4): fixed field order, two-space JSON, trailing newline.
export function serializeDomTree(tree: DomNode[]): string {
  return `${JSON.stringify(tree, null, 2)}\n`;
}
