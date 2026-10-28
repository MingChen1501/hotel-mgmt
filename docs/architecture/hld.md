# High-level design — small-hotel PMS

Status: active (accepted direction per ADR-0001, accepted
2026-10-23; outlines, not build detail). Owned by `architect`. This
document describes subsystem boundaries and their responsibilities.
It states no schema detail (`docs/architecture/erd.md`), no state
detail (`docs/architecture/state-machine.md`), no endpoint detail
(`docs/technical/api-spec.md`); per-module runtime notes below are
planning envelopes under the accepted ADR-0001 mapping.

Source requirements: `docs/requirements/mvp-requirements.md` (43 FRs /
14 NFRs) and `docs/product/mvp-scope.md`. Nothing here adds product
behaviour; all behaviour stays owned by `product-owner` and
`business-analyst`.

## 1. Context view

Actors: front-desk staff, manager, and hotel owner (the three roles;
guests have no sign-in per `NFR-SEC-1`). The system runs as one
on-premise installation per property and keeps working without
internet (`NFR-AVL-1`). There are no external integrations in the MVP:
no OTA/channel manager, no payment provider, no accounting export
(product scope, out of scope). The only outward flows are printed or
messaged artefacts (confirmations, invoices, receipts, reports) and
on-premise data export/backup (`FR-ADM-5`).

## 2. Container view

The installation is composed of the modules in section 4, each a
separately deployable container (see
`docs/architecture/system-architecture.md` for the deployable
topology), plus one shared database engine holding one dedicated
schema per module, plus Nginx as the single entry point and
reverse proxy on the hotel premises. Modules never share a
store (never shared tables even inside the shared engine); they
interact only through the named contracts in section 4.

## 3. Component view (per module)

Each module exposes its contract (section 4), enforces its own data
ownership, records its audit entries (`NFR-AUD-1`), and reads hotel
configuration from the Admin module at startup and on change. Shared
cross-cutting rules:

- Identity/RBAC: a single identity component (inside the Admin
  module) issues sessions; every module enforces role checks per
  `FR-ADM-2` / `NFR-SEC-1`, and every record carries UTC-offset
  timestamps rendered in hotel-local time (`NFR-TZ-1`).
- Audit trail: the owning module of each change records actor and
  timestamp immutably (`NFR-AUD-1`); there is no on-screen audit log
  view in the MVP (Later product capability) — recording only.
- Reporting read model: the Reporting module keeps its own read
  model, fed by domain events from the owning modules; it never
  reads other modules' stores directly.
- Per-hotel workflow customisation boundary: configurable items
  (section 6) live as data in the owning modules, editable through
  the desk with no code changes; the lifecycle order itself is fixed
  and not configurable.

## 4. Module boundary table

Every module has exactly one owning side and one data-store
ownership statement. Contracts are named. Candidate technologies are
proposals only.

