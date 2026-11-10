# ADR-0006: Reservation availability — the recorded room inventory is the ceiling

Status: proposed (Refs #631). Owned by `architect`.

Date: 2026-11-10 (proposed).

## Context

Audit finding R1 (the #625 class — a client-supplied value decides the
outcome) on the booking path:

- `sellableUnits` arrives straight from the request body:
  `services/reservations/internal/handler/handler.go:129` and `:144` on
  `CreateReservation`, `:217` and `:229` on `ModifyReservation`.
- The overbooking guard's only ceiling is that number:
  `if booked >= input.SellableUnits`
  (`services/reservations/internal/store/store.go:221` on Create,
  `:375` on Modify; the Postgres twins read the request value at
  `services/reservations/internal/store/postgres.go:146`/`:183` and
  `:412`/`:489`). Nothing on either path reads the capacity the hotel
  actually records for the room type and the stay dates, so a caller
  that sends a large number overbooks without ever seeing `CONFLICT`,
  and a caller that sends a small number refuses availability the hotel
  still has.

What exists today, and why neither available count can be adopted
unchanged:

- **Rates `CheckSellableCount`** (`contracts/http/CheckSellableCount.json`;
  `services/rates/internal/store/store.go:333-375`): per-date counts
  derived from the rate plan's `defaultUnits`, else from the
  caller-supplied `totalUnits`, else `0`
  (`services/rates/internal/store/store.go:370-371`). Its `totalUnits`
  input is itself a request value, so adopting it would relocate the
  same bug rather than close it. Adopting it *without* `totalUnits`
  means the ceiling comes from the plan `defaultUnits`, which no desk
  surface writes — `UpsertRatePlan` is the only writer and the desk
  sends plans and nightly prices only (the sole `defaultUnits` in the
  tree outside tests/fixtures is the e2e seed,
  `app/e2e/desk-flow.ts:158`) — so a real installation would answer `0`
  for every night and refuse every booking. Making Rates own the number
  means changing Rates' own `totalUnits`/`defaultUnits` handling, which
  #631 explicitly puts out of scope.
- **Rooms `CheckRoomTypeSellability`**
  (`contracts/http/CheckRoomTypeSellability.json`;
  `services/rooms/src/store.ts:307-359`, route
  `services/rooms/src/server.ts:141`): the date-ranged room inventory of
  a type — `totalCount` (rooms of the type), `blockedRooms` (rooms with
  an overlapping block, `src/store.ts:344-350`) and the derived
  `sellableCount` (rooms with no overlapping block). This is the source
  the desk's Book panel already pre-checks
  (`app/src/views/BookView.vue:893-922`) and then forwards as
  `sellableUnits` — the value the guard currently believes.

Precedents this record builds on:

- ADR-0005 D1–D5 (`docs/architecture/decisions/adr-0005-server-side-checkout-gate.md`):
  the module that owns a fact is the only authority for it, the request
  field that restates that fact becomes advisory, the decision point
  re-reads it synchronously with the caller's token forwarded, and an
  unread fact fails the operation closed with `UPSTREAM_UNAVAILABLE`.
- The wired Reservations -> Rates client is the shape to reuse
  (`services/reservations/internal/pricing/client.go:33` five-second
  timeout, `:52-59` POST with the Bearer token forwarded, `:88-97`
  fail-closed `UPSTREAM_UNAVAILABLE`), boot wiring in
  `services/reservations/cmd/server/main.go:42-47`, compose env
  `RATES_BASE_URL` (`deploy/compose.yaml:46`).
- Product decision D-26 and conditions `AC-OVB-1`..`AC-OVB-3`
  (`docs/product/acceptance-criteria.md` section 15,
  `docs/product/desk-ui-design-rollout.md` section 6.16,
  `docs/project/decision-log.md`). D-26 leaves the source choice and the
  seam shape to this role; the conditions hold whichever source is
  chosen.
- HLD section 5 already states the intended path — Reservations
  validates against Rates (sellable count, restrictions, price basis)
  **and** checks room-type sellability against Rooms — and LLD section 1
  already lists `RoomInventoryService.CheckRoomTypeSellability` as an
  outbound booking-step call that was never built.

## Decision

### D1 — Authority: Rooms owns the units, Reservations owns the holds

Rooms is the only authority for how many units a room type can host for
a date range; Reservations is the only authority for which of those
units a reservation holds. Neither module asserts the other's fact, and
the desk browser asserts neither: it chooses the room type, the dates,
the guest, and the idempotency key. `sellableUnits` in the reservation
contract is advisory input at most and never decides the booking.

### D2 — The ceiling is the date-ranged inventory the hotel records

`Create` and `Modify` read
`POST {ROOMS_BASE_URL}/v1/rooms/CheckRoomTypeSellability` with
`{roomType: <effective room type id>, dateFrom: <effective arrival>,
dateTo: <effective departure>}`, the caller's Bearer token forwarded and
a five-second timeout, once per booking attempt (never reused between
attempts).

- **Consumed fields: `totalCount` and `blockedRooms`.** The ceiling is
  `totalCount - len(blockedRooms)`: the rooms of the type that no
  date-ranged block holds. The reply's derived `sellableCount` is not
  consumed, because #636 changes what that number subtracts (room
  state) while `totalCount` and `blockedRooms` keep their date-ranged
  meaning (the #636 conditions keep `blockedRooms` content as it is).
  Deriving from the two inventory facts keeps the ceiling a function of
  the hotel's recorded inventory rather than of a desk-facing
  derivation whose meaning moves with an unrelated change.
- **The held count stays local.** The guard keeps counting overlapping
  `confirmed` + `checked-in` rows in the Reservations store
  (`activeState`, `services/reservations/internal/store/store.go:194-196`;
  the Postgres twin's `state IN ('confirmed','checked-in')`,
  `services/reservations/internal/store/postgres.go:176-183`,
  `:482-489`). Each held unit is therefore subtracted exactly once:
  inventory by Rooms, holds by Reservations. In particular the ceiling
  must not be a "still free" number — a rooms-held-by-reservation count
  would double-subtract the same unit. `AC-OVB-1` words the same set —
  a checked-in row keeps holding its unit, cancelled, no-show, and
  closed rows release theirs — so criterion and design agree.
- **Modify reads the effective values.** The ceiling is read for the
  room type and dates the modification will apply — the request's value
  where supplied, otherwise the stored row's — the same effective values
  the restriction hook already uses
  (`services/reservations/internal/service/service.go:207-218`), and the
  reservation itself stays excluded from the count as today
  (`services/reservations/internal/store/store.go:368`).

### D3 — The request's `sellableUnits` becomes advisory

`CreateReservation` and `ModifyReservation` keep accepting
`sellableUnits` so the current desk build keeps working, but the server
ignores its value: a large number buys no unit, a small number refuses
nothing, and an absent value no longer refuses the booking. The field is
still shape-validated when present (an integer `>= 0`, otherwise
`VALIDATION_FAILED` naming the field) so a malformed body still fails
loudly, but no decision derives from it. Removing the field from the
contract is the follow-up #631 names. `AC-OVB-1` words the field the
same way — optional and advisory, a malformed value still
`VALIDATION_FAILED` — and `FR-OVB-1` requires an absent value to refuse
nothing, so the criterion, the requirement, and this record agree.

Two current code paths must go with this change or the advisory field
would still decide: the store's `input.SellableUnits < 1` validation
(`services/reservations/internal/store/store.go:202`, `:337`;
`services/reservations/internal/store/postgres.go:146`, `:412`) and the
handler's "absent means 0" default (`sellUnits`,
`services/reservations/internal/handler/handler.go:344`).

