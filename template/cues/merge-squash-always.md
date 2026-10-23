---
name: merge-squash-always
date: 2026-10-20
supersedes:
---
MERGE RULE: every merge is a squash merge with branch deletion. Never use --merge or --rebase. Only the orchestrator merges, and only after a recorded review verdict plus the risk gate; risk-high/risk-very-high or a missing risk label needs explicit owner approval.
