# Versioned REST API — per-module resource surface

Status: proposed (Closes #415). Owned by `architect`.

Date: 2026-10-29 (proposed).

## Context

The owner lifted the post-pilot deferral on the REST API migration and
asked for a versioned REST API design in three companion issues. This
record covers the per-module resource surface for issue #415: every
existing RPC-style operation (`POST /v1/<contract>/<Operation>`) in all
eight modules mapped to a REST endpoint, derived from the LLD provider
tables (`docs/architecture/lld.md` sections 1–8) and the existing
`contracts/http/*.json` shapes.

Inputs this record builds on:

- Issue #368 (REST API migration plan — strangler per-resource phasing,
  read-only GETs first, booking/stay writes with `Idempotency-Key` next,
  admin last). Still open; sequencing itself is companion issue #416.
- Issue #369 (versioning and upgrade strategy). Still open.
- ADR-0004 (`docs/architecture/decisions/
  adr-0004-rest-versioning-auth-errors.md`, Closes #414): `/v2` path
  plus versioned contracts, unchanged session auth, RFC 9457 problem+json
  error envelope. This surface follows all three decisions without
  restating them, except where an endpoint needs a direct hook.
- As built today: 61 operations in `contracts/http/*.json` plus LLD-only
  operations with no contract file yet (section 9 names each one).

## 0. Surface-wide rules

These apply to every endpoint below. Anything not listed here is
per-endpoint in sections 1–8.

- Base path: `/v2/...`. The v1 RPC surface (`POST
  /v1/<contract>/<Operation>`) is frozen per ADR-0004 D1; there is no
  `/v1` REST projection.
- Auth: `Authorization: Bearer <session-token>` on every call, same
  session model and RBAC matrix as ADR-0004 D2. No anonymous path.
- Errors: RFC 9457 `application/problem+json` with the existing codes
  and `details` preserved, per ADR-0004 D3. The tables below list codes
  only; the HTTP status follows the normative `statusMapping` in
  `contracts/errors/envelope.json`.
- Reads are `GET` with query parameters. All current query-style RPCs
  (date windows, filters, printable records) are safe and idempotent,
  so the POST-to-GET conversion changes no behaviour.
- Creates are `POST` on the collection and return `201` with a
  `Location` header pointing at the new resource plus its representation.
- Keyed upserts (`Upsert*`) are `PUT` on the item resource addressed by
  the contract's identifying field (room number, plan name, item name,
  guest id); the body is the existing `contracts/http/*.json` request
  shape unchanged. First write returns `201`, repeat write `200`, same
  body. No upsert invents a new key: the path key always mirrors the
  identifying field already required by the contract.
- State transitions and record-producing actions that are not
  collection creates are `POST` on a sub-resource and return `200` with
  the updated representation (or the produced record), except the async
  jobs in section 8, which return `202` with a status resource.
- `Idempotency-Key` (per the #368 slice order, booking/stay writes
  next): a caller-supplied key is REQUIRED on every unsafe call in
  sections 1 (reservations), 2 (stay), 6 (folio writes), and on
  `AssignRoom` in section 3. Missing key is `400 VALIDATION_FAILED`;
  re-delivery of the same key with the same payload replays the stored
  result; the same key with a different payload is `422 STATE_ILLEGAL`.
  Reads, setup upserts (naturally idempotent `PUT`s), and admin
  reads/writes do not take the header. Enforcement lands in the
  implementation slices, not in this issue.
- Request/response field detail is not duplicated here: the "Shape"
  column names the normative `contracts/http/*.json` file whose
  `request`/`response` objects travel unchanged inside the REST body.
  Query parameters are the required request fields of that file
  rendered as query strings; bodies keep the file's field names
  verbatim.
- Timestamps, money, and localisation follow the standing rules
  (`docs/technical/api-spec.md` section 1): UTC offsets, hotel-local
  calendar day, integer minor units, message-catalogue wording.

## 1. Reservations (`ReservationService`)

