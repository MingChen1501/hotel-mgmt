# Contract readiness — walking skeleton slice

Status: active (Closes #108). Owned by `architect`. This document
evaluates what contract material must be ready before the Phase 3
walking skeleton starts. It writes no contracts, changes no code or
CI, and decides no stack: every file below traces to a decided
section of the LLD bundle (`docs/architecture/lld.md`), the pair
catalog (`docs/technical/integration.md`), or the requirements-side
needs (`docs/requirements/integration-contract-needs.md`).
Anything those sources leave undecided appears only in §5 (open
questions), never as a silently added requirement.

Skeleton scope (decided, not re-argued here): Admin → Rooms →
Rates → Reservations plus proxy/store/packaging/backup, Billing
excluded by default (ADR-0001, OQ-A2 answers in
`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`; build
order in `docs/architecture/candidate-architectures.md` §6.1; gates
in `docs/project/plan.md` §3). Concretely the slice proves: hotel
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
invisible to that gate (see OQ-R1 in §5). Files below are therefore
listed as JSON, grouped by directed pair for readability; whether
the first slice authors one file per operation or one file per
pair (with basenames the script can cross-check) is first-slice
authorship inside the script's JSON constraint (see OQ-R2 in §5),
not a decision of this document.

Layout anchor: `contracts/{events/,http/,errors/,config-schema/,messages/}`
plus `services/<module>/contract-tests/` fixtures (LLD §9).
`config-schema/` and `messages/` land with the first slice (§1d, §1g)
and are not yet in the tree.

## 1. Required contract files (skeleton slice)

### 1a. RES → RATE (`PricingService`) — SYNC (integration §1 C1)

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CheckSellableCount.json` | roomType + arrival/departure dates → count per date; `NOT_FOUND` (unknown type) | Integration §1 C1; LLD §§1, 4; BA needs §1a; schema §4 `rate_prices` |
| `contracts/http/CheckRestrictions.json` | roomType + date range → pass/fail; `STATE_ILLEGAL` naming the violated restriction | Integration §1 C1; LLD §§1, 4; BA needs §1a (`FR-RTE-4`, `BR-10`) |
| `contracts/http/QuotePrice.json` | roomType + dates + discountName? → nightly breakdown, plan ref, total; `NOT_FOUND`, `VALIDATION_FAILED` (unknown discount) | Integration §1 C1; LLD §§1, 4; BA needs §1a (`FR-RTE-5/1/3`) |
| `contracts/http/UpsertRatePlan.json`, `UpsertRatePrice.json`, `UpsertRestriction.json`, `UpsertDiscount.json` | manager setup payloads used to create the skeleton's one rate plan (plan, nightly prices per type/date) and its restrictions/discounts; `VALIDATION_FAILED`, `NOT_FOUND` | LLD §4; integration §1 (per-hotel values `FR-RTE-3/4` enforced here) |
| `services/reservations/contract-tests/` fixtures for the three read ops | request/response pairs plus refusal cases (`STATE_ILLEGAL` restriction, `NOT_FOUND` type/plan/discount) | Integration §9; BA needs §1a error cases |
| `services/rates/contract-tests/` provider fixtures for all seven ops above | same shapes verified provider-side before packaging | Integration §9; LLD §9 `contract-tests/` obligation |

### 1b. RES → ROOM (`RoomInventoryService`) — SYNC (integration §1 C2)

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CheckRoomTypeSellability.json` | roomType + date range → sellable count/boolean; refusal naming the block (`FR-RMS-3`, `BR-12`) | Integration §1 C2; LLD §§1, 3; BA needs §1b; schema §3 `rooms`, `room_blocks` |
| `contracts/http/UpsertRoom.json`, `UpsertRoomType.json` | floor, bed, capacity, features → saved record; `VALIDATION_FAILED`; used for the skeleton's one room type and one room | LLD §3; BA needs §1b; schema §3 `room_types`, `rooms` |
| `services/reservations/contract-tests/` fixtures for `CheckRoomTypeSellability` | sellable / no-capacity / blocked-date cases | Integration §9; BA needs §1b error cases |
| `services/rooms/contract-tests/` provider fixtures for the three ops above | same shapes verified provider-side | Integration §9; LLD §9 |

### 1c. ReservationService provider shapes — desk entry path (LLD §1)

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CreateReservation.json` | roomType, dates, guestLink, priceBasis, discountName?, idempotencyKey → reservationRef, state=confirmed, quotedTotal; `CONFLICT` (type+dates), `STATE_ILLEGAL` (restriction), `VALIDATION_FAILED` (missing guest field), `NOT_FOUND` (type/rate) | LLD §1; integration §1 (guard resolves in the RES store transaction, `NFR-CON-1`); BA needs §1 |
| `services/reservations/contract-tests/` fixtures for `CreateReservation` | happy-path pair plus every refusal branch above | Integration §9; BA needs §1a/§1b error cases |
| Paired-concurrency guard case (`NFR-CON-1`) | two simultaneous `CreateReservation` calls for the last sellable unit of a type/dates: exactly one succeeds, the other gets `CONFLICT` naming type+dates, run against the real stores (not a mock) | Integration §9 ("paired-concurrency guards against the real stores, `NFR-CON-1/2`"); LLD §1; test strategy L3; traceability `NFR-CON-1` row |

Shapes for `ModifyReservation`, `CancelReservation`,
`MarkNoShow`, `GetReservation`, `QueryCalendar` may land in the
same file set (additive, versioned per integration §8), but their
fixtures stay stubbed until the reservations slice needs them —
the skeleton creates one reservation and proves the booking guard
(candidate-architectures §6.1); modification, cancellation, and
no-show flows are later slices.

### 1d. Config distribution + identity (AdminService) — integration §6 C9/C10

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/GetHotelConfig.json` | full §3.1 snapshot + schema version at module startup (RES, ROOM, RATE consumers) | Integration §6 C9; LLD §8; BA needs §6a; schema §8 `hotel_config_values` |
| `contracts/http/UpdateHotelConfig.json` (+ `CreateUser`, `UpdateUserRole`, `UnlockIdentity`, `SignIn`, `SignOut`) | skeleton hotel setup: profile, one user/role, minimal config set; `VALIDATION_FAILED`, `FORBIDDEN` | LLD §8; BA needs §6a/§6b; schema §8 `hotel_profile`, `users`, `sessions` |
| `contracts/http/ValidateSession.json`, `CheckRole.json` (or the local-validation rule encoding) | per-call enforcement on every skeleton pair: local HMAC-signed-token validation + bounded revalidation; `UNAUTHENTICATED` (locked/expired), `FORBIDDEN` (out-of-role) | Integration §6 C10; LLD §0 (answers OQ-C4) and §8; security-threat-model enforcement points; BA needs §6b |
| `contracts/events/config-changed-events.json` | `ConfigChangedEvents` JSON Schema: §3.1 values only (§3.2 fixed items never emitted); at-least-once, ordered per aggregate, idempotent apply by event id | Integration §6 C9 + §9; LLD §0 (answers OQ-C2) and §8; BA needs §6a |
| `contracts/config-schema/<version>.json` | versioned per-hotel configuration schema (§3.1 set: identity/contact, timezone, standard times, retention floor, required fields, cancellation wording + reason lists, no-show rule, approval rule, charge items, tax/fee rules, restrictions, discounts); major-version rejection rule per integration §8 | Integration §6 C9 + §8; LLD §8; schema §8; requirements §3.1 |
| `services/admin/contract-tests/` fixtures | config snapshot pair, `FORBIDDEN` role branches, `UNAUTHENTICATED` session branches (already enumerated in the admin `contract-tests/README.md`) | Integration §9; admin `contract-tests/README.md` |
| Consumer `ConfigChangedEvents` cases (RES, ROOM, RATE) | duplicate-delivery idempotent apply + per-aggregate ordering | Integration §9 event-schema checks; LLD §0 |

### 1e. Export/backup fan-out, skeleton portion — integration §6 C11 (ASYNC job + visible report)

| File | Operations / cases covered | Traces |
|---|---|---|
| `contracts/http/CollectExportSlice.json` (RES, ROOM, RATE slices) | per-module complete records as of a cut-timestamp; incomplete slice → reported failure naming the missing scope (`FR-ADM-5`) | Integration §6 C11; LLD §8; BA needs §6c; schema §8 `backup_runs` + manifest |
| `contracts/http/RunBackup.json` | success/failure report with time (`NFR-BKP-2`); daily cadence until OQ-5 decided | Integration §6 C11; LLD §8; BA needs §6c; backup-dr doc |
| Export-slice failure-report fixtures (admin consumer side) | missing-scope naming per module | Integration §9; admin `contract-tests/README.md` (`FR-ADM-5`) |

Backup trigger/report surface details follow the fixed-until-decided
rule for OQ-5 (see §5 OQ-R3); the skeleton proves the first backup
run and its report (candidate-architectures §6.1 item 3; plan §3c).

### 1f. Events emitted during the skeleton (schemas land; RPT consumption deferred)

| File | Events covered | Traces |
|---|---|---|
| `contracts/events/reservation-events.json` | `created` (+ `modified`, `cancelled`, `no-show` shapes may land additively) with ref, dates, roomType, guestLink, priceBasis total, actor, timestamp | LLD §1; integration §7; BA needs §7 |
| `contracts/events/room-state-events.json` | `room-upserted` (+ `state-changed`, `blocked`, `block-released` shapes may land additively) | LLD §3; integration §7; BA needs §7 |
| `contracts/events/rate-events.json` | `rate-plan-changed`, `restriction-changed`, `discount-changed` availability-count inputs per type/date | LLD §4; integration §7; BA needs §7 |
| `contracts/events/config-changed-events.json` | see §1d | LLD §8; integration §§6–7 |

Emission is via the per-schema `outbox` + dispatcher (LLD §0;
schema conventions); every emitted event validates against its
schema (integration §9). No Reporting consumer exists yet — see
§2.

### 1g. Shared envelope, codes, and message keys

| File | Content | Traces |
|---|---|---|
| `contracts/errors/envelope.json` + code catalogue | shared `code`/`message`/`details`/`traceId` shape; skeleton codes used: `CONFLICT`, `STATE_ILLEGAL`, `VALIDATION_FAILED`, `NOT_FOUND`, `FORBIDDEN`, `UNAUTHENTICATED` (assigned in LLD §0 / integration §6 C10) | Error-handling doc §§1–2; LLD §0; integration §0 rule |
| `contracts/messages/` keys for skeleton user-visible strings | catalogue keys only (no behaviour in wording, `NFR-I18N-1`); minimal set for setup/refusal surfaces | LLD §9; api-spec §1; error-handling §1 |

### 1h. Proxy / store / packaging / backup — no `contracts/` files by design

Nginx routing, the shared database engine, the offline Ansible
packaging, and the backup target are infrastructure, not module
contracts: nothing under `contracts/` or `contract-tests/`
covers them. They are proven by the L4 install/backup drills
(test strategy L4) and the deployment handover procedure
(deployment §§3–5; backup-dr doc), exercised on day one per
candidate-architectures §6.1 item 3. Booking through the proxy
uses the `CreateReservation` shape (§1c) with the
`/v1/<contract>/<Operation>` POST + `Authorization` session-token
rule (LLD §0; integration §0 rule).

## 2. What stays stubbed until later slices (and why)

| Pair / operations | Stays stubbed | Why (no new reasoning — decided sequencing) |
|---|---|---|
| RES → GST `IdentifyGuest`, `GetBookingContext` (C3) | contract file + fixtures | Guest profiles land in the Guests slice (candidate-architectures §6.2 order); the skeleton enforces mandatory guest fields from cached config, not from live GST reads (BA needs §1c) |
| STAY → RES `GetDueReservation` (C4) | contract file + fixtures | Stay slice (proves `NFR-CON-2` paired check-in per §6.2) |
| STAY → ROOM `FindReadyRoom`, `AssignRoom`, `ReleaseRoom`, `RecordActualTimes` (C5) + the `NFR-CON-2` paired-concurrency guard cases | contract file + fixtures + atomic-guard proof | Stay slice; the exactly-one-winner room assignment cannot be exercised before check-in exists (integration §2 C5; LLD §3; BA needs §2b). Shapes landed additively: provider shapes `AssignRoom`/`ReleaseRoom` (+ `contracts/http/` manifests + rooms provider fixtures) landed with the rooms slice (#115); `FindReadyRoom`, `RecordActualTimes`, stay consumer fixtures, and the guard proof stay stubbed until the Stay slice |
| STAY → GST `GetGuest` (C6) | contract file + fixtures | Stay slice (BA needs §2c) |
| STAY ↔ BIL `GetFolioBalance`, `RequestCheckoutGate`, `GetStayRef` (C7/C8) + Billing §4 ops (`PostCharge`, `RecordPayment`, `ProduceInvoice`/`ProduceReceipt`, `RunDayClose`) | all Billing contract files + fixtures | Billing excluded from the skeleton by default (ADR-0001 OQ-A2); Billing slice per §6.2 |
| Room housekeeping loop `UpdateRoomState`, `ListRoomsByState`, `BlockRoom`/`ReleaseBlock` beyond setup | fixtures (shapes may land additively with §1b) | Skeleton sets up one room and checks sellability only; dirty→clean→inspected progression and blocks belong to the rooms/housekeeping slice (integration §5; LLD §3; BA needs §5). Shapes landed additively: `UpdateRoomState`, `ListRoomsByState`, `BlockRoom` (+ manifests + rooms provider fixtures) landed with the rooms slice (#115); `ReleaseBlock` and remaining fixtures stay stubbed |
| `ModifyReservation`, `CancelReservation`, `MarkNoShow`, `QueryCalendar` | fixtures (shapes may land additively with §1c) | Skeleton creates one reservation; modification/cancellation/no-show/calendar are later reservations-slice flows (integration §1; BA needs §1) |
| Reporting feeds consumption + read API (`OccupancyReport`, `RevenueSummary`, `DailySheet`, `HousekeepingReport`) | consumer wiring + read-API contracts + `consumer_offsets` advance cases | Reporting slice; skeleton emits events to the outbox but no read model consumes them (integration §7; LLD §7; BA needs §7) |
| `CollectExportSlice` for STAY, BIL, GST, RATE-consumer RPT | per-module slices | Each lands with its owning module's slice (integration §6 C11) |
| Conditional RES → BIL no-show-charge operation (F1) | contract does not exist | Undecided product rule (requirements OQ-1 / §3.1 no-show rule) plus fixed one-folio-per-stay with no stay for a no-show (LLD D1; integration F1) |
| Full OpenAPI authorship per service (F2/D2) | full service documents | Deferred to implementation slices; the operation/payload tables plus `contracts/` schemas are the frozen input (LLD D2; integration F2) |
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
   deprecation note, integration §8) live in each module's CI job
   once `services/` and `contracts/` both exist (integration §9);
   the repo script grows into that gate instead of blocking it
   (script header comment). The L3 paired-concurrency guards and
   LC contract guards run in the module/test jobs per the test
   strategy, not in this script.

## 4. No new scope

This document invents no operations, payload fields, error codes,
transports, or sequencing beyond the LLD (`docs/architecture/lld.md`),
the pair catalog (`docs/technical/integration.md`), the
requirements-side needs
(`docs/requirements/integration-contract-needs.md`), and the
decided skeleton scope (ADR-0001 OQ-A2; candidate-architectures
§6.1; plan §3). Transport stays HTTP/JSON POST
`/v1/<contract>/<Operation>` with the opaque session token
(LLD §0; integration §0 rule); money stays BIGINT minor units;
time stays `timestamptz`; config stays the §3.1 set with §3.2
fixed items never travelling as config. The five product open
questions (OQ-1..OQ-5) keep their fixed-until-decided values from
integration §§4–6; this document changes none of them.

## 5. Open questions (only where LLD/integration do not decide)

- **OQ-R1 — File format/extension.** The issue allows
  `<pair>.yaml or equivalent`; the gate script validates only
  `*.json` (a `.yaml` file would be invisible to both the parse
  check and the operation manifest). Until the first slice either
  authors JSON or extends the script (script work belongs to an
  implementation slice, out of scope here), JSON is the only
  gate-visible format. LLD §9 and integration §9 do not fix an
  extension.
- **OQ-R2 — File granularity.** LLD §9 describes "per-contract
  operation shapes" while the script cross-checks fixture
  `operation` values against `contracts/http/` file basenames,
  which implies one file per operation (or a manifest whose
  basenames equal operation names). Whether the first slice lands
  one file per operation or one file per pair is first-slice
  authorship inside that constraint; the catalog does not decide
  it.
- **OQ-R3 — Backup trigger/report surface (touches §1e).**
  Requirements OQ-5 (operable backup story: who triggers, report
  surface) is undecided; until decided, daily backups with a
  visible success/failure report (BR-38; integration §6 C11;
  BA needs OQ-5). The first slice must treat the `RunBackup` /
  `CollectExportSlice` report shape as fixed-until-decided and
  change it only through requirements wording.
- **OQ-R4 — Cancel/modify reason shape (touches §2 deferral).**
  Requirements OQ-2 (reason free text vs fixed list) is undecided;
  until decided, cancellation requires a reason from the hotel's
  list (BR-7; BA needs OQ-2). Deferred cancel/modify fixtures
  inherit whichever shape the product decision fixes.
- (For the record, already answered elsewhere and therefore not
  open: token mechanics OQ-C4 → LLD §0; config delivery OQ-C2 →
  LLD §0; export snapshot OQ-C5 → LLD §8; reporting lag OQ-C1 →
  LLD §0; inventory co-editing → LLD §0; no-show charge F1/OQ-C6
  → deferred in LLD D1 / integration F1.)

## Coverage statement

Skeleton pairs C1, C2, C9, C10, partial C11, the desk entry
`CreateReservation` shape, the four emitted event families, the
shared error envelope, the config schema, and the `NFR-CON-1`
paired-concurrency guard case each have a file checklist row with
LLD/integration/BA traces in §1. The stub boundary (§2), the CI
gate (§3), and the only undecided items (§5) satisfy the issue's
acceptance criteria (a)–(d) with no new scope (§4).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-150
