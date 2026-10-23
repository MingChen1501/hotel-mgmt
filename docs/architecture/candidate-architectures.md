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

Constrained on-premise envelope (owner hard constraints, issue #28,
2026-10-23 — all proposals below fit inside it, ADR-0001 still
`proposed`, nothing decided here):

- Monorepo is mandatory; every candidate below is a monorepo shape
  (the ADR-0001 polyrepo option is excluded, not re-evaluated).
- Minimum host: 2 vCPU / 4 GB RAM / 50 GB disk per host
  (owner notation `2*4*50`; reading to be owner-confirmed).
  Single-host default must hold all components; the small-cluster
  variant spreads the same components across 2–3 such hosts.
- Backend language pool (menu, not mandate): Java, Python,
  Node.js, Go, Rust. Every per-module pick below comes from this
  pool with a footprint note; nothing outside the pool is named.
- Frontend is free choice (proposed: static SPA served by Nginx,
  no SSR runtime).
- Infra menu: Ansible, mini-K8s (k3s/k0s-class), Nginx,
  Prometheus, Grafana. Minimal-subset rule: a component earns its
  place only with a written NFR + footprint justification; the
  default path is Ansible-driven plain containers, mini-K8s only
  for the cluster variant if the owner confirms it.
- Network: hotel LAN only; Tailscale for remote access; no inbound
  internet, no cloud dependency, offline-capable packaging and
  operation.
- Data menu: MySQL, PostgreSQL, Redis (or equivalent cache);
  Kafka only if justified — proposed OUT for the MVP (see section 2).

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
- One installation fits on a single 2*4*50 host by default
  (2 vCPU / 4 GB RAM / 50 GB disk); the cluster variant uses 2–3
  such hosts. The per-module resource budget in
  `docs/architecture/system-architecture.md` sums within one host.
- Monorepo is mandatory for every candidate (owner constraint);
  no candidate below re-opens the polyrepo question.
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
instructions and embeds its own (proposed) runtime.

Per-module language picks (all `proposed`, all inside the allowed
pool; footprint notes against a 2*4*50 host — three runtimes total,
team strength first, footprint budgeted):

| Module | Proposed language | Footprint note (why it fits 2*4*50) |
|---|---|---|
| Reservations | Go | Single static binary, ~30–50 MB RAM; goroutines serve the paired-simultaneous-booking guard (`NFR-CON-1`); no interpreter/JVM overhead |
| Stay (front desk) | Node.js / TypeScript | Simple CRUD desk flows; container ~100–150 MB; shares one runtime with Rooms, Guests, Admin |
| Rooms | Node.js / TypeScript | Same runtime as Stay; inventory reads stay in-process-cheap behind `RoomInventoryService` |
| Rates & Availability | Go | Quote path latency (`NFR-PERF-1`: views within 2 s) in a tiny binary; shares the Go toolchain with Reservations/Reporting |
| Guests | Node.js / TypeScript | Profile CRUD; same shared runtime as Stay |
| Billing | Java 21 on Spring Boot (JVM mode) | Exact `BigDecimal` money arithmetic in the team's main-stack framework; folio/day-close logic suits Java's type system; steady-state RSS ~350 MB (`estimate` inside the 229–389 MB measured band — see the section 8 footprint math, still inside one host) |
| Reporting | Go | Event consumer plus HTTP read API in the same small-binary profile; no Python data stack needed at 50-room / 2-year-report scale |
| Admin & Config | Node.js / TypeScript | Config CRUD and identity sessions; same shared runtime as Stay |

Three runtimes total (Node.js + Go + one Spring Boot Java) keep the installer
bounded and CI to three toolchains. Python stays in the pool as the
named fallback (Reporting data jobs — see section 8); Rust is unused
in this mapping — available if a module later proves it needs
Rust's profile, not spent upfront. Quarkus JVM slim (~180 MB) stays
the named footprint fallback and Billing-on-Go the named
revert if the Spring measurement misses (see OQ-C10).

Data ownership: one logical store per module on the database host(s);
each module connects only to its own store (HLD section 4, ERD
ownership notes). Cross-module reads go through the named contracts;
the Reporting read model subscribes to domain events. Minimal-subset
data picks (all `proposed`):

