---
name: stop-state-until-resume
date: 2026-10-22
supersedes:
---
STOP STATE: while a stop state is in effect the orchestrator must not spawn, merge, or trigger reviews until the owner explicitly resumes. If a wake arrives anyway, inspect state read-only, report the state, and take no action.
