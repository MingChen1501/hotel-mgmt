# Failed rebuild consistency test traceability (Refs #642)

Status: active. Testing spec for the T2 all-or-nothing rebuild publication
([issue #642](https://github.com/MingChen1501/hotel-mgmt/issues/642), audit
finding P2 — `Rebuild` cleared every projection, consumer offset, and
as-of stamp before it replayed, then returned on the first event it could
not project, while reads never refuse, so a rebuild that aborted part-way
left the desk reading an empty or partial read model whose `asOf` looked
as plausible as a healthy rebuild's), owned by `qa-lead`. It maps the
change's done-conditions — `AC-RPT-8`..`AC-RPT-10`, owned by
`product-owner` in `docs/product/acceptance-criteria.md`
[section 28](../product/acceptance-criteria.md#28-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642) —
the requirements `FR-RPT-5`..`FR-RPT-7`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 36](../requirements/mvp-requirements.md#36-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642),
and the business rule `BR-66` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md) to their guards:
the pins that exist on disk at this spec head, the guard registry
`RB1`–`RB12`, and the evidence rule `RB-E1`.

Written before the implementation PR. Every new guard in the registry is
a **named, missing obligation** at this head — `Rebuild` still clears the
published set in place (`services/reporting/internal/store/store.go:225-243`,
the maps replaced under the lock at `:227-235`, the mutex released at
`:236`, the replay at `:237-241`), and no guard drives a failing rebuild
on a store that already serves rows — so no row here marks a guard
complete before it exists and passes, and the slice is not complete until
the implementation PR merges and `qa-lead` re-pins every row at the merged
head (the `#588 -> #599` pattern). Section 1 states the tier and the
no-change rules; section 2 cites what is on disk today and what it
proves; section 3 names the guards the implementation PR must create;
section 4 is the traceability map; section 5 is the test plan it must
run; section 6 is the owner verification cases; section 7 the evidence
rule; section 8 the slice status and the re-pin rule.

Companion specs: scope decision D-40 in
`docs/project/decision-log.md`
[the decision log](../project/decision-log.md) and risk R-21 in
`docs/project/risk-register.md` [the risk register](../project/risk-register.md);
the build-aside/swap seam, the per-store rule, the as-of retention, the
per-flow diagram, the contract decision, and the verification plan in
`docs/architecture/lld.md`
[section 35](../architecture/lld.md#35-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642);
the refreshed rebuild edges and the delta on the reporting service page
(`docs/architecture/services/reporting.md`
[section 9](../architecture/services/reporting.md#9-delta--a-failed-rebuild-keeps-the-last-good-read-model-refs-642),
with the flowcharts in sections 3 and 4). Sibling tests this slice must
not disturb: the `traceability-matrix.md` MVP rows and sections 9–16, 18,
and 20–27 plus their registries (`checkout-settlement-test-traceability.md`
`S1`-`S12`, `departure-release-test-traceability.md` `DR1`-`DR13`,
`arrival-reassign-test-traceability.md` `RR1`-`RR13`,
`booking-management-view-test-traceability.md` `BM1`-`BM16`,
`folio-write-verification-test-traceability.md` `FW1`-`FW13`,
`internal-error-envelope-test-traceability.md` `ERR1`-`ERR9`,
`body-bounds-test-traceability.md` `BND1`-`BND28`,
`money-amount-bounds-test-traceability.md` `AMT1`-`AMT20`,
`report-range-cap-test-traceability.md` `RPT1`-`RPT14`,
`guest-identity-test-traceability.md` `GID1`-`GID14`,
`admin-auth-config-test-traceability.md` `CFG1`-`CFG24`, and
`audit-actor-test-traceability.md` `SEC1`-`SEC36`). This spec implements
no code, changes no guard, adds no catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `product-owner` (acceptance criteria section 28),
  `business-analyst` (requirements section 36), and `architect` (LLD
  section 35): one internal lifecycle for one existing operation — a
  rebuild publishes its result all at once instead of in place — with no
  new subsystem, dependency edge, data model, endpoint, status field,
  reader-visible surface, or error-code token. No ADR: the error
  vocabulary and the shared envelope stay exactly as they are.
- One rule: **a rebuild publishes only a fully replayed set, and an
  aborted rebuild changes nothing the desk can read.** `Rebuild` builds a
  private candidate (its own seen record, per-subscription offsets,
  as-of stamp, and six projection maps) and installs it in one
  critical-section swap after the last event projects. On the first
  refused event the candidate is discarded, the refusal is returned
  unchanged, and the published projections, seen record, offsets, and
  `asOf` keep their pre-rebuild values.
- The failure is observable **through the rebuild call's returned
  error**, never through a read: no read route, response field, status
  field, or new operation is added. `Rebuild` has no production caller
  in the tree at this head (only tests call it), so the `*OpError` the
  rebuild job wiring receives is the observation channel, paired with
  the unchanged last-good `asOf` on the reports.
- **Reads never refuse and never report a rebuild state.** The four reads
  keep their `200` responses and their set's `asOf`; a read taken during
  or after a failed rebuild answers the complete pre-rebuild set with its
  older stamp — never zeros with a fresh-looking one.
- A successful rebuild is byte-identical to today's: the same rows, row
  order, zero-filled dates, revenue totals, daily-sheet groups,
  housekeeping list, `asOf`, and per-subscription offsets, and
  re-applying a replayed event stays a no-op.
- **One store today, and the persisted-store rule recorded, not
  pretended tested.** Reporting has exactly one store at this head, the
  in-memory `Store` (`services/reporting/internal/store/store.go`); the
  migrated read-model and consumer-offset tables
  (`services/reporting/migrations/000002_schema.up.sql:19-56`) are not
  read or written by any Go code, and there is no `postgres.go` or
  `pgstore` in the module. The guards below therefore test the one store;
  the persisted store does not exist yet, so LLD 35.2 records the
  all-or-nothing commit rule it must meet and `RB11` diff-gates that this
  change neither adds a second store nor loses that rule. No phantom
  guard is claimed for a store that is not on disk.
- **Nothing else moves.** No contract file, schema, migration, error
  code, catalogue key, desk screen, control, route, print rule, or
  backfill is added or changed; the 730-night range cap (`NFR-RPT-1`,
  `BR-62`) and every existing refusal keep their behaviour; the
  in-memory read model keeps its shape; and no environment variable,
  `deploy/` file, compose file, or per-hotel setting carries the
  publication rule (BR-66's fixed-row entry).
- Change-level rollback is one revert: the candidate build, the swap, and
  the guards disappear together and the clear-and-replay path returns; no
  migration, backfill, or data repair exists in either direction, because
  the read model is derived from the event log.
- **No transitional red at this spec head.** The branch is docs-only, so
  the code tree is the stack base the spec PRs branched from. The Go
  suites were not re-run in this worktree as part of the spec work; they
  are the unchanged baseline the `go-build (reporting)` CI job last ran,
  and the implementation PR runs them.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code tree
is identical to the stacked spec PRs' base (the product, architecture,
requirements, and testing spec PRs touch `docs/` only). They prove today's
behaviour: the rebuild clears the published set before it replays, the
first refused event leaves the half-built set in place, the reads serve
whatever the maps hold and never refuse, and no guard drives a failing
rebuild against a store that already serves rows. The implementation PR
extends these in place with a `#642` note and never deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/reporting/internal/store/store.go:225-243` | `Rebuild` takes the mutex (`:226`), replaces `seen`, `offsets`, `asOf`, and all six projection maps with empty values (`:227-235`), releases the mutex (`:236`), replays the slice through `Apply` (`:237-241`), and returns the first refused event unchanged (`:239`) — the finding itself | `RB1`, `RB4`: the clear must move into a private candidate; the abort path must leave every published value untouched; the swap is the only point that touches the published set |
| `store.go:138-149` | `Store` holds the mutex plus `seen`, `offsets`, `asOf`, and the six projection maps; `New` builds that same shape at `:152-163` | `RB1`, `RB4`: the candidate carries the same nine members, so one assignment can install it without changing any read's field set |
| `store.go:199-219` | `Apply` is the live ingest path: validate the id (`:202-204`), skip an already-seen id (`:205-207`), project (`:208-210`), then record the id, the subscription offset, and the as-of advance (`:211-217`) | `RB5`: the candidate is filled by the same per-event fold, so a rebuilt row is the row the live path produces; `RB6`: duplicate ids stay no-ops |
| `store.go:245-446` | `project` is the one per-event fold; each branch validates its fields before its first write (for example `reservation.created` at `:251-273` and `rate.availability-set` at `:339-352`) | `RB1`: a refusal cannot leave the published set changed, because the fold runs against the candidate and stops before any write |
| `store.go:30-32` | `validation(field, message)` builds an `OpError` with `Code: "VALIDATION_FAILED"`, `Status: 400`, and `Details: {"field": field}` | `RB1`, `RB9`: the failure path returns the same constructor's `OpError` unchanged — same code, status, message, and field |
| `store.go:474-524`, `:529-548`, `:556-609`, `:632-644` | `Occupancy` (lock `:479`), `Revenue` (`:534`), `Sheet` (`:560`), and `Housekeeping` (`:633`) each take the mutex per call and read the live fields; none refuses a read | `RB1`, `RB4`, `RB7`: after the change each read reads the current set behind the mutex, answers one complete set with that set's `asOf`, and never refuses for staleness |
| `store.go:649-658`, `:661-666` | `Offsets` and `AsOf` take the mutex and read the record; the record is the rebuild job's resume position and the stamp is the reports' freshness signal | `RB2`, `RB9`: after an abort both answer the pre-rebuild values; the unchanged stamp is the operator's second signal |
| `store_test.go:63` (`TestRebuildMatchesSourceRows`) | A clean `Rebuild(seedEvents())` is served: occupancy rows at `:69`, revenue at `:90`, daily-sheet arrivals/in-house/departures/open balances, and non-zero `asOf` | `RB5`, `RB12`: the row-identity expectations and `seedEvents` fixture are the comparator; no assertion may move |
| `store_test.go:142` (`TestDuplicateDeliveryNeverDoubleCounts`) | Replaying the whole slice through `Apply` after a rebuild leaves every report and offset where the first pass put them | `RB6`, `RB12`: extend, never rewrite — idempotency must survive the swap |
| `store_test.go:192` (`TestConsumerOffsetsAdvancePerSubscription`) | After a clean rebuild each subscription points at its own last event, and a later event moves only its own offset | `RB2`, `RB5`, `RB12`: the expected offset map (`rate`/`reservation`/`stay`/`folio`) is the comparator for the resume record |
| `store_test.go:228` (`TestMalformedEventsAreRefused`) | Bad events are refused through `Apply` alone, on a store that has never served a row; the recipe is a `reservation.created` missing `reservationRef` and a `folio.charge-posted` with `amountMinor: -5` | `RB1`, `RB3`: reuse the recipe to build the middle bad event, but drive it through `Rebuild` on a store that already serves rows (the missing case) |
| `store_test.go:273` (`TestRebuildTracksRoomsNeedingWork`) | A clean rebuild serves the housekeeping list, and replaying the slice leaves it and the `room` offset unchanged | `RB5`, `RB6`, `RB12`: the housekeeping comparator and the no-op half |
| `store_test.go:365`, `:383`, `:413`, `:457` | The range-cap constant, the store refusals, the before-the-lock placement, and the at-cap boundary pair (`RPT6`, `RPT9`, `RPT5`, `RPT3`) | `RB12`: they stay green untouched — the swap must not change any read's window behaviour |
| `service_test.go:18`, `:46`, `:105`, `:127`, `:160` | The four service reads serve rebuilt rows with `asOf`, and the range refusals stay in place | `RB7`, `RB12`: the service reads must keep their shapes and `asOf` |
| `handler_test.go:59`, `:108`, `:131`, `:189`, `:239` | Over HTTP: the three rebuilt reports with `asOf`, auth/validation refusals, the housekeeping report, the span refusal, and the at-cap window | `RB8`, `RB12`: the four reads answer `200` before and after a failed rebuild; an assertion rewrite fails the row |
| `perf_test.go:97` (`TestPerfTwoYearReportsRecordTimings`) | The unedited two-year perf read over 731 dates | `RB5`, `RB12`: it must stay green unedited; the swap adds no read wait |
| `handler.go:1-8` | The design sentence: "a lagging rebuild shows through the as-of timestamp, never by refusing the desk" | `RB8`: the failure must not be surfaced through a read |
| `handler.go:136`, `:162`, `:188`, `:218` | The four read routes; the `200` responses at `:159`, `:185`, `:210-214`, `:228-231` carry `asOf` and no rebuild field | `RB8`: no response gains or loses a key; no status surface appears |
| `cmd/server/main.go:30-32` | The server mounts only `GET /healthz` and the read prefix `POST /v1/reporting/`; there is no status or rebuild route | `RB8`: the diff keeps that route set unchanged |
| `services/reporting/internal/service/service.go:24-27` | `Store()` exposes the read model to the rebuild job wiring; `Rebuild` has no HTTP operation, so its returned error is the operator channel | `RB9`: the failure stays observable through that return |
| `services/reporting/migrations/000002_schema.up.sql:19-56` | The migrated read-model tables (`rpt_occupancy_daily`, `rpt_revenue_daily`, `rpt_daily_sheet`, `rpt_housekeeping_current`) and `consumer_offsets` exist | `RB11`: unchanged, and no migration is added; the persisted store's staging-plus-one-transaction rule stays recorded in LLD 35.2 |
| `grep -rn "postgres\|pgstore\|database/sql" services/reporting --include=*.go` | No SQL driver and no persisted store exist in the module at this head; the store package doc (`store.go:1-8`) and `main.go:1-6` defer persistence to a later slice | `RB11`: the change adds no second store; when persistence lands it must keep the same all-or-nothing rule |
| `grep -rn "\.Rebuild(" services/ --include=*.go \| grep -v _test.go` | No production caller of `Rebuild` exists; the tests are the only callers at this head | `RB9`: the contract under test is the returned error, not a route |
| `grep -rn "Getenv" services/reporting --include=*.go` | Only `PORT` (`main.go:24`) and the message-catalogue/`PERF_*` tooling read the environment; nothing configures a rebuild | `RB10`: the publication rule is one code behaviour, carried by no configuration source |

## 3. Guard registry RB1-RB12 and the evidence rule RB-E1

Twelve guard obligations inside Reporting, plus the evidence record.
`RB1`-`RB10` are **missing guards** the implementation PR creates (the
abort-retains-the-set case, the resume/stamp record, the never-rebuilt
case, the one-complete-set read, the byte-identical success comparator,
the idempotent re-run, the per-set `asOf` agreement, the never-through-a-
read case, the observable-error pair, and the fixed-rule diff gate);
`RB11` is the one-store/no-migration diff gate; `RB12` re-runs every
existing guard and gate with no edit; `RB-E1` is the evidence record. A
guard is not complete on "the test passes" alone: every abort case also
asserts the returned `OpError` matches today's refusal and that the four
reports, `Offsets()`, and `AsOf()` are the captured pre-rebuild values —
a test that only checks a non-nil error would pass a rebuild that still
cleared the set.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `RB1` | **An aborted rebuild keeps the pre-rebuild served set (`AC-RPT-8`, `FR-RPT-5`, `BR-66`) — the issue's own acceptance test**: rebuild `seedEvents()` to completion; capture all four reports' rows, row order, and `asOf`, plus `Offsets()` and `AsOf()`; then call `Rebuild` on a slice whose **middle** event is malformed (the `store_test.go:228` recipe, with at least one good event before and after it); assert the returned `OpError` has `Code == "VALIDATION_FAILED"`, `Status == 400`, `Details["field"]` and `Message` equal to the refusal that same bad event produces through `Apply` on a fresh store, and that `Occupancy`, `Revenue`, `Sheet`, and `Housekeeping` still answer the captured rows, row order, and `asOf`, and `Offsets()` deep-equal the captured record | `services/reporting/internal/store/store_test.go` (extend, beside `TestRebuildMatchesSourceRows:63`) |
| `RB2` | **An aborted rebuild keeps the resume record and the last-good stamp (`AC-RPT-8`, `FR-RPT-5`, `AC-RPT-10`)**: immediately after `RB1`'s failure, `Offsets()` equals the pre-rebuild record for every subscription and `AsOf()` equals the pre-rebuild stamp; then a clean rebuild of the valid slice names the same last-applied ids a never-failed store holds (the `TestConsumerOffsetsAdvancePerSubscription:192` map) — so a retry replays from the same place and no fresher stamp was invented | `store_test.go` (extend) |
| `RB3` | **A failed rebuild on a never-rebuilt store keeps the empty pre-rebuild state (`AC-RPT-8`, `FR-RPT-5`)**: on `New()`, a `Rebuild` that refuses an event mid-slice leaves zero rows on all four reports and a zero `asOf`; the failed rebuild never invents a fresher stamp over an empty set | `store_test.go` (extend) |
| `RB4` | **A read during a rebuild answers one complete set, never a partial one (`AC-RPT-9`, `FR-RPT-6`, `BR-66`)**: with a store already serving `seedEvents()`, capture each report's exact pre-rebuild value (rows, row order, and the `asOf` it carries); compute each report's exact post-rebuild value for the same slice plus one extra projecting event; run the second `Rebuild` in one goroutine while a reader loop reads each of the four reports until the rebuild returns; for **each individual read**, assert the value deep-equals that report's pre-value or its post-value — never an empty set, a mid-replay subset, or the pre rows carrying the post `asOf` (or the reverse) — so every answer is one complete set with its own stamp. Run under `go test -race ./internal/store/...` locally and record the output in the PR body (CI's `go-build (reporting)` job runs `go test ./...` without `-race`), so the swap's critical section is exercised by the race detector | `store_test.go` (extend; same package) |
| `RB5` | **A successful rebuild is byte-identical to today's output (`AC-RPT-10`, `FR-RPT-7`, `BR-66`)**: build a reference store by applying the same slice event-by-event through the unchanged live path `Apply`; `Rebuild` a second store with the same slice; deep-equal the four report row sets and row order (occupancy, revenue including its zero-filled dates and totals, daily-sheet groups, housekeeping list), the `asOf`, and `Offsets()`. Run it over `seedEvents()` (occupancy/revenue/sheet) and `housekeepingEvents()` (housekeeping), so a row, order, zero-fill, total, group, list, stamp, or offset change fails visibly | `store_test.go` (extend) |
| `RB6` | **Idempotency survives the swap (`AC-RPT-10`, `FR-RPT-7`) — re-run, no edit**: `TestDuplicateDeliveryNeverDoubleCounts` (`store_test.go:142`) and the replay half of `TestRebuildTracksRoomsNeedingWork` (`:273`) keep passing untouched, so duplicate ids from the replayed slice stay no-ops against the swapped set | `store_test.go:142`, `:273` — no assertion edit permitted |
| `RB7` | **Each read carries its own set's `asOf` (`AC-RPT-9`, `FR-RPT-6`, `FR-RPT-7`)**: after a clean rebuild, `Occupancy`, `Revenue`, `Sheet`, and `Housekeeping` all carry the same non-zero stamp that `AsOf()` returns, equal to the slice's newest `OccurredAt`; after an aborted rebuild they all carry the pre-rebuild stamp (never another set's, never a zero produced by clearing) | `store_test.go` (extend) and `services/reporting/internal/service/service_test.go` (extend) |
| `RB8` | **A failed rebuild is never surfaced through a read (`AC-RPT-10`, `FR-RPT-7`, `BR-66`)**: after `RB1`'s failed rebuild, the four read routes still answer `200` with the pre-rebuild rows and `asOf`, with byte-identical response key sets (no added/removed field), and no route or field reports rebuild state; `cmd/server/main.go:30-32` keeps only `GET /healthz` plus the read prefix | `services/reporting/internal/handler/handler_test.go` (extend) plus the `main.go` diff gate |
| `RB9` | **The operator sees the failure through the rebuild call (`AC-RPT-8`, `AC-RPT-10`, `FR-RPT-7`)**: a failing `Rebuild` returns a non-nil `*store.OpError` equal to today's `VALIDATION_FAILED` (code 400, the same message, the same `details.field`) — never swallowed, never converted to `nil` — and `AsOf()` still equals the pre-rebuild stamp even though the refused slice carries a good event whose `OccurredAt` is later than that stamp (placed after the bad event, so it never applies); the failure is therefore observable as (error returned, stamp not advanced). No read is involved | `store_test.go` (extend) and the `service.Store()` call shape documented in the PR body |
| `RB10` | **The publication rule is fixed in code, not configuration (`BR-66`)**: diff inspection records that the build-aside/swap rule is one behaviour of `Rebuild`, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; `services/reporting` gains no configuration key | diff inspection recorded in the implementation PR body; `services/reporting/**`, `deploy/**`, `docs/devops/**`, `docs/operations/**` — no configuration source may carry the rule |
| `RB11` | **One store today, the persisted-store rule recorded, nothing else moves (`BR-66`, `AC-RPT-10`)**: `services/reporting/` still holds exactly one store (`internal/store/store.go`) with no `postgres.go`/`pgstore` and no SQL-driver import; `services/reporting/migrations/000002_schema.up.sql:19-56` is byte-identical and no migration file is added; LLD 35.2 and `docs/architecture/services/reporting.md` section 9 keep the staging-plus-one-transaction rule the future persisted store must meet. This is the "both stores" coverage: the in-memory store is guarded by `RB1`-`RB9`, and the persisted store, which does not exist at this head, carries a recorded rule and a diff gate rather than a phantom test | diff inspection in the implementation PR body; `services/reporting/internal/store/*`, `services/reporting/migrations/**`, `docs/architecture/lld.md` section 35.2, `docs/architecture/services/reporting.md` section 9 |
| `RB12` | **Existing reporting guards and gates stay green untouched (`AC-RPT-10`) — re-run, no edit**: the four rebuild guards (`store_test.go:63`, `:142`, `:192`, `:273`), the range-cap guards (`:365`, `:383`, `:413`, `:457`), the service guards (`service_test.go:18`, `:46`, `:105`, `:127`, `:160`), the handler guards (`handler_test.go:59`, `:108`, `:131`, `:189`, `:239`), and the perf guard (`perf_test.go:97`) pass; `script/contract-check.sh`, `script/openapi-route-check.sh`, and `script/catalogue-coverage-check.sh` stay green; no contract, catalogue, schema, or migration change appears | the whole `services/reporting` suite plus the three gates — no assertion edit permitted |
| `RB-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build and records the before/after pair in `docs/testing/evidence/642/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping it
to covered only when the guard passes. The existing clean-rebuild rows,
the range-cap and report guards, the contract/catalogue gates, and the
perf read are covered **by re-run today** where their pins exist and pass
— they must keep passing untouched — but the slice as a whole stays
incomplete. The Go suites were not re-run in this worktree (docs-only
branch); they are the unchanged baselines the `go-build (reporting)` CI
job last ran, and the implementation PR runs them.

| Item | Required guard | Guard |
|---|---|---|
| `AC-RPT-8` — given a read model already serving rows, when a later rebuild meets an event it cannot project mid-stream, then the rebuild returns today's `VALIDATION_FAILED` naming the offending field with today's sentence, every report answers the rows, row order, and `asOf` it served before, the per-subscription offsets and the seen-id record are unchanged, and a never-applied store keeps its empty pre-rebuild state (traces to `FR-RPT-1`..`FR-RPT-4`, `FR-RPT-5`, `BR-66`) | L1 acceptance: the mid-stream bad-event case on a served store, the never-rebuilt case, the offset/stamp equality, and the unchanged refusal | **Pending** — `RB1`, `RB2`, `RB3`, `RB9`; today's opposite is the in-place clear at `services/reporting/internal/store/store.go:227-235` with the early return at `:239` |
| `AC-RPT-9` — given a rebuild that is replaying or has aborted, when any report is read, then the read answers one complete set — the pre-rebuild set until the swap, the post-rebuild set after it — never an empty or partial set, and the `asOf` belongs to that same set (zero only on a store that never applied an event); the read is never refused and never blocked for longer than the swap (traces to `FR-RPT-1`..`FR-RPT-4`, `FR-RPT-6`, `BR-66`) | L1: the concurrent-read-to-two-snapshots case under `-race` and the per-set `asOf` agreement | **Pending** — `RB4`, `RB7`; today's reads take the same mutex the rebuild releases mid-flight (`store.go:479`, `:534`, `:560`, `:633`), so a read can observe the half-built set |
| `AC-RPT-10` — given a slice whose events all project, when the rebuild completes, then every report and the offset record are exactly today's clear-and-replay output and re-applying a replayed event stays a no-op; the slice carries the mid-stream bad-event guard, the offset-record guard, and the byte-identical-success guard, while the existing rebuild and range-cap guards stay green and `contract-check` stays green; no contract, schema, route, desk surface, catalogue key, or print rule changes (traces to `FR-RPT-1`..`FR-RPT-4`, `FR-RPT-7`, `BR-66`; evidence condition) | L1: the success comparator, the idempotency re-run, and the observable-error pair; LC: the contract gate; diff gate: no schema, route, or configuration change | **Covered by re-run today for the idempotency and existing rebuild/range-cap guards and the contract/catalogue gates (`RB6`, `RB12`), and pending the success comparator, the observable pair, the one-store gate, and the evidence row (`RB5`, `RB8`, `RB9`, `RB11`, `RB-E1`)** |
| `FR-RPT-5` — a rebuild that aborts publishes nothing, so every report keeps its last good rows: the refusal returned is today's, the four reports and the offset/seen record are the pre-rebuild values, a never-applied store keeps its empty state and never invents a fresher stamp, and a retry replays from the same record (requirements 36.3) | L1 acceptance: `RB1`, `RB2`, `RB3`, `RB9` | **Pending** — `RB1`, `RB2`, `RB3`, `RB9` |
| `FR-RPT-6` — a report read answers one complete set, never a partial one, and is never refused for staleness: the answer is the pre-rebuild set until the swap and the post-rebuild set after it, the `asOf` belongs to that same set, the swap happens in one critical section, and an aborted rebuild leaves a reader the pre-rebuild set with its older stamp (requirements 36.3) | L1 acceptance: `RB4`, `RB7` | **Pending** — `RB4`, `RB7` |
| `FR-RPT-7` — a successful rebuild stays today's output, and a failure is observable through the rebuild call: the four reports and the offset record are exactly the current clear-and-replay output, re-applying a replayed event is a no-op, the operator sees the failure through the returned refusal and the unchanged last-good `asOf`, and no read route, response field, status field, or new operation reports rebuild state (requirements 36.3) | L1 acceptance: `RB5`, `RB8`, `RB9`; re-run: `RB6`, the existing guards in `RB12` | **Covered by re-run today for the idempotency and existing rebuild guards (`RB6`, `RB12`, `store_test.go:142`, `:273`) and pending the success comparator, the never-through-a-read case, and the observable pair (`RB5`, `RB8`, `RB9`)** |
| `BR-66` — a rebuild publishes only a fully replayed read model and an aborted rebuild changes nothing the desk can read; the candidate is built apart and installed in one swap; the failure returns today's refusal while the published projections, offsets, and `asOf` keep their values; a read answers one complete set and is never refused; a successful rebuild is exactly today's output; the failure is observable through the rebuild call, never through a read; the rule is fixed code, never per-hotel configuration (business rules section 8) | L1 acceptance + diff gate + evidence: `RB1`-`RB5`, `RB7`-`RB11`, `RB-E1` | **Pending** — `RB1`-`RB5`, `RB7`-`RB11`, `RB-E1`; today's breach is the in-place clear at `store.go:227-235` |
| `FR-RPT-1`..`FR-RPT-4` (MVP rows, unchanged) — occupancy, revenue, daily sheet, housekeeping still promise the same rows and `asOf` | L1 acceptance: the existing report guards unchanged, plus the success comparator on all four | **Covered by re-run today for the rows themselves (`RB12`, `store_test.go:63`, `:273`, `service_test.go:18`, `:46`, `handler_test.go:59`, `:131`, `perf_test.go:97`) and pending the whole-slice comparator (`RB5`)** — the MVP guard slots in `traceability-matrix.md` section 1 stand unchanged and may not cite this slice |
| `NFR-PERF-1` / `NFR-PERF-2` (unchanged) — a read takes only the mutex it already takes and never waits for the replay; the rebuild's projection cost is the same work as today | L2 PERF: the unedited two-year perf guard, plus the `RB4` proof that the swap is the only rebuild-held lock | **Covered by re-run today** — `RB12`; `perf_test.go:97` and the `perf-reporting-variant` CI job must stay green unedited; a read wait introduced by the change fails the row |
| `NFR-CON-1` / `NFR-CON-2` (unchanged) — the mutex still guards every read and write, and the rebuild stays the single writer; concurrent rebuild calls are not serialised by this change | L1: the `-race` run and the unchanged mutex/`Apply` order | **Covered by re-run today** — `RB4`, `RB12`; `store.go:200-201`, `:226-236`, `:479`, `:534`, `:560`, `:633`; an unlocked read or a second writer fails the row |
| `NFR-I18N-1` (unchanged) — no sentence is added or changed; a failed rebuild reuses today's per-field catalogue sentences | Behaviour check: the catalogue byte-identical and the existing messages sample green | **Covered by re-run today** — `RB12`; `services/reporting/internal/messages/*`, `script/catalogue-coverage-check.sh`; a new key fails the row |
| `NFR-RPT-1` / `BR-62` (unchanged) — the 730-night cap and its before-the-lock refusal keep their behaviour | L1: the range-cap guards re-run with no edit | **Covered by re-run today** — `RB12`; `store_test.go:365`, `:383`, `:413`, `:457`, `service_test.go:105`, `:127`, `:160`, `handler_test.go:189`, `:239` |
| Contract and LC | Real delta: no contract file, token, operation, response field, catalogue key, schema, or migration changes; `contract-check`, `openapi-route-check`, and `catalogue-coverage-check` stay green | **Covered by re-run today** — `RB12`; `contracts/**`, `script/contract-check.sh`, `script/openapi-route-check.sh`, `script/catalogue-coverage-check.sh`; a contract change here is a re-tier finding (LLD 35.5, 35.7) |
| No-configuration and no-migration gate | Real delta: the publication rule is one code behaviour carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration is added and the migrated tables are untouched; one store remains | **Pending diff gate** — `RB10`, `RB11`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-66) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-RPT-5`..`FR-RPT-7` are behaviour-scoped additions outside the counted capability set and no NFR is added (requirements 36.2, 36.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`RB-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/642/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 35.6](../architecture/lld.md#356-verification-plan) and `docs/architecture/services/reporting.md` [section 7](../architecture/services/reporting.md#7-operations)) |
|---|---|---|
| L1 Reporting store | `RB1`, `RB2`, `RB3`, `RB4`, `RB5`, `RB7`, `RB9`, and the `RB11` run half | `cd services/reporting && go test ./internal/store/...` (run `-race` locally for `RB4` and record the output in the PR body) |
| L1 Reporting service | `RB6`, `RB7` (service half), `RB12` | `cd services/reporting && go test ./internal/service/...` (the perf case runs here too; its 5 s bound is asserted only with `REFERENCE_HOST=1`) |
| L1 Reporting handler | `RB8`, `RB12` | `cd services/reporting && go test ./internal/handler/...` |
| L2 PERF | The unedited two-year guard (`RB12`) | the same `go test ./...` in `services/reporting`; CI `perf-reporting-variant` |
| LC contract | `RB12`: contracts byte-identical and both gates green | `script/contract-check.sh`, `script/openapi-route-check.sh` |
| Gates | Catalogue parity, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

LLD 35.6 also names the build/vet/format gate: `cd services/reporting &&
go build ./...`, `go vet ./...`, and `gofmt -l .` (no output). CI jobs
that must be green on the implementation PR: `go-build (reporting)`,
`contract-check`, `migrate-check`, `perf-reporting-variant`, and `ci`
(catalogue, links, harness conventions). `PERF` CI stays as it is; the
change moves no timing target.

### Execution order

1. `RB1` first — the issue's own acceptance test: a served store, a bad
   event mid-stream, the four reports and `Offsets()` still the captured
   values. It fails on today's clear-first path and is the narrowest proof
   the candidate is separate.
2. `RB2` and `RB3` — the resume record, the last-good stamp, and the
   never-rebuilt state, so an abort cannot publish a partial offset record
   or invent a stamp.
3. `RB4` under `-race` — the one-complete-set read. It fails if any read
   can observe the empty or half-built candidate, which is what the swap
   must prevent.
4. `RB5` and `RB7` — the success comparator against the live-ingest path
   and the per-set `asOf` agreement, so the swap cannot change a row, an
   order, a zero-fill, a total, a group, a list, or a stamp.
5. `RB8` and `RB9` — the failure stays off the read path and on the
   returned error, with the last-good stamp as the second signal.
6. `RB10` and `RB11` diff gates — no configuration source, one store, the
   persisted-store rule recorded, no migration.
7. The re-runs and gates (`RB6`, `RB12`), the isolated-lab reproduction
   and the before/after pair (`RB-E1`), then the `test-report.md` row and
   the re-pin of section 4 at the merged head.

### Entry criteria

1. The #642 T2 spec set (product section 28, requirements section 36,
   `BR-66`, LLD section 35, the reporting service page sections 3/4/9, and
   this document) is on disk, and the `spec-reviewer` has posted
   `SPEC-GATE PASS` on #642 or the spec stack (#750 -> #751 -> #752 ->
   this PR).
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the decided seam, rule, and sentence
   are the ones on disk.
3. The #588/#600/#601/#627/#630/#631/#634/#635/#639/#640/#641/#643/#646/#647/#648
   slices are merged, so the report, range-cap, and desk pins this slice
   re-runs are the real baseline.
4. The build under test is identified by commit and the lab seed matches
   `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).
5. Baseline state: the Reporting Go suite is green at the implementation
   PR's base (`go-build (reporting)`), including the unedited rebuild,
   range-cap, and two-year perf guards.

### Exit criteria

1. `RB1`, `RB2`, and `RB3` exist and pass: a mid-stream refusal on a
   served store leaves all four reports, `Offsets()`, and `AsOf()` at the
   captured pre-rebuild values; a retry replays from the same record; a
   never-rebuilt store keeps zero rows and a zero stamp.
2. `RB4` passes under `-race`: every individual read during a rebuild is
   exactly that report's pre-value or post-value with the matching
   `asOf`, never an empty or partial set.
3. `RB5` and `RB7` pass: the rebuilt four reports, row order, zero-filled
   dates, totals, sheet groups, housekeeping list, `asOf`, and offsets
   equal the live-ingest output for the same slice, and the four reports
   agree on the set's stamp.
4. `RB8` and `RB9` pass: the failed rebuild returns today's `OpError` and
   never advances the stamp, the four reads still answer `200` with the
   pre-rebuild rows, and no route, response field, or status field reports
   rebuild state.
5. `RB10` and `RB11` are recorded: no configuration source carries the
   rule, one store remains, the migrated tables and no new migration are
   the same, and the persisted-store rule stays recorded in LLD 35.2 and
   the reporting page section 9.
6. `RB6` and `RB12` are green with their assertions untouched — no
   existing rebuild, range-cap, report, handler, or perf assertion moved,
   no contract/catalogue file changed, and both contract gates plus the
   catalogue gate pass.
7. `RB-E1` is recorded: the `docs/testing/evidence/642/README.md`
   before/after pair and the `docs/testing/test-report.md` row.
8. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section 4
   at the merged head and flipped the rows.
9. Open failures are filed as issues with FR/NFR ids; no `risk-medium`
   failure is waived without owner approval.

### Negative controls

A guard that only asserts "`Rebuild` returns an error" or only checks a
row count is insufficient.

- `RB1` asserts the **four reports' captured rows, row order, and `asOf`
  plus `Offsets()`**, not only that the error is non-nil, so a rebuild
  that still clears the set and then reports the bad event fails.
- `RB1` places the bad event **in the middle** of the slice, with good
  events on both sides, so a guard that aborts on the first event — before
  any row is published — cannot pass; and the bad event is driven through
  `Rebuild`, not `Apply` (the existing case's gap).
- `RB3` starts from a **never-rebuilt** store, so an implementation that
  only restores non-empty sets and mishandles the empty one fails.
- `RB4` compares each report's observed value against its two **fully known** pre/post values, so an empty set, a mid-replay subset, or pre rows carrying the post stamp (or the reverse) matches neither; the loop still allows a swap between two different reports' reads, because a single read — not four sequential reads — is the unit the never-partial rule protects.
- `RB5` compares the rebuild against the **live-ingest path** for the same
  slice, so a row, order, zero-fill, total, group, list, stamp, or offset
  change fails even if a row count still matches.
- `RB7` asserts the stamp is non-zero after a non-empty rebuild and equal
  across all four reports, so a cleared stamp or a per-report copy fails.
- `RB8` asserts the response **key sets are byte-identical** and the
  status is `200`, so a `200` with a rebuilt-status field, a `500`, or a
   refuse-on-stale read fails.
- `RB9` asserts the returned `OpError` equals the same bad event's `Apply`
  refusal (code, status, message, `details`), so a swallowed error or a
  newly minted code fails.
- `RB10` fails on the rule being read from `process.env`, an environment
  placeholder in a deployment file, a compose override, a runbook step, or
  a per-hotel setting.
- `RB11` fails on a second store, a SQL-driver import, a new migration, an
  edited migrated table, or a lost persisted-store rule sentence.
- `RB6` and `RB12` fail on a loosened or rewritten assertion, not only on
  a red test: the existing cases are the "nothing changed" proof and may
  not be edited.

## 6. Owner verification cases (RB-1..RB-6)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
read model, `api reporting <Operation>` bodies, and the rebuild job's
error output where the lab wires it). Steps are the same for each case
unless stated: apply the hotel config, sign in as `owner`, act as
described, then read the reply.

| Case | Setup | Expected |
|---|---|---|
| `RB-1` | Read `OccupancyReport`, `RevenueSummary`, `DailySheet`, and `HousekeepingReport`; run one successful rebuild of the seeded slice; read all four again | Both passes answer the same rows, row order, zero-filled dates, totals, sheet groups, and housekeeping list with the same `asOf`; nothing the desk reads changes |
| `RB-2` | With the read model already serving rows, run a rebuild whose slice contains one bad event in the middle; read all four reports immediately after | The rebuild job reports one `VALIDATION_FAILED` refusal naming the bad field; all four reports still answer the rows and `asOf` they answered before the rebuild — no zeros, no partial set |
| `RB-3` | After `RB-2`, retry the rebuild with the corrected slice; read all four reports | The retry replays from the same offset record and produces the corrected rows; the refusal is gone and no event is skipped or double-counted |
| `RB-4` | Restart the service so the read model has never applied an event; run a rebuild whose slice contains a bad event; read all four reports | The four reports answer zero rows with a zero `asOf`; the failed rebuild does not invent a fresher stamp |
| `RB-5` | While a rebuild runs, read the four reports repeatedly from another desk session; then read them after it finishes | Every answer is the complete pre-rebuild set with the pre-rebuild `asOf` or the complete post-rebuild set with the post-rebuild `asOf`; no answer is empty or partial, and no read is refused for staleness |
| `RB-6` | Inspect `deploy/`, the compose file, the runbooks, and a running Reporting service's environment; list `services/reporting/migrations/`; run `script/contract-check.sh`, `script/openapi-route-check.sh`, and `script/catalogue-coverage-check.sh` | Nothing configures the rebuild publication rule; one in-memory store remains and no migration is added; both contract gates and the catalogue gate pass |

## 7. Evidence rule RB-E1

The implementation PR records, in `docs/testing/evidence/642/README.md`
(created by that PR, same capture method as the #588, #627, #630, #635,
and #641 records), one before/after pair plus the finding, because the
issue's scope asks for the tests and acceptance `AC-RPT-10` carries the
evidence condition:

- **The finding, on the pre-fix build from an isolated compose lab.**
  Seed the read model with a completed rebuild, then run a rebuild whose
  slice refuses one event mid-stream; read `OccupancyReport` and
  `RevenueSummary` immediately after. Record the observed rows (zero or
  short) and the `asOf` the partial replay left, beside the code pins
  (`services/reporting/internal/store/store.go:227-235` the clear,
  `:239` the early return, `:479`/`:534`/`:560`/`:633` the read locks).
- **The after state on the fixed build.** The same seed and the same bad
  slice: the rebuild reports the same `VALIDATION_FAILED` refusal, and the
  four reports answer the pre-rebuild rows with the older `asOf`; a
  successful rebuild then serves the same rows as the live-ingest path.
  Record both halves for `RB1` and `RB5`.
- Also record the go test output for the `-race` `RB4` run and the three
  gate scripts.

The record includes the commit under test, the compose file and command
used, and the raw outputs; it does not quote a summary from an earlier
run. `qa-lead` adds the `docs/testing/test-report.md` row when the PR
merges.

## 8. Slice status and the re-pin rule

The slice is **not complete** at this spec head. `RB1`-`RB12` are missing
obligations the implementation PR satisfies — tests it creates (`RB1`-
`RB5`, `RB7`-`RB9`), diff gates it records (`RB10`, `RB11`), and the two
re-runs (`RB6`, `RB12`) — `RB-E1` is unrecorded, and eight rows carry a
re-run-today half (the unchanged report, PERF, concurrency, i18n, and
range-cap rows, the contract/LC row, and the re-run halves inside
`AC-RPT-10` and `FR-RPT-7`). It completes when the implementation PR
merges with every `RB*` guard green, `RB-E1` recorded, the pins refreshed
where the implementation moved a line, and `qa-lead` re-pins section 4 at
the merged head. The MVP coverage count in `traceability-matrix.md` stands
unchanged at 57/57 because this slice adds no MVP capability. The slice
rows live in `traceability-matrix.md` section 28.

No guard in this spec is invented: every existing pin above was read on
this spec branch head, and every missing guard is named as an obligation
the implementation PR must satisfy, never claimed as complete before it
exists and passes.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1208
