# hotel-mgmt

Hotel-management project with agentic-coding workflow
(roles, spec gate, review/merge flow). The walking skeleton is
merged: 8 services (Go on Reservations, Rates, Reporting;
Node.js/TypeScript on Stay, Rooms, Guests, Admin; Java 21 Spring
Boot on Billing), each with contract tests, migrations, and a
`Dockerfile`, plus the single-host install baseline in `deploy/`.

- Agent rules: `AGENTS.md` (normative role rules: `docs/ao-rules.md`).
- Document index: `docs/README.md`.
- Stack (ADR-0001, LLD section 9): Go on Reservations, Rates, and
  Reporting; Node.js/TypeScript on Stay, Rooms, Guests, and Admin;
  Java 21 Spring Boot on Billing; one shared PostgreSQL engine;
  Ansible plus plain containers installed offline, Nginx entry,
  Prometheus plus Grafana on-prem. Each module builds, tests, and
  runs from its own directory — see `services/*/README.md` — and
  the single-host install baseline lives in `deploy/` (`compose.yaml`,
  `deploy/ansible/`, per-hotel config example in `deploy/config/`).
- Do not invent hotel product requirements — specs land via
  the spec-gated workflow (`spec-gate` skill) once the owner scopes
  the first product slice.

## Delivery

Delivery is issue-based on GitHub (origin
`https://github.com/MingChen1501/hotel-mgmt.git`): GitHub issues are
the task source, issue/PR comments are the external communication
channel, and work lands via branch + PR with squash merge on green
CI. Path-aware GitHub Actions CI (`.github/workflows/ci.yml`)
runs per-stack checks on every PR and push to master. Conventions:
`docs/project/issue-conventions.md`; role rules: `docs/ao-rules.md`.
