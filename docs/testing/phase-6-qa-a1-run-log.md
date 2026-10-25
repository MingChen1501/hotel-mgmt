# Phase 6 QA A1 — structured desk-loop run log (live stack)

Status: active. QA activity A1 from the scoped independent-QA pass
(`docs/testing/phase-6-qa-plan.md`, section 2, Closes #264; this log
Closes #267), owned by `qa-lead`. Run completed 2026-10-25 on the
live single-host stack: the scripted end-to-end loop through all 5 FE
screens (`frontend/desk.html`, `frontend/book.html`,
`frontend/stay.html`, `frontend/folio.html`, `frontend/print.html`),
plus the admin console (`frontend/admin.html`) and the desk
backup-report surface (`frontend/backup-report.json`). Each step
states its expected observable up front (QA plan section 2, activity
A1); deviations become bugs per plan section 3, never inline fixes.
The loop follows the desk order proven in
`script/e2e-desk-loop.sh`; screen-surface checks are served through
the same reverse proxy a person at the screens would use.

## 0. Build, seed, and environment facts

| Fact | Value |
|---|---|
| Build under test (master SHA) | `8b6422b` (`docs(testing): Add Phase 6 QA plan (entry, activities, bug flow, exit) (#266)`) |
| CI on the build | all 14 check-runs `success` on `8b6422b` (`billing-build`, `changes`, `ci`, `contract-check`, `e2e-single-host`, `go-build` x3, `migrate-check`, `node-build` x4, `perf-reporting-variant`) |
| Seed | `deploy/seed/boot.sql` (hotel profile `Skeleton Hotel`, one `Standard Double` type, two rooms inspected-ready) |
| Hotel config | no `deploy/config/hotel.json` in tree — desk ran on the boot seed values (loop took the `no deployment set` branch) |
| Bring-up | `script/e2e-desk-loop.sh --keep-up --staging-dir /tmp/opencode/a1/backup-staging` (fresh `docker compose up -d --build`, migrations + boot seed applied idempotently; per-sale `DB_PASSWORD` / `ADMIN_BOOT_SECRET`, fail-closed on dev defaults, never printed). Three attempts: (1) failed at module health — a `hotel-mgmt_pgdata` volume from an earlier demo-poc run on this host carried a different `hotel` password, so the fresh per-run secret was refused (`28P01`); reset with `docker compose down -v`. (2) steps 1–12 PASS, then died writing `e2e-expect.json` — the staging dir did not exist (filed as #271). (3) clean full loop, `SUCCEEDED`, exit 0. Lab-only hygiene and a documented workaround; no product change. Stack torn down (`down -v`) after the run; machine left clean. |
| PERF-env facts | `nproc=8`, mem 32 GB, disk 119 GB avail; label `a1-live-variant`, `REFERENCE_HOST=0` — this host is not the 2*4*50 reference host, so no PERF bounds are asserted here (PERF assertion is the A2 batch, out of scope) |
| Machine logs | runner-side `/tmp/opencode/a1/e2e3.log` (clean run, exit 0); attempts 1–2 in `e2e.log` / `e2e2.log`. Key evidence lines quoted in sections 1–3 |

## 1. Scripted desk loop — expected vs observed (clean run)

23 `PASS` lines, 0 `FAIL`, `SUCCEEDED` (loop elapsed 27 s plus image
build; RTO budget 4 h).

| # | Step (desk order) | Expected observable | Observed | Verdict |
|---|---|---|---|---|
| 1 | Bring up the single-host stack | all 8 modules answer `healthz` through the proxy | all 8 `PASS: … answers through the proxy` (reservations, rates, reporting, stay, rooms, guests, billing, admin) | PASS |
| 2 | Migrations + boot seed | all 19 migrations + `boot.sql` apply, no error | `PASS: migrations and boot seed applied` | PASS |
| 3 | Admin sign-in + hotel config read | owner sign-in returns a session token; `GetHotelConfig` returns a schema version; hotel name `Skeleton Hotel` (boot seed branch) | `PASS: owner sign-in returned a session token`; config `schemaVersion: 1`, `values.name: Skeleton Hotel`, UTC, 14:00/12:00 | PASS |
| 4 | Guest upsert (FR-GST-1) | `UpsertGuest` ok for the E2E guest | `PASS: guest 11111111-1111-4111-8111-111111111111 upserted` | PASS |
| 5 | Rooms setup (FR-RMS-1) | one type + two rooms; `CheckRoomTypeSellability` sellable >= 1 for the +30/+32d window | `PASS: room type 8d7a21be… sellable (2 unit(s)) for 2026-11-24 to 2026-11-26` | PASS |
| 6 | Rates plan + quote (FR-RTE-1/2) | plan `E2E-RACK`, 2 nightly prices of 120000; `QuotePrice` total 240000 minor for 2 nights | `PASS: quoted total 240000 minor units for 2 nights` (per-date counts 2/2/2) | PASS |
| 7 | Book (FR-RES-1) | `CreateReservation` state `confirmed` with a ref; `GetReservation` reads back `confirmed`; `QueryCalendar` lists the ref | `PASS: booked reservation RSV-JMBT43NP (state confirmed, quoted total 240000)`; `PASS: GetReservation and QueryCalendar both show RSV-JMBT43NP confirmed` | PASS |
| 8 | Check in tonight (FR-FDK-1) | `AssignRoom` E2E-101, stay `CheckIn`, `CheckInReservation` all ok; stay in-house | `PASS: stay 23413c21… in-house for reservation RSV-Z95E5RQX` | PASS |
| 9 | Mid-stay move (FR-FDK-3) | stay moved to E2E-102; old room E2E-101 released `vacant-dirty` | `PASS: stay 23413c21… moved to E2E-102, E2E-101 vacant-dirty` | PASS |
| 10 | Actual times + lists (FR-FDK-4/5) | `actualArrival` kept (`…T05:30:00.000Z`); stay listed in arrivals and in-house | `PASS: early arrival kept, stay listed in arrivals and in-house` | PASS |
| 11 | Folio charge/pay/invoice/receipt/day-close (FR-BIL-1/2/3/4/6, FR-CUS-3) | 2 charge lines posted; cash payment 60000; day-close totals; invoice lines+balance equal the folio; receipt equals the recorded payment | `PASS: day-close 2026-10-25 charges=122500 folio balance=62500; invoice matches folio, receipt matches cash payment` | PASS |
| 12 | Check out with folio review (FR-FDK-2, FR-BIL-7) | open-balance checkout refused `SETTLEMENT_REQUIRED`; after manager approval stay `closed` with `invoiceRef` = folio; second close refused `STATE_ILLEGAL`; E2E-102 released `vacant-dirty` | `PASS: open-balance check-out refused, stay remains in house`; `PASS: stay 23413c21… closed with invoice 0b71aae7…, E2E-102 vacant-dirty` | PASS |
| 13 | Restore expectation record | `e2e-expect.json` written (arrivals, stay, folio, day-close, hotel name, room state, rate prices) | expectation record written to the staging dir (run 2 proved the missing-dir failure; filed as #271) | PASS |
| 14 | Backup (FR-ADM-5, NFR-BKP-1/2) | backup artifact written and read-back verified | `hotel-20261025-103843-e2e.sql` + `.report.json` in the staging dir | PASS |
| 15 | Desk backup report (issue #116 surface) | `/backup-report.json` through the proxy: `outcome` = `success`, line contains `Backup succeeded at` | `PASS: desk shows the backup success line through the proxy`; served body `{"outcome": "success", "line": "Backup succeeded at 03:38 on 25 Oct.", …}` | PASS |
| 16 | Restore drill (verify-only) | `restore.sh --verify-only --expect-file` passes; elapsed printed (RTO budget 4 h) | `drill SUCCEEDED in 3s (RTO budget 4h): … restored to scratch with 43 user tables, 1 hotel profile row(s)` | PASS |
| 17 | Re-verify after drill | booking still `confirmed`; checked-in booking intact; stay `closed` and on departures; day-close totals unchanged; all modules healthy | `PASS: booking RSV-JMBT43NP still confirmed, stay 23413c21… closed, day-close 2026-10-25 intact; desk modules healthy after the drill` | PASS |

EVIDENCE line: `reservation=RSV-JMBT43NP state=confirmed
totalMinor=240000 arrival=2026-11-24 departure=2026-11-26
stay=23413c21-b6ea-4af2-8c62-315fe9cb20be state=closed
invoice=0b71aae7-3972-4baf-b9e0-244df683fa7b dayCloseDate=2026-10-25
chargesTotal=122500 folioBalance=62500 elapsed=27s (RTO budget 4h).`

## 2. Screen surfaces — served through the proxy, as a person at the screens sees them

All pages fetched from the live stack at `http://127.0.0.1/<page>`
after the loop completed (stack still up, `--keep-up`).

| Screen | Check | Expected | Observed | Verdict |
|---|---|---|---|---|
| `desk.html` | `GET /desk.html` 200; sign-in form + dashboard (arrivals/departures/in-house tables, daily-sheet line, dirty/uninspected/out-of-order lists) present | page serves; wired to `SignIn`, `DailySheet`, `ListArrivalsDepartures`, `ListRoomsByState` | 200, 11159 bytes; sign-in form + all dashboard element ids present (`signin-form`, `arrivals-table`, `departures-table`, `inhouse-table`, `sheet-line`, `dirty-list`, `uninspected-list`, `outoforder-list`); 6 `/v1/` refs | PASS |
| `book.html` | `GET /book.html` 200; quote/book/read-back/confirmation wiring present | page serves; wired to `QuotePrice`, `CreateReservation`, `GetReservation`, `IdentifyGuest`, `ProduceConfirmation` | 200, 21356 bytes; 8 `/v1/` refs incl. all five expected ops | PASS |
| `stay.html` | `GET /stay.html` 200; check-in/move/times/checkout wiring present | page serves; wired to `AssignRoom`, `CheckIn`, `MoveRoom`, `RecordActualTimes`, `CheckOut`, lists | 200, 37447 bytes; 14 `/v1/` refs incl. all expected ops | PASS |
| `folio.html` | `GET /folio.html` 200; folio/charge/payment wiring present | page serves; wired to `GetFolioBalance`, `PostCharge`, `RecordPayment` | 200, 17613 bytes; 5 `/v1/` refs incl. all three expected ops | PASS |
| `print.html` | `GET /print.html` 200; print comparison path present | page serves; fetches `ProduceConfirmation` / `ProduceInvoice` / `ProduceReceipt`; JSON equality invoice==folio and receipt==payment asserted in step 11 | 200, 24716 bytes; 6 `/v1/` refs incl. all three produce ops; equality asserts passed in step 11 | PASS |
| `admin.html` | `GET /admin.html` 200; users/roles/audit console wiring present | page serves; wired to `CreateUser`, `ListUsers`, `UpdateUserRole`, `UnlockIdentity`, `QueryAuditLog` | 200, 9635 bytes; all five console ops present in page script | PASS |
| `backup-report.json` | `GET /backup-report.json` 200 through the proxy | `outcome` = `success` with the success line (same assert as step 15) | 200, 150 bytes; `outcome: success`, `Backup succeeded at 03:38 on 25 Oct.` | PASS |

## 3. Admin console reads (users/roles, hotel config, audit-log view)

Read-mostly checks against the live run state via the proxy with the
owner session token; no new users were created by this pass
(role-matrix refusals stay covered by the `NFR-SEC-1` guards, not
re-proven here).

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| `ListUsers` | owner identity listed, no secret hashes leaked | one user: `signinIdentity: owner`, `role: owner`, `locked: false`; response carries no secret hash material | PASS |
| `GetHotelConfig` | hotel profile reads back (`Skeleton Hotel`, boot seed values) | `schemaVersion: 1`, `values.name: Skeleton Hotel`, UTC, 14:00/12:00, retention floor 365 | PASS |
| `QueryAuditLog` | run entries newest-first with unaltered actor and timestamp (NFR-AUD-1 visible at the desk) | 2 entries newest-first, each with `at` + `actor`: `boot \| user.updated` 03:39:05Z, `boot \| user.created` 03:38:32Z. The view covers account/config changes per its guard; domain-op actor/timestamp recording stays proven by the NFR-AUD-1 restore-drill assertions | PASS |

## 4. Defects

One deviation found, filed as a bug under the `Phase 6 - QA`
milestone in the plan section 3 format (no fix lands here — plan
section 4 routes fixes to their phase milestones):

- #271 `[ci] Create the staging dir before writing the restore expectation record` (`ci`, `risk-low`, minor): `script/e2e-desk-loop.sh` step 13 writes `e2e-expect.json` into `--staging-dir` but only `backup.sh` (step 14) creates the dir, so a direct invocation with a fresh staging path dies late after 12 steps of live side effects. Workaround used for the clean run: pre-create the dir (the `install.sh` path never hits this because `preflight.sh` creates it).

Clean bill otherwise: no product-behaviour deviation found across
the desk loop (book → check in → charges → payment → check out →
invoice/receipt print comparison), the admin console reads, or the
backup-report surface. Every step above is PASS against its expected
observable.

## 5. Exit linkage

This log plus the cited evidence (build SHA, seed, machine logs,
PERF-env facts) is the A1 record for QA-plan exit criterion 1
(desk-loop log). A2/A3/A4 batches are separate issues and are out of
scope here.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-346