| Module | Responsibility (FRs served) | Data ownership (one store owner) | Exposed contract | Proposed runtime / footprint (envelope note, `proposed`) |
|---|---|---|---|---|
| Reservations | Direct reservations, modify/cancel, walk-in, calendar, no-show (`FR-RES-*`) | Owns the reservation store: reservations, holds, cancellation records; no other module writes it | `ReservationService` (HTTP/gRPC); emits `ReservationEvents` | Go service (~30–50 MB RAM): static binary fits 2*4*50; goroutines serve the `NFR-CON-1` paired-booking guard; dedicated schema in the shared engine |
| Stay (front desk) | Check-in, check-out, room moves, early/late times, arrivals/departures (`FR-FDK-*`) | Owns the stay store: stays, room assignments, move history; no other module writes it | `StayService` (HTTP/gRPC); emits `StayEvents` | Node.js/TypeScript service (~100–150 MB): CRUD fit; shares one runtime with Rooms/Guests/Admin; dedicated schema in the shared engine |
| Rooms | Inventory, housekeeping states, out-of-order blocks, room setup (`FR-RMS-*`) | Owns the room store: rooms, room types, status history, blocks; no other module writes it | `RoomInventoryService` (HTTP/gRPC); emits `RoomStateEvents` | Node.js/TypeScript service (~100–150 MB): shared runtime with Stay; dedicated schema in the shared engine |
| Rates & Availability | Rate plans, availability counts, discounts, stay restrictions, price basis (`FR-RTE-*`) | Owns the pricing store: rate plans, restrictions, discount definitions, quoted price bases; no other module writes it | `PricingService` (HTTP/gRPC); emits `RateEvents` | Go service (~30–50 MB): quote latency for `NFR-PERF-1`; shares the Go toolchain; dedicated schema in the shared engine |
| Guests | Profiles, preferences, repeat-guest flag, confirmations (`FR-GST-*`) | Owns the guest store: guest profiles, preferences, stay links; no other module writes it | `GuestService` (HTTP/gRPC); emits `GuestEvents` | Node.js/TypeScript service (~100–150 MB): CRUD fit; shared runtime; dedicated schema in the shared engine |
| Billing | Folios, charges, payments, taxes/fees, day-close, settlement gate (`FR-BIL-*`) | Owns the folio store: folios, folio lines, payments, tax/fee rules, day-close totals; no other module writes it | `BillingService` (HTTP/gRPC); emits `FolioEvents` | Java 21 on Spring Boot, JVM mode (~350 MB RSS `estimate`): native `BigDecimal` money arithmetic in the team's main-stack framework; footprint math in `candidate-architectures.md` [section 8](candidate-architectures.md); Quarkus JVM-slim is the named footprint fallback; a second Spring-context service is explicitly out on 2*4*50; dedicated schema in the shared engine |
| Reporting | Occupancy, revenue, daily sheet, housekeeping reports (`FR-RPT-*`) | Owns the reporting read-model store, rebuilt from domain events; source records stay with their owning modules | `ReportingService` (HTTP read API) | Go service (~30–50 MB): event consumer + read API; no Python data stack needed at 50-room scale; own read-model schema in the shared engine |
| Admin & Config | Hotel profile, users/roles, room/rate setup, export/backup, per-hotel customisation values (`FR-ADM-*`, `FR-CUS-*`) | Owns the config store: hotel profile, users, roles, custom field/policy definitions, backup records; no other module writes it | `AdminService` (HTTP/gRPC); emits `ConfigChangedEvents` | Node.js/TypeScript service (~100–150 MB): config CRUD + identity sessions; shared runtime; dedicated schema in the shared engine |

Store note (shared engine, dedicated stores): the MVP uses one
shared database engine (accepted default PostgreSQL per ADR-0001,
accepted 2026-10-23; MySQL stays the named fallback) holding one
dedicated schema per module. Logical ownership is unchanged —
never shared tables, never cross-module reads — but a single
engine process (~256 MB) replaces eight engines to fit 2*4*50.
No new modules, no boundary changes: this section only records a
proposed runtime and footprint note per module.

## 5. Booking/availability path

A reservation request flows: desk client -> Reservations (validates
against Rates & Availability via `PricingService`: sellable count,
stay restrictions, price basis) -> checks room-type sellability
against Rooms via `RoomInventoryService` (excluding occupied, blocked,
already-reserved) -> creates the reservation and emits
`ReservationEvents`. Simultaneous bookings for the last sellable unit
resolve in the Reservations store so exactly one succeeds
(`NFR-CON-1`); simultaneous check-ins into one room resolve in the
Stay store (`NFR-CON-2`). Overbooking refusal names the conflict
(error semantics: `docs/technical/error-handling.md`).

## 6. Per-hotel workflow customisation boundary

Configurable as data (no code changes): required guest fields,
check-in/out times, cancellation reasons and wording, no-show rules,
open-balance check-out approval, charge items, taxes/fees,
restrictions, discounts (`FR-CUS-*`, requirements section 3.1).
Fixed in the MVP and not configurable: lifecycle order, one folio per
stay, one property per installation, the three roles, no event-driven
automation, cash and card only (requirements section 3.2). The Admin
module stores the configuration; owning modules enforce it and record
each change with actor and timestamp (`NFR-AUD-1`).

