# #631 server-side reservation availability — evidence

Before/after lab record for
[issue #631](https://github.com/MingChen1501/hotel-mgmt/issues/631)
(`AC-OVB-1`..`AC-OVB-3`, `FR-OVB-1`..`FR-OVB-4`, `BR-47`..`BR-49`,
ADR-0006). This is the `OR-1` evidence pair
([availability-derivation-test-traceability.md](../../availability-derivation-test-traceability.md)
section 7): the inflated `sellableUnits` booking and the unreadable
capacity source, captured on the pre-change build and on this change.

## Builds and lab

| Half | Build | Notes |
|---|---|---|
| Before | `origin/master` at `a583eaf` (the #631 spec-landing commit), `services/reservations` built from a clean `git archive` of that tree | The request's `sellableUnits` is the guard's only ceiling; no capacity source is read |
| After | This branch (`ao/hotel-mgmt-1103/631-server-side-availability`) at the commit that carries this record | Ceiling derived from Rooms `CheckRoomTypeSellability` (`totalCount - len(blockedRooms)`); unreadable capacity fails closed |
| Rooms | This branch, `services/rooms` (`npm run build`, `node dist/index.js`), in-memory store | Unchanged by this PR; both halves read one Rooms build |
| Rates | A loopback stub answering `200` to `/v1/rates/CheckRestrictions` | Only to keep the stay-restriction step out of the capture |
| Reservations | `PORT=18081`, `RATES_BASE_URL=http://127.0.0.1:18082`, `ROOMS_BASE_URL=http://127.0.0.1:18085`, no `DATABASE_URL` (in-memory store, fresh per run) | One binary per half, fresh Rooms process per half |

No Docker lab was needed for this pair: the two Reservations builds run
against one loopback Rooms process and one loopback rates stub, which is
the same booking path the compose lab exercises. The Postgres parity
guards (`O11`) ran separately against a throwaway `postgres:16`
container created for this session, with the module migrations applied;
all `TestPostgres*` cases passed, including
`TestPostgresDerivedCeilingParity`.

Everything below was driven through the public contracts
(`UpsertRoomType`, `UpsertRoom`, `CreateReservation`, `QueryCalendar`)
with `Authorization: Bearer ev631-lab-token`, the same recipe as
`script/e2e-desk-loop.sh:299`, `:332`.

## Pair 1 — an inflated `sellableUnits` cannot overbook

Seed per half: one room type on one room (`EV-<half>-101`), then a hold
for `2026-12-01`..`2026-12-03` with `sellableUnits: 1` (accepted on both
halves). Then the probe: the same type and dates with
`sellableUnits: 999`.

| Step | Before | After |
|---|---|---|
| Hold (`sellableUnits: 1`) | `200` confirmed, `RSV-RM5CN7QM` | `200` confirmed, `RSV-6GGQAEA9` |
| Probe (`sellableUnits: 999`) | `200` confirmed, `RSV-4B84NE66` — **overbooked** | `409 CONFLICT`, details name the room type and both dates |
| Calendar for the dates | 2 confirmed reservations | 1 confirmed reservation |
| Positive control: three-room type, no hold, `sellableUnits: 999` | `200` confirmed | `200` confirmed — the guard is not a rubber stamp in the safe direction |

Before, probe response body:

```json
{"quotedTotal":1000,"reservationId":"2bbcbf00-0d8e-49ae-b6a8-0851559b0b7e","reservationRef":"RSV-4B84NE66","state":"confirmed"}
```

Before, calendar after the probe (two rows for one recorded room):

```json
{"dateFrom":"2026-12-01","dateTo":"2026-12-03","reservations":[
  {"arrivalDate":"2026-12-01","departureDate":"2026-12-03","reservationRef":"RSV-RM5CN7QM","roomTypeId":"34d12c97-…-4105140aed51","state":"confirmed","stayId":null},
  {"arrivalDate":"2026-12-01","departureDate":"2026-12-03","reservationRef":"RSV-4B84NE66","roomTypeId":"34d12c97-…-4105140aed51","state":"confirmed","stayId":null}]}
```

After, probe response (409):

```json
{"code":"CONFLICT","details":{"arrivalDate":"2026-12-01","departureDate":"2026-12-03","roomTypeId":"2c426c40-…-f0611e490032"},"message":"No sellable unit left for the room type for 2026-12-01 to 2026-12-03.","traceId":"b8ee99a7b8e73bbcb92b2806df552e8f"}
```

After, calendar after the probe (the one real reservation only):

```json
{"dateFrom":"2026-12-01","dateTo":"2026-12-03","reservations":[
  {"arrivalDate":"2026-12-01","departureDate":"2026-12-03","reservationRef":"RSV-6GGQAEA9","roomTypeId":"2c426c40-…-f0611e490032","state":"confirmed","stayId":null}]}
```

## Pair 2 — an unreadable capacity source fails closed

Each half restarted with `ROOMS_BASE_URL=http://127.0.0.1:1` (no
listener) and the same create body (`sellableUnits: 999`).

| Step | Before | After |
|---|---|---|
| Create with Rooms unreachable | `200` confirmed, `RSV-QCRV57LV` — booked with no capacity read at all | `503 UPSTREAM_UNAVAILABLE`, nothing written |

Before:

```json
{"quotedTotal":1000,"reservationId":"75792e09-79ec-4f35-a095-1de84ef0d734","reservationRef":"RSV-QCRV57LV","state":"confirmed"}
```

After:

```json
{"code":"UPSTREAM_UNAVAILABLE","details":{"operation":"CheckRoomTypeSellability","upstream":"rooms"},"message":"The room inventory is unavailable, so the booking was refused.","traceId":"7f29f129ff9fe1953b5896fc9b166a6f"}
```

## What the guard cases prove on the same build

The behaviour above is pinned by the implementation's own guards, run
in the module suite (`cd services/reservations && go test ./...`):

- `O1`/`O2` — inflated create refused `CONFLICT`, nothing written
  (`store_test.go`, `handler_availability_test.go`).
- `O3` — low and absent `sellableUnits` book; `-1`, a string, and a
  fraction are `VALIDATION_FAILED` naming the field.
- `O4` — inflated modify into held dates and into a sold-out type: `409`,
  the reservation keeps its dates, type, guest, and price, no change row.
- `O5` — `totalCount: 2` with both rooms blocked: `409 CONFLICT`, not
  `503`.
- `O6`/`O7` — transport, timeout, 5xx, unreadable reply, and an unwired
  client each refuse `503` naming rooms and `CheckRoomTypeSellability`;
  a rooms `NOT_FOUND`/`UNAUTHENTICATED` envelope passes through unchanged.
- `O8`/`O9` — paired last-unit creates and modifies yield one winner and
  one `CONFLICT`; a replay returns the original and consumes no second
  unit.
- `O10` — cancelled, no-show, and closed rows release; a checked-in row
  keeps its unit.
- `O11` — the same create/modify/replay/paired cases over `PostgresStore`
  (run against a throwaway `postgres:16` container with the module
  migrations applied).
- `O13` — `script/contract-check.sh` and `script/openapi-route-check.sh`
  pass with `CreateReservation` 1.2 and `ModifyReservation` 1.1 (optional
  advisory field, new 503 error row, derived-ceiling consumer fixture).
