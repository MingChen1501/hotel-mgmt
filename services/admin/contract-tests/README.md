# contract-tests (admin)

Provider/consumer fixtures for `AdminService` land here with the
first implementation slice, generated from `contracts/` per
`docs/technical/integration.md` section 9 (including the `FORBIDDEN` role branches, the `UNAUTHENTICATED`
session branches, and the export-slice failure reports naming the
missing scope (`FR-ADM-5`)).

Until then this directory intentionally holds no fixtures, and the
repo gate (`script/contract-check.sh`, run from the repo root)
reports SKIP for this module instead of failing.
