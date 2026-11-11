# #647 arrival room reassignment and stale-hold release — evidence

Lab reproduction record for
[issue #647](https://github.com/MingChen1501/hotel-mgmt/issues/647)
(`AC-REA-1`..`AC-REA-5`, `FR-REA-1`..`FR-REA-5`, `RR-E1`). The owner
symptom — a guest expected in room 101 is checked into 102 and room
101 keeps reading occupied with a stale stay link — was reproduced
and fixed through the public contract on one isolated compose lab.

## Capture method

- Isolated compose project `hotel-lab-975`, own volumes, own proxy
  host port (`8090`), so the owner's shared `hotel-mgmt` lab was never
  touched. Torn down with `down -v` after the run; the project, its
  volumes, and its network are gone.
- Migrations and the boot seed applied from `deploy/seed/boot.sql`
  exactly as `script/e2e-desk-loop.sh` does (rooms 101 and 102 seeded
  `vacant-inspected`, one `Standard Double` type).
- Seeding through the public contract: `UpsertGuest`,
  `UpsertRatePlan`/`UpsertRatePrice` for tonight and tomorrow,
  `QuotePrice`, `CheckRoomTypeSellability`, `CreateReservation`, then
  `AssignRoom` (101) -> Stay `CheckIn` -> `CheckInReservation`.
- Switch path: the committed check-in in 101 is moved to 102 through
  the two calls the desk owns — `AssignRoom` (102, same stay as
  `stayLink`) then `MoveRoom` — and the room states plus the stay are
  read back.

## Which path leaves the stale hold

**The switch after a committed check-in** (the mid-stay move path).
The arrival preload is already safe: it issues no `AssignRoom`, so a
room changed after the preload is the room the commit assigns (pinned
by `RR1` in `app/src/views/StayView.test.ts`). The defect sits in the
move: `MoveRoom` keeps the stay on the new room but never releases the
old one, and the pre-fix desk had no move card at all, so room 101
stays `occupied` while the stay already names room 102. The only cure
was a manual room-state edit or a direct `ReleaseRoom` call, exactly
as the issue reports.

## Reproduction (pre-fix ordering: assign, move, no release)

```json
{
  "reservationRef": "RSV-PB2TUMCH",
  "stayId": "e2334f22-0360-425e-b807-221baeef9e20",
  "occupiedAfterMoveBeforeRelease": [
    { "number": "101" },
    { "number": "102" }
  ],
  "stayAfterMove": {
    "state": "in-house",
    "roomId": "00000000-0000-0000-0000-000000000202"
  }
}
```

- The stay is in house in room 102 (`roomId` `...202`), but room 101
  still reads `occupied`: the stale hold from the owner's QA report.
- The board lane and the Rooms map derive from `ListRoomsByState`, so
  both keep showing 101 occupied until a manual release.

## Fixed ordering (assign, move, release the echo's from-room)

```json
{
  "releaseRoom101": {
    "roomNumber": "101",
    "oldState": "occupied",
    "newState": "vacant-dirty"
  },
  "vacantDirtyAfterRelease": ["101"],
  "occupiedAfterRelease": ["102"]
}
```

- The desk's `Move room` path runs `AssignRoom` -> `MoveRoom` ->
  `ReleaseRoom {roomNumber: <echo fromRoomId>, toState: "vacant-dirty"}`
  in that order (pinned as a call-order guard by `RR7` in
  `app/src/views/StayView.test.ts`), so the vacated room only becomes
  free once the stay no longer names it.
- After the release only the room the guest is actually in reads
  occupied, and the vacated room is in housekeeping
  (`vacant-dirty`), not silently kept occupied.
- The arrival-compensation half (`AC-REA-1`) is the same operation
  with `toState: "vacant-inspected"` for a room assigned by a commit
  that never recorded a stay; `RR2`, `RR3`, `RR5`, and `RR6` pin it,
  including the rule that an unreadable outcome releases nothing.

## Honest split control

The service layer is unchanged (LLD 23's no-change statement):
`services/rooms/src/store.ts` (`assignRoom`, `releaseRoom`) and
`services/stay/src/store.ts` (`moveRoom`) already carry the
behaviour this slice orders. The browser switch cases (switch after
the preload and switch after the commit) are pinned by `RR11` in
`app/e2e/stay.spec.ts`; the unit ordering guards are `RR1`-`RR9` in
`app/src/views/StayView.test.ts`.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-975
