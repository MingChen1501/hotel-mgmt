// DOM-vs-design comparison for the six desk screens (Closes #467).
//
// App-side counterpart of the design-side extractor
// (`tests/design-facts/extract-design-facts.mjs`, issue #466). Both
// sides implement the contract in
// `docs/technical/desk-ui-fact-schema.md` (schemaVersion 1, owned by
// `architect`): the design side parses the static
// `docs/design/*.dc.html` boards with Node, this module extracts the
// same fact shape from the live Chromium DOM through Playwright and
// diffs the two field-by-field.
//
// Owner direction 2026-11-03: no screenshot snapshots (heavy,
// brittle). Colors are asserted through `getComputedStyle` only —
// this module never captures screenshots, video, or snapshots, and a
// CI guard greps it for those APIs (see `.github/workflows/ci.yml`).
// Harness/test code only: no product behaviour change, no
// design-file changes, no binary artifacts (UTF-8 JSON/text only).
//
// Screen sources: design `docs/design/<Screen>.dc.html` (manifest
// order); app routes below. Design tab keys follow the extractor's
// definitive table (`Lễ tân` -> `Main`, `Đặt phòng` -> `Book`,
// `Lưu trú` -> `Stay`, `Hoá đơn` -> `Folio`, `In` -> `print`,
// `Quản trị` -> `admin`); the shell route names map onto the screen
// keys through ROUTE_KEY_TO_DESIGN_KEY where a tab exists on both
// sides. Refs #472: the visible shell nav is exactly the six design
// header tabs, so every design tab key has a shell route-name
// counterpart; onboarding/rooms are tab-less deep routes and map to
// nothing — see the live spec.

export const FACT_SCHEMA_VERSION = 1;

export interface FactNav {
  order: string[];
  labels: Record<string, string>;
  active: string;
}

export interface FactHeading {
  level: number;
  text: string;
}

export interface FactButton {
  label: string;
}

export type FactInputKind = 'text' | 'select';

export interface FactInput {
  kind: FactInputKind;
  label: string;
  placeholder: string | null;
}

export interface FactTokens {
  header: string;
  primary: string;
  page: string;
  ink: string;
}

export interface DesignScreenRecord {
  schemaVersion: number;
  screen: string;
  designFile: string;
  nav: FactNav & { design: string; app: string };
  headings: (FactHeading & { design: string; app: string })[];
  buttons: (FactButton & { design: string; app: string })[];
  inputs: (FactInput & { design: string; app: string })[];
  tokens: FactTokens;
}

// App-side snapshot: same fact values without provenance (the diff
// cites the design record's `design`/`app` pointers per schema
// section 4: expected always comes from the design extraction,
// actual always from the app DOM).
export interface AppFactSnapshot {
  nav: FactNav;
  headings: FactHeading[];
  buttons: FactButton[];
  inputs: FactInput[];
  tokens: FactTokens;
}

export interface FactDiff {
  screen: string;
  field: string;
  expected: string;
  actual: string;
  design: string;
  app: string;
}

export interface ScreenTableEntry {
  screen: string;
  route: string;
  viewHook: string;
}

// Manifest screen order (docs/design/manifest.json `order`,
// `.dc.html` suffix stripped) with the app route and view root hook
// per screen (hooks match `app/src/views/*` and the schema examples).
export const SCREEN_TABLE: readonly ScreenTableEntry[] = [
  { screen: 'Main', route: '/', viewHook: 'desk-view' },
  { screen: 'Stay', route: '/stay', viewHook: 'stay-view' },
  { screen: 'Onboarding', route: '/onboarding', viewHook: 'onboarding-view' },
  { screen: 'Rooms', route: '/rooms', viewHook: 'rooms-view' },
  { screen: 'Book', route: '/book', viewHook: 'book-view' },
  { screen: 'Folio', route: '/folio', viewHook: 'folio-view' },
];

