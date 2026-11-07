# Design-side UI fact extractor (issues #466, #548)

Harness/test code only. Extracts UI facts from the seven owner-supplied
design boards per the contract in
[docs/technical/desk-ui-fact-schema.md](../../docs/technical/desk-ui-fact-schema.md)
(schema version 1, owned by `architect`).

The v2 boards (bundle 07-11) are bundler shells: the extractor decodes
the embedded `<script type="__bundler/template">` payload and parses
the design markup only — inline runtime scripts never enter facts.
Boards without the envelope (v1 static `<x-dc>` files) still parse
directly.

## Run

```sh
node tests/design-facts/extract-design-facts.mjs --out <dir>
```

Reads the screen order from `docs/design/manifest.json` (see
[docs/design/README.md](../../docs/design/README.md)) and writes one
`<Screen>.facts.json` record per screen into `<dir>`. Repeated runs
over identical inputs are byte-identical; output is UTF-8 JSON text
only — no image or binary artifacts.

## Layout

- `extract-design-facts.mjs` — the extractor (dependency-free Node, no
  product-code or design-file changes). Owns the definitive design-tab
  label to tab-key table and the screen to app view-hook table; both
  are recorded in its header comment.
- `extract-design-facts.test.mjs` — acceptance tests (`node --test
  tests/design-facts/extract-design-facts.test.mjs`), covering the
  issue's four acceptance criteria plus the schema's size budgets and
  loud-failure rules.

## Honest-extraction corners

- Onboarding's board has no header tab bar, so it extracts an empty
  nav (`order`/`labels` empty, `active` `""`).
- The Stay guest selects hold real values, so their placeholders are
  `null`; only a prompt-like first option with no preselected option
  counts as a select placeholder. The v2 boards render options inside
  the `<sc-raw-select>` custom element, which counts as `select` kind.
- Rooms carries no heading elements in v2 (floor titles are plain
  `div`s), so it extracts an empty `headings` array; Admin role
  selects outside any label fall back to the preceding heading.
- Headings record the static prefix: parenthesised counts (`(2)`) and
  trailing `·`-separated dynamic context (guest names, room refs) are
  excluded per schema section 5.
- Icon-only buttons, unknown nav labels, and labelless controls fail
  loudly instead of passing silently.

App-DOM assertions and CI wiring belong to the sibling issue; per-fact
`app` selectors here are deterministic provenance hints that issue
refines.
