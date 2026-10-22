# Onboarding runbook: new project to first guarded PR

Follow top to bottom on a brand-new repository. Bracketed values are
yours to set; `{{PLACEHOLDERS}}` are replaced by the installer (see
`README.md`) — after install no `{{...}}` token may remain:

```sh
grep -r "{{" AGENTS.md .opencode docs script .github || echo "no placeholders left"
```

## Prerequisites

- A GitHub account with permission to create repositories.
- `git`, `gh` (authenticated: `gh auth login`), `jq` (the scripts
  parse `gh` JSON output with it), and `perl` (the installer uses it
  for placeholder substitution).
- Your language toolchain installed.
- An AO (agent orchestrator) installation with permission to spawn
  worker sessions.

## Step 1 — install the template

Create the target repo first (the installer copies files; it never
creates the repository):

```sh
gh repo create [owner]/[repo] --public --clone
```

Then install from a checkout of this template:

```sh
./template/script/install-template.sh --target ./[repo] \
  --project-name "[Project Name]" \
  --repo-slug [owner]/[repo] \
  --default-branch [main] \
  --domain [problem-domain]
```

Rules the installer enforces: the target must be a git repository
(refuses otherwise); existing files are never overwritten unless
`--force` is passed; `--dry-run` prints what it would do without
writing; re-running is safe (idempotent — only missing files are
copied, and placeholder substitution is re-applied). The installer
prints the next steps when it finishes.

What you get: `AGENTS.md`, `.opencode/` (11 role files, 5 skills,
2 commands, permission config, guard plugin), `.github/` (issue form,
PR template), `docs/` (index, role rules, conventions, starter
group), `script/` (footer, spawn, merge, review wrappers).

## Step 2 — GitHub label setup

Create the risk labels (exactly one per issue and PR):

```sh
gh label create risk-low --color 0E8A16 \
  --description "No user-visible behaviour change, nothing irreversible"
gh label create risk-medium --color FBCA04 \
  --description "User-visible change, reversible and guarded"
gh label create risk-high --color D93F0B \
  --description "Can break published URLs/content, weaken guards, or change how assets are served/cached"
gh label create risk-very-high --color B60205 \
  --description "Irreversible or high-blast-radius (data loss, breakage, guard removal)"
```

Create one label per type token as well (`feat`, `fix`, `docs`,
`test`, `ci`, `perf`, `a11y`, `i18n`, `chore`, `content`,
`security`); the full title+label convention lives in
`docs/project/issue-conventions.md`. If the creations above and that
doc ever drift, the doc wins.

## Step 3 — AO project registration and config

Register the new repo as an AO project and point every session at the
agent guide:

```sh
ao project add --name [repo] --path /path/to/[repo]
ao project set-config [project-id] --agent-rules-file AGENTS.md
```

`[project-id]` is the id shown by `ao project ls` (derived from the
path unless overridden with `--id` at add time). The rules-file path
is repo-relative, so every session loads the same rules.

Warning: `ao project set-config` replaces the whole per-project
config, even when focused flags are used. If the project already has
other settings (model, env, branch, reviewers), pass the complete
object with `--config-json` so nothing is dropped:

```sh
ao project set-config [project-id] --config-json \
  '{"agentRulesFile":"AGENTS.md","defaultBranch":"[main]"}'
```

Confirm the project loads the guide: open any session in the project
and check the agent rules mention the project name.

## Step 4 — reviewer mode

Default: **separate reviewer sessions, verdict as COMMENT.** The
orchestrator spawns one dedicated reviewer session per PR (role
`dev-peer-review` for code, `content-review` for prose — always
differing from the implementer). The reviewer never edits code; it
posts exactly one COMMENT verdict on the PR (`APPROVE` or
`CHANGES_REQUESTED` with findings by severity and `file:line`). A
review approval is internal: it does not satisfy required or
independent-account reviews or branch protection — report what is
still required instead of working around it.

