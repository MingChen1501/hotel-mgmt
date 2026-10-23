# AO + OpenCode agentic workflow template

Standalone template that installs the AO (agent orchestrator) +
OpenCode agentic workflow into a new project in one pass: the agent
guide, role files, skills, permission guardrails, issue/PR templates,
document taxonomy, and the installer.

## Prerequisites

- `git` and `gh` (authenticated: `gh auth login`), plus `perl`
  (the installer uses it for placeholder substitution).
- An AO (agent orchestrator) installation with permission to spawn
  worker sessions.
- A target git repository (created beforehand; the installer refuses a
  non-git directory).

## Quick start

From a checkout of this template (or from the source repo's
`template/` directory):

```sh
./template/script/install-template.sh --target /path/to/new-repo \
  --project-name "Example Project" \
  --repo-slug example-owner/example-project \
  --default-branch main \
  --domain example-domain
```

Preview without writing:

```sh
./template/script/install-template.sh --target /path/to/new-repo \
  --project-name "Example Project" \
  --repo-slug example-owner/example-project \
  --default-branch main \
  --domain example-domain \
  --dry-run
```

Then follow `ONBOARDING.md` (template documentation, never
installed): labels, cue import, AO project registration with the full
`--config-json` object, guardrails, first guarded PR.

## What gets installed

| Template path | Installed as | Notes |
|---|---|---|
| `AGENTS.md` | `AGENTS.md` | Placeholders replaced; no project-specific rules |
| `config/ao-project.jsonc` | same | Full AO project config template (pool rules, harness/model examples, reviewers, `trackerIntake`, `autoReview`, `workersRequestReview`); apply with `--config-json` |
| `cues/` | — (project-scoped, via `script/install-cues.sh`) | 18 rule cues with `name`/`date`/`supersedes` front-matter; newest cue wins on conflict |
| `.opencode/agents/` | `.opencode/agents/` | 11 roles: orchestrator, product-owner, business-analyst, architect, qa-lead, release-manager, spec-reviewer, dev-peer-review, content, content-review, buffer-worker |
| `.opencode/skills/orchestrator/` | same | Spawn/pool/review/merge rules |
| `.opencode/skills/worker/` | same | Implementer rules + per-stack entry points |
| `.opencode/skills/go-module/` | same | Go service workflow: commands, layout, contract checks, guards |
| `.opencode/skills/node-module/` | same | Node.js service workflow: commands, layout, contract checks, guards |
| `.opencode/skills/spring-module/` | same | Spring Boot service workflow: commands, layout, contract checks, guards |
| `.opencode/skills/spec-gate/` | same | T0–T4 tiers + gate procedure |
| `.opencode/skills/architecture/` | same | Audit method + spec layout |
| `.opencode/skills/project-verify/` | same | Placeholder until the stack is chosen |
| `.opencode/commands/` | same | `review`, `verify` shortcuts |
| `.opencode/opencode.jsonc` | same | Runtime deny rules (merge/force-push/default-branch/session control) |
| `.opencode/plugins/project-guard.ts` | same | Defense-in-depth shell/edit guard |
| `.github/ISSUE_TEMPLATE/` | same | `task.yml` + `config.yml` (blank issues disabled) |
| `.github/PULL_REQUEST_TEMPLATE.md` | same | Summary / Closes / Type / Risk / Test evidence |
| `docs/README.md` | same | Document index and taxonomy |
| `docs/ao-rules.md` | same | Normative role rules |
| `docs/project/issue-conventions.md` | same | Title+label convention |
| `docs/agentic-template/` | same | `bootstrap`, `conventions`, `gate`, `roles`, `extraction-plan` |
| `script/ao-role-footer.sh` | same | Role footer generator |
| `script/contract-check.sh` | same | Contract-check gate stub (SKIP until contracts/ lands) |
| `script/ao-spawn-worker.sh` | same | Only sanctioned spawn path |
| `script/orchestrator-merge.sh` | same | Only sanctioned merge path |
| `script/orchestrator-review.sh` | same | Sanctioned review-trigger path (legacy while native review is disabled) |
| `cues/*.md` | — (via `script/install-cues.sh`) | Source files for the project-scoped cues |
| `script/install-cues.sh` | — (runs from this checkout) | Cue installer: `--project <id> [--dry-run]`, idempotent, never duplicates |
| `script/install-template.sh` | — (installer itself; not installed) | File installer |

`README.md` and `ONBOARDING.md` (this directory) are template
documentation and are **not** installed.

## Placeholders

| Placeholder | Flag | Example |
|---|---|---|
| `{{PROJECT_NAME}}` | `--project-name` | `Example Project` |
| `{{REPO_SLUG}}` | `--repo-slug` | `example-owner/example-project` |
| `{{DEFAULT_BRANCH}}` | `--default-branch` | `main` |
| `{{DOMAIN}}` | `--domain` | `example-domain` |

All four flags are required. The installer fails if any `{{...}}`
token remains after substitution.

## Customising after install

- Fill in the `project-verify` skill once the stack is chosen
  (build/test commands, CI inventory, generated paths).
- Narrow `GENERATED_SEGMENTS` in `project-guard.ts` to the real build
  outputs.
- Write the first specs through the spec-gated workflow
  (`spec-gate` skill); flip `docs/README.md` rows to `active` as docs
  land.
