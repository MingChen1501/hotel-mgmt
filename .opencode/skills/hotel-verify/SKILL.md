---
name: Hotel verify
description: Placeholder verification rules for hotel-mgmt — the stack is undecided, so concrete build/test commands do not exist yet. Use when checking what "green" means for a change.
trigger: "Verifying a hotel-mgmt change or asking which build, tests, or CI checks apply: read this skill first."
---

# Hotel verify (placeholder — stack undecided)

No stack has been chosen for this project yet, so there are no
concrete build, test, or lint commands to allow-list or run.

## What to do until the stack is chosen

- Confirm the verification commands with the orchestrator/owner before
  treating any change as green.
- Never open a PR while verification is red or unknown.
- Keep changes scoped and describe in the PR body how they were
  checked (commands run + results), so the reviewer can reproduce.

## When the stack is chosen

Replace this placeholder with the real checklist:

- Build + serving commands (and their `.opencode/opencode.jsonc`
  allow-list entries).
- Test suites and their scope per change type.
- CI workflow inventory and what "green" requires.
- Any generated-output paths the project guard plugin must block.
