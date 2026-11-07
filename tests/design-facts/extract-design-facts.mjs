#!/usr/bin/env node
// Design-side UI fact extractor for the seven desk screens (Closes #466).
//
// Reads docs/design/manifest.json (screen order) plus the seven
// docs/design/*.dc.html boards and emits one deterministic JSON fact
// record per screen, following the contract in
// docs/technical/desk-ui-fact-schema.md (schemaVersion 1).
// Harness/test code only: no product behaviour change, no design-file
// changes, no binary artifacts (UTF-8 JSON text only).
//
// Usage:
//   node tests/design-facts/extract-design-facts.mjs --out <dir>
//
// The output directory receives one file per manifest screen,
// <Screen>.facts.json. Repeated runs over identical inputs produce
// byte-identical output.
//
// v2 bundle envelope (bundle 07-11, Closes #538): the owner-supplied
// `.dc.html` boards are standalone bundler shells — the design
// document is embedded as a JSON string inside
// `<script type="__bundler/template">`, so the outer shell carries no
// literal `<x-dc>` root. `resolveDesignDocument` decodes that payload
// before parsing; boards without the envelope parse as-is.
//
// Design-tab-to-key mapping (definitive table owned by this extractor
// per the schema): the seven v2 header tabs map onto the screen keys
// for screen destinations and onto route keys for the print/admin
// destinations (out of the restyle batch), so tab keys for
// non-screen destinations use their route keys:
//
//   "Lễ tân" -> "Main", "Sơ đồ phòng" -> "Rooms",
//   "Đặt phòng" -> "Book", "Lưu trú" -> "Stay",
//   "Hoá đơn" -> "Folio", "In" -> "print", "Quản trị" -> "admin"
//
// Screen-to-app-view-hook mapping (per-fact `app` provenance hints; the
// hooks below exist in app/src/views and match the schema examples.
// #467 refines per-fact selectors when it wires the app-side
// assertions; the design-side `design` pointers are authoritative):
//
//   Main -> desk-view, Stay -> stay-view, Onboarding -> onboarding-view,
//   Rooms -> rooms-view, Book -> book-view, Folio -> folio-view,
//   Admin -> admin-view
//
// Notes on honest extraction corners:
// - Onboarding's board has no header tab bar, so it extracts an empty
//   nav (order [], labels {}, active "") with provenance on the screen
//   root. The empty shape keeps records structurally identical.
// - The Stay guest select holds a real value (single concrete option),
//   so its placeholder is null; only a prompt-like first option
//   (matching /chon|select|.../) with no preselected option counts as
//   a select placeholder.
// - The Onboarding hotel-name input has no wrapping label or
//   aria-label, so its label falls back to the closest preceding
//   heading ("Tên khách sạn"), matching the schema example. Inputs
//   with no label source at all are a loud error, not a silent skip.
// - Icon-only buttons (no visible text) are a loud error per the
//   schema's known-gap rule; screenshotting them is forbidden.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;

const TAB_KEY_BY_LABEL = {
  "Lễ tân": "Main",
  "Sơ đồ phòng": "Rooms",
  "Đặt phòng": "Book",
  "Lưu trú": "Stay",
  "Hoá đơn": "Folio",
  In: "print",
  "Quản trị": "admin",
};

const VIEW_HOOK_BY_SCREEN = {
  Main: "desk-view",
  Stay: "stay-view",
  Onboarding: "onboarding-view",
  Rooms: "rooms-view",
  Book: "book-view",
  Folio: "folio-view",
  Admin: "admin-view",
};

// Fixed token key set for schema version 1 (schema section 2).
const TOKEN_KEYS = ["header", "primary", "page", "ink"];

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);
const SKIPPED_SUBTREES = new Set(["script", "style"]);

function fail(message) {
  throw new Error(`extract-design-facts: ${message}`);
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, "&");
}

