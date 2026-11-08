// DOM-vs-design comparison for the six covered desk screens (Closes #467).
//
// App-side counterpart of the design-side extractor
// (`tests/design-facts/extract-design-facts.mjs`, issue #466). Both
// sides implement the contract in
// `docs/technical/desk-ui-fact-schema.md` (schemaVersion 1, owned by
// `architect`): the design side decodes the v2 bundler template
// embedded in each `docs/design/*.dc.html` board (Refs #538, Refs
// #548 — the inline React runtime scripts are never executed and
// never enter facts) and parses the design markup only, while this
// module extracts the same fact shape from the live Chromium DOM
// through Playwright and diffs the two field-by-field.
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
// definitive table (`Lễ tân` -> `Main`, `Sơ đồ phòng` -> `Rooms`,
// `Đặt phòng` -> `Book`, `Lưu trú` -> `Stay`,
// `Hoá đơn` -> `Folio`, `In` -> `print`,
// `Quản trị` -> `admin`); the shell route names map onto the screen
// keys through ROUTE_KEY_TO_DESIGN_KEY where a tab exists on both
// sides. Refs #539: the visible shell nav is exactly the seven
// design header tabs, so every design tab key has a shell
// route-name counterpart; onboarding is the tab-less deep route
// and maps to nothing — see the live spec.

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
// All seven v2 manifest screens: the Admin board (`Quản trị`) joined
// with its `admin-view` hook when #546 landed (the extractor already
// emitted `Admin.facts.json`, Refs #549), so both gates assert it.
export const SCREEN_TABLE: readonly ScreenTableEntry[] = [
  { screen: 'Main', route: '/', viewHook: 'desk-view' },
  { screen: 'Stay', route: '/stay', viewHook: 'stay-view' },
  { screen: 'Onboarding', route: '/onboarding', viewHook: 'onboarding-view' },
  { screen: 'Rooms', route: '/rooms', viewHook: 'rooms-view' },
  { screen: 'Book', route: '/book', viewHook: 'book-view' },
  { screen: 'Folio', route: '/folio', viewHook: 'folio-view' },
  { screen: 'Admin', route: '/admin', viewHook: 'admin-view' },
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
// - `tables` (Main only, Refs #490): exact two-column header
//   sequences in DOM order plus the empty-state wording; every data
//   row must carry one cell per header. Row bodies stay structural
//   because names, codes, and dates are dynamic data (out of schema
//   scope); row content shapes are pinned by the Vitest suite.
// - `roomMap` (Main only, Refs #491): the five status chips in
//   decided order plus structural counts (each chip count equals
//   its card count), floor-group titles, and one card per room
//   carrying its number, status chip, type line, and note line.
//   Chip labels pin the catalogue wording; type/note bodies stay
//   structural (occupants, dates, block reasons are dynamic) with
//   content shapes pinned by `DeskView.test.ts`.
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
  // Main only (Refs #490): the decided table shapes below.
  tables?: DecidedTable[];
  // Main only (Refs #491): the decided room-map shapes below.
  roomMap?: DecidedRoomMap;
}

