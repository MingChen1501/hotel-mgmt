# Error handling — envelope and conflict semantics

Status: active (accepted direction per ADR-0001, accepted
2026-10-23; outlines, not build detail). Owned by `architect`.
Outline only; implementation and per-service error catalogues follow
later. All messages are user-visible strings and therefore come from
the message catalogue (`NFR-I18N-1`).

## 1. Error envelope

Every failed contract call returns the same shape:

- `code`: a stable machine-readable token (for example
  `RATE_LIMIT` is not MVP; representative MVP codes:
  `VALIDATION_FAILED`, `NOT_FOUND`, `UNAUTHENTICATED`
  (session-expiry/lockout refusals, assigned in
  `docs/architecture/lld.md` [section 0](../architecture/lld.md) and
  `docs/technical/integration.md` [section 6](integration.md) C10), `FORBIDDEN`,
  `CONFLICT`, `PRICE_CHANGED` (409 — the booking request asserted a
  total that disagrees with the Rates quote; Refs #632),
  `STATE_ILLEGAL`, `SETTLEMENT_REQUIRED`,
  `UPSTREAM_UNAVAILABLE` (503 — a provider that must be read to decide
  the operation could not be read, so the operation fails closed;
  registered in `docs/architecture/lld.md` section 0, Refs #601)).
- `message`: a human-readable sentence naming what was refused and
  why, suitable to show staff at the desk.
- `details`: the named field, restriction, room, or conflicting
  entity that caused the refusal, so the desk can act on it.
- `traceId`: the hotel-local correlation id linking the error to the
  audit entry (`NFR-AUD-1`).

## 2. Conflict semantics (overbooking and double assignment)

- A booking refused for lack of sellable availability returns
  `CONFLICT` naming the room type and dates (`NFR-CON-1`); the
  reservation is not created.
- A check-in refused because the room was just taken returns
  `CONFLICT` naming the room (`NFR-CON-2`); the stay is not created.
- A reservation violating a stay restriction returns
  `STATE_ILLEGAL` naming the violated restriction (`FR-RTE-4`).
- A booking or modify request whose asserted `priceBasis.totalMinor`
  disagrees with the Rates quote for the effective room type, dates,
  and discount returns `PRICE_CHANGED` (409) naming both totals
  (`requestedTotalMinor`, `quotedTotalMinor`) plus the type and the
  dates (`BR-13`; Refs #632). The request total is never stored, and
  nothing is created or changed.
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

## 5. Price-change refusals on the booking write (Refs #632)

A booking write reads its money fact from the module that owns it, so
two different outcomes must not be conflated:

- **Disagreement — `PRICE_CHANGED` (409).** The caller asserted a
  `priceBasis.totalMinor` that the Rates `QuotePrice` read does not
  return for the effective room type, dates, and discount. `details`
  carries `roomTypeId`, `arrivalDate`, `departureDate`,
  `requestedTotalMinor`, and `quotedTotalMinor`. Nothing is created,
  changed, or reserved. It is not `CONFLICT`: `CONFLICT` means two
  callers competed for one unit, `PRICE_CHANGED` means one caller's
  claim about the price is stale, and the desk recovers by re-quoting
  and asking for a second confirmation rather than by retrying the same
  request. It is not `VALIDATION_FAILED` either: the field was present
  and well-formed, it just disagreed with the price in force.
- **Unreadable Pricing — `UPSTREAM_UNAVAILABLE` (503).** Transport
  failure, timeout, 5xx, a non-envelope reply, or an unwired client.
  The booking fails closed instead of freezing an unverified total, the
  same rule the check-out gate applies to an unreadable folio
  (section 2). The desk keeps the quote it displayed and may retry.
- **Definitive Rates refusal — surfaced unchanged.** A 4xx envelope
  from `QuotePrice` keeps its code, message, and details: `NOT_FOUND`
  with `details.reason` `no_rate_price` (a night has no price row) or
  `no_rate_plan` (no plan prices the type), and `VALIDATION_FAILED` for
  an unknown discount or an ambiguous plan set naming `ratePlanName`.
  The type is not open for booking in the terms the desk's quote step
  already reports, and nothing is stored.

The split follows section 4's definitive-versus-unreadable rule: a 4xx
answer proves the call wrote nothing, so it is reported as the provider
named it; everything else is an unknown outcome and fails the write
closed. No new envelope field is added by this section; `PRICE_CHANGED`
joins the code enum in section 1 and the flow detail is
`docs/architecture/lld.md` [section 24](../architecture/lld.md#24-server-side-reservation-price-authority-refs-632).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-990
