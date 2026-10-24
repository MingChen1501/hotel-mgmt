# Message catalogue (NFR-I18N-1)

Single source of truth for user-visible strings, per api-spec
section 1: every user-visible string comes from this catalogue, no
behaviour depends on English wording, and dates, numbers, and
currency follow the active locale. Only the default locale (`en`)
ships; a new locale is a new file with the same keys — no behaviour
code changes.

## Files

- `en.json` — the catalogue: `{"locale": "en", "messages": {key: pattern}}`.
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
catalogue replaces. No translations beyond `en` ship in this change.

## Runtime mirrors (one catalogue, embedded copies)

Each runtime embeds a copy so services and pages work without extra
file mounts; every mirror MUST be byte-identical to `en.json` and
the coverage script fails the build otherwise:

- Go (`services/reservations`): `internal/messages/en.json`
  (`//go:embed`), overridable at runtime with
  `MESSAGE_CATALOGUE_PATH`.
- Node (`services/admin`): `src/messages.en.json` (imported at
  compile time), overridable at runtime with
  `MESSAGE_CATALOGUE_PATH`.
- Spring (`services/billing`): `src/main/resources/messages/en.json`
  (classpath resource), overridable at runtime with
  `MESSAGE_CATALOGUE_PATH`.
- Browser (`frontend/`): `frontend/messages/en.json` (fetched by
  `frontend/messages.js`), with the English text kept inline as the
  no-JS fallback. Static elements carry `data-msg="key"`; inline
  scripts resolve through `DeskMessages.msg(key, params, fallback)`.

To extend coverage to a new surface (follow-up #201 owns
rates/reporting/rooms/stay/guests plus `script/` wording): add keys
here, add the call sites, extend `sample.json`, and mirror as above.