export const DECIDED_CONTENT: readonly DecidedScreenContent[] = [
  {
    // Main (Refs #479, #489, #540): the desk screen pins its static
    // heading prefix — dashboard cards, the five-lane board, then the
    // embedded room-map section heads — while the data-driven tail
    // (floor sections from room payloads, room-number links per
    // room) follows the same structural rule as Rooms. Seed rooms
    // 101 and 102 anchor the required labels. Refs #489 removed the
    // legacy backup-report h2 (no design counterpart; the report
    // belongs to the owner/manager via the admin audit surface) and
    // records the deliberately kept extras here so their return is
    // a gate failure: the h1 plus intro (screen title), the unified
    // clean-up list (Refs #540: one mixed list holding the design's
    // dirty plus awaiting-inspection rows with per-row buttons — the
    // old split h3 subsections are gone), the cross-check line, the
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
    // Refs #490: the three stay tables pin their two-column header
    // order plus the empty-state wording (vi gate locale), matching
    // the two-cell card rows in docs/design/Main.dc.html.
    tables: [
      {
        testId: 'desk-arrivals-table',
        headers: ['Khách', 'Hạng phòng'],
        empty: 'Hôm nay không có khách đến. Đặt phòng mới sẽ hiện ở đây.',
        design: 'docs/design/Main.dc.html:3',
        emptyDesign: 'messages/vi.json:desk.today.empty_arrivals',
      },
      {
        testId: 'desk-inhouse-table',
        headers: ['Khách', 'Trả phòng'],
        empty: 'Hiện không có khách đang lưu trú.',
        design: 'docs/design/Main.dc.html:3',
        emptyDesign: 'messages/vi.json:desk.today.empty_inhouse',
      },
      {
        testId: 'desk-departures-table',
        headers: ['Khách', 'Hạng phòng'],
        empty: 'Hôm nay chưa có khách trả phòng.',
        design: 'docs/design/Main.dc.html:3',
        emptyDesign: 'docs/design/Main.dc.html:3',
      },
    ],
    // Refs #491: the room-map chips pin the five catalogue labels
    // in status order; counts, floor groups, and card internals are
    // asserted structurally by `diffRoomMapFacts` (counts equal
    // cards, every floor is a floor title, every card carries
    // number, chip, type, and note).
    roomMap: {
      chips: [
        'Sẵn sàng (đã kiểm tra)',
        'Đang có khách',
        'Phòng bẩn',
        'Sạch, chờ kiểm tra',
        'Ngưng bán',
      ],
      design: 'docs/design/Rooms.dc.html:3',
    },
  },
  {
    // Stay v2 board (Refs #541, bundle 07-11): the two-panel
    // screen pins its two h3 titles, the two static action
    // labels, and the four panel controls in DOM order. The
    // pre-v2 lists, move, and times sections are gone (zero
    // extras); the review-to-checkout flow state (approval
    // form, check-out button, confirm dialog) stays out of the
    // decided set per the flow-state rule above. Refs #567: the
    // reviewer control is the role select the #563 audit asked
    // for (`G-ST-1`), so its decided kind is `select` and its
    // first catalogue option reads as the label, not a
    // placeholder.
    screen: 'Stay',
    headings: [
      { level: 3, text: 'Nhận phòng' },
      { level: 3, text: 'Trả phòng' },
    ],
    buttons: ['Nhận phòng', 'Xem hoá đơn'],
    inputs: [
      { kind: 'select', label: 'Khách đến', placeholder: 'Chọn khách đến...' },
      { kind: 'select', label: 'Phòng', placeholder: 'Chọn phòng...' },
      { kind: 'select', label: 'Khách đi', placeholder: 'Chọn khách đi...' },
      { kind: 'select', label: 'Người duyệt', placeholder: null },
    ],
  },
  {
    // Onboarding v2 board (Refs #542, bundle 07-11): the drawn
    // step-1 screen pins its h3 title, the single Continue
    // action label, and the bare hotel-name input (label falls
    // back to the preceding h3 per the extractor, the app names
    // it through the same catalogue string via aria-label) with
    // the board example placeholder. Steps 2–4 are post-continue
    // flow state with no board counterpart and stay out of the
    // decided set per the flow-state rule above.
    screen: 'Onboarding',
    headings: [
      { level: 3, text: 'Tên khách sạn' },
    ],
    buttons: ['Tiếp tục'],
    inputs: [
      { kind: 'text', label: 'Tên khách sạn', placeholder: 'Ví dụ: Khách sạn Hoa Mai' },
    ],
  },
  {
    // Rooms v2 board (Refs #543, bundle 07-11): the drawn head
    // block is the `{title} · {date}` eyebrow (kept as the page
    // h1, so the prefix still opens on the catalogue title) above
    // the live `{total} · {occupied}` counts headline — dynamic
    // data, out of the decided set per schema section 5 — with the
    // board-literal `Làm mới` action. The v1 intro, standalone
    // date row, and `Phòng theo trạng thái` section heading are
    // gone (zero extras). The tail rule below still checks the
    // data-driven floor sections and room-number cards exactly as
    // before.
    screen: 'Rooms',
    headings: [],
    headingPrefix: [
      { level: 1, text: 'Sơ đồ phòng' },
      { level: 2, text: 'Tầng 1' },
    ],
    requiredRoomLabels: ['101', '102'],
    buttons: ['Làm mới'],
    inputs: [],
  },
  {
    // Book (Refs #544, v2 board `docs/design/Book.dc.html:3`): the
    // screen heads straight into the numbered h3 cards with no
    // screen title and no section heading — zero extras vs the
    // board. The guest card carries the name input plus the
    // board-literal find/register actions; the stay card carries
    // arrival, departure, the catalogue-driven room-type select
    // (placeholder pinned — the static label stays board-literal),
    // and discount plus the quote action. The quote-card confirm
    // stays out (post-quote flow state — the gate asserts the
    // fresh-screen button subset only, covered by `book.spec.ts`
    // once quoted). The guest-ID and rate-plan inputs are
    // gone (orchestrator decision on #544), as are the v1 helper
    // notes. The quote/result/confirmation sections plus the
    // readout and error lines stay out as flow state (covered by
    // `book.spec.ts`).
    screen: 'Book',
    headings: [
      { level: 3, text: '1. Khách' },
      { level: 3, text: 'Báo giá' },
      { level: 3, text: '2. Ngày và phòng' },
    ],
    buttons: ['Tìm', 'Đăng ký khách mới', 'Lấy báo giá'],
    inputs: [
      { kind: 'text', label: 'Tên khách', placeholder: null },
      { kind: 'text', label: 'Ngày đến', placeholder: null },
      { kind: 'text', label: 'Ngày đi', placeholder: null },
      { kind: 'select', label: 'Loại phòng', placeholder: 'Chọn loại phòng…' },
      { kind: 'text', label: 'Giảm giá', placeholder: null },
    ],
  },
  {
    // Folio (Refs #545, v2 board `docs/design/Folio.dc.html:3`):
    // the screen heads straight into the stay-ID open step (F3
    // flow state, orchestrator decision on #545 — the only
    // in-app path to a folio) above the two board cards with no
    // screen title and no section heading — zero extras vs the
    // board. The charges card carries the `Khoản phí` h3, the
    // board-literal description/amount inputs, and the `Ghi khoản
    // phí` action; the payments card carries the `Thanh toán` h3,
    // the due block, and the `Ghi thanh toán` action. The
    // charge-kind and payment-method selects stay inline as flow
    // state (`PostCharge` requires `itemKind`, `RecordPayment`
    // requires `method` — same decision), so both ride the
    // decided input sequence in DOM order. Charge/payment lines,
    // the balance readouts, and the error lines stay out as flow
    // state (covered by `folio.spec.ts`).
    screen: 'Folio',
    headings: [
      { level: 3, text: 'Mở bảng kê lưu trú' },
      { level: 3, text: 'Khoản phí' },
      { level: 3, text: 'Thanh toán' },
    ],
    buttons: ['Mở bảng kê', 'Ghi khoản phí', 'Ghi thanh toán'],
    inputs: [
      { kind: 'text', label: 'Mã lưu trú:', placeholder: null },
      { kind: 'select', label: 'Loại phí:', placeholder: null },
      { kind: 'text', label: 'Mô tả', placeholder: null },
      { kind: 'text', label: 'Số tiền', placeholder: null },
      { kind: 'select', label: 'Hình thức:', placeholder: null },
      { kind: 'text', label: 'Số tiền', placeholder: null },
    ],
  },
  {
    // Admin (Refs #546, v2 board `docs/design/Admin.dc.html:3`):
    // the screen heads straight into the top `1.2fr 1fr` grid
    // with no screen title and no section heading — zero extras
    // vs the board. The users card carries the `Người dùng và vai
    // trò` h3 with one row per account, the create-account card
    // the `Tạo tài khoản mới` h3 with the board-literal inputs
    // and the `Tạo tài khoản` action, the config card the `Cấu
    // hình khách sạn` h3, and the audit card the `Nhật ký thao
    // tác` h3 with the `Làm mới` action. User rows, the config
    // values, and the audit summaries render live data in the
    // board row shape (dynamic data, out of schema scope); the
    // locked-row Unlock action stays out of the decided buttons
    // because it renders only for locked accounts. The row role
    // selects stay inline as flow state (`UpdateUserRole`
    // requires a target role — same precedent as the Folio
    // kind/method selects), so the single lab-user select rides
    // the decided input sequence in DOM order. The lab runs the
    // gate with exactly the boot-owner account: `signin.spec.ts`
    // creates its lock-victim later in file order, and no earlier
    // spec creates users, so the decided sequence pins exactly
    // one row select (same cross-spec lab discipline as the Main
    // seed room labels, Refs #490).
    screen: 'Admin',
    headings: [
      { level: 3, text: 'Người dùng và vai trò' },
      { level: 3, text: 'Tạo tài khoản mới' },
      { level: 3, text: 'Cấu hình khách sạn' },
      { level: 3, text: 'Nhật ký thao tác' },
    ],
    buttons: ['Lưu', 'Tạo tài khoản', 'Làm mới'],
    inputs: [
      { kind: 'select', label: 'Người dùng và vai trò', placeholder: null },
      { kind: 'text', label: 'Tên', placeholder: null },
      { kind: 'text', label: 'Tên đăng nhập', placeholder: null },
      { kind: 'text', label: 'Mật khẩu ban đầu', placeholder: null },
      { kind: 'select', label: 'Vai trò', placeholder: null },
    ],
  },
];
// Decided table shape for a Main desk card (Refs #490): the exact
// column-header sequence left to right plus the exact empty-state
// wording, both in the gate locale (vi). Row bodies stay structural
// (every data row carries one cell per header) because names, codes,
// and dates are dynamic data, out of schema scope per section 5 —
// row content shapes are pinned by `app/src/views/DeskView.test.ts`
// instead. The departures empty state repeats the design card
// (`Hôm nay chưa có khách trả phòng.`); the arrivals/in-house cards
// are non-empty in the design, so their empty wording is pinned to
// the catalogue entries instead.
export interface DecidedTable {
  testId: string;
  headers: string[];
  empty: string;
  design: string;
  emptyDesign: string;
}
// Decided room-map shapes (Refs #491): the desk room-map section
// mirrors the design Rooms board (`docs/design/Rooms.dc.html`) —
// five status chips with counts, floor groups, and one card per
// room carrying its number, status chip, type line, and live note
// line. Chips pin the catalogue wording in the gate locale (vi):
// the design illustration carries bare labels (`Sẵn sàng`,
// `Có khách`, ...) while the app shares the qualified /rooms
// vocabulary (`Sẵn sàng (đã kiểm tra)`, `Đang có khách`, ...) —
// same precedent as the #490 table empty states. Counts stay
// structural (each chip count equals its card count) because counts
// are dynamic data out of schema scope; card type/note bodies stay
// structural for the same reason (occupant names, dates, and block
// reasons are dynamic) while `DeskView.test.ts` pins their content
// shapes.
export interface DecidedRoomMap {
  chips: string[];
  design: string;
}

