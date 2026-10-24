# Integration contracts — module-pair catalog

Status: active (Closes #97). Owned by `architect`. The full,
build-binding contract catalog for every module pair: operations,
payloads, final sync/async choice with transport, error codes, and
the rules for versioning plus the contract-check approach in CI.
Every entry consumes a requirements-side need from
`docs/requirements/integration-contract-needs.md` (BA §n below);
needs the FRs leave undecided are encoded as fixed-until-decided
parameters or explicitly deferred with reason (§9). Signatures live
in `docs/architecture/lld.md` (per-module view); table shapes in
`docs/technical/schema.md`; this document is the pair-wise binding
view. No new behaviour beyond the mapped FRs.

Final transport rule (all sync pairs): HTTP/JSON POST behind Nginx,
`/v1/<contract>/<Operation>`, opaque session token in the
`Authorization` header, shared error envelope. Async events travel
the transactional outbox + dispatcher (LLD §0); event payloads are
the JSON Schemas in `contracts/events/`.

## 1. Desk-booking path (BA §1)

### C1. RES -> RATE (`PricingService`) — SYNC

| Operation | Payload (dictionary refs) | Errors |
|---|---|---|
| `CheckSellableCount` | roomType, arrivalDate, departureDate (Room type; FR-RTE-2) | `NOT_FOUND` (type) |
| `CheckRestrictions` | roomType, dateRange (Room type; FR-RTE-4) | `STATE_ILLEGAL` naming restriction |
| `QuotePrice` | roomType, dates, discountName? (Price basis; FR-RTE-5/1/3) | `NOT_FOUND`, `VALIDATION_FAILED` (unknown discount) |
| `UpsertRatePrice` | ratePlanName, roomTypeId, nightDate, priceMinor (Nightly price; FR-RTE-1) | `NOT_FOUND` (unknown plan), `VALIDATION_FAILED` (negative price) |

Immediacy reason: refusal-with-cause inside the booking step
(Seq-2; NFR-PERF-1 3 s). Per-hotel values enforced here:
restrictions (FR-RTE-4), discounts (FR-RTE-3), cancellation wording
shown at booking (FR-CUS-2). Paired-booking guard resolves in the
Reservations store transaction (LLD §1; `NFR-CON-1`).

### C2. RES -> ROOM (`RoomInventoryService`) — SYNC

| Operation | Payload | Errors |
|---|---|---|
| `CheckRoomTypeSellability` | roomType, dateRange (Room; FR-RTE-2, FR-RMS-3; BR-9) | refusal naming block (FR-RMS-3; BR-12) |

Same-step refusal branch (Seq-2/3/6); exactly-one-winner guard
(BR-8).

### C3. RES -> GST (`GuestService`) — SYNC

| Operation | Payload | Errors |
|---|---|---|
| `IdentifyGuest` | identity/search keys (Guest; FR-GST-1/3) | `NOT_FOUND` |
| `GetBookingContext` | guestLink (Guest; FR-GST-2) | `NOT_FOUND` |

Preferences/notes shown before confirmation (FR-GST-2); returning
flag at booking time (FR-GST-3). Mandatory-field set
(`FR-CUS-1`) enforced by RES from cached config.

## 2. Check-in / stay path (BA §2)

### C4. STAY -> RES (`ReservationService`) — SYNC

`GetDueReservation`: reservationRef -> dates, roomType, guestLink,
priceBasis (FR-RES-1, FR-RTE-5, FR-FDK-5). Errors: `NOT_FOUND` /
`STATE_ILLEGAL` (not due, already checked-in/cancelled; BR-1).

### C5. STAY -> ROOM (`RoomInventoryService`) — SYNC, atomic at provider

`FindReadyRoom` (roomType -> vacant-inspected candidates with
floor/bed/capacity/features; FR-FDK-1, FR-RMS-2/4); `AssignRoom`
(roomNumber, stayLink, idempotencyKey -> receipt; exactly one of
two simultaneous check-ins succeeds, `NFR-CON-2`, conditional
atomic write in LLD §3); `ReleaseRoom` (roomNumber, toState, actor;
FR-FDK-2/3); `RecordActualTimes` passthrough for the room side of
moves. Errors: `CONFLICT` naming room; `STATE_ILLEGAL` naming
room+state; block refusal naming block.

### C6. STAY -> GST (`GuestService`) — SYNC

`GetGuest`: guestLink -> profile + mandatory-field status
(FR-GST-1, FR-CUS-1). Missing check-in field ->
`VALIDATION_FAILED` naming field (UC-6 ext. 3a).

## 3. Check-out and folio path (BA §3)

### C7. STAY -> BIL (`BillingService`) — SYNC

`GetFolioBalance` (stayLink -> folio lines + balance; FR-BIL-1).
`RequestCheckoutGate` (stayLink -> settled / approved / refused)
is NOT IMPLEMENTED (specified but never built — see F4 below):
the settlement gate is enforced stay-side by `StayService.CheckOut`
against `GetFolioBalance` plus the recorded approval. Open balance
without approval -> `SETTLEMENT_REQUIRED`. Approval rule (whether
needed, which role) is hotel config (§3.1).

### C8. BIL -> STAY (`StayService`) — SYNC read

`GetStayRef` (stayRef -> guest, room, in-house state; FR-BIL-2/3/4).
Errors: `STATE_ILLEGAL` (not in house / closed; BR-1/18). Every
folio line and receipt matches its stay exactly (FR-BIL-4; BR-24).

## 4. Charge, payment, day-close (BA §4; provider: Billing, SYNC)

`PostCharge` (stayLink, item, amount -> line + balance, tax/fee
derived from hotel rules; FR-BIL-2/5, FR-CUS-3); `RecordPayment`
(folioLink, method cash|card, amount; FR-BIL-3; BR-23);
`ProduceInvoice` / `ProduceReceipt` (FR-BIL-4; exact match,
BR-24); `RunDayClose` (businessDate -> charges + per-method
payment totals agreeing with folios; FR-BIL-6; BR-26);
`GetDayClose` (businessDate -> stored day-close totals; FR-BIL-6);
`UpsertChargeItem` (name, price -> named hotel sellable; FR-CUS-3);
`UpsertTaxFeeRule` (name, percent 0–100 -> percentage rule for
charge posting; FR-BIL-5); `RecordOpenBalanceApproval`
(stayLink, approver, role -> approval recorded on the folio;
FR-BIL-7; BR-17). Undefined item -> `VALIDATION_FAILED` naming
item (assigned here). Fixed-until-decided: method enum cash/card
only (OQ-1); day-close totals without sign-off (OQ-3).

## 5. Housekeeping loop (BA §5; provider: Rooms, SYNC)

`UpdateRoomState` (dirty -> clean -> inspected, actor+time;
FR-RMS-2; NFR-AUD-1); `ListRoomsByState` (FR-RMS-1, FR-RPT-4);
`BlockRoom` / `ReleaseBlock` (room, range, reason; FR-RMS-3;
NFR-AUD-1). Illegal transition -> `STATE_ILLEGAL` (BR-28);
occupied-room block -> `STATE_ILLEGAL`; blocked-date use -> refusal
naming block (BR-12). The dirty-clean-inspected order is fixed,
never configurable (Seq-14).

## 6. Configuration and identity (BA §6)

### C9. ADM -> consumers (config) — SYNC at startup + ASYNC events

`GetHotelConfig`: full §3.1 snapshot + schema version at module
startup (FR-ADM-1/4, FR-CUS-1/2/3, FR-BIL-5/7, FR-RTE-3/4,
NFR-RET-1). `ConfigChangedEvents`: async, at-least-once, ordered
per aggregate, idempotent apply by event id (requirements §3.3;
OQ-C2 answered). Offline-first: serve cached values when Admin is
unreachable (NFR-AVL-1). Fixed §3.2 items never travel as config.

### C10. Identity (`AdminService`, all modules) — SYNC enforcement per call

`ValidateSession` / `CheckRole` with local signed-token validation
+ bounded revalidation (LLD §0; OQ-C4 answered). Out-of-role ->
`FORBIDDEN` (NFR-SEC-1); locked/signed-out session ->
`UNAUTHENTICATED` (NFR-SEC-2; code assigned here).

### C11. Export/backup fan-out (ADM -> RES, STAY, BIL, GST, ROOM, RATE) — ASYNC job + visible report

`CollectExportSlice` per module as of a cut-timestamp; manifest
records per-module times (OQ-C5 answered: bounded-skew snapshot).
`RunBackup` reports plain success/failure with time (NFR-BKP-2).
Incomplete slice -> reported failure naming scope (FR-ADM-5).

## 7. Reporting feeds (BA §7; all owners -> RPT) — ASYNC events + SYNC read API

`ReservationEvents`, `StayEvents`, `RoomStateEvents`,
`RateEvents`, `GuestEvents`, `FolioEvents`,
`ConfigChangedEvents` into RPT's own read model (never
cross-reads, HLD §3); RPT exposes the four synchronous report
reads (FR-RPT-1..4). Bounded lag 60 s normal operation, as-of
timestamp on every report (OQ-C1 answered); staleness never blocks
the desk.

