# ADR-0006: Server-side reservation price authority — Reservations re-derives the frozen total from Pricing

Status: proposed (Refs #632). Owned by `architect`.

Date: 2026-11-11 (proposed).

## Context

Audit finding R2 (the #625 class, filed as #632): the reservation's
frozen price basis is supplied by the caller and never checked against
the module that owns prices. Traced read-only at this spec head:

- The handler reads the total out of the body on both write routes —
  `priceBasis.totalMinor` (with a top-level `discountName` fallback) for
  `CreateReservation`
  (`services/reservations/internal/handler/handler.go:130-131`, helpers
  `nestedPrice`/`nestedDiscount` at `:346-362`) and the same pair for
  `ModifyReservation` (`:240-241`).
- The service's only checks are presence and `>= 0`
  (`services/reservations/internal/service/service.go:101` on Create,
  `:181` on Modify), after which the value is handed straight to the
  store (`:127`, `:233`).
- The store persists it verbatim (`internal/store/store.go:236`, the
  Postgres insert/update at `internal/store/postgres.go:139`, `:608`)
  and re-freezes it on Modify under an unchanged-total comparison,
  writing the `priceBasis` change-history row with the actor
  (`internal/store/store.go:437-440`; `internal/store/postgres.go:601-605`).
- No quote call exists on the booking path. The wired Rates client has
  one operation, `Check`
  (`POST {RATES_BASE_URL}/v1/rates/CheckRestrictions`,
  `internal/pricing/client.go:43-87`, 5-second timeout at `:33`), and
  boot wires exactly that one hook (`cmd/server/main.go:42-47`).
- Downstream money reads the frozen total: the #600 check-out review
  posts one `nightly-room-charge` line at `priceBasis.totalMinor`
  (D-24), so the number a caller invents becomes the money the guest is
  charged, and the printed documents carry it.

A caller that never touches the desk therefore freezes any total it
likes. The desk itself already quotes the way the server would — the
Book screen reads `QuotePrice` for the type, dates, and typed discount
with no rate plan named (`app/src/views/BookView.vue:784-793`) and
sends that total back as `priceBasis` (`:926-937`) — so a server-side
recompute over the same inputs reproduces the number the clerk saw and
adds no new failure mode the desk does not already handle.

Inputs this record builds on:

- Product scope and done-conditions: `docs/product/acceptance-criteria.md`
  section 17 (`AC-PRC-1`..`AC-PRC-5`), the record in
  `docs/project/decision-log.md` D-28, and the risk in
  `docs/project/risk-register.md` R-12.
- `BR-13` / `FR-RTE-5` already state that the price basis recorded at
  booking is the quoted one and never changes unless staff explicitly
  recalculate it; `BR-2`, `FR-RES-2`, and `NFR-AUD-1` already require
  a reprice on Modify to keep the actor and time. No rule is reworded
  here.
- The precedent: ADR-0005
  (`docs/architecture/decisions/adr-0005-server-side-checkout-gate.md`,
  proposed) makes Billing the authority for the balance Stay gates on,
  re-read at the decision point, advisory request fields, and fail
  closed with `UPSTREAM_UNAVAILABLE`.
- The established sync pattern: Reservations -> Rates with
  `RATES_BASE_URL` (default `http://rates:8082`), the caller's Bearer
  token forwarded, a 5-second timeout, and a fail-closed 503
  (`docs/architecture/services/reservations.md` section 5).
- Drift this record also closes: `docs/architecture/lld.md` section 1
  has always listed `PricingService.QuotePrice` among Reservations'
  outbound calls and `docs/technical/integration.md` C1 has always
  listed the operation, but no booking-path code ever made the call.

## Decision

### D1 — Authority: Pricing owns the price, Reservations owns the frozen basis, the caller asserts neither

Pricing (`PricingService.QuotePrice`) is the only authority for what a
stay costs for a room type, a date range, and a discount. Reservations
is the only authority for the price basis a booking freezes. A request
field that restates the price is advisory input at most: it is compared
for agreement and never used to set a stored value. The desk browser may
assert which room type, which dates, and which discount it is booking;
it may not assert the total.

### D2 — Re-derive on Create and on Modify, from the effective inputs, in the same request

`Service.Create` and `Service.Modify` take one `QuotePrice` read each,
during the request that writes the booking:

- request `{roomTypeId, arrivalDate, departureDate, discountName?}` —
  the effective values: on Create the validated body; on Modify the
  post-change type, dates, and discount, where an omitted field keeps
  the stored value (already computed for the restriction check,
  `internal/service/service.go:207-222`). `ratePlanName` is not sent,
  exactly as the desk's own quote does not send it
  (`app/src/views/BookView.vue:784-793`): `QuotePrice` resolves the plan
  when exactly one prices the type.
- the caller's Bearer token forwarded, `RATES_BASE_URL`, 5-second
  timeout — the existing client and its existing configuration, not a
  new dependency knob (`internal/pricing/client.go:26-34`;
  `cmd/server/main.go:42-47`).
- response `totalMinor` and `discountName` are the values the booking
  freezes: the store receives the quote's total and the quote's applied
  discount name, and the price the response reports (`quotedTotal` on
  Create, `recalculatedTotal` on Modify, `internal/handler/handler.go:157`,
  `:264`) is that same number.

Order inside the write step, and why:

1. field/date/price-shape validation (unchanged);
2. the existing `CheckRestrictions` call with the effective values — a
   restriction refusal means re-quoting cannot help, so it keeps its
   place and its `STATE_ILLEGAL` terms;
3. the idempotency pre-read (D5);
4. the `QuotePrice` read, the comparison (D3), and the fail-closed
   branch (D4);
5. the unchanged guarded store write (overbooking count, insert or
   update, change-history row, event).

The quote is deliberately **outside** the store mutex. The guarded store
step is one mutex- or transaction-held critical section
(`internal/store/store.go:206`); performing a 5-second-bounded network
call inside it would block every other booking for the duration of a
Rates outage.

### D3 — A disagreement refuses; the server total is never substituted silently

When the request's `priceBasis.totalMinor` differs from the quote —
lower, higher, or zero for a priced stay — the request is refused with
`PRICE_CHANGED` (409), details
`{roomTypeId, arrivalDate, departureDate, requestedTotalMinor, quotedTotalMinor}`,
and nothing is written: no reservation row, no availability consumed,
no change-history row, no event. A caller that sends no total at all
still fails shape validation as today (`VALIDATION_FAILED` naming
`priceBasis`), so the 409 is only ever about a total that was asserted
and disagreed.

Silently storing the server total was rejected: it would charge a guest
a price nobody showed them, and `BR-13` keeps a quoted price fixed until
staff explicitly recalculate it (`FR-RES-2`), so the reprice has to be
visible rather than done behind the desk's back. The desk recovers by
re-quoting and asking for a second confirmation (`AC-DSK-20`), which
means the clerk always sees the number that gets booked.

A total that agrees is stored at that value — the quote's — and a
booking that legitimately quotes zero (a complimentary discount) is
booked at zero, because zero is what Pricing returned.

### D4 — Unreadable Pricing fails closed; a definitive Rates answer is surfaced

An unreadable Pricing service — transport failure, timeout, 5xx, a
non-envelope reply, or an unwired client — refuses the booking with
`UPSTREAM_UNAVAILABLE` (503),
`{upstream: "rates", operation: "QuotePrice"}`, and nothing is written.
The offline-first cached-config rule does not extend to a money fact
(`NFR-AVL-1`): no booking is ever frozen at an unverified, invented, or
assumed-zero total.

A definitive Rates refusal is surfaced unchanged, so the type stays
not-open-for-booking in the terms the desk already understands: a night
with no price row is `NOT_FOUND` with `details.reason: no_rate_price`, a
type no plan prices is `NOT_FOUND` with `details.reason: no_rate_plan`,
an unknown discount is `VALIDATION_FAILED` naming `discountName`, and an
ambiguous plan set (several plans price the type and the request named
none) is `VALIDATION_FAILED` naming `ratePlanName`
(`services/rates/internal/store/store.go:271-278`, `:384-401`). The
definitive-versus-unreadable split is the one
`docs/technical/error-handling.md` section 4 records for multi-call desk
actions.

### D5 — A booking that already exists is returned, not re-quoted

A repeated `idempotencyKey` for a booking already stored returns that
booking at the total it was stored with — never a second quote and never
a `PRICE_CHANGED` refusal for a booking that exists. The write step
gains a replay pre-read ahead of the quote (a `Replay(key)` repository
read resolving the key to its stored reservation, the same key-only
lookup both stores already perform at `internal/store/store.go:208-212`
and `internal/store/postgres.go:159-171`, `:496-508`). The store's own
replay check inside the guarded step stays exactly as it is, so a
concurrent double submit still books once; the pre-read only decides
whether Pricing needs to be asked.

### D6 — Additive contract change, no schema change

`CreateReservation` and `ModifyReservation` keep requiring `priceBasis`
for the deprecation window so the current desk build keeps working, but
it becomes advisory: "compared with the quote, never stored". The error
sets gain `PRICE_CHANGED` (409) and `UPSTREAM_UNAVAILABLE` (503). That
is a minor contract bump under ADR-0004 D1 (relaxed meaning plus new
error codes; no field removed, renamed, retyped, or made newly
required), and `PRICE_CHANGED` is registered as an envelope code. No
schema, table, migration, column, or event changes: the stored
`priceBasis` keeps its shape.

## Consequences

- Reservations makes a second synchronous read per create and per
  modify (restrictions plus quote) against the same upstream and the
  same base URL. No new environment variable, no new container, and no
  runtime cycle: Rates has no outbound runtime dependency
  (`docs/architecture/services/rates.md` section 5).
- The booking step now has a second fail-closed dependency. A Rates
  outage refuses new bookings and modifications for as long as it
  lasts; a booking that already exists is still readable, cancellable,
  and checkable-in. This is accepted for a money path, matching the
  check-out gate's treatment of an unreadable folio (ADR-0005 D4).
- The two Rates reads are not one snapshot. A rate edit that lands
  between the quote and the store write is not seen by that booking; the
  window is one request on a single-desk installation and `BR-13`
  freezes whatever was quoted either way.
- The Modify change history already records a price-basis change with
  the actor and time (`internal/store/store.go:437-440`;
  `internal/store/postgres.go:601-605`); after this change the recorded
  values are the server's. A discount-name change that leaves the total
  identical still records no row — the history stays keyed on the total,
  unchanged by this record.
- `PRICE_CHANGED` becomes a registered envelope code. This record also
  registers `UPSTREAM_UNAVAILABLE` (503), which ADR-0005 section 21.5
  promised but which is absent from `contracts/errors/envelope.json` at
  this head (no occurrence under `contracts/`).
- Guards: the verification plan is `docs/architecture/lld.md` section
  24.6 — forged-low, forged-high, matching (including a legitimate
  zero), unreadable, each definitive refusal, the replay, and the
  Modify reprice with its history row. The #600 room-charge posting and
  the #588/#601/#646/#647 pins stay green.
- Rollback: revert the single implementation PR. The desk's
  `PRICE_CHANGED` recovery is inert when the service never raises the
  code, so the former desk-supplied price returns with no data
  migration in either direction; bookings frozen at a client-supplied
  total before this change keep their totals and are repriced only when
  staff next modify them.
- This ADR starts at `proposed`; only the owner flips it to `accepted`.
  The implementation PR starts only after owner acceptance plus a T3
  `SPEC-GATE PASS` on #632.

## Out of scope

- The availability decision (its own issue): the overbooking guard,
  `sellableUnits`, and `CheckSellableCount` are untouched.
- The stored `priceBasis` shape: no per-night breakdown, no rate-plan
  name, no currency field is added to a reservation.
- The desk composition and the `PRICE_CHANGED` recovery screen half
  (#618 and `AC-DSK-20`); this record only fixes the code and its
  envelope details the desk switches on.
- A manual price override on the desk: none exists and none is added.
- Backfilling or re-deriving bookings already frozen at a caller-supplied
  total.
- Rewording `BR-13`, `FR-RTE-5`, `FR-RES-1/2`, or `BR-2`; the product
  and requirement wording are sibling handoffs.

## Options considered

### Option A — Keep trusting the caller (status quo)

- Upside: no change, no new dependency, no extra call.
- Downside: a caller that bypasses the desk freezes any total, and the
  #600 room charge posts it. Rejected: this is the finding.

### Option B — Replace the request total with the server quote silently

- Upside: no refusal, one round trip, the desk needs no change.
- Downside: a booking is charged at a total the clerk never saw and
  `BR-13`'s "staff explicitly recalculate" becomes a hidden reprice; the
  response total and the confirmed screen disagree. Rejected.

### Option C — Compare and refuse with `PRICE_CHANGED` (chosen)

- Upside: the frozen total is always Pricing's; a stale quote becomes a
  visible, recoverable refusal; the desk's re-quote path already exists;
  reuses the ADR-0005 shape (advisory field, provider re-read,
  fail-closed, additive contract).
- Downside: one extra synchronous read per booking and one new refusal
  the desk must recover from.

### Option D — Re-derive the price at check-out instead of at booking

- Upside: no new read on the booking path.
- Downside: not a gate — the guest is already in house and the booking
  is already stored; it also contradicts `BR-13` (the price is fixed at
  booking). Rejected.

### Option E — Quote inside the guarded store step

- Upside: the quote cannot race the write, and the replay is checked
  first by construction.
- Downside: the booking mutex or transaction would be held across a
  5-second-bounded network call, so one Rates hiccup stalls every
  booking. Rejected; the replay pre-read in D5 buys the same
  "no second quote for an existing booking" property without it.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-990
