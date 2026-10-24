---
name: Project verify
description: Placeholder verification rules for {{PROJECT_NAME}} — the stack is undecided, so concrete build/test commands do not exist yet. Use when checking what "green" means for a change.
trigger: "Verifying a {{PROJECT_NAME}} change or asking which build, tests, or CI checks apply: read this skill first."
---

# Project verify (placeholder — stack undecided)

No stack has been chosen for this project yet, so there are no
concrete build, test, or lint commands to allow-list or run.

## What to do until the stack is chosen

- Confirm the verification commands with the orchestrator/owner before
  treating any change as green.
- Never open a PR while verification is red or unknown.
- Keep changes scoped and describe in the PR body how they were
  checked (commands run + results), so the reviewer can reproduce.
- No phantom promises: cite only guards, scripts, and CI jobs that
  exist (by `file:line` or job name). A verification claim must name
  a real guard file, a real script path, or a real CI job — never a
  planned-but-unwritten check.

## When the stack is chosen

Replace this placeholder with the real checklist:

- Build + serving commands (and their `.opencode/opencode.jsonc`
  allow-list entries).
- Test suites and their scope per change type.
- CI workflow inventory and what "green" requires.
- Any generated-output paths the project guard plugin must block.
- Single source of truth: name which `docs/` file is authoritative
  for the commands above, and keep module READMEs as thin stubs
  linking there — never the reverse.
