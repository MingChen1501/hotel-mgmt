---
name: reviewer-worker-flow
date: 2026-10-22
supersedes:
---
REVIEW FLOW (owner choice 2026-10-22, option 1): PR review is done by a separate reviewer worker session, never by the native AO reviewer. After the implementer pushes a PR, the orchestrator spawns exactly one reviewer session with role dev-peer-review (code/tooling) or content-review (prose) or spec-reviewer (spec gate), differing from the implementer; the reviewer is read-only, posts ONE COMMENT verdict (APPROVE or CHANGES_REQUESTED with file:line findings and its role footer) with gh api repos/<owner>/<repo>/pulls/<n>/reviews, and the orchestrator records it with ao review submit --session <implementer-session> --run <runId> --verdict <approved|changes_requested>. A review session counts as the task worker under the pool. Never review your own PR; never merge from a reviewer session. If the reviewer finds blocking issues, the orchestrator routes them to the implementer, who fixes on the same branch and the reviewer reviews the new head.