Noun: `/v2/reservations`, addressed by `{ref}` (the human
`reservationRef` the desk reads back; the contract also carries the
`reservationId` UUID — either identifies the item).

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `CreateReservation` | `POST /v2/reservations` | 201 + `Location: /v2/reservations/{ref}` | `contracts/http/CreateReservation.json` | `CONFLICT`, `STATE_ILLEGAL`, `VALIDATION_FAILED`, `NOT_FOUND` | `Idempotency-Key` required. Body unchanged (roomType, dates, guestLink, priceBasis, discount). |
| `ModifyReservation` | `PUT /v2/reservations/{ref}` | 200, recalculated total | `contracts/http/ModifyReservation.json` | as above + `NOT_FOUND` | `Idempotency-Key` required. Full representation write; re-runs the overbooking guard. |
| `CancelReservation` | `POST /v2/reservations/{ref}/cancellation` | 200, state=cancelled | `contracts/http/CancelReservation.json` | `STATE_ILLEGAL`, `VALIDATION_FAILED`, `NOT_FOUND` | `Idempotency-Key` required. Reason stays mandatory (hotel list). |
| `MarkNoShow` | `POST /v2/reservations/{ref}/no-show` | 200, state=no-show | `contracts/http/MarkNoShow.json` | `STATE_ILLEGAL`, `VALIDATION_FAILED`, `NOT_FOUND` | `Idempotency-Key` required. |
| `GetReservation` | `GET /v2/reservations/{ref}` | 200, full reservation | `contracts/http/GetReservation.json` | `NOT_FOUND`, `VALIDATION_FAILED` | Read slice: GETs first per #368. |
| `CheckInReservation` | `POST /v2/reservations/{ref}/check-in-link` | 200, state=checked-in with stay link | `contracts/http/CheckInReservation.json` | `NOT_FOUND`, `STATE_ILLEGAL`, `VALIDATION_FAILED` | `Idempotency-Key` required. Stay-side link step; the stay itself is section 2. |
| `QueryCalendar` | `GET /v2/reservations?dateFrom=&dateTo=[&roomType=]` | 200, reservations per date/type with state | `contracts/http/QueryCalendar.json` | `VALIDATION_FAILED` | Query fields become query params. |
| `GetDueReservation` (LLD-only, STAY → RES) | — (no public endpoint; served by `GET /v2/reservations/{ref}`) | — | — | — | Explicit non-endpoint: the stay provider reads the same item and applies the due/arrivable check itself. No separate contract file exists; none is added here. |

## 2. Stay / front desk (`StayService`)

Noun: `/v2/stays`, addressed by `{stayId}`; arrivals/departures and
stay-ref are collection views and sub-resources.

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `CheckIn` | `POST /v2/stays` (check-in create) | 201 + `Location: /v2/stays/{stayId}` | `contracts/http/CheckIn.json` | `CONFLICT`, `VALIDATION_FAILED`, `STATE_ILLEGAL` (room/reservation not ready, per LLD) | `Idempotency-Key` required. Body unchanged (reservation, guest, room, actor). |
| `GetStay` | `GET /v2/stays/{stayId}` | 200, stay record | `contracts/http/GetStay.json` | `NOT_FOUND`, `VALIDATION_FAILED` | The reservationId lookup variant becomes `GET /v2/stays?reservationId=` (200, single-item list). |
| `QueryStays` | `GET /v2/stays?[state=]` | 200, stays each exactly once | `contracts/http/QueryStays.json` | `VALIDATION_FAILED` (unknown state) | |
| `CheckOut` | `POST /v2/stays/{stayId}/check-out` | 200, stay closed + invoiceRef | `contracts/http/CheckOut.json` | `SETTLEMENT_REQUIRED`, `STATE_ILLEGAL`, `NOT_FOUND`, `VALIDATION_FAILED` | `Idempotency-Key` required. Folio gate unchanged (stay-side). |
| `MoveRoom` | `POST /v2/stays/{stayId}/moves` | 201 + move history entry | `contracts/http/MoveRoom.json` | `CONFLICT`, `STATE_ILLEGAL`, `NOT_FOUND`, `VALIDATION_FAILED` | `Idempotency-Key` required. Delta vs LLD noted: the LLD table lists no `idempotencyKey` field for `MoveRoom`; the contract file carries one, and this surface follows the contract (key required like every stay write). |
| `RecordActualTimes` | `POST /v2/stays/{stayId}/actual-times` | 200, kept times | `contracts/http/RecordActualTimes.json` | `NOT_FOUND`, `VALIDATION_FAILED` | `Idempotency-Key` required (stay write). |
| `ListArrivalsDepartures` | `GET /v2/stays/arrivals-departures?businessDate=` | 200, arrivals + in-house + departures each exactly once | `contracts/http/ListArrivalsDepartures.json` | `VALIDATION_FAILED` | Fixed view resource under the collection. |
| `GetStayRef` (BIL → STAY) | `GET /v2/stays/{stayId}/ref` | 200, stay link (guest, room, in-house state) | `contracts/http/GetStayRef.json` | `NOT_FOUND`, `STATE_ILLEGAL` (closed) | Provider-to-provider read exposed as a link sub-resource so billing uses the same path as any reader. |

