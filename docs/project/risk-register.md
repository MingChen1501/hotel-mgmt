# Risk register — live project risks

Status: active. Live risk list for the hotel-mgmt MVP, owned by
`release-manager` (Closes #63). Every risk carries an owner and a
mitigation or next step; the owner reviews this list at each
milestone in `docs/project/plan.md`.

| # | Risk | Owner | Mitigation / next step |
|---|---|---|---|
| R-1 | Stack undecided: language, runtime, database engine, and container/host shape are open, so no implementation slice can start and sizing cannot be fixed. | Owner (decision), `architect` (options) | Owner takes the stack decision as milestone 2 of the plan; `architect` tables the options with trade-offs beforehand. Until then, specs stay technology-neutral. |
| R-2 | Single-host sizing open (OQ-A3 in ADR-0001): the smallest on-premise host the installer must support (CPU/RAM/disk) has no numbers, so hardware cannot be ordered and pre-flight checks have no sizing bar. | Owner (decision), `architect` (sizing input) | Close with the stack decision (plan milestone 2): publish minimum sizing, then write it into the deployment pre-flight checks (`docs/devops/deployment.md`, section 5). |
| R-3 | Per-hotel configuration complexity: each sale is configured per hotel without code forks, but the configuration surface (guest fields, policies, reasons, charge items, taxes, restrictions, discounts) is wide and a misconfigured hotel breaks its own desk. | `release-manager` | Keep one versioned configuration set per hotel applied identically at install and upgrade (`docs/devops/deployment.md`, section 2); validate the set against the release schema in pre-flight checks; confirm the hotel's own data at every handover. |
| R-4 | No chain design: the MVP is one installation per property with no shared data or central oversight (`NFR-DEP-1`); a buyer asking for multi-property operation has no answer and must not bend MVP boundaries early. | `product-owner` | Hold the line in scope reviews: chain work is a later direction per the system architecture (`docs/architecture/system-architecture.md`, section 3); record any chain request as a new issue instead of stretching the MVP. |

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-79
