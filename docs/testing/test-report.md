# Test report — traceability backfill (#182)

Status: active. First recorded QA pass for the hotel-mgmt MVP,
written for issue #182. It records the 5 directly-implemented
guards (all passing), the 4 capability gaps handed to follow-up
issues (#189–#192), and the real measured PERF numbers with
environment labels. Matrix state after this slice: 53/57 cells
filled with passing guards; 4 cells point at their follow-up
issues (see `traceability-matrix.md` Coverage footer).

## 1. Guards implemented in this slice

| Cell | Guard (test location + case) | Result |
|---|---|---|
| FR-RES-4 walk-in booking | `services/reservations/internal/handler/handler_test.go` `TestWalkInSameDayBookingConfirmedAndOnArrivals` + fixture `CreateReservation-walk-in.json` | Pass (CI go-build reservations) |
| FR-ADM-3 room setup | `services/rooms/src/server.test.ts` `defines rooms as owner and shows them in inventory and availability` | Pass (CI node-build rooms, 13/13) |
| FR-CUS-2 stay policies | `services/admin/src/server.test.ts` `saves stay times and cancellation wording and shows them back` + `apply-hotel-config.sh` wording verification | Pass (CI node-build admin, 17 pass + 1 pre-existing pg skip) |
| NFR-PERF-1 desk response | `script/e2e-perf-check.sh` timed run (section 2) | Pass, variant-recorded (CI e2e-single-host) |
| NFR-PERF-2 report response | `services/reporting/internal/service/perf_test.go` `TestPerfTwoYearReportsRecordTimings` (section 3) | Pass, variant-recorded (CI perf-reporting-variant) |

Every FR/NFR keeps at least one passing guard; `script/contract-check.sh`
and all per-stack CI suites are green on the linked PR.

## 2. NFR-PERF-1 — timed desk checks (CI variant)

- Method: `script/e2e-perf-check.sh` runs after the installer in the
  `e2e-single-host` job. Seed: 50 PERF rooms, PERF rate plan, one
  quoted total, 47 pre-booked units + 1 setup stay + 2 timed check-ins
  (full 50-unit book for tonight), 5 signed-in staff with tokens
  rotated across the timed calls. Each named view/action timed with
  nanosecond clocks; bounds (2 s views, 3 s actions) asserted only
  with `REFERENCE_HOST=1`.
- Environment: `nproc=2 mem=8127864kB disk=10687MiB-avail
  label=ci-e2e-variant referenceHost=0` (GitHub-hosted runner, not the
  2*4*50 reference host — variant per the test strategy, never
  compared against single-host bounds).
- Source: run 40071918989, job `e2e-single-host` (120807026129).

Named views (bound 2000 ms on the reference host only):

| Operation | Measured (ms, 3 reps) |
|---|---|
| QueryCalendar (full-book range) | 34, 34, 34 |
| CheckSellableCount (50 units) | 33, 33, 33 |
| ListArrivalsDepartures (tonight) | 35, 35, 34 |
| GetFolioBalance (open folio) | 53, 48, 38 |

Named actions (bound 3000 ms on the reference host only):

| Operation | Measured (ms) |
|---|---|
| CheckIn (2 reps, fresh booking + room each) | 50, 36 |
| PostCharge (3 reps, folio with balance) | 39, 39, 42 |
| RecordPayment (2 reps, cash) | 43, 41 |
| CheckOut (2 reps, settled folios) | 43, 35 |

No bound was asserted on this run (`referenceHost=0`); the numbers
are recorded as the CI variant. Bound assertion on the 2*4*50
reference host is deferred to the owner POC-demo environment.

## 3. NFR-PERF-2 — standard reports on two years of 50-room data (CI variant)

- Method: `TestPerfTwoYearReportsRecordTimings` generates two years of
  50-room operating data as domain events (731 days, 2024-01-01 to
  2025-12-31, 126,050 events: availability baselines, reservations,
  stay check-ins/check-outs, room/extra charges, payments), folds them
  through the real `Rebuild` path, and times each standard report over
  the full window. Scale-correctness is asserted (row counts, spot
  occupancy, revenue totals, daily-sheet groups agree with the
  generated source rows); the 5 s bound is asserted only with
  `REFERENCE_HOST=1`.
- Note: the lab reporting service is in-memory with no production
  rebuild endpoint or dispatcher yet, so the run populates the read
  model via `Rebuild` (the same code path the unit rebuild tests
  cover) rather than SQL-seeding the `rpt_*` tables. The measured
  object is exactly what NFR-PERF-2 bounds: the standard-report read
  path over two years of 50-room data.
- Environment: `label=ci-e2e-variant go=go1.24.13 cpus=2
  mem=8128876kB disk=13335MiB-avail` (GitHub-hosted runner — variant,
  never compared against single-host bounds).
- Source: run 40071918989, job `perf-reporting-variant` (120807003314).

| Report | Measured | Window |
|---|---|---|
| Rebuild (126,050 events, for context) | 71 ms | — |
| OccupancyReport | 505 ms | 731 days × 1 type (731 rows) |
| RevenueSummary | 0 ms | 731 days (731 rows) |
| DailySheet | 5 ms | spot business date |
| HousekeepingReport | not timed — no read op exists yet | pending #191 |

## 4. Deferred to follow-up issues (no behaviour change in #182)

| Cell | Follow-up | Guard lands with |
|---|---|---|
| FR-GST-4 confirmation record | #189 `ProduceConfirmation` op | the op slice |
| FR-BIL-5 taxes and fees | #190 tax derivation | the tax slice |
| FR-RPT-4 housekeeping report | #191 read model + read op | the reporting slice (incl. its PERF-2 timing) |
| NFR-I18N-1 catalogue | #192 message catalogue | the catalogue slice |

## 5. How to reproduce

- NFR-PERF-1: bring up the lab per `docs/devops/deployment.md`
  (or `script/install.sh`), then run `script/e2e-perf-check.sh
  --base-url http://127.0.0.1`; on a 2*4*50 reference host add
  `REFERENCE_HOST=1` to assert the bounds, otherwise the run records
  a `ci-e2e-variant`-labelled run (override with `PERF_ENV_LABEL`).
- NFR-PERF-2: `go test -v -run TestPerfTwoYearReportsRecordTimings
  ./internal/service/` from `services/reporting` (add
  `REFERENCE_HOST=1` on the reference host to assert the 5 s bound).

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-251
