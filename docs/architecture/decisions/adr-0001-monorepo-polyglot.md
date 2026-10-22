# ADR-0001: Polyglot modules in a single monorepo

Status: proposed (awaiting owner acceptance). This record proposes the
repository and module structure for hotel-mgmt; it decides nothing
until the owner accepts it. Owned by `architect`. All candidate
technologies named here are proposals, never decisions.

Date: 2026-10-22.

## Context

The owner overview of 2026-10-22 gives the technical direction: the
system is built as distributed modules using multiple backend
technologies, kept in one repository (monorepo). The MVP is one
on-premise instance per hotel property (independent hotels under
50 rooms); multi-property (chain) operation is a later direction, not
MVP. The product scope (`docs/product/mvp-scope.md`, active) and the
MVP requirements (`docs/requirements/mvp-requirements.md`, active:
43 FRs / 14 NFRs) are decided; the stack beyond the owner direction is
undecided, and this ADR must not decide it.

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

## Decision (proposed)

Adopt Option B: one monorepo holding distributed modules that may use
multiple backend technologies. Concretely:

- Module boundaries follow the HLD (`docs/architecture/hld.md`).
  Each module owns exactly one data store; no shared database
  between modules. Modules interact only through named contracts
  (HTTP/gRPC/event), specified in `docs/technical/api-spec.md`.
- MVP deployment is one on-premise instance per property
  (`docs/architecture/system-architecture.md`). Chain-scale
  operation is an explicitly non-MVP direction and must not shape
  MVP module boundaries.
- Candidate technologies per module stay `proposed` until the owner
  accepts a stack choice per module (or one shared stack). This ADR
  records no language or framework as decided.

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

## Open questions (for owner acceptance, not decided here)

- OQ-A1 — Is per-module technology freedom confirmed, or should the
  owner instead fix one shared backend stack for the MVP and revisit
  polyglot later?
- OQ-A2 — Which module, if any, should be built first as the walking
  skeleton that proves the contract and packaging approach?
- OQ-A3 — What is the smallest on-premise host the installer must
  support (CPU/RAM/disk), so packaging choices stay realistic?
- OQ-A4 — When chain-scale work starts, does it extend these modules
  or introduce new ones (for example a central oversight service)?

## Owner-acceptance checklist

- [ ] The owner confirms Option B (polyglot modules in one monorepo)
  as the repository and module direction.
- [ ] The owner confirms that chain-scale operation stays a non-MVP
  direction and does not shape MVP boundaries.
- [ ] The owner confirms that every candidate technology named in the
  HLD boundary table is still `proposed` (none treated as decided).
- [ ] The owner answers OQ-A1 through OQ-A4, or explicitly defers
  each with a date or milestone.
- [ ] On acceptance the owner (or `product-owner` on the owner's
  behalf) flips this ADR status from `proposed` to `accepted`.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
