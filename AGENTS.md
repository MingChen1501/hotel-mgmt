# hotel-mgmt — agent guide

Hotel-management project. Stack undecided: no build/test commands are
allow-listed yet — confirm verification with the orchestrator per the
`hotel-verify` skill.

Precedence: owner instruction > project cues > `AGENTS.md` > skills >
agent files. Obey-now: a newer owner instruction overrides older cue
text immediately, even before the cue is edited.

## Roles (each role starts from its file; normative rules: `docs/ao-rules.md`)

| Role | Read |
|---|---|
| Orchestrator (spawn, pool, review/merge flow) | `orchestrator` skill |
| Spec roles — `product-owner`, `business-analyst`, `architect`, `qa-lead`, `release-manager`, `spec-reviewer` (no implementation) | role file or `orchestrator` skill |
| Dev — `dev` implements; `dev-takeover` resumes a stalled `dev` branch | `worker` skill |
| Dev review — `dev-peer-review` (code only, read-only) | `hotel-verify` skill + role file |
| Content — `content` (hotel-domain prose) | role file |
| Content review — `content-review` (read-only) | role file |
| Buffer (file issues only, no implementation) | `.opencode/agents/buffer-worker.md` |
| Architect (audit, specs, refactor issues; never implements) | `.opencode/agents/architect.md` + `architecture` skill |

## Spec gate (tiers T0–T4)

Behavioural/architectural changes need specs written and `active`
before the implementation PR opens; the `spec-reviewer` verdict gates
implementation. Tiers, minimum spec sets, and role ownership live in
the `spec-gate` skill; `docs/README.md` states which role owns each
doc group.

## Commands (every task)

- Verify: follow the `hotel-verify` skill (placeholder until the stack
  is chosen); never open a PR while red.
- Review the diff read-only before a PR (`dev-peer-review` /
  `content-review`).

## Non-negotiables

- Delivery runs through GitHub: origin is
  `https://github.com/MingChen1501/hotel-mgmt.git`. GitHub issues are
  the task source and issue/PR comments are the external communication
  channel; all public artifacts are in English. Workers push their own
  session branch and open PRs for their assigned issue.
- Never push directly to the default branch; work on a branch + PR.
- Every issue and PR carries exactly one risk label (`risk-low` /
  `risk-medium` / `risk-high` / `risk-very-high`); squash merge only
  on green CI + reviewer APPROVE; `risk-high`, `risk-very-high`, or a
  missing label needs explicit owner approval.
- Issue and PR titles/labels follow `docs/project/issue-conventions.md`
  (`[type] Imperative summary`, one type label + one `risk-*` label).
- One worker = one small task = one PR; never review your own PR
  (reviewer role differs from implementer).
- All public repo artifacts MUST be English (PRs, commits, issues,
  review comments, code comments); Vietnamese only for internal AO
  reporting. Every artefact is signed with its role (normative rules:
  `docs/ao-rules.md`).

## When you need X, read Y

| Need | Read |
|---|---|
| Coordinate AO sessions: pool, roles, review flow, publishing scope | `orchestrator` skill |
| Owner describes a task: buffer worker files the issue(s) first | `orchestrator` skill ("Owner-task buffer-worker workflow") |
| Scope a change or write specs before code | `spec-gate` skill + owning role file |
| Audit structure/coupling/duplication, maintain `docs/architecture/` | `.opencode/agents/architect.md` + `architecture` skill |
| SWE document index (which doc type lives where) | `docs/README.md` |

Each skill's frontmatter (`description` + `trigger`) says when to load it;
details live there, not here.