- One shared database engine (proposed default: PostgreSQL; MySQL
  kept as the named alternative — open question OQ-C8) holding one
  dedicated schema per module: dedicated logical stores, one engine
  process (~256 MB) instead of eight engines. Shared engine,
  never shared tables.
- No Kafka in the default path: single-property event volume (tens
  of events per minute) does not justify Kafka's ~1 GB+ footprint.
  Domain events travel via a transactional outbox table in each
  module schema plus a lightweight dispatcher (polling /
  LISTEN-NOTIFY) that the Reporting consumer reads; cross-module
  command calls stay synchronous HTTP behind Nginx. Kafka stays a
  named-but-excluded option (open question OQ-C7).
- No Redis in the default path: at 50-room scale with 5 concurrent
  staff, in-process caches plus one tuned engine meet `NFR-PERF-1`
  without a separate cache process; Redis is re-opened only if
  measured views miss 2 s (fallback trigger, not a day-one part).

Deployment: single 2*4*50 host by default — Nginx as the single
entry point and reverse proxy, eight module containers (three
runtimes), one database engine, Prometheus + Grafana, and the
backup staging area on one on-premise host. Small-cluster variant —
the same containers and the database spread across 2–3 such hosts
on the hotel LAN; inter-component endpoints use
configuration/service names so a container moves between hosts
without image changes (`docs/architecture/system-architecture.md`
portability rules). Packaging is Ansible-driven and offline: one
bundle (container images + playbooks + versioned per-hotel config)
installed from local media with no registry and no internet at
install time; mini-K8s (k3s-class) is NOT in the default path —
plain containers via Ansible, with k3s only as the cluster-variant
option the owner confirms (open question OQ-C6). The full
per-component RAM/vCPU/disk budget that sums within one host lives
in `docs/architecture/system-architecture.md` section 3.

Monitoring and network (all `proposed`, all owner-listed tooling):

- Prometheus scrapes module `/healthz` + `/metrics` endpoints and
  host stats (~150–200 MB); Grafana serves on-prem dashboards and
  may be stopped to reclaim ~150 MB RAM without losing metric
  retention. No cloud monitoring, no external push targets.
- Desk clients reach Nginx over the hotel LAN only; remote access
  (vendor support, owner review) goes over Tailscale; no inbound
  internet exposure, no external callbacks, updates applied from
  local media.
- Frontend: static single-page app (framework free choice;
  `proposed`: Vue or React build) served directly by Nginx — zero
  extra runtime processes on the host.

Consequences: follows the recorded owner direction (Option A
accepted 2026-10-23: per-module freedom inside the allowed pool);
per-module tool fit (Go concurrency/quote paths, Java money
arithmetic, versus Node.js desk CRUD) within three slim runtimes; atomic cross-module
change in one commit; fits the 2*4*50 envelope per the
system-architecture budget. Costs: one pipeline builds and tests
three stacks with a contract-check stage (slower, more complex than
single-stack); contract discipline is load-bearing; hiring and
maintenance span three ecosystems; packaging must bundle and verify
three runtimes plus the offline bundle on a small host.

## 3. Candidate B — modular monolith with strict module boundaries, one stack, extracted later

Status: DEMOTED for the MVP (retained for the record, not
recommended). It respects the monorepo-mandatory constraint, but it
contradicts the confirmed owner direction (Option A accepted
2026-10-23: per-module language freedom), and its single-process
fault domain puts the whole desk at risk on one constrained host
until the extraction migration it defers. It is re-opened only if
the owner explicitly trades per-module freedom for the fastest
first install.

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
host sizing bar — the smallest 2*4*50 footprint of the three
candidates. Costs: contradicts the confirmed owner polyglot
direction for the MVP (the reason for demotion); extraction into
services later is a deliberate migration project (contract names
survive, but deployment, config distribution, and failure
isolation must be re-proven); a single process means one module's
fault can affect the whole desk until extraction — the sharpest
risk on a single small host with no spare capacity to absorb it;
boundary discipline needs constant enforcement because
in-process shortcuts are always tempting. A single-stack Java
variant of B is not proposed: a full Spring-class process would
spend the one-process headroom advantage for no MVP reason.
Data/packaging/
monitoring/network follow the same minimal-subset picks as
Candidate A (one shared engine, Ansible + plain containers,
Nginx entry, Prometheus + Grafana, LAN + Tailscale, no Kafka)
if B is ever re-opened.

