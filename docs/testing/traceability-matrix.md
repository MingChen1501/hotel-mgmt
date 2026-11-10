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
stay picker, D17 ships with the #586 arrival-pick preload
change, and D18 ships with the #588 check-out release and
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
The existing pins named below are on disk today and pin the old
click-then-load timing; the #586 implementation PR rewrites them to
the arrival-pick timing with a note (never deleting one) and creates
the two named missing cases, so a row is complete only when that PR
lands and passes. Like the slices above, these rows add no MVP
capability; the 57-row MVP coverage count stands unchanged and no
MVP row may cite this slice as its guard. `AC-DSK-4` keeps its
placeholder/guard/auto-select rule and points here for the load
timing and the room-error lifecycle.

| Item | Required guard type | Guard |
|---|---|---|
| AC-DSK-17 — the arrival pick loads the booked-type ready-room candidates, a valid room selection clears the room error, and the commit stays on the Check in button (Refs #586; traces to US-FDK-1, US-FDK-2; `FR-CIP-1`, `FR-CIP-2`, `FR-CIP-3`, `FR-CIP-4`; AC-DSK-4 keeps the placeholder/guard/auto-select rule and points here) | Behaviour check: one arrival pick alone populates the picker with the booked type's ready rooms; one room auto-binds, several keep the placeholder plus amber hint, zero keeps the plain no-ready-rooms error with the booked-type status; a valid select clears the guard and the hint immediately; one Check in click commits once with the unchanged bodies, and a second in-flight click is a no-op | Pending the #586 implementation PR — `D17` (section 3 of `desk-ui-rollout-test-traceability.md`): arrival-flow rewrite `app/src/views/StayView.test.ts:309` (placeholder-first `:326`), `:371` (`need_room`), `:402` (auto-select), `:574` (unknown reference), `:596` (taken room), `:626` (already checked in), `:925` (in-flight double-click); edge guards `app/src/views/desk-edge-guards.test.ts:1183` (placeholder/back-forward), `:460` (unknown reference, QA-EDGE-1), `:851` (dirty room never a candidate, QA-EDGE-8); browser `app/e2e/stay.spec.ts:65`–`:73` (pick, select, one commit click); the unchanged `FR-FDK-1/2` / `FR-BIL-7` MVP guards keep the check-in capability and the checkout gate |
| FR-CIP-1 — the arrival pick loads the booked-type ready-room candidates (section 18.3) | A pick alone runs the existing read pair (`GetReservation` then `ListRoomsByState('vacant-inspected')`) and the booked-type filter; one room binds, several keep the placeholder, a second pick resets the previous candidates and error first, and a late earlier read never paints | Pending the #586 implementation PR — `app/src/views/StayView.test.ts:309` is rewritten so the arrival pick alone produces the options (the booked-type filter pinned by the same fixture) and one button click commits; browser `app/e2e/stay.spec.ts:65`–`:73` moves to pick, select, one commit click |
| FR-CIP-2 — picker states and plain-word failures stay as today (section 18.3) | One room auto-binds with no hint and no error; several show the explicit empty placeholder plus the amber `stay-checkin-room-hint`; zero ready rooms show the plain no-ready-rooms error with the booked-type status and bind nothing; unknown reference, signed-out, and other failures keep their existing strings in both locales; the progress line and disabled button cover the read | Partial today — `app/src/views/StayView.test.ts:371` (`need_room`, no `AssignRoom`), `:402` (auto-select), `:574` (unknown reference), `app/src/views/desk-edge-guards.test.ts:1183` (placeholder), `:460` (unknown reference, QA-EDGE-1); the implementation PR rewrites them to the pick timing and creates the missing no-ready-rooms case (booked-type status plus the plain error, nothing bound, a click retries the load) |
| FR-CIP-3 — a valid room selection clears the guard message (section 18.3) | With several candidates and `Pick a ready room first.` on screen, selecting a room in the candidate map clears the message and the hint immediately (multi-candidate path included); clearing back to the placeholder or holding an outside value leaves the guard at commit | Missing guard named explicitly — no case asserts the message disappearing on a valid select today; the #586 implementation PR creates it (multi-candidate pick, valid select, `stay-checkin-error` gone, `stay-checkin-room-hint` gone, no error rendered), and `:371` keeps the placeholder half |
| FR-CIP-4 — the commit stays on the Check in button, once, with unchanged bodies (section 18.3) | `AssignRoom` → `CheckIn` → `CheckInReservation` run once with the existing bodies (the `CheckIn` room id from the `AssignRoom` echo), no candidate read repeats after the preload, a second in-flight click is a no-op, and a failed preload retries the load instead of committing a stale selection | Partial today — body pins `app/src/views/StayView.test.ts:309` (`AssignRoom` `roomNumber` plus `stayLink`, `CheckIn` room id from the echo), in-flight double-click `:925`, taken room `:596`, already checked in `:626`, no-call-without-a-room `app/src/views/desk-edge-guards.test.ts:1183`; the implementation PR asserts the single commit after a successful preload with no second candidate read |
| Design-facts gate | The decided Stay input stays the same `[data-testid="stay-checkin-room"] select` with the `Chọn phòng...` placeholder, and the populated option subtrees stay exempt under DD-13, so no schema or allowlist change | Covered by re-run only — `app/e2e/design-facts.ts` Stay entry, `docs/technical/desk-ui-fact-schema.md` section 5, `docs/testing/dom-diff-allowlist.md` DD-13, and the source pins in `app/src/stay-restyle.test.ts:55`–`:100` hold unchanged; the implementation PR re-runs the fact-level gate and notes the DD-13 exemption |
| Catalogue parity | Zero new keys: every state above uses an existing `desk.stay.*` string with both locales intact and placeholders unchanged | Covered — `messages/en.json`, `messages/vi.json` and the eight `services/*` mirrors plus `script/catalogue-coverage-check.sh`; the implementation PR must show the coverage job green with no catalogue diff |

Slice coverage (Refs #586): 7 rows mapped; 2 covered without a new
guard (the design-facts and catalogue boxes need none) and 5
pending the #586 implementation PR — the existing pins named above
are rewritten to the arrival-pick timing with a note (never
deleted), and the two missing cases (no-ready-rooms, and
error-cleared-on-select) are created there. No existing guard is
deleted; every filled citation above is on disk at the #591 head.
The MVP Coverage line below stands unchanged at 57/57.

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
| AC-MANAGE-6 — a price range writes one `UpsertRatePrice` row per night in date order and a quote follows for those dates (traces to US-RTE-1; `FR-RTE-1`; `FR-MGMT-6`, `FR-MGMT-7`; `BR-44`) | Behaviour check: call count equals the inclusive night count, the order is date order, each body carries the plan name, the room-type uuid, the ISO night date, and integer minor units, the grid re-reads, and `QuotePrice` returns the stored prices | Covered — `M6` at `app/src/views/ManageView.test.ts:569-663` and `M7` at `:665-752`; parity `services/rates/internal/store/postgres_test.go:56-82` (two nights, two rows, quote follows), `services/rates/internal/handler/handler.go:140-167` (route and validation), `services/rates/internal/store/store.go:179-195`, `app/src/views/BookView.vue:498-506` (`noRateReason` classifier) and `:609` (`formatVnd` night render); the unchanged `FR-RTE-1` MVP row keeps the capability |
| AC-MANAGE-7 — an unknown rate plan surfaces the explicit create action; creating posts `UpsertRatePlan` with the name only and retries the pending nights (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-ADM-4`; `FR-MGMT-8`) | Behaviour check: the unknown-plan refusal is classified apart from the quote reasons, the create action posts exactly one name-only `UpsertRatePlan`, the retry covers the pending nights, and declining writes nothing | Covered — `M8` at `app/src/views/ManageView.test.ts:754-862`; parity `services/rates/internal/store/store.go:189` (unknown plan `NOT_FOUND` with `ratePlanName`, no `reason`), `services/rates/internal/store/postgres.go:92-95` (a name conflict overwrites the description), `services/rates/internal/handler/handler.go:118-138` (name-only payload valid) |
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

Coverage: 43 FRs mapped, 14 NFRs mapped, 57 rows total, 57 guards
filled (PR #112 slice: FR-RES-1, FR-RMS-1..4, FR-RTE-1/2/4/5, FR-ADM-1/2, FR-CUS-1, NFR-CON-1/2; PR #149 slice: FR-FDK-1, FR-FDK-5, FR-BIL-1/2/3/6, FR-ADM-5, NFR-BKP-1/2, NFR-AUD-1, NFR-TZ-1, plus FR-RES-1 persistence; PR #150 slice: FR-FDK-2, FR-FDK-3, FR-FDK-4, FR-BIL-7, plus the NFR-CON-2 stay-side checkout guard; PR #151 slice: FR-BIL-4, FR-CUS-3; PR #156 slice: FR-RPT-1..3; PR #157 slice: FR-GST-1..3; PR #158 slice: NFR-DEP-1, FR-ADM-4 config level, plus the FR-ADM-1 deployment extension; PR #159 slice: FR-RES-2/3/5/6 plus the NFR-CON-1 modify-path extension; PR #160 slice: ReleaseBlock plus rooms-side move coordination (FR-RMS-3, FR-FDK-3); PR #161 slice: full rates handling (FR-RTE-3 filled, FR-RTE-4/5 extended — remaining TBD cells fill in later slices); count corrected to the live total 48 (later slices filled cells without updating this line); PR #153 slice: NFR-RET-1, NFR-AVL-1; PR #182 slice: FR-RES-4, FR-ADM-3, FR-CUS-2, NFR-PERF-1/2 filled (5 guards — count corrected to the live total 53); FR-GST-4, FR-BIL-5, FR-RPT-4 point at follow-ups #189, #190, #191 and fill with those issues; NFR-I18N-1 filled by the #192 slice (count corrected to the live total 54); #189/#190/#191/#192/#201 slices filled FR-GST-4, FR-BIL-5, FR-RPT-4, NFR-I18N-1 (plus the #201 extension) — count corrected to the live total 57 (Closes #214)). Section 10 (Refs #588) adds 10 slice rows mapped to the #588 acceptance and `FR-CKO-1`..`FR-CKO-5`; the MVP row count stands unchanged at 57/57 because the slice adds no MVP capability. Section 11 (Refs #590) adds 15 slice rows mapped to `AC-MANAGE-1..11` and `FR-MGMT-1..12`; the MVP row count stands unchanged at 57/57 for the same reason.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-889
