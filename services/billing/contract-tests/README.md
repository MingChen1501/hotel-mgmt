# contract-tests (billing)

Provider/consumer fixtures for `BillingService` land here with the
first implementation slice, generated from `contracts/` per
`docs/technical/integration.md` sections 3-4 (including the
`SETTLEMENT_REQUIRED` gate branch, the undefined-item
`VALIDATION_FAILED` branch, and the `GetStayRef` read contract).

Until then this directory intentionally holds no fixtures, and the
repo gate (`script/contract-check.sh`, run from the repo root)
reports SKIP for this module instead of failing.
