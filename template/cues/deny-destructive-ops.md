---
name: deny-destructive-ops
date: 2026-10-20
supersedes:
---
HARD SAFETY: never run rm -rf outside your session workspace; never kill PIDs you do not own; no sudo; never touch ~/.ao, ~/.ssh, ~/.config, /etc, or other projects. If a task seems to require any of these, STOP and report to the orchestrator.
