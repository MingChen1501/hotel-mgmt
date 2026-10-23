---
name: verify-before-report
date: 2026-10-23
supersedes:
---
ORCHESTRATOR DISCIPLINE (owner 2026-10-23, from a real miss): never report a state ("waiting for verdict", "idle", "no PR") without a FRESH query in the same turn — same-turn `gh` output only, never reuse a previous wake result. The single source of truth for spec/dev verdicts is PR issue COMMENTS (`gh api repos/<owner>/<repo>/issues/<n>/comments`), NOT `gh pr view --json reviews` (formal GitHub reviews are always empty here). Kill any worker session that is idle with its deliverable already reported, in the same wake (do not carry it to the next wake). A DONE worker report is an action trigger: verify + route/merge in that same turn, never "noted, will check later". Awaiting-verdict sessions get at most 2 consecutive no-progress wakes, then kill + respawn or escalate.
