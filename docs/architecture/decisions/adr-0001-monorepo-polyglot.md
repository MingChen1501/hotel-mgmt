# ADR-0001: Polyglot modules in a single monorepo

Status: accepted (owner acceptance 2026-10-23, recorded from #28).
This record decides the repository and module structure for
hotel-mgmt: Option A (monorepo polyglot) with per-module stack
freedom from the allowed pool. Owned by `architect`.

Date: 2026-10-22 (proposed); accepted 2026-10-23.

## Context

The owner overview of 2026-10-22 gives the technical direction: the
system is built as distributed modules using multiple backend
technologies, kept in one repository (monorepo). The MVP is one
on-premise instance per hotel property (independent hotels under
50 rooms); multi-property (chain) operation is a later direction, not
MVP. The product scope (`docs/product/mvp-scope.md`, active) and the
MVP requirements (`docs/requirements/mvp-requirements.md`, active:
43 FRs / 14 NFRs) are decided; the accepted primary module-to-stack
mapping is decided in this ADR, and anything beyond it stays
undecided under menu-not-mandate.

## Options considered

### Option A — Single-language monorepo

One language and framework for every module in one repository.

- Upside: one toolchain, one CI story, easiest hiring for a single
  skill profile, simplest shared libraries and on-premise packaging.
- Downside: contradicts the owner direction toward multiple backend
  technologies; forces every module into one ecosystem even where
  another fits better (for example a reporting read model versus a
  transactional desk service).

### Option B — Polyglot modules in one monorepo (owner direction)

Distributed modules, each free to use the backend technology that
fits it best, all versioned and built from one repository.

- Upside: follows the owner direction; module teams (or successive
  contributors) pick fitting tools per module; atomic cross-module
  change in one commit; one checkout contains the whole system, which
  suits a single on-premise package per hotel.
- Downside: CI must build and test several stacks in one pipeline;
  contract discipline between modules becomes load-bearing; hiring
  and maintenance span more than one ecosystem; on-premise packaging
  must bundle heterogeneous runtimes.

### Option C — Polyrepo (one repository per module)

Each distributed module lives in its own repository with its own
versioning and pipeline.

- Upside: fully independent release cadence per module; smallest
  per-repository CI surface.
- Downside: contradicts the owner direction (monorepo); cross-module
  changes need coordinated multi-repository commits; harder to
  produce one coherent on-premise installer for a small hotel; more
  repository administration for a small team.

## Decision (accepted 2026-10-23)

Adopt Option A as named in the owner acceptance (Option B in this
ADR's "Options considered": polyglot modules in one monorepo):
one monorepo holding distributed modules that may use
multiple backend technologies, each module free to pick its stack
from the allowed pool (Java, Python, Node.js, Go, Rust; frontend
free choice). Concretely:

- Module boundaries follow the HLD (`docs/architecture/hld.md`).
  Each module owns exactly one data store; no shared database
  between modules. Modules interact only through named contracts
  (HTTP/gRPC/event), specified in `docs/technical/api-spec.md`.
- MVP deployment is one on-premise instance per property
  (`docs/architecture/system-architecture.md`). Chain-scale
  operation is an explicitly non-MVP direction and must not shape
  MVP module boundaries.
- The accepted primary mapping (minimal fitting subset,
  menu-not-mandate) is: Go on Reservations, Rates, and Reporting;
  Node.js/TypeScript on Stay, Rooms, Guests, and Admin & Config;
  Java Spring Boot on Billing; one shared PostgreSQL engine for the
  day-one stores. No Kafka; no Redis day-one.
- Delivery and runtime: Ansible plus plain containers, packaged to
  install offline; Nginx as entry; Prometheus plus Grafana on-prem
  for observability; LAN-only networking with Tailscale for remote
  access and no inbound internet exposure.
- Host model: a single 2*4*50 host (2 vCPU / 4 GB RAM / 50 GB disk
  per host) by default, with the small-cluster variant (same
  containers and database spread across a few on-premise LAN hosts).
- Menu-not-mandate: the lists above are the minimal fitting subset,
  not a mandate to use everything; anything beyond the minimum
  (Kafka, mini-K8s, extra stores, extra observability) needs a
  written reason tied to NFRs plus footprint justification on
  2*4*50 hosts.

## Owner acceptance (2026-10-23, recorded from #28)

Source: OWNER ACCEPTANCE comment on #28 (2026-10-23, in chat —
architect direction approved), plus the supporting owner inputs
already on #28 (monorepo mandatory; 2*4*50 minimum per host;
allowed backend pool and frontend free choice; Ansible +
mini-K8s-class + Nginx + Prometheus + Grafana; LAN-only +
Tailscale; data pool MySQL/PostgreSQL/Redis with Kafka only if
justified; menu-not-mandate clarification). Recorded answers:

