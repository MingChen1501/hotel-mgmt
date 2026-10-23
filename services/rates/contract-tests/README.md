# contract-tests (rates)

Provider/consumer fixtures for `PricingService` land here with the
first implementation slice, generated from `contracts/` per
`docs/technical/integration.md` section 9 (including the
`STATE_ILLEGAL` restriction branches and the `NOT_FOUND` branches
for unknown types, plans, and discounts).

Until then this directory intentionally holds no fixtures, and the
repo gate (`script/contract-check.sh`, run from the repo root)
reports SKIP for this module instead of failing.
