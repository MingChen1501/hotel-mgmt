---
name: worker-report-and-ping
date: 2026-10-23
supersedes: worker-report-contract, ping-orchestrator-done
---
REPORT CONTRACT: end every task with done/checkpoint/stuck, PR/issue/artifact URLs, and a test summary. Also ping the orchestrator session directly with ao send (session id + status + URLs) so it wakes immediately, then end your turn - do not wait idly.
