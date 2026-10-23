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

| Milestone | State | Plan ref |
|---|---|---|
| Specs done | closed | plan milestone 1 |
| Stack decision | closed | plan milestone 2 |
| Walking skeleton 3a - readiness specs | closed | plan 3a (#96, #97, #98 merged) |
| Walking skeleton 3b - skeleton and per-stack CI | closed | plan 3b (#99; fresh checkout builds, per-stack CI green) |
| Walking skeleton 3c - desk loop E2E and backup | open | plan 3c (loop on hotel LAN hardware with verified backup) |
| Modules - reservations slice | open | plan 4, per-slice guards |
| Modules - rooms and housekeeping slice | open | plan 4, per-slice guards |
| Modules - rates slice | open | plan 4, per-slice guards |
| Modules - guests slice | open | plan 4, per-slice guards |
| Modules - billing slice | open | plan 4, per-slice guards |
| Modules - reporting slice | open | plan 4, per-slice guards |
| Modules - administration slice | open | plan 4, per-slice guards |
| Modules - per-hotel customisation slice | open | plan 4, per-slice guards |
| Pilot | open | plan 5 (full-day operation, runbook, restore drill inside RTO 4h) |
| Harness | open | ongoing automation track (agents, skills, workflow, CI); not a plan phase |

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
