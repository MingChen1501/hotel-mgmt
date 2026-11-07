// Full-tree DOM diff gate: owner design HTML vs running desk UI (Closes #480;
// deepened to a full computed inventory per screen by #515).
//
// Playwright-based gate that opens both the local owner design HTML
// (`docs/design/*.dc.html`) and the running desk UI, extracts the full
// DOM tree from each page, and diffs the two trees node-by-node with
// text-only deterministic output. No screenshots, no video, no
// snapshots anywhere in this gate; no product behaviour change and no
// design-file changes (harness/test code only).
//
// Board format (Refs #538, Refs #549): each `.dc.html` file is a v2
// bundler shell whose template payload React renders without the
// `<x-dc>` wrapper, so the design side extracts the RENDERED board
// (the spec waits for the shell loading marker to detach and the
// template root to resolve) — the raw shell bytes never enter a
// diff. Design-side allowlist paths are rooted at that rendered root
// (see the hook comment below); the Admin board has no app screen
// yet and stays out of both gates (DEFERRED per
// `docs/testing/dom-diff-allowlist.md` section 2, Refs #546).
//
// What each node carries (acceptance criteria 1-2, #515 full
// computed inventory):
// - every text node: the node's own direct text (exact content —
//   redundant characters fail as text diffs), the computed `color`,
//   font family/size/weight, `line-height`, and a computed
//   visibility flag;
// - every block container: the computed `display`, flex/grid
//   direction (`flex-direction`), `gap`, `padding` (four sides),
//   `margin` (four sides), plus `background-color`;
// - structural location: the document order (the node's path carries
//   its sibling position, and the tree serialises in document order).
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
// Layout fields (`lineHeight`, `display`, `flexDirection`, `gap`,
// `padding`, `margin`) carry the computed value on every node, so the
// gate inventories every text node and every block container per
// #515: text-bearing nodes are pinned by their typography, containers
// by their box model, and any layout drift fails with a path-named
// diff. `padding`/`margin` join the four computed sides in CSS order
// (top right bottom left); `gap` joins row and column.
export interface DomNode {
  path: string;
  tag: string;
  text: string;
  color: string;
  background: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  display: string;
  flexDirection: string;
  gap: string;
  padding: string;
  margin: string;
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
// Design-side paths are rooted at the RENDERED v2 board root
// (`/html[0]/body[0]/div[0]/div[0]`): each `.dc.html` file is a
// bundler shell whose template payload React renders without the
// `<x-dc>` wrapper (Refs #538, Refs #549) — the raw shell bytes never
// enter a diff. App-side paths are rooted at the desk shell and are
// unaffected by the board swap.
export interface DomDiffAllowlist {
  skipPaths: string[];
}

export const EMPTY_ALLOWLIST: DomDiffAllowlist = { skipPaths: [] };

// Main-screen dynamic-data exemptions (Refs #495 S7). Every path
// below cites its owner-approved entry in
// `docs/testing/dom-diff-allowlist.md` section 3: the design side
// carries the static snapshot values (example hotel name, frozen
// business date, example guests/counts) while the app side renders
// live values (configured hotel, business clock, seed-driven
// counts), so these nodes can never coincide. Refs #549: the design
// paths below target the rendered v2 board root (no `<x-dc>`
// wrapper); the v2 Main board keeps the v1 node structure, so this
// is a pure root re-point with identical exempted nodes. Count-bearing
// headings are exempted wholesale (static prefix plus dynamic
// count share one text node); the static copy stays pinned by the
// fact-level gate decided content (`design-facts.ts`
// `DECIDED_CONTENT`), which these path exemptions do not touch.
export const MAIN_SCREEN_ALLOWLIST: DomDiffAllowlist = {
  skipPaths: [
    // DD-01 business date: design snapshot vs live business clock.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/p[0]/strong[0]',
    // DD-02 hotel name: design example content vs configured hotel.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]',
    // DD-03 arrival count plus guest name/code rows.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[0]/h3[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[0]/div[0]/span[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[0]/div[1]/span[0]',
    // DD-04 in-house count plus guest name/code/checkout rows.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[1]/h3[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[1]/div[0]/span[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[1]/div[0]/span[1]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[1]/div[1]/span[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[1]/div[1]/span[1]',
    // DD-05 departure count.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[2]/h3[0]',
    // DD-06 housekeeping room references, block reason, and date.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[0]/div[0]/span[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[1]/div[0]/span[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[2]/div[0]/span[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[2]/div[0]/span[1]',
    // DD-07 app room-map lane counts (seed-driven, zero or more).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[0]/h3[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[1]/h3[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[2]/h3[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[3]/h3[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[4]/h3[0]',
  ],
};

// Book-screen dynamic-data exemptions (Refs #496). Every path
// below cites its owner-approved entry in
// `docs/testing/dom-diff-allowlist.md` section 3: the design side
// carries the static snapshot values (example hotel name, one
// illustrative room-type option) while the app side renders live
// values (configured hotel, API-driven room-type catalogue), so
// these nodes can never coincide. The option-bearing selects are
// exempted wholesale (the static label/placeholder copy stays
// pinned by the fact-level decided inputs in `design-facts.ts`
// `DECIDED_CONTENT`, which these path exemptions do not touch).
// The design quote rows (`Số đêm 2`, `Tổng tiền 1.800.000 đ`) carry
// no entry: the fresh lab renders the empty quote state instead,
// a flow-state divergence reported on #496 rather than exempted.
export const BOOK_SCREEN_ALLOWLIST: DomDiffAllowlist = {
  skipPaths: [
    // DD-08 hotel name: design example content vs configured hotel
    // (same shared shell-header paths as Main DD-02).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]',
    // DD-09 room-type options: v1 design illustration (`Phòng
    // đôi`) vs API-driven catalogue (boot seed `Standard Double`,
    // plus any later-defined types under the same select subtree).
    // Refs #549: the v2 Book board carries no select (room type is
    // a text input with no illustrated options), so this design path
    // has no v2 counterpart and stays wired until a section-5
    // retirement is owner-approved — the stale-entry warning (not a
    // silent pass) is the tracking signal.
    '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[1]/div[0]/label[2]/select[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/form[0]/div[0]/div[1]/div[0]/div[0]/div[1]/label[2]/select[0]',
  ],
};

// Stay-screen dynamic-data exemptions (Refs #497). Every path
// below cites its owner-approved entry in
// `docs/testing/dom-diff-allowlist.md` section 3: the design side
// carries the static snapshot values (example hotel name, catalogue
// options) while the app side renders live values (configured
// hotel, API-driven arrival/room/departing catalogues), so these nodes
// can never coincide. Refs #549: the v2 Stay board reshaped the v1
// list layout into check-in/checkout panels — DD-10 re-points to the
// rendered root, DD-13 re-points to the three reshaped panel selects
// (orchestrator decision on #549: same functional elements), while
// DD-11 (business date) and DD-12 (example list rows) have no v2
// counterpart and stay wired until a section-5 retirement is
// owner-approved. The option-bearing selects are exempted wholesale
// (the static label/placeholder copy stays pinned by the fact-level
// decided inputs in `design-facts.ts` `DECIDED_CONTENT`, which these
// path exemptions do not touch). The v2 Stay board carries no list
// headings or rows (check-in/checkout panels only), so only the
// catalogue selects above are exempted on the design side. The fresh
// lab renders empty stay tables, so app-side list rows carry no entry
// yet: the v2 board carries no lists at all, so no app list rows
// exist to propose (Refs #541).
export const STAY_SCREEN_ALLOWLIST: DomDiffAllowlist = {
  skipPaths: [
    // DD-10 hotel name: design example content vs configured hotel
    // (same shared shell-header paths as Main DD-02, Book DD-08).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]',
    // DD-11 business date: v1 design snapshot (`28/10/2026`) vs
    // live business clock (ISO). Refs #549: the v2 Stay board shows
    // no business date (check-in/checkout panels only), so this
    // design path has no v2 counterpart and stays wired until a
    // section-5 retirement is owner-approved — the stale-entry
    // warning (not a silent pass) is the tracking signal.
    // Only the strong carries the date; the surrounding line
    // (static prefix, `Tải lại` button) stays pinned by the
    // fact-level decided content.
    '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[0]/strong[0]',
    // Refs #541: the v2 rebuild drops the lists card, so the
    // app-side date path retires here with it.
    // DD-12 stay-list example rows: v1 design illustration
    // (`Nguyễn Văn An · Phòng 205`, `Lê Minh · Phòng 201`,
    // `Phạm Hoa · Phòng 203`) vs seed- and action-dependent lists.
    // Refs #549: the v2 Stay board carries no list rows (check-in/
    // checkout panels only), so these design paths have no v2
    // counterpart and stay wired until a section-5 retirement is
    // owner-approved — the stale-entry warning (not a silent pass)
    // is the tracking signal.
    '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[1]',
    '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[2]',
    '/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[3]',
    // DD-13 catalogue options: the v2 Stay board reshaped the two v1
    // option selects into three panel selects (orchestrator decision
    // on #549: same functional elements, so this re-points rather
    // than widens)
    // prompt plus ready-room options, and the checkout stay options.
    // (Refs #541: the rebuild drops the move card, so the move-room
    // app path retires here; the three app paths below track the v2
    // panels: arrival, room, and departing selects).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[0]/select[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[1]/select[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/label[0]/select[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/div[0]/div[1]/label[0]/select[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/div[0]/div[1]/label[1]/select[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[1]/div[0]/div[1]/label[0]/select[0]',
  ],
};

// Folio-screen dynamic-data exemptions (Refs #498). Every path
// below cites its owner-approved entry in
// `docs/testing/dom-diff-allowlist.md` section 3: the design side
// carries the static snapshot values (example hotel name, one
// illustrative guest folio with two charge lines and one payment)
// while the app side renders live values (configured hotel,
// API-driven folio for the opened stay), so these nodes can never
// coincide. Refs #549: the v2 Folio board keeps the v1 node
// structure, so the design paths below are a pure root re-point
// with identical exempted nodes. Only the value-bearing example
// nodes are exempted: the
// static board copy around them (both card headings, the
// `Còn phải trả` due label, all four input labels, both buttons)
// stays out, remaining as residual `node` diffs under the accepted
// S1 shape divergence. The fresh lab opens no folio, so app-side
// folio lines carry no entry yet (same note as Stay app rows in
// DD-12): rows are proposed when a run with folio data shows them.
export const FOLIO_SCREEN_ALLOWLIST: DomDiffAllowlist = {
  skipPaths: [
    // DD-14 hotel name: design example content vs configured hotel
    // (same shared shell-header paths as Main DD-02, Book DD-08,
    // Stay DD-10).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]',
    // DD-15 charge examples: design illustration for guest Lê Minh
    // in P.201 (`Khoản phí · Lê Minh · P.201`, `Tiền phòng 2 đêm` /
    // `1.800.000 đ`, `Nước uống` / `60.000 đ`) vs the live folio
    // lines of the opened stay (fresh lab: the empty-folio state).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/h3[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]',
    // DD-16 payment examples: design illustration (`960.000 đ`
    // balance due, `Tiền mặt` / `900.000 đ` payment row) vs the live
    // folio balance and payment lines (fresh lab: no folio opened,
    // balance line empty). Only the value-bearing nodes: the static
    // `Còn phải trả` due label stays out as an S1 residual.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/div[1]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/div[2]',
  ],
};

// Rooms-screen dynamic-data exemptions (Refs #499). Every path
// below cites its owner-approved entry in
// `docs/testing/dom-diff-allowlist.md` section 3: the design side
// carries the static snapshot values (example hotel name, one
// illustrative summary line, five illustrative status chips, three
// floors of example room cards) while the app side renders live
// values (configured hotel, business clock, seed-driven counts),
// so these nodes can never coincide. Refs #549: the design paths
// target the rendered v2 board root; DD-19/DD-20 shifted one level
// (same nodes), DD-18 re-points to the date node only. Only the
// value-bearing example nodes are exempted: the static board copy
// around them (the title lines, the `Làm mới` button) stays out,
// remaining as residual `node` diffs under the accepted S1 shape
// divergence.
// App-side room cards carry no entry yet (the fresh-lab cards for
// seed rooms 101/102 are flow-state, same note as Stay app rows in
// DD-12): rows are proposed when a run with richer room data shows
// them.
export const ROOMS_SCREEN_ALLOWLIST: DomDiffAllowlist = {
  skipPaths: [
    // DD-17 hotel name: design example content vs configured hotel
    // (same shared shell-header paths as Main DD-02, Book DD-08,
    // Stay DD-10, Folio DD-14).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]',
    // DD-18 summary line: the v2 board splits the v1 summary into
    // the date head (`Sơ đồ phòng · 28/10/2026`, this entry) plus
    // the counts line (`18 phòng, 6 phòng có khách`, no entry —
    // orchestrator decision on #549: date node only, never the
    // parent div; the counts line gets its own entry if needed) vs
    // the live business-date strong (fresh lab: the ISO clock; the
    // design counts never coincide with seed-driven rooms).
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/p[1]/strong[0]',
    // DD-19 summary chips: design illustration (`Sẵn sàng · 8`,
    // `Có khách · 6`, `Cần dọn · 2`, `Chờ kiểm tra · 1`,
    // `Ngừng sử dụng · 1`) vs the seed-driven live chips (fresh
    // lab: 2 ready, 0 elsewhere). Refs #549: the v2 board dropped
    // one wrapper level, so the chips moved from `div[3]` to
    // `div[2]` with identical nodes. Count-bearing nodes are
    // exempted wholesale (same note as Main DD-07): the qualified
    // app chip labels stay pinned by the fact-level decided room map
    // (`design-facts.ts`, Refs #491), which these path exemptions
    // do not touch.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[1]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[2]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[3]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[4]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[0]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[1]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[2]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[3]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[4]',
    // DD-20 example room cards: design illustration for three
    // floors (room numbers, statuses, type lines, notes with guest
    // names, checkout dates, and the block reason) vs the live
    // seed-driven cards (fresh lab: rooms 101/102 on floor 1 with
    // catalogue type names and live note lines). Refs #549: the v2
    // board dropped one wrapper level, so the floor sections moved
    // from `div[4..6]` to `div[3..5]`; within each section the entry
    // is the card grid `div[1]` (the title `div[0]` stays out, same
    // as v1). The whole card grids are exempted (current and future
    // rooms under the same floor subtrees); the floor titles above
    // them (`Tầng 1` ..) stay out as S1 residuals.
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[1]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[4]/div[1]',
    '/html[0]/body[0]/div[0]/div[0]/div[0]/div[5]/div[1]',
  ],
};

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
    // Full computed inventory (#515): typography plus box model on
    // every node. Multi-value shorthands join in CSS order so the
    // serialisation stays a plain deterministic string per field.
    const box = (sides: string[]): string =>
      sides.map((side) => norm(style.getPropertyValue(side))).join(' ');
    nodes.push({
      path,
      tag: el.tagName.toLowerCase(),
      text: norm(ownTextParts.join('')),
      color: normColour(style.getPropertyValue('color')),
      background: normColour(style.getPropertyValue('background-color')),
      fontFamily: norm(style.getPropertyValue('font-family')),
      fontSize: norm(style.getPropertyValue('font-size')),
      fontWeight: norm(style.getPropertyValue('font-weight')),
      lineHeight: norm(style.getPropertyValue('line-height')),
      display: norm(style.getPropertyValue('display')),
      flexDirection: norm(style.getPropertyValue('flex-direction')),
      gap: `${norm(style.getPropertyValue('row-gap'))} ${norm(style.getPropertyValue('column-gap'))}`,
      padding: box(['padding-top', 'padding-right', 'padding-bottom', 'padding-left']),
      margin: box(['margin-top', 'margin-right', 'margin-bottom', 'margin-left']),
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

// Node-by-node diff (criterion 2, full inventory per #515): every
// non-allowlisted design node must exist at the same path on the app
// side with identical tag, exact text, computed colours, fonts,
// line-height, layout (display, flex-direction, gap, padding,
// margin), and visibility; app-side nodes with no design counterpart
// fail as extras. Output order is deterministic:
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
    push(designNode.path, 'lineHeight', designNode.lineHeight, observed.lineHeight);
    push(designNode.path, 'display', designNode.display, observed.display);
    push(designNode.path, 'flexDirection', designNode.flexDirection, observed.flexDirection);
    push(designNode.path, 'gap', designNode.gap, observed.gap);
    push(designNode.path, 'padding', designNode.padding, observed.padding);
    push(designNode.path, 'margin', designNode.margin, observed.margin);
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
