# contract-tests (guests)

Provider/consumer fixtures for `GuestService` land here with the persistence slice (issue #149), generated from `contracts/` per
`docs/technical/integration.md` [section 9](../../../docs/technical/integration.md) (including the `NOT_FOUND` branches and the hotel-mandatory-field
checks (`FR-CUS-1`)).

The repo gate (`script/contract-check.sh`, run from the repo root)
validates every fixture names a known operation.
