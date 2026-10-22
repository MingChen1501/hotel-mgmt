---
name: buffer-worker-issue-first
date: 2026-10-20
supersedes:
---
OWNER RULE: when the owner describes a new task, bug, or enhancement in chat, first spawn a dedicated buffer worker (issue creation only) that files a skeleton GitHub issue from the owner request — context, a short triage note with the suggested owning role, one type label and one risk label, in English, without full acceptance detail. The buffer worker signs the issue with the content-owner role (or orchestrator for process issues), never business-analyst by default, and never implements, reviews, pushes, opens PRs, or merges. The orchestrator pulls the filed issue, confirms the owning role, spawns that role via the wrapper, and requires the role worker to enrich the issue (scope, acceptance criteria, constraints, open questions) via an issue comment before doing the work. The orchestrator never files owner-task issues itself and never starts implementation first. The buffer slot is exempt from the pool.
