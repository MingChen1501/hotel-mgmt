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

Dates above are the owner-approved order date from issue #63 (spec
batch 2), not project milestones — the plan itself
(`docs/project/plan.md`) carries no dates.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-79
