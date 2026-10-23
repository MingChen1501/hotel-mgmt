---
name: git-push-guardrails
date: 2026-10-20
supersedes:
---
GIT SAFETY: never push directly to master/main. Never use push --force, --force-with-lease, or --delete on a shared branch. Only push your own ao/* session branch with plain git push. All changes reach master via Pull Request. If your branch diverges, rebase or merge - never force.