// Decided per-screen content (issue #473, extend-the-design for
// Stay, Rooms, and Book; issue #479 adds the Main room-map
// section, which has no board counterpart yet). The #467 gate deliberately deferred
// full-record live parity because the views carry richer content
// than the boards; #473 records the product decision (the app's
// operational content stands, the boards now carry the same static
// content) and this table pins what the live spec asserts per
// screen:
//
// - `headings` / `inputs`: exact sequences in DOM order. Data-driven
//   repetitions and flow-state panels stay out (stay list rows with
//   per-row pick buttons, room-card bodies, the stay approval
//   section and checkout dialog, the book quote/result/confirmation
//   sections, conditional housekeeping buttons): those remain covered
//   by their flow specs (`stay.spec.ts`, `book.spec.ts`,
//   `desk.spec.ts`).
// - `buttons`: required-label subset. The live DOM legitimately
//   renders extras (per-row pick buttons, dialog confirmations), so
//   the gate asserts presence, never exact equality.
// - Rooms room-number headings are seed data, not static copy:
//   `deploy/seed/boot.sql` seeds exactly rooms 101 and 102 on floor
//   1, and no desk flow creates rooms, so the live sequence pins
//   those two numbers.
export interface DecidedScreenContent {
  screen: string;
  headings: FactHeading[];
  buttons: string[];
  inputs: FactInput[];
  // Rooms and Main only: the exact leading headings. The tail is
  // data-driven (floor sections from room payloads, room-number
  // cards per room), so the gate checks it structurally instead:
  // every remaining h2 is a floor title or the unknown-floor
  // caption, every h3 is a non-empty room label, and
  // `requiredRoomLabels` (seed-anchored) all render. The installer
  // desk loop upserts two floorless E2E rooms, so the live tail
  // always carries the unknown-floor section plus those extras —
  // exact tail equality would couple the gate to that fixture.
  headingPrefix?: FactHeading[];
  requiredRoomLabels?: string[];
}

export const DECIDED_CONTENT: readonly DecidedScreenContent[] = [
  {
    // Main (Refs #479, #489): the desk screen pins its static heading
    // prefix — dashboard cards, the five-lane board, then the
    // embedded room-map section heads — while the data-driven tail
    // (floor sections from room payloads, room-number links per
    // room) follows the same structural rule as Rooms. Seed rooms
    // 101 and 102 anchor the required labels. Refs #489 removed the
    // legacy backup-report h2 (no design counterpart; the report
    // belongs to the owner/manager via the admin audit surface) and
    // records the deliberately kept extras here so their return is
    // a gate failure: the h1 plus intro (screen title), the merged
    // need-cleaning card (the design's dirty plus awaiting-inspection
    // content with the same two buttons), the cross-check line, the
    // #371 five-lane board, and the #479 room map (alignment owned
    // by #491).
    screen: 'Main',
    headings: [],
    headingPrefix: [
      { level: 1, text: 'Lễ tân hôm nay: khách đến, lưu trú và phòng cần chú ý' },
      { level: 2, text: 'Khách đến hôm nay' },
      { level: 2, text: 'Đang lưu trú' },
      { level: 2, text: 'Khách đi hôm nay' },
      { level: 2, text: 'Phòng cần dọn' },
      { level: 3, text: 'Phòng bẩn' },
      { level: 3, text: 'Sạch nhưng chưa kiểm tra' },
      { level: 2, text: 'Ngưng bán' },
      { level: 2, text: 'Bảng trạng thái phòng' },
      { level: 3, text: 'Đang có khách' },
      { level: 3, text: 'Sẵn sàng (đã kiểm tra)' },
      { level: 3, text: 'Sạch, chờ kiểm tra' },
      { level: 3, text: 'Phòng bẩn' },
      { level: 3, text: 'Ngưng bán' },
      { level: 2, text: 'Sơ đồ phòng' },
      { level: 2, text: 'Phòng theo trạng thái' },
    ],
    requiredRoomLabels: ['101', '102'],
    buttons: ['Tải lại'],
    inputs: [],
  },
  {
    screen: 'Stay',
    headings: [
      { level: 1, text: 'Nhận phòng, chuyển phòng và trả phòng cho khách' },
      { level: 2, text: 'Danh sách lưu trú theo ngày làm việc' },
      { level: 3, text: 'Khách đến hôm nay' },
      { level: 3, text: 'Đang lưu trú' },
      { level: 3, text: 'Khách đi hôm nay' },
      { level: 2, text: 'Nhận phòng cho khách đến' },
      { level: 2, text: 'Chuyển phòng giữa kỳ lưu trú' },
      { level: 2, text: 'Ghi nhận đến sớm và đi trễ' },
      { level: 2, text: 'Trả phòng kèm đối chiếu bảng kê' },
    ],
    buttons: ['Tải lại', 'Nhận phòng', 'Chuyển phòng', 'Ghi nhận giờ', 'Đối chiếu bảng kê', 'Trả phòng'],
    inputs: [
      { kind: 'text', label: 'Mã đặt phòng:', placeholder: null },
      { kind: 'text', label: 'Giờ đến thực tế (để trống nếu chưa cần):', placeholder: null },
      { kind: 'select', label: 'Phòng sẵn sàng:', placeholder: 'Hãy chọn một phòng sẵn sàng…' },
      { kind: 'text', label: 'Mã lưu trú:', placeholder: null },
      { kind: 'select', label: 'Chuyển đến phòng:', placeholder: null },
      { kind: 'text', label: 'Mã lưu trú:', placeholder: null },
      { kind: 'text', label: 'Giờ đến thực tế (để trống nếu chưa cần):', placeholder: null },
      { kind: 'text', label: 'Giờ đi thực tế (để trống nếu chưa cần):', placeholder: null },
      { kind: 'text', label: 'Mã lưu trú:', placeholder: null },
      { kind: 'text', label: 'Giờ đi thực tế (để trống nếu chưa cần):', placeholder: null },
    ],
  },
  {
    screen: 'Rooms',
    headings: [],
    headingPrefix: [
      { level: 1, text: 'Sơ đồ phòng' },
      { level: 2, text: 'Phòng theo trạng thái' },
      { level: 2, text: 'Tầng 1' },
    ],
    requiredRoomLabels: ['101', '102'],
    buttons: ['Tải lại'],
    inputs: [],
  },
  {
    screen: 'Book',
    headings: [
      { level: 1, text: 'Đặt phòng' },
      { level: 2, text: 'Đặt phòng mới' },
      { level: 2, text: 'Khách' },
      { level: 2, text: 'Giá đã báo' },
      { level: 2, text: 'Lưu trú' },
    ],
    buttons: ['Tìm khách', 'Đăng ký khách vãng lai', 'Lấy báo giá'],
    inputs: [
      { kind: 'text', label: 'Tên khách:', placeholder: null },
      { kind: 'text', label: 'Mã khách:', placeholder: null },
      { kind: 'text', label: 'Ngày đến:', placeholder: null },
      { kind: 'text', label: 'Ngày đi:', placeholder: null },
      { kind: 'select', label: 'Hạng phòng:', placeholder: 'Chọn hạng phòng…' },
      { kind: 'text', label: 'Gói giá (để trống khi chỉ một gói áp giá cho hạng phòng này):', placeholder: null },
      { kind: 'text', label: 'Giảm giá (không bắt buộc):', placeholder: null },
    ],
  },
];
// Shell route-name tab keys to design tab keys. Refs #472: the
// visible shell nav is exactly the six design header tabs, so every
// key here has a design counterpart. Onboarding/rooms are tab-less
// deep routes (no design-header tab) and map to nothing — they are
// excluded from label/active comparisons in the live spec.
export const ROUTE_KEY_TO_DESIGN_KEY: Record<string, string> = {
  desk: 'Main',
  stay: 'Stay',
  book: 'Book',
  folio: 'Folio',
  print: 'print',
  admin: 'admin',
};

