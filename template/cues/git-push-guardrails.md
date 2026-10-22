---
name: git-push-guardrails
date: 2026-10-20
supersedes:
---
GIT SAFETY: never push directly to the default branch. Never use push --force, --force-with-lease, or --delete on a shared branch. Only push your own ao-namespaced session branch with plain git push. All changes reach the default branch via pull request. If the branch diverges, rebase or merge; never force.
