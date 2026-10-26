# Phase 6 QA A1-lite — desk loop through the Vue UI (run log)

Status: active. QA activity A1-lite from issue #316 (post-migration
delta: QA activities A1 and A3 ran against the static pages before
the Vue migration landed in #291–#299, #311, #313; the Vue SPA under
`/app/` had only unit/characterization tests plus green CI — no QA
loop had exercised it; this log Closes #316), owned by `qa-lead`.
Run completed 2026-10-26 on the live single-host stack: the scripted
end-to-end desk loop through the same contract path proven in
`script/e2e-desk-loop.sh`, plus the Vue screen surfaces served
through the proxy (`/app/*` routes, legacy-path redirects, and the
backup-report line rendered in `DeskView`), plus the admin console
reads. Each step states its expected observable up front (issue #316
scope); deviations become bugs per `phase-6-qa-plan.md` section 3,
never inline fixes. No A3 re-pass here (separate issue, out of
scope per #316).

## 0. Build, seed, and environment facts

| Fact | Value |
|---|---|
| Build under test (base commit) | `fb5606f` (`fix(admin): Branch sign-in errors on signed-out state and catalogue config strings (#318)`). The worktree at run time was exactly this tree (docs-only delta written after the run); the loop rebuilt every image from it with `docker compose up -d --build` |
| CI on the build at execution time | 14 check-runs `success` (`app-build`, `billing-build`, `changes`, `ci`, `contract-check`, `go-build` x3, `migrate-check`, `node-build` x4, `perf-reporting-variant`); `e2e-single-host` still `in_progress` (run `40290298123`, job `121463561455`). Recorded, not asserted — the loop below is the desk evidence, not a CI verdict |
| Seed | `deploy/seed/boot.sql` (hotel profile `Skeleton Hotel`, one `Standard Double` type, two rooms inspected-ready) |
| Hotel config | no `deploy/config/hotel.json` in tree (only `hotel.example.json`) — desk ran on the boot seed values (loop took the `no deployment set` branch, same as A1) |
| Bring-up | `script/e2e-desk-loop.sh --keep-up --staging-dir /tmp/opencode/a1lite/backup-staging` (fresh `docker compose up -d --build`, migrations + boot seed applied idempotently; per-run `DB_PASSWORD` / `ADMIN_BOOT_SECRET`, fail-closed on dev defaults, never printed). Two attempts: (1) died at module health — a `hotel-mgmt_pgdata` volume from an earlier local run carried a different `hotel` password, so the fresh per-run secret was refused (`28P01`; same local-harness cause as the A1 attempt 1). Reset with `docker compose down -v`. (2) clean full loop, `SUCCEEDED`, exit 0. Lab-only hygiene and a documented workaround; no product change. Stack torn down (`down -v`) after the run; machine left clean |
| Vue build served | `(cd app && npm ci && npm run build)` inside the loop: `dist/index.html` 0.42 kB, `dist/assets/index-BNOJlnVx.js` 230.73 kB (gzip 68.46 kB), `dist/assets/index-clqL8b-j.css` 0.66 kB |
| PERF-env facts | `nproc=8`, mem 30 GB, disk 113 GB avail; label `a1-lite-variant`, `REFERENCE_HOST=0` — this host is not the 2*4*50 reference host, so no PERF bounds are asserted here (PERF assertion is the A2 batch, out of scope) |
| Machine logs | attempt 1 and clean-run logs are runner-side (`/tmp/opencode/a1lite/e2e.log`, `e2e2.log`); key evidence lines quoted in sections 1–4. Staging artifacts from the clean run: `hotel-20261026-151543-e2e.sql` + `.report.json`, `e2e-expect.json`, restore-drill report |

## 1. Scripted desk loop — expected vs observed (clean run)

23 `PASS` lines, 0 `FAIL`, `SUCCEEDED` (loop elapsed 39 s plus image
build; RTO budget 4 h).

| # | Step (desk order, Vue view in brackets) | Expected observable | Observed | Verdict |
|---|---|---|---|---|
| 1 | Bring up the single-host stack | all 8 modules answer `healthz` through the proxy | 8 `PASS: … answers through the proxy` (reservations, rates, reporting, stay, rooms, guests, billing, admin) | PASS |
| 2 | Migrations + boot seed | all 19 migrations + `boot.sql` apply, no error | `PASS: migrations and boot seed applied` | PASS |
| 3 | Admin sign-in + hotel config read (`AdminView`) | owner sign-in returns a session token; `GetHotelConfig` returns a schema version; hotel name `Skeleton Hotel` (boot seed branch) | `PASS: owner sign-in returned a session token`; config `schemaVersion: 1`, `values.name: Skeleton Hotel`, UTC, 14:00/12:00 | PASS |
| 4 | Guest upsert (`BookView`) | `UpsertGuest` ok for the E2E guest | `PASS: guest 11111111-1111-4111-8111-111111111111 upserted` | PASS |
| 5 | Rooms setup + sellability (`BookView`) | one type + two rooms; `CheckRoomTypeSellability` sellable >= 1 for the +30/+32d window | `PASS: room type 724c6258… sellable (2 unit(s)) for 2026-11-25 to 2026-11-27` | PASS |
| 6 | Rates plan + quote (`BookView`) | plan `E2E-RACK`, 2 nightly prices of 120000; `QuotePrice` total 240000 minor for 2 nights | `PASS: quoted total 240000 minor units for 2 nights` (per-date counts 2/2/2) | PASS |
| 7 | Book (`BookView`) | `CreateReservation` state `confirmed` with a ref; `GetReservation` reads back `confirmed`; `QueryCalendar` lists the ref | `PASS: booked reservation RSV-QP9MM3K2 (state confirmed, quoted total 240000)`; `PASS: GetReservation and QueryCalendar both show RSV-QP9MM3K2 confirmed` | PASS |
| 8 | Check in tonight (`StayView`) | `AssignRoom` E2E-101, stay `CheckIn`, `CheckInReservation` all ok; stay in-house | `PASS: stay a3687a18… in-house for reservation RSV-VP8XDGLF` | PASS |
| 9 | Mid-stay move (`StayView`) | stay moved to E2E-102; old room E2E-101 released `vacant-dirty` | `PASS: stay a3687a18… moved to E2E-102, E2E-101 vacant-dirty` | PASS |
| 10 | Actual times + lists (`StayView`, `DeskView`) | `actualArrival` kept; stay listed in arrivals and in-house | `PASS: early arrival kept, stay listed in arrivals and in-house` | PASS |
| 11 | Folio charge/pay/invoice/receipt/day-close (`FolioView`, `PrintView`) | 2 charge lines posted; cash payment 60000; day-close totals; invoice lines+balance equal the folio; receipt equals the recorded payment | `PASS: day-close 2026-10-26 charges=122500 folio balance=62500; invoice matches folio, receipt matches cash payment` | PASS |
| 12 | Check out with folio review (`StayView`) | open-balance checkout refused `SETTLEMENT_REQUIRED`; after approval stay `closed` with `invoiceRef` = folio; second close refused `STATE_ILLEGAL`; E2E-102 released `vacant-dirty` | `PASS: open-balance check-out refused, stay remains in house`; `PASS: stay a3687a18… closed with invoice 87175035…, E2E-102 vacant-dirty` | PASS |
| 13 | Restore expectation record | `e2e-expect.json` written (arrivals, stay, folio, day-close, hotel name, room state, rate prices) | expectation record written to the staging dir | PASS |
| 14 | Backup (FR-ADM-5, NFR-BKP-1/2) | backup artifact written and read-back verified | `hotel-20261026-151543-e2e.sql` + `.report.json` in the staging dir | PASS |
| 15 | Desk backup report (issue #116 surface, `DeskView`) | `/backup-report.json` through the proxy: `outcome` = `success`, line names the success | `PASS: desk shows the backup success line through the proxy`; served body `{"outcome": "success", "line": "Backup succeeded at 08:15 on 26 Oct.", …}` | PASS |
| 16 | Restore drill (verify-only) | `restore.sh --verify-only --expect-file` passes; elapsed printed (RTO budget 4 h) | `drill SUCCEEDED in 3s (RTO budget 4h): … restored to scratch with 43 user tables, 1 hotel profile row(s)` | PASS |
| 17 | Re-verify after drill | booking still `confirmed`; checked-in booking intact; stay `closed` and on departures; day-close totals unchanged; all modules healthy | `PASS: booking RSV-QP9MM3K2 still confirmed, stay a3687a18… closed, day-close 2026-10-26 intact; desk modules healthy after the drill` | PASS |

EVIDENCE line: `reservation=RSV-QP9MM3K2 state=confirmed
totalMinor=240000 arrival=2026-11-25 departure=2026-11-27
stay=a3687a18-99da-44ab-96af-d4c5c83fa3a2 state=closed
invoice=87175035-da97-4bc3-8d00-fdb30788f904 dayCloseDate=2026-10-26
chargesTotal=122500 folioBalance=62500 elapsed=39s (RTO budget 4h).`

## 2. Vue screen surfaces — served through the proxy, as a person at the screens sees them

All pages fetched from the live stack at `http://127.0.0.1/<route>`
after the loop completed (stack still up, `--keep-up`). The SPA is
CSR: every app route serves the same `dist/index.html` shell by
design (history-mode fallback `try_files … /app/index.html`, LLD
§11.1); per-view rendering is proven client-side by the
characterization suite (`app-build` green, section 3). Legacy static
pages are decommissioned (#313): the old paths 301-redirect to their
`/app/*` equivalents.

| Screen | Check | Expected | Observed | Verdict |
|---|---|---|---|---|
| `/app/` (DeskView) | `GET /app/` 200; SPA shell with `/app/` asset base and `#app` mount | shell serves; script `/app/assets/index-BNOJlnVx.js`, CSS `/app/assets/index-clqL8b-j.css` | 200, 415 bytes; title `Hotel Management — Desk`; md5 `045816d5…` | PASS |
| `/app/book` (BookView) | `GET /app/book` 200; history fallback serves the shell | same shell bytes as `/app/` | 200, byte-identical md5 | PASS |
| `/app/stay` (StayView) | `GET /app/stay` 200; history fallback serves the shell | same shell bytes as `/app/` | 200, byte-identical md5 | PASS |
| `/app/folio` (FolioView) | `GET /app/folio` 200; history fallback serves the shell | same shell bytes as `/app/` | 200, byte-identical md5 | PASS |
| `/app/print` (PrintView) | `GET /app/print` 200; history fallback serves the shell | same shell bytes as `/app/` | 200, byte-identical md5 | PASS |
| `/app/admin` (AdminView) | `GET /app/admin` 200; history fallback serves the shell | same shell bytes as `/app/` | 200, byte-identical md5 | PASS |
| Unknown deep route | `GET /app/no-such-route` 200 (NFR-SHL-2 fallback, NOT a 404 page) | shell serves with status 200 | 200 | PASS |
| Legacy paths | `GET /`, `/desk.html`, `/book.html`, `/stay.html`, `/folio.html`, `/print.html`, `/admin.html` 301 to `/app/*` | `/` → `/app/`; each page → its view route | all 7 return 301 with the expected `Location` (`/` → `/app/`, `/desk.html` → `/app/`, `/book.html` → `/app/book`, `/stay.html` → `/app/stay`, `/folio.html` → `/app/folio`, `/print.html` → `/app/print`, `/admin.html` → `/app/admin`) | PASS |
| `/backup-report.json` | `GET /backup-report.json` 200 through the proxy | `outcome` = `success` with the success line (same assert as step 15) | 200; `outcome: success`, `Backup succeeded at 08:15 on 26 Oct.` | PASS |

## 3. View-to-step wiring (characterization suite, green on the build)

Per-view UI behaviour for the desk order above is pinned by the
Vue characterization tests (CI job `app-build`, `success` on
`fb5606f`); the live run proves the contracts the views call, the
suite proves each view calls them and renders the result:

- Router: `app/src/router.test.ts:17` holds the desk, book, stay, folio, print, and admin routes plus the placeholder catch-all; `:32–:80` render each screen for its path (`/` desk through `/admin` admin console).
- Desk (`DeskView`, steps 1/10/15): sign-in-to-dashboard `DeskView.test.ts:143`; arrivals/in-house/departures with resolved guest names `:165`; attention lists + DailySheet cross-check `:183`; 401-to-sign-in `:302`; persisted-token reload `:337`; backup success line from the served feed `:352`; failure line + support wording `:373`; missing report treated as failed `:396`. The live backup line (section 2) is exactly what `:352` renders: `DeskView.vue:447` fetches `/backup-report.json` (`cache: no-store`) into `data-testid="desk-backup-report"` (`DeskView.vue:8`).
- Book (`BookView`, steps 4–7): 20 cases in `BookView.test.ts` covering find/register guest, quote, idempotent confirm, read-back, and refusal wordings.
- Stay (`StayView`, steps 8–10/12): 15 cases in `StayView.test.ts` covering two-click check-in, move, actual times, folio-review approval, and checkout refusals.
- Folio (`FolioView`, step 11): 8 cases in `FolioView.test.ts` covering charge post, payment record, and running-balance re-read.
- Print (`PrintView`, step 11): invoice-matches-folio `PrintView.test.ts:223`; one receipt per payment `:248`; confirmation load `:276`; attacker-influenced names rendered as text `:456`; single-document print isolation `:496`; no raw-HTML sinks `:551`.
- Admin (`AdminView`, section 4): sign-in plus users/config/audit `AdminView.test.ts:192`; Bearer on every call `:223`; create/role/unlock round-trips `:237–:284`; audit re-query `:304`; 401 paths `:318–:368`; FORBIDDEN surfacing `:389`.

## 4. Admin console reads (users/roles, hotel config, audit-log view)

Read-mostly checks against the live run state via the proxy with
the owner session token (signed in live through
`POST /v1/admin/SignIn` with the per-run boot identity); no new
users were created by this pass:

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| `ListUsers` | owner identity listed, no secret hashes leaked | one user: `signinIdentity: owner`, `role: owner`, `locked: false`; response carries no secret hash material | PASS |
| `GetHotelConfig` | hotel profile reads back (`Skeleton Hotel`, boot seed values) | `schemaVersion: 1`, `values.name: Skeleton Hotel`, UTC, 14:00/12:00, retention floor 365 | PASS |
| `QueryAuditLog` | run entries newest-first with unaltered actor and timestamp | 2 entries newest-first, each with `at` + `actor`: `boot \| user.updated` 08:16:35Z, `boot \| user.created` 08:15:30Z | PASS |

## 5. Defects

No product-behaviour deviation found across the desk loop (book →
check in → charges → payment → check out → invoice/receipt print
comparison), the six Vue screen surfaces, the legacy redirects, the
admin console reads, or the backup-report surface. The attempt-1
stale-volume refusal (`28P01`, section 0) is local-harness state on
this machine with the documented `down -v` workaround — the same
cause and remedy as the A1 attempt 1 — not a product finding, so no
Phase 6 - QA bug was filed.

Clean bill otherwise: every step above is PASS against its expected
observable.

## 6. Acceptance mapping (issue #316)

| Acceptance item | Evidence |
|---|---|
| Run log with per-step observed-vs-expected | sections 1 (desk loop), 2 (Vue surfaces + redirects), 4 (admin reads) |
| Bugs filed or clean bill | section 5: clean bill, no bugs filed |
| Evidence cited | build SHA + CI state, seed, bring-up attempts, EVIDENCE line, served-route bytes + redirect targets, backup-report body, admin read payloads, characterization cites with `file:line` |
| Reviewer APPROVE | remaining gate |

## 7. Exit linkage

This log plus the cited evidence (build SHA, seed, machine logs,
PERF-env facts) is the A1-lite record for issue #316. It does not
replace the A1 static-page log (kept as the pre-migration record)
and does not cover the A3 exploratory re-pass (separate issue, out
of scope here).

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-418