## 3. Rooms (`RoomInventoryService`)

Nouns: `/v2/rooms` (addressed by `{roomNumber}`, the contract's
identifying field), `/v2/room-types`, `/v2/room-blocks`.

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `UpsertRoom` | `PUT /v2/rooms/{roomNumber}` | 201 / 200, saved record | `contracts/http/UpsertRoom.json` | `VALIDATION_FAILED`, `NOT_FOUND` | Manager setup; no `Idempotency-Key` (natural `PUT`). |
| `ListRoomsByState` | `GET /v2/rooms?state=` | 200, rooms in state each exactly once | `contracts/http/ListRoomsByState.json` | `VALIDATION_FAILED` | |
| `FindReadyRoom` (LLD-only, STAY → ROOM) | — (no separate endpoint; served by `GET /v2/rooms?state=ready&roomType=&date=`) | — | — | `NOT_FOUND` (no ready room) preserved as a 404 with empty list + `details` naming type/date | Explicit non-endpoint: no contract file exists; the readiness/type/date filter is a query on the same collection, so no new shape is invented here. |
| `UpdateRoomState` | `PUT /v2/rooms/{roomNumber}/state` | 200, new state + history entry | `contracts/http/UpdateRoomState.json` | `NOT_FOUND`, `STATE_ILLEGAL`, `VALIDATION_FAILED` | Transition check unchanged (BR-28). |
| `AssignRoom` | `POST /v2/rooms/{roomNumber}/assignment` | 200, assignment receipt | `contracts/http/AssignRoom.json` | `NOT_FOUND`, `CONFLICT`, `STATE_ILLEGAL`, `VALIDATION_FAILED` | `Idempotency-Key` required (atomic-guard write, NFR-CON-2). |
| `ReleaseRoom` | `POST /v2/rooms/{roomNumber}/release` | 200, new state | `contracts/http/ReleaseRoom.json` | `NOT_FOUND`, `STATE_ILLEGAL`, `VALIDATION_FAILED` | `toState` stays in the body per contract. |
| `BlockRoom` | `POST /v2/room-blocks` | 201 + `Location: /v2/room-blocks/{roomNumber}?dateFrom=&dateTo=` | `contracts/http/BlockRoom.json` | `NOT_FOUND`, `STATE_ILLEGAL`, `VALIDATION_FAILED` | Manager setup. |
| `ReleaseBlock` | `DELETE /v2/room-blocks/{roomNumber}?dateFrom=&dateTo=` | 200, release record | `contracts/http/ReleaseBlock.json` | `NOT_FOUND`, `STATE_ILLEGAL`, `VALIDATION_FAILED` | DELETE with query-keyed range; returns the release record (not 204) because the contract response carries the released range. |
| `UpsertRoomType` | `PUT /v2/room-types/{name}` | 201 / 200, saved record | `contracts/http/UpsertRoomType.json` | `VALIDATION_FAILED` | Name is the contract's identifying field. |
| `ListRoomTypes` | `GET /v2/room-types` | 200, type list | `contracts/http/ListRoomTypes.json` | — | |
| `CheckRoomTypeSellability` | `GET /v2/room-types/{name}/sellability?dateFrom=&dateTo=` | 200, sellable counts + blocked rooms | `contracts/http/CheckRoomTypeSellability.json` | `NOT_FOUND`, `STATE_ILLEGAL`, `VALIDATION_FAILED` | Safe read rendered as GET; `CONFLICT` stays caller-raised (reservations guard), never returned here. |

## 4. Rates & availability (`PricingService`)

