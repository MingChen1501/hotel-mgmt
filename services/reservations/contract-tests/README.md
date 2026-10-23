# contract-tests (reservations)

Provider/consumer fixtures for `ReservationService` land here with the
first implementation slice, generated from `contracts/` per
`docs/technical/integration.md` section 9 (including the `CONFLICT`
refusal branches and the paired-concurrency guard run against the
real store, `NFR-CON-1`).

Until then this directory intentionally holds no fixtures, and the
repo gate (`script/contract-check.sh`, run from the repo root)
reports SKIP for this module instead of failing.
