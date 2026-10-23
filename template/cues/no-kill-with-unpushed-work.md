---
name: no-kill-with-unpushed-work
date: 2026-10-20
supersedes:
---
BEFORE killing ANY worker: check branchState for unpushed commits and whether a PR exists. If work exists only locally, do not kill - push and open the PR first, or get explicit owner approval to abandon. A done task with no PR and no artifact must never silently vanish.
