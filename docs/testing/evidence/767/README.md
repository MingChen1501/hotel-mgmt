# #767 failed rate-plan write — evidence

Before/after lab record for
[issue #767](https://github.com/MingChen1501/hotel-mgmt/issues/767)
(`AC-PLN-1`..`AC-PLN-4`, `FR-PLN-1`..`FR-PLN-5`, `BR-71`). This is the
`PLN-E1` evidence rule
([plan-upsert-failure-test-traceability.md](../../plan-upsert-failure-test-traceability.md)
section 7): the phantom success, the nothing-stored/nothing-readable
proof, the retry-after-recovery pair, and the unchanged healthy
create/update pair, each captured on the pre-change build and on this
change through the public `PricingService` contract, plus the
`TEST_PG_URL` parity run.

## Builds and lab

| Half | Build | Notes |
|---|---|---|
| Before | `origin/master` at `b5403e0`, `services/rates` built from a clean `git archive` of that tree | `UpsertRatePlan` discards the plan statement's driver error and returns the request-shaped plan (`return plan, nil`) |
| After | This branch (`ao/hotel-mgmt-1317/767-rates-plan-upsert-failure`) at the commit that carries this record | the same branch returns `nil, storeFailure()`; the success path is untouched |
| Store | Both halves run the Postgres-backed store, a fresh process per half (`PORT=18097` before, `PORT=18098` after) | same boot path as the local run in `docs/architecture/services/rates.md` section 7 |
| Postgres | A throwaway `postgres:16` container created for this session (name `rates-pg-1317`, port `127.0.0.1:55467`) with the Rates migrations (`000001_boot`, `000002_schema`, `000003_default_units`) applied | the owner's shared `hotel-mgmt` lab and compose project were not touched |
| Failing role | `rates_app` (LOGIN) with `USAGE` on `rates`, `SELECT`/`UPDATE`/`DELETE` on the tables and `INSERT` on `rates.outbox`, but **no `INSERT` on `rates.rate_plans`** | the plan statement fails at the driver with `permission denied`; the schema and the outbox stay readable for the row counts |

Every request below was driven through
`POST /v1/rates/UpsertRatePlan`, `UpsertRatePrice`, and `QuotePrice` with
`Authorization: Bearer ev767-lab-token`, the same recipe as
`script/e2e-desk-loop.sh`. Plans and outbox rows were counted as the
database owner (`hotel`), not as the failing role.

## Pair 1 — the phantom success becomes the store-failure envelope

| Step | Before | After |
|---|---|---|
| `UpsertRatePlan` `{"name":"RACK","description":"Rack rate"}` | `200`, `id` is `""` — a value the operation's own response schema forbids | `500`, the `VALIDATION_FAILED` envelope with the plain "Pricing store unavailable." sentence, empty `details`, and a fresh `traceId` |

Before:

```json
{"description":"Rack rate","id":"","name":"RACK"}
```

After:

```json
{"code":"VALIDATION_FAILED","details":{},"message":"Pricing store unavailable.","traceId":"be9b1db4266acf337c6727e69a12efe4"}
```

## Pair 2 — nothing is stored and no phantom plan is readable

| Step | Before | After |
|---|---|---|
| `rates.rate_plans` / `rate-plan-changed` rows after the request | `plans=0`, `events=0` — the `200` named a plan no row backs | `plans=0`, `events=0` — the refusal writes nothing |
| `UpsertRatePrice` for `RACK` | `404 NOT_FOUND`, `details.ratePlanName` `RACK` | `404 NOT_FOUND`, `details.ratePlanName` `RACK` |
| `QuotePrice` naming `RACK` | `404 NOT_FOUND` | `404 NOT_FOUND`, `details.ratePlanName` `RACK` |

After (both read calls):

```json
{"code":"NOT_FOUND","details":{"ratePlanName":"RACK"},"message":"Unknown rate plan RACK.","traceId":"ff4a752c3d17d7ed553b99d02101ded5"}
{"code":"NOT_FOUND","details":{"ratePlanName":"RACK"},"message":"Unknown rate plan RACK.","traceId":"c996a5819d03d5888812ddc5494975ca"}
```

## Pair 3 — the same request retries into a real write

After the failure the failing role was granted `INSERT` on
`rates.rate_plans`, and the identical request was repeated.

| Step | Before | After |
|---|---|---|
| Repeat `{"name":"RACK","description":"Rack rate"}` | `200` again, still `id: ""`, still no row | `200` with a non-empty UUID `id`; the row is stored and exactly one `rate-plan-changed` row is written |

After:

```json
{"description":"Rack rate","id":"836c53ae-cf85-48e2-babe-3b8a55e24a17","name":"RACK"}
```

```text
plans=1
events=1
row=RACK|Rack rate
```

The failed attempt left no residue: the event count is the retry's one,
not two.

## Pair 4 — the healthy create and update are unchanged

A fresh database with full `rates_app` privileges, the same create and
an update that omits `defaultUnits`, on both builds.

| Step | Before | After |
|---|---|---|
| Create `{"name":"HEALTHY","description":"Rack rate","defaultUnits":2}` | `200`, UUID `id`, the sent name/description | `200`, UUID `id`, the sent name/description |
| Update `{"name":"HEALTHY","description":"Rack rate v2"}` | `200`, same `id`, description updates | `200`, same `id`, description updates |
| Stored row / events | `HEALTHY|Rack rate v2|2`, `events=2` | `HEALTHY|Rack rate v2|2`, `events=2` |

Before:

```json
{"description":"Rack rate","id":"cb72179d-7344-4588-ad98-1bc47249311f","name":"HEALTHY"}
{"description":"Rack rate v2","id":"cb72179d-7344-4588-ad98-1bc47249311f","name":"HEALTHY"}
```

After:

```json
{"description":"Rack rate","id":"98ac19b5-4174-4092-95ac-94080d04d1a8","name":"HEALTHY"}
{"description":"Rack rate v2","id":"98ac19b5-4174-4092-95ac-94080d04d1a8","name":"HEALTHY"}
```

The two `id` values differ because the column defaults to
`gen_random_uuid()`; every other field, the stored row, and the per-write
event are identical, so the change touches only the failure branch.

## Parity run

Hermetic guards (`PLN-1`, the `PLN-2`/`PLN-4` stub halves, `PLN-5`
memory half) with `TEST_PG_URL` unset — none of them skipped:

```text
$ cd services/rates && go test ./... -count=1   # TEST_PG_URL unset
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/cmd/server	0.010s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/envelope	0.010s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/handler	0.010s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/health	0.002s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages	0.004s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/store	0.006s
```

Postgres half (`PLN-2` row counts, `PLN-4` retry, `PLN-5` update) on the
scratch database:

```text
$ TEST_PG_URL='postgres://hotel:hotel@127.0.0.1:55467/hotel?sslmode=disable' go test ./... -count=1
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/cmd/server	0.006s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/envelope	0.006s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/handler	0.012s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/health	0.004s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages	0.005s
ok  	github.com/MingChen1501/hotel-mgmt/services/rates/internal/store	0.299s
```

The guards live in `services/rates/internal/store/plan_failure_test.go`
(`PLN-1`, `PLN-2`, `PLN-4`, `PLN-5`),
`services/rates/internal/handler/plan_failure_test.go` (`PLN-3`), and the
`PLN-8` desk cases in `app/src/views/ManageView.test.ts`; the results are
recorded in `docs/testing/test-report.md` section 8.1.

## Desk guard (`PLN-8`)

Both Manage screen create paths were driven against a `500`
`VALIDATION_FAILED` answer for `UpsertRatePlan` (the mock backend in
`app/src/views/ManageView.test.ts`; production code unchanged). Each case
asserts the existing `desk.manage.error_generic` sentence, no
`UpsertRatePrice` call, no remembered plan (`writeStoredPlan` not
reached), and the pending nights / plan-missing state kept for a retry.

```text
$ cd app && npx vitest run src/views/ManageView.test.ts --maxWorkers=1
 ✓ src/views/ManageView.test.ts (27 tests) 3776ms

 Test Files  1 passed (1)
      Tests  27 passed (27)
```

<!-- ao-role: dev-takeover -->
Role: dev-takeover · AO session hotel-mgmt-1320
