# contract-tests (reporting)

Provider fixtures for `ReportingService` (issue #156; housekeeping
report added by issue #191), generated from `contracts/` per
`docs/technical/integration.md` [section 9](../../../docs/technical/integration.md): `OccupancyReport`,
`RevenueSummary`, `DailySheet`, and `HousekeepingReport` happy paths.
All four operations are pure reads, so they carry no refusal
branches beyond the shared `UNAUTHENTICATED` / `VALIDATION_FAILED`
envelope mapping covered in `internal/handler/handler_test.go`.

The paired rebuild guard (reports match source rows after rebuild;
duplicate delivery never double-counts) runs in
`internal/store/store_test.go` against the real store. The repo gate
(`script/contract-check.sh`, run from the repo root) validates every
fixture against the `contracts/http/` operation manifest.
