# contract-tests (reservations)

Provider and consumer fixtures for `ReservationService` (issue
#112), generated from `contracts/` per
`docs/technical/integration.md` section 9: `CreateReservation` (plus
the overbooking `CONFLICT` branch and the missing-guest-field
`VALIDATION_FAILED` branch), `GetReservation`, `QueryCalendar`, and
the consumed `CheckSellableCount` / `CheckRoomTypeSellability`
shapes from the booking step (integration C1/C2).

The paired-concurrency guard for `NFR-CON-1` runs in
`internal/store/store_test.go` against the real store. The repo gate
(`script/contract-check.sh`, run from the repo root) validates every
fixture against the `contracts/http/` operation manifest.