Nouns: `/v2/rate-plans`, `/v2/rate-prices`, `/v2/restrictions`,
`/v2/discounts`; quote/checks are safe GETs.

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `QuotePrice` | `GET /v2/rate-plans/quote?roomTypeId=&arrivalDate=&departureDate=[&discountName=]` | 200, nightly breakdown + total | `contracts/http/QuotePrice.json` | `NOT_FOUND`, `VALIDATION_FAILED` | Safe read; the quoted basis is still stored by reservations (BR-13). |
| `CheckSellableCount` | `GET /v2/availability?roomTypeId=&dateFrom=&dateTo=` | 200, count per date | `contracts/http/CheckSellableCount.json` | `NOT_FOUND`, `VALIDATION_FAILED` | |
| `CheckRestrictions` | `GET /v2/restrictions/check?roomTypeId=&arrivalDate=&departureDate=` | 200 pass/fail + violated restriction | `contracts/http/CheckRestrictions.json` | `STATE_ILLEGAL` (naming the restriction), `VALIDATION_FAILED` | Refusal stays `STATE_ILLEGAL` per LLD; only the transport changes. |
| `UpsertRatePlan` | `PUT /v2/rate-plans/{name}` | 201 / 200 | `contracts/http/UpsertRatePlan.json` | `VALIDATION_FAILED` | Manager setup. |
| `UpsertRatePrice` | `PUT /v2/rate-prices?ratePlanName=&roomTypeId=&nightDate=` | 201 / 200 | `contracts/http/UpsertRatePrice.json` | `NOT_FOUND`, `VALIDATION_FAILED` | Composite key has no single path segment; query-keyed item resource. |
| `UpsertRestriction` | `PUT /v2/restrictions?roomTypeId=&dateFrom=&dateTo=` | 201 / 200 | `contracts/http/UpsertRestriction.json` | `VALIDATION_FAILED` | Same composite-key treatment. |
| `UpsertDiscount` | `PUT /v2/discounts/{name}` | 201 / 200 | `contracts/http/UpsertDiscount.json` | `VALIDATION_FAILED` | Manager setup. |

## 5. Guests (`GuestService`)

Noun: `/v2/guests`, addressed by `{guestId}`; confirmation and
reservation-record are sub-resources.

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `IdentifyGuest` | `GET /v2/guests?search=` | 200, profile + history + returning flag + past-stay count | `contracts/http/IdentifyGuest.json` | `NOT_FOUND`, `VALIDATION_FAILED` | Search keys (name/contact/ref) become the `search` param. |
| `GetGuest` | `GET /v2/guests/{guestId}` | 200, profile + mandatory-field status | `contracts/http/GetGuest.json` | `NOT_FOUND` | |
| `GetBookingContext` | `GET /v2/guests/{guestId}/booking-context` | 200, preferences + notes | `contracts/http/GetBookingContext.json` | `NOT_FOUND` | |
| `UpsertGuest` | `POST /v2/guests` (upsert) | 201 created / 200 existing, guestLink | `contracts/http/UpsertGuest.json` | `VALIDATION_FAILED` | Deliberate POST-upsert exception: matching is body-driven (identifying/contact details, no stable client key), so no path key exists to `PUT` against. |
| `AttachReservation` | `POST /v2/guests/{guestId}/reservation-records` | 201, stored record | `contracts/http/AttachReservation.json` | `VALIDATION_FAILED` | Record attached from the RES-side guest block (FR-GST-4). |
| `ProduceConfirmation` | `GET /v2/reservations/{ref}/confirmation` | 200, confirmation record | `contracts/http/ProduceConfirmation.json` | `NOT_FOUND`, `VALIDATION_FAILED` | Lives under reservations (keyed by ref) but owned by guests; printable read, no `Idempotency-Key`. |

## 6. Billing (`BillingService`)

