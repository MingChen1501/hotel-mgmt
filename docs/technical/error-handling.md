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
