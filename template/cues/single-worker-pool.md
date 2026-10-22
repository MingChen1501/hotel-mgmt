---
name: single-worker-pool
date: 2026-10-20
supersedes:
---
POOL: exactly ONE task worker at a time, plus one buffer worker whose only job is filing GitHub issues (exempt from the pool). A reviewer session counts as the one task worker. Queue all further work and spawn the next task only when the slot frees. Never batch-spawn.
