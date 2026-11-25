# Release notes — per-release change entries

Status: active. Per-release change entries for the hotel-mgmt MVP,
owned by `release-manager` (row flipped from stub on the first entry,
Refs #646). One entry per change that ships in the release bundle,
written for the delivery team and the hotel owner, newest first. The
install and upgrade procedures an entry refers to are in
`../devops/deployment.md`; the matching rollback note is in
`rollback.md`; the owner-facing steps the desk follows are in
`../operations/runbook.md`. Entries describe behaviour only — a pipeline
or workflow change is never made from here.

## 1. What an entry carries

Every entry states, in this order:

1. **Change and trace.** What changed, the issue it closes, the decision
   it implements, and the risk label the issue carries.
2. **What staff see.** The desk-visible effect in plain words, including
   any new refusal or plain sentence the front desk can meet.
3. **Install/upgrade delta.** Anything the delivery team must carry
   beyond the procedures already in `../devops/deployment.md`
   (configuration values, service addresses, restart order), or
   "nothing beyond the standard upgrade".
4. **Rollback pointer.** The matching note in `rollback.md` and what the
   revert restores.
5. **Evidence state and follow-ups.** Which verification the change
   carries at merge — the guard registry, the stack gates, and the live
   checks that still have to pass before the release is handed over —
   and every obligation the change deliberately leaves open.

An entry never promises behaviour the code does not keep: a claim that
matters for operations cites the implementation or the spec by
`file:line`. Entries are English; the owner-facing sentences quote the
plain words used in `../operations/runbook.md`.

## 2. Unreleased

Nothing has shipped as a versioned release yet; the entries below are
queued for the next bundle. Entries are numbered in the order they were
prepared, not merged; the delivery team reads them as one list.

### 2.1 Departure release and same-day reuse after check-out (Closes #646)

**Change and trace.** A committed check-out now completes the booking
behind the stay: the reservation moves `checked-in -> closed` — the
terminal state `BR-1` and the accepted booking state machine already
name — as part of the same close the desk confirms. Stay calls the new
Reservations provider operation `CheckOutReservation` after its
`in-house -> closed` flip commits, resolving the booking by the
`stay_id` link set at check-in (`services/stay/src/store.ts:260-292`
is the as-built close that completes nothing;
`services/reservations/internal/store/store.go:204-206` is the active
set the booking now leaves). The `CheckOut` response gains the additive
`bookingCompletion` object (`1.0 -> 1.1`), which tells the desk whether
the completion was recorded. No lifecycle state is added: `closed`
already exists in the state CHECK (`services/reservations/migrations/000002_schema.up.sql:29-33`),
so there is no schema migration and no data backfill. Design:
`../architecture/lld.md` section 22; state diagram
`../architecture/state-machine.md` section 1.1; product conditions
`AC-DEP-1`..`AC-DEP-5` (`../product/acceptance-criteria.md` section
15); requirements `FR-DEP-1`..`FR-DEP-5`
(`../requirements/mvp-requirements.md` section 23); decision D-26 in
`../project/decision-log.md`. Risk label: `risk-medium`, tier T2.

**What staff see.** After a check-out the guest's booking reads
completed in the booking history and the reservation calendar, and the
past stay remains in history — it is no longer shown as an active or
checked-in booking. The same room type can be sold for arrival today,
including when the guest left earlier than the recorded departure date:
the departed booking stops blocking availability from the moment the
close commits, and no booking's dates are rewritten. The departed room
follows the unchanged housekeeping path — released dirty, marked
cleaned, then inspected on the Rooms surface — and is then offered for
assignment, so the next guest checks into the same room the same day.
Every refusal keeps its existing plain words and completes nothing: an
open balance without a provenanced approval, an unreadable folio, the
#588 release, the #600 room charge review, and the #601 settlement gate
behave exactly as they do today. When the close commits but the booking
cannot be marked completed, the desk reports the check-out in plain
words without claiming the booking is completed; the handling for that
state and for bookings left stranded by an older bundle is
`../operations/runbook.md`, section 8.

**Install/upgrade delta.** Nothing beyond the standard upgrade
procedure (`../devops/deployment.md` sections 4–5). One bundle-level
service address is added, not a per-hotel setting: the `stay` module
reads `RESERVATIONS_BASE_URL` from the release bundle (default
`http://reservations:8081`), forwards the caller's session token, and
caps the call at two seconds — the same pattern the reservations module
uses for `RATES_BASE_URL`. The completion is fail-soft by design: an
unreachable reservations module does not refuse the close, it leaves
the booking active and visible as a split, so the pre-flight and health
checks now confirm the stay module reaches the reservations module on
the hotel LAN (`../devops/deployment.md` sections 3 and 5). No schema
migration, no data backfill, no restart-order change, and no desk
rebuild beyond the bundle's own; a desk build that predates the field
keeps working because `bookingCompletion` is additive. An installation
upgraded from an older bundle inherits the stranded bookings described
in `../operations/runbook.md` section 8.2 — they are handled there,
never by editing a booking at the desk.

**Rollback pointer.** `rollback.md` [section 5.3](rollback.md): revert
the single implementation PR. The revert restores the previous
behaviour — a close stops completing the booking — and has no data
effect: the `closed` state and the `stay_id` link already exist, so no
migration runs in either direction, and bookings already completed
keep reading completed as valid history (nothing un-completes them).
The #588 release, the #600 room charge, and the #601 settlement gate
are untouched in both directions.

**Evidence state and follow-ups.** The change is T2 and needs the
`spec-reviewer` `SPEC-GATE PASS` on #646 before the implementation PR
opens; the guard registry `DR1`–`DR13` and the evidence rule `DR-E1`
are the `qa-lead` handoff
(`../testing/departure-release-test-traceability.md`), and every one of
those guards is created by the implementation PR, which also re-pins
the existing check-out pins it extends. Verification at merge: the
Reservations stack builds, vets, formats, and tests green, the Stay
stack builds, lints, and tests green, the desk suite and the browser
desk-loop stay green with the #588/#600/#601 cases unchanged,
`script/contract-check.sh` and `script/openapi-route-check.sh` pass
over the new operation and the `1.1` response, and
`script/markdown-link-check.sh` passes. Before
handover, the live lab re-runs the owner scenario (book A, check in,
check out, read A's booking, book B for the same type and date, mark
the room ready, check B in) and records it in the implementation PR
body or on the issue. Deliberately open: no automatic repair for
bookings stranded before this bundle (the D6 reconciliation follow-up,
`../architecture/lld.md` section 22.7, with the interim support step in
`../operations/runbook.md` section 8.2), no `reservation.completed`
event (D5), and no reporting projection on the completed state.

### 2.2 Desk room reassignment and vacated-room release (Refs #647)

**Change and trace.** A check-in now commits only the room the guest is
actually given, and a room the commit set aside for a guest who never
landed is handed back in the same commit window; the Stay screen gains
one `Move room` card that moves an in-house guest to another ready room
and releases the vacated one, so the arrival-time swap (a guest expected
in 101 who arrived in 102) and a mid-stay move are one path
(`AC-REA-2`, `AC-REA-4`). It uses only the operations that already exist
— `AssignRoom`, `MoveRoom`, and `ReleaseRoom`
(`contracts/http/AssignRoom.json`, `MoveRoom.json`, `ReleaseRoom.json`)
— in one documented order: assign the target, move the stay, release the
vacated room, with the target released back to the ready state when a
later step refuses. No new operation, field, lifecycle state, event,
schema, or migration (`../architecture/lld.md` section 23.7). The
`MoveRoom` call the desk now makes is the operation `FR-FDK-3` and
`BR-19` already promised; the arrival-time half is
`FR-REA-1`..`FR-REA-5` (`../requirements/mvp-requirements.md` section
24) against done-conditions `AC-REA-1`..`AC-REA-5`
(`../product/acceptance-criteria.md` section 16), with the desk delta and
its 20-key EN+VI copy in `../product/desk-ui-design-rollout.md` section
6.17, decision D-27 in `../project/decision-log.md`, and risk R-11 in
`../project/risk-register.md`. Risk label: `risk-medium`, tier T2. Issue
#647 is closed by the implementation PR; this entry documents the change
the spec set describes.

**What staff see.** Only the room the guest is in reads occupied after a
check-in: if the desk switched rooms after the panel had loaded the
booked type's ready rooms, the room the panel showed is never taken, and
a check-in that refuses after the room was set aside now says the
check-in was refused and the room is free again — or names the room that
still reads occupied when handing it back itself failed. The Stay screen
gains one `Move room` card below the two existing cards (same styling,
same tokens, no new screen, dialog, or print surface): pick a guest in
house and a ready room, press `Move guest`, and the receipt names the
guest, the old room number, the new room number, and the time in the
hotel's local time. The old room reads vacant and dirty on the next main
board and Rooms-screen load and the new room reads occupied; the stay
stays in house with its folio link, and the move keeps both room numbers
and its time in the stay history. Refusals stay in plain words and never
show an envelope code: a room just taken, a guest no longer in house, a
refused move whose target is free again, an unreadable reply that names
both rooms and asks staff to reload, and a move whose last release failed
("the guest is now in room 102, but room 101 still reads occupied").
Check-in, check-out, the room charge review (#600), the settlement gate
(#601), the departure completion (#646), and room housekeeping behave as
before. A room stranded **before** this release keeps reading **Occupied**
with **Unknown guest** until the delivery team clears it once at the
upgrade (`../operations/runbook.md` section 9).

**Install/upgrade delta.** Nothing beyond the standard upgrade procedure
(`../devops/deployment.md` sections 4–5): no new bundle-level service
address, no per-hotel configuration value, no restart-order change, no
schema migration, and no data backfill. The desk is served from the same
bundle, so the card and the compensating release arrive with it; an older
desk build keeps working because no contract changed, but it keeps the
defect. An installation upgraded from an older bundle inherits the rooms
that build stranded: the delivery team clears them once, before handing
the desk back, per `../operations/runbook.md` sections 9.3 and 9.4
(`../devops/deployment.md` section 4 carries the step), and no automatic
repair or backfill ships with this release.

**Rollback pointer.** `rollback.md` [section 5.2](rollback.md): revert the
single implementation PR. The revert restores the two-panel Stay screen
and the previous behaviour — check-ins stop compensating and the desk
stops calling `MoveRoom` — and has no data effect: the three operations,
the `stay_moves` and room state-history rows already exist, so no
migration runs in either direction and no restore is needed. Rooms the
reverted build strands, and rooms stranded before it, are cleared with
`../operations/runbook.md` section 9.4. The #588 release, the #600 room
charge, the #601 settlement gate, and the #646 departure completion are
untouched in both directions.

**Evidence state and follow-ups.** The change is T2 and needs the
`spec-reviewer` `SPEC-GATE PASS` on #647 before the implementation PR
opens; the guard registry `RR1`–`RR13` and the evidence rule `RR-E1`
(`../testing/arrival-reassign-test-traceability.md`) are the `qa-lead`
handoff, and every one of those guards is a named obligation the
implementation PR creates, re-pinning the #586/#596/#614 commit-window
pins, the #588 release pin, and the retired-hook pin rather than deleting
them. Verification at merge: the Rooms and Stay stacks build, lint, and
test green, the desk suite green with `RR1`–`RR10` plus the existing
pins, the browser desk scenarios green (`RR11`) with the Stay design
facts carrying the decided card (`RR12`), `script/contract-check.sh` and
`script/openapi-route-check.sh` green as a re-run with no contract delta,
the live desk loop (`e2e-single-host`) green over the assign / move /
release chain, `script/catalogue-coverage-check.sh` green over the 20
keys in both locales (`RR13`), and `script/markdown-link-check.sh` green.
Before handover, the lab reproduces the owner scenario, records which path
leaves the stale hold (switch after the preload, switch after a commit, or
a mid-stay move) in the implementation PR body or on the issue, and
records the before/after pair in `../testing/evidence/647/README.md`
(`RR-E1`). Deliberately open: no server-side compensation or retry worker
— a desk closed between setting a room aside and finishing the action
still leaves one room to clear (`../architecture/lld.md` section 23.9,
R12, cleared with `../operations/runbook.md` section 9); no automatic
repair for rooms stranded before this bundle; and no dedicated move-history
list, because no read operation exposes the stay's move rows (a follow-up
issue if the owner wants one).

### 2.3 Server-side reservation price basis (Refs #632)

**Change and trace.** A reservation no longer freezes the price the
request asserts. On both `CreateReservation` and `ModifyReservation` the
reservations module now reads `POST {RATES_BASE_URL}/v1/rates/QuotePrice`
for the effective room type, arrival date, departure date, and named
discount, with the clerk's session token forwarded and the existing
five-second timeout, and freezes the quote's `totalMinor` and the
`discountName` the quote applied; a request that asserts a different
total — lower, higher, or zero for a priced stay — is refused
`PRICE_CHANGED` (409) naming both totals, and a Pricing service that
cannot be read refuses the booking `UPSTREAM_UNAVAILABLE` (503) instead
of freezing an unverified price, so nothing is written in either refusal
(`../architecture/lld.md` section 25.2–25.6; as-built defect trace
`../architecture/services/reservations.md` section 9). The stored
`priceBasis` keeps its shape, and the #600 check-out room charge keeps
posting the frozen total — now a verified one. Done-conditions
`AC-PRC-1`..`AC-PRC-5` (`../product/acceptance-criteria.md` section 18)
with the desk recovery `AC-DSK-20`; requirements `FR-PRC-1`..`FR-PRC-5`
(`../requirements/mvp-requirements.md` section 26); decision ADR-0007
(`../architecture/decisions/adr-0007-server-side-reservation-price-authority.md`,
accepted 2026-11-24 on owner approval) and D-30 in
`../project/decision-log.md`; risk R-15 in
`../project/risk-register.md`. Risk label: `risk-high`, tier T3. No
schema, table, column, migration, backfill, event, lifecycle state, or
stored-shape change (`../architecture/lld.md` section 25.7).

**What staff see.** On the normal path nothing changes: the Book screen
already quotes the stay before the clerk confirms, so the total the
booking freezes is the total the clerk saw, and the confirmation, the
booking history, the calendar, and the printed document keep showing it.
Two plain refusals are new. When the rates changed between the quote on
screen and `Confirm`, the screen says the rate changed while you were
booking, shows the new total, and asks for a second confirmation — only
that second `Confirm` books, and a double click still books once, so the
desk never books a total the clerk has not seen; if the guest declines,
nothing is booked and no room is held, and a re-read that fails says so
and books nothing. When the pricing part of the system cannot be
reached, the booking is refused with the existing plain error sentence
while the screen keeps the quote it showed, and a retry sends the same
booking. The no-rate-price
refusal, the sold-out refusal, the booking-rule refusals, check-in,
check-out, the #600 room charge, the #601 settlement gate, the #646
departure completion, and the #647 room reassignment behave exactly as
before. Bookings already stored keep the total they were stored with,
including totals stored before this bundle: nothing is re-derived,
backfilled, or rewritten, and a reprice happens only when staff change
that booking. The desk-facing steps are `../operations/runbook.md`
section 15.

**Install/upgrade delta.** Nothing beyond the standard upgrade procedure
(`../devops/deployment.md` sections 4–5): no new bundle-level service
address, no per-hotel configuration value, no restart-order change, no
schema migration, no data backfill, and no desk rebuild beyond the
bundle's own (an older desk build keeps working: `priceBasis` is relaxed,
not removed, and the new codes only ever appear on a refusal). What does
change is the dependency: the booking path needs the rates module on
every create and modify. The reservations module's existing
`RATES_BASE_URL` (`deploy/compose.yaml:46`, default
`http://rates:8082`) must be reachable from it, and while rates is
unreachable the desk can neither book nor modify — reading bookings,
cancellations, check-in, and check-out keep working. The pre-flight
(`../devops/deployment.md` section 5) and the health check (section 3
step 5) now confirm that reachability, and the pre-flight runs before
every install and upgrade. An installation upgraded from an older bundle
inherits bookings frozen at a caller-supplied total; they are handled per
`../operations/runbook.md` section 15.3, never by editing a booking at
the desk and never by a bulk correction.

**Rollback pointer.** `rollback.md` [section 5.1](rollback.md): revert
the single implementation PR and redeploy the bundle. No data effect: no
schema, column, migration, or stored shape changes in either direction,
bookings already frozen at a quote keep their totals, and no
configuration value has to be removed because `RATES_BASE_URL` already
existed. The desk's price-changed branch is inert when the service never
raises the code, so the former desk-supplied price returns with no data
migration and no desk rebuild. The revert restores the original finding:
a caller that bypasses the desk can freeze any total again, and the #600
room charge posts it.

**Evidence state and follow-ups.** The change is T3 and `risk-high`: it
needs the ADR-0007 record (accepted 2026-11-24) plus the
`spec-reviewer` `SPEC-GATE PASS` on #632 before the implementation PR
merges, and the owner merges it personally. The guard registry
`PA1`–`PA14`, cases `PA-1`..`PA-8`, and the evidence rule `PA-E1` are the
`qa-lead` handoff (`../testing/price-authority-test-traceability.md`);
every one of those guards is created by the implementation PR, which also
rewires the two service pins that today assert the caller-supplied total
(`services/reservations/internal/service/service_test.go:46-61`,
`:121-135`) rather than deleting them. Verification at merge: the
Reservations stack builds, vets, formats, and tests green; the Rates
stack green as a re-run with no delta; `script/contract-check.sh` green
over the two new envelope codes and the two version bumps
(`CreateReservation` `1.1 -> 1.2`, `ModifyReservation` `1.0 -> 1.1`);
`script/openapi-route-check.sh` green over the mirrored operations;
`script/catalogue-coverage-check.sh` green over the new refusal sentence
in both locales; `script/markdown-link-check.sh` green; the desk suite
and the browser desk loop green with the #588/#600/#601/#646/#647 pins
unchanged; and the lab records the forged-low and unreadable-Pricing
before/after pair in `../testing/evidence/632/README.md` (`PA-E1`) with
the slice row in `../testing/test-report.md`. Deliberately open: no
backfill or re-derivation for bookings frozen before this bundle
(`../architecture/lld.md` section 25.9); a rates outage now refuses
bookings until it clears, mitigated by an availability alert rather than
a cached total (R9 — the alert is an obligation for
`../operations/monitoring-alerting.md` when the first exporter lands,
and until then the desk reports it per `../operations/runbook.md`
section 7); and the availability decision stays with its own issue.
### 2.4 Server-side reservation availability (Refs #631, ADR-0006)

**Change and trace.** Audit finding R1 (the #625 class): a
`CreateReservation` / `ModifyReservation` request decided the overbooking
outcome with its own `sellableUnits` field, so a caller that sent a large
number overbooked without ever seeing `CONFLICT`. The booking guard now
derives its ceiling server-side from the recorded room inventory: Rooms
answers `POST /v1/rooms/CheckRoomTypeSellability` for the effective room
type and stay dates, and the ceiling is `totalCount - len(blockedRooms)`.
The request's `sellableUnits` stays in the contract as an advisory field:
it is shape-checked when present and never reaches the guard. Design:
`../architecture/lld.md` section 26; decision
`../architecture/decisions/adr-0006-server-side-availability-derivation.md`;
product conditions `AC-OVB-1`..`AC-OVB-3`
(`../product/acceptance-criteria.md` section 19). Risk label:
`risk-high` — booking-path integrity on the money/occupancy line, so it
needs explicit owner approval and the owner merges manually.

**What staff see.**

- A sold-out room type refuses a booking exactly as before: one refusal
  naming the room type and the dates, and no booking is created
  (`CONFLICT`, 409). The desk's own availability pre-check and the
  sold-out wording are unchanged.
- A room type that still has sellable units accepts the booking even when
  the number the desk sends is small, absent, or stale — the desk cannot
  refuse a bookable stay by sending a low number, and cannot overbook by
  sending a high one.
- When the recorded room inventory cannot be read at all, the booking (or
  the date/room-type change on an existing booking) is refused with
  `UPSTREAM_UNAVAILABLE` (503) instead of being guessed through. Nothing
  is written. This is a fault, not a sold-out answer, and the runbook
  splits the two for the front desk: `../operations/runbook.md`,
  section 11. Check-in, check-out, charge posting, payments, printing,
  and every existing booking keep working during such a fault.
- The desk continues to send `sellableUnits` in the request. It is now
  advisory, so a desk build that predates this change keeps working
  against the new server and vice versa.

**Install/upgrade delta.** The reservations module gains one bundle-level
variable, `ROOMS_BASE_URL` (bundle default `http://rooms:8085`, wired
beside `RATES_BASE_URL` in `deploy/compose.yaml:46`; boot wiring
`services/reservations/cmd/server/main.go:44-49`). It is a bundle default,
not a per-hotel value: the standard upgrade carries it automatically, and
only the small-cluster placement changes it when the Rooms module moves
hosts (`../devops/deployment.md`, section 2). Restart order, pre-flight
checks, and the health-check step are updated in the same change
(`../devops/deployment.md`, sections 3 and 5) because a booking now needs
the Rooms module reachable on the hotel LAN. No database schema,
migration, seed, or event-payload change exists in either direction.

**Rollback pointer.** Revert the single implementation PR; the previous
guard behaviour returns with the request's number and no data has to be
undone. Full note and the post-rollback checks: `rollback.md`,
section 5.4. Because the revert re-opens audit finding R1, it is an
owner-approved action, not a routine one.

**Evidence state.** Guards the implementing PR must carry (and the
`qa-lead` traceability must cite at the merged head): inflated
`sellableUnits` on create and on modify still answer `CONFLICT` with
nothing written; a low or absent number refuses nothing; a zero-capacity
room type answers `CONFLICT`, never 503; an unreadable, timing-out, 5xx,
malformed, or unwired capacity source answers `UPSTREAM_UNAVAILABLE`
with `{upstream: "rooms", operation: "CheckRoomTypeSellability"}`;
Rooms 4xx envelopes pass through unchanged; two simultaneous last-unit
attempts yield exactly one 200 and one `CONFLICT`; an idempotent replay
consumes no second unit. Stack gates: `services/reservations` build, test,
vet, `gofmt`; `services/rooms` build, test, lint;
`script/contract-check.sh`; `script/markdown-link-check.sh`. Live gate:
the desk-loop booking step and the browser end-to-end booking spec stay
green, and the end-to-end reservation check in the upgrade procedure
(`../devops/deployment.md`, section 4 step 6) proves the capacity read
works on the deployed bundle.

**Follow-ups (not carried by this change).** No alerting signal exists
yet for a rising `UPSTREAM_UNAVAILABLE` rate on bookings: the monitoring
and alerting spec stays a stub until the first exporter lands (see the
DevOps table in `../README.md`), so the fault is detected by the desk and
triaged with `../operations/runbook.md`, section 11. A capacity-specific
desk sentence and a per-night ceiling are separate changes (residual
risks R-OVB-1 and R-OVB-2, `../architecture/lld.md` section 26.7);
neither is promised here.

### 2.6 Folio writes refuse a stay Billing cannot verify (Refs #634)

**Change and trace.** Billing now reads the stay before it writes money.
Today `ensureFolio` creates a folio for any UUID `stayId` it is handed,
with no Stay read, and the four folio routes reach it with the caller's
id (`services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:65-71`
reached from
`services/billing/src/main/java/com/hotel/billing/service/BillingService.java:121`
`GetFolioBalance`, `:142` `PostCharge`, `:176` `RecordPayment`, `:264`
`RecordOpenBalanceApproval`), so a charge, a payment, or an
open-balance approval can be written against a stay that does not exist
or is already closed — an orphan folio Stay's check-out gate never
reads, and money rows with no stay behind them. From #634 on
`PostCharge`, `RecordPayment`, and `RecordOpenBalanceApproval` call the
already-registered C8 read `GetStayRef`
(`POST {STAY_BASE_URL}/v1/stay/GetStayRef`;
`services/stay/src/store.ts:406-423` refuses an unknown stay with
`NOT_FOUND` and anything outside `in-house` with `STATE_ILLEGAL`) on
every request, before the idempotency claim and before any insert, and
`GetFolioBalance` calls it only when the stay carries no folio — a
folio Billing already holds is served from Billing in every stay state,
so the departure invoice and its receipts keep printing. An unknown
stay refuses `NOT_FOUND` (404), a stay outside `in-house` refuses
`STATE_ILLEGAL` (422) naming the state, an unreadable Stay refuses
`UPSTREAM_UNAVAILABLE` (503), and a malformed id keeps
`VALIDATION_FAILED` naming `stayId`; no new operation, request or
response field, event, schema, migration, or backfill exists. The four
folio contracts gain the three codes additively (`1.0 -> 1.1`) and
`contracts/errors/envelope.json` registers `UPSTREAM_UNAVAILABLE` with
its `503` mapping — the drift ADR-0005 already named. Design:
`../architecture/decisions/adr-0008-folio-write-stay-verification.md`
(proposed), `../architecture/lld.md` section 27, `../architecture/hld.md`
section 20, seam `../technical/integration.md` C8, refusals
`../technical/error-handling.md` section 5; product conditions
`AC-FWV-1`..`AC-FWV-7` (`../product/acceptance-criteria.md` section 20),
desk delta and copy `../product/desk-ui-design-rollout.md` section 6.21,
decision D-32 in `../project/decision-log.md`; requirements
`FR-FWV-1`..`FR-FWV-5` (`../requirements/mvp-requirements.md` section
28). Risk label: `risk-medium`, tier T3 — the owner accepts ADR-0008
(`proposed -> accepted`) and #634 carries a `SPEC-GATE PASS` before the
implementation PR merges.

**What staff see.** A folio write no longer depends on the id the desk
happens to send. Three plain sentences are added in both locales and
none shows a code, a status, or a trace: "No stay matches that ID, so
nothing was recorded. Check the stay ID and try again."
(`desk.folio.refused_unknown_stay`), "That stay is already checked out,
so nothing was recorded. Charges and payments cannot be added after
check-out." (`desk.folio.refused_closed_stay`), and "The stay could not
be checked, so nothing was recorded. Try again."
(`desk.folio.refused_unreadable_stay`). Everything the desk does today
keeps working: opening the balance of a fresh check-in still creates the
folio at zero balance, a charge, a payment, and an open-balance approval
on a guest in house still commit with the same line, balance movement,
and receipt, and a departed stay's folio balance, invoice, and receipts
still open and print without asking the stay module at all. What changes
is the money path against a stay Billing cannot verify: a charge, a
payment, or an approval against an unknown id or against a stay already
checked out is refused and nothing is recorded, which also means a
retried charge whose first attempt landed before the close now refuses
while the recorded line stays on the folio. Because every write verifies
the stay, an approved open balance can no longer be settled by a folio
write **after** the guest leaves — take the payment before completing
the check-out; a late-settlement path is a named consequence with its
own follow-up, out of scope here. While the stay module cannot be
reached, the three writes and a first, folio-less balance read refuse
with the "could not be checked" sentence and nothing is recorded
(fail-closed by design); the desk work that keeps guests moving and the
paper list to keep are `../operations/runbook.md`, section 14.

**Install/upgrade delta.** Nothing beyond the standard upgrade procedure
(`../devops/deployment.md` sections 4–5). One bundle-level service
address is added, not a per-hotel setting: the `billing` module reads
`STAY_BASE_URL` from the release bundle (default `http://stay:8084`, the
port the stay module already publishes, `deploy/compose.yaml:81`),
forwards the caller's session token, and caps the call at two seconds —
inside `NFR-PERF-1`'s three-second action bound and the same pattern the
stay module uses for `RESERVATIONS_BASE_URL`. The call is fail-closed,
unlike the #646 completion: an unreachable stay module refuses the folio
write rather than writing an unverified folio, so the pre-flight and
health checks now confirm the billing module reaches the stay module on
the hotel LAN (`../devops/deployment.md` sections 3 and 5). No schema
migration, no data backfill, no restart-order change, and no desk
rebuild beyond the bundle's own: the contract change is error-code
additive, so a desk build that predates the field keeps working, but it
shows its generic "the request could not be completed" fallback instead
of the three new sentences. Folios an older bundle already wrote against
a stay that does not exist stay as they are — this change prevents new
ones and ships no deletion, migration, or repair
(`../operations/runbook.md` section 14.4 is the read-only inventory step
for support).

**Rollback pointer.** `rollback.md` [section 5.6](rollback.md): revert
the single implementation PR. The revert restores the previous
ensure-on-first-use behaviour — a folio is created and money is written
for the id the caller sends, with no Stay read — and has no data effect:
no table, column, or migration exists on this path in either direction,
so no migration runs and no restore is needed. Folios already written,
already-orphaned ones included, stay as they are; the four folio
contracts return to `1.0` with the code, and the desk loses the three
refusal sentences and falls back to its generic sentence. The #588
release, the #600 room charge, the #601 settlement gate, the changes of
#646 and #647 are untouched in both directions, and `STAY_BASE_URL`
stops being read.

**Evidence state and follow-ups.** The change is T3 and needs the
`spec-reviewer` `SPEC-GATE PASS` on #634 plus the owner's
`proposed -> accepted` flip of ADR-0008 before the implementation PR
merges. The guard registry `FW1`–`FW13` and the evidence rule `FW-E1`
(`../testing/folio-write-verification-test-traceability.md`) are the
`qa-lead` handoff, and every one of those guards is an obligation the
implementation PR creates; the `AC-BIL-*`, `AC-DSK-*`, `AC-CKO-*`,
`AC-DEP-*`, and `AC-REA-*` pins that must stay green unchanged are
listed there. Verification at merge: `cd services/billing && mvn
verify`; `cd services/stay && npm ci && npm run build && npm test &&
npm run lint`; the desk suite with the `FolioView` and `PrintView` pins
green; `script/contract-check.sh` and `script/openapi-route-check.sh`
over the four `1.1` contracts and the envelope registration;
`script/catalogue-coverage-check.sh` over the three keys in both
locales; the live desk loop `script/e2e-desk-loop.sh` with the
post-close refusal step and an unchanged row count for the closed stay;
and `script/markdown-link-check.sh`. Before handover, the lab re-runs
the finding both ways — an orphan folio for a random UUID before the
change, and the same write refused with no row after it — and records
the before/after pair in `../testing/evidence/634/README.md` and the
slice in `../testing/test-report.md` (`FW-E1`). Deliberately open: no
late-settlement path for an open balance approved at check-out and paid
after the departure (its own decision and issue); no cleanup, backfill,
or repair of orphan folios an older bundle wrote; no cached, mirrored,
or offline replica of stay state inside Billing (`NFR-AVL-1` does not
extend to a fact that decides money); and the availability alert that is
R8's mitigation (`../technical/security-threat-model.md` section 8) is
not shipped with this change — `../operations/monitoring-alerting.md`
stays a stub until the first exporter lands (ADR-0001), so until then
the desk's refused-write reports and the support check in
`../operations/runbook.md` section 14.4 are the watch.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-1041

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-948

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-963

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-969

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-1049

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1057
<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-936
