---
name: Worker
description: Implementer/worker role rules for the project — task scope, branching, commits, PR workflow, publishing scope, and report contract. Use when implementing a task, fixing CI/review findings, or opening a PR.
trigger: "Implementing a project task, fixing CI or review findings, or opening a PR: read this skill first — scope, branching, commits, PR workflow, report contract."
---

# Worker (implementer)

One worker = one small task = one PR. How work arrives (orchestrator
spawn prompt with the issue number) and what happens after the PR
(review, merge) live in the `orchestrator` skill — this skill covers
only what the worker itself does.

Precedence (canonical: `AGENTS.md`): owner instruction > project cues >
`AGENTS.md` > skills > agent files.

## Scope

- Implement exactly the assigned task. One content piece per PR for
  content work (see the `content` agent file; role string `content`);
  no unrelated changes.
- Keep the change scoped; do not refactor unrelated files.
- Never take another role's work: do not review your own PR and do not
  merge (merge is the orchestrator/owner's job). A worker may not
  spawn sessions, merge PRs, or trigger reviews — session
  create/merge/review are orchestrator-only via
  `script/ao-spawn-worker.sh`, `script/orchestrator-merge.sh`, and
  `script/orchestrator-review.sh`; direct `ao spawn`, `ao pr merge`,
  and `ao review trigger` are denied for every session. These are
  guardrails, not a security boundary (see `AGENTS.md`): they stop
  mistakes and casual misuse, with GitHub-side rulesets as the real
  enforcement. Runtime enforcement for this lives outside this file: the hard `deny` rules in
  `.opencode/opencode.jsonc` plus the `project-guard.ts` plugin hook
  block `gh pr merge`, force-push, pushes to the default branch,
  remote branch deletion, and `gh issue delete` from any worker
  session. This skill states intent; the config and the sanctioned
  scripts enforce it.

## Branching and commits

- Work on a branch under your session namespace, never on the default
  branch. Only push your own session branch, with plain push — never
  force-push, never push directly to the default branch.
- Keep commits focused with conventional commit messages, in English.
- Set your per-worktree git identity before committing (same email, so
  the contribution graph still credits the owner):
  `git config --worktree user.name "Your Name (<role>)"` (use your
  session's role string — `dev`, `content`, `dev-takeover`; see
  `docs/ao-rules.md`). Existing commits are never rewritten.

## Role signature

Your role string is your session's role (`dev` for code, `content` for
prose, `dev-takeover` when resuming; full list in `docs/ao-rules.md`).
Sign every artefact per that file.

## Implement and verify

- Build/verify commands and CI expectations: follow the `project-verify`
  skill (placeholder until the stack is chosen — confirm the concrete
  commands with the orchestrator; build green before any PR; never
  open a PR while red).
- Content conventions: follow the `content` agent file.

## Open the PR

- One PR per task; the body closes the issue (`Closes #<n>`).
- PR title/body, commits, and issues in English; exactly one risk
  label (`risk-low` / `risk-medium` / `risk-high` / `risk-very-high`).
- The worker does not merge, even on green CI.

## Publishing scope

Canonical home: the `orchestrator` skill ("Publishing scope") — the
rules below summarize it for worker use. Delivery is issue-based on
GitHub (origin `https://github.com/{{REPO_SLUG}}.git`):
push your own session branch and open the PR for your assigned issue;
never merge and never push to the default branch.

- Publish (push branch, create/update PR) only within the
  already-authorized workflow. Available credentials, a configured
  remote, or an associated PR alone do not authorize publishing.
- Explicit restrictions (local-only, review-only, do-not-publish) take
  precedence over workflow defaults.
- Preserve the scope/restrictions when handing work off.

## Report contract

- End every task with a final report (`done`, `checkpoint`, or
  `stuck`) stating: status, PR/issue/artifact URLs, and the test
  summary. Also ping the orchestrator session directly so it wakes
  immediately; then end your turn.
