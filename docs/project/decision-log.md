# Decision log — decisions taken so far

Status: active. Decision list for the hotel-mgmt MVP, owned by
`release-manager` (Closes #63). Each entry records a decision the
owner has already taken; rationale and pointers live in the linked
record. New decisions are appended here and, where architectural,
recorded as ADRs under `docs/architecture/decisions/`.

| # | Date | Decision | Record |
|---|---|---|---|
| D-1 | 2026-10-22 | Delivery runs through GitHub issues: every task is a filed issue, worked on a branch, and merged via PR. | `docs/project/issue-conventions.md` |
| D-2 | 2026-10-22 | Product picture before architecture: architecture work is frozen (ADR-0001 stays proposed) until the roadmap, personas, and user stories give a clear product picture (issue #30). | `docs/product/roadmap.md` |
| D-3 | 2026-10-22 | No business docs: BRD, business case, market research, and KPI metrics stay stubs; the project ships product and engineering specs only. | `docs/README.md` (Business table) |
| D-4 | 2026-10-22 | No code forks per sale: the PMS is sold per hotel but ships one release bundle, configured per hotel without code changes. | `docs/devops/deployment.md` (section 2) |
| D-5 | 2026-10-22 | Single host or small cluster: each hotel runs one on-premise installation — a single host by default, or the same containers and database spread across a small physical cluster on the hotel LAN. | `docs/architecture/system-architecture.md` (section 1) |
| D-6 | 2026-10-22 | Template repo extracted: the reusable agentic starter ships as the installable `template/` artefact (Closes #16); `docs/agentic-template/` stays the in-tree design record. | `docs/README.md` (template tables) |
| D-7 | 2026-10-23 | ADR-0001 accepted: monorepo polyglot with per-module stack freedom from the allowed pool (owner acceptance "Option A"). Accepted primary mapping: Go on Reservations/Rates/Reporting, Node.js/TypeScript on Stay/Rooms/Guests/Admin & Config, Java Spring Boot on Billing, shared PostgreSQL engine; no Kafka, no Redis day-one; Ansible + plain containers offline, Nginx entry, Prometheus + Grafana on-prem, LAN + Tailscale with no inbound internet; single 2*4*50 host (2 vCPU / 4 GB RAM / 50 GB disk) default with small-cluster variant. Menu-not-mandate (extras need written NFR + footprint justification); walking skeleton Admin -> Rooms -> Rates -> Reservations + proxy/store/packaging/backup (Billing only if later added, default without); chain via separate oversight service later with MVP boundaries unchanged; MySQL fallback store, mini-K8s only with written reason, Kafka OUT unless measured need, contract style per-pair choice during skeleton. | `docs/architecture/decisions/adr-0001-monorepo-polyglot.md` (accepted; OWNER ACCEPTANCE on #28) |

Dates above are the owner-approved order date from issue #63 (spec
batch 2), not project milestones — the plan itself
(`docs/project/plan.md`) carries no dates.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-79
