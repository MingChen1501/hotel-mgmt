# Room capacity validation test traceability (Refs #637)

Status: active. Testing spec for the T2 capacity-validation change
([issue #637](https://github.com/MingChen1501/hotel-mgmt/issues/637),
audit finding M3, capacity half), owned by `qa-lead`. It maps the
change's done-conditions — `AC-CAP-1`..`AC-CAP-4`, owned by
`product-owner` in `docs/product/acceptance-criteria.md`
[section 31](../product/acceptance-criteria.md#31-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637)
— and the behaviour-scoped requirements `FR-CAP-1`..`FR-CAP-4` plus the
business rule `BR-69`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 39](../requirements/mvp-requirements.md#39-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637)
and `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), to their
guards: the pins that exist on disk at this spec head, the guard
registry `CAP1`–`CAP10`, the residual-risk record `CAP-R1`, and the
evidence rule `CAP-E1`.

Written before the implementation PR. Every guard in the registry is a
**named, missing obligation** at this head: the Rooms suites today send
whole capacities only and contain no capacity-refusal guard at all, so
no row marks a guard complete, and the slice is not complete until the
implementation PR merges and `qa-lead` re-pins every row at the merged
head (the `#588` → `#599`, `#601`, `#631`, `#633` pattern). Section 2
cites what is on disk today and what it proves; section 4 says which
rows the implementation PR creates and which pins it must keep
byte-identical.

Companion specs: LLD
[section 38](../architecture/lld.md#38-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637)
(where the shared check sits, the field rule and its value classes, the
refusal contract, the per-flow diagrams, and the verification plan this
plan aligns with), HLD
[section 30](../architecture/hld.md#30-room-and-room-type-capacity-is-a-whole-number-of-at-least-1-refs-637),
the refreshed Rooms flowcharts
([section 11](../architecture/services/rooms.md#11-planned-delta--capacity-is-a-whole-number-of-at-least-1-refs-637)),
the `errors[].when` lines in
`contracts/http/UpsertRoom.json` and `UpsertRoomType.json`, the
`RoomInventoryService` note in `docs/technical/api-spec.md` section 2,
product `AC-CAP-1`..`AC-CAP-4` with D-43
([decision log](../project/decision-log.md)) and R-24
([risk register](../project/risk-register.md)), requirements section 39
with its own `qa-lead` handoff, the data-dictionary capacity entries
(`docs/requirements/data-dictionary.md:197-201`, `:220-224`), and
`BR-69`. This spec implements no code, changes no guard, adds no
catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2 (behaviour change; recorded by `product-owner` in the issue
  and acceptance-criteria section 31, confirmed in LLD section 38):
  `UpsertRoom` and `UpsertRoomType` gain a caller-visible refusal for a
  value they used to store, round, or silently drop, and the onboarding
  wizard's capacity sentence changes. No operation, route, request or
  response field, status, envelope token, schema table, lifecycle
  state, desk control, migration, or print rule is added or removed, so
  no T3 escalation and no ADR. The single reader-visible move carries a
  UI contract in the product section 31, so no UI-contract gap applies.
- The change is **one field rule** on two existing writes plus one
  wizard sentence. The whole surface is
  `services/rooms/src/store.ts:239-295`,
  `services/rooms/src/pgstore.ts:141-267`, and the two capacity reads at
  `services/rooms/src/store.ts:248`, `:279` /
  `services/rooms/src/pgstore.ts:146`, `:207`.
- The accepted value class is exactly one: a JSON number that is an
  integer at or above `1`, with **no upper bound added** (the contract
  sets only a minimum; the manage form's `1..20` stays a client sanity
  bound, `AC-MANAGE-3`). `2.0` counts as whole because `JSON.parse`
  already yields `2`, so there is no runtime distinction to guard.
  **This spec adds no large-value ceiling test**: a value above the
  Postgres `INT` range is the recorded residual risk `CAP-R1`, not a
  refusal this change makes.
- An omitted `capacity` keeps today's meaning: a create stores none
  (`null`), an update keeps the stored one. A JSON `null` is **present**
  and is refused under `CAP3` — omission is the key's absence, not a
  null value. The guard must therefore distinguish `{}` from
  `{"capacity": null}`, which a `??`-style merge cannot.
- Values already stored outside the rule — a stored `0`, negative, or a
  fraction an earlier release rounded — are neither rewritten nor
  repaired and keep reading exactly as today. No guard may assert a
  repair, a backfill, or a read-time re-validation.
- No schema move: no migration file appears under
  `services/rooms/migrations/`, no `CHECK`, column, index, or stored
  value changes. The rule is module logic, which is where the existing
  housekeeping order already lives.
- `features` stays unbounded (its own decision, #774): the 65 536-byte
  body ceiling (#630) remains its only bound. No guard may assert a
  `features` bound.
- The release path and the transition table are untouched:
  `ReleaseRoom`'s explicit `toState`, `vacant-inspected` as a release
  target, and `ALLOWED_TRANSITIONS` keep their meaning, and the
  release-target enum (`vacant-clean`, `out-of-order`) is not narrowed
  here. No guard may assert a change to any of them.
- No new MVP row, story, or FR capability. `FR-RMS-4`, `FR-MGMT-3`, and
  `FR-ADM-3` keep their wording and their existing guards; the new
  obligations live in `FR-CAP-1`..`FR-CAP-4` / `BR-69`. The 57/57 MVP
  coverage count in
  [traceability-matrix.md](traceability-matrix.md) stands unchanged and
  no MVP row may cite this slice as its guard. The slice rows live in
  traceability-matrix section 31.
- Guards are extended, never deleted. Unlike the `#633` slice, **no
  fixture re-seed is needed**: every fixture, e2e script, and deployment
  entry already sends a whole capacity (`2`, `3`, or `4`), so the
  existing assertions must pass untouched. Editing an existing Rooms
  assertion instead of adding cases beside it is drift and fails `CAP9`.
  The wiring changes (an exported `requireCapacity` helper, a new
  catalogue key, the wizard rule) are not assertion changes.
- Refusal precedence across fields is not decided here (requirements
  39.6). The existing `name`/`number`/`actor` refusals keep their order
  and messages, the capacity check sits where its field is read, and the
  one documented placement pin is `CAP10`. No guard may assert which
  refusal wins when two *invalid fields* are sent at once.
- The desk regression surface is narrow: the manage screen already
  refuses anything outside `1..20` before sending and is unchanged; the
  onboarding wizard is the one surface that newly refuses a value, and
  its sentence ships in the same release bundle. No other desk file,
  label, state, or copy may appear in the implementation diff.
- The finding itself is the before-state, recorded by `CAP-E1`: a
  negative or zero capacity is stored, `2.5` is kept in memory and
  rounded by the Postgres `INT` cast, `1e999` answers `INTERNAL_ERROR`
  500, `NaN` passes a direct store call, and a present non-number is
  silently dropped and answered as success.

## 2. Pins on disk at this spec head

The pins below exist at this head and prove what the "covered by
re-run" and "pinned today" halves rest on. They were re-read for this
spec; none is promised, none is a placeholder. Where a row names one of
`CAP1`–`CAP10` the guard itself is listed in section 3 (it does not
exist yet).

| Pin | What it proves today |
|---|---|
| `services/rooms/src/store.ts:248` | `capacity: typeof input.capacity === "number" ? input.capacity : (existing?.capacity ?? null)` in `upsertRoomType` — the type assertion `AC-CAP-2` names, and the fallback an omitted key keeps |
| `services/rooms/src/store.ts:279` | The same assertion in `upsertRoom` — the second call site the shared check replaces |
| `services/rooms/src/store.ts:239-263` | The whole in-memory room-type write: `requireString` name and actor (`:240-241`), the record build (`:242-256`), the map writes (`:255-256`), and the `room-upserted` emit (`:257-263`) — where the check must land and where "nothing written, no event" is asserted |
| `services/rooms/src/store.ts:266-295` | The in-memory room write: `number`, `actor`, `resolveRoomType` (`:270-271`), the record build (`:272-287`), the map write (`:288`), and the emit (`:289-295`) — the `NOT_FOUND` stays ahead of the capacity read |
| `services/rooms/src/store.ts:98-110` | `requireDate` and `requireString`: the shared-helper shape and the `HttpError("VALIDATION_FAILED", …)` + `details.field` pattern the new `requireCapacity` joins |
| `services/rooms/src/store.ts:333-345` | `listRoomsByState` and `listRoomTypes` today — the room-type read carries `capacity`, the room read does not |
| `services/rooms/src/store.ts:579-590` | The in-memory `emit` the refusal must never reach for a refused request |
| `services/rooms/src/pgstore.ts:141-201` | The Postgres room-type write: the assertion (`:146`), the merge `capacity ?? current.capacity` (`:160`), `withTx` (`:152`), the `UPDATE` (`:164-171`) and `INSERT` (`:178-186`) with the `INT` parameter binding, and the outbox rows (`:171-177`, `:187-194`) — the parity target and the "no statement, no outbox row" surface |
| `services/rooms/src/pgstore.ts:199-267` | The Postgres room write: `resolveRoomType` (`:204`), the assertion (`:207`), `withTx` (`:212`), `COALESCE($5, capacity)` (`:221`), the create binding (`:255`), and the outbox rows (`:235-241`, `:260-266`) |
| `services/rooms/src/pgstore.ts:5-26` | The `./store.js` import list `requireCapacity` joins (beside `requireString`) — one shared function, no second copy |
| `services/rooms/src/server.ts:63` | `JSON.parse(raw)`, which turns a literal `1e999` into `Infinity` — the HTTP path's non-finite value |
| `services/rooms/src/server.ts:91-94` | The `HttpError` branch: `writeJson(res, err.status, errorEnvelope(err))` — the 400 every refusal must use |
| `services/rooms/src/server.ts:95-101` | The non-`HttpError` catch-all that answers `INTERNAL_ERROR` 500 — the answer a refused value must never reach |
| `services/rooms/src/server.ts:139-160` | The two operations: `UpsertRoomType`'s response carries `capacity`; `UpsertRoom`'s response carries `id`, `number`, `roomTypeId`, `state` and no capacity — the unchanged shapes |
| `services/rooms/src/server.ts:164-190` | `ListRoomsByState` (no capacity field) and `ListRoomTypes` (carries `capacity`) — the reads the accepted half asserts |
| `services/rooms/src/errors.ts:3-45` | The shared `ErrorCode` union, `STATUS_BY_CODE` (`VALIDATION_FAILED: 400`), `HttpError`, and `errorEnvelope` with a fresh `traceId` — no new token is needed |
| `services/rooms/migrations/002_schema.sql:20`, `:38` | `capacity INT` (32-bit, nullable) in `rooms.room_types` and `rooms.rooms`, with no `CHECK` — the storage ceiling `CAP-R1` records and the "no migration" gate |
| `services/rooms/src/server.test.ts:268-303` | `creates a room type and room, then reports sellability`: `UpsertRoomType` with `capacity: 2`, `UpsertRoom` on the same type, then the exact sellability body — the accepted path that must stay byte-identical |
| `services/rooms/src/server.test.ts:305-327` | `lists room types with names for the desk picker`: two types created with `capacity: 2` and read back by `ListRoomTypes` — the read-back shape the type half of `CAP1` extends |
| `services/rooms/src/server.test.ts:349-402` | `defines rooms as owner and shows them in inventory and availability`: `capacity: 4` answered by `UpsertRoomType` (`:359`, `:365`) — the MVP `FR-ADM-3` guard that must not move |
| `services/rooms/src/server.test.ts:231-238` | `keeps the missing-actor refusal and adds no disagreement refusal (SEC31)`: a 400 with `details.field: "actor"` — the envelope shape `CAP3`/`CAP10` assert, and the existing refusal order |
| `services/rooms/src/server.test.ts:1058-1098` | The unexpected-exception and same-route `HttpError` cases: an exception answers `INTERNAL_ERROR`, a named refusal answers its own code and status — the 500-versus-400 split `CAP3` must keep |
| `services/rooms/src/server.test.ts:49-59` | `roomsInternals`: the in-memory `outbox` accessor the "no `room-upserted`" assertion reuses (`:75`, `:93` read the event today) |
| `services/rooms/src/pgstore.test.ts:22-57` | `persists the desk-loop room rows`: `capacity: 2` written, the rows read back, and the `rooms.outbox` row count asserted — the Postgres write/read/outbox pin |
| `services/rooms/src/pgstore.test.ts:12-20` | `wipe(pool)` deletes `rooms.outbox`, `room_status_history`, `room_blocks`, `rooms`, and `room_types` — the scratch-database fixture the Postgres halves need |
| `services/rooms/src/pgstore.test.ts:176-220` | The session-actor write case: writes through the Postgres store and reads the outbox payloads — the pattern the Postgres "no event" assertion follows |
| `app/src/views/OnboardingView.vue:579-581` | `isWholeNumber` is `/^\d+$/` — digits only, so `0` passes while `2.5`, `-1`, and `abc` already fail the wizard's current rule |
| `app/src/views/OnboardingView.vue:857-864` | The step-3 capacity check rendering `desk.onboarding.capacity_invalid` — where the `1` floor must join, in plain words, before sending |
| `app/src/views/OnboardingView.vue:915-917` | `payload['capacity'] = Number(row.capacity.trim())` only when the field is non-empty — the "empty sends no capacity member" half of `CAP6` |
| `app/src/views/OnboardingView.test.ts:579-598` | `refuses a blank room-type name and persists nothing`: the refusal assertion pattern — the plain sentence on screen, the step retained, and `fetch` never reaching `UpsertRoomType`/`UpsertRoom` |
| `app/src/views/OnboardingView.test.ts:673-723` | `persists types then rooms and advances to step 4`: the accepted payload with `capacity: 2` and the types-before-rooms order `CAP6` re-runs |
| `app/src/views/OnboardingView.test.ts:894-920` | `renders steps 2–4 in Vietnamese with no missing-key fallback` — the locale pin the Vietnamese refusal case reuses |
| `app/src/views/ManageView.vue:1071-1085`, `:1300-1309` | The manage screen's own rules: digits only, `1..20` for a type and `>= 1` for a room, refused before sending with `desk.manage.type_capacity_invalid` — unchanged |
| `app/src/views/ManageView.test.ts:414-433` | `names the field and sends nothing on invalid type input`: capacity `0` refused with the `1 to 20` sentence and `21` refused with no request — the manage-side regression pin |
| `app/e2e/manage.spec.ts:78-89` | The browser flow fills capacity `2`, saves, and reads it back through `ListRoomTypes` — must stay green with no edit |
| `script/e2e-desk-loop.sh:271` | The desk-loop proof writes `UpsertRoomType` with `capacity: 2` — accepted today and after the change |
| `deploy/config/hotel.example.json:23-25` | The deployment set's capacities are `2`, `3`, `4` — every one accepted |
| `messages/en.json:180` | `rooms.validation.date_format` — the `{field} must be …` sentence family the new `rooms.validation.capacity` key joins |
| `messages/en.json:700`, `messages/vi.json:700` | `desk.onboarding.capacity_invalid` today: "Capacity must be a whole number of 0 or more." / "Sức chứa phải là số nguyên từ 0 trở lên." — the sentence `CAP6`/`CAP7` require to state the floor of `1`, updated in both locales |
| `services/rooms/src/messages.en.json` | The Rooms runtime mirror that `script/catalogue-coverage-check.sh` requires byte-identical to `messages/en.json` (one of eight mirrors, list at `script/catalogue-coverage-check.sh:107-116`) |
| `contracts/http/UpsertRoom.json:19`, `UpsertRoomType.json:16` | `capacity` declared `{"type": "integer", "minimum": 1}` — the rule already declared and, before this change, unimplemented |
| `contracts/http/UpsertRoom.json:37`, `UpsertRoomType.json:35` | The `VALIDATION_FAILED` `when` lines now naming the capacity case (architect delta) — the contract side `CAP8` re-runs |
| `services/rooms/contract-tests/UpsertRoom.json:5`, `UpsertRoomType.json:5` | The operation fixtures send `capacity: 2` — shape-only, and they must keep passing with no edit |
| `docs/technical/api-spec.md:118` | The `RoomInventoryService` row carrying the capacity note (architect delta) — the LC surface `CAP8` re-runs |
| `script/contract-check.sh`, `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh` | The gates `CAP9` re-runs on the implementation PR |
| `.github/workflows/ci.yml:308-339`, `:341-375`, `:396-405`, `:197-307` | The `node-build (rooms)` matrix, `app-build`, `contract-check`, and `ci` jobs the implementation PR must turn green |

Pass evidence for the covered-by-re-run rows at this head: the base tree
is green on `origin/master` `d287b00` — `node-build (rooms)`,
`app-build`, `browser-e2e`, `contract-check`, `ci`, `e2e-single-host`,
`migrate-check`, and every other check-run report `success` (read with
`gh api repos/MingChen1501/hotel-mgmt/commits/d287b00/check-runs`). This
spec stack is docs-and-contract only: the diff against `origin/master`
is empty under `services/rooms` and `app`, so every code pin above is
byte-identical to that green base, and the stack head is docs-only (its
PR runs `ci`, `contract-check`, and the docs jobs, with the build
matrices path-filtered out). The implementation PR supplies
the `node-build (rooms)` and `app-build` evidence, which is why its job
list is stated in section 5 and `CAP-E1` records the Postgres half
separately.

## 3. Guard registry CAP1-CAP10, the residual-risk record CAP-R1, and the evidence rule CAP-E1

Naming: the registry uses `CAP*` (capacity) and the owner cases use
`CAP-*` (section 6), so neither collides with the `FR-CAP-*` /
`AC-CAP-*` requirement and condition ids. The requirements handoff
(section 39.5) names five missing guards `C1`..`C5`; they are carried
here as `CAP1`/`CAP2` (`C1`), `CAP3` (`C2`), `CAP4` (`C3`), `CAP5`
(`C4`), and `CAP6`/`CAP7` (`C5` plus the catalogue half). All guards are
**created by the #637 implementation PR**; they are listed `pending` in
section 4 until `qa-lead` re-pins them with `file:line` at the merged
head.

Every refusal is asserted on the payload, not only on the status: a 400
must carry `code: "VALIDATION_FAILED"`, `details.field: "capacity"`, one
plain `message` with no envelope code, status number, or stack text, and
a fresh `traceId`. Every refusal is also asserted on its **stored
effect** — a following read answers as before and no `room-upserted`
event is emitted — because a 400 followed by a stored row is exactly the
fail-open shape this slice removes. The in-memory half runs through
`createServiceServer` at request level; the Postgres half runs on a
scratch database through `TEST_PG_URL` and is skipped without it.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `CAP1` | An accepted capacity round-trips verbatim: `1` and `21` — `21` above the manage form's `20` sanity bound — are accepted on both `UpsertRoomType` and `UpsertRoom`, the room-type response carries the value and the next `ListRoomTypes` returns it unchanged, and a room's value is read back from its stored row (memory record / `SELECT capacity FROM rooms.rooms`) unchanged; `2.0` in raw JSON is accepted as `2`; every other field (name, bed type, features, floor, state) is written exactly as today. Upserting the same type with a different accepted capacity overwrites it, so the value is stored rather than merely echoed | `services/rooms/src/server.test.ts` (request level, memory) and `services/rooms/src/pgstore.test.ts` (store level, Postgres) |
| `CAP2` | An omitted capacity keeps today's meaning, and absence differs from `null`: an `UpsertRoomType` create with no `capacity` answers 200 with `capacity: null` and a later `ListRoomTypes` shows `null`; an `UpsertRoomType` update with no `capacity` keeps the stored value; an `UpsertRoom` create with no `capacity` stores `null`, and an update with none keeps the stored value; a present `{"capacity": null}` is **refused** under `CAP3`, never treated as omission — in both operations and both stores | `services/rooms/src/server.test.ts` (request level, memory) and `services/rooms/src/pgstore.test.ts` (store level, Postgres) |
| `CAP3` | Every unusable value is refused by name, never coerced or dropped: the integral values below `1` (`-1`, `0`, `-2147483648`), the fractional values (`2.5`, `0.5`, `1e-1`), the non-finite values (`1e999` sent as raw JSON so `JSON.parse` yields `Infinity`, plus `Infinity`, `-Infinity`, and `NaN` passed through a direct store call), and the non-numbers (`"2"`, `null`, `true`, `[2]`, `{}`) each answer exactly one 400 `VALIDATION_FAILED` with `details.field` `capacity`, the plain catalogue sentence, and a fresh `traceId` — on both operations and in both stores — never a 5xx, and never a 200 carrying the old value | `services/rooms/src/server.test.ts` (memory, request level, including the raw-JSON `1e999` case) and `services/rooms/src/pgstore.test.ts` (Postgres, store level; the `Infinity`/`NaN` values only arrive here) |
| `CAP4` | Nothing is written and no event is emitted on a refusal: an existing room type and an existing room are written with accepted values, then for every value class in `CAP3` a refused update leaves the row's every field and its state byte-identical (asserted on the stored row, not only on the response), the in-memory outbox / `rooms.outbox` gains no new `room-upserted`, and a refused **create** leaves no row at all; the other events already in the outbox are untouched. Both stores | `services/rooms/src/server.test.ts` (memory, via `roomsInternals` outbox) and `services/rooms/src/pgstore.test.ts` (Postgres, row read + `rooms.outbox` query) |
| `CAP5` | Both stores refuse identically from one shared check, and no read-time rule exists: the same accepted request against both stores answers the same status and stored value; each refused value answers the same code, field, and sentence from both; a value stored **before** the change (for example `0`, seeded directly into the memory map / by SQL on the Postgres side) still reads back unchanged, proving no read-time re-validation; and no migration file is added under `services/rooms/migrations/`. The helper is a single exported function in `store.ts` imported by `pgstore.ts` (code-reading half: no second copy of the four tests) | `services/rooms/src/server.test.ts` and `services/rooms/src/pgstore.test.ts` (behavioural parity) + diff gate (one helper, no migration) |
| `CAP6` | The onboarding wizard refuses a capacity below `1` before sending, in both locales: `0`, `2.5`, `-1`, and `abc` each render the plain capacity sentence, keep the wizard on step 3, and make no `UpsertRoomType` or `UpsertRoom` call; `1` and `21` are accepted and posted as numbers; an empty field posts no `capacity` member; the Vietnamese locale renders its own sentence; the manage screen's `1..20` rule and sentences stay unchanged | `app/src/views/OnboardingView.test.ts` (new cases beside the existing refusal/accepted patterns, `:579-598`, `:673-723`, `:894-920`) |
| `CAP7` | The catalogue is extended, never rewritten: one new plain server sentence key `rooms.validation.capacity` states the whole-number-of-at-least-1 rule and names the field through `{field}`, and `desk.onboarding.capacity_invalid` is updated in both locales to the floor of `1`; both are in the canonical `messages/en.json`, byte-identical in all eight runtime mirrors, and at parity in `messages/vi.json` with matching placeholders; no sentence renders an envelope code, status number, or stack text | `script/catalogue-coverage-check.sh` (CI `ci`) + the sampled render assertions the implementation adds to the Rooms suite and the wizard test |
| `CAP8` | Contract and LC: the `VALIDATION_FAILED` `when` line in each of `contracts/http/UpsertRoom.json` and `UpsertRoomType.json` names the capacity case; **no** new envelope token, request or response property, status, or `maximum` keyword is added; the two operation fixtures keep `capacity: 2` and pass unchanged; `script/contract-check.sh` is green and the `RoomInventoryService` row in `docs/technical/api-spec.md` section 2 keeps its capacity note | `script/contract-check.sh` (CI `contract-check`) + diff gate |
| `CAP9` | Nothing else moves: no migration file under `services/rooms/migrations/`; every existing Rooms suite passes with no assertion edit — including the accepted writes (`:268-303`, `:305-327`, `:349-402`), the state, block, release, move, and sellability suites, and the audit-actor suite; `ManageView`'s `1..20` refusal and its test are unchanged; `app/e2e/manage.spec.ts` and `script/e2e-desk-loop.sh` keep writing capacity `2`; no `features` bound, no upper capacity bound, and no `ReleaseRoom`/`ALLOWED_TRANSITIONS`/release-target edit appears in the diff | Diff gate over `git diff --name-only` + `node-build (rooms)`, `app-build`, `browser-e2e`, `e2e-single-host`, and the existing suites |
| `CAP10` | The existing refusal order and the documented placement hold: a missing `name` (type), missing `number` (room), and missing `actor` still answer 400 naming their own field with their existing messages when `capacity` is absent; a valid request with an unusable capacity answers the capacity refusal, not a 500; and the placement pin — the capacity read sits after the room type resolves, so an unknown type's `NOT_FOUND` cannot regress — is a code-reading obligation. No guard asserts which refusal wins when two *invalid fields* are sent at once (requirements 39.6 leaves that undecided) | `services/rooms/src/server.test.ts` |
| `CAP-R1` | **Residual-risk record, not a guard.** A whole capacity above the Postgres `INT` range (for example `3000000000`, which `requireCapacity` accepts because no upper bound is decided) is kept by the in-memory store and answers a driver range error surfaced as `INTERNAL_ERROR` 500 on the Postgres store. This is a pre-existing storage ceiling (`capacity INT`, `migrations/002_schema.sql:20`, `:38`), named in R-24 and LLD 38.6, and fixed by its own decision (a declared server maximum or a `BIGINT` migration). **No guard in this slice may assert that such a value is refused**, and the implementation PR must not invent a bound to make one pass | Risk register R-24 + this row; follow-up decision required |
| `CAP-E1` | Evidence rule: the implementation PR records the before/after pairs for the negative, fractional, non-finite, and non-number capacities plus the wizard floor (`docs/testing/evidence/637/README.md`, created by that PR, same capture method as the `#631`, `#633`, `#636`, and `#642` records), records the `TEST_PG_URL` parity run, and records the slice row in `docs/testing/test-report.md` (`test-strategy.md` [section 3](test-strategy.md) exit criterion 6). Stays pending until all three are recorded | Evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row whose guard does not exist at this
head. Rows marked pinned-today rest on pins that exist and pass today
(section 2) and must keep passing untouched. The rows stay `pending` /
`covered by re-run` until the implementation PR merges, passes, and
`qa-lead` re-pins every cell with `file:line` at the merged head
(section 8).

| Item | Required guard | Guard |
|---|---|---|
| `AC-CAP-1` — a present capacity that is an integer at or above `1` is stored verbatim and read back unchanged, including a value above the manage form's `20`; an omitted capacity keeps today's meaning (a create stores none, an update keeps the stored one); no other field moves (traces to US-ADM-2, US-ADM-3, US-RMS-4; `FR-RMS-4`, `FR-ADM-3`, `FR-CAP-1`; `BR-69`) | L1 acceptance: the `1`/`21`/`2.0` accepted cases on both operations and both stores, the read-back per operation, the omitted-create and omitted-update cases, and the unchanged fields | **Pending** — `CAP1`, `CAP2`; **pinned today** for the accepted write path only (`services/rooms/src/server.test.ts:268-303`, `:349-368`; `services/rooms/src/pgstore.test.ts:22-57`) — no guard proves `1`, `21`, or the omitted cases yet |
| `AC-CAP-2` — a negative, zero, fractional, non-finite (`1e999` over HTTP, `Infinity` directly), `NaN`, or non-number (`"2"`, `null`, `true`, `[2]`) capacity is refused `VALIDATION_FAILED` (400) naming `capacity` in `details.field`, in both operations and both stores, with nothing created or overwritten, no `room-upserted` event, and never an `INTERNAL_ERROR` 500 (traces to US-ADM-2, US-ADM-3, US-RMS-4; `FR-RMS-4`, `FR-ADM-3`, `NFR-I18N-1`, `FR-CAP-2`; `BR-69`) | L1 acceptance: every value class in both operations and both stores, the full 400 envelope, the stored-effect proof, the no-event proof, and the never-500 proof | **Pending** — `CAP3`, `CAP4`, `CAP7`; today's acceptance is the assertion at `services/rooms/src/store.ts:248`, `:279` / `pgstore.ts:146`, `:207`, and the 500 catch-all is `services/rooms/src/server.ts:95-101` |
| `AC-CAP-3` — the two stores refuse identically from one shared check inside the store, with no migration, `CHECK`, backfill, truncation, or read-time re-validation, so a value already stored keeps reading as today (traces to `FR-RMS-4`, `FR-ADM-3`, `NFR-CON-1`, `FR-CAP-3`; `BR-69`) | L1 acceptance + diff gate: parity of accepted and refused answers, the pre-change stored value still readable, one helper, no migration | **Pending** — `CAP5`, `CAP9`; today's divergence is the memory verbatim save (`store.ts:248`, `:279`) versus the Postgres `INT` write (`pgstore.ts:164-186`, `:219-255`) |
| `AC-CAP-4` — the onboarding wizard refuses a capacity below `1` in plain words before sending, in English and Vietnamese, and the manage screen's own rule is unchanged (traces to US-ADM-3; `FR-ADM-3`, `FR-MGMT-3`, `NFR-I18N-1`, `FR-CAP-4`; `BR-69`) | L1 acceptance: the four refused inputs on screen with no request, the accepted `1`/`21`, the empty-field case, the Vietnamese sentence, and the unchanged manage screen | **Pending** — `CAP6`, `CAP7`; today's `0`-accepting rule is `app/src/views/OnboardingView.vue:579-581`, `:857-864` and the sentence `messages/en.json:700`, `messages/vi.json:700`, with the manage pin `app/src/views/ManageView.test.ts:414-433` |
| `FR-CAP-1` — a whole capacity of at least 1 is stored verbatim and read back, above the form bound too; an omitted value keeps create-none/update-keeps (requirements 39.3) | L1 acceptance | **Pending** — `CAP1`, `CAP2` |
| `FR-CAP-2` — an unusable capacity is refused by name in both operations and both stores with nothing written, no event, and never a 500 (requirements 39.3) | L1 acceptance | **Pending** — `CAP3`, `CAP4` |
| `FR-CAP-3` — one shared check inside the store; stored rows do not move; a pre-change stored value keeps reading as today; both stores answer identically (requirements 39.3) | L1 acceptance + diff gate | **Pending** — `CAP5`, `CAP9` |
| `FR-CAP-4` — the onboarding wizard refuses a capacity below the server floor before sending, in both locales, and the manage screen is unchanged (requirements 39.3) | L1 acceptance | **Pending** — `CAP6` |
| `BR-69` — the capacity write rule: a present capacity is a whole number of at least 1 stored verbatim, every other present value refused naming `capacity` with nothing written and no `room-upserted` event, an omitted value keeping create-none/update-keeps, one shared check in code, no migration or read-time re-validation, the wizard at the same floor, and the floor a fixed code rule (business rules section 6; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `CAP1`–`CAP10`, `CAP-E1` |
| `FR-RMS-4` / `FR-ADM-3` / `FR-MGMT-3` (MVP rows, unchanged) — room setup and attributes, owner room and type setup, and the manage form's filled-field rule keep their wording and their guards; this change makes the service honour the contract those rows already sit on | L1 re-run: the MVP guard slots in matrix section 1, unedited | **Covered by re-run today** — `services/rooms/src/server.test.ts:349-402` (`FR-ADM-3`), `:268-303` and `:305-327` (`FR-RMS-4` setup/inventory), and `app/src/views/ManageView.test.ts:414-433` (`FR-MGMT-3`); the MVP rows in section 1 stand unchanged and may not cite this slice as their guard |
| `NFR-I18N-1` (unchanged) — the new server refusal and the updated wizard sentence resolve through the catalogue, render no envelope code, status number, or stack text, carry the field through `{field}`, and keep the English and Vietnamese key sets at parity with matching placeholders | Catalogue gate | **Pending** — `CAP7`; `script/catalogue-coverage-check.sh` must be green with the new key in `messages/en.json`, the eight byte-identical mirrors, and `messages/vi.json` at parity |
| `NFR-BND-1`..`NFR-BND-3`, `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-AUD-1`, `NFR-TZ-1` (unchanged) — no route, body ceiling, lock, transaction, round trip, outside dependency, event, or date format moves; the check is one integer test before a write the service already makes | No-change re-run | **Covered by re-run today** — the #630 body-bound and server-timeout guards, the paired-assignment guards, the timed desk run, and the audit-actor suite; a new route, body bound, or migration fails `CAP9` |
| Contract and LC | Real delta: each `VALIDATION_FAILED` `when` line names the capacity case; no operation, route, property, required list, status, enum token, or `maximum` is added; the fixtures stay shape-only with `capacity: 2` | **Pending gate** — `CAP8`; the contract edits are `architect`'s (LLD 38.5) |
| No-configuration and no-migration gate | Real delta: the floor is one code constant carried by no environment variable, `deploy/` file, compose file, or per-hotel setting, and no migration, column, `CHECK`, backfill, truncation, or stored-value rewrite is added | **Pending diff gate** — `CAP9`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-69) |
| No-desk-regression gate | Real delta: the manage screen is byte-identical (`1..20` still client-side), the wizard's only change is the floor sentence and its rule, and no other desk control, label, state, or copy moves; the two e2e paths that write capacity `2` stay green | **Pending gate** — `CAP9`, `CAP6`; the pins are `app/src/views/ManageView.test.ts:414-433`, `app/e2e/manage.spec.ts:78-89`, and `script/e2e-desk-loop.sh:271` |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` capability wording moves; `FR-CAP-1`..`FR-CAP-4` are behaviour-scoped additions outside the counted capability set (requirements 39.2, 39.3) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Residual risk `CAP-R1` | The contract-admitted value above the Postgres `INT` range still answers a driver-error 500 on the Postgres store; the slice neither bounds nor migrates it, and no guard may assert its refusal | **Recorded, not guarded** — R-24, LLD 38.6, and this row; a fix (declared maximum or `BIGINT`) is its own decision |
| Evidence cross-reference (`CAP-E1`) | The before/after pairs, the `TEST_PG_URL` Postgres parity run, and the slice row in the test report | **Pending** — `docs/testing/evidence/637/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #637): 18 rows mapped to `AC-CAP-1`..`AC-CAP-4`,
`FR-CAP-1`..`FR-CAP-4`, `BR-69`, the unchanged MVP rows
`FR-RMS-4`/`FR-ADM-3`/`FR-MGMT-3`, `NFR-I18N-1`, the no-change NFR
group, the contract/LC gate, the configuration/migration gate, the
no-desk-regression gate, the MVP no-change gate, the residual-risk
record `CAP-R1`, and `CAP-E1`. Three rows carry a pinned-today half (the
unchanged MVP row, the no-change NFR row, and the accepted-write half
inside `AC-CAP-1`); the other fifteen are **pending** the implementation
PR. The slice is **not complete** at this spec head; it completes when
the implementation PR merges with `CAP1`–`CAP10` green, the Postgres
halves recorded on a scratch database, `CAP-E1` recorded, and `qa-lead`
re-pins the rows at the merged head. The MVP Coverage line below stands
unchanged at 57/57.

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: `docs/architecture/services/rooms.md` section 7) |
|---|---|---|
| L1 service, Rooms (memory store) | `CAP1`–`CAP5` memory halves, `CAP10`, plus every existing rooms pin | `cd services/rooms && npm ci && npm run build && npm test && npm run lint` (CI `node-build (rooms)`; `npm test` builds first) |
| L1 service, Rooms (Postgres parity) | `CAP1`–`CAP5` Postgres halves on a **scratch** database (the fixtures wipe `rooms.*`) | `cd services/rooms && TEST_PG_URL=postgres://… npm test`; the Postgres cases skip without `TEST_PG_URL` |
| L1 desk UI | `CAP6` wizard refusals and the accepted path in both locales, plus the unchanged manage pin | `cd app && npm ci && npm run build && npm test && npm run lint` (CI `app-build`) |
| LC contract | `CAP8`: the two contracts, the untouched fixtures, the `RoomInventoryService` row | `script/contract-check.sh` (CI `contract-check`) |
| Catalogue | `CAP7`: the new key, the updated wizard sentence, the eight byte-identical mirrors, the Vietnamese parity | `script/catalogue-coverage-check.sh` (CI `ci`) |
| Browser regression | `CAP9`: the manage flow writes and reads capacity `2` with no desk edit | CI `browser-e2e` (or `cd app && npx playwright test e2e/manage.spec.ts` against a served stack) |
| No-change re-run | `CAP9`: the desk-loop proof and the existing Rooms suites | `e2e-single-host` job for `script/e2e-desk-loop.sh:271`; the unchanged `node-build (rooms)` suite |
| Gates | Links, harness conventions, whitespace | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `node-build
(rooms)`, `app-build`, `contract-check`, `ci`, and `e2e-single-host`,
with `browser-e2e` running when the desk path is in the change set. The
Postgres half is not a CI job (the matrix sets no `TEST_PG_URL`), which
is why `CAP-E1` records the parity run explicitly; adding a
database-backed job would be a CI change outside this slice's scope.

### Execution order

1. Rooms memory suite: the new `CAP*` cases first (a red case stops the
   run), then every existing rooms pin unchanged.
2. Rooms Postgres suite with `TEST_PG_URL` on a scratch database: the
   parity cases, the pre-change stored-value seed, then the wiped
   fixture rows.
3. `script/contract-check.sh` and the catalogue gate (`CAP7`, `CAP8`):
   the two contracts resolve and the new key renders in both locales.
4. The app suite (`CAP6`): the wizard refusals in both locales, then the
   accepted path and the manage pin.
5. The browser manage flow and the desk-loop proof (`CAP9`): still
   green with no desk or script edit.
6. `CAP-E1`: the before/after pairs and the parity run, recorded; then
   the `test-report.md` row.
7. Link, harness, and whitespace gates; then `qa-lead` re-pins section 4
   at the merged head.

### Entry criteria

1. The spec set is `active` and `spec-reviewer` has posted `SPEC-GATE
   PASS` on #637 (T2).
2. The companion specs this plan cites are active: acceptance-criteria
   section 31 (`AC-CAP-1`..`AC-CAP-4`), requirements section 39
   (`FR-CAP-1`..`FR-CAP-4`, `BR-69`), LLD section 38, HLD section 30,
   and the refreshed Rooms section 11 diagram.
3. The build under test is identified by commit, and the fixture is one
   room type plus one room per half (the `script/e2e-desk-loop.sh`
   seed shape), with a scratch database carrying the Rooms migrations
   for the Postgres half and its outbox table read for the "no event"
   assertions.

### Exit criteria

1. `CAP1`–`CAP10` exist and pass; every refusal asserts the full
   payload (`code`, `details.field`, `message`, `traceId`) **and** its
   stored effect (row unchanged or absent, no new `room-upserted`).
2. The Postgres halves ran with `TEST_PG_URL` on a scratch database and
   answered the same codes, statuses, and payload shapes as the
   in-memory store.
3. `CAP9` holds unchanged: every existing Rooms, app, e2e, and
   contract pin passes with no assertion edit, and the diff gate shows
   no migration, no upper bound, no `features` bound, and no
   release/transition-table edit.
4. `CAP7` holds: the catalogue is extended (not rewritten), the wizard
   sentence is updated in both locales, and the eight mirrors are
   byte-identical.
5. `CAP-E1` is recorded: the evidence pairs in
   `docs/testing/evidence/637/README.md` and the slice row in
   `docs/testing/test-report.md`.
6. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
7. Open failures are filed as issues with FR/NFR ids; no `risk-high`
   failure is waived without owner approval.

### Negative controls

- **A refusal must leave nothing behind.** `CAP4` asserts both the 400
  payload and the unchanged stored state; a 400 that still stored the
  row is the exact fail-open shape this slice removes.
- **The boundary, not only the refusal.** `CAP1` pins `1` and `21` so a
  guard that refuses everything fails — in particular an implementation
  that reuses the manage form's `20` as a server maximum.
- **Omission is not `null`.** `CAP2` seeds a stored value, sends `{}`,
  and asserts it is kept, then sends `{"capacity": null}` and asserts a
  refusal; an implementation using `capacity ?? current` passes the
  first and fails the second.
- **`1e999` must arrive as `Infinity`.** `CAP3` sends the raw JSON text,
  not a JavaScript number, so the case exercises `JSON.parse`; sending
  `Infinity` through the request helper would serialise to `null` and
  test the wrong class.
- **Both stores must agree.** Every case that can run in both stores
  runs in both; a passing memory case is never taken as evidence for
  the SQL path, which is a separate expression and, for `2.5`/`1e999`,
  a different failure mechanism (the `INT` cast and the driver).
- **No upper bound may be invented.** `CAP-R1` exists so a generous
  implementer does not add a ceiling to make the Postgres 500
  disappear: a guard that refuses `3000000000` fails this spec.
- **The wizard must still send nothing.** `CAP6` counts
  `UpsertRoomType` / `UpsertRoom` calls, not only the message; a
  refusal rendered *after* a partial send is not a pass.

## 6. Owner verification cases (CAP-1..CAP-8)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` seed recipe (sign-in token, one room
type with capacity `2`). Each case states what to send and what to see.

| Case | Setup | Expected |
|---|---|---|
| `CAP-1` | Create a room type with `capacity: 21`, then read `ListRoomTypes` | 200, and the type shows capacity `21` — above the manage form's `20`, so no server ceiling exists |
| `CAP-2` | Update the type without a `capacity` key, then create a room type with `capacity: null` | The update keeps `21`; the `null` create is refused 400 naming `capacity` |
| `CAP-3` | Send `UpsertRoomType` with `capacity: 0`, then `-1`, then `2.5` | Each is refused 400 `VALIDATION_FAILED` naming `capacity` with one plain sentence, and the stored type still shows `21` |
| `CAP-4` | Send `UpsertRoomType` with a raw body containing `"capacity": 1e999` | 400 naming `capacity`, not an `INTERNAL_ERROR` 500 |
| `CAP-5` | Send `UpsertRoomType` with `capacity: "3"` | 400 naming `capacity`, not a 200 that silently keeps the old value |
| `CAP-6` | Open the onboarding wizard step 3 and type `0` in a type's capacity, then `abc`, then `2.5` | The form-level sentence says the capacity must be a whole number of guests of 1 or more (its Vietnamese twin in the Vietnamese locale) and nothing is saved; `1` and `21` save |
| `CAP-7` | On the manage screen, try capacity `0` and then `21` for a type | The existing `1 to 20` sentence, exactly as before — the manage rule did not move |
| `CAP-8` | Repeat `CAP-1`, `CAP-3`, and `CAP-4` on a Postgres-backed build | The same statuses, codes, and details as the in-memory build |

Desk regression on the same build: `CAP-D1` the manage screen still
creates a room type and a room; `CAP-D2` the onboarding wizard still
completes setup with a filled capacity; `CAP-D3` no new control, label,
state, or copy appears outside the one wizard sentence. Expected:
unchanged from the pre-change desk.

## 7. Evidence rule CAP-E1

The implementation PR records five before/after pairs plus the parity
run (`docs/testing/evidence/637/README.md`, created by that PR, same
capture method as the `#631`, `#633`, `#636`, and `#642` records):

- **Negative pair.** Before: `UpsertRoomType` with `capacity: -1` (and
  `0`) answers 200 and stores the value, so the type shows a
  non-existent guest count. After: 400 `VALIDATION_FAILED` naming
  `capacity`, and the stored type is unchanged.
- **Fractional pair.** Before: `capacity: 2.5` answers 200 and is kept
  in memory, and the Postgres build stores the rounded `3`. After: 400
  naming `capacity`, and neither store keeps the fraction — with the
  pre-change rounded row still reading as it did (no repair).
- **Non-finite pair.** Before: a raw body with `1e999` answers
  `INTERNAL_ERROR` 500 from the Postgres driver. After: 400
  `VALIDATION_FAILED` naming `capacity`, and the in-memory build
  refuses the same request instead of keeping `Infinity`.
- **Non-number pair.** Before: `capacity: "2"` (and `null`) answers 200
  and silently keeps the old or null value. After: 400 naming
  `capacity`, with the stored row unchanged.
- **Wizard pair.** Before: the wizard accepts `0`, sends it, and the
  pre-change server stores `0`, so a type is saved that sleeps no one.
  After: the wizard refuses `0` in plain words and sends nothing, in
  English and Vietnamese, and the server refuses the same value if a
  caller sends it anyway.
- **Parity run.** The Postgres halves of `CAP1`, `CAP3`, `CAP4`, and
  `CAP5` executed with `TEST_PG_URL` on a scratch database, with the
  identical payloads from both stores recorded and the command pasted
  (the Node matrix sets no `TEST_PG_URL`, so a green `node-build
  (rooms)` job is not parity evidence on its own).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and the re-pin rule

At the spec head: 18 rows mapped — three rows carry a pinned-today half
whose pins exist and pass (the unchanged MVP row, the no-change NFR row,
and the accepted-write half inside `AC-CAP-1`) and the other fifteen are
**pending** the implementation PR (the registry `CAP1`–`CAP10`, the
gates, the residual-risk record, the MVP no-change gate, and `CAP-E1`).
The slice is **not complete** at this spec head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise. When the implementation PR merges, `qa-lead`
re-reads every `file:line`, rewrites the pins in place (never deletes
one), records the merged head SHA in the matrix section 31 status line,
and flips the rows. A row whose guard the PR did not create stays
pending and is filed as a gap on #637.

The two wiring changes the implementation PR is expected to make are
not assertion changes: the `requireCapacity` helper joins `requireDate`/
`requireString` in `services/rooms/src/store.ts` and is imported by
`pgstore.ts`, and the two capacity reads call it. Every existing
assertion — including the accepted writes at `server.test.ts:268-303`,
`:305-327`, `:349-402` and `pgstore.test.ts:22-57` — must keep its
wording. Deleting or loosening an assertion instead of adding cases
fails `CAP9`.

The 57/57 MVP coverage count in
[traceability-matrix.md](traceability-matrix.md) stands unchanged: this
slice adds no MVP capability, and no MVP row may cite it as its guard.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1263