// Schema section 5 text normalisation, identical on both sides: NFC,
// collapse interior whitespace runs, strip ends, no case folding.
export function normaliseText(text: string): string {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// Dynamic-data exclusion (schema section 5): parenthesised counts
// (`Khách đến hôm nay (2)` -> `Khách đến hôm nay`) are stripped.
export function stripCountSuffix(text: string): string {
  return text.replace(/\s*\(\d+\)\s*$/, '').trim();
}

// Headings record the static prefix only: dynamic context after `·`
// (guest names, room refs) never enters a fact.
export function staticPrefix(text: string): string {
  const cut = text.indexOf('·');
  return (cut === -1 ? text : text.slice(0, cut)).trim();
}

export function normaliseHeadingText(raw: string): string {
  return staticPrefix(stripCountSuffix(normaliseText(raw)));
}

// Schema section 5 colour normalisation: `#rgb` expands, case folds
// to lowercase, opaque `rgb()/rgba()` converts to hex. Anything else
// (gradients, transparency, `currentColor`, system colors) is a loud
// error, never a silent pass.
export function normaliseColour(raw: string, context: string): string {
  const value = raw.trim().toLowerCase();
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
    if (alpha !== 1) {
      throw new Error(
        `design-facts: non-opaque colour "${raw}" (${context}); gradients, transparency, and currentColor are unsupported`,
      );
    }
    const parts = [rgb[1], rgb[2], rgb[3]].map((n) => {
      const v = Number(n);
      if (!Number.isInteger(v) || v < 0 || v > 255) {
        throw new Error(`design-facts: colour out of range "${raw}" (${context})`);
      }
      return v.toString(16).padStart(2, '0');
    });
    return `#${parts.join('')}`;
  }
  throw new Error(
    `design-facts: unparsable colour "${raw}" (${context}); gradients, transparency, and currentColor are unsupported`,
  );
}

