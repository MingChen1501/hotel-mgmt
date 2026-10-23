# contract-tests (rooms)

Provider/consumer fixtures for `RoomInventoryService` land here with the
first implementation slice, generated from `contracts/` per
`docs/technical/integration.md` section 9 (including the `CONFLICT`/`STATE_ILLEGAL` room branches and the
paired-concurrency guard exercised against the real store (`NFR-CON-2`), plus the
dirty -> clean -> inspected transition checks (`BR-28`)).

Until then this directory intentionally holds no fixtures, and the
repo gate (`script/contract-check.sh`, run from the repo root)
reports SKIP for this module instead of failing.
