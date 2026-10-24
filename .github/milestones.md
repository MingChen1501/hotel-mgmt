# Milestone tracking (INTERIM)

> Status: INTERIM scheme. This milestone + tracking-note setup is
> temporary scaffolding for the current phase: it will be replaced
> when team and slice throughput change. Do not over-engineer
> automation around it (no bots, no board sync, no extra
> bookkeeping) — milestones stay a lightweight manual mirror of
> `docs/project/plan.md`.

Milestones complement — never replace — the one-type + one-risk
label convention on every issue and PR.

## Board decision (owner decision 2026-10-23)

The owner maintains a human Kanban view at
https://github.com/users/MingChen1501/projects/6 (a user-owned
Projects board). The machine token cannot read or write it (no
project scope), so the board is human-maintained: the milestone
table below plus each milestone's web page stays the
machine-readable source of truth. Workers never claim to update the
board via API.

## Milestones (mirror of `docs/project/plan.md`)

Naming, lifecycle, and bookkeeping rules live in
`docs/project/milestone-conventions.md` (Closes #224): phase boards
use `Phase <N> - <scope>`, standing milestones (`Pilot`, `Harness`,
`QA`) never close, milestones live on issues only (PRs link via
`Closes #`), and every open issue carries exactly one milestone.

| Milestone | State | Plan ref |
|---|---|---|
| Specs done | closed | plan milestone 1 |
| Stack decision | closed | plan milestone 2 |
| Walking skeleton 3a - readiness specs | closed | plan 3a (#96, #97, #98 merged) |
| Walking skeleton 3b - skeleton and per-stack CI | closed | plan 3b (#99; fresh checkout builds, per-stack CI green) |
| Phase 3 - desk loop E2E and backup | closed | plan 3c (closed per #224; LAN-hardware verification continues under `Pilot`) |
| Phase 4 - reservations slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 4 - rooms and housekeeping slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 4 - rates slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 4 - guests slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 4 - billing slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 4 - reporting slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 4 - administration slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 4 - per-hotel customisation slice | closed | plan 4, per-slice guards (closed per #224, 0 open) |
| Phase 3 - persistence slice | closed | pre-convention slice board (closed per #224, 0 open) |
| Phase 3 - stay flow slice | closed | pre-convention slice board (closed per #224, 0 open) |
| Phase 3 - process decisions | closed | pre-convention slice board (closed per #224, 0 open) |
| Pilot | open | plan 5 (full-day operation, runbook, restore drill inside RTO 4h) |
| Harness | open | ongoing automation track (agents, skills, workflow, CI); not a plan phase |
| QA | open | standing QA track (test plans, issue reports, bugs found; fixes stay in phase milestones) |

## Backfill rules (history, issue #120)

Every closed issue and every merged PR was assigned to the
milestone whose exit signal it served: spec-writing issues to
Specs done, stack/ADR issues to Stack decision, #96/#97/#98 (and
their PRs) to 3a, #99/#108/#111/#112 (and their PRs) to 3b,
#113/#116/#119 (and their PRs) to 3c, CI/harness/process issues
and PRs to Harness. Open work: #117 to 3c, #120 to Harness. No
module-slice, pilot, or per-hotel-customisation items exist yet.

Backfill result: 60 closed issues + 52 merged PRs assigned, plus
3 closed-unmerged probe PRs and all 2 open issues. Verification:

```sh
gh issue list -R MingChen1501/hotel-mgmt --state all --limit 200 \
  --json number,milestone --jq '.[] | select(.milestone == null)'
gh pr list -R MingChen1501/hotel-mgmt --state all --limit 200 \
  --json number,milestone --jq '.[] | select(.milestone == null)'
```

Both return empty: zero items without a milestone.
