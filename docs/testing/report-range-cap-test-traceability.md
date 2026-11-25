# Report range cap test traceability (Refs #641)

Status: active. Testing spec for the T2 report-window span cap
([issue #641](https://github.com/MingChen1501/hotel-mgmt/issues/641),
audit finding P1 — `parseRange` checks a report window's shape and order
but never its span, and both range reports then walk every date in the
window under the store mutex, so one request such as
`0001-01-01`..`9999-12-31` loops over millions of dates while every
other report waits behind the same lock), owned by `qa-lead`. It maps
the change's done-conditions — `AC-RPT-5`..`AC-RPT-7`, owned by
`product-owner` in `docs/product/acceptance-criteria.md`
[section 24](../product/acceptance-criteria.md#24-reporting-date-ranges-carry-a-declared-span-cap-refs-641) —
the requirement `NFR-RPT-1`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 32](../requirements/mvp-requirements.md#32-reporting-date-ranges-carry-a-declared-span-cap-refs-641),
and the business rule `BR-62` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md) to their guards:
the pins that exist on disk at this spec head, the guard registry
`RPT1`–`RPT14`, and the evidence rule `RPT-E1`.

Written before the implementation PR. Every new guard in the registry is
a **named, missing obligation** at this head — `parseRange` has no span
check, no `maxReportRangeNights` constant exists, and the
`reporting.validation.date_range_span` key is absent from the catalogue
— so no row here marks a guard complete before it exists and passes, and
the slice is not complete until the implementation PR merges and
`qa-lead` re-pins every row at the merged head (the `#588 -> #599`
pattern). Section 1 states the tier and the no-change rules; section 2
cites what is on disk today and what it proves; section 3 names the
guards the implementation PR must create; section 4 is the traceability
map; section 5 is the test plan it must run; section 6 is the owner
verification cases; section 7 the evidence rule; section 8 the slice
status and the re-pin rule.

Companion specs: scope decision D-36 in
`docs/project/decision-log.md`
[the decision log](../project/decision-log.md) and risk R-17 in
`docs/project/risk-register.md` [the risk register](../project/risk-register.md);
the cap, the enforcement point in `parseRange`, the arithmetic, the
refusal shape, the per-flow diagram, the contract decision, and the
verification plan in `docs/architecture/lld.md`
[section 31](../architecture/lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641);
the planned delta on the reporting service page
(`docs/architecture/services/reporting.md`
[section 8](../architecture/services/reporting.md#8-delta--report-date-ranges-carry-a-declared-span-cap-refs-641),
with the failure edge in section 4 and the error row in section 6); the
date-window convention in `docs/technical/api-spec.md`
[section 1](../technical/api-spec.md); and the refusal in the taxonomy in
`docs/technical/error-handling.md`
[section 1.3](../technical/error-handling.md). Sibling tests this slice
must not disturb: the `traceability-matrix.md` MVP rows and sections
9–16 and 20–23 plus their registries
(`checkout-settlement-test-traceability.md` `S1`-`S12`,
`departure-release-test-traceability.md` `DR1`-`DR13`,
`arrival-reassign-test-traceability.md` `RR1`-`RR13`,
`booking-management-view-test-traceability.md` `BM1`-`BM16`,
`folio-write-verification-test-traceability.md` `FW1`-`FW13`,
`internal-error-envelope-test-traceability.md` `ERR1`-`ERR9`,
`body-bounds-test-traceability.md` `BND1`-`BND28`, and
`money-amount-bounds-test-traceability.md` `AMT1`-`AMT20`). This spec
implements no code, changes no guard, adds no catalogue key, and moves
no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2 (thin), confirmed by `product-owner` (acceptance criteria
  section 24), `business-analyst` (requirements section 32), and
  `architect` (LLD section 31): a caller-visible refusal on two
  Reporting read operations, with no new subsystem, dependency edge,
  data model, lifecycle state, endpoint, reader-visible surface, or
  error-code token. No ADR: ADR-0004 D1 keeps the shared envelope and
  its status mapping exactly as they are.
- One span cap for both range reports: **`dateTo` at most 730 nights
  after `dateFrom`, which is 731 inclusive dates.** It is the two-year
  window `NFR-PERF-2` documents and the existing perf guard generates
  (2024-01-01..2025-12-31), and the same number Rates already applies to
  a stay range (`services/rates/internal/store/store.go:254-255`,
  `:258-259` in the postgres store), so the two backends agree and no
  documented look-back is cut. The cap is one unexported store constant
  (`maxReportRangeNights = 730`), never an environment variable,
  deployment file, runbook step, or per-hotel setting (D-36).
- A wider window is refused with **exactly one HTTP 400** carrying the
  shared four-key envelope: `code: "VALIDATION_FAILED"`, `details`
  naming `dateTo`, a fresh `traceId`, and the plain
  `reporting.validation.date_range_span` sentence ("dateTo must be at
  most {max} nights after dateFrom.") with `{max}` rendered from the
  constant through `messages.Num` (`services/reporting/internal/messages/messages.go:129`),
  raised in `parseRange` as its last check — after the format and order
  refusals, after the handler's session and presence checks — and
  strictly before `s.mu.Lock()` at `services/reporting/internal/store/store.go:465`
  and `:520`, so a refused read takes no lock, walks no date, and reads
  no projection.
- **Nothing inside the cap changes.** Every accepted window keeps its
  rows, row order, zero-filled dates for dates without data, and
  `asOf`. `DailySheet` (one business date,
  `services/reporting/internal/store/store.go:542-545`) and
  `HousekeepingReport` (no range in its read, `:618`) stay untouched,
  and pagination stays out of scope.
- The cap is a **span, not a data window**: a window ending today, one
  that ended years ago, and one before any data exists are all served
  as long as their span is within the cap.
- No new token, no contract change: `VALIDATION_FAILED` is already
  enumerated in both request manifests
  (`contracts/http/OccupancyReport.json:43`,
  `contracts/http/RevenueSummary.json:42`), the bound is cross-field and
  therefore inexpressible in the two request schemas, and no
  schema, response shape, event, fixture, operation, or `openapi.yaml`
  copy moves (LLD 31.5). `script/contract-check.sh` and
  `script/openapi-route-check.sh` stay green without an edit.
- No schema, table, column, migration, stored value, event, or backfill:
  the reports are read-only projections. No configuration, deployment,
  environment, or runbook delta.
- No desk change: no view or route under `app/src` reaches
  `OccupancyReport` or `RevenueSummary`, so no screen, catalogue key
  beyond the one API-caller sentence, route, or print rule changes, and
  no UI contract section applies.
- No MVP row moves: the 57-row coverage count in
  `traceability-matrix.md` stands unchanged and no MVP `FR-*`/`NFR-*`
  row may cite this slice as its guard; the slice rows live in
  `traceability-matrix.md` section 24, and `NFR-RPT-1` is a requirement
  addition outside the counted MVP capability set.
- Change-level rollback is one revert: the constant, the comparison in
  `parseRange`, the catalogue key, and the guards fall back to today's
  shape-and-order-only validation, and every window the service
  accepted before is accepted again. No migration or data repair exists
  in either direction.
- **No transitional red at this spec head.** The branch is docs-only, so
  the code tree is the base the stacked spec PRs branched from. The
  Go suites were not re-run in this worktree as part of the spec work;
  they are the unchanged baseline the `go-build (reporting)` and
  `go-build (rates)` CI jobs last ran, and the implementation PR runs
  them.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is identical to the stacked spec PRs' base (the product,
architecture, requirements, and testing spec PRs touch `docs/` only).
They prove today's behaviour: a window's shape and order are checked,
its span never is; both range reads walk every inclusive date under one
mutex; and no over-cap guard, cap constant, or span sentence exists. The
implementation PR extends these in place with a `#641` note and never
deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/reporting/internal/store/store.go:440-453` | `parseRange` parses `dateFrom` (`:441`), refuses a malformed one naming the field (`:442`, `:446`), refuses `dateTo` before `dateFrom` naming `dateTo` (`:450`), and returns — no span comparison exists | `RPT5`-`RPT7`, `RPT9`: the span check is added as the last check in this helper; order must still answer first, so a reversed window keeps `error.validation.date_range_order` |
| `store.go:460-461`, `:515-516` | `Occupancy` and `Revenue` both call `parseRange` as their first statement and only then take the lock | `RPT5`: the shared helper is why one check covers both operations, and why "before any scan" is provable without a timing test |
| `store.go:465`, `:520` | `Occupancy` and `Revenue` take `s.mu.Lock()` after `parseRange` returns | `RPT5`: a test that holds `s.mu` and calls an over-cap read must still get the refusal; a check placed below the lock would block and fail the guard |
| `store.go:480`, `:523` | Both reports walk `for day := from; !day.After(to); day = day.AddDate(0, 0, 1)` inclusively under the lock; a 730-night span is 731 rows | `RPT3`: the at-cap boundary pair asserts the 731-date row count; `RPT4`: the huge window is refused before this loop |
| `store.go:30-32` | `validation(field, message)` builds an `OpError` with `Code: "VALIDATION_FAILED"`, `Status: 400`, and `Details: {"field": field}` | `RPT1`, `RPT2`, `RPT9`: the span refusal reuses this constructor, so `details.field` is `dateTo` by construction |
| `store.go:34` | `const dateLayout = "2006-01-02"` is the one named constant beside which the cap constant is declared | `RPT6`: `maxReportRangeNights` is one named constant, not an inline literal at the comparison site |
| `services/reporting/internal/service/service_test.go:31-42` | `TestReportWindowsAreValidated` drives only a malformed `dateFrom` and a reversed `RevenueSummary` window, both `VALIDATION_FAILED`; no wide window | `RPT7`, `RPT8`: extend beside it, keeping both existing assertions untouched; a reversed window asserts the order sentence and never the span sentence |
| `services/reporting/internal/service/service_test.go:16-29`, `:44-66` | Existing acceptance cases: `TestOccupancyReportServesRebuiltRows` (2 nights, occupied 1 available 1) and `TestRevenueSummaryAndDailySheetServeRebuiltRows` (one revenue row per date, daily-sheet arrivals) | `RPT3`: the at-cap guard reuses this seeded service and asserts the same row identity; `RPT12` keeps both cases unedited |
| `services/reporting/internal/handler/handler_test.go:106-123` | `TestReportingAuthAndValidation`: missing token → 401 `UNAUTHENTICATED`, reversed window → 400 `VALIDATION_FAILED`, missing `businessDate` → 400; no wide window and no envelope-key assertions | `RPT1`, `RPT2`, `RPT4`: the HTTP guards assert the exact four-key envelope, the sentence, `details.field`, a non-empty `traceId`, and no rows; `RPT8`/`RPT12` keep this case unedited |
| `services/reporting/internal/handler/handler.go:116-134` | `authed` answers `UNAUTHENTICATED` before any field is read | `RPT8`: a missing token still answers 401 before the span rule, so no unauthenticated caller learns the cap |
| `handler.go:136-145`, `:162-170` | Both range routes refuse a missing `dateFrom`/`dateTo` before the service call (`error.validation.date_from_required` / `date_to_required`) | `RPT8`: presence refusals keep their sentence and field; `RPT1`/`RPT2` drive the span rule past them |
| `handler.go:38-45` | `writeOpError` renders one envelope with `code`, `message`, `details`, and a fresh `traceId` | `RPT1`, `RPT2`, `RPT4`: every refusal assertion reads these four keys; a missing or duplicated answer fails |
| `services/reporting/internal/messages/en.json:49-51` | The window sentences: `:49` `date_from_format`, `:50` `date_to_format`, `:51` `date_range_order`; there is no `reporting.validation.date_range_span` | `RPT10`: add one key beside `date_range_order`; the pre-existing sentences stay byte-identical |
| `messages/en.json:49-51`, `messages/vi.json` | The canonical catalogue carries the same reporting keys at the same lines and the same missing span key; `messages/vi.json` carries the exact en key set with matching placeholders (`script/catalogue-coverage-check.sh`) | `RPT10`: add the key to the canonical file, the byte-identical Reporting mirror, and `messages/vi.json` in the same change |
| `services/reporting/internal/messages/messages_test.go:20-51` | `TestSampledMessagesRenderByteIdentical` pins every sampled envelope sentence, including `error.validation.date_range_order` (`:39`); no span row | `RPT10`: add one sample row pinning "dateTo must be at most 730 nights after dateFrom." with `{max}` rendered through `messages.Num(730)` |
| `services/reporting/internal/messages/messages.go:119`, `:129` | `Text` and `Num` are the catalogue renderers; `Num` applies locale digit grouping | `RPT10`: the new sentence renders `{max}` through `Num(maxReportRangeNights)`, never a pasted `730` |
| `services/reporting/internal/service/perf_test.go:97`, `:99-101` | `TestPerfTwoYearReportsRecordTimings` generates exactly 731 dates (2024-01-01..2025-12-31) and asserts occupancy rows (`:169-170`) and revenue rows (`:199-200`) | `RPT3`: this guard is the acceptance evidence that the documented two-year window sits inside the cap and must stay green unedited |
| `services/reporting/internal/store/store_test.go:61-138` | `TestRebuildMatchesSourceRows` pins occupancy (`:67-88`) and revenue (`:88-101`) row identity on short windows from the shared `seedEvents` fixture (`:20-37`) | `RPT3`: the at-cap boundary pair can reuse this fixture; `RPT9` adds the store-level refusal beside it |
| `services/reporting/internal/store/store.go:542-545`, `:618` | `Sheet` is a one-date read and `Housekeeping` carries no range; neither calls `parseRange` | `RPT12`: both stay green with no edit, which proves the cap did not leak into the one-date and no-range reads |
| `services/rates/internal/store/store.go:248-256` | `Quote` counts the nights and refuses more than 730 naming `departureDate` with `rates.validation.quote_range` (`:254-255`); the postgres parity is `postgres.go:258-259` | `RPT11`: the Rates bound is the number Reporting adopts; the consistency guard pins it so neither side can drift alone |
| `contracts/http/OccupancyReport.json:13-16`, `RevenueSummary.json:13-16` | Both request manifests declare `dateFrom`/`dateTo` as independent dates with no `maximum`; a cross-field bound is inexpressible there | `RPT13`: both manifests stay byte-identical; the ceiling stays out of the schemas (LLD 31.5) |
| `contracts/http/OccupancyReport.json:43`, `RevenueSummary.json:42` | `VALIDATION_FAILED` is already published for a bad window in both manifests | `RPT13`: no new token, status, operation, or enum entry; both contract gates stay green |
| `script/contract-check.sh`, `script/openapi-route-check.sh` | The contract-shape and route gates; both green at this head | `RPT13` keeps both green with no `contracts/` change |
| `script/catalogue-coverage-check.sh` | The catalogue-coverage gate (CI `ci` job) | `RPT10` keeps it green with the one added key in all three catalogues |
| `grep -rn "date_range_span\|maxReportRangeNights" services/ contracts/ messages/ script/` | No span sentence and no cap constant exist anywhere in the tree at this head | The finding itself; `RPT1`-`RPT10` are the guards that would have caught it |
| `grep -rn "730" services/rates/internal/store/*_test.go` | Rates declares the 730-night bound but no store test exercises the boundary (only the catalogue sample at `messages/messages_test.go:37`) | `RPT11` creates the missing Rates boundary guard; test-only, no behaviour change |

## 3. Guard registry RPT1-RPT14 and the evidence rule RPT-E1

Fourteen obligations inside Reporting plus one cross-backend consistency
guard and the evidence record. `RPT1`-`RPT11` are **missing guards** the
implementation PR creates (over-cap refusal per operation at store and
HTTP level, the boundary pair, the finding's own window, the
before-the-lock proof, the constant, the order-first guard, the existing
refusal re-run, the store-level refusals, the catalogue sentence, and
the Rates consistency pair); `RPT12` re-runs the one-date and no-range
reads with no edit; `RPT13`-`RPT14` are re-runs and gates the same PR
proves; `RPT-E1` is the evidence record. A span guard is not complete on
the returned status alone: every refusal case also asserts the exact
four-key envelope, `code`, `details`, the exact catalogue sentence with
the rendered bound, a non-empty `traceId`, and no rows — a guard that
refuses everything at 400 would pass a status-only check.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `RPT1` | **`OccupancyReport` 731-night refusal (`AC-RPT-5`, `NFR-RPT-1`, `BR-62`)**: send `dateFrom: "2024-01-01"`, `dateTo: "2026-01-01"` (731 nights, 732 dates) and assert HTTP 400, a JSON body with **exactly** the four envelope keys, `code: "VALIDATION_FAILED"`, `details` deep-equal `{"field": "dateTo"}`, `message === messages.Text("reporting.validation.date_range_span", map[string]string{"max": messages.Num(730)})` ("dateTo must be at most 730 nights after dateFrom."), and a non-empty `traceId`; the body carries no `nights` key and no `asOf` | `services/reporting/internal/handler/handler_test.go` (extend) and `services/reporting/internal/service/service_test.go` (extend) |
| `RPT2` | **`RevenueSummary` 731-night refusal (`AC-RPT-5`, `NFR-RPT-1`, `BR-62`)**: the same window and the same five assertions on the revenue route, with no `days` key and no `asOf` | the same two suites |
| `RPT3` | **At-cap boundary pair, both operations (`AC-RPT-6`, `NFR-RPT-1`, `BR-62`)**: `2024-01-01`..`2025-12-31` (730 nights, 731 inclusive dates) is served on both operations — exactly 731 rows, the same dates and row order, the same occupied/available counts and room/extra totals as the existing seeded fixture, zero rows for dates without charges, and a non-zero `asOf`; `2024-01-01`..`2026-01-01` (one night more) is refused exactly as `RPT1`/`RPT2` describe. The pair sits on one seeded store so the at-cap answer is compared with today's answer, not only counted | `services/reporting/internal/store/store_test.go` (extend, beside `TestRebuildMatchesSourceRows:61`) and `services/reporting/internal/service/service_test.go` (extend) |
| `RPT4` | **The finding's own window (`AC-RPT-5`, `NFR-RPT-1`, `BR-62`)**: `0001-01-01`..`9999-12-31` answers the one `VALIDATION_FAILED` 400 envelope with `details.field` `dateTo`, the span sentence, a `traceId`, and no rows on **both** operations, at store and HTTP level — the case the issue names as the denial of service | the same suites |
| `RPT5` | **The refusal precedes the store lock and the per-date walk (`AC-RPT-5`, `NFR-RPT-1`)**: (a) a same-package store test calls `parseRange` directly with the 731-night window and with `0001-01-01`..`9999-12-31` and asserts the span `OpError` — so the rule lives in the shared helper both reads call first; (b) a no-scan guard takes `s.mu` in the test, then calls `Occupancy` and `Revenue` with the over-cap window on a bounded goroutine (`select` on the result vs. a short `time.After`, failure path only) and requires the refusal on both — a check placed below the lock would block and time out, and a correct implementation answers immediately, so the guard asserts placement, not speed; (c) the diff keeps both per-date loops below the lock (`store.go:480`, `:523`) | `services/reporting/internal/store/store_test.go` (same package; extend) plus the review gate in `RPT14` |
| `RPT6` | **One declared cap constant (`AC-RPT-7`, `NFR-RPT-1`, `BR-62`)**: the store package declares `maxReportRangeNights = 730` once; the guard reads the declaration (same package), asserts the value, asserts both range reads reach it through the one `parseRange`, and asserts the sentence renders the same value through `messages.Num` — a changed constant fails the guard at the sentence, the boundary pair, and the reflection of the value alike | `services/reporting/internal/store/store_test.go` (extend) and `services/reporting/internal/messages/messages_test.go` (extend via `RPT10`) |
| `RPT7` | **Order still answers first (`AC-RPT-5`, `BR-62`) — extend, no rewrite**: a reversed window (`dateTo` before `dateFrom`) keeps `VALIDATION_FAILED` naming `dateTo` with `error.validation.date_range_order` ("dateTo is before dateFrom.") and **not** the span sentence, so a negative span never borrows the cap refusal | `services/reporting/internal/service/service_test.go:31-42` (extend) |
| `RPT8` | **Missing and malformed windows keep today's answer (`AC-RPT-5`, `NFR-RPT-1`) — re-run, no assertion edit**: the handler presence refusals (`error.validation.date_from_required`/`date_to_required`), the format refusals (`date_from_format`/`date_to_format`), the missing-token `UNAUTHENTICATED`, and the missing-`businessDate` case keep their code, status, field, and sentence | `services/reporting/internal/handler/handler_test.go:106-123`, `services/reporting/internal/service/service_test.go:31-42`, `services/reporting/internal/messages/messages_test.go:20-51` — no edit to an existing assertion |
| `RPT9` | **Store-level refusal per operation (`AC-RPT-5`, `NFR-RPT-1`, `BR-62`)**: `st.Occupancy` and `st.Revenue` with the 731-night window and with the huge window each return a non-nil `*store.OpError` with `Code == "VALIDATION_FAILED"`, `Status == 400`, `Details["field"] == "dateTo"`, the span sentence, and nil rows, on the shared `seedEvents` fixture — the layer-independent proof beside `TestRebuildMatchesSourceRows` | `services/reporting/internal/store/store_test.go` (extend) |
| `RPT10` | **Catalogue sentence (`AC-RPT-5`, `AC-RPT-7`, `NFR-RPT-1`, `NFR-I18N-1`, `BR-62`)**: one sample assertion pins "dateTo must be at most 730 nights after dateFrom." with `{max}` rendered through `messages.Num(maxReportRangeNights)`; the key exists in `services/reporting/internal/messages/en.json`, the canonical `messages/en.json`, and `messages/vi.json` with the same `{max}` placeholder; the sentence names no stack trace, SQL, host, path, or internal class; `script/catalogue-coverage-check.sh` is green | `services/reporting/internal/messages/messages_test.go` (extend), the three catalogue files, and the gate |
| `RPT11` | **Rates' identical bound stays consistent (`AC-RPT-7`, `NFR-RPT-1`, `BR-62`)**: a test-only Rates store guard seeds a plan and nightly prices and asserts a 730-night stay is quoted and a 731-night stay is refused naming `departureDate` with `rates.validation.quote_range`; together with `RPT6`'s `730`, a drift on either side fails a guard. **Test-only: the Rates bound's behaviour is unchanged, which keeps the requirements' out-of-scope statement (no Rates bound change) intact** | `services/rates/internal/store/store_test.go` (test-only addition) and the `go-build (rates)` CI job |
| `RPT12` | **`DailySheet` and `HousekeepingReport` untouched (`AC-RPT-6`) — re-run, no edit**: both answer exactly as before; the one-date read and the no-range read never call `parseRange`, so no cap can reach them; the perf read over 50 rooms stays green | `services/reporting/internal/service/service_test.go:44-66`, `services/reporting/internal/handler/handler_test.go:129-180`, `services/reporting/internal/service/perf_test.go:264-290` — no edit permitted |
| `RPT13` | **Contract, envelope, and no-drift gate (`AC-RPT-7`, `NFR-RPT-1`) — re-run, no edit**: `contracts/` carries no change (both request manifests and every fixture byte-identical, `VALIDATION_FAILED` already enumerated), the envelope keeps its four fields, and `script/contract-check.sh` plus `script/openapi-route-check.sh` stay green — so no new code token, operation, response field, or event appears | `contracts/**` and both scripts — no edit permitted |
| `RPT14` | **No-configuration, no-write, and placement gate (`AC-RPT-5`, `AC-RPT-7`, `NFR-RPT-1`, `BR-62`)**: diff inspection records that (a) the cap is the one code constant, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; (b) the span check sits in `parseRange` after the order check and strictly above both `s.mu.Lock()` calls, with both per-date loops below the lock; (c) the change writes nothing (no projection, row, event, or idempotency record) and `DailySheet`/`HousekeepingReport` differ by no line | diff inspection recorded in the implementation PR body; `services/reporting/internal/store/store.go`, `deploy/**`, `docs/devops/**`, `docs/operations/**` — no cap edit permitted outside the constant |
| `RPT-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build and records the before/after pair in `docs/testing/evidence/641/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping
it to covered only when the guard passes. The existing shape/order
refusals, the unchanged in-cap answers, the one-date and no-range reads,
the Rates bound's current behaviour, and the contract gate are covered
**by re-run today** where their pins exist and pass — they must keep
passing untouched — but the slice as a whole stays incomplete. The Go
suites were not re-run in this worktree (docs-only branch); they are the
unchanged baselines the `go-build (reporting)` and `go-build (rates)` CI
jobs last ran, and the implementation PR runs both.

| Item | Required guard | Guard |
|---|---|---|
| `AC-RPT-5` — a window whose `dateTo` is more than 730 nights after `dateFrom` (including `0001-01-01`..`9999-12-31`) answers exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming `dateTo`, the `reporting.validation.date_range_span` sentence carrying the bound, a `traceId`), returns no `nights` or `days` rows, and is refused before the store lock and before any per-date loop; missing, malformed, and out-of-order windows keep their existing sentence and field (traces to `FR-RPT-1`, `FR-RPT-2`, `NFR-PERF-2`, `AC-RPT-1`, `AC-RPT-2`) | L1 acceptance: the over-cap refusal per operation at store and HTTP level, the huge window, the before-the-lock proof, and the unchanged shape/order refusals | **Pending** — `RPT1`, `RPT2`, `RPT4`, `RPT5`, `RPT7`, `RPT9`; today's opposite is `services/reporting/internal/store/store.go:440-453` (no span check) with the walks at `:480` and `:523` |
| `AC-RPT-6` — a window at exactly 730 nights (731 inclusive dates, the 2024-01-01..2025-12-31 shape) returns exactly today's rows — same dates and order, counts, totals, zero rows, and `asOf` — one more night is refused, and `DailySheet` and `HousekeepingReport` answer exactly as before (traces to `FR-RPT-1`, `FR-RPT-2`, `NFR-PERF-2`, `AC-RPT-1`, `AC-RPT-2`) | L1: the at-cap boundary pair compared against the same seeded fixture; re-run: the one-date, no-range, and two-year perf reads | **Covered by re-run today for the existing in-cap answers and the perf window (`RPT12`, `service_test.go:16-29`, `perf_test.go:97-101`), and pending for the explicit at-cap/one-night-past pair (`RPT3`)** |
| `AC-RPT-7` — one named constant states the 730-night cap and both range reports read it, no environment variable, deployment setting, or per-hotel configuration carries it, the store's guards pin the over-cap refusal for both operations, the at-cap acceptance, and the boundary pair beside the existing malformed and order guards; no desk, catalogue-key-beyond-the-sentence, route, print-rule, or contract-operation change, and `contract-check` stays green (traces to `FR-RPT-1`, `FR-RPT-2`, `NFR-PERF-2`, `NFR-I18N-1`) | L1: the constant and the guard set; LC: the contract gate; diff gate: no configuration source and no desk surface | **Covered by re-run today for the contract gate (`RPT13`), and pending for the constant and the full guard set (`RPT6`, `RPT1`-`RPT5`, `RPT9`, `RPT10`, `RPT14`)** |
| `NFR-RPT-1` — a report window is bounded by one declared 730-night span and refused before any store work when wider: one 400 envelope with `VALIDATION_FAILED` naming `dateTo`, the sentence with the bound rendered from the constant, a fresh `traceId`, no rows, and no lock taken or date walked; a 730-night window served exactly as today and one night more refused; the cap one constant equal to the Rates bound, carried by no configuration source; existing refusals and the one-date/no-range reads unchanged (requirements 32.3) | L1 acceptance: both operations, both ends of the boundary, the huge window, and the placement proof; re-run: contract and catalogue gates; diff gate: no configuration source | **Pending** — `RPT1`-`RPT11`, `RPT13`, `RPT14`; the constant is missing from `store.go:440-453`, and the shape to copy is `dateLayout` at `:34` |
| `BR-62` — a report window over `OccupancyReport` or `RevenueSummary` is bounded by one declared 730-night span (731 inclusive dates); a wider window is refused with the shared envelope and `VALIDATION_FAILED` naming `dateTo` and one plain sentence, in `parseRange` before the lock and before any per-date walk; an at-cap window returns today's rows, a shorter one is served unchanged, zero-filled dates stay, `DailySheet` and `HousekeepingReport` are untouched, and the cap is one code constant (business rules) | L1 acceptance + evidence: the refusal, the boundary pair, the untouched reads, and the lab record | **Pending** — `RPT1`-`RPT11`, `RPT14`, `RPT-E1`; today's breach is the missing span check at `store.go:440-453` |
| `FR-RPT-1` — occupancy report (MVP row, unchanged) | L1 acceptance: per-date counts against seeded bookings, plus the cap refusals on the same operation | **Covered by re-run today for the row itself (`RPT12`, `service_test.go:16-29`, `handler_test.go:57-104`, `store_test.go:61-88`) and pending the new refusals (`RPT1`, `RPT3`, `RPT4`, `RPT9`)** — the MVP guard slot in `traceability-matrix.md` section 1 stands unchanged and may not cite this slice |
| `FR-RPT-2` — revenue summary (MVP row, unchanged) | L1 acceptance: room/extra totals against seeded folios, plus the cap refusals on the same operation | **Covered by re-run today for the row itself (`service_test.go:44-56`, `store_test.go:88-101`) and pending the new refusals (`RPT2`, `RPT3`, `RPT4`, `RPT9`)** |
| Existing shape and order refusals stay unchanged | Behaviour check: missing, malformed, and reversed windows keep their code, status, field, and sentence; a reversed window never answers the span sentence | **Covered by re-run today** — `RPT8`, `RPT7`'s order half; pins `service_test.go:31-42`, `handler_test.go:106-123`, `messages_test.go:20-51` — an assertion rewrite fails the row |
| `DailySheet` and `HousekeepingReport` untouched | Behaviour check: the one-date and no-range reads answer exactly as before and never call `parseRange` | **Covered by re-run today** — `RPT12`; `store.go:542-545`, `:618`, `service_test.go:44-66`, `handler_test.go:129-180`, `perf_test.go:264-290`; a cap branch in either read fails the row |
| Rates bound consistency | Real delta: no Rates code or bound change; a test-only guard proves 730 accepted and 731 refused naming `departureDate` with `rates.validation.quote_range`, the same number Reporting adopts | **Pending** — `RPT11`; today's bound is `services/rates/internal/store/store.go:254-255` and `postgres.go:258-259`, with no boundary test (`messages_test.go:37` only samples the sentence) |
| Contract and LC | Real delta: no contract file changes, no code token or operation added, the envelope keeps its four fields, and both check scripts stay green | **Covered by re-run today** — `RPT13`; the files are `contracts/http/OccupancyReport.json`, `RevenueSummary.json`, `contracts/errors/envelope.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, or envelope-field change here is a re-tier finding (LLD 31.5, 31.7) |
| No-configuration gate | Real delta: the cap is one code constant, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no write path or stored state changes | **Pending diff gate** — `RPT14`; the fixed side is recorded in `docs/requirements/business-rules.md` section 9 (BR-62) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `NFR-RPT-1` is the only requirement addition | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard (requirements 32.2) |
| Evidence cross-reference (`RPT-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/641/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 31](../architecture/lld.md#316-verification-plan) and `docs/architecture/services/reporting.md` [section 7](../architecture/services/reporting.md#7-operations)) |
|---|---|---|
| L1 Reporting store | `RPT3`, `RPT4`, `RPT5`, `RPT6`, `RPT9`, and the `RPT12` store half | `cd services/reporting && go test ./internal/store/...` |
| L1 Reporting service | `RPT3`, `RPT7`, `RPT8` (service half), `RPT12` | `cd services/reporting && go test ./internal/service/...` (the perf case runs here too; its 5 s bound is asserted only with `REFERENCE_HOST=1`) |
| L1 Reporting handler | `RPT1`, `RPT2`, `RPT4`, `RPT8` (handler half), `RPT12` | `cd services/reporting && go test ./internal/handler/...` |
| L1 Reporting catalogue | `RPT10`, `RPT6`'s rendered-value half | `cd services/reporting && go test ./internal/messages/...` |
| L1 Rates store | `RPT11` (test-only consistency guard) | `cd services/rates && go test ./internal/store/...` |
| L2 NFR-PERF-2 | The unedited two-year perf guard over the at-cap window (`RPT3`'s evidence) | the same `go test ./...` in `services/reporting`; CI `perf-reporting-variant` |
| LC contract | `RPT13`: the contract byte-identical and both gates green | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`) |
| Gates | Catalogue parity, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `go-build
(reporting)`, `go-build (rates)`, `contract-check`, and `ci` (catalogue,
links, harness conventions). `PERF` CI stays as it is; the change moves
no timing target.

### Execution order

1. The span constant and the check in `parseRange` (`RPT6`, then the
   store-level `RPT9` guards) — the narrowest proof that the rule exists
   once for both operations.
2. The before-the-lock proof (`RPT5`) and the order-first extension
   (`RPT7`) — these fail if the check sits below the lock or borrows the
   wrong sentence, before any wider guard can mask it.
3. The boundary pair (`RPT3`) and the finding's own window (`RPT4`) —
   the "at the cap unchanged, one night more refused" proof.
4. The HTTP envelope guards (`RPT1`, `RPT2`) with the four-key,
   `details`, sentence, `traceId`, and no-rows assertions.
5. The catalogue key and its sample (`RPT10`), with
   `script/catalogue-coverage-check.sh` re-run straight after.
6. The Rates consistency guard (`RPT11`), then the re-runs and gates:
   `RPT8` (existing refusals untouched), `RPT12` (one-date and no-range
   reads), `RPT13` (contract byte-identical), `RPT14` (no configuration
   source, placement, no write).
7. The isolated-lab reproduction and the before/after pair (`RPT-E1`),
   then the `test-report.md` row and the re-pin of section 4 at the
   merged head.

### Entry criteria

1. The #641 T2 spec set (product section 24, requirements section 32,
   `BR-62`, LLD section 31, the reporting service page sections 4/6/8,
   the api-spec and error-handling deltas, and this document) is on
   disk, and the `spec-reviewer` has posted `SPEC-GATE PASS` on #641 or
   the spec stack (#722 -> #723 -> #724 -> this PR).
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the decided cap, sentence, and
   enforcement point are the ones on disk.
3. The #588/#600/#601/#646/#647/#648 slices are merged, so the desk and
   settlement pins this slice re-runs are the real baseline.
4. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).
5. Baseline state: the Reporting and Rates Go suites are green at the
   implementation PR's base (`go-build (reporting)`, `go-build (rates)`),
   including the unedited two-year perf guard.

### Exit criteria

1. `RPT1`, `RPT2`, `RPT4`, and `RPT9` exist and pass on both operations,
   each asserting the full envelope, the rendered sentence, `details`
   naming `dateTo`, a non-empty `traceId`, and no rows.
2. `RPT3` passes: 731 inclusive dates served with the same dates, order,
   counts, totals, zero rows, and `asOf`; one night more refused.
3. `RPT5`-`RPT7` pass: the refusal lives in `parseRange`, answers while
   the test holds `s.mu`, and the reversed window keeps the order
   sentence.
4. `RPT6` and `RPT10` pass: one declared `730` constant, the catalogue
   key in all three catalogues with the `{max}` placeholder, the
   rendered sentence pinned, and the catalogue gate green.
5. `RPT11` passes: the Rates 730/731 pair is refused/accepted as
   declared, and the Reporting constant is the same number.
6. `RPT8`, `RPT12`-`RPT14` are green with their assertions untouched —
   no existing refusal or acceptance assertion moved, no contract file
   changed, no one-date or no-range read moved, and no configuration
   source carries the cap.
7. `RPT-E1` is recorded: the `docs/testing/evidence/641/README.md`
   before/after pair and the `docs/testing/test-report.md` row.
8. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
9. Open failures are filed as issues with FR/NFR ids; no `risk-medium`
   failure is waived without owner approval.

### Negative controls

A guard that only checks `status === 400` or only sends the 731-night
window is insufficient.

- `RPT1`, `RPT2`, and `RPT9` each assert `code === "VALIDATION_FAILED"`
  **and** `details` deep-equal `{"field": "dateTo"}` **and** the exact
  catalogue sentence, so an answer that reuses another 400 refusal
  (`date_range_order`, `date_from_format`, `date_to_required`) fails.
- Each refusal case asserts the exact four-key envelope and a non-empty
  `traceId`, so a second, partial, or field-less answer fails.
- `RPT1`, `RPT2`, and `RPT4` assert the absence of the `nights`/`days`
  array and of `asOf`, so a `200` with an empty list cannot pass as a
  refusal.
- `RPT3` asserts the at-cap answer is the **same** rows as today, not
  only a row count, and sends one night more to the same fixture, so a
  guard that refuses the documented two-year window fails.
- `RPT4` sends `0001-01-01`..`9999-12-31`, so a guard that only bounds a
  window of a few thousand dates fails, while `RPT3`'s 731 dates keep
  the pair honest.
- `RPT5` holds `s.mu` before the call, so a span check placed below the
  lock blocks and the guard fails; `RPT5(a)` calls `parseRange` directly,
  so a second copy of the rule inside one operation fails the "one
  helper" obligation.
- `RPT7` asserts the order sentence and **not** the span sentence, so a
  reversed window that answers "too long" fails.
- `RPT10` asserts the rendered sentence with `{max}` filled from the
  constant, so a pasted literal that drifts from `messages.Num` fails.
- `RPT11` asserts both sides of the Rates boundary, so a Reporting value
  that drifts from 730 without touching Rates (or the reverse) fails.
- `RPT12`, `RPT13`, and `RPT8` fail on a loosened or rewritten
  assertion, not only on a red test: the existing cases are the
  "nothing changed" proof and may not be edited.
- `RPT14` fails on a cap read from `process.env`, an environment
  placeholder in a deployment file, a compose override, a runbook step,
  or a second constant.

## 6. Owner verification cases (RPT-1..RPT-8)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
read model, `api reporting <Operation>` bodies, and `psql` counts where
the lab persists). Steps are the same for each case unless stated: apply
the hotel config, sign in as `owner`, act as described, then read the
reply.

| Case | Setup | Expected |
|---|---|---|
| `RPT-1` | Read `OccupancyReport` and `RevenueSummary` with `dateFrom: "2024-01-01"`, `dateTo: "2025-12-31"` | Both answer as they always have: occupancy one row per night and type with the same counts, revenue one row per date with room and extra totals and zero rows for dates without charges, the same row order, and a non-zero `asOf` |
| `RPT-2` | Read both reports with `dateFrom: "2024-01-01"`, `dateTo: "2026-01-01"` (one night over), then with `"2024-01-01"`..`"2025-12-31"` again | The over-cap read answers exactly one HTTP 400 with `code: "VALIDATION_FAILED"`, `details` naming `dateTo`, the sentence "dateTo must be at most 730 nights after dateFrom.", and a `traceId`; no rows come back. The at-cap read still answers rows |
| `RPT-3` | Read both reports with `dateFrom: "0001-01-01"`, `dateTo: "9999-12-31"`; while that request is open, read `DailySheet` for today | The wide window answers the same one 400 immediately; the daily sheet answers normally at the same time, so the refused request blocks no other report |
| `RPT-4` | Read `OccupancyReport` and `RevenueSummary` with `dateFrom: "2026-11-03"`, `dateTo: "2026-11-01"` | Both keep the existing answer: `VALIDATION_FAILED` naming `dateTo` with "dateTo is before dateFrom." — not the span sentence |
| `RPT-5` | Omit `dateTo`; send `dateFrom: "02/11/2026"`; send `dateTo: "not-a-date"` | Each keeps its existing answer: `dateTo is required.`, `dateFrom must be a YYYY-MM-DD date.`, and `dateTo must be a YYYY-MM-DD date.`, all `VALIDATION_FAILED` naming the field |
| `RPT-6` | Read the `RPT-2` reply and open a desk screen that shows a request failure | The sentence names only the field and the bound, with `730` rendered by the catalogue (`1,234,567`-style digit grouping applies to larger bounds); the desk keeps its existing plain request-failed sentence and shows no code, status number, brace, or trace text |
| `RPT-7` | Ask Rates for a quote over a 730-night stay and over a 731-night stay (the existing `CheckRoomTypeSellability`/`QuotePrice` path) | 730 nights quotes as before; 731 nights keeps "Quote ranges longer than 730 nights are not supported in the skeleton." naming `departureDate` — no behaviour change, the same number Reporting now enforces |
| `RPT-8` | Inspect `deploy/`, the compose file, the runbooks, and a running Reporting service's environment; read the two request manifests; run `script/contract-check.sh`, `script/openapi-route-check.sh`, and `script/catalogue-coverage-check.sh` | No environment variable, deployment file, runbook step, or per-hotel setting carries the cap; both request manifests are byte-identical with `VALIDATION_FAILED` already listed; all three gates pass |

## 7. Evidence rule RPT-E1

The implementation PR records, in `docs/testing/evidence/641/README.md`
(created by that PR, same capture method as the #588, #627, #630, and
#635 records), one before/after pair plus the finding, because the
issue's scope asks for the tests and the requirements section 32.1 puts
the lab reproduction with the implementation:

- **The finding, on the pre-fix build from an isolated compose lab.**
  `OccupancyReport` and `RevenueSummary` accept a window far over the cap
  with no refusal, and the per-date walk runs under the store mutex. Use
  a bounded capture rather than a multi-hour run: send
  `0001-01-01`..`9999-12-31` (≈3.65 million dates), abort the capture on
  a short client timeout, and record that the reply was still being
  walked with no refusal, beside the computed date count and the code
  pins (`services/reporting/internal/store/store.go:480`, `:523`, locks
  at `:465`, `:520`). Record the same request for the 731-date window,
  which returns rows today.
- **After**, the same steps against the fixed build: the 731-night
  window (2024-01-01..2026-01-01) and the huge window both answer the
  one 400 envelope (`VALIDATION_FAILED`, `details.field` `dateTo`, the
  plain sentence with `730`, a `traceId`) with no rows, and the refusal
  returns immediately while a concurrent `DailySheet` read answers.
- **Plus the honest boundary control:** 2024-01-01..2025-12-31 (731
  inclusive dates) is served with the same rows, totals, order, and
  `asOf` as the pre-fix build, and one night more is refused — so the
  pair shows a bound rather than a blanket refusal.
- **Plus the unchanged control:** a short window, a window ending today,
  a window before any data exists, a reversed window (order sentence),
  missing and malformed fields (existing sentences), `DailySheet`, and
  `HousekeepingReport` all behave exactly as before.
- **Plus the cross-backend check:** the Rates 730/731 quote pair is
  unchanged and the Reporting constant is the same 730.
- **Plus the no-configuration check:** the diff of `deploy/`,
  `docs/devops/`, and `docs/operations/` carries no cap source
  (`RPT14`).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 14 rows mapped to `AC-RPT-5`..`AC-RPT-7`,
`NFR-RPT-1`, and `BR-62` plus the existing-row, untouched-read, Rates,
contract, configuration, MVP, and evidence boxes. Four rows are covered
by re-run today (the existing shape/order refusals, the one-date and
no-range reads, the contract/LC gate, and the in-cap answers named
inside `AC-RPT-6` — their pins exist and pass and must keep passing
untouched), and the rest are **pending** the implementation PR: the rows
whose guards are the registry `RPT1`-`RPT14`, the `BR-62` evidence row,
the MVP no-change gate, and `RPT-E1`. The slice is **not complete** at
this spec head. It completes when the implementation PR merges with
`RPT1`-`RPT14` green, the section 2 pins refreshed where the
implementation moved a line, `RPT-E1` recorded, and `qa-lead` re-pins
every row in section 4 with `file:line` at the merged head. No row in
this document may be flipped to covered while its guard is absent from
the tree or failing: a pending row is honest, a fabricated pin is a
phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1131
