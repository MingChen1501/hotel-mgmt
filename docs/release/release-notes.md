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

**Rollback pointer.** `rollback.md` [section 5.1](rollback.md): revert
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

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-948
