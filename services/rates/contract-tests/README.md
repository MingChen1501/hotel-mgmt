# contract-tests (rates)

Provider fixtures for `PricingService` (issue #112), generated from
`contracts/` per `docs/technical/integration.md` [section 9](../../../docs/technical/integration.md): setup
(`UpsertRatePlan`, `UpsertRatePrice`, `UpsertRestriction`,
`UpsertDiscount`), reads (`QuotePrice` plus the unknown-discount
`VALIDATION_FAILED` branch, `CheckSellableCount`), and
(`CheckRestrictions` plus the violated-restriction `STATE_ILLEGAL`
branch).

The repo gate (`script/contract-check.sh`, run from the repo root)
validates every fixture against the `contracts/http/` operation
manifest.
