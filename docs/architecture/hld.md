# High-level design — small-hotel PMS

Status: active (accepted direction per ADR-0001, accepted
2026-10-23; outlines, not build detail). Owned by `architect`. This
document describes subsystem boundaries and their responsibilities.
It states no schema detail (`docs/architecture/erd.md`), no state
detail (`docs/architecture/state-machine.md`), no endpoint detail
(`docs/technical/api-spec.md`); per-module runtime notes below are
planning envelopes under the accepted ADR-0001 mapping.

Source requirements: `docs/requirements/mvp-requirements.md` (43 FRs /
14 NFRs) and `docs/product/mvp-scope.md`. Nothing here adds product
behaviour; all behaviour stays owned by `product-owner` and
`business-analyst`.

## 1. Context view

Actors: front-desk staff, manager, and hotel owner (the three roles;
guests have no sign-in per `NFR-SEC-1`). The system runs as one
on-premise installation per property and keeps working without
internet (`NFR-AVL-1`). There are no external integrations in the MVP:
no OTA/channel manager, no payment provider, no accounting export
(product scope, out of scope). The only outward flows are printed or
messaged artefacts (confirmations, invoices, receipts, reports) and
on-premise data export/backup (`FR-ADM-5`).

## 2. Container view

The installation is composed of the modules in section 4, each a
separately deployable container (see
`docs/architecture/system-architecture.md` for the deployable
topology), plus one shared database engine holding one dedicated
schema per module, plus Nginx as the single entry point and
reverse proxy on the hotel premises. Modules never share a
store (never shared tables even inside the shared engine); they
interact only through the named contracts in section 4.

## 3. Component view (per module)

Each module exposes its contract (section 4), enforces its own data
ownership, records its audit entries (`NFR-AUD-1`), and reads hotel
configuration from the Admin module at startup and on change. Shared
cross-cutting rules:

- Identity/RBAC: a single identity component (inside the Admin
  module) issues sessions; every module enforces role checks per
  `FR-ADM-2` / `NFR-SEC-1`, and every record carries UTC-offset
  timestamps rendered in hotel-local time (`NFR-TZ-1`).
- Audit trail: the owning module of each change records actor and
  timestamp immutably (`NFR-AUD-1`); there is no on-screen audit log
  view in the MVP (Later product capability) — recording only.
- Reporting read model: the Reporting module keeps its own read
  model, fed by domain events from the owning modules; it never
  reads other modules' stores directly.
- Per-hotel workflow customisation boundary: configurable items
  (section 6) live as data in the owning modules, editable through
  the desk with no code changes; the lifecycle order itself is fixed
  and not configurable.

## 4. Module boundary table

Every module has exactly one owning side and one data-store
ownership statement. Contracts are named. Candidate technologies are
proposals only.

| Module | Responsibility (FRs served) | Data ownership (one store owner) | Exposed contract | Proposed runtime / footprint (envelope note, `proposed`) |
|---|---|---|---|---|
| Reservations | Direct reservations, modify/cancel, walk-in, calendar, no-show (`FR-RES-*`) | Owns the reservation store: reservations, holds, cancellation records; no other module writes it | `ReservationService` (HTTP/gRPC); emits `ReservationEvents` | Go service (~30–50 MB RAM): static binary fits 2*4*50; goroutines serve the `NFR-CON-1` paired-booking guard; dedicated schema in the shared engine |
| Stay (front desk) | Check-in, check-out, room moves, early/late times, arrivals/departures (`FR-FDK-*`) | Owns the stay store: stays, room assignments, move history; no other module writes it | `StayService` (HTTP/gRPC); emits `StayEvents` | Node.js/TypeScript service (~100–150 MB): CRUD fit; shares one runtime with Rooms/Guests/Admin; dedicated schema in the shared engine |
| Rooms | Inventory, housekeeping states, out-of-order blocks, room setup (`FR-RMS-*`) | Owns the room store: rooms, room types, status history, blocks; no other module writes it | `RoomInventoryService` (HTTP/gRPC); emits `RoomStateEvents` | Node.js/TypeScript service (~100–150 MB): shared runtime with Stay; dedicated schema in the shared engine |
| Rates & Availability | Rate plans, availability counts, discounts, stay restrictions, price basis (`FR-RTE-*`) | Owns the pricing store: rate plans, restrictions, discount definitions, quoted price bases; no other module writes it | `PricingService` (HTTP/gRPC); emits `RateEvents` | Go service (~30–50 MB): quote latency for `NFR-PERF-1`; shares the Go toolchain; dedicated schema in the shared engine |
| Guests | Profiles, preferences, repeat-guest flag, confirmations (`FR-GST-*`) | Owns the guest store: guest profiles, preferences, stay links; no other module writes it | `GuestService` (HTTP/gRPC); emits `GuestEvents` | Node.js/TypeScript service (~100–150 MB): CRUD fit; shared runtime; dedicated schema in the shared engine |
| Billing | Folios, charges, payments, taxes/fees, day-close, settlement gate (`FR-BIL-*`) | Owns the folio store: folios, folio lines, payments, tax/fee rules, day-close totals; no other module writes it | `BillingService` (HTTP/gRPC); emits `FolioEvents` | Java 21 on Spring Boot, JVM mode (~350 MB RSS `estimate`): native `BigDecimal` money arithmetic in the team's main-stack framework; footprint math in `candidate-architectures.md` section 8; Quarkus JVM-slim is the named footprint fallback; a second Spring-context service is explicitly out on 2*4*50; dedicated schema in the shared engine |
| Reporting | Occupancy, revenue, daily sheet, housekeeping reports (`FR-RPT-*`) | Owns the reporting read-model store, rebuilt from domain events; source records stay with their owning modules | `ReportingService` (HTTP read API) | Go service (~30–50 MB): event consumer + read API; no Python data stack needed at 50-room scale; own read-model schema in the shared engine |
| Admin & Config | Hotel profile, users/roles, room/rate setup, export/backup, per-hotel customisation values (`FR-ADM-*`, `FR-CUS-*`) | Owns the config store: hotel profile, users, roles, custom field/policy definitions, backup records; no other module writes it | `AdminService` (HTTP/gRPC); emits `ConfigChangedEvents` | Node.js/TypeScript service (~100–150 MB): config CRUD + identity sessions; shared runtime; dedicated schema in the shared engine |