## 4. Candidate C — single shared-stack monorepo with per-module packages (fallback)

A middle position and the named fallback: deployable modules like
Candidate A, but every module is built on one shared stack with
per-module packages and shared platform libraries in the same
monorepo.

Structure and module layout: one monorepo holding eight module
packages (one directory per module, each with its own build/test/run
instructions) plus shared platform packages owned centrally
(contracts, error envelope, identity/RBAC helpers, audit helpers,
configuration schema, message catalogue for `NFR-I18N-1`). All
packages use the same stack. Proposed shared stack (`proposed`,
inside the allowed pool): Node.js / TypeScript packages throughout
with one shared database engine holding one logical store per
module — chosen team-second (single skill profile, the most likely
team shape) while still fitting 2*4*50 (eight ~100–150 MB
containers plus one engine; see the system-architecture budget).
Go-throughout is the recorded alternative if the team leans Go.
Shared libraries may only carry cross-cutting plumbing —
never module business logic — and platform changes follow a
deprecation rule so one module's upgrade never forces the others.

Data ownership: identical to Candidate A — one logical store per
module, named contracts only, Reporting read model from domain
events. The shared stack makes it cheaper to enforce uniform store
access plumbing (one data-access helper), but the logical ownership
rule is unchanged.

Deployment: identical placements to Candidate A (single 2*4*50
host default; small-cluster variant spreading the same containers
and the database across 2–3 such LAN hosts), but the installer
bundles one runtime instead of two: smaller image set, faster
install/upgrade, lower minimum host sizing than Candidate A for
the same topology. Data/packaging/monitoring/network follow the
same minimal-subset picks as Candidate A (shared engine, no
Kafka, no Redis day-one, Ansible + plain containers, Nginx
entry, Prometheus + Grafana, LAN + Tailscale).

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
plan) + Reservations (create one reservation) + Nginx + one shared
database engine + offline Ansible packaging + first backup run.

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

## 7. Trade-off table (against the 2*4*50 envelope)

| Dimension | A — polyglot modules, one monorepo (primary) | B — modular monolith, extract later (DEMOTED) | C — shared-stack module packages (fallback) |
|---|---|---|---|
| Monorepo-mandatory | Yes | Yes | Yes |
| Allowed-pool compliance | Yes: Node.js + Go + Spring Boot Java per-module picks, Python/Rust available as fallbacks | Yes (single pick from the pool) | Yes: Node.js throughout (Go-throughout alternative) |
| 2*4*50 single-host fit | Fits per the section 8 + section 3 budget (Spring Boot Billing ~350 MB `estimate`, headroom ~600+ MB kept; Quarkus fallback frees ~170 MB) | Fits with the most headroom (one process, one engine) | Fits (one runtime, one engine) |
| CI cost | Higher: three-toolchain jobs plus contract checks | Lowest: one toolchain, one build; boundary lint is the only extra | Medium: per-module jobs, one toolchain, plus contract checks |
| On-prem packaging | Medium-high: three runtimes in one offline Ansible bundle | Lightest: one runtime, smallest installer | Light: one runtime, module containers |
| Hiring | Three ecosystems (Node.js + Go + one Java service) | Narrowest: one skill profile | Narrow: one skill profile plus platform-library ownership |
| Per-hotel config ease | Event/cache distribution per module; reconciling story needed | Simplest: in-process reads, no distribution story | Shared schema package validates once; distribution as in A |
| Chain-readiness later | Most ready: deployable modules extend or gain central services | Least ready: extraction migration first | Ready: modules already deployable; platform libs shared across properties |
| Owner-direction fit | Matches the confirmed per-module-freedom direction | Contradicts it for the MVP (reason for demotion) | Partial: keeps modules-plus-monorepo, drops per-module stack freedom |

## 8. Recommendation (not a decision)

Primary mapping (Candidate A — three runtimes, minimal subset,
team strength first; Java Spring placed on Billing per the
2026-10-23 owner decision that Spring is the team's main stack —
the one module where a JVM earns its place inside
2*4*50):

