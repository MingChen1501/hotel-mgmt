# Risk register — live project risks

Status: active. Live risk list for the hotel-mgmt MVP, owned by
`product-owner` (Closes #63), with `release-manager` input on
deployment/operations matters. Every risk carries an owner and a
mitigation or next step; the owner reviews this list at each
milestone in `docs/project/plan.md`.

| # | Risk | Owner | Mitigation / next step |
|---|---|---|---|
| R-1 | Polyglot contract discipline: the three runtimes (Go, Node.js/TypeScript, Java Spring Boot) share one monorepo under ADR-0001, so an unversioned cross-module contract change stalls integration. | Owner (decision), `architect` (contract list) | Keep versioned module APIs/events with a contract-check stage per ADR-0001; `architect` tables the contract list and `qa-lead` records the contract-guard slot. |
| R-3 | Per-hotel configuration complexity: each sale is configured per hotel without code forks, but the configuration surface (guest fields, policies, reasons, charge items, taxes, restrictions, discounts) is wide and a misconfigured hotel breaks its own desk. | `release-manager` | Keep one versioned configuration set per hotel applied identically at install and upgrade (`docs/devops/deployment.md`, section 2); validate the set against the release schema in pre-flight checks; confirm the hotel's own data at every handover. |
| R-4 | No chain design: the MVP is one installation per property with no shared data or central oversight (`NFR-DEP-1`); a buyer asking for multi-property operation has no answer and must not bend MVP boundaries early. | `product-owner` | Hold the line in scope reviews: chain work is a later direction per the system architecture (`docs/architecture/system-architecture.md`, section 4); record any chain request as a new issue instead of stretching the MVP. |
| R-5 | On-premise hardware or backup-target failure: the single host (or a cluster host) or the backup target itself fails, so the desk is down and the newest restore point may sit on the failed target. | `release-manager` | Follow the existing procedures: restart order (`docs/operations/runbook.md`, section 3), restore walkthrough (`docs/operations/runbook.md`, section 5) from the newest verified backup (`docs/operations/backup-dr.md`, sections 1 and 4); target operable again within 4 hours on equivalent hardware (`NFR-BKP-2`). |

## Closed risks

- R-2 (closed 2026-10-23, issue #91): single-host sizing is answered — owner acceptance confirms 2 vCPU / 4 GB RAM / 50 GB disk per host (notation 2*4*50, answering OQ-A3), published in `docs/devops/deployment.md`, section 5.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-129