Nouns: `/v2/folios` (one per stay, BR-21), `/v2/day-closes`,
`/v2/charge-items`, plus invoice/receipt print views.

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `GetFolioBalance` | `GET /v2/folios?stayId=` | 200, folio with every line + running balance | `contracts/http/GetFolioBalance.json` | `NOT_FOUND` | Folio id is server-assigned; lookup stays stay-keyed. |
| `PostCharge` | `POST /v2/folios/{folioId}/charges` | 201, folio line + new balance | `contracts/http/PostCharge.json` | `VALIDATION_FAILED` | `Idempotency-Key` required. Tax/fee derivation unchanged (FR-BIL-5). |
| `RecordPayment` | `POST /v2/folios/{folioId}/payments` | 201, payment line + new balance | `contracts/http/RecordPayment.json` | `VALIDATION_FAILED` | `Idempotency-Key` required. cash\|card only until OQ-1 decides. |
| `RecordOpenBalanceApproval` | `POST /v2/folios/{folioId}/open-balance-approval` | 200, folio with recorded approval | `contracts/http/RecordOpenBalanceApproval.json` | `VALIDATION_FAILED` | `Idempotency-Key` required (contract carries the key). |
| `ProduceInvoice` | `GET /v2/folios/{folioId}/invoice` | 200, printable record matching folio exactly | `contracts/http/ProduceInvoice.json` | `NOT_FOUND`, `VALIDATION_FAILED` | Printable read. |
| `ProduceReceipt` | `GET /v2/folios/{folioId}/payments/{paymentId}/receipt` | 200, printable record matching payment exactly | `contracts/http/ProduceReceipt.json` | `NOT_FOUND`, `VALIDATION_FAILED` | Printable read. |
| `RunDayClose` | `POST /v2/day-closes` | 201, charges + payments-per-method totals | `contracts/http/RunDayClose.json` | `VALIDATION_FAILED` | Manager-only per ADR-0004 D2 matrix. |
| `GetDayClose` | `GET /v2/day-closes/{businessDate}` | 200, stored totals | `contracts/http/GetDayClose.json` | `NOT_FOUND` (no run for the date) | |
| `UpsertChargeItem` | `PUT /v2/charge-items/{name}` | 201 / 200 | `contracts/http/UpsertChargeItem.json` | `VALIDATION_FAILED` | Manager setup. |
| `UpsertTaxFeeRule` (LLD-only) | `PUT /v2/tax-fee-rules/{name}` (reserved) | 201 / 200 | — (no `contracts/http` file exists) | `VALIDATION_FAILED` | Explicit gap: LLD section 6 names the operation but no contract file exists yet. The path is reserved here; the shape lands with the implementation slice. Flagged, not invented. |
| `RequestCheckoutGate` | — (no endpoint) | — | — | — | Explicit deferral with reason: LLD D4 records it as specified-but-never-built; the settlement gate stays stay-side (`POST /v2/stays/{stayId}/check-out` fed by the folio read plus recorded approvals). |

## 7. Reporting (`ReportingService`)

Noun: `/v2/reports`; all four operations are reads over the read
model with `asOf` freshness (never blocking desk flows).

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `OccupancyReport` | `GET /v2/reports/occupancy?dateFrom=&dateTo=` | 200, per-date counts + asOf | `contracts/http/OccupancyReport.json` | — | No `Idempotency-Key` (read). |
| `RevenueSummary` | `GET /v2/reports/revenue?dateFrom=&dateTo=` | 200, room vs extra totals + asOf | `contracts/http/RevenueSummary.json` | — | |
| `DailySheet` | `GET /v2/reports/daily-sheet?businessDate=` | 200, arrivals + in-house + departures + open balances + asOf | `contracts/http/DailySheet.json` | `VALIDATION_FAILED` | |
| `HousekeepingReport` | `GET /v2/reports/housekeeping` | 200, rooms needing cleaning/inspection + asOf | `contracts/http/HousekeepingReport.json` | — | No params (contract request is empty). |

## 8. Admin & config (`AdminService`)

Nouns: `/v2/sessions`, `/v2/users`, `/v2/hotel-config`,
`/v2/audit-log`, `/v2/exports`, `/v2/backups`. Admin lands last per
the #368 slice order; paths are reserved here so the later slice
changes nothing structural.

