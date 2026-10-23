# Project plan — from specs to pilot

Status: active. Milestones for the hotel-mgmt MVP, owned by
`product-owner` (Closes #63), with `release-manager` input on
deployment/operations matters. Quarter-neutral: stages state order
and exit signals, never calendar dates — no invented dates appear in
this document. Scope content for each stage comes from the product
and requirements specs; this plan orders the work only.

## Milestones

1. **Specs done.** The product picture (`docs/product/*`), the
   requirements baseline (`docs/requirements/mvp-requirements.md`
   with FRs, measurable NFRs, and traceability), the architecture
   outline (`docs/architecture/*` with ADR-0001 accepted 2026-10-23),
   the test strategy (`docs/testing/test-strategy.md`), and these
   DevOps/Operations/Project docs are written and marked active.
   Exit signal: `spec-reviewer` PASS on each spec batch.
2. **Stack decision — done.** The owner chose the implementation stack
   (language, runtime, database engine, container and host shape)
   and accepted ADR-0001 on 2026-10-23 (recorded on #28 / D-7 in
   `docs/project/decision-log.md`), closing the sizing open question
   (smallest supported on-premise host). Exit signal met: accepted ADR
   plus published minimum host sizing (2 vCPU / 4 GB RAM / 50 GB disk
   per host in `docs/devops/deployment.md`, section 5).
3. **Walking skeleton.** One deployable on-premise installation
   (single-host default) runs the desk loop thinly end to end —
   book, check in, post a charge, check out — with daily backup
   and its success/failure report working. Exit signal: the loop
   runs on the hotel LAN hardware with a verified backup.
4. **Modules.** The remaining MVP capabilities land slice by
   slice (reservations, rooms and housekeeping, rates, guests,
   billing, reporting, administration, per-hotel customisation),
   each with its test guards per the test strategy. Exit signal:
   every FR has a passing guard and every touched NFR meets its
   measurable target.
5. **Pilot.** One real small hotel operates a full day on the
   system — arrivals, in-house stays, departures, day-close
   totals, printed invoices — with the runbook in the manager's
   hands and a restore drill completed inside RTO 4 hours. Exit
   signal: the pilot hotel signs off and the open risk items for
   go-live are closed or accepted by the owner.

After the pilot, release notes and per-release rollback entries
begin (`docs/release/*`, still stubs until the first release
ships).

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-129
