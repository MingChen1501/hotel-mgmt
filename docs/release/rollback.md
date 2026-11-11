# Rollback — per-change rollback notes

Status: active. Rollback notes for the hotel-mgmt MVP, owned by
`release-manager` (row flipped from stub on the first note, Refs #646).
One note per change that ships in the release bundle, newest first. The
install, upgrade, and failed-upgrade restore procedures live in
`../devops/deployment.md` (section 6 is the restore-and-redeploy path
for a bundle that fails its health check); this document adds the
per-change decision, mechanics, verification, and record that those
procedures point at. The matching release entries are in
`release-notes.md`; the desk-facing steps are in
`../operations/runbook.md`.

## 1. When a change is rolled back

A change is rolled back when it ships a defect the release cannot carry
until the next bundle: a desk action that refuses or fails where it used
to work, a wrong money or occupancy figure, a state a module cannot get
out of, or a data effect the change was not supposed to have. Two cases
are distinguished and never mixed:

- **Bundle failure** — the release does not pass the health check or the
  end-to-end reservation check after an upgrade. That is the
  restore-and-redeploy procedure in `../devops/deployment.md`, section 6,
  and it restores the previous bundle plus its pre-upgrade backup.
- **Change failure inside a healthy bundle** — the bundle runs but this
  change is wrong. That is the per-change note below: revert the change,
  redeploy the bundle normally, and keep the database. The pre-upgrade
  backup rule in `../devops/deployment.md` section 4 still applies to the
  upgrade itself; a per-change revert is not a reason to run a
  data restore, and it must not be used as one.

Risk labels set the merge bar, not the rollback bar: a `risk-medium`
change (this document's first note) rolls back on the normal merge gate
the project already applies. A `risk-high` or `risk-very-high` change
needs owner approval to merge and the owner merges it, so the owner also
decides its rollback.

## 2. Mechanics

1. Revert the change (one revert commit per change where the change is
   one PR) on a session branch and merge it through the normal path; no
   direct push to the default branch, no force-push, no history rewrite.
2. State whether the change carries a schema migration or a data
   backfill. A change whose note says "none in either direction" is
   reverted with the bundle and keeps its data; a change that added a
   migration is forward-only — the migration stays applied, the revert
   ships code that tolerates the added shape, and the note says so
   explicitly rather than implying the schema rolls back.
3. Redeploy per `../devops/deployment.md` section 4 (stop order, bundle
   replacement, start order, health check). Where a configuration value
   arrived with the change, the previous bundle no longer needs it; the
   hotel's per-hotel configuration set is re-applied unchanged.
4. Restore order of the modules does not change with a revert: database
   host first, then the module containers, then the reverse proxy.

## 3. Verification after a rollback

Run the checks that prove the symptom is gone and nothing else moved:

- The desk action the change altered, exercised end to end, and the
  symptom that forced the rollback — observed, not assumed.
- The #588, #600, and #601 desk paths where the change touched the
  check-out slice: release once, room-charge review, and the settlement
  gate refusals.
- The reassignment paths where the change touched the Stay screen: a
  check-in whose arrival preloaded one ready room and lands the guest in
  another (only the chosen room takes the guest), a move after a
  committed check-in (the old room vacant and dirty, the new room
  occupied, both rooms and the time on the receipt), and a definitive
  refusal after a room was set aside (the room free again). A room the
  reverted build strands is cleared with `../operations/runbook.md`
  section 9.4 before the desk resumes.
- The health check and the end-to-end reservation check from
  `../devops/deployment.md` sections 3 and 4.
- The stack gates named by the release entry for the change (unit,
  contract, and desk suites), so a revert is not mistaken for a green
  tree.

## 4. Record

Record the rollback in the change's note below: date, bundle version or
commit range, symptom observed at the desk, the revert reference, the
verification outcome, and any data effect (usually "none"). File an
issue for the defect that forced the rollback, link it to the change,
and follow the normal spec gate for the rework. A rollback with an
unrecorded outcome is not finished.

## 5. Per-change notes

### 5.1 Desk room reassignment and vacated-room release (Refs #647)

**Decision.** Roll back if the change makes a check-in refuse where it
used to work, if a room a guest is standing in reads vacant, if a room
the desk set aside and nobody used still reads occupied after a refused
action, if a move leaves the stay naming a room that reads free or frees
a room a live stay names, if the `Move room` card performs anything other
than the documented calls in the documented order, or if the desk offers
the move for a guest who is not in house. The change is `risk-medium`
(issue #647 labels `fix`, `risk-medium`); it rolls back on the normal
merge gate, without owner approval.

**Mechanics.** Revert the single implementation PR and redeploy the
bundle per `../devops/deployment.md` section 4. No schema migration and
no data backfill exist on this path, in either direction:
`rooms.room_status_history` and `stay_moves` already exist,
`ReleaseRoom` already accepts its `toState`, and no operation, field,
lifecycle state, event, or error code is added
(`../architecture/lld.md` section 23.7). The revert keeps the database as
it is and no restore is needed; a data restore is the bundle-failure path
in `../devops/deployment.md` section 6, not this one. The revert ships a
desk that stops calling `MoveRoom`, stops the arrival-time compensating
release, and stops rendering the `Move room` card; the three operations,
the stay move record, and the room state machine are unchanged in both
directions, and no configuration value arrives with the change, so the
hotel's per-hotel configuration set is re-applied unchanged. Rooms the
reverted build strands (a refused check-in after it assigned a room, an
interrupted move) come back as the reported defect: the desk cannot
clear them, and support clears them with
`../operations/runbook.md` section 9.4 until the rework lands. Rooms
already stranded before the revert keep reading occupied and are cleared
from the same section 9 steps; the change carries no stored repair and no
automatic clearance.

**Verification.** After the revert, on the restored bundle: check a guest
into a room whose arrival preloaded a different ready room and confirm
only the chosen room takes the guest; check a guest in, move them from
101 to 102 through the service path the desk loop exercises, and confirm
101 reads vacant and dirty, 102 occupied, and both rooms with the time in
the stay history; confirm a refused check-in after the room was set aside
leaves the room occupied again — the expected regression that identifies
the revert — and clear it with `../operations/runbook.md` section 9.4
before the desk resumes; confirm the #588 release, the #600 room charge,
the #601 settlement gate, and the #646 departure completion behave as
before; run the health check and the end-to-end reservation check from
`../devops/deployment.md` sections 3 and 4; run the Rooms, Stay, and desk
suites the release entry names.

**Record.** Add the rollback outcome here (date, commit range, symptom,
revert reference, verification, and every room cleared through
`../operations/runbook.md` section 9.4) and file the defect issue.
Because this note assumes no migration and no server-side compensation, a
rework that adds a lifecycle state, a stored compensation record, a
server-side saga or retry worker, an operation or field, or a migration
re-tiers the change to T3: `../architecture/lld.md` section 23.9 records
that trigger, the migration is forward-only, and the rollback note moves
into that implementation PR.

### 5.2 Departure release and same-day reuse after check-out (Refs #646)

**Decision.** Roll back if the change makes a check-out refuse where it
used to close, if a completed booking cannot be read or is offered for a
desk action it should refuse, if the same room type or the same room
cannot be sold again after a committed close and the housekeeping steps,
or if availability is released for a booking that is still in house. The
change is `risk-medium` (issue #646 labels `fix`, `risk-medium`); it
rolls back on the normal merge gate, without owner approval.

**Mechanics.** Revert the single implementation PR and redeploy the
bundle per `../devops/deployment.md` section 4. No schema migration and
no data backfill exist on this path, in either direction: the terminal
`closed` reservation state and the `stay_id` link already exist
(`services/reservations/migrations/000002_schema.up.sql:29-33`), so the
revert keeps the database as it is and no restore is needed; a data
restore is the bundle-failure path in `../devops/deployment.md` section
6, not this one. The revert ships code whose close stops calling the
Reservations completion and whose `CheckOut` response stops carrying
`bookingCompletion` (`1.1 -> 1.0`); the additive provider operation
`CheckOutReservation` becomes unreachable from the desk flow and is
removed with the revert, so no half-wired caller remains. Bookings
already completed keep reading `closed`: that state is valid history the
desk already renders, nothing un-completes them, and their room was
released normally — availability stays correct for them after the
revert. What comes back is the original defect: new closes leave the
booking `checked-in`, so the desk must resume the procedure in
`../operations/runbook.md` section 8.2 (paper booking plus the support
step) until the rework lands. The bundle-level address
`RESERVATIONS_BASE_URL` is no longer read by the reverted stay module
and needs no hotel input either way.

**Verification.** After the revert, on the restored bundle: check a
settled stay out and confirm the departed room is released dirty once
and the desk lists re-read (#588); confirm the room-charge review still
posts one line (#600) and the settlement gate still refuses an open
balance without a provenanced approval (#601); confirm the departed
booking now reads `checked-in` again in history (the expected regression
that identifies the revert), and that a booking for a genuinely free
room type and dates is still accepted; run the health check and the
end-to-end reservation check from `../devops/deployment.md` sections 3
and 4; run the Reservations, Stay, and desk suites the release entry
names.

**Record.** Add the rollback outcome here (date, commit range, symptom,
revert reference, verification) and file the defect issue. Because this
note assumes no migration, a rework that adds a lifecycle state, a
stored completion outcome, or a migration re-tiers the change to T3:
the migration is forward-only, and the rollback note moves into that
implementation PR (`../requirements/mvp-requirements.md` section 23.6,
`../architecture/lld.md` section 22.7).

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-948

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-963