| RPC operation | REST endpoint | Success | Shape | Errors | Notes |
|---|---|---|---|---|---|
| `SignIn` | `POST /v2/sessions` | 201, session token + identity | `contracts/http/SignIn.json` | `UNAUTHENTICATED`, `IDENTITY_LOCKED`, `VALIDATION_FAILED` | 5-strike lockout unchanged (NFR-SEC-2). |
| `SignOut` | `DELETE /v2/sessions/current` | 204, no body | `contracts/http/SignOut.json` | `UNAUTHENTICATED` | Bearer token identifies the session; nothing travels in the URL besides the fixed `current` marker. |
| `ChangeSecret` | `POST /v2/users/me/secret-change` | 200, account record | `contracts/http/ChangeSecret.json` | `UNAUTHENTICATED`, `VALIDATION_FAILED` | Caller rotates their own secret only; wrong current secret has no lockout side effects. |
| `CreateUser` | `POST /v2/users` | 201 + `Location: /v2/users/{userId}` | `contracts/http/CreateUser.json` | `FORBIDDEN`, `VALIDATION_FAILED` | Owner-only (RBAC matrix). |
| `ListUsers` | `GET /v2/users` | 200, account list | `contracts/http/ListUsers.json` | `FORBIDDEN` | Owner/manager read. |
| `UpdateUserRole` | `PUT /v2/users/{userId}/role` | 200, account record | `contracts/http/UpdateUserRole.json` | `FORBIDDEN`, `VALIDATION_FAILED` | Path key mirrors the contract's `signinIdentity` lookup (server resolves identity → id). |
| `UnlockIdentity` | `POST /v2/users/{userId}/unlock` | 200, unlocked flag | `contracts/http/UnlockIdentity.json` | `FORBIDDEN`, `VALIDATION_FAILED` | Owner-only. |
| `GetHotelConfig` | `GET /v2/hotel-config` | 200, settings snapshot + schema version | `contracts/http/GetHotelConfig.json` | — | Startup read; cached offline-first fallback unchanged. |
| `UpdateHotelConfig` | `PUT /v2/hotel-config` | 200, saved values + schema version | `contracts/http/UpdateHotelConfig.json` | `FORBIDDEN`, `VALIDATION_FAILED` | Singleton resource; `ConfigChangedEvents` emission unchanged. |
| `QueryAuditLog` | `GET /v2/audit-log?[limit=]` | 200, entries newest first | `contracts/http/QueryAuditLog.json` | `FORBIDDEN` | Owner/manager read; limit defaults to 50 per contract. |
| `ValidateSession` / `CheckRole` | — (no public endpoint; provider-internal) | — | — | — | Explicit non-endpoint: server-to-server calls inside desk flows keep carrying the desk session token to the existing internal checks (`docs/technical/integration.md` C10). Publishing them would create an oracle; reason recorded. |
| `CollectExportSlice` / `RunBackup` (LLD-only) | `POST /v2/exports` → `GET /v2/exports/{id}`; `POST /v2/backups` → `GET /v2/backups/{id}` | 202 + status resource; terminal states report plain success/failure with time | — (no `contracts/http` files exist) | reported failure naming the scope (export) | Explicit gap: async jobs by nature (fan-out assembly, on-premise target). Paths and 202/status-shape convention reserved here; request/status shapes land with the implementation slice. |

## 9. Coverage checklist

All 61 `contracts/http/*.json` files mapped above (8 reservations +
8 stay + 11 rooms + 7 rates + 6 guests + 9 billing + 4 reporting +
10 admin = 63 rows counting the two cross-module placements of
`ProduceConfirmation`; every file appears at least once):

- Reservations: `CreateReservation`, `ModifyReservation`,
  `CancelReservation`, `MarkNoShow`, `GetReservation`,
  `CheckInReservation`, `QueryCalendar` → section 1.
- Stay: `CheckIn`, `GetStay`, `QueryStays`, `CheckOut`, `MoveRoom`,
  `RecordActualTimes`, `ListArrivalsDepartures`, `GetStayRef` →
  section 2.
- Rooms: `AssignRoom`, `BlockRoom`, `CheckRoomTypeSellability`,
  `ListRoomsByState`, `ListRoomTypes`, `ReleaseBlock`, `ReleaseRoom`,
  `UpdateRoomState`, `UpsertRoom`, `UpsertRoomType` → section 3.
- Rates: `CheckRestrictions`, `CheckSellableCount`, `QuotePrice`,
  `UpsertRatePlan`, `UpsertRatePrice`, `UpsertRestriction`,
  `UpsertDiscount` → section 4.
- Guests: `AttachReservation`, `GetBookingContext`, `GetGuest`,
  `IdentifyGuest`, `ProduceConfirmation`, `UpsertGuest` → section 5
  (`ProduceConfirmation` served under `/v2/reservations/{ref}/
  confirmation`, owned by guests).
