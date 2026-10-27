# Phase 6 QA A3-Vue — exploratory pass on the Vue SPA (run log)

Status: active. QA activity A3-Vue from issue #317 (post-migration
delta: the A3 exploratory in `phase-6-qa-a3-run-log.md` ran against
the static pages with no live stack; the Vue SPA under `/app/`
(desk/book/stay/folio/print/admin plus the backup-report line) had
only the scripted A1-lite loop plus characterization tests — no
tester-driven exploratory pass; this log Closes #317), owned by
`qa-lead`. One time-boxed exploratory session per Vue screen with a
front-desk persona, hunting what the scripted loop misses:
UI/wording/flow defects, print isolation, session-expiry paths, and
role refusals. Every screen leaves a note (screen + scenario +
outcome) even when it finds nothing. Three defects found, each filed
as one issue under the `Phase 6 - QA` milestone in the plan
(`phase-6-qa-plan.md` [section 3](phase-6-qa-plan.md)) format; everything else is an
explicit clean bill.

## 0. Build, seed, environment, and method facts

| Fact | Value |
|---|---|
| QA build (worktree HEAD) | `ea802e7` (`docs(testing): Add A1-lite Vue desk-loop run log (Closes #316) (#320)`). App code is identical to the A1-lite build `fb5606f` (the delta is docs-only); the loop rebuilt every image from this tree |
| CI on the build | app suite re-run on this tree for this pass: `npm run test` 12 files / 161 tests green (section 7). Per-stack CI green on the parent `fb5606f` per the A1-lite log; no product code changed since |
| Seed / hotel config | `deploy/seed/boot.sql` (hotel profile `Skeleton Hotel`, room types `Standard Double` + `101/102`, two E2E rooms inspected-ready); no `deploy/config/hotel.json` in tree (boot seed branch, same as A1/A1-lite) |
| Bring-up | `script/e2e-desk-loop.sh --keep-up --staging-dir /tmp/opencode/a3vue/backup-staging` (fresh `docker compose up -d --build`, per-run `DB_PASSWORD` / `ADMIN_BOOT_SECRET`, fail-closed on dev defaults, secrets never printed). One clean run, `SUCCEEDED`, exit 0; stack left up with `--keep-up` for the sessions below, torn down after |
| Vue build served | `(cd app && npm ci && npm run build)` inside the loop (same as A1-lite) |
| Live-stack evidence ids | E2E bring-up ref `RSV-FZGZ3EBS` (Nov window) / today ref `RSV-H96FE6ME`; QA-session ref `RSV-2HBALL5F` + `RSV-QG3DQN4T` (Dec window, priced + booked during this pass), stay `1dfe5ecc-3142-494d-8fda-83a6431a1fd5`, folio `0a33fced-cc15-4484-b340-7ad9c3d9674f`, guest `QA Booker` (`eb9176db-74a8-4a79-805b-60da897d785f`), clerk `qa-clerk` |
| QA seed prep (scratch stack only) | Priced 2026-12-01/02 on plan `E2E-RACK` (`UpsertRatePrice`); cycled E2E-101/102 `vacant-dirty → vacant-clean → vacant-inspected` (`UpdateRoomState`, legal transitions); created `qa-clerk` (`front-desk`) for the role-refusal session, role round-tripped back to `front-desk`. Nothing here touches product code or committed seed data |
| Time boxes (min) | desk 20, book 30, stay 30, folio 20, print 25, admin 20 |

Method: live HTTP sessions against the loop-seeded stack through the
proxy (mirroring each view's exact op sequence and payload shapes
from `app/src/views/*.vue`), plus a full read of all six views, the
shared client (`app/src/api/client.ts`), the session store, and the
i18n catalogue layer as the front-desk persona. Characterization
pins are cited `file:line` where the live run leans on them
(session-expiry/client-offline paths, print CSS). No browser was
available; rendering assertions rest on the view sources, the
passing suite, and one executable selector check (section 5).

## 1. Desk (`/app/`, DeskView) — clean bill

Scenarios walked live: sign-in as owner → dashboard reads
(`ListArrivalsDepartures`, `ListRoomsByState` × dirty/clean/out-of-order,
`DailySheet`) → arrivals/in-house/departures with resolved guest
names → DailySheet cross-check line → attention lists → backup-report
line (`GET /backup-report.json` → `outcome: success`, `Backup
succeeded at 08:32 on 26 Oct.`) → sign-out; expired-token probe
(`Bearer dead-token`) and missing-token probe on the desk ops.

