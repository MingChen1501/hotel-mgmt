# Phase 6 QA A2 — PERF bounds run log (variant recording with hardware decision)

Status: active. QA activity A2 from the scoped independent-QA pass
(`docs/testing/phase-6-qa-plan.md`, section 2, Closes #264; this log
Closes #268), owned by `qa-lead`. NFR-PERF-1 timed desk checks
(`script/e2e-perf-check.sh`) and NFR-PERF-2 standard reports
(`TestPerfTwoYearReportsRecordTimings`, `services/reporting`) are
recorded here with their environment labels. No bound is asserted in
this batch: the reference host was not obtainable (section 0), so per
the QA plan (section 2, activity A2) and `test-strategy.md` L2 this is
a labelled variant run, never compared against single-host bounds.

## 0. Reference-hardware decision: variant-only (no bound asserted)

The reference host is the ADR-0001 single-host default (2 vCPU /
4 GB RAM / 50 GB disk, owner notation 2*4*50). Bounds (2 s named
views, 3 s named actions, 5 s standard reports) are asserted only
with `REFERENCE_HOST=1` on that host.

| Candidate | Facts | Qualifies? |
|---|---|---|
| QA machine (this host) | `nproc=8`, mem 30 GB, disk 117 GB avail | No — larger than 2*4*50 on every axis; faster timings here would not prove the bounds |
| CI runners (this batch, sections 2–3) | `nproc=4`, mem ~16 GB (`16373452kB` / `16372436kB`), disk ~85 GB avail | No — not the 2*4*50 reference host |
| Owner POC-demo environment | per `test-report.md` [sections 3–4](test-report.md), bound assertion deferred there | Not obtainable for this batch |

**Decision: reference host NOT obtainable → variant-only recording.**
Both runs below carry `label=ci-e2e-variant` with `referenceHost=0`;
their numbers are recorded, never compared against single-host
bounds. Bound assertion stays deferred to the owner POC-demo
environment, and QA-plan exit criterion 4 is met in its variant form
(explicitly recorded as variant; owner acknowledgement via reviewer
APPROVE on the PR that ships this log).

Local-harness note: this QA machine provides neither `docker` nor the
Go toolchain, so no local `e2e-perf-check.sh` or Go-test run was
possible here. The sanctioned variant path per strategy L2 and plan
section 1 item 4 applies instead: the CI variant runs on the QA build
are the recorded numbers, cited below with CI job/run ids.

## 1. Build and CI evidence

| Fact | Value |
|---|---|
| Build under test (master SHA) | `8b6422b` (`docs(testing): Add Phase 6 QA plan (entry, activities, bug flow, exit) (#266)`) — the same QA build as the A1 log |
| CI run | `40158466028` (push of `8b6422b`, 2026-10-25, `success`) — all 14 check-runs `success` |
| NFR-PERF-1 job | `e2e-single-host`, job `121064789566`, `success` |
| NFR-PERF-2 job | `perf-reporting-variant`, job `121064772966`, `success` |

## 2. NFR-PERF-1 — timed desk checks (CI variant)

Method: `script/e2e-perf-check.sh` after the installer in the
`e2e-single-host` job. Seed: 50 PERF rooms, PERF rate plan
(one-night total 120000), 47 pre-booked units + 1 setup stay + 2
timed check-ins (full 50-unit book for tonight), 5 signed-in staff.
Run verdict: `DONE: 21 timings recorded (12 views, 9 actions)
env=ci-e2e-variant`, 0 `FAIL` lines.

Environment: `nproc=4 mem=16373452kB disk=84709MiB-avail
label=ci-e2e-variant referenceHost=0` (GitHub-hosted runner —
variant, never compared against single-host bounds).

Named views (bound 2000 ms on the reference host only — not
asserted here):

| Operation | Measured (ms, 3 reps, this run) | Consolidated baseline (`test-report.md` [section 3](test-report.md)) |
|---|---|---|
| QueryCalendar (full-book range) | 35, 35, 35 | 34, 34, 34 |
| CheckSellableCount (50 units) | 33, 34, 33 | 33, 33, 33 |
| ListArrivalsDepartures (tonight) | 36, 36, 39 | 35, 35, 34 |
| GetFolioBalance (open folio) | 39, 40, 39 | 53, 48, 38 |

Named actions (bound 3000 ms on the reference host only — not
asserted here):

| Operation | Measured (ms, this run) | Consolidated baseline (`test-report.md` [section 3](test-report.md)) |
|---|---|---|
| CheckIn (2 reps, fresh booking + room each) | 36, 37 | 50, 36 |
| PostCharge (3 reps, folio with balance) | 42, 45, 46 | 39, 39, 42 |
| RecordPayment (2 reps, cash) | 42, 40 | 43, 41 |
| CheckOut (2 reps, settled folios) | 44, 38 | 43, 35 |

Comparison: every operation sits in the same tens-of-milliseconds
band as the baseline (largest delta: a few ms of runner noise on
`ListArrivalsDepartures` and `PostCharge`), two orders of magnitude
below the reference-host bounds. **No regression vs the consolidated
test report** — no Phase 6 QA bug filed for NFR-PERF-1.

## 3. NFR-PERF-2 — standard reports on two years of 50-room data (CI variant)

Method: `TestPerfTwoYearReportsRecordTimings` generates two years of
50-room operating data as domain events and folds them through the
real `Rebuild` path, timing each standard report over the full
window. Scale-correctness is asserted in-test; the 5 s bound is
asserted only with `REFERENCE_HOST=1` (not set here).
Run verdict: `--- PASS: TestPerfTwoYearReportsRecordTimings (0.72s)`.

Seed: `126100 events over 731 days for 50 rooms`
(`services/reporting/internal/service/perf_test.go:141`).

Environment: `label=ci-e2e-variant go=go1.24.13 cpus=4
mem=16372436kB disk=87353MiB-avail` (GitHub-hosted runner —
variant, never compared against single-host bounds).

| Report | Measured (this run) | Consolidated baseline (`test-report.md` [section 4](test-report.md)) |
|---|---|---|
| Rebuild (126,100 events, for context) | 85 ms | 71 ms |
| OccupancyReport (731 days x 1 type) | 525 ms | 505 ms |
| RevenueSummary (731 days) | 0 ms | 0 ms |
| DailySheet (spot business date) | 4 ms | 5 ms |
| HousekeepingReport (50-room floor) | 0 ms | 0 ms |

Comparison: same order of magnitude throughout (rebuild +14 ms and
occupancy +20 ms are runner noise on a shared CI host), every report
an order of magnitude or more below the 5 s reference-host bound.
**No regression vs the consolidated test report** — no Phase 6 QA
bug filed for NFR-PERF-2.

## 4. Defects

None. Both PERF batches ran green on the QA build with no FAIL lines
and no bound/number regression vs `test-report.md` [sections 3–4](test-report.md), so
per issue #268 no Phase 6 QA bug was filed. Any future regression
found by re-running these guards files separately under the
`Phase 6 - QA` milestone in the plan section 3 format; fixes land in
their phase milestones, never here.

## 5. Exit linkage

This log plus the cited evidence (hardware decision, build SHA, CI
run/job ids, environment facts, measured numbers) is the A2 record
for QA-plan exit criterion 1 (PERF numbers with environment label)
and criterion 4 in its variant form (bounds not asserted; variant
explicitly recorded, owner acknowledgement via reviewer APPROVE).
A1/A3/A4 batches are separate issues and are out of scope here.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-348
