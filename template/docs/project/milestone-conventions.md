# Milestone conventions

Status: active. Naming, lifecycle, and bookkeeping rules for GitHub
milestones, owned by `product-owner`. Milestones are a lightweight
manual mirror of `docs/project/plan.md` — no bots, no board sync, no
extra bookkeeping.

## Naming format

- **Phase boards:** `Phase <N> - <scope>` where `<N>` is the
  `docs/project/plan.md` milestone number and `<scope>` is a short
  lowercase descriptor (e.g. `Phase 2 - core slice`).
- **Standing milestones** (not phases, never closed):
  - `Pilot` — the pilot operation with a real customer (standing
    track, not a plan phase).
  - `Harness` — the ongoing automation track (agents, skills,
    workflow, template, CI automation).
- **Historical names.** Milestones closed before this convention keep
  their names as history; where the plan number is certain they may be
  renamed to the convention. Old issue/PR bodies keep the old names as
  immutable history and are never rewritten.

## Lifecycle

- **One live milestone per active phase.** Each active plan phase has
  exactly one open milestone; a new phase milestone opens only when
  its phase starts. The live list follows `docs/project/plan.md`.
- **Close rule.** A phase milestone closes when its plan exit criteria
  are met **and** all its issues are closed. Standing milestones
  (`Pilot`, `Harness`) never close.
- **No nulls.** Every open issue carries exactly one milestone (filing
  rule). Verify with:

```sh
gh issue list -R {{REPO_SLUG}} --state open --limit 200 \
  --json number,milestone --jq '.[] | select(.milestone == null)'
```

It must return empty.

## PR-milestone rule: milestones live on issues only

PRs do **not** carry milestones. Every PR links its issue via
`Closes #<n>` and inherits the milestone through it. Rationale:
single bookkeeping point; per-phase PR counts stay answerable via the
linked issues. Historical PR milestones (set before this rule) are
left as-is.

## QA tracking

QA work is tracked under the numbered QA phase milestone from the
plan, not by label: the exactly-one-type + one-risk-label rule in
`docs/project/issue-conventions.md` is unchanged (there is no `qa`
label). File test plans, issue reports, and found bugs against the QA
phase milestone; file their fixes against the phase milestone whose
exit signal the fix serves.

## Q&A tracking

Question-and-answer issues (e.g. a scope-clarification question for
the owner) are filed with the `[docs]` type and the normal
exactly-one-type + one-risk-label labels — no new label: the question
topic is already disambiguated by the title plus the milestone below,
so an extra label would add bookkeeping without signal. File the issue
against the milestone the question belongs to (the phase board whose
scope it clarifies, or `Harness` for harness questions); post the
answer as an issue comment; close the issue once the answer is
accepted, per the close rule.
