# Low-level design — small-hotel PMS

Status: active (Closes #97). Owned by `architect`. This document is
the build-ready decomposition of the accepted direction
(ADR-0001, accepted 2026-10-23; HLD; system architecture): per-module
responsibilities, interfaces with signatures, internal data flow,
outbox events, and error mapping, plus the monorepo codebase layout.
It adds no product behaviour: every responsibility traces to an FR/NFR
in `docs/requirements/mvp-requirements.md`, every payload field to an
entry in `docs/requirements/data-dictionary.md`, every rule to
`docs/requirements/business-rules.md` (BR-n), and every cross-module
need to `docs/requirements/integration-contract-needs.md` (BA needs,
section n below). Technical encodings decided here (transports, token
mechanics, atomicity mechanisms, delivery guarantees) are the
architect's answers to the BA open questions OQ-C1..OQ-C6; anything
the FRs leave undecided is marked deferred with a reason.

## 0. Cross-cutting decisions (apply to every module)

- Transport: synchronous calls are HTTP/JSON behind Nginx, base path
  `/v1/<contract-lowercase>/<operation>`, POST with a JSON body.
  gRPC stays a later optimisation, never a silent substitution: any
  move needs a versioned contract change (see
  `docs/technical/integration.md`).
- Identity: every call carries an opaque session token issued by
  Admin. Tokens are HMAC-signed by an Admin-held key and validated
  locally by each provider (signature + expiry); revocation is
  re-checked with Admin at least every 5 minutes and always on
  sensitive operations (user/role changes, open-balance approvals,
  day-close). Idle sessions end after 15 minutes without activity
  and identities lock after 5 consecutive wrong secrets
  (`NFR-SEC-2`; enforcement points in
  `docs/technical/security-threat-model.md`). This answers OQ-C4:
  cached-token validation with bounded revalidation, not per-call
  remote validation, so desk steps keep their 3-second bound
  (`NFR-PERF-1`).
- Errors: every refusal uses the envelope in
  `docs/technical/error-handling.md` (`code`, `message`, `details`,
  `traceId`). Session-expiry refusals use code `UNAUTHENTICATED`
  and locked-identity refusals use code `IDENTITY_LOCKED` (both
  assigned here and registered in
  `contracts/errors/envelope.json`). All other codes are the
  existing ones.
- Time: `timestamptz` everywhere (carries the UTC offset,
  `NFR-TZ-1`); hotel-local rendering is a presentation concern fed
  by the hotel timezone from config.
- Money: BIGINT minor currency units, never floating point
  (`api-spec.md` [section 1](../technical/api-spec.md); Billing uses `BigDecimal`/exact decimal in
  memory and persists minor units).
- Audit: every creation, change, state transition, charge, and
  payment persists actor + timestamp on the owning row
  (`NFR-AUD-1`, recording only); each module writes only its own
  audit columns.
- Config: each module reads its section 3.1 values at startup via
  `AdminService.GetHotelConfig` and applies `ConfigChangedEvents`
  afterwards; if Admin is unreachable a module serves from its last
  cached values (offline-first, `NFR-AVL-1`) and reconciles on
  reconnect. Delivery is at-least-once, ordered per aggregate, with
  idempotent apply keyed by event id (answers OQ-C2).
- Outbox: every state change that other modules must see is written
  atomically with the change into a per-schema `outbox` table; a
  single dispatcher process relays rows to subscribers (Reporting
  read model, config consumers). No module reads another module's
  tables, ever.
- Reporting lag (answers OQ-C1): the read model trails the owning
  stores by at most 60 seconds in normal operation; every report
  carries its data-as-of timestamp; a stalled feed degrades report
  freshness and raises a monitoring alert but never blocks booking,
  check-in, or check-out.
- Export snapshot (answers OQ-C5): each owning module contributes
  its slice as of a run cut-timestamp recorded in a manifest;
  slices may skew by the run duration. A fully quiesced,
  point-in-time copy is a documented restore-point procedure in the
  runbook, not the daily path.
- Inventory co-editing: room and room-type setup is co-editable by
  the owner (`FR-ADM-3`) and the manager (`FR-RMS-4`) through the
  same `RoomInventoryService` setup operations; there is no primary
  editor and no separate inventory store.

## 1. Reservations (Go)

Responsibilities: direct reservations, modification, cancellation,
walk-in, calendar, no-show (`FR-RES-1..6`; BR-1..BR-8). Owns the
reservation store; emits `ReservationEvents`.

Interfaces (provider: `ReservationService`):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `CreateReservation` | roomType, arrivalDate, departureDate, guestLink, priceBasis, discountName?, idempotencyKey | reservationRef, state=confirmed, quotedTotal | `CONFLICT` (type+dates), `STATE_ILLEGAL` (restriction), `VALIDATION_FAILED` (missing guest field), `NOT_FOUND` (type/rate) |
| `ModifyReservation` | reservationRef, newDates?, newRoomType?, newGuest?, idempotencyKey | reservationRef, recalculatedTotal | as above + `STATE_ILLEGAL` (already checked-in) |
| `CancelReservation` | reservationRef, reason (from hotel list) | state=cancelled | `STATE_ILLEGAL` (already checked-in), `VALIDATION_FAILED` (reason missing) |
| `MarkNoShow` | reservationRef, reason | state=no-show | `STATE_ILLEGAL` (arrival date not passed / already in house) |
| `GetReservation` | reservationRef | full reservation incl. price basis, history | `NOT_FOUND` |
| `CheckInReservation` | reservationRef, stayId, actor | reservation state=checked-in with the stay link | `NOT_FOUND`, `STATE_ILLEGAL` (not confirmed) |
| `QueryCalendar` | dateFrom, dateTo, roomType? | reservations per date/type with state | — |
| `GetDueReservation` | reservationRef (STAY -> RES) | reservation with dates, type, guestLink, priceBasis | `NOT_FOUND`, `STATE_ILLEGAL` (not due/arrivable) |

Outbound calls (consumer): `PricingService.CheckSellableCount`,
`CheckRestrictions`, `QuotePrice`; `RoomInventoryService.
CheckRoomTypeSellability`; `GuestService.IdentifyGuest`,
`GetBookingContext` — all synchronous inside the booking step
(BA needs section 1).

Internal data flow (`CreateReservation`): validate token + role ->
load hotel config values (mandatory guest fields, restrictions) ->
call Pricing (sellable count, restrictions, quote) and Rooms
(sellability) and Guests (identify) -> atomically insert the
reservation row guarded by the overbooking check (one transaction:
count overlapping confirmed and checked-in reservation rows for the
type/dates against sellable units — checked-in rows cover the
in-house share, so the guard never reads another store; insert only
if capacity remains —
answers OQ-C3 for `NFR-CON-1`) -> write `ReservationEvents.created`
to outbox in the same transaction -> return ref. `ModifyReservation`
re-runs the guard for the new dates/type and reprices from the rate
plan in force (BR-2, BR-13).

Outbox events (`ReservationEvents`): `created`, `modified`,
`cancelled`, `no-show` — each carrying ref, dates, roomType,
guestLink, priceBasis total, actor, timestamp.

Error mapping: restriction violated -> `STATE_ILLEGAL` naming the
restriction (`FR-RTE-4`); last-unit race lost -> `CONFLICT` naming
type+dates (`NFR-CON-1`); missing mandatory guest field ->
`VALIDATION_FAILED` naming the field (`FR-CUS-1`); unknown type/plan
-> `NOT_FOUND`.

## 2. Stay / front desk (Node.js/TypeScript)

Responsibilities: check-in, check-out, room moves, early/late times,
arrivals/departures (`FR-FDK-1..5`; BR-16..BR-20). Owns the stay
store; emits `StayEvents`.

Interfaces (provider: `StayService`):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `CheckIn` | reservationRef, roomNumber, actualArrivalTime?, idempotencyKey | stayId, roomNumber, state=in-house | `CONFLICT` (room taken), `STATE_ILLEGAL` (room not ready / reservation not due), `VALIDATION_FAILED` (missing check-in field) |
| `GetStay` | stayId or reservationId | stay record | `NOT_FOUND`, `VALIDATION_FAILED` (neither identifier) |
| `QueryStays` | state? | stays, each exactly once | `VALIDATION_FAILED` (unknown state) |
| `CheckOut` | stayId, idempotencyKey | stay closed, invoiceRef | `SETTLEMENT_REQUIRED` (open balance, no approval), `STATE_ILLEGAL` (not in house) |
| `MoveRoom` | stayId, newRoomNumber | stayId, move history entry | `CONFLICT` / `STATE_ILLEGAL` as in check-in |
| `RecordActualTimes` | stayId, actualArrival?, actualDeparture? | stayId, kept times | `VALIDATION_FAILED` (implausible values per hotel times) |
| `ListArrivalsDepartures` | businessDate | arrivals, in-house, departures, each exactly once | — |
| `GetStayRef` | stayId (BIL -> STAY) | stay link: guest, room, in-house state | `NOT_FOUND`, `STATE_ILLEGAL` (closed) |

Outbound calls (consumer): `ReservationService.GetDueReservation`;
`RoomInventoryService.FindReadyRoom`, `AssignRoom`, `ReleaseRoom`,
`RecordActualTimes`(room side release on move/check-out);
`GuestService.GetGuest`; `BillingService.GetFolioBalance`,
`RequestCheckoutGate` — all synchronous inside desk steps (BA
needs sections 2–3).

Internal data flow (`CheckIn`): validate token + role -> fetch due
reservation -> fetch guest (mandatory check-in fields) -> find/assign
room via `AssignRoom` (provider-side atomic guard, `NFR-CON-2`) ->
insert stay row + link reservation -> mark reservation checked-in via
own update -> emit `StayEvents.checked-in` via outbox. Check-out
additionally calls the folio gate first and refuses with
`SETTLEMENT_REQUIRED` unless settled or an authorised approval is
recorded (BR-17).

Outbox events (`StayEvents`): `checked-in`, `moved`, `actual-times-
recorded`, `checked-out` — stayId, guestLink, room links, times,
actor, timestamp.

Error mapping: room just taken -> `CONFLICT` naming the room
(`NFR-CON-2`); room not vacant/clean/inspected -> `STATE_ILLEGAL`
naming room+state (BR-16, BR-28); blocked date -> refusal naming the
block (`FR-RMS-3`); open balance without approval ->
`SETTLEMENT_REQUIRED` (`FR-BIL-7`).

## 3. Rooms (Node.js/TypeScript)

Responsibilities: inventory, housekeeping states, out-of-order blocks,
room/room-type setup (`FR-RMS-1..4`; BR-9, BR-12, BR-28, BR-29).
Owns the room store; emits `RoomStateEvents`.

Interfaces (provider: `RoomInventoryService`):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `CheckRoomTypeSellability` | roomType, dateFrom, dateTo | sellable count / boolean | — (`CONFLICT` is raised by the caller on refusal) |
| `FindReadyRoom` | roomType, date | room candidates (number, floor, bed, capacity, features) | `NOT_FOUND` (no ready room) |
| `AssignRoom` | roomNumber, stayLink, idempotencyKey | assignment receipt | `CONFLICT` (just taken), `STATE_ILLEGAL` (not ready / blocked) |
| `ReleaseRoom` | roomNumber, toState, actor | new state | `STATE_ILLEGAL` (illegal transition) |
| `UpdateRoomState` | roomNumber, newState, actor | new state + history entry | `STATE_ILLEGAL` (e.g. dirty straight to inspected) |
| `ListRoomsByState` | stateFilter | rooms in state, each exactly once | — |
| `BlockRoom` / `ReleaseBlock` | roomNumber, dateRange, reason | block record / release | `STATE_ILLEGAL` (block of an occupied room) |
| `UpsertRoom`, `UpsertRoomType` | floor, bed, capacity, features | saved record | `VALIDATION_FAILED` |

Internal data flow (`AssignRoom`): single conditional atomic write —
update the room row to occupied only if its current state is
vacant-inspected and no block covers the date (one statement,
row lock; answers OQ-C3 for `NFR-CON-2`); on zero rows affected
return `CONFLICT`/`STATE_ILLEGAL` with the current state named.
Housekeeping advances dirty -> clean -> inspected, each step a row
update + history row + outbox event, enforced by a transition check
(BR-28).

Outbox events (`RoomStateEvents`): `state-changed`, `blocked`,
`block-released`, `room-upserted` — room number, old/new state,
block range+reason, actor, timestamp.

Error mapping: illegal transition -> `STATE_ILLEGAL` (BR-28);
blocked-date use -> refusal naming the block (`FR-RMS-3`); occupied
block attempt -> `STATE_ILLEGAL` (Seq-13 precondition).

## 4. Rates & Availability (Go)

Responsibilities: rate plans, availability counts, discounts, stay
restrictions, price basis (`FR-RTE-1..5`; BR-9, BR-10, BR-13..BR-15).
Owns the pricing store; emits `RateEvents`.

Interfaces (provider: `PricingService`):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `CheckSellableCount` | roomType, dateFrom, dateTo | count per date | `NOT_FOUND` (unknown type) |
| `CheckRestrictions` | roomType, dateFrom, dateTo | pass/fail + violated restriction | `STATE_ILLEGAL` naming the restriction |
| `QuotePrice` | roomType, dates, discountName? | nightly breakdown, plan ref, total | `NOT_FOUND`, `VALIDATION_FAILED` (unknown discount) |
| `UpsertRatePlan`, `UpsertRatePrice`, `UpsertRestriction`, `UpsertDiscount` | (manager setup payloads: plans, nightly prices per type/date, restrictions, discounts) | saved record | `VALIDATION_FAILED`, `NOT_FOUND` (unknown plan/type) |

Internal data flow (`QuotePrice`): load plan prices for type+dates
-> apply named discount/special price if given (kept by name, BR-15)
-> return breakdown; the quoted basis is stored by Reservations, so
later rate changes never alter it unless explicitly recalculated
(BR-13). Availability counts exclude occupied, blocked, and
already-reserved units (BR-9) and are computed from the pricing
store's cached inventory inputs plus live calls — the authoritative
guard stays in the Reservations store transaction (section 1).

Outbox events (`RateEvents`): `rate-plan-changed`,
`restriction-changed`, `discount-changed` — availability-count inputs
per type/date for the Reporting read model.

Error mapping: restriction violated -> `STATE_ILLEGAL` (BR-10); no
sellable unit -> `CONFLICT` (raised by Reservations on the guard,
`NFR-CON-1`); unknown type/plan -> `NOT_FOUND`.

## 5. Guests (Node.js/TypeScript)

Responsibilities: profiles, preferences/notes, repeat-guest flag,
confirmation record (`FR-GST-1..4`). Owns the guest store; emits
`GuestEvents`.

Interfaces (provider: `GuestService`):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `IdentifyGuest` | search keys (name/contact/ref) | profile + stay history + returning flag + past-stay count | `NOT_FOUND` |
| `GetBookingContext` | guestLink | preferences, notes | `NOT_FOUND` |
| `GetGuest` | guestLink | profile + mandatory-field status | `NOT_FOUND` |
| `UpsertGuest` | identifying/contact details, preferences, notes | guestLink | `VALIDATION_FAILED` (missing hotel-mandatory field) |
| `ProduceConfirmation` | reservationRef (record attached from the RES-side guest block) | confirmation record (hotel, guest, dates, type, price) | `NOT_FOUND` (no stored record for the ref) |

Internal data flow: single-guest-record CRUD; stay links appended on
stay lifecycle events consumed from `StayEvents` (link-only, no
stay data duplicated beyond the link + count inputs). Returning flag
derives from completed-stay count (`FR-GST-3`). Mandatory-field
enforcement reads the hotel's `FR-CUS-1` set from cached config.

Outbox events (`GuestEvents`): `profile-created`, `profile-updated`,
`stay-linked` — stay links for history/returning counts in
Reporting.

Error mapping: unknown guest -> `NOT_FOUND`; missing mandatory
field -> `VALIDATION_FAILED` naming the field (`FR-CUS-1`).

## 6. Billing (Java 21, Spring Boot)

Responsibilities: folios, charges, payments, taxes/fees, day-close,
settlement gate (`FR-BIL-1..7`; BR-17, BR-18, BR-21..BR-26). Owns the
folio store; emits `FolioEvents`. The one Spring-context service in
the budget (accepted mapping).

Interfaces (provider: `BillingService`):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `GetFolioBalance` | stayLink | folio with every charge/payment line + running balance | `NOT_FOUND` (must not happen — one folio per stay, BR-21) |
| `RequestCheckoutGate` | — | — | NOT IMPLEMENTED (see D4 below): specified but never built; the settlement gate is enforced stay-side (`StayService.CheckOut` folio gate) fed by `GetFolioBalance` plus recorded approvals |
| `PostCharge` | stayLink, item (nightly room charge or defined charge item), amount, idempotencyKey | folio line + new balance | `VALIDATION_FAILED` naming undefined item (`FR-CUS-3`, BR-22) |
| `RecordPayment` | folioLink, method (cash|card — OQ-1 undecided, fixed until decided), amount, idempotencyKey | payment line + new balance | `VALIDATION_FAILED` (other methods, requirements section 3.2) |
| `ProduceInvoice` / `ProduceReceipt` | folioLink / paymentRef | printable record matching folio/payment exactly | `NOT_FOUND` |
| `RunDayClose` | businessDate | totals of charges + payments per method | — (no sign-off step until OQ-3 decided, BR-26) |
| `GetDayClose` | businessDate | stored day-close totals for the date | `NOT_FOUND` (no run for the date) |
| `UpsertChargeItem` | name, priceMinor | named hotel sellable for charge posting | `VALIDATION_FAILED` (blank name, negative price) |
| `UpsertTaxFeeRule` | name, percent (0–100) | named percentage rule applied to posted charges | `VALIDATION_FAILED` (blank name, out-of-range percent) |
| `RecordOpenBalanceApproval` | stayLink, approvedBy, role, reason? | folio with the recorded approval | `VALIDATION_FAILED` (missing approver/role) |

Outbound calls (consumer): `StayService.GetStayRef` (synchronous
read so every line matches its stay exactly, BA needs section 3b).

Internal data flow (`PostCharge`): validate token + role ->
`GetStayRef` (stay in house) -> resolve item against hotel charge
items (`FR-CUS-3`) and tax/fee rules (`FR-BIL-5`) -> derive tax/fee
amounts with exact decimal arithmetic -> append line, update running
balance, outbox `FolioEvents.charge-posted` — one transaction.
Folio creation is driven by `StayEvents.checked-in` (one folio per
stay, BR-21). Day-close aggregates posted lines per business date and
must agree with the folios (BR-26).

Outbox events (`FolioEvents`): `folio-opened`, `charge-posted`,
`payment-recorded`, `day-close-run` — posted charges/payments with
methods for revenue Reporting.

Error mapping: undefined charge item -> `VALIDATION_FAILED` naming
the item (assigned here per the BA suggestion); non cash/card
method -> `VALIDATION_FAILED` refusal (requirements section 3.2, OQ-1
pending); open balance without approval ->
`SETTLEMENT_REQUIRED` (`FR-BIL-7`).

## 7. Reporting (Go)

Responsibilities: occupancy, revenue, daily sheet, housekeeping
reports over its own read model (`FR-RPT-1..4`). Owns the
reporting read-model store; exposes a read API; emits no domain
events.

Interfaces (provider: `ReportingService`, synchronous read API):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `OccupancyReport` | dateFrom, dateTo | per-date occupied/available counts + as-of timestamp | — |
| `RevenueSummary` | dateFrom, dateTo | room vs extra revenue totals + as-of | — |
| `DailySheet` | businessDate | arrivals, in-house, departures, open balances + as-of | — |
| `HousekeepingReport` | — | rooms needing cleaning/inspection right now + as-of | — |
| `HousekeepingReport` | — | rooms needing cleaning/inspection (inspected + out-of-order excluded) + as-of | — |

Internal data flow: event consumer subscribes to
`ReservationEvents`, `StayEvents`, `RoomStateEvents`,
`RateEvents`, `GuestEvents`, `FolioEvents`,
`ConfigChangedEvents` (hotel identity/times/wording for headers,
`FR-ADM-1`) and upserts read-model tables idempotently by event id;
reads serve from those tables only, never from other modules'
stores (HLD [section 3](hld.md)). Report targets: 2 years of 50-room data within
5 seconds (`NFR-PERF-2`) via pre-aggregated daily tables.

Outbox: none emitted (consumer only); maintains a consumer-offset
record per subscription for resume after restart.

Error mapping: none refuse at the desk — a lagging feed degrades
freshness (as-of timestamp shows it) but never blocks desk flows
(BA needs section 7).

## 8. Admin & Config (Node.js/TypeScript)

Responsibilities: hotel profile, users/roles, room/rate setup entry,
per-hotel customisation values, export/backup assembly
(`FR-ADM-1..5`, `FR-CUS-1..3`; BR-33..BR-42). Owns the config store;
emits `ConfigChangedEvents`; houses the identity component and the
export assembler.

Interfaces (provider: `AdminService`):

| Operation | Request | Response | Errors |
|---|---|---|---|
| `GetHotelConfig` | — (startup read) | full section 3.1 settings snapshot + schema version | — |
| `UpdateHotelConfig` | changed section 3.1 values | saved values + `ConfigChangedEvents` emitted | `VALIDATION_FAILED`, `FORBIDDEN` (role) |
| `CreateUser`, `UpdateUserRole`, `UnlockIdentity` | name, sign-in identity, role | account record | `FORBIDDEN`, `VALIDATION_FAILED` |
| `SignIn`, `SignOut` | identity, secret | session token / end | `UNAUTHENTICATED` (wrong secret / expired), `IDENTITY_LOCKED` (locked) |
| `ValidateSession` / `CheckRole` | token, required role | valid + role / refuse | `UNAUTHENTICATED` / `FORBIDDEN` |
| `CollectExportSlice` (fan-out to RES, STAY, BIL, GST, ROOM, RATE) | cut-timestamp | per-module slice + manifest entry | reported failure naming missing scope |
| `RunBackup` | — | success/failure report with time (`NFR-BKP-2`) | — (failures reported, never silent) |

Internal data flow (config update): validate role ->
validate against the versioned configuration schema ->
persist + audit (actor, timestamp) -> emit `ConfigChangedEvents`
(describes section 3.1 values; section 3.2 fixed items are never emitted as
configurable). Sign-in: verify secret (rate-limited, 5-strike
lockout), issue HMAC-signed token. Export: asynchronous job —
request slices from each owning module as of the cut-timestamp,
assemble, write to the on-premise target, report plain
success/failure with time (daily cadence until OQ-5 decided).

Outbox events (`ConfigChangedEvents`): hotel identity/contact,
local settings (timezone, standard times, retention floor),
required-field choices, cancellation wording + reason lists,
no-show rule, approval rule, charge items, tax/fee rules,
restrictions, discounts.

Error mapping: out-of-role -> `FORBIDDEN` (`NFR-SEC-1`); locked
identity -> `IDENTITY_LOCKED` (`NFR-SEC-2`); expired or signed-out
session -> `UNAUTHENTICATED` (`NFR-SEC-2`); incomplete
export slice -> reported failure naming the scope (`FR-ADM-5`).

## 9. Codebase layout (monorepo)

One top-level directory per deployable module plus shared contracts;
each module directory carries its own build, test, and run
instructions so one module can be worked without learning all
stacks (ADR-0001 consequences).

```text
services/
  reservations/        Go — module 1 (cmd/server, internal/..., migrations/)
  stay/                Node.js/TS — module 2
  rooms/               Node.js/TS — module 3
  rates/               Go — module 4
  guests/              Node.js/TS — module 5
  billing/             Java 21 Spring Boot — module 6 (src/main/..., flyway migrations)
  reporting/           Go — module 7 (consumer + read API)
  admin/               Node.js/TS — module 8 (incl. identity component)
contracts/             shared contract library (source of truth):
  events/              JSON Schemas for 5 of the 7 domain event families (Guest and Folio schemas pending — code is the source for those two until they land; see `docs/architecture/event-flow.md` section 2)
  http/                per-contract operation shapes (requests/responses)
  openapi.yaml         curated desk-loop OpenAPI subset (14 ops transcribed from `http/` shapes; byte-identical mirror at `frontend/docs/openapi.yaml`, checked by `script/openapi-route-check.sh`)
  errors/              the shared error envelope + code catalogue
  config-schema/       not landed as a `contracts/` tree — the versioned per-hotel configuration schema (section 3.1) lives as-built at `deploy/config/schema.json`
  messages/            no `contracts/messages/` tree — the catalogue lives as-built as per-service catalogues (`services/*/messages*`; NFR-I18N-1, no behaviour in wording)
frontend/              remainder static dir: `/docs` Swagger UI + byte-identical `docs/openapi.yaml` mirror (served by Nginx, no SSR runtime)
app/                   Vue 3 + Vite CSR desk UI (ADR-0003, accepted 2026-10-25; legacy static pages decommissioned in #299): Vite `base '/app/'`, static `dist/` into the Nginx image, `location /app/` + `try_files` fallback to `/app/index.html`; old `.html` paths return 301 redirects to the matching `/app/` routes; scaffold design in section 11 (Refs #291)
deploy/ansible/        offline packaging playbooks (release-manager owned; referenced, not added here)
```

Per-module directory (shape per stack, same obligations):

- build entry points: `services/reservations` (`go build ./...`),
  `services/stay|rooms|guests|admin` (`npm run build/test`),
  `services/billing` (`mvn package`), `services/reporting|rates`
  (`go build ./...`); each ships a `Dockerfile` and a README with
  build/test/run commands.
- `migrations/` per module holds that module's schema chain only
  (tools per stack: golang-migrate for Go, node-pg-migrate for
  Node.js, Flyway for Billing — see `docs/technical/schema.md`).
  Accepted exception: Billing's Flyway chain lives at the Spring
  Boot default `services/billing/src/main/resources/db/migration/`
  (`V<n>__` SQL), not `services/billing/migrations/`.
- `contract-tests/` per module holds its consumer/provider checks
  against `contracts/` (see `docs/technical/integration.md`).
- Shared code discipline: cross-cutting helpers (token validation,
  outbox writer, audit columns) are copied per stack, never a
  cross-stack runtime dependency; only `contracts/` is shared, as
  versioned schemas, never as executable business logic.

## 10. Deferred items (explicit, with reason)

- D1 — Conditional RES -> BIL operation for no-show charges (BA
  OQ-C6): no such operation exists in this LLD. Reason: the FRs do
  not decide whether a no-show keeps a charge (requirements OQ-1 /
  no-show rule, section 3.1), and one folio per stay is fixed with no stay
  for a no-show. Re-open when the product decision lands.
- D2 — Full OpenAPI (or equivalent) authorship per service
  (api-spec.md [section 3](../technical/api-spec.md)): still deferred to implementation slices; the
  operation/payload tables here plus `contracts/` schemas are the
  frozen input to it. Landed since: the curated desk-loop subset
  only (`contracts/openapi.yaml`, 14 ops, #240) — not full
  per-service authorship.
- D3 — gRPC adoption per pair: deferred optimisation; HTTP/JSON is
  the MVP transport and any move follows the versioning rules in
  `docs/technical/integration.md`.
- D4 — Billing `RequestCheckoutGate`: specified in section 6 above but
  never implemented (no code, no contract manifest as of master).
  Settlement is enforced stay-side instead: Stay `CheckOut` runs
  the folio gate against Billing `GetFolioBalance` plus the
  recorded `RecordOpenBalanceApproval` approval. Re-open only
  with a product decision that needs a provider-side gate op.

Coverage: 8/8 modules with responsibilities, signatures, data flow,
outbox events, and error mapping; every BA contract need (sections 1–7, section 9
error index) is encoded above or deferred here with reason.

## 11. Desk UI shell (`/app/`) — scaffold design (Refs #291)

Scaffold slice of ADR-0003 (accepted 2026-10-25): the placeholder
shell only. No app routes, no catalogue layer, no backend change.
Subsystem boundary is in `docs/architecture/hld.md` [section 11](hld.md); this
section is the build-ready decomposition the implementation PR
must follow, including the per-flow diagrams (happy path +
failure/rollback path) the T3 gate requires.

Intended tree (files the implementation PR must create; edge
traces below cite these intended paths):

```text
app/                     new Vite + Vue 3 + Router (history) + Pinia + TS shell
  package.json           deps: vue, vue-router, pinia; scripts: build, test
  vite.config.ts         `base: '/app/'` so all assets resolve under /app/
  src/main.ts            app bootstrap: pinia install, router mount
  src/router.ts          history router; exactly one placeholder route in this slice
  src/api/client.ts      shared Bearer fetch wrapper (connectivity state, single 401 path)
  src/stores/session.ts  Pinia session store (sessionStorage token, sign-in/out)
  src/views/Placeholder.vue  the one placeholder route view
```

Nginx contract (parallel run; legacy `/` pages untouched):

```text
location /app/ {
  try_files $uri $uri/ /app/index.html;
}
```

Fallback is `/app/index.html`, NOT `/index.html`
(owner-mandated correction). `/docs` Swagger mirror intact.

Shared-client contract (`src/api/client.ts` + `src/stores/session.ts`):

- Every API call carries `Authorization: Bearer <token>` from the
  session store; token persistence is `sessionStorage`
  (threat-model delta in
  `docs/technical/security-threat-model.md` [section 4](../technical/security-threat-model.md)).
- Any `401` / `UNAUTHENTICATED` response clears the store token
  and routes to sign-in — the single 401 path, replacing the
  former per-page copy-pasted blocks of the decommissioned
  static pages (#299).
- Connectivity state is owned by the client: `online`/`offline`
  events plus failed-fetch detection drive an offline banner with
  safe manual retry. Explicitly NO write queueing: desk actions
  are synchronous authoritative ops (charge, payment, check-in)
  and queueing risks double-charge; disconnect means clearly
  blocked, as with the former static pages.

CI contract: one new job (Node 22 + `npm ci` + build + test,
matching the existing Node matrix) builds `app/`; the
`openapi-route-check.sh` byte-identical mirror
(`contracts/openapi.yaml` vs `frontend/docs/openapi.yaml`) stays
green.

### 11.1 Placeholder-render flowchart

Staff browser loads any `/app/*` path (history-mode deep link or
reload included):

```mermaid
flowchart TD
    A[GET /app/* path] --> B[Nginx location /app/]
    B --> C{Static file matches $uri?}
    C -->|yes| D[Serve dist asset]
    C -->|no| E[try_files fallback /app/index.html]
    E --> F[Vite bundle boots: main.ts]
    F --> G[Router resolves placeholder route]
    G --> H[Placeholder view renders]
```

Edge trace (every edge cites the intended file the
implementation PR must create):

- A–B: `deploy/nginx/nginx.conf` gains the `location /app/`
  block; legacy `location /` is untouched.
- C–D: hashed Vite assets under `/app/assets/` served directly
  (`app/dist/` packaged into the Nginx image; `vite.config.ts`
  `base: '/app/'`).
- C–E: non-asset paths fall through to `/app/index.html`
  (`try_files $uri $uri/ /app/index.html;` — NOT `/index.html`).
- F–G: `src/main.ts` installs Pinia and mounts the router;
  `src/router.ts` holds exactly one route (placeholder only).
- G–H: `src/views/Placeholder.vue` renders using the session
  store (`src/stores/session.ts`).

Failure/rollback:

```mermaid
flowchart TD
    P[dist/ missing or stale in image] --> Q[Placeholder 404 or old bundle]
    Q --> R[Rollback: redeploy previous Nginx image]
    S[Bundle 404 on asset] --> T[Rebuild app/ and repack image]
    U[Router unknown path] --> V[Fallback serves index.html; router shows placeholder]
```

Edge trace:

- P–R: rollback is proxy-only (remove the redirect / redeploy
  the previous Nginx image); the static pages were already
  removed in #299, so no data migration either way.
- S–T: asset miss means the image packed a stale `dist/`;
  rebuild, never hand-edit.
- U–V: history-mode unknown paths still boot the placeholder in
  this slice (no app routes exist yet); real 404 semantics arrive
  with the first screen slice.

### 11.2 Shared-client 401-to-sign-out flowchart

Authenticated call from the placeholder through the shared client:

```mermaid
flowchart TD
    A[Placeholder calls api client] --> B[Attach Bearer token from session store]
    B --> C[Fetch /v1/* behind Nginx]
    C --> D{Response?}
    D -->|2xx| E[Return data to view]
    D -->|401 / UNAUTHENTICATED| F[Clear store token]
    F --> G[Route to sign-in]
    D -->|network failure| H[Raise offline banner; block action]
```

Edge trace:

- A–B: `src/api/client.ts` reads the token from
  `src/stores/session.ts` (never from page-local state).
- D–E: happy path returns parsed data; the placeholder needs no
  payload shape in this slice.
- D–F–G: single 401 path — clear + sign-in redirect, replacing
  the five per-page handlers of the decommissioned static pages
  (#299); a revoked or
  expired token takes the same path (revocation re-checked per
  LLD section 0).
- D–H: fetch rejection (LAN disconnect) is NOT treated as
  sign-out; it drives the section 11.3 banner and manual retry instead.

Failure/rollback: no compensation — clearing the store token is
a single local step; refusals precede any mutation, and the
server-side session rules (15-minute idle sign-out, 5-minute
revalidation bound, LLD section 0) are unchanged.

### 11.3 Offline banner / manual-retry flowchart

LAN disconnect during a desk session on `/app/`:

```mermaid
flowchart TD
    A[online/offline event or fetch rejects] --> B[Client sets connectivity down]
    B --> C[Offline banner shows; action blocked with reason]
    C --> D{Link back?}
    D -->|offline event| E[Banner clears; manual retry offered]
    D -->|still down| F[Banner stays; actions stay blocked]
    E --> G[Staff retries action manually]
    G --> H{Retry result?}
    H -->|2xx| I[Banner clears; data shown]
    H -->|fails| C
```

Edge trace:

- A–B: `src/api/client.ts` owns connectivity state
  (`online`/`offline` listeners + failed-fetch detection).
- B–C: banner + blocked action with reason; the desk never
  silently drops an op.
- E–G: retry is always staff-initiated (safe manual retry) —
  explicitly no automatic write queueing and no background
  replay, because desk writes are synchronous authoritative ops
  (ADR-0003 criterion 9: queueing risks double-charge).
- H–C: a retry that still fails returns to the blocked banner;
  reconnect alone clears nothing until the staff retries.

Failure/rollback: none compensating — blocked actions mutate
nothing, so there is nothing to roll back; the previous Nginx
image (without `/app/`) predates the desk UI entirely.

## 12. Desk UI styling design (Refs #338)

Presentation-only slice of the approved Phase 1 UI contract (the
`product-owner` contract comment on #338; proposed tier T2 —
reader-visible UI change, no behaviour change). Subsystem boundary
is in `docs/architecture/hld.md` [section 12](hld.md); requirements delta is in
`docs/requirements/mvp-requirements.md` [section 8](../requirements/mvp-requirements.md) (`FR-DSP-*`,
`NFR-DSP-*`, landed via #344). This section is the build-ready
decomposition the Phase 2 implementation PR must follow, including
the per-flow diagrams (happy path + failure/rollback path) the T2
gate requires. No backend, API, contract, schema, or error-code
change is specified anywhere in this section (see section 12.4).

Intended tree deltas (files the Phase 2 implementation PR must
touch or create; edge traces below cite the existing files):

```text
app/
  package.json           add PrimeVue (+ preset theme) as a dependency; no other new runtime dep
  src/main.ts            install PrimeVue + stock preset theme fed by the section 12.1 tokens (extends :10-20)
  src/App.vue            styled shell: top nav (six destinations + user + sign-out, active highlight),
                         centred content column, shell-owned sign-in gate; offline banner stays as-is (:1-28)
  src/router.ts          unchanged routes (the six paths + placeholder fallback stay exactly as at :24-60)
  src/theme/tokens.ts    NEW: contract section 1 tokens as preset-theme inputs (no custom design system)
  src/views/*.vue        per-screen restyle onto the section 12.2 component mapping; data-testid hooks kept;
                         per-screen sign-in copies removed (moved to the shell gate); print <style> blocks kept
```

### 12.1 Theme inputs (contract section 1 tokens, PrimeVue preset only)

The stock preset theme is fed exactly these values; nothing else
is a styling input. Money and dates render exactly as today
(hotel locale settings govern; presentation never changes values).

- Colours: surface `#FFFFFF`; page `#F4F2ED`; ink `#1F2933`;
  muted `#6B7280`; primary desk blue `#1D4ED8` (actions, active
  nav); success `#15803D`; warning `#B45309`; danger `#B91C1C`;
  borders `#E5E7EB`. One accent only (desk blue); state colours
  are used solely for status, never for branding.
- Type: system font stack; base 16px; headings 20/24/30px;
  tabular numerals for money and balances.
- Spacing/radius: 4px base unit (8/12/16/24px steps); card
  radius 8px; focus ring 2px desk blue on every interactive
  element (keyboard-visible, `NFR-DSP-2`).

### 12.2 PrimeVue component mapping (per pattern, no ad-hoc markup)

| Pattern (contract section 3) | PrimeVue component | Applied to (existing SFCs) |
|---|---|---|
| Forms (book, charge, pay, admin setup) | `InputText`, `Dropdown`/`Select`, `Calendar`/`DatePicker`, `Password` for secrets, `Button` for submits | Book form hooks `book-guest-name` (`BookView.vue:24-32`) through `book-confirm` (`:88-96`); guest lookup via `book-find-guest` / `book-register-guest` (`:38-45`); per-screen sign-in forms (removed to the shell gate, section 12.4) |
| Lists (reservations, stays, folios, rooms, guests) | `DataTable` with `Column`, paginator on long lists | Arrivals table `desk-arrivals-table` (`DeskView.vue:57-59` and siblings per screen) |
| Confirmations and destructive actions (cancel, check-out, day-close) | `Dialog` with explicit confirm/cancel buttons | Existing confirm buttons (e.g. `book-confirm` at `BookView.vue:88-96`) keep their hooks and call order |
| Feedback (success, validation, refusal, error) | `Message`/`Toast` for page-level notes, inline field errors under the field | Existing alert hooks (`book-quote-error`, `book-confirm-error`, `desk-dashboard-error`) keep their hooks; sign-in errors render only in the shell gate (`shell-signin-*` in `App.vue:67-109`); wording becomes plain sentences per `FR-DSP-3` |
| Print (receipt/invoice/confirmation) | existing print CSS preserved; screen shows a print preview card with one Print button | `.print-document` markup (`PrintView.vue:105,219,300`) under `@media print` (`PrintView.vue:1239` within the `:1233-1257` style block, `BookView.vue:1018` within `:1008-1029`) |

### 12.3 Shell navigation flowchart

Signed-in staff move between the six screens through the new top
nav (the nav itself is the only addition; routes are unchanged):

```mermaid
flowchart TD
    A[Staff loads any /app/* path] --> B[Shell boots: main.ts]
    B --> C[Router resolves existing route]
    C --> D[Top nav renders six destinations + user + Sign out]
    D --> E[Active route highlighted: bold + desk-blue underline]
    E --> F[Content column renders the screen SFC]
    F --> G[Staff selects another destination]
    G --> C
```

Edge trace (every edge cites code):

- A–B: Nginx `location /app/` fallback serves `/app/index.html`
  (LLD section 11 edge C–E); `src/main.ts:10-20` installs Pinia, the
  router, PrimeVue + preset theme (new), and the `$t` catalogue.
- B–C: `src/router.ts:24-60` — the six paths resolve to their
  existing SFCs; unknown paths fall through to the placeholder
  (`:56-58`); no route is added, removed, or renamed.
- C–D: `src/App.vue` gains the nav (extends the `:1-28` shell
  that today holds the offline banner, the shell gate, and
  `RouterView` at `:189`); each item links its existing path in
  contract section 2 order (Desk · Book · Stay · Folio · Print · Admin).
- D–E: active highlight is bold label + desk-blue underline
  (`#1D4ED8`, section 12.1) driven by the router's current route —
  the stand-in always knows the current screen (`FR-DSP-1`).
- F–G: screen SFCs render inside the centred column (max
  1100px, one plain-words page heading each); existing
  `data-testid` hooks (`*-view`, `offline-banner`) are kept so
  characterization tests survive.

Failure/rollback:

```mermaid
flowchart TD
    P[Unknown path] --> Q[Placeholder renders; nav still shows]
    R[Theme fails to load] --> S[Unstyled but navigable shell; rebuild, never hand-edit]
    T[Markup changed] --> U[Characterization tests updated where markup changed; none deleted without replacement]
```

Edge trace:

- P–Q: router fallback (`src/router.ts:56-58`, LLD section 11.1 edge
  U–V); real 404 semantics stay a later screen concern.
- R–S: preset-theme failure is a build/packaging defect —
  rebuild `app/` and repack the image, same as LLD section 11.1 S–T.
- T–U: `FR-DSP-1` handoff (`router.test.ts:16`, per-view render
  suites) extended with nav + active-highlight assertions.

### 12.4 Sign-in gate flowchart

The shell owns the one sign-in form; per-screen sign-in copies
are removed (behaviour — token mechanics, lockout, idle
sign-out — is unchanged, LLD section 0):

```mermaid
flowchart TD
    A[Signed-out visitor on any /app/* path] --> B[Shell renders sign-in form only]
    B --> C[Visitor submits identity + secret]
    C --> D{SignIn result?}
    D -->|ok| E[Token to sessionStorage; route to requested screen]
    D -->|wrong secret| F[Plain sentence: sign-in did not work, try again]
    D -->|locked| G[Plain locked sentence naming unlock by owner/manager]
    F --> B
    G --> B
    H[Signed-in staff selects Sign out] --> I[Token cleared; shell back to sign-in form]
    J[Any API call answers 401 / UNAUTHENTICATED] --> I
```

Edge trace:

- A–B: the gate (`App.vue:32` shell-gate, sign-in form at
  `:67-109`) replaces the six per-screen copies, which were
  deleted with the legacy pages in #299 — no per-screen sign-in
  form remains in any view; the per-view sign-in tests moved to
  the gate without deleting coverage (`DeskView.test.ts:143-164`
  dashboard frame with no per-screen sign-in copy).
- C–E: `AdminService.SignIn` contract unchanged
  (`docs/technical/integration.md` [section 6](../technical/integration.md) C10); token persists in
  `sessionStorage` (`src/stores/session.ts:20-60`, key at
  `:20`, survives reload, dies with the tab).
- D–F–G: wrong-secret and locked-identity refusals keep their
  codes (`UNAUTHENTICATED`, `IDENTITY_LOCKED` per LLD section 0);
  only the wording becomes one plain sentence (`FR-DSP-3`).
- H–I: sign-out clears the store token as today
  (`session.test.ts:43` handoff; `NFR-SEC-2` holds).
- J–I: the single 401 path (`src/api/client.ts:89-110` handler
  plus the `:168-183` 401 branch, LLD section 11.2) is untouched —
  clear + route to sign-in; fetch rejection still drives the
  offline banner (section 11.3), never sign-out.

Failure/rollback: no compensation — clearing the store token is
a single local step; refusals precede any mutation; the
server-side session rules (15-minute idle sign-out, 5-minute
revalidation bound, LLD section 0) are unchanged. Rollback is reverting
the Phase 2 PR (per-screen copies return with it).

### 12.5 Representative form flow (book quote-then-confirm)

The book screen is the representative form pattern; charge, pay,
and admin-setup forms follow the same state machine with their
own hooks. Behaviour and call order are unchanged — only
presentation (PrimeVue inputs, plain-words states) changes: the
#421 restyle groups the same hooks into the two-column design
cards (guest card above quote card on the left,
dates/room/discount card on the right) with no hook, field, or
call-order change. The #423 restyle groups the charge/pay hooks
into the folio two-card layout (charges card with the lines
table plus the post-charge form on the left, payments card with
the balance due plus the post-payment form on the right), again
with no hook, field, or call-order change.

```mermaid
flowchart TD
    A[Staff fills guest + dates + type + plan] --> B[QuotePrice: nightly breakdown + total shown]
    B --> C[Staff confirms]
    C --> D{CreateReservation result?}
    D -->|ok| E[Reference + readback + confirmation record shown]
    D -->|CONFLICT / STATE_ILLEGAL / VALIDATION_FAILED| F[One plain sentence naming the cause]
    F --> A
    G[Loading] --> H[Affected region shows Loading; repeat-write buttons disabled]
    H --> D
```

Edge trace:

- A: form hooks `book-guest-name` (`BookView.vue:24-32`)
  through `book-discount-name` (`:196-206`); guest lookup via
  `book-find-guest` / `book-register-guest` (`:38-45`);
  mandatory-field refusals name the field (`FR-CUS-1`,
  wording only per `FR-DSP-3`).
- B: quote hooks `book-quote` (`:207-213`), breakdown
  `book-quote-nights` (`:79`), total `book-quote-total`
  (`:87`); `PricingService.QuotePrice` contract unchanged
  (integration [section 1](../technical/integration.md) C1); later rate changes still never alter the
  quoted basis (BR-13).
- C–D: confirm `book-confirm` (`:88-96`); `ReservationService.
  CreateReservation` contract unchanged (integration section 1);
  last-unit race still refuses the loser with `CONFLICT`
  (`NFR-CON-1` — condition unchanged, sentence plain).
- D–E: result hooks `book-result` (`:228-230`),
  `book-booking-reference` (`:233`), `book-booking-readback`
  (`:234`); confirmation record `book-confirmation` (`:255-273`)
  per `FR-GST-4`.
- D–F: every refusal keeps its code (`CONFLICT`,
  `STATE_ILLEGAL`, `VALIDATION_FAILED`,
  `SETTLEMENT_REQUIRED` on check-out) per
  `docs/technical/error-handling.md` [sections 1–2](../technical/error-handling.md); only the
  on-screen wording becomes one plain sentence naming the
  cause and the next step (`FR-DSP-3`).
- G–H: loading names the affected region while the rest stays
  visible; write buttons disable until the call returns
  (no double-charge from repeat taps).

Failure/rollback: refusals precede mutation (nothing to
compensate); a LAN disconnect mid-form drives the section 11.3 banner
+ manual retry (no queued writes). Rollback is reverting the
Phase 2 PR; characterization tests are updated where markup
changed, none deleted without replacement.

### 12.6 Technical no-change note (behaviour, APIs, contracts)

Nothing in section 12 changes behaviour, and the Phase 2
implementation PR must not change any of the following; each
item names its guard so drift is reviewable:

- Routes: the six `/app/` paths and the `/app/print/...`
  namespace stay exactly as routed (`src/router.ts:24-60`,
  placeholder catch-all at :56-58);
  Nginx `location /app/` fallback stays `/app/index.html`
  (LLD section 11); legacy redirects and `/docs` Swagger mirror stay
  intact (`FR-SHL-4`, `script/openapi-route-check.sh` green).
- APIs and contracts: every desk call keeps its operation,
  payload, and envelope (`docs/technical/api-spec.md` [sections 1–2](../technical/api-spec.md),
  `docs/technical/integration.md` [sections 1–6](../technical/integration.md) C1–C11,
  `contracts/openapi.yaml` + `frontend/docs/openapi.yaml`
  byte-identical mirror — 14 ops, unchanged).
- Error semantics: all codes and refusal conditions stand
  (`docs/technical/error-handling.md` [sections 1–2](../technical/error-handling.md), LLD sections 1–8 error
  mappings); only on-screen wording becomes plain sentences.
  Session rules (LLD section 0: HMAC token, 5-minute revalidation,
  15-minute idle sign-out, 5-strike lockout) are untouched.
- Catalogue: every new plain-words sentence ships in
  `messages/en.json` (beside the Vietnamese `messages/vi.json`
  for the pilot desk, Refs #356, resolved with English fallback
  through `app/src/i18n/`) and stays covered by
  `script/catalogue-coverage-check.sh` (`NFR-I18N-1` holds).
- Admin gating: the admin console hides every management section
  from front-desk callers (`canManage` in `AdminView.vue:348`,
  restricted notice at :8-12) as a cosmetic layer over the
  unchanged server-side `FORBIDDEN` refusals (Refs #355).
- Print: receipt, invoice, and confirmation output match folio
  lines and balance exactly (`FR-BIL-4` holds); print
  isolation CSS preserved (`PrintView.vue:1233-1257`,
  `BookView.vue:973-986` source-pinned by
  `PrintView.test.ts:724-739` and `BookView.test.ts:1064-1069`);
  screen styling must not leak into print.
- Tests: `data-testid` hooks kept; characterization suites
  extended where markup changed; no test deleted without
  replacement (`FR-DSP-1..4` handoffs in
  `mvp-requirements.md` [section 8.4](../requirements/mvp-requirements.md) cite the on-disk guards).

Out of scope (contract section 6, restated as build constraints): no
new screens or flows; no Figma mockups; no marketing-grade
visuals — the bar is MVP-usable, not pixel-perfect.

## 13. Desk UI design-rollout flows (Refs #419)

Build-ready decomposition for the owner-supplied six-screen
Claude desk UI rollout (tier T2; subsystem-boundary position in
`docs/architecture/hld.md` [section 13](hld.md)). The T2 UI
contract lives with `product-owner` (PR #426), the
`FR-DSK-*`/`NFR-DSK-*` delta with `business-analyst`
(`docs/requirements/mvp-requirements.md` [section 10](../requirements/mvp-requirements.md),
PR #427), and guard mapping with `qa-lead` (D1–D9, PR #428).
This section supplies SPEC-GATE FAIL finding 3 on PR #426: one
per-flow diagram (happy path + failure/rollback path) for each
touched flow, with edge traces citing code. All four flows keep
existing operations, payloads, envelopes, and refusal
conditions; only presentation and the narrowly-scoped
screen behaviours in `FR-DSK-2`, `FR-DSK-4`, `FR-DSK-6`, and
`FR-DSK-7` change (see section 13.5).

Intended tree deltas (files the screen implementation PRs must
create or extend; edge traces below cite them as `NEW` where
they do not exist yet on master):

```text
app/
  src/router.ts            extend: add /rooms (Rooms map, #424) and /onboarding (wizard, #425);
                           the 8-route set pinned at router.test.ts:17 grows by exactly one
                           more for the wizard, no rename/removal
  src/App.vue              extend: NAV_ITEMS to canvas-manifest-relative order
                           (Desk, Stay, Rooms, Book, Folio; #425 inserts Onboarding
                           ahead of Rooms to complete the tab order); brand span shows the
                           configured hotel name; locale switcher unchanged
  src/views/DeskView.vue   extend: two housekeeping action buttons on the need-cleaning card (#420)
  src/views/RoomsView.vue   NEW: read-only floor-grouped map with summary chips (#424)
  src/views/OnboardingView.vue NEW: wizard shell with progress + back/continue, step 1 hotel-name form (#425)
  messages/en.json + messages/vi.json  extend: desk.rooms.*, desk.onboarding.*,
                           stay.checkin.* hint, desk.empty.* keys in both locales, placeholders intact
```

### 13.1 Stay explicit empty placeholder blocking check-in (#422)

The room select opens on an explicit empty option with the
pick-a-ready-room hint; check-in stays blocked until a ready
room of the booked type is chosen. This resolves the StayView
check-in room preselection mismatch (#411) by making
unselected explicit instead of preselecting a possibly wrong
room. Behaviour and call order are otherwise unchanged
(`StayService.CheckIn` provider-side guards stand). The #422
restyle groups the same hooks into the design cards (lists,
check-in, move, times, check-out) with no hook, field, or
call-order change.

```mermaid
flowchart TD
    A[Staff opens Stay check-in for an arrival] --> B[Load ready-room candidates for booked type]
    B --> C{How many candidates?}
    C -->|exactly one| D[Bind it directly; placeholder not shown]
    C -->|zero or many| E[Select opens on empty option with pick-a-ready-room hint]
    E --> F[Check-in blocked with plain-words next step]
    D --> G[Staff confirms check-in]
    F --> H{Staff picks a ready room?}
    H -->|no| F
    H -->|yes| G
    G --> I[AssignRoom then CheckInReservation]
    I --> J{Result?}
    J -->|ok| K[Stay in-house; room bound]
    J -->|CONFLICT / STATE_ILLEGAL| L[One plain sentence naming room and state; staff picks again]
    L --> B
```

Edge trace (every edge cites code):

- A–B: arrival pick loads candidates for the booked type
  (`StayView.vue` candidate load; booked-type status via
  `bookedTypeStatus`).
- B–D: single-candidate auto-select binds directly and clears
  the hint (`StayView.vue:1204-1206`, Refs #411 comment at
  :1200-1203).
- B–E–F: zero-or-many opens on the empty option
  (`StayView.vue:177-178` empty `<option value="">` with the
  `desk.stay.choose_room` key) with `need_room` set
  (`StayView.vue:1208-1209`); the blocked check re-tests the
  bound id (`StayView.vue:1223-1226`) and refuses with the
  plain-words next step.
- G–I: `AssignRoom` (`StayView.vue:1234`,
  `RoomInventoryService.AssignRoom`, LLD section 3 atomic
  guard, `NFR-CON-2`) then `CheckInReservation` in legacy op
  order with one idempotency key per contract op.
- J–K: happy path emits `StayEvents.checked-in` (LLD
  section 2); the folio opens stay-side per BR-21.
- J–L–B: room just taken -> `CONFLICT` naming the room;
  room not ready/blocked -> `STATE_ILLEGAL` naming room+state
  (LLD section 2 error mapping); only wording is new
  (`FR-DSP-3`).
- Checkout gating (unchanged, shown for completeness):
  `GetFolioBalance` (`StayView.vue:1503,1627`) with
  `RecordOpenBalanceApproval` (`:1590`); open balance without
  approval still refuses `SETTLEMENT_REQUIRED` (`:1669`,
  `FR-BIL-7` holds).

Failure/rollback:

```mermaid
flowchart TD
    P[AssignRoom loses the race] --> Q[CONFLICT names the room; no stay row written]
    Q --> R[Staff reloads candidates and picks again]
    S[LAN disconnect mid-check-in] --> T[Offline banner + manual retry; no queued writes]
    U[401 / UNAUTHENTICATED] --> V[Single 401 path: clear token, route to sign-in]
```

Edge trace:

- P–R: refusals precede mutation — nothing to compensate;
  the provider-side atomic guard (LLD section 3) means the
  loser never holds the room.
- S–T: fetch rejection drives the section 11.3 banner and
  safe manual retry, never sign-out.
- U–V: shared-client 401 path (LLD section 11.2) unchanged.
- Rollback: revert the #422 screen PR; the placeholder,
  hint, and guard revert with it (no contract or schema
  change anywhere in this flow).

### 13.2 Main board housekeeping buttons with count refresh (#420)

Two action buttons on the need-cleaning card drive the
existing dirty-to-clean-to-inspected transitions; the board
counts refresh to match. No transition logic changes — the
buttons are callers of the existing state machine only
(`FR-RMS-2`, `NFR-AUD-1` hold).

```mermaid
flowchart TD
    A[Staff opens the Main board] --> B[Load arrivals + in-house + departures + room states + DailySheet]
    B --> C[Five cards render: arrivals, in-house, departures-or-empty, need-cleaning, out-of-service]
    C --> D[Staff presses clean on a dirty room, or inspect on a clean room]
    D --> E[UpdateRoomState with room, target state, actor]
    E --> F{Transition legal?}
    F -->|yes| G[State advances with history row + actor + timestamp; outbox RoomStateEvents]
    G --> H[Board reloads; counts match the rendered lanes]
    F -->|STATE_ILLEGAL| I[One plain sentence naming room and state; board unchanged]
    I --> C
```

Edge trace (every edge cites code):

- A–B: arrivals/in-house/departures via
  `ListArrivalsDepartures` (`DeskView.vue:744-747`), room
  lanes via `ListRoomsByState` (`DeskView.vue:758-759`),
  checkout dates via `QueryCalendar` (`:660-669`), block notes
  via `CheckRoomTypeSellability` (`:688-713`), cross-check via
  `DailySheet` (`:800-812`).
- B–C: the five design cards render at `DeskView.vue:51`
  (arrivals with room-type labels), `:76` (in-house with
  checkout dates), `:101` (departures), `:126`
  (need-cleaning), `:184` (out-of-service); departures renders
  its explicit empty state when there are no checkouts today;
  out-of-service shows reason plus date (`:184-203`); the
  five-lane board stays below at `:208`.
- D–E: the two buttons on the need-cleaning card call the LLD
  section 3 `UpdateRoomState` operation (`DeskView.vue:149`
  clean, `:170` inspect; call at `:588` with roomNumber,
  newState, actor) — clean maps dirty-to-clean, inspect maps
  clean-to-inspected; one idempotency key per contract op.
- E–G: provider-side transition check (BR-28) plus history
  row and outbox event in one transaction (LLD section 3).
- G–H: `refreshDashboard` (`DeskView.vue:734`,
  manual trigger `desk-refresh` at :24-28 via `onRefresh` at
  :874-877) reloads the same queries, so summary counts
  match the rendered lanes by construction.
- F–I: illegal transition (e.g. dirty straight to
  inspected) refuses `STATE_ILLEGAL` naming room+state;
  wording only is new.

Failure/rollback:

```mermaid
flowchart TD
    P[Second staffer advances the same room first] --> Q[STATE_ILLEGAL or CONFLICT names current state; board unchanged]
    Q --> R[Staff refreshes; board shows the current state]
    S[LAN disconnect during the transition] --> T[Offline banner + manual retry; staff re-presses after reconnect]
    U[401 / UNAUTHENTICATED] --> V[Single 401 path: clear token, route to sign-in]
```

Edge trace:

- P–R: the provider-side guard is the arbiter; the loser
  reloads — no client-side lock is invented.
- S–T: blocked action mutates nothing; retry is
  staff-initiated (no write queueing, LLD section 11.3).
- Rollback: revert the #420 screen PR; the buttons revert
  with it (no contract, transition, or schema change
  anywhere in this flow).

### 13.3 Rooms map counts-match-cards invariant (#424)

New read-only screen: a floor-grouped visual map whose
summary chips always equal the rendered room cards. Read-only
over existing room state — per-card actions are not specified
here and none are invented (open #424 owner call).

```mermaid
flowchart TD
    A[Staff opens the Rooms map] --> B[Fetch room state via ListRoomsByState]
    B --> C[Group the same payload by floor]
    C --> D[Render summary chips: ready, occupied, needs-cleaning, awaiting-inspection, out-of-service]
    D --> E[Render per-room cards: status chip, room type, live note]
    E --> F{Invariant check}
    F -->|counts equal cards| G[Map shown; refresh offered]
    F -->|mismatch| H[Plain-words error; staff retries manually]
    G --> I[Staff refreshes after housekeeping work]
    I --> B
```

Edge trace (every edge cites code):

- A–B: NEW `RoomsView.vue` reads the existing
  `RoomInventoryService.ListRoomsByState` operation (LLD
  section 3; same read the Main board uses at
  `DeskView.vue:758-759`); no new endpoint, no new store.
- B–D: chips derive from the one fetched payload — the
  invariant holds by construction, never by reconciling two
  sources. New catalogue keys `desk.rooms.*` (chips, card
  notes) land in both locales via the normal catalogue
  process (`NFR-DSK-1`).
- E: each card shows the one chip vocabulary shared with
  the Main board, the room type, and the live note
  (occupant + checkout date, out-of-service reason + date,
  or upcoming arrival) — `FR-DSK-6`.
- A: NEW `/rooms` route in `src/router.ts` (the 8-route set
  pinned at `router.test.ts:17`, plus one more for the wizard in
  section 13.4); unknown
  paths still fall through to the placeholder (LLD
  section 11.1 edge U–V).
- F–H: a fetch failure renders one plain sentence
  (`FR-DSP-3`) with manual retry; refusal conditions are
  untouched because the map performs no writes.

Failure/rollback:

```mermaid
flowchart TD
    P[Room state changes mid-render] --> Q[Next refresh shows current state; chips recomputed from the new payload]
    S[LAN disconnect on the map] --> T[Offline banner; map keeps last good render marked stale until retry]
    U[401 / UNAUTHENTICATED] --> V[Single 401 path: clear token, route to sign-in]
```

Edge trace:

- P–Q: staleness resolves by re-fetch, never by client
  patching; the Reporting read-model lag bound (LLD
  section 0, 60 s) does not apply here — the map reads the
  owning store directly.
- Rollback: revert the #424 screen PR; the route, view,
  and keys revert with it (additive only — existing screens
  are untouched).

### 13.4 Onboarding wizard gating with hotel-name persistence (#425)

New first-run surface: the wizard launches on an empty
database only, walks staff through setup with progress and
back/continue navigation, and persists step 1 (hotel name)
through the existing Admin config surface so the name
appears in the shell header and on printed documents. Steps
2–4 need the `product-owner` spec (and owner decision where
the design is silent) before building beyond step 1 — step 1
does not ship on assumed later-step content.

```mermaid
flowchart TD
    A[App boots on any /app/* path] --> B[Read hotel config: GetHotelConfig]
    B --> C{Configured hotel identity present?}
    C -->|yes| D[Normal shell; wizard never launches]
    C -->|no| E[Wizard launches at step 1 with 25 percent progress]
    E --> F[Staff enters the hotel name + example placeholder + invoice helper]
    F --> G[Staff continues]
    G --> H[Persist via UpdateHotelConfig; FR-ADM-1]
    H --> I[Header brand + printed documents show the configured name]
    I --> J[Steps 2 to 4 per the agreed product-owner spec, with back/continue]
    J --> K[Setup completes; wizard never shows again on a seeded database]
```

Edge trace (every edge cites code):

- A–B: boot check reuses the existing `GetHotelConfig`
  read (`AdminView.vue:380` call site; `AdminService.
  GetHotelConfig` contract unchanged, LLD section 8). No
  new endpoint decides emptiness; the exact
  empty-predicate (unconfigured hotel identity) is set by
  the #425 screen PR per the `product-owner` spec.
- B–D: seeded databases take the existing shell path
  unchanged (router `src/router.ts:24-60`, shell gate LLD
  section 12.4).
- E–H: NEW `OnboardingView.vue` wizard shell (progress
  indicator, back/continue navigation); step 1 matches the
  design (hotel-name input, example placeholder, helper
  noting the name appears on invoices and receipts, 25
  percent progress, continue action). Persistence goes
  through `UpdateHotelConfig` with actor + timestamp
  (`NFR-AUD-1`); new catalogue keys `desk.onboarding.*` in
  both locales (`NFR-DSK-1`).
- H–I: the shell brand span (`App.vue` `shell-brand`)
  reads the configured name; print output carries it via
  the preserved print isolation (section 13.5). The design
  example content is never hardcoded.
- E: NEW `/onboarding` route in `src/router.ts`
  (section 13.3 router note applies); deep-linking the
  wizard on a seeded database redirects to the shell.
- J: steps 2–4 content, validation, and completion
  semantics ride the future `product-owner` spec recorded
  on #425 — this diagram specifies the gate and step 1
  only.

Failure/rollback:

```mermaid
flowchart TD
    P[Name fails validation] --> Q[VALIDATION_FAILED names the field; wizard stays on step 1]
    R[Front-desk role attempts setup] --> S[FORBIDDEN; setup stays owner/manager only]
    T[LAN disconnect during persist] --> U[Offline banner + manual retry; nothing half-written]
    V[401 / UNAUTHENTICATED] --> W[Single 401 path: clear token, route to sign-in]
```

Edge trace:

- P–Q: config-schema validation (LLD section 8) precedes
  persistence — nothing to compensate.
- R–S: server-side role enforcement is unchanged
  (`FORBIDDEN` per LLD section 8; the cosmetic admin
  gating note in HLD section 12 stands).
- Rollback: revert the #425 screen PR; the wizard is
  additive — seeded desks never saw it, and the config
  surface is unchanged.

### 13.5 Technical no-change note (behaviour, APIs, contracts)

Nothing in section 13 changes behaviour below the screen
surface, and no screen implementation PR may change any of
the following; each item names its guard so drift is
reviewable. The requirements side of the same statements
lives with `business-analyst`
(`docs/requirements/mvp-requirements.md` [section 10.1](../requirements/mvp-requirements.md),
PR #427); the guard side lives with `qa-lead` (PR #428,
D1–D9):

- Routes: the six existing `/app/` paths stay exactly as
  routed (`src/router.ts:24-60`, placeholder catch-all);
  sections 13.3–13.4 add exactly two routes (`/rooms`,
  `/onboarding`) — no rename, no removal. Nginx
  `location /app/` fallback stays `/app/index.html` (LLD
  section 11); legacy redirects and `/docs` Swagger mirror
  stay intact.
- APIs and contracts: every desk call keeps its operation,
  payload, and envelope
  (`docs/technical/api-spec.md`,
  `docs/technical/integration.md` C1–C11,
  `contracts/openapi.yaml` + `frontend/docs/openapi.yaml`
  byte-identical mirror — 14 ops, unchanged). The map adds
  no operation; the wizard adds no operation.
- Data model and schema: no entity or field is added
  (`docs/technical/schema.md`,
  `docs/requirements/data-dictionary.md` unchanged); the map
  visualises room state, the wizard persists through
  `FR-ADM-1` config.
- Error semantics: all codes and refusal conditions stand
  (`docs/technical/error-handling.md`, LLD sections 1–8
  error mappings); checkout still requires a settled folio
  or a recorded approval (`FR-BIL-7`, `SETTLEMENT_REQUIRED`
  at `StayView.vue:1669`). Session rules (LLD section 0:
  HMAC token, 5-minute revalidation, 15-minute idle
  sign-out, 5-strike lockout) are untouched.
- Catalogue: every new string ships in `messages/en.json`
  beside `messages/vi.json` (both on disk; `desk.stay.
  need_room` precedent at `en.json:450`) and stays covered
  by `script/catalogue-coverage-check.sh`
  (`NFR-I18N-1`, `NFR-DSK-1` hold); the hotel name shown is
  the configured value, never the design example content.
- Print: receipt, invoice, and confirmation output match
  folio lines and balance exactly (`FR-BIL-4` holds);
  print isolation CSS preserved
  (`PrintView.vue:1233-1257`, `BookView.vue:973-986`);
  screen styling must not leak into print (`NFR-DSK-2`).
- Tests: `data-testid` hooks kept; the D1–D9 guards (PR
  #428) are created by the screen PRs named there
  (#420–#425); characterization suites are extended where
  markup changed, none deleted without replacement.

Out of scope (restated as build constraints): print, admin,
and gate/sign-in screens (not in this design batch);
catalogue restructuring; backend or API changes beyond what
the screens need (filed as follow-ups if discovered).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-137
