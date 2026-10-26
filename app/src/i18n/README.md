# Catalogue layer (`app/src/i18n/`, Refs #292, #339)

Read-only consumer of the canonical catalogues (`messages/en.json`
default plus `messages/vi.json` for the pilot desk; key naming and
locale rules live in `messages/README.md`). This module owns no keys,
adds none, and edits none — screen slices render catalogue strings
through `t()` and switch behaviour on envelope codes, never on
resolved wording. The active locale (`localeTag`, default `en`)
persists in `localStorage` under `hotel-mgmt.desk.locale` — locale
only, never auth/session data.

## Import (offline LAN holds)

`index.ts` imports `messages/en.json` and `messages/vi.json` as
static modules, so Vite bundles both catalogues into `app/dist/` at
build time: no fetch, no CDN, no runtime dependency beyond the
served `dist/`. There is no vendored copy under `app/`, so no
byte-identical mirror guard is needed — the bundle always carries
the canonical files. `script/catalogue-coverage-check.sh` §6 pins
the `vi` key set and placeholder parity.

## Per-service catalogue boundary (who owns which keys)

| Key prefix | Owner | Vue-layer use |
|---|---|---|
| `error.*` | Shared across services (identical English sentences reused by every service) | Rendered read-only from error envelopes |
| `desk.*` | Desk screens (legacy `frontend/*.html` via `data-msg` + `DeskMessages.msg` today; Vue screen slices in follow-ups 3–8) | Adopted screen by screen; this slice wires the layer only |
| `rates.*` | Rates service | Rendered read-only from rate envelopes |
| `rooms.*` | Rooms service | Rendered read-only from room envelopes |
| `stay.*` | Stay service | Rendered read-only from stay envelopes |
| `guests.*` | Guests service | Rendered read-only from guest envelopes |
| `reporting.*` | Reporting service | Rendered read-only from reporting envelopes |
| `script.runbook.*` | Shell runbook scripts (resolved via `script/messages.sh`) | Not for Vue display |

## Semantics

`t(key, params, fallback)` matches `DeskMessages.msg` in
`frontend/messages.js`: known keys substitute `{param}`
placeholders (unmatched placeholders stay literal); a key missing
from the active locale falls back to the `en` pattern first;
unknown keys return the explicit fallback, else
`message-missing:<key>`.
