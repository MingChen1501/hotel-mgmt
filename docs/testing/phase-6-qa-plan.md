# Phase 6 QA plan — independent QA pass before pilot

Status: active. The scoped test plan for milestone `Phase 6 - QA`
(milestone #19: QA track — test plans, issue reports, bugs found;
fixes land in their phase milestones), owned by `qa-lead`
(Closes #264). This is a phase plan, not a revival of the dropped
generic `test-plan.md`: the #214 DROP decision stands (cases and data
live in the `traceability-matrix.md` guard cells plus fixtures, and
results live in the consolidated `test-report.md`). This plan states
only what the independent QA pass checks, how bugs flow, and what
"QA done" means before pilot. Executing the pass is follow-up work
(one issue per activity batch, filed under `Phase 6 - QA` after this
plan lands); backend/frontend fixes from it land in their phase
milestones, never here.

## 0. Why this pass exists

The system is functionally complete (MVP slices merged, FE 5 screens
live, POC demo checklist PASS + owner sign-off, matrix 57/57 with
pass evidence in `test-report.md`) but has never had an independent
QA pass: no tester-written test plan exists, PERF bounds were never
asserted on a real 2*4*50 reference host (CI records variants only —
see `test-report.md` [sections 3–4](test-report.md)), and the FE screens were verified
by review + smoke tests, not by a structured end-to-end QA run.

## 1. Entry criteria

The QA pass starts only when all of the following hold:

1. **Functionally complete on the QA build.** MVP slices merged,
   consolidated test report green (all 57 traceability cells filled
   with pass evidence), POC demo checklist PASS + owner sign-off on
   record.
2. **Live stack available.** The stack brings up per
   `docs/devops/deployment.md` (or `script/install.sh`) with seed
   data matching the stated hotel setup; the build under test is
   identified (commit SHA or install image) and recorded on every
   bug and result.
3. **CI green on the build under test.** All per-stack jobs plus
   `contract-check` plus `e2e-single-host` report success on the
   merge commit, per the method in `test-report.md` [section 0](test-report.md).
4. **Reference-hardware question settled.** Record before the run
   whether a 2*4*50 host (ADR-0001 single-host default: 2 vCPU /
   4 GB RAM / 50 GB disk) is obtainable. If yes, PERF bounds are
   asserted (`REFERENCE_HOST=1`); if no, the run records a labelled
   variant (`PERF_ENV_LABEL`, e.g. `ci-e2e-variant`) and variant
   numbers are never compared against single-host bounds — per
   `test-strategy.md` L2.

## 2. QA activities

### A1 — Structured desk-loop run on the live stack

A scripted end-to-end run through **all 5 FE screens** (`frontend/desk.html`,
`frontend/book.html`, `frontend/stay.html`, `frontend/folio.html`,
`frontend/admin.html`): book → check in → post charges → take
payment → check out → invoice/receipt print comparison against the
folio, plus the admin console (users/roles, hotel config, audit-log
view) and the backup-report surface (`frontend/backup-report.json`).
Each step states its expected observable up front (token returned,
reservation confirmed, room state transitioned, folio balance exact,
print matches folio lines); deviations become bugs per section 3,
not inline fixes. The loop follows the desk order proven in
`script/e2e-desk-loop.sh`, driven by a person at the screens.

### A2 — PERF bounds

- **NFR-PERF-1** timed desk checks with `script/e2e-perf-check.sh`:
  2 s named views, 3 s named actions, at the stated loads (50 rooms
  with a full book, 5 signed-in staff).
- **NFR-PERF-2** standard reports over two years of 50-room data
  with `TestPerfTwoYearReportsRecordTimings` (`services/reporting`):
  5 s per standard report.
- Bounds are asserted only on the 2*4*50 reference host
  (`REFERENCE_HOST=1`). Anywhere else the numbers are recorded with
  their environment label as a variant run. Reproduce pointers live
  in `test-report.md` [section 9](test-report.md).

### A3 — Exploratory pass per screen

One time-boxed session per FE screen with a front-desk persona,
hunting what the scripted loop misses: confusing flows, misleading
wording (checked against the message catalogue), missing confirmations,
and error paths (refusals must name the cause, e.g. `CONFLICT` with
type+dates, `SETTLEMENT_REQUIRED` on open-balance checkout). Every
session leaves a note (screen + scenario + outcome) even when it
finds nothing — "nothing found on screen X" is a result.

### A4 — Regression of the 57-cell guard set via CI

Full CI re-run on the QA build. This is regression, not
re-verification: the consolidated `test-report.md` stays the pass
record, and A4 confirms nothing regressed since. Any red cell blocks
exit per section 5; the failing cell's guard location (`file:line`
from the matrix) goes on the bug.

## 3. Bug reporting format

Each bug is **one issue under the `Phase 6 - QA` milestone** (QA
tracking rule in `docs/project/milestone-conventions.md`), titled
per `docs/project/issue-conventions.md` (`[type] Imperative
summary`, exactly one type label + one `risk-*` label), with:

- **Steps to reproduce** — numbered, from the stated build/seed.
- **Expected vs actual** — one line each, citing the FR/NFR id
  where applicable.
- **Severity** — blocker (QA cannot exit with it open), major
  (wrong behaviour, workaround exists), or minor (wording, cosmetic);
  severity maps to risk labels, and `risk-high` / `risk-very-high`
  needs owner approval per the merge rules.
- **Evidence** — logs, screenshots, screen + scenario for A3
  findings, CI job/run id for A4 failures.
- **Environment** — live-stack build id (A1–A3) or CI job/run id
  (A4), plus reference-host vs variant label for PERF findings.

## 4. Triage + fix flow

1. **Triage under `Phase 6 - QA`.** Confirm (reproduce on the
   recorded build) → set severity → route. Duplicate, cannot-reproduce
   (with the attempt logged), and accepted-behaviour dispositions are
   recorded on the issue; accepted behaviour that contradicts a spec
   becomes a spec question to the owning role, not a silent close.
2. **Fixes land in their phase milestones.** Bugs are *found* in
   Phase 6; each fix is a separate issue filed against the phase
   milestone whose exit signal the fix serves (milestone role), linked
   back to the QA bug. The QA plan never carries fix diffs.
3. **QA exit does not wait for every minor fix to merge**, but every
   `risk-high` / `risk-very-high` bug needs owner disposition, and no
   open blocker remains at exit.

## 5. Exit criteria (what "QA done" means before pilot)

1. A1–A4 executed and recorded: desk-loop log, PERF numbers with
   environment label, per-screen exploratory notes, CI run ids.
2. All found bugs filed in the section 3 format; zero open
   blockers; all `risk-high`+ dispositions owner-approved.
3. 57-cell guard set green on the QA build (no TBD, no red).
4. PERF bounds either asserted on the reference host or explicitly
   recorded as variant with owner acknowledgement.
5. This plan plus the QA results cross-referenced from the pilot
   exit checklist (`docs/operations/pilot-exit-checklist.md`) as the
   pre-pilot evidence.

## 6. Follow-ups (out of scope for this plan)

Separate issues under `Phase 6 - QA`, one per batch: desk-loop run
(A1), PERF run (A2), exploratory pass (A3), regression re-run (A4).
No gate changes, no product code changes, no QA execution here.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-344