// Minimal HTML parser with 1-based line tracking. Returns a root node:
// { tag: null, attrs: {}, children: [], line: 1 }. Element nodes carry
// { tag, attrs, children, line }; text nodes carry { text, line }.
export function parseHtml(source) {
  const root = { tag: null, attrs: {}, children: [], line: 1 };
  const stack = [root];
  let pos = 0;
  let line = 1;

  const advanceTo = (next) => {
    const chunk = source.slice(pos, next);
    for (let i = 0; i < chunk.length; i += 1) {
      if (chunk[i] === "\n") line += 1;
    }
    pos = next;
  };

  const current = () => stack[stack.length - 1];

  const pushText = (text, textLine) => {
    if (text === "") return;
    current().children.push({ text, line: textLine });
  };

  while (pos < source.length) {
    const top = current();
    // Raw-text elements (script/style): consume through the end tag.
    if (top.tag !== null && RAW_TEXT_ELEMENTS.has(top.tag)) {
      const endTag = `</${top.tag}`;
      const end = source.indexOf(endTag, pos);
      if (end === -1) fail(`unclosed <${top.tag}> element`);
      const textLine = line;
      const chunk = source.slice(pos, end);
      advanceTo(end);
      pushText(chunk, textLine);
      // Consume the end tag itself and pop the raw-text element.
      const closeEnd = source.indexOf(">", end + endTag.length);
      if (closeEnd === -1) fail(`unclosed <${top.tag}> element`);
      advanceTo(closeEnd + 1);
      stack.pop();
      continue;
    }
    const lt = source.indexOf("<", pos);
    if (lt === -1) {
      pushText(decodeEntities(source.slice(pos)), line);
      advanceTo(source.length);
      break;
    }
    if (lt > pos) {
      pushText(decodeEntities(source.slice(pos, lt)), line);
      advanceTo(lt);
    }
    // Declarations, doctypes, and comments: skipped, lines still counted.
    if (source.startsWith("<!--", pos)) {
      const end = source.indexOf("-->", pos + 4);
      if (end === -1) fail("unclosed HTML comment");
      advanceTo(end + 3);
      continue;
    }
    if (source.startsWith("<!", pos) || source.startsWith("<?", pos)) {
      const end = source.indexOf(">", pos + 2);
      if (end === -1) fail("unclosed declaration");
      advanceTo(end + 1);
      continue;
    }
    const end = source.indexOf(">", pos + 1);
    if (end === -1) fail("unclosed tag");
    const raw = source.slice(pos + 1, end);
    const tagLine = line;
    advanceTo(end + 1);
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim().split(/\s+/)[0].toLowerCase();
      if (stack.length > 1 && current().tag === name) {
        stack.pop();
      } else if (stack.length > 1) {
        fail(`mismatched end tag </${name}>`);
      }
      continue;
    }
    const selfClosing = raw.trimEnd().endsWith("/");
    const head = raw.trim().replace(/\/$/, "");
    const firstSpace = head.search(/\s/);
    const name = (firstSpace === -1 ? head : head.slice(0, firstSpace)).toLowerCase();
    const attrSource = firstSpace === -1 ? "" : head.slice(firstSpace);
    const attrs = {};
    // Attribute grammar: name="v", name='v', name=v, or bare name.
    const attrPattern = /([^\s=/>]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;
    let match = attrPattern.exec(attrSource);
    while (match !== null) {
      const attrName = match[1].toLowerCase();
      let value = "";
      if (match[2] !== undefined) {
        value = match[2];
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
      }
      attrs[attrName] = decodeEntities(value);
      match = attrPattern.exec(attrSource);
    }
    const node = { tag: name, attrs, children: [], line: tagLine };
    current().children.push(node);
    if (!selfClosing && !VOID_ELEMENTS.has(name)) {
      stack.push(node);
    }
  }
  if (stack.length !== 1) fail("unclosed elements at end of input");
  return root;
}

function isText(node) {
  return node.text !== undefined;
}

// Visible text of a node: concatenated descendant text outside
// script/style subtrees.
export function visibleText(node) {
  if (isText(node)) return node.text;
  if (SKIPPED_SUBTREES.has(node.tag)) return "";
  return node.children.map((child) => visibleText(child)).join("");
}