// Browser-side extraction.

// Browser-side extraction. This function is serialised into the page
// by `page.evaluate`, so it must stay self-contained: no imports, no
// closure references, DOM APIs only. Mirrors the design-side rules
// (wrapping label minus control text, `aria-label`, closest
// preceding heading; select placeholder only for a prompt-like first
// option with no preselected option; icon-only buttons and labelless
// controls fail loudly).
export function collectAppFacts(viewHook: string): AppFactSnapshot {
  const norm = (value: string): string =>
    value.normalize('NFC').replace(/\s+/g, ' ').trim();
  const stripCount = (value: string): string =>
    value.replace(/\s*\(\d+\)\s*$/, '').trim();
  const prefix = (value: string): string => {
    const cut = value.indexOf('·');
    return (cut === -1 ? value : value.slice(0, cut)).trim();
  };
  const headingText = (raw: string): string => prefix(stripCount(norm(raw)));

  const navRoot = document.querySelector('[data-testid="shell-nav"]');
  const order: string[] = [];
  const labels: Record<string, string> = {};
  let active = '';
  if (navRoot !== null) {
    const tabs = navRoot.querySelectorAll('a[data-testid^="shell-nav-"]');
    tabs.forEach((tab) => {
      const testid = tab.getAttribute('data-testid') ?? '';
      const key = testid.replace(/^shell-nav-/, '');
      if (key === '' || key === testid) return;
      order.push(key);
      labels[key] = norm(tab.textContent ?? '');
      if (tab.classList.contains('shell-nav-active')) active = key;
    });
  }

  const view = document.querySelector(`[data-testid="${viewHook}"]`);
  if (view === null) {
    throw new Error(`design-facts: view root [data-testid="${viewHook}"] not found`);
  }

  const headings: FactHeading[] = [];
  view.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((node) => {
    headings.push({
      level: Number(node.tagName.slice(1)),
      text: headingText(node.textContent ?? ''),
    });
  });

  const buttons: FactButton[] = [];
  view.querySelectorAll('button').forEach((node) => {
    const label = norm(node.textContent ?? '');
    if (label === '') {
      throw new Error(
        `design-facts: icon-only button with no visible text is out of schema scope and must fail loudly`,
      );
    }
    buttons.push({ label });
  });

  const controlLabel = (control: Element): string => {
    const wrapping = control.closest('label');
    if (wrapping !== null) {
      const parts: string[] = [];
      const collect = (node: Node): void => {
        if (node.nodeType === Node.TEXT_NODE) {
          parts.push(node.textContent ?? '');
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (tag === 'script' || tag === 'style') return;
        el.childNodes.forEach(collect);
      };
      wrapping.childNodes.forEach(collect);
      const label = norm(parts.join(''));
      if (label !== '') return label;
    }
    const aria = control.getAttribute('aria-label');
    if (aria !== null && norm(aria) !== '') return norm(aria);
    const allHeadings = [...view.querySelectorAll('h1,h2,h3,h4,h5,h6')];
    let best: Element | null = null;
    for (const candidate of allHeadings) {
      if (
        candidate.compareDocumentPosition(control) &
        Node.DOCUMENT_POSITION_PRECEDING
      ) {
        best = candidate;
      }
    }
    if (best !== null) return headingText(best.textContent ?? '');
    throw new Error('design-facts: form control with no associated label text');
  };

  const inputs: FactInput[] = [];
  view.querySelectorAll('input,textarea,select').forEach((control) => {
    const tag = control.tagName.toLowerCase();
    if (tag === 'input' && (control.getAttribute('type') ?? '').toLowerCase() === 'hidden') {
      return;
    }
    if (tag === 'select') {
      const options = [...control.querySelectorAll('option')];
      const preselected = options.some((option) => option.hasAttribute('selected'));
      const firstCaption =
        options.length > 0 ? norm(options[0].textContent ?? '') : '';
      const placeholder =
        !preselected && firstCaption !== '' && /chọn|choose|select|\.\.\.|…/i.test(firstCaption)
          ? firstCaption
          : null;
      inputs.push({ kind: 'select', label: controlLabel(control), placeholder });
    } else {
      const raw = control.getAttribute('placeholder');
      const placeholder = raw === null || norm(raw) === '' ? null : norm(raw);
      inputs.push({ kind: 'text', label: controlLabel(control), placeholder });
    }
  });

  const computed = (el: Element | null, prop: string): string => {
    if (el === null) {
      throw new Error(`design-facts: missing element for computed style ${prop}`);
    }
    const value = getComputedStyle(el).getPropertyValue(prop);
    const parsed = value.trim().toLowerCase();
    const hex = parsed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/);
    if (hex) {
      const digits = hex[1];
      return digits.length === 3
        ? `#${digits.split('').map((c) => c + c).join('')}`
        : `#${digits}`;
    }
    const rgb = parsed.match(
      /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
    );
    if (rgb) {
      const alpha = rgb[4] === undefined ? 1 : Number(rgb[4]);
      if (alpha !== 1) {
        throw new Error(
          `design-facts: non-opaque computed colour "${value}" (${prop}); gradients, transparency, and currentColor are unsupported`,
        );
      }
      const parts = [rgb[1], rgb[2], rgb[3]].map((n) => {
        const v = Number(n);
        if (!Number.isInteger(v) || v < 0 || v > 255) {
          throw new Error(`design-facts: colour out of range "${value}" (${prop})`);
        }
        return v.toString(16).padStart(2, '0');
      });
      return `#${parts.join('')}`;
    }
    throw new Error(
      `design-facts: unparsable computed colour "${value}" (${prop}); gradients, transparency, and currentColor are unsupported`,
    );
  };

  const shell = document.querySelector('#shell');
  const firstButton = view.querySelector('button');
  return {
    nav: { order, labels, active },
    headings,
    buttons,
    inputs,
    tokens: {
      header: computed(navRoot, 'background-color'),
      primary: computed(firstButton, 'background-color'),
      page: computed(shell, 'background-color'),
      ink: computed(shell, 'color'),
    },
  };
}

