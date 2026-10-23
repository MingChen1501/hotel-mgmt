# Test strategy — small-hotel property management system

Status: active. Testing approach for the hotel-mgmt MVP, owned by
`qa-lead` (Closes #62). The requirements baseline is
`docs/requirements/mvp-requirements.md` (43 FRs, 14 NFRs, business
rules, data dictionary, use cases, sequences, audit). At the Closes
#62 frame implementation had not started and no test guards existed
yet; guards now fill slice by slice and the live filled count is the
Coverage footer line in `traceability-matrix.md`. This document sets only
the strategy frame: levels, entry/exit criteria per slice, and what is
manual vs automated in the MVP. Detailed cases, data, plans, and
reports come per slice later (`test-cases.md`, `test-data.md`,
`test-plan.md`, `test-report.md` stay stubs until scoped).

## 1. Test levels

### L1 — FR acceptance (per slice)

Every FR in the slice is exercised against its Given/When/Then
acceptance criteria from `mvp-requirements.md`, using the handoff note
in its traceability section 4 as the minimum observable check. Each FR
keeps at least one guard; the guard slot is recorded in
`traceability-matrix.md` and filled by implementation slices. A slice
passes L1 only when every FR it touches has its guard slot filled and
passing.

### L2 — NFR verification (per slice, where the slice touches the NFR)

NFRs are verified against their measurable targets, not by
re-running FR steps:

- Performance (`NFR-PERF-1`, `NFR-PERF-2`): timed desk checks at the
  stated loads (50 rooms with a full book and 5 signed-in staff; two
  years of operating data for reports). Bounds: 2 s named views, 3 s
  named actions, 5 s standard reports. Timing runs execute on the
  reference host: the ADR-0001 single-host default (2 vCPU / 4 GB RAM
  / 50 GB disk, owner notation 2*4*50). Runs on the small-cluster
  variant are labelled as such and are never compared against
  single-host bounds.
- Security (`NFR-SEC-1`, `NFR-SEC-2`): role-matrix checks (every
  out-of-role attempt refused; no guest sign-in) plus lockout
  (5 consecutive failures) and idle sign-out (15 minutes) checks.
- Audit (`NFR-AUD-1`): sampled-change checks that every creation,
  change, cancellation, state transition, charge, and payment keeps
  an unaltered actor and timestamp.
- Retention, timezone, i18n, availability (`NFR-RET-1`, `NFR-TZ-1`,
  `NFR-I18N-1`, `NFR-AVL-1`): targeted checks per NFR target
  (purge refusal within the floor; UTC offset plus local-date
  rendering; catalogue-sourced strings with locale formatting;
  full desk flow with no outside connectivity).

### L3 — Overbooking concurrency (`NFR-CON-1`, `NFR-CON-2`)

Double-booking and double-assignment guards are paired simultaneous
attempts, not single-user scripts: two staff submit bookings for the
last sellable unit for overlapping dates at the same time, and two
check-ins target the same ready room at the same time. Exactly one of
each pair must succeed with the conflict named on the other side.
Target: 0 double-bookings and 0 double assignments across repeated
paired attempts. These guards run wherever reservations or check-in
behaviour changes, and at least once per release.

### L4 — On-premise install, backup, and restore (`NFR-DEP-1`, `NFR-BKP-1`, `NFR-BKP-2`, `FR-ADM-5`)

Single-property isolation (100% of sampled records belong to the
installed property), daily-backup completeness (RPO at most 24 h,
success at least 6 days out of 7), restore on equivalent hardware
(RTO at most 4 h), and the plain success-or-failure report on every
backup run. Install/restore drills run per release and after any
change to export, backup, or setup behaviour — never assumed from
FR-level pass alone.

### L5 — Per-hotel configuration (`FR-RES-3/6`, `FR-CUS-1/2/3`, `FR-ADM-1/4`, `FR-BIL-5/7`, `FR-RTE-3/4`, section 3.1)

Config-matrix checks: each item in requirements section 3.1 is set to
at least two distinct hotel setups and the desk is re-exercised
(required guest fields, standard times, cancellation reasons and
wording, no-show rules, open-balance approval, charge items, tax and
fee rules, stay restrictions, discounts). Fixed MVP behaviour from
section 3.2 (lifecycle order, one folio per stay, one property per
installation, three fixed roles, no automation, cash and card only)
is re-confirmed whenever configuration behaviour changes, so no
hotel setup can unlock what the MVP fixes.

### LC — Module contract guards (polyglot seams)

Desk-level L1 acceptance is not sufficient for the seams between the
polyglot modules: L1 exercises desk behaviour, but the accepted
ADR-0001 makes cross-module contract discipline load-bearing
(versioned module APIs/events, per-module jobs with a contract-check
stage). Every slice that touches a seam therefore also passes a
contract guard: the request/response shapes and the emitted domain
events are checked against the architect-owned contract outline in
`docs/technical/api-spec.md` section 2 (service names match the HLD
boundary table, `docs/architecture/hld.md` section 4) before the
slice can exit testing. The contract list is quoted here, not
invented — eight contracts:

- `ReservationService` — quote, create, modify, cancel, mark no-show;
  calendar query. Emits `ReservationEvents`.
- `StayService` — check in, check out, move room, record early/late
  times; arrivals/departures queries. Emits `StayEvents`.
- `RoomInventoryService` — room/room-type setup, status updates,
  out-of-order blocks, availability query. Emits `RoomStateEvents`.
- `PricingService` — rate-plan setup, price quote, discount
  application, restriction check. Emits `RateEvents`.
- `GuestService` — profile CRUD, preference/notes update,
  repeat-guest flag, confirmation record. Emits `GuestEvents`.
- `BillingService` — folio open, charge posting, payment recording,
  tax/fee derivation, day-close, settlement check. Emits `FolioEvents`.
- `ReportingService` — occupancy, revenue, daily sheet, housekeeping
  reports (read API over the reporting read model).
- `AdminService` — hotel profile, users/roles, configuration values,
  export/backup runs. Emits `ConfigChangedEvents`.

Contract guards run in CI in the per-module contract-check stage (see
ADR-0001 Consequences); desk-visible behaviour at the seams stays
covered by L1. This slot adds no new level numbers: L1–L5 keep their
meanings, and slice traceability rows name the required LC guard type
the same way they name L1–L5 guard types.

## 2. Entry criteria per slice

A slice enters testing when all of the following hold:

1. Its FR/NFR delta specs are `active` in `docs/README.md` with a
   `SPEC-GATE PASS` verdict where the tier requires one.
2. Its rows in `traceability-matrix.md` name the required guard type
   (guard column may still read TBD — filling it is the slice's job).
3. Its test cases and data for the slice exist (`test-cases.md` /
   `test-data.md` deltas, written per slice later).
4. The build under test is identified (commit or install image) and
   its seed data matches the slice's stated hotel setup.

## 3. Exit criteria per slice

A slice exits testing when all of the following hold:

1. Every FR the slice touches passes its L1 acceptance guard.
2. Every NFR the slice touches passes its L2/L3/L4/L5 verification
   against the numeric target (no target, no pass).
3. Every module seam the slice touches passes its LC contract guard
   against the `api-spec.md` section 2 outline.
4. All 57 traceability rows touched by the slice have their guard
   column filled (no TBD left for in-scope rows) — see
   `traceability-matrix.md`.
5. Open failures are filed as issues with FR/NFR ids attached; no
   `risk-high` / `risk-very-high` failure is waived without owner
   approval.
6. The slice's results are recorded (`test-report.md` delta, per slice
   later).

## 4. Manual vs automated in the MVP

Manual in the MVP (human at the desk, on the hotel's own premises):

- All L1 FR acceptance checks: a person books, checks in and out,
  posts charges, takes payments, and reads every print against the
  folio, because the MVP's acceptance targets are written as
  human-executable Given/When/Then.
- Timed desk checks (`NFR-PERF-1/2`), offline desk flow
  (`NFR-AVL-1`), install/restore drills (`NFR-BKP-2`, `NFR-DEP-1`),
  and print comparisons (confirmations, invoices, receipts) — all
  observed on site, not inferred from logs.
- Paired simultaneous attempts (`NFR-CON-1/2`): two signed-in staff
  acting at the same time.

Automated in the MVP (CI guards, once implementation starts):

- Regression guards that re-check previously passed FR acceptance
  and role-matrix (`NFR-SEC-1`) behaviour on every change.
- Catalogue checks (`NFR-I18N-1`): every user-visible string sourced
  from the message catalogue, no behaviour logic on English wording.
- Backup-run reporting presence (`NFR-BKP-2`): every run produces a
  visible success-or-failure report with its time.
- Contract-shape and event checks (`LC`): request/response shapes and
  emitted domain events checked against `api-spec.md` section 2 in
  the per-module contract-check stage.

At the Closes #62 frame nothing was automated before implementation
existed: that frame created no guards, only the slots slices fill.
Guards now fill slice by slice; the live filled count is the Coverage
footer line in `traceability-matrix.md`.

## 5. Out of scope for this frame

Test cases, test data, per-slice test plans, and test reports
(per slice later); running any tests; product or architecture
changes; code.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-124
