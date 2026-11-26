# #637 room and room-type capacity — evidence

Before/after lab record for
[issue #637](https://github.com/MingChen1501/hotel-mgmt/issues/637)
(audit finding M3, capacity half; `AC-CAP-1`..`AC-CAP-4`,
`FR-CAP-1`..`FR-CAP-4`, `BR-69`). This is the `CAP-E1` record
(`docs/testing/capacity-validation-test-traceability.md` section 7):
the negative, fractional, non-finite, non-number, and wizard pairs plus
the `TEST_PG_URL` parity run.

## Builds and lab

| Half | Build | Notes |
|---|---|---|
| Before | `origin/master` at `c95bde4`, `services/rooms` built from a clean tree (`npm ci && npm run build`) | the `typeof input.capacity === "number"` assertion in both stores |
| After | This branch at the commit that carries this record, `services/rooms` (`npm run build`) | one shared `requireCapacity` check called by both stores before any write |
| Store | Both halves run the in-memory `RoomStore` (`node dist/index.js`, no `DATABASE_URL`), a fresh process per half | same boot path as section 7 of `docs/architecture/services/rooms.md` |
| Postgres | A throwaway `postgres:16` container with the Rooms migrations (`001_boot`, `002_schema`) applied, addressed through `TEST_PG_URL` | `CAP1`–`CAP5` Postgres halves |

Each half was served on its own loopback port and driven through the
public contract (`UpsertRoomType`, `UpsertRoom`, `ListRoomTypes`) with
`Authorization: Bearer ev637-lab-token`, the same recipe as
`script/e2e-desk-loop.sh`. Seed per half: one `Deluxe` room type with
`capacity: 2`.

## Pair 1 — negative and zero capacities

| Step | Before | After |
|---|---|---|
| `UpsertRoomType` `capacity: -1` | `200` and the type is stored with `capacity: -1` | `400 VALIDATION_FAILED`, `details.field: "capacity"` |
| `UpsertRoomType` `capacity: 0` | `200` and the type is stored with `capacity: 0` | `400 VALIDATION_FAILED`, `details.field: "capacity"` |
| Stored types after both calls | the negative and zero types appear in `ListRoomTypes` | neither type exists; `Deluxe` still reads `2` |

Before:

```json
{"id":"b6521609-00ad-423d-93ee-9975d1cc0a35","name":"Neg","capacity":-1,"bedType":null,"features":{}}
{"id":"ae1d9fab-e2c6-41a1-876e-d1f569579ce4","name":"Zero","capacity":0,"bedType":null,"features":{}}
```

After:

```json
{"code":"VALIDATION_FAILED","message":"capacity must be a whole number of guests of at least 1.","details":{"field":"capacity"},"traceId":"9f801050-6358-43f1-8981-00fbdf4d4597"}
{"code":"VALIDATION_FAILED","message":"capacity must be a whole number of guests of at least 1.","details":{"field":"capacity"},"traceId":"c9670fd0-98f3-494a-885b-860400a2330c"}
```

## Pair 2 — fractional capacity

| Step | Before | After |
|---|---|---|
| `UpsertRoomType` `capacity: 2.5` | `200`; the in-memory build keeps `2.5`, the Postgres build rounds it into the `INT` column | `400 VALIDATION_FAILED` naming `capacity`; neither store keeps the fraction |
| `UpsertRoomType` `capacity: 2.0` (raw JSON) | `200`, stored as `2` | `200`, stored as `2` — a whole value written with a decimal point stays accepted |

Before (`ListRoomTypes` carried the fraction):

```json
{"id":"898aa5c4-a863-490d-a5e9-b7640eec014c","name":"Frac","capacity":2.5,"bedType":null,"features":{}}
```

After:

```json
{"code":"VALIDATION_FAILED","message":"capacity must be a whole number of guests of at least 1.","details":{"field":"capacity"},"traceId":"a21d3192-fd73-418e-a532-7b0e342e0c8c"}
```

## Pair 3 — non-finite capacity

| Step | Before | After |
|---|---|---|
| Raw body `{"capacity":1e999}` (over HTTP; `JSON.parse` yields `Infinity`) | In-memory build answers `200` with `capacity: null` (Infinity serialised out); the Postgres build answers `INTERNAL_ERROR` 500 from the `INT` driver binding | `400 VALIDATION_FAILED` naming `capacity`, before any driver call |
| Direct store call with `Infinity`, `-Infinity`, or `NaN` (not carried by JSON) | accepted by the `typeof` assertion | `VALIDATION_FAILED` naming `capacity` |

Before:

```json
{"id":"e499d2f9-ae2a-4e4e-9fec-ecd42a1528ef","name":"Inf","capacity":null,"bedType":null,"features":{}}
```

After:

```json
{"code":"VALIDATION_FAILED","message":"capacity must be a whole number of guests of at least 1.","details":{"field":"capacity"},"traceId":"afefb0b5-a3f1-43bc-a131-1ef1bed2b36e"}
```

## Pair 4 — non-number capacity

| Step | Before | After |
|---|---|---|
| `UpsertRoomType` `capacity: "2"` | `200`; the unusable value is silently dropped and the stored/null value is reported as success | `400 VALIDATION_FAILED` naming `capacity` |
| `UpsertRoomType` `capacity: null` | `200` with `capacity: null` — treated as an omission | `400 VALIDATION_FAILED` naming `capacity` — a present `null` is a mistake, not an omission |
| `UpsertRoom` `capacity: 0` | `200` and the room is stored | `400 VALIDATION_FAILED` naming `capacity` |

Before:

```json
{"id":"70cb79e6-3f76-42a3-bd63-239570f5dcea","name":"Str","capacity":null,"bedType":null,"features":{}}
{"id":"c6f4d021-753d-4ef3-acc6-19b97c3bb86d","name":"Nul","capacity":null,"bedType":null,"features":{}}
```

After:

```json
{"code":"VALIDATION_FAILED","message":"capacity must be a whole number of guests of at least 1.","details":{"field":"capacity"},"traceId":"1c1a8fb4-3d0b-4941-a835-674c75392378"}
{"code":"VALIDATION_FAILED","message":"capacity must be a whole number of guests of at least 1.","details":{"field":"capacity"},"traceId":"2235dd2f-301b-4181-9fdf-5531f035eacb"}
{"code":"VALIDATION_FAILED","message":"capacity must be a whole number of guests of at least 1.","details":{"field":"capacity"},"traceId":"d26d708f-ba18-495c-8ed2-f2efef36c909"}
```

## Pair 5 — the onboarding wizard floor

| Step | Before | After |
|---|---|---|
| Step 3 type capacity `0`, then `abc`, then `2.5` | `0` passes the digits-only rule and is posted; `abc` and `2.5` already fail | all three render the plain sentence, keep the wizard on step 3, and post no `UpsertRoomType` or `UpsertRoom` call |
| English sentence | "Capacity must be a whole number of 0 or more." | "Enter a whole number of guests of 1 or more, or leave it empty." |
| Vietnamese sentence | "Sức chứa phải là số nguyên từ 0 trở lên." | "Hãy nhập số khách tròn từ 1 trở lên, hoặc để trống." |
| Empty field | sends no `capacity` member | sends no `capacity` member (unchanged) |
| `1` and `21` | accepted | accepted and posted as numbers |

The wizard guard `CAP6` in `app/src/views/OnboardingView.test.ts` runs
every refused value in both locales, the empty-field case, and the
accepted `1`/`21` payloads; the manage screen's `1..20` guard
(`app/src/views/ManageView.test.ts:414-433`) passes unchanged.

## Accepted value above the form bound

`UpsertRoomType` with `capacity: 21` (above the manage form's client
side `20`) answers `200` and `ListRoomTypes` returns `21` — no server
ceiling is added:

```json
{"id":"b0c9efd0-ddef-4ecc-9087-1cf224b6259a","name":"Big","capacity":21,"bedType":null,"features":{}}
```

## Postgres parity run

The Postgres halves of `CAP1`–`CAP5` ran on a throwaway database with
the Rooms migrations applied:

```sh
docker run -d --name ao-637-pg -e POSTGRES_USER=hotel \
  -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=hotel \
  -p 55437:5432 postgres:16
cd services/rooms
DATABASE_URL=postgresql://hotel:change-me@127.0.0.1:55437/hotel npm run migrate up
npm run build
TEST_PG_URL=postgresql://hotel:change-me@127.0.0.1:55437/hotel \
  node --test dist/pgstore.test.js
# tests 11, pass 10, fail 1
```

The one failure is the pre-existing `#643` actor guard
(`records the session token and demotes the body actor on every write`),
which blocks a room it has just assigned with
`STATE_ILLEGAL: Room 101 is occupied and cannot be blocked.` The same
failure reproduces on `origin/master` and is recorded in the `#636`
evidence; it is not caused by this change. All four `#637` Postgres
capacity guards pass.

## What the guard cases prove on the same build

- `CAP1` — `1` and `21` accepted on both operations and both stores,
  stored verbatim and read back; `2.0` accepted as `2`; an update
  overwrites the stored value.
- `CAP2` — an omitted capacity still stores `null` on a create and
  keeps the stored value on an update, in both operations and both
  stores; a present `null` is refused.
- `CAP3` — every unusable value (negative, zero, fractional, `1e999` /
  `Infinity` / `NaN`, `"2"`, `null`, `true`, `[2]`, `{}`) answers one
  400 `VALIDATION_FAILED` naming `capacity` on both operations and both
  stores; never a 5xx.
- `CAP4` — a refused update leaves every stored field and the state
  byte-identical, no `room-upserted` event is emitted, and a refused
  create leaves no row.
- `CAP5` — both stores call the one shared helper; a `0` stored before
  the change still reads back `0` (no read-time re-validation, no
  migration).
- `CAP6` — the wizard refuses `0`, `2.5`, `-1`, and `abc` in both
  locales without sending; `1` and `21` are posted as numbers; an empty
  field posts no `capacity`.
- `CAP-R1` — a whole value above the Postgres `INT` range is **not**
  asserted refused: it is the recorded residual storage ceiling
  (R-24, LLD 38.6), fixed by its own decision.

## Reproduce

```sh
# Before
git archive origin/master services/rooms | tar -x -C /tmp/rooms-637-before
cd /tmp/rooms-637-before/services/rooms && npm ci && npm run build
PORT=18087 node dist/index.js

# After (this branch)
cd services/rooms && npm ci && npm run build
PORT=18088 node dist/index.js

# Probe (per port; token is any bearer string)
curl -X POST http://127.0.0.1:<port>/v1/rooms/UpsertRoomType \
  -H 'Authorization: Bearer ev637-lab-token' -H 'Content-Type: application/json' \
  -d '{"name":"Deluxe","capacity":0,"actor":"manager"}'
printf '{"name":"Inf","capacity":1e999,"actor":"manager"}' | \
curl -X POST http://127.0.0.1:<port>/v1/rooms/UpsertRoomType \
  -H 'Authorization: Bearer ev637-lab-token' -H 'Content-Type: application/json' \
  --data-binary @-
```

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1271