| Module | Language | Store | Why (team strength first, footprint budgeted) |
|---|---|---|---|
| Reservations | Go | Dedicated schema in the shared engine | Tiny binary; concurrency guard `NFR-CON-1` |
| Stay | Node.js / TypeScript | Dedicated schema in the shared engine | CRUD fit; shared runtime ×4 modules |
| Rooms | Node.js / TypeScript | Dedicated schema in the shared engine | Shared runtime; cheap inventory reads |
| Rates & Availability | Go | Dedicated schema in the shared engine | Quote latency `NFR-PERF-1`; shared Go toolchain |
| Guests | Node.js / TypeScript | Dedicated schema in the shared engine | CRUD fit; shared runtime |
| Billing | Java 21 on Spring Boot (JVM mode) | Dedicated schema in the shared engine | Native `BigDecimal` money arithmetic + folio/day-close type safety in the team's main-stack framework; ~350 MB RSS `estimate` — the one Spring-context service the budget holds; footprint math below |
| Reporting | Go | Own read-model schema, rebuilt from outbox events | No Python data stack needed at this scale |
| Admin & Config | Node.js / TypeScript | Config schema in the shared engine | Config CRUD + identity; shared runtime |

Plus: Nginx entry; static SPA frontend (no SSR runtime);
PostgreSQL single shared engine (MySQL alternative open);
outbox-based events, no Kafka; no Redis day-one;
Ansible + plain containers offline, no mini-K8s by default;
Prometheus + Grafana on-prem; LAN + Tailscale, no inbound
internet.

Footprint math for Billing-on-Spring (why one Spring Boot JVM
fits inside 2*4*50, and what it costs versus the slim-Java
alternative): a Spring Boot 3.x-class service measures ~229–389 MB
RSS across the two sources already cited in section 10.1
(ankurm.com, Oct 2026; gillius.org, Oct 2025), with startup to
first response ~6 s class. Planning figures for the Billing
service (all `estimate`, all inside the measured band — the upper
end covers the JDBC/migration stack Billing carries): RSS ~350 MB
steady state, heap max sized ~256–512 MB, startup ~5–7 s to first
folio response, vCPU share ~0.1, disk ~0.4–0.5 GB with the shared
base layer. Nothing here is load-tested against hotel-MVP code —
OQ-C12 records the spike that would replace these estimates with
measured folio/day-close numbers. Versus the previous
Billing-on-Go estimate (~50 MB / ~0.1 GB) the Spring service costs
~+300 MB RAM and ~+0.3–0.4 GB disk. The section 3 budget therefore
rises from the ~3.2–3.25 GB band to ~3.37–3.42 GB of 4 GB RAM,
~1.7 of 2 vCPU, ~23.4 GB of 50 GB disk — still inside one 2*4*50
host with explicitly stated headroom of ~600+ MB RAM, ~0.3 vCPU,
and ~20 GB disk for burst, day-close, restore drills, and log
growth. No compensating trim is taken: the budget holds without
one, so no NFR coverage is touched. The named trims stay
available inside the minimal-subset rule if the OQ-C12 spike
measures worse than the planning figures (Grafana stopped by
default reclaims ~150 MB RAM without losing metric retention;
narrower Prometheus retention reclaims disk; the Quarkus JVM-slim
fallback below frees ~170 MB RAM) — each would be recorded
explicitly with numbers, never applied silently. The named
footprint fallback is the Quarkus JVM-mode service (RESTEasy
Reactive, no Spring context: ~150–180 MB RSS steady state,
~0.3 GB image — section 10.1), which frees ~170 MB RAM versus
Spring if team strength ever yields to footprint pressure; a
GraalVM native build of the same service (~60–80 MB RSS) is the
named optimisation behind that; the revert is Billing-on-Go
(~50 MB), which the fallback paragraph keeps available.
Reporting batch jobs and Admin/config were considered for Spring
and rejected: Reporting's event-consumer-plus-read-API profile
needs no JVM (Go binary suffices at this scale), and Admin/config
is CRUD that already shares the Node.js runtime — a second
Spring-context service anywhere else is explicitly OUT per the
minimal-subset rule (see E3 in section 10.4).

