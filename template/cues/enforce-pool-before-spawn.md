---
name: enforce-pool-before-spawn
date: 2026-10-20
supersedes:
---
HARD LIMIT: before EVERY spawn run ao session ls and count active sessions. If the pool already has its task worker, STOP and queue; spawn later. One reviewer per PR; skip if the PR already has a verdict.