## 8. Versioning rules

- Contracts in `contracts/` carry `major.minor` versions, sent as
  `Contract-Version` on sync calls and `eventVersion` in event
  payloads. Additive changes (new optional fields, new operations,
  new event types) bump minor and must be backward compatible.
- Removals, renames, type changes, and new required fields are
  major: deliberate, announced in release notes, with a
  deprecation window of at least one system release during which
  the provider serves both shapes. Never a side effect.
- One repository tag versions the whole system for a property;
  per-module versions are recorded in release notes (ADR-0001).
- Per-hotel config schema (`contracts/config-schema/`) versions
  independently; a module rejects a snapshot whose major it does
  not understand with `VALIDATION_FAILED` naming the version, and
  keeps serving cached values.

## 9. Contract-check approach (CI, per pair)

- Consumer contract tests: each consumer module ships
  `contract-tests/` fixtures (request/response pairs plus refusal
  cases) generated from `contracts/`; the provider module verifies
  them in its CI job before packaging (covers every operation in
  §§1–7, including the `CONFLICT`/`SETTLEMENT_REQUIRED` refusal
  branches and the paired-concurrency guards against the real
  stores, `NFR-CON-1/2`).
- Event schema checks: every emitted event validates against
  `contracts/events/` JSON Schemas; consumers test idempotent
  apply (duplicate delivery) and ordering per aggregate.
