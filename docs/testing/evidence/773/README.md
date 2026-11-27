# #773 ReleaseRoom release targets — evidence

Before/after lab record for
[issue #773](https://github.com/MingChen1501/hotel-mgmt/issues/773)
(`AC-REL-1`..`AC-REL-5`, `FR-REL-1`..`FR-REL-5`, `BR-72`). This is the
`REL-E1` evidence rule
([release-target-test-traceability.md](../../release-target-test-traceability.md)
section 7): the before/after pair for the two extra targets, the
nothing-written proof in both stores, the accepted pair and the
preserved absent default, the precedence pair, and the `TEST_PG_URL`
parity run.

## Builds and lab

| Half | Build | Notes |
|---|---|---|
| Before | `origin/master` at `0b602f3`, `services/rooms` built from a clean worktree (`npm ci && npm run build`) | both stores resolve `toState` tolerantly: any `ROOM_STATES` string is accepted, everything else defaults to `vacant-dirty` |
| After | This branch at the commit that carries this record, `services/rooms` (`npm run build`) | one shared `releaseTarget` check called by both stores after the room's own answers |
| Store (HTTP) | Both halves run the Postgres-backed store (`DATABASE_URL` set), a fresh process per half (`PORT=18093` before, `PORT=18094` after) | same boot path as section 7 of `docs/architecture/services/rooms.md` |
| Store (in-memory) | The after build also runs the in-memory store (`node dist/index.js`, no `DATABASE_URL`, `PORT=18095`) | the nothing-written half is pinned by `REL-4`; this live run shows the state stays `occupied` |
| Postgres | A throwaway `postgres:16` container created for this session (`rooms-pg-1334`, `127.0.0.1:55473`) with the Rooms migrations (`001_boot`, `002_schema`) applied | the owner's shared `hotel-mgmt` lab and compose project were not touched |

Every request below was driven through `POST /v1/rooms/ReleaseRoom`
(and the seed operations) with `Authorization: Bearer
ev773-lab-token`, the same recipe as `script/e2e-desk-loop.sh`. The
database counts were issued as the database owner (`hotel`) and read
`rooms.rooms`, `rooms.room_status_history`, and `rooms.outbox`. Each
seed is `UpsertRoomType Deluxe` -> `UpsertRoom 101` (state
`vacant-inspected`) -> `AssignRoom` (`stay-1`), so the release baseline
is `occupied | history=1 | outbox=3`.

## Pair 1 — the two extra targets: `200` before, `400` after

| Step | Before (`0b602f3`) | After (this branch) |
|---|---|---|
| `ReleaseRoom {"roomNumber":"101","toState":"vacant-clean"}` | `200`, body `{"roomNumber":"101","oldState":"occupied","newState":"vacant-clean"}` | `400 VALIDATION_FAILED`, `details.toState: "vacant-clean"` |
| Counts after the call | `vacant-clean \| history=2 \| outbox=4` — the room moved and both rows were written | `occupied \| history=1 \| outbox=3` — unchanged |
| `ReleaseRoom {"roomNumber":"101","toState":"out-of-order"}` | `200`, body `newState: "out-of-order"` | `400 VALIDATION_FAILED`, `details.toState: "out-of-order"` |
| Counts after the call | `out-of-order \| history=2 \| outbox=4` | `occupied \| history=1 \| outbox=3` — unchanged |

After (Postgres, identical shape for both targets apart from the echoed
value):

```json
{"code":"VALIDATION_FAILED","message":"Release target must be vacant-dirty or vacant-inspected.","details":{"toState":"vacant-clean"},"traceId":"b8788091-b415-4764-830f-3be54ba74d9c"}
{"code":"VALIDATION_FAILED","message":"Release target must be vacant-dirty or vacant-inspected.","details":{"toState":"out-of-order"},"traceId":"734fb2ef-80a6-4aa9-bcac-d65457e2ca03"}
```

The in-memory after build answers the same refusals and keeps the room:

```json
{"code":"VALIDATION_FAILED","message":"Release target must be vacant-dirty or vacant-inspected.","details":{"toState":"vacant-clean"},"traceId":"254cfa12-08b9-4817-b641-4c1b7e0b4902"}
{"code":"VALIDATION_FAILED","message":"Release target must be vacant-dirty or vacant-inspected.","details":{"toState":"out-of-order"},"traceId":"3846d5d4-a92d-4cef-8125-f9c3ddd7d8ec"}
{"state":"occupied","rooms":[{"roomId":"25d8c4b0-54d8-41f1-b09b-67bba84b8e3e","number":"101","roomTypeId":"23040829-ae18-499f-8023-6eefb1ecfe55","state":"occupied"}]}
```

The in-memory history and outbox counts are internal; guards `REL-3`
and `REL-4` (`services/rooms/src/server.test.ts:1539-1573`) snapshot a
copy of `findRoom`, and read `historyForRoomId` and
`roomsInternals(store).outbox` before the same refusal table, assert the
room still reads `occupied` after every refusal, and assert all three
unchanged after the loop. The snapshot is a copy because `findRoom`
returns the live record; comparing the live record with itself would
pass even if a refusal mutated the room.

## Pair 2 — the accepted pair and the preserved absent default

| Request (occupied room) | After response | Counts after |
|---|---|---|
| `toState: "vacant-inspected"` (the #647 compensating release) | `200`, `{"roomNumber":"101","oldState":"occupied","newState":"vacant-inspected"}` | `vacant-inspected \| history=2 \| outbox=4` |
| no `toState` | `200`, `{"roomNumber":"101","oldState":"occupied","newState":"vacant-dirty"}` | `vacant-dirty \| history=2 \| outbox=4` |
| `toState: "vacant-dirty"` | `200`, `newState: "vacant-dirty"` | `vacant-dirty \| history=2 \| outbox=4` |

Both accepted targets and the absent default keep one state change, one
`room_status_history` row, and one `room.state-changed` event;
`ReleaseRoom` stays outside `ALLOWED_TRANSITIONS` (`REL-9`).

## Pair 3 — the room's own answers keep precedence

| Request | After response |
|---|---|
| free room `102` (`vacant-inspected`) with `toState: "vacant-clean"` | `422 STATE_ILLEGAL`, `details {"roomNumber":"102","state":"vacant-inspected"}` |
| unknown room `999` with `toState: null` | `404 NOT_FOUND`, `details {"roomNumber":"999"}` |

Neither is `VALIDATION_FAILED`, and the counts prove nothing was
written (`REL-7`, `REL-8`).

## Parity run (`REL-5`-`REL-8`)

`TEST_PG_URL` is not set by any CI job, so the Postgres half is recorded
here. The scratch database is the throwaway container above, migrated
with `DATABASE_URL=postgresql://hotel:change-me@127.0.0.1:55473/hotel
npm run migrate -- up`.

```sh
cd services/rooms
TEST_PG_URL=postgresql://hotel:change-me@127.0.0.1:55473/hotel npm test
```

Result: `tests 78`, `pass 78`, `fail 0`, `skipped 0` (the in-memory run
without `TEST_PG_URL` reports `tests 63`, `pass 63`, `fail 0`,
`skipped 0`). `REL-5` and `REL-6` assert the accepted and refused
halves together with the `rooms.rooms` state and the
`rooms.room_status_history` / `rooms.outbox` counts; `REL-7` pins the
precedence pair; `REL-8` compares the in-memory and Postgres answers
field for field on the same request tables.

Lab note: the pre-existing Postgres `SEC6-SEC12` test
(`services/rooms/src/pgstore.test.ts`) could not pass as written — it
blocked an occupied room and then read the block row after
`releaseBlock` deleted it. The #773 PR corrects that test's ordering and
moves the block-row read before the release, so the Postgres suite is
green; no product behaviour was changed for it.

## Suite row

The slice row is recorded in
[docs/testing/test-report.md](../../test-report.md) (`REL-E1`), with the
commands and the green runs above.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1334
