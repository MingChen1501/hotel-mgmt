# contract-tests (reporting)

Consumer fixtures for the reporting read model land here with the
first implementation slice, generated from `contracts/` per
`docs/technical/integration.md` section 9 (including duplicate
delivery for idempotent apply and per-aggregate ordering for the
`consumer_offsets` advance).

Until then this directory intentionally holds no fixtures, and the
repo gate (`script/contract-check.sh`, run from the repo root)
reports SKIP for this module instead of failing.