- Compatibility gate (planned, not implemented as of master): a CI
  job will fail the pipeline on any breaking `contracts/` change
  that lacks a major bump + deprecation note; breaking changes
  never merge silently. Today `script/contract-check.sh`
  enforces JSON parse + manifest-match only; the major-bump
  check is still to build.
- Config-matrix checks (L5) re-run the desk flows against at
  least two distinct per-hotel config sets per release candidate,
  covering every §3.1 item in at least one setup.

## 10. Deferred needs (explicit, with reason)

- F1 — Conditional RES -> BIL operation for no-show charges (BA
  OQ-C6): no such contract exists. Reason: undecided product rule
  (requirements OQ-1 / §3.1 no-show rule) plus the fixed
  one-folio-per-stay with no stay for a no-show. Re-open on the
  product decision; the catalog extends additively when it lands.
- F2 — Full OpenAPI authorship per service: deferred to
  implementation slices; this catalog plus `contracts/` is the
  frozen input. Landed since: the curated desk-loop subset only
  (`contracts/openapi.yaml`, 14 ops, #240) — not full per-service
  authorship.
- F3 — gRPC transport per pair: deferred optimisation; HTTP/JSON
  is the MVP binding (§0 rule).
- F4 — Billing `RequestCheckoutGate` (C7): specified but never
  implemented (no code, no contract manifest as of master).
  Settlement is enforced stay-side (`StayService.CheckOut` folio
  gate + `GetFolioBalance` + recorded approvals). Re-open only
  with a product decision that needs a provider-side gate op.

Coverage: every BA need (§§1–7, error index §9) is encoded above
or deferred here with reason; the five product open questions
(OQ-1..OQ-5) are recorded as fixed-until-decided parameters in
§§4–6 and change only through requirements wording, never through
implementation drift.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-137
