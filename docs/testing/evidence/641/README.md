# #641 report date-range cap — evidence

Before/after reproduction record for
[issue #641](https://github.com/MingChen1501/hotel-mgmt/issues/641)
(audit finding P1; `AC-RPT-5`..`AC-RPT-7`, `NFR-RPT-1`, `BR-62`, LLD
[section 31](../../../architecture/lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641),
guards `RPT1`–`RPT14` and evidence rule `RPT-E1` in
[the test traceability](../../report-range-cap-test-traceability.md); the
implementation PR is [#727](https://github.com/MingChen1501/hotel-mgmt/pull/727)).
The left column is the pre-change build; the right column is this
change. Every answer below was captured from a running service process,
not from a test assertion.

## Finding

`parseRange` parsed both ends and refused a malformed one and an
out-of-order window, but never compared the distance between them, and
both range reads then walk every inclusive date under the store mutex:
`Occupancy` locks at `services/reporting/internal/store/store.go:465`
and loops at `:480`, `Revenue` locks at `:520` and loops at `:523` at
the pre-change head. A `0001-01-01`..`9999-12-31` window therefore
accepts, takes the lock, allocates and encodes roughly 3.65 million
dates, and holds every other report read behind it.

## Capture method

- Pre-change build: `git archive d960a79` (the base this branch is
  based on; its code tree is the pre-change tree, because the spec
  commits touch `docs/` only), built with
  `go build -o reporting-pre ./cmd/server` in
  `services/reporting`.
- Post-change build: this branch at `ba5d922`, built the same way.
- Each binary ran as its own process on a dedicated loopback port
  (`18831` pre, `18832` post) with the stock `cmd/server` wiring and
  its in-memory projection. No compose command ran, so the shared lab
  was not touched; no container, volume, or database was created.
- Requests: `POST /v1/reporting/<Operation>` with
  `Content-Type: application/json` and a lab-only
  `Authorization: Bearer lab-token` (the skeleton token check is
  presence only), issued with `curl` and recorded with
  `-w '%{http_code} %{size_download} %{time_total}'`. The huge-window
  capture was bounded with `curl -m`; the replies quoted below are the
  complete bodies of the refusals.
- The stock service boots from an empty projection and has no HTTP
  rebuild operation, so `Occupancy` has no room type to scan while
  `Revenue` still allocates one row per date. The pre-change Revenue
  request is therefore the load-bearing reproduction: it returns
  230 079 804 bytes in 3.94 s from one request and delays a concurrent
  `DailySheet` read, while Occupancy shows the refusal pair and the
  per-date walk stays a code pin (`store.go:480`, `:523` pre-change).

## Before/after — the refusals

| Step | Pre-change build (`d960a79`) | This change (`ba5d922`) |
|---|---|---|
| `OccupancyReport 2024-01-01..2026-01-01` (731 nights) | `200 {"asOf":"0001-01-01T00:00:00Z","dateFrom":"2024-01-01","dateTo":"2026-01-01","nights":[]}` — accepted | `400 {"code":"VALIDATION_FAILED","message":"dateTo must be at most 730 nights after dateFrom.","details":{"field":"dateTo"},"traceId":"3155d31f…"}` |
| `RevenueSummary 2024-01-01..2026-01-01` (731 nights) | `200`, 732 zero-filled rows, 46 203 bytes | the same `400` envelope, 165 bytes, 0.0004 s |
| `OccupancyReport 0001-01-01..9999-12-31` | `200 {"dateFrom":"0001-01-01","dateTo":"9999-12-31","nights":[]}`, 0.43 s of per-date loop under the store lock | `400`, the same `dateTo` span sentence, 0.0004 s |
| `RevenueSummary 0001-01-01..9999-12-31` | `200`, 230 079 804 bytes, 3.94 s in one response | `400`, the same `dateTo` span sentence, 0.0003 s |
| `DailySheet` sent concurrently with the huge Revenue request | answered in 0.38 s only after the 4.36 s Revenue walk released the store mutex | answered in 0.0004 s while the Revenue request was already refused |

The refusal is one complete JSON object with exactly `code`, `message`,
`details`, and `traceId`; `details` is exactly `{"field":"dateTo"}`, the
sentence shows `730` rendered from the constant through the catalogue,
and no `nights`/`days`/`asOf` payload accompanies it.

## Honest boundary control

The documented two-year window (2024-01-01..2025-12-31, 730 nights, 731
inclusive dates) is served identically by both builds:

| Step | Answer |
|---|---|
| `RevenueSummary 2024-01-01..2025-12-31` | `200`, 46 140 bytes, 731 rows from `2024-01-01` to `2025-12-31`, zero-filled totals, non-zero `asOf`; byte-identical pre vs post |
| `OccupancyReport 2024-01-01..2025-12-31` | `200`, 90 bytes, byte-identical pre vs post |
| The same window with `dateTo` one night later (`2026-01-01`) | `400`, the span sentence — so the guard bounds a span rather than refusing every long window |

## Unchanged control (this change)

| Step | Answer |
|---|---|
| `RevenueSummary 2026-11-05..2026-11-01` (reversed) | `400`, `dateTo is before dateFrom.`, details field `dateTo` — the order sentence, not the span sentence |
| `OccupancyReport dateFrom 02/11/2026` | `400`, `dateFrom must be a YYYY-MM-DD date.`, details field `dateFrom` |
| `RevenueSummary` without `dateTo` | `400`, `dateTo is required.`, details field `dateTo` |
| `DailySheet businessDate 2026-11-01` | `200`, the daily sheet answer, unchanged |
| `HousekeepingReport` | `200`, the same housekeeping answer, unchanged |
| Short windows and a window before any data exists | served exactly as before (within the cap) |

## Cross-backend check

The Rates 730/731 quote pair is unchanged and Reporting now declares the
same number: `services/rates/internal/store/store.go:254-256` refuses a
stay longer than 730 nights naming `departureDate` with
`rates.validation.quote_range`, and `RPT11`'s test-only guard
(`services/rates/internal/store/store_test.go`) asserts a 730-night
quote prices 730 nights and a 731-night quote is refused. Reporting's
`maxReportRangeNights = 730` is the same value (`RPT6`).

## No-configuration check (RPT14)

The cap is one unexported code constant in
`services/reporting/internal/store/store.go:42`. The diff carries no
change under `deploy/`, `docs/devops/`, or `docs/operations/`, no
environment variable, compose override, or per-hotel setting, and no
write path, stored row, event, or idempotency record.

## Gates

- `services/reporting`: `go build ./...`, `go vet ./...`, `gofmt -l .`
  clean, `go test ./...` all packages pass (new store, service, handler,
  and catalogue guards included).
- `services/rates`: `go build ./...`, `go vet ./...`, `gofmt -l .`
  clean, `go test ./...` all packages pass.
- `script/contract-check.sh` (includes `openapi-route-check.sh`),
  `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`,
  `script/harness-conventions-check.sh`, and `git diff --check`: PASS.
  `contracts/` is byte-identical; the new catalogue key exists in the
  canonical file, all runtime mirrors, and `messages/vi.json`.
- Slice record: `docs/testing/test-report.md` section 8.1.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1135
