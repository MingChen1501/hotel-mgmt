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
| Reservations | Direct reservations, modify/cancel, walk-in, calendar, no-show, check-out completion (`FR-RES-*`, `FR-DEP-1`) | Owns the reservation store: reservations, holds, cancellation records; no other module writes it | `ReservationService` (HTTP/gRPC); emits `ReservationEvents` | Go service (~30–50 MB RAM): static binary fits 2*4*50; goroutines serve the `NFR-CON-1` paired-booking guard; dedicated schema in the shared engine |
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
against Rates & Availability via `PricingService`: stay restrictions
and price basis; the sellable count is a desk-facing overview, not the
guard's ceiling since #631) -> derives the guard's ceiling from
`RoomInventoryService.CheckRoomTypeSellability` for the type and dates
(the date-ranged room inventory net of blocks, read server-side and
fail-closed, section 19) -> creates the reservation and emits
`ReservationEvents`. Simultaneous bookings for the last sellable unit
resolve in the Reservations store so exactly one succeeds
(`NFR-CON-1`); simultaneous check-ins into one room resolve in the
Stay store (`NFR-CON-2`). Overbooking refusal names the conflict
(error semantics: `docs/technical/error-handling.md`).

Only active bookings (`confirmed`, `checked-in`) hold a unit: a booking
completed by a check-out (`closed`, section 16) contributes nothing to
the count and blocks no overlap the moment the close commits, so a
same-day arrival is not refused because a departed guest's booking is
still on file (`FR-DEP-2`, Refs #646). The booking's recorded dates are
not rewritten on an early departure; the state is what releases the
remaining nights.

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
  Print · Admin, then the compact `VI | EN` locale pill and an
  account disclosure carrying the signed-in user name and Sign out;
  active-route highlight; single centred content column, max width
  1100px; shell-owned sign-in gate replacing the per-screen
  sign-in copies) wraps the existing screen SFCs. The disclosure
  keeps the bar a single 60px design row (Refs #564; edge trace in
  [section 12.3](lld.md)). The admin
  console additionally hides every management section from
  front-desk callers as a cosmetic layer over the server-side
  `FORBIDDEN` refusals (Refs #355); behaviour — who may do what —
  is unchanged. The offline
  banner and manual retry stay exactly as they are
  (`app/src/App.vue:1-28`, `app/src/api/client.ts:44-85`).
- Restyle pointer. Desk shell/nav chrome was later restyled
  pixel-faithful to the owner design tokens (1200px column;
  PrimeVue fills abandoned on desk surfaces where they diverge) —
  the 1100px/stock-preset wording above is the pre-restyle rollout
  record, and the restyle spec
  `docs/product/desk-ui-pixel-faithful-restyle.md` is authoritative
  (Refs #518).
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

## 14. Desk UI pixel-faithful restyle (Refs #517) — presentation only

Owner decision B (2026-11-07, recorded in #517) restyles all
seven desk surfaces to the owner-supplied boards as closely as
possible (exact colors including the `#0F766E` primary, fonts,
spacing, radii, layout per the `docs/design/*.dc.html` inline
styles). Tier T2 (reader-visible UI change; no new subsystem,
no boundary change, no contract change — hence no new ADR:
the decision record is the partial-supersession section in
`docs/architecture/decisions/adr-0003-desk-ui-vue-vite.md`).
The product-owner scope, tokens, per-surface mappings, and UI
contract live in `docs/product/desk-ui-pixel-faithful-restyle.md`
(PR #525); the requirements delta lives with `business-analyst`
(`docs/requirements/mvp-requirements.md` section 13,
`FR-RST-*`/`NFR-RST-*`, PR #526); guard mapping lives with
`qa-lead`. This section records only the subsystem-boundary
position; the build-ready decomposition lives in
`docs/architecture/lld.md` [section 15](lld.md).

No new subsystem, no boundary change, no contract change:

- Presentation only. The shell (#518) plus the six screens
  (Main #519, Book #520, Stay #521, Folio #522, Rooms #523,
  Onboarding #524) are rebuilt markup-and-style to the board
  values; logic, hooks, stores, routers, API calls, request
  fields, state transitions, validation, copy, catalogue
  keys, and print output stay exactly as today. All module
  boundaries (section 4), named contracts, and data-store
  ownership statements stand unchanged.
- PrimeVue boundary. PrimeVue components stay as logic
  carriers (focus, keyboard, ARIA, validation states,
  dialogs, tables); only their rendered visual styling is
  replaced wherever it diverges from the design values. The
  single styling source is `app/src/theme/tokens.ts`
  (header `#0F4C47` at `:22`, primary `#0F766E` at `:23`,
  focus ring at `tokens.ts:47-50` pinned by
  `tokens.test.ts:43-58`); no per-surface token forks.
- Flows unchanged. No flow is added, removed, or reordered,
  so no new per-flow diagram is specified here: the standing
  diagrams in LLD sections 11.1–11.3 (shell render, 401
  sign-out, offline retry), 12.3–12.5 (navigation, sign-in
  gate, quote-then-confirm), and 13.1–13.4 (rollout flows)
  keep their happy paths and failure/rollback paths
  verbatim for this restyle.
- Non-desk surfaces out. Print routes and documents, the
  admin console, and the sign-in gate keep their current
  presentation and stay reachable as today. The
  owner-supplied `docs/design/*` files are never edited.

Rollback: revert the per-screen implementation PRs
independently in reverse merge order (#518–#524); the design
files themselves are unchanged, and no data migration exists
in either direction.

## 15. Check-out gate authority (Refs #601)

The desk browser is not a trust boundary for money facts. Billing owns
a folio's balance and its recorded open-balance approval; Stay owns the
`in-house -> closed` transition and, from #601 on, re-derives both facts
from Billing at the close instead of trusting the request's
`folioBalanceMinor` / `openBalanceApproval`. The change adds one
synchronous edge (Stay -> Billing `GetFolioBalance`, the caller's
session token forwarded, fail-closed on an unread folio), no new module,
no new store, and no data-model change; the contract change is additive
(advisory fields plus the registered `UPSTREAM_UNAVAILABLE` code). It
does not move the settlement decision into Billing: `RequestCheckoutGate`
stays deferred (integration F4). Decision record:
`docs/architecture/decisions/adr-0005-server-side-checkout-gate.md`
(proposed); flow detail and the verification plan:
`docs/architecture/lld.md` section 21; trust-boundary and residual-risk
deltas: `docs/technical/security-threat-model.md` sections 2 and 8.

## 16. Departure completion authority (Refs #646)

A committed check-out must also complete the booking behind the stay.
The layer that holds the owner-reported stale state (manual QA
2026-11-10) is the reservation lifecycle, not the room: `closed` is
already the accepted terminal booking state
(`docs/architecture/state-machine.md`), the reservations schema already
allows it and already carries the stay link
(`services/reservations/migrations/000002_schema.up.sql:29-33`), and the
availability guards already count only `confirmed` / `checked-in`
(`services/reservations/internal/store/store.go:194-196`). Nothing ever
wrote `closed` when a stay closed, so the departed booking kept a
sellable unit and the calendar kept naming it as active. This change
adds that write; it adds no module, no store, no lifecycle state, no
schema, and no migration.

Which service owns which fact:

| Fact | Owner | Written where | May a caller assert it? |
|---|---|---|---|
| The stay's close | Stay | Conditional `in-house -> closed` flip in the Stay store | No — `stayId` selects; the server decides |
| The booking's state | Reservations | Conditional `checked-in -> closed` flip in the Reservations store | No — the close triggers it; no client field carries it |
| Which booking belongs to the stay | Reservations | `stay_id` UNIQUE, set by `CheckInReservation`; resolution is by this link, never by guest name or dates | Only `stayId` |
| The active set for availability | Reservations | The existing create/modify guard filters (`activeState`) | No |
| Actor and time of the completion | Admin session actor forwarded by Stay | `updated_by` / `updated_at` plus a change-history row | Yes (`actor`), same residual as the #601 actor caveat |

One synchronous edge is added: Stay `CheckOut`, after its own
conditional flip commits, calls
`ReservationService.CheckOutReservation` with the closed `stayId` and the
caller's session token (2-second timeout, the same shape as the
Stay -> Billing read in section 15 below). Reservations resolves the
reservation by the stay link it already carries and flips
`checked-in -> closed` under a conditional write; a second call returns
the completed booking unchanged, so a replay or a double confirmation
completes once. The desk keeps its one confirmation and its existing
`ReleaseRoom` call, and the room half is untouched (`ReleaseRoom` ->
`vacant-dirty`, housekeeping -> `vacant-inspected`, assignment offers
inspected rooms only).

The close can commit while the completion cannot be recorded
(Reservations unreachable, or no booking resolves for the stay link).
That split is accepted as visible, never silent: the close response
carries the observed outcome, the desk reports the check-out without
claiming a completed booking, and the booking stays `checked-in` until a
replay of the idempotent completion records it. A `reservation.completed`
event for the reporting read model and a reconciliation tool for rows
stranded by the old behaviour are named follow-ups, not part of this
change.

Tier T2 (confirmed). The shape adds no lifecycle state and no migration;
a shape that adds either re-tiers the change to T3. Flow detail, contract
delta, and verification plan: `docs/architecture/lld.md` [section 22](lld.md).

Rollback: revert the single implementation PR. The state value and the
stay link already exist in the schema, so there is no migration in
either direction; bookings already completed keep reading completed
while new closes stop completing until the revert is itself reverted.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-946

## 17. Desk room reassignment authority (Refs #647)

A guest expected in room 101 who checks into 102 leaves room 101
reading occupied with a stale stay link, and the desk has no action to
correct it. The layer that holds the fix is the desk, not the services:
Rooms already owns assignment and release (`assignRoom` flips a ready
room to `occupied` and records the stay link; only an explicit
`releaseRoom` takes it back, `services/rooms/src/store.ts:361-405`,
`:407-436`), Stay already owns the move and its history (`moveRoom`
keeps the stay in house with `fromRoomId`, `toRoomId`, `movedAt`,
`services/stay/src/store.ts:332-376`), and the contract already says the
desk owns the assignment and release around a move
(`contracts/http/MoveRoom.json`). What was missing is an owner for the
sequence: the check-in commit assigns first and returns from every later
refusal without releasing the room it assigned
(`app/src/views/StayView.vue:1249-1336`), and nothing under `app/src`
called `MoveRoom`.

The desk therefore owns the ordering and the compensation, and no module
learns to compensate for another:

- **Order.** Arrival commit: assign the chosen room, read the booking,
  write the stay, link the reservation; a definitive refusal at the
  booking read or the stay write releases the room it assigned back to
  `vacant-inspected` in the same commit. Reassignment and mid-stay move:
  assign the target, move the stay, release the vacated room to
  `vacant-dirty` — in that order, so a taken target refuses before the
  stay moves and the old room frees only after the stay no longer names
  it.
- **Read the move before releasing.** The release targets the
  `move.fromRoomId` the `MoveRoom` reply carries, not the room the panel
  remembered, so two desks moving the same guest each release exactly
  the room their own move vacated.
- **Only definitive refusals compensate.** A `4xx` envelope answer
  proves the call wrote nothing, so the earlier write is taken back; an
  unreadable outcome (transport failure, `5xx`, non-envelope) releases
  nothing and is reported as an outcome to re-read, because a room the
  guest may be standing in must never be freed on a guess.

Which service owns which fact:

| Fact | Owner | Written where | May a caller assert it? |
|---|---|---|---|
| Which room a check-in names | Desk chooses, Rooms decides | `AssignRoom` conditional write, stay id as `stayLink` | No |
| A room's occupancy | Rooms | `assignRoom` / `releaseRoom` | No |
| The stay's current room and move history | Stay | `moveRoom` conditional in-house write + `stay_moves` row | Only `stayId` |
| The from-room of a move | Stay | `move {fromRoomId, toRoomId, movedAt}` in the reply | Yes — it is the release input |
| The sequence and the compensation | Desk | the click handler's ordered calls | Not applicable |

No module, store, lifecycle state, operation, schema, or event is added,
and no service-side rollback exists: the compensation is the desk's own
`ReleaseRoom`, not a distributed transaction or a saga. The residual risk
that follows is that a browser closed mid-action can leave a room
occupied with no stay behind it; the desk names the room and the
existing release clears it, which is where this change sits.

Tier T2 (confirmed). Flow detail, the per-flow diagrams, the contract
no-change statement, and the verification plan: `docs/architecture/lld.md`
[section 23](lld.md); the room-side lifecycle statement:
`docs/architecture/state-machine.md` [section 2.1](state-machine.md).

Rollback: revert the single implementation PR. The desk stops calling
operations that already exist, the two-panel Stay screen and its guards
return as they were, and no migration or data backfill exists in either
direction.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-961

## 19. Reservation availability authority (Refs #631)

The desk browser is not a trust boundary for occupancy facts either.
Rooms owns how many units a room type can host for a date range;
Reservations owns which of those units a reservation holds; the desk
only chooses the type, the dates, the guest, and the idempotency key.
From #631 on, `CreateReservation` and `ModifyReservation` derive the
overbooking guard's ceiling from `CheckRoomTypeSellability` (the
date-ranged room inventory net of blocks) instead of from the request's
`sellableUnits`, which becomes advisory. The guard still counts the
overlapping `confirmed` / `checked-in` reservation rows itself, in one
critical section, so each unit is subtracted exactly once and two
simultaneous last-unit requests still yield one winner and one
`CONFLICT`. The change adds one synchronous fail-closed edge
(Reservations -> Rooms, caller token forwarded, `UPSTREAM_UNAVAILABLE`
503 on an unread ceiling), no new module, no new store, and no
data-model change; the contract change is additive (an advisory field
plus one error code). The Rates availability count is not the ceiling: its
`totalUnits` input is itself a request value and its fallback number is
not maintained. Decision record:
`docs/architecture/decisions/adr-0006-server-side-availability-derivation.md`
(accepted 2026-11-24); flow detail and the verification plan:
`docs/architecture/lld.md` section 26; trust-boundary and
residual-risk deltas: `docs/technical/security-threat-model.md`
sections 2 and 8; product conditions `AC-OVB-1`..`AC-OVB-3` and risk R-14.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-941

## 20. Folio write verification authority (Refs #634)

A stay id is not evidence. Billing creates the folio for any UUID it is
handed (`ensureFolio`,
`services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:65-71`,
reached from the four folio routes at
`service/BillingService.java:121`, `:142`, `:176`, `:264`), so a charge,
a payment, or an open-balance approval can be written against a stay that
does not exist or is already closed — an orphan folio Stay's check-out
gate never reads, and money rows with no stay behind them. From #634 on,
Billing asks Stay before it writes: the stay's existence and lifecycle
state are Stay's facts, the folio's lines, balance, and approval are
Billing's, and the caller's `stayId` only selects which stay the write is
about.

Three properties define the change:

- **Verify before every write, and before creating a folio on a read.**
  `PostCharge`, `RecordPayment`, and `RecordOpenBalanceApproval` call the
  already-registered C8 read `GetStayRef` on every request, whether or not
  a folio exists, so nothing lands on a closed stay. `GetFolioBalance`
  verifies only when the stay carries no folio, so a folio Billing already
  holds stays readable and printable in every stay state — the departure
  invoice and its receipts never depend on the stay still being in house.
- **No new refusal vocabulary.** An unknown stay refuses with
  `NOT_FOUND` (404), a stay outside `in-house` with `STATE_ILLEGAL`
  (422) naming the state, a malformed id with `VALIDATION_FAILED` (400) —
  the codes the provider already answers with, surfaced by Billing.
- **Fail closed.** A Stay that cannot be read refuses the route with
  `UPSTREAM_UNAVAILABLE` (503) and writes nothing. The offline-first
  cached-config rule (`NFR-AVL-1`) does not extend to a fact that decides
  money, the same reading ADR-0005 took for the balance.

The change adds one synchronous edge and no module, store, lifecycle
state, operation, request field, event, or migration: Billing -> Stay
`GetStayRef` with `STAY_BASE_URL` (`http://stay:8084` on the compose
network), the caller's session token forwarded, a 2-second timeout inside
`NFR-PERF-1`'s 3-second action bound, and a fail-closed 503. `GetStayRef`
is a leaf read, so the Billing <-> Stay cycle is bounded at one hop and
the close path cannot recurse. The contract change is error-code additive
(four operations gain `NOT_FOUND`, `STATE_ILLEGAL`, and
`UPSTREAM_UNAVAILABLE`; `contracts/errors/envelope.json` registers the
503 code). Decision record:
`docs/architecture/decisions/adr-0008-folio-write-stay-verification.md`
(proposed); flow detail, the per-flow diagrams, the contract delta, and
the verification plan: `docs/architecture/lld.md`
[section 27](lld.md#27-folio-writes-verify-the-stay-refs-634); seam and
error contracts: `docs/technical/integration.md` C8 and
`docs/technical/error-handling.md` section 5; the availability and
residual-risk deltas: `docs/technical/security-threat-model.md`
section 8 (R5, R8).

Tier T3 (confirmed by `architect`): a new fail-closed dependency edge on
the money path plus a new contract error set, with no data-model change.
The owner accepts the ADR (`proposed` -> `accepted`) before the
implementation PR merges.

Rollback: revert the single implementation PR. The previous
ensure-on-first-use behaviour returns, the new client and its
configuration go with the code, and no migration or backfill exists in
either direction; folios already written — orphaned ones included — stay
as they are.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1046

## 21. Bounded request bodies and finite server timeouts (Refs #630)

The single on-premise host runs every backend service, and until #630 no
ingress path had a body ceiling or an explicit server timeout: one
oversized body could exhaust the host's memory and one stalled peer could
hold a connection and a worker indefinitely. From #630, every backend
service caps a request body at **65 536 bytes (64 KiB)** — a code
constant, never configuration (D-34) — refuses an oversized body with the
shared envelope (`VALIDATION_FAILED`, 400, `details` naming `body`, the
plain `error.transport.body_too_large` sentence), and runs with explicit
finite header-read, body-read, response-write, and idle bounds on the Go
`http.Server`, the four Node servers, and Billing's embedded Tomcat.

Three properties define the change:

- **Refuse before work.** The ceiling is enforced where each stack reads
  the body — Node `readBody`, Go `decodeBody` with `http.MaxBytesReader`,
  and a servlet filter ahead of Billing's `@RequestBody` — before parsing
  and before any store, provider, or folio call, so a refused request
  writes nothing.
- **No new vocabulary.** `VALIDATION_FAILED` is already in
  `contracts/errors/envelope.json`; no `PAYLOAD_TOO_LARGE` token, enum
  edit, or desk branch is added, and an under-ceiling payload behaves
  exactly as today (ADR-0004 D1).
- **Finite bounds sized above legitimate waits.** The 15-second response
  write bound clears the 5-second Reservations → Rates pricing read
  (`services/reservations/internal/pricing/client.go:33`) and Stay's
  2-second completion read (`services/stay/src/reservationsClient.ts:31`);
  no legitimate desk call is cut off.

The change adds no subsystem, dependency edge, data model, lifecycle
state, environment setting, deployment delta, or reader-visible surface;
it is a transport hardening of paths that already exist, so the container
and component views (sections 2 and 3) stand unchanged. Enforcement
points, the timeout table, and the per-flow diagram:
`docs/architecture/lld.md` [section 29](lld.md#29-bounded-request-bodies-and-finite-server-timeouts-refs-630);
per-service Operations notes: `docs/architecture/services/*.md`
section 7; the refusal in the taxonomy:
`docs/technical/error-handling.md` section 1.1; the pair-wise transport
note: `docs/technical/integration.md` section 10. Risk R-13 records that
the ceiling and the timeout values can be set too tight as well as too
loose; rollback is the single implementation PR.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1078

## 22. Money amounts are whole, bounded, and refused in the adapter (Refs #635)

A money field that accepts any JSON number is not a money field. Billing's
adapter took any `Number` and truncated it with `longValue()`
(`services/billing/src/main/java/com/hotel/billing/web/BillingController.java:47-53`),
so `amountMinor: 12.99` posted 12 with no refusal and a magnitude beyond
anything the product can produce entered the stored `long`. From #635,
every money amount Billing accepts is a **whole number of minor units at
or below one declared ceiling of 1 000 000 000 000**, refused naming the
field otherwise.

Three properties define the change:

- **Whole, never truncated.** A value that is not a whole number of minor
  units refuses with the shared envelope (`VALIDATION_FAILED`, 400,
  `details` naming the field) instead of being rounded or truncated; a
  whole value written with a decimal point (`12.0`) stays accepted.
- **One ceiling, in code.** 1 000 000 000 000 minor units for every money
  field, a constant in the adapter, never configuration — the #630
  pattern — so this change carries no deployment, environment, runbook,
  or per-hotel delta. The magnitude is what is bounded, so a huge
  negative refuses here while an in-range negative keeps the existing
  service sign refusal.
- **No new vocabulary at the transport edge.** `VALIDATION_FAILED` is
  already in `contracts/errors/envelope.json`; no token, status, enum
  edit, or contract file changes, and no desk branch is added — both desk
  money inputs already send whole minor units
  (`app/src/views/FolioView.vue:441-451`). A tax-rule percent stays a
  number: fractional percents are still accepted and the 0–100 range
  stays the service's.

The change adds no subsystem, dependency edge, data model, lifecycle
state, operation, or reader-visible surface: it is a bound on four
existing operations (`PostCharge`, `RecordPayment`, `UpsertChargeItem`,
and the tax-rule percent adapter), so the container and component views
(sections 2 and 3) stand unchanged. Enforcement point, the refusal
contents, the per-flow diagram with the folio-write refusal frame, the
contract decision, and the verification plan:
`docs/architecture/lld.md` [section 30](lld.md#30-money-amount-bounds-on-the-billing-folio-write-adapter-refs-635);
per-service note: `docs/architecture/services/billing.md` section 10;
the refusal in the taxonomy:
`docs/technical/error-handling.md` section 1.2; the money convention with
its ceiling: `docs/technical/api-spec.md` section 1. Risk R-16 records
that the ceiling can be set too tight as well as too loose; rollback is
the single implementation PR.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1117

## 23. Report date ranges are bounded by one declared span (Refs #641)

Reporting checked a report window's shape and order but never its span,
and both range reads then walk every date in the window under the store
mutex (`services/reporting/internal/store/store.go:440-453` for the
validation, the loops at `:460-534`), so a request such as
`0001-01-01`..`9999-12-31` looped over millions of dates while every
other report waited behind the same lock — a self-inflicted denial of
service on the single on-premise host. From #641, `OccupancyReport` and
`RevenueSummary` accept a window of **at most 730 nights between
`dateFrom` and `dateTo`** (731 inclusive dates), refused naming `dateTo`
otherwise.

Three properties define the change:

- **Refuse before work.** The span is checked where the window is
  already validated — the one `parseRange` helper both range reads call
  — so it runs after the session check and the presence checks and
  strictly before the store lock and before any per-date walk. A refused
  window takes no mutex, reads no projection, and changes nothing.
- **One number, in code, agreed across backends.** 730 nights is the
  two-year window `NFR-PERF-2` documents and the existing perf guard
  drives, and the same bound Rates already applies to a stay range
  (`services/rates/internal/store/store.go:254-256`), so the two
  backends stop disagreeing on the longest range they accept. It is a
  store constant, never configuration (D-36), so this change carries no
  deployment, environment, runbook, or per-hotel delta.
- **No new vocabulary and nothing moved inside the cap.** A wider window
  answers the existing caller-input code — `VALIDATION_FAILED`, 400,
  `details` naming `dateTo`, one new plain catalogue sentence
  `reporting.validation.date_range_span` — so no token, status, enum
  edit, or contract file changes (ADR-0004 D1), no desk screen calls
  either operation, and every window at or under the cap returns
  exactly today's rows, row order, zero-filled dates, and `asOf`.
  `DailySheet` and `HousekeepingReport` are not on this path.

The change adds no subsystem, dependency edge, data model, lifecycle
state, operation, or reader-visible surface: it is one guard on two
existing read operations, so the container and component views
(sections 2 and 3) stand unchanged. Enforcement point and the
nights-versus-dates arithmetic, the refusal contents, the per-flow
diagram with the happy and refusal edges, the contract decision, and the
verification plan: `docs/architecture/lld.md`
[section 31](lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641);
per-service note: `docs/architecture/services/reporting.md` sections 4,
6, and 8; the refusal in the taxonomy:
`docs/technical/error-handling.md` section 1.3; the date-window
convention: `docs/technical/api-spec.md` section 1. Risk R-17 records
that the cap can be set too tight as well as too loose; rollback is the
single implementation PR.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1130

## 24. Guest identity is disambiguated and guest payloads are bounded (Refs #640)

Guests answered a full-name lookup with the first matching profile, in
both stores (`services/guests/src/store.ts:308-326` walks the map and
returns the first hit; `services/guests/src/pgstore.ts:181-191` asks for
`LIMIT 1`), so two guests sharing a name handed the desk one guest's
profile, contact, preferences, notes, and stay links with no sign that a
choice was made. The same write accepted any `contact`/`preferences`
object and any `notes` string with no per-field bound, and the
confirmation snapshot's date check tested the shape of a date, not the
calendar, so `2026-13-45` was accepted where the Go services refuse it.
From #640, a name that matches more than one guest is refused, guest
payloads carry one declared shape and one declared length, and both
confirmation dates must exist on the calendar.

Three properties define the change:

- **Refuse before a profile is served or a row is written.** The
  ambiguity is decided in the one lookup helper both stores implement,
  and it counts every match before it answers, so no first row is ever
  assembled; the payload bounds and the calendar check run before the
  guest write and before the confirmation snapshot is stored. A refusal
  therefore returns one envelope, writes nothing, and leaves every stored
  profile readable exactly as it is.
- **One rule, one home, both stores.** Each rule lives once — the
  ambiguity constructor and the two validators in `store.ts` (which the
  Postgres twin already imports its shared helpers from), the calendar
  check inside the existing `requireDate` — so the in-memory and
  Postgres stores cannot answer the same request differently, which the
  done-conditions require. The bounds are fixed code constants, never
  configuration, so this change carries no deployment, environment,
  runbook, or per-hotel delta.
- **No new vocabulary and no data-model change.** Every refusal answers
  the existing caller-input code — `VALIDATION_FAILED`, 400 — with the
  offending field in `details` and one new plain catalogue sentence per
  rule (the date rule reuses the existing guests date sentence). No error
  code, envelope field, status mapping, endpoint, event, index, column,
  migration, or stored-row shape changes; reads stay unbounded, so no
  stored note is truncated and no profile is dropped. One caller-facing
  error-list line in `contracts/http/IdentifyGuest.json` gains the
  ambiguity clause, prose only; the request manifests publish no schema
  keyword for the bounds because no validator on the request path would
  read one (ADR-0004 D1).

The change adds no subsystem, dependency edge, data model, lifecycle
state, operation, or new surface: it is three guards on existing
operations plus one reader-visible refusal state on the existing Book
screen, so the container and component views (sections 2 and 3) stand
unchanged. Enforcement points, the refusal shapes, the exact bounds, the
per-flow diagrams for the three touched flows, the contract decision, the
verification plan, and the NFR disposition: `docs/architecture/lld.md`
[section 32](lld.md#32-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640);
per-service note: `docs/architecture/services/guests.md` sections 4, 6,
and 8; the refusals in the taxonomy:
`docs/technical/error-handling.md` section 1.4; the payload convention:
`docs/technical/api-spec.md` section 1. Risk R-18 records both the
first-match refusal and an over-strict bound; rollback is the single
implementation PR.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1141
