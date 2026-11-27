---
name: merge-state-freshness
date: 2026-11-27
supersedes: owner-report-links
---
MERGE-STATE FRESHNESS (owner 2026-11-27, supersedes owner-report-links): NEVER state a PR's state (open, merged, waiting-for-owner, ready, conflict) from memory or from an earlier turn. Every mention of merge state MUST be produced by a query in the SAME turn — `script/merge-readiness.sh <pr...>` for readiness, or `gh pr view <pr> --json state,mergedAt` for open/merged — and the message must carry the full PR URL plus the head SHA you just read. A claim like "waiting for the owner to merge" without a same-turn query is a violation.
