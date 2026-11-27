# Traceability matrix — FR/NFR-to-guard frame

Status: active. Guard-slot frame for the hotel-mgmt MVP, owned by
`qa-lead` (Closes #62). Every FR (43) and NFR (14) from
`docs/requirements/mvp-requirements.md` appears below with its
required guard type. The guard column reads TBD except where slices
have filled it with the real guard reference (never invented here).
No FR/NFR may be marked complete while its guard cell reads TBD.
The Coverage footer line below is the live count of filled rows.
Levels L1–L5 and LC are defined in `test-strategy.md`. LC contract coverage
for touched seams is tracked via the per-module contract-check CI
stage against `docs/technical/api-spec.md` [section 2](../technical/api-spec.md), not in per-row
Guard cells (see strategy section LC and exit-criterion section 3, item 3).

## 1. Functional requirements (43)

| Requirement | Required guard type | Guard |
|---|---|---|
| FR-RES-1 — Create direct reservation | L1 acceptance: book each room type across a season boundary, check quoted price and reference | Guard: `services/reservations` handler test `TestDeskLoopBookThenOverbookingRefused` (book + overbooking `CONFLICT`) + fixtures `CreateReservation.json`, `CreateReservation-conflict.json`; L3 pair `TestPairedBookingExactlyOneWins` (PR #112 slice); pg persistence + `CheckInReservation` round-trip (memory + pg) and fixture (PR #149 slice); UI-shaped confirm carries the guest snapshot and the searched sellable count (PRs #327/#328 for issues #321/#322). |
| FR-RES-2 — Modify reservation | L1 acceptance: change dates/type/guest, check repricing and change record | Guard: `services/reservations` handler test `TestDeskLifecycleModifyCancelNoShowCalendar` (book + modify with repriced total + cancel-refused-after) + service tests (reprice-required, restriction-cause, unknown-ref NOT_FOUND) + store test `TestModifyRepricesAndRecordsChange` (dates/type/price change rows with actor + timestamp) + `TestModifyCheckedInRefused` + fixtures `ModifyReservation.json`, `ModifyReservation-checked-in.json`, `ModifyReservation-conflict.json`; pg modify round-trip with the restored `reservations.reservations` row (PR #159 slice). |
| FR-RES-3 — Cancel reservation with reason | L1 acceptance + L5 config-matrix: cancel under each of two hotel reason lists, check the reason comes from the hotel's list plus state and released availability | Guard: `services/reservations` handler test `TestDeskLifecycleModifyCancelNoShowCalendar` (missing-reason VALIDATION_FAILED + cancel with kept reason + rebook of released dates) + service tests (happy path, missing reason) + store test `TestCancelKeepsReasonAndReleases` (state + kept reason + release rebook) + `TestCancelRefusals` + fixtures `CancelReservation.json`, `CancelReservation-missing-reason.json`, `CancelReservation-checked-in.json`; pg cancel round-trip with outbox `cancelled` row (PR #159 slice). Baseline keeps a non-empty hotel reason verbatim (BR-7); list-membership matrix stays with the config slice. |
| FR-RES-4 — Walk-in booking | L1 acceptance: same-day booking, check arrival-state readiness and arrivals-list entry | Guard: `services/reservations` handler test `TestWalkInSameDayBookingConfirmedAndOnArrivals` (arrival today, confirmed state, immediate `CheckInReservation` readiness, QueryCalendar arrivals entry over the business date; dates derive from the clock) + fixture `CreateReservation-walk-in.json` (PR #182 slice). |
| FR-RES-5 — Reservation calendar | L1 acceptance: seeded multi-date multi-type bookings, check placement and drill-down | Guard: `services/reservations` handler test `TestDeskLifecycleModifyCancelNoShowCalendar` (seeded cancelled + confirmed + no-show entries across ranges, per-state placement, GetReservation drill-down for reference, guest, and price on every entry) + fixture `QueryCalendar.json` (PR #159 slice). |
| FR-RES-6 — No-show handling | L1 acceptance + L5 config-matrix: mark past-arrival booking no-show under each of two hotel no-show rules, check state, released room, history and kept reason | Guard: `services/reservations` handler test `TestDeskLifecycleModifyCancelNoShowCalendar` (too-early STATE_ILLEGAL + past-arrival mark with kept reason) + service tests (happy path, too-early refusal) + store test `TestMarkNoShowReleasesAndKeepsHistory` (state + kept reason + history entry + release rebook) + `TestMarkNoShowRefusals` + fixtures `MarkNoShow.json`, `MarkNoShow-too-early.json`, `MarkNoShow-in-house.json`; pg no-show round-trip with outbox `no-show` row (PR #159 slice). No folio charge posted here: the no-show charge decision is deferred per LLD D1. |
| FR-FDK-1 — Check-in | L1 acceptance: check in against a ready room, check stay link and occupied state | Guard: `services/stay` CheckIn/GetStay round-trip (memory + pg `pgstore.test.ts`) + e2e same-day AssignRoom -> CheckIn -> CheckInReservation with the restored `stay.stays` row (PR #149 slice). |
| FR-FDK-2 — Check-out | L1 acceptance: check out a settled stay, check closure, final invoice, vacant-dirty state | Guard: `services/stay` CheckOut/GetStay round-trip (settled close, open-balance `SETTLEMENT_REQUIRED` refusal, approved close, idempotent replay, second-close `STATE_ILLEGAL`, paired-simultaneous exactly-one-winner) + fixtures `CheckOut.json`, `CheckOut-open-balance.json`, `CheckOut-approved.json`, `CheckOut-repeat.json`; pg `closes, moves, and times the stay row`; e2e approved-checkout → `ReleaseRoom` vacant-dirty with the restored closed `stay.stays` row (PR #150 slice). Desk-side enforcement of the release and of the every-route gate is the #588 slice (section 10, `FR-CKO-1`..`FR-CKO-5`); the MVP guard above stands unchanged. |
| FR-FDK-3 — Room moves | L1 acceptance: move an in-house guest, check both room states and kept history | Guard: `services/stay` MoveRoom tests (new room link, `move.fromRoomId/toRoomId/movedAt`, unknown/closed/same-room refusals) + fixtures `MoveRoom.json`, `MoveRoom-room-taken.json`; pg move round-trip with the `stay_moves` row; e2e AssignRoom → MoveRoom → ReleaseRoom with both room states (PR #150 slice); `services/rooms` test `coordinates a room move end to end on the rooms side` (assign new room, release old to vacant-dirty, walk back to inspected, re-assign; PR #160 slice). |
| FR-FDK-4 — Early check-in and late check-out | L1 acceptance: record off-hours arrival/departure, check kept times and list visibility | Guard: `services/stay` RecordActualTimes tests (kept times, departure-before-arrival and malformed refusals) + fixtures `RecordActualTimes.json`, `RecordActualTimes-implausible.json`; e2e actual-times step with list visibility (PR #150 slice). |
| FR-FDK-5 — Arrivals and departures list | L1 acceptance: seed all three groups, check exactly-once listing with names and states | Guard: e2e QueryCalendar arrivals + stay QueryStays in-house listing compared to the pre-failure record by `restore.sh --expect-file` (PR #149 slice). |
| FR-RMS-1 — Room inventory with live status | L1 acceptance: set every state, check each room appears once with the right state | Guard: `services/rooms` test `creates a room type and room, then reports sellability` + fixtures `UpsertRoomType.json`, `UpsertRoom.json`, `ListRoomsByState.json`, `CheckRoomTypeSellability.json` (PR #112 slice); `services/rooms` test `emits the stable room UUID in inventory rows and the assignment echo` asserts each inventory row carries the `roomId` UUID from `UpsertRoom` (issue #256). |
| FR-RMS-2 — Housekeeping status updates | L1 acceptance: walk dirty to inspected, check check-in offer and change record | Guard: `services/rooms` test `walks dirty to inspected and refuses dirty straight to inspected` + fixtures `UpdateRoomState.json`, `UpdateRoomState-illegal.json` (PR #112 slice). |
| FR-RMS-3 — Out-of-order and maintenance blocks | L1 acceptance: block a range, check display plus refused booking and check-in on blocked dates | Guard: `services/rooms` test `names the block when a blocked room is checked` + fixtures `BlockRoom.json`, `CheckRoomTypeSellability-blocked.json` (PR #112 slice); `services/rooms` tests `blocks a range, releases it, and returns the room to sale` and `refuses to release a range with no covering block` (unknown room `NOT_FOUND`) + fixtures `ReleaseBlock.json`, `ReleaseBlock-no-block.json` and the `block-released` outbox event; pg block/release round-trip (PR #160 slice). |
| FR-RMS-4 — Room setup and attributes | L1 acceptance: define floor/bed/features, check inventory and assignment visibility | Guard: `services/rooms` tests cover floor/bed/features setup + assignment visibility (`AssignRoom` happy path); fixtures `UpsertRoomType.json`, `UpsertRoom.json`, `AssignRoom.json` (PR #112 slice); `services/rooms` test `emits the stable room UUID in inventory rows and the assignment echo` asserts the `AssignRoom` echo carries the `roomId` UUID from `UpsertRoom` (issue #256). |
| FR-RTE-1 — Rate plans per room type | L1 acceptance: set seasonal/day prices, check new quotes follow them | Guard: `services/rates` test `TestDeskLoopSetRateSearchQuote` (plan + nightly prices drive the quote) + fixtures `UpsertRatePlan.json`, `UpsertRatePrice.json`, `QuotePrice.json` (PR #112 slice). |
| FR-RTE-2 — Availability overview | L1 acceptance: seed occupancy, blocks, bookings, check per-type per-date counts | Guard: `services/rates` test `TestDeskLoopSetRateSearchQuote` (per-date counts) + fixtures `CheckSellableCount.json`, `CheckRoomTypeSellability-consumed.json` (PR #112 slice). |
| FR-RTE-3 — Manual discounts and special rates | L1 acceptance + L5 config-matrix: apply a named discount, check kept name and folio effect | Guard: `services/rates` tests `TestQuoteAppliesNamedDiscount` (percent kept by name + unknown discount `VALIDATION_FAILED`), `TestQuoteAppliesAmountDiscount` (amount kept by name + floor at zero), `TestQuoteBreakdownSumsToTotal` + fixtures `UpsertDiscount.json`, `QuotePrice-discounted.json`, `QuotePrice-amount-discount.json`, `QuotePrice-unknown-discount.json`; pg parity `TestPostgresQuoteDiscounts` (PR #161 slice). Folio follows the kept name via the reservation priceBasis discountName field (no folio change in this slice). |
| FR-RTE-4 — Stay restrictions | L1 acceptance + L5 config-matrix: set each restriction type, check refusal names the restriction | Guard: `services/rates` tests `TestRestrictionRefusalNamesRestriction` (min-stay refused naming the restriction) + `TestClosedToArrivalRefusalNamesRestriction` (closed-to-arrival refused naming the restriction, outside window passes) + `services/reservations` test `TestRestrictionViolationRefusesWithCause` + fixtures `UpsertRestriction.json`, `CheckRestrictions-violated.json`, `CheckRestrictions-closed-to-arrival.json`; pg parity `TestPostgresRestrictionRefusalNamesRestriction`, `TestPostgresClosedToArrivalRefusal` (PR #161 slice). |
| FR-RTE-5 — Reservation price basis | L1 acceptance: create on a rate plan, change the plan, check the quoted price is unchanged unless recalculated | Guard: `services/rates` test `TestQuoteAppliesNamedDiscount` (quoted total frozen on the reservation by `TestDeskLoopBookThenOverbookingRefused`) + `TestQuoteBreakdownSumsToTotal` (one entry per night, entries sum to the undiscounted total, discounted total follows the kept name) + fixtures `QuotePrice.json`, `QuotePrice-discounted.json`, `CreateReservation.json`; pg parity `TestPostgresQuoteBreakdown` (PR #112 slice for the base quote, PR #161 slice for the breakdown rules). |
| FR-GST-1 — Guest profiles with stay history | L1 acceptance: link past and upcoming stays, check profile completeness | Guard: `services/guests` tests `looks a guest up by full-name search key with stay links and the returning flag` (IdentifyGuest by id and by name returns profile + stayLinks) + `refuses lookups for unknown guests...` + fixtures `IdentifyGuest.json`, `IdentifyGuest-by-name.json`, `IdentifyGuest-unknown-guest.json` (PR #157 slice); `returns the full profile with mandatory-field status by guest link` (GetGuest profile + stayLinks + mandatoryFieldStatus) + `links stays from stay lifecycle events and flags returning guests` (StayEvents link ingestion, duplicate delivery stays idempotent) + `refuses profile and stay-link writes for unknown guests` + fixtures `GetGuest.json`, `GetGuest-unknown-guest.json`, `GetGuest-missing-field.json` (PR #162 slice). |
| FR-GST-2 — Guest preferences and notes | L1 acceptance: save notes, check they surface before booking confirmation | Guard: `services/guests` test `saves notes and shows them in booking context before confirmation` (UpsertGuest notes round-trip through GetBookingContext) + fixtures `UpsertGuest.json`, `UpsertGuest-missing-field.json`, `GetBookingContext.json`, `GetBookingContext-unknown-guest.json` (PR #157 slice). |
| FR-GST-3 — Repeat-guest recognition | L1 acceptance: book for a past guest, check the returning flag and stay count | Guard: `services/guests` test `looks a guest up by full-name search key with stay links and the returning flag` (returningFlag + pastStayCount on every IdentifyGuest) + fixtures `IdentifyGuest.json`, `IdentifyGuest-by-name.json` (PR #157 slice); `links stays from stay lifecycle events and flags returning guests` (flag + count derive from linked stays on GetGuest and IdentifyGuest) (PR #162 slice, no contract change). |
| FR-GST-4 — Booking confirmation record | L1 acceptance: produce a confirmation, check hotel, guest, dates, type, price | Guard: `services/guests` test `produces the confirmation record for a known reservation ref` (record matches hotel, guest, dates, type, price exactly) + `refuses confirmation for an unknown reservation ref with NOT_FOUND` (unknown ref 404, missing ref 400) + fixtures `ProduceConfirmation.json`, `ProduceConfirmation-unknown.json` (PR #189 slice); end-to-end wiring fix (PR #329 for issue #323). |
| FR-BIL-1 — Guest folio | L1 acceptance: open a stay folio, check single folio with running balance | Guard: `BillingServiceTest` getFolioBalance + `BillingControllerTest` folio route + e2e folio persists with running balance, restore drill `billing.folios` row (PR #149 slice). |
| FR-BIL-2 — Room and extra charges | L1 acceptance: post room and extra lines, check lines plus balance movement | Guard: `BillingServiceTest` postCharge (+undefined-item refusal) + `BillingControllerTest` + e2e nightly-room-charge line, restore drill (PR #149 slice). |
| FR-BIL-3 — Payment recording | L1 acceptance: record cash and card payments, check method, time, balance movement | Guard: `BillingServiceTest` recordPayment (+bad-method refusal) + e2e cash payment, restore drill (PR #149 slice). |
| FR-BIL-4 — Invoice and receipt | L1 acceptance: print invoice and receipts, check exact match to folio and payments | Guard: `BillingServiceTest` produceInvoice exact-match + unknown-folio NOT_FOUND and produceReceipt exact-match + unknown-payment NOT_FOUND + `BillingControllerTest` invoice/receipt routes + fixtures `ProduceInvoice.json`, `ProduceInvoice-unknown-folio.json`, `ProduceReceipt.json`, `ProduceReceipt-unknown-payment.json` + e2e invoice-matches-folio and receipt-matches-payment asserts (PR #151 slice). |
| FR-BIL-5 — Configurable taxes and fees | L1 acceptance + L5 config-matrix: set rules, post a charge, check derived amounts and balance | Guard: `BillingServiceTest.postChargeDerivesTaxAndFeeFromHotelRules` (+`upsertTaxFeeRuleRefusesBadInput`) + `BillingControllerTest` taxed `PostCharge` route and `UpsertTaxFeeRule` route + fixtures `PostCharge-taxed.json` (PR #190 slice). |
| FR-BIL-6 — Day-close totals | L1 acceptance: post a day of activity, close, check per-method totals agree with folios | Guard: `BillingServiceTest` runDayClose totals + e2e RunDayClose/GetDayClose compared to the restored `billing.day_close_runs` row (PR #149 slice). |
| FR-BIL-7 — Settlement before check-out | L1 acceptance + L5 config-matrix: attempt open-balance check-out under each of two hotel approval setups, check refusal unless an authorised approval is recorded | Guard: `BillingServiceTest` approval record/replay/refusal tests + `BillingControllerTest` approval route + fixture `RecordOpenBalanceApproval.json`; stay-side gate tests (settled/approved/refused) + e2e refusal-then-approved-checkout steps (PR #150 slice). Desk-side every-route gate and the recorded-approval provenance rule are the #588 slice (section 10, `FR-CKO-4` / `FR-CKO-5`); the MVP guard above stands unchanged. |
| FR-RPT-1 — Occupancy report | L1 acceptance: compare per-date counts against seeded bookings | Guard: `services/reporting` `TestRebuildMatchesSourceRows` (occupancy rows match seeded bookings after rebuild; cancelled booking excluded) + `TestDuplicateDeliveryNeverDoubleCounts` + `TestDeskLoopReadsRebuiltReports` + fixtures `OccupancyReport.json` (PR #156 slice). |
| FR-RPT-2 — Revenue summary | L1 acceptance: compare room/extra totals against seeded folios | Guard: `services/reporting` `TestRebuildMatchesSourceRows` (room/extra totals match seeded folio charges after rebuild) + `TestDuplicateDeliveryNeverDoubleCounts` + `TestDeskLoopReadsRebuiltReports` + fixtures `RevenueSummary.json` (PR #156 slice). |
| FR-RPT-3 — Front-desk daily sheet | L1 acceptance: compare all four groups against underlying records | Guard: `services/reporting` `TestRebuildMatchesSourceRows` (arrivals, in-house, departures, open balances match seeded records after rebuild; settled folio excluded) + `TestDuplicateDeliveryNeverDoubleCounts` + `TestDeskLoopReadsRebuiltReports` + fixtures `DailySheet.json` (PR #156 slice). |
| FR-RPT-4 — Housekeeping status report | L1 acceptance: check only rooms needing work appear | Guard: `services/reporting` `TestRebuildTracksRoomsNeedingWork` (dirty + clean-but-uninspected appear after rebuild; inspected + out-of-order excluded; duplicate delivery unchanged) + `TestDeskLoopReadsHousekeepingReport` + fixture `HousekeepingReport.json` (PR #191 slice). |
| FR-ADM-1 — Hotel profile setup | L1 acceptance + L5 config-matrix: save identity and local settings, check prints and date behaviour | Guard: `services/admin` test `saves local settings and enforces role reach` + fixtures `UpdateHotelConfig.json`, `GetHotelConfig.json` (PR #112 slice); deployment set applied reproducibly via `script/apply-hotel-config.sh` (validates, saves through `UpdateHotelConfig` including the profile `name`, verifies the read-back) + e2e hotel-values-in-effect assert on a fresh install (PR #158 slice). |
| FR-ADM-2 — User accounts and roles | L1 acceptance: create each role, check sign-in plus exact function reach | Guard: `services/admin` tests (owner boot sign-in, per-role create + `FORBIDDEN` reach, 5-strike lockout) + fixtures `SignIn.json`, `CreateUser.json`, `CreateUser-duplicate.json` (PR #112 slice); role-change/unlock/sign-out/list coverage (`updates a user role and guards self-change plus the last owner`, `refuses to demote the last remaining owner`, `refuses role changes from front-desk accounts`, `unlocks a locked identity so sign-in works again`, `ends the session on sign-out`, `lists users with lock state and never leaks secret hashes`) + fixtures `UpdateUserRole.json`, `UpdateUserRole-forbidden.json`, `UnlockIdentity.json`, `UnlockIdentity-forbidden.json`, `SignOut.json`, `ListUsers.json`, plus the desk admin console wired to these ops (now `app/src/views/AdminView.vue`: loads users/config/audit `AdminView.test.ts:207`, create round-trip `:249`, role change `:274`, unlock `:294`; PR #163 slice); self-service secret rotation (`rotates the caller's own secret: old stops, new signs in`, `refuses a wrong current secret without lockout side effects`, `refuses rotation without a session token or a new secret`, `lets any role rotate its own secret and records the change in the audit log`, plus the pg round-trip `rotates the persisted secret hash`) + fixtures `ChangeSecret.json`, `ChangeSecret-wrong-secret.json` (issue #284, PR #315). |
| FR-ADM-3 — Room and room-type setup | L1 acceptance: define rooms, check inventory, availability, and calendar uptake | Guard: `services/rooms` test `defines rooms as owner and shows them in inventory and availability` (owner-actor UpsertRoomType/UpsertRoom with capacity, ListRoomsByState inventory, CheckRoomTypeSellability availability; calendar uptake via the e2e desk loop booking a defined type) (PR #182 slice). |
| FR-ADM-4 — Rate-plan and policy setup | L1 acceptance + L5 config-matrix: save plans, times, policies, check pricing and list behaviour | Guard (config level, PR #158 slice): pre-flight validates the standard-time formats (`times.checkIn/checkOut/businessDayStart` strict 24-hour HH:MM via `script/validate-hotel-config.sh`, fails closed on defaults) + `services/admin` name/times round-trip test with blank-name `VALIDATION_FAILED` refusal + e2e apply verifies the hotel's own times in effect via `GetHotelConfig`. Desk pricing and list behaviour stay with later slices. |
| FR-ADM-5 — Data export and backup | L1 acceptance + L4 install/restore drill: run export/backup, check completeness plus success/failure report | Guard: e2e backup artifact + `restore.sh --verify-only --expect-file` proves arrivals, the in-house stay, and day-close totals survive, with the visible success report (PR #149 slice); the issue #117 drill extension additionally proves the config rows survive (hotel profile name, room states, rate prices) against the runbook section 5 owner checks. |
| FR-CUS-1 — Customisable required guest fields | L1 acceptance + L5 config-matrix: mark fields mandatory, check refusal names the field | Guard: `services/reservations` test `TestMissingMandatoryGuestFieldNamesField` (refusal names `fullName`) + fixture `CreateReservation-missing-guest-field.json` (PR #112 slice); the UI-shaped confirm carries the guest name so the hotel-mandatory check passes (PR #327 for issue #321). |
| FR-CUS-2 — Customisable stay policies | L1 acceptance + L5 config-matrix: save times and wording, check desk enforcement and display | Guard: `services/admin` test `saves stay times and cancellation wording and shows them back` (owner save + verbatim read-back of times and wording, front-desk `FORBIDDEN`); e2e `apply-hotel-config.sh` verifies `cancellationWording` in effect via GetHotelConfig; times-format enforcement stays with `validate-hotel-config.sh` (PR #182 slice). |
| FR-CUS-3 — Custom charge items | L1 acceptance + L5 config-matrix: define an item, check posting availability and invoice naming | Guard: `BillingServiceTest` postCharge (+undefined-item refusal) + `UpsertChargeItem.json` fixture + e2e defined-item post with invoice naming assert (PR #151 slice). |

## 2. Non-functional requirements (14)

| Requirement | Required guard type | Guard |
|---|---|---|
| NFR-DEP-1 — Single-property on-premise installation | L4 install drill: sample records across screens, reports, exports — 100% belong to the installed property | Guard (PR #158 slice): documented install path with a hotel config (`deploy/config/README.md`) — pre-flight and Ansible validation fail closed on defaults and placeholders, `script/apply-hotel-config.sh` saves the set idempotently through Admin with read-back verification, and the e2e desk loop asserts the hotel's own identity and times in effect on a fresh install. |
| NFR-BKP-1 — Backup frequency and recovery point | L4 restore drill: restore from latest backup — RPO at most 24 h, success at least 6 days out of 7 | Guard: daily full backup of the shared engine + restore drill from the latest verified copy; RPO 24 h is the schedule target per backup-dr (PR #149 slice). |
| NFR-BKP-2 — Restore time and verifiability | L4 restore drill: restore on equivalent hardware — RTO at most 4 h, 100% of runs report success or failure with time | Guard: restore drill elapsed stays inside the 4 h RTO with the elapsed time printed, and every run writes a visible success-or-failure report (PR #149 slice; config-row comparison added by issue #117). |
| NFR-AUD-1 — Audit trail for reservation, room, and folio changes | L2 sampled-change check: 100% of sampled changes carry an unaltered actor and timestamp | Guard: `restore.sh --expect-file` asserts created_by/created_at are non-null on the restored reservations, stays, folios, and day-close rows; history tables persist change rows (PR #149 slice). Read-only desk view (PR #163 slice, owner-confirmed despite the Later recording scope): `services/admin` tests `shows account and config changes with actor and time, newest first` + `refuses the audit log for front-desk accounts and bad limits`, fixtures `QueryAuditLog.json` + `QueryAuditLog-empty.json`, surfaced in the admin console (now `app/src/views/AdminView.vue`; audit re-query `AdminView.test.ts:313`); recording semantics unchanged. |
| NFR-CON-1 — No double-booking under simultaneous bookings | L3 paired simultaneous attempts: 0 double-bookings, exactly one succeeds with the conflict named | Guard: L3 `TestPairedBookingExactlyOneWins` in `services/reservations/internal/store/store_test.go` — paired simultaneous attempts, 0 double-bookings, exactly one succeeds with `CONFLICT` naming type+dates (PR #112 slice); modify-path extension `TestPairedModifyExactlyOneWins` — paired simultaneous moves onto the last sellable unit, exactly one wins with `CONFLICT` naming type+dates (PR #159 slice). |
| NFR-CON-2 — No double room assignment at check-in | L3 paired simultaneous attempts: 0 double assignments, exactly one takes the room with the conflict named | Guard: L3 `grants exactly one winner for paired simultaneous assignments` in `services/rooms/src/server.test.ts` — paired `AssignRoom` attempts, 0 double assignments, exactly one takes the room with `CONFLICT` (PR #112 slice); stay-side `grants exactly one winner for paired simultaneous check-outs` in `services/stay/src/server.test.ts` — paired `CheckOut` attempts, exactly one closes with `STATE_ILLEGAL` for the loser, plus the conditional in-house `UPDATE` in `PostgresStayStore` (PR #150 slice). |
| NFR-PERF-1 — Desk response under a full small hotel | L2 timed desk check: named views within 2 s, named actions within 3 s at stated load | Guard: `script/e2e-perf-check.sh` timed run on a full 50-room book with 5 signed-in staff (12 view + 9 action timings, nanosecond clocks); bounds asserted only on the 2*4*50 reference host, CI runs recorded as `ci-e2e-variant` in `test-report.md` (PR #182 slice). |
| NFR-PERF-2 — Report response | L2 timed check: each standard report within 5 s on two years of 50-room data | Guard: `services/reporting` test `TestPerfTwoYearReportsRecordTimings` (126,100 domain events over 731 days rebuilt in-process; Occupancy/Revenue/DailySheet/HousekeepingReport timed, scale-correctness asserted); CI variant recorded in `test-report.md` [section 4](test-report.md) (#216 slice times housekeeping; PR #182 slice). |
| NFR-SEC-1 — Role-based access | L2 role-matrix check: 100% of out-of-role attempts refused, 0 guest sign-ins | Guard (PR #163 slice): `services/admin` tests refuse every user/role and audit op for front-desk callers (`refuses role changes from front-desk accounts`, unlock/audit `FORBIDDEN` branches) + `UpdateUserRole-forbidden.json`, `UnlockIdentity-forbidden.json` fixtures; 0 guest sign-ins holds (every op except `SignIn` requires a session token). |
| NFR-SEC-2 — Authentication | L2 sign-in check: lockout after 5 consecutive failures, sign-out after 15 idle minutes | Guard (PR #163 slice): existing 5-strike lockout test plus `unlocks a locked identity so sign-in works again` (owner/manager `UnlockIdentity` round trip) and `ends the session on sign-out` (token refused after `SignOut`); locked refusals named `IDENTITY_LOCKED` in the shared envelope (contract PRs #330/#332; locked-specific sign-in message, PR #325; client guard `preserves the locked code and wording on a locked-identity 401`, gate test `App.test.ts:330`); 15-minute idle expiry unchanged in both stores. |
| NFR-RET-1 — Data retention | L2 purge check: 24 months minimum retrievable, 0 records removed from within the floor | Guard: the installer applies the hotel's configured retention floor with the configuration set (`script/install.sh` → `script/apply-hotel-config.sh`), and the restore drill confirms the floor value survives backup and restore (PR #153 slice). |
| NFR-TZ-1 — Date and timezone handling | L2 record check: 100% of sampled records carry a UTC offset and render on the correct local date | Guard: timestamptz columns on every touched table; the drill sample carries UTC offsets on the hotel-local day (PR #149 slice). |
| NFR-I18N-1 — Internationalisation readiness | L2 catalogue check: 100% of user-visible strings from the catalogue, locale formatting, no behaviour on English wording | Guard (PR #192 slice): `messages/en.json` catalogue with `messages/sample.json` covering the reservations/admin/billing error envelopes and the frontend desk copy, enforced by `script/catalogue-coverage-check.sh` (CI `ci` job; keys/params/call-sites, byte-identical mirrors, default-locale rendering) plus per-stack loader/formatter unit tests (`messages_test.go`, `messages.test.ts`, `MessagesTest`, frontend loader smoke) — default-locale output byte-identical, no behaviour on wording; rates/reporting/rooms/stay/guests plus `script/` wording extend the sample in #201. |
| NFR-AVL-1 — On-premise availability | L2 offline desk check: 100% of named desk actions succeed with no outside connectivity | Guard: the pilot runbook walkthrough (docs/operations/pilot-exit-checklist.md part A, runbook.md [section 4](../operations/runbook.md)) confirms with a non-technical stand-in that booking, check-in, check-out, charge posting, payment recording, and invoice printing all complete with no outside connectivity (PR #153 slice). |

## 3. Migration shell slice (Refs #291)

Shell slice of ADR-0003 (accepted 2026-10-25): the Vue 3 +
Vite shell under `/app/` (migration #291–#299, #311, #313;
styling and shell nav #348). Requirements live in
`docs/requirements/mvp-requirements.md` [section 7](../requirements/mvp-requirements.md) (FR-SHL-1..4,
NFR-SHL-1..3, owned by `business-analyst`); design and per-flow
diagrams (happy path + failure/rollback path) live in
`docs/architecture/hld.md` [section 11](../architecture/hld.md) and
`docs/architecture/lld.md` [section 11](../architecture/lld.md) (placeholder render section 11.1,
shared-client 401-to-sign-out section 11.2, offline banner/manual retry
section 11.3). These stay temporary scaffold requirements,
superseded per screen as follow-up issues land real routes; they do not
alter the 57-row MVP coverage count above.

All 7 shell guards below exist and pass (cited `file:line`,
verified on disk); no shell row is TBD.

| Shell item | Required guard type | Guard |
|---|---|---|
| FR-SHL-1 — Placeholder route renders under `/app/` | Served-shell navigation: load `/app/` plus one history-mode deep `/app/*` path (reload included), check exactly one view renders and no other app route is reachable | Covered — route shape `app/src/router.test.ts:17` (desk, book, stay, folio, print, admin plus the placeholder catch-all), per-route render `:32,40,48,56,64,72`; served-shell fallback `script/shell-served-check.sh` (deep-link, reload, and unknown `/app/*` paths return the built entry with status 200); browser layer `app/e2e/smoke.spec.ts` plus the flow specs. |
| FR-SHL-2 — Shared Bearer API client plus session store used by the shell | Shared-client 401 test: force a `401` / `UNAUTHENTICATED` through the shared client, check the store token clears and the shell routes to sign-in; token survives reload and dies with the tab (`sessionStorage`) | Covered — `app/src/api/client.test.ts:55` (401 clears the token and routes to sign-in), `:68` (`UNAUTHENTICATED` envelope on HTTP 200 signs out), `:83` (locked-identity 401 preserves the code); session mechanics `app/src/stores/session.test.ts:21,33,43`; gate behaviour `app/src/App.test.ts:216` suite (`:254` sign-in lands, `:423` expired notice on mid-session 401). |
| FR-SHL-3 — Print routes reserved, none implemented | Namespace-reservation check: load `/app/print/...`, check no print document renders while the namespace stays reserved | Covered — `app/src/router.test.ts:91` (unknown print sub-paths route to the placeholder with no print document); print isolation `app/src/shell-styling.test.ts:78` (screen CSS inside `@media screen` only, book/print styles print-only) plus `app/src/views/PrintView.test.ts:723`. |
| FR-SHL-4 — Legacy pages and `/docs` mirror intact | Mirror half: byte-identical OpenAPI check; served half: each legacy page 301-redirects to its `/app/*` equivalent (legacy HTML decommissioned in #313) | Covered — mirror half `script/openapi-route-check.sh:46` (`cmp -s` byte-identical assert, CI-green); served half: legacy 301s recorded live in the A1-lite run log (`phase-6-qa-a1-lite-run-log.md` section 2, all seven paths with `Location` targets). |
| NFR-SHL-1 — CI build job green | CI job (Node 22 + `npm ci` + build + test over `app/`, matching the existing Node matrix): build and test both pass on every shell commit | Covered — the `app-build` job in `.github/workflows/ci.yml` (Node 22 + `npm ci` + build + lint + test over `app/`); green on the migration and styling merges. |
| NFR-SHL-2 — Nginx fallback correctness | Fallback assertion: sampled non-asset `/app/*` paths (deep link, reload, unknown path), check every response is `/app/index.html` with status 200 — NOT `/index.html` | Covered — `script/shell-served-check.sh` (fallback is `/app/index.html` verbatim; non-asset `/app/*` paths fall back to it). |
| NFR-SHL-3 — Offline banner with manual retry, no write queueing | Disconnect drill: drop connectivity mid-session, check the banner names the disconnect, a safe manual retry is offered, and 0 desk writes queue | Covered — `app/src/App.test.ts:29,36,54,89` (hide while online, name the disconnect with manual retry, retry only on staff action, keep the banner on retry failure) plus `app/src/api/client.test.ts:137,154` (offline mark with zero queued writes; reconnect alone replays nothing). |

Shell-slice coverage (Refs #291): 7 rows mapped, 7 guards
complete (implementation #291–#313, scaffold checks #341,
styling #348). The MVP Coverage line above stands unchanged at
57/57.

## 4. Desk UI rollout slice (Refs #419)

Rollout-slice rows for the owner-supplied six-screen Claude desk
UI design (Main board #420, Book #421, Stay check-in/out #422,
Folio #423, Rooms visual map #424, 4-step Onboarding wizard
#425). Each row traces its done-condition (AC-DSK-1..11, owned by
`product-owner` in `docs/product/acceptance-criteria.md`
[section 11](../product/acceptance-criteria.md), PR #426 plus
AC-DSK-9..11 on the #438 stack in PR #441) and its
presentation requirement (FR-DSK-1..7, NFR-DSK-1..3, owned by
`business-analyst` in `docs/requirements/mvp-requirements.md`
[section 10](../requirements/mvp-requirements.md), PR #427, plus
wizard-scoped FR-DSK-8..10 in section 11 on the #438 stack in
PR #442) to its
guard. Full guard detail — parity baselines plus the new guards
D1–D18 (D13 shipped with the #565 presentation change, D14 with
the #568 open-folio context change, D15 ships with the #581
Book date-picker change, D16 ships with the #582 list-backed
stay picker, D17 shipped with the #586 arrival-pick preload
change (PR #594), and D18 ships with the #588 check-out release and
unpaid-close gate change; D1–D12 land with the screen PRs) — lives in
`docs/testing/desk-ui-rollout-test-traceability.md`
(desk-ui-rollout-test-traceability.md). Like the shell slice
above, these 11 rows do not alter the 57-row MVP coverage count:
the rollout adds no MVP capability, and no existing matrix row
may cite this rollout as its guard. A rollout row is complete
only when its D-guard exists and passes; until then the row
names the screen PR that must create it. `AC-DSK-15` (Refs #581)
is a post-rollout input-mechanism addendum mapped in section 7
with its `D15` guard, `AC-DSK-16` (Refs #582) is the same kind
of addendum mapped in section 8 with its `D16` guard,
`AC-DSK-17` (Refs #586) is a flow-timing addendum mapped in
section 9 with its `D17` guard and the `FR-CIP-1`..`FR-CIP-4`
rows, and `AC-DSK-18` (Refs #588) is a check-out release and
gate addendum mapped in section 10 with its `D18` guard and the
`FR-CKO-1`..`FR-CKO-5` rows; none adds a row here.

| Rollout item | Required guard type | Guard |
|---|---|---|
| AC-DSK-1 — Shared shell in canvas-manifest order with locale toggle (FR-DSK-1) | Presentational shell check: configured hotel name in the teal header, tabs in canvas-manifest order with active highlight, whole-screen EN/VI toggle, gate unchanged | Baseline: `app/src/router.test.ts:17` route shape + `:32,40,48,56,64,72` per-route render + `:91` print-namespace pin; `app/src/App.test.ts:147` nav destinations + `:186` active highlight + `:201` unknown paths + `:216` gate suite; `app/src/stores/session.test.ts:21,33,43`; `app/src/api/client.test.ts:55,68,83,117,137,154`. New: D1 six-screen shell render, created by the shell screen PR (recorded on #420) |
| AC-DSK-2 — Main board with housekeeping buttons and refreshed counts (FR-DSK-2) | Presentational board check: five design cards render, both housekeeping buttons advance state, board counts refresh | Baseline: `app/src/views/DeskView.test.ts:182` arrivals/in-house/departures + `:202` attention lists + `:224` five-lane board + `:298` empty states + `:352` plain-words failure; `app/src/views/DeskView.vue:109,121,133,147` lanes; unchanged `FR-RMS-2` / `NFR-AUD-1` guards. New: D2 board design assertions, created by #420 |
| AC-DSK-3 — Book two-column layout with the flow unchanged (FR-DSK-3) | Presentational layout check: guest card above quote card left, dates/room/discount card right; flow and refusal tests untouched | Baseline: `app/src/views/BookView.test.ts:333` confirm + `:381` guest snapshot + `:550` sellable count + `:757,787,811` refusal mapping + `:844` double-submit guard + `:1063` print isolation; unchanged `FR-RES-1` / `FR-GST-3` guards. New: D3 layout assertions, created by #421 |
| AC-DSK-4 — Stay explicit empty placeholder with hint, check-in blocked (FR-DSK-4) | Presentational placeholder check: empty option plus pick-a-ready-room hint, `need_room` block, single-candidate auto-select intact | Baseline: `app/src/views/StayView.vue:167` empty option; `app/src/views/StayView.test.ts:295,314-317` placeholder-first options + `:348` need_room guard + `:380` auto-select (Refs #411); checkout gates `:721,759,803`; unchanged `FR-FDK-1/2` / `FR-BIL-7` guards. New: D4 hint-wording assertion, created by #422 |
| AC-DSK-5 — Folio two-card layout with the balance unchanged (FR-DSK-5) | Presentational layout check: charges/payments cards, locale-correct amounts in EN and VI; posting and balance tests untouched | Baseline: `app/src/views/FolioView.test.ts:177` open + balance + `:213` charge post + `:244` payment + `:275,309,346,383` plain-words validation + `:419` in-flight guard; unchanged `FR-BIL-1/2/3` guards. New: D5 layout plus locale-amount assertions, created by #423 |
| AC-DSK-6 — Rooms map with counts matching cards (FR-DSK-6) | Presentational map check: floor-grouped map, summary counts equal rendered cards, per-card chip plus type plus live note, per-card clean/inspect actions advancing state with refreshed counts | Baseline: unchanged `FR-RMS-1/2/3` guards (`UpdateRoomState` transitions reused, never reimplemented; `router.test.ts:17` pins the route set with the map route). New: D6 map assertions, created by #424 (read-only at the time); extended by #435 with per-card clean/inspect buttons — `RoomsView.test.ts:245` button presence per state + `:269` dirty-to-clean with count refresh + `:328` clean-to-inspected + `:385` refused transition leaves the map untouched + `:444` manual refresh clears a resolved failure |
| AC-DSK-7 — Onboarding wizard gated to first run with step-1 name persisted (FR-DSK-7) | Presentational wizard check: launch on empty database, progress plus back/continue, step-1 hotel name in header and prints, no launch on seeded database | Baseline: unchanged `FR-ADM-1` guards; `app/src/views/PrintView.test.ts:342` confirmation wording (wizard step-1 view shipped in PR #437). New: D7 wizard assertions, created by #425; D8 served-print name assertion, created by #423. Steps 2–4 carry their own rows below (Refs #438) |
| AC-DSK-8 — VI-primary catalogue with the hotel name configurable (NFR-DSK-1) | L2 catalogue check: 100% of user-visible strings from the catalogue in both locales, coverage check green, zero hardcoded hotel names | Baseline: `script/catalogue-coverage-check.sh` green + `messages/en.json` + `messages/vi.json` on disk. New keys (`desk.rooms.*`, `desk.onboarding.*`, `stay.checkin.*`, `desk.empty.*`) land through the normal catalogue process on each screen PR, including the steps 2–4 `desk.onboarding.*` keys en + vi on the #438 screen PR; served assertions D1 (header name) and D8 (printed name) |
| AC-DSK-9 — Wizard step 2: remaining hotel profile persisted via the config path (FR-DSK-8) | Presentational step-2 check: 50 percent progress, optional contacts stored verbatim, blank timezone refused, bad retention floor refused, back keeps values, nothing persisted on failure | Baseline: `UpdateHotelConfig` guards `services/admin/src/server.test.ts:148` (persist; values round trip `:155`–`:165`), `:170` (blank name refused), `:180` (front-desk `FORBIDDEN`), `:189`–`:245` (stay-times/wording save with read-back); `services/admin/src/pgstore.test.ts:103` (timezone write with actor in audit log). New: D10 step-2 view assertions, created by the #438 steps 2–4 screen PR (extends `app/src/views/OnboardingView.test.ts`) |
| AC-DSK-10 — Wizard step 3: rooms and room types persisted via the seed path (FR-DSK-9) | Presentational step-3 check: 75 percent progress, blank/duplicate/unlinked refusals naming the field, inventory/availability/calendar uptake, back keeps values, nothing persisted on failure | Baseline: `UpsertRoomType` / `UpsertRoom` guards `services/rooms/src/server.test.ts:70` (type upsert), `:79` (room upsert), `:109` (second type), `:137`–`:147` (unknown-type `NOT_FOUND`), `:149`–`:202` (owner defines rooms; inventory + availability uptake); `script/e2e-desk-loop.sh:266` rooms step (type plus two rooms, sellability check); no server guard for duplicate numbers — the wizard refuses intra-batch repeats client-side (FR-DSK-9, PR #442). New: D11 step-3 view assertions, created by the #438 steps 2–4 screen PR |
| AC-DSK-11 — Wizard step 4: first owner account persisted via the admin user path (FR-DSK-10) | Presentational step-4 check: 100 percent progress, blank/taken/empty-secret refusals naming the field, fixed owner role, working owner sign-in, completion to the desk, wizard never shows again, back keeps values, no account created on failure | Baseline: `CreateUser` guards `services/admin/src/server.test.ts:122` (create), `:132` (duplicate identity refused), `:283`–`:335` (role validation incl. bad-role), `:337`–`:372` (last-owner guard), `:374`–`:400` (front-desk role change `FORBIDDEN`), `:82`–`:101` (lockout path), `:402`–`:437` (unlock), `:440`–`:486` (unlock refusals), `:536`–`:563` (rotation round trip), `:614`–`:647` (rotation audit); `services/admin/src/pgstore.ts:209`–`:210` (empty secret refused, code-enforced) and `:204`–`:205` (front-desk `CreateUser` `FORBIDDEN`, code-enforced). New: D12 step-4 view assertions, created by the #438 steps 2–4 screen PR |

Rollout-slice coverage (Refs #419, #438): 11 rows mapped; parity
baselines exist for AC-DSK-1..5,7,8, state baselines for
AC-DSK-6/7 ride the unchanged MVP guards, and provider-side
baselines for AC-DSK-9..11 ride the unchanged `UpdateHotelConfig`,
seed-path, and `CreateUser` guards; new guards D1–D9 are
pending the screen PRs (#420–#425) and D10–D12 are pending the
#438 steps 2–4 screen PR. The MVP Coverage line below
stands unchanged at 57/57. `AC-DSK-13` (Refs #565) is a
post-rollout presentation addendum mapped in section 5 with its
`D13` guard, and `AC-DSK-14` (Refs #568) is one mapped in
section 6 with its `D14` guard; neither adds a row here.

## 5. Desk money and quote-date presentation slice (Refs #565)

Presentation-only slice for the `G-BK-2` / `G-FO-2` gaps from the
#563 desk UI audit: the Book quote and the Folio board render money
in the design VND shape, and the nightly quote lines render desk
dates, with every stored and transmitted value unchanged. Each row
traces the #565 issue-body acceptance and `AC-DSK-13` (owned by
`product-owner` in
[acceptance-criteria.md section 11](../product/acceptance-criteria.md);
scope in `docs/product/desk-ui-design-rollout.md` section 6.8, tier
T2) and the presentation requirements `FR-MNY-1` / `FR-MNY-2`
(owned by `business-analyst` in
[mvp-requirements.md section 14](../requirements/mvp-requirements.md)).
The guards below exist on disk and were created or extended by the
#565 change (PR #574), so each row is complete and must stay green
from now on. Like the slices above, these rows add no MVP
capability; the 57-row MVP coverage count stands unchanged and no
MVP row may cite this slice as its guard.

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-13 — Book quote and Folio money and date display shape, values unchanged (Refs #565; traces to US-RES-1, US-BIL-1, US-BIL-2; `FR-MNY-1`, `FR-MNY-2`; AC-DSK-3 / AC-DSK-5 keep their flow conditions and point here) | Presentation check in both locales: every quote and folio amount renders the active locale's VND grouping with no decimals and the `đ` suffix (`1.200.000 đ` VI, `1,200,000 đ` EN); each nightly quote line renders `dd/mm/yyyy`, never a raw ISO string; stored, transmitted, and printed values stay identical | Covered — money half and date half in the two `FR-MNY` rows below; the label and empty-state half rides `app/src/views/BookView.test.ts:284` (`Get a price first` before a quote) and `:307` (`Số đêm: 2` after it), with the unchanged catalogue keys at `messages/en.json:399`–`:400` and `messages/vi.json:399`–`:400` |
| FR-MNY-1 — Desk money display shape (VND, display-only) | Formatter pins both locales plus the display-only sub-dong rounding; view pins the Folio charge, fee, payment, due, and balance renders; the browser pin proves the minor-unit API value is unchanged | Covered — `app/src/i18n/index.test.ts:177` (VI `1.800.000 đ` / `960.000 đ` / `0 đ`, EN `1,800,000 đ` / `60,000 đ`) and `:187` (`1250` → `13 đ`, `1240` → `12 đ`; display-only rounding); `app/src/views/FolioView.test.ts:192` (`Room night (tax 5 đ, fee 2 đ)` / `107 đ`), `:200` (`30 đ`, never `-30 đ`), `:204` and `:543` (`77 đ` balance in both locales), `:556` (EN `18,000 đ`), `:567` / `:571` (VI `18.077 đ` / `18.000 đ`); browser pin `app/e2e/folio.spec.ts:113` (`625 đ` balance over the `62500`-minor API value) |
| FR-MNY-2 — Desk quote date form (display-only) | Formatter pins the desk form in both locales and the canonical fallback; view pins the nightly lines and their locale re-render; the browser pin rejects a raw ISO string end to end | Covered — `app/src/i18n/index.test.ts:195` (`08/12/2026` and `01/11/2026`, unchanged by a locale switch) and `:203` (canonical fallback for empty, timestamp, and rollover input); `app/src/views/BookView.test.ts:395` — `:407`–`:413` assert `01/11/2026` / `02/11/2026` and `100 đ` / `120 đ`, reject `2026-11-01` and `100.00`, and assert the `220 đ` total; `:420`–`:422` assert the VI re-render without a new read; `app/e2e/book.spec.ts:59` (nightly rows match `dd/mm/yyyy`, no `YYYY-MM-DD`) and `:61` (`2,400 đ` total) |
| Values and payloads unchanged | Request and response pins stay green: quote and confirm bodies, folio posting bodies, and contract schemas keep integer minor units and ISO dates | Covered — quote fixture `app/src/views/BookView.test.ts:82` (`QuotePrice` nights and `totalMinor`) and confirm with the frozen price basis `:428`; folio postings `app/src/views/FolioView.test.ts:224` (room charge with idempotency key and re-read) and `:255` (card payment with idempotency key and re-read); contract guards `contracts/http/QuotePrice.json:16,27,33`–`:36`, `contracts/http/PostCharge.json:13,18,25,32`, `contracts/http/RecordPayment.json:13,17,24,30` (integer minor-unit amounts, dates as `format: date`) |
| Existing money and amount edge guards | QA-EDGE-2 and QA-EDGE-12 stay green; a locale switch re-renders the shape without a new quote read (`AC-DSK-8` holds) | Covered — `app/src/views/desk-edge-guards.test.ts:500` (QA-EDGE-2 refuses a negative amount and keeps the balance line; `:509` asserts `Folio balance: 77 đ.`) and `:1289` (QA-EDGE-12 mid-flow locale switch keeps the quoted value and still confirms) |
| #563 evidence refresh (same-change rule) | The Book and Folio side-by-side images show the fixed renders, and the audit record notes the refresh in the same change | Covered — `docs/testing/evidence/563/README.md:57` (Book image, `G-BK-2`) and `:58` (Folio image, `G-FO-2`), both refreshed in the #565 change per the living-record rule at `:61`–`:65` |

Presentation-slice coverage (Refs #565): 6 rows mapped, 6 guards
filled. Every guard citation above is on disk at the #565 head, and
the `app-build` suite (29 files / 431 tests) and the `browser-e2e`
job are green on PR #574 (run `42511193492` at `b18271f`). The MVP
Coverage line below stands unchanged at 57/57.

## 6. Desk Folio open-context presentation slice (Refs #568)

Presentation-only slice for the `G-FO-1` gap from the #563 desk UI
audit: the Folio charges card names the open folio's guest and room
like the board (VI `Khoản phí · Lê Minh · P.201`, EN
`Charges · Lê Minh · Room 201`), with the raw stay and folio IDs kept
behind the reference disclosure (#372) and every stored, transmitted,
and printed value unchanged. Each row traces the #568 issue-body
acceptance and `AC-DSK-14` (owned by `product-owner` in
[acceptance-criteria.md section 11](../product/acceptance-criteria.md);
scope in `docs/product/desk-ui-design-rollout.md` section 6.9, tier
T2) and the three requirements the title composes — `FR-BIL-1` (folio),
`FR-GST-1` (guest name), `FR-RMS-1` (room number) — which keep their
wording (`business-analyst` section 15, Refs #568). The guards below
exist on disk (the #568 change, PR #577, plus the #578 half-resolution
guards); every row is covered on disk, and must stay green from now on.
Like the
slices above, these rows add no MVP capability; the 57-row MVP
coverage count stands unchanged and no MVP row may cite this slice
as its guard.

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-14 — open folio's guest and room in the charges-card title, raw IDs behind the reference disclosure (Refs #568; traces to US-BIL-1, US-GST-1, US-RMS-1; `FR-BIL-1`, `FR-GST-1`, `FR-RMS-1`; AC-DSK-5 keeps its posting and balance conditions and points here) | Presentation check in both locales: the charges title composes `heading · guest · room` from the stay the folio belongs to, the title and balance line name no record ID, the context clears when the typed stay ID changes, a slower earlier read never paints, and a refused stay read keeps the plain title | Covered for every clause, the half-resolved fallback included (Refs #578 guards at `app/src/views/FolioView.test.ts:846`–`:901` and `:906`–`:948`) — `D14`: EN title `app/src/views/FolioView.test.ts:682`/`:690`–`:692`, VI title `:714`–`:723`, read composition plus catalogue key `:613`, one room-state lane `:697`–`:704`, no raw ID `:708`–`:712` with the disclosure guard at `:208`–`:213`, clear on stay-ID change `:726`–`:739`, stale-read token `:742`–`:766`, refused read keeps the plain title `:769`–`:788`; browser pin `app/e2e/folio.spec.ts:121`–`:128`; catalogue `messages/en.json:475` / `messages/vi.json:475` |
| FR-BIL-1 — guest folio stays as specified (open with running balance) | The existing folio guards stay green and the title adds no billing read; the composition rides `GetStay` / `GetGuest` / `ListRoomsByState` only | Covered — unchanged MVP guard (section 1: billing service and e2e folio persistence) plus client pins `app/src/views/FolioView.test.ts:180` (open with balance), `:224` (charge post), `:255` (payment); the source pin `:613` asserts no new billing operation and `:697`–`:699` names only the three context reads |
| FR-GST-1 — guest profile read stays as specified | The guest half reads through the existing `GetGuest`; an unresolved guest half takes the catalogue wording, never an ID | Covered — `/v1/guests/GetGuest` is pinned at `app/src/views/FolioView.test.ts:699` and the no-raw-ID half at `:708`–`:712`; the unresolved-guest wording is guarded through the charges title at `:906`–`:948` (`Charges · Unknown guest · Room 201` / `Khoản phí · Khách chưa rõ · P.201`, Refs #578), matching the shared helper wording guarded for the Main board at `app/src/views/display-names.test.ts:257`–`:258` |
| FR-RMS-1 — room inventory with live status stays as specified | The room half resolves the room number from the existing `ListRoomsByState` read and takes one lane for an in-house room, never a room ID | Covered — `app/src/views/FolioView.test.ts:700`–`:704` pins the single `occupied` lane and `:708`–`:712` the no-ID rule; the unresolved-room wording is guarded through the charges title at `:846`–`:901` (`Charges · Lê Minh · Room number unavailable` / `Khoản phí · Lê Minh · Không rõ số phòng` after all five lanes come back empty, Refs #578) |
| Reference disclosure keeps the raw IDs (#372) | Opening the reference disclosure still shows the exact stay and folio IDs; the default screen names none | Covered — `app/src/views/FolioView.test.ts:208` (`folio-details-body` holds `f-1` and `s-1` only after the toggle at `:211`) and the AC-DSK-14 no-raw-ID loop at `:708`–`:712`; browser pin `app/e2e/folio.spec.ts:125`–`:128` |
| #563 evidence refresh (same-change rule) | The Folio side-by-side image shows the composed title and the audit evidence index records the refresh in the same change | Covered — `docs/testing/evidence/563/README.md:69` (refresh record for the open-folio context fix) and `:103` (Folio row naming the composed `Khoản phí · Lê Minh · P.201` title); the living-record rule sits at `:108`–`:112` |
| Printed and payload values unchanged | Print output and every folio payload keep their shape: no amount, line, or balance change, no new request field | Covered — existing payload pins `app/src/views/FolioView.test.ts:243`/`:246` (charge stay ID and amount) and `:276`/`:278` (payment stay ID and amount), print parity `app/src/views/FolioView.test.ts:584`; the title is catalogue copy only (`messages/en.json:475` / `messages/vi.json:475`) |

Presentation-slice coverage (Refs #568, #578): 7 rows mapped; 7
covered. The two unresolved-half wording rows for `FR-GST-1` and
`FR-RMS-1` flipped to covered with the #578 guards, so `AC-DSK-14`
is covered for every clause, the half-resolved fallback included
(`app/src/views/FolioView.test.ts:846`–`:901` guest known / room
unresolved, `:906`–`:948` the mirror case). Every filled guard
citation is on disk; the Folio unit guards run in `app-build` and the
browser assertion runs in `browser-e2e`. The MVP Coverage line below
stands unchanged at 57/57.

## 7. Desk Book date-picker slice (Refs #581)

Behaviour slice for the `G-BK-1` gap from the #563 desk UI audit:
the Book arrival and departure fields become app-localized PrimeVue
`DatePicker` controls (VI `dd/mm/yyyy`, EN `mm/dd/yyyy`) instead of
plain text inputs, while the quote and booking payloads keep the
canonical ISO `yyyy-mm-dd`, the `onStayInput` quote path is
preserved, malformed entry never becomes a payload date, and every
stored, transmitted, and printed value stays unchanged. Each row
traces the #581 issue-body acceptance and `AC-DSK-15` (owned by
`product-owner` in
[acceptance-criteria.md section 11](../product/acceptance-criteria.md);
scope in `docs/product/desk-ui-design-rollout.md` section 6.10, tier
T2) and the behaviour-scoped requirements `FR-BDP-1`..`FR-BDP-3`
(owned by `business-analyst` in
[mvp-requirements.md section 16](../requirements/mvp-requirements.md)).
The guards below exist on disk in the #581 change (PR #583);
every row is covered except the recorded accessibility gap, and every
filled citation must stay green from now on. Like the
slices above, these rows add no MVP capability; the 57-row MVP
coverage count stands unchanged and no MVP row may cite this slice
as its guard. `AC-DSK-3` keeps its Book flow and refusal conditions
and points here for the date-input mechanism.

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-15 — Book arrival/departure fields are app-localized date pickers that keep the ISO payload and the quote path (Refs #581; traces to US-RES-1; `FR-BDP-1`, `FR-BDP-2`, `FR-BDP-3`; AC-DSK-3 keeps its Book flow conditions and points here) | Behaviour check in both app locales under the opposite browser UI language: both fields render the PrimeVue DatePicker, the field text and placeholder follow the app locale (`dd/mm/yyyy` VI, `mm/dd/yyyy` EN) never the browser UI language, a VI/EN switch re-renders the same calendar day without clearing the quote, a day chosen from the calendar overlay or typed in full reaches the quote/booking payload as ISO `yyyy-mm-dd`, and malformed or incomplete entry never does | Covered — `D15` (section 3 of `desk-ui-rollout-test-traceability.md`): `app/src/i18n/primevueLocale.test.ts:18` (format table), `:25` (generated calendar wording), `:39` (app-level install plus switch); `app/src/views/BookView.test.ts:468` (render, locale switch, impossible day `:485`), `:506` (calendar-overlay click plus ISO `QuotePrice` body); bridge `app/src/i18n/index.test.ts:272`, `:281`; browser typed path `app/e2e/book.spec.ts:43`–`:45`; gate `app/e2e/design-facts.ts:349`–`:350`; evidence `docs/testing/evidence/563/README.md:60`–`:64`, `:128`–`:131` |
| FR-BDP-1 — Book date fields follow the app locale, not the browser | Format, placeholder, and generated calendar wording pins per app locale plus one app-level switch pin; the browser evidence pair runs under the opposite browser UI locale | Covered — `app/src/i18n/primevueLocale.test.ts:18` (`dd/mm/yy` / `mm/dd/yy`, `yy` = four-digit year in PrimeVue 4.5.5), `:25` (`Tháng 1` / `January`, `CN` / `S`), `:39` (install on the shared config and follow `setLocale`); `app/src/views/BookView.test.ts:468` asserts the `mm/dd/yyyy` → `dd/mm/yyyy` placeholder and value switch for the same day; VI under `en-US` and EN under `vi-VN` images at `docs/testing/evidence/563/README.md:128`–`:131` |
| FR-BDP-2 — A chosen day submits the canonical ISO date and re-renders the quote | A calendar-overlay day click publishes ISO and reaches the `QuotePrice` body; a typed desk-form date does the same; a locale switch fires no quote read and keeps the quote | Covered — `app/src/views/BookView.test.ts:506` (opens the overlay from the input icon, clicks day 15, asserts `arrivalDate === '2026-11-15'` and the `QuotePrice` body `2026-11-15` / `2026-11-05`); `:429` (typed EN and VI desk forms plus the ISO quote body and the quote kept across a switch); bridge `app/src/views/BookView.vue:527`–`:545` and `onStayInput` at `:653`; browser typed path `app/e2e/book.spec.ts:43`–`:45` with the same-suite quote/confirm payload pins |
| FR-BDP-3 — Malformed or incomplete entry never becomes a payload date | Impossible, rolled-over, incomplete, or non-date entry leaves the canonical ref empty or at the last valid day; a blank field invents nothing | Covered — `app/src/views/BookView.test.ts:485`–`:486` (`02/31/2026` leaves `arrivalDate === ''`); `app/src/i18n/index.test.ts:248` (rollovers, impossible days, and non-desk text parse to `''`); `:281` (`dateFromCanonical('2026-02-30')` / `'2026-13-01'` are `null`, NaN emits `''`) |
| Design-facts gate unchanged in schema | The gate keeps `kind: 'text'` (schema v1 describes the picker's inner input) and pins the locale-shaped placeholder; no `architect` schema route | Covered — `app/e2e/design-facts.ts:349`–`:350` (both Book date inputs `text` with `dd/mm/yyyy` in the gate locale); `app/e2e/design-facts.spec.ts` green (see `docs/product/desk-ui-design-rollout.md` section 6.10 decision 2) |
| Catalogue parity | One new visible key in both catalogues with placeholder parity and byte-identical runtime mirrors; the coverage check green | Covered — `messages/en.json:399` (`mm/dd/yyyy`), `messages/vi.json:399` (`dd/mm/yyyy`), the eight `services/*` mirrors, and `script/catalogue-coverage-check.sh` (the `NFR-DSK-1` / AC-DSK-8 rule) |
| #563 evidence refresh (same-change rule) | The Book side-by-side pair plus the opened-calendar images show the app-localized pickers under the opposite browser locale, and the audit record names the DatePicker mechanism and the board divergence in the same change | Covered — `docs/testing/evidence/563/README.md:60`–`:64` (refresh record and capture method), `:128`–`:131` (Book VI/EN pairs plus the two opened calendars, with the deliberate divergence noted at `:142`–`:143`) |
| Calendar overlay accessibility strings (recorded gap) | No guard asserts localized overlay screen-reader labels (`Choose date`, `Previous month`, `Next month`, `today`, `clear`); they stay PrimeVue's English defaults in VI | Recorded gap, not a silent pass — boundary documented at `app/src/i18n/primevueLocale.ts:17`–`:23` and `docs/testing/evidence/563/README.md:78`–`:81`; mapping them needs catalogue keys of their own and is the spec-owned #581 follow-up, so this row flips to covered only with that follow-up's guard |

Presentation-slice coverage (Refs #581): 8 rows mapped; 7 covered
and 1 recorded gap (the calendar overlay's English screen-reader
strings, the documented #581 follow-up). Every filled guard
citation is on disk; the unit guards run in `app-build` and the
browser typed desk-form path runs in `browser-e2e`, with the
app-locale evidence pair in `docs/testing/evidence/563/`. The MVP
Coverage line below stands unchanged at 57/57.

## 8. Desk list-backed stay-picker slice (Refs #582)

Behaviour slice for the open-folio steps: the Folio and Print
screens lead with a select of the business date's in-house stays
from `ListArrivalsDepartures` (room numbers via `ListRoomsByState`),
while the stay-ID text field stays visible as the manual fallback.
Each row traces the #582 issue-body acceptance and `AC-DSK-16`
(owned by `product-owner` in
[acceptance-criteria.md section 11](../product/acceptance-criteria.md);
scope in `docs/product/desk-ui-design-rollout.md` section 6.11, tier
T2) and the behaviour-scoped requirements `FR-LSP-1`..`FR-LSP-3`
(owned by `business-analyst` in
[mvp-requirements.md section 17](../requirements/mvp-requirements.md)).
The guards below exist on disk in the #582 change; every row is
covered. Like the slices above, these rows add no MVP capability;
the 57-row MVP coverage count stands unchanged and no MVP row may
cite this slice as its guard. `AC-DSK-5` keeps its posting and
balance conditions and points here for the open-step input
mechanism.

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-16 — Folio and Print open steps lead with the business date's in-house stay select, keep manual stay-ID entry, and send the same identifier (Refs #582; traces to US-BIL-1, US-FDK-5; `FR-LSP-1`, `FR-LSP-2`, `FR-LSP-3`; AC-DSK-5 keeps its posting and balance conditions and points here) | Behaviour check on both screens: the business date's in-house stays render as select options labelled guest · room, picking one opens the folio with the unchanged `stayId`, the typed field stays visible and equivalent, and an empty or failed list read shows a plain notice without blocking manual entry | Covered — `D16` (section 3 of `desk-ui-rollout-test-traceability.md`): picked ID plus label `app/src/views/FolioView.test.ts:997`, `app/src/views/PrintView.test.ts:844`; empty-list manual fallback `app/src/views/FolioView.test.ts:1018`; failed-read manual fallback `app/src/views/FolioView.test.ts:1037` plus the Print failed-read case; browser select path `app/e2e/folio.spec.ts:88`–`:89`, `app/e2e/print.spec.ts:92`–`:93`; shared helper `app/src/stay-options.ts`; gate `app/e2e/design-facts.ts:383`; evidence `docs/testing/evidence/563/README.md` |
| FR-LSP-1 — The open-folio step offers the business date's in-house stays as a select | Business date sent, in-house rows listed, guest and room labels resolved, picked ID sent unchanged | Covered — `app/src/stay-options.ts` (reads and label composition); `app/src/views/FolioView.test.ts:997`; `app/src/views/PrintView.test.ts:844`; browser `app/e2e/folio.spec.ts:88`–`:89`, `app/e2e/print.spec.ts:92`–`:93` |
| FR-LSP-2 — Manual stay-ID entry stays reachable and equivalent | Empty-list and failed-read paths keep the manual field working, show the plain notice, and send the typed ID | Covered — `app/src/views/FolioView.test.ts:1018`, `:1037`; `app/src/views/PrintView.test.ts` (#582 failed-read case); catalogue `desk.stay.stay_list_empty` / `desk.stay.stay_list_failed` |
| FR-LSP-3 — Only list-backed fields convert; the rest stay manual | Onboarding room creation and the Print booking-reference field stay manual; room numbers that refer to an existing room use ListRoomsByState data | Covered — the in-house option labels read occupied rooms through `ListRoomsByState`; `app/src/views/OnboardingView.vue` keeps `onboarding-room-number-*` as `InputText`; `app/e2e/print.spec.ts` keeps the `print-ref` fill path; the #582 issue comment records the audit result |
| Design-facts gate | The Folio decided inputs lead with the select and keep the text stay field; the spec stays green | Covered — `app/e2e/design-facts.ts:383`–`:384`; `app/e2e/design-facts.spec.ts` green |
| Catalogue parity | Four new visible keys in both catalogues with placeholder parity and byte-identical runtime mirrors | Covered — `messages/en.json`, `messages/vi.json` (`desk.stay.pick_stay_label`, `desk.stay.pick_stay_prompt`, `desk.stay.stay_list_empty`, `desk.stay.stay_list_failed`), the eight `services/*` mirrors, and `script/catalogue-coverage-check.sh` |
| #563 evidence refresh (same-change rule) | The Folio VI + EN side-by-side pairs show the list-backed open step in the same change | Covered — `docs/testing/evidence/563/README.md` (capture record and the Folio VI/EN rows) |

Slice coverage (Refs #582): 7 rows mapped; 7 covered. Every filled
guard citation is on disk; the unit guards run in `app-build` and
both browser flows run in `browser-e2e`, with the VI + EN evidence
pairs in `docs/testing/evidence/563/`. The MVP Coverage line below
stands unchanged at 57/57.

## 9. Stay arrival-pick preload slice (Refs #586)

Flow-timing slice for the Stay check-in panel: the arrival pick
loads the booking and the booked-type ready rooms into the room
select (previously the first Check in click did), and a valid room
selection clears the `Pick a ready room first.` message. The commit
stays on the Check in button, `AssignRoom` → `CheckIn` →
`CheckInReservation` keep their request bodies, and no backend,
contract, catalogue, or validation change is involved. Each row
traces the #586 issue-body acceptance and `AC-DSK-17` (owned by
`product-owner` in
[acceptance-criteria.md section 11](../product/acceptance-criteria.md);
scope in `docs/product/desk-ui-design-rollout.md` section 6.12, tier
T2) and the behaviour-scoped requirements `FR-CIP-1`..`FR-CIP-4`
(owned by `business-analyst` in
[mvp-requirements.md section 18](../requirements/mvp-requirements.md)).
Every pin named below is on disk and pins the arrival-pick timing in
the desktop suite (#586 shipped in PR #594): the existing cases were
rewritten to the pick timing with a note (never deleted), and the
previously missing no-ready-rooms, error-cleared-on-select,
failed-preload retry, mid-load clear, and late-read cases were
created there, so every row below is complete. Like the slices
above, these rows add no MVP capability; the 57-row MVP coverage
count stands unchanged and no MVP row may cite this slice as its
guard. `AC-DSK-4` keeps its placeholder/guard/auto-select rule and
points here for the load timing and the room-error lifecycle.

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-17 — the arrival pick loads the booked-type ready-room candidates, a valid room selection clears the room error, and the commit stays on the Check in button (Refs #586; traces to US-FDK-1, US-FDK-2; `FR-CIP-1`, `FR-CIP-2`, `FR-CIP-3`, `FR-CIP-4`; AC-DSK-4 keeps the placeholder/guard/auto-select rule and points here) | Behaviour check: one arrival pick alone populates the picker with the booked type's ready rooms; one room auto-binds, several keep the placeholder plus amber hint, zero keeps the plain no-ready-rooms error with the booked-type status; a valid select clears the guard and the hint immediately; one Check in click commits once with the unchanged bodies, and a second in-flight click is a no-op | Covered (PR #594) — `D17` (section 3 of `desk-ui-rollout-test-traceability.md`): arrival flow `app/src/views/StayView.test.ts:332` (placeholder-first `:357`), `:453` (`need_room`), `:493` (auto-select), `:943` (unknown reference), `:967` (taken room), `:997` (already checked in), `:1772` (in-flight double-click), the guard cleared on a valid pick `:402`, the plain no-ready-rooms error `:538`, the failed-preload retry `:607`, the mid-load clear `:665`, the late-read rule `:723`; edge guards `app/src/views/desk-edge-guards.test.ts:1225` (placeholder/back-forward), `:468` (unknown reference, QA-EDGE-1), `:862` (dirty room never a candidate, QA-EDGE-8); browser `app/e2e/stay.spec.ts:68`–`:73` (pick, select, one commit click); the unchanged `FR-FDK-1/2` / `FR-BIL-7` MVP guards keep the check-in capability and the checkout gate |
| FR-CIP-1 — the arrival pick loads the booked-type ready-room candidates (section 18.3) | A pick alone runs the existing read pair (`GetReservation` then `ListRoomsByState('vacant-inspected')`) and the booked-type filter; one room binds, several keep the placeholder, a second pick resets the previous candidates and error first, and a late earlier read never paints | Covered (PR #594) — `app/src/views/StayView.test.ts:332` pins the arrival pick alone producing the options (the booked-type filter by the same fixture) and one button click committing; the reset and late-read halves at `:723`, the mid-load clear at `:665`; browser `app/e2e/stay.spec.ts:68`–`:73` runs pick, select, one commit click |
| FR-CIP-2 — picker states and plain-word failures stay as today (section 18.3) | One room auto-binds with no hint and no error; several show the explicit empty placeholder plus the amber `stay-checkin-room-hint`; zero ready rooms show the plain no-ready-rooms error with the booked-type status and bind nothing; unknown reference, signed-out, and other failures keep their existing strings in both locales; the progress line and disabled button cover the read | Covered (PR #594) — `app/src/views/StayView.test.ts:453` (`need_room`, no `AssignRoom`), `:493` (auto-select), `:943` (unknown reference), the plain no-ready-rooms error with a retrying click `:538`, the guard cleared on a valid pick `:402`, the failed-preload retry `:607`, `app/src/views/desk-edge-guards.test.ts:1225` (placeholder), `:468` (unknown reference, QA-EDGE-1) |
| FR-CIP-3 — a valid room selection clears the guard message (section 18.3) | With several candidates and `Pick a ready room first.` on screen, selecting a room in the candidate map clears the message and the hint immediately (multi-candidate path included); clearing back to the placeholder or holding an outside value leaves the guard at commit | Covered (PR #594) — `app/src/views/StayView.test.ts:402` (multi-candidate pick, valid select, `stay-checkin-error` gone, `stay-checkin-room-hint` gone, no error rendered, then one commit), and `:453` keeps the placeholder half |
| FR-CIP-4 — the commit stays on the Check in button, once, with unchanged bodies (section 18.3) | `AssignRoom` → `CheckIn` → `CheckInReservation` run once with the existing bodies (the `CheckIn` room id from the `AssignRoom` echo), no candidate read repeats after the preload, a second in-flight click is a no-op, and a failed preload retries the load instead of committing a stale selection | Covered (PR #594) — body pins `app/src/views/StayView.test.ts:332` (`AssignRoom` `roomNumber` plus `stayLink`, `CheckIn` room id from the echo), in-flight double-click `:1772`, taken room `:967`, already checked in `:997`, failed-preload retry `:607`, no-call-without-a-room `app/src/views/desk-edge-guards.test.ts:1225`; `:332`/`:538` pin the single commit after a successful preload with no second candidate read |
| Design-facts gate | The decided Stay input stays the same `[data-testid="stay-checkin-room"] select` with the `Chọn phòng...` placeholder, and the populated option subtrees stay exempt under DD-13, so no schema or allowlist change | Covered by re-run only — `app/e2e/design-facts.ts` Stay entry, `docs/technical/desk-ui-fact-schema.md` section 5, `docs/testing/dom-diff-allowlist.md` DD-13, and the source pins in `app/src/stay-restyle.test.ts:55`–`:100` hold unchanged; the #586 PR re-ran the fact-level gate and noted the DD-13 exemption |
| Catalogue parity | Zero new keys: every state above uses an existing `desk.stay.*` string with both locales intact and placeholders unchanged | Covered — `messages/en.json`, `messages/vi.json` and the eight `services/*` mirrors plus `script/catalogue-coverage-check.sh`; the #586 PR showed the coverage job green with no catalogue diff |

Slice coverage (Refs #586): 7 rows mapped; 2 covered without a new
guard (the design-facts and catalogue boxes need none) and 5
covered by the #586 change shipped in PR #594 — the existing pins
named above were rewritten to the arrival-pick timing with a note
(never deleted), and the previously missing cases (no-ready-rooms,
error-cleared-on-select, failed-preload retry, mid-load clear, and
late read) were created there. No existing guard is deleted; every
filled citation above resolves on disk at the #594 head. The MVP
Coverage line below stands unchanged at 57/57.

## 10. Stay check-out release and unpaid-close gate slice (Refs #588)

Behaviour slice for the Stay check-out panel: a committed close
releases the departed room to `vacant-dirty` through `ReleaseRoom`
and reloads the desk, and the no-unpaid-close rule now holds on
every route to the close against a freshly read balance, with a
recorded `RecordOpenBalanceApproval` object (identity, fixed-set
role, recorded time) as the only exception. `CheckOut`,
`ReleaseRoom`, `GetFolioBalance`, and `RecordOpenBalanceApproval`
keep their request bodies; no backend, contract, schema, or
stored-value change is involved. Each row traces the #588
issue-body acceptance and `AC-DSK-18` (owned by `product-owner` in
[acceptance-criteria.md section 11](../product/acceptance-criteria.md);
scope in `docs/product/desk-ui-design-rollout.md` section 6.13, tier
T2) and the behaviour-scoped requirements `FR-CKO-1`..`FR-CKO-5`
(owned by `business-analyst` in
[mvp-requirements.md section 19](../requirements/mvp-requirements.md)),
under the unchanged MVP rows `FR-FDK-2` and `FR-BIL-7` and the
business rules `BR-17` / `BR-18`. The `AC-DSK-18` condition lands
with the #597 product spec PR and the `FR-CKO-1`..`FR-CKO-5` ids
with the #598 requirements spec PR; this slice is the `qa-lead`
handoff for both, so the three spec PRs land before the #588
implementation PR and none of them adds an MVP row.

The existing pins named below are on disk today and pin the old
behaviour (no release, review-time gate); the #588 implementation PR
rewrites them with a note (never deleting one) and creates the named
missing cases, so a row is complete only when that PR lands and
passes. Like the slices above, these rows add no MVP capability; the
57-row MVP coverage count stands unchanged and no MVP row may cite
this slice as its guard. `AC-DSK-4` and `AC-DSK-6` keep their
placeholder/guard/auto-select and map conditions and point here for
the release half.

**Stale-guard correction (the QA-EDGE-8 mapping).** The QA-EDGE-8
case has been reading the check-out half as a server-side
transition: `app/src/views/desk-edge-guards.test.ts:840-849` states
that "the checkout-to-dirty turn itself happens server-side on
CheckOut", and the case at `:908-947` asserts that the desk writes
no room state (`:939-940`) and that the freed room re-enters through
its dirty state read (`:941-945`). #588 shows that claim is false:
Stay's `CheckOut` writes no room state, no screen action under
`app/src` calls `/v1/rooms/ReleaseRoom`, and the API desk loop
releases explicitly and asserts `vacant-dirty`
(`script/e2e-desk-loop.sh:422-423`). The false claim must not
survive silently: the implementation PR rewrites that comment and
the case title to the release obligation (closes once, sends exactly
one `ReleaseRoom` for the room the stay held, writes no other room
state, re-reads the lists) with a note citing #588, and the
candidate half at `:851-906` (dirty room never offered) stays
unchanged. `docs/testing/manual-qa-testsuite.md` QA-EDGE-8 carries
the same correction on the owner-verification surface (QA-EDGE-13 is
the new unpaid-close case).

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-18 — a committed close releases the departed room to `vacant-dirty`, refreshes the desk, and refuses an unapproved open-balance close on every route; an approved close stays closed even when the release fails (Refs #588; traces to US-FDK-2; `FR-FDK-2`, `FR-BIL-7`, `BR-17`, `BR-18`; AC-DSK-4 / AC-DSK-6 keep their conditions and point here) | Behaviour check: one close sends exactly one `CheckOut` and exactly one `ReleaseRoom` for the room the stay held with `{roomNumber, toState: 'vacant-dirty', actor}`; the in-house list drops the guest, the departing list keeps today's checkout, and the board/map read the room vacant on their own load; a failed release still reports the close as closed with the plain next-step sentence and no retry; a not-occupied reply claims no housekeeping state; an open-balance close refuses on the button, the dialog confirm, and a replayed or double click with no `CheckOut` sent and the stay in house; a recorded approval closes and shows the approver identity, role, and recorded time | Pending the #588 implementation PR — `D18` (section 3 of `desk-ui-rollout-test-traceability.md`): release + reload `app/src/views/StayView.test.ts:1006-1041` (extended with the release body and the post-release reload), `app/src/views/desk-edge-guards.test.ts:908-947` (rewritten: one release, no other room state, lists re-read, stale `:840-849` claim replaced with a #588 note); every-route gate `app/src/views/StayView.test.ts:1043-1086`, `:1115-1155` (rewritten to a local refusal with zero `CheckOut` calls), `:1240-1277`, `app/src/views/desk-edge-guards.test.ts:1104-1151`; browser `app/e2e/stay.spec.ts:99-110` (the "no screen action can produce it" comment at `:104-109` rewritten to a board assertion); the unchanged `FR-FDK-2` / `FR-BIL-7` MVP rows keep the capability and the server-side gate |
| FR-CKO-1 — a committed close releases the departed room, once (section 19.3) | Exactly one `ReleaseRoom` for the room the stay held, `toState` `vacant-dirty`, `actor` the signed-in staff name, resolved from the departing row and the loaded room-state map; a refused close, `STATE_ILLEGAL`, a replayed click, or a close that never returned sends no release | Pending the #588 implementation PR — rewrite `app/src/views/desk-edge-guards.test.ts:908-947` to assert the release body and the single close (the desk writes no other room state), and extend `app/src/views/StayView.test.ts:1006-1041` with the release body plus the reload order; `script/e2e-desk-loop.sh:422-423` pins the API-side `vacant-dirty` end state the screen must now produce |
| FR-CKO-2 — release outcomes are reported truthfully (section 19.3) | A confirmed release reads the plain room-released line; a not-occupied reply reads the room-already-free line and claims no housekeeping state; a failed release keeps the close reported as closed with a separate plain next-step sentence (reload the desk; tell the manager), never a retried close; no technical code or raw envelope on any branch | Missing guard named explicitly — no `StayView.test.ts` case covers a confirmed release line, a not-occupied reply (the contract's `STATE_ILLEGAL` on `ReleaseRoom`, `contracts/http/ReleaseRoom.json`), or a failed release today; the #588 implementation PR creates all three, and the failure case must prove the close is neither retried nor reported failed |
| FR-CKO-3 — the desk stops showing the room occupied after a close (section 19.3) | After a committed close and a confirmed release, the in-house list no longer names the guest, the departing list keeps today's checkout, and the Main board / Rooms map read the room vacant on their own load; when the release cannot be confirmed the desk keeps saying the room still reads occupied | Partial today — the post-close list re-read rides `app/src/views/StayView.test.ts:1006-1041` and the panel load `:278-308`; the room-state half has no guard because nothing under `app/src` releases a room today (`app/e2e/stay.spec.ts:104-109` records it); the implementation PR extends the unit case and rewrites the browser case `app/e2e/stay.spec.ts:99-110` to assert the room reads `vacant-dirty` and the board lane no longer shows it occupied without a manual reload |
| FR-CKO-4 — every route to the close is gated on the freshly read folio (section 19.3) | The dialog confirm carries the same gate as the Check out button; `onCheckOut` decides on the `GetFolioBalance` read it performs itself; a non-zero balance without a valid recorded approval sends no `CheckOut`, closes the dialog, keeps the stay in house, and shows the plain open-balance refusal with the approval form open; a balance that moved after review refuses on the freshly read value; a second attempt in flight is a no-op | Partial today — `app/src/views/StayView.test.ts:1043-1086` (open-balance gate and disabled button), `:1115-1155` (`SETTLEMENT_REQUIRED` reopening the approval form — rewritten to a local refusal asserting zero `CheckOut` calls), `:1240-1277` (confirm dialog asks once), `app/src/views/desk-edge-guards.test.ts:1104-1151` (double-confirmed close happens once), gate source `app/src/views/StayView.vue:557-561` (`canCheckOut`); missing guards the implementation PR creates: the dialog confirm gate itself, and a refused close that leaves the stay in house with the approval form open |
| FR-CKO-5 — the only exception is a recorded, provenanced approval, and it stays visible (section 19.3) | An approval counts only as the `GetFolioBalance` object carrying a non-blank approver identity, a role from the fixed three, and a recorded time; the approved close succeeds and shows identity, role, and the recorded time in the desk time form; an approval missing the identity or the time, or carrying a role outside the set, refuses in the plain incomplete-approval sentence with the stay in house; the approver-role control offers the fixed set, so free text cannot be recorded from the desk | Partial today — `app/src/views/StayView.test.ts:1043-1086` (approval recorded then close passes, recorded body), `:1199-1238` (stringified approval normalized — rewritten so the object must also carry `approvedAt`, else the incomplete-approval refusal applies), `:1087-1113` (reviewer role select over the catalogue roles — extended to the approver-role select), happy-path stub `:176-183` (the stub approval must return `approvedBy`, `role`, and `approvedAt`); missing guard the implementation PR creates: an approval missing the identity or the time, or carrying an out-of-set role |
| QA-EDGE-8 mapping correction (Refs #588) | The check-out half of QA-EDGE-8 no longer reads as a server-side dirty turn: the case asserts the desk's own release, and the `desk-edge-guards.test.ts:840-849` comment plus the case title at `:908` carry a #588 note; the candidate half stays unchanged | Pending the #588 implementation PR — `app/src/views/desk-edge-guards.test.ts:840-849` (comment), `:908-947` (title, assertions `:935-945`), with the manual case rewritten in `docs/testing/manual-qa-testsuite.md` (QA-EDGE-8 + QA-EDGE-13); no existing assertion is deleted |
| Existing check-out gate guards still run | The guards rewritten by this change stay in place with a note; no gate assertion is dropped, and the already-closed, taken-room, and in-flight cases keep firing | Pending the #588 implementation PR — `app/src/views/StayView.test.ts:1006-1041`, `:1043-1086`, `:1115-1155`, `:1156-1198` (already-closed stays), `:1199-1238`, `:1240-1277`, `app/src/views/desk-edge-guards.test.ts:1104-1151`; each rewrite carries a `#588` note and the suite stays green |
| Catalogue parity | Five new visible keys (`desk.stay.room_released`, `desk.stay.room_already_free`, `desk.stay.room_release_failed`, `desk.stay.approval_recorded_by`, `desk.stay.refused_approval_incomplete`) in both locales with placeholders intact plus the runtime mirrors; the retired `desk.stay.approval_recorded_brief` is removed from both catalogues in the same change; the existing `desk.stay.refused_open_balance` keeps its wording | Covered by the gate re-run — `messages/en.json`, `messages/vi.json` and the `services/*` mirrors plus `script/catalogue-coverage-check.sh`; the implementation PR must show the coverage job green (no EN-only key, no orphan key) |
| Design-facts gate | The approval block, the confirm dialog, and the check-out status rows are flow state outside the fact schema, so no fact changes; the approver-role control becomes a select of the same field size the reviewer select already meets | Covered by re-run only — `app/e2e/design-facts.spec.ts`, `app/e2e/design-facts.ts` Stay entry, `docs/technical/desk-ui-fact-schema.md`; a fact edit means the implementation drifted into the resting render and must be reverted |

Slice coverage (Refs #588): 10 rows mapped; 2 covered by a gate
re-run only (catalogue parity and design-facts) and 8 pending the
#588 implementation PR, which rewrites the existing pins with a
note (never deleting one) and creates the named missing cases
(release outcomes, dialog-confirm gate, refused-close state, and the
provenance-incomplete approval). The QA-EDGE-8 mapping correction
row is the deliberate rewrite of a stale claim, not a dropped guard.
The MVP Coverage line below stands unchanged at 57/57.

## 11. Rooms and rates management desk screen slice (Refs #590)

Reader-visible surface slice for the new rooms and rates management
screen: one route (`/manage`, `/app/manage`) reached from an eighth
tab after `Rooms`, carrying room types, rooms and floors, and nightly
prices per room type per date, driving seven operations that already
exist. Each row traces `AC-MANAGE-1..11` (owned by `product-owner` in
[acceptance-criteria.md section 13](../product/acceptance-criteria.md))
and `FR-MGMT-1..12` (owned by `business-analyst` in
[mvp-requirements.md section 20](../requirements/mvp-requirements.md)),
under the unchanged MVP rows `FR-RMS-4`, `FR-RTE-1`, `FR-ADM-2`,
`FR-ADM-3`, and `FR-ADM-4` and the business rule `BR-44`
([business-rules.md](../requirements/business-rules.md)). The cases,
the guard registry `M1`–`M10`, and the per-section evidence rule
`MR-1` live in
[rooms-rates-management-test-traceability.md](rooms-rates-management-test-traceability.md);
this section is the matrix half that keeps the owner coverage surface
complete. Like the slices above, these rows add no MVP capability;
the 57-row MVP coverage count stands unchanged and no MVP row may
cite this slice as its guard.

At the merged head `0d684f1` (`app/src/router.test.ts:20-38` pins ten
routes with `manage` among them) the management view exists and is the
first caller under `app/src` of `/v1/rates/UpsertRatePrice`
(`app/src/views/ManageView.vue:1730`) and `/v1/rates/UpsertRatePlan`
(`:1824`, `:1860`); the browser seed at `app/e2e/desk-flow.ts:161-166`
stays a precondition, never proof. Every row is therefore covered by a
guard that exists and passes in the merged head's CI run: `M1`–`M10` in
`app/src/views/ManageView.test.ts` (the `app-build` job), the `MR-1`
browser half in `app/e2e/manage.spec.ts` (the `browser-e2e` job), and
the parity pins the change extended with a note rather than deleted.

| Item | Required guard type | Guard |
|---|---|---|
| AC-MANAGE-1 — one tab after `Rooms`, route `/app/manage`, unchanged shared shell, title and intro in both locales (traces to US-ADM-3, US-ADM-4; `FR-ADM-3`, `FR-ADM-4`; `FR-MGMT-1`) | Presentational route and shell check: the route set grows by one, the tab sits after `Rooms` in both locales, the title resolves through the catalogue, every other route and the sign-in gate are unchanged | Covered — `M1` at `app/src/views/ManageView.test.ts:272-312`; parity `app/src/router.test.ts:20-38` (route set 10, extended with a note), `app/src/App.vue:262-270` (`NAV_ITEMS`), `app/src/shell-restyle.test.ts:28-29` (`EN_NAV` / `VI_NAV`), `:205-223` (active pill), `:226-248` (locale switch), `app/src/shell-titles.test.ts:31-57` (per-screen titles); the unchanged `FR-ADM-3` / `FR-ADM-4` MVP rows keep the capability |
| AC-MANAGE-2 — room-type list with the count heading, muted placeholders, and the empty sentence (traces to US-ADM-3, US-RMS-4; `FR-ADM-3`, `FR-RMS-4`; `FR-MGMT-2`) | Presentational list check: one row per type, count heading, `—` placeholder for a missing value, empty sentence with no invented row | Covered — `M2` at `app/src/views/ManageView.test.ts:314-345`; parity `services/rooms/src/server.test.ts:105-127` (names and stable order), `:129-135` (empty list); the unchanged `FR-RMS-4` MVP row keeps the capability |
| AC-MANAGE-3 — create or edit a type through `UpsertRoomType`, features preserved, list re-read, name read-only while editing, invalid input sends nothing (traces to US-ADM-3, US-RMS-4; `FR-ADM-3`, `FR-RMS-4`; `FR-MGMT-3`) | Behaviour check with a zero-request validation half: the body carries only filled fields plus the actor, no `features` member, the stored features survive, and a blank name or out-of-range guests sends nothing | Covered — `M3` at `app/src/views/ManageView.test.ts:347-433`; parity `services/rooms/src/server.test.ts:68-103`, `services/rooms/src/pgstore.ts:138-192` (`:157` feature merge), `services/rooms/src/store.ts:217-235` (the name key); the type-write precedent stays `app/src/views/OnboardingView.vue:921-930` |
| AC-MANAGE-4 — add a room through `UpsertRoom`, keyed by number, grouped under its floor, state assigned by the service (traces to US-ADM-3, US-RMS-4; `FR-ADM-3`, `FR-RMS-4`; `FR-MGMT-4`) | Behaviour check: one `UpsertRoom` keyed by number with the type name, actor, and a `floor` member only when non-blank; the read-back groups the room under that floor; the screen writes no state | Covered — `M4` at `app/src/views/ManageView.test.ts:435-498`; parity `services/rooms/src/server.test.ts:149-202` (owner defines rooms; inventory plus availability), `:241-269` (stored floor), `services/rooms/src/pgstore.ts:213` (`COALESCE($3, floor)`), `services/rooms/src/store.ts:237-260` (`:255` keeps the stored state), `app/src/views/OnboardingView.vue:928-933` (blank floor omitted) |
| AC-MANAGE-5 — a floor move persists through `UpsertRoom` and `ListRoomsByState` reports the new floor with state and occupancy unchanged (traces to US-RMS-4; `FR-RMS-4`; `FR-MGMT-5`) | Behaviour check with the merged five-read reload: the room re-renders under the new floor, its state and occupancy are unchanged, no duplicate appears, a failed state read degrades only its own group, and a blank floor field keeps the stored floor | Covered — `M5` at `app/src/views/ManageView.test.ts:500-567`; parity `services/rooms/src/server.test.ts:241-269`, `app/src/views/RoomsView.vue:460-495` (floor grouping plus the unknown-floor group), `app/src/views/RoomsView.test.ts:495-521`, `services/rooms/src/server.ts:112-124` (a floor-less room omits the member) |
| AC-MANAGE-6 — a price range writes one `UpsertRatePrice` row per night in date order and a quote follows for those dates (traces to US-RTE-1; `FR-RTE-1`; `FR-MGMT-6`, `FR-MGMT-7`; `BR-44`) | Behaviour check: call count equals the inclusive night count, the order is date order, each body carries the plan name, the room-type uuid, the ISO night date, and integer minor units, the grid re-reads, and `QuotePrice` returns the stored prices | Covered — `M6` at `app/src/views/ManageView.test.ts:569-663` and `M7` at `:665-752`; parity `services/rates/internal/store/postgres_test.go:56-82` (two nights, two rows, quote follows), `services/rates/internal/handler/handler.go:141-168` (route and validation), `services/rates/internal/store/store.go:179-195`, `app/src/views/BookView.vue:498-506` (`noRateReason` classifier) and `:609` (`formatVnd` night render); the unchanged `FR-RTE-1` MVP row keeps the capability |
| AC-MANAGE-7 — an unknown rate plan surfaces the explicit create action; creating posts `UpsertRatePlan` with the name only and retries the pending nights (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-ADM-4`; `FR-MGMT-8`) | Behaviour check: the unknown-plan refusal is classified apart from the quote reasons, the create action posts exactly one name-only `UpsertRatePlan`, the retry covers the pending nights, and declining writes nothing | Covered — `M8` at `app/src/views/ManageView.test.ts:754-862`; parity `services/rates/internal/store/store.go:189` (unknown plan `NOT_FOUND` with `ratePlanName`, no `reason`), `services/rates/internal/store/postgres.go:92-95` (a name conflict overwrites the description), `services/rates/internal/handler/handler.go:119-139` (name-only payload valid) |
| AC-MANAGE-8 — a partial save reports saved/total and the first unsaved night; resume starts there, no night twice or skipped, and the action is disabled in flight (traces to US-RTE-1; `FR-RTE-1`; `FR-MGMT-7`, `FR-MGMT-10`) | Behaviour check: the loop stops at the first failure with the written nights kept, saved-of-total and the failed night are stated, resume re-sends from that index only, and a replayed click in flight starts no second round | Covered — `M7` in-flight case at `app/src/views/ManageView.test.ts:832-862` and `M8` stop/resume at `:789-831`; parity `services/rates/internal/store/postgres.go:134-135` (the `ON CONFLICT` key that makes a resent night an update rather than a duplicate) |
| AC-MANAGE-9 — the no-price state says not open for booking, invents no price, and keeps the pricing form usable (traces to US-RTE-1; `FR-RTE-1`, wording aligned with the #589 refusal; `FR-MGMT-9`) | Presentational state check: the not-open-for-booking title and body render from the existing keys, no price and no zero appear, a night that could not be read says so, and the form stays usable inside the state | Covered — `M6` no-price column at `app/src/views/ManageView.test.ts:569-603` and `M9` at `:864-886`; parity `app/src/views/BookView.vue:664-670` (the notice), `app/src/views/BookView.test.ts:999-1058` (not-operational marking), `messages/en.json:424-425`, `messages/vi.json:424-425` (`desk.book.room_type_not_operational`, `_short`) |
| AC-MANAGE-10 — a front-desk role gets the read-only screen and the plain refusal, and a server refusal maps to the same sentence (traces to US-ADM-2; `FR-ADM-2`, product-surface wording only; `FR-MGMT-11`) | Behaviour check: lists render read-only, the notice states who may change the setup, create and save actions are disabled and send nothing, a server refusal shows the same sentence with no envelope code, and a 401 follows the expire-to-gate path | Covered — `M10` at `app/src/views/ManageView.test.ts:888-952`; parity `app/src/views/AdminView.vue:480-483` (the cosmetic `canManage` gate), `app/src/views/AdminView.test.ts:465-485` (manager console), `:487-517` (front-desk read-only, zero admin calls), `app/src/stores/session.ts:22`, `:50-75`, `app/src/api/client.ts:96-110`, `:168-183` |
| AC-MANAGE-11 — every section PR carries catalogue parity, no new token, operation tests, and section evidence (traces to US-ADM-3, US-ADM-4; `FR-ADM-3`, `FR-ADM-4`; `FR-MGMT-12`) | Review obligation over the five `MR-1` proofs in the same change | Covered — `MR-1`: catalogue parity `script/catalogue-coverage-check.sh` (both catalogues plus the eight byte-identical runtime mirrors; green in the merged head's `ci` job), zero token diff with `app/e2e/design-facts.spec.ts:644-665` green under the allowance in `docs/technical/desk-ui-fact-schema.md` section 8, the operation tests with their read-back (`app/src/views/ManageView.test.ts:272-952`), the browser case `app/e2e/manage.spec.ts:52-151`, and the VI/EN captures in `docs/testing/evidence/590/README.md` against board sections 5–7 (the one-pair deviation for 7.4 is recorded in section 6 of the testing spec) |
| Catalogue parity for the slice (`NFR-DSK-1`, `NFR-I18N-1` hold) | L2 catalogue check: every management string is a catalogue key in both locales with placeholders intact, the shared not-open-for-booking phrase is reused not re-keyed, and the mirrors stay byte-identical | Covered by the gate run — the slice's keys are in `messages/en.json` and `messages/vi.json` plus the eight mirrors, `script/catalogue-coverage-check.sh` passed in the merged head's `ci` job (754 keys, 420/420 literal keys resolve, VI parity, 8 byte-identical mirrors), and the shared phrase stays at `messages/en.json:424-425` / `messages/vi.json:424-425` |
| Design-facts gate for the eighth tab | Gate re-run: the seven owner boards must not be edited, so the shared-nav comparison reads the app-only tab allowance; `nav.order`, labels, tokens, and the active pill still match everywhere else | Covered — `app/e2e/design-facts.ts:1004-1011` (`nav.order` comparison), `app/e2e/design-facts.spec.ts:644-665` (expected order over the mapped records plus the allowance label check), the allowance source `app/e2e/design-facts.ts:496-522`, `docs/technical/desk-ui-fact-schema.md` section 8 (allowance entry `manage`, `Quản lý` / `Manage`, after `rooms`); green in the merged head's `browser-e2e` run (29 design-facts cases, live shell conformance on all seven covered screens) |
| Browser evidence for the slice | Browser check per section: the section's writes and reads run through the served Vue SPA, with the seeded API writes kept as a precondition rather than as proof | Covered — `app/e2e/manage.spec.ts:52-151` drives all four sections through the served SPA in one case (Manage tab, type create, room add and floor move, unknown-plan read and explicit plan creation, three nightly rows with a `QuotePrice` read-back, then the not-open-for-booking state); it passed in the merged head's `browser-e2e` run. The seed at `app/e2e/desk-flow.ts:135-166` stays a precondition for other flows, never proof |

Slice coverage (Refs #590): 15 rows mapped; all 15 covered at the
merged head `0d684f1` (#609). `M1`–`M10` pass in the `app-build` job
(31 test files) and the `MR-1` browser half in `app/e2e/manage.spec.ts`
passes in `browser-e2e` (52 browser tests), both in CI run 42725774632.
The implementation landed as one four-section PR under the recorded
orchestrator decision on #590; the per-section `MR-1` pairing and the
one-pair board-capture deviation for the 7.4 empty state are recorded in
section 6 of the testing spec. No existing guard was deleted: the route
set, the nav arrays, and the title case were extended with a note. The
MVP Coverage line below stands unchanged at 57/57.

## 12. Stay check-out room-charge posting slice (Refs #600)

Behaviour slice for the Stay check-out review: the review posts the
stay's room charge before it presents a balance, so a stay the desk
checks in and out ends with a folio that carries the room it paid
for. One `nightly-room-charge` line per stay at the stay's frozen
quoted total (`priceBasis.totalMinor`, `FR-RTE-5`), resolved through
the reservation calendar entry that links the stay; a folio that
already carries a room-charge line is never charged again, a zero
quote posts nothing, and an unresolvable booking or a refused or
failed `PostCharge` refuses the review. The `AC-DSK-18` gate is
unchanged and becomes meaningful; `PostCharge` keeps its request
members, and no backend, schema, stored-value, print, scheduler, or
MVP-capability change is involved. Tier T2 (`product-owner` scope in
`docs/product/desk-ui-design-rollout.md` section 6.14, D-24 in
`docs/project/decision-log.md`).

Each row traces the #600 acceptance condition `AC-DSK-19` (owned by
`product-owner` in
[acceptance-criteria.md section 11](../product/acceptance-criteria.md)),
the behaviour-scoped requirements `FR-CKP-1`..`FR-CKP-5` (owned by
`business-analyst` in
[mvp-requirements.md section 21](../requirements/mvp-requirements.md)),
the unchanged MVP rows `FR-BIL-2`, `FR-BIL-7`, `FR-FDK-2`, and
`FR-RTE-5`, and business rules `BR-17` / `BR-45`
([business-rules.md](../requirements/business-rules.md)). The cases
`CKP-1`..`CKP-12`, the guard registry `D19`, and the pin basis live
in [desk-ui-rollout-test-traceability.md](desk-ui-rollout-test-traceability.md)
sections 3, 4, and 6. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

Every `file:line` below was read at the implementation head `1b43762`
(PR #618), which is unmerged when this slice is written; `master`
carries different line numbers. `qa-lead` re-pins at the merged head.
Two obligations (`FR-CKP-3` zero quote, and the refused/failed-post
half of `FR-CKP-4`) have no guard at that head and are named as
missing: the implementation PR must create them before those rows
can be complete, so this slice is not complete at this spec head.

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-19 — the check-out review posts the stay's room charge once at its frozen quoted total before a balance, never a second, nothing for a zero quote, and refuses an unpostable charge; the `AC-DSK-18` gate keeps passing only for a settled or approved folio (Refs #600; traces to US-FDK-2, US-BIL-1, US-BIL-2; `FR-FDK-2`, `FR-BIL-1`, `FR-BIL-2`, `FR-BIL-7`, `FR-RTE-5`, `BR-17`, `BR-45`) | Behaviour check: one `nightly-room-charge` line at the booking's `priceBasis.totalMinor` named for the room, re-read before any balance is shown; no second line on a repeated review or on an already-charged folio; nothing for a zero quote; a plain `desk.stay.refused_room_charge` refusal or the plain panel error for an unpostable charge, with no balance and no close route; the gate then refuses an unapproved open balance and passes a settled folio or a provenanced approval | **`D19`** and cases `CKP-1`..`CKP-9`, `CKP-12` in section 6 of `desk-ui-rollout-test-traceability.md`: posting `app/src/views/StayView.test.ts:1207-1290`; no-double-post pair `:1281-1290`, `:1291-1310`; unresolved-booking refusal `:1311-1357`; gate after the post `:1086-1206`, `:1358-1476`, `:1612-1676`, `app/src/views/desk-edge-guards.test.ts:970-1033`; browser `app/e2e/stay.spec.ts:80-103`; catalogue parity and the design-facts re-run are the two gate boxes below. Partial: `CKP-5` and `CKP-6` are missing at the implementation head |
| FR-CKP-1 — the review posts one `nightly-room-charge` at the stay's frozen quote before it presents a balance (section 21.3) | One `PostCharge` with the room-named `itemName`, `amountMinor` equal to `priceBasis.totalMinor`, the signed-in `actor`, and `idempotencyKey` `room-charge:<stayId>`; the re-read balance includes it; a failed folio read posts nothing | On disk at `1b43762` — `CKP-1`: `app/src/views/StayView.test.ts:1207-1290` and `app/e2e/stay.spec.ts:80-103`; source pin `app/src/stay-restyle.test.ts:105` |
| FR-CKP-2 — one room charge per stay, never a second (section 21.3) | A repeated review and a pre-charged folio both send zero `PostCharge`; exactly one room-charge line remains | On disk at `1b43762` — `CKP-2`/`CKP-3`: `app/src/views/StayView.test.ts:1281-1290`, `:1291-1310` (default folio carries the charge at `:200-225`) |
| FR-CKP-3 — a zero quote posts nothing (section 21.3) | A frozen quoted total of zero sends zero `PostCharge`, invents no zero-amount line, and the review reaches the zero-balance clear state on the folio as read | **Missing guard, named explicitly** — `CKP-5`; the stub returns `120000` for every stay (`app/src/views/StayView.test.ts:159-172`). The implementation PR #618 must create it before this row is complete |
| FR-CKP-4 — a charge that cannot be posted refuses the review (section 21.3) | An unresolvable booking refuses in `desk.stay.refused_room_charge` with zero `PostCharge`, no balance, no close route, zero `CheckOut`; a refused or failed `PostCharge` ends the review in the plain panel error with the stay in house | Partial at `1b43762` — `CKP-4`: `app/src/views/StayView.test.ts:1311-1357`. **Missing guard named explicitly** — `CKP-6` (service-refused or transport-failed `PostCharge`); the implementation PR #618 must create it |
| FR-CKP-5 — the close that follows is gated on a settled or approved folio (section 21.3) | On the charged folio, an unapproved open balance sends zero `CheckOut` on every route; a settled folio or a provenanced approval closes; a moved balance refuses on the fresh read | On disk at `1b43762` — `CKP-7`/`CKP-8`: `app/src/views/StayView.test.ts:1086-1206`, `:1207-1290`, `:1358-1476`, `:1612-1676`, `app/src/views/desk-edge-guards.test.ts:970-1033`; the unchanged `FR-BIL-7` / `FR-CKO-4` rows keep the capability and the every-route gate |
| Catalogue parity | The one new key `desk.stay.refused_room_charge` in both locales with placeholders intact plus the eight byte-identical runtime mirrors; the coverage job green | `CKP-10`: `messages/en.json:474`, `messages/vi.json:474`, the eight `services/*` mirrors, `script/catalogue-coverage-check.sh`; lands with #618 |
| Design-facts gate | The review state is flow state outside the fact schema, so no fact changes and the gate stays green | `CKP-11`: `app/e2e/design-facts.spec.ts`, `app/e2e/design-facts.ts` Stay entry, `docs/technical/desk-ui-fact-schema.md`; re-run only, a fact edit is drift |
| Browser evidence | The served desk posts its own room charge in the browser flow, one line at the quoted total named for the room, and the open balance then refuses the close | `CKP-9`: `app/e2e/stay.spec.ts:80-103`; the seed must not post a room charge for the asserted flow, or a regression is masked; `browser-e2e` must pass in CI |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-BIL-2` gains only an amendment pointer, and the #588 `FR-CKO-*` ids are unchanged | The 57-row MVP coverage count stands unchanged; the `FR-BIL-2` / `FR-BIL-7` / `FR-FDK-2` / `FR-RTE-5` rows in sections 1–3 keep their guards |

Slice coverage (Refs #600): 10 rows mapped to `AC-DSK-19` and
`FR-CKP-1`..`FR-CKP-5`. Six of them name guards that exist at the
implementation head `1b43762` (`AC-DSK-19` partially, `FR-CKP-1`,
`FR-CKP-2`, `FR-CKP-5`, the browser evidence, and the design-facts
re-run), two name gate checks that land with the implementation PR
(the catalogue parity, and the MVP no-change statement), and two are
**missing guards** the implementation PR #618 must create (`CKP-5`
zero quote, `CKP-6` a refused or failed post). The slice is therefore
**not complete** at this spec head; it completes when the
implementation PR merges with `CKP-1`..`CKP-12` green and `qa-lead`
re-pins the rows at the merged head. The MVP Coverage line below
stands unchanged at 57/57.

## 13. Stay server-side check-out settlement gate slice (Refs #601)

Behaviour slice for the check-out money path: the close is decided on
the folio Billing holds, not on the balance and approval the request
carries. Stay re-reads the folio through Billing on every route to
the close, refuses a presented folio that is not the folio the
balance came from, accepts an approval only when the recorded record
carries an approver identity, a role from the fixed three, and a
recorded time, and fails closed when the folio cannot be read.
`CheckOut` keeps its request members with `folioBalanceMinor` and
`openBalanceApproval` advisory; the error set gains `CONFLICT` (409)
and `UPSTREAM_UNAVAILABLE` (503). No schema, stored-value, event,
desk-panel, catalogue, or MVP-capability change is involved. Tier T3
(`architect`'s ADR-0005 and LLD
[section 21](../architecture/lld.md); `product-owner` scope in
[acceptance-criteria.md section 14](../product/acceptance-criteria.md);
`business-analyst` requirements in
[mvp-requirements.md section 22](../requirements/mvp-requirements.md)).

Each row traces `AC-CKO-1` / `AC-CKO-2` (owned by `product-owner`),
the behaviour-scoped requirements `FR-CKS-1`..`FR-CKS-5` (owned by
`business-analyst`), the unchanged MVP rows `FR-FDK-2` and
`FR-BIL-7`, and business rules `BR-17` / `BR-46`
([business-rules.md](../requirements/business-rules.md)). The owner
cases `CKS-1`..`CKS-11`, the guard registry `S1`–`S12`, and the
evidence rule `SR-1` live in
[checkout-settlement-test-traceability.md](checkout-settlement-test-traceability.md)
sections 3, 4, 6, and 7. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

Every `file:line` in the existing pins was read at the spec head
`3c79797` (code tree identical to `master` `0dcb68e`). Those pins
prove today's client-trusting behaviour and the implementation PR
rewrites them in place, with a `#601` note, never deleting one. All
`S1`–`S12` guards are **missing at this spec head** and created by
the implementation PR; a row is complete only when that PR lands,
passes, and `qa-lead` re-pins it at the merged head. The slice is
therefore **not complete** at this spec head.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-CKO-1` — the close is decided on the folio Billing holds: re-read on every route, presented folio must be the one the balance came from, request balance and approval advisory, non-zero read passes only with a provenanced recorded approval; every refusal leaves the stay in house with no release and no charge (Refs #601; traces to US-FDK-2; `FR-CKO-4`, `FR-CKO-5`, `FR-BIL-7`, `BR-17`, `BR-46`) | L1 acceptance: forged, incomplete, out-of-set, free-form, provenanced, and mismatch callers | **Pending** — `S1`, `S2`, `S3`, `S4`, `S5`, `S6`, `S7`, `S8` in `services/stay/src/server.test.ts`; existing pins to rewrite: `services/stay/src/store.ts:148-166` and `:260-293`, `services/stay/src/pgstore.ts:161-166`, `services/stay/src/server.test.ts:128-238` (`:129-145`, `:147-163`, `:164-178`, `:179-211`, `:212-238`), `:378-459` (`:429-432`, `:433-442`, `:443-451`, `:452-455`) |
| `AC-CKO-2` — an unreadable folio refuses fail-closed with `UPSTREAM_UNAVAILABLE` (503) rather than closing on an unverified balance, a 4xx envelope is surfaced unchanged, and the settled or approved desk close keeps passing unchanged | L1 acceptance + fail-closed check | **Pending** — `S9` (unreadable, 4xx pass-through) and `S7` (the desk's approved close); the desk half is the desk-stay-green row |
| `FR-CKS-1` — the close is decided on the folio Billing holds, and the request's `folioBalanceMinor` / `openBalanceApproval` are advisory and ignored (section 22.3) | L1 acceptance, both directions | **Pending** — `S1`, `S2`, `S6`; existing pins `services/stay/src/server.test.ts:147-163`, `:429-432`, `:164-178`, `:433-442` prove today's opposite and are rewritten |
| `FR-CKS-2` — the folio presented as the invoice is the folio the balance came from (section 22.3) | L1 acceptance | **Pending** — `S8`; no guard on disk; `contracts/http/CheckOut.json` presents the folio as the invoice and gains the `CONFLICT` error row through `architect` |
| `FR-CKS-3` — an approval counts from the folio record, never from the request: identity, fixed role set, recorded time; incomplete, free-form, or out-of-set refuses `SETTLEMENT_REQUIRED`; the write side refuses an out-of-set role and stamps the time (section 22.3) | L1 acceptance (read side and write side) | **Pending** — `S3`, `S4`, `S5`, `S6`, `S7` (read side, `services/stay/src/server.test.ts`) and `S11` (`services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java`); existing pins `BillingService.java:255-272`, `:302-314`, `BillingServiceTest.java:137-163` cover only blank fields |
| `FR-CKS-4` — an unreadable folio refuses the close fail-closed; a 4xx envelope is surfaced unchanged (section 22.3) | L1 acceptance + fail-closed | **Pending** — `S9`; no guard on disk; `deploy/compose.yaml:46`, `:77`, `:113` is the wiring the case exercises |
| `FR-CKS-5` — every route to the close is gated (gate before replay and before the conditional flip) and a refusal changes nothing (section 22.3) | L1 + L3 paired concurrency | **Pending** — `S10`; existing pins `services/stay/src/server.test.ts:179-211`, `:212-238`, `:443-455` keep the replay and one-winner assertions and are rewritten to the gate-first order |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `FR-CKO-4`, `FR-CKO-5`) | Behaviour check: the desk's own close still passes and shows the same lines, and every desk pin passes unchanged | **Covered by re-run** — `app/src/views/StayView.test.ts:1650-1746`, `:1747-1783`, `:1608-1649`, `:1940-1974`, `app/src/views/desk-edge-guards.test.ts:970-1033`, `:1182-1251`, `app/e2e/stay.spec.ts:30-157`, `script/e2e-desk-loop.sh:399-424`; a desk edit in the implementation PR fails the row |
| Contract and LC | Re-run only: `CheckOut` keeps its advisory fields, the envelope registers `CONFLICT` (409) and `UPSTREAM_UNAVAILABLE` (503), the fixtures stay valid, and the Stay -> Billing `GetFolioBalance` seam passes the per-module contract stage | **Pending gate** — `contracts/http/CheckOut.json`, `contracts/errors/envelope.json:9`, `:22`, `services/stay/contract-tests/CheckOut.json`, `CheckOut-open-balance.json`, `CheckOut-approved.json`, `CheckOut-repeat.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; the contract edit is `architect`'s (ADR-0005 D5) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-FDK-2` / `FR-BIL-7` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice |
| Evidence cross-reference (`SR-1`) | The #588 symptom 2(d) payload is the named refusal, recorded before/after, and the slice is recorded in the test report | **Pending** — `S5` is the payload as a guard; `docs/testing/evidence/601/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #601): 11 rows mapped to `AC-CKO-1`,
`AC-CKO-2`, and `FR-CKS-1`..`FR-CKS-5`. One row is covered by a gate
re-run today (the desk-stay-green row, whose pins exist and pass and
must keep passing untouched); ten are **pending** the implementation
PR — the seven condition rows whose guards are the registry
`S1`–`S12`, the contract/LC gate, the MVP no-change gate, and
`SR-1`. The slice is **not complete** at this spec head; it
completes when the implementation PR merges with `S1`–`S12` green,
the desk pins unchanged, `SR-1` recorded, and `qa-lead` re-pins the
rows at the merged head. The MVP Coverage line below stands
unchanged at 57/57.

## 14. Stay departure release and same-day reuse slice (Refs #646)

Behaviour slice for the end of the stay: the check-out that commits
completes the booking behind the stay, so the departed booking leaves
the active availability set, the booking reads completed in history
instead of `checked-in`, and the departed room type is sellable and
the departed room reusable the same day through the desk's existing
housekeeping path. The terminal `closed` booking state already exists
(`BR-1`, the accepted state machine, and the reservations `state`
CHECK); the change supplies the missing write and the missing
requirement wording. No lifecycle state, schema, migration, desk flow,
event, catalogue, or MVP-capability change is involved. Tier T2
(`architect`'s LLD [section 22](../architecture/lld.md) and
`state-machine.md` [section 1.1](../architecture/state-machine.md);
`product-owner` scope in
[acceptance-criteria.md section 15](../product/acceptance-criteria.md);
`business-analyst` requirements in
[mvp-requirements.md section 23](../requirements/mvp-requirements.md)).

Each row traces `AC-DEP-1`..`AC-DEP-5` (owned by `product-owner`),
the behaviour-scoped requirements `FR-DEP-1`..`FR-DEP-5` (owned by
`business-analyst`), the unchanged MVP rows `FR-FDK-2` and `FR-RTE-2`,
and business rules `BR-1` / `BR-16` / `BR-18` / `BR-28`
([business-rules.md](../requirements/business-rules.md)). The owner
cases `DEP-1`..`DEP-9`, the guard registry `DR1`–`DR13`, and the
evidence rule `DR-E1` live in
[departure-release-test-traceability.md](departure-release-test-traceability.md)
sections 3, 4, 6, and 7. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

Every `file:line` in the existing pins was read at the spec head
`8263ab3` (code tree identical to `master` `8745afa`). Those pins
prove today's behaviour — the booking keeps reading `checked-in` after
a close while the room turnover path already exists — and the
implementation PR extends them in place, with a `#646` note, never
deleting one. All `DR1`–`DR13` guards are **missing at this spec
head** and created by the implementation PR; a row is complete only
when that PR lands, passes, and `qa-lead` re-pins it at the merged
head. The slice is therefore **not complete** at this spec head.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-DEP-1` — a committed check-out records the booking as completed (terminal `closed`), never `checked-in`, keeps the past stay visible in history, and the room-charge review that precedes the close still resolves the booking (Refs #646; traces to US-FDK-2, US-GST-1; `FR-FDK-2`, `FR-GST-1`, `BR-1`, `BR-18`) | L1 acceptance: the completion on the close, its read-back, and its idempotence | **Pending** — `DR1`, `DR2`, `DR7` in `departure-release-test-traceability.md` section 3; today's opposite is pinned at `services/reservations/internal/store/store.go:109-117` and `services/stay/src/store.ts:260-292` |
| `AC-DEP-2` — after A departs, B books the same room type for arrival today and is accepted (a normal or an early departure), and no no-availability refusal is caused by A's booking (traces to US-RES-1, US-RES-5, US-FDK-2; `FR-RES-5`, `FR-RTE-2`, `FR-FDK-2`, `BR-1`, `BR-8`, `BR-9`) | L1 acceptance: availability after completion, plus the negative control and the early-departure pair | **Pending** — `DR4`, `DR5`, `DR6`; today's guard filters are `services/reservations/internal/store/store.go:214-227`, `:364-380`, `services/reservations/internal/store/postgres.go:177`, `:483` |
| `AC-DEP-3` — after housekeeping marks the departed room clean then inspected, it is offered and B is checked into it the same day, with no manual state edit and the inspected-only rule intact (traces to US-RMS-2, US-FDK-1; `FR-RMS-2`, `FR-FDK-1`, `BR-16`, `BR-28`) | Behaviour check: one same-day turnover chain through the desk, plus the per-step service pins | **Pending** — `DR12`; the per-step halves exist today at `services/rooms/src/server.test.ts:271-301`, `app/src/views/RoomsView.test.ts:290-348`, `:349-405`, `app/src/views/StayView.test.ts:394-463`, `app/src/views/desk-edge-guards.test.ts:912-1032` |
| `AC-DEP-4` — a completed booking reads completed and never returns to active: check-in, modify, cancel, and no-show are refused, no reopen exists, and a same-day return is a new booking (traces to US-FDK-2; `FR-FDK-2`, `BR-1`, `BR-18`) | L1 acceptance: terminal reads and the four refusals, plus the surface check | **Pending** — `DR10`, `DR2`; the existing state-refusal pins `services/reservations/internal/store/store_test.go:151-172`, `:265-303` keep their assertions |
| `AC-DEP-5` — every refused close leaves the stay in house and the booking active with no release and no completion; a committed close whose completion cannot be recorded is reported in plain words instead of claiming a truth the booking read contradicts (traces to US-FDK-2; `FR-FDK-2`, `FR-BIL-7`, `BR-17`, `BR-18`, `BR-46`) | L1 acceptance (refusal set) + split reporting + desk wording | **Pending** — `DR8`, `DR9`, `DR13`; the #588/#600/#601 refusal pins listed in the slice document section 2 stay green |
| `FR-DEP-1` — the check-out completes the booking behind the stay, resolved by the stay link, with the actor and time recorded, completed once on a replay, and nothing changed by a refused close (section 23.3) | L1 acceptance (Reservations and Stay, memory and Postgres) | **Pending** — `DR1`, `DR2`, `DR3`, `DR7`, `DR9`, `DR11`; no guard on disk |
| `FR-DEP-2` — only `confirmed` and `checked-in` bookings hold availability, so a completed booking blocks nothing and an early departure releases the remaining nights without a date rewrite (section 23.3) | L1 acceptance + negative control | **Pending** — `DR4`, `DR5`, `DR6`, `DR11`; the guards that already carry the active set are cited in the slice document section 2 |
| `FR-DEP-3` — a completed booking reads completed through read-back, calendar, and history, and completion is terminal with no reopen route (section 23.3) | L1 acceptance + surface check | **Pending** — `DR10`, `DR2`; `FR-RES-5` / `FR-GST-1` keep their MVP guards |
| `FR-DEP-4` — the departed room is reusable the same day through the desk path, and a dirty or clean-only room is never offered (section 23.3) | Behaviour chain (desk) + service pins | **Pending** — `DR12`; `FR-RMS-2` keeps its service guard and `app/src/views/RoomsView.test.ts:290-405` keeps the button pair |
| `FR-DEP-5` — every refused close completes and releases nothing, and a split is reported rather than silent (section 23.3) | L1 acceptance (refusals) + split reporting + desk wording | **Pending** — `DR8`, `DR9`, `DR13`; the #588 release, #600 posting, and #601 gate pins stay green |
| Lifecycle `D5` — no `reservation.completed` event in this change (LLD [section 22.5](../architecture/lld.md)) | L1 acceptance: the completion writes no outbox row and the event contract keeps its shape | **Pending** — the assertion inside `DR1` (`DR7` counts exactly one `checked-out` event on the Stay side); `contracts/events/reservation-events.json` unchanged |
| Lifecycle `D6` — bookings already stranded by the old behaviour are not repaired (LLD [section 22.4](../architecture/lld.md)) | No code guard by design: an operational note plus a follow-up | **Deferred (not a code guard)** — the `release-manager` note lands at merge and the reconciliation is a named follow-up; the repair path itself is a replay of the close (`DR9`) |
| #588 / #600 / #601 desk behaviour stays green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`) | Behaviour check: the close still releases once, the review still posts the room charge once, and every refusal keeps its plain words; no desk flow change | **Covered by re-run** — `app/src/views/StayView.test.ts:1086-1203`, `:1207-1290`, `:1291-1310`, `:1530-1579`, `:1650-1746`, `:1747-1783`, `:1940-1974`, `app/src/views/desk-edge-guards.test.ts:912-1032`, `app/e2e/stay.spec.ts:30-157`, `script/e2e-desk-loop.sh:418-424`; a desk flow edit in the implementation PR fails the row |
| Contract and LC | Re-run only: the new `CheckOutReservation` provider contract with its fixture, the additive `bookingCompletion` on `CheckOut`, the existing Stay fixtures still replay unchanged, and the Stay -> Reservations seam passes the per-module contract stage | **Pending gate** — `contracts/http/CheckOutReservation.json` (new), `contracts/http/CheckOut.json` (1.0 -> 1.1), `contracts/openapi.yaml`, `services/reservations/contract-tests/`, `services/stay/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; the contract edit is `architect`'s (LLD 22.5) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-FDK-2` and `FR-RTE-2` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`DR-E1`) | The owner symptom is recorded before and after against a lab stack, and the slice is recorded in the test report | **Pending** — `docs/testing/evidence/646/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #646): 16 rows mapped to `AC-DEP-1`..`AC-DEP-5`,
`FR-DEP-1`..`FR-DEP-5`, the lifecycle `D5`/`D6` notes, and the gate
boxes. One row is covered by a gate re-run today (the desk-stay-green
row, whose pins exist and pass and must keep passing untouched), one
is deferred by design (lifecycle `D6`, an operational note rather than
a code guard), and fourteen are **pending** the implementation PR —
the ten condition rows whose guards are the registry `DR1`–`DR13`,
the contract/LC gate, the MVP no-change gate, the lifecycle `D5` event
assertion, and `DR-E1`. The slice is **not complete** at this spec
head; it completes when the implementation PR merges with `DR1`–`DR13`
green, the desk pins unchanged, `DR-E1` recorded, and `qa-lead`
re-pins the rows at the merged head. The MVP Coverage line below
stands unchanged at 57/57.

## 15. Desk room reassignment and vacated-room release slice (Refs #647)

Behaviour slice for the desk's room handling around a check-in commit
and around a move: a check-in assigns only the room the guest is
actually in, takes that assignment back when a later step of the same
commit fails definitively and no stay was recorded, and the desk gains
the reassignment/mid-stay move path — assign the target room, move the
stay, release the vacated room to `vacant-dirty` — that `FR-FDK-3`
already promised but no screen carried. No lifecycle state, operation,
field, event, schema, migration, or MVP capability is added; the three
operations and both release targets already exist. Tier T2
(`architect`'s LLD [section 23](../architecture/lld.md) and
`state-machine.md` [section 2.1](../architecture/state-machine.md);
`product-owner` scope in
[acceptance-criteria.md section 16](../product/acceptance-criteria.md) and
[desk-ui-design-rollout.md section 6.17](../product/desk-ui-design-rollout.md);
`business-analyst` requirements in
[mvp-requirements.md section 24](../requirements/mvp-requirements.md)).

Each row traces `AC-REA-1`..`AC-REA-5` (owned by `product-owner`),
the behaviour-scoped requirements `FR-REA-1`..`FR-REA-5` (owned by
`business-analyst`), the unchanged MVP rows `FR-FDK-1` and `FR-FDK-3`,
and business rules `BR-16` / `BR-18` / `BR-19` / `BR-28`
([business-rules.md](../requirements/business-rules.md)). The owner
cases `REA-1`..`REA-9`, the guard registry `RR1`–`RR13`, and the
evidence rule `RR-E1` live in
[arrival-reassign-test-traceability.md](arrival-reassign-test-traceability.md)
sections 3, 4, 6, and 7. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

Every `file:line` in the existing pins was read at this spec head (the
stack's architecture commit `979f644`; code tree identical to `master`
`61bb8dd`, because the sibling spec PRs touch `docs/` only). Those pins
prove today's behaviour — the commit assigns first and never takes the
assignment back, and no desk path calls `MoveRoom` — and the
implementation PR extends them in place, with a `#647` note, never
deleting one. All `RR1`–`RR13` guards are **missing at this spec head**
and created by the implementation PR; a row is complete only when that
PR lands, passes, and `qa-lead` re-pins it at the merged head. The
slice is therefore **not complete** at this spec head.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-REA-1` — the commit assigns only the room the guest is in, and a definitive failure of a step that leaves no stay behind releases the assigned room back to `vacant-inspected` with a plain refusal; an unreadable outcome releases nothing; the post-stay reservation-link split releases nothing (read with `FR-REA-1` governing, LLD 23.9 R14) (Refs #647; traces to US-FDK-1; `FR-FDK-1`, `BR-16`, `BR-28`, `NFR-CON-2`) | L1 acceptance: switch after preload, both compensating failures, the post-stay split, and the unreadable set | **Pending** — `RR1`, `RR2`, `RR3`, `RR4`, `RR5` in `app/src/views/StayView.test.ts`; today's opposite is pinned at `app/src/views/StayView.vue:1246-1261`, `:1281-1336` and the existing refusal patterns at `app/src/views/StayView.test.ts:1029-1085`, `:2253-2279` |
| `AC-REA-2` — after a committed check-in in 101, reassigning to 102 leaves 102 occupied, 101 vacant and dirty, the board and the Rooms map showing only 102, the stay in house with its folio link, and the move (from, to, time) kept and shown (traces to US-FDK-1, US-FDK-3; `FR-FDK-1`, `FR-FDK-3`, `BR-19`) | L1 acceptance + browser end state | **Pending** — `RR7`, `RR11`; the service halves exist at `services/rooms/src/server.test.ts:455-500` and `services/stay/src/server.test.ts:241-258` and stay green |
| `AC-REA-3` — no room is left occupied by an aborted reassignment: a refusal before the target assignment changes nothing, one after it releases the target back to ready, a failing compensation is named, an unreadable outcome releases nothing, and the refusal is one plain sentence (traces to US-FDK-3; `FR-FDK-3`, `BR-19`, `BR-28`, `NFR-CON-2`) | L1 acceptance: the four ordering cases | **Pending** — `RR6`, `RR9`; the release guard they rely on is `services/rooms/src/store.ts:407-436` |
| `AC-REA-4` — an earlier-day in-house stay moves to another ready room through the same single path: the old room becomes vacant and dirty, the stay names the new room, the move is kept, and the stay's in-house state and folio link are unchanged (traces to US-FDK-3; `FR-FDK-3`, `BR-19`) | L1 acceptance on the same desk path | **Pending** — `RR8`; the stay side is pinned today at `services/stay/src/server.test.ts:241-292`, `:406-460` |
| `AC-REA-5` — the four regression cases each carry a unit guard plus the e2e/lab guard, the existing check-in, release, charge, settlement, and departure guards stay green, the copy exists in both locales, and the one decided UI fact is recorded (traces to `NFR-CON-2`, `NFR-I18N-1`) | L1 + browser + catalogue + design-facts | **Pending** — `RR1`–`RR13` and `RR-E1`, with the green half on the desk-stay-green row and the catalogue/design gates in `RR12`/`RR13` |
| `FR-REA-1` — the commit assigns the chosen room and takes back the assignment when a step that leaves no stay fails definitively; the post-stay split is reported and releases nothing; an unreadable step releases nothing; one compensation per action (section 24.3) | L1 acceptance, all five branches | **Pending** — `RR1`, `RR2`, `RR3`, `RR4`, `RR5`, `RR6`, `RR9` (one-compensation half); no guard on disk |
| `FR-REA-2` — the desk reassigns a checked-in guest and releases the vacated room to `vacant-dirty` in the same commit window, in the order assign, move, release, with the move kept and shown (section 24.3) | L1 acceptance + call-order assertion | **Pending** — `RR7`, `RR11`; the rooms-side order already exists at `services/rooms/src/server.test.ts:455-500` |
| `FR-REA-3` — a refused or aborted reassignment leaves no room occupied by the attempt, and the compensating release targets `vacant-inspected` (section 24.3) | L1 acceptance + compensation target | **Pending** — `RR6`, `RR9`; `services/rooms/src/server.test.ts:328-354`, `:355-381` keep the one-winner and replay halves |
| `FR-REA-4` — a mid-stay move runs the same single path with the same ordering and refusals, and the stay keeps its in-house state and folio link (section 24.3) | L1 acceptance on the same card | **Pending** — `RR8`; `RR10` asserts no second card hook or call appears |
| `FR-REA-5` — the reassignment is recorded, visible, and guarded: from-room, to-room, time, and actor; the desk names both numbers and the time; the four cases carry unit plus e2e/lab guards; every new string is in both locales; the decided card is a recorded design fact (section 24.3) | L1 + audit + browser + catalogue + design-facts | **Pending** — `RR7`/`RR8` (receipt), `RR10` (re-pin), `RR11`, `RR12`, `RR13`; the durable record is pinned today at `services/stay/src/server.test.ts:241-258` and `services/rooms/src/store.ts:398-402`, `:428-432` and must stay green |
| `AC-REA-1` / `FR-REA-1` disposition (LLD 23.9 R14, closed at the stack base) | The gate sees the reading and the guard that proves it; the criterion already scopes its release list and both copy points are keyed (LLD 23.9 R15) | **Pending** — `RR4` is the guard and the only outstanding obligation on the row, created by the implementation PR in `app/src/views/StayView.test.ts` |
| Desk flows stay green (`AC-DSK-17`, `AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`) | Behaviour check: the preload and commit window, the check-out release, the room charge, the settlement refusals, and the departure completion keep their words and calls | **Covered by re-run** — `app/src/views/StayView.test.ts:2390-2537`, `:2538-2666`, `:1086-1206`, `:1281-1362`, `:1530-1579`, `:1650-1783`, `:1940-1974`, `app/src/views/desk-edge-guards.test.ts:899-1033`, `:1449-1700`, `app/e2e/stay.spec.ts:30-177`, `script/e2e-desk-loop.sh:342-348`; a flow edit in the implementation PR fails the row |
| Contract and LC | Re-run only: the three operations keep their shapes, no error code is added, and the existing fixtures replay unchanged | **Pending gate** — `contracts/http/AssignRoom.json`, `MoveRoom.json`, `ReleaseRoom.json`, `contracts/errors/envelope.json`, `services/rooms/contract-tests/`, `services/stay/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a contract delta here is a re-tier finding (LLD 23.7, 23.9) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-FDK-1` and `FR-FDK-3` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`RR-E1`) | The stale-hold path is recorded from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/647/README.md` and the `test-report.md` row are created by the implementation PR; the reproduction path is also recorded in that PR's body or an issue comment |

Slice coverage (Refs #647): 15 rows mapped to `AC-REA-1`..`AC-REA-5`,
`FR-REA-1`..`FR-REA-5`, the `AC-REA-1` / `FR-REA-1` disposition, and
the gate boxes. One row is covered by re-run today (the desk-stay-green
row, whose pins exist and pass and must keep passing untouched);
fourteen are **pending** the implementation PR — the eleven
condition/requirement rows whose guards are the registry
`RR1`–`RR13`, the contract/LC gate, the MVP no-change gate, the
disposition row, and `RR-E1`. The slice is **not complete** at this
spec head; it completes when the implementation PR merges with
`RR1`–`RR13` green, the desk pins unchanged, `RR-E1` recorded, and
`qa-lead` re-pins the rows at the merged head. The MVP Coverage line
below stands unchanged at 57/57.

## 16. Desk booking management view slice (Refs #648)

Reader-visible slice for the desk gap the owner reported from manual QA
on 2026-11-10: no screen lists the bookings, so staff cannot see who
booked which room type, for which dates, at what quoted price, without
reading records one reference at a time. The desk gains one read-only
register at `/app/bookings` with a night-range filter, one row per
booking staying in the range, and a fresh `GetReservation` read-back
detail, over five operations that already exist (`QueryCalendar`,
`GetReservation`, `ListRoomTypes`, `ListArrivalsDepartures`,
`ListRoomsByState`). No operation, field, error code, lifecycle state,
event, schema, migration, catalogue structure, or MVP capability is
added. Tier T2 (`architect`'s LLD
[section 24](../architecture/lld.md); `product-owner` scope in
[acceptance-criteria.md section 17](../product/acceptance-criteria.md),
[booking-management-view.md](../product/booking-management-view.md),
and [desk-ui-design-rollout.md section 6.18](../product/desk-ui-design-rollout.md);
`business-analyst` requirements in
[mvp-requirements.md section 25](../requirements/mvp-requirements.md);
app-only nav allowance in
[desk-ui-fact-schema.md section 8](../technical/desk-ui-fact-schema.md)).

Each row traces `AC-BMV-1`..`AC-BMV-7` (owned by `product-owner`), the
behaviour-scoped requirements `FR-BMV-1`..`FR-BMV-7` (owned by
`business-analyst`), the unchanged MVP row `FR-RES-5`, and business
rules `BR-1` / `BR-13` / `BR-43`
([business-rules.md](../requirements/business-rules.md)). The owner
cases `BMV-1`..`BMV-9`, the guard registry `BM1`–`BM16`, and the
evidence rule `BM-E1` live in
[booking-management-view-test-traceability.md](booking-management-view-test-traceability.md)
sections 3, 4, 6, and 7. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

Every `file:line` in the existing pins was read at this spec head (the
stack's architecture commit `febf76e`; the code tree is identical to
`origin/master` at `8cb42ca`, because the sibling spec PRs touch
`docs/` only). Those pins prove today's behaviour — no route lists
bookings and the eight-tab row is pinned — and the implementation PR
extends them in place, with a `#648` note, never deleting one. All
`BM1`–`BM16` guards are **missing at this spec head** and created by
the implementation PRs; a row is complete only when that PR lands,
passes, and `qa-lead` re-pins it at the merged head. The slice is
therefore **not complete** at this spec head.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-BMV-1` — the bookings tab sits immediately after `Book` and opens `/app/bookings` inside the shared shell, with the tab label, route title, screen title, and intro resolved through the catalogue, the nine-tab row inside the `1200px` content width with the brand as the only shrinkable item, at the design nav spacing (`8px` inter-tab gap, `10px 16px` tab padding) from a `1280px` viewport and wider and the decided narrow spacing below it (`4px` gap, `10px 12px` padding, with the label, `10px` vertical padding, `44px` target, radius, and inversion unchanged; D-29), and every other route, gate, and print surface unchanged (Refs #648; traces to US-RES-5; `FR-RES-5`, `FR-DSP-1`, `NFR-I18N-1`) | L1 acceptance: route, tab, titles, both width bands | **Pending** — `BM1`, `BM3`, `BM16` (the narrow band's own rule-body assertion, so the base design values cannot be read for the override), `BM-E1` (the `1200px` measurement plus the `1279px`/`1280px` pair, both in both locales) in `booking-management-view-test-traceability.md` section 3; today's eight-tab pins are `app/src/App.test.ts:182-215`, `app/src/shell-restyle.test.ts:28-29`, `app/src/router.test.ts:155-179`, `app/e2e/manage.spec.ts:72-75` |
| `AC-BMV-2` — every booking staying at least one night in the range is listed once, ordered by arrival then reference, with guest, reference, room type, assigned room when in house and a plain placeholder otherwise, dates, nights, quoted total, and state; nothing invented or dropped, and more than 50 renders the earliest 50 with one sentence (traces to US-RES-5; `FR-RES-5`, `FR-RTE-5`) | L1 acceptance: row fields, order, cap, assigned-room rules | **Pending** — `BM5`, `BM6`, `BM7`, `BM8`; the service halves exist at `services/reservations/internal/handler/handler.go:162-182`, `services/stay/src/server.ts:157-165`, `services/rooms/src/server.ts:112-126` |
| `AC-BMV-3` — an applied inclusive night range lists only bookings staying at least one night in it (`dateFrom` = first night, `dateTo` = last night + 1 day), one read per apply with the fields and action disabled, the selection and detail cleared, and an inverted or missing range naming the field and sending nothing (traces to US-RES-5; `FR-RES-5`, `NFR-TZ-1`) | L1 acceptance: both boundaries, one read per apply, validation | **Pending** — `BM3`, `BM4`; the overlap rule is pinned at `services/reservations/internal/store/store.go:191-193` and `services/reservations/internal/store/postgres.go:311-323` |
| `AC-BMV-4` — an empty range shows one plain catalogue sentence naming the range in the desk date form, invents no row, and leaves the filter usable (traces to US-RES-5; `FR-RES-5`, `FR-DSP-3`) | L1 acceptance: wording plus the usable filter | **Pending** — `BM9`; the wording pattern is `app/src/views/DeskView.test.ts:617` |
| `AC-BMV-5` — selecting a row reads the booking back with `GetReservation` and shows its reference, guest, room type, assigned room, dates, nights, total, recorded discount, and state — read back rather than re-derived, with no write action, a second selection replacing it and a new range clearing it (traces to US-RES-5; `FR-RES-5`, `FR-RTE-5`) | L1 acceptance: read-back fields, no re-derivation, selection rules | **Pending** — `BM12`; the read shape is pinned at `services/reservations/internal/handler/handler.go:162-182` and `services/reservations/internal/handler/handler_test.go:166-171` |
| `AC-BMV-6` — a failed read follows its class: a failed list or detail read is one plain catalogue sentence with a retry; a failed per-row, room-type, in-house, or occupied-room read keeps every row it can, the affected cells say they could not be read instead of a guessed value, and one notice above the list counts the incomplete rows and names each failed column in its own sentence, with no retry action because re-applying the range reads again; no booking is dropped, no stack trace or code is shown, and the rest of the desk remains usable (traces to US-RES-5; `FR-RES-5`, `FR-DSP-3`) | L1 acceptance: the failure matrix | **Pending** — `BM10`, `BM11`, `BM12`; the client classification is pinned at `app/src/api/client.ts:143-202`; both partial-class sentences are worded (`desk.bookings.row_partial`, `desk.bookings.column_partial`), so the row asserts the distinct keys rather than an open R18 gap |
| `AC-BMV-7` — the screen offers no write action and calls only the five existing operations with no direct database or store access, every new string exists in both catalogues with matching placeholders and the catalogue check is green, the design-facts gate records the app-only tab with every board screen green, and the owner has reviewed the built screen (traces to US-RES-5; `FR-RES-5`, `FR-DSP-3`, `NFR-I18N-1`) | L1 + call-set + catalogue + design-facts + owner evidence | **Pending** — `BM2`, `BM15`, `BM14`, `BM-E1` |
| `FR-BMV-1` — one read-only booking register in the shared desk shell: tab after `Book`, `/app/bookings`, catalogue-resolved label, title, and intro, every other tab and route unchanged, the shell's one decided exception below a `1280px` viewport (`4px` inter-tab gap, `10px 12px` tab side padding, with `8px` / `10px 16px` held at `1280px` and wider and the label, `10px` vertical padding, `44px` target, radius, inversion, locale pill, session control, and brand-only shrink rule unchanged in both bands; D-29), the design token set gaining nothing, and no write action or edit link anywhere (section 25.3) | L1 acceptance + a no-write assertion + both nav bands | **Pending** — `BM1`, `BM2`, `BM16`, `BM-E1` (the `1200px` measurement plus the `1279px`/`1280px` pair, both locales); no guard on disk |
| `FR-BMV-2` — every booking staying at least one night is listed once with the desk's facts, ordered by arrival then reference, every state listed, at most 50 rows with the narrow-the-dates sentence, the assigned room only when in house, a per-row failure kept and stated, and nothing invented or dropped (section 25.3) | L1 acceptance: fields, order, cap, states, assigned room, partial row | **Pending** — `BM5`, `BM6`, `BM7`, `BM8`, `BM11`; no guard on disk |
| `FR-BMV-3` — the night filter is inclusive and maps onto the calendar window, one read per apply with the fields and action disabled and a repeated click a no-op, the selection cleared on every list read, an invalid range sending nothing, and the range length uncapped (section 25.3) | L1 acceptance + call-count assertion | **Pending** — `BM3`, `BM4`; the rule it depends on is `services/reservations/internal/store/store.go:191-193` |
| `FR-BMV-4` — an empty range is one plain sentence naming the range in the desk date form, with no row invented and a usable filter (section 25.3) | L1 acceptance | **Pending** — `BM9`; no guard on disk |
| `FR-BMV-5` — a selected row opens the fresh read-back detail with the record's values, no recalculation or re-derivation, no action, replace on a second selection, clear on a new range, and no card before a selection (section 25.3) | L1 acceptance: read-back plus the selection rules | **Pending** — `BM12`; the record read is pinned at `services/reservations/internal/handler/handler.go:162-182` |
| `FR-BMV-6` — a failed list or detail read is one plain sentence with a retry; a failed per-row, room-type, in-house, or occupied-room read keeps every row it can, the affected cells state they are unreadable instead of a guessed value, and one notice above the list counts the incomplete rows and names each failed column, with no retry action of its own because re-applying the range reads again; no booking is dropped, no stack trace or envelope code surfaces, the desk stays usable, and a failed detail read keeps the list without keeping the old detail as current (section 25.3) | L1 acceptance: the failure matrix | **Pending** — `BM10`, `BM11`, `BM12`; the client split is `app/src/api/client.ts:143-202` |
| `FR-BMV-7` — the register calls only the five operations with the signed-in session, with no database, reservation-store, or service-internal access and no new operation, no write action, both catalogues carrying every new string, the design-facts gate recording the app-only tab, and the owner's screen review recorded (section 25.3) | L1 + call-set + catalogue + design-facts + owner evidence | **Pending** — `BM2`, `BM15`, `BM14`, `BM-E1`; no guard on disk for the call set or the owner record |
| Desk screens stay green (`AC-DSK-*`, `AC-CKO-*`, `AC-DEP-*`, `AC-REA-*`) | Behaviour check: the board, Book, Stay, Folio, Print, Rooms, and Manage screens keep their words, calls, and flows | **Covered by re-run** — `app/src/views/StayView.test.ts:350-2695`, `:2696-3310`, `app/src/views/desk-edge-guards.test.ts:912-1032`, `:1449-1700`, `app/e2e/stay.spec.ts:30-314`, `script/e2e-desk-loop.sh:342-348`, plus the board, Book, Rooms, Manage, Folio, Print, and Admin unit suites; a flow edit in the implementation PR fails the row |
| Contract and LC | Re-run only: the five operations keep their shapes and the existing fixtures replay unchanged | **Pending gate** — `contracts/http/QueryCalendar.json`, `GetReservation.json`, `ListRoomTypes.json`, `ListArrivalsDepartures.json`, `ListRoomsByState.json`, `contracts/errors/envelope.json`, `services/reservations/contract-tests/`, `services/stay/contract-tests/`, `services/rooms/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a contract delta is a re-tier finding (LLD 24.7, 24.9) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-RES-5` gains only the amendment pointer and `AC-RES-5` the `AC-BMV-2`/`AC-BMV-5` pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`BM-E1`) | The live read path, the before/after pair, the 1200px measurement, and the owner's screen review are recorded | **Pending** — `docs/testing/evidence/648/README.md` and the `test-report.md` row are created by the implementation PR; the owner review is recorded on #648 |

Slice coverage (Refs #648): 18 rows mapped to `AC-BMV-1`..`AC-BMV-7`,
`FR-BMV-1`..`FR-BMV-7`, and the gate boxes. One row is covered by
re-run today (the desk-green row, whose pins exist and pass and must
keep passing untouched); seventeen are **pending** the implementation
PRs — the fourteen condition/requirement rows whose guards are the
registry `BM1`–`BM16`, the contract/LC gate, the MVP no-change gate, and
`BM-E1`. The slice is **not complete** at this spec head; it completes
when the implementation PRs merge with `BM1`–`BM16` green, the pins
unchanged, `BM-E1` recorded with the owner review on #648, and `qa-lead`
re-pins the rows at the merged head. The MVP Coverage line below stands
unchanged at 57/57.

## 17. Server-side reservation price basis slice (Refs #632)

Behaviour slice for the booking money path: the total a reservation
freezes and the discount name it stores become the values a Rates
`QuotePrice` read returns for the effective room type, dates, and
discount during the same request, instead of whatever the caller sent.
A request whose total disagrees is refused `PRICE_CHANGED` (409) with
both totals and stores nothing, an unreadable Pricing refuses
`UPSTREAM_UNAVAILABLE` (503) rather than freezing an unverified number,
a definitive Rates refusal is surfaced unchanged, and Modify reprices
on the same terms and records the price-basis change with the actor and
time. No schema, column, migration, backfill, event, or stored-shape
change; the contract delta is additive. Tier T3 (ADR-0007, accepted
2026-11-24 on owner approval; HLD
[section 18](../architecture/hld.md) and LLD
[section 25](../architecture/lld.md); `product-owner` scope in
[acceptance-criteria.md section 18](../product/acceptance-criteria.md)
and [desk-ui-design-rollout.md section 6.19](../product/desk-ui-design-rollout.md);
`business-analyst` requirements in
[mvp-requirements.md section 26](../requirements/mvp-requirements.md)).

Each row traces `AC-PRC-1`..`AC-PRC-5` and the desk condition
`AC-DSK-20` (owned by `product-owner`), the behaviour-scoped
requirements `FR-PRC-1`..`FR-PRC-5` (owned by `business-analyst`), the
unchanged MVP rows `FR-RES-1`, `FR-RES-2`, and `FR-RTE-5`, and business
rules `BR-2`, `BR-13`, and `BR-52`
([business-rules.md](../requirements/business-rules.md)). The owner
cases `PA-1`..`PA-8`, the guard registry `PA1`–`PA14`, and the evidence
rule `PA-E1` live in
[price-authority-test-traceability.md](price-authority-test-traceability.md)
sections 3, 4, 6, and 7. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

Every `file:line` in the existing pins was re-read on this merged stack
head: the requirements branch now merges `master` `a7c5214`, which
carries the folio write verification slice (#634, ADR-0008 — its
catalogue keys land ahead of `error.validation.price_basis` in the
reservation messages file) on top of the #643 audit-actor change (it
shifted the handler and store test lines cited below) and the #631
availability implementation (#716) that added the availability client
and its tests beside these pins and three catalogue keys. Those pins
prove today's behaviour — the frozen total is only checked
for presence and `>= 0`
(`services/reservations/internal/service/service.go:158-160`,
`:250-252`), stored verbatim
(`services/reservations/internal/store/store.go:274-275`), re-frozen on
Modify (`:472-476`), and nothing on the booking path quotes (the wired
client runs `CheckRestrictions` only,
`services/reservations/internal/pricing/client.go:43-85`) — and the
implementation PR rewires the two pins that assert the supplied total
and extends every other one in place, never deleting an assertion. All
`PA1`–`PA14` guards are **missing at this spec head** and created by
the implementation PR; a row is complete only when that PR lands,
passes, and `qa-lead` re-pins it at the merged head. The slice is
therefore **not complete** at this spec head.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-PRC-1` — the frozen total and stored discount name are the `QuotePrice` values for the effective room type, dates, and discount read in the same request; the request's total never sets a stored value; a repeated `idempotencyKey` is returned at its stored total, never re-quoted (traces to US-RES-1; `FR-RES-1`, `FR-RTE-5`, `BR-13`, `BR-52`) | L1 acceptance + downstream read | **Pending** — `PA3`, `PA4`, `PA6` in `services/reservations/internal/service/service_test.go`; today's opposite is pinned at `services/reservations/internal/service/service.go:158-160`, `:189` and `internal/store/store.go:274-275`, with the rewired pins at `internal/service/service_test.go:46-61`, `internal/handler/handler_test.go:76-105` |
| `AC-PRC-2` — a disagreeing total (lower, higher, or zero for a priced stay) is refused `PRICE_CHANGED` (409) naming both totals, the type, and the dates; no reservation, availability, change entry, idempotency record, or event is written; a legitimate zero is booked only when the quote says zero (traces to US-RES-1; `FR-RES-1`, `FR-RTE-5`, `BR-13`, `BR-52`) | L1 acceptance: the three disagreement shapes + the no-write set | **Pending** — `PA1`, `PA2`, `PA4`; the absent/negative 400 that must stay a different refusal is `PA5` |
| `AC-PRC-3` — an unreadable Pricing (transport, timeout, 5xx, unparseable envelope, unwired client) refuses `UPSTREAM_UNAVAILABLE` (503) naming `rates`/`QuotePrice` with nothing stored, and each definitive Rates refusal (`NOT_FOUND` `no_rate_price`/`no_rate_plan`, `VALIDATION_FAILED` for an unknown discount, `VALIDATION_FAILED` naming `ratePlanName`) is surfaced unchanged (traces to US-RES-1; `FR-RTE-1`, `FR-RTE-5`, `BR-13`, `BR-52`, `NFR-AVL-1`) | L1 acceptance: five unreadable shapes + four definitive shapes | **Pending** — `PA7`, `PA8`; the shape to copy is pinned at `internal/pricing/client.go:43-85`, `internal/pricing/client_test.go:61-84`, `internal/handler/handler_restrictions_test.go:65-99` and stays green |
| `AC-PRC-4` — Modify recomputes from the effective post-change type, dates, and discount, refuses a disagreement and an unreadable Pricing, surfaces a definitive refusal unchanged, keeps the stored row in every refusal, and records the price-basis change with actor and time (traces to US-RES-2; `FR-RES-2`, `FR-RTE-5`, `BR-2`, `BR-13`, `BR-52`, `NFR-AUD-1`) | L1 acceptance + audit row | **Pending** — `PA10`, `PA11`, `PA12`; the change-row half exists at `internal/store/store.go:472-476` / `internal/store/store_test.go:195-238` and stays green |
| `AC-PRC-5` — the guards cover the forged-low, forged-high, matching (including a legitimate zero), unreadable, and definitive callers plus the Modify reprice with its history row and actor; the #600 room charge still posts the frozen total and the `AC-RES-1`, `AC-RES-2`, `AC-DSK-13`, `AC-DSK-19`, `AC-CKO-1`/`AC-CKO-2` guards keep passing (traces to `NFR-AUD-1`) | L1 + audit + downstream + re-run | **Pending** — `PA1`–`PA12`, with the green half on the downstream-green row and the desk half in `PA13` |
| `FR-PRC-1` — the total a new reservation freezes is the Pricing quote, read for the effective type, dates, and discount with the caller's session forwarded; the stored discount name is the quote's applied name; the request value is compared and nothing more; an absent or negative basis still refuses `VALIDATION_FAILED` (section 26.3) | L1 acceptance | **Pending** — `PA3`, `PA4`, `PA5`; today's trust is pinned at `internal/service/service_test.go:46-61`, the desk pairing at `app/src/views/BookView.test.ts:626-673` |
| `FR-PRC-2` — a request total that disagrees is refused with `PRICE_CHANGED` naming both totals, type, and dates, and nothing is written (section 26.3) | L1 acceptance: the disagreement set + the no-write set | **Pending** — `PA1`, `PA2`; no guard on disk |
| `FR-PRC-3` — an unreadable Pricing refuses `UPSTREAM_UNAVAILABLE` (503) naming `rates`/`QuotePrice`, a definitive refusal is surfaced unchanged, and no stay is ever frozen at an unverified, invented, or assumed-zero total (section 26.3) | L1 acceptance: the two families kept apart | **Pending** — `PA7`, `PA8`; the fail-closed shape is `internal/pricing/client.go:43-85` |
| `FR-PRC-4` — Modify reprices on the same terms, records the price-basis change with actor and time, keeps the stored row in every refusal, keeps an omitted field's stored value, and treats an omitted/null discount name as no discount on the new quote (section 26.3) | L1 acceptance + audit row | **Pending** — `PA10`, `PA11`, `PA12`; `internal/store/store_test.go:195-238` stays green |
| `FR-PRC-5` — a stored booking is returned rather than re-quoted, the quote sits outside the guarded store step so the concurrency guards keep their bounds, the restriction check keeps its place and `STATE_ILLEGAL` terms, and every refusal writes nothing (section 26.3) | L1 acceptance + L3 pair | **Pending** — `PA6`, `PA9`; the pair `internal/store/store_test.go:40-79` and the replay `:95-115` stay green |
| `AC-DSK-20` (desk half) — on `PRICE_CHANGED` the Book screen re-reads the quote, shows the new total in one plain sentence, and books only on a second `Confirm`; a failed re-read books nothing and says so, reusing the no-price wording; an unreadable Pricing keeps the displayed quote and the plain panel error; a matching total changes nothing (Refs #632; traces to US-RES-1; `FR-RES-1`, `FR-RTE-5`, `BR-13`) | L1 desk acceptance + catalogue | **Pending** — `PA13`, `PA14` (the new key); the flow it builds on is pinned at `app/src/views/BookView.test.ts:576-624`, `:626-673`, `:1069-1227`, `:1228-1338` |
| Downstream and desk stays green (`AC-RES-1`, `AC-RES-2`, `AC-DSK-13`, `AC-DSK-19`, `AC-CKO-1`/`AC-CKO-2`, and the #600 room charge) | Behaviour check: the booking read, the modify read, the quote display, the check-out room charge, and the settlement gate keep their words and calls, and the charge posts the frozen total | **Covered by re-run** — `app/src/views/BookView.test.ts:466`, `:576-624`, `:626-673`, `:1069-1227`, `:1228-1338`, `app/src/views/StayView.test.ts:1308`, `:1391`, `:1458`, `:1528`, `:1582`, `:1750`, `:1949`, `:2040`, `app/src/views/desk-edge-guards.test.ts`, `app/e2e/stay.spec.ts`, `app/e2e/design-facts.spec.ts`; these must pass unchanged after the implementation PR — a behaviour edit in one of them fails the row |
| Contract and LC | A real delta: `PRICE_CHANGED` (409) added to the envelope enum and status mapping (`UPSTREAM_UNAVAILABLE` 503 is already registered by #627), advisory `priceBasis` wording plus the `PRICE_CHANGED` (409) entry in both operation manifests, the byte-identical OpenAPI mirror, and the two new fixtures, with no version bump (`CreateReservation` `1.2` / `ModifyReservation` `1.1` already landed with #716) | **Pending gate** — `contracts/errors/envelope.json`, `contracts/http/CreateReservation.json`, `ModifyReservation.json`, `contracts/openapi.yaml`, `frontend/docs/openapi.yaml`, `services/reservations/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; `PA14` is the guard, and an unregistered code or a drifted mirror is a re-tier finding (LLD 25.7) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-RES-1`, `FR-RES-2`, and `FR-RTE-5` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`PA-E1`) | The forged-low and unreadable-Pricing reproductions are recorded from a lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/632/README.md` and the `test-report.md` row are created by the implementation PR; the reproduction is also recorded in that PR's body or an issue comment |

Slice coverage (Refs #632): 15 rows mapped to `AC-PRC-1`..`AC-PRC-5`,
`AC-DSK-20`, `FR-PRC-1`..`FR-PRC-5`, and the gate boxes. One row is
covered by re-run today (the downstream-and-desk-green row, whose pins
exist and pass and must keep passing untouched); fourteen are
**pending** the implementation PR — the eleven
condition/requirement rows whose guards are the registry
`PA1`–`PA14`, the contract/LC gate, the MVP no-change gate, and
`PA-E1`. The slice is **not complete** at this spec head; it completes
when the implementation PR merges with `PA1`–`PA14` green, the
section 2 pins unchanged, `PA-E1` recorded, and `qa-lead` re-pins the
rows at the merged head. The MVP Coverage line below stands unchanged
at 57/57.

## 18. Reservation availability derivation slice (Refs #631)

Behaviour slice for the booking availability path: the overbooking
guard's ceiling is the capacity the hotel records for the room type
and stay dates (Rooms `totalCount` less `blockedRooms`), read
server-side once per create or modify attempt, never the
`sellableUnits` the request carries. The request field stays in both
contracts as advisory input; an unreadable capacity source refuses
the booking fail-closed with `UPSTREAM_UNAVAILABLE` (503); the guard
keeps its single-critical-section atomic shape. `CreateReservation`
moves 1.1 -> 1.2 and `ModifyReservation` 1.0 -> 1.1 (optional,
advisory field; new 503 error row). No schema, stored-value, event,
desk-panel, catalogue, or MVP-capability change is involved, and no
schema or data migration exists in either direction. Tier T3
(`architect`'s ADR-0006 and LLD
[section 26](../architecture/lld.md); `product-owner` conditions in
[acceptance-criteria.md section 19](../product/acceptance-criteria.md);
`business-analyst` requirements in
[mvp-requirements.md section 27](../requirements/mvp-requirements.md)).

Each row traces `AC-OVB-1`..`AC-OVB-3` (owned by `product-owner`),
the behaviour-scoped requirements `FR-OVB-1`..`FR-OVB-4` (owned by
`business-analyst`), the unchanged MVP rows `FR-RES-1`, `FR-RES-2`,
`FR-RTE-2`, and `NFR-CON-1`, and business rules `BR-47`..`BR-49`
([business-rules.md](../requirements/business-rules.md)). The owner
cases `AVD-1`..`AVD-10`, the guard registry `O1`–`O13`, and the
evidence rule `OR-1` live in
[availability-derivation-test-traceability.md](availability-derivation-test-traceability.md)
sections 3, 4, 6, and 7. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

Every `file:line` in the existing pins was re-read at the #631
implementation head; the request-fed pins were rewritten in place with
a `#631` note, never deleted, and
[availability-derivation-test-traceability.md](availability-derivation-test-traceability.md)
section 2 carries the re-pinned table. `O1`–`O11` and `O13` were
missing at the spec head and are **created by the implementation PR**
(`O12`, the desk re-run, exists throughout and must stay unchanged).
The rows stay `pending` until that PR merges, passes, and `qa-lead`
re-pins them at the merged head; the slice is **not complete** until
then.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-OVB-1` — the guard decides on the recorded capacity, not the request's `sellableUnits`: inflated buys nothing, low or absent refuses nothing, the Nth overlapping confirmed reservation is the last accepted, the next refuses `CONFLICT` naming type and dates and writes nothing; a modification into sold-out capacity refuses with the reservation unchanged; a recorded capacity of zero is that same sold-out `CONFLICT`, never a fail-closed `UPSTREAM_UNAVAILABLE`; a cancelled, no-show, or closed reservation releases its held unit exactly as today, so freed capacity becomes sellable again, while a checked-in row keeps holding its unit exactly as today, because the in-house share of a room type must not be subtracted from the recorded capacity twice (`BR-47`) (Refs #631; traces to US-RES-1, US-RES-2; `FR-RES-1`, `FR-RES-2`, `FR-RTE-5`, `NFR-CON-1`) | L1 acceptance, both directions, plus L3 pairing | **Pending** — `O1`, `O2`, `O3`, `O4`, `O8`, `O10`; re-pinned pins: `store_test.go:32-70`, `:671-`, `:702-`, `handler_test.go:72-104`, `handler_availability_test.go:72-` |
| `AC-OVB-2` — an unreadable capacity source refuses fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming the upstream and the operation, nothing written, no earlier read reused, no request number as fallback; a 4xx envelope is surfaced unchanged; an unwired client refuses the same way | L1 acceptance + fail-closed check | **Pending** — `O6` (transport, timeout, 5xx, unparseable, unwired), `O7` (4xx pass-through); the code precedent is `pricing/client.go:88-96` and the test pattern `client_test.go:61-84` |
| `AC-OVB-3` — two simultaneous last-unit requests yield exactly one winner and one `CONFLICT`, the capacity read on the attempt and the count-and-insert in one critical section; a replay returns the original and consumes no second unit; the desk Book flow, its pre-check, its request, and its refusal sentences stay as they are | L1 + L3 paired concurrency + desk re-run | **Pending** for the service half (`O8`, `O9`); **covered by re-run** for the desk half (`O12`) |
| `FR-OVB-1` — the ceiling is the capacity the hotel records for the room type and dates; the request's number can neither raise nor lower it (mvp-requirements section 27.3) | L1 acceptance, inflated and low/absent | **Pending** — `O1`, `O2` (inflated), `O3` (low, absent, malformed), `O11` (Postgres parity) |
| `FR-OVB-2` — a modification is decided on the same ceiling and refuses without changing the reservation: previous dates, type, guest, and price kept, no change-history entry | L1 acceptance | **Pending** — `O4`, `O11`; existing pin `store_test.go:253-315` proves the pairing on the derived ceiling |
| `FR-OVB-3` — an unreadable capacity source refuses fail-closed 503 naming upstream and operation and writes nothing; a 4xx envelope is surfaced unchanged; a readable zero capacity is a sold-out `CONFLICT`, never a 5xx | L1 acceptance + fail-closed | **Pending** — `O5`, `O6`, `O7` (created by the implementation PR) |
| `FR-OVB-4` — the guard stays atomic and a replay consumes no second unit: capacity read on the attempt, the request's number never in the comparison, count-and-insert in one critical section | L1 + L3 paired concurrency | **Pending** — `O8`, `O9`, `O11`; existing pins `store_test.go:32-70`, `:87-105`, `:253-315`, `postgres_test.go:106-135` keep the one-winner and replay assertions on the derived ceiling |
| `BR-47` — the overbooking ceiling is the recorded capacity for the type and dates; a request value neither raises nor lowers it; cancelled, no-show, and closed reservations release their hold, a checked-in one keeps it | L1 acceptance + counted-state check | **Pending** — `O1`–`O5`, `O10`; existing pins `store_test.go:318-344`, `:384-417` prove the releases today |
| `BR-48` — the capacity is read on every attempt and never cached or inferred; an unreadable source refuses fail-closed 503 and nothing is written; a 4xx envelope is surfaced unchanged; a zero capacity is a sold-out `CONFLICT` | L1 acceptance + fail-closed | **Pending** — `O5`, `O6`, `O7` (created by the implementation PR) |
| `BR-49` — the guard keeps its atomic shape, so two simultaneous last-unit requests yield one winner and one `CONFLICT`, and a replay takes no second unit | L1 + L3 paired concurrency | **Pending** — `O8`, `O9`, `O11` |
| Desk flows stay green (`AC-DSK` Book slice, `FR-RES-1`, `FR-RES-2`, `AC-OVB-3`) | Behaviour check: the desk's own booking still passes and shows the same lines, and every desk pin passes unchanged | **Covered by re-run** — `app/src/views/BookView.test.ts:556`, `:770`, `:919`, `:1093`, `:1158`, `app/e2e/book.spec.ts:51`, `:102`, `script/e2e-desk-loop.sh:299`, `:332`; a desk edit in the implementation PR fails the row |
| Contract and LC | Re-run only: `CreateReservation` 1.2 and `ModifyReservation` 1.1 keep the now-advisory field, add `NOT_FOUND` (404, an unknown room type surfaced from Rooms) alongside `UPSTREAM_UNAVAILABLE` (503), the existing fixtures stay valid, and the Reservations -> Rooms `CheckRoomTypeSellability` seam passes the per-module contract stage | **Pending gate** — `O13`: `contracts/http/CreateReservation.json`, `contracts/http/ModifyReservation.json`, `contracts/errors/envelope.json:9`, `:27`, `services/reservations/contract-tests/*.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; the contract edit is `architect`'s (ADR-0006 D6) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-RES-1`, `FR-RES-2`, `FR-RTE-2`, `NFR-CON-1` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice |
| Evidence cross-reference (`OR-1`) | The inflated-input and unreadable-capacity pairs are recorded before/after, and the slice is recorded in the test report | **Pending** — `O2` and `O6` are the payloads as guards; the implementation PR records `docs/testing/evidence/631/README.md` and the `test-report.md` row |

Slice coverage (Refs #631): 14 rows mapped to `AC-OVB-1`..`AC-OVB-3`,
`FR-OVB-1`..`FR-OVB-4`, and `BR-47`..`BR-49`. One row is covered by a
gate re-run today (the desk-green row, whose pins exist and pass and
must keep passing untouched); thirteen are **pending**
the implementation PR's merge and `qa-lead`'s re-pin — the ten
condition and rule rows whose guards are the registry `O1`–`O11`, the
contract/LC gate, the MVP no-change gate, and `OR-1`. The slice is **not complete** at this spec head; it
completes when the implementation PR merges with `O1`–`O11` and `O13`
green, the desk pins unchanged, `OR-1` recorded, and `qa-lead` re-pins
the rows at the merged head. The MVP Coverage line below stands
unchanged at 57/57.

## 20. Folio write verification slice (Refs #634)

Security slice for audit finding B1 (the #625 class: a client-supplied
identifier decides a money outcome). Billing creates a folio for any
UUID `stayId` it is handed, with no Stay read
(`services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:65-71`),
so a charge, a payment, or an open-balance approval can be written
against a stay that does not exist or is already closed. The slice makes
every folio write verify the stay through the registered C8 `GetStayRef`
read first, fail closed with `UPSTREAM_UNAVAILABLE` (503) when Stay
cannot be read, keep the provider's `NOT_FOUND` / `STATE_ILLEGAL`
refusals, and keep a folio Billing already holds readable in every stay
state. No new operation, field, lifecycle state, event, schema,
migration, or MVP capability is added. Tier T3 (LLD
[section 27](../architecture/lld.md);
[ADR-0008](../architecture/decisions/adr-0008-folio-write-stay-verification.md),
`accepted` 2026-11-26; `product-owner` scope in
[acceptance-criteria.md section 20](../product/acceptance-criteria.md)
and [desk-ui-design-rollout.md section 6.21](../product/desk-ui-design-rollout.md);
`business-analyst` requirements in
[mvp-requirements.md section 28](../requirements/mvp-requirements.md)).

Each row traces `AC-FWV-1`..`AC-FWV-7` (owned by `product-owner`) and
the behaviour-scoped requirements `FR-FWV-1`..`FR-FWV-5` (owned by
`business-analyst`), plus business rules `BR-50` / `BR-51`
([business-rules.md](../requirements/business-rules.md)). The owner
cases `FWV-1`..`FWV-10`, the guard registry `FW1`–`FW13`, and the
evidence rule `FW-E1` live in
[folio-write-verification-test-traceability.md](folio-write-verification-test-traceability.md)
sections 3, 4, 6, and 7. Like the slices above, these rows add no MVP
capability: the 57-row MVP coverage count stands unchanged and no MVP
row may cite this slice as its guard.

The section number follows the stack allocation: sections 17 and 18
belong to sibling spec stacks landing alongside this one. Every
`file:line` in the existing pins was read at this spec head (the stack's
requirements commit; the code tree is identical to `origin/master` at
`464b864`, because the sibling spec PRs touch `docs/` only). Those pins
prove today's behaviour — `ensureFolio` creates a folio for any uuid and
no Billing Stay client exists — and the implementation PR extends them
in place, with a `#634` note, never deleting one. All `FW1`–`FW13`
guards are **missing at this spec head** and created by the
implementation PR; a row is complete only when that PR lands, passes,
and `qa-lead` re-pins it at the merged head. The slice is therefore
**not complete** at this spec head.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-FWV-1` — a charge, a payment, or an open-balance approval against a stay id that names no stay is refused `NOT_FOUND` (404) naming the stay, and nothing is written: no folio row, no line, no balance movement, no recorded approval, no outbox event — the same on all three writes, on a repeated request, and with or without an idempotency key (traces to US-BIL-1/2/3/7; `FR-BIL-1/2/3/7`, `FR-FWV-1`, `BR-51`) | L1 acceptance: the three writes, the zero-write call list, the repeat and key cases | **Pending** — `FW2`, `FW1`, `FW9`, `FW10`; today's opposite is `BillingRepository.java:65-71` reached from `BillingService.java:121`, `:142`, `:176`, `:264` |
| `AC-FWV-2` — a write against a stay Stay reports outside `in-house` is refused `STATE_ILLEGAL` (422) naming the stay and state, whether or not a folio exists; an existing folio keeps exactly its lines and balance, no event is emitted, and its invoice still matches (traces to US-BIL-1/2/3/7; `FR-BIL-1/2/3/7`, `FR-FWV-3`, `BR-24`, `BR-51`) | L1 acceptance: the three writes, with and without an existing folio, replay after the close | **Pending** — `FW3`, `FW1`, `FW9`, `FW10`; the provider refusal is pinned at `services/stay/src/store.ts:416-421` and `services/stay/src/server.test.ts:330-348` |
| `AC-FWV-3` — a Stay that cannot be read refuses the route fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming the upstream and the operation, creating and writing nothing, with a retried call after recovery committing once; a `4xx` envelope surfaces unchanged, so a rejected session reads `UNAUTHENTICATED` and never as an outage (traces to US-BIL-1/2/3/7; `FR-BIL-1/2/3/7`, `FR-FWV-4`, `BR-51`) | L1 acceptance: the five unreadable classes plus the `401` and wrong-id split | **Pending** — `FW4`, `FW5`, `FW9`, `FW10`; the answer table is LLD 27.2 and the fail-closed precedent is `services/reservations/internal/pricing/client.go:88-96` |
| `AC-FWV-4` — a verified in-house stay with no folio still gets its folio on the first balance read (one folio, zero balance, acting account recorded, plain no-lines sentence), and a charge, payment, or approval for it commits as today with the same line, balance movement, and outbox event (traces to US-BIL-1/2/3/7; `FR-BIL-1/2/3/7`, `FR-FWV-5`, `BR-21`, `BR-23`, `BR-50`) | L1 acceptance: folio creation plus the three writes' success shape | **Pending** — `FW6`; today's success behaviour is pinned at `BillingServiceTest.java:71-84`, `:148-198`, `:211-261` and must stay green untouched |
| `AC-FWV-5` — a stay that already carries a folio is served from Billing in every stay state, so the departure invoice and each receipt still print and still match; a folio-less stay that is not in house is refused `NOT_FOUND` / `STATE_ILLEGAL` and creates nothing (traces to US-BIL-1/4; `FR-BIL-1`, `FR-BIL-4`, `FR-FWV-5`, `BR-24`) | L1 acceptance: no stay read on an existing folio, the closed-stay print pair, the folio-less refusal | **Pending** — `FW7` and `FW3`, with the desk pins `app/src/views/PrintView.vue:1028`, `:1120`, `:1157` and `app/src/views/PrintView.test.ts:273-342`, `:724-756` green unchanged |
| `AC-FWV-6` — every refusal renders as one plain sentence in the active locale naming what was refused and that nothing was recorded (unknown stay, closed stay, unreadable Stay with a retry that can help), with no code, status, trace, or invented amount, the fields usable, the rest of the desk working, the existing sentences unchanged, both catalogues carrying the keys, and the catalogue gate green (traces to US-BIL-1/2; `FR-BIL-1`, `FR-DSP-3`, `NFR-I18N-1`) | L1 acceptance: three sentences × two locales plus the no-code and usable-field assertions | **Pending** — `FW10`, `FW11`; the fallback replaced is `app/src/views/FolioView.vue:566-575` and the existing sentence is `:944-962` |
| `AC-FWV-7` — guards cover the unknown-stay, closed-stay, and unreadable-Stay callers for each write and for the folio-creating read, plus both regression paths; the only new call is the registered C8 read, one hop, so the close path stays bounded; `UPSTREAM_UNAVAILABLE` is registered in the envelope; and the existing gate guards stay green unchanged (evidence condition; no behaviour change) | L1 + LC + behaviour re-run | **Pending** — `FW1`–`FW13` and `FW-E1`; the green half is the desk-green row below, the registration is `FW12`, and the one-hop bound is `FW8` |
| `FR-FWV-1` — every folio write verifies the stay before the claim and before any row, whether or not the folio exists, with the caller's session forwarded; only an in-house answer proceeds; a replay is served only from a verified in-house stay (section 28.3) | L1 acceptance + ordering assertion | **Pending** — `FW1`, `FW2`, `FW3`, `FW4`, `FW7` |
| `FR-FWV-2` — an unknown stay is refused `NOT_FOUND` (404) naming it and nothing is written on any of the three writes, on a repeat, and with or without a key; a `NOT_FOUND` naming a different stay is a wiring fault that takes the fail-closed answer (section 28.3) | L1 acceptance + the wrong-id split | **Pending** — `FW2`, `FW4`, `FW9` |
| `FR-FWV-3` — a stay outside `in-house` is refused `STATE_ILLEGAL` (422) naming the stay and state, with or without an existing folio, and nothing is written; an existing folio keeps its lines and balance; a retry of a committed write after the close is refused while the recorded line stays (section 28.3) | L1 acceptance: the folio and no-folio pair plus the replay case | **Pending** — `FW3`, `FW1`, `FW9` |
| `FR-FWV-4` — an unreadable Stay refuses the route `UPSTREAM_UNAVAILABLE` (503) naming `stay` and `GetStayRef` and writes nothing; a `401`/`403`/other `4xx` envelope surfaces unchanged; an unread Stay is never replaced by a cached or assumed state; once Stay answers, the retried call commits once and not twice (section 28.3) | L1 acceptance: the unreadable set plus the surface-unchanged and retry cases | **Pending** — `FW4`, `FW5`, `FW9`; `FW7` proves the read split does not widen the outage to an existing folio |
| `FR-FWV-5` — a folio Billing already holds stays readable in every stay state without a stay read; a folio-less in-house stay still creates its one zero-balance folio as today; a folio-less unknown, outside-`in-house`, or unreadable stay refuses with the same answer and writes nothing (section 28.3) | L1 acceptance + the no-stay-read assertion | **Pending** — `FW7`, `FW6`, `FW3`, `FW4` |
| `AC-FWV-3` / `AC-FWV-5` disposition (the folio-creating read versus the existing-folio read) | The gate sees the reading and the guard that proves it: `AC-FWV-5` settles the existing-folio read while `AC-FWV-3`'s balance-read clause binds the folio-creating read (LLD 27.2, requirements 28.5) | **Pending** — `FW7` is the guard and the only outstanding obligation on the row; `product-owner` confirms the reading at the spec gate |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the room charge, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run at this spec head** — `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `:2152-2194`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/FolioView.test.ts:181-430`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh:363-418`. These must pass unchanged after the implementation PR; a flow edit fails the row |
| Contract and LC | Real delta: the four folio operations gain `NOT_FOUND`, `STATE_ILLEGAL`, and `UPSTREAM_UNAVAILABLE` and a minor bump, the envelope registers the code and `503`, `GetStayRef` is unchanged, and both check scripts stay green | **Pending gate** — `FW12`; the files are `contracts/http/GetFolioBalance.json`, `PostCharge.json`, `RecordPayment.json`, `RecordOpenBalanceApproval.json`, `GetStayRef.json`, `contracts/errors/envelope.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, or event change here is a re-tier finding (LLD 27.7, 27.9) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-BIL-1`, `FR-BIL-2`, `FR-BIL-3`, and `FR-BIL-7` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard (requirements 28.2) |
| Evidence cross-reference (`FW-E1`) | The finding is reproduced from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/634/README.md` and the `test-report.md` row are created by the implementation PR; the reproduction is also stated in that PR's body or an issue comment |

Slice coverage (Refs #634): 17 rows mapped to `AC-FWV-1`..`AC-FWV-7`,
`FR-FWV-1`..`FR-FWV-5`, the `AC-FWV-3` / `AC-FWV-5` disposition, and
the gate boxes. One row is covered by re-run today (the desk-green row,
whose pins exist and pass and must keep passing untouched); sixteen are
**pending** the implementation PR — the twelve condition/requirement
rows whose guards are the registry `FW1`–`FW13`, the disposition row,
the contract/LC gate, the MVP no-change gate, and `FW-E1`. The slice is
**not complete** at this spec head; it completes when the implementation
PR merges with `FW1`–`FW13` green, the pins unchanged, `FW-E1` recorded,
and `qa-lead` re-pins the rows at the merged head. The MVP Coverage line
below stands unchanged at 57/57.

## 21. Backend fault vocabulary slice (Refs #627)

Traceability for the #627 internal-error change (audit finding C1): a
Node service answered an unexpected exception with HTTP 500 and the
refusal code `VALIDATION_FAILED`, so a store or driver failure read to
the desk as bad input. The done-conditions are
`docs/product/acceptance-criteria.md`
[section 21](../product/acceptance-criteria.md) (`AC-ERR-1`..`AC-ERR-5`),
the requirements `FR-ERR-1`..`FR-ERR-3` are
`docs/requirements/mvp-requirements.md`
[section 29](../requirements/mvp-requirements.md), the business rule is
`BR-59` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), the contract
and taxonomy delta is LLD [section 28](../architecture/lld.md) with
[section 1 of the taxonomy](../technical/error-handling.md), and the
guard registry `ERR1`–`ERR9` plus the evidence rule `ERR-E1` are
`internal-error-envelope-test-traceability.md`
[the testing spec](internal-error-envelope-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-ERR-1` — an unexpected exception in any operation of Stay, Guests, Rooms, or Admin answers HTTP 500 with the shared envelope, `code` equal to `INTERNAL_ERROR` and never `VALIDATION_FAILED`, the plain unexpected-failure sentence with no driver, SQL, host, path, or stack-trace text, no invented `details` field, and a `traceId` present, with the next request answered normally (traces to `FR-ERR-1`, `FR-DSP-3`, `NFR-I18N-1`, `NFR-AUD-1`) | L1 acceptance: one non-`HttpError` fault case per service plus the next-request control | **Pending** — `ERR1`–`ERR4`; today's opposite is the literal at `services/stay/src/server.ts:81`, `guests/src/server.ts:52`, `rooms/src/server.ts:52`, `admin/src/server.ts:60` |
| `AC-ERR-2` — the contract lists `INTERNAL_ERROR` (500), `UPSTREAM_UNAVAILABLE` (503), and `METHOD_NOT_ALLOWED` (405) in its `code` enum and `statusMapping`, the taxonomy describes all three, every served or derived copy matches the single source under `contract-check`, and each of the four Node maps accepts the three tokens at those statuses with `IDENTITY_LOCKED` staying admin-only (traces to `FR-ERR-2`, ADR-0004 D1) | L1 + LC: four-map conformance, the no-drift pair, the contract-sync walk, both check scripts | **Pending** — `ERR5`, `ERR6`, `ERR9`; the enum is `contracts/errors/envelope.json:9`, the mapping `:16-28`, and the four maps are `services/{stay,guests,rooms}/src/errors.ts:4-21` and `services/admin/src/errors.ts:4-23`. The contract half is already on disk, so Admin's contract-sync walk (`services/admin/src/errors.test.ts:25-29`) is red at this head until `ERR5` lands |
| `AC-ERR-3` — every existing refusal keeps its code and status (`VALIDATION_FAILED` 400, `UNAUTHENTICATED` 401, `IDENTITY_LOCKED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `SETTLEMENT_REQUIRED` 409, `STATE_ILLEGAL` 422, `UPSTREAM_UNAVAILABLE` 503), nothing is reclassified as an internal error, and `AC-FDK-2`, `AC-CKO-1`, and `AC-CKO-2` hold as written (traces to `FR-ERR-3`) | L1: the refusal pins re-run with no assertion moved | **Covered by re-run** — `ERR7`; the pins are `services/stay/src/server.test.ts:48-56`, `:147-163`, `guests/src/server.test.ts:43-51`, `:139-163`, `rooms/src/server.test.ts:50-66`, `admin/src/server.test.ts:51-57`, `:103-108`, and the 503 meaning is `services/reservations/internal/service/service.go:76-83` |
| `AC-ERR-4` — each of the four Node services carries a guard that drives its unexpected-exception path with a failure that is not an `HttpError` and asserts HTTP 500, a JSON reply, the four envelope keys, and `code: "INTERNAL_ERROR"` — never `VALIDATION_FAILED` — plus a guard pinning that no service emits a code outside the contract enum, with `contract-check` and the Admin contract-sync guard green (evidence condition; no behaviour change) | L1 + LC + evidence record | **Pending** — `ERR1`–`ERR4`, `ERR5`, `ERR6`, `ERR9`, `ERR-E1` |
| `AC-ERR-5` — every desk screen and print surface behaves exactly as today for these answers: the plain request-failed sentence for a failed read, the unreadable-outcome rule for a `5xx`, the existing refusal sentences for `4xx`, no rendered token, no new catalogue key, no route, layout, or print change (traces to `FR-DSP-3`, `NFR-I18N-1`) | Behaviour re-run: desk suites, no-leak guard, catalogue gate | **Covered by re-run** — `ERR8`; pins are `app/src/views/desk-edge-guards.test.ts:41-46` (with `:621`, `:687`), `app/src/views/RoomsView.vue:677-681`, `app/src/api/client.ts:164`, `:195`, `messages/en.json:7`, `messages/vi.json:7` |
| `FR-ERR-1` — an unexpected failure answers `INTERNAL_ERROR`, never `VALIDATION_FAILED`, with the four-field envelope, the plain sentence, empty `details`, a present `traceId`, a normal next request, the same answer on a retry, and every named refusal keeping its own code and status (section 29.3) | L1 acceptance: per-service fault case with the envelope-shape and refusal-split assertions | **Pending** — `ERR1`–`ERR4`, `ERR7`, `ERR8` |
| `FR-ERR-2` — the codes a service serves are the contract's one vocabulary: the enum and mapping register the three tokens, the taxonomy describes them, each of the four maps accepts them at those statuses, both gates pass, and a later added code moves the maps in the same change (section 29.3) | L1 + LC: four-map conformance, no-drift, contract-shape gates | **Pending** — `ERR5`, `ERR6`, `ERR9` |
| `FR-ERR-3` — every existing refusal keeps its code, status, `message`, and `details`; a refusal and a fault on the same operation never share a token; the earlier refusal conditions hold; a Node service keeps `404 NOT_FOUND` for a wrong method or unknown operation and `405` stays unreachable from Node (section 29.3) | L1 acceptance: refusal re-run plus the wrong-method and unknown-operation pair | **Covered by re-run** — `ERR7` and the `HttpError` positive control inside `ERR1`–`ERR4` |
| `BR-59` — a failure the system did not plan for is reported as an internal fault, never as bad input from the person at the desk; `VALIDATION_FAILED` keeps its meaning only; the answer keeps the four fields, reads as one plain catalogue sentence with no driver, SQL, host, path, or stack-trace text, and carries a correlation id; the code vocabulary is the contract's single enum (business rules) | L1 acceptance + evidence: the fault answer in every service, the sentence, the correlation id, and the lab reproduction | **Pending** — `ERR1`–`ERR4`, `ERR8`, `ERR-E1`; today's breach is reached from `services/stay/src/pgstore.ts:205-219` on a store failure |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run** — `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/desk-edge-guards.test.ts:621`, `:687`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh`; a flow edit fails the row |
| Contract and LC | Real delta: the envelope registers three codes in enum and mapping, the four maps follow, the taxonomy describes them, both check scripts stay green, and no `contracts/http/` operation changes | **Pending gate** — `ERR9`; the files are `contracts/errors/envelope.json`, `docs/technical/error-handling.md`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, envelope-field, or event change here is a re-tier finding (LLD 28.3) |
| MVP no-change statement | No new MVP row, story, or FR/NFR id; `BR-59` is the only added rule | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard (requirements 29.2) |
| Evidence cross-reference (`ERR-E1`) | The finding is reproduced from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/627/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #627): 13 rows mapped to `AC-ERR-1`..`AC-ERR-5`,
`FR-ERR-1`..`FR-ERR-3`, `BR-59`, the desk-green row, and the gate boxes.
Three rows are covered by re-run today (`AC-ERR-3`, `AC-ERR-5`,
`FR-ERR-3` — their pins exist and pass and must keep passing untouched);
ten are **pending** the implementation PR — the rows whose guards are the
registry `ERR1`–`ERR9`, the `BR-59` evidence row, the desk-green row, the
contract/LC gate, the MVP no-change gate, and `ERR-E1`. The slice is
**not complete** at this spec head; it completes when the implementation
PR merges with `ERR1`–`ERR9` green, the pins unchanged, `ERR-E1`
recorded, and `qa-lead` re-pins the rows at the merged head. The MVP
Coverage line below stands unchanged at 57/57.

## 22. Request-body bounds and server timeouts slice (Refs #630)

Traceability for the #630 transport-bounds change (audit finding C5):
no backend service bounded a request body and no server declared its own
timeouts, so one oversized body or one slow peer could exhaust the
on-premise host or hold a worker indefinitely. The done-conditions are
`docs/product/acceptance-criteria.md`
[section 22](../product/acceptance-criteria.md) (`AC-BND-1`..`AC-BND-5`),
the requirements `NFR-BND-1`..`NFR-BND-3` are
`docs/requirements/mvp-requirements.md`
[section 30](../requirements/mvp-requirements.md), the business rule is
`BR-60` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), the
enforcement point, refusal shape, timeout values, and per-flow diagram
are LLD [section 29](../architecture/lld.md), and the guard registry
`BND1`–`BND28` plus the evidence rule `BND-E1` are
`body-bounds-test-traceability.md`
[the testing spec](body-bounds-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-BND-1` — any request body above 65 536 bytes is refused with exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming `body`, the plain too-large sentence, a `traceId`) in each of Stay, Guests, Rooms, Admin, Reservations, Rates, Reporting, and Billing; the body is never parsed, the operation never runs, nothing is written, and the surplus is never accumulated in full (traces to `NFR-BND-1`, `BR-60`) | L1 acceptance: one over-limit case per service plus the no-operation evidence and the boundary pair | **Pending** — `BND1`–`BND8`; today's opposite is the uncapped `readBody` at `services/stay/src/server.ts:10-35` (and `guests`, `rooms`:10-35, `admin`:9-34), `decodeBody` at `services/reservations/internal/handler/handler.go:43-66` (and `rates`, `reporting`), and the Billing `@RequestBody` binding at `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:76` |
| `AC-BND-2` — each service declares its ceiling once as a named constant of 65 536 bytes; no environment variable, deployment file, runbook step, or per-hotel setting carries or overrides it; the refusal adds no code token, and the contract enum, mapping, four Node maps, and Billing handler keep exactly today's codes (traces to `NFR-BND-2`, ADR-0004 D1) | L1: the constant assertion inside each body guard; LC: the contract gate; diff gate: no configuration source | **Pending** — the constant clause of `BND1`–`BND8`, `BND25`, `BND27`; the contract baseline is `contracts/errors/envelope.json:9`, `:16-28` and the maps are `services/stay/src/errors.ts:16-27` / `admin:14-26` |
| `AC-BND-3` — every server carries an explicit header-read, body-read, response-write, and idle bound, none zero or unset — the Go servers' `ReadHeaderTimeout`/`ReadTimeout`/`WriteTimeout`/`IdleTimeout`, the Node servers' four properties, and Billing's connector and keep-alive settings — sized above the 5-second pricing read and the 2-second completion read (traces to `NFR-BND-3`, `NFR-PERF-1`, `NFR-AVL-1`) | L1: one value-reading guard per server, exact values, no sleeping test | **Pending** — `BND9`–`BND16`; today's bare servers are `services/stay/src/server.ts:74-75` (siblings `:45-46`, `admin:53-54`), `services/reservations/cmd/server/main.go:52` (Rates `:42`, Reporting `:34`), and `services/billing/src/main/resources/application.properties:1-8` |
| `AC-BND-4` — every body at or below 65 536 bytes behaves exactly as today (same status, code, message, `details`, and stored effect); a body at exactly 65 536 bytes is accepted and one byte more is refused; `contract-check` stays green with no contract file changed; the desk's screens, refusal sentences, routes, catalogue keys, and print rules are untouched, and `body` matches no desk branch (traces to `NFR-BND-1`, `FR-DSP-3`, `NFR-I18N-1`) | L1: the boundary pair inside every body guard; re-run: existing suites and fixtures; desk re-run | **Covered by re-run today for the existing answers, and pending for the boundary pair** — `BND26` and `BND28` pins exist and pass (`services/stay/src/server.test.ts:17` harness and the sibling suites; `app/src/views/desk-edge-guards.test.ts:41-46`; `contract-check` green), and the 65 536/65 537 pair is the `BND1`–`BND8` half |
| `AC-BND-5` — each of the eight services carries a guard that drives an over-limit body at its own ceiling with the refusal envelope and "no operation ran" evidence, plus the boundary pair; each server has a guard asserting its timeouts are explicit and non-zero; each service's catalogue guard pins the too-large sentence (evidence condition; no behaviour change) | L1 + evidence: 24 guards plus the record | **Pending** — `BND1`–`BND24` and `BND-E1` |
| `NFR-BND-1` — bodies are read under the declared ceiling and refused before any work: one HTTP 400 envelope, `VALIDATION_FAILED`, `details.field` `body`, the plain sentence, a fresh `traceId`, no surplus buffered, no truncated JSON parsed, no second answer; 65 536 served and 65 537 refused; the refusal names no byte count or internal name (requirements 30.3) | L1 acceptance: the per-service refusal and boundary cases; the re-run under-ceiling set | **Pending** — `BND1`–`BND8`, `BND17`–`BND24`, `BND26` |
| `NFR-BND-2` — the ceiling is one declared constant of 65 536 bytes in all eight services, never configuration; it is more than ten times the largest request schema (3 530 bytes); the refusal reuses `VALIDATION_FAILED` 400 and changes no contract file (requirements 30.3) | L1: per-service constant assertion; LC: contract gate; diff gate: no configuration source | **Pending** — the constant clause of `BND1`–`BND8`, `BND25`, `BND27` |
| `NFR-BND-3` — every server declares finite header-read, body-read, response-write, and idle bounds, none zero or unset; no in-ceiling call is cut off, including the 5-second pricing read and the 2-second completion read; a peer disconnected by a bound leaves no operation running and is promised no envelope (requirements 30.3) | L1: one value-reading guard per server, exact values | **Pending** — `BND9`–`BND16` |
| `BR-60` — a body above 65 536 bytes is the caller's mistake refused before any store, provider, or folio call with the shared envelope and a fresh correlation id; the ceiling is one code constant, never configuration; every server declares finite bounds sized above the longest legitimate provider wait; a timeout frees the connection without promising a refusal (business rules) | L1 acceptance + evidence: the eight refusals, the eight timeout guards, and the lab record | **Pending** — `BND1`–`BND16`, `BND27`, `BND-E1` |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run** — `BND28`; `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/desk-edge-guards.test.ts:621`, `:687`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh`; a flow edit fails the row |
| Contract and LC | Real delta: no contract file changes, no code token added, the four Node maps and the Billing handler keep their codes, and both check scripts stay green; no `contracts/http/` operation changes | **Covered by re-run today** — `BND25`; the files are `contracts/errors/envelope.json`, `services/*/src/errors.ts`, `services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, envelope-field, or event change here is a re-tier finding (LLD 29.5) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; the three `NFR-BND-*` are the only requirement additions | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard (requirements 30.2) |
| Evidence cross-reference (`BND-E1`) | The finding is reproduced from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/630/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #630): 13 rows mapped to `AC-BND-1`..`AC-BND-5`,
`NFR-BND-1`..`NFR-BND-3`, `BR-60`, the desk-green row, and the gate
boxes. Three rows are covered by re-run today (`AC-BND-4` for its
existing answers, the desk-green row, and the contract/LC gate — their
pins exist and pass and must keep passing untouched; the 65 536/65 537
boundary half of `AC-BND-4` is still pending), and the rest are
**pending** the implementation PR — the rows whose guards are the
registry `BND1`–`BND28`, the `BR-60` evidence row, the MVP no-change
gate, and `BND-E1`. The slice is **not complete** at this spec
head; it completes when the implementation PR merges with `BND1`–`BND28`
green, the pins unchanged, `BND-E1` recorded, and `qa-lead` re-pins the
rows at the merged head. The MVP Coverage line below stands unchanged at
57/57.

## 23. Money-amount bounds slice (Refs #635)

Traceability for the #635 money-amount change (audit finding B2):
Billing's `amountOf` helper accepted any JSON number and truncated it
with `longValue()`, so `amountMinor: 12.99` posted 12 with no refusal,
and no money adapter bounded the magnitude. The done-conditions are
`docs/product/acceptance-criteria.md`
[section 23](../product/acceptance-criteria.md) (`AC-AMT-1`..`AC-AMT-5`),
the requirements `NFR-AMT-1`..`NFR-AMT-4` are
`docs/requirements/mvp-requirements.md`
[section 31](../requirements/mvp-requirements.md), the business rule is
`BR-61` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), the ceiling,
enforcement point, refusal shape, and per-flow diagram are LLD
[section 30](../architecture/lld.md), and the guard registry
`AMT1`-`AMT20` plus the evidence rule `AMT-E1` are
`money-amount-bounds-test-traceability.md`
[the testing spec](money-amount-bounds-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-AMT-1` — a fractional or present non-number money value on `PostCharge`, `RecordPayment`, or `UpsertChargeItem` answers exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming that field, the `error.validation.amount_not_integer` sentence for a fractional number and the `error.validation.field_number` sentence for a present non-number value, a `traceId`), is never truncated, and writes nothing (traces to `NFR-AMT-1`, `BR-61`) | L1 acceptance: one fractional case and one present non-number case per money field plus the no-service-call evidence | **Pending** — `AMT1`-`AMT3`, `AMT15`, `AMT20`; today's opposite is `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:47-53` (the truncation at `:50`, the missing-field answer at `:52`) reached from `:86`, `:93`, `:129` |
| `AC-AMT-2` — a magnitude above 1 000 000 000 000 minor units on the same three fields answers the same envelope with `error.validation.amount_above_ceiling` carrying the ceiling and writes nothing; a huge negative is refused by this rule while an in-range negative keeps the service's sign refusal (traces to `NFR-AMT-2`, `BR-61`) | L1 acceptance: the over-ceiling pair per field, the boundary pair, and the sign pass-through | **Pending** — `AMT4`-`AMT8`, `AMT13`, `AMT19`; no bound exists at `BillingController.java:47-53` |
| `AC-AMT-3` — a whole amount inside the ceiling behaves exactly as today (same status, code, message, `details`, stored effect), including `0`, an idempotent replay, the tax/fee derivation, and `12.0` accepted as `12`; an amount at exactly the ceiling is accepted and one minor unit more is refused; `contract-check` stays green with no contract file changed (traces to `NFR-AMT-1`, `NFR-AMT-4`, `BR-61`) | L1: the boundary pair, the decimal-point case, and the in-range regression; re-run: existing suites and contract gate | **Covered by re-run today for the existing in-ceiling answers (`AMT17`), and pending for the boundary pair, the decimal-point case, and the explicit regression (`AMT8`-`AMT10`, `AMT16`)** — the existing answers are pinned at `BillingControllerTest.java:48`, `:63`, `:296` and `BillingServiceTest.java:71`, `:86` |
| `AC-AMT-4` — the percent adapter answers `field_number` naming `percent` for a present value it cannot read as a finite number, keeps a fractional percent such as `8.5` accepted, keeps the service's 0-100 `percent_range` refusal, and keeps `field_required` for an absent `percent` (traces to `NFR-AMT-3`, `BR-61`) | L1 acceptance: the four percent cases | **Covered by re-run today for the 0-100 and absent-field halves (`AMT12`, `BillingServiceTest.java:103`), and pending for the type split and the `8.5` acceptance (`AMT11`)** — today's type fall-through is `BillingController.java:63-64` |
| `AC-AMT-5` — each of the three money adapters carries a fractional guard, a present non-number guard, and an over-ceiling guard with "the service was never called" evidence, the percent adapter has its unreadable-value guard, the boundary pair exists, an in-range regression case exists per field, and the catalogue guard pins both new sentences (evidence condition; no behaviour change) | L1 + evidence: `AMT1`-`AMT7`, `AMT8`, `AMT10`, `AMT11`, `AMT14`, `AMT20`, and the record | **Pending** — `AMT1`-`AMT7`, `AMT10`, `AMT11`, `AMT14`, `AMT20`, `AMT-E1` |
| `NFR-AMT-1` — a money amount is a whole number of minor units refused before any work when it is not: one 400 envelope naming the field, never truncated, nothing written, an absent field still `field_required`, a present non-number value refused with `field_number`, and a whole value written with a decimal point accepted (requirements 31.3) | L1 acceptance: the three fractional cases, the three present non-number cases, the decimal-point case, and the catalogue sentence | **Pending** — `AMT1`-`AMT3`, `AMT9`, `AMT14`, `AMT15`, `AMT20` |
| `NFR-AMT-2` — every money amount is bounded by one declared ceiling of 1 000 000 000 000 minor units, the same for all three fields, below 2<sup>53</sup>, carried by no configuration source; an amount at the ceiling is accepted and one more refused, and a 730-night charge at the standard rate (65 700 000 000) is accepted (requirements 31.3) | L1: the constant assertion and the boundary pair; LC: contract gate; diff gate: no configuration source | **Pending** — `AMT4`-`AMT8`, `AMT7`, `AMT16`, `AMT19`; the shape to copy is `MaxBodySizeFilter.java:38` |
| `NFR-AMT-3` — the tax-rule percent is bounded as a number, never as money: an unreadable present value answers `field_number` naming `percent`, `8.5` stays accepted, the 0-100 range and the absent-field refusal keep their layer, and no money rule applies to a percent (requirements 31.3) | L1 acceptance: the percent cases plus the unedited service range case | **Pending** — `AMT11`, `AMT12` (the range half covered by re-run today) |
| `NFR-AMT-4` — every whole amount inside the ceiling behaves exactly as today, each money adapter carries its fractional, present non-number, and over-ceiling guards, the boundary pair and an in-range regression exist, the two catalogue sentences are pinned, `contract-check` stays green, and no desk surface changes (requirements 31.3) | L1 acceptance + re-run: the regression set, the catalogue guard, the contract gate, the desk suites | **Covered by re-run today for the existing answers and the desk (`AMT17`, `AMT18`, `AMT16`), and pending for the new guards and sentences (`AMT1`-`AMT14`, `AMT20`)** |
| `BR-61` — a money amount is a whole number of minor units bounded by one declared ceiling of 1 000 000 000 000 on every Billing money field; a fractional or over-ceiling value is refused with the shared envelope naming the field before any service, store, provider, or folio call, writes nothing, and leaves no idempotency record or outbox event; in-ceiling amounts behave as today; the ceiling is one code constant and the percent is bounded as a number (business rules) | L1 acceptance + evidence: the three fractional cases, the three over-ceiling cases, the boundary pair, and the lab record | **Pending** — `AMT1`-`AMT15`, `AMT19`, `AMT-E1`; today's breach is `BillingController.java:50` |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run** — `AMT18`; `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/desk-edge-guards.test.ts:621`, `:687`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh`; a flow edit fails the row |
| Contract and LC | Real delta: no contract file changes, no code token added, the envelope keeps its four fields, and both check scripts stay green; no `contracts/http/` operation changes | **Covered by re-run today** — `AMT16`; the files are `contracts/errors/envelope.json`, `contracts/http/PostCharge.json`, `RecordPayment.json`, `UpsertChargeItem.json`, `services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, envelope-field, or event change here is a re-tier finding (LLD 30.5, 30.7) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; the four `NFR-AMT-*` are the only requirement additions | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard (requirements 31.2) |
| Evidence cross-reference (`AMT-E1`) | The finding is reproduced from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/635/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #635): 14 rows mapped to `AC-AMT-1`..`AC-AMT-5`,
`NFR-AMT-1`..`NFR-AMT-4`, `BR-61`, the desk-green row, and the gate
boxes. Three rows are covered by re-run today (the desk-green row, the
contract/LC gate, and the existing in-ceiling answers named inside
`AC-AMT-3`, `AC-AMT-4`, and `NFR-AMT-4` — their pins exist and pass and
must keep passing untouched), and the rest are **pending** the
implementation PR — the rows whose guards are the registry
`AMT1`-`AMT20`, the `BR-61` evidence row, the MVP no-change gate, and
`AMT-E1`. The slice is **not complete** at this spec head; it completes
when the implementation PR merges with `AMT1`-`AMT20` green, the pins
refreshed where the implementation moved a line, `AMT-E1` recorded, and
`qa-lead` re-pins the rows at the merged head. The MVP Coverage line
below stands unchanged at 57/57.

## 24. Report-range span-cap slice (Refs #641)

Traceability for the #641 report-window span cap (audit finding P1):
`parseRange` validated a window's shape and order but never its span, and
`Occupancy` and `Revenue` then walk every date in the window inclusively
under the store mutex, so one request such as
`0001-01-01`..`9999-12-31` loops over millions of dates while every other
report waits behind the same lock. The done-conditions are
`docs/product/acceptance-criteria.md`
[section 24](../product/acceptance-criteria.md#24-reporting-date-ranges-carry-a-declared-span-cap-refs-641)
(`AC-RPT-5`..`AC-RPT-7`), the requirement `NFR-RPT-1` is
`docs/requirements/mvp-requirements.md`
[section 32](../requirements/mvp-requirements.md#32-reporting-date-ranges-carry-a-declared-span-cap-refs-641),
the business rule is `BR-62` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), the cap,
enforcement point, arithmetic, refusal shape, and per-flow diagram are
LLD [section 31](../architecture/lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641),
and the guard registry `RPT1`-`RPT14` plus the evidence rule `RPT-E1`
are `report-range-cap-test-traceability.md`
[the testing spec](report-range-cap-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-RPT-5` — a window whose `dateTo` is more than 730 nights after `dateFrom` (including `0001-01-01`..`9999-12-31`) answers exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming `dateTo`, the `reporting.validation.date_range_span` sentence carrying the bound, a `traceId`), returns no `nights` or `days` rows, and is refused before the store lock and before any per-date loop; missing, malformed, and out-of-order windows keep their existing sentence and field (traces to `FR-RPT-1`, `FR-RPT-2`, `NFR-PERF-2`, `AC-RPT-1`, `AC-RPT-2`) | L1 acceptance: the over-cap refusal per operation at store and HTTP level, the huge window, the before-the-lock proof, and the unchanged shape/order refusals | **Pending** — `RPT1`, `RPT2`, `RPT4`, `RPT5`, `RPT7`, `RPT9`; today's opposite is `services/reporting/internal/store/store.go:440-453` (no span check) with the walks at `:480` and `:523` |
| `AC-RPT-6` — a window at exactly 730 nights (731 inclusive dates, the 2024-01-01..2025-12-31 shape) returns exactly today's rows — same dates and order, counts, totals, zero rows, and `asOf` — one more night is refused, and `DailySheet` and `HousekeepingReport` answer exactly as before (traces to `FR-RPT-1`, `FR-RPT-2`, `NFR-PERF-2`, `AC-RPT-1`, `AC-RPT-2`) | L1: the at-cap boundary pair compared against the same seeded fixture; re-run: the one-date, no-range, and two-year perf reads | **Covered by re-run today for the existing in-cap answers and the perf window (`RPT12`, `services/reporting/internal/service/service_test.go:16-29`, `perf_test.go:97-101`), and pending for the explicit at-cap/one-night-past pair (`RPT3`)** |
| `AC-RPT-7` — one named constant states the 730-night cap and both range reports read it, no environment variable, deployment setting, or per-hotel configuration carries it, the store's guards pin the over-cap refusal for both operations, the at-cap acceptance, and the boundary pair beside the existing malformed and order guards; no desk, catalogue-key-beyond-the-sentence, route, print-rule, or contract-operation change, and `contract-check` stays green (traces to `FR-RPT-1`, `FR-RPT-2`, `NFR-PERF-2`, `NFR-I18N-1`) | L1: the constant and the guard set; LC: the contract gate; diff gate: no configuration source and no desk surface | **Covered by re-run today for the contract gate (`RPT13`), and pending for the constant and the full guard set (`RPT6`, `RPT1`-`RPT5`, `RPT9`, `RPT10`, `RPT14`)** |
| `NFR-RPT-1` — a report window is bounded by one declared 730-night span and refused before any store work when wider: one 400 envelope with `VALIDATION_FAILED` naming `dateTo`, the sentence with the bound rendered from the constant, a fresh `traceId`, no rows, and no lock taken or date walked; a 730-night window served exactly as today and one night more refused; the cap one constant equal to the Rates bound, carried by no configuration source; existing refusals and the one-date/no-range reads unchanged (requirements 32.3) | L1 acceptance: both operations, both ends of the boundary, the huge window, and the placement proof; re-run: contract and catalogue gates; diff gate: no configuration source | **Pending** — `RPT1`-`RPT11`, `RPT13`, `RPT14`; the constant is missing from `store.go:440-453`, and the shape to copy is `dateLayout` at `:34` |
| `BR-62` — a report window over `OccupancyReport` or `RevenueSummary` is bounded by one declared 730-night span (731 inclusive dates); a wider window is refused with the shared envelope and `VALIDATION_FAILED` naming `dateTo` and one plain sentence, in `parseRange` before the lock and before any per-date walk; an at-cap window returns today's rows, a shorter one is served unchanged, zero-filled dates stay, `DailySheet` and `HousekeepingReport` are untouched, and the cap is one code constant (business rules) | L1 acceptance + evidence: the refusal, the boundary pair, the untouched reads, and the lab record | **Pending** — `RPT1`-`RPT11`, `RPT14`, `RPT-E1`; today's breach is the missing span check at `store.go:440-453` |
| `FR-RPT-1` — occupancy report (MVP row, unchanged) | L1 acceptance: per-date counts against seeded bookings, plus the cap refusals on the same operation | **Covered by re-run today for the row itself (`RPT12`, `service_test.go:16-29`, `handler_test.go:57-104`, `store_test.go:61-88`) and pending the new refusals (`RPT1`, `RPT3`, `RPT4`, `RPT9`)** — the MVP guard slot in section 1 stands unchanged and may not cite this slice |
| `FR-RPT-2` — revenue summary (MVP row, unchanged) | L1 acceptance: room/extra totals against seeded folios, plus the cap refusals on the same operation | **Covered by re-run today for the row itself (`service_test.go:44-56`, `store_test.go:88-101`) and pending the new refusals (`RPT2`, `RPT3`, `RPT4`, `RPT9`)** |
| Existing shape and order refusals stay unchanged | Behaviour check: missing, malformed, and reversed windows keep their code, status, field, and sentence; a reversed window never answers the span sentence | **Covered by re-run today** — `RPT8` and `RPT7`'s order half; pins `service_test.go:31-42`, `handler_test.go:106-123`, `messages_test.go:20-51` — an assertion rewrite fails the row |
| `DailySheet` and `HousekeepingReport` untouched | Behaviour check: the one-date and no-range reads answer exactly as before and never call `parseRange` | **Covered by re-run today** — `RPT12`; `store.go:542-545`, `:618`, `service_test.go:44-66`, `handler_test.go:129-180`, `perf_test.go:264-290`; a cap branch in either read fails the row |
| Rates bound consistency | Real delta: no Rates code or bound change; a test-only guard proves 730 accepted and 731 refused naming `departureDate` with `rates.validation.quote_range`, the same number Reporting adopts | **Pending** — `RPT11`; today's bound is `services/rates/internal/store/store.go:254-255` and `postgres.go:258-259`, with no boundary test (`messages_test.go:37` only samples the sentence) |
| Contract and LC | Real delta: no contract file changes, no code token or operation added, the envelope keeps its four fields, and both check scripts stay green | **Covered by re-run today** — `RPT13`; the files are `contracts/http/OccupancyReport.json`, `RevenueSummary.json`, `contracts/errors/envelope.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, or envelope-field change here is a re-tier finding (LLD 31.5, 31.7) |
| No-configuration gate | Real delta: the cap is one code constant, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no write path or stored state changes | **Pending diff gate** — `RPT14`; the fixed side is recorded in `docs/requirements/business-rules.md` section 9 (BR-62) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `NFR-RPT-1` is the only requirement addition | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard (requirements 32.2) |
| Evidence cross-reference (`RPT-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/641/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #641): 14 rows mapped to `AC-RPT-5`..`AC-RPT-7`,
`NFR-RPT-1`, `BR-62`, the existing FR-RPT-1/FR-RPT-2 regression rows,
the untouched-read row, the Rates consistency row, the contract/LC gate,
the configuration gate, the MVP no-change gate, and `RPT-E1`. Four rows
are covered by re-run today (the existing shape/order refusals, the
one-date and no-range reads, the contract/LC gate, and the in-cap
answers named inside `AC-RPT-6` — their pins exist and pass and must
keep passing untouched), and the rest are **pending** the implementation
PR — the rows whose guards are the registry `RPT1`-`RPT14`, the `BR-62`
evidence row, the MVP no-change gate, and `RPT-E1`. The slice is **not
complete** at this spec head; it completes when the implementation PR
merges with `RPT1`-`RPT14` green, the pins refreshed where the
implementation moved a line, `RPT-E1` recorded, and `qa-lead` re-pins
the rows at the merged head. The MVP Coverage line below stands
unchanged at 57/57.

## 25. Guest identity ambiguity and payload bounds slice (Refs #640)

Traceability for the #640 guest-identity hardening (audit findings G1,
G2, G3): the in-memory `findGuest` returned the first record whose
`fullName` matched and the Postgres twin asked for `LIMIT 1`, so two
guests sharing a name handed the desk another guest's profile (PII)
instead of an ambiguity refusal; `contact`, `preferences`, and `notes`
were stored exactly as sent with no per-field shape, length, or size
bound; and `requireDate` tested the shape of a date, not the calendar,
so `2026-13-45` was accepted where the Go services refuse it. The
done-conditions are `docs/product/acceptance-criteria.md`
[section 25](../product/acceptance-criteria.md#25-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640)
(`AC-GID-1`..`AC-GID-7`), the requirements `FR-GID-1`..`FR-GID-3` are
`docs/requirements/mvp-requirements.md`
[section 33](../requirements/mvp-requirements.md#33-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640),
the business rule is `BR-63` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), the ambiguity
branch, the four bound constants, the calendar round-trip, the refusal
shape, and the per-flow diagrams are LLD
[section 32](../architecture/lld.md#32-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640),
and the guard registry `GID1`-`GID14` plus the evidence rule `GID-E1`
are
`guest-identity-test-traceability.md`
[the testing spec](guest-identity-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-GID-1` — two guests with one `fullName`, `IdentifyGuest` by that name answers exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming `fullName` with the searched name and the match count, the `guests.validation.ambiguous_name` sentence, a `traceId`), no profile, `contact`, `preferences`, `notes`, or `stayLinks` come back, and both stores refuse identically (traces to `FR-GID-1`, `FR-GST-1`, `FR-GST-3`, `AC-GST-1`) | L1 acceptance: the two-guest refusal at HTTP and store level in both stores, with the four-key envelope and the no-profile assertion | **Pending** — `GID1`, `GID2`, `GID3`, `GID10`; today's opposite is `services/guests/src/store.ts:316-322` (first match returned) and `services/guests/src/pgstore.ts:183-187` (`LIMIT 1`) |
| `AC-GID-2` — a unique name returns the profile and its stay links exactly as today, an unknown name stays `NOT_FOUND` with today's sentence, and every `guestId` read answers as today including for two guests sharing a name | L1 acceptance: the unique-name regression (unedited), the unknown-name sentence, and the per-id reads of two same-named guests | **Covered by re-run today for the unique-name and per-id halves (`services/guests/src/server.test.ts:86-118`, `:166-206`) and pending for the explicit unknown-name and two-same-named-guests cases (`GID4`, `GID5`)** |
| `AC-GID-3` — a present `contact`/`preferences` that is an array, string, number, or boolean, or holds more than 16 fields, an empty or over-64-character key, a nested object, an array entry, a `null` entry, a 257-character string entry, or a non-finite number is refused with HTTP 400 `VALIDATION_FAILED` naming the field and the shape sentence, writing no record, stay link, or outbox event (traces to `FR-GID-2`, `FR-GST-1`, `FR-GST-2`, `AC-GST-2`) | L1 acceptance: one case per refused shape, the at-bound acceptance, and the nothing-written assertion | **Pending** — `GID6`, `GID7`; today's opposite is the silent coercion at `services/guests/src/store.ts:166-168`, `:231-232` and `services/guests/src/pgstore.ts:70-71` |
| `AC-GID-4` — a present `notes` that is not a string or is longer than 2 000 characters is refused with HTTP 400 `VALIDATION_FAILED` naming `notes` and the length sentence, writing nothing; 2 000 characters is stored as sent and an absent `notes` keeps today's behaviour (traces to `FR-GID-2`, `FR-GST-2`, `AC-GST-2`) | L1 acceptance: the 2 000/2 001 boundary pair, the non-string refusal (number and explicit `null`), and the unchanged stored note | **Pending** — `GID8`; today's opposite is `services/guests/src/store.ts:233` and `services/guests/src/pgstore.ts:72`, `:79` |
| `AC-GID-5` — `AttachReservation` with a calendar-invalid `dates.checkIn`/`dates.checkOut` such as `2026-13-45` or `2026-02-31` is refused naming that field with the existing `guests.validation.date_format` sentence, no confirmation is stored, `2024-02-29` is accepted, and no other operation's date handling changes (traces to `FR-GID-3`, `FR-GST-4`, `AC-GST-4`) | L1 acceptance: the three invalid dates per field, the leap-day acceptance, the shape-only refusal re-run, and the still-`NOT_FOUND` read after a refusal | **Pending** — `GID9`; today's opposite is the regex-only `requireDate` at `services/guests/src/store.ts:170-175` |
| `AC-GID-6` — an ambiguity refusal on the Book screen's guest find reads as `desk.book.guest_ambiguous` in both locales, resolves no guest, keeps the name and the Find/Register controls, and never reads as the not-found or request-failed sentence, with layout, tokens, route, and print rules unchanged and the catalogue gate green (traces to `FR-GID-1`, `FR-DSP-3`, `NFR-I18N-1`, `AC-DSK-1`, `AC-DSK-2`) | L1 acceptance: the EN and VI ambiguity states, the no-profile and controls-stay assertions, the two unchanged sentences, and the catalogue gate | **Covered by re-run today for the found, not-found, and blank-name states (`app/src/views/BookView.test.ts:331-394`, `app/src/views/desk-edge-guards.test.ts:639-654`) and pending the ambiguity state and its VI copy (`GID11`, `GID10`)** |
| `AC-GID-7` — each bound is a named constant carried by no configuration, both stores refuse the same values, the ambiguity, shape, length, and date guards with their boundary pairs exist beside the regression guards, no migration exists, `contract-check` stays green with no code token added, and no other desk surface changes (traces to `FR-GID-1`..`FR-GID-3`, `NFR-I18N-1`, `NFR-AUD-1`) | L1: the constants and the full guard set; LC: the contract gate; diff gate: no configuration source, no migration, no other desk surface | **Covered by re-run today for the contract gate (`GID13`) and the existing regression set (`GID14`), and pending for the constants and the new guard set (`GID1`-`GID12`)** |
| `FR-GID-1` — a name that matches more than one guest is refused, never resolved by first match; a unique name, an unknown name, and every `guestId` read answer as before; the Book find says the ambiguity plainly (requirements 33.3) | L1 acceptance: `GID1`-`GID5`, `GID11`, plus the catalogue sentence | **Pending** — `GID1`, `GID2`, `GID3`, `GID4`, `GID5`, `GID10`, `GID11`; today's breach is `store.ts:316-322` and `pgstore.ts:183-187` |
| `FR-GID-2` — `contact`/`preferences` carry one declared shape and `notes` one declared length, refused naming the field with nothing written, at-bound values stored as sent, absent and explicit-`null` object fields as today, and stored longer notes or other shapes still read as stored (requirements 33.3) | L1 acceptance: `GID6`-`GID8`, `GID12`, plus the two catalogue sentences | **Pending** — `GID6`, `GID7`, `GID8`, `GID10`, `GID12`; today's breach is `asObject` at `store.ts:166-168` and the unbounded fields at `:231-233` |
| `FR-GID-3` — the confirmation snapshot's two dates must exist on the calendar, refused naming the field with the existing sentence and no stored confirmation, the leap day accepted, shape-only refusals and the date order unchanged (requirements 33.3) | L1 acceptance: `GID9` plus the existing confirmation cases re-run | **Pending** — `GID9`; today's breach is `store.ts:170-175` |
| `BR-63` — a guest identity lookup answers only when the name is unambiguous, the guest write bounds what it stores, and the confirmation dates must exist; the refusals name the field, the bounds are code constants, reads are never re-validated, and the Book find says the ambiguity plainly (business rules section 7) | L1 acceptance + evidence: every refusal, both boundary pairs, the unchanged reads, the desk state, and the lab record | **Pending** — `GID1`-`GID14`, `GID-E1` |
| `NFR-I18N-1` (unchanged) — the three new service sentences and the one desk sentence resolve through the catalogue in both locales with matching placeholders and no technical code or status in the wording | L1 catalogue: `GID10`, `GID11`; gate: `script/catalogue-coverage-check.sh` | **Covered by re-run today for the existing guests and Book sentences (`messages.test.ts:16-38`, `messages/en.json:400-403`) and pending the four new sentences** |
| `NFR-AUD-1` (unchanged) — a refused upsert or attach records nothing and emits no event; a committed write keeps its acting staff member | L1: `GID3`, `GID6`, `GID8` (nothing written, no `guest-upserted` entry) and `GID14`'s existing write cases | **Covered by re-run today for the committed-write half (`server.test.ts:420-435`) and pending the refusal half (`GID3`, `GID6`, `GID8`)** |
| Existing guests and Book suites stay unchanged | Behaviour check: the unique-name, not-found, full-profile, stay-link, confirmation, body-bound, and internal-error cases and the Book found/not-found/register/blank-name cases keep their assertions byte-identical; a rewritten assertion fails the row | **Covered by re-run today** — `GID14`; pins `services/guests/src/server.test.ts:60-476`, `bodyBound.test.ts:102-153`, `errors.test.ts`, `app/src/views/BookView.test.ts:331-394`, `app/src/views/desk-edge-guards.test.ts:639-654` |
| Contract and LC | Real delta: no contract operation, response field, request keyword, token, or fixture changes beyond the `IdentifyGuest` error-prose clause; the envelope keeps its four fields; both contract gates and the catalogue gate stay green | **Covered by re-run today** — `GID13`; the files are `contracts/http/IdentifyGuest.json`, `UpsertGuest.json`, `contracts/errors/envelope.json`, `services/guests/contract-tests/*`, `script/contract-check.sh`, `script/openapi-route-check.sh`, `script/catalogue-coverage-check.sh`; a shape or token change here is a re-tier finding (LLD 32.6) |
| No-configuration and no-migration gate | Real delta: the four bounds are code constants, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration file is added and no stored row is rewritten | **Pending diff gate** — `GID12`, `GID14`; the fixed side is recorded in `docs/requirements/business-rules.md` section 9 (BR-63) and LLD 32.3 |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-GID-1`..`FR-GID-3` are requirement additions outside the counted set and no NFR is added (requirements 33.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`GID-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/640/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #640): 18 rows mapped to `AC-GID-1`..`AC-GID-7`,
`FR-GID-1`..`FR-GID-3`, `BR-63`, the two unchanged NFR rows, the
existing-suite row, the contract/LC row, the configuration/migration
gate, the MVP no-change gate, and `GID-E1`. Seven rows carry re-run
evidence today (the existing guests and Book suites, the contract/LC
gate, the two unchanged NFR rows, and the re-run halves named inside
`AC-GID-2`, `AC-GID-6`, and `AC-GID-7` — their pins exist and pass and
must keep passing untouched), and the rest are
**pending** the implementation PR — the rows whose guards are the
registry `GID1`-`GID12`, the `BR-63` evidence row, the MVP no-change
gate, and `GID-E1`. The slice is **not complete** at this spec head; it
completes when the implementation PR merges with `GID1`-`GID14` green,
the pins refreshed where the implementation moved a line, `GID-E1`
recorded, and `qa-lead` re-pins the rows at the merged head. The MVP
Coverage line below stands unchanged at 57/57.

## 26. Admin authenticate-before-parse and config-shape slice (Refs #639)

Traceability for the #639 Admin hardening (audit findings A2, A3, A5):
`handleRequest` read and parsed every request body before it checked the
session, so an unauthenticated caller got the parse error — and the parse
work — ahead of the auth answer, and `UpdateHotelConfig` shape-checked
only `name`, so a malformed `requiredGuestFields` write silently replaced
the mandatory-field list the Guests gate is specified to read. The
done-conditions are `docs/product/acceptance-criteria.md`
[section 26](../product/acceptance-criteria.md#26-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639)
(`AC-CFG-1`..`AC-CFG-5`), the requirements `FR-CFG-1`..`FR-CFG-3` are
`docs/requirements/mvp-requirements.md`
[section 34](../requirements/mvp-requirements.md#34-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639),
the business rule is `BR-64` with its per-key table in
`docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md#config-write-shapes-br-64),
the request order, the module-local bearer helper, the per-key table, the
four per-flow diagrams, the contract decision, and the verification plan
are LLD [section 33](../architecture/lld.md#33-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639),
and the guard registry `CFG1`-`CFG24` plus the evidence rule `CFG-E1`
are `admin-auth-config-test-traceability.md`
[the testing spec](admin-auth-config-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-CFG-1` — no `Authorization` header, or an invalid, expired, or revoked session, with a malformed body (invalid JSON, a non-object, or above 65 536 bytes) on `UpdateHotelConfig` answers exactly one HTTP 401 `UNAUTHENTICATED` with the matching existing `error.auth.*` sentence, `details` as today, and a `traceId`; no `VALIDATION_FAILED` and none of the `bad_json` / `body_not_object` / `body_too_large` sentences, and no config change (traces to `FR-ADM-1`, `FR-DSP-3`, `NFR-SEC-2`, `AC-BND-1`) | L1 acceptance: one malformed case per shape at HTTP level, the invalid-token variant, and the no-store-call evidence | **Pending** — `CFG1`-`CFG4`; today's opposite is the body read at `services/admin/src/server.ts:144` firing before the token check at `:151-155` |
| `AC-CFG-2` — a well-formed body with no session answers today's 401; a valid session with a malformed body answers today's 400 with the existing transport sentence; `SignIn` keeps today's order in both directions; a front-desk caller with a well-formed body answers 403, so the observed order is 401 before 400 and 400 before 403 (traces to `FR-ADM-1`, `FR-ADM-2`, `NFR-SEC-2`, `AC-BND-1`, `AC-BND-2`) | L1 acceptance: the five ordering pairs, the `SignIn` pair, and the unchanged well-formed 401 | **Covered by re-run today for the well-formed no-token 401 (`services/admin/src/server.test.ts:105-111`), the `SignIn` lockout (`:84-103`), the authenticated blank-name 400 (`:169-177`), and the front-desk 403 (`:179-187`, `:262-270`); pending the explicit ordering pairs (`CFG6`) and the authenticated malformed-body regression (`CFG5`)** |
| `AC-CFG-3` — an authenticated `UpdateHotelConfig` whose value breaks its key's rule (a blank `timezone`, a non-`HH:MM` standard time, a wrong-shape or empty or duplicate `requiredGuestFields`, a wrong-shape `cancellationReasons`, a fractional or negative `retentionFloorDays`, non-text profile text) is refused with exactly one HTTP 400 `VALIDATION_FAILED`, `details` naming that key, the key's plain sentence, and a `traceId`; nothing is written, no `config.updated` entry appears, and a valid key sent in the same request is not stored (traces to `FR-ADM-1`, `FR-ADM-4`, `FR-CUS-1`, `FR-CUS-2`, `FR-RES-3`, `AC-ADM-1`, `AC-ADM-4`, `AC-CUS-1`, `AC-CUS-2`) | L1 acceptance: one refusal per rule with the envelope and sentence assertions, the A3 case first, and the whole-write proof | **Pending** — `CFG7`-`CFG14`; today's opposite is the name-only check at `services/admin/src/store.ts:483-487` followed by the unconditional write at `:488-492` |
| `AC-CFG-4` — an authenticated `UpdateHotelConfig` whose present values all satisfy the table behaves exactly as today: values stored verbatim, `GetHotelConfig` reads them back unchanged, `config.updated` entries carry the caller's `updatedBy` and time, both stores agree, and an outside-table key and an absent key keep today's behaviour (traces to `FR-ADM-1`, `FR-ADM-4`, `NFR-AUD-1`, `AC-ADM-1`, `AC-ADM-4`) | L1 acceptance: the accepted boundary set, the audit entries, the outside-table keys, and store parity | **Covered by re-run today for the existing in-table answers (`server.test.ts:147-167`, `:206-247`, `services/admin/src/pgstore.test.ts:31-56`) and pending the explicit boundary set, the audit assertion, the outside-table keys, and parity (`CFG16`-`CFG18`)** |
| `AC-CFG-5` — `server.test.ts` carries the guards `AC-CFG-1`..`AC-CFG-3` name, including the `requiredGuestFields` refusal and the accepted boundaries; no contract token, status mapping, or schema file is edited; the five new sentences exist in both locales and the mirror with matching placeholders and the catalogue gate is green; no desk screen, control, route, label, state, or print rule changes; the existing identity, audit, body-ceiling, and internal-error suites stay green (traces to `FR-ADM-1`, `FR-DSP-3`, `NFR-I18N-1`, `NFR-SEC-2`, `NFR-AUD-1`; evidence condition) | L1 + evidence: the full guard set, the catalogue gate, the contract gates, the untouched suites, and the record | **Pending** — `CFG1`-`CFG20`, `CFG-E1`; the re-run halves are `CFG21`-`CFG23` |
| `FR-CFG-1` — a session-guarded Admin operation checks the session before it reads the body; unauthorized malformed and oversized bodies answer 401, a resolved session keeps today's 400, the front-desk 403 follows a well-formed body, `SignIn` keeps today's order, and route matching reads no body (requirements 34.3) | L1 acceptance: `CFG1`-`CFG6`, plus the unchanged route and transport cases | **Pending** — `CFG1`-`CFG6`; today's breach is `server.ts:144` |
| `FR-CFG-2` — a present value that breaks its key's table shape refuses the whole write naming the key with `VALIDATION_FAILED`, nothing written and no `config.updated` entry, the existing `values`/`updatedBy` refusals first, and an outside-table key written as sent (requirements 34.3) | L1 acceptance: `CFG7`-`CFG15`, `CFG17`, plus the sentence table | **Pending** — `CFG7`-`CFG15`, `CFG17`; today's breach is `store.ts:471-494` |
| `FR-CFG-3` — a write that satisfies the table is stored, read back, and audited exactly as today in both stores, boundaries included, the shared bearer helper changes no answer, and an absent key is untouched (requirements 34.3) | L1 acceptance: `CFG16`, `CFG18`, `CFG20`, plus the unedited round-trip cases | **Covered by re-run today for the existing round trips (`server.test.ts:191-272`, `pgstore.test.ts:31-56`) and pending the boundary, parity, and helper-parity cases (`CFG16`, `CFG18`, `CFG20`)** |
| `BR-64` — a session-guarded Admin request is answered only after the session is checked, one config write is checked against one per-key table before the first write, a refusal names the key with nothing written, both stores agree, and the ordering, shapes, and sentences are code rules, never configuration (business rules) | L1 acceptance + evidence: every refusal, the whole-write proof, the boundary set, the diff gate, and the lab record | **Pending** — `CFG1`-`CFG20`, `CFG24`, `CFG-E1` |
| `NFR-SEC-2` (unchanged) — a missing, invalid, expired, revoked, signed-out, or orphan session is refused 401 with its existing sentence before any parse work, the 5-strike lockout stands, and the 15-minute idle expiry is unchanged | L1: `CFG1`-`CFG4`, `CFG6`; re-run: the lockout and sign-out cases | **Covered by re-run today for the lockout and the well-formed 401 (`server.test.ts:84-103`, `:105-111`, `:490-527`) and pending the malformed-body ordering (`CFG1`-`CFG4`)** |
| `NFR-BND-1`..`NFR-BND-3` (unchanged) — the 65 536-byte ceiling, the parse and ceiling sentences, the four finite server bounds, and `MAX_BODY_BYTES` are unchanged; the ceiling applies to every request that reaches the body read, and `SignIn` keeps it exactly as today | L1: `CFG3` (the 401 outranks the ceiling), `CFG21`'s ceiling pair and bounds | **Covered by re-run today for `SignIn`'s ceiling pair, the declared-length refusal, the constant, and the bounds (`services/admin/src/bodyBound.test.ts:106-158`) and pending the unauthenticated-over-limit case (`CFG3`)** |
| `NFR-AUD-1` (unchanged) — a refused config write records nothing and leaves no `config.updated` entry; a committed write keeps the acting `updatedBy` and its time | L1: `CFG14` (nothing written, no entry) and `CFG16`'s audit assertion | **Covered by re-run today for the committed-write half (`server.test.ts:653-695`) and pending the refusal half (`CFG14`)** |
| `NFR-I18N-1` (unchanged) — the five new Admin sentences resolve through the catalogue in both locales with matching placeholders, no sentence renders a code, status, or stack trace, and the catalogue gate is green | L1 catalogue: `CFG19`, `CFG13`; gate: `script/catalogue-coverage-check.sh` | **Covered by re-run today for the existing sentences (`services/admin/src/messages.test.ts:16-53`) and pending the five new keys** |
| `FR-ADM-1` / `FR-ADM-4` (MVP rows, unchanged) — the hotel profile and policy values still save, read back, and reach the desk exactly as today, now through the shape table | L1 acceptance: the accepted boundary and outside-table cases on the same operation | **Covered by re-run today for the row itself (`server.test.ts:113-189`, `:191-272`) and pending the new refusals (`CFG7`-`CFG17`)** — the MVP guard slots in section 1 stand unchanged and may not cite this slice |
| `FR-CUS-1` / `FR-CUS-2` (MVP rows, unchanged) — the required-guest-field list and the stay times and wording still save and read back verbatim, so the Guests mandatory-field gate keeps reading a conforming value | L1 acceptance: the `requiredGuestFields` refusal set and the boundary acceptance on the same operation | **Covered by re-run today for the row itself (`server.test.ts:191-272`) and pending the `requiredGuestFields` guards (`CFG9`, `CFG10`, `CFG16`)** — the MVP guard slots in section 1 stand unchanged and may not cite this slice |
| Desk flows and client stay green | Behaviour check: a 401 still routes to sign-in, the onboarding step still maps `FORBIDDEN` and otherwise the plain sentence, and the admin console reads config and audit as before | **Covered by re-run** — `CFG22`; `app/src/api/client.test.ts:55-81`, `app/src/views/AdminView.test.ts:229-465`, `app/src/views/OnboardingView.test.ts`; a screen, route, label, or print-rule edit fails the row |
| Contract and LC | Real delta: no contract token, status mapping, enum entry, operation, request/response field, or fixture changes beyond the `UpdateHotelConfig` error-list prose, the envelope keeps its four fields, and both check scripts stay green | **Covered by re-run today** — `CFG23`; the files are `contracts/http/UpdateHotelConfig.json`, `contracts/errors/envelope.json`, `services/admin/contract-tests/*`, `services/admin/src/errors.ts`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a token, enum, mapping, or schema change here is a re-tier finding (LLD 33.5, 33.8) |
| No-configuration and no-migration gate | Real delta: the ordering, the per-key table, and the five sentences are code rules and constants, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration file is added and no stored row is rewritten; the Bearer parse exists once, module-locally | **Pending diff gate** — `CFG24`; the fixed side is recorded in `docs/requirements/business-rules.md` section 9 (BR-64) and LLD 33.2/33.3 |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-CFG-1`..`FR-CFG-3` are requirement additions outside the counted set and no NFR is added (requirements 34.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`CFG-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/639/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #639): 20 rows mapped to `AC-CFG-1`..`AC-CFG-5`,
`FR-CFG-1`..`FR-CFG-3`, `BR-64`, the four unchanged NFR rows, the two
unchanged MVP row pairs, the desk-green row, the contract/LC gate, the
configuration/migration gate, the MVP no-change gate, and `CFG-E1`. The
four unchanged NFR rows, the two MVP row pairs, the desk-green row, and
the contract/LC gate are covered by re-run today (their pins exist and
pass and must keep passing untouched), plus the re-run halves named
inside `AC-CFG-2`, `AC-CFG-4`, and `FR-CFG-3`; the rest are **pending**
the implementation PR — the rows whose guards are the registry
`CFG1`-`CFG20`, the `BR-64` evidence row, the MVP no-change gate, and
`CFG-E1`. The slice is **not complete** at this spec head; it completes
when the implementation PR merges with `CFG1`-`CFG24` green, the pins
refreshed where the implementation moved a line, `CFG-E1` recorded, and
`qa-lead` re-pins the rows at the merged head. The MVP Coverage line
below stands unchanged at 57/57.

## 27. Audit actor provenance slice (Refs #643)

Traceability for the #643 session-derived audit actor change (audit
finding C6): every audited write in Stay, Guests, Rooms, Reservations,
and Billing recorded an `actor` string the request supplied, and Admin's
config write recorded the body `updatedBy`, so each outbox event, change
row, and state-history row attributed the change to a name the caller
chose — the attribution `NFR-AUD-1` promises was decided by the caller.
The done-conditions are `docs/product/acceptance-criteria.md`
[section 27](../product/acceptance-criteria.md#27-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643)
(`AC-SEC-1`..`AC-SEC-5`), the requirements `FR-SEC-1`..`FR-SEC-4` are
`docs/requirements/mvp-requirements.md`
[section 35](../requirements/mvp-requirements.md#35-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643),
the business rule is `BR-65` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md#8-roles-audit-and-data-protection),
the per-service actor-resolution seam, the three per-flow diagrams, the
contract decision, and the verification plan are LLD
[section 34](../architecture/lld.md#34-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643),
and the guard registry `SEC1`-`SEC36` plus the evidence rule `SEC-E1`
are `audit-actor-test-traceability.md`
[the testing spec](audit-actor-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched — except
the two Go assertions that re-pin to the session token by design
(`services/reservations/internal/store/store_test.go:214`, `:491`). The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-SEC-1` — a write through Stay (4), Guests (1), Rooms (7), Reservations (6), or Billing (9) records the session token as the actor on every outbox event, change row, and state-history row, not the request's `actor`; the Stay close and its forwarded completion record the same token; an operation with no audit row is unchanged (traces to `FR-SEC-1`, `NFR-AUD-1`, `NFR-SEC-2`) | L1 acceptance + L2 audit: one spoofed-actor case per write operation per stack, asserting the exact session value | **Pending** — `SEC1`-`SEC28`, `SEC33`; today's opposite is the body read at `services/stay/src/store.ts:216`, `:294`, `:335`, `:383`, `services/guests/src/store.ts:319`, `services/rooms/src/store.ts:219`-`:477`, `services/reservations/internal/handler/handler.go:176`-`:342`, `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:39-42` |
| `AC-SEC-2` — a write sending an `actor` naming another person answers and stores exactly the honest write, records the session as the actor, never the supplied value, and shows it only as `requestActor` in a JSON payload; an equal or absent value adds no key; a column-only write drops it; an existing body-value refusal keeps its code, field, and sentence; no refusal is added for the disagreement (traces to `NFR-AUD-1`, `NFR-SEC-2`, `AC-SEC-1`) | L1 acceptance: the annotation key-set matrix, the honest-value response equality, and the no-extra-refusal assertion | **Pending** — `SEC29`-`SEC31` |
| `AC-SEC-3` — an authenticated `UpdateHotelConfig` by an owner or manager records the caller's `signinIdentity` on the stored rows and the `config.updated` audit entry, never the body's `updatedBy`, while the field stays required with its existing refusal and every table-valid value is stored, read back, and timed as today; the recorded-actor half of `AC-CFG-4` is superseded (traces to `FR-ADM-1`, `FR-ADM-4`, `NFR-AUD-1`, `NFR-SEC-2`, `AC-CFG-4`) | L1 acceptance: the spoofed-`updatedBy` owner and manager saves, both stores, and the audit assertion | **Pending** — `SEC28`; covered by re-run for the honest round trip (`services/admin/src/server.test.ts:242-318`, `services/admin/src/pgstore.test.ts:33-58`) |
| `AC-SEC-4` — with no `Authorization` header any write answers today's HTTP 401 `UNAUTHENTICATED` and nothing is written; the Stay close and its forwarded completion record the same desk token and the forwarded `actor` never overrides it; the Admin boot seed keeps `boot` (traces to `FR-DEP-1`, `FR-DEP-5`, `FR-ADM-1`, `NFR-AUD-1`, `NFR-SEC-2`) | L1 acceptance: the six per-service no-session cases with a stored-value read, the forwarded agreement pair, and the boot-seed case | **Covered by re-run today for Rooms (`services/rooms/src/server.test.ts:60-68`), Reservations (`services/reservations/internal/handler/handler_test.go:351-359`), Billing (`BillingControllerTest.java:94-95`), and Admin (`services/admin/src/server.test.ts:234-240`); pending the Stay and Guests no-session guards (`SEC32`), the forwarded agreement (`SEC33`), and the boot seed (`SEC34`)** |
| `AC-SEC-5` — outbox payloads and rows keep their keys and columns with `requestActor` the only addition; every write contract is unchanged; no error code, catalogue key, desk surface, route, schema, table, migration, or backfill is added; token verification, HMAC, expiry, revocation, and role checks are unchanged; the tree carries one spoofed-actor guard per write per stack with the existing suites green (traces to `NFR-AUD-1`, `NFR-SEC-2`; evidence condition) | L1 + evidence: the shape/key-set gate, the contract and catalogue gates, the untouched suites, and the record | **Pending** — `SEC1`-`SEC30`, `SEC35`, `SEC36`, `SEC-E1`; the re-run halves are the existing suites in the testing spec's section 2 |
| `FR-SEC-1` — every audited write records the session read from the `Authorization` header the server already authenticates with, never from the body; the forwarded completion records the same token; an operation with no audit row is unchanged (requirements 35.3) | L1 acceptance: `SEC1`-`SEC28`, `SEC33` | **Pending** — `SEC1`-`SEC28`, `SEC33` |
| `FR-SEC-2` — a disagreeing request actor is demoted, never refused and never authoritative: the response and effect match the honest write, the value appears only as `requestActor`, an equal/absent/blank value adds no key, a column-only write drops it, and an existing refusal keeps its code, field, and sentence with nothing written (requirements 35.3) | L1 acceptance: `SEC29`-`SEC31` | **Pending** — `SEC29`-`SEC31` |
| `FR-SEC-3` — the Admin config write records the resolved caller, never the body's `updatedBy`, with the field still required, the front-desk 403 standing, and the boot seed keeping `boot` (requirements 35.3) | L1 acceptance: `SEC28`, `SEC34`; re-run: the front-desk 403 and the `updatedBy` refusal | **Covered by re-run today for the 403 and the shape table (`services/admin/src/server.test.ts:1051-1103`, `:1104-1436`) and pending the spoofed-`updatedBy` and boot-seed cases (`SEC28`, `SEC34`)** |
| `FR-SEC-4` — no session means no request actor; the session is the only actor source and a forwarded call carries the caller's own session; existing payloads, rows, and contracts keep their keys and columns with `requestActor` the only addition; no error code, catalogue key, desk state, route, schema, migration, or backfill is added and token verification and role checks are unchanged (requirements 35.3) | L1 acceptance + diff gate: `SEC32`, `SEC33`, `SEC35`, `SEC36` | **Pending** — `SEC32` (Stay, Guests), `SEC33`, `SEC35`, `SEC36`; covered by re-run for the four existing no-session guards |
| `BR-65` — the actor recorded on every audit trail is the authenticated session, never a request value; the request field keeps its shape, refusals, and demotion; no session, the boot seed, and the forwarded call keep their actor source; shapes stay additive; the rule is fixed code, never per-hotel configuration (business rules section 8) | L1 acceptance + evidence: every spoofed-write guard, the annotation matrix, the no-session set, the shape gate, the diff gate, and the record | **Pending** — `SEC1`-`SEC36`, `SEC-E1` |
| `NFR-AUD-1` (unchanged, now with a decided source) — every creation, change, cancellation, state transition, charge, and payment keeps an unaltered actor and timestamp at 100 %; a refused write records nothing; a committed write records the session and its time | L2 audit sampling: `SEC1`-`SEC28` value assertions plus `SEC29`'s payload key set | **Pending** — `SEC1`-`SEC30`; covered by re-run for the horizon-1 commit half (`services/admin/src/server.test.ts:783-825`) |
| `NFR-SEC-1` / `NFR-SEC-2` (unchanged) — no role, reach, session, token-validation, lockout, or idle-sign-out rule changes; a missing, invalid, expired, revoked, signed-out, or orphan session is refused 401 with its existing sentence before any write | L1: `SEC31`, `SEC32`; re-run: the lockout, sign-out, and role-refusal cases | **Covered by re-run today for the role and session cases (`services/admin/src/server.test.ts:213-240`, `services/rooms/src/server.test.ts:60-68`, `handler_test.go:351-359`, `BillingControllerTest.java:94-95`) and pending the Stay and Guests no-session guards (`SEC32`)** |
| Desk payloads and surfaces stay green | Behaviour check: every desk call still sends its `session.displayName` `actor`, no surface renders an actor, and the screens, routes, labels, states, and print rules are unchanged | **Covered by re-run** — `SEC35`; `app/src/views/PrintView.test.ts:78`, `:102`, `:303`, `:339` plus the desk suites; a payload or label edit fails the row |
| Contract and LC | Real delta: no contract token, status mapping, enum entry, operation, field, required flag, or fixture changes (the two `description` sentences are prose and both corrected in this change set: `CheckOutReservation.json:22` and `UpdateHotelConfig.json:20`), the payload key set changes only by `requestActor`, and both contract gates stay green | **Covered by re-run today** — `SEC35`; `contracts/http/{CheckIn,UpsertGuest,CheckOutReservation,UpdateHotelConfig}.json`, `contracts/errors/envelope.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a token, enum, mapping, or schema change is a re-tier finding (LLD 34.5, 34.8) |
| No-configuration and no-migration gate | Real delta: the provenance rule is a code rule carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration file is added and no stored row is rewritten; every audit column stays `TEXT` | **Pending diff gate** — `SEC36`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-65) and `docs/technical/schema.md` section 0 |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-SEC-1`..`FR-SEC-4` are requirement additions outside the counted set and no NFR is added (requirements 35.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`SEC-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/643/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #643): 17 rows mapped to `AC-SEC-1`..`AC-SEC-5`,
`FR-SEC-1`..`FR-SEC-4`, `BR-65`, the two unchanged NFR rows, the
desk-payload row, the contract/LC gate, the configuration/migration
gate, the MVP no-change gate, and `SEC-E1`. Three rows are covered by
re-run today (the unchanged `NFR-SEC-1`/`NFR-SEC-2` row, the
desk-payload row, and the contract/LC gate), plus the re-run halves
named inside `AC-SEC-3`, `AC-SEC-4`, and `FR-SEC-3`; `NFR-AUD-1` stays
pending because its actor-source half is the change itself. The rest are
**pending** the implementation PR — the rows whose guards are the
registry `SEC1`-`SEC30`, `SEC33`-`SEC36`, the `BR-65` evidence row, the
MVP no-change gate, and `SEC-E1`. The slice is **not complete** at this
spec head; it completes when the implementation PR merges with
`SEC1`-`SEC36` green, the pins refreshed where the implementation moved
a line (the two Go assertions re-pin by design), `SEC-E1` recorded, and
`qa-lead` re-pins the rows at the merged head. The MVP Coverage line
below stands unchanged at 57/57.

## 28. Failed-rebuild consistency slice (Refs #642)

Traceability for the #642 all-or-nothing Reporting rebuild publication
(audit finding P2): `Rebuild` cleared every projection, consumer offset,
and as-of stamp before it replayed, then returned on the first event it
could not project, and reads never refuse, so a rebuild that aborted
part-way left the desk reading an empty or partial read model whose
`asOf` looked as plausible as a healthy rebuild's. The done-conditions
are `docs/product/acceptance-criteria.md`
[section 28](../product/acceptance-criteria.md#28-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642)
(`AC-RPT-8`..`AC-RPT-10`), the requirements `FR-RPT-5`..`FR-RPT-7` are
`docs/requirements/mvp-requirements.md`
[section 36](../requirements/mvp-requirements.md#36-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642),
the business rule is `BR-66` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md),
the build-aside/swap seam, the per-store rule, the as-of retention, the
per-flow diagram, the contract decision, and the verification plan are
LLD
[section 35](../architecture/lld.md#35-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642),
and the guard registry `RB1`-`RB12` plus the evidence rule `RB-E1` are
`failed-rebuild-consistency-test-traceability.md`
[the testing spec](failed-rebuild-consistency-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-RPT-8` — given a read model already serving rows, when a later rebuild meets an event it cannot project mid-stream, then the rebuild returns today's `VALIDATION_FAILED` naming the offending field with today's sentence, every report answers the rows, row order, and `asOf` it served before, the per-subscription offsets and the seen-id record are unchanged, and a never-applied store keeps its empty pre-rebuild state (traces to `FR-RPT-1`..`FR-RPT-4`, `FR-RPT-5`, `BR-66`) | L1 acceptance: the mid-stream bad-event case on a served store, the never-rebuilt case, the offset/stamp equality, and the unchanged refusal | **Pending** — `RB1`, `RB2`, `RB3`, `RB9`; today's opposite is the in-place clear at `services/reporting/internal/store/store.go:227-235` with the early return at `:239` |
| `AC-RPT-9` — given a rebuild that is replaying or has aborted, when any report is read, then the read answers one complete set — the pre-rebuild set until the swap, the post-rebuild set after it — never an empty or partial set, and the `asOf` belongs to that same set (zero only on a store that never applied an event); the read is never refused and never blocked for longer than the swap (traces to `FR-RPT-1`..`FR-RPT-4`, `FR-RPT-6`, `BR-66`) | L1: the concurrent-read one-complete-set case under `-race` and the per-set `asOf` agreement | **Pending** — `RB4`, `RB7`; today's reads take the same mutex the rebuild releases mid-flight (`store.go:479`, `:534`, `:560`, `:633`), so a read can observe the half-built set |
| `AC-RPT-10` — given a slice whose events all project, when the rebuild completes, then every report and the offset record are exactly today's clear-and-replay output and re-applying a replayed event stays a no-op; the slice carries the mid-stream bad-event guard, the offset-record guard, and the byte-identical-success guard, while the existing rebuild and range-cap guards stay green and `contract-check` stays green; no contract, schema, route, desk surface, catalogue key, or print rule changes (traces to `FR-RPT-1`..`FR-RPT-4`, `FR-RPT-7`, `BR-66`; evidence condition) | L1: the success comparator, the idempotency re-run, and the observable-error pair; LC: the contract gate; diff gate: no schema, route, or configuration change | **Covered by re-run today for the idempotency and existing rebuild/range-cap guards and the contract/catalogue gates (`RB6`, `RB12`), and pending the success comparator, the observable pair, the one-store gate, and the evidence row (`RB5`, `RB8`, `RB9`, `RB11`, `RB-E1`)** |
| `FR-RPT-5` — a rebuild that aborts publishes nothing, so every report keeps its last good rows: the refusal returned is today's, the four reports and the offset/seen record are the pre-rebuild values, a never-applied store keeps its empty state and never invents a fresher stamp, and a retry replays from the same record (requirements 36.3) | L1 acceptance: `RB1`, `RB2`, `RB3`, `RB9` | **Pending** — `RB1`, `RB2`, `RB3`, `RB9` |
| `FR-RPT-6` — a report read answers one complete set, never a partial one, and is never refused for staleness: the answer is the pre-rebuild set until the swap and the post-rebuild set after it, the `asOf` belongs to that same set, the swap happens in one critical section, and an aborted rebuild leaves a reader the pre-rebuild set with its older stamp (requirements 36.3) | L1 acceptance: `RB4`, `RB7` | **Pending** — `RB4`, `RB7` |
| `FR-RPT-7` — a successful rebuild stays today's output, and a failure is observable through the rebuild call: the four reports and the offset record are exactly the current clear-and-replay output, re-applying a replayed event is a no-op, the operator sees the failure through the returned refusal and the unchanged last-good `asOf`, and no read route, response field, status field, or new operation reports rebuild state (requirements 36.3) | L1 acceptance: `RB5`, `RB8`, `RB9`; re-run: `RB6`, the existing guards in `RB12` | **Covered by re-run today for the idempotency and existing rebuild guards (`RB6`, `RB12`, `store_test.go:142`, `:273`) and pending the success comparator, the never-through-a-read case, and the observable pair (`RB5`, `RB8`, `RB9`)** |
| `BR-66` — a rebuild publishes only a fully replayed read model and an aborted rebuild changes nothing the desk can read; the candidate is built apart and installed in one swap; the failure returns today's refusal while the published projections, offsets, and `asOf` keep their values; a read answers one complete set and is never refused; a successful rebuild is exactly today's output; the failure is observable through the rebuild call, never through a read; the rule is fixed code, never per-hotel configuration (business rules section 8) | L1 acceptance + diff gate + evidence: `RB1`-`RB5`, `RB7`-`RB11`, `RB-E1` | **Pending** — `RB1`-`RB5`, `RB7`-`RB11`, `RB-E1`; today's breach is the in-place clear at `store.go:227-235` |
| `FR-RPT-1`..`FR-RPT-4` (MVP rows, unchanged) — occupancy, revenue, daily sheet, housekeeping still promise the same rows and `asOf` | L1 acceptance: the existing report guards unchanged, plus the success comparator on all four | **Covered by re-run today for the rows themselves (`RB12`, `store_test.go:63`, `:273`, `service_test.go:18`, `:46`, `handler_test.go:59`, `:131`, `perf_test.go:97`) and pending the whole-slice comparator (`RB5`)** — the MVP guard slots in section 1 stand unchanged and may not cite this slice |
| `NFR-PERF-1` / `NFR-PERF-2` (unchanged) — a read takes only the mutex it already takes and never waits for the replay; the rebuild's projection cost is the same work as today | L2 PERF: the unedited two-year perf guard, plus the `RB4` proof that the swap is the only rebuild-held lock | **Covered by re-run today** — `RB12`; `perf_test.go:97` and the `perf-reporting-variant` CI job must stay green unedited; a read wait introduced by the change fails the row |
| `NFR-CON-1` / `NFR-CON-2` (unchanged) — the mutex still guards every read and write, and the rebuild stays the single writer; concurrent rebuild calls are not serialised by this change | L1: the `-race` run and the unchanged mutex/`Apply` order | **Covered by re-run today** — `RB4`, `RB12`; `store.go:200-201`, `:226-236`, `:479`, `:534`, `:560`, `:633`; an unlocked read or a second writer fails the row |
| `NFR-I18N-1` (unchanged) — no sentence is added or changed; a failed rebuild reuses today's per-field catalogue sentences | Behaviour check: the catalogue byte-identical and the existing messages sample green | **Covered by re-run today** — `RB12`; `services/reporting/internal/messages/*`, `script/catalogue-coverage-check.sh`; a new key fails the row |
| `NFR-RPT-1` / `BR-62` (unchanged) — the 730-night cap and its before-the-lock refusal keep their behaviour | L1: the range-cap guards re-run with no edit | **Covered by re-run today** — `RB12`; `store_test.go:365`, `:383`, `:413`, `:457`, `service_test.go:105`, `:127`, `:160`, `handler_test.go:189`, `:239` |
| Contract and LC | Real delta: no contract file, token, operation, response field, catalogue key, schema, or migration changes; `contract-check`, `openapi-route-check`, and `catalogue-coverage-check` stay green | **Covered by re-run today** — `RB12`; `contracts/**`, `script/contract-check.sh`, `script/openapi-route-check.sh`, `script/catalogue-coverage-check.sh`; a contract change here is a re-tier finding (LLD 35.5, 35.7) |
| No-configuration and no-migration gate | Real delta: the publication rule is one code behaviour carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration is added and the migrated tables are untouched; one store remains | **Pending diff gate** — `RB10`, `RB11`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-66) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-RPT-5`..`FR-RPT-7` are behaviour-scoped additions outside the counted capability set and no NFR is added (requirements 36.2, 36.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`RB-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/642/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #642): 16 rows mapped to `AC-RPT-8`..`AC-RPT-10`,
`FR-RPT-5`..`FR-RPT-7`, `BR-66`, the unchanged `FR-RPT-1`..`FR-RPT-4`
and NFR rows, the contract/LC gate, the configuration/migration gate, the
MVP no-change gate, and `RB-E1`. Eight rows carry a re-run-today half
(the unchanged `FR-RPT-1`..`FR-RPT-4` rows, the `NFR-PERF`, `NFR-CON`,
`NFR-I18N`, and `NFR-RPT-1`/`BR-62` rows, the contract/LC row, and the
re-run halves inside `AC-RPT-10` and `FR-RPT-7`), and the rest are
**pending** the implementation PR — the rows whose guards are the registry
`RB1`-`RB11`, the `BR-66` evidence row, the MVP no-change gate, and
`RB-E1`. The slice is **not complete**
at this spec head; it completes when the implementation PR merges with
`RB1`-`RB12` green, the pins refreshed where the implementation moved a
line, `RB-E1` recorded, and `qa-lead` re-pins the rows at the merged
head. The MVP Coverage line below stands unchanged at 57/57.

## 29. Room state sellability slice (Refs #636)

Traceability for the #636 room-state sellability change (audit finding
M1): `checkSellability` subtracts date-ranged blocks but never reads
`room.state`, so an `out-of-order` room taken out of service for
maintenance — or an `occupied` one — was counted as sellable both in
the aggregate reply and in the single-room reply, and the desk could
sell it. From this change on, a room reads as sellable only when no
block covers the range and its state is neither `out-of-order` nor
`occupied`, in both stores. The done-conditions are
`docs/product/acceptance-criteria.md`
[section 29](../product/acceptance-criteria.md#29-room-state-counts-in-sellability-refs-636)
(`AC-SEL-1`..`AC-SEL-4`), the requirements `FR-SEL-1`..`FR-SEL-4` are
`docs/requirements/mvp-requirements.md`
[section 37](../requirements/mvp-requirements.md#37-room-state-counts-in-sellability-refs-636),
the business rule is `BR-67` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), the per-store
predicate, the single-room reply, the subtract-once rule, the per-flow
diagram, and the verification plan are LLD
[section 36](../architecture/lld.md#36-room-state-counts-in-sellability-refs-636)
(with HLD [section 28](../architecture/hld.md#28-room-state-counts-in-sellability-refs-636)),
and the guard registry `SL1`-`SL12` plus the evidence rule `SL-E1` are
`room-state-sellability-test-traceability.md`
[the testing spec](room-state-sellability-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched. The
slice adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-SEL-1` — the aggregate reply counts only rooms that are both block-free and in a sellable state: an `out-of-order` room and an `occupied` room are not counted for their type, the non-sellable list is exactly those two names while every vacant state (`vacant-dirty`, `vacant-clean`, `vacant-inspected`) stays sellable, `totalCount` keeps every room of the type, `blockedRooms` keeps today's content and order, a room both blocked and non-sellable is subtracted once so the count never goes below `0`, an empty type answers `0`/`0`, and both stores answer the same number (traces to US-RTE-2, US-RMS-1; `FR-RTE-2`, `FR-RMS-1`, `FR-RMS-3`, `BR-12`, `BR-67`) | L1 acceptance: the out-of-order and occupied negative cases, the subtract-once case, the vacant-state control, and the store-parity case | **Pending** — `SL1`, `SL2`, `SL3`, `SL4`, `SL5`; today's block-only arithmetic is `services/rooms/src/store.ts:383` and `services/rooms/src/pgstore.ts:384-389`, and the all-vacant control is `services/rooms/src/server.test.ts:268-303` |
| `AC-SEL-2` — the single-room path answers `totalCount: 1`, `sellableCount: 0`, `blockedRooms: []` for a block-free non-sellable room without claiming availability, so the Book confirm refuses with its existing sold-out sentence and creates no reservation; a block-free vacant room still answers `1`; a block-covered room keeps the `STATE_ILLEGAL` block refusal with its dates and reason, and that refusal outranks the state answer (traces to US-RTE-2, US-RMS-3; `FR-RTE-2`, `FR-RMS-3`, `BR-12`, `BR-67`) | L1 acceptance: the single-room non-sellable pair, the vacant control, the block-precedence case, plus the desk re-run | **Pending** — `SL6`, `SL7`; the desk half is **covered by re-run today** (`app/src/views/BookView.test.ts:989-1030`, `:1163-1189`, `app/src/views/BookView.vue:977-1011` on `origin/master` `b6ff53a`), and the block refusal today is `services/rooms/src/server.test.ts:502-527` |
| `AC-SEL-3` — block behaviour is unchanged: a room is named in `blockedRooms` for exactly the ranges a block covers, `BlockRoom`/`ReleaseBlock` keep their codes, statuses, details, and stored effect, releasing a block returns a room to sale only when its state is sellable, and no state is added, removed, renamed, or re-transitioned (traces to US-RMS-3; `FR-RMS-3`, `BR-12`) | L1 acceptance: the release-only-when-sellable case, plus the existing block guards re-run unedited | **Pending** for the release guard (`SL8`); **covered by re-run today** for the block guards themselves — `services/rooms/src/server.test.ts:502-527`, `:645-692`, `:693-717`, `services/rooms/src/pgstore.test.ts:59-111`, and the vocabulary/transition tables `services/rooms/src/store.ts:17-30`, `:34-40` |
| `AC-SEL-4` — the merged #631 ceiling is neither raised nor lowered (Reservations still derives `totalCount - len(blockedRooms)` and reads neither `sellableCount` nor room state), the response shape and error list stand with only the `sellableCount` description line naming room state, `contract-check` stays green, no catalogue key or desk surface changes, and the implementation carries the out-of-order aggregate, occupied aggregate, single-room out-of-order and occupied, blocked-and-out-of-order single-subtraction, and vacant-state control cases in both stores with the existing sellability and block guards green (traces to US-RTE-2, US-RES-1; `FR-RTE-2`, `FR-RTE-5`, `FR-RMS-3`, `NFR-CON-1`) | L1 acceptance + contract/LC + diff gates | **Pending** — `SL9`, `SL11` (with `SL1`-`SL8` carrying the case list); the ceiling's no-change side is `services/reservations/internal/availability/client.go:45-56` and `services/reservations/internal/availability/client_test.go:47`, and the existing sellability pins `services/rooms/src/server.test.ts:268-303`, `:502-527`, `:645-692` must stay green |
| `FR-SEL-1` — the aggregate count excludes the non-sellable states once per room, `totalCount` stays the type, `blockedRooms` keeps its membership and order, an empty type answers `0`/`0`, and both stores agree (requirements section 37.3) | L1 acceptance | **Pending** — `SL1`, `SL2`, `SL3`, `SL4`, `SL5` |
| `FR-SEL-2` — the single-room read never claims availability for a non-sellable room, a block-free vacant room still answers `1`, and a block-covered room keeps the block refusal and its precedence (requirements 37.3) | L1 acceptance | **Pending** — `SL6`, `SL7` |
| `FR-SEL-3` — block semantics and the room-state vocabulary stay exactly as they are: room state never adds a room to `blockedRooms`, the block operations keep their answers, a release returns a room to sale only when sellable, and no state or transition moves (requirements 37.3) | L1 acceptance + no-change re-run | **Pending** for `SL8`; **covered by re-run today** for the vocabulary (`services/rooms/src/store.ts:17-30`, `:34-40`) and the block guards named under `AC-SEL-3` |
| `FR-SEL-4` — the merged reservation ceiling and the read contract stay as they are, with only the `sellableCount` description line naming room state and `contract-check` green (requirements 37.3) | Diff gate + LC re-run | **Pending** — `SL9`, `SL11` |
| `BR-67` — a room reads as sellable only when no block covers the range and its state is neither `out-of-order` nor `occupied`; the aggregate subtracts each room once, `totalCount` and `blockedRooms` keep their meaning, every vacant state stays sellable, a block-free non-sellable single room answers `sellableCount: 0`, a block-covered room keeps the block refusal and its precedence, blocks and the vocabulary are unchanged, the #631 ceiling keeps reading `totalCount` and `blockedRooms` only, and the state list is fixed code, never per-hotel configuration (business rules section 2; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `SL1`-`SL9`, `SL11`, `SL-E1`; today's breach is the state-blind count at `services/rooms/src/store.ts:366` and `:383` |
| `FR-RTE-2` / `FR-RMS-1` / `FR-RMS-3` (MVP rows, unchanged) — availability and room inventory keep their wording: the availability count now keeps the promise it already made, and the state vocabulary and block semantics stand | L1 re-run: the existing MVP guards unchanged | **Covered by re-run today** — `services/rooms/src/server.test.ts:268-303`, `:349-403`, `:471-501`, `:502-527`, `:645-692`, `services/rooms/src/pgstore.test.ts:22-57`, `:59-111`; the MVP guard slots in section 1 stand unchanged and may not cite this slice |
| `NFR-CON-1` (unchanged) — the booking guard, its atomic shape, and the paired-attempt outcome do not move; the sellability read is not on the booking decision | L3 re-run plus the diff gate | **Covered by re-run today** — `services/rooms/src/server.test.ts:528-554` (paired assignments), `services/reservations/internal/availability/client_test.go:47`, and `SL9` (no Reservations edit); a booking-path hunk fails the row |
| `NFR-PERF-1` / `NFR-PERF-2` (unchanged) — the read adds one comparison per room inside the loop or query it already runs: no round trip, no poll, no new blocking | L2 PERF re-run, unedited | **Covered by re-run today** — `SL12`; the timed desk run and the `perf-reporting-variant` job must stay green with no edit |
| `NFR-I18N-1` (unchanged) — no sentence is added or changed; the sold-out and block sentences are reused | Catalogue gate, unedited | **Covered by re-run today** — `SL11`, `SL12`; `script/catalogue-coverage-check.sh` green with a byte-identical catalogue |
| Contract and LC | Real delta: one prose line in `contracts/http/CheckRoomTypeSellability.json` (`sellableCount` description plus its `traces`); no operation, route, property, required list, status, or error code moves | **Pending gate** — `SL11`; the contract edit is `architect`'s (LLD 36.6) |
| No-configuration and no-migration gate | Real delta: the non-sellable state list is one fixed code rule carried by no environment variable, `deploy/` file, compose file, or per-hotel setting, and no migration, column, backfill, or stored value is added | **Pending diff gate** — `SL9`, `SL11`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-67) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` wording moves; `FR-SEL-1`..`FR-SEL-4` are behaviour-scoped additions outside the counted capability set (requirements 37.2, 37.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`SL-E1`) | The aggregate and single-room before/after pairs, the `TEST_PG_URL` Postgres parity run, and the slice row in the test report | **Pending** — `docs/testing/evidence/636/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #636): 17 rows mapped to `AC-SEL-1`..`AC-SEL-4`,
`FR-SEL-1`..`FR-SEL-4`, `BR-67`, the unchanged `FR-RTE-2`/`FR-RMS-1`/
`FR-RMS-3`, `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, and `NFR-I18N-1`
rows, the contract/LC gate, the configuration/migration gate, the MVP
no-change gate, and `SL-E1`. Seven rows carry a re-run-today half (the
unchanged MVP rows, the three NFR rows, the block/vocabulary halves
inside `AC-SEL-3` and `FR-SEL-3`, and the desk half inside `AC-SEL-2`),
and the rest are **pending** the
implementation PR — the rows whose guards are the registry
`SL1`-`SL12`, the gates, and `SL-E1`. The slice is **not complete** at
this spec head; it completes when the implementation PR merges with
`SL1`-`SL12` green, `SL5`'s Postgres half recorded on a lab database,
`SL-E1` recorded, and `qa-lead` re-pins the rows at the merged head.
The MVP Coverage line below stands unchanged at 57/57.

## 30. Rates fail-closed restriction and availability input slice (Refs #633)

Traceability for the #633 Rates fail-closed input change (audit
findings T1–T3): `UpsertRestriction` coerces a non-boolean
`closedToArrival` to `false` and stores any `roomTypeId` string, so a
manager's closed-to-arrival window silently never applies and a typo
creates a window that matches nothing; `CheckSellableCount` answers
whatever `totalUnits` the caller sent; `QuotePrice` sums `int64` with no
overflow guard; and rate-plan text has no bound while a non-string
description becomes empty. From this change on, each of those inputs is
refused when it cannot be honoured, and the availability count is the
server's plan default. The done-conditions are
`docs/product/acceptance-criteria.md`
[section 30](../product/acceptance-criteria.md#30-rates-refuses-malformed-restriction-and-availability-input-refs-633)
(`AC-RTE-6`..`AC-RTE-10`), the requirements `FR-RTE-6`..`FR-RTE-10` are
`docs/requirements/mvp-requirements.md`
[section 38](../requirements/mvp-requirements.md#38-rates-refuses-malformed-restriction-and-availability-input-refs-633),
the business rule is `BR-68` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), where each
check sits, the precedence rule, the overflow helper set, the per-flow
diagrams, and the verification plan are LLD
[section 37](../architecture/lld.md#37-rates-refuses-malformed-restriction-and-availability-input-refs-633)
(with HLD [section 29](../architecture/hld.md#29-rates-refuses-malformed-restriction-and-availability-input-refs-633)),
and the guard registry `RTE1`-`RTE14` plus the evidence rule `RTE-E1` are
`rates-input-refusal-test-traceability.md`
[the testing spec](rates-input-refusal-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today and must keep passing untouched — with
the four fixture re-seeds the testing spec section 2 names. The slice
adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-RTE-6` — a present `closedToArrival` must be `true` or `false`: a `true` window still refuses an arrival inside its dates with `STATE_ILLEGAL` naming `closed-to-arrival`, a `false` window never refuses on that ground, an omitted field stores `false`, and any non-boolean (`"true"`, `1`, `"yes"`, `null`) is refused 400 `VALIDATION_FAILED` naming `closedToArrival` with nothing stored, no event, and no silent `false` reaching the store (traces to US-RTE-4; `FR-RTE-4`, `FR-RTE-6`; `BR-10`, `BR-68`) | L1 acceptance: the four non-boolean refusals with their stored-effect proof, the two accepted booleans, and the omitted default | **Pending** — `RTE1`; **covered by re-run today** for the accepted `true`/outside-window half (`services/rates/internal/handler/handler_test.go:116-137`, `services/rates/internal/store/postgres_test.go:112-134` after its re-seed); today's coercion is `services/rates/internal/handler/handler.go:234` |
| `AC-RTE-7` — a restriction binds only to a room type Pricing can price: a non-UUID is refused 400 `VALIDATION_FAILED` naming `roomTypeId` in both stores, a UUID no rate-price row mentions is refused 404 `NOT_FOUND` naming the type with nothing stored and no event, and a priced type is stored and applied exactly as today whatever its `defaultUnits` is or is not (traces to US-RTE-4; `FR-RTE-4`, `FR-RTE-7`; `BR-10`, `BR-44`, `BR-68`) | L1 acceptance: the malformed-id pair, the unpriced-UUID case, the priced-type positive control, and the `defaultUnits`-is-not-a-price case | **Pending** — `RTE3`, `RTE4`; **covered by re-run today** for the accepted priced write (`services/rates/internal/handler/handler_test.go:99-114`, `:116-137`, `services/rates/internal/store/postgres_test.go:91-111`, `:112-134` after their price seeds); the Postgres malformed-id answer already exists at `services/rates/internal/store/postgres.go:170-172` |
| `AC-RTE-8` — the availability answer is the server's plan default (the first plan in name order that prices the type and carries a `defaultUnits`, else `0`); a request `totalUnits` neither raises nor lowers it and is refused 400 naming the field when it is not an integer at or above zero; an unknown type refuses 404 `NOT_FOUND` whether or not the field is present; the response shape, per-date list, date-order refusal, both stores, and the #631 ceiling are unchanged (traces to US-RTE-2; `FR-RTE-2`, `FR-RTE-8`; `BR-9`, `BR-47`, `BR-68`) | L1 acceptance: the plan-default cases (small and huge field values), the no-default `0` case, the shape refusals, the unknown-type pair, and the unchanged ceiling re-run | **Pending** — `RTE6`, `RTE7`, `RTE8`; today's caller-set count is `services/rates/internal/store/store.go:347-355` / `postgres.go:380-393`, and the split unknown-type answers are `store.go:364-369` / `postgres.go:402-407` |
| `AC-RTE-9` — a quote whose nightly sum, percent multiplication, or amount subtraction would leave the `int64` range refuses `STATE_ILLEGAL` (422) naming `roomTypeId` with `reason: "total_overflow"` and no total and no partial nights list, while every non-overflowing quote is byte-identical (same breakdown, truncated percent, zero clamp, 730-night cap) and no write-time price ceiling or migration is added (traces to US-RTE-1, US-RTE-5; `FR-RTE-1`, `FR-RTE-3`, `FR-RTE-5`, `FR-RTE-9`; `BR-13`, `BR-14`, `BR-52`, `BR-68`) | L1 acceptance: the sum-overflow and multiply-overflow cases with the no-partial-result assertion, plus the byte-identical re-run | **Pending** — `RTE9`, `RTE10`; **covered by re-run today** for the byte-identical half (`services/rates/internal/store/store_test.go:71-95`, `:96-130`, `services/rates/internal/handler/handler_test.go:138-164`, `:165-195`, `services/rates/internal/store/postgres_test.go:135-192`, `:193-229`); today's unchecked arithmetic is `store.go:274`, `:284`, `:286-289` / `postgres.go:289`, `:303`, `:305-308` |
| `AC-RTE-10` — plan `name` is at most 64 and `description` at most 2 000 code points on write, both code constants in both stores; a refused write stores, overwrites, and truncates nothing; a present non-string `name` or `description` is refused naming the field instead of becoming empty; an absent `description` keeps today's empty value; upsert semantics are unchanged; and there is no migration, backfill, or read-time re-validation (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-RTE-10`; `NFR-I18N-1`, `BR-68`) | L1 acceptance: the two boundary pairs (64/65, 2 000/2 001) in code points, the non-string pair, the update-keeps-the-row case, and the pre-bound stored row that still quotes | **Pending** — `RTE12`, `RTE13`; today's unbounded/coerced read is `services/rates/internal/handler/handler.go:158-163` and the unchecked stores are `store.go:161-176` / `postgres.go:83-113` |
| `FR-RTE-6` — a present `closedToArrival` is a JSON boolean or the write is refused, the accepted path unchanged, the omitted default kept (requirements 38.3) | L1 acceptance | **Pending** — `RTE1`; **covered by re-run today** for the accepted `true` half (`services/rates/internal/handler/handler_test.go:116-137`) |
| `FR-RTE-7` — a restriction binds only to a UUID room type Pricing prices, `VALIDATION_FAILED` for the shape and `NOT_FOUND` for the unpriced type, nothing stored and no event in either store, with a priced type still accepted whatever its `defaultUnits` (requirements 38.3) | L1 acceptance | **Pending** — `RTE3`, `RTE4`; **covered by re-run today** for the accepted priced write (`handler_test.go:99-114`) |
| `FR-RTE-8` — the availability count is the plan default, else `0`, and `totalUnits` is advisory, shape-checked, and never sets the count, with an unknown type refused `NOT_FOUND` with or without the field (requirements 38.3) | L1 acceptance | **Pending** — `RTE6`, `RTE7`, `RTE8` |
| `FR-RTE-9` — a quote the service cannot represent is refused `STATE_ILLEGAL` with `reason` `total_overflow` and no total or nights, every non-overflowing quote byte-identical, both stores (requirements 38.3) | L1 acceptance | **Pending** — `RTE9`, `RTE10`; **covered by re-run today** for the byte-identical half (`store_test.go:71-95`, `handler_test.go:165-195`, `postgres_test.go:193-229`) |
| `FR-RTE-10` — plan `name` at most 64 and `description` at most 2 000 code points on write, non-strings refused naming the field, no truncation, no read-time re-validation, upsert semantics unchanged (requirements 38.3) | L1 acceptance | **Pending** — `RTE12`, `RTE13` |
| `BR-68` — the five fail-closed input rules for Rates: the boolean, the priced type, the advisory count, the overflow refusal with no partial total, and the two text bounds with non-string refusals, all fixed code rules with no per-hotel setting (business rules section 3; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `RTE1`-`RTE14`, `RTE-E1` |
| `FR-RTE-1` / `FR-RTE-2` / `FR-RTE-4` / `FR-RTE-5` (MVP rows, unchanged) — rate plans, the availability overview, stay restrictions, and the frozen price basis keep their wording and their guards; this change makes the service honour the promises they already made | L1 re-run: the four MVP guard slots in section 1, unedited | **Covered by re-run today** — `services/rates` `TestDeskLoopSetRateSearchQuote`, `TestQuoteAppliesNamedDiscount`, `TestQuoteAppliesAmountDiscount`, `TestQuoteBreakdownSumsToTotal`, `TestRestrictionRefusalNamesRestriction`, `TestClosedToArrivalRefusalNamesRestriction` and their Postgres twins; the MVP rows in section 1 stand unchanged and may not cite this slice as their guard |
| `NFR-I18N-1` (unchanged) — every new refusal resolves through the catalogue, renders no envelope code, status number, or stack text, carries the bound through `{max}`, and keeps the English and Vietnamese key sets at parity with matching placeholders | Catalogue gate | **Pending** — `RTE14` and the sampled assertions in `services/rates/internal/messages/messages_test.go`; `script/catalogue-coverage-check.sh` green with the new keys in `messages/en.json`, the eight byte-identical mirrors, and `messages/vi.json` at parity |
| `NFR-BND-1`..`NFR-BND-3`, `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-AUD-1`, `NFR-TZ-1` (unchanged) — no route, body ceiling, lock, transaction, round trip, outside dependency, event, or date format moves | No-change re-run | **Covered by re-run today** — the body-bound and server-timeout guards, the paired-attempt guards, the timed desk run, and the two e2e scripts; a new route, body bound, or migration fails `RTE14` |
| Contract and LC | Real delta: `UpsertRestriction` gains a `NOT_FOUND` error line and the when-line names the non-boolean flag and the malformed id; `CheckSellableCount`'s `totalUnits` description becomes advisory-only; `QuotePrice` gains the `STATE_ILLEGAL` `total_overflow` line; `UpsertRatePlan` gains no `maxLength`; no operation, route, property, required list, status, or enum token is added | **Pending gate** — `RTE14`; the contract edits are `architect`'s (LLD 37.5) and the fixtures stay shape-only |
| No-configuration and no-migration gate | Real delta: the five rules are fixed code constants carried by no environment variable, `deploy/` file, compose file, or per-hotel setting, and no migration, column, backfill, truncation, or stored-value rewrite is added | **Pending diff gate** — `RTE14`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-68) |
| No-desk-change gate | Real delta: no desk screen sends the two operations whose refusals move, and the one browser flow that writes a restriction does so on a priced type | **Pending gate** — `RTE14`; the pins are `app/e2e/book.spec.ts:140-161` and `app/e2e/desk-flow.ts:154-167` |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` capability wording moves; `FR-RTE-6`..`FR-RTE-10` are behaviour-scoped additions outside the counted capability set (requirements 38.2, 38.3) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`RTE-E1`) | The five before/after pairs, the `TEST_PG_URL` Postgres parity run, and the slice row in the test report | **Pending** — `docs/testing/evidence/633/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #633): 19 rows mapped to `AC-RTE-6`..`AC-RTE-10`,
`FR-RTE-6`..`FR-RTE-10`, `BR-68`, the unchanged MVP rows
`FR-RTE-1`/`FR-RTE-2`/`FR-RTE-4`/`FR-RTE-5`, `NFR-I18N-1`, the
no-change NFR group, the contract/LC gate, the configuration/migration
gate, the no-desk-change gate, the MVP no-change gate, and `RTE-E1`.
Eight rows carry a re-run-today half (the unchanged MVP row, the
no-change NFR row, and the accepted-write or byte-identical halves
inside `AC-RTE-6`, `AC-RTE-7`, `AC-RTE-9`, `FR-RTE-6`, `FR-RTE-7`, and
`FR-RTE-9`); the other eleven are **pending** the implementation PR. The
slice is **not complete** at this spec head; it completes when the
implementation PR merges with `RTE1`-`RTE14` green, the Postgres halves
recorded on a scratch database, `RTE-E1` recorded, and `qa-lead` re-pins
the rows at the merged head. The MVP Coverage line below stands
unchanged at 57/57.

## 31. Room capacity validation slice (Refs #637)

Traceability for the #637 capacity-validation change (audit finding M3,
capacity half): both room inventory writes keep a `capacity` only when
`typeof input.capacity === "number"`
(`services/rooms/src/store.ts:248` for `UpsertRoomType`, `:279` for
`UpsertRoom`; the Postgres twins at `services/rooms/src/pgstore.ts:146`,
`:207`), so a negative or zero value is stored, `2.5` is kept in memory
and rounded by the Postgres `INT` cast, `1e999` — `Infinity` after
`JSON.parse` (`services/rooms/src/server.ts:63`) — fails the driver and
answers `INTERNAL_ERROR` 500 (`server.ts:95-101`), `NaN` passes a direct
store call, and a present non-number (`"2"`, `null`, `true`, `[2]`) is
silently dropped and answered as success, while the service's own
contracts already declare `capacity` as `{"type": "integer", "minimum":
1}` (`contracts/http/UpsertRoom.json:19`,
`UpsertRoomType.json:16`) and the LLD already lists `VALIDATION_FAILED`
for both operations. From this change on, one shared check inside the
store refuses every present value that is not a whole number of at least
`1`, writes nothing, emits no `room-upserted` event, and never answers a
500 for a value the service can name; the onboarding wizard's sentence
matches the same floor in both locales. The done-conditions are
`docs/product/acceptance-criteria.md`
[section 31](../product/acceptance-criteria.md#31-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637)
(`AC-CAP-1`..`AC-CAP-4`), the requirements `FR-CAP-1`..`FR-CAP-4` and
`BR-69` are `docs/requirements/mvp-requirements.md`
[section 39](../requirements/mvp-requirements.md#39-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637)
and `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), where the check
sits, the value classes, the refusal contract, the per-flow diagrams,
and the verification plan are LLD
[section 38](../architecture/lld.md#38-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637)
(with HLD [section 30](../architecture/hld.md#30-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637)
and the refreshed Rooms flowcharts,
[section 11](../architecture/services/rooms.md#11-as-built-delta--capacity-is-a-whole-number-of-at-least-1-refs-637)),
and the guard registry `CAP1`-`CAP10`, the residual-risk record
`CAP-R1`, and the evidence rule `CAP-E1` are
`capacity-validation-test-traceability.md`
[the testing spec](capacity-validation-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the Rooms suites today send whole capacities only (`2` and `4`) and hold
no capacity-refusal guard, so the implementation PR creates every
registry guard and `qa-lead` re-pins the row with `file:line` at the
merged head. Rows marked covered by re-run rest on pins that exist and
pass today (base `origin/master` `d287b00`, all check-runs `success`)
and must keep passing untouched — no fixture re-seed is needed because
every fixture already carries a whole capacity. The slice adds no MVP
capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-CAP-1` — a present `capacity` that is an integer at or above `1` is stored verbatim and read back unchanged, including values above the manage form's `20` sanity bound; an omitted capacity keeps today's meaning (a create stores none, an update keeps the stored one); no other field moves (traces to US-ADM-2, US-ADM-3, US-RMS-4; `FR-RMS-4`, `FR-ADM-3`, `FR-CAP-1`; `BR-69`) | L1 acceptance: the `1`/`21`/`2.0` accepted cases on both operations and both stores, the read-back per operation, the omitted-create and omitted-update cases, and the unchanged fields | **Pending** — `CAP1`, `CAP2`; **pinned today** for the accepted write path only (`services/rooms/src/server.test.ts:268-303`, `:349-368`; `services/rooms/src/pgstore.test.ts:22-57`); today's assertion is `store.ts:248`, `:279` / `pgstore.ts:146`, `:207` |
| `AC-CAP-2` — a negative, zero, fractional, non-finite (`1e999` over HTTP, `Infinity` directly), `NaN`, or non-number (`"2"`, `null`, `true`, `[2]`) capacity is refused `VALIDATION_FAILED` (400) naming `capacity` in `details.field`, in both operations and both stores, with nothing created or overwritten, no `room-upserted` event, and never an `INTERNAL_ERROR` 500 (traces to US-ADM-2, US-ADM-3, US-RMS-4; `FR-RMS-4`, `FR-ADM-3`, `NFR-I18N-1`, `FR-CAP-2`; `BR-69`) | L1 acceptance: every value class in both operations and both stores, the full 400 envelope, the stored-effect proof, the no-event proof, and the never-500 proof | **Pending** — `CAP3`, `CAP4`, `CAP7`; the 500 catch-all today is `services/rooms/src/server.ts:95-101` and the accepted non-number drop is `store.ts:248`, `:279` / `pgstore.ts:221` |
| `AC-CAP-3` — the two stores refuse identically from one shared check inside the store, with no migration, `CHECK`, backfill, truncation, or read-time re-validation, so a value already stored keeps reading as today (traces to `FR-RMS-4`, `FR-ADM-3`, `NFR-CON-1`, `FR-CAP-3`; `BR-69`) | L1 acceptance + diff gate: parity of accepted and refused answers, the pre-change stored value still readable, one helper, no migration | **Pending** — `CAP5`, `CAP9`; today's divergence is the memory verbatim save (`store.ts:248`, `:279`) versus the Postgres `INT` write (`pgstore.ts:164-186`, `:219-255`) |
| `AC-CAP-4` — the onboarding wizard refuses a capacity below `1` in plain words before sending, in English and Vietnamese, and the manage screen's own rule is unchanged (traces to US-ADM-3; `FR-ADM-3`, `FR-MGMT-3`, `NFR-I18N-1`, `FR-CAP-4`; `BR-69`) | L1 acceptance: the four refused inputs on screen with no request, the accepted `1`/`21`, the empty-field case, the Vietnamese sentence, and the unchanged manage screen | **Pending** — `CAP6`, `CAP7`; today's `0`-accepting rule is `app/src/views/OnboardingView.vue:579-581`, `:857-864` and the sentence `messages/en.json:700`, `messages/vi.json:700`, with the manage pin `app/src/views/ManageView.test.ts:414-433` |
| `FR-CAP-1` — a whole capacity of at least 1 is stored verbatim and read back, above the form bound too; an omitted value keeps create-none/update-keeps (requirements 39.3) | L1 acceptance | **Pending** — `CAP1`, `CAP2` |
| `FR-CAP-2` — an unusable capacity is refused by name in both operations and both stores with nothing written, no event, and never a 500 (requirements 39.3) | L1 acceptance | **Pending** — `CAP3`, `CAP4` |
| `FR-CAP-3` — one shared check inside the store; stored rows do not move; a pre-change stored value keeps reading as today; both stores answer identically (requirements 39.3) | L1 acceptance + diff gate | **Pending** — `CAP5`, `CAP9` |
| `FR-CAP-4` — the onboarding wizard refuses a capacity below the server floor before sending, in both locales, and the manage screen is unchanged (requirements 39.3) | L1 acceptance | **Pending** — `CAP6` |
| `BR-69` — the capacity write rule: a present capacity is a whole number of at least 1 stored verbatim, every other present value refused naming `capacity` with nothing written and no `room-upserted` event, an omitted value keeping create-none/update-keeps, one shared check in code, no migration or read-time re-validation, the wizard at the same floor, and the floor a fixed code rule (business rules section 6; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `CAP1`-`CAP10`, `CAP-E1` |
| `FR-RMS-4` / `FR-ADM-3` / `FR-MGMT-3` (MVP rows, unchanged) — room setup and attributes, owner room and type setup, and the manage form's filled-field rule keep their wording and their guards; this change makes the service honour the contract those rows already sit on | L1 re-run: the three MVP guard slots in section 1, unedited | **Covered by re-run today** — `services/rooms/src/server.test.ts:349-402` (`FR-ADM-3`), `:268-303` and `:305-327` (`FR-RMS-4` setup/inventory), and `app/src/views/ManageView.test.ts:414-433` (`FR-MGMT-3`); the MVP rows in section 1 stand unchanged and may not cite this slice as their guard |
| `NFR-I18N-1` (unchanged) — the new server refusal and the updated wizard sentence resolve through the catalogue, render no envelope code, status number, or stack text, carry the field through `{field}`, and keep the English and Vietnamese key sets at parity with matching placeholders | Catalogue gate | **Pending** — `CAP7`; `script/catalogue-coverage-check.sh` must be green with the new key in `messages/en.json`, the eight byte-identical mirrors, and `messages/vi.json` at parity |
| `NFR-BND-1`..`NFR-BND-3`, `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-AUD-1`, `NFR-TZ-1` (unchanged) — no route, body ceiling, lock, transaction, round trip, outside dependency, event, or date format moves; the check is one integer test before a write the service already makes | No-change re-run | **Covered by re-run today** — the #630 body-bound and server-timeout guards, the paired-assignment guards, the timed desk run, and the audit-actor suite; a new route, body bound, or migration fails `CAP9` |
| Contract and LC | Real delta: each `VALIDATION_FAILED` `when` line names the capacity case; no operation, route, property, required list, status, enum token, or `maximum` is added; the fixtures stay shape-only with `capacity: 2` | **Pending gate** — `CAP8`; the contract edits are `architect`'s (LLD 38.5) and the fixtures stay shape-only |
| No-configuration and no-migration gate | Real delta: the floor is one code constant carried by no environment variable, `deploy/` file, compose file, or per-hotel setting, and no migration, column, `CHECK`, backfill, truncation, or stored-value rewrite is added | **Pending diff gate** — `CAP9`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-69) |
| No-desk-regression gate | Real delta: the manage screen is byte-identical (`1..20` still client-side), the wizard's only change is the floor sentence and its rule, and no other desk control, label, state, or copy moves; the two e2e paths that write capacity `2` stay green | **Pending gate** — `CAP9`, `CAP6`; the pins are `app/src/views/ManageView.test.ts:414-433`, `app/e2e/manage.spec.ts:78-89`, and `script/e2e-desk-loop.sh:271` |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` capability wording moves; `FR-CAP-1`..`FR-CAP-4` are behaviour-scoped additions outside the counted capability set (requirements 39.2, 39.3) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Residual risk `CAP-R1` | The contract-admitted value above the Postgres `INT` range still answers a driver-error 500 on the Postgres store; the slice neither bounds nor migrates it, and no guard may assert its refusal | **Recorded, not guarded** — R-24, LLD 38.6, and the testing spec's `CAP-R1` row; a fix (declared maximum or `BIGINT`) is its own decision |
| Evidence cross-reference (`CAP-E1`) | The before/after pairs, the `TEST_PG_URL` Postgres parity run, and the slice row in the test report | **Pending** — `docs/testing/evidence/637/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #637): 18 rows mapped to `AC-CAP-1`..`AC-CAP-4`,
`FR-CAP-1`..`FR-CAP-4`, `BR-69`, the unchanged MVP rows
`FR-RMS-4`/`FR-ADM-3`/`FR-MGMT-3`, `NFR-I18N-1`, the no-change NFR
group, the contract/LC gate, the configuration/migration gate, the
no-desk-regression gate, the MVP no-change gate, the residual-risk
record `CAP-R1`, and `CAP-E1`. Three rows carry a pinned-today half (the
unchanged MVP row, the no-change NFR row, and the accepted-write half
inside `AC-CAP-1`); the other fifteen are **pending** the implementation
PR. The slice is **not complete** at this spec head; it completes when
the implementation PR merges with `CAP1`-`CAP10` green, the Postgres
halves recorded on a scratch database, `CAP-E1` recorded, and `qa-lead`
re-pins the rows at the merged head. The MVP Coverage line below stands
unchanged at 57/57.

## 33. Failed rate-plan write slice (Refs #767)

Traceability for the #767 plan-upsert fault: the Rates Postgres store
discards the plan statement's error and returns the request-shaped plan
(`services/rates/internal/store/postgres.go:104-110`, the
`return plan, nil` at `:109`), so the handler answers `200` with an
empty `id` (`services/rates/internal/handler/handler.go:226-231`) while
no `rates.rate_plans` row was stored and no `rate-plan-changed` event
was emitted; the next `UpsertRatePrice` for that name answers
`NOT_FOUND` (`services/rates/internal/store/postgres.go:135`). From this
change on, a driver failure on the plan write returns
`(nil, storeFailure())` — the same answer `UpsertRatePrice` already
gives — so the handler answers the existing store-failure envelope at
HTTP 500 and never a success envelope, nothing is written and no event
is emitted, and the same request retried after the database recovers
creates the plan normally, while the healthy create and update keep
their stored values, event, and `200` body unchanged. The done-conditions
are `docs/product/acceptance-criteria.md`
[section 33](../product/acceptance-criteria.md#33-a-failed-rate-plan-write-is-refused-never-reported-as-success-refs-767)
(`AC-PLN-1`..`AC-PLN-4`), the requirements `FR-PLN-1`..`FR-PLN-5` and
`BR-71` are `docs/requirements/mvp-requirements.md`
[section 41](../requirements/mvp-requirements.md#41-a-failed-rate-plan-write-is-refused-never-reported-as-success-refs-767)
and `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), where the
branch sits, exactly which `*OpError` it returns, the transaction and
rollback semantics, retryability, the per-flow diagrams, the contract
and verification plan, and the residual risks are LLD
[section 40](../architecture/lld.md#40-a-failed-rates-rate-plan-write-is-refused-never-reported-as-success-refs-767)
(with HLD [section 32](../architecture/hld.md#32-a-failed-rates-rate-plan-write-is-refused-never-reported-as-success-refs-767)
and the refreshed Rates flowcharts,
[section 4](../architecture/services/rates.md#4-failurerollback-flowchart)),
and the guard registry `PLN-1`-`PLN-9`, the residual-risk record
`PLN-R1`, and the evidence rule `PLN-E1` are
`plan-upsert-failure-test-traceability.md`
[the testing spec](plan-upsert-failure-test-traceability.md).

Status is `pending` where the guard does not exist at this spec head:
the Rates suite holds no plan-write failure guard, so the implementation
PR creates every registry guard and `qa-lead` re-pins the row with
`file:line` at the merged head. Rows marked covered by re-run rest on
pins that exist and pass today (base `origin/master` `1eab7cb`, all
check-runs `success`) and must keep passing untouched — no fixture
re-seed is needed because this change touches no request or fixture.
The slice adds no MVP capability, so the 57-row MVP count stands
unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-PLN-1` — a Postgres store whose plan write cannot succeed returns a `nil` plan and the existing store-failure answer (the `rates.store.unavailable` sentence, empty `details`, a fresh `traceId`), never the request-shaped plan or an empty `id`, and no `rates.rate_plans` row and no `rate-plan-changed` row appear (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`; `BR-59`) | L1 acceptance: the forced-failure refusal on the closed-pool and stubbed-driver shapes, the full envelope, and the no-row/no-event proof | **Pending** — `PLN-1`, `PLN-2`; **pinned today** only for the faulty branch (`services/rates/internal/store/postgres.go:104-110`) and the sibling answer (`:135`, `:150`) |
| `AC-PLN-2` — the failing Postgres database makes `POST /v1/rates/UpsertRatePlan` answer HTTP 500 with the shared envelope and never `200` with an empty or fabricated `id`; the Manage screen shows its existing failure sentence and does not advance, and a retry against a healthy database creates the plan (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-ADM-4`; `BR-59`) | L1 acceptance: the 500 envelope over a real store and a stub repository, the never-200 proof, the desk sentence and no-price-write proof, and the retry | **Pending** — `PLN-3`, `PLN-4`, `PLN-8`; **pinned today** only for the desk success twins (`app/src/views/ManageView.test.ts:633-662`, `:754-786`) |
| `AC-PLN-3` — a healthy database keeps the stored row values, the one `rate-plan-changed` outbox row, and the `200` body identical to today's, an update omitting `defaultUnits` keeps the stored one, the in-memory store answers exactly as now, and no contract, schema, migration, status set, catalogue key, desk control, or print rule moves (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-RTE-10`) | L1 acceptance + diff gate: the create/update row, the per-write event, the byte-identical body, the in-memory create-only emit, and the no-move diff | **Pending** — `PLN-5`, `PLN-7`; **covered by re-run today** for the existing healthy halves (`services/rates/internal/store/postgres_test.go:58-98`, `services/rates/internal/store/fail_closed_test.go:155-191`, `services/rates/internal/handler/handler_test.go:34-45`) |
| `AC-PLN-4` — the guard suite exercises the driver failure, asserts AC-PLN-1's refusal, AC-PLN-2's absent success body, and the absent outbox row, fails if the error is swallowed again, and `go test ./...` in `services/rates` is green with and without `TEST_PG_URL` while the existing healthy-path guards pass (traces to `AC-PLN-1`..`AC-PLN-3`; `FR-RTE-1`) | L1 acceptance: the guard-to-anti-regression pin, the suite green in both configurations, and the untouched healthy guards | **Pending** — `PLN-1`-`PLN-5`, `PLN-9`; **covered by re-run today** for the suite's current green state (`go-build (rates)` `success` at `1eab7cb`) |
| `FR-PLN-1` — a failed plan write returns the store-failure answer and no plan, never a request-shaped plan, an empty `id`, or a partial record (requirements 41.3) | L1 acceptance | **Pending** — `PLN-1` |
| `FR-PLN-2` — nothing is stored and no `rate-plan-changed` event is emitted on a failed write, so no phantom plan can be read, priced, or quoted (requirements 41.3) | L1 acceptance | **Pending** — `PLN-2`; **covered by re-run today** for the in-memory refusal twin (`services/rates/internal/store/fail_closed_test.go:155-191`) |
| `FR-PLN-3` — the handler answers the store-failure envelope at 500 and never a `200` with an empty or fabricated `id`; the Manage screen shows its existing failure sentence and does not advance (requirements 41.3) | L1 acceptance | **Pending** — `PLN-3`, `PLN-8` |
| `FR-PLN-4` — the same request retried after the database recovers creates or updates the plan exactly as a healthy write, with no replay, repair, or duplicate of the failed attempt and no event from it (requirements 41.3) | L1 acceptance | **Pending** — `PLN-4` |
| `FR-PLN-5` — a healthy create and update keep the stored row values (including the stored `defaultUnits` on an omitted update), the event the store emits today, and the `200` body; the in-memory store answers as now; no contract, schema, migration, status set, catalogue key, desk control, or print rule moves (requirements 41.3) | L1 acceptance + diff gate | **Pending** — `PLN-5`, `PLN-7`; **covered by re-run today** for the create half (`services/rates/internal/store/postgres_test.go:58-98`, `services/rates/internal/handler/handler_test.go:47-82`) |
| `BR-71` — a rate-plan write the store could not perform is a failure, never a stored plan: the existing store-failure answer and no plan, the handler's failure envelope and never a 2xx, nothing stored for the named failure classes and no `rate-plan-changed` event, a retriable request, and the healthy create/update row, event, and response unchanged, in both stores; a fixed code rule (business rules section 3; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `PLN-1`-`PLN-9`, `PLN-E1` |
| Both stores store nothing on a refusal — the Postgres driver-failure refusal (`PLN-1`, `PLN-2`) and the in-memory bound refusal (`TestUpsertRatePlanTextBounds`, `TestRatePlanTextBounds`) each leave the plan set and the event stream unchanged, and the in-memory store gains no driver failure and no new failure mode | L1 acceptance + diff gate | **Pending** — `PLN-1`, `PLN-2`, `PLN-7`; **covered by re-run today** for the in-memory refusal (`services/rates/internal/store/fail_closed_test.go:155-191`, `services/rates/internal/handler/fail_closed_test.go:343-378`) |
| `FR-RTE-1` / `FR-RTE-10` / `FR-ADM-4` (MVP rows, unchanged) — rate plans, the plan text bounds, and rate-plan/policy setup keep their wording and their guards; this change makes the service report a write it could not perform as a failure rather than widening any FR | L1 re-run: the MVP guard slots in section 1, unedited | **Covered by re-run today** — `services/rates` `TestDeskLoopSetRateSearchQuote` (`services/rates/internal/handler/handler_test.go:47-82`); the MVP rows in section 1 stand unchanged and may not cite this slice as their guard |
| `AC-MANAGE-7` / `AC-RTE-10` (unchanged conditions with the new pointers) — the Manage screen's create action reports a failed plan write in its existing sentence and does not advance, and a failed plan write stores nothing while a healthy one answers as today; both conditions stand as written otherwise | L1 re-run + new desk failure case | **Pending** — `PLN-8`; **covered by re-run today** for the success paths (`app/src/views/ManageView.test.ts:633-662`, `:754-786`) |
| `NFR-I18N-1` (unchanged) — the failure reuses the existing `rates.store.unavailable` catalogue sentence, renders no envelope code, status number, driver, SQL, host, or stack text, and adds no catalogue key, so the English and Vietnamese key sets stay at parity | Catalogue gate | **Covered by re-run today** — `script/catalogue-coverage-check.sh` is green at `1eab7cb`; `PLN-7` fails a new key and `PLN-3` asserts the plain sentence |
| `NFR-AUD-1` (unchanged) — a refused write records nothing and emits no event; a committed write keeps its actor and timestamp exactly as today | L1 acceptance + no-change re-run | **Pending** — `PLN-2`, `PLN-5`; **covered by re-run today** for the committed-write actor on the sibling paths (`services/rates/internal/store/postgres.go:95-101`, the `'system'` actor) |
| `NFR-BND-1`..`NFR-BND-3`, `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-TZ-1` (unchanged) — no route, body ceiling, server timeout, lock, transaction, round trip, outside dependency, or date format moves; the change is one error test on a write the service already serves | No-change re-run | **Covered by re-run today** — the #630 body-bound and timeout guards, the paired-attempt guards, the timed desk run, and the timezone guards; a new route, body bound, or migration fails `PLN-7` |
| Contract and LC | Real delta: none. `contracts/http/UpsertRatePlan.json` keeps its request/response schema, required lists, and two error entries; no 500 line and no envelope token is added; the response still requires `id` as a UUID; the fixture is unchanged | **Pending gate** — `PLN-6`; no contract edit is required (LLD 40.5 records why the pair is left consistent) |
| No-configuration and no-migration gate | Real delta: none. The refusal is the existing code path carried by no environment variable, `deploy/` file, compose file, or per-hotel setting; no migration, column, `CHECK`, backfill, index, transaction, retry loop, or stored-value rewrite is added | **Pending diff gate** — `PLN-7`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-71) |
| No-desk-regression gate | Real delta: the Manage screen's two create paths are byte-identical; they already render the existing `desk.manage.error_generic` sentence on a rejected write, and only the backend answer changes from a phantom `200` to a `500`; no other desk control, label, state, or copy moves | **Pending gate** — `PLN-8`; the pins are `app/src/views/ManageView.vue:1816-1840`, `:1852-1876`, and `app/src/views/ManageView.test.ts:633-662`, `:754-786` |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` capability wording moves; `FR-PLN-1`..`FR-PLN-5` are behaviour-scoped additions outside the counted capability set (requirements 41.2, 41.3) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Residual risk `PLN-R1` | The store-failure token (`VALIDATION_FAILED` at 500 versus `BR-59`'s `INTERNAL_ERROR`), the best-effort outbox helper, and the ambiguous-commit case stay exactly as they are; the slice neither aligns the token nor wraps the statements nor checks the outbox, and no guard may assert any of those | **Recorded, not guarded** — R-26, LLD 40.6, and this row; a fix is its own decision |
| Evidence cross-reference (`PLN-E1`) | The before/after pairs, the retry and no-phantom proofs, the `TEST_PG_URL` row-count run, and the slice row in the test report | **Pending** — `docs/testing/evidence/767/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #767): 22 rows mapped to `AC-PLN-1`..`AC-PLN-4`,
`FR-PLN-1`..`FR-PLN-5`, `BR-71`, the both-stores no-store/no-event row,
the unchanged MVP rows `FR-RTE-1`/`FR-RTE-10`/`FR-ADM-4`, the unchanged
conditions `AC-MANAGE-7`/`AC-RTE-10`, `NFR-I18N-1`, `NFR-AUD-1`, the
no-change NFR group, the contract/LC gate, the configuration/migration
gate, the no-desk-regression gate, the MVP no-change gate, the
residual-risk record `PLN-R1`, and `PLN-E1`. Five rows carry a
covered-by-re-run half (the unchanged MVP row, the unchanged conditions
row, the no-change NFR row, `NFR-I18N-1`, and the accepted-write halves
inside `AC-PLN-3`, `FR-PLN-2`, `FR-PLN-5`, and the both-stores row); the
other seventeen are **pending** the implementation PR. The slice is
**not complete** at this spec head; it completes when the implementation
PR merges with `PLN-1`-`PLN-9` green, the Postgres halves recorded on a
scratch database, `PLN-E1` recorded, and `qa-lead` re-pins the rows at
the merged head. The MVP Coverage line below stands unchanged at 57/57.

Coverage: 43 FRs mapped, 14 NFRs mapped, 57 rows total, 57 guards
filled (PR #112 slice: FR-RES-1, FR-RMS-1..4, FR-RTE-1/2/4/5, FR-ADM-1/2, FR-CUS-1, NFR-CON-1/2; PR #149 slice: FR-FDK-1, FR-FDK-5, FR-BIL-1/2/3/6, FR-ADM-5, NFR-BKP-1/2, NFR-AUD-1, NFR-TZ-1, plus FR-RES-1 persistence; PR #150 slice: FR-FDK-2, FR-FDK-3, FR-FDK-4, FR-BIL-7, plus the NFR-CON-2 stay-side checkout guard; PR #151 slice: FR-BIL-4, FR-CUS-3; PR #156 slice: FR-RPT-1..3; PR #157 slice: FR-GST-1..3; PR #158 slice: NFR-DEP-1, FR-ADM-4 config level, plus the FR-ADM-1 deployment extension; PR #159 slice: FR-RES-2/3/5/6 plus the NFR-CON-1 modify-path extension; PR #160 slice: ReleaseBlock plus rooms-side move coordination (FR-RMS-3, FR-FDK-3); PR #161 slice: full rates handling (FR-RTE-3 filled, FR-RTE-4/5 extended — remaining TBD cells fill in later slices); count corrected to the live total 48 (later slices filled cells without updating this line); PR #153 slice: NFR-RET-1, NFR-AVL-1; PR #182 slice: FR-RES-4, FR-ADM-3, FR-CUS-2, NFR-PERF-1/2 filled (5 guards — count corrected to the live total 53); FR-GST-4, FR-BIL-5, FR-RPT-4 point at follow-ups #189, #190, #191 and fill with those issues; NFR-I18N-1 filled by the #192 slice (count corrected to the live total 54); #189/#190/#191/#192/#201 slices filled FR-GST-4, FR-BIL-5, FR-RPT-4, NFR-I18N-1 (plus the #201 extension) — count corrected to the live total 57 (Closes #214)). Section 10 (Refs #588) adds 10 slice rows mapped to the #588 acceptance and `FR-CKO-1`..`FR-CKO-5`; the MVP row count stands unchanged at 57/57 because the slice adds no MVP capability. Section 11 (Refs #590) adds 15 slice rows mapped to `AC-MANAGE-1..11` and `FR-MGMT-1..12`; the MVP row count stands unchanged at 57/57 for the same reason. Section 12 (Refs #600) adds 10 slice rows mapped to `AC-DSK-19` and `FR-CKP-1`..`FR-CKP-5`; the MVP row count stands unchanged at 57/57 for the same reason. Section 13 (Refs #601) adds 11 slice rows mapped to `AC-CKO-1`, `AC-CKO-2`, and `FR-CKS-1`..`FR-CKS-5`; the MVP row count stands unchanged at 57/57 for the same reason. Section 14 (Refs #646) adds 16 slice rows mapped to `AC-DEP-1`..`AC-DEP-5`, `FR-DEP-1`..`FR-DEP-5`, and the lifecycle `D5`/`D6` notes; the MVP row count stands unchanged at 57/57 for the same reason. Section 15 (Refs #647) adds 15 slice rows mapped to `AC-REA-1`..`AC-REA-5`, `FR-REA-1`..`FR-REA-5`, the `AC-REA-1` / `FR-REA-1` disposition (LLD 23.9 R14), and the gate boxes; the MVP row count stands unchanged at 57/57 for the same reason. Section 16 (Refs #648) adds 18 slice rows mapped to `AC-BMV-1`..`AC-BMV-7` and `FR-BMV-1`..`FR-BMV-7`; the MVP row count stands unchanged at 57/57 for the same reason. Section 17 (Refs #632) adds 15 slice rows mapped to `AC-PRC-1`..`AC-PRC-5`, the desk condition `AC-DSK-20`, `FR-PRC-1`..`FR-PRC-5`, and the gate boxes; the MVP row count stands unchanged at 57/57 for the same reason. Section 18 (Refs #631) adds 14 slice rows mapped to `AC-OVB-1..3`, `FR-OVB-1..4`, and `BR-47..49`; the MVP row count stands unchanged at 57/57 for the same reason. Section 20 (Refs #634) adds 17 slice rows mapped to `AC-FWV-1`..`AC-FWV-7` and `FR-FWV-1`..`FR-FWV-5`, the `AC-FWV-3` / `AC-FWV-5` disposition, and the gate boxes; the MVP row count stands unchanged at 57/57 for the same reason. Section 21 (Refs #627) adds 13 slice rows mapped to `AC-ERR-1`..`AC-ERR-5`, `FR-ERR-1`..`FR-ERR-3`, and `BR-59`; the MVP row count stands unchanged at 57/57 for the same reason. Section 22 (Refs #630) adds 13 slice rows mapped to `AC-BND-1`..`AC-BND-5`, `NFR-BND-1`..`NFR-BND-3`, and `BR-60`; the MVP row count stands unchanged at 57/57 for the same reason. Section 23 (Refs #635) adds 14 slice rows mapped to `AC-AMT-1`..`AC-AMT-5`, `NFR-AMT-1`..`NFR-AMT-4`, and `BR-61`; the MVP row count stands unchanged at 57/57 for the same reason. Section 24 (Refs #641) adds 14 slice rows mapped to `AC-RPT-5`..`AC-RPT-7`, `NFR-RPT-1`, and `BR-62`; the MVP row count stands unchanged at 57/57 for the same reason. Section 25 (Refs #640) adds 18 slice rows mapped to `AC-GID-1`..`AC-GID-7`, `FR-GID-1`..`FR-GID-3`, and `BR-63`; the MVP row count stands unchanged at 57/57 for the same reason. Section 26 (Refs #639) adds 20 slice rows mapped to `AC-CFG-1`..`AC-CFG-5`, `FR-CFG-1`..`FR-CFG-3`, and `BR-64`; the MVP row count stands unchanged at 57/57 for the same reason. Section 27 (Refs #643) adds 17 slice rows mapped to `AC-SEC-1`..`AC-SEC-5`, `FR-SEC-1`..`FR-SEC-4`, and `BR-65`; the MVP row count stands unchanged at 57/57 for the same reason. Section 28 (Refs #642) adds 16 slice rows mapped to `AC-RPT-8`..`AC-RPT-10`, `FR-RPT-5`..`FR-RPT-7`, and `BR-66`; the MVP row count stands unchanged at 57/57 for the same reason. Section 29 (Refs #636) adds 17 slice rows mapped to `AC-SEL-1`..`AC-SEL-4`, `FR-SEL-1`..`FR-SEL-4`, and `BR-67`; the MVP row count stands unchanged at 57/57 for the same reason. Section 30 (Refs #633) adds 19 slice rows mapped to `AC-RTE-6`..`AC-RTE-10`, `FR-RTE-6`..`FR-RTE-10`, and `BR-68`; the MVP row count stands unchanged at 57/57 for the same reason. Section 31 (Refs #637) adds 18 slice rows mapped to `AC-CAP-1`..`AC-CAP-4`, `FR-CAP-1`..`FR-CAP-4`, and `BR-69`; the MVP row count stands unchanged at 57/57 for the same reason. Section 33 (Refs #767) adds 22 slice rows mapped to `AC-PLN-1`..`AC-PLN-4`, `FR-PLN-1`..`FR-PLN-5`, and `BR-71`; the MVP row count stands unchanged at 57/57 for the same reason.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1048

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-992

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1057

Role: qa-lead · AO session hotel-mgmt-922

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1118

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1131

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1165

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1208

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1235

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1289
