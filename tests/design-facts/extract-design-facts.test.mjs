// Acceptance tests for the design-side UI fact extractor (issue #466).
//
// Runs the extractor over the committed docs/design boards into a fresh
// temporary directory and checks the four acceptance criteria plus the
// schema's determinism, provenance, and size-budget rules. Zero
// dependencies: node:test plus node:assert only.
//
//   node --test tests/design-facts/
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractScreenFacts,
  parseHtml,
  runExtraction,
} from "./extract-design-facts.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..", "..");
const MANIFEST = JSON.parse(
  readFileSync(join(REPO_ROOT, "docs", "design", "manifest.json"), "utf8"),
);
const SCREENS = MANIFEST.order.map((file) => file.replace(/\.dc\.html$/, ""));
const DESIGN_LINE_PATTERN = /^docs\/design\/[A-Za-z]+\.dc\.html:\d+$/;

function extractToFreshDir() {
  const outDir = mkdtempSync(join(tmpdir(), "design-facts-"));
  const written = runExtraction({ repoRoot: REPO_ROOT, outDir });
  return { outDir, written };
}

function readRecords(outDir) {
  const records = {};
  for (const screen of SCREENS) {
    records[screen] = JSON.parse(
      readFileSync(join(outDir, `${screen}.facts.json`), "utf8"),
    );
  }
  return records;
}

function everyFact(records, visit) {
  for (const record of Object.values(records)) {
    visit(record.nav, "nav");
    for (const entry of record.headings) visit(entry, "headings");
    for (const entry of record.buttons) visit(entry, "buttons");
    for (const entry of record.inputs) visit(entry, "inputs");
  }
}

