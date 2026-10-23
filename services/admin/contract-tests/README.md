# contract-tests (admin)

Provider fixtures for `AdminService` (issue #112), generated from
`contracts/` per `docs/technical/integration.md` section 9: the
`SignIn` happy path plus the `UNAUTHENTICATED` wrong-secret branch,
the `GetHotelConfig` snapshot, `UpdateHotelConfig` plus its
`FORBIDDEN` role branch, and `CreateUser` plus its duplicate
`VALIDATION_FAILED` branch.

The repo gate (`script/contract-check.sh`, run from the repo root)
validates every fixture against the `contracts/http/` operation
manifest.