- Wording vs catalogue: all 206 `t()` keys used across the views
  resolve in `messages/en.json` (script-checked on this tree); every
  call carries an explicit English fallback, so a future key miss
  degrades to the fallback, never to `message-missing:`. No `v-html`
  / `innerHTML` sinks in any view or `App.vue` (grep clean).
- Session-expiry path: missing token → `401 UNAUTHENTICATED`
  (`Missing session token.`); the shared client clears the store
  and routes to sign-in, and the view shows `desk.today.session_expired`
  (pinned `DeskView.test.ts:302`, `client.test.ts:55`). A
  present-but-forged token is NOT refused by the desk services —
  recorded as observation O1 (section 8), not a defect: the
  presence-only skeleton check is documented accepted behaviour
  (`services/stay/src/auth.ts`, identical in rooms/guests; same shape
  in the Go/Spring handlers) pending the identity-hardening slice.
- Backup line: success, failure, and missing-feed wordings are pinned
  (`DeskView.test.ts:352,373,396`); the live feed returned the
  success line above.

Outcome: nothing found — clean bill for the desk screen and the
backup-report line.

## 2. Book (`/app/book`, BookView) — two defects filed (#321, #322)

Scenarios walked live: find returning guest by name → register
walk-in (actor recorded) → quote (valid, unknown type) → confirm
shapes (exact UI payload, capacity-shaped payload) → read-back →
idempotency replay → sold-out window probe.

- Quote: unknown room type → `404 NOT_FOUND` → view maps to
  `refused_noprice` (pinned `BookView.test.ts`, live-verified).
