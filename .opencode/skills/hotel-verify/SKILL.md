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
- Concrete build/test/run commands live in each
  `services/*/README.md` (Go: `go build ./...` / `go test ./...`;
  Node: `npm run build` / `npm test` / `npm run lint`; Billing:
  the Maven commands in `services/billing/README.md`). Run the ones
  for every stack touched and confirm the commands with the
  orchestrator when in doubt.
- Build green before any PR; never open a PR while verification is
  red or unknown.
- Keep changes scoped and describe in the PR body how they were
  checked (commands run + results), so the reviewer can reproduce.
