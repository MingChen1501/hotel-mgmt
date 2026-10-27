# API conventions and contract outline

Status: active (accepted direction per ADR-0001, accepted
2026-10-23; outlines, not build detail). Owned by `architect`.
Conventions and the contract list only — not a full OpenAPI
document; endpoint detail follows with implementation. Service names
match the HLD boundary table (`docs/architecture/hld.md`,
section 4).

## 1. Conventions (apply to every contract)

- Modules interact only through these named contracts; no shared
  stores (HLD [section 4](../architecture/hld.md)).
- Style: HTTP/gRPC with named operations per service; domain events
  (`ReservationEvents`, `StayEvents`, `RoomStateEvents`,
  `RateEvents`, `GuestEvents`, `FolioEvents`, `ConfigChangedEvents`)
  carry the same field meanings as the request/response shapes.
- Identity: every call carries the signed-in user and role; each
  module enforces role checks (`FR-ADM-2`, `NFR-SEC-1`).
- Time: timestamps carry their UTC offset; dates follow the hotel's
  local calendar day (`NFR-TZ-1`).
- Money: amounts are integers in the hotel's minor currency unit;
  the price basis recorded at booking never changes unless staff
  explicitly recalculate it (`FR-RTE-5`).
- Localisation readiness: every user-visible string comes from a
  message catalogue; no behaviour depends on English wording
  (`NFR-I18N-1`).
- Errors follow the shared envelope in
  `docs/technical/error-handling.md`, including conflict semantics
  for overbooking.

## 2. Contract outline (per HLD module)

| Contract | Representative operations / events (to be detailed later) |
|---|---|
| `ReservationService` | Create, modify, cancel, mark no-show; calendar query; check-in reservation link. Emits `ReservationEvents`. |
| `StayService` | Check in, check out, move room, record early/late times; stay reads, arrivals/departures queries. Emits `StayEvents`. |
| `RoomInventoryService` | Room/room-type setup, status updates, out-of-order blocks, availability query. Emits `RoomStateEvents`. |
| `PricingService` | Rate-plan setup, price quote, discount application, restriction check. Emits `RateEvents`. |
| `GuestService` | Profile CRUD, preference/notes update, repeat-guest flag, confirmation record. Emits `GuestEvents`. |
| `BillingService` | Folio open, charge posting, payment recording, tax/fee derivation, day-close, settlement check. Emits `FolioEvents`. |
| `ReportingService` | Occupancy, revenue, daily sheet, housekeeping reports (read API over the reporting read model). |
| `AdminService` | Hotel profile, users/roles, configuration values, export/backup runs. Emits `ConfigChangedEvents`. |

## 3. Open points (superseded — decided or deferred elsewhere; kept as history)

Supersede note (round-3 fix, annotation pattern per
`docs/architecture/candidate-architectures.md` [section 11](../architecture/candidate-architectures.md)): the three items
below were open when this outline was written. Each is now decided or
explicitly deferred in the LLD/integration pair catalog; the original
bullets are preserved and annotated, not rewritten.

- Synchronous versus asynchronous style per contract pair —
  DECIDED: synchronous calls are HTTP/JSON POST
  `/v1/<contract>/<Operation>` behind Nginx; asynchronous domain
  events travel the per-schema outbox + dispatcher
  (`docs/architecture/lld.md` [section 0](../architecture/lld.md); `docs/technical/integration.md`
  [section 0](integration.md) rule).
- Event transport for the on-premise installation — DECIDED:
  transactional outbox table per schema plus a lightweight
  dispatcher; Kafka is excluded
  (`docs/architecture/lld.md` [section 0](../architecture/lld.md) outbox; `docs/technical/integration.md`
  [section 0](integration.md) rule).
- Full OpenAPI (or equivalent) authorship per service — PARTLY
  LANDED, remainder DEFERRED to implementation slices: the
  curated desk-loop subset (`contracts/openapi.yaml`, 14 ops,
  #240, mirrored byte-identically at `frontend/docs/openapi.yaml`
  and checked by `script/openapi-route-check.sh`) is the frozen
  input alongside the LLD operation/payload tables plus the
  `contracts/` schemas
  (`docs/architecture/lld.md` D2; `docs/technical/integration.md`
  F2). gRPC transport per pair is likewise a deferred optimisation
  (LLD D3; integration F3).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
