# Candidate architectures and development strategies

Status: active (options draft; nothing decided). Owned by `architect`.
This document lays out candidate architectures and development
strategies with trade-offs so the owner can choose. It decides
nothing: ADR-0001
(`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`) stays
`proposed`, module boundaries stay as defined in
`docs/architecture/hld.md` section 4, and no technology named here is
locked in — every example stack is marked `proposed` and serves as
illustration only.

Source requirements: `docs/requirements/mvp-requirements.md` (43 FRs /
14 NFRs, including the per-hotel customisation behaviour in
section 3), `docs/product/mvp-scope.md`, and the deployment frame in
`docs/architecture/system-architecture.md` (one on-premise
installation per property, single host by default with a small-cluster
variant) and `docs/devops/deployment.md`. Nothing here adds product
behaviour; all behaviour stays owned by `product-owner` and
`business-analyst`. Test levels referenced below (L1–L5) come from
`docs/testing/test-strategy.md`; install/upgrade/backup procedures
come from `docs/devops/deployment.md` and
`docs/operations/runbook.md`.

Downstream note: the system-design output in this document feeds
DevOps detailing — CI per stack, on-premise packaging, and
environment inventory (`docs/devops/ci-cd.md`,
`docs/devops/environment.md`, still stubs). That dependent work opens
after the owner chooses a stack direction; this document only records
what each candidate will demand from it.

## 1. What is fixed regardless of candidate

- Eight modules with the HLD section 4 responsibilities and the named
  contracts in `docs/technical/api-spec.md` (`ReservationService`,
  `StayService`, `RoomInventoryService`, `PricingService`,
  `GuestService`, `BillingService`, `ReportingService`,
  `AdminService` plus domain events).
- One logical data store per module; modules never share a store and
  never read another module's store directly (the Reporting read
  model is rebuilt from domain events).
- One installation serves exactly one property (`NFR-DEP-1`); no
  cloud, no cross-property traffic, working without internet
  (`NFR-AVL-1`).
- Per-hotel differences are configuration data, never code forks
  (the recorded sales constraint; requirements section 3.1
  configurable, section 3.2 fixed).

## 2. Candidate A — distributed polyglot modules in one monorepo (owner direction)

This is the ADR-0001 Option B shape already described in the HLD and
system architecture: each of the eight modules is a separately
deployable service, free to use the backend technology that fits it
best, all versioned and built from one repository.

Structure and module layout: one top-level directory per module plus
shared contract definitions (API shapes, event schemas, error
envelope). Each module directory carries its own build, test, and run
instructions and embeds its own (proposed) runtime. Example stacks,
illustration only, all `proposed`: Reservations on Python/FastAPI,
Stay/Rooms/Guests/Admin on TypeScript/Node, Rates on Python/FastAPI,
Billing on Java/Spring, Reporting on Python/FastAPI — exactly the
per-module proposals already listed in HLD section 4.

Data ownership: one logical store per module on the database host(s);
each module connects only to its own store (HLD section 4, ERD
ownership notes). Cross-module reads go through the named contracts;
the Reporting read model subscribes to domain events.

Deployment: single host by default — reverse proxy, eight module
containers, the database host, and the backup staging area on one
on-premise host. Small-cluster variant — the same containers and the
database spread across a few on-premise hosts on the hotel LAN;
inter-component endpoints use configuration/service names so a
container moves between hosts without image changes
(`docs/architecture/system-architecture.md` portability rules). The
on-premise installer bundles every module runtime for one property.

Consequences: follows the recorded owner direction; per-module tool
fit (transactional desk services versus the reporting read model);
atomic cross-module change in one commit. Costs: one pipeline builds
and tests several stacks with a contract-check stage (slower, more
complex than single-stack); contract discipline is load-bearing;
hiring and maintenance span more than one ecosystem; packaging must
bundle and verify heterogeneous runtimes on a small host.

## 3. Candidate B — modular monolith with strict module boundaries, one stack, extracted later

One deployable process (plus the database) built from strictly
separated in-repository modules; distribution into services is
deferred until after the MVP proves the boundaries.

Structure and module layout: one application with eight
boundary-enforced modules (Reservations, Stay, Rooms, Rates &
Availability, Guests, Billing, Reporting, Admin & Config) sharing a
single codebase and a single stack. Module isolation is enforced by
rule, not by network: modules interact only through the same named
contracts as Candidate A, expressed as in-process interfaces with the
identical operation and event names from
`docs/technical/api-spec.md`, so a later extraction keeps contract
names stable. Example stack, illustration only, `proposed`: a single
backend framework for the whole monolith (for example TypeScript/Node
or Python/FastAPI throughout) with one database engine holding eight
separate logical stores (separate schemas, one per module — no shared
tables across modules even inside one engine).

Data ownership: one logical store (schema) per module in the single
database; access is granted per module and cross-module table access
is forbidden by convention plus a CI boundary check (import/layer
lint). The Reporting module still builds its read model only from
domain events, never by reading other modules' tables, so extraction
later does not require a data untangling project.

