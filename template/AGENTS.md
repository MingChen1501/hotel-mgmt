# {{PROJECT_NAME}} — agent guide

{{DOMAIN}} project. The stack is chosen per project: concrete
build/test commands live in the `project-verify` skill — confirm them
with the orchestrator before treating any change as green.

## Placeholders

This template ships with placeholders that `script/install-template.sh`
replaces at install time (flags in parentheses):

| Placeholder | Meaning | Example |
|---|---|---|
| `{{PROJECT_NAME}}` | Human-readable project name (`--project-name`) | `Example Project` |
| `{{REPO_SLUG}}` | GitHub `owner/repo` slug (`--repo-slug`) | `example-owner/example-project` |
| `{{DEFAULT_BRANCH}}` | Default branch (`--default-branch`) | `main` |
| `{{DOMAIN}}` | Problem domain in lowercase (`--domain`) | `example-domain` |

After install no placeholder token may remain (the installer verifies
this; `ONBOARDING.md` lists the check).

## Precedence

Owner instruction > project cues > `AGENTS.md` > skills > agent files.
Obey-now: a newer owner instruction overrides older cue text
immediately, even before the cue is edited.

## Roles (each role starts from its file; normative rules: `docs/ao-rules.md`)

| Role | Read |
|---|---|
| Orchestrator (spawn, pool, review/merge flow) | `orchestrator` skill |
| Spec roles — `product-owner`, `business-analyst`, `architect`, `qa-lead`, `release-manager`, `spec-reviewer` (no implementation) | role file or `orchestrator` skill |
| Dev — `dev` implements; `dev-takeover` resumes a stalled `dev` branch | `worker` skill |
| Dev review — `dev-peer-review` (code only, read-only) | `project-verify` skill + role file |
| Content — `content` (domain prose) | role file |
| Content review — `content-review` (read-only) | role file |
| Buffer (file issues only, no implementation) | `.opencode/agents/buffer-worker.md` |
| Architect (audit, specs, refactor issues; never implements) | `.opencode/agents/architect.md` + `architecture` skill |
| AI engineer (harness engineering: agents/skills/commands/plugins/config, cues, wrapper scripts, `template/`, onboarding; never product code) | `.opencode/agents/ai-engineer.md` + `orchestrator` skill |

Harness ownership: `ai-engineer` is the single accountable owner for
in-repo harness engineering (the paths listed in its role file). Other
roles do not edit harness files; harness issues and spec gates for
product/architecture content go through the owning role.

Role fallback by design (not drift): there are intentionally no
`dev.md` or `dev-takeover.md` agent files — at spawn time those roles
fall back to the `worker` skill (see the "Role file" block in
`script/ao-spawn-worker.sh`). Future audits must not re-flag these
missing files.

## Spec gate (tiers T0–T4)

Behavioural/architectural changes need specs written and `active`
before the implementation PR opens; the `spec-reviewer` verdict gates
implementation. Tiers, minimum spec sets, and role ownership live in
the `spec-gate` skill; `docs/README.md` states which role owns each
doc group.

## Commands (every task)

- Verify: follow the `project-verify` skill (placeholder until the
  stack is chosen); never open a PR while red.
- Review the diff read-only before a PR (`dev-peer-review` /
  `content-review`).

## Runtime enforcement (markdown states intent; config + scripts enforce)

- Permissions: `.opencode/opencode.jsonc` keeps the `ask` shell default
  and adds hard `deny` rules (last match wins): no `gh pr merge`,
  force-push, pushes to the default branch, remote branch deletion,
  `gh issue delete`, and no direct session control (`ao spawn`,
  `ao review trigger`) from any session.
  `.opencode/plugins/project-guard.ts` mirrors the gh/git denylist as
  defense in depth using only the documented permission `evaluate`
  hook; it defers on `ao ...` (config owns those) and never blocks
  `gh pr create/view/edit`, git reads, or session-branch pushes.
- Session create/merge/review are orchestrator-only and go through the
  three scripts (each requires the `.ao-orchestrator` marker plus a live
  orchestrator session; the marker lives only in the orchestrator
  worktree, never committed): `script/ao-spawn-worker.sh` (spawn),
  `script/orchestrator-merge.sh` (merge — the only merge path: it
  squash-merges via `gh pr merge --squash --delete-branch` as a child
  process while direct `gh pr merge` stays denied),
  `script/orchestrator-review.sh` (review trigger). The scripts work
  because they invoke the CLI as a child process, which permission
  evaluation does not see; a direct `ao spawn` /
  `ao review trigger` tool call is denied. A worker may not spawn,
  merge, or trigger review.
- These are guardrails, not a security boundary: a session that
  deliberately forges the marker and session signals could still run a
  script, and textual command guards are bypassable in general (shell
  wrappers, raw API calls). They stop mistakes and casual misuse; the
  real enforcement is GitHub-side branch protection/rulesets
  (a follow-up issue for the adopting project), which no session can
  bypass.
- `risk-high` / `risk-very-high` (or a missing risk label) always needs
  explicit owner approval, and then the owner merges manually — the
  merge script has no override path.
- GitHub-side checks (workflows, branch protection) are a follow-up
  issue for the adopting project, not part of this template.

## Non-negotiables

- Delivery runs through GitHub: origin is
  `https://github.com/{{REPO_SLUG}}.git`. GitHub issues are the task
  source and issue/PR comments are the external communication channel.
  Workers push their own session branch and open PRs for their assigned
  issue.
- Never push directly to the default branch; work on a branch + PR.
- Every issue and PR carries exactly one risk label (`risk-low` /
  `risk-medium` / `risk-high` / `risk-very-high`); squash merge only
  on green CI + reviewer APPROVE; `risk-high`, `risk-very-high`, or a
  missing label needs explicit owner approval.
- Issue and PR titles/labels follow `docs/project/issue-conventions.md`
  (`[type] Imperative summary`, one type label + one `risk-*` label).
- One worker = one small task = one PR; never review your own PR
  (reviewer role differs from implementer).

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
