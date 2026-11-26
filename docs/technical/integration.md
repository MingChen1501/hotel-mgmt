# Integration contracts — module-pair catalog

Status: active (Closes #97). Owned by `architect`. The full,
build-binding contract catalog for every module pair: operations,
payloads, final sync/async choice with transport, error codes, and
the rules for versioning plus the contract-check approach in CI.
Every entry consumes a requirements-side need from
`docs/requirements/integration-contract-needs.md` (BA section n below);
needs the FRs leave undecided are encoded as fixed-until-decided
parameters or explicitly deferred with reason (section 9). Signatures live
in `docs/architecture/lld.md` (per-module view); table shapes in
`docs/technical/schema.md`; this document is the pair-wise binding
view. No new behaviour beyond the mapped FRs.

Final transport rule (all sync pairs): HTTP/JSON POST behind Nginx,
`/v1/<contract>/<Operation>`, opaque session token in the
`Authorization` header, shared error envelope. Async events travel
the transactional outbox + dispatcher (LLD [section 0](../architecture/lld.md)); event payloads are
the JSON Schemas in `contracts/events/`. Every recorded audit actor is
the authenticated session of the call that writes — the resolved
`signinIdentity` in Admin and the presented session token elsewhere —
never the request's `actor`/`updatedBy`; a disagreeing request value is
an annotation only and may appear as the additive `requestActor` key in
a JSON outbox payload (LLD
[section 34](../architecture/lld.md#34-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643);
Refs #643).

## 1. Desk-booking path (BA section 1)

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
Reservations store transaction (LLD [section 1](../architecture/lld.md); `NFR-CON-1`).
The availability count is a desk-facing overview per date; since #631
the guard's ceiling comes from the Rooms read in C2 instead (its
`totalUnits` input is itself a request value), and the booking refuses
fail-closed with `UPSTREAM_UNAVAILABLE` when that read fails (LLD
[section 26](../architecture/lld.md); ADR-0006).

### C2. RES -> ROOM (`RoomInventoryService`) — SYNC

| Operation | Payload | Errors |
|---|---|---|
| `CheckRoomTypeSellability` | roomType, dateRange (Room; FR-RTE-2, FR-RMS-3; BR-9) | `NOT_FOUND` (unknown type), `VALIDATION_FAILED` (missing field, reversed range), refusal naming block (FR-RMS-3; BR-12) |

Same-step refusal branch (Seq-2/3/6); exactly-one-winner guard
(BR-8). Live from #631 as the booking guard's capacity read: the ceiling
is `totalCount - blockedRooms` for the effective type and dates, read per
attempt with the caller's token forwarded; an unreadable reply refuses
the booking `UPSTREAM_UNAVAILABLE` (LLD [section 26](../architecture/lld.md)).

### C3. RES -> GST (`GuestService`) — SYNC

| Operation | Payload | Errors |
|---|---|---|
| `IdentifyGuest` | identity/search keys (Guest; FR-GST-1/3) | `NOT_FOUND` |
| `GetBookingContext` | guestLink (Guest; FR-GST-2) | `NOT_FOUND` |

Preferences/notes shown before confirmation (FR-GST-2); returning
flag at booking time (FR-GST-3). Mandatory-field set
(`FR-CUS-1`) enforced by RES from cached config.

## 2. Check-in / stay path (BA section 2)

### C4. STAY -> RES (`ReservationService`) — SYNC

`GetDueReservation`: reservationRef -> dates, roomType, guestLink,
priceBasis (FR-RES-1, FR-RTE-5, FR-FDK-5). Errors: `NOT_FOUND` /
`STATE_ILLEGAL` (not due, already checked-in/cancelled; BR-1).

`CheckOutReservation` (from #646 on): stayId -> the booking resolved by
the stay link it carries, flipped `checked-in -> closed` (FR-DEP-1;
LLD [section 22](../architecture/lld.md#22-departure-completes-the-booking-and-releases-availability-refs-646)).
Stay calls it synchronously after its own close commits, forwards the
caller's Bearer token, and times out at 2 seconds. Both sides record
their own authenticated session as the actor, so the close and the
completion carry the same session string; the body `actor` is an
annotation only (LLD
[section 34](../architecture/lld.md#34-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643);
Refs #643). Errors: `NOT_FOUND`
(no booking carries the stay link), `STATE_ILLEGAL` (the booking behind
the stay is not checked in), `VALIDATION_FAILED`. A completion the call
cannot record is reported by the close (`bookingCompletion`), never
turned into a failed close: the stay close is not rolled back by a
downstream refusal.

### C5. STAY -> ROOM (`RoomInventoryService`) — SYNC, atomic at provider

`FindReadyRoom` (roomType -> vacant-inspected candidates with
floor/bed/capacity/features; FR-FDK-1, FR-RMS-2/4); `AssignRoom`
(roomNumber, stayLink, idempotencyKey -> receipt; exactly one of
two simultaneous check-ins succeeds, `NFR-CON-2`, conditional
atomic write in LLD [section 3](../architecture/lld.md)); `ReleaseRoom` (roomNumber, toState, actor;
FR-FDK-2/3); `RecordActualTimes` passthrough for the room side of
moves. Errors: `CONFLICT` naming room; `STATE_ILLEGAL` naming
room+state; block refusal naming block.

### C6. STAY -> GST (`GuestService`) — SYNC

`GetGuest`: guestLink -> profile + mandatory-field status
(FR-GST-1, FR-CUS-1). Missing check-in field ->
`VALIDATION_FAILED` naming field (UC-6 ext. 3a).

## 3. Check-out and folio path (BA section 3)

### C7. STAY -> BIL (`BillingService`) — SYNC

`GetFolioBalance` (stayLink -> folio id + folio lines + balance +
recorded approval; FR-BIL-1). From #601 on it is also consumed by
`StayService.CheckOut` itself as the gate read, not only by the desk:
Stay re-derives `balanceMinor` and `openBalanceApproval` from this
response and ignores the request's `folioBalanceMinor` /
`openBalanceApproval` (advisory only; ADR-0005, LLD
[section 21](../architecture/lld.md#21-server-side-check-out-gate-and-approval-provenance-refs-601)).
The call forwards the caller's Bearer token, times out at 5 seconds,
and fails closed with `UPSTREAM_UNAVAILABLE` (503) when Billing cannot
be read; the stay remains in house.

`RequestCheckoutGate` (stayLink -> settled / approved / refused) is
NOT IMPLEMENTED (specified but never built — see F4 below): the
settlement gate stays stay-side, and #601 only changes where Stay gets
its inputs. Open balance without a provenanced approval ->
`SETTLEMENT_REQUIRED`; a presented `folioId` that is not the stay's
folio -> `CONFLICT`.

Approval provenance (`BR-17`, `FR-CKO-5`): an approval counts only as
the recorded identity, a role from the fixed three (`owner`,
`manager`, `front-desk`), and a recorded time. Billing refuses an
out-of-set role at write and stamps `approvedAt` server-side; Stay
re-validates all three fields on the read. Whether approval is needed
and which of the three may approve is the hotel open-balance rule
(section 3.1) and is not enforced yet (config fan-out slice).

From #634 on the read itself verifies the stay first when the stay
carries no folio (C8): a close on a stay with no folio and no verified
stay therefore answers `NOT_FOUND` / `STATE_ILLEGAL` rather than opening
an empty folio, and a Stay that cannot be read answers
`UPSTREAM_UNAVAILABLE`. An existing folio is served in every stay state,
so the close of a checked-in stay is unchanged.

### C8. BIL -> STAY (`StayService`) — SYNC read

`GetStayRef` (stayRef -> guest, room, in-house state; FR-BIL-2/3/4).
Errors: `NOT_FOUND` (unknown stay), `STATE_ILLEGAL` (not in house /
closed; BR-1/18). Every folio line and receipt matches its stay exactly
(FR-BIL-4; BR-24).

From #634 on it is consumed by Billing itself, not only available to it:
`PostCharge`, `RecordPayment`, and `RecordOpenBalanceApproval` call it on
every request before they write, and `GetFolioBalance` calls it before it
creates a folio for a stay that has none (a folio Billing already holds
is served without a Stay read, so a departed stay's invoice and receipts
keep presenting; ADR-0008, LLD
[section 27](../architecture/lld.md#27-folio-writes-verify-the-stay-refs-634)).
The call is `POST {STAY_BASE_URL}/v1/stay/GetStayRef` with the stay id,
the caller's Bearer token forwarded, `STAY_BASE_URL` default
`http://stay:8084`, a 2-second timeout (inside NFR-PERF-1's 3-second
action bound), and it runs outside Billing's database transaction.

Errors Billing raises from the seam: an unknown stay -> `NOT_FOUND`;
a stay outside in-house -> `STATE_ILLEGAL` naming the state; an unread
Stay -> `UPSTREAM_UNAVAILABLE` (503) and nothing is written. A provider
`4xx` envelope is surfaced unchanged (a rejected session stays
`UNAUTHENTICATED`), and a `404` that does not name the requested stay is
treated as unreadable, not as an unknown stay. Bounded path: `GetStayRef`
is a leaf read with no outbound call, so the Billing <-> Stay cycle ends
after one hop (C7 -> C8 -> return).

## 4. Charge, payment, day-close (BA section 4; provider: Billing, SYNC)

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

From #634 on, `PostCharge`, `RecordPayment`, and
`RecordOpenBalanceApproval` verify the stay through C8 before writing:
an unknown stay -> `NOT_FOUND`, a stay outside in-house -> `STATE_ILLEGAL`
naming the state, an unread Stay -> `UPSTREAM_UNAVAILABLE` (503) with
nothing written. A folio Billing already holds stays readable in every
stay state, so `ProduceInvoice` / `ProduceReceipt` and `GetDayClose` are
unaffected (ADR-0008, LLD section 27).

## 5. Housekeeping loop (BA section 5; provider: Rooms, SYNC)

`UpdateRoomState` (dirty -> clean -> inspected, actor+time;
FR-RMS-2; NFR-AUD-1); `ListRoomsByState` (FR-RMS-1, FR-RPT-4);
`BlockRoom` / `ReleaseBlock` (room, range, reason; FR-RMS-3;
NFR-AUD-1). Illegal transition -> `STATE_ILLEGAL` (BR-28);
occupied-room block -> `STATE_ILLEGAL`; blocked-date use -> refusal
naming block (BR-12). The dirty-clean-inspected order is fixed,
never configurable (Seq-14).

## 6. Configuration and identity (BA section 6)

### C9. ADM -> consumers (config) — SYNC at startup + ASYNC events

`GetHotelConfig`: full section 3.1 snapshot + schema version at module
startup (FR-ADM-1/4, FR-CUS-1/2/3, FR-BIL-5/7, FR-RTE-3/4,
NFR-RET-1). `ConfigChangedEvents`: async, at-least-once, ordered
per aggregate, idempotent apply by event id (requirements section 3.3;
OQ-C2 answered). Offline-first: serve cached values when Admin is
unreachable (NFR-AVL-1). Fixed section 3.2 items never travel as config.

### C10. Identity (`AdminService`, all modules) — SYNC enforcement per call

`ValidateSession` / `CheckRole` with local signed-token validation
+ bounded revalidation (LLD [section 0](../architecture/lld.md); OQ-C4 answered). Out-of-role ->
`FORBIDDEN` (NFR-SEC-1); locked/signed-out session ->
`UNAUTHENTICATED` (NFR-SEC-2; code assigned here).

### C11. Export/backup fan-out (ADM -> RES, STAY, BIL, GST, ROOM, RATE) — ASYNC job + visible report

`CollectExportSlice` per module as of a cut-timestamp; manifest
records per-module times (OQ-C5 answered: bounded-skew snapshot).
`RunBackup` reports plain success/failure with time (NFR-BKP-2).
Incomplete slice -> reported failure naming scope (FR-ADM-5).

## 7. Reporting feeds (BA section 7; all owners -> RPT) — ASYNC events + SYNC read API

`ReservationEvents`, `StayEvents`, `RoomStateEvents`,
`RateEvents`, `GuestEvents`, `FolioEvents`,
`ConfigChangedEvents` into RPT's own read model (never
cross-reads, HLD [section 3](../architecture/hld.md)); RPT exposes the four synchronous report
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
  sections 1–7, including the `CONFLICT`/`SETTLEMENT_REQUIRED` refusal
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
  covering every section 3.1 item in at least one setup.

## 10. Transport bounds on every pair (Refs #630)

Every sync pair in sections 1–7 carries JSON over HTTP, and from #630
every receiving server bounds that transport in two ways without changing
any contract term:

- **Request-body ceiling.** A receiver caps the body at **65 536 bytes
  (64 KiB)**, a code constant per service and never configuration (D-34).
  A body above it is refused with the shared envelope — HTTP 400
  `VALIDATION_FAILED`, `details` `{"field": "body"}`, the plain
  `error.transport.body_too_large` sentence, a fresh `traceId` — before
  the payload is parsed and before the provider does any work. A body at
  exactly 65 536 bytes is served; one more is refused. `details.field`
  `body` matches no field a consumer branches on, and the consumer-facing
  tables above are unchanged.
- **Finite server timeouts.** Every server declares header-read,
  body-read, response-write, and idle bounds (LLD
  [section 29.3](../architecture/lld.md#293-server-timeouts-per-stack)),
  all sized above the longest wait a legitimate pair call can make — the
  5-second Reservations → Rates pricing read (C1,
  `services/reservations/internal/pricing/client.go:33`) and the
  2-second completion reads (C4 Stay → Reservations,
  `services/stay/src/reservationsClient.ts:31`; C8 Billing → Stay,
  specified at 2 seconds in section 3 above).

This is a transport setting, not a contract revision: no operation,
request field, response shape, status, or code changes, so no
`Contract-Version` bump and no contract file or manifest edit follows.
`script/contract-check.sh` stays green with every fixture resolving, and
every fixture sits far below the ceiling (the largest request schema,
`contracts/http/ModifyReservation.json`, is 3 530 bytes). Rate limiting,
connection limits, and reverse-proxy configuration stay out of scope.

## 11. Deferred needs (explicit, with reason)

- F1 — Conditional RES -> BIL operation for no-show charges (BA
  OQ-C6): no such contract exists. Reason: undecided product rule
  (requirements OQ-1 / section 3.1 no-show rule) plus the fixed
  one-folio-per-stay with no stay for a no-show. Re-open on the
  product decision; the catalog extends additively when it lands.
- F2 — Full OpenAPI authorship per service: deferred to
  implementation slices; this catalog plus `contracts/` is the
  frozen input. Landed since: the curated desk-loop subset only
  (`contracts/openapi.yaml`, 14 ops, #240) — not full per-service
  authorship.
- F3 — gRPC transport per pair: deferred optimisation; HTTP/JSON
  is the MVP binding (section 0 rule).
- F4 — Billing `RequestCheckoutGate` (C7): specified but never
  implemented (no code, no contract manifest as of master).
  Settlement is enforced stay-side (`StayService.CheckOut` folio
  gate + `GetFolioBalance` + recorded approvals). #601 keeps it
  deferred: the gate stays stay-side and now re-reads its inputs from
  Billing instead of trusting the request (C7). Re-open only
  with a product decision that needs a provider-side gate op.

Coverage: every BA need (sections 1–7, error index section 9) is encoded above
or deferred here with reason; the five product open questions
(OQ-1..OQ-5) are recorded as fixed-until-decided parameters in
sections 4–6 and change only through requirements wording, never through
implementation drift.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1046
