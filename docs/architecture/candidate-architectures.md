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
footprint first, team second):

| Module | Proposed language | Footprint note (why it fits 2*4*50) |
|---|---|---|
| Reservations | Go | Single static binary, ~30–50 MB RAM; goroutines serve the paired-simultaneous-booking guard (`NFR-CON-1`); no interpreter/JVM overhead |
| Stay (front desk) | Node.js / TypeScript | Simple CRUD desk flows; container ~100–150 MB; shares one runtime with Rooms, Guests, Admin |
| Rooms | Node.js / TypeScript | Same runtime as Stay; inventory reads stay in-process-cheap behind `RoomInventoryService` |
| Rates & Availability | Go | Quote path latency (`NFR-PERF-1`: views within 2 s) in a tiny binary; shares the Go toolchain with Reservations/Reporting |
| Guests | Node.js / TypeScript | Profile CRUD; same shared runtime as Stay |
| Billing | Java 21 on Quarkus (JVM mode, RESTEasy Reactive) | Exact `BigDecimal` money arithmetic in a slim JVM (~150–180 MB RSS, no Spring heap); folio/day-close logic suits Java's type system; see the section 8 footprint math — still inside one host |
| Reporting | Go | Event consumer plus HTTP read API in the same small-binary profile; no Python data stack needed at 50-room / 2-year-report scale |
| Admin & Config | Node.js / TypeScript | Config CRUD and identity sessions; same shared runtime as Stay |

Three runtimes total (Node.js + Go + one slim Java) keep the installer
bounded and CI to three toolchains. Python stays in the pool as the
named fallback (Reporting data jobs — see section 8); Rust is unused
in this mapping — available if a module later proves it needs
Rust's profile, not spent upfront. Billing-on-Go stays the named
revert if the slim-Java measurement misses (see OQ-C10).

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
entry point and reverse proxy, eight module containers (two
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
| Allowed-pool compliance | Yes: Node.js + Go + slim Java per-module picks, Python/Rust available as fallbacks | Yes (single pick from the pool) | Yes: Node.js throughout (Go-throughout alternative) |
| 2*4*50 single-host fit | Fits per the section 3 budget (three slim runtimes, one engine, no Kafka/Redis day-one; Billing Java adds ~+130 MB vs Go, headroom kept) | Fits with the most headroom (one process, one engine) | Fits (one runtime, one engine) |
| CI cost | Higher: three-toolchain jobs plus contract checks | Lowest: one toolchain, one build; boundary lint is the only extra | Medium: per-module jobs, one toolchain, plus contract checks |
| On-prem packaging | Medium-high: three runtimes in one offline Ansible bundle | Lightest: one runtime, smallest installer | Light: one runtime, module containers |
| Hiring | Three ecosystems (Node.js + Go + one Java service) | Narrowest: one skill profile | Narrow: one skill profile plus platform-library ownership |
| Per-hotel config ease | Event/cache distribution per module; reconciling story needed | Simplest: in-process reads, no distribution story | Shared schema package validates once; distribution as in A |
| Chain-readiness later | Most ready: deployable modules extend or gain central services | Least ready: extraction migration first | Ready: modules already deployable; platform libs shared across properties |
| Owner-direction fit | Matches the confirmed per-module-freedom direction | Contradicts it for the MVP (reason for demotion) | Partial: keeps modules-plus-monorepo, drops per-module stack freedom |

## 8. Recommendation (not a decision)

Primary mapping (Candidate A — three slim runtimes, minimal subset,
footprint first; Java placed on Billing per the 2026-10-23 owner
request — the one module where a JVM earns its place inside
2*4*50):

| Module | Language | Store | Why (footprint first, team second) |
|---|---|---|---|
| Reservations | Go | Dedicated schema in the shared engine | Tiny binary; concurrency guard `NFR-CON-1` |
| Stay | Node.js / TypeScript | Dedicated schema in the shared engine | CRUD fit; shared runtime ×4 modules |
| Rooms | Node.js / TypeScript | Dedicated schema in the shared engine | Shared runtime; cheap inventory reads |
| Rates & Availability | Go | Dedicated schema in the shared engine | Quote latency `NFR-PERF-1`; shared Go toolchain |
| Guests | Node.js / TypeScript | Dedicated schema in the shared engine | CRUD fit; shared runtime |
| Billing | Java 21 on Quarkus (JVM mode, RESTEasy Reactive) | Dedicated schema in the shared engine | Native `BigDecimal` money arithmetic + folio/day-close type safety; slim JVM (~150–180 MB RSS) — a full Spring-class heap (~300+ MB) is explicitly OUT; footprint math below |
| Reporting | Go | Own read-model schema, rebuilt from outbox events | No Python data stack needed at this scale |
| Admin & Config | Node.js / TypeScript | Config schema in the shared engine | Config CRUD + identity; shared runtime |

Plus: Nginx entry; static SPA frontend (no SSR runtime);
PostgreSQL single shared engine (MySQL alternative open);
outbox-based events, no Kafka; no Redis day-one;
Ansible + plain containers offline, no mini-K8s by default;
Prometheus + Grafana on-prem; LAN + Tailscale, no inbound
internet.

Footprint math for Billing-on-Java (why one slim JVM fits where
a Spring-class heap would not): a Spring Boot service idles at
~300–400 MB heap/RSS plus a ~200–300 MB layered image, which
would spend the whole ~900 MB headroom in
`docs/architecture/system-architecture.md` section 3 on one
module — rejected for the MVP. The proposed Quarkus JVM-mode
service (RESTEasy Reactive, no Spring context: ~150–180 MB RSS
steady state, ~0.05–0.1 vCPU share, ~0.3 GB image with the
shared base layer) costs only ~+100–130 MB RAM and ~+0.2 GB
disk versus the previous Billing-on-Go estimate (~50 MB /
~0.1 GB). The section 3 budget rises from ~3.1 GB to ~3.2–3.25 GB
of 4 GB RAM, ~1.6–1.65 of 2 vCPU, ~23.2 GB of 50 GB disk —
still inside one 2*4*50 host with ~750+ MB RAM, ~0.35 vCPU,
and ~20 GB disk headroom. A GraalVM native build of the same
service (~60–80 MB RSS) is the named optimisation if the JVM
measurement misses; the revert is Billing-on-Go (~50 MB),
which the fallback paragraph keeps available. Reporting batch
jobs and Admin/config were considered for Java and rejected:
Reporting's event-consumer-plus-read-API profile needs no JVM
(Go binary suffices at this scale), and Admin/config is CRUD
that already shares the Node.js runtime — a second JVM there
would spend footprint for no tool-fit gain.

Fallback mapping (Candidate C — one runtime, team second): all
eight modules on Node.js / TypeScript with per-module packages
and shared platform libraries, same stores, same data/
packaging/monitoring/network picks as the primary. Take it if
the team is single-stack Node.js or if the three-toolchain CI cost
proves too high — it preserves deployable modules and the
contract investment while cutting packaging cost toward B
levels. Billing-on-Go stays the named revert if the slim-Java
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
- OQ-C10 — Billing-on-Java runtime: confirm Java 21 on Quarkus
  (JVM mode) for Billing with the section 8 footprint math, the
  GraalVM-native optimisation, and the Billing-on-Go revert — or
  direct Billing back to Go and name a different Java entry point?

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-84