### D4 — Fail closed on an unread ceiling

If Rooms cannot be read — transport failure, timeout, 5xx, unparseable
body, or an unwired client — the booking is refused with
`UPSTREAM_UNAVAILABLE` (503) and `{upstream: "rooms", operation:
"CheckRoomTypeSellability"}`; nothing is written. A Rooms 4xx envelope is
surfaced unchanged, so a rejected session still refuses as
`UNAUTHENTICATED` and an unknown room type as `NOT_FOUND`. No cached or
previous ceiling is reused and the request's number is never a fallback.

A reply that parses but does not carry the two consumed fields as
integers is unreadable (503), never "assume unlimited". A ceiling of `0`
is a legitimate answer — the type holds no sellable unit for those dates
— and the guard refuses it as `CONFLICT` (sold out), not as a 5xx.

### D5 — The guard keeps its atomic shape

The ceiling is read outside the store (it is another module's fact),
immediately before the store call. The count-and-insert comparison stays
in the store's single critical section — the in-memory mutex
(`services/reservations/internal/store/store.go:205-221`) or the one
Postgres transaction (`services/reservations/internal/store/postgres.go:150-189`),
which is what makes two simultaneous last-unit requests yield exactly
one winner and one `CONFLICT` (`NFR-CON-1`). The capacity reaches the
store as a derived input (`CreateInput` / `ModifyInput` capacity
fields), never as the request's number; the request field is not threaded
into the store at all.

The read runs on every attempt, including an idempotent replay, matching
ADR-0005 D2's gate-before-replay order: a replay consumes no second unit
and writes nothing, but during a capacity outage it refuses with 503
instead of returning the stored record (residual risk R-OVB-4).

### D6 — Additive contract change, no schema change

| Contract | Change | Version effect |
|---|---|---|
| `contracts/http/CreateReservation.json` | `sellableUnits` required -> optional and advisory ("ignored; the server derives the ceiling from Rooms"); errors add `UPSTREAM_UNAVAILABLE` (503) | minor (1.1 -> 1.2; relaxed requirement plus a new error code, ADR-0004 D1) |
| `contracts/http/ModifyReservation.json` | same delta for the new type and dates | minor (1.0 -> 1.1) |
| `contracts/http/CheckRoomTypeSellability.json` | shape unchanged; gains a server-side consumer (integration C2 becomes live) | none |
| `contracts/errors/envelope.json` | register `UPSTREAM_UNAVAILABLE` in the enum and add `503` to `statusMapping` — Reservations already emits it (`services/reservations/internal/service/service.go:76-83`, `internal/pricing/client.go:88-96`) while the enum omits it, the same drift ADR-0005 D5 records; whichever implementation PR lands first registers it, both need it | minor |

No schema, table, migration, or event change: reservation rows, the
state set, the change history, and the outbox are untouched.

### D7 — The desk workflow is unchanged

The Book panel keeps its fresh `CheckRoomTypeSellability` pre-check and
keeps sending `sellableUnits`
(`app/src/views/BookView.vue:893-929`); the request simply stops being
trusted. A `CONFLICT` still reads as the sold-out sentence
(`desk.book.refused_soldout`, `app/src/views/BookView.vue:918`) and an
unreadable ceiling as the plain request-failed sentence
(`desk.shell.request_failed` fallback, `app/src/views/BookView.vue:477-482`).
No new catalogue key, control, or screen.

## Consequences

- Reservations gains a second outbound dependency: `ROOMS_BASE_URL`
  (default `http://rooms:8085`, compose service `rooms`,
  `deploy/compose.yaml:89-99`), wired at boot beside `RATES_BASE_URL`,
  five-second timeout, caller Bearer token forwarded. No runtime cycle:
  Rooms has no outbound dependency (`docs/architecture/services/rooms.md`
  section 5).
- Booking and modification now need Rooms reachable. An outage of Rooms
  refuses the booking fail-closed — a desk-visible loss of the booking
  function accepted by product risk R-10
  (`docs/project/risk-register.md`) and a runbook item for
  `release-manager`.
- Each attempt gains one synchronous read; the order is restriction check
  first (unchanged), then the capacity read, then the guarded store step.
  A restricted stay therefore still refuses as `STATE_ILLEGAL` before
  capacity is consulted.
- Guards (LLD section 22.6): inflated and absent `sellableUnits`,
  zero-capacity type, Modify into sold-out dates, unreadable/unwired
  Rooms (503), 4xx pass-through, two simultaneous last-unit attempts
  (exactly one winner and one `CONFLICT`), replay consumes nothing, and
  the desk Book guards stay green unchanged.
- Rollback: revert the single implementation PR. The previous guard
  behaviour returns with the request's number; the desk still sends the
  field in both directions, so no desk change and no data migration is
  needed either way.
- This ADR starts `proposed`; only the owner flips it to `accepted`.
  Implementation starts only after owner acceptance plus a T3
  `SPEC-GATE PASS` on #631.

## Out of scope

- Removing `sellableUnits` from `CreateReservation` / `ModifyReservation`
  (the follow-up #631 names).
- The price basis decision (#632: `priceBasis.totalMinor` re-derived from
  `QuotePrice`) — a separate audit item on the same path.
- Rates' own `totalUnits` / `defaultUnits` handling, and making the plan
  default a maintained inventory figure; this record only explains why
  the Rates count is not the ceiling.
- #636's room-state accounting inside the Rooms sellability reply: it
  changes the derived `sellableCount`, which this seam deliberately does
  not consume, and it keeps `blockedRooms` semantics per its own
  conditions.
- Binding the asserted `actor` to the session token (residual risk R6 in
  `docs/technical/security-threat-model.md` section 4).

## Options considered

### Option A — Keep trusting the client (status quo)

- Upside: no change, no new dependency.
- Downside: a desk-bypassing caller overbooks at will. Rejected: this is
  the finding.

### Option B — Ceiling from Rates `CheckSellableCount`

- Upside: one availability authority named by `FR-RTE-2`, and per-date
  counts that could support per-night guard semantics later.
- Downside: its `totalUnits` input is a caller value, so the bug moves
  rather than closes; without it the count falls back to the plan
  `defaultUnits` that nothing maintains, so every booking would refuse;
  making that number real is Rates' own handling, out of #631's scope.
  Per-date counts would also rewrite the guard from range-overlap to
  per-night to be useful — a larger behavioural change than the accepted
  conditions ask for. Rejected.

### Option C — Ceiling from Rooms `CheckRoomTypeSellability.sellableCount`

- Upside: one field, already the number the desk shows.
- Downside: `sellableCount` is a derived, moving number (#636 will
  subtract room state from it), so the guard's ceiling would silently
  change meaning when an unrelated issue lands; and a "currently free"
  number double-subtracts the reservations the guard already counts.
  Rejected.

### Option D — Ceiling from Rooms `totalCount - blockedRooms` (chosen)

- Upside: a date-ranged inventory fact owned by the module that owns the
  inventory, stable across #636, and the reservations the guard counts
  are subtracted exactly once. One new synchronous read on a path that
  already makes one.
- Downside: one more fail-closed dependency in the booking path
  (R-OVB-1) and a range-wide scalar rather than per-night precision
  (R-OVB-2).

### Option E — Ceiling cached in Reservations

- Upside: no per-attempt read; the booking survives a Rooms outage.
- Downside: a second source of truth for inventory that every block,
  room creation, and room removal must invalidate — exactly the stale
  copy this decision exists to remove, and the offline-first rule does
  not extend to a capacity nobody verified (ADR-0005 D4 sets the same
  line for money). Rejected.

### Option F — Ceiling from `ListRoomTypes`

- Upside: no date range, one read.
- Downside: the type's `capacity` is a per-room guest figure, not a
  date-ranged unit count, and blocks are invisible to it. Rejected.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-941