// Schema section 5 text normalisation: NFC, collapse interior
// whitespace runs, strip ends. No case folding.
export function normaliseText(text) {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function walkElements(node, visit) {
  if (node.tag !== null && node.tag !== undefined) visit(node);
  for (const child of node.children || []) {
    if (!isText(child)) walkElements(child, visit);
  }
}

function findElements(root, predicate) {
  const found = [];
  walkElements(root, (node) => {
    if (predicate(node)) found.push(node);
  });
  return found;
}

// Design document resolution (v2 bundle envelope, Closes #538): the
// owner-supplied boards embed the design document as a JSON string in
// `<script type="__bundler/template">`, so the outer shell parses to
// zero `<x-dc>` roots. When the outer parse carries exactly one
// `<x-dc>` root the source is already a design document (v1 shape)
// and passes through untouched; otherwise the template payload is
// decoded and returned. Anything else fails loudly — the harness
// never guesses at an unknown board format.
export function resolveDesignDocument(source, designFile) {
  const outer = parseHtml(source);
  if (findElements(outer, (node) => node.tag === "x-dc").length === 1) {
    return source;
  }
  const templates = findElements(
    outer,
    (node) => node.tag === "script" && node.attrs.type === "__bundler/template",
  );
  if (templates.length !== 1) {
    fail(
      `${designFile}: expected exactly one <x-dc> root and no __bundler/template payload to decode`,
    );
  }
  const payload = templates[0].children
    .filter((child) => child.text !== undefined)
    .map((child) => child.text)
    .join("")
    .trim();
  let decoded;
  try {
    decoded = JSON.parse(payload);
  } catch {
    fail(`${designFile}: __bundler/template payload is not a JSON string`);
  }
  if (typeof decoded !== "string" || !decoded.includes("<x-dc>")) {
    fail(`${designFile}: __bundler/template payload carries no <x-dc> document`);
  }
  return decoded;
}

function parseStyleDeclarations(style) {
  const declarations = {};
  for (const part of (style || "").split(";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (prop !== "" && value !== "") declarations[prop] = value;
  }
  return declarations;
}

function normaliseColour(raw, context) {
  let value = raw.trim().toLowerCase();
  const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})\b/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    return `#${hex}`;
  }
  const rgbMatch = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/,
  );
  if (rgbMatch) {
    const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
    if (alpha !== 1) {
      fail(`non-opaque colour "${raw}" (${context}); gradients, transparency, and currentColor are unsupported`);
    }
    const parts = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((n) => {
      const v = Number(n);
      if (!Number.isInteger(v) || v < 0 || v > 255) fail(`colour out of range "${raw}" (${context})`);
      return v.toString(16).padStart(2, "0");
    });
    return `#${parts.join("")}`;
  }
  fail(`unparsable colour "${raw}" (${context}); gradients, transparency, and currentColor are unsupported`);
  return "#000000";
}

// First paint-like colour carried by a background/background-color
// declaration on the element's own inline style.
function inlineBackground(node) {
  const declarations = parseStyleDeclarations(node.attrs.style || "");
  const raw = declarations.background || declarations["background-color"];
  if (!raw) return null;
  const firstToken = raw.split(/\s+/)[0];
  return normaliseColour(firstToken, `<${node.tag}> inline style`);
}

function inlineColour(node, prop) {
  const declarations = parseStyleDeclarations(node.attrs.style || "");
  const raw = declarations[prop];
  if (!raw) return null;
  return normaliseColour(raw.split(/\s+/)[0], `<${node.tag}> inline style`);
}

function stripCountSuffix(text) {
  return text.replace(/\s*\(\d+\)\s*$/, "").trim();
}

// Static prefix of a heading: the designs append dynamic context
// (guest names, room refs, dates) after "·" separators — e.g. the
// Folio board's "Khoản phí · Lê Minh · P.201". Schema section 5 keeps
// dynamic values out of facts, so only the leading static segment is
// recorded. #467 applies the same rule to the live DOM.
function staticPrefix(text) {
  const segments = text.split("·");
  if (segments.length === 1) return text;
  return segments[0].trim();
}

function isPromptLike(text) {
  return /chọn|choose|select|\.\.\.|…/i.test(text);
}

// Label text of a wrapping <label>: its visible text minus the text of
// nested form controls (so a select's option captions do not leak into
// the label).
function wrappingLabelText(labelNode) {
  const parts = [];
  const collect = (node) => {
    if (isText(node)) {
      parts.push(node.text);
      return;
    }
    if (SKIPPED_SUBTREES.has(node.tag)) return;
    if (node.tag === "input" || node.tag === "select" || node.tag === "textarea") return;
    for (const child of node.children) collect(child);
  };
  for (const child of labelNode.children) collect(child);
  return normaliseText(parts.join(""));
}

