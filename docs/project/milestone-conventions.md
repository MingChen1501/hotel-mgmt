# Milestone conventions

Status: active. Naming, lifecycle, and bookkeeping rules for GitHub
milestones, owned by `product-owner` (Closes #224). Milestones are a
lightweight manual mirror of `docs/project/plan.md` — no bots, no board
sync, no extra bookkeeping (see `.github/milestones.md`).

## Naming format

- **Phase boards:** `Phase <N> - <scope>` where `<N>` is the
  `docs/project/plan.md` milestone number and `<scope>` is a short
  lowercase descriptor (e.g. `Phase 4 - reservations slice`).
- **Standing milestones** (not phases, never closed):
  - `Pilot` — the real-hotel pilot operation (plan milestone 5).
  - `Harness` — the ongoing automation track (agents, skills,
    workflow, template, CI automation).
  - `QA` — test plans, issue reports, and bugs found. The **fix**
    for a bug stays in its phase milestone.

## Lifecycle

- **One live milestone per active phase.** Each active plan phase has
  exactly one open milestone; a new phase milestone opens only when
  its phase starts.
- **Close rule.** A phase milestone closes when its plan exit criteria
  are met **and** all its issues are closed. Standing milestones
  (`Pilot`, `Harness`, `QA`) never close.
- **No nulls.** Every open issue carries exactly one milestone (filing
  rule). Verify with:

```sh
gh issue list -R MingChen1501/hotel-mgmt --state open --limit 200 \
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

QA work is tracked by the standing `QA` milestone, not by label: the
exactly-one-type + one-risk-label rule in
`docs/project/issue-conventions.md` is unchanged (there is no `qa`
label). File test plans, issue reports, and found bugs against `QA`;
file their fixes against the phase milestone whose exit signal the
fix serves.

## Q&A tracking

Question-and-answer issues (e.g. #213, architect Q&A on where Ansible
is used) are filed with the `[docs]` type and the normal
exactly-one-type + one-risk-label labels — no new label: the question
topic is already disambiguated by the title plus the milestone below,
so an extra label would add bookkeeping without signal. File the issue
against the milestone the question belongs to (the phase board whose
scope it clarifies, or `Harness` for harness questions); post the
answer as an issue comment; close the issue once the answer is
accepted, per the close rule.
