# Spec gate (change tiers T0–T4)

Status: active (template starter). No behavioural, architectural, or
release-affecting change jumps straight from idea to code. Specs are
written first, marked `active` in the docs index, and checked by the
`spec-reviewer` before any implementation worker starts.

## Tiers and minimum spec sets

| Tier | Shape | Minimum spec set (before the implementation PR opens) |
|---|---|---|
| **T0 docs-only** | prose/docs/process only, no behaviour change | no gate; index statuses updated in the same PR when a doc flips stub <-> active |
| **T1 low risk, no behaviour change** | typo, test-only, dependency bump | no new spec; index unaffected |
| **T2 behaviour change** | user-visible feature | acceptance criteria + FR/NFR delta + test traceability, written before the implementation PR opens |
| **T3 architectural** | new subsystem, data-model change, workflow change, subsystem removal | T2 set + ADR + HLD update before implementation; ADR status must move `proposed -> accepted` (owner) before code merges |
| **T4 release-affecting** | workflow/permissions/deployment change | applicable T0–T3 set + deployment/env/runbook deltas + rollback note in the same PR |

Tier is chosen by the owning spec role (`product-owner` for scope,
`architect` for T3) and recorded in the issue; `spec-reviewer`
re-checks the tier as part of its verdict.

Tier sets the spec floor; the risk label sets the merge bar (see
`conventions.md`). Either axis can escalate independently — a T2 with a
large blast radius is still `risk-high` and still needs owner approval
to merge.

## Gate procedure

1. The orchestrator spawns the owning spec role(s) for the tier; they
   write/update the required specs and flip the matching index rows to
   `active`.
2. The orchestrator spawns `spec-reviewer`, which checks that the
   required specs exist, are `active`, and match the change, then posts
   one COMMENT verdict (`SPEC-GATE PASS` or `SPEC-GATE FAIL` with
   `file:line` gaps) on the issue/PR — same verdict-as-comment mechanics
   as code review (never a native reviewer trigger).
3. Implementation starts only on PASS. On FAIL the orchestrator routes
   the gaps back to the owning spec role, not to the implementer.
4. T3 additionally requires the owner to accept the ADR
   (`proposed -> accepted`) before the implementation PR merges.

Spec sessions count as the single task worker: specs first, gate
verdict next, implementation last — sequentially, never in parallel.

## Blank worked example

Copy this row into the issue when tiering a change:

| Change | Tier | Required specs before implementation | Evidence/notes |
|---|---|---|---|
| <issue/PR ref — what changes> | <T0/T1/T2/T3/T4 + one-line why> | <spec files to write first; T3: ADR + HLD update + owner acceptance> | <risk label; artefacts the implementation PR must carry> |

Worked example (this repo, filled in for reference only): removing a
client-side search subsystem was tiered T3 (subsystem removal) —
ADR (remove vs keep, owner-accepted), HLD/LLD update, FR/NFR delta,
updated test traceability, acceptance criteria, index rows flipped to
`active` before the implementation PR. A new project should fill one
such row per tiered change and keep it in the issue, not copy this
example's nouns.
