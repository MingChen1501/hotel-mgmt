# Error handling — envelope and conflict semantics

Status: active (accepted direction per ADR-0001, accepted
2026-10-23; outlines, not build detail). Owned by `architect`.
Outline only; implementation and per-service error catalogues follow
later. All messages are user-visible strings and therefore come from
the message catalogue (`NFR-I18N-1`).

## 1. Error envelope

Every failed contract call returns the same shape, and `code` comes from
the one contract enum (`contracts/errors/envelope.json`, gated by
`script/contract-check.sh`); no service answers a code the enum does not
list:

- `code`: a stable machine-readable token from the contract enum
  (`contracts/errors/envelope.json`; `RATE_LIMIT` is not MVP). The MVP
  vocabulary, with its status mapping:
  - `VALIDATION_FAILED` (400 — the caller's body or a field is wrong),
    `NOT_FOUND` (404), `FORBIDDEN` (403), `CONFLICT` (409),
    `STATE_ILLEGAL` (422), `SETTLEMENT_REQUIRED` (409).
  - `UNAUTHENTICATED` (401) and `IDENTITY_LOCKED` (401) —
    session-expiry/lockout refusals, assigned in
    `docs/architecture/lld.md` [section 0](../architecture/lld.md) and
    `docs/technical/integration.md` [section 6](integration.md) C10.
  - `UPSTREAM_UNAVAILABLE` (503) — a provider that must be read to
    decide the operation could not be read, so the operation fails
    closed (`docs/architecture/lld.md` section 0; Refs #601).
  - `INTERNAL_ERROR` (500) — an unexpected exception: a store or
    driver failure, a wiring fault, or a crash. Never the caller's
    input and never `VALIDATION_FAILED`; the message is the existing
    plain unexpected-failure sentence and carries no driver, SQL,
    host, path, or stack-trace text (`NFR-I18N-1`; Refs #627, LLD
    [section 28](../architecture/lld.md)).
  - `METHOD_NOT_ALLOWED` (405) — a wrong method on a known route: a
    caller-conformance answer, not a product refusal. Consumed by the
    Go and Billing conformance changes (#628, #629); no desk action
    sends or can receive it (Refs #627, LLD
    [section 28](../architecture/lld.md)).
- `message`: a human-readable sentence naming what was refused and
  why, suitable to show staff at the desk.
- `details`: the named field, restriction, room, or conflicting
  entity that caused the refusal, so the desk can act on it.
- `traceId`: the hotel-local correlation id linking the error to the
  audit entry (`NFR-AUD-1`).

### 1.1 Request-body ceiling (Refs #630)

Every backend service caps the request body it reads at **65 536 bytes
(64 KiB)**, declared once per service as a code constant and never
configuration (D-34). A body above the ceiling is the caller's mistake,
so it uses the established caller-input code, not a fault and not a new
token: HTTP 400 `VALIDATION_FAILED` with `details` `{"field": "body"}`,
a fresh `traceId`, and the plain catalogue sentence
`error.transport.body_too_large` ("Request body is too large.") in every
service's catalogue. The refusal is one complete envelope: the surplus
is not accumulated, no truncated JSON is parsed, and no partial answer
is written. It is raised where the service reads the body — Node
`readBody`, Go `decodeBody` through `http.MaxBytesReader`, Billing's
body-bounding filter — before parsing and before any store, provider, or
folio call, so a refused request changes nothing. A body at exactly
65 536 bytes is served; one byte more is refused. The ceiling and its
per-service enforcement points are LLD
[section 29.1](../architecture/lld.md#291-one-ceiling-and-where-each-service-enforces-it);
the product conditions are `docs/product/acceptance-criteria.md`
section 22 (`AC-BND-1`..`AC-BND-5`).

### 1.2 Money-amount bounds (Refs #635)

A money field accepts a **whole number of minor units at or below
1 000 000 000 000**. A value outside that shape is the caller's mistake,
so it uses the same caller-input code as every other field refusal, not
a fault and not a new token: HTTP 400 `VALIDATION_FAILED`, `details`
naming the field (`amountMinor` or `priceMinor`), a fresh `traceId`, and
one plain catalogue sentence in Billing's catalogue —
`error.validation.amount_not_integer` ("{field} must be a whole number
of minor units.") for a value that is not whole, or
`error.validation.amount_above_ceiling` ("{field} must be at most {max}
minor units.") for a magnitude above the ceiling, with `{max}` rendered
through the existing number formatter. The refusals are raised in
Billing's adapter before the service, store, provider, or folio call, so
a refused request writes nothing and consumes no idempotency key.

Rules that do not move: a whole value written with a decimal point
(`12.0`) is served as the whole amount it is; an absent field keeps
`error.validation.field_required`; a present value that is not a JSON
number answers `error.validation.field_number`; the sign rules
(`amount_negative`, `amount_positive`, `price_negative`) stay in the
service layer; and a tax-rule percent is bounded as a number only — a
fractional percent stays accepted and the 0–100 range stays the
service's (`error.validation.percent_range`). The ceiling is one code
constant, never configuration. Enforcement point and per-flow diagram:
LLD [section 30](../architecture/lld.md#30-money-amount-bounds-on-the-billing-folio-write-adapter-refs-635);
product conditions: `docs/product/acceptance-criteria.md` section 23
(`AC-AMT-1`..`AC-AMT-5`); business rule BR-61.

### 1.3 Report-window span cap (Refs #641)

A report window is a **span at or under 730 nights** between `dateFrom`
and `dateTo` — 731 inclusive dates. A wider window is the caller's
mistake, so it uses the same caller-input code as every other field
refusal, not a fault and not a new token: HTTP 400 `VALIDATION_FAILED`,
`details` naming `dateTo`, a fresh `traceId`, and one plain catalogue
sentence in Reporting's catalogue —
`reporting.validation.date_range_span` ("dateTo must be at most {max}
nights after dateFrom."), with `{max}` rendered from the store constant
through the catalogue number formatter. It applies to exactly the two
range reports, `OccupancyReport` and `RevenueSummary`; `DailySheet`
carries one business date and `HousekeepingReport` carries no range, so
neither gains a bound.

The refusal is raised where the window is validated, after the session
check and the presence checks and **before the store lock is taken and
before any per-date walk runs**, so a refused window holds no mutex,
walks no date, reads no projection, and never delays another report —
the condition that makes the cap worth having.

Rules that do not move: a missing `dateFrom`/`dateTo` keeps
`error.validation.date_from_required` / `date_to_required`, a malformed
end keeps `error.validation.date_from_format` / `date_to_format`
naming the field, and `dateTo` before `dateFrom` keeps
`error.validation.date_range_order` naming `dateTo` — the order check
answers before the span comparison, so a reversed window never shows the
span sentence. A window at exactly 730 nights is served with the rows,
row order, zero-filled dates, and `asOf` it returns today. The cap is
one store constant, never configuration. Enforcement point, the
nights-versus-dates arithmetic, and the per-flow diagram: LLD
[section 31](../architecture/lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641);
product conditions: `docs/product/acceptance-criteria.md` section 24
(`AC-RPT-5`..`AC-RPT-7`); requirement `NFR-RPT-1` in
`docs/requirements/mvp-requirements.md` section 32; business rule BR-62.

### 1.4 Guest identity and payload bounds (Refs #640)

A guest name lookup is **unambiguous or refused**. `IdentifyGuest`
answers a `fullName` that matches exactly one guest as it does today and
a name that matches none with the existing `NOT_FOUND`
(`guests.notfound.guest_by_name`); a name that matches **two or more**
guests is the caller's input being insufficient, so it uses the
caller-input code, not a fault and not a new token: HTTP 400
`VALIDATION_FAILED` with `details` `{"field": "fullName", "fullName":
<the searched name>, "matches": <the exact count>}`, a fresh `traceId`,
and the plain catalogue sentence `guests.validation.ambiguous_name`
("The name {fullName} matches more than one guest; identify the guest by
id."), with the match count carried in `details.matches` and no second
placeholder. The refusal replaces the whole answer: no profile, `contact`,
`preferences`, `notes`, `returningFlag`, `pastStayCount`, or `stayLinks`
are returned, the links read is never issued, and nothing is written.
Every `guestId` read through `IdentifyGuest`, `GetGuest`, or
`GetBookingContext` is untouched, including for two guests who share a
name.

A guest write is **inside one declared shape or refused**. On
`UpsertGuest`:

- `contact` and `preferences` are plain objects of at most **16**
  fields; each key is non-empty and at most **64** UTF-16 code units;
  each value is text of at most **256** code units, a finite number, or a
  boolean. A present field that is an array, string, number, or boolean,
  or an object with more fields, an empty or longer key, a nested object,
  an array entry, a `null` entry, a longer string entry, or a non-finite
  number entry is refused with `details` naming `contact` or
  `preferences` and the plain `guests.validation.contact_shape`
  sentence.
- `notes` is text of at most **2 000** UTF-16 code units; a present
  non-string value (including `null`) or a longer string is refused with
  `details` naming `notes` and the plain `guests.validation.notes_length`
  sentence ("{field} must be at most {max} characters.") with `{max}`
  rendered from the code constant through the catalogue number
  formatter.
- The checks run in the order `contact`, `preferences`, `notes`, so one
  request answers exactly one envelope naming the first offending field,
  and they run **before the first store access**, so a refusal writes no
  row, no stay link, and no `guest-upserted` event and leaves a stored
  profile exactly as it was. An absent field keeps today's per-store
  behaviour: the in-memory store resets `contact` to `{}` while a
  Postgres update keeps the stored `contact`, and both keep the stored
  `preferences` and, on update, the stored `notes`; an explicit `null`
  `contact`/`preferences` keeps today's `{}` coercion.
- Reads are unbounded: no stored profile is re-validated, truncated, or
  dropped, and no migration, backfill, or repair exists. The four bounds
  are code constants, never configuration.

A confirmation snapshot's two dates must **exist on the calendar**.
`AttachReservation` refuses a shape-valid but calendar-invalid
`dates.checkIn` or `dates.checkOut` (`2026-13-45`, `2026-02-31`,
`2026-00-10`) with HTTP 400 `VALIDATION_FAILED` naming that field and the
existing `guests.validation.date_format` sentence; `2024-02-29` is
accepted; an ordering between the two dates is still not enforced; and
no confirmation is stored, so a later `ProduceConfirmation` still answers
`NOT_FOUND`.

No code, status, enum entry, envelope field, or operation is added:
`VALIDATION_FAILED` is already published for the three operations, and
`contracts/errors/envelope.json` is untouched (ADR-0004 D1). Enforcement
points, the exact bounds, the per-flow diagrams, and the contract
decision: LLD
[section 32](../architecture/lld.md#32-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640);
product conditions: `docs/product/acceptance-criteria.md` section 25
(`AC-GID-1`..`AC-GID-7`); requirements: `FR-GID-1`..`FR-GID-3` in
`docs/requirements/mvp-requirements.md` section 33; business rule BR-63.

### 1.5 Admin authenticates before parsing and refuses a malformed config write (Refs #639)

A session-guarded Admin operation is answered **only after the session
is checked**, and a config value is **inside its key's declared shape or
the whole write is refused**.

Request order. On `POST /v1/admin/<Operation>` other than `SignIn`,
Admin checks the session before it reads the body: a missing token, or
an invalid, expired, revoked, signed-out, or orphan session, answers
exactly one HTTP 401 `UNAUTHENTICATED` with the matching existing
`error.auth.*` sentence, `details` as today, and a fresh `traceId`.
No `VALIDATION_FAILED`, and none of the `error.transport.bad_json`,
`body_not_object`, or `body_too_large` sentences, comes back; the
payload is never read, parsed, or measured, so its size, shape, and
fields stay unobservable. A resolved session then reads the body and
keeps today's 400 `VALIDATION_FAILED` with the existing transport
sentence for a malformed body, and the front-desk `FORBIDDEN` 403 is
reached only for a well-formed body — the order is **401, then 400,
then 403**. `SignIn` keeps today's order in both directions (its body
is read and its fields validated as today, with its 5-failure lockout),
and `GET /healthz`, the route match, and the unknown-path 404 stay
before the session check and read no body. This adds no code token and
no status-mapping change: `UNAUTHENTICATED` (401) and
`VALIDATION_FAILED` (400) already exist (ADR-0004 D1).

Config write shapes. `UpdateHotelConfig` applies one per-key table
before its first write; a key outside the table keeps today's behaviour
exactly (written as sent):

| Key | Declared shape |
|---|---|
| `name` | non-empty text after trimming (today's rule) |
| `timezone` | non-empty text after trimming |
| `standardCheckinTime`, `standardCheckoutTime` | 24-hour `HH:MM` (`00`-`23`:`00`-`59`) |
| `requiredGuestFields` | an array with at least one entry; every entry non-empty after trimming; no two entries equal after trimming |
| `cancellationReasons` | an array whose every entry is non-empty after trimming; `[]` allowed |
| `retentionFloorDays` | a whole JSON number at or above 0 |
| `cancellationWording`, `address`, `phone`, `email` | text; `""` allowed |

The first offending key in the request's entry order refuses the whole
write with HTTP 400 `VALIDATION_FAILED`, `details` `{"field": <key>}`,
and that key's plain sentence — `error.validation.field_required`
(existing, `name`), `config_text` ("{field} must be non-empty text."),
`config_time` ("{field} must be a 24-hour HH:MM time."),
`config_required_fields` ("{field} must list at least one guest field,
each a non-empty entry, without duplicates."), `config_list` ("{field}
must be a list of non-empty text entries."),
`config_optional_text` ("{field} must be text."), and the existing
`retention_floor` ("retentionFloorDays must be a non-negative
integer."). Nothing is written for the refused request — not the
offending key, and not a valid key sent beside it — and no
`config.updated` audit entry is recorded. A `values` that is not an
object and a missing or blank `updatedBy` keep their existing refusals
and their place ahead of the per-key checks. The check runs in both
stores before the first write (or in one helper both call), so the
in-memory and Postgres stores refuse the same values; every conforming
value is stored verbatim, read back, and audited exactly as today. The
rules and sentences are fixed code constants, never configuration.

No code, status, enum entry, envelope field, route, or operation is
added: `contracts/errors/envelope.json` is untouched, and the
`UpdateHotelConfig` error list gains only prose (the ordering and shape
clauses). Enforcement points, the per-key table, the per-flow diagrams,
the verification plan, and the contract decision: LLD
[section 33](../architecture/lld.md#33-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639);
per-service note: `docs/architecture/services/admin.md` sections 2, 4,
and 6; product conditions: `docs/product/acceptance-criteria.md`
section 26 (`AC-CFG-1`..`AC-CFG-5`); requirements: `FR-CFG-1`..`FR-CFG-3`
in `docs/requirements/mvp-requirements.md` section 34; business rule
BR-64.

### 1.6 Audit-actor provenance changes no refusal (Refs #643)

The recorded audit actor comes from the authenticated session, never
from the request's `actor`/`updatedBy` string (LLD
[section 34](../architecture/lld.md#34-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643)).
This changes no error answer:

- **No new code, status, `details` key, or sentence.** The envelope
  enum and status mapping are untouched (`contracts/errors/envelope.json`),
  and no message-catalogue key is added or reworded.
- **The existing refusals keep their place.** A missing, blank, or
  wrongly typed `actor` keeps today's `VALIDATION_FAILED` (400) naming
  `actor` where the service already requires or validates it (Stay,
  Guests, Rooms `requireString`; `CheckOutReservation`'s
  `field_required`; Billing's `actorOf`), and writes nothing. A missing
  or refused session keeps today's `UNAUTHENTICATED` (401) with the same
  `error.auth.*` sentence and the same order relative to the body read
  on each path; the Admin order (401, then 400, then 403) does not move.
- **A disagreement is never refused.** A request whose `actor` differs
  from the session is answered exactly like an honest one — same status,
  same body, same stored business effect — because the request value is
  demoted, not rejected. The only trace is the additive `requestActor`
  key in a JSON outbox payload when the write emits one; a column-only
  write drops the value and records the session actor. A refusal for a
  disagreement would be a contract change of its own.
- **Nothing is written on a refusal.** A refused write still records no
  row, no outbox event, no change row, and no history row, so
  `NFR-AUD-1` is unaffected on the refusal path.

## 2. Conflict semantics (overbooking and double assignment)

- A booking refused for lack of sellable availability returns
  `CONFLICT` naming the room type and dates (`NFR-CON-1`); the
  reservation is not created.
- A check-in refused because the room was just taken returns
  `CONFLICT` naming the room (`NFR-CON-2`); the stay is not created.
- A reservation violating a stay restriction returns
  `STATE_ILLEGAL` naming the violated restriction (`FR-RTE-4`).
- A booking or check-in missing a hotel-mandatory guest field
  returns `VALIDATION_FAILED` naming the missing field
  (`FR-CUS-1`).
- A check-out with an open balance and no provenanced approval
  returns `SETTLEMENT_REQUIRED` (`FR-BIL-7`, `FR-CKO-5`, `BR-17`). An
  approval that is missing its identity or recorded time, names a role
  outside the fixed three, or is a free-form note is not an approval
  and takes the same code.
- A check-out whose folio cannot be re-read from Billing returns
  `UPSTREAM_UNAVAILABLE` (503), never `SETTLEMENT_REQUIRED`: the gate
  fails closed on an unverified balance rather than reporting an
  unpaid folio it did not read (Refs #601).
- A booking whose capacity source cannot be read returns
  `UPSTREAM_UNAVAILABLE` (503), never `CONFLICT`: the guard fails
  closed on an unverified ceiling rather than reporting a sold-out type
  it did not read (Refs #631).
- A booking refused because the recorded capacity is exhausted returns
  `CONFLICT` naming the room type and dates, whether the request's
  `sellableUnits` agreed with that capacity or not (Refs #631).
- An out-of-role attempt returns `FORBIDDEN` (`NFR-SEC-1`).

## 3. Non-goals

- No retry or backoff policy is set here; synchronous calls are
  HTTP/JSON POST and asynchronous events travel the outbox +
  dispatcher (`docs/architecture/lld.md` [section 0](../architecture/lld.md);
  `docs/technical/integration.md` [section 0](integration.md) rule).
- No on-screen audit log view in the MVP (recording only,
  `NFR-AUD-1`).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-919

## 4. Definitive refusals and unreadable outcomes on a multi-call desk action (Refs #647)

A desk action that writes through more than one service (the arrival
check-in commit, a room reassignment) must decide, per failed call,
whether the earlier writes of that action are taken back. One rule, so
two screens cannot disagree:

- **Definitive refusal — a `4xx` envelope answer to the call itself.**
  `VALIDATION_FAILED` (400), `NOT_FOUND` (404), `CONFLICT` (409), and
  `STATE_ILLEGAL` (422) are raised before the target mutates, so a
  definitive answer proves that call wrote nothing. The action may and
  must undo what it wrote earlier in the same action (the desk issues the
  compensating release).
- **Unreadable outcome — everything else.** A transport failure or
  offline state (`code: "OFFLINE"`, no status), a `5xx`
  (`UPSTREAM_UNAVAILABLE` included), a non-envelope reply, and a `401`
  (routed to the sign-in gate) all leave the write's fate unknown. The
  desk releases nothing and names the rooms to re-read, because freeing a
  room the guest may be in is worse than a room that still reads
  occupied.
- **A refusal speaks only for its own call.** Codes name the call that
  refused, never the earlier writes of the action; the compensation is
  chosen by the step that failed.
- **Compensation is the caller's explicit call, not a service
  behaviour.** No module rolls back another module's write
  (`docs/architecture/services/rooms.md` section 4); the compensating
  release is an ordinary `ReleaseRoom` with an explicit `toState`, and a
  compensating release that fails is reported, never hidden.
- **No new code.** The classification reads the codes and statuses in
  section 1; no error code, envelope field, or retry policy is added by
  this rule.

Applied flow detail: `docs/architecture/lld.md` section 23.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-961

## 5. Folio-route refusals (Refs #634)

A folio route creates or moves money, so it reads the stay it is about
before it writes anything and refuses on the provider's answer rather
than on the caller's id. The rule set, applied to `PostCharge`,
`RecordPayment`, `RecordOpenBalanceApproval`, and the folio-creating
`GetFolioBalance`:

- **Unknown stay** -> `NOT_FOUND` (404) naming the stay. Stay answered
  for that id and found nothing; Billing adds nothing to the vocabulary
  (ADR-0008 D3).
- **Stay not in house** -> `STATE_ILLEGAL` (422) naming the stay and the
  state it is in, whether or not the stay already carries a folio. A
  closed stay's folio still reads and still prints; only writes refuse.
- **Malformed stay id** -> `VALIDATION_FAILED` (400) naming `stayId`,
  unchanged and raised before any call.
- **Unreadable Stay** -> `UPSTREAM_UNAVAILABLE` (503) with
  `{upstream: "stay", operation: "GetStayRef"}`, and nothing is written.
  Fail closed, never a cached or guessed stay state: the offline-first
  rule is for configuration, not for a fact that decides money
  (section 2's #601 reading, applied to the write path).
- **A provider `4xx` envelope is surfaced unchanged.** A rejected
  session stays `UNAUTHENTICATED`; it is not an outage and must not be
  reported as one.
- **A `404` that does not name the requested stay is unreadable.** Stay
  sends the id it could not find, so a `404` naming another stay (or
  none) is a wiring fault — a wrong base URL or path — and takes
  `UPSTREAM_UNAVAILABLE`. A misconfiguration must never read as a
  product refusal on a money path.
- **No new code.** `NOT_FOUND`, `STATE_ILLEGAL`, `VALIDATION_FAILED`, and
  `UNAUTHENTICATED` are already in section 1 and in
  `contracts/errors/envelope.json`. `UPSTREAM_UNAVAILABLE` is the code
  section 1 already describes and the envelope file was missing it; the
  registration (enum plus `statusMapping` 503) belongs to the #627 change,
  whose D-33 supersedes the D-32 clause that placed that edit here — this
  rule set adds no enum entry, and the #627 registration also closes the
  drift ADR-0005 records.
- **Refusals precede writes.** The verification runs before the
  idempotency claim and before any insert, so a refusal leaves no folio
  row, no line, no balance movement, no approval, and no outbox event.
  Applied flows: `docs/architecture/lld.md` section 27.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1046

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1117

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1130

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1141

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1164