// Closest preceding heading (h1-h6) in document order.
function precedingHeadingText(root, target) {
  const headings = findElements(root, (node) => /^h[1-6]$/.test(node.tag));
  const order = [];
  walkElements(root, (node) => order.push(node));
  const targetIndex = order.indexOf(target);
  let best = null;
  for (const heading of headings) {
    if (order.indexOf(heading) < targetIndex) best = heading;
  }
  return best ? normaliseText(visibleText(best)) : null;
}

function nearestAncestorLabel(root, target) {
  const parents = new Map();
  const visit = (node, parent) => {
    if (!isText(node)) {
      parents.set(node, parent);
      for (const child of node.children) visit(child, node);
    }
  };
  visit(root, null);
  let node = parents.get(target);
  while (node) {
    if (node.tag === "label") return node;
    node = parents.get(node);
  }
  return null;
}

export function extractScreenFacts({ screen, designFile, source, viewHook }) {
  const root = parseHtml(resolveDesignDocument(source, designFile));
  const dcNodes = findElements(root, (node) => node.tag === "x-dc");
  if (dcNodes.length !== 1) fail(`${designFile}: expected exactly one <x-dc> root`);
  const dc = dcNodes[0];

  // --- Nav: header tab spans in DOM order. ---
  const headerBars = findElements(
    dc,
    (node) => node.tag === "div" && inlineBackground(node) === "#0f4c47",
  );
  const header = headerBars.length > 0 ? headerBars[0] : null;
  const tabSpans =
    header === null
      ? []
      : header.children.filter(
          (child) =>
            !isText(child) &&
            child.tag === "span" &&
            !/margin-left/i.test(child.attrs.style || ""),
        );
  let nav;
  if (header === null || tabSpans.length === 0) {
    // Boards without a tab bar (Onboarding carries a title header but
    // no tabs): honest empty nav on the screen root so records stay
    // structurally identical.
    const screenRoots = findElements(dc, (node) => node.tag === "div");
    if (screenRoots.length === 0) fail(`${designFile}: no screen root for empty nav provenance`);
    nav = {
      order: [],
      labels: {},
      active: "",
      design: `${designFile}:${screenRoots[0].line}`,
      app: '[data-testid="shell-nav"]',
    };
  } else {
    const order = [];
    const labels = {};
    let active = null;
    for (const span of tabSpans) {
      const label = normaliseText(visibleText(span));
      const key = TAB_KEY_BY_LABEL[label];
      if (!key) fail(`${designFile}:${span.line}: unknown nav tab label "${label}"`);
      order.push(key);
      labels[key] = label;
      if (inlineBackground(span) === "#ffffff") active = key;
    }
    if (active === null) fail(`${designFile}: no active nav tab (no inverted tab span)`);
    const sortedLabels = {};
    for (const key of Object.keys(labels).sort()) sortedLabels[key] = labels[key];
    nav = {
      order,
      labels: sortedLabels,
      active,
      design: `${designFile}:${header.line}`,
      app: '[data-testid="shell-nav"]',
    };
  }

  // --- Headings h1-h6 in DOM order; parenthesised counts stripped. ---
  const headings = findElements(dc, (node) => /^h[1-6]$/.test(node.tag)).map((node) => ({
    level: Number(node.tag.slice(1)),
    text: staticPrefix(stripCountSuffix(normaliseText(visibleText(node)))),
    design: `${designFile}:${node.line}`,
    app: `[data-testid="${viewHook}"] ${node.tag}`,
  }));

  // --- Buttons in DOM order; icon-only buttons fail loudly. ---
  const buttons = findElements(dc, (node) => node.tag === "button").map((node) => {
    const label = normaliseText(visibleText(node));
    if (label === "") {
      fail(
        `${designFile}:${node.line}: icon-only button with no visible text is out of schema scope and must fail loudly`,
      );
    }
    return {
      label,
      design: `${designFile}:${node.line}`,
      app: `[data-testid="${viewHook}"] button`,
    };
  });

  // --- Inputs in DOM order. ---
  const controls = findElements(
    dc,
    (node) =>
      node.tag === "input" || node.tag === "textarea" || node.tag === "select",
  );
  const inputs = controls.map((node) => {
    if (node.tag === "input" && (node.attrs.type || "").toLowerCase() === "hidden") {
      return null;
    }
    const kind = node.tag === "select" ? "select" : "text";
    let label = null;
    const wrapper = nearestAncestorLabel(root, node);
    if (wrapper) label = wrappingLabelText(wrapper);
    else if (node.attrs["aria-label"]) label = normaliseText(node.attrs["aria-label"]);
    else label = precedingHeadingText(root, node);
    if (label === null || label === "") {
      fail(`${designFile}:${node.line}: form control with no associated label text`);
    }
    let placeholder = null;
    if (kind === "text") {
      placeholder = node.attrs.placeholder !== undefined ? normaliseText(node.attrs.placeholder) : null;
      if (placeholder === "") placeholder = null;
    } else {
      const options = node.children.filter((child) => !isText(child) && child.tag === "option");
      const preselected = options.some((option) => option.attrs.selected !== undefined);
      const firstCaption =
        options.length > 0 ? normaliseText(visibleText(options[0])) : "";
      placeholder =
        !preselected && firstCaption !== "" && isPromptLike(firstCaption)
          ? firstCaption
          : null;
    }
    return {
      kind,
      label,
      placeholder,
      design: `${designFile}:${node.line}`,
      app: `[data-testid="${viewHook}"] ${node.tag}`,
    };
  }).filter((entry) => entry !== null);

  // --- Tokens: inline token colours observed on the screen. ---
  const screenRoots = findElements(dc, (node) => node.tag === "div");
  if (screenRoots.length === 0) fail(`${designFile}: no screen root for token extraction`);
  const screenRoot = screenRoots[0];
  const page = inlineBackground(screenRoot);
  const ink = inlineColour(screenRoot, "color");
  const headerColour = header !== null ? inlineBackground(header) : null;
  const buttonNodes = findElements(dc, (node) => node.tag === "button");
  const primary = buttonNodes.length > 0 ? inlineBackground(buttonNodes[0]) : null;
  const tokens = { header: headerColour, primary, page, ink };
  for (const key of TOKEN_KEYS) {
    if (!tokens[key]) fail(`${designFile}: token "${key}" not observed in inline styles`);
  }
  const sortedTokens = {};
  for (const key of [...TOKEN_KEYS].sort()) sortedTokens[key] = tokens[key];

  return {
    schemaVersion: SCHEMA_VERSION,
    screen,
    designFile,
    nav,
    headings,
    buttons,
    inputs,
    tokens: sortedTokens,
  };
}

