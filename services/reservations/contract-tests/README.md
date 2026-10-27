# contract-tests (reservations)

Provider and consumer fixtures for `ReservationService` (issues #112
and #159), generated from `contracts/` per
`docs/technical/integration.md` [section 9](../../../docs/technical/integration.md): `CreateReservation` (plus
the overbooking `CONFLICT` branch and the missing-guest-field
`VALIDATION_FAILED` branch), `ModifyReservation` (plus the
checked-in `STATE_ILLEGAL` and guard-lost `CONFLICT` branches),
`CancelReservation` (plus the missing-reason `VALIDATION_FAILED`
and checked-in `STATE_ILLEGAL` branches), `MarkNoShow` (plus the
too-early and in-house `STATE_ILLEGAL` branches), `GetReservation`,
`QueryCalendar`, and the consumed `CheckSellableCount` /
`CheckRoomTypeSellability` shapes from the booking step
(integration C1/C2).

The paired-concurrency guards for `NFR-CON-1` (booking and modify)
run in `internal/store/store_test.go` against the real store. The
repo gate (`script/contract-check.sh`, run from the repo root)
validates every fixture against the `contracts/http/` operation
manifest.
