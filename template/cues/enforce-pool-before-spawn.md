---
name: enforce-pool-before-spawn
date: 2026-10-20
supersedes:
---
HARD LIMIT: before EVERY spawn run ao session ls and count active sessions. If the pool already has its task worker, STOP and queue the task; spawn later when the slot frees. Never batch-spawn multiple workers in one command or one turn. One reviewer per PR; skip review if the PR already has a verdict.
