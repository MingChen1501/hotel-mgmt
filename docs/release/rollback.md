# Rollback — per-change rollback notes

Status: active. Per-change rollback notes for the hotel-mgmt MVP, owned
by `release-manager` (row flipped from stub on the first note, Refs
#631). Scope: how to undo one shipped change without undoing the
release, plus the decision, verification, and record-keeping around it.
Rolling back a whole failed *upgrade* (restore the previous bundle and the
pre-upgrade backup) is a different procedure and stays in
`../devops/deployment.md`, section 6; this document is where that
procedure records its outcome.

## 1. When a per-change rollback is the answer

Roll back a change when all three hold:

1. The change is the proven cause: the symptom appears on the build that
   carries it and disappears when it is reverted, and no configuration,
   data, or restart fix removes it in time.
2. The symptom is worse than the change's own risk — desk work is
   blocked, or figures are wrong, and the hotel cannot wait for a forward
   fix.
3. The owner approves. Any change labelled `risk-high` or
   `risk-very-high` (or carrying no risk label) needs explicit owner
   approval to roll back as well as to ship, because a revert can
   re-open the defect the change closed.

Forward fix first: a rollback is for a fault the release cannot carry.

## 2. Mechanics

1. Identify the single squash commit of the change on the default branch
   and revert it as one PR (never a hand-edit of several files, never a
   force-push, never a rewrite of shared history).
2. Take a backup immediately before the deploy of the reverted bundle
   (`../operations/backup-dr.md`).
3. Deploy the reverted bundle with the normal upgrade procedure
   (`../devops/deployment.md`, section 4): stop the proxy, the modules,
   then the database; replace the bundle; start the database, the
   modules, then the proxy.
4. Run the health check and the owner checks from the upgrade procedure
   before desk work resumes.
5. Keep the change's own data effect in mind: a note states whether the
   revert needs a data restore, a migration down, or nothing at all. A
   change with no schema, migration, or event change reverts with no data
   work, and the rollback restores code behaviour only.

## 3. Verification after a rollback

Confirm, in this order, and record the result in the note:

1. The health check passes and the desk sign-in screen appears
   (`../devops/deployment.md`, section 3 step 5).
2. The symptom named in the note is gone.
3. The behaviour the change had altered is back to the pre-change
   description, checked with one live action, not by reading code.
4. Nothing else regressed: one booking, one check-in, one charge, one
   check-out pass.

## 4. Record keeping

Every rollback appends to the note for that change: what failed, the
symptom in plain words, the version or commit reverted, the date, the
owner approval, the backup used (if any), the verification result, and
the follow-up issue that re-lands the change. A rollback that re-opens a
security fix is recorded as an accepted exposure with its end date, so
the risk register row stays honest. The note stays in place after the
change is re-landed: it records the history, not the current state.

## 5. Notes (newest first)

### 5.1 Server-side reservation availability (Refs #631, ADR-0006)

- **What the change does.** The overbooking guard's ceiling is derived
  server-side from Rooms `CheckRoomTypeSellability`
  (`totalCount - len(blockedRooms)`) instead of from the request's
  `sellableUnits`, and an unreadable capacity source refuses the booking
  with `UPSTREAM_UNAVAILABLE` (503) instead of allowing it. Behaviour,
  ops impact, and evidence state:
  `release-notes.md`, section 2.1.
- **Revert unit.** One squash commit: the implementation PR for #631.
  Reverting it restores the previous guard, whose ceiling is the request's
  `sellableUnits` value again.
- **Data effect.** None in either direction. No schema change, no
  migration, no seed, no backfill, and no event-payload change; the
  reservation rows, change history, and outbox payloads are identical
  under both builds. No restore is needed; the rollback is a bundle swap.
- **Contract and desk compatibility.** The desk keeps sending
  `sellableUnits` both ways, so a backend-only revert leaves the desk
  working, and a desk build from before the change works against the new
  backend. Leave `ROOMS_BASE_URL` configured after the revert: the
  reverted build does not read it, and removing it would only break a
  later re-land.
- **Symptom that justifies it.** Any of: bookings and booking
  modifications refused for every room type on the installation while the
  desk pre-check shows free rooms (a fail-closed capacity read that the
  restart order in `../operations/runbook.md`, section 3, does not clear);
  a capacity ceiling that does not match the configured rooms and stays
  wrong after the room list is corrected.
- **Must be owner-approved.** The revert re-opens audit finding R1: a
  caller-supplied number decides overbooking again until the change is
  re-landed. Record the exposure window and re-file the finding as the
  follow-up issue in the same working day.
- **Verify after the revert.** One booking on a room type with free
  rooms returns 200; one booking on a sold-out room type still returns
  the `CONFLICT` refusal; one modify of an existing booking returns 200;
  the desk Book panel's availability figure and sold-out wording are
  unchanged; then the four live actions from section 3.
- **Re-land.** Re-land with the same change once the capacity read is
  healthy; the release note entry (section 2.1 of `release-notes.md`) is
  the description to reuse.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-936
