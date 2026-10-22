---
name: reviewer-worker-flow
date: 2026-10-22
supersedes:
---
REVIEW FLOW: PR review is done by a separate reviewer worker session, never by the native reviewer. After the implementer pushes, the orchestrator spawns exactly one reviewer session with a role differing from the implementer; the reviewer is read-only, posts ONE COMMENT verdict (APPROVE or CHANGES_REQUESTED with file and line findings), and the orchestrator records it with ao review submit --session <id> --run <runId> --verdict <approved|changes_requested>. A review session counts as the task worker under the pool. Never review your own PR and never merge from a reviewer session; route findings back to the implementer for fixes on the same branch.
