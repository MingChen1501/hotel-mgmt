# ADR-0002: Cross-stack layering follows stack idioms

Status: accepted (owner acceptance 2026-10-24, pre-authorized with the #186 docs merge; Closes #188).

Date: 2026-10-24 (proposed); accepted 2026-10-24.

## Context

The eight service source pages (`docs/architecture/services/*.md`, Closes #181) record three different layering shapes as built:

- Go (`reservations`, `rates`, `reporting`): `handler / service / store` packages under `internal/` (rates omits `service`: routes call the store directly).
- Java (`billing`): Spring `web / service / repo (+ config)` packages.
- Node (`stay`, `rooms`, `guests`, `admin`): flat `src/` files (`server`, `store`, `pgstore`, `errors`, `auth`) over raw `node:http`, no framework.

All eight expose the same external contract shape — `POST /v1/<module>/<Operation>` with the shared error envelope and Bearer skeleton check — so the difference is internal layering only. The question is whether to unify it.

## Decision

Keep the three shapes. Each follows its stack's idioms (Go `internal/` package layering, Spring stereotype layering, small-Node flat modules); unifying them would fight all three ecosystems for no behavioural gain. Cross-module consistency is enforced at the contract surface (operation routes, envelope, auth), not in internal file layout.

## Owner acceptance (2026-10-24, Closes #188)

The owner approved the service-design layout in #181 and pre-authorized accepting this ADR with the #186 docs merge. The reviewer flagged the leftover `proposed` status as a non-blocking mismatch at merge time; this change flips the status to `accepted` to match the `docs/README.md` index row. No content change beyond the status flip.

## Consequences

- Reviewers must not file "unify layering" refactors; per-service layering disputes are closed by this ADR once accepted.
- Each service page documents its own shape; new modules pick the shape of their stack.
- If a module outgrows its shape (e.g. a Node service needing a real service layer), that is a T3 change with its own ADR, not silent drift.

## Options considered

### Option A — Keep stack-idiomatic layering (chosen)

Each stack keeps its natural shape; consistency lives at the HTTP contract surface.

- Upside: no churn, idiomatic code per ecosystem, smallest review surface.
- Downside: contributors working across stacks meet three layouts (mitigated: the service pages document each one).

### Option B — Unify on one layering vocabulary

Force `handler/service/store` naming onto Java and Node.

- Upside: single mental model across the monorepo.
- Downside: unidiomatic Spring and Node code; large rename churn with zero behavioural effect; fights framework conventions (e.g. Spring `web/repo` stereotypes).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-255
