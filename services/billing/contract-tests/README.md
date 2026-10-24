# contract-tests (billing)

Provider/consumer fixtures for `BillingService` land here with the persistence slice (issue #149), generated from `contracts/` per
`docs/technical/integration.md` sections 3-4 (including the
`SETTLEMENT_REQUIRED` gate branch, the undefined-item
`VALIDATION_FAILED` branch, and the `GetStayRef` read contract).
The stay-flow slice (issue #150) adds the `RecordOpenBalanceApproval`
fixture for the authorised open-balance approval (FR-BIL-7).

The repo gate (`script/contract-check.sh`, run from the repo root)
validates every fixture names a known operation.
