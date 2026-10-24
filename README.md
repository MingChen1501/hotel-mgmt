# hotel-mgmt

On-premise property-management system (PMS) for small hotels: one
monorepo holding eight deployable modules over a single shared
PostgreSQL engine, shipped as a single-host install per property
(with a small-cluster variant for hotels that spread across LAN
hosts). Product scope lives in `docs/product/mvp-scope.md`; system
design in `docs/architecture/system-architecture.md` and
`docs/architecture/lld.md`.

## Modules

| Module | Directory | Stack | Purpose |
|---|---|---|---|
| Reservations | `services/reservations` | Go | Bookings and availability holds |
| Rates | `services/rates` | Go | Rate plans and price quotes |
| Reporting | `services/reporting` | Go | Operational and owner reports |
| Stay | `services/stay` | Node.js/TypeScript | Check-in, stay, check-out desk flow |
| Rooms | `services/rooms` | Node.js/TypeScript | Inventory and housekeeping states |
| Guests | `services/guests` | Node.js/TypeScript | Guest profiles and preferences |
| Admin | `services/admin` | Node.js/TypeScript | Per-hotel configuration and boot |
| Billing | `services/billing` | Java 21 Spring Boot | Charges, receipts, and settlement |

Each module builds, tests, and runs from its own directory following
its operations section in `docs/architecture/services/<module>.md`
(the `services/*/README.md` files are thin stubs that link there —
start from the service doc, not the stub).

## Prerequisites

- Go 1.24 (Reservations, Rates, Reporting).
- Node.js 22+ (Stay, Rooms, Guests, Admin).
- Java 21 and Maven 3.9+ (Billing; or use the
  `maven:3.9-eclipse-temurin-21` image).
- Docker with the compose plugin (full-stack runs, install, and demo).
- Minimum host sizing per
  `docs/architecture/decisions/adr-0001-monorepo-polyglot.md`:
  2 vCPU / 4 GB RAM / 50 GB disk per host (owner notation 2*4*50).

## Dev quickstart

Fastest path to a running desk loop on a dev machine:

1. Run one module from its directory per its §7 Operations section
   in `docs/architecture/services/<module>.md`.
2. Run the full stack locally with `deploy/compose.yaml`
   (see `deploy/README.md` for the service map and start order).
3. Prove the desk loop end to end with `script/e2e-desk-loop.sh`
   (book → check-in → charges → check-out → backup → restore drill
   → re-verify).
4. For an owner-visible walkthrough, use `script/demo-poc.sh` with
   the sign-off record in `docs/operations/demo-poc-checklist.md`.

Command detail lives in the linked sources — this README only points
at them.

## Prod install (single host)

The install baseline is `deploy/` (`compose.yaml`, `deploy/ansible/`,
per-hotel config example in `deploy/config/`, Nginx entry in
`deploy/nginx/`). Normative procedure:
`docs/devops/deployment.md`, section 3:

1. Prepare the hotel's configuration set from
   `deploy/config/hotel.example.json` (validation and secret rules:
   `deploy/config/README.md`). Never commit real hotel data.
2. Run preflight: `script/preflight.sh` (fails closed on default
   secrets and invalid sets).
3. Install with `script/install.sh` (preflight, then the install
   proof: desk-loop end to end, first backup, restore drill with
   desk-state verification), or the Ansible playbook in
   `deploy/ansible/` for offline-friendly targets.
4. Record the handover in
   `docs/operations/pilot-exit-checklist.md`.

Notes: LAN-only networking with Tailscale and the small-cluster
variant are covered in `docs/devops/deployment.md`; backup and
restore (`script/backup.sh`, `script/restore.sh`, RTO 4 hours) in
`docs/operations/backup-dr.md` and `docs/operations/runbook.md`.

## Docs

- Index: `docs/README.md` (single entry point for every document).
- Architecture: `docs/architecture/system-architecture.md`,
  `docs/architecture/hld.md`, `docs/architecture/lld.md`,
  `docs/architecture/services/` (per-module design and operations),
  `docs/architecture/decisions/adr-0001-monorepo-polyglot.md` (stack).
- Operations: `docs/operations/runbook.md`,
  `docs/operations/backup-dr.md`,
  `docs/operations/demo-poc-checklist.md`,
  `docs/operations/pilot-exit-checklist.md`.
- Deployment and CI: `docs/devops/deployment.md`,
  `docs/devops/ci-cd.md`.
- Testing: `docs/testing/test-strategy.md`,
  `docs/testing/test-report.md`,
  `docs/testing/traceability-matrix.md`.

## Delivery

Delivery is issue-based on GitHub (origin
`https://github.com/MingChen1501/hotel-mgmt.git`): GitHub issues are
the task source, issue/PR comments are the external communication
channel, and work lands via branch + PR with squash merge on green
CI. Path-aware GitHub Actions CI (`.github/workflows/ci.yml`)
runs per-stack checks on every PR and push to master. Conventions:
`docs/project/issue-conventions.md`; agent rules: `AGENTS.md`
(normative role rules: `docs/ao-rules.md`).
