---
name: no-kill-with-unpushed-work
date: 2026-10-20
supersedes:
---
BEFORE killing ANY worker session: check branch state for unpushed commits and whether its work reached the remote (PR opened). If work exists only locally, do not kill: push and open the PR first, or get explicit owner approval to abandon it. A done task with no PR and no artifact must never silently vanish.
