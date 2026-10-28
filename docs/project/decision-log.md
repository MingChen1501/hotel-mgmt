# Decision log — decisions taken so far

Status: active. Decision list for the hotel-mgmt MVP, owned by
`product-owner` (Closes #63), with `release-manager` input on
deployment/operations matters. Each entry records a decision the
owner has already taken; rationale and pointers live in the linked
record. New decisions are appended here and, where architectural,
recorded as ADRs under `docs/architecture/decisions/`.

| # | Date | Decision | Record |
|---|---|---|---|
| D-1 | 2026-10-22 | Delivery runs through GitHub issues: every task is a filed issue, worked on a branch, and merged via PR. | `docs/project/issue-conventions.md` |
| D-2 | 2026-10-22 | Product picture before architecture: architecture work is frozen (ADR-0001 stays proposed) until the roadmap, personas, and user stories give a clear product picture (issue #30). | `docs/product/roadmap.md` |
| D-3 | 2026-10-22 | No business docs: BRD, business case, market research, and KPI metrics stay stubs; the project ships product and engineering specs only. | `docs/README.md` (Business table) |
| D-4 | 2026-10-22 | No code forks per sale: the PMS is sold per hotel but ships one release bundle, configured per hotel without code changes. | `docs/devops/deployment.md` ([section 2](../devops/deployment.md)) |
| D-5 | 2026-10-22 | Single host or small cluster: each hotel runs one on-premise installation — a single host by default, or the same containers and database spread across a small physical cluster on the hotel LAN. | `docs/architecture/system-architecture.md` ([section 1](../architecture/system-architecture.md)) |
| D-6 | 2026-10-22 | Template repo extracted: the reusable agentic starter ships as the installable `template/` artefact (Closes #16); `docs/agentic-template/` stays the in-tree design record. | `docs/README.md` (template tables) |
| D-7 | 2026-10-23 | ADR-0001 accepted: monorepo polyglot with per-module stack freedom from the allowed pool (owner acceptance "Option A"). Accepted primary mapping: Go on Reservations/Rates/Reporting, Node.js/TypeScript on Stay/Rooms/Guests/Admin & Config, Java Spring Boot on Billing, shared PostgreSQL engine; no Kafka, no Redis day-one; Ansible + plain containers offline, Nginx entry, Prometheus + Grafana on-prem, LAN + Tailscale with no inbound internet; single 2*4*50 host (2 vCPU / 4 GB RAM / 50 GB disk) default with small-cluster variant. Menu-not-mandate (extras need written NFR + footprint justification); walking skeleton Admin -> Rooms -> Rates -> Reservations + proxy/store/packaging/backup (Billing only if later added, default without); chain via separate oversight service later with MVP boundaries unchanged; MySQL fallback store, mini-K8s only with written reason, Kafka OUT unless measured need, contract style per-pair choice during skeleton. | `docs/architecture/decisions/adr-0001-monorepo-polyglot.md` (accepted; OWNER ACCEPTANCE on #28) |
| D-8 | 2026-10-23 | GitHub milestones as the machine-readable board mirror: `.github/milestones.md` mirrors `docs/project/plan.md` milestone for milestone and carries the current gate state; the owner's human Kanban view (Projects board URL, #129) is maintained by hand and never claimed via API. | `.github/milestones.md` (board setup #121, official-board record #123, board URL #129) |
| D-9 | 2026-10-23 | Priority and Size required on every issue and PR, alongside the one-type + one-risk label convention, so ordering and sizing stay visible on the ticket itself. | `docs/project/issue-conventions.md` (#129) |
| D-10 | 2026-10-24 | Owner decision (recorded here, not relitigated): PRD open questions — payment methods, day-close sign-off, retention promise, and siblings — are OUT of MVP scope. Slices proceed on baselines; OQ-dependent extensions are tracked as Later. Consequence: the folio/billing slice ships its cash-only recording baseline (plain recording of cash and card payments against the folio as scoped, with no integrated payment processing — OQ-1 methods beyond cash and card are Later); day-close ships manual totals with no sign-off workflow (OQ-3); retention follows the NFR defaults (OQ-4); all other OQ-dependent extensions are tracked as Later. | Issue #148 |
| D-11 | 2026-10-25 | ADR-0003 accepted: desk UI migrates to Vue 3 + Vite (CSR-only static build served by Nginx under `/app/`), with the owner's two mandatory corrections (option-C total 375, not 395; Nginx fallback serves `/app/index.html` with print routes namespaced `/app/print/...`) carried in the ADR file (owner acceptance on #285). | `docs/architecture/decisions/adr-0003-desk-ui-vue-vite.md` (accepted; OWNER ACCEPTANCE on #285) |
| D-12 | 2026-10-28 | Owner-supplied Claude desk UI design is authoritative: the six static HTML screens plus the canvas manifest (ordered Main, Stay, Onboarding, Rooms, Book, Folio) are the desk UI target (issue #419); where the design conflicts with the #412 journey/spec record, the design wins and each conflict is recorded on the affected per-screen sub-issue (#420–#425) with the owner decision. | Issue #419; product spec `docs/product/desk-ui-design-rollout.md` |

Dates above are the owner-approved order date from issue #63 (spec
batch 2), not project milestones — the plan itself
(`docs/project/plan.md`) carries no dates.

Supersede note (issue #91, 2026-10-23): D-2 is superseded by D-7
— ADR-0001 was accepted 2026-10-23 (owner acceptance "Option A"
on #28). The D-2 entry above is preserved as history; the freeze
it records no longer applies. (Append-only note; no rewrite.)

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-540
