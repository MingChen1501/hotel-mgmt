# contract-tests (guests)

Provider/consumer fixtures for `GuestService` land here with the
first implementation slice, generated from `contracts/` per
`docs/technical/integration.md` section 9 (including the `NOT_FOUND` branches and the hotel-mandatory-field
checks (`FR-CUS-1`)).

Until then this directory intentionally holds no fixtures, and the
repo gate (`script/contract-check.sh`, run from the repo root)
reports SKIP for this module instead of failing.