Deployment: single host by default — reverse proxy, one application
container (or process), the database, and the backup staging area on
one on-premise host; the smallest installer of the three candidates.
Small-cluster variant — the monolith runs on one host while the
database (and optionally a second monolith replica is out of scope
for the MVP) sits on another LAN host; because module interaction is
in-process, spreading modules across hosts is not supported until
extraction — the cluster variant only separates the database and
backup target from the application host.

Consequences: simplest CI (one toolchain, fastest builds), simplest
packaging (one runtime), easiest hiring (one skill profile), lowest
host sizing bar. Costs: contradicts the owner polyglot direction for
the MVP; extraction into services later is a deliberate migration
project (contract names survive, but deployment, config
distribution, and failure isolation must be re-proven); a single
process means one module's fault can affect the whole desk until
extraction; boundary discipline needs constant enforcement because
in-process shortcuts are always tempting.

## 4. Candidate C — single shared-stack monorepo with per-module packages

A middle position: deployable modules like Candidate A, but every
module is built on one shared stack with per-module packages and
shared platform libraries in the same monorepo.

Structure and module layout: one monorepo holding eight module
packages (one directory per module, each with its own build/test/run
instructions) plus shared platform packages owned centrally
(contracts, error envelope, identity/RBAC helpers, audit helpers,
configuration schema, message catalogue for `NFR-I18N-1`). All
packages use the same stack. Example stack, illustration only,
`proposed`: TypeScript/Node packages throughout (or Python/FastAPI
throughout) with one database engine holding one logical store per
module. Shared libraries may only carry cross-cutting plumbing —
never module business logic — and platform changes follow a
deprecation rule so one module's upgrade never forces the others.

Data ownership: identical to Candidate A — one logical store per
module, named contracts only, Reporting read model from domain
events. The shared stack makes it cheaper to enforce uniform store
access plumbing (one data-access helper), but the logical ownership
rule is unchanged.

Deployment: identical placements to Candidate A (single host
default; small-cluster variant spreading the same containers and the
database across LAN hosts), but the installer bundles one runtime
instead of several: smaller image set, faster install/upgrade, lower
minimum host sizing than Candidate A for the same topology.

Consequences: keeps deployable-module benefits (fault isolation,
per-module restart, chain-ready extraction path) with single-stack CI
(one toolchain across per-module jobs plus the contract-check stage),
simpler packaging, and single-profile hiring. Costs: gives up
per-module tool fit (one ecosystem must serve transactional desk
services and the reporting read model); shared platform libraries
become a coordination point (a bad platform change touches all
modules); still contradicts a strict per-module polyglot reading of
the owner direction, though it keeps the monorepo-plus-modules shape.

## 5. Per-hotel customisation mechanism per candidate

The constraint is identical for all candidates: no code forks — the
release bundle is identical for every property and each hotel's
differences are carried in a versioned per-hotel configuration set
applied at install and re-applied at upgrade
(`docs/devops/deployment.md` section 2; requirements section 3.1 vs
3.2). What differs is how configuration is stored, distributed, and
enforced.

Candidate A: the Admin & Config module owns the config store and
emits `ConfigChangedEvents`; each module reads its configuration
values at startup and on change, caches them locally, and enforces
them (required guest fields, times, reasons, charge items, tax/fee
rules, restrictions, discounts). The per-hotel set is validated
against a versioned configuration schema at install time; a module
that cannot reach Admin & Config keeps serving with its last cached
values (offline-first per `NFR-AVL-1`) and reconciles on reconnect.

Candidate B: configuration lives in the Admin module's logical store
and is exposed to the other seven modules through an internal
configuration interface (same value names as the Candidate A
events, in-process). Enforcement is identical (owning modules enforce
their own values), but distribution is a database read, not an event
subscription — simpler, with no cache-reconciliation story needed
inside one process. The install-time schema validation of the
per-hotel set is unchanged.

Candidate C: the shared configuration-schema platform package
defines every customisable value once with validation rules; the
Admin module owns the values, distributes them like Candidate A
(events or fetch — an implementation choice the stack decision
settles), and every module validates against the same shared schema
version. The shared catalogue also carries hotel wording
(cancellation reasons and wording, confirmation/invoice text) so
per-hotel wording never forks message templates.

In all three, fixed MVP behaviour (lifecycle order, one folio per
stay, one property per installation, three fixed roles, no
automation, cash and card only — requirements section 3.2) is
enforced in module logic, never gated by configuration, so no hotel
setup can unlock what the MVP fixes; the L5 config-matrix checks
(`docs/testing/test-strategy.md`) re-confirm this per slice.

## 6. Development strategy

### 6.1 Walking skeleton first (recommended for any candidate)

Build one thin end-to-end slice before any full module: Admin &
Config (hotel profile, one user/role, minimal config set) +
Rooms (room-type setup, one room) + Rates & Availability (one rate
plan) + Reservations (create one reservation) + reverse proxy + one
database host + installer packaging + first backup run.

The skeleton proves three things before the team commits to breadth:

1. Contract discipline: a real Reservations→Pricing→Rooms call path
   through the named contracts (HTTP/gRPC plus one domain event
   end to end), with the contract-check stage running in CI.