// Field-by-field diff (schema section 4): `expected` always comes
// from the design extraction, `actual` always from the app DOM;
// every failing fact cites the design `file:line` and the app
// selector so a reader can open both nodes without searching.
export function diffFactRecords(
  record: DesignScreenRecord,
  actual: AppFactSnapshot,
): FactDiff[] {
  const diffs: FactDiff[] = [];
  const push = (
    field: string,
    expected: unknown,
    observed: unknown,
    design: string,
    app: string,
  ): void => {
    const left = JSON.stringify(expected);
    const right = JSON.stringify(observed);
    if (left !== right) {
      diffs.push({
        screen: record.screen,
        field,
        expected: left,
        actual: right ?? '(absent)',
        design,
        app,
      });
    }
  };

  push('nav.order', record.nav.order, actual.nav.order, record.nav.design, record.nav.app);
  const labelKeys = [...new Set([...Object.keys(record.nav.labels), ...Object.keys(actual.nav.labels)])].sort();
  for (const key of labelKeys) {
    push(
      `nav.labels.${key}`,
      record.nav.labels[key] ?? '(absent)',
      actual.nav.labels[key] ?? '(absent)',
      record.nav.design,
      record.nav.app,
    );
  }
  push(
    'nav.active',
    record.nav.active,
    actual.nav.active,
    record.nav.design,
    `${record.nav.app} .shell-nav-active`,
  );

  const headingCount = Math.max(record.headings.length, actual.headings.length);
  for (let i = 0; i < headingCount; i += 1) {
    const expected = record.headings[i];
    const observed = actual.headings[i];
    push(
      `headings[${i}].level`,
      expected?.level ?? '(absent)',
      observed?.level ?? '(absent)',
      expected?.design ?? `${record.designFile}:1`,
      expected?.app ?? `[data-testid="${SCREEN_TABLE.find((s) => s.screen === record.screen)?.viewHook ?? 'unknown-view'}"] h1`,
    );
    push(
      `headings[${i}].text`,
      expected?.text ?? '(absent)',
      observed?.text ?? '(absent)',
      expected?.design ?? `${record.designFile}:1`,
      expected?.app ?? `[data-testid="${SCREEN_TABLE.find((s) => s.screen === record.screen)?.viewHook ?? 'unknown-view'}"] h1`,
    );
  }

  const buttonCount = Math.max(record.buttons.length, actual.buttons.length);
  for (let i = 0; i < buttonCount; i += 1) {
    const expected = record.buttons[i];
    const observed = actual.buttons[i];
    push(
      `buttons[${i}].label`,
      expected?.label ?? '(absent)',
      observed?.label ?? '(absent)',
      expected?.design ?? `${record.designFile}:1`,
      expected?.app ?? `[data-testid="${SCREEN_TABLE.find((s) => s.screen === record.screen)?.viewHook ?? 'unknown-view'}"] button`,
    );
  }

  const inputCount = Math.max(record.inputs.length, actual.inputs.length);
  for (let i = 0; i < inputCount; i += 1) {
    const expected = record.inputs[i];
    const observed = actual.inputs[i];
    const fallbackApp = `[data-testid="${SCREEN_TABLE.find((s) => s.screen === record.screen)?.viewHook ?? 'unknown-view'}"] input`;
    push(`inputs[${i}].kind`, expected?.kind ?? '(absent)', observed?.kind ?? '(absent)', expected?.design ?? `${record.designFile}:1`, expected?.app ?? fallbackApp);
    push(`inputs[${i}].label`, expected?.label ?? '(absent)', observed?.label ?? '(absent)', expected?.design ?? `${record.designFile}:1`, expected?.app ?? fallbackApp);
    push(
      `inputs[${i}].placeholder`,
      expected?.placeholder ?? null,
      observed?.placeholder ?? null,
      expected?.design ?? `${record.designFile}:1`,
      expected?.app ?? fallbackApp,
    );
  }

  // Tokens carry no per-fact provenance in the record shape (the
  // schema's example shows plain hexes), so token diffs cite the
  // design file: the colour is parsed from several inline styles and
  // is file-level, not node-level.
  for (const key of ['header', 'primary', 'page', 'ink'] as const) {
    push(`tokens.${key}`, record.tokens[key], actual.tokens[key], record.designFile, '[data-testid="shell-nav"]');
  }
  return diffs;
}

