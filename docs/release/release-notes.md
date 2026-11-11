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
`services/reservations/internal/store/store.go:194-196` is the active
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

**Rollback pointer.** `rollback.md` [section 5.2](rollback.md): revert
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

**Rollback pointer.** `rollback.md` [section 5.1](rollback.md): revert the
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

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-948

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-963

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-969