Store note (shared engine, dedicated stores): the MVP uses one
shared database engine (accepted default PostgreSQL per ADR-0001,
accepted 2026-10-23; MySQL stays the named fallback) holding one
dedicated schema per module. Logical ownership is unchanged —
never shared tables, never cross-module reads — but a single
engine process (~256 MB) replaces eight engines to fit 2*4*50.
No new modules, no boundary changes: this section only records a
proposed runtime and footprint note per module.

## 5. Booking/availability path

A reservation request flows: desk client -> Reservations (validates
against Rates & Availability via `PricingService`: sellable count,
stay restrictions, price basis) -> checks room-type sellability
against Rooms via `RoomInventoryService` (excluding occupied, blocked,
already-reserved) -> creates the reservation and emits
`ReservationEvents`. Simultaneous bookings for the last sellable unit
resolve in the Reservations store so exactly one succeeds
(`NFR-CON-1`); simultaneous check-ins into one room resolve in the
Stay store (`NFR-CON-2`). Overbooking refusal names the conflict
(error semantics: `docs/technical/error-handling.md`).

## 6. Per-hotel workflow customisation boundary

Configurable as data (no code changes): required guest fields,
check-in/out times, cancellation reasons and wording, no-show rules,
open-balance check-out approval, charge items, taxes/fees,
restrictions, discounts (`FR-CUS-*`, requirements section 3.1).
Fixed in the MVP and not configurable: lifecycle order, one folio per
stay, one property per installation, the three roles, no event-driven
automation, cash and card only (requirements section 3.2). The Admin
module stores the configuration; owning modules enforce it and record
each change with actor and timestamp (`NFR-AUD-1`).

## 7. On-premise single-property deployment topology (summary)

One property runs one instance: Nginx, one container per module,
one shared database engine with one dedicated schema per module,
and an on-premise backup target — all fitting a single 2*4*50
host by default (per-module resource budget in
`docs/architecture/system-architecture.md` section 3), with the
small-cluster variant spreading the same components across 2–3
such hosts. Detail — containers, stores, proxy, backup target,
and the chain-ready non-MVP direction — lives in
`docs/architecture/system-architecture.md`. `NFR-DEP-1` holds: one
installation serves exactly one property.

## 8. Monorepo CI strategy and versioning

- Layout: one top-level directory per module plus shared contract
  definitions; each module carries its own build/test/run
  instructions.
- CI: one pipeline with per-module jobs for its own stack (three
  toolchains in the primary mapping: Node.js, Go, and one Spring
  Boot Java), a
  contract-check stage (consumer contracts against provider
  modules), and a packaging stage that bundles the whole system
  into the offline on-premise Ansible installer. No CI workflow files are added by
  this change (out of scope); the strategy is recorded here for the
  later pipeline issue.
- Versioning: one repository tag versions a system release for a
  property; per-module versions are recorded in the release notes
  for traceability. Contract changes are versioned and announced;
  breaking changes require a deliberate decision, never a side
  effect.

## 9. Development strategy (options, not decided)

The candidate structures, per-hotel customisation mechanisms,
walking-skeleton scope, contract-first sequencing, and trade-offs
live in `docs/architecture/candidate-architectures.md` (active). That
document decides nothing: it lays out options with a recommendation under the
accepted ADR-0001 direction. The CI/versioning approach in section 8
above describes the accepted Candidate A (polyglot) shape; the
per-stack CI jobs, packaging detail, and environment inventory it
implies are DevOps follow-up work. The stack direction is chosen
(ADR-0001 accepted 2026-10-23); only measurement validation (the
OQ-C12 spike) remains.

## 10. Owner-acceptance checklist

- [ ] The owner confirms the eight module boundaries and their single
  data-store owners in section 4.
- [ ] The owner confirms the named contracts are the only
  cross-module interaction (no shared stores).
- [ ] The owner confirms chain-scale stays a non-MVP direction.
- [ ] The owner confirms all candidate technologies remain
  `proposed` and none is treated as decided.
- [ ] The owner confirms the CI/versioning approach in section 8.
- [ ] The owner has read the candidate options in
  `docs/architecture/candidate-architectures.md`; no direction is
  chosen by this checklist — the stack choice is recorded through
  the ADR-0001 acceptance answers.

Retirement note (2026-10-23): ADR-0001 was accepted (recorded on
issue #28 and in `docs/project/decision-log.md` D-7), so this
checklist is retired as satisfied. The unchecked boxes above are kept
as history and are not re-voted here; the acceptance answers live in
`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`
(Owner acceptance).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