// Mismatch failures render as diffs (schema section 4): one block
// per failing fact with the design node `file:line` and the app
// selector. Returns '' when there are no diffs.
export function formatFactDiffs(diffs: FactDiff[]): string {
  return diffs
    .map(
      (diff) =>
        `[${diff.screen}] ${diff.field} mismatch\n` +
        `  expected: ${diff.expected}\n` +
        `  actual:   ${diff.actual}\n` +
        `  design:   ${diff.design}\n` +
        `  app:      ${diff.app}`,
    )
    .join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Fixture builder: renders a matching app-like DOM from a design
// record (same view-hook roots, shell nav, and token-colored
// elements the live app uses) so the check passes on a matching DOM
// for every screen without depending on backend state. The live
// Chromium engine still computes every style, so token assertions
// stay computed-style assertions, not string comparisons.
export function buildMatchingDom(record: DesignScreenRecord, viewHook: string): string {
  const tabs = record.nav.order
    .map((key) => {
      const label = record.nav.labels[key] ?? '';
      const isActive = key === record.nav.active;
      const activeStyle =
        isActive && record.nav.order.length > 0
          ? ` style="background:#ffffff;color:${record.tokens.header}"`
          : '';
      return `<a data-testid="shell-nav-${escapeHtml(key)}" class="shell-nav-item${isActive ? ' shell-nav-active' : ''}"${activeStyle}>${escapeHtml(label)}</a>`;
    })
    .join('');
  const headings = record.headings
    .map((heading) => `<h${heading.level}>${escapeHtml(heading.text)}</h${heading.level}>`)
    .join('');
  const buttons = record.buttons
    .map(
      (button, index) =>
        `<button type="button"${index === 0 ? ` style="background:${record.tokens.primary}"` : ''}>${escapeHtml(button.label)}</button>`,
    )
    .join('');
  const inputs = record.inputs
    .map((input) => {
      if (input.kind === 'select') {
        const options =
          input.placeholder !== null
            ? `<option value="">${escapeHtml(input.placeholder)}</option><option value="opt-1">Lựa chọn 1</option>`
            : `<option selected>Đã chọn</option>`;
        return `<label><span>${escapeHtml(input.label)}</span><select>${options}</select></label>`;
      }
      const placeholder =
        input.placeholder !== null ? ` placeholder="${escapeHtml(input.placeholder)}"` : '';
      return `<label><span>${escapeHtml(input.label)}</span><input type="text"${placeholder}></label>`;
    })
    .join('');
  return (
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"></head>` +
    `<body><div id="shell" style="background:${record.tokens.page};color:${record.tokens.ink}">` +
    `<nav data-testid="shell-nav" style="background:${record.tokens.header}">${tabs}</nav>` +
    `<main data-testid="${escapeHtml(viewHook)}">${headings}${buttons}${inputs}</main>` +
    `</div></body></html>`
  );
}