export interface RoomMapChipFact {
  label: string;
  count: number;
}

export interface RoomMapCardFact {
  number: string;
  chip: string;
  type: string;
  note: string;
}

export interface RoomMapFacts {
  chips: RoomMapChipFact[];
  floors: string[];
  cards: RoomMapCardFact[];
}
// Shell route-name tab keys to design tab keys. Refs #539: the
// visible shell nav is exactly the seven design header tabs, so
// every key here has a design counterpart. Onboarding is the
// tab-less deep route (no design-header tab) and maps to nothing —
// it is excluded from label/active comparisons in the live spec.
export const ROUTE_KEY_TO_DESIGN_KEY: Record<string, string> = {
  desk: 'Main',
  rooms: 'Rooms',
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

// Browser-side table extraction (Refs #490). This function is
// serialised into the page by `page.evaluate`, so it must stay
// self-contained: no imports, no closure references, DOM APIs only.
// Reads the PrimeVue DataTable header sequence plus one cell-text
// array per body row; a lone single-cell body row is the `#empty`
// message (data rows always carry one cell per header), reported as
// `empty` with no data rows. A multi-cell row that matches neither
// shape fails loudly instead of silently passing.
export function collectTableFacts(tableTestId: string): {
  headers: string[];
  rows: string[][];
  empty: string | null;
} {
  const norm = (value: string): string =>
    value.normalize('NFC').replace(/\s+/g, ' ').trim();
  const table = document.querySelector(`[data-testid="${tableTestId}"]`);
  if (table === null) {
    throw new Error(`design-facts: table [data-testid="${tableTestId}"] not found`);
  }
  const headers: string[] = [];
  table.querySelectorAll('thead th').forEach((cell) => {
    headers.push(norm(cell.textContent ?? ''));
  });
  const rows: string[][] = [];
  let empty: string | null = null;
  table.querySelectorAll('tbody tr').forEach((row) => {
    const cells = [...row.querySelectorAll('td')].map((cell) => norm(cell.textContent ?? ''));
    if (cells.length === 0) return;
    if (headers.length > 0 && cells.length === headers.length) {
      rows.push(cells);
    } else if (cells.length === 1) {
      empty = cells[0];
    } else {
      throw new Error(
        `design-facts: table [data-testid="${tableTestId}"] has a ${cells.length}-cell row against ${headers.length} headers`,
      );
    }
  });
  return { headers, rows, empty };
}

// Browser-side room-map extraction (Refs #491). This function is
// serialised into the page by `page.evaluate`, so it must stay
// self-contained: no imports, no closure references, DOM APIs only.
// Reads the five summary chips (label from the chip node, count
// from the trailing parenthesised number), the floor-group titles,
// and one fact per card (number, status chip, type line, note
// line). A chip with no trailing count fails loudly instead of
// passing silently.
export function collectRoomMapFacts(): RoomMapFacts {
  const norm = (value: string): string =>
    value.normalize('NFC').replace(/\s+/g, ' ').trim();
  const root = document.querySelector('[data-testid="desk-roommap"]');
  if (root === null) {
    throw new Error('design-facts: room map [data-testid="desk-roommap"] not found');
  }
  const chips: RoomMapChipFact[] = [];
  // The chip testid sits on the `li` itself (matching the
  // DeskView/RoomsView markup, where the PrimeVue Tag inside carries
  // no testid), so the label is the item text minus the trailing
  // count — robust against Tag internals on both surfaces.
  root.querySelectorAll('[data-testid="desk-roommap-summary"] li').forEach((item) => {
    const text = norm(item.textContent ?? '');
    const countMatch = text.match(/\((\d+)\)\s*$/);
    if (countMatch === null || countMatch.index === undefined) {
      throw new Error(
        'design-facts: room-map chip with no trailing count (expected "<label> (<n>)")',
      );
    }
    const label = text.slice(0, countMatch.index).trim();
    chips.push({ label, count: Number(countMatch[1]) });
  });
  const floors: string[] = [];
  root
    .querySelectorAll(
      '[data-testid="desk-roommap-floor"] h2, [data-testid="desk-roommap-floor-unknown"] h2',
    )
    .forEach((heading) => {
      floors.push(norm(heading.textContent ?? ''));
    });
  const cards: RoomMapCardFact[] = [];
  root.querySelectorAll('[data-testid^="desk-roommap-room-"]').forEach((card) => {
    const number = card.querySelector('h3');
    const chip = card.querySelector('[data-testid^="desk-roommap-card-chip-"]');
    const type = card.querySelector('[data-testid^="desk-roommap-card-type-"]');
    const note = card.querySelector('[data-testid^="desk-roommap-card-note-"]');
    cards.push({
      number: norm(number?.textContent ?? ''),
      chip: norm(chip?.textContent ?? ''),
      type: norm(type?.textContent ?? ''),
      note: norm(note?.textContent ?? ''),
    });
  });
  return { chips, floors, cards };
}

// Field-by-field room-map diff (Refs #491, schema section 4):
// `expected` always comes from the decided content, `actual` always
// from the app DOM; every failing fact cites the design `file:line`
// and the app selector so a reader can open both nodes without
// searching. Structural rules: chips match the decided labels in
// order with integer counts that equal their card counts; every
// floor is a floor title or the unknown-floor caption; every card
// carries a non-empty number, a decided status chip, and non-empty
// type and note lines.
export function diffRoomMapFacts(
  screen: string,
  decided: DecidedRoomMap,
  actual: RoomMapFacts,
  contentApp: string,
): FactDiff[] {
  const diffs: FactDiff[] = [];
  const push = (
    field: string,
    expected: unknown,
    observed: unknown,
    app: string,
  ): void => {
    const left = JSON.stringify(expected);
    const right = JSON.stringify(observed);
    if (left !== right) {
      diffs.push({
        screen,
        field,
        expected: left,
        actual: right ?? '(absent)',
        design: decided.design,
        app,
      });
    }
  };

  const chipsApp = `${contentApp}-summary li`;
  push(
    'roomMap.chips',
    decided.chips,
    actual.chips.map((chip) => chip.label),
    chipsApp,
  );
  for (const [index, chip] of actual.chips.entries()) {
    const cardsWithChip = actual.cards.filter((card) => card.chip === chip.label).length;
    push(
      `roomMap.chips[${index}].count`,
      cardsWithChip,
      chip.count,
      chipsApp,
    );
  }
  const floorsApp = `${contentApp} h2`;
  // Refs #491: a room map that dropped the floor section entirely
  // (chips intact) must fail the gate instead of passing silently.
  if (actual.floors.length === 0) {
    diffs.push({
      screen,
      field: 'roomMap.floors',
      expected: '"at least one floor group"',
      actual: '"(absent)"',
      design: decided.design,
      app: floorsApp,
    });
  }
  for (const [index, floor] of actual.floors.entries()) {
    const floorTitle = /^Tầng \S+$/.test(floor) || floor === 'Phòng chưa xếp tầng';
    if (!floorTitle) {
      diffs.push({
        screen,
        field: `roomMap.floors[${index}].text`,
        expected: 'a floor title ("Tầng <n>") or "Phòng chưa xếp tầng"',
        actual: JSON.stringify(floor),
        design: decided.design,
        app: floorsApp,
      });
    }
  }
  const cardsApp = `${contentApp} [data-testid^="desk-roommap-room-"]`;
  for (const [index, card] of actual.cards.entries()) {
    for (const key of ['number', 'type', 'note'] as const) {
      if (card[key] === '') {
        diffs.push({
          screen,
          field: `roomMap.cards[${index}].${key}`,
          expected: '"a non-empty card line"',
          actual: '"(absent)"',
          design: decided.design,
          app: cardsApp,
        });
      }
    }
    if (!decided.chips.includes(card.chip)) {
      diffs.push({
        screen,
        field: `roomMap.cards[${index}].chip`,
        expected: `one of ${JSON.stringify(decided.chips)}`,
        actual: JSON.stringify(card.chip === '' ? '(absent)' : card.chip),
        design: decided.design,
        app: cardsApp,
      });
    }
  }
  return diffs;
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
