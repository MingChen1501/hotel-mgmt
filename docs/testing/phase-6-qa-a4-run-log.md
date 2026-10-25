# Phase 6 QA A4 — full CI regression run log (QA build)

Status: active. QA activity A4 from the scoped independent-QA pass
(`docs/testing/phase-6-qa-plan.md`, section 2, Closes #264; this log
Closes #270), owned by `qa-lead`. Full CI re-run on the QA build
(master HEAD at execution time): regression, not re-verification —
the consolidated `test-report.md` stays the pass record, and A4
confirms nothing regressed since. All 14 check-runs report `success`
on the QA build (section 1); no red cell, so per the plan no
Phase 6 - QA bug was filed.

## 0. Build, run, and method facts

| Fact | Value |
|---|---|
| QA build (master SHA at execution) | `98fa519` (`fix(print): escape angle brackets in print view escaper (#279)`) |
| Full CI run | `40165924572` (push of `98fa519` to master, 2026-10-25, `completed` / `success`) — <https://github.com/MingChen1501/hotel-mgmt/actions/runs/40165924572> |
| Workflow | `ci` (`.github/workflows/ci.yml`): push-to-master runs the full matrix (path-filter `full` branch), so every heavy job ran — no skips |
| Superseded run (not a red) | `40165784874` (push of `b0cdb88`, #278) concluded `cancelled`: the `ci-${{ github.ref }}` concurrency group cancelled it when `98fa519` was pushed 2 minutes later. Cancellation by supersede, not a failure; the QA build's own run above is the verdict of record |
| Guard set regressed | the 57-cell set (43 FR + 14 NFR) consolidated in `test-report.md`, via the per-stack jobs below |
| Method | `gh run view 40165924572 --json jobs` plus `gh api repos/MingChen1501/hotel-mgmt/commits/98fa519…/check-runs`: all 14 check-runs `success` |

## 1. Per-stack verdicts (all green)

| Job | Conclusion | Job id |
|---|---|---|
| `changes` (path-filter gates, full matrix on master push) | success | `121086911018` |
| `ci` (shellcheck, required paths, conflict markers, secrets scan, catalogue coverage, pre-flight fail-closed proof, harness self-checks) | success | `121086910845` |
| `go-build (reservations)` (build, vet, gofmt, `go test ./...`) | success | `121086939518` |
| `go-build (rates)` (build, vet, gofmt, `go test ./...`) | success | `121086939556` |
| `go-build (reporting)` (build, vet, gofmt, `go test ./...`) | success | `121086939662` |
| `node-build (stay)` (install, build, lint, `npm test`) | success | `121086939516` |
| `node-build (rooms)` (install, build, lint, `npm test`) | success | `121086939507` |
| `node-build (guests)` (install, build, lint, `npm test`) | success | `121086939580` |
| `node-build (admin)` (install, build, lint, `npm test`) | success | `121086939552` |
| `billing-build` (`mvn -B package`, includes unit tests) | success | `121086939541` |
| `contract-check` (`script/contract-check.sh`) | success | `121086939544` |
| `migrate-check` (every module boot migration against scratch PostgreSQL) | success | `121086939505` |
| `e2e-single-host` (installer end to end + desk loop + PERF-1 timings + restore drill) | success | `121086939492` |
| `perf-reporting-variant` (`TestPerfTwoYearReportsRecordTimings`, PERF-2) | success | `121086911142` |

No skipped heavy job: on a master push the `changes` gate forces the
full matrix (`go-matrix` all three, `node-matrix` all four, billing,
contracts, migrate, e2e all `true`), and all 14 check-runs above
report `success` on commit `98fa519`.

## 2. Defects

None. Zero red cells on the QA build, so per issue #270 (any red
cell blocks QA exit and becomes a Phase 6 - QA bug) no bug was
filed. Any future regression found by re-running this guard set
files separately under the `Phase 6 - QA` milestone in the plan
section 3 format (with the failing cell's guard location
`file:line` from the traceability matrix on the bug); fixes land in
their phase milestones, never here.

## 3. Acceptance mapping (issue #270)

| Acceptance item | Evidence |
|---|---|
| Full CI verdict recorded on the QA build | QA build `98fa519`, CI run `40165924572` (`success`), 14/14 per-stack `success` with job ids in section 1 |
| Reds filed as bugs or explicit all-green | explicit all-green — section 2 records zero defects, no bug filed |
| Evidence cited | run URL + SHA + job ids in sections 0–1 |
| Reviewer APPROVE | remaining gate (PR review) |

## 4. Exit linkage

This log plus the cited evidence (QA build SHA, CI run/job ids,
per-stack verdicts) is the A4 record for QA-plan exit criterion 1
(CI run ids) and criterion 3 (57-cell guard set green on the QA
build: no TBD, no red). A1/A2/A3 batches are separate issues and
are out of scope here.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-356