function serialiseRecord(record) {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--out" && i + 1 < argv.length) {
      args.out = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      args.help = true;
    } else {
      fail(`unknown argument "${argv[i]}" (usage: --out <dir>)`);
    }
  }
  return args;
}

export function runExtraction({ repoRoot, outDir }) {
  const designDir = join(repoRoot, "docs", "design");
  const manifest = JSON.parse(
    readFileSync(join(designDir, "manifest.json"), "utf8"),
  );
  const order = manifest.order;
  if (!Array.isArray(order) || order.length === 0) fail("manifest.json carries no screen order");
  mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const file of order) {
    const screen = file.replace(/\.dc\.html$/, "");
    const viewHook = VIEW_HOOK_BY_SCREEN[screen];
    if (!viewHook) fail(`no app view hook mapped for screen "${screen}"`);
    const designFile = `docs/design/${file}`;
    const source = readFileSync(join(designDir, file), "utf8");
    const record = extractScreenFacts({ screen, designFile, source, viewHook });
    const serialised = serialiseRecord(record);
    const outPath = join(outDir, `${screen}.facts.json`);
    writeFileSync(outPath, serialised, "utf8");
    written.push(outPath);
  }
  return written;
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(scriptDir, "..", "..");
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node tests/design-facts/extract-design-facts.mjs --out <dir>");
  } else {
    if (!args.out) fail("--out <dir> is required");
    const written = runExtraction({ repoRoot, outDir: resolve(args.out) });
    for (const path of written) console.log(path);
  }
}