function assertNoNulls(value, path) {
  // Nullable union members (inputs[].placeholder) may be null; whole
  // fields stay [] or {} instead.
  if (value === null) {
    if (/\.placeholder$/.test(path)) return;
    assert.fail(`null at ${path}; empty fields stay [] or {}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNulls(item, `${path}[${index}]`));
  } else if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      assertNoNulls(item, `${path}.${key}`);
    }
  }
}

test("emits one record per manifest screen with the full schema shape", () => {
  const { outDir, written } = extractToFreshDir();
  assert.equal(written.length, 6);
  assert.deepEqual(
    readdirSync(outDir).sort(),
    SCREENS.map((screen) => `${screen}.facts.json`).sort(),
  );
  const records = readRecords(outDir);
  for (const screen of SCREENS) {
    const record = records[screen];
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.screen, screen);
    assert.equal(record.designFile, `docs/design/${screen}.dc.html`);
    assert.deepEqual(Object.keys(record), [
      "schemaVersion",
      "screen",
      "designFile",
      "nav",
      "headings",
      "buttons",
      "inputs",
      "tokens",
    ]);
    assert.deepEqual(Object.keys(record.nav), [
      "order",
      "labels",
      "active",
      "design",
      "app",
    ]);
    assert.deepEqual(Object.keys(record.tokens).sort(), [
      "header",
      "ink",
      "page",
      "primary",
    ]);
    assertNoNulls(record, screen);
  }
});

test("Main nav matches the schema example: order, labels, active tab", () => {
  const { outDir } = extractToFreshDir();
  const main = readRecords(outDir).Main;
  assert.deepEqual(main.nav.order, [
    "Main",
    "Book",
    "Stay",
    "Folio",
    "print",
    "admin",
  ]);
  assert.deepEqual(main.nav.labels, {
    Book: "Đặt phòng",
    Folio: "Hoá đơn",
    Main: "Lễ tân",
    Stay: "Lưu trú",
    admin: "Quản trị",
    print: "In",
  });
  assert.equal(main.nav.active, "Main");
});

test("active tab follows each board: Stay, Book, Folio; Rooms rests on Main", () => {
  const { outDir } = extractToFreshDir();
  const records = readRecords(outDir);
  assert.equal(records.Stay.nav.active, "Stay");
  assert.equal(records.Book.nav.active, "Book");
  assert.equal(records.Folio.nav.active, "Folio");
  assert.equal(records.Rooms.nav.active, "Main");
});

test("Onboarding has no tab bar and extracts an honest empty nav", () => {
  const { outDir } = extractToFreshDir();
  const nav = readRecords(outDir).Onboarding.nav;
  assert.deepEqual(nav.order, []);
  assert.deepEqual(nav.labels, {});
  assert.equal(nav.active, "");
  assert.match(nav.design, DESIGN_LINE_PATTERN);
});

test("headings strip parenthesised counts and dynamic trailing context", () => {
  const { outDir } = extractToFreshDir();
  const records = readRecords(outDir);
  assert.deepEqual(
    records.Main.headings.map((heading) => heading.text),
    [
      "Khách đến hôm nay",
      "Đang lưu trú",
      "Khách đi hôm nay",
      "Phòng cần dọn",
      "Chờ kiểm tra",
      "Phòng ngừng sử dụng",
    ],
  );
  for (const heading of records.Main.headings) assert.equal(heading.level, 3);
  // Folio charge heading carries the guest/room context in the board;
  // only the static prefix enters the fact.
  assert.equal(records.Folio.headings[0].text, "Khoản phí");
  assert.equal(records.Folio.headings[1].text, "Thanh toán");
});

test("inputs: labels, text placeholders, and select first-option captions", () => {
  const { outDir } = extractToFreshDir();
  const records = readRecords(outDir);
  assert.deepEqual(records.Onboarding.inputs, [
    {
      kind: "text",
      label: "Tên khách sạn",
      placeholder: "Ví dụ: Khách sạn Hoa Mai",
      design: "docs/design/Onboarding.dc.html:2",
      app: '[data-testid="onboarding-view"] input',
    },
  ]);
  assert.deepEqual(
    records.Stay.inputs.map((input) => [
      input.kind,
      input.label,
      input.placeholder,
    ]),
    // Decided #473 content: the check-in, move, times, and
    // check-out cards in app DOM order (the `Mã lưu trú:` label
    // repeats once per card, exactly as in the running view).
    [
      ["text", "Mã đặt phòng:", null],
      ["text", "Giờ đến thực tế (để trống nếu chưa cần):", null],
      ["select", "Phòng sẵn sàng:", "Hãy chọn một phòng sẵn sàng…"],
      ["text", "Mã lưu trú:", null],
      ["select", "Chuyển đến phòng:", null],
      ["text", "Mã lưu trú:", null],
      ["text", "Giờ đến thực tế (để trống nếu chưa cần):", null],
      ["text", "Giờ đi thực tế (để trống nếu chưa cần):", null],
      ["text", "Mã lưu trú:", null],
      ["text", "Giờ đi thực tế (để trống nếu chưa cần):", null],
    ],
  );
  assert.deepEqual(
    records.Book.inputs.map((input) => [
      input.kind,
      input.label,
      input.placeholder,
    ]),
    // Decided #473 content: guest card, then stay card in app DOM
    // order (rate plan before discount).
    [
      ["text", "Tên khách:", null],
      ["text", "Mã khách:", null],
      ["text", "Ngày đến:", null],
      ["text", "Ngày đi:", null],
      ["select", "Hạng phòng:", "Chọn hạng phòng…"],
      ["text", "Gói giá (để trống khi chỉ một gói áp giá cho hạng phòng này):", null],
      ["text", "Giảm giá (không bắt buộc):", null],
    ],
  );
  assert.deepEqual(records.Rooms.inputs, []);
});

test("decided #473 board content: headings and buttons per screen", () => {
  const { outDir } = extractToFreshDir();
  const records = readRecords(outDir);
  assert.deepEqual(
    records.Stay.headings.map((heading) => [heading.level, heading.text]),
    [
      [1, "Nhận phòng, chuyển phòng và trả phòng cho khách"],
      [2, "Danh sách lưu trú theo ngày làm việc"],
      [3, "Khách đến hôm nay"],
      [3, "Đang lưu trú"],
      [3, "Khách đi hôm nay"],
      [2, "Nhận phòng cho khách đến"],
      [2, "Chuyển phòng giữa kỳ lưu trú"],
      [2, "Ghi nhận đến sớm và đi trễ"],
      [2, "Trả phòng kèm đối chiếu bảng kê"],
    ],
  );
  assert.deepEqual(
    records.Stay.buttons.map((button) => button.label),
    ["Tải lại", "Nhận phòng", "Chuyển phòng", "Ghi nhận giờ", "Đối chiếu bảng kê", "Trả phòng"],
  );
  // Rooms carries the static shell (title, summary, floor titles);
  // the room-number cards below are illustrative mock data, so only
  // the static prefix is pinned here.
  assert.deepEqual(
    records.Rooms.headings.slice(0, 3).map((heading) => [heading.level, heading.text]),
    [
      [1, "Sơ đồ phòng"],
      [2, "Phòng theo trạng thái"],
      [2, "Tầng 1"],
    ],
  );
  assert.deepEqual(
    records.Rooms.buttons.map((button) => button.label),
    ["Tải lại"],
  );
  assert.deepEqual(
    records.Book.headings.map((heading) => [heading.level, heading.text]),
    [
      [1, "Đặt phòng"],
      [2, "Đặt phòng mới"],
      [2, "Khách"],
      [2, "Giá đã báo"],
      [2, "Lưu trú"],
    ],
  );
  assert.deepEqual(
    records.Book.buttons.map((button) => button.label),
    ["Tìm khách", "Đăng ký khách vãng lai", "Xác nhận đặt phòng", "Lấy báo giá"],
  );
});

test("tokens carry the four schema colours on every screen", () => {
  const { outDir } = extractToFreshDir();
  const records = readRecords(outDir);
  for (const screen of SCREENS) {
    assert.deepEqual(records[screen].tokens, {
      header: "#0f4c47",
      ink: "#1b2b2a",
      page: "#f4f6f5",
      primary: "#0f766e",
    });
  }
});

test("repeated runs over identical inputs are byte-identical", () => {
  const first = extractToFreshDir();
  const second = extractToFreshDir();
  for (const screen of SCREENS) {
    const a = readFileSync(join(first.outDir, `${screen}.facts.json`));
    const b = readFileSync(join(second.outDir, `${screen}.facts.json`));
    assert.ok(a.equals(b), `${screen}.facts.json differs between runs`);
  }
});

test("output directory holds JSON text only: no image or binary artifacts", () => {
  const { outDir } = extractToFreshDir();
  const binaryExtensions =
    /\.(png|jpe?g|gif|webp|avif|ico|mp4|webm|mov|woff2?|ttf|otf|eot|zip|gz)$/i;
  for (const file of readdirSync(outDir)) {
    assert.match(file, /^[A-Za-z]+\.facts\.json$/);
    assert.ok(!binaryExtensions.test(file), `binary artifact: ${file}`);
    const raw = readFileSync(join(outDir, file));
    assert.ok(!raw.includes(0), `NUL byte in ${file}`);
    JSON.parse(raw.toString("utf8"));
  }
});

test("every emitted fact carries its design-node file:line reference", () => {
  const { outDir } = extractToFreshDir();
  const records = readRecords(outDir);
  let count = 0;
  everyFact(records, (fact, where) => {
    assert.match(fact.design, DESIGN_LINE_PATTERN, `bad provenance in ${where}`);
    count += 1;
  });
  assert.ok(count > 30, `expected a fact per covered UI fact, saw ${count}`);
});

test("records stay under the schema size budgets", () => {
  const { outDir } = extractToFreshDir();
  let total = 0;
  for (const screen of SCREENS) {
    const size = statSync(join(outDir, `${screen}.facts.json`)).size;
    assert.ok(size < 16 * 1024, `${screen} record is ${size} bytes (>= 16 KB)`);
    total += size;
  }
  assert.ok(total < 100 * 1024, `fact set is ${total} bytes (>= 100 KB)`);
});

test("serialised records use LF endings with no trailing whitespace", () => {
  const { outDir } = extractToFreshDir();
  for (const screen of SCREENS) {
    const raw = readFileSync(join(outDir, `${screen}.facts.json`), "utf8");
    assert.ok(!raw.includes("\r"), `${screen}: CR found`);
    for (const line of raw.split("\n")) {
      assert.ok(line === line.trimEnd(), `${screen}: trailing whitespace`);
    }
    assert.ok(raw.endsWith("\n"), `${screen}: missing final newline`);
  }
});

test("icon-only buttons fail loudly instead of passing silently", () => {
  const source = readFileSync(
    join(REPO_ROOT, "docs", "design", "Main.dc.html"),
    "utf8",
  );
  const iconOnly = source.replace("Làm mới</button>", "</button>");
  assert.throws(
    () =>
      extractScreenFacts({
        screen: "Main",
        designFile: "docs/design/Main.dc.html",
        source: iconOnly,
        viewHook: "desk-view",
      }),
    /icon-only button/,
  );
});

test("unknown nav tab labels fail loudly instead of guessing a key", () => {
  const source = readFileSync(
    join(REPO_ROOT, "docs", "design", "Main.dc.html"),
    "utf8",
  );
  const renamed = source.replace("Lễ tân</span>", "Tổng quan</span>");
  assert.throws(
    () =>
      extractScreenFacts({
        screen: "Main",
        designFile: "docs/design/Main.dc.html",
        source: renamed,
        viewHook: "desk-view",
      }),
    /unknown nav tab label/,
  );
});

test("form controls without any label source fail loudly", () => {
  const source = readFileSync(
    join(REPO_ROOT, "docs", "design", "Onboarding.dc.html"),
    "utf8",
  );
  const stripped = source
    .replace(/<h3[^>]*>Tên khách sạn<\/h3>/, "")
    .replace(/placeholder="[^"]*"/, "");
  assert.throws(
    () =>
      extractScreenFacts({
        screen: "Onboarding",
        designFile: "docs/design/Onboarding.dc.html",
        source: stripped,
        viewHook: "onboarding-view",
      }),
    /no associated label/,
  );
});

test("parser tracks real line numbers for moved design nodes", () => {
  const padded = "\n\n<!doctype html><html><body><x-dc><h1>T</h1></x-dc></body></html>";
  const root = parseHtml(padded);
  const headings = [];
  const visit = (node) => {
    if (node.tag === "h1") headings.push(node);
    for (const child of node.children || []) {
      if (child.text === undefined) visit(child);
    }
  };
  visit(root);
  assert.equal(headings.length, 1);
  assert.equal(headings[0].line, 3);
});
