# Contract readiness — walking skeleton slice

Status: active (Closes #108). Owned by `architect`. This document
evaluates what contract material must be ready before the Phase 3
walking skeleton starts. It writes no contracts, changes no code or
CI, and decides no stack: every file below traces to a decided
section of the LLD bundle (`docs/architecture/lld.md`), the pair
catalog (`docs/technical/integration.md`), or the requirements-side
needs (`docs/requirements/integration-contract-needs.md`).
Anything those sources leave undecided appears only in section 5 (open
questions), never as a silently added requirement.

Skeleton scope (decided, not re-argued here): Admin → Rooms →
Rates → Reservations plus proxy/store/packaging/backup, Billing
excluded by default (ADR-0001, OQ-A2 answers in
`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`; build
order in `docs/architecture/candidate-architectures.md` [section 6.1](candidate-architectures.md); gates
in `docs/project/plan.md` [section 3](../project/plan.md)). Concretely the slice proves: hotel
profile plus one user/role and a minimal config set (Admin), one
room type and one room (Rooms), one rate plan (Rates), one created
reservation through the real RES → RATE → ROOM call path
(Reservations), the `NFR-CON-1` paired-booking guard against the
real stores, and the on-premise installer with proxy, store, and a
first backup run with its success report.

## 0. File-naming convention used below

The issue names files `contracts/http/<pair>.yaml or equivalent`.
The equivalent in force today is JSON: the repo gate
(`script/contract-check.sh`) recognises only `*.json` — it treats
every `contracts/http/*.json` basename as the operation manifest
and requires every `services/*/contract-tests/*.json` fixture to
parse and name a known `operation`. A `.yaml` file would be
invisible to that gate (see OQ-R1 in section 5). Files below are therefore
listed as JSON, grouped by directed pair for readability; whether
the first slice authors one file per operation or one file per
pair (with basenames the script can cross-check) is first-slice
authorship inside the script's JSON constraint (see OQ-R2 in section 5),
not a decision of this document.

Layout anchor: `contracts/{events/,http/,errors/}`
plus `services/<module>/contract-tests/` fixtures (LLD [section 9](lld.md)).
`config-schema/` and `messages/` never landed as `contracts/`
trees — the versioned config schema lives at
`deploy/config/schema.json` and the catalogue as per-service
`messages*` files (see section 1d, section 1g).

## 1. Required contract files (skeleton slice)

### 1a. RES → RATE (`PricingService`) — SYNC (integration [section 1](../technical/integration.md) C1)

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CheckSellableCount.json` | roomType + arrival/departure dates → count per date; `NOT_FOUND` (unknown type) | Integration [section 1](../technical/integration.md) C1; LLD [sections 1, 4](lld.md); BA needs section 1a; schema [section 4](../technical/schema.md) `rate_prices` |
| `contracts/http/CheckRestrictions.json` | roomType + date range → pass/fail; `STATE_ILLEGAL` naming the violated restriction | Integration [section 1](../technical/integration.md) C1; LLD [sections 1, 4](lld.md); BA needs section 1a (`FR-RTE-4`, `BR-10`) |
| `contracts/http/QuotePrice.json` | roomType + dates + discountName? → nightly breakdown, plan ref, total; `NOT_FOUND`, `VALIDATION_FAILED` (unknown discount) | Integration [section 1](../technical/integration.md) C1; LLD [sections 1, 4](lld.md); BA needs section 1a (`FR-RTE-5/1/3`) |
| `contracts/http/UpsertRatePlan.json`, `UpsertRatePrice.json`, `UpsertRestriction.json`, `UpsertDiscount.json` | manager setup payloads used to create the skeleton's one rate plan (plan, nightly prices per type/date) and its restrictions/discounts; `VALIDATION_FAILED`, `NOT_FOUND` | LLD [section 4](lld.md); integration [section 1](../technical/integration.md) (per-hotel values `FR-RTE-3/4` enforced here) |
| `services/reservations/contract-tests/` fixtures for the three read ops | request/response pairs plus refusal cases (`STATE_ILLEGAL` restriction, `NOT_FOUND` type/plan/discount) | Integration [section 9](../technical/integration.md); BA needs section 1a error cases |
| `services/rates/contract-tests/` provider fixtures for all seven ops above | same shapes verified provider-side before packaging | Integration [section 9](../technical/integration.md); LLD [section 9](lld.md) `contract-tests/` obligation |

### 1b. RES → ROOM (`RoomInventoryService`) — SYNC (integration [section 1](../technical/integration.md) C2)

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CheckRoomTypeSellability.json` | roomType + date range → sellable count/boolean; refusal naming the block (`FR-RMS-3`, `BR-12`) | Integration [section 1](../technical/integration.md) C2; LLD [sections 1, 3](lld.md); BA needs section 1b; schema [section 3](../technical/schema.md) `rooms`, `room_blocks` |
| `contracts/http/UpsertRoom.json`, `UpsertRoomType.json` | floor, bed, capacity, features → saved record; `VALIDATION_FAILED`; used for the skeleton's one room type and one room | LLD [section 3](lld.md); BA needs section 1b; schema [section 3](../technical/schema.md) `room_types`, `rooms` |
| `services/reservations/contract-tests/` fixtures for `CheckRoomTypeSellability` | sellable / no-capacity / blocked-date cases | Integration [section 9](../technical/integration.md); BA needs section 1b error cases |
| `services/rooms/contract-tests/` provider fixtures for the three ops above | same shapes verified provider-side | Integration [section 9](../technical/integration.md); LLD [section 9](lld.md) |

### 1c. ReservationService provider shapes — desk entry path (LLD [section 1](lld.md))

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CreateReservation.json` | roomType, dates, guestLink, priceBasis, discountName?, idempotencyKey → reservationRef, state=confirmed, quotedTotal; `CONFLICT` (type+dates), `STATE_ILLEGAL` (restriction), `VALIDATION_FAILED` (missing guest field), `NOT_FOUND` (type/rate) | LLD [section 1](lld.md); integration [section 1](../technical/integration.md) (guard resolves in the RES store transaction, `NFR-CON-1`); BA needs section 1 |
| `services/reservations/contract-tests/` fixtures for `CreateReservation` | happy-path pair plus every refusal branch above | Integration [section 9](../technical/integration.md); BA needs section 1a/section 1b error cases |
| Paired-concurrency guard case (`NFR-CON-1`) | two simultaneous `CreateReservation` calls for the last sellable unit of a type/dates: exactly one succeeds, the other gets `CONFLICT` naming type+dates, run against the real stores (not a mock) | Integration [section 9](../technical/integration.md) ("paired-concurrency guards against the real stores, `NFR-CON-1/2`"); LLD [section 1](lld.md); test strategy L3; traceability `NFR-CON-1` row |

Shapes for `ModifyReservation`, `CancelReservation`,
`MarkNoShow`, `GetReservation`, `QueryCalendar` landed in the
same file set (additive, versioned per integration [section 8](../technical/integration.md)) with their
fixtures in the reservations slice — the skeleton creates one
reservation and proves the booking guard
(candidate-architectures section 6.1); modification, cancellation, and
no-show flows are later slices.

### 1d. Config distribution + identity (AdminService) — integration [section 6](../technical/integration.md) C9/C10

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/GetHotelConfig.json` | full section 3.1 snapshot + schema version at module startup (RES, ROOM, RATE consumers) | Integration [section 6](../technical/integration.md) C9; LLD [section 8](lld.md); BA needs section 6a; schema [section 8](../technical/schema.md) `hotel_config_values` |
| `contracts/http/UpdateHotelConfig.json` (+ `CreateUser`, `UpdateUserRole`, `UnlockIdentity`, `SignIn`, `SignOut`) | skeleton hotel setup: profile, one user/role, minimal config set; `VALIDATION_FAILED`, `FORBIDDEN` | LLD [section 8](lld.md); BA needs section 6a/section 6b; schema [section 8](../technical/schema.md) `hotel_profile`, `users`, `sessions` |
| `contracts/http/ValidateSession.json`, `CheckRole.json` (or the local-validation rule encoding) | per-call enforcement on every skeleton pair: local HMAC-signed-token validation + bounded revalidation; `UNAUTHENTICATED` (expired), `IDENTITY_LOCKED` (locked), `FORBIDDEN` (out-of-role) | Integration [section 6](../technical/integration.md) C10; LLD [section 0](lld.md) (answers OQ-C4) and section 8; security-threat-model enforcement points; BA needs section 6b |
| `contracts/events/config-changed-events.json` | `ConfigChangedEvents` JSON Schema: section 3.1 values only (section 3.2 fixed items never emitted); at-least-once, ordered per aggregate, idempotent apply by event id | Integration [section 6](../technical/integration.md) C9 + section 9; LLD [section 0](lld.md) (answers OQ-C2) and section 8; BA needs section 6a |
| `contracts/config-schema/<version>.json` | versioned per-hotel configuration schema — as-built at `deploy/config/schema.json` (no `contracts/config-schema/` copy as of master); section 3.1 set: identity/contact, timezone, standard times, retention floor, required fields, cancellation wording + reason lists, no-show rule, approval rule, charge items, tax/fee rules, restrictions, discounts; major-version rejection rule per integration [section 8](../technical/integration.md) | Integration [section 6](../technical/integration.md) C9 + section 8; LLD [section 8](lld.md); schema [section 8](../technical/schema.md); requirements section 3.1 |
| `services/admin/contract-tests/` fixtures | config snapshot pair, `FORBIDDEN` role branches, `UNAUTHENTICATED` session branches (already enumerated in the admin `contract-tests/README.md`) | Integration [section 9](../technical/integration.md); admin `contract-tests/README.md` |
| Consumer `ConfigChangedEvents` cases (RES, ROOM, RATE) | duplicate-delivery idempotent apply + per-aggregate ordering | Integration [section 9](../technical/integration.md) event-schema checks; LLD [section 0](lld.md) |

### 1e. Export/backup fan-out, skeleton portion — integration [section 6](../technical/integration.md) C11 (ASYNC job + visible report)

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CollectExportSlice.json` (RES, ROOM, RATE slices) | per-module complete records as of a cut-timestamp; incomplete slice → reported failure naming the missing scope (`FR-ADM-5`) | Integration [section 6](../technical/integration.md) C11; LLD [section 8](lld.md); BA needs section 6c; schema [section 8](../technical/schema.md) `backup_runs` + manifest |
| `contracts/http/RunBackup.json` | success/failure report with time (`NFR-BKP-2`); daily cadence until OQ-5 decided | Integration [section 6](../technical/integration.md) C11; LLD [section 8](lld.md); BA needs section 6c; backup-dr doc |
| Export-slice failure-report fixtures (admin consumer side) | missing-scope naming per module | Integration [section 9](../technical/integration.md); admin `contract-tests/README.md` (`FR-ADM-5`) |

Backup trigger/report surface details follow the fixed-until-decided
rule for OQ-5 (see section 5 OQ-R3); the skeleton proves the first backup
run and its report (candidate-architectures section 6.1 item 3; plan section 3c).
As-built note: neither op landed as a `contracts/http/` manifest as
of master — the backup run and its report are proven instead by
`script/backup.sh` + `script/restore.sh` inside the E2E loop
(`script/e2e-desk-loop.sh`; deployment section 3; runbook).

### 1f. Events emitted during the skeleton (schemas land; RPT consumption deferred)

| File | Events covered | Traces |
|---|---|---|
| `contracts/events/reservation-events.json` | `created` (+ `modified`, `cancelled`, `no-show` shapes may land additively) with ref, dates, roomType, guestLink, priceBasis total, actor, timestamp | LLD [section 1](lld.md); integration [section 7](../technical/integration.md); BA needs section 7 |
| `contracts/events/room-state-events.json` | `room-upserted` (+ `state-changed`, `blocked`, `block-released` shapes may land additively) | LLD [section 3](lld.md); integration [section 7](../technical/integration.md); BA needs section 7 |
| `contracts/events/rate-events.json` | `rate-plan-changed`, `restriction-changed`, `discount-changed` availability-count inputs per type/date | LLD [section 4](lld.md); integration [section 7](../technical/integration.md); BA needs section 7 |
| `contracts/events/config-changed-events.json` | see section 1d | LLD [section 8](lld.md); integration [sections 6–7](../technical/integration.md) |

Emission is via the per-schema `outbox` + dispatcher (LLD [section 0](lld.md);
schema conventions); every emitted event validates against its
schema (integration [section 9](../technical/integration.md)). No Reporting consumer exists yet — see
section 2.

### 1g. Shared envelope, codes, and message keys

| File | Content | Traces |
|---|---|---|
| `contracts/errors/envelope.json` + code catalogue | shared `code`/`message`/`details`/`traceId` shape; skeleton codes used: `CONFLICT`, `STATE_ILLEGAL`, `VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED` (assigned in LLD [section 0](lld.md) / integration [section 6](../technical/integration.md) C10) | Error-handling doc sections 1–2; LLD [section 0](lld.md); integration [section 0](../technical/integration.md) rule |
| `contracts/messages/` keys for skeleton user-visible strings | catalogue keys only (no behaviour in wording, `NFR-I18N-1`); minimal set for setup/refusal surfaces | LLD [section 9](lld.md); api-spec section 1; error-handling section 1 |

### 1h. Proxy / store / packaging / backup — no `contracts/` files by design

Nginx routing, the shared database engine, the offline Ansible
packaging, and the backup target are infrastructure, not module
contracts: nothing under `contracts/` or `contract-tests/`
covers them. They are proven by the L4 install/backup drills
(test strategy L4) and the deployment handover procedure
(deployment sections 3–5; backup-dr doc), exercised on day one per
candidate-architectures section 6.1 item 3. Booking through the proxy
uses the `CreateReservation` shape (section 1c) with the
`/v1/<contract>/<Operation>` POST + `Authorization` session-token
rule (LLD [section 0](lld.md); integration [section 0](../technical/integration.md) rule).

## 2. What stays stubbed until later slices (and why)

| Pair / operations | Stays stubbed | Why (no new reasoning — decided sequencing) |
|---|---|---|
| RES → GST `IdentifyGuest`, `GetBookingContext` (C3) | live reads inside booking (manifests + fixtures landed) | Guest profiles landed with the Guests slice; the skeleton still enforces mandatory guest fields from cached config, not from live GST reads — live RES→GST calls inside the booking step stay future (BA needs section 1c) |
| STAY → RES `GetDueReservation` (C4) | contract file + fixtures | Stay slice (proves `NFR-CON-2` paired check-in per section 6.2) |
| STAY → ROOM `FindReadyRoom`, `AssignRoom`, `ReleaseRoom`, `RecordActualTimes` (C5) + the `NFR-CON-2` paired-concurrency guard cases | `FindReadyRoom` shape + stay consumer fixtures + atomic-guard proof | Stay slice; the exactly-one-winner room assignment cannot be exercised before check-in exists (integration [section 2](../technical/integration.md) C5; LLD [section 3](lld.md); BA needs section 2b). Landed as of master: `AssignRoom`/`ReleaseRoom`/`RecordActualTimes` manifests + rooms provider fixtures + stay consumer fixtures; `FindReadyRoom` shape + fixtures and the guard proof stay stubbed until the Stay slice |
| STAY → GST `GetGuest` (C6) | live read inside check-in (manifest + fixtures landed) | Stay slice (BA needs section 2c): the desk still carries guest data in the check-in request; the live STAY→GST `GetGuest` call wires in with the Stay slice |
| STAY ↔ BIL `GetFolioBalance`, `RequestCheckoutGate`, `GetStayRef` (C7/C8) + Billing section 4 ops (`PostCharge`, `RecordPayment`, `ProduceInvoice`/`ProduceReceipt`, `RunDayClose`, `GetDayClose`, `UpsertChargeItem`, `UpsertTaxFeeRule`, `RecordOpenBalanceApproval`) | `UpsertTaxFeeRule` manifest + `RequestCheckoutGate` (not implemented — LLD D4 / integration F4) | Billing slice landed (manifests + fixtures as of master); `RequestCheckoutGate` was specified but never built — settlement is enforced stay-side |
| Reporting feeds consumption (`consumer_offsets` advance cases, idempotent apply) | consumer-side event-application cases | Reporting slice; the read-API contracts (`OccupancyReport`, `RevenueSummary`, `DailySheet`, `HousekeepingReport` manifests + fixtures) landed as of master — only the consumer-application cases stay open |
| `CollectExportSlice` for STAY, BIL, GST, RATE-consumer RPT | per-module slices (no manifests as of master) | Each lands with its owning module's slice (integration [section 6](../technical/integration.md) C11) — still absent; backup is proven via `script/backup.sh` + `script/restore.sh` instead (see section 1e note) |
| Conditional RES → BIL no-show-charge operation (F1) | contract does not exist | Undecided product rule (requirements OQ-1 / section 3.1 no-show rule) plus fixed one-folio-per-stay with no stay for a no-show (LLD D1; integration F1) |
| Full OpenAPI authorship per service (F2/D2) | full service documents (curated desk-loop subset landed: `contracts/openapi.yaml`, 14 ops, #240) | Deferred to implementation slices; the operation/payload tables plus `contracts/` schemas are the frozen input (LLD D2; integration F2) |
| gRPC transport per pair (F3) | transport bindings | Deferred optimisation; HTTP/JSON is the MVP binding (LLD D3; integration F3) |

## 3. CI gate behaviour (gate live since the first slice landed)

Authoritative behaviour is `script/contract-check.sh` (landed;
originates in issue #98), run as the `contract-check` job in
`.github/workflows/ci.yml`:

1. **SKIP when there is no `contracts/` directory** — the script
   prints `contract-check: SKIP — no contracts/ tree yet …` and
   exits 0. The `contract-tests/README.md` files in each
   `services/<module>/contract-tests/` record the same expectation
   per module. This was the expected state before the first slice
   landed (PR #115), not a failure; with `contracts/` in the tree
   the gate now checks in full.
2. **The first slice flips the gate on for the whole repo.**
   Landing `contracts/` (any file in it) ends the SKIP: every
   `*.json` file under `contracts/` must parse, or the job prints
   `FAIL unparseable JSON` and exits 1. There is no per-pair or
   per-slice opt-out — a partially landed tree is checked in full.
3. **Fixture cross-check activates with `contracts/http/`.** If
   that directory exists, its `*.json` basenames become the known
   operation manifest; every
   `services/*/contract-tests/*.json` fixture must parse and its
   `operation` field must name a known operation, else `FAIL
   unknown operation` / `FAIL unparseable fixture` and exit 1. A
   missing `contracts/http/` only skips the cross-check; missing
   fixture directories only print `nothing further to check` —
   neither fails the build.
4. **What fails the build:** unparseable JSON anywhere under
   `contracts/`; an unparseable fixture; a fixture whose
   `operation` names no manifest entry (when the manifest
   exists). Any of these exits 1 and fails the `contract-check`
   job. Practical consequence for the first-slice PR: every
   landed JSON file must parse and every landed fixture's
   `operation` must exactly match a manifest basename, or CI goes
   red on that PR.
5. **What this gate is not (yet):** provider verification against
   the real stores and the breaking-change gate (major bump +
   deprecation note, integration [section 8](../technical/integration.md)) live in each module's CI job
   once `services/` and `contracts/` both exist (integration [section 9](../technical/integration.md));
   the repo script grows into that gate instead of blocking it
   (script header comment). The L3 paired-concurrency guards and
   LC contract guards run in the module/test jobs per the test
   strategy, not in this script.
6. **OpenAPI mirror gate (landed #240, separate script):**
   `script/openapi-route-check.sh` fails closed when
   `frontend/docs/openapi.yaml` diverges byte-for-byte from
   `contracts/openapi.yaml`, or when a spec path+method has no
   matching `contracts/http/*.json` manifest. The curated
   desk-loop subset stays in lockstep with the manifests through
   this gate, not through the `contract-check` job above.

## 4. No new scope

This document invents no operations, payload fields, error codes,
transports, or sequencing beyond the LLD (`docs/architecture/lld.md`),
the pair catalog (`docs/technical/integration.md`), the
requirements-side needs
(`docs/requirements/integration-contract-needs.md`), and the
decided skeleton scope (ADR-0001 OQ-A2; candidate-architectures
section 6.1; plan section 3). Transport stays HTTP/JSON POST
`/v1/<contract>/<Operation>` with the opaque session token
(LLD [section 0](lld.md); integration [section 0](../technical/integration.md) rule); money stays BIGINT minor units;
time stays `timestamptz`; config stays the section 3.1 set with section 3.2
fixed items never travelling as config. The five product open
questions (OQ-1..OQ-5) keep their fixed-until-decided values from
integration [sections 4–6](../technical/integration.md); this document changes none of them.

## 5. Open questions (only where LLD/integration do not decide)

- **OQ-R1 — File format/extension.** The issue allows
  `<pair>.yaml or equivalent`; the gate script validates only
  `*.json` (a `.yaml` file would be invisible to both the parse
  check and the operation manifest). Until the first slice either
  authors JSON or extends the script (script work belongs to an
  implementation slice, out of scope here), JSON is the only
  gate-visible format. LLD [section 9](lld.md) and integration [section 9](../technical/integration.md) do not fix an
  extension.
- **OQ-R2 — File granularity.** LLD [section 9](lld.md) describes "per-contract
  operation shapes" while the script cross-checks fixture
  `operation` values against `contracts/http/` file basenames,
  which implies one file per operation (or a manifest whose
  basenames equal operation names). Whether the first slice lands
  one file per operation or one file per pair is first-slice
  authorship inside that constraint; the catalog does not decide
  it.
- **OQ-R3 — Backup trigger/report surface (touches section 1e).**
  Requirements OQ-5 (operable backup story: who triggers, report
  surface) is undecided; until decided, daily backups with a
  visible success/failure report (BR-38; integration [section 6](../technical/integration.md) C11;
  BA needs OQ-5). The first slice must treat the `RunBackup` /
  `CollectExportSlice` report shape as fixed-until-decided and
  change it only through requirements wording.
- **OQ-R4 — Cancel/modify reason shape (touches section 2 deferral).**
  Requirements OQ-2 (reason free text vs fixed list) is undecided;
  until decided, cancellation requires a reason from the hotel's
  list (BR-7; BA needs OQ-2). Deferred cancel/modify fixtures
  inherit whichever shape the product decision fixes.
- (For the record, already answered elsewhere and therefore not
  open: token mechanics OQ-C4 → LLD [section 0](lld.md); config delivery OQ-C2 →
  LLD [section 0](lld.md); export snapshot OQ-C5 → LLD [section 8](lld.md); reporting lag OQ-C1 →
  LLD [section 0](lld.md); inventory co-editing → LLD [section 0](lld.md); no-show charge F1/OQ-C6
  → deferred in LLD D1 / integration F1.)

## Coverage statement

Skeleton pairs C1, C2, C9, C10, partial C11, the desk entry
`CreateReservation` shape, the four emitted event families, the
shared error envelope, the config schema, and the `NFR-CON-1`
paired-concurrency guard case each have a file checklist row with
LLD/integration/BA traces in section 1. The stub boundary (section 2), the CI
gate (section 3), and the only undecided items (section 5) satisfy the issue's
acceptance criteria (a)–(d) with no new scope (section 4).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-150