- Option A ACCEPTED: monorepo polyglot, per-module stack freedom
  from the allowed pool.
- Primary mapping ACCEPTED: Go (Reservations, Rates, Reporting) +
  Node.js/TypeScript (Stay, Rooms, Guests, Admin & Config) + Java
  Spring Boot on Billing + shared PostgreSQL engine; no Kafka; no
  Redis day-one; Ansible + plain containers offline; Nginx entry;
  Prometheus + Grafana on-prem; LAN + Tailscale, no inbound
  internet; single 2*4*50 host default with small-cluster variant.
- Menu-not-mandate CONFIRMED: minimal fitting subset; extras need
  written NFR + footprint justification.
- Walking skeleton: Admin -> Rooms -> Rates -> Reservations +
  proxy/store/packaging/backup (+ Billing only if the owner later
  adds it — default without).
- Sizing: 2 vCPU / 4 GB RAM / 50 GB disk per host confirmed
  (owner notation 2*4*50).
- Chain: separate oversight service later; MVP boundaries
  unchanged.
- Stores and tooling positions: MySQL stays fallback store;
  mini-K8s only with written reason; Kafka stays OUT unless
  measured need; contract style per-pair choice during skeleton.

## Consequences

- CI cost: the single pipeline builds, tests, and packages multiple
  stacks; per-module jobs with a contract-check stage (see HLD).
  Slower and more complex than a single-stack pipeline, but one
  pipeline instead of one per repository.
- Shared contracts: module APIs and events are versioned contracts
  reviewed like code; breaking a contract is a deliberate,
  announced change, not a side effect.
- Versioning: one repository version tags the whole system for an
  on-premise release; per-module versions are recorded in the
  release notes for traceability, not as independent releases.
- On-prem packaging: the installer bundles every module runtime for
  one property; heterogeneous runtimes are a packaging cost the
  release process must cover and verify.
- Hiring and maintenance: contributors may need more than one
  ecosystem; module READMEs must document each module's own build,
  test, and run commands so a newcomer can work one module without
  learning all of them.

## Open questions (answered by owner acceptance 2026-10-23)

- OQ-A1 — ANSWERED: per-module technology freedom confirmed; the
  accepted primary mapping is Go (Reservations, Rates, Reporting),
  Node.js/TypeScript (Stay, Rooms, Guests, Admin & Config), and
  Java Spring Boot on Billing with a shared PostgreSQL engine
  (menu-not-mandate: extras need written NFR + footprint
  justification).
- OQ-A2 — ANSWERED: walking skeleton order is Admin -> Rooms ->
  Rates -> Reservations plus proxy/store/packaging/backup
  (+ Billing only if the owner later adds it — default without).
- OQ-A3 — ANSWERED: smallest supported host is 2 vCPU / 4 GB RAM /
  50 GB disk per host (owner notation 2*4*50); single-host default
  with small-cluster variant.
- OQ-A4 — ANSWERED: chain-scale later introduces a separate
  oversight service; MVP module boundaries unchanged.

## Owner-acceptance checklist

- [x] The owner confirms Option A as named in the acceptance
  (Option B in this ADR: polyglot modules in one monorepo) as the
  repository and module direction (2026-10-23, #28).
- [x] The owner confirms that chain-scale operation stays a non-MVP
  direction and does not shape MVP boundaries (separate oversight
  service later; 2026-10-23, #28).
- [x] The owner confirms the accepted primary module-to-stack
  mapping and the day-one exclusions (no Kafka, no Redis day-one),
  superseding the earlier "all candidates proposed" position
  (2026-10-23, #28).
- [x] The owner answers OQ-A1 through OQ-A4 (2026-10-23, #28;
  resolved above).
- [x] On acceptance the owner (or `product-owner` on the owner's
  behalf) flips this ADR status from `proposed` to `accepted`
  (done in this change: status `accepted` 2026-10-23).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-113
