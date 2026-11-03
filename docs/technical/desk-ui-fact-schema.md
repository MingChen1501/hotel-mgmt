# Desk UI fact schema (DOM-vs-design comparison contract)

Status: active (Closes #465). Owned by `architect`.

Owner direction 2026-11-03: no screenshot snapshots (heavy, brittle).
Conformance between the six desk screens and the owner-supplied designs
is checked by comparing lightweight UI facts extracted from the DOM
against facts extracted from the design files. This document is the
schema contract both sides build on: the design-side extractor (#466)
and the Playwright DOM-vs-design assertions with the CI gate (#467).
No product behaviour changes here; no extractor, assertion, or CI
wiring ships in this change.

## 1. Sources and screen keys

- Design source of truth: `docs/design/*.dc.html` plus
  `docs/design/manifest.json` (authoritative per
  `docs/design/README.md`; never edited to fix implementation drift).
- Screen keys follow the manifest `order` field, stripped of the
  `.dc.html` suffix: `Main`, `Stay`, `Onboarding`, `Rooms`, `Book`,
  `Folio`.
- App source of truth: the Vue desk SPA under `app/src/` (shell in
  `app/src/App.vue`, screens in `app/src/views/`, tokens in
  `app/src/theme/tokens.ts`).
- Copy is VI-primary: fact text records Unicode code points exactly as
  written (e.g. `Lễ tân`, `Hoá đơn`); no case folding, no
  transliteration, no whitespace trimming beyond the field rules in
  section 2.

## 2. Fact fields

One extracted record per screen (section 3). Every field below lists
its type and meaning. A field with nothing on a screen for that
category is an empty array (`[]`) or an empty object (`{}`), never
`null` and never omitted, so records stay structurally identical
across screens.

| Field | Type | Meaning |
|---|---|---|
| `nav.order` | `string[]` | Rendered tab sequence on the screen, in left-to-right DOM order. Design side: the header tab spans. App side: the rendered `shell-nav` tabs. The sequence must be identical on all six screens (one shared shell); manifest `order` governs the screen/record sequence (section 1), not this field. Compares as an ordered list. |
| `nav.labels` | `object<string,string>` | Visible label per tab key (e.g. `Main` -> `Lễ tân`). Design side: the text of each header tab span. App side: the rendered label of each `shell-nav-<route>` tab. Tab keys are the screen keys from section 1 where a tab maps to a screen; tabs with no corresponding screen (e.g. print/admin destinations, which are out of the restyle batch) are recorded under their route key with their rendered label. |
| `nav.active` | `string` | Tab key highlighted on this screen. Design side: the tab span carrying the inverted inline style (`background:#fff` on the teal header). App side: the tab carrying the `shell-nav-active` class (matching `route.name`). |
| `headings` | `{ level: number, text: string }[]` | Visible section headings in DOM order. Design side: `h1`–`h6` elements (`Main.dc.html` uses `h3` cards). App side: rendered heading elements inside `<screen>-view`. `level` is the numeric heading rank; `text` is the exact visible copy. |
| `buttons` | `{ label: string }[]` | Clickable actions in DOM order. `label` is the exact visible caption (e.g. `Làm mới`, `Nhận phòng`). Icon-only buttons without visible text are out of scope for this schema version (recorded as a known gap in section 6, not silently skipped by the extractor — the extractor must fail loudly if it meets one). |
| `inputs` | `{ kind: "text" \| "select", label: string, placeholder: string \| null }[]` | Form controls in DOM order. `kind` is `text` for `input`/`textarea` and `select` for dropdowns. `label` is the associated visible label text (wrapping `label` element or `aria-label`). `placeholder` is the `placeholder` attribute for text inputs, the first-option caption for selects with no preselected value (e.g. Stay room select `Chọn phòng...`), otherwise `null`. |
| `tokens` | `object<string,string>` | Inline token colours observed on the screen, as lowercase `#rrggbb`. Fixed key set for this schema version: `header` (nav bar background `#0f4c47`), `primary` (primary button background `#0f766e`), `page` (screen background `#f4f6f5`), `ink` (base text `#1b2b2a`). Design side: parsed from inline `style` attributes. App side: computed styles resolved back to these token names via `app/src/theme/tokens.ts`. |

Out of scope for this schema version: layout geometry (widths,
positions), typography (sizes, weights), radii, spacing, touch-target
sizes, locale-toggle state, dynamic data (guest names, dates,
counts such as `Khách đến hôm nay (2)` — counts in parentheses are
stripped before comparison; see section 5), loading/empty/error
wording beyond the static headings above, and print output.

## 3. Record shape

```json
{
  "schemaVersion": 1,
  "screen": "Main",
  "designFile": "docs/design/Main.dc.html",
  "nav": {
    "order": ["Main", "Book", "Stay", "Folio", "print", "admin"],
    "labels": {
      "Main": "Lễ tân",
      "Book": "Đặt phòng",
      "Stay": "Lưu trú",
      "Folio": "Hoá đơn",
      "print": "In",
      "admin": "Quản trị"
    },
    "active": "Main",
    "design": "docs/design/Main.dc.html:2",
    "app": "[data-testid=\"shell-nav\"]"
  },
  "headings": [
    {
      "level": 3,
      "text": "Khách đến hôm nay",
      "design": "docs/design/Main.dc.html:2",
      "app": "[data-testid=\"desk-view\"] h3"
    }
  ],
  "buttons": [
    {
      "label": "Làm mới",
      "design": "docs/design/Main.dc.html:2",
      "app": "[data-testid=\"desk-refresh\"]"
    }
  ],
  "inputs": [
    {
      "kind": "text",
      "label": "Tên khách sạn",
      "placeholder": "Ví dụ: Khách sạn Hoa Mai",
      "design": "docs/design/Onboarding.dc.html:2",
      "app": "[data-testid=\"onboarding-hotel-name\"] input"
    },
    {
      "kind": "select",
      "label": "Phòng",
      "placeholder": "Chọn phòng...",
      "design": "docs/design/Stay.dc.html:2",
      "app": "[data-testid=\"stay-checkin-room\"] select"
    }
  ],
  "tokens": {
    "header": "#0f4c47",
    "primary": "#0f766e",
    "page": "#f4f6f5",
    "ink": "#1b2b2a"
  }
}
```

Notes on the example above:

- `nav` shows the nav order/labels/active-tab fields. The tab
  labels are the actual header tabs from `Main.dc.html`; the
  design-tab-to-key mapping shown (e.g. `Book` -> `Đặt phòng`,
  non-screen destinations under their route keys `print`/`admin`)
  is illustrative — the extractor (#466) owns the definitive
  mapping table and records it alongside its implementation, since
  the rendered tab set is not identical to the six screen keys
  (e.g. the design header carries no Onboarding/Rooms tabs).
- `headings` shows the heading field; the `(2)` count suffix from the
  design card title is stripped per section 5.
- `buttons` shows the button-label field.
- `inputs` shows both input kinds: the text placeholder comes from the
  Onboarding design (the only `placeholder=` attribute in the design
  set); the select placeholder comes from the Stay room select's
  first-option caption.
- `tokens` shows the inline token-colour field with the four fixed
  keys from the shared token set (`docs/product/desk-ui-design-rollout.md`
  section 3).
- `designFile` is the screen's own design board; per-fact `design`
  provenance may point at the same file (normal case).

## 4. Provenance mapping convention for mismatch diffs

Every comparable fact (each `nav` block, each entry of `headings`,
`buttons`, `inputs`) carries two provenance pointers:

- `design`: `<design-file>:<line>` — the design node the expected
  value comes from, e.g. `docs/design/Stay.dc.html:2`. The line
  number is the 1-based line of the element in the committed design
  file. If a design board is later reformatted, the extractor
  re-resolves the line; stale lines are never hand-edited.
- `app`: a CSS selector resolving to the live node under test,
  preferring the stable `data-testid` hooks already used across the
  suite (e.g. `[data-testid="shell-nav"]`,
  `[data-testid="shell-nav-stay"]`, `[data-testid="stay-view"] h3`).
  Selectors must be deterministic (no generated classes, no
  positional `:nth-child` unless the design order itself is the
  asserted fact, as in `nav.order`).

Mismatch diffs (produced by #467, format owned there) must cite both
pointers for every failing fact so a reader can open the design node
and the app node without searching:

```json
{
  "screen": "Stay",
  "field": "nav.active",
  "expected": "Stay",
  "actual": "Main",
  "design": "docs/design/Stay.dc.html:2",
  "app": "[data-testid=\"shell-nav\"] .shell-nav-active"
}
```

Rules: `expected` always comes from the design extraction, `actual`
always from the app DOM; `field` uses dotted paths into section 2
(`nav.order`, `nav.labels.Stay`, `nav.active`, `headings[0].text`,
`buttons[1].label`, `inputs[0].placeholder`, `tokens.primary`).
A diff whose design node moved lines is still the same fact as long
as the element is unchanged — line numbers locate, they do not
identify.

## 5. Determinism requirements

Both extractions (design-side #466 and app-side #467) must be byte
reproducible: the same committed inputs produce byte-identical JSON
on every run, machine, and timezone.

- Key order: `schemaVersion`, `screen`, `designFile`, `nav`,
  `headings`, `buttons`, `inputs`, `tokens`; object keys inside
  `nav.labels` and `tokens` sorted lexicographically (UTF-8 code
  unit order). Arrays follow DOM order on both sides.
- No timestamps, no random values, no absolute paths, no environment
  labels inside records. Serialisation is UTF-8, LF line endings,
  2-space indent, no trailing whitespace.
- Text normalisation, applied identically on both sides: NFC Unicode
  normalisation; collapse interior whitespace runs to a single space;
  strip leading/trailing whitespace; no case folding (Vietnamese
  diacritics are significant). Dynamic data is excluded before
  comparison: parenthesised counts in headings (e.g. `(2)`, `(5)`,
  `(0)`) are stripped, and guest names, dates, room numbers, and
  monetary values never enter a fact — if a heading contains only
  dynamic content, the extractor records the static prefix (possibly
  empty, never the dynamic value).
- Colour normalisation: `#rgb` expands to `#rrggbb`; case folds to
  lowercase; `rgb()/rgba()` with alpha `1` converts to hex; anything
  else (gradients, transparency, `currentColor`) is a loud extractor
  error, not a silent pass.
- Locale: extraction runs against the VI-primary render on both
  sides; the locale toggle state is not a fact in this schema
  version.

## 6. Zero-binary-artifact requirements

- Records, extractions, and diffs are UTF-8 JSON text only. No PNG,
  JPEG, video, font, or other binary artifact may be produced,
  committed, or required by the extractor or the assertions.
- Reference data lives in the repo as text: the six `.dc.html`
  boards plus `manifest.json` are the only design inputs. No
  vendored renderings, no base64-embedded images inside records.
- Size discipline: each screen record must stay under 16 KB; the
  full six-screen fact set under 100 KB. If a screen outgrows the
  budget, the schema (this document) is revised first — the
  extractor does not silently truncate.
- Known gap (not a binary backdoor): icon-only buttons with no
  visible text are out of scope in schema version 1 (section 2).
  The extractor must error on encountering one so the gap stays
  visible; screenshotting it instead is explicitly forbidden by
  this section.

## 7. Consumers and versioning

- Producer (design side): #466 reads the six boards plus the
  manifest `order` field and emits one record per screen in exactly
  this shape.
- Consumer (app side): #467 renders each screen, extracts the same
  shape from the live DOM, and diffs field-by-field using the
  section 4 convention; the CI gate mechanics belong to #467, not
  here.
- `schemaVersion` starts at `1`. Any added, removed, or retyped
  field bumps it and revises this document in the same change;
  extractor and assertions pin the version they implement and
  refuse to run against a mismatch.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-629