- DEFECT 1 (#321): confirming through the UI's exact payload
  (`guest: { guestId }`, no `fullName`) is refused live with `400
  VALIDATION_FAILED` (`Missing hotel-mandatory guest field
  fullName.`, FR-CUS-1, `requiredGuestFields: ["fullName"]` on this
  hotel). The view holds no guest name (find/register responses
  carry it but only the id is kept), so EVERY `/app/book` confirm
  fails on this hotel; the raw backend message surfaces unguided
  (no catalogue mapping for `VALIDATION_FAILED`). The scripted loop
  never catches this: it sends `fullName` explicitly, and the
  characterization test pins the incomplete shape
  (`BookView.test.ts:311` asserts `guest` equals `{ guestId }`
  against a mock that accepts anything). Filed as `fix`,
  `risk-medium`, major.
- DEFECT 2 (#322): the view hardcodes `sellableUnits: 1`
  (`BookView.vue:691`), but the guard compares overlapping bookings
  against that number as capacity (`booked >= sellableUnits` →
  `CONFLICT`). Live A/B on the 2-room type for 2026-11-25→27:
  capacity-shaped (`sellableUnits: 2`, the searched count the loop
  passes) → confirmed `RSV-QG3DQN4T` (a room IS free); UI-shaped
  (`sellableUnits: 1`) → `409 CONFLICT` (`No sellable unit left`)
  → the view shows `refused_soldout`. So the second overlapping
  booking on any multi-room type is wrongly refused as sold out.
  Ported from the legacy page (`frontend/book.html:356`); now
  live-proven. Filed as `fix`, `risk-medium`, major.
- Double-click/idempotent confirm is pinned by test
  (`BookView.test.ts:296,314`); live-unverifiable until defect 1 is
  fixed (every UI-shaped confirm dies at validation first).
- Print/Copy buttons: the print CSS check below (section 5) confirms
  the confirmation section is inside `book-booking`, so the
  confirmation-only handout works; the earlier blank-page reading
  was wrong (the section nests at `BookView.vue:257-302`, matching
  the legacy `#confirmation-section`-inside-`#booking-section`
  structure). Copy fallback wording pinned by test.

Outcome: two defects filed (#321, #322); quote/refusal wording
otherwise clean.

## 3. Stay (`/app/stay`, StayView) — clean bill

Scenarios walked live on QA ref `RSV-2HBALL5F` (Dec window, booked
during this pass): two-click check-in (unknown ref → `NOT_FOUND`
`Unknown booking reference.`; first click loads booking + filters
ready rooms of the booked type; second click `AssignRoom` →
`CheckIn` → `CheckInReservation`, stay in-house) → mid-stay move
(E2E-101 → E2E-102, old room released) → actual-time recording →
folio review → open-balance checkout refused `SETTLEMENT_REQUIRED`
(stay remains in house) → approval → checkout closed with
`invoiceRef` = folio → re-checkout probe (observation O2).

- Refusal wordings name the cause throughout (`refused_unknown_ref`,
  `no_ready_rooms`, `refused_taken`, `refused_open_balance`); the
  stale-context guards (stay-ID edit clears `checkoutCtx`, hides
  approval, disables Check out) are as specified.
- `SETTLEMENT_REQUIRED` / `STATE_ILLEGAL` / idempotency pins hold
  (`StayView.test.ts:542,659`); the live run hit every refusal above
  except double-close (see O2).

Outcome: nothing found — clean bill for the stay screen.

## 4. Folio (`/app/folio`, FolioView) — clean bill

Scenarios walked live on the QA stay: open by stay ID (empty folio
renders `No charges or payments yet.`) → post room charge → post
extra → cash payment → running balance re-read after every mutation
(`balanceMinor: 62500` = 120000 + 2500 − 60000) → validation
wordings (missing stay, missing item/amount, non-positive payment).

- Unknown extra name (`Breakfast <b>deluxe</b>`) → guided refusal
  (`Charge item … is not defined.`): extras are hotel-defined, the
  free-text field guesses, the backend names the miss. Legacy
  parity, backend-guided — noted, not filed.
- Every mutating click carries an in-flight guard and a
  client-generated `idempotencyKey`; unrecognised lines fall back to
  `raw_line` instead of dropping silently.

Outcome: nothing found — clean bill for the folio screen.

## 5. Print (`/app/print`, PrintView) — one defect filed (#323)

Scenarios walked live on the QA folio/stay: open folio → invoice
(`ProduceInvoice` balance `62500` over 2 charges + 1 payment, lines
match the folio) → one receipt per payment (`ProduceReceipt` equals
the recorded cash payment) → confirmation load by reference →
print-isolation structure check.

- Invoice-matches-folio, per-payment receipts, attacker-text
  rendering, single-document isolation, and no-raw-HTML-sinks are
  pinned (`PrintView.test.ts:223,248,456,496,551`); the live
  invoice/receipt bodies match the folio exactly.
- Print isolation verified by structure: only the active
  `.print-document` prints, buttons hidden, ancestors forced visible
  (`PrintView.vue:1083-1100`, legacy `print.html:8-25` parity); the
  BookView confirmation handout re-checked against the legacy
  structure (section 2) — both sound.
- DEFECT 3 (#323): loading a confirmation by booking reference can
  never succeed live. Both views send the human ref
  (`BookView.onConfirm`, `PrintView.onLoad`), but
  `guests.produceConfirmation` requires a UUID
  (`requireUuid(input.reservationRef)`, `store.ts:271`) AND reads an
  in-memory map nothing populates — `attachReservation` has no
  server route (only five `case`s in `server.ts:87-133`) and no
  cross-service caller, so even a UUID yields `NOT_FOUND`. Live:
  human ref → `VALIDATION_FAILED` (`reservationRef must be a
  UUID.`); UUID id → `NOT_FOUND` (`Unknown reservation …`). The
  booking-confirmation document (and its Print/Copy buttons) is dead
  in both generations; the scripted loop never calls the op. Filed
  as `fix`, `risk-medium`, major (FR-GST-4).

Outcome: one defect filed (#323); invoice/receipt flows and print
isolation are clean.

## 6. Admin console (`/app/admin`, AdminView) — clean bill

Scenarios walked live: owner sign-in → users/config/audit reads →
create `qa-clerk` (`front-desk`) → sign in as clerk → role-refusal
probes → owner role round-trip (`front-desk → manager →
front-desk`, audit shows both `user.updated` entries newest-first) →
sign-out.

- Role refusals name the cause and stay signed in (no 401): clerk
  `ListUsers` / `QueryAuditLog` / `UpdateUserRole` (incl.
  self-promote) → `403 FORBIDDEN` (`Front-desk accounts cannot
  …`); the view surfaces the code per section without signing out
  (pinned `AdminView.test.ts:389`). `GetHotelConfig` succeeds for
  the clerk by design (desk-readable config), so the console
  degrades gracefully per section.
- Session-expiry path is LIVE for admin (unlike the desk services):
  forged token → `401 UNAUTHENTICATED` (`Invalid or expired session
  token.`); missing token → `401` (`Missing session token.`). The
  401-at-sign-in, 401-elsewhere, and dead-token-local-signout paths
  are pinned (`AdminView.test.ts:318,347,421`,
  `client.test.ts:55,68`).
- Save role / Unlock labels render through the catalogue (Refs #275
  fix verified present, `AdminView.vue:120-135`); rows render
  through interpolation (Refs #276 class of bug cannot regress).

Outcome: nothing found — clean bill for the admin console.

## 7. Cross-cutting checks + executed evidence

| Check | Evidence |
|---|---|
| Vue routes served | `GET /app/ /book /stay /folio /print /admin /no-such-route` → all `200` (history fallback shell); legacy paths → `301` to the `/app/*` equivalents (live, this build) |
| Catalogue | 206/206 view keys resolve in `messages/en.json`; every `t()` carries an English fallback |
| App suite on this tree | `npm run test`: 12 files / 161 tests green |
| Offline/copy fallbacks | client offline banner + manual retry, clipboard-less copy wording pinned by test (`client.test.ts:83,100`, `PrintView.test.ts:392,410`); no live kill-network run (no browser) |
| `noscript` fallbacks | present in all six views (source-read) |
| Book idempotency live | blocked by defect 1 (test-pinned only) |

## 8. Observations (not filed — known limitations / unreachable paths)

- O1 — Session-expiry 401s are live-unreachable on desk/book/stay/
  folio/print services: the skeleton auth checks token presence
  only (documented in `services/stay/src/auth.ts` and siblings,
  full HMAC validation deferred to the identity-hardening slice).
  The Vue 401 path itself is correct and test-pinned per screen;
  admin proves it live. No bug: accepted, documented behaviour.
- O2 — `CheckOut` on an already-closed stay answers
  `SETTLEMENT_REQUIRED` (settlement checked before state) rather
  than `STATE_ILLEGAL` (the loop pins `STATE_ILLEGAL` via
  `GetStayRef`, not a second `CheckOut`). Unreachable from the UI
  (`checkoutCtx` clears on success, button disables). Not filed.
- O3 — Folio extra names are hotel-defined while the field is
  free text; misses get a guided refusal. Legacy parity. Not filed.

## 9. Defects

Three deviations found, each filed as one issue under the
`Phase 6 - QA` milestone in the plan section 3 format (no fix lands
here):

- #321 `[fix] Send the guest full name when confirming a booking from the desk UI` (`fix`, `risk-medium`, major): UI-shaped `CreateReservation` (`guest: { guestId }`) refused live with `VALIDATION_FAILED` (FR-CUS-1); every `/app/book` confirm fails on this hotel.
- #322 `[fix] Pass the searched sellable count when confirming a booking from the desk UI` (`fix`, `risk-medium`, major): hardcoded `sellableUnits: 1` turns capacity-1 semantics on, so the second overlapping booking on a multi-room type is refused `CONFLICT` while a room is free (live A/B: capacity-shaped confirms `RSV-QG3DQN4T`, UI-shaped conflicts).
- #323 `[fix] Wire the booking confirmation flow end to end (ProduceConfirmation)` (`fix`, `risk-medium`, major): the op requires a UUID and reads a map nothing populates (no route, no producer); the views send human refs, so every confirmation load fails (FR-GST-4).

## 10. Acceptance mapping (issue #317)

| Acceptance item | Evidence |
|---|---|
| Per-screen notes recorded | sections 1–6 (scenario + outcome per screen, clean bills explicit) |
| Bugs filed or clean bill per screen | desk clean; book #321/#322; stay clean; folio clean; print #323; admin clean |
| Evidence cited | build SHA + bring-up log, live refs/ids/tokens-free payloads above, A/B outputs, app suite 161 green, characterization cites `file:line` |
| Reviewer APPROVE | remaining gate |

## 11. Exit linkage

This log plus the cited evidence (build SHA, seed prep, live
refusal/confirmation outputs, per-screen notes) is the A3-Vue
record for issue #317. It does not replace the A1-lite loop log
(kept as the scripted record) and executes no fixes — those belong
to the three fix issues above. Scratch-stack-only mutations (Dec
prices, room-state cycles, `QA Booker` guest, `RSV-2HBALL5F` /
`RSV-QG3DQN4T`, `qa-clerk`) die with the stack teardown.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-420
