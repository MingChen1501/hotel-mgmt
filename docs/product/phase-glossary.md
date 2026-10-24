# Project phase glossary — POC, MVP, Pilot, Go-live

Status: active. Plain-language definitions of the four project
phases the way this project uses them, owned by `product-owner`.
Each phase states what it is, what must already be true before it
starts (entry), and what observable evidence closes it (exit) —
all checkable by the owner without reading code. Each phase points
at the plan milestone it belongs to
(`docs/project/plan.md`, active). This page documents what the
project already practices; it changes no gate and no milestone.

## POC (proof of concept) — technical feasibility

The POC answers one question: can the system run the daily desk
loop end to end on a real machine? It is a demonstration, not a
delivery: no real hotel data, no real guests.

- Entry: the walking-skeleton installation exists and the demo
  command is runnable (`script/demo-poc.sh` with the hotel's own
  configuration set; prerequisites in
  `docs/operations/demo-poc-checklist.md`, section 1, active).
- Exit evidence the owner can check: the demo prints
  `demo-poc: RESULT: PASS`, and the per-step pass/fail table in
  `docs/operations/demo-poc-checklist.md` (section 3, active) is
  fully marked PASS with the owner's sign-off recorded.
- Plan pointer: walking-skeleton milestone 3c (desk loop end to
  end with backup and restore drill).

## MVP (minimum viable product) — the minimum usable desk loop

The MVP is the smallest system one small hotel (under 50 rooms,
one building, one on-premise instance for one property) can run
its whole day on: book, check in, move, check out, housekeeping
status, seasonal pricing, repeat-guest recognition, folio with
payments and matching prints, agreeing reports, self-setup, and
data export with backup. The full capability list is the MVP
product scope (`docs/product/mvp-scope.md`, active); the roadmap
(`docs/product/roadmap.md`, active) places it as Horizon 1.

- Entry: POC passed (the desk loop demonstrably runs end to
  end) and the required specs for each slice are written and
  marked active with a `spec-reviewer` PASS (see the roadmap,
  Horizon 1 dependencies).
- Exit evidence the owner can check: every requirement has a
  passing guard — 57 of 57 traceability cells (43 functional
  plus 14 non-functional) verified with pass evidence in
  `docs/testing/test-report.md` (active) and mapped guard by
  guard in `docs/testing/traceability-matrix.md` (active) — and
  the MVP success criteria in the scope (section 6) all hold on
  a demo instance.
- Plan pointer: Modules milestone 4 (every functional
  requirement has a passing guard, every touched
  non-functional requirement meets its target).

## Pilot — one real hotel, one real day

The pilot is the first real operation: one real small hotel runs
one full operating day on the system — arrivals, in-house stays,
departures, day-close totals, printed invoices — with the runbook
in the manager's hands.

- Entry: MVP exit holds (all success criteria true, 57/57
  guards passing) and the installer runs end to end on
  hotel-like hardware with a restore drill completed inside the
  4-hour recovery target.
- Exit evidence the owner can check: every item in part B of
  `docs/operations/pilot-exit-checklist.md` (active) is
  satisfied with its evidence cell filled — day-close totals,
  printed invoice copies, the runbook walkthrough with a
  non-technical stand-in (part A), open follow-ups filed as
  issues (part C) — and the pilot sign-off lines carry the
  hotel owner/manager's and the delivery team's names and
  dates.
- Plan pointer: Pilot milestone 5 (hotel signs off; open risk
  items for go-live closed or accepted by the owner).

## Go-live — post-pilot operation

Go-live is normal operation after the pilot: the hotel runs its
days on the system, and every later change ships as a release
with notes and a way back.

- Entry: pilot signed off and every open risk item for go-live
  closed or accepted by the owner (plan milestone 5 exit
  signal).
- Exit evidence the owner can check: per-release entries exist
  under `docs/release/` — release notes describing what each
  release changes and a rollback entry describing how to undo
  it. (These pages stay stubs until the first release ships;
  see the plan, "after the pilot" note.)
- Plan pointer: the "after the pilot" step of the plan
  (release notes and per-release rollback entries begin).

## Phase order at a glance

| Phase | Question it answers | Exit evidence | Plan ref |
|---|---|---|---|
| POC | Can the desk loop run end to end? | `demo-poc.sh` prints RESULT PASS; checklist signed off | 3c |
| MVP | Can one hotel run its whole day on it? | 57/57 guards passing; scope success criteria hold | 4 |
| Pilot | Does it survive one real day? | Exit checklist complete; hotel sign-off | 5 |
| Go-live | Can it be operated and updated safely? | Release notes + rollback entries live per release | After pilot |

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-295
