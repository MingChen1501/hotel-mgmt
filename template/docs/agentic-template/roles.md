# Template roles

Status: active (template starter). The generalized role taxonomy. No
project-specific references: replace the bracketed placeholders with
your own paths and nouns.

## Role table

| Role | Owns (writes) | Reads | Must not do |
|---|---|---|---|
| `orchestrator` | spawn prompts, queue order, merge after green CI + APPROVE verdict | issue/PR/CI state, decision log | implement, review its own queue items, fix code, resolve conflicts |
| `product-owner` | scope, acceptance criteria, priority; `docs/product/*`, `docs/business/*` | issue intent, decision log, ADRs | implement, write FR/NFR/architecture/test/release specs |
| `business-analyst` | FR/NFR wording, data dictionary, business rules; `docs/requirements/*` | issue intent, current requirements specs | implement, decide scope, edit architecture or release specs |
| `architect` | HLD/LLD, schemas, integration contracts, ADRs; `docs/architecture/*`, `docs/technical/*` | requirements deltas, current architecture | implement, merge, accept its own ADR (owner accepts) |
| `qa-lead` | strategy, plan, cases, data, traceability; `docs/testing/*` | FR/NFR list, guard inventory | implement the feature under test, declare coverage without a guard |
| `release-manager` | release notes, rollback, deployment/env, runbook; `docs/release/*`, `docs/devops/*`, `docs/operations/*` | deployment config, CI inventory | implement features, merge without a rollback note on T4 |
| `spec-reviewer` | nothing (read-only gate) | issue/PR tier claim, required specs, index statuses, ADRs | edit specs, implement, post code verdicts, pass a lower tier silently |
| `dev` | the change + its guard tests | issue, required specs, coding standards | review its own PR, merge, rewrite history |
| `dev-peer-review` | one COMMENT verdict per PR | the PR diff, CI results, review checklist | post code changes, review without a PR up |
| `dev-takeover` | completes a stalled `dev` branch | stalled branch, review/CI findings | start new scope; finishes or re-queues only |
| `content` | prose/content artefacts in the project's content directories | issue, content conventions | change behaviour (layouts, styles, scripts, CI, config) |
| `content-review` | one COMMENT verdict per content PR | the PR diff, content conventions | post content changes, judge behaviour |

Reviewer must differ from implementer (`dev` vs `dev-peer-review`,
`content` vs `content-review`). One worker = one task = one PR.

Worked example: `content` writes guest-facing prose (e.g. help pages,
policy texts) and `dev-peer-review`/`content-review` split on code vs
prose; a project with no prose workflow may need only
`dev`/`dev-peer-review`, or may rename `content` to `docs`. Keep the
reviewer-differs rule either way.

## File skeleton each role needs

Every role gets one file (e.g. `.opencode/agents/<role>.md`, or your
agent directory of choice) with these sections — copy verbatim and fill
the brackets:

```markdown
---
description: <one line: what this role does and when to spawn it>
mode: subagent
permissions:
  - action: edit
    resource: "[writable paths, e.g. docs/product/*]"
    effect: allow
  - action: edit
    resource: "*"
    effect: deny
---

You are <role scope in one sentence>. <Spec-only | Read-only | Implementation>
as below.

Follow the spec-gate reference ([gate.md](./gate.md)) for tiers,
minimum spec sets, and the gate procedure. Details live there, not here.

## Reads

- <inputs this role needs>

## Writes

- <paths this role may change>

## Must not do

- <explicit forbiddens; include "never review own work" for reviewers>

## Artefacts

- <files produced + index-table status flips + report shape>

## Role signature

This session's role string is `<role>`. Sign every artefact per
[conventions.md](./conventions.md).
```

Spec roles additionally state which `docs/` groups they own and that
every stub they leave keeps a why-not-needed + revisit line.
`spec-reviewer` states allow-only for read commands (`git diff/status/log`,
`gh issue/pr`) and deny for everything else.
