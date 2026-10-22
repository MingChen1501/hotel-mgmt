# hotel-mgmt

Hotel-management project scaffold with agentic-coding workflow
(roles, spec gate, review/merge flow). No product code yet.

- Agent rules: `AGENTS.md` (normative role rules: `docs/ao-rules.md`).
- Document index: `docs/README.md`.
- The stack is **undecided**: no build, test, or deploy commands exist
  yet. Verification rules live in `.opencode/skills/hotel-verify/`
  (placeholder) until the stack is chosen.
- Do not invent hotel product requirements — specs land via
  the spec-gated workflow (`spec-gate` skill) once the owner scopes
  the first product slice.

## Delivery

Delivery is issue-based on GitHub (origin
`https://github.com/MingChen1501/hotel-mgmt.git`): GitHub issues are
the task source, issue/PR comments are the external communication
channel, and work lands via branch + PR with squash merge on green
CI. GitHub Actions CI runs once the stack lands. Conventions:
`docs/project/issue-conventions.md`; role rules: `docs/ao-rules.md`.