- Billing: `GetDayClose`, `GetFolioBalance`, `PostCharge`,
  `ProduceInvoice`, `ProduceReceipt`, `RecordOpenBalanceApproval`,
  `RecordPayment`, `RunDayClose`, `UpsertChargeItem` → section 6.
- Reporting: `DailySheet`, `HousekeepingReport`, `OccupancyReport`,
  `RevenueSummary` → section 7.
- Admin: `ChangeSecret`, `CreateUser`, `GetHotelConfig`, `ListUsers`,
  `QueryAuditLog`, `SignIn`, `SignOut`, `UnlockIdentity`,
  `UpdateHotelConfig`, `UpdateUserRole` → section 8.

LLD-only operations with no contract file (no silent drops):

| Operation | Treatment | Reason |
|---|---|---|
| `GetDueReservation` (RES) | Folded into `GET /v2/reservations/{ref}` | Provider-internal read; separate endpoint would duplicate the item. |
| `FindReadyRoom` (ROOM) | Folded into `GET /v2/rooms?...` query | Readiness/type/date filter on the same collection. |
| `UpsertTaxFeeRule` (BIL) | Path reserved (`PUT /v2/tax-fee-rules/{name}`), shape deferred | LLD names it; no contract file exists. |
| `RequestCheckoutGate` (BIL) | No endpoint (deferred, LLD D4) | Specified but never built; gate stays stay-side. |
| `ValidateSession` / `CheckRole` (ADM) | No public endpoint (provider-internal) | Publishing them would create an auth oracle. |
| `CollectExportSlice` / `RunBackup` (ADM) | Paths + 202 convention reserved, shapes deferred | Async jobs; no contract files exist. |

## 10. Consistency with #368, #369, and ADR-0004

No contradicting decisions. This surface:

- Adopts the #368 slice order structurally: reads are plain GETs
  (first slice), booking/stay/folio writes carry `Idempotency-Key`
  (next slice), admin paths are reserved but land last (section 8).
  Dual-run CI, contract-as-source-of-truth, and the no-behaviour-change
  rule are restated here only as constraints on the later slices;
  sequencing and rollout are companion issue #416.
- Adopts the #369 items ADR-0004 decided (both-identifier versioning,
  breaking-change classes, deprecation window): response-status changes
  stay major per ADR-0004 D1, which gives the future `/v2` OpenAPI
  mirror check its normative hook. Full versioning rules live in
  ADR-0004, not here.

Deltas made explicit (decisions #368/#369/ADR-0004 left open, pinned
here):

1. `Idempotency-Key` scope: #368 says "booking/stay writes" — this
   surface pins the exact set (sections 1, 2, folio writes in 6,
   `AssignRoom` in 3) plus the missing-key (`400`) and key-reuse
   (`422` on payload mismatch, replay on match) semantics.
2. `MoveRoom` key requirement follows the contract file (which carries
   `idempotencyKey`) over the LLD table (which omits it) — section 2
   notes the delta.
3. Upsert transport rule (`PUT` on the contract's identifying field;
   query-keyed items for composite keys; POST-upsert only for
   `UpsertGuest`, reason recorded) is new: no prior record states it.
4. `FindReadyRoom` and `GetDueReservation` are folded into collection
   reads rather than given dedicated endpoints — a naming decision no
   prior record makes.
5. Gaps flagged, not filled: `UpsertTaxFeeRule`, export/backup shapes
   (section 9). The implementation slices add those shapes; this
   record reserves only their paths.

## Out of scope

Versioning/auth/error-envelope decisions (companion #414, decided in
ADR-0004); migration sequencing, rollout order, and decommission
timing (companion #416); any code, contract, or CI change.

## Consequences

- The #416 rollout plan phases against this surface: GETs first,
  keyed writes next, admin last — without renaming anything.
- Enforcement points (for the implementation slices, not this issue):
  the extended fail-closed contract-check (ADR-0004 D1), a `/v2`
  OpenAPI mirror check modelled on `script/openapi-route-check.sh`
  once the first `/v2` resource ships, and dual-run CI per #368.
- This record starts at `proposed`; only the owner flips it to
  `accepted`. Implementation slices start only after owner acceptance
  plus the T3 spec-gate PASS recorded on #368.
