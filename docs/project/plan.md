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
3. **Walking skeleton — gated sub-milestones.** The deployable
   on-premise installation (single-host default) lands in three
   ordered gates, so developers do not code until readiness is
   green:
   - **3a. Readiness specs.** Contract needs
     (`business-analyst`, #96), the LLD bundle (`architect`,
     #97), and harness skills (`ai-engineer`, #98) are written
     and merged. Exit signal: the three PRs (Closes #96, #97,
     #98) are merged.
   - **3b. Skeleton + per-stack CI.** The development skeleton
     is built from the 3a specs with per-stack CI jobs (`dev`,
     #99). Exit signal: a fresh checkout builds all modules
     and the CI per-stack jobs are green.
   - **3c. Desk loop E2E + backup.** The skeleton runs the desk
     loop thinly end to end — book, check in, post a charge,
     check out — with daily backup and its success/failure
     report working, on the minimum host shape (2 vCPU / 4 GB
     RAM / 50 GB disk per host). Exit signal: the loop runs on
     the hotel LAN hardware with a verified backup.
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

## Dev-start readiness checklist

Development code (milestone 3b onward) starts only when every 3a
exit signal is met — no coding until readiness is green:

- [ ] Contract needs merged (`business-analyst`, Closes #96) —
  the merged PR is the exit evidence.
- [ ] LLD bundle merged (`architect`, Closes #97) — the merged
  PR is the exit evidence.
- [ ] Harness skills merged (`ai-engineer`, Closes #98) — the
  merged PR is the exit evidence.

Each item links its gate issue above; the PR that closes the
issue carries the exit signal.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-133
