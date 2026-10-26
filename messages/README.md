# Message catalogue (NFR-I18N-1)

Single source of truth for user-visible strings, per api-spec
section 1: every user-visible string comes from this catalogue, no
behaviour depends on English wording, and dates, numbers, and
currency follow the active locale. The default locale (`en`)
always ships; Vietnamese (`vi`) ships beside it for the pilot desk.
Any further locale is a new file with the same keys — no behaviour
code changes.

## Files

- `en.json` — the default-locale catalogue: `{"locale": "en", "messages": {key: pattern}}`.
- `vi.json` — the Vietnamese catalogue for the pilot desk (Refs #339):
  same key set as `en.json`, receptionist-friendly hotel-domain
  wording, `{param}` placeholders intact. The desk shell resolves the
  active locale through `app/src/i18n/` with fallback to `en`.
- `schema.json` — structural schema for `en.json` (key shape, types).
- `sample.json` — the bounded coverage sample: every key the
  `script/catalogue-coverage-check.sh` guard enforces, with the
  migrated call sites and the declared placeholder types.
- `README.md` — this file.

## Key naming

`<surface>.<domain>.<name>`, lowercase with underscores:

- `error.transport.*`, `error.auth.*`, `error.validation.*`,
  `error.conflict.*`, `error.notfound.*`, `error.state.*`,
  `error.store.*` — shared error-envelope sentences. Keys are shared
  across services when the English sentence is identical
  (for example every service uses `error.auth.missing_token`).
- `desk.entry.*`, `desk.admin.*` — static desk-console copy.
- `rates.*`, `reporting.*`, `rooms.*`, `stay.*`, `guests.*` —
  per-service envelope sentences added in issue #201, following the
  shared-`error.*` shape (`<surface>.validation|notfound|state|
  conflict|settlement|store.<name>`).
- `script.runbook.*` — operator-visible runbook wording from
  `script/preflight.sh`, `script/backup.sh`, `script/restore.sh`,
  and `script/e2e-desk-loop.sh` (issue #201), resolved at runtime
  through `script/messages.sh` with an inline fallback.

## What is NOT catalogued

Machine tokens stay code: error `code` values (`CONFLICT`,
`FORBIDDEN`, …), role ids (`owner`, `front-desk`), reservation
states, field names inside `details`, and value placeholders such as
`{ref}` or `{arrivalDate}`. Tests and behaviour switch on codes and
details, never on resolved wording.

## Placeholders and locale formatting

Patterns use `{name}` placeholders. `sample.json` declares each
placeholder's type: `string` (refs, ids, ISO dates kept as data),
`integer` (counts and bounds, rendered through the loader's
locale-aware number formatter so grouping follows the active
locale), `date`, `moneyMinor` (rendered through the loader's
locale-aware date/currency formatters; capability covered by loader
unit tests). Amounts stay integers in minor units on the wire;
formatting happens only at render.

The default-locale rendering is byte-identical to the strings this
catalogue replaces. Besides `en`, only `vi` ships (Refs #339).

## Runtime mirrors (one catalogue, embedded copies)

Each runtime embeds a copy so services and pages work without extra
file mounts; every mirror MUST be byte-identical to `en.json` and
the coverage script fails the build otherwise:

- Go (`services/reservations`, `services/rates`,
  `services/reporting`): `internal/messages/en.json`
  (`//go:embed`), overridable at runtime with
  `MESSAGE_CATALOGUE_PATH`.
- Node (`services/admin`, `services/rooms`, `services/stay`,
  `services/guests`): `src/messages.en.json` (imported at
  compile time), overridable at runtime with
  `MESSAGE_CATALOGUE_PATH`.
- Spring (`services/billing`): `src/main/resources/messages/en.json`
  (classpath resource), overridable at runtime with
  `MESSAGE_CATALOGUE_PATH`.
- Browser (`app/`, Vue 3 + Vite CSR per ADR-0003): the app imports
  the canonical `messages/en.json` as a static module through
  `app/src/i18n/` (bundled into `dist/` at build time, so the desk
  UI works offline with no CDN and no runtime catalogue fetch).
  Component strings resolve through the `t(key, params, fallback)`
  wrapper, which keeps the former `DeskMessages.msg(key, params,
  fallback)` semantics from the decommissioned
  `frontend/messages.js` (Refs #299). The English fallback text
  stays inline at each call site as the no-key fallback.
- Shell (`script/`): no embedded copy — `script/messages.sh`
  reads the canonical `messages/en.json` at runtime (repo-relative),
  with the inline fallback printed when the catalogue is unreadable,
  the key is missing, or python3 is unavailable.

To extend coverage to a new surface: add keys
here, add the call sites, extend `sample.json`, and mirror as above.
