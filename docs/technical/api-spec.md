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
  local calendar day (`NFR-TZ-1`). A contract that accepts a date range
  also declares its maximum span, because the span is a cross-field bound
  a request schema cannot express: Reporting's two range reports accept
  at most **730 nights** between `dateFrom` and `dateTo` (731 inclusive
  dates) and refuse a wider window with `VALIDATION_FAILED` naming
  `dateTo`, before the store lock — the same bound Rates applies to a
  stay range (`services/rates/internal/store/store.go:254-256`), a store
  constant rather than configuration (LLD
  [section 31](../architecture/lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641);
  Refs #641). The two request manifests publish no `maximum`: the bound
  relates two fields, so no keyword in them states it and no validator on
  the request path would read one.
- Money: amounts are integers in the hotel's minor currency unit; the
  price basis recorded at booking never changes unless staff
  explicitly recalculate it (`FR-RTE-5`). Wherever a service accepts a
  money amount it is a whole number of minor units at or below one
  declared ceiling — 1 000 000 000 000 — refused naming the field
  otherwise, with the ceiling a code constant rather than configuration
  (Billing enforces it today in its adapter — LLD
  [section 30](../architecture/lld.md#30-money-amount-bounds-on-the-billing-folio-write-adapter-refs-635);
  Refs #635). The three request schemas publish the integer type and a
  `minimum` and deliberately declare no `maximum`: no validator runs on
  the request path, so a schema bound would be a promise the service
  does not read.
- Guest identity and payloads: a guest read by name (`fullName`) is
  either unambiguous or refused — a name that matches two or more guests
  answers `VALIDATION_FAILED` naming `fullName` with the searched name
  and the exact match count and returns no profile, while every
  `guestId` read is unchanged; a name that matches exactly one guest is
  served as before. A guest write accepts `contact` and `preferences` as
  plain objects of at most 16 fields, keys of 1-64 UTF-16 code units, and
  values of text at most 256 code units, a finite number, or a boolean,
  and `notes` as text of at most 2 000 code units, refused naming the
  field otherwise, with all four bounds code constants rather than
  configuration (LLD
  [section 32](../architecture/lld.md#32-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640);
  Refs #640). The `UpsertGuest` manifest publishes no `maxProperties`,
  `propertyNames`, or `maxLength` for those fields, for the same reason
  the money ceiling publishes no `maximum`: no validator reads it.
  Confirmation dates are hotel-local calendar days that must exist on the
  calendar, not only match the `YYYY-MM-DD` shape.
- Admin request ordering and config shapes: a `POST /v1/admin/<Operation>`
  other than `SignIn` checks the session before it reads the body, so an
  unauthenticated request with a malformed or oversized body answers
  `UNAUTHENTICATED` (401) with the existing `error.auth.*` sentence and
  never a parse refusal, while a resolved session keeps today's 400 and
  the front-desk 403 follows a well-formed body (the order is 401, then
  400, then 403; `SignIn` keeps today's order). `UpdateHotelConfig`
  checks one per-key shape table before its first write — `name`,
  `timezone`, the two standard `HH:MM` times, `requiredGuestFields`,
  `cancellationReasons`, `retentionFloorDays`, and the optional profile
  text — and refuses the whole write with `VALIDATION_FAILED` (400),
  `details` naming the offending key, and one plain sentence, writing
  nothing and recording no `config.updated` entry; a key outside the
  table is written as sent. No new token and no schema keyword: both
  statuses already exist and no validator reads a request schema on the
  Admin path (LLD
  [section 33](../architecture/lld.md#33-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639);
  Refs #639).
- Audit actor provenance: a write records the authenticated session as
  its actor, never the request's `actor`/`updatedBy` string — Admin
  records the resolved `signinIdentity`, and Stay, Guests, Rooms,
  Reservations, and Billing record the presented session token (the text
  after `Bearer `, trimmed) until the identity-hardening slice resolves
  it. The request field keeps its type, required flag, and existing
  refusals and is demoted to an annotation: where the write emits a JSON
  outbox payload, a disagreeing value is preserved additively as
  `requestActor`; column-only rows drop it and keep their shape. A
  disagreement is never refused, no new token appears, and no request
  schema publishes a bound (LLD
  [section 34](../architecture/lld.md#34-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643);
  Refs #643).
- Localisation readiness: every user-visible string comes from a
  message catalogue; no behaviour depends on English wording
  (`NFR-I18N-1`).
- Errors follow the shared envelope in
  `docs/technical/error-handling.md`, including conflict semantics
  for overbooking.
- Provider-derived gate inputs: where a contract gates a money or state
  decision, the caller's claim about the fact is advisory. The module
  that owns the fact is re-read at the decision point, and an unreadable
  provider fails the operation closed with `UPSTREAM_UNAVAILABLE`
  (`docs/architecture/lld.md` section 21; Refs #601; the folio write path
  is one, LLD section 27, Refs #634). The booking
  price basis follows the same rule from #632 on: `priceBasis` in
  `CreateReservation`/`ModifyReservation` is compared with the Rates
  quote and never stored, a disagreement is refused with
  `PRICE_CHANGED` (409) naming both totals rather than swapped
  silently, and a definitive Rates refusal is surfaced unchanged
  (`docs/architecture/lld.md` section 25).

## 2. Contract outline (per HLD module)

| Contract | Representative operations / events (to be detailed later) |
|---|---|
| `ReservationService` | Create, modify, cancel, mark no-show; calendar query; check-in reservation link; check-out completion (Refs #646). Emits `ReservationEvents`. |
| `StayService` | Check in, check out, move room, record early/late times; stay reads, arrivals/departures queries. Emits `StayEvents`. |
| `RoomInventoryService` | Room/room-type setup, status updates, out-of-order blocks, availability query. Room/room-type setup refuses a present `capacity` that is not a whole number of at least 1 — no ceiling is added — with `VALIDATION_FAILED` naming `capacity`, nothing written and no `room-upserted` event, while an omitted value keeps today's create-none/update-keeps meaning and the store chosen at boot is not observable (Refs #637). Emits `RoomStateEvents`. |
| `PricingService` | Rate-plan setup, price quote, discount application, restriction check. Emits `RateEvents`. |
| `GuestService` | Profile CRUD, preference/notes update, repeat-guest flag, confirmation record. Emits `GuestEvents`. A name lookup that matches more than one guest is refused rather than resolved by first match, and guest payloads carry declared shape and length bounds (Refs #640). |
| `BillingService` | Folio open, charge posting, payment recording, tax/fee derivation, day-close, settlement check; stay verification before every folio write (Refs #634); money amounts whole and bounded by one ceiling, refused in the adapter (Refs #635). Emits `FolioEvents`. |
| `ReportingService` | Occupancy, revenue, daily sheet, housekeeping reports (read API over the reporting read model); the two range reports cap a window at 730 nights and refuse a wider one before any read (Refs #641). |
| `AdminService` | Hotel profile, users/roles, configuration values, export/backup runs. A session-guarded operation authenticates before it parses the body, and a config value outside its key's declared shape is refused naming the key before anything is written (Refs #639). Emits `ConfigChangedEvents`. |

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
Role: architect · AO session hotel-mgmt-1046

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1117

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1130

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1141

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1164
