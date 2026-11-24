# #646 departure release and same-day reuse — evidence

Lab reproduction record for
[issue #646](https://github.com/MingChen1501/hotel-mgmt/issues/646)
(`AC-DEP-1`..`AC-DEP-5`, `FR-DEP-1`..`FR-DEP-5`, `DR-E1`). The owner
symptom and the fixed behaviour were captured through the public
contract on two isolated compose labs: the pre-fix build (`master`
`f44fd6c`, the spec-only tree whose code is unchanged) and this
branch's build.

## Capture method

- Isolated compose project `hotel-lab-950-pre` (pre-fix) and
  `hotel-lab-950` (this change), each with its own volumes and a
  separate proxy host port, so the owner's shared lab was never
  touched. Both labs were torn down with `down -v` after the run.
- Migrations and the boot seed applied from `deploy/seed/boot.sql`
  exactly as `script/e2e-desk-loop.sh` does.
- Seeding per run through the public contract: `UpsertGuest`
  (guests A and B), `UpsertRoomType`, `UpsertRoom` (one room, one
  sellable unit), `UpsertRatePlan`/`UpsertRatePrice` for the two
  nights, `CheckSellableCount` for the sellable input.
- Scenario, both labs: guest A books the type for arrival today and
  departure tomorrow, is assigned the room, checked in
  (`AssignRoom` -> Stay `CheckIn` -> `CheckInReservation`), the room
  charge is posted and paid, and the desk closes the stay
  (`CheckOut` with the reviewed folio). Then guest B books the same
  type for the same dates and is checked in through the same path;
  the departed room is released, marked clean, marked inspected.

## Reproduction (pre-fix build, `master` `f44fd6c`)

```json
{
  "bookingA_state_after_close": "checked-in",
  "checkoutStatus": "200",
  "bookingCompletion": null,
  "sameDayBookingBStatus": 409,
  "releaseRoom": { "oldState": "occupied", "newState": "vacant-dirty" },
  "assignRoomBStatus": 200,
  "stayCheckInBStatus": "skipped"
}
```

- The close commits (`200 closed`) but the booking behind it still
  reads `checked-in`, so the calendar and history keep naming guest A
  on tonight's dates.
- B's same-day booking for the same type is refused `409 CONFLICT`
  ("no availability") because A's row still counts as active; no
  room turnover can help while the booking holds the unit.
- The room half already works: `ReleaseRoom` moves the room to
  `vacant-dirty` and it can be marked clean and inspected. The stale
  layer is the reservation lifecycle, exactly as the as-built trace in
  `docs/product/acceptance-criteria.md` section 15 says.

## Fixed build (this branch)

```json
{
  "bookingA_state_after_close": "closed",
  "checkoutStatus": "200",
  "bookingCompletion": { "state": "completed", "reservationRef": "RSV-XP8F8WGY" },
  "sameDayBookingBStatus": 200,
  "releaseRoom": { "oldState": "occupied", "newState": "vacant-dirty" },
  "assignRoomBStatus": 200,
  "stayCheckInBStatus": 200
}
```

- The committed close completes the linked booking: the read-back
  returns `closed` with its dates and stay link kept, and the
  response reports `bookingCompletion.state = completed` with the
  `reservationRef`.
- B's same-day booking for the same type is accepted (`200`), so no
  "no availability" refusal is caused by the departed booking.
- The same-day turnover chain is reachable end to end: the departed
  room reads `vacant-dirty`, housekeeping advances it to clean then
  inspected, it is assigned to B, and B checks in the same day.

## Honest split control

The completion is fail-soft: when Reservations cannot be reached the
close still commits and reports the split instead of claiming a
completion. That path is pinned by
`services/stay/src/server.test.ts` ("reports a split instead of
failing the committed close", `DR8`) and by the Postgres parity case
in the same file (`DR11`); the desk sentence is pinned in
`app/src/views/StayView.test.ts` (`DR13`).