2. Overbooking atomicity: the paired-simultaneous-booking guard for
   the last sellable unit (`NFR-CON-1`) passing against the real
   stores, not a mock.
3. Packaging: the on-premise installer puts the system on a
   representative host (or the small-cluster placement), the desk
   reaches it through the proxy, and the first backup reports
   success — the L4 install/backup frame exercised on day one.

### 6.2 Contract-first module sequencing (after the skeleton)

Freeze each contract pair in `docs/technical/api-spec.md` before
building the modules on either side; consumer modules write to the
frozen contract and the provider proves it with contract checks in
CI. Suggested build order after the skeleton: Guests (profiles,
preferences, confirmation record) → Stay (check-in/out, moves —
proves `NFR-CON-2` paired check-in) → Billing (folio, charges,
payments, taxes/fees, settlement gate) → Reporting (read model fed
by the now-flowing domain events) → hardening (day-close, export and
backup drills, role-matrix and lockout checks). Each slice fills its
L1 acceptance guards plus the L2/L3/L4/L5 verifications it touches,
per the entry/exit criteria in `docs/testing/test-strategy.md`.

### 6.3 Per-hotel config delivery during development

From the first slice after the skeleton, every install carries a
sample per-hotel configuration set (a second fictitious hotel setup
alongside the default) so L5 config-matrix checks run continuously:
each customisable item in requirements section 3.1 is exercised in
at least two distinct setups and the desk is re-exercised. The
delivery team rehearses the deployment handover check
(`docs/devops/deployment.md` section 3 step 6: hotel name, times,
charge items, one rate plan, one end-to-end test reservation) on
every release candidate, not only at first sale.

### 6.4 How testing and ops frames fill per slice

Testing frame (`docs/testing/test-strategy.md`): each slice fills
the guard slots it touches in `docs/testing/traceability-matrix.md`
— L1 per FR, L2 per touched NFR against numeric targets, L3 paired
concurrency wherever reservations or check-in change, L4
install/backup/restore drills per release, L5 config-matrix per
configuration change. Ops frame (`docs/devops/deployment.md`,
`docs/operations/runbook.md`, `docs/operations/backup-dr.md`): the
skeleton establishes install, health-check, and backup procedures;
each later slice extends the runbook only for behaviour it adds
(day-close totals, export, restore drill results). No slice is done
while its traceability rows stay TBD or its runbook delta is missing.

## 7. Trade-off table

| Dimension | A — polyglot modules, one monorepo | B — modular monolith, extract later | C — shared-stack module packages |
|---|---|---|---|
| CI cost | Highest: per-stack jobs plus contract checks; slowest pipeline | Lowest: one toolchain, one build; boundary lint is the only extra | Medium: per-module jobs, one toolchain, plus contract checks |
| On-prem packaging | Heaviest: heterogeneous runtimes bundled and verified per release; highest minimum host sizing | Lightest: one runtime, smallest installer, lowest host bar | Medium: module containers, one runtime; smaller than A |
| Hiring | Broadest: several ecosystems across modules | Narrowest: one skill profile | Narrow: one skill profile plus platform-library ownership |
| Per-hotel config ease | Event/cache distribution per module; reconciling story needed | Simplest: in-process reads, no distribution story | Shared schema package validates once; distribution as in A |
| Chain-readiness later | Most ready: deployable modules extend or gain central services | Least ready: extraction migration first | Ready: modules already deployable; platform libs shared across properties |
| Owner-direction fit | Matches the recorded polyglot direction | Contradicts it for the MVP; needs an explicit direction change | Partial: keeps modules-plus-monorepo, drops per-module stack freedom |

## 8. Recommendation (not a decision)

Recommended: Candidate A if the owner confirms per-module technology
freedom (ADR-0001 OQ-A1), because it matches the recorded owner
direction, keeps the already-specified HLD boundaries and contracts
without rework, and leaves the chain direction open without a later
migration. Fallback: Candidate C if the team is single-stack or host
sizing comes back tight — it preserves deployable modules and the
contract investment while cutting CI and packaging cost to near B
levels. Candidate B fits only if the owner explicitly trades the
polyglot direction for the fastest first install and accepts a
planned extraction project later. This recommendation advises; the
owner decides.

## 9. Open questions for the owner

- OQ-C1 — Per-module stack freedom or one shared stack for the MVP
  (restates ADR-0001 OQ-A1 against the three candidates: A versus C)?
- OQ-C2 — Walking-skeleton scope: is the section 6.1 slice (Admin,
  Rooms, Rates, Reservations plus proxy, store, packaging, backup)
  the right first proof, or should Billing/folio join it?
- OQ-C3 — Minimum host sizing: what CPU/RAM/disk must the installer
  support (restates ADR-0001 OQ-A3; decides between A's heavier
  bundle and C/B's lighter one)?
- OQ-C4 — Chain direction: extend these modules or add central
  services later (restates ADR-0001 OQ-A4; affects how much
  chain-readiness should weigh now)?
- OQ-C5 — Contract style: synchronous calls, asynchronous events, or
  per-pair choice (open point in `docs/technical/api-spec.md`
  section 3; the skeleton in section 6.1 should prove the chosen
  style first)?

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-84