Fallback mapping (Candidate C — one runtime, team second): all
eight modules on Node.js / TypeScript with per-module packages
and shared platform libraries, same stores, same data/
packaging/monitoring/network picks as the primary. Take it if
the team is single-stack Node.js or if the three-toolchain CI cost
proves too high — it preserves deployable modules and the
contract investment while cutting packaging cost toward B
levels. Billing-on-Quarkus-JVM-slim stays the named footprint
fallback and Billing-on-Go the named revert if the Spring
measurement misses; Python/FastAPI (Reporting) stays the named
per-module fallback inside the pool if team strength or measured
behaviour demands it; neither is spent upfront.

Candidate B stays demoted: it fits only if the owner explicitly
trades the confirmed per-module-freedom direction for the
fastest first install and accepts a planned extraction project
later. This recommendation advises; the owner decides, and
ADR-0001 stays `proposed` until the owner accepts it.

## 9. Open questions for the owner

- OQ-C1 — Menu-not-mandate reading: is the minimal-subset rule
  right (Kafka, mini-K8s, Redis, second engine, Grafana-beyond-
  basic-metrics only with written NFR + footprint justification)?
- OQ-C2 — Walking-skeleton scope: is the section 6.1 slice (Admin,
  Rooms, Rates, Reservations plus proxy, store, packaging, backup)
  the right first proof, or should Billing/folio join it?
- OQ-C3 — 2*4*50 reading: confirm each host is 2 vCPU / 4 GB RAM /
  50 GB disk and the single-host default must hold the section 3
  budget (restates answered ADR-0001 OQ-A3; correct the reading
  here if it is wrong).
- OQ-C4 — Chain direction: extend these modules or add central
  services later (restates ADR-0001 OQ-A4; affects how much
  chain-readiness should weigh now)?
- OQ-C5 — Contract style: synchronous calls, asynchronous events,
  or per-pair choice (open point in `docs/technical/api-spec.md`
  section 3; the skeleton in section 6.1 should prove the chosen
  style first)?
- OQ-C6 — Cluster plumbing: plain containers via Ansible on each
  host, or mini-K8s (k3s-class) once more than one host is used
  (proposed: plain containers; k3s only with a written reason)?
- OQ-C7 — Kafka: confirm exclusion (proposed OUT; outbox +
  dispatcher covers single-property event volume; re-open only
  on measured need)?
- OQ-C8 — Default store: PostgreSQL (proposed: JSONB config,
  LISTEN/NOTIFY, single-engine footprint) or MySQL (fallback:
  wider hiring pool, simpler ops)?
- OQ-C9 — Frontend: confirm a static SPA served by Nginx (no SSR
  runtime), framework chosen at implementation time from the free
  choice?
- OQ-C10 — Billing-on-Spring runtime: confirm Java 21 on Spring
  Boot (JVM mode) for Billing with the section 8 footprint math
  (~350 MB RSS `estimate`, ~600+ MB headroom kept), the Quarkus
  JVM-slim footprint fallback, the GraalVM-native optimisation,
  and the Billing-on-Go revert — or direct Billing back to
  Quarkus/Go and name a different Spring entry point?
- OQ-C11 — Python-lightweight fallback: confirm FastAPI Reporting
  with the section 10 rules (worker cap 2, no pandas/numpy in the
  MVP image) as the sized per-module fallback inside the pool —
  or keep Reporting on Go with no Python fallback?
- OQ-C12 — Measurement spike: authorise a spike that runs the
  Billing Spring Boot service (JVM mode) under folio/day-close load
  (Quarkus slim as the fallback arm) and the FastAPI Reporting service (2 workers) under a 2-year
  report load on a 2*4*50-class host, and replaces the section 8
  and section 10 planning estimates with measured RSS/vCPU before any build?

## 10. Java-lightweight + Python-lightweight combined budget (issue #81)

