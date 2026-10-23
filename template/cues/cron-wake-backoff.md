---
name: cron-wake-backoff
date: 2026-10-20
supersedes:
---
WAKE CADENCE: system cron wakes the orchestrator on a fixed interval while work is active. On each wake inspect state, act silently, and report only changes or decisions. Track consecutive no-op wakes: after 6 straight no-op wakes lengthen the interval (5 -> 15 minutes); tighten back when work resumes. Never disable wakes without owner approval.
