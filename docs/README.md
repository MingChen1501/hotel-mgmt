# Documents

Status: active (index). Single entry point for every document type in
this project: each row points at its real path with status `active` or
`stub (not needed yet)`. Every file under `docs/` is in one of the
tables — no orphans, no dead links. All content is English.

The stack is undecided and no product scope exists yet, so the spec
groups below are stubs. They flip to `active` through the normal
spec-gated flow (see the `spec-gate` skill) once the owner scopes the
first product slice. Do not invent hotel product requirements to fill
them early.

## Spec ownership (role -> groups)

| Role | Groups |
|---|---|
| `product-owner` | Business, Product |
| `business-analyst` | Requirements |
| `architect` (as solution architect) | Architecture, Technical |
| `qa-lead` | Testing |
| `release-manager` | DevOps, Operations, Release |
| `spec-reviewer` | none (read-only gate over all groups) |

## Project

| Type | Path | Status | Purpose |
|---|---|---|---|
| Decision log | `project/decision-log.md` | stub (not needed yet) | decision list pointing at ADRs |
| Issue conventions | `project/issue-conventions.md` | active | title+label convention for issues and PRs |
| Plan | `project/plan.md` | stub (not needed yet) | milestones — issue queue only until scoped |
| Risk register | `project/risk-register.md` | stub (not needed yet) | live risk list |

## Product

| Type | Path | Status | Purpose |
|---|---|---|---|
| Slice 1 scope | `product/slice-1-room-inventory-booking.md` | active | slice 1 product scope: room inventory + booking |

## Agentic template (reusable starter)

| Path | Purpose |
|---|---|
| `agentic-template/README.md` | template overview, audience, adoption checklist |
| `agentic-template/roles.md` | generalized role table + role file skeletons |
| `agentic-template/gate.md` | T0–T4 gate + worked example |
| `agentic-template/conventions.md` | artefact/commit/session naming, language, merge, verdict mechanics |
| `agentic-template/bootstrap.md` | step-by-step: new repo to first guarded PR |
| `agentic-template/extraction-plan.md` | options for a standalone template repo + open decision |

## Other existing docs

| Path | Purpose |
|---|---|
| `ao-rules.md` | normative AO role rules (canonical roles, signatures, reviewer-must-differ) |
