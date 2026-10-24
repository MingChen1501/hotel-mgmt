---
name: Hotel verify
description: Verification rules for hotel-mgmt — stack decided per ADR-0001 (monorepo polyglot, accepted 2026-10-23) with live per-stack CI. Use when checking what "green" means for a change.
trigger: "Verifying a hotel-mgmt change or asking which build, tests, or CI checks apply: read this skill first."
---

# Hotel verify (stack decided — ADR-0001 accepted 2026-10-23)

The stack is decided: monorepo polyglot per
`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`
(accepted 2026-10-23; confirmed by the PO sync on issue #86) — Go on
Reservations/Rates/Reporting, Node.js/TypeScript on
Stay/Rooms/Guests/Admin, Java Spring Boot on Billing, one shared
PostgreSQL engine. Per-stack CI is live in
`.github/workflows/ci.yml` (path-filtered `go-matrix`,
`node-matrix`, `billing`, `contracts`, `migrate`, and `e2e` jobs).

## How to verify a change

- Read the per-stack skill before touching that stack — each carries
  its build/test/run/lint commands, module layout, conventions, and
  contract-check usage (`script/contract-check.sh`): `go-module`
  (Go), `node-module` (Node.js/TypeScript), `spring-module`
  (Spring Boot).
- Docs are the single source of truth: concrete build/test/run
  commands live in each `docs/architecture/services/*.md` (§7
  Operations); each `services/*/README.md` is a thin stub linking
  there, never the authority. If a service README and its design
  note disagree, the design note wins — file the README drift as a
  finding instead of following it.
- Build green before any PR; never open a PR while verification is
  red or unknown.
- Keep changes scoped and describe in the PR body how they were
  checked (commands run + results), so the reviewer can reproduce.
- No phantom promises: cite only guards, scripts, and CI jobs that
  exist (by `file:line` or job name). A verification claim must name
  a real guard file, a real script path, or a real CI job — never a
  planned-but-unwritten check.
