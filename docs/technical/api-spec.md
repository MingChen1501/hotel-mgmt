# API conventions and contract outline

Status: active (proposed architecture; ADR-0001 still awaits owner
acceptance). Owned by `architect`. Conventions and the contract list
only — not a full OpenAPI document; endpoint detail follows with
implementation. Service names match the HLD boundary table
(`docs/architecture/hld.md`, section 4).

## 1. Conventions (apply to every contract)

- Modules interact only through these named contracts; no shared
  stores (HLD section 4).
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
| `ReservationService` | Quote, create, modify, cancel, mark no-show; calendar query. Emits `ReservationEvents`. |
| `StayService` | Check in, check out, move room, record early/late times; arrivals/departures queries. Emits `StayEvents`. |
| `RoomInventoryService` | Room/room-type setup, status updates, out-of-order blocks, availability query. Emits `RoomStateEvents`. |
| `PricingService` | Rate-plan setup, price quote, discount application, restriction check. Emits `RateEvents`. |
| `GuestService` | Profile CRUD, preference/notes update, repeat-guest flag, confirmation record. Emits `GuestEvents`. |
| `BillingService` | Folio open, charge posting, payment recording, tax/fee derivation, day-close, settlement check. Emits `FolioEvents`. |
| `ReportingService` | Occupancy, revenue, daily sheet, housekeeping reports (read API over the reporting read model). |
| `AdminService` | Hotel profile, users/roles, configuration values, export/backup runs. Emits `ConfigChangedEvents`. |

## 3. Open points (for later design, not decided here)

- Synchronous versus asynchronous style per contract pair.
- Event transport for the on-premise installation.
- Full OpenAPI (or equivalent) authorship per service.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
