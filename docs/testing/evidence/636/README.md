# #636 room state sellability — evidence

Before/after lab record for
[issue #636](https://github.com/MingChen1501/hotel-mgmt/issues/636)
(`AC-SEL-1`..`AC-SEL-4`, `FR-SEL-1`..`FR-SEL-4`, `BR-67`, audit
finding M1). This is the `SL-E1` evidence pair
([room-state-sellability-test-traceability.md](../../room-state-sellability-test-traceability.md)
section 3): an `out-of-order` room advertised as sellable on the
pre-change build and excluded on this change, captured through the
public `CheckRoomTypeSellability` contract on both halves.

## Builds and lab

| Half | Build | Notes |
|---|---|---|
| Before | `origin/master` at `b6ff53a`, `services/rooms` built from a clean `git archive` of that tree (`npm run build`) | `checkSellability` reads covering blocks only; room state is never consulted |
| After | This branch at the commit that carries this record, `services/rooms` (`npm run build`) | A room counts as sellable only when it is block-free and its state is neither `out-of-order` nor `occupied` |
| Store | Both halves run the in-memory `RoomStore` (`node dist/index.js`, no `DATABASE_URL`), a fresh process per half | Same boot path as the local run in `docs/architecture/services/rooms.md` section 7 |
| Postgres | A throwaway `postgres:16` container with the Rooms migrations (`001_boot`, `002_schema`) applied, addressed through `TEST_PG_URL` | `SL5` parity and `SL7` block-priority guards, run separately |

No Docker lab was needed for the before/after pair: the two Rooms
builds each serve their own loopback port with the in-memory store.

Everything below was driven through the public contract
(`UpsertRoomType`, `UpsertRoom`, `UpdateRoomState`,
`CheckRoomTypeSellability`) with `Authorization: Bearer
ev636-lab-token`, the same recipe as `script/e2e-desk-loop.sh`.

Seed per half: one `Deluxe` room type on room `101`, then
`UpdateRoomState` `101` -> `out-of-order` (accepted on both halves),
then the reads for `2026-12-01`..`2026-12-03` with no covering block.

## Pair 1 — the aggregate count excludes an out-of-order room

| Step | Before | After |
|---|---|---|
| Aggregate read for `Deluxe` | `200` with `totalCount: 1`, **`sellableCount: 1`** — the maintenance room is advertised as available | `200` with `totalCount: 1`, **`sellableCount: 0`** |
| `blockedRooms` | `[]` | `[]` (block membership does not move) |

Before:

```json
{"roomTypeId":"4f90a985-946d-4349-952a-7f618e84c4fb","dateFrom":"2026-12-01","dateTo":"2026-12-03","totalCount":1,"sellableCount":1,"blockedRooms":[]}
```

After:

```json
{"roomTypeId":"ede04b5a-968b-4ec9-8f9b-79913b6cf394","dateFrom":"2026-12-01","dateTo":"2026-12-03","totalCount":1,"sellableCount":0,"blockedRooms":[]}
```

## Pair 2 — the single-room read never claims availability

| Step | Before | After |
|---|---|---|
| Single-room read for `101` | `200` with `totalCount: 1`, **`sellableCount: 1`**, `blockedRooms: []` | `200` with `totalCount: 1`, **`sellableCount: 0`**, `blockedRooms: []` |

Before:

```json
{"roomTypeId":"4f90a985-946d-4349-952a-7f618e84c4fb","dateFrom":"2026-12-01","dateTo":"2026-12-03","totalCount":1,"sellableCount":1,"blockedRooms":[]}
```

After:

```json
{"roomTypeId":"ede04b5a-968b-4ec9-8f9b-79913b6cf394","dateFrom":"2026-12-01","dateTo":"2026-12-03","totalCount":1,"sellableCount":0,"blockedRooms":[]}
```

Both halves keep the same six-field 200 envelope, so the Book confirm's
existing `desk.book.refused_soldout` path refuses the zero count without
a desk edit; a block-covered room still refuses `422 STATE_ILLEGAL`
naming the block before the state answer.

## What the guard cases prove on the same build

Behaviour is pinned by the implementation's own guards, run in the
module suite (`cd services/rooms && npm test`):

- `SL1` — aggregate excludes an `out-of-order` room; changing it back
  to `vacant-dirty` restores the count.
- `SL2` — aggregate excludes an `AssignRoom`-produced `occupied` room;
  releasing it to `vacant-dirty` restores the count.
- `SL3` — a room both block-covered and `out-of-order` is subtracted
  once (never below `0`), and `blockedRooms` names it exactly once.
- `SL4` — each vacant state (`vacant-dirty`, `vacant-clean`,
  `vacant-inspected`) still counts, and an empty type answers `0`/`0`.
- `SL5` — the in-memory and Postgres stores answer the same
  `totalCount`, `sellableCount`, and `blockedRooms` for one recorded
  fixture (one `out-of-order`, one `occupied`, one blocked and
  `out-of-order`, two vacant).
- `SL6` — a block-free `out-of-order` or `occupied` single room answers
  `200` with `sellableCount: 0`; a vacant room still answers `1`.
- `SL7` — a block-covered `out-of-order` room still refuses
  `422 STATE_ILLEGAL` with the block's dates and reason, in both stores.
- `SL8` — releasing a block lifts `blockedRooms` membership but keeps
  `sellableCount: 0` until `UpdateRoomState` makes the room vacant.
- Existing block and sellability guards (`server.test.ts`,
  `pgstore.test.ts`) keep their assertions and stay green.

Postgres parity command and result:

```sh
cd services/rooms
TEST_PG_URL=postgresql://hotel:change-me@127.0.0.1:55436/hotel \
  node --test --test-name-pattern "SL5|SL7" dist/pgstore.test.js
# tests 2, pass 2, fail 0
```

## Pre-existing Postgres guard failure outside this slice

Running the whole Postgres suite on this build also runs the pre-existing
`#643` actor guard
(`records the session token and demotes the body actor on every write`),
which fails with `STATE_ILLEGAL: Room 101 is occupied and cannot be
blocked.` The same failure reproduces on `origin/master` `b6ff53a`
(`git archive` build, same throwaway database), so it is not caused by
this change: the guard blocks a room it just assigned. It is latent
because CI skips the Postgres suite without `TEST_PG_URL`. Flagged for a
follow-up issue; not fixed here to keep the slice scoped.

## Reproduce

```sh
# Before
git archive origin/master services/rooms | tar -x -C /tmp/rooms-before
cd /tmp/rooms-before/services/rooms && npm ci && npm run build
PORT=18085 node dist/index.js

# After (this branch)
cd services/rooms && npm run build
PORT=18086 node dist/index.js

# Seed + probe (per port; token is any bearer string)
curl -X POST http://127.0.0.1:<port>/v1/rooms/UpsertRoomType \
  -H 'Authorization: Bearer ev636-lab-token' -H 'Content-Type: application/json' \
  -d '{"name":"Deluxe","capacity":2,"bedType":"king","actor":"manager"}'
curl -X POST http://127.0.0.1:<port>/v1/rooms/UpsertRoom \
  -H 'Authorization: Bearer ev636-lab-token' -H 'Content-Type: application/json' \
  -d '{"number":"101","roomType":"Deluxe","floor":"1","actor":"manager"}'
curl -X POST http://127.0.0.1:<port>/v1/rooms/UpdateRoomState \
  -H 'Authorization: Bearer ev636-lab-token' -H 'Content-Type: application/json' \
  -d '{"roomNumber":"101","newState":"out-of-order","actor":"maintenance"}'
curl -X POST http://127.0.0.1:<port>/v1/rooms/CheckRoomTypeSellability \
  -H 'Authorization: Bearer ev636-lab-token' -H 'Content-Type: application/json' \
  -d '{"roomType":"Deluxe","dateFrom":"2026-12-01","dateTo":"2026-12-03"}'
```

<!-- ao-role: dev-takeover -->
Role: dev-takeover · AO session hotel-mgmt-1238
