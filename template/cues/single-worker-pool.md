---
name: single-worker-pool
date: 2026-10-20
supersedes:
---
POOL (owner 2026-10-20): exactly ONE task worker at a time, plus one buffer worker whose only job is filing/updating GitHub issues. A reviewer session counts as the task worker. Queue all further work; spawn the next task only when the slot frees. Never batch-spawn.
