# #633 fail-closed Rates restriction and availability input — evidence

Before/after lab record for
[issue #633](https://github.com/MingChen1501/hotel-mgmt/issues/633)
(`AC-RTE-6`..`AC-RTE-10`, `FR-RTE-6`..`FR-RTE-10`, `BR-68`, audit
findings T1–T3). This is the `RTE-E1` evidence rule
([rates-input-refusal-test-traceability.md](../../rates-input-refusal-test-traceability.md)
section 7): the coerced `closedToArrival`, the restriction on an
unpriced room type, the caller-set availability count, the overflowing
quote, and the unbounded plan name, each captured on the pre-change
build and on this change through the public `PricingService` contract.

## Builds and lab

| Half | Build | Notes |
|---|---|---|
| Before | `origin/master` at `222a065` (the #633 spec-landing commit), `services/rates` built from a clean `git archive` of that tree | `closedToArrival` is coerced with `.(bool)`, any string `roomTypeId` is stored, `totalUnits` is the answer, the quote arithmetic is unchecked, and neither plan text field is bounded |
| After | This branch (`ao/hotel-mgmt-1254/633-rates-fail-closed`) at the commit that carries this record | A present flag must be a JSON boolean, a restriction needs a priced UUID type, the count is the plan default, the quote refuses unrepresentable totals, and the plan text carries two code-point bounds |
| Store | Both halves run the in-memory store (`PORT=18091` before, `PORT=18092` after), a fresh process per half | Same boot path as the local run in `docs/architecture/services/rates.md` section 7 |
| Postgres | A throwaway `postgres:16` container created for this session (`--label ao.session=hotel-mgmt-1254`, port `127.0.0.1:55433`) with the Rates migrations (`000001_boot`, `000002_schema`, `000003_default_units`) applied, addressed through `TEST_PG_URL` | The parity halves below; the owner's shared `hotel-mgmt` lab and compose project were not touched |

Everything below was driven through the public contract
(`UpsertRatePlan`, `UpsertRatePrice`, `UpsertRestriction`,
`CheckRestrictions`, `CheckSellableCount`, `QuotePrice`) with
`Authorization: Bearer ev633-lab-token`, the same recipe as
`script/e2e-desk-loop.sh`.

Seed per half: `EV-RACK` (`defaultUnits: 1`) pricing
`11111111-…` for `2026-11-01`/`02` at 12 000; `EV-COUNT`
(`defaultUnits: 4`) pricing `22222222-…`; `EV-NODEF` (no
`defaultUnits`) pricing `33333333-…`; `EV-OVER` pricing `44444444-…`
with `9223372036854775807` on the first night and `1` on the second.

## Pair 1 — a coerced `closedToArrival` never applies

| Step | Before | After |
|---|---|---|
| `UpsertRestriction` with `closedToArrival: "true"` | `200`, echoed `closedToArrival: false` — the string was coerced | `400 VALIDATION_FAILED`, `details.field` `closedToArrival` |
| `CheckRestrictions` for an arrival inside the window | `200 allowed: true` — the window silently does not exist | `200 allowed: true` — nothing was stored |

Before:

```json
{"closedToArrival":false,"dateFrom":"2026-12-20","dateTo":"2026-12-31","id":"43b4bc8a-4522-4458-88dd-8753e207413e","minStay":null,"roomTypeId":"11111111-1111-4111-8111-111111111111"}
```

After:

```json
{"code":"VALIDATION_FAILED","details":{"field":"closedToArrival"},"message":"closedToArrival must be true or false.","traceId":"c6c6190eb0e784afc2743c623be2552b"}
```

## Pair 2 — a window for an unpriced room type is refused

| Step | Before | After |
|---|---|---|
| `UpsertRestriction` for a well-formed UUID no rate price row names | `200`, a stored window that matches nothing | `404 NOT_FOUND`, `details.roomTypeId` naming the type |
| `CheckRestrictions` for that type and window | `200 allowed: true` (no window could ever apply) | `200 allowed: true` — nothing was stored |

Before:

```json
{"closedToArrival":false,"dateFrom":"2026-12-20","dateTo":"2026-12-31","id":"60c0e6bc-c165-40d9-b7e2-8d35763c656b","minStay":null,"roomTypeId":"99999999-9999-4999-8999-999999999999"}
```

After:

```json
{"code":"NOT_FOUND","details":{"roomTypeId":"99999999-9999-4999-8999-999999999999"},"message":"Unknown room type 99999999-9999-4999-8999-999999999999.","traceId":"ac7bd4366d783860df50a47b5398eae9"}
```

## Pair 3 — the availability count is the server's, never `totalUnits`

| Step | Before | After |
|---|---|---|
| `CheckSellableCount` with `totalUnits: 9` on a type whose plan default is `4` | `200`, every date `sellableCount: 9` — the caller set the answer | `200`, every date `sellableCount: 4` |
| `CheckSellableCount` with `totalUnits: 9` on a priced type whose plan sets no default | `200`, every date `sellableCount: 9` | `200`, every date `sellableCount: 0` |

Before (plan default 4):

```json
{"counts":[{"date":"2026-11-01","sellableCount":9},{"date":"2026-11-02","sellableCount":9},{"date":"2026-11-03","sellableCount":9}],"roomTypeId":"22222222-2222-4222-8222-222222222222"}
```

After (plan default 4):

```json
{"counts":[{"date":"2026-11-01","sellableCount":4},{"date":"2026-11-02","sellableCount":4},{"date":"2026-11-03","sellableCount":4}],"roomTypeId":"22222222-2222-4222-8222-222222222222"}
```

Before (no plan default):

```json
{"counts":[{"date":"2026-11-01","sellableCount":9},{"date":"2026-11-02","sellableCount":9},{"date":"2026-11-03","sellableCount":9}],"roomTypeId":"33333333-3333-4333-8333-333333333333"}
```

After (no plan default):

```json
{"counts":[{"date":"2026-11-01","sellableCount":0},{"date":"2026-11-02","sellableCount":0},{"date":"2026-11-03","sellableCount":0}],"roomTypeId":"33333333-3333-4333-8333-333333333333"}
```

## Pair 4 — an overflowing quote is refused, never wrapped

| Step | Before | After |
|---|---|---|
| `QuotePrice` over two nights at `9223372036854775807` and `1` | `200` with `totalMinor: -9223372036854775808` — a wrapped, negative total served as the price basis | `422 STATE_ILLEGAL`, `details.reason` `total_overflow`, no `totalMinor`, no `nights` |

Before:

```json
{"arrivalDate":"2026-11-01","departureDate":"2026-11-03","discountName":null,"nights":[{"nightDate":"2026-11-01","priceMinor":9223372036854775807},{"nightDate":"2026-11-02","priceMinor":1}],"roomTypeId":"44444444-4444-4444-8444-444444444444","totalMinor":-9223372036854775808}
```

After:

```json
{"code":"STATE_ILLEGAL","details":{"field":"roomTypeId","reason":"total_overflow","roomTypeId":"44444444-4444-4444-8444-444444444444"},"message":"The quote total is outside the supported range.","traceId":"463717ec5cc9ba0ccd899ba40e49b2ab"}
```

## Pair 5 — the plan name bound

| Step | Before | After |
|---|---|---|
| `UpsertRatePlan` with a 65-code-point `name` (`ế` repeated) | `200`, the over-bound name stored and echoed | `400 VALIDATION_FAILED`, `details.field` `name`, the bound in the sentence |

Before:

```json
{"description":"over the bound","id":"c738227d-1884-4553-8e7f-06625f0f8329","name":"ếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếếế"}
```

After:

```json
{"code":"VALIDATION_FAILED","details":{"field":"name"},"message":"name must be at most 64 characters.","traceId":"264fecdc426c1117c2b23ac2430b1898"}
```

## Postgres parity run

The Postgres halves ran on the scratch database created for this
session (schema from `services/rates/migrations`, wiped by the test
fixtures), with the same assertions as the in-memory guards:

```sh
cd services/rates
for f in 000001_boot 000002_schema 000003_default_units; do
  docker exec -i rates-pg-633 psql -U postgres -d hotel -v ON_ERROR_STOP=1 -q < migrations/$f.up.sql
done
TEST_PG_URL='postgres://postgres:pg633@127.0.0.1:55433/hotel?sslmode=disable' \
  go test ./internal/store/ -count=1 -run 'TestPostgres' -v
```

```
--- PASS: TestPostgresRestrictionRefusalsStoreNothing (0.02s)
--- PASS: TestPostgresQuoteSumOverflowRefused (0.02s)
--- PASS: TestPostgresQuotePercentOverflowRefused (0.02s)
--- PASS: TestPostgresRatePlanTextBounds (0.02s)
--- PASS: TestPostgresCheckSellableCountPlanDefault (0.02s)
--- PASS: TestPostgresDeskLoop (0.02s)
--- PASS: TestPostgresRestrictionRefusalNamesRestriction (0.01s)
--- PASS: TestPostgresClosedToArrivalRefusal (0.02s)
--- PASS: TestPostgresQuoteDiscounts (0.02s)
--- PASS: TestPostgresQuoteBreakdown (0.02s)
--- PASS: TestPostgresHTTPRestrictionRefusesNonBoolean (0.02s)
--- PASS: TestPostgresHTTPCheckSellableCountIgnoresTotalUnits (0.02s)
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/store	0.222s
```

`RTE1`, `RTE3`, `RTE4`, `RTE6`, `RTE8`, `RTE9`, `RTE10`, `RTE12`, and
`RTE13` therefore refuse identically in both stores, and the four
re-seeded fixtures (`TestPostgresDeskLoop`,
`TestPostgresRestrictionRefusalNamesRestriction`,
`TestPostgresClosedToArrivalRefusal`,
`TestDeskLoopSetRateSearchQuote`) keep their original assertions.

## What the guard cases prove on the same build

`cd services/rates && go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"`

- `RTE1` — `"true"`, `1`, `"yes"`, and `null` each answer one 400
  `VALIDATION_FAILED` naming `closedToArrival` with a fresh `traceId`,
  and a following `CheckRestrictions` still allows
  (`internal/handler/fail_closed_test.go`, memory;
  `internal/store/postgres_handler_test.go`, Postgres).
- `RTE2` — a `false` window never refuses on that ground and an omitted
  field stores `false`; the `true`/outside half is the re-run pin.
- `RTE3`/`RTE4` — `not-a-uuid` answers 400 naming `roomTypeId`; an
  unpriced UUID and a plan with `defaultUnits` but no price row answer
  404 naming the type, with the restriction set and event list
  unchanged (`internal/store/fail_closed_test.go`,
  `internal/store/postgres_fail_closed_test.go`).
- `RTE6`/`RTE7`/`RTE8` — the count is the plan default (4), `0` for a
  priced type with no default, unchanged by `0`, `1`, a huge value, or
  an absent field; `-1` and `"1"` answer 400 naming `totalUnits`; an
  unknown type answers 404 with or without the field.
- `RTE9`/`RTE10` — the nightly sum and the percent multiplication each
  answer 422 `STATE_ILLEGAL` with `reason` `total_overflow`, no
  `totalMinor`, and no `nights`; the amount-subtraction step uses the
  same guarded helper, and every non-overflowing quote is the
  pre-change byte (`RTE11` re-run).
- `RTE12`/`RTE13` — 64/2 000 code points are accepted (multi-byte
  fixture) and 65/2 001 refused naming the field with the bound; a
  non-string `description` is refused instead of stored empty; a
  refused update leaves the stored row intact and a pre-bound row still
  quotes.
- `RTE14` — the catalogue carries `error.validation.must_be_boolean`,
  `rates.validation.text_length`, and `rates.state.total_overflow` at
  parity in `messages/vi.json` and byte-identically in all eight
  runtime mirrors; `script/catalogue-coverage-check.sh`,
  `script/contract-check.sh`, `script/markdown-link-check.sh`, and
  `script/harness-conventions-check.sh` pass; no migration, desk file,
  or `services/reservations/**` file is in the diff.

## Operator notes

- Restriction windows already stored with a coerced `false` keep that
  value; they are not re-read, re-interpreted, or deleted. A manager
  must re-save such a window with a real boolean (R-23).
- A price row already stored above the quote guard's range is not
  rewritten; it refuses quotes for its type with
  `reason: total_overflow` until it is corrected.
- A desk plan create whose name or description exceeds a bound renders
  the Manage panel's existing plain failure sentence; no desk change was
  needed.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1254