## 7. On-premise single-property deployment topology (summary)

One property runs one instance: Nginx, one container per module,
one shared database engine with one dedicated schema per module,
and an on-premise backup target — all fitting a single 2*4*50
host by default (per-module resource budget in
`docs/architecture/system-architecture.md` [section 3](system-architecture.md)), with the
small-cluster variant spreading the same components across 2–3
such hosts. Detail — containers, stores, proxy, backup target,
and the chain-ready non-MVP direction — lives in
`docs/architecture/system-architecture.md`. `NFR-DEP-1` holds: one
installation serves exactly one property.

## 8. Monorepo CI strategy and versioning

- Layout: one top-level directory per module plus shared contract
  definitions; each module carries its own build/test/run
  instructions.
- CI: one pipeline with per-module jobs for its own stack (three
  toolchains in the primary mapping: Node.js, Go, and one Spring
  Boot Java), a
  contract-check stage (consumer contracts against provider
  modules), and a packaging stage that bundles the whole system
  into the release bundle installed by the canonical
  `script/install.sh` (the installer path CI proves on every run),
  with the Ansible playbook as the offline-friendly alternative
  implementing the same steps. No CI workflow
  files were added by the change that wrote this section (out of
  scope at the time); the strategy was recorded here for the later
  pipeline issue. Pipeline note (landed after this section was
  written): the pipeline has since landed as
  `.github/workflows/ci.yml` and gates merges (#121). The strategy
  text itself is unchanged.
- Versioning: one repository tag versions a system release for a
  property; per-module versions are recorded in the release notes
  for traceability. Contract changes are versioned and announced;
  breaking changes require a deliberate decision, never a side
  effect.

## 9. Development strategy (options, not decided)

The candidate structures, per-hotel customisation mechanisms,
walking-skeleton scope, contract-first sequencing, and trade-offs
live in `docs/architecture/candidate-architectures.md` (active). That
document decides nothing: it lays out options with a recommendation under the
accepted ADR-0001 direction. The CI/versioning approach in section 8
above describes the accepted Candidate A (polyglot) shape; the
per-stack CI jobs, packaging detail, and environment inventory it
implies are DevOps follow-up work. The stack direction is chosen
(ADR-0001 accepted 2026-10-23); only measurement validation (the
OQ-C12 spike) remains.

## 10. Owner-acceptance checklist

- [ ] The owner confirms the eight module boundaries and their single
  data-store owners in section 4.
- [ ] The owner confirms the named contracts are the only
  cross-module interaction (no shared stores).
- [ ] The owner confirms chain-scale stays a non-MVP direction.
- [ ] The owner confirms all candidate technologies remain
  `proposed` and none is treated as decided.
- [ ] The owner confirms the CI/versioning approach in section 8.
- [ ] The owner has read the candidate options in
  `docs/architecture/candidate-architectures.md`; no direction is
  chosen by this checklist — the stack choice is recorded through
  the ADR-0001 acceptance answers.

Retirement note (2026-10-23): ADR-0001 was accepted (recorded on
issue #28 and in `docs/project/decision-log.md` D-7), so this
checklist is retired as satisfied. The unchecked boxes above are kept
as history and are not re-voted here; the acceptance answers live in
`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`
(Owner acceptance).

## 11. Desk UI migration shell (`/app/`) — scaffold (Refs #291)

Decision: ADR-0003 (accepted 2026-10-25) migrates the desk UI to
Vue 3 + Vite, CSR-only, static `dist/` served by the existing
Nginx. This section records the scaffold slice only (issue #291,
follow-up 1 of the ADR-0003 section 4 split plan): a placeholder shell
under `/app/` with no app routes. Real screen routes, the
catalogue layer, and decommission of the old pages are later
follow-ups and change nothing here.

Subsystem shape (parallel run throughout migration):

- New presentation subsystem: Vite + Vue 3 + Vue Router (history
  mode) + Pinia + TypeScript, built with Vite `base '/app/'` to a
  static `dist/` that is packaged into the Nginx image. No SSR
  runtime; no backend or contract change.
- Nginx serves the shell from a dedicated block alongside the
  untouched legacy pages: `location /app/` with `try_files $uri
  $uri/ /app/index.html;` (fallback is `/app/index.html`, NOT
  `/index.html` — owner-mandated correction carried from ADR-0003).
  Legacy static pages stay untouched at `/`; the `/docs` Swagger
  mirror stays intact.
- Shared Bearer API client plus one Pinia session store replace
  the per-page copy-pasted token blocks; single 401-to-sign-out
  path; token persistence is `sessionStorage` (survives reload,
  dies with the tab — see the delta in
  `docs/technical/security-threat-model.md` [section 4](../technical/security-threat-model.md) and ADR-0003
  Consequences).
- One new CI job (Node 22 + `npm ci` + build + test, matching the
  existing Node matrix) keeps the shell green; the change is
  purely additive.
- Placeholder route only: exactly one route renders; no app
  routes beyond the placeholder. Print routes are reserved to live
  under `/app/print/` (owner correction carried; no print route is
  implemented in this slice).

Flows with happy path + failure/rollback path (mermaid, with edge
traces to the intended `app/` files the implementation PR must
create) live in `docs/architecture/lld.md` [section 11](lld.md): placeholder
render, shared-client 401-to-sign-out, and offline
banner/manual retry (explicitly no write queueing — desk actions
are synchronous authoritative ops, per ADR-0003 criterion 9).

Rollback: revert the single implementation PR and remove the
`/app/` location block; the old static files remain in place, so
there is no data migration in either direction.

## 12. Desk UI styling pass (Refs #338) — presentation only

Phase 1 UI contract (product-owner contract comment on #338,
proposed tier T2 — reader-visible UI change, no behaviour change):
the Vue desk under `/app/` becomes MVP-usable for a non-technical
stand-in. The requirements delta lives in
`docs/requirements/mvp-requirements.md` [section 8](../requirements/mvp-requirements.md) (`FR-DSP-*`,
`NFR-DSP-*`, landed via #344); the build-ready decomposition and
per-flow diagrams live in `docs/architecture/lld.md` [section 12](lld.md). This
section records only the subsystem-boundary position.

No new subsystem, no boundary change, no contract change:

- Presentation only. The six existing routes (`/app/`,
  `/app/book`, `/app/stay`, `/app/folio`, `/app/print`,
  `/app/admin` — router in `app/src/router.ts:24-60`, plus the
  placeholder catch-all at :55-59) are the
  complete set; no screen or flow is added, removed, or renamed.
  All module boundaries (section 4), named contracts, and data-store
  ownership statements stand unchanged.
- Styled shell. One top-nav shell (Desk · Book · Stay · Folio ·
  Print · Admin, then the signed-in user name, then Sign out;
  active-route highlight; single centred content column, max width
  1100px; shell-owned sign-in gate replacing the per-screen
  sign-in copies) wraps the existing screen SFCs. The admin
  console additionally hides every management section from
  front-desk callers as a cosmetic layer over the server-side
  `FORBIDDEN` refusals (Refs #355); behaviour — who may do what —
  is unchanged. The offline
  banner and manual retry stay exactly as they are
  (`app/src/App.vue:1-28`, `app/src/api/client.ts:44-85`).
- Styling mechanism. PrimeVue is added as a dependency with a
  stock preset theme fed by the contract section 1 tokens (colours,
  type, spacing, 2px focus ring); no custom design system beyond
  the tokens. The only stylesheets that exist today are the print
  isolation blocks (`.print-document` markup at
  `PrintView.vue:105,219,300` under `@media print` at
  `:1239` within the `:1233-1257` style block, and the book
  confirmation isolation at `BookView.vue:973-986`) —
  preserved byte-for-byte in behaviour.
- State wording. Loading/empty/error/refusal states render as
  plain non-technical sentences per `FR-DSP-3`; refusal
  conditions are unchanged — only the wording becomes
  stand-in readable. All user-visible strings stay in the
  catalogue (`NFR-I18N-1` holds): the default-locale `messages/en.json`
  beside the Vietnamese `messages/vi.json` for the pilot desk (Refs #356),
  resolved through `app/src/i18n/` with fallback to English.

Rollback: revert the single Phase 2 implementation PR; no data
migration exists in either direction (no contract or schema change
anywhere in this slice).

## 13. Desk UI design rollout (Refs #419) — six-screen Claude UI

Owner-supplied finished design of six static screens plus a canvas
manifest as the desk UI target (owner note 2026-10-28,
authoritative over conflicting parts of #412). Screens in
canvas-manifest order: Main desk board (#420), Stay check-in/out
(#422), Onboarding setup wizard (#425), Rooms visual map (#424),
Book (#421), Folio (#423). Tier T2 (reader-visible UI change;
the spec-reviewer verdict on PR #426 accepts T2 over T3 on the
no-new-subsystem analysis recorded here). The product-owner
contract and done-conditions live in
`docs/product/desk-ui-design-rollout.md` and
`docs/product/acceptance-criteria.md` [section 11](../product/acceptance-criteria.md)
(PR #426); the requirements delta lives in
`docs/requirements/mvp-requirements.md` [section 10](../requirements/mvp-requirements.md)
(`FR-DSK-*`, `NFR-DSK-*`, PR #427); guard mapping lives with
`qa-lead` (D1–D9, PR #428). This section records only the
subsystem-boundary position; the build-ready decomposition and
the four per-flow diagrams the T2 gate requires live in
`docs/architecture/lld.md` [section 13](lld.md).

No new subsystem, no boundary change, no contract change — hence
no ADR:

- Presentation plus narrowly-scoped screen behaviour only. The
  four restyles (Main board restyle part of #420, Book #421,
  Stay restyle part of #422, Folio #423) reuse the existing
  operations in call order; refusal conditions, payloads, and
  envelopes stand (`docs/technical/error-handling.md`,
  `docs/technical/integration.md` C1–C11 unchanged).
- The Rooms visual map (#424) is a read-only projection over
  the existing room store: it renders `RoomInventoryService.
  ListRoomsByState` output grouped by floor with a
  summary-counts-must-match-cards invariant computed from the
  same payload. It owns no store, emits no events, and adds no
  transition — per-card actions are explicitly not specified
  until the #424 owner decision lands, and none are invented.
- The Onboarding wizard (#425) is a first-run navigation gate,
  not a module: it launches on an empty database only and
  persists step 1 through the existing Admin hotel-config
  surface (`AdminService.GetHotelConfig` /
  `UpdateHotelConfig`, `FR-ADM-1`); steps 2–4 need the
  `product-owner` spec (and owner decision where the design is
  silent) before building beyond step 1.
- Shared shell. The six screens share one shell: teal header
  `#0F4C47` showing the configured hotel name (example content
  from the design files is never hardcoded), primary buttons
  `#0F766E`, page `#F4F6F5`, ink `#1B2B2A`, 44px minimum
  targets, card radius 12px, VI-primary copy, nav tabs in
  canvas-manifest order (Main, Stay, Onboarding, Rooms, Book,
  Folio) with the active screen highlighted, plus a locale
  toggle switching the whole screen EN/VI. Within this
  rollout's scope the manifest tab set and order supersede the
  `FR-DSP-1` destination list; print and admin stay reachable
  as today. The current shell (`app/src/App.vue`
  `NAV_ITEMS` at :215-220, brand at the `shell-brand` span,
  locale switcher beside it) is the base the screen PRs extend.
- Data-store ownership (section 4) stands unchanged: the map
  reads room state, the wizard writes hotel config through
  Admin — no store gains a second writer, no module reads
  another module's tables.

Rollback: revert the per-screen implementation PRs
independently (#420–#425); the design files themselves are
unchanged, and no data migration exists in either direction.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
