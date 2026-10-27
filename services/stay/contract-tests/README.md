# contract-tests (stay)

Provider/consumer fixtures for `StayService` land here with the persistence slice (issue #149), generated from `contracts/` per
`docs/technical/integration.md` [section 9](../../../docs/technical/integration.md) (including the
`CONFLICT`/`STATE_ILLEGAL` room branches, the
`SETTLEMENT_REQUIRED` folio-gate branch, and the
paired-concurrency guard exercised against the real store,
`NFR-CON-2`). The stay-flow slice (issue #150) adds the
check-out, move, actual-times, stay-ref, and daily-list fixtures
with the same refusal-branch coverage.

The repo gate (`script/contract-check.sh`, run from the repo root)
validates every fixture names a known operation.