Owner request 2026-10-23 (after Java placement in PR #80): check
whether lightweight Java AND lightweight Python options both fit
the 2*4*50 envelope (2 vCPU / 4 GB RAM / 50 GB disk per host,
single host default). The language pool (Java / Python / Node.js /
Go / Rust) already permits both; the question answered here is
footprint, not permission. This section revises the proposal with
numbers; it never decides — ADR-0001 stays `proposed`, module
boundaries stay as in HLD section 4, and no FR/NFR changes.

All figures below are steady-state RSS per component on the
default single host unless stated otherwise. Measured figures
cite their source; planning figures derived from them are marked
`estimate`. Nothing here is load-tested against hotel-MVP code —
OQ-C12 records the spike that would replace the estimates.

### 10.1 Java-lightweight: Quarkus or Micronaut (JVM mode)

Named runtime: Java 21 (LTS class) on Quarkus (RESTEasy Reactive,
no Spring context) or Micronaut (Netty-based HTTP, compile-time
DI) in JVM mode, for the placed module (Billing today; Rates or
Reporting if ever re-placed). Named version class: current LTS
line (Java 21+, Quarkus 3.x / Micronaut 4.x class).

| Metric | Quarkus JVM | Micronaut JVM | Source |
|---|---|---|---|
| RSS, small REST service (no DB) | ~172 MB avg | ~180 MB avg | Measured: 4-run avg after first 200 response, 2-vCPU container, first run discarded (ankurm.com, Oct 2026: Quarkus 171.6 MB / Micronaut 180.0 MB) |
| RSS, CRUD + JDBC + Flyway + Postgres | ~271 MB max | ~253 MB max | Measured: max RSS on M2 Pro, GraalVM Java 25, `/usr/bin/time -l` (gillius.org, Oct 2025: Quarkus 271.2 MB / Micronaut 253.2 MB) |
| Heap used (same CRUD app) | ~14 MB | ~18 MB | Measured (gillius.org, Oct 2025: Quarkus 14.4 MB / Micronaut 17.6 MB — most RSS is non-heap: metaspace, threads, JIT) |
| Startup to first 200 response | ~2.2 s (no-DB container); ~1.2 s (CRUD app) | ~2.5 s (no-DB container); ~0.7 s (CRUD app) | Measured (ankurm.com, Oct 2026; gillius.org, Oct 2025) |
| Container image | ~0.3–0.5 GB with the shared base layer | ~0.3–0.5 GB with the shared base layer | `estimate` from the JVM fast-jar artifact sizes (~14–21 MB app + base JDK layer; ankurm.com, Oct 2026) |

Planning figure for one slim-JVM service: RSS ~180 MB,
vCPU share ~0.1, disk ~0.3 GB (`estimate`, consistent with the
old section 3 row and inside the 172–271 MB measured band — the
upper end covers the JDBC/migration stack Billing carries).
Micronaut measures within the same band, so either framework
holds the same budget line; the pick between them is a team
call, not a footprint call. A Spring-context service is no
longer excluded per se: section 8 places exactly one on Billing
as the primary (team-strength call — Java Spring is the team's
main stack — at ~350 MB RSS `estimate`, inside the same 229–389 MB
measured band). Quarkus/Micronaut JVM mode is now the named
footprint fallback for that placement (~170 MB saving versus
Spring), not a second JVM elsewhere.

### 10.2 Java-lightweight native image (option, with build cost)

Named option: GraalVM/Mandrel ahead-of-time build of the same
Quarkus or Micronaut service. Runtime numbers first:

| Metric | Quarkus native | Micronaut native | Source |
|---|---|---|---|
| RSS (REST, no DB) | ~34 MB | ~46 MB | Measured (ankurm.com, Oct 2026: 33.6 MB / 46.2 MB) |
| RSS (CRUD + JDBC) | ~71 MB | ~84 MB | Measured (gillius.org, Oct 2025: Quarkus 70.5 MB / Micronaut 83.8 MB) |
| Startup | ~0.04 s | ~0.04 s | Measured (ankurm.com, Oct 2026: 0.035 s / 0.041 s) |
| Executable size | ~44 MB | ~54 MB | Measured (ankurm.com, Oct 2026) |

Planning figure: RSS ~60–85 MB per service (`estimate` — the
JDBC end of the measured band plus margin). Saving versus JVM
mode is ~100–120 MB RAM per service. Trade-offs, all documented:

- Build cost: 6–8 minutes wall clock on a 2-vCPU host (measured:
  6m22s Quarkus / 7m15s Micronaut; ankurm.com, Oct 2026);
  official guidance is 3–10 min builds needing 4–8 GB build-host
  RAM, with a documented minimum of 4 CPUs and 4 GB build memory
  (quarkus.io native guides). The native build therefore cannot
  run ON the 2*4*50 target host — it runs on the CI/build
  machine and ships inside the offline bundle. It is a packaging
  input, never a host load.
- Peak throughput of the native build measures ~59% below JVM
  mode on the same workload (Quarkus 2026 perf-lab table:
  5,411 vs 13,265 tps) — irrelevant at 5-concurrent-staff scale,
  recorded so a later chain-scale revisit does not re-learn it.
- Status: named optimisation only. The default stays JVM mode;
  native is taken only if the OQ-C12 spike shows JVM mode
  missing its budget line.

### 10.3 Python-lightweight: FastAPI for Reporting / Rates-type workloads

Named runtime: FastAPI on Uvicorn (ASGI), current 0.3x/0.2x
class, under Gunicorn process management
(`uvicorn-worker` class) or plain `uvicorn --workers`, for
Reporting (read-model API + event consumer) or Rates-type
read-heavy workloads. Named version class: FastAPI 0.1xx /
Uvicorn 0.2x–0.3x class.

| Metric | Figure | Source |
|---|---|---|
| RSS, 1 Uvicorn worker idle | ~53 MB | Measured (markaicode, May 2026, 1-vCPU host: 52.8 MB idle) |
| RSS, 1 worker under 300-task load | ~57 MB (+~5 MB) | Measured (same source: 57.3 MB under load) |
| RSS per worker, warm, FastAPI + Pydantic models | ~60–120 MB | Typical observed range (renode.space, Oct 2026; deployhq survey: ~20 MB minimal baseline, +50–200 MB with app imports) |
| Gunicorn master baseline | ~30–60 MB | Observed baseline (renode.space, Oct 2026) |
| Async sizing rule | workers = cores or cores+1 | Async workers hold thousands of connections each; more workers only add RAM (deployhq guide) |

Worker cap (binding rule for the MVP): 2 workers per
FastAPI service on the 2-vCPU host. The classic
`(2 × cores) + 1 = 5` rule is a sync-WSGI rule and is
explicitly NOT used here — 5 warm workers × ~120 MB would
spend ~600 MB for no CPU gain on 2 vCPU.

Planning figure for one FastAPI service (Reporting): RSS
~200 MB total (`estimate`: 2 workers × ~80 MB warm midpoint +
~40 MB master), vCPU share ~0.1, disk ~0.2–0.3 GB. Conditions:
no pandas/numpy in the MVP image — a pandas-loaded worker
measures 150–350 MB (renode.space, Oct 2026), which breaks
every fit verdict below and is excluded (see E3). The 2-year /
5-second report target (`NFR-PERF-2`) is met by the shared
engine + read model, not by in-Python analytics.

### 10.4 Combined budget: Spring primary with the lightweight fallbacks (worst case)

Baseline is the section 8 primary mapping:
~3.37–3.42 GB of 4 GB RAM, ~1.7 of 2 vCPU, ~23.4 GB of 50 GB
disk (Billing Spring Boot JVM ~350 MB `estimate` + Reporting Go
~50 MB). Each row below swaps in the lightweight options and
re-checks all three dimensions per host. Deltas are `estimates`
from the planning figures above and in section 8.

| # | Combination (vs 2*4*50 per host) | RAM | vCPU | Disk | Verdict |
|---|---|---|---|---|---|
| B0 | Primary as-shipped (Billing Spring Boot JVM + Reporting Go) | ~3.37–3.42 GB | ~1.7 | ~23.4 GB | FITS — headroom ~600+ MB / ~0.3 / ~20 GB |
| B1 | Billing Quarkus JVM fallback + Reporting FastAPI (cap 2) | ~3.35–3.4 GB | ~1.7 | ~23.4 GB | FITS — footprint fallback plus Python fallback together still hold single-host |
| B2 | Billing Micronaut JVM + Reporting FastAPI (cap 2) | ~3.35–3.4 GB | ~1.7 | ~23.4 GB | FITS — same band as B1; framework pick is footprint-neutral |
| B3 | Billing native (~75 MB) + Reporting FastAPI (cap 2) | ~3.25–3.3 GB | ~1.65 | ~23.2 GB | FITS — most headroom of the Java+Python rows; pays the CI-build cost (10.2) instead of host RAM |
| B4 | Billing Spring Boot JVM + Rates FastAPI (cap 2) + Reporting Go | ~3.5–3.57 GB | ~1.75 | ~23.6 GB | FITS — headroom ~500+ MB; thinnest FITS row; the Grafana-stop trim is named if the spike measures worse |
| E1 | Reporting FastAPI UNcapped (5 workers × ~120 MB + master) | ~3.9–3.95 GB | ~1.85 | ~23.7 GB | EXCLUDED single-host — ~150 MB nominal headroom leaves no burst/day-close/restore margin; the worker cap (10.3) is what keeps B1/B2/B4 inside |
| E2 | Reporting FastAPI with pandas (150–350 MB × 2 workers) | ~3.65–4.1 GB | ~1.75–1.85 | ~24.0 GB | EXCLUDED for the MVP — upper end exceeds the envelope outright; analytics libraries are not an MVP dependency; re-open only with a measured `NFR-PERF-2` miss |
| E3 | Second full Spring-context service (~300–400 MB) anywhere — Billing already holds the one | ~3.65–3.8 GB+ | ~1.8+ | ~23.8 GB+ | EXCLUDED — one Spring-context service is the budgeted maximum; no Spring-context service enters any other module mapping |
| E4 | Native-image build ON the 2*4*50 host | n/a (build-time) | needs 4 CPUs | needs 4+ GB build RAM | EXCLUDED on-host — builds run on CI/build infra per 10.2; the host only ever runs the built artifact |

Small-cluster variant: none of the FITS rows need it — every
Java-light + Python-light combination inside the caps holds the
single-host default with burst margin. The cluster variant
(unchanged, `system-architecture.md` section 1) stays available
for growth or for any module that later proves the estimates
wrong via the OQ-C12 spike; it is not required by this analysis.

### 10.5 Recommendation update and open points

- Primary mapping per section 8: Billing on Spring Boot JVM mode
  (team-strength call, ~350 MB `estimate`), Reporting on Go
  (Candidate A). The section 8 math carries the budget; this
  section sizes the fallbacks against it.
- Footprint fallback now sized (was the primary): Billing on
  Quarkus/Micronaut JVM mode frees ~170 MB versus Spring
  (rows B1/B2) — usable if footprint pressure ever outweighs team
  strength, without re-opening the budget. The Candidate C
  (all-Node.js) fallback is untouched.
- Python fallback unchanged and still budgeted: Reporting on
  FastAPI with worker cap 2 and no pandas is a sized fallback at
  +~150 MB vs Go (row B1 against the Quarkus arm, row B4 against
  the Spring baseline) — usable if team strength or measured
  behaviour favours Python, without re-opening the budget.
- Native image stays a named optimisation with its build cost
  made explicit (CI-only, 4-CPU/4-GB build host, ~6–8 min per
  service): take it only on a measured miss, never by default.
- Micronaut is footprint-equivalent to Quarkus in both modes
  (within ~10 MB RSS everywhere measured); either satisfies the
  "Java-lightweight" option — no separate evaluation needed.
- Unmeasurable without a spike: Billing RSS under real
  folio/day-close load (the measured figures are generic CRUD
  apps, not hotel code); FastAPI Reporting RSS under a real
  2-year report load; day-close/restore burst peaks for every
  B-row. All three are OQ-C12; until the spike runs, the
  `estimate` planning figures above stand and nothing here is
  load-bearing for a build.

ADR-0001 stays `proposed`; this analysis advises only.

## 11. Supersede note (ADR-0001 accepted 2026-10-23)

ADR-0001 (`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`)
was accepted on 2026-10-23 (recorded on issue #28 and in
`docs/project/decision-log.md` D-7). The "ADR-0001 stays `proposed`"
and "nothing decided" lines kept in this document (the header, the
envelope note, and the section 8 / section 10 guards) are therefore
spent: they are preserved as the historical options record and are not
re-decided here. The accepted direction — monorepo polyglot with the
section 8 primary mapping, shared PostgreSQL engine (MySQL as fallback),
no Kafka, no Redis day-one, single 2*4*50 host default with
small-cluster variant — is authoritative in the accepted ADR, and
nothing in this document reopens it.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-107
