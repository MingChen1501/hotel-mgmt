# Onboarding runbook: new project to first guarded PR

Follow top to bottom on a brand-new repository. Bracketed values are
yours to set; `{{PLACEHOLDERS}}` are replaced by the installer (see
`README.md`) — after install no `{{...}}` token may remain:

```sh
grep -rE "{{(PROJECT_NAME|REPO_SLUG|DEFAULT_BRANCH|DOMAIN)}}" AGENTS.md config cues .opencode docs script .github || echo "no placeholders left"
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

What you get: `AGENTS.md`, `config/ao-project.jsonc` (AO project
config template), `cues/` (16 project-scoped rule cues),
`.opencode/` (11 role files, 5 skills, 2 commands, permission config,
guard plugin), `.github/` (issue form, PR template), `docs/` (index,
role rules, conventions, starter group), `script/` (footer, spawn,
merge, review wrappers, cue installer).

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

## Step 3 — cue import (project-scoped rules)

Cues are project-scoped: they live in the AO project, not in the
repo, so they do **not** travel with a template file copy unless this
installer runs. Import them now, right after the labels:

```sh
script/install-cues.sh --project [project-id]
```

Preview without writing first with `--dry-run`. The installer reads
`cues/*.md` (oldest date first, newest last — deterministic order),
validates each file's front-matter (`name`, `date`, optional
`supersedes:`) and its one-line prompt body, then checks
`ao cue list --project [project-id] --json` per cue: an identical cue
is skipped, a cue that exists with a different prompt is skipped
explicitly (update it in the AO desktop app — the CLI offers no
update, and the script never creates a duplicate), otherwise the cue
is created. Re-running is safe (idempotent).

Supersession rule — newest cue wins: every cue file carries a date
and an explicit `supersedes:` field naming older cue names it
overrides (empty when none). Where cues conflict, the older
conflicting text is marked superseded, never merged. Concretely,
`native-review-broken-manual` (2026-10-16) supersedes
`publish-and-review` (2026-10-14) for review mechanics: the older
file stays installed but its review path is legacy, and the newer
cue's manual fallback governs.

## Step 4 — AO project registration and config

Register the new repo as an AO project:

```sh
ao project add --name [repo] --path /path/to/[repo]
```

`[project-id]` is the id shown by `ao project ls` (derived from the
path unless overridden with `--id` at add time).

Then apply the **full** config object from `config/ao-project.jsonc`
(placeholders already replaced by the file installer; replace the
`example-provider/example-model` values with the project's harness
and model choices):

```sh
ao project set-config [project-id] --config-json '{
  "agentRulesFile": "docs/ao-rules.md",
  "agentRules": "WORKER RULES: never merge, never push to the default branch, never force-push; push only your own ao/* session branch; open the PR and end the turn with a done/checkpoint/stuck report containing PR/issue URLs and a test summary, and ping the orchestrator so it wakes.",
  "orchestratorRules": "POOL: exactly ONE task worker at a time, plus one buffer worker for issue creation only (exempt); a reviewer session counts as the task worker; queue further work and spawn the next task only when the slot frees; never batch-spawn. Session create/merge/review are orchestrator-only through script/ao-spawn-worker.sh, script/orchestrator-merge.sh and script/orchestrator-review.sh (marker plus live-orchestrator identity gated). The native AO reviewer is unreliable: do not retrigger stuck runs; follow the newest review cue (reviewer-worker-flow / native-review-broken-manual). Merge only with a recorded verdict plus green CI plus the risk gate; risk-high, risk-very-high, or a missing risk label needs explicit owner approval and the owner merges.",
  "defaultBranch": "[main]",
  "canonicalRepoURL": "https://github.com/[owner]/[repo].git",
  "worker": {"agent": "opencode-v2", "agentConfig": {"model": "example-provider/example-model"}},
  "orchestrator": {"agent": "opencode-v2", "agentConfig": {"model": "example-provider/example-model"}},
  "reviewers": [{"harness": "opencode-v2", "agentConfig": {"model": "example-provider/example-model"}}],
  "trackerIntake": {"repo": "[owner]/[repo]"},
  "autoReview": false,
  "workersRequestReview": false
}'
```

This `--config-json` form is mandatory: setting one field with a
flag replaces the whole config object, so a single-field update
silently drops every other setting (worker and reviewer settings
have been lost this way). Always pass the complete object and verify
afterwards with `ao project get [project-id] --json`.

`autoReview` stays `false` while the native reviewer is broken (see
Step 5): with it on, every worker PR would queue a stuck review run.
`workersRequestReview` stays `false` because reviews are
orchestrator-driven — workers never trigger or request their own
review. Re-enable either only after the reviewer sandbox is fixed
AO-side and a health check passes.

Confirm the project loads the guide: open any session in the project
and check the agent rules mention the project name.

## Step 5 — reviewer mode

Current mechanism: **separate reviewer session plus manual
fallback.** The orchestrator spawns one dedicated reviewer session
per PR (role `dev-peer-review` for code, `content-review` for prose
— always differing from the implementer; a review session counts as
the task worker under the pool). The reviewer never edits code; it
posts exactly one COMMENT verdict on the PR (`APPROVE` or
`CHANGES_REQUESTED` with findings by severity and `file:line`) via:

```sh
gh api repos/[owner]/[repo]/pulls/[n]/reviews -f event=APPROVE -f body="..."
```

The orchestrator then records the result so the merge gate can see
it:

```sh
ao review submit --session [worker-session-id] --run [runId] \
  --verdict approved
```

(`approved` or `changes_requested`; the run id is the one visible in
`ao review ls` for the worker session.) A review approval is
internal: it does not satisfy required or independent-account reviews
or branch protection — report what is still required instead of
working around it. If the reviewer finds blocking issues, the
orchestrator routes them to the implementer, who fixes on the same
branch, and the reviewer reviews the new head.

Legacy / disabled: **the AO native reviewer.** Native review runs
are unreliable (hangs with zero output, stuck runs that block the
next head — diagnosed 2026-10-16). Do not trigger native reviews as
the normal path and do not retrigger stuck runs; cancel a stuck run
and use the manual fallback above. `script/orchestrator-review.sh`
(the sanctioned trigger wrapper, marker-gated; direct
`ao review trigger` stays denied for every session) stays in the
tree for the day the reviewer sandbox is fixed AO-side, but until
then it is not the review path. Do not run both modes on the same
PR; the orchestrator picks the manual fallback per the
`native-review-broken-manual` cue and records which in its notes.

Either way: review happens **after the PR is up**, never before; no
session reviews its own PR; route findings to the responsible worker.

## Step 6 — guardrails

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

## Step 7 — first guarded PR and verification checklist

Owner requests flow through a fixed handoff: the buffer worker files
a skeleton issue from the owner request (context plus a short triage
note naming the suggested owning role and risk label, without full
acceptance detail); the orchestrator pulls the filed issue, confirms
the owning role, and spawns that role; the role worker first enriches
the issue (scope, acceptance criteria, constraints, open questions)
via an issue comment, then does the work. Issue footers name the
content-owner role — never `business-analyst` by default — or
`orchestrator` for process issues.

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

- [ ] Template installed; `grep -rE "{{(PROJECT_NAME|REPO_SLUG|DEFAULT_BRANCH|DOMAIN)}}" AGENTS.md config cues .opencode docs script .github` finds no placeholders.
- [ ] Risk + type labels exist; exactly one of each on every issue/PR.
- [ ] Cues imported: `ao cue list --project [project-id] --json` shows the expected cues, including the supersession pair (`native-review-broken-manual` supersedes `publish-and-review`), and no active cue tells workers to use `ao review trigger` as the normal path.
- [ ] AO project registered with the full `--config-json` object from `config/ao-project.jsonc` (`ao project get [project-id] --json` confirms `agentRulesFile`, pool rules, harness/model, reviewers, `trackerIntake`, `autoReview: false`, `workersRequestReview: false`).
- [ ] Reviewer mode recorded (separate reviewer session + manual fallback; native reviewer documented as disabled/legacy until the sandbox is fixed AO-side).
- [ ] Branch protection + least-privilege CI live (require PRs, require green CI, no direct pushes).
- [ ] `project-verify` skill filled in for the chosen stack (build/test commands, CI inventory, generated paths); `GENERATED_SEGMENTS` narrowed.
- [ ] One PR has gone from issue to squash-merge through the gate and the COMMENT verdict.
- [ ] `docs/README.md` covers all of `docs/` with no orphans or dead links.