Alternative: **AO native reviewer.** When the orchestrator is
configured that way, it may trigger the built-in reviewer with
`script/orchestrator-review.sh <worker-session-id>` (marker-gated;
direct `ao review trigger` stays denied for every session). The native
verdict still gates the merge the same way: APPROVE + green CI +
`risk-low`/`risk-medium` merges, anything else escalates. Do not run
both modes on the same PR; the orchestrator picks one per PR and
records which in its notes.

Either way: review happens **after the PR is up**, never before; no
session reviews its own PR; route findings to the responsible worker.

## Step 5 — guardrails

Markdown states intent; config + scripts enforce it:

- `.opencode/opencode.jsonc`: `ask` shell default plus hard `deny`
  rules (last match wins) — no `gh pr merge`, no force-push, no
  pushes to the default branch, no remote branch deletion, no
  `gh issue delete`, no direct session control (`ao spawn`,
  `ao review trigger`) from any session.
- `.opencode/plugins/project-guard.ts`: mirrors the gh/git denylist
  as defense in depth (permission `evaluate` hook only) and blocks
  edits to build-generated paths.
- `script/ao-spawn-worker.sh`: the only sanctioned spawn path
  (marker-gated to the orchestrator worktree).
- `script/orchestrator-merge.sh`: the only merge path — squash merge
  via `gh pr merge --squash --delete-branch` as a child process, only
  on OPEN PR + exactly one risk label (`risk-low`/`risk-medium`) +
  green CI. `risk-high`, `risk-very-high`, or a missing label needs
  explicit owner approval, and then the owner merges manually.
- `script/orchestrator-review.sh`: the sanctioned native-review
  trigger (only when the orchestrator uses native review mode).

These are guardrails, not a security boundary: they stop mistakes
and casual misuse. The real enforcement is GitHub-side branch
protection/rulesets (require pull requests, require green CI, forbid
direct pushes) — set those up in the repository settings as a
follow-up before the first merge.

## Step 6 — first guarded PR and verification checklist

Suggested first issue: a T0 docs-only change (e.g. the project scope
note) — no gate ceremony, exercises the whole pipeline:

1. File an issue with a risk label and a proposed tier
   (`spec-gate` skill: T0 needs no gate; T1 typo/test-only/dependency
   bump needs no new spec; T2 needs acceptance criteria + FR/NFR delta
   + traceability; T3 adds ADR + HLD with owner acceptance; T4 adds
   deployment/env/runbook deltas + rollback note).
2. For T2+: the orchestrator spawns the owning spec role(s), then
   `spec-reviewer`; implementation starts only on `SPEC-GATE PASS`.
3. A `dev` (or `content`) session implements on a feature branch,
   pushes, and opens a PR with `Closes #<n>`, the risk label, and the
   role footer.
4. The reviewer session posts one COMMENT verdict (`APPROVE` or
   `CHANGES_REQUESTED` + `file:line` findings).
5. On APPROVE + green CI + `risk-low`/`risk-medium`, merge with
   `script/orchestrator-merge.sh <n>`.

Smoke-test the spawn wrapper first (from the orchestrator worktree,
against a real open issue — the orchestrator gate applies even to
`--dry-run`; nothing is spawned):

```sh
script/ao-spawn-worker.sh --issue <n> --role dev --name smoke-test --dry-run
```

Adoption is done when every box is ticked:

- [ ] Template installed; `grep -r "{{" AGENTS.md .opencode docs script .github` finds no placeholders.
- [ ] Risk + type labels exist; exactly one of each on every issue/PR.
- [ ] AO project registered with `AGENTS.md` as the rules file.
- [ ] Reviewer mode chosen (separate sessions by default) and recorded.
- [ ] Branch protection + least-privilege CI live (require PRs, require green CI, no direct pushes).
- [ ] `project-verify` skill filled in for the chosen stack (build/test commands, CI inventory, generated paths); `GENERATED_SEGMENTS` narrowed.
- [ ] One PR has gone from issue to squash-merge through the gate and the COMMENT verdict.
- [ ] `docs/README.md` covers all of `docs/` with no orphans or dead links.
