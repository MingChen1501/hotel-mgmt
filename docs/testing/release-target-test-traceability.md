# Release target test traceability (Refs #773)

Status: active. Testing spec for the T2 `ReleaseRoom` release-target
change ([issue #773](https://github.com/MingChen1501/hotel-mgmt/issues/773)),
owned by `qa-lead`. It maps the change's done-conditions —
`AC-REL-1`..`AC-REL-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md`
[section 34](../product/acceptance-criteria.md#34-releaseroom-accepts-only-the-two-specified-release-targets-refs-773)
— and the behaviour-scoped requirements `FR-REL-1`..`FR-REL-5` plus the
business rule `BR-72`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 42](../requirements/mvp-requirements.md#42-releaseroom-accepts-only-the-two-specified-release-targets-refs-773)
and `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), to their
guards: the pins that exist on disk at this spec head, the guard
registry `REL-1`–`REL-14`, the residual-risk record `REL-R1`, and the
evidence rule `REL-E1`.

Written before the implementation PR. The change replaces one tolerant
input resolution with one shared check in two stores, so every registry
guard is a **named, missing obligation** at this head: no guard in the
Rooms suite sends an out-of-set target and no guard proves the
nothing-written half. No row marks a guard complete, and the slice is
not complete until the implementation PR merges and `qa-lead` re-pins
every row at the merged head (the `#588` → `#599`, `#601`, `#631`,
`#633`, `#637`, `#767` pattern). Section 2 cites what is on disk today
and what it proves; section 5 says which rows the implementation PR
creates and which pins it must keep byte-identical.

Companion specs: acceptance-criteria section 34 (five conditions, with
`AC-FDK-2`, `AC-REA-1`, and `AC-REA-3` gaining only pointers);
requirements section 42 (the five FRs, the no-change statements 42.2 and
42.4, and its own `qa-lead` handoff in 42.5); `BR-72`; LLD
[section 41](../architecture/lld.md#41-releaseroom-accepts-exactly-the-two-specified-release-targets-refs-773)
(where the shared `releaseTarget` check sits, the refusal shape, the
nothing-written semantics, the `ALLOWED_TRANSITIONS` boundary, the
per-flow diagram, the contract edits, and the residual risks); HLD
[section 33](../architecture/hld.md#33-releaseroom-accepts-exactly-the-two-specified-release-targets-refs-773);
the as-built delta in the Rooms design note
([section 12](../architecture/services/rooms.md#12-as-built-delta--releaseroom-accepts-only-the-two-release-targets-refs-773))
with the release flowchart
([section 4](../architecture/services/rooms.md#4-failurerollback-flowchart));
state-machine [section 2.1](../architecture/state-machine.md#21-the-two-release-targets-refs-647-773);
D-46 in [the decision log](../project/decision-log.md) and R-27 in
[the risk register](../project/risk-register.md); and the sibling
testing specs this change must not disturb:
`arrival-reassign-test-traceability.md` (#647, registry `RR1`–`RR13`,
whose compensating-release cases `RR2`, `RR6`, and `RR9` run through the
same operation), `checkout-settlement-test-traceability.md` (#601,
`S1`–`S12`), and `departure-release-test-traceability.md` (#646,
`DR1`–`DR13`). This spec implements no code, changes no guard, adds no
catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `product-owner` (D-46) and `architect` (LLD
  41): one existing operation gains a caller-visible refusal while no
  state, transition, operation, route, request or response field,
  status set, envelope token, schema table, migration, desk surface,
  catalogue requirement, or print rule is added or removed.
- No MVP row moves. `FR-FDK-2`, `FR-FDK-3`, `FR-REA-1`, `FR-REA-3`,
  and `FR-RMS-1` keep their wording and their existing guards and gain
  only the amendment pointer; the 57-row MVP coverage count in
  `traceability-matrix.md` stands unchanged and no MVP row may cite
  this slice as its guard. The slice rows live in
  `traceability-matrix.md` section 34.
- No new NFR. Requirements 42.4 is a no-change statement: audit and
  time, concurrency, desk response, on-premise availability,
  internationalisation, transport bounds, and security all hold with
  the existing guards.
- Contract: the enum narrows to `vacant-dirty` + `vacant-inspected` in
  the architect half of this spec stack (LLD 41.5), the absent default
  stays, and the error entries keep their codes and statuses. No error
  entry, status, response field, or envelope token is added, so the
  matrix keeps no per-row LC cell (the contract stage is a re-run, per
  the matrix's LC convention).
- Guards are extended, never deleted. The absent-default release
  (`services/rooms/src/server.test.ts:741-750`), the session-actor
  release (`:143-161`, SEC10), the explicit `vacant-inspected` release
  (`services/rooms/src/pgstore.test.ts:187`), the #588 check-out release
  (`app/src/views/StayView.test.ts:1190-1198`), the #647 compensating
  cases (`:2779-2783`, `RR2`; `:3010-3066`, `RR6`; `:3180`, `RR9`), and
  the e2e default callers keep their assertions. The implementation PR
  may tighten them with a `#773` note but must not drop a case.
- The catalogue sentence is a requirement, not a key: LLD 41.2 leaves
  the retirement or reuse of `rooms.validation.release_occupied` to the
  implementation. `REL-12` asserts the sentence's content and EN/VI
  parity, never a specific key name.
- The Postgres half is not a CI job: the `node-build` matrix sets no
  `TEST_PG_URL`, so the database path runs on a scratch database and is
  recorded by `REL-E1`, exactly as the `#631`/`#633`/`#636`/`#637`
  slices record theirs.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this branch head (the stack's
architecture commit `170ce5c`; the code tree is identical to
`origin/master` at `2dbb13f`, because the three sibling spec PRs touch
only `docs/` and `contracts/http/ReleaseRoom.json`). They prove today's
tolerant behaviour; the implementation PR extends them in place, with a
`#773` note, and never deletes one.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/rooms/src/store.ts:480-511` (`releaseRoom`) | Reads the room (`:485`), requires the actor (`:486`), refuses a non-occupied room `STATE_ILLEGAL` (`:489-494`), resolves `toState` tolerantly (`:495-498`), refuses only `occupied` `VALIDATION_FAILED` (`:499-501`), then writes state, history, and event (`:502-509`) and returns the receipt (`:510`) | The only edit: `:495-501` becomes the shared `releaseTarget` check, called after the room answer. `REL-1`–`REL-4`, `REL-9` assert the accepted and refused sets; `REL-8` asserts the receipt |
| `services/rooms/src/pgstore.ts:514-563` (`releaseRoom`) | Resolves the target before the transaction (`:522-525`), refuses only `occupied` (`:526-528`), then `SELECT` (`:530-532`), `NOT_FOUND` (`:533-536`), `STATE_ILLEGAL` (`:538-543`), `UPDATE` (`:544-548`), history (`:549-553`), outbox (`:554-560`), receipt (`:561`) | The target call moves inside the transaction after `:538-543` and before `:544-548`; `REL-5`–`REL-8` assert the Postgres half and the answer parity |
| `services/rooms/src/store.ts:45-51` (`ALLOWED_TRANSITIONS`) | The `occupied` row admits only `vacant-dirty` (`:49`), so the transition table cannot express the compensating `occupied -> vacant-inspected` release | Unchanged, and `releaseRoom` must stay off it: `REL-9` imports the constant and asserts the row, so a future routing through the table fails the guard |
| `services/rooms/src/store.ts:24` (`ROOM_STATES`), `:499-501` | The tolerant resolution accepts any `ROOM_STATES` string and refuses only `occupied` — the behaviour the refusal replaces | `REL-3`/`REL-6` send `vacant-clean`, `out-of-order`, `occupied`, and non-states; the constant itself is unchanged (`REL-13`) |
| `services/rooms/src/server.ts:201-202` | The one route answering `ReleaseRoom`, the dispatch both in-memory HTTP guards drive | Unchanged; `REL-1`–`REL-4` drive the route, `REL-5`–`REL-8` call the Postgres store directly |
| `services/rooms/src/server.test.ts:741-750` | An occupied room released with no `toState` answers `200` with `{roomNumber, oldState: "occupied", newState: "vacant-dirty"}` (inside the rooms-side move test, `:718-794`) | Extended by `REL-1`/`REL-2` with the explicit pair and the history/event halves; the default assertion stays byte-identical |
| `services/rooms/src/server.test.ts:143-161` (SEC10) | The session token is the recorded actor and the request actor rides as `requestActor` on the release history and `room.state-changed` payload | `REL-2` reads the same internals; the actor assertions stay |
| `services/rooms/src/server.test.ts:49-59` (`roomsInternals`), `:1323-1367` (CAP4) | The precedent for counting the in-memory outbox and history from a refusal test: read `outbox.length` before and after, compare rooms byte-for-byte | `REL-4` reuses the helper and the before/after shape for the release refusal |
| `services/rooms/src/pgstore.test.ts:177-223` (SEC6–SEC12, the release at `:185`) | An explicit `vacant-inspected` release succeeds against Postgres and is recorded (the #647 compensating target), and the suite wipes `rooms.*` per test (`:14-20`) | `REL-5` extends it with the accepted pair, the absent default, and the row/event counts; `REL-6` adds the refused matrix on the same scratch-database harness |
| `contracts/http/ReleaseRoom.json:16`, `:30-33` | The request enum now lists exactly `vacant-dirty` and `vacant-inspected` with `"default": "vacant-dirty"`; the `STATE_ILLEGAL` row records the not-occupied-before-target order; the `VALIDATION_FAILED` row names a present target outside the pair | `REL-11` asserts the enum, the default, the two `when` sentences, and the unchanged error set |
| `services/rooms/contract-tests/ReleaseRoom.json` | The happy-path fixture (`status: 200`, `newState: "vacant-dirty"`) | Unchanged and must pass; `REL-11` re-runs `script/contract-check.sh` |
| `messages/en.json:190`, `messages/vi.json:190` (`rooms.validation.release_occupied`) | The single-purpose sentence that describes only the `occupied` target — too narrow for the new refusal | `REL-12` asserts the chosen sentence names both accepted targets in both locales with no code, status, or driver text; the key's retirement or reuse is the implementation's call (LLD 41.2) |
| `app/src/views/StayView.vue:1381-1384` (`releaseRoomTo`), `:1415`, `:1738`, `:1786`, `:2100-2101` | The one desk helper is typed `'vacant-inspected' \| 'vacant-dirty'` (`:1383`) and sends only the pair: the two check-in compensations (`:1415`, `:1738`), the move's old-room release (`:1786`), and the check-out release (`:2101`) | Unchanged; `REL-10` re-runs the desk guards and asserts no third target is sent |
| `app/src/views/StayView.test.ts:1190-1198`, `:2779-2783`, `:3010-3066`, `:3180` | The #588 check-out sends `{roomNumber, toState: "vacant-dirty", actor}` exactly once (`:1190-1198`); `RR2` sends `vacant-inspected` for the compensation (`:2779-2783`); `RR6`/`RR9` keep the failed and successful compensation cases | Stay green; they are the desk half of `REL-9`/`REL-10` |
| `script/e2e-desk-loop.sh:358`, `:464`; `script/e2e-perf-check.sh:247`, `:258` | The deployment-shaped callers omit `toState` and take the `vacant-dirty` default | Stay green; `REL-10` asserts the calls still carry no target, and the timed run is the `e2e-single-host` job's `script/e2e-perf-check.sh` invocation (`.github/workflows/ci.yml:536`) |

Pass evidence for the covered-by-re-run rows at this head: the code tree
is `origin/master` `2dbb13f`, where every check-run reports `success`
(`node-build (rooms)`, `app-build`, `contract-check`, `ci`, `doc-pins`,
`e2e-single-host`, `browser-e2e`, `migrate-check`, and the other module
matrices; read with
`gh api repos/MingChen1501/hotel-mgmt/commits/2dbb13f/check-runs`). This
stack is docs-and-contract only — its diff against `origin/master` is
empty under `services/rooms/` and `app/` — so every code pin above is
byte-identical to that green base. The architecture half narrows the
contract enum only, which `script/contract-check.sh` re-validates. The
implementation PR supplies the `node-build (rooms)` evidence for the new
guards; the Postgres halves are not a CI job, which is why `REL-E1`
records that run explicitly.

## 3. Guard registry REL-1–REL-14, the residual-risk record REL-R1, and the evidence rule REL-E1

Naming: the registry uses `REL-*` and the owner cases use `REL-C*`
(section 6), so neither collides with the `FR-REL-*` / `AC-REL-*`
requirement and condition ids, with `BR-72`, or with a sibling slice's
registry — `RR*` already names the #647 arrival-reassignment guards in
`arrival-reassign-test-traceability.md`, and `S*`/`DR*` name the #601 /
#646 sets. The requirements handoff (42.5) already names `REL-1`,
`REL-2`, and `REL-3`; those three are carried as the same ids here, and
`REL-4`–`REL-14` are added for the Postgres accepted half, the store
parity, the precedence, the compensating-release boundary, the caller
re-run, the contract and catalogue gates, the no-move/configuration/
migration gate, and the NFR re-run. All guards are **created or
extended by the #773 implementation PR**; they are listed `pending` in
section 4 until `qa-lead` re-pins them with `file:line` at the merged
head.

Every refusal is asserted on the payload, not only on the status: a 400
must carry `code: "VALIDATION_FAILED"`, `details.toState` carrying the
received value, the one plain sentence naming both accepted targets
with no envelope code, status number, driver, SQL, host, or stack text,
and a fresh `traceId`. The in-memory halves run with `TEST_PG_URL`
unset and must never skip; the Postgres halves run on a scratch
database through `TEST_PG_URL` and are skipped without it, and no key
claim of this slice rests on a skipped half alone.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `REL-1` | The in-memory route accepts exactly the two release targets and keeps the absent default, without defaulting a present value. On an occupied room: an explicit `toState: "vacant-dirty"` answers `200` with the receipt `{roomNumber, oldState: "occupied", newState: "vacant-dirty"}`; an explicit `toState: "vacant-inspected"` answers `200` with `newState: "vacant-inspected"`; a request with no `toState` answers `200` with `newState: "vacant-dirty"`. The guard fails if a present `vacant-inspected` is defaulted to `vacant-dirty`, if the receipt gains or loses a field, or if the absent default stops working. Covered by re-run today only for the absent default (`services/rooms/src/server.test.ts:741-750`) and the session-actor release (`:143-161`); the explicit pair is pending | `services/rooms/src/server.test.ts` (extend, HTTP route through `withServer`) |
| `REL-2` | An accepted release records exactly one step and one event. For each accepted case in `REL-1`: the room reads the target (`findRoom`), `historyForRoomId(room.id)` gains exactly one `occupied -> <target>` row attributed to the session token, and the in-memory outbox gains exactly one `room.state-changed` event whose payload carries `roomNumber`, `newState`, and the session actor (the `requestActor` annotation stays as SEC10 pins it). Nothing else changes | `services/rooms/src/server.test.ts` (extend, `roomsInternals` before/after) |
| `REL-3` | Every present target outside the pair is refused `VALIDATION_FAILED` on the in-memory route, never accepted and never defaulted. On an occupied room, each of `vacant-clean`, `out-of-order`, `occupied`, `"Vacant-Dirty"` (a case variant), `"clean"` (another string), `42`, `true`, `["vacant-dirty"]`, `{"state": "vacant-dirty"}`, and `null` answers exactly one `400` with `code: "VALIDATION_FAILED"`, `details.toState` deep-equal to the received value (including `null`), and the catalogue sentence naming `vacant-dirty` and `vacant-inspected` — never `200`, never `STATE_ILLEGAL` (the room is occupied), and never a defaulted `vacant-dirty` | `services/rooms/src/server.test.ts` (extend, one table-driven case) |
| `REL-4` | A refused target writes nothing in memory. For every row of `REL-3`: `findRoom` still reads `occupied`, `historyForRoomId` returns the same rows as before the loop, and `roomsInternals(store).outbox.length` is unchanged, so no `room.state-changed` event exists for the request. The guard uses the CAP4 before/after shape (`services/rooms/src/server.test.ts:1323-1367`) and would fail if `room.state = toState` moved ahead of the refusal | `services/rooms/src/server.test.ts` (extend, same case as `REL-3`) |
| `REL-5` | The Postgres store accepts exactly the two targets and keeps the absent default, with the same write. Against `TEST_PG_URL`: an explicit `vacant-dirty`, an explicit `vacant-inspected` (the #647 compensating target, extending `services/rooms/src/pgstore.test.ts:187`), and an absent target each answer the receipt on an occupied room; the `rooms.rooms` row carries the target; exactly one `rooms.room_status_history` row exists for the release and one `rooms.outbox` row of type `state-changed` carries it, with the session actor. A present `vacant-inspected` must not be stored as `vacant-dirty`. Skips without `TEST_PG_URL` | `services/rooms/src/pgstore.test.ts` (extend) |
| `REL-6` | A refused target writes nothing in Postgres. For every value of `REL-3` (the same table, store level): `releaseRoom` rejects with an `HttpError` of code `VALIDATION_FAILED` carrying `details.toState`, and before/after counts of `rooms.rooms` (state still `occupied`), `rooms.room_status_history`, and `rooms.outbox` are identical — the transaction rolls back with no row, no history entry, and no event. Skips without `TEST_PG_URL` | `services/rooms/src/pgstore.test.ts` (extend, same table parameterised over both stores) |
| `REL-7` | The room's own answers keep precedence in both stores. An unknown room with an accepted target, `vacant-clean`, `out-of-order`, or `null` answers `NOT_FOUND` (404) with `details.roomNumber`; a room that is not `occupied` (a `vacant-inspected` room) with `vacant-clean`, `out-of-order`, `occupied`, or `null` answers `STATE_ILLEGAL` (422) with today's sentence and `details {roomNumber, state}`, never `VALIDATION_FAILED`. The in-memory half drives the HTTP route, the Postgres half the store; the guard closes today's difference where Postgres resolves the target before reading the room (`services/rooms/src/pgstore.ts:522-543`) | `services/rooms/src/server.test.ts` and `services/rooms/src/pgstore.test.ts` (extend) |
| `REL-8` | The two stores answer the same request the same way. For one occupied room, one free room, and one unknown room, the in-memory and Postgres answers agree field for field on `status`/`code`, `message` (the same catalogue sentence, since both call the one shared check), and `details` for an accepted target, each refused value, and the precedence cases; the accepted receipts also agree on `{roomNumber, oldState, newState}`. Skips the Postgres half without `TEST_PG_URL`, and then `REL-6`/`REL-7` still carry the in-memory half | `services/rooms/src/pgstore.test.ts` (extend, parity comparator over the shared tables) |
| `REL-9` | The #647 compensating release still works and the transition table is not the guard. An occupied room released with an explicit `vacant-inspected` succeeds in both stores (the `REL-1`/`REL-5` case re-asserted as the #647 path), and the guard imports `ALLOWED_TRANSITIONS` and asserts its `occupied` row is exactly `["vacant-dirty"]` (`services/rooms/src/store.ts:49`) — so a future routing of `releaseRoom` through the table fails the guard — while the desk's compensating calls keep sending `vacant-inspected` (`REL-10`) | `services/rooms/src/server.test.ts` (extend; the constant assertion is new) |
| `REL-10` | The callers are unchanged. The desk helper keeps the two-value union and sends only `vacant-dirty` or `vacant-inspected` at its four sites (`app/src/views/StayView.vue:1383`, `:1415`, `:1738`, `:1786`, `:2101`); the #588 check-out guard still sees exactly one release with `{roomNumber, toState: "vacant-dirty", actor}` (`app/src/views/StayView.test.ts:1190-1198`); the #647 cases still see `vacant-inspected` (`:2779-2783`, `RR2`; `:3010-3066`, `RR6`; `:3180`, `RR9`); and the e2e scripts still omit `toState` (`script/e2e-desk-loop.sh:358`, `:464`; `script/e2e-perf-check.sh:247`, `:258`). Covered by re-run plus a diff assertion: no desk file changes and no third target appears | `app/src/views/StayView.test.ts` re-run; diff gate |
| `REL-11` | The contract matches the pair and nothing else moves. `contracts/http/ReleaseRoom.json` keeps `toState` a string with enum exactly `["vacant-dirty", "vacant-inspected"]` and `"default": "vacant-dirty"` (`:16`), the `VALIDATION_FAILED` row names a present target outside the pair and the `STATE_ILLEGAL` row records the not-occupied-before-target order (`:30-33`), no error entry, code, status, or response field is added or removed, the happy-path fixture parses and is unchanged, and `script/contract-check.sh` is green | `script/contract-check.sh` + contract diff review; no per-row LC cell (matrix convention) |
| `REL-12` | The refusal sentence is a plain catalogue sentence in both locales. The sentence the refusal returns names both `vacant-dirty` and `vacant-inspected`, carries no envelope code, status number, driver, SQL, host, or stack text, resolves through `msg(...)` in EN and VI at key and parameter parity, and the desk surfaces no new key; a retired `rooms.validation.release_occupied` may not leave a dangling call site, and a reused key must carry the new wording in both locales. `script/catalogue-coverage-check.sh` is green | `services/rooms/src/server.test.ts` (`REL-3` reads the sentence) + `script/catalogue-coverage-check.sh` |
| `REL-13` | No movement beyond the one check, and no configuration or migration. The diff adds only: the shared `releaseTarget` check (beside `requireCapacity`), its two call sites, the refusal's catalogue sentence, and the guards. Unchanged: `ALLOWED_TRANSITIONS`, `ROOM_STATES`, `UpdateRoomState`, `assignRoom`, the accepted paths' body/history/event, the desk, the contract's response and status set, `services/rooms/migrations/`, any `CHECK`/column/index, any backfill or repair, any environment variable, `deploy/` file, compose key, or per-hotel setting; the pair is a fixed code rule (BR-72) | Diff gate; `git diff` review checklist |
| `REL-14` | The no-change NFR group re-runs green. `NFR-AUD-1` (a refusal records no history row and no event; an accepted release keeps the authenticated actor and its timestamp), `NFR-I18N-1` (`REL-12`), `NFR-CON-1`/`NFR-CON-2` (no new concurrent write path, lock, or serialisation point; a release stays one room's single state change), `NFR-PERF-1`/`NFR-PERF-2` (one in-process comparison, no extra query beyond the room read; the timed desk run and the report timings unchanged), `NFR-AVL-1` (decided on-premise), `NFR-TZ-1`, `NFR-SEC-1`/`NFR-SEC-2` (the session guard and recorded-actor rule stay), and `NFR-BND-1`..`NFR-BND-3` (no route or body bound moves). Covered by re-run of the existing guards; a new route, migration, or bound fails `REL-13` | Existing suites and gates, re-run |
| `REL-R1` | Residual-risk record, not a guard. A caller that sent `vacant-clean` or `out-of-order` now gets a 400 where it used to succeed — the intended direction, since no specified flow used either and no caller sends them; a room already released to either state stays valid and readable. The in-memory nothing-written guarantee rests on the check's position ahead of the first mutation (the store is not transactional), so the guard position is a `dev-peer-review` point; the Postgres half is guaranteed by the transaction. The stores' remaining field-order difference (room number and actor presence) is not narrowed by this change. No guard may assert a repair, backfill, or read-time re-validation | Recorded: R-27, LLD 41.6, this row |
| `REL-E1` | Evidence rule: the implementation PR records, in `docs/testing/evidence/773/README.md` (created by that PR, same capture method as the `#631`, `#633`, `#636`, `#637`, `#642`, and `#767` records), the before/after pairs (an occupied room released to `vacant-clean` and to `out-of-order` answering `200` before and `400 VALIDATION_FAILED` after, with the room state and row counts before and after), the nothing-written proof in both stores, the accepted pair and the preserved absent default, the `REL-7` precedence pair, and the `TEST_PG_URL` parity run with the command pasted; and adds the slice row to `docs/testing/test-report.md` (`test-strategy.md` section 3 exit criterion 6). Stays pending until recorded | Evidence record + `test-report.md` |

## 4. Traceability map

Each row traces to `AC-REL-1`..`AC-REL-5`, to the five FRs of
requirements section 42.3, and to `BR-72`. Status is `pending` where the
guard does not exist at this spec head; rows marked covered by re-run
rest on pins that exist and pass today (base `origin/master` `2dbb13f`,
all check-runs `success`) and must keep passing untouched. The slice
adds no MVP capability, so the 57-row MVP count stands unchanged.

| Item | Required guard type | Guard |
|---|---|---|
| `AC-REL-1` — an explicit target outside the pair is refused `VALIDATION_FAILED` with the room unchanged and nothing written in either store (traces to US-FDK-2, US-FDK-3; FR-FDK-2, FR-FDK-3, FR-RMS-1) | L1 acceptance: the refused matrix on the route and the store, the nothing-written proofs, and the store parity | **Pending** — `REL-3`, `REL-4`, `REL-6`, `REL-8`; **covered by re-run today** only for the tolerant resolution they replace (`services/rooms/src/store.ts:495-501`, `services/rooms/src/pgstore.ts:522-528`) |
| `AC-REL-2` — an absent `toState` still releases `occupied -> vacant-dirty` with the receipt, one history row, and one event (traces to US-FDK-2; FR-FDK-2) | L1 acceptance | **Pending** — `REL-1`, `REL-2`, `REL-5`; **covered by re-run today** for the receipt (`services/rooms/src/server.test.ts:741-750`) and the actor half (`:143-161`) |
| `AC-REL-3` — an explicit `vacant-dirty` and `vacant-inspected` succeed unchanged in both stores, and the #647 compensating release still works (traces to US-FDK-3; FR-FDK-2, FR-FDK-3, FR-REA-1, FR-REA-3) | L1 acceptance: the accepted pair, the write proof, and the transition-table boundary | **Pending** — `REL-1`, `REL-2`, `REL-5`, `REL-8`, `REL-9`; **covered by re-run today** for the Postgres `vacant-inspected` release (`services/rooms/src/pgstore.test.ts:187`) and the desk compensations (`app/src/views/StayView.test.ts:2779-2783`) |
| `AC-REL-4` — a room that is not `occupied` still answers `STATE_ILLEGAL` (never `VALIDATION_FAILED`) for any target, and an unknown room still answers `NOT_FOUND` (traces to US-FDK-2; FR-FDK-2, FR-RMS-1) | L1 acceptance: the precedence pair in both stores | **Pending** — `REL-7`, `REL-8`; **covered by re-run today** for each store's not-occupied refusal (`services/rooms/src/store.ts:489-494`, `services/rooms/src/pgstore.ts:538-543`) |
| `AC-REL-5` — the guards ship, the artefacts align, and the existing pins stay green with and without `TEST_PG_URL` (traces to `AC-REL-1`..`AC-REL-4`; FR-FDK-2, FR-FDK-3, FR-REA-1, FR-REA-3) | L1 acceptance + gates + evidence | **Pending** — `REL-1`–`REL-14`, `REL-E1` |
| `FR-REL-1` — exactly the two explicit targets, and an absent target still means `vacant-dirty`; a present value is never defaulted (requirements 42.3) | L1 acceptance, both stores | **Pending** — `REL-1`, `REL-3`, `REL-5`, `REL-6` |
| `FR-REL-2` — an out-of-set target is refused `VALIDATION_FAILED` with `details.toState` and writes nothing (requirements 42.3) | L1 acceptance + nothing-written proof | **Pending** — `REL-3`, `REL-4`, `REL-6`, `REL-12` |
| `FR-REL-3` — the room's own answers precede the target check and both stores agree (requirements 42.3) | L1 acceptance: precedence and parity | **Pending** — `REL-7`, `REL-8` |
| `FR-REL-4` — the check-out release and the #647 compensating release keep their behaviour; `ReleaseRoom` stays outside `ALLOWED_TRANSITIONS` (requirements 42.3) | L1 acceptance + re-run | **Pending** — `REL-9`, `REL-10`; **covered by re-run today** for the desk check-out (`app/src/views/StayView.test.ts:1190-1198`) and the compensation cases (`:2779-2783`, `:3010-3066`, `:3180`) |
| `FR-REL-5` — the aligned artefacts and the guards ship together (requirements 42.3) | Gates + evidence | **Pending** — `REL-10`–`REL-14`, `REL-E1` |
| `BR-72` — a release accepts exactly the pair, every other present target is refused with nothing written, the room's own answers keep precedence, both stores agree, and the accepted paths are unchanged; a fixed code rule (business rules section 6; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `REL-1`–`REL-14`, `REL-E1`; **covered by re-run today** for the fixed side's existing pins |
| Both stores write nothing on a refusal — the in-memory proof (`REL-4`) and the Postgres row-count proof (`REL-6`) each leave the room state, its history, and its event stream unchanged, and a refusal records no attempt, so a retry is an ordinary release | L1 acceptance + `TEST_PG_URL` parity | **Pending** — `REL-4`, `REL-6`; **covered by re-run today** for the shared CAP4 before/after shape (`services/rooms/src/server.test.ts:1323-1367`) |
| `FR-FDK-2` / `FR-FDK-3` / `FR-REA-1` / `FR-REA-3` / `FR-RMS-1` (MVP rows, unchanged) — the check-out release, the move release, the compensating release, and the room-state set keep their wording and their guards; this change constrains the operation's accepted targets rather than widening any FR | L1 re-run: the MVP guard slots in section 1, unedited | **Covered by re-run today** — the rooms-side move (`services/rooms/src/server.test.ts:718-794`), the #647 compensation pins, and the MVP rows in section 1; those rows stand unchanged and may not cite this slice as their guard |
| `AC-FDK-2` / `AC-REA-1` / `AC-REA-3` (unchanged conditions with the new pointers) — the check-out release uses one of the two accepted targets, the absent default still means `vacant-dirty`, and the compensating release stays the `vacant-inspected` target while every other target is refused | L1 re-run + the new refusal case | **Pending** — `REL-1`, `REL-3`, `REL-9`; **covered by re-run today** for the accepted halves |
| `NFR-AUD-1`, `NFR-I18N-1`, `NFR-CON-1`/`NFR-CON-2`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-TZ-1`, `NFR-SEC-1`/`NFR-SEC-2`, `NFR-BND-1`..`NFR-BND-3` (unchanged) — no route, body ceiling, timeout, lock, transaction, round trip, outside dependency, date format, actor rule, or session guard moves; the refusal writes nothing and adds no catalogue key requirement | No-change re-run | **Covered by re-run today** — the actor pins (`services/rooms/src/server.test.ts:143-161`), the paired-attempt guards, the timed desk run (`script/e2e-perf-check.sh`), and the catalogue and body-bound gates; a new route, bound, or migration fails `REL-13` |
| Contract and LC | Real delta: the enum narrows from four targets to two, the default and error entries stay, and no error code, status, response field, or envelope token is added (architect half, LLD 41.5) | **Pending gate** — `REL-11`; no per-row LC cell (the `contract-check` stage re-runs) |
| No-configuration and no-migration gate | Real delta: none. The pair is fixed code carried by no environment variable, `deploy/` file, compose file, or per-hotel setting; no migration, column, `CHECK`, backfill, index, transaction, retry loop, or stored-value rewrite is added | **Pending diff gate** — `REL-13`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-72) |
| No-desk-regression gate | Real delta: none. The release helper is already typed to the two targets and the e2e scripts already take the default, so no desk screen, control, label, state, copy, or print rule moves | **Pending gate** — `REL-10`; the pins are `app/src/views/StayView.vue:1383`, `:1415`, `:1738`, `:1786`, `:2101` |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` capability wording moves; `FR-REL-1`..`FR-REL-5` are behaviour-scoped additions outside the counted capability set (requirements 42.2, 42.3) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Residual risk `REL-R1` | A caller that sent an extra target now gets a 400; a room already in that state stays valid; the in-memory nothing-written guarantee rests on the check position (not a transaction), while Postgres rolls back; the remaining field-order difference is out of scope | **Recorded, not guarded** — R-27, LLD 41.6, and this row; no guard may assert a repair or backfill |
| Evidence cross-reference (`REL-E1`) | The before/after pairs, the both-stores nothing-written proof, the accepted pair and default, the precedence pair, and the `TEST_PG_URL` parity run | **Pending** — `docs/testing/evidence/773/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #773): 21 rows mapped to `AC-REL-1`..`AC-REL-5`,
`FR-REL-1`..`FR-REL-5`, `BR-72`, the both-stores nothing-written row,
the unchanged MVP rows, the unchanged conditions
`AC-FDK-2`/`AC-REA-1`/`AC-REA-3`, the no-change NFR group, the
contract/LC gate, the configuration/migration gate, the
no-desk-regression gate, the MVP no-change gate, the residual-risk
record `REL-R1`, and `REL-E1`. Nine rows carry a covered-by-re-run half
(the unchanged MVP row, the unchanged conditions row, the NFR row, and
the accepted/refusal halves inside `AC-REL-1`..`AC-REL-4`,
`FR-REL-4`, `BR-72`, and the both-stores row); the remaining twelve are
**pending** the implementation PR. The slice is **not complete** at
this spec head; it completes when the implementation PR merges with
`REL-1`–`REL-14` green, the Postgres halves recorded on a scratch
database, `REL-E1` recorded, and `qa-lead` re-pins the rows at the
merged head. The MVP Coverage line below stands unchanged at 57/57.

## 5. Test plan

### Levels and suites

| Level / suite | Guards | Command | Where |
|---|---|---|---|
| L1 in-memory route, Rooms | `REL-1`–`REL-4`, `REL-7` (memory half), `REL-9`, `REL-12` | `cd services/rooms && npm run build && npm run lint && npm test` | CI `node-build (rooms)`; `TEST_PG_URL` unset, the in-memory guards must not skip |
| L1 Postgres parity, Rooms | `REL-5`–`REL-8` (Postgres half), `REL-9` | `cd services/rooms && TEST_PG_URL=postgres://… npm test` | Scratch database locally; not a CI job (the matrix sets no `TEST_PG_URL`) |
| L1 desk regression, app | `REL-10` | `cd app && npm run build && npm run lint && npm test` | CI `app-build` |
| LC contract | `REL-11` | `script/contract-check.sh` | CI `contract-check` |
| Catalogue | `REL-12` | `script/catalogue-coverage-check.sh` | CI `ci` |
| Docs and harness | this spec | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `script/doc-pin-check.sh` | CI `doc-pins` / `ci` |
| Deployment-shaped e2e | `REL-10` | `script/e2e-perf-check.sh --base-url http://127.0.0.1`; the desk loop `script/e2e-desk-loop.sh` | CI `e2e-single-host` for the timed run; the desk loop on the lab |

### Execution order

1. In-memory guards first (`REL-1`–`REL-4`, `REL-9`, `REL-12`): they are
   hermetic and prove the refusal, the nothing-written half, and the
   accepted pair without a database.
2. The Postgres halves (`REL-5`–`REL-8`) on a scratch database, in the
   same run as the existing `pgstore.test.ts` suites (a fresh `wipe`
   per case, `services/rooms/src/pgstore.test.ts:14-20`).
3. The parity comparator (`REL-8`) last among the store guards: it
   reads the same request tables as `REL-3`/`REL-6` and compares the
   two stores' answers.
4. The untouched-suite re-runs (`REL-9`, `REL-10`, `REL-14`) and the
   repo gates (`REL-11`–`REL-13`).

### Entry criteria

- The implementation PR carries the shared check and both call sites,
  the refusal sentence in EN and VI, and the guards above.
- The spec stack is landed: acceptance-criteria section 34,
  requirements section 42, `BR-72`, LLD section 41, the Rooms design
  section 12, and the narrowed contract enum.

### Exit criteria

- `cd services/rooms && npm test` is green with `TEST_PG_URL` unset and
  with it set on a scratch database, and no new guard skips.
- `REL-1`–`REL-9` exist and fail if the refusal is removed, if a
  present value is defaulted, if the check moves ahead of the room
  answers, or if `releaseRoom` is routed through `ALLOWED_TRANSITIONS`.
- The existing pins of section 2 pass byte-identically, the contract and
  catalogue gates are green, and the diff shows no movement from
  `REL-13`.
- `REL-E1` is recorded in `docs/testing/evidence/773/README.md` and the
  `test-report.md` slice row exists.

### Negative controls

- Restore the tolerant resolution (`services/rooms/src/store.ts:495-501`)
  and `REL-3`/`REL-4` must fail with a `200` and a defaulted
  `vacant-dirty`; restore the Postgres call before the transaction and
  `REL-7` must fail on the free-room case.
- Change the accepted set to a single target and `REL-1`/`REL-5` must
  fail on the explicit `vacant-inspected` receipt, which is the #647
  compensating release.
- Move `room.state = toState` above the refusal and `REL-4` must fail on
  the history/outbox count.
- Route `releaseRoom` through `ALLOWED_TRANSITIONS` and `REL-9` must
  fail on the explicit `vacant-inspected` release (the table's
  `occupied` row admits only `vacant-dirty`).

## 6. Owner verification cases (REL-C1..REL-C8)

Owner-facing cases, verifiable from this document and the PR diff
without reading code. `REL` is the domain code for this family; the
JSON bodies are the operation's request shape
(`contracts/http/ReleaseRoom.json`).

| Case | Precondition | Request | Expected |
|---|---|---|---|
| `REL-C1` | Room 101 is `occupied` | `ReleaseRoom {"roomNumber": "101", "toState": "vacant-dirty", "actor": "front-desk"}` | `200`; body `{"roomNumber": "101", "oldState": "occupied", "newState": "vacant-dirty"}`; one history row and one `room.state-changed` event |
| `REL-C2` | Room 101 is `occupied` | `ReleaseRoom {"roomNumber": "101", "toState": "vacant-inspected", "actor": "front-desk"}` | `200`; body `newState: "vacant-inspected"` (the #647 compensating release); one history row and one event |
| `REL-C3` | Room 101 is `occupied` | `ReleaseRoom {"roomNumber": "101", "actor": "front-desk"}` | `200`; body `newState: "vacant-dirty"` — the preserved default |
| `REL-C4` | Room 101 is `occupied` | `ReleaseRoom` with `"toState": "vacant-clean"`, then with `"toState": "out-of-order"` | Each answers `400` `VALIDATION_FAILED` with `details.toState` the sent value and the sentence naming both accepted targets; room 101 still reads `occupied`; no new history row or event in either store |
| `REL-C5` | Room 101 is `occupied` | `ReleaseRoom` with `"toState": null`, `42`, `true`, `["vacant-dirty"]`, `{"state": "vacant-dirty"}`, and `"Vacant-Dirty"` | Each answers `400` `VALIDATION_FAILED` with `details.toState` the received value; never a defaulted `vacant-dirty`, never `STATE_ILLEGAL` |
| `REL-C6` | Room 102 is `vacant-inspected`; room 999 does not exist | `ReleaseRoom` for 102 and for 999 with `"toState": "vacant-clean"` (then `null`) | Room 102 answers `422` `STATE_ILLEGAL` with `details {roomNumber, state}`; room 999 answers `404` `NOT_FOUND` with `details.roomNumber`; neither answer is `VALIDATION_FAILED`, and nothing is written |
| `REL-C7` | The same requests run against the Postgres store on a scratch database | Repeat `REL-C1`..`REL-C6` | The code, status, sentence, and `details` match the in-memory answer field for field, and the row counts of `rooms.rooms`, `rooms.room_status_history`, and `rooms.outbox` prove the accepted and nothing-written halves |
| `REL-C8` | The change is implemented | Read the diff and the gates | `contracts/http/ReleaseRoom.json` lists exactly the two targets with the `vacant-dirty` default; LLD section 41 and the API-spec section 2 note state the pair; the state-machine section 2.1 pins cite the current `releaseRoom`; `script/contract-check.sh` and `script/catalogue-coverage-check.sh` are green; the desk check-out and compensation guards pass unchanged |

## 7. Evidence rule REL-E1

The implementation PR records, in `docs/testing/evidence/773/README.md`:

1. **Before/after pair.** On the pre-change build, an occupied room
   released with `toState: "vacant-clean"` and with
   `toState: "out-of-order"` answers `200` and writes the room, a
   history row, and a `room.state-changed` event. On the change, the
   same requests answer `400 VALIDATION_FAILED` with
   `details.toState`, the room still `occupied`, and the history and
   outbox counts unchanged.
2. **The accepted pair and the default.** `vacant-dirty`,
   `vacant-inspected`, and an absent `toState` answer the receipt, the
   history row, and the event on both stores; the `vacant-inspected`
   run is the #647 compensating release.
3. **The precedence pair.** A free room sent an out-of-set target
   answers `STATE_ILLEGAL` (never `VALIDATION_FAILED`) and an unknown
   room answers `NOT_FOUND`, on both stores.
4. **The parity run.** The `TEST_PG_URL` command pasted, with the
   scratch-database name and the row-count evidence, because no CI job
   sets `TEST_PG_URL`.
5. **The suite row.** A slice row in `docs/testing/test-report.md`
   recording the commands, the green runs, and the evidence file
   (`test-strategy.md` section 3 exit criterion 6).

The evidence file uses the same capture method as
`docs/testing/evidence/767/README.md`: every request through the public
`RoomInventoryService` contract with a bearer token, count queries
issued as the database owner, and no claim resting on a skipped half.

## 8. Slice status and the re-pin rule

Status: **spec complete, guards pending.** The acceptance conditions,
the requirements, `BR-72`, the architecture delta, the narrowed
contract, and this traceability map are ready for the `spec-reviewer`
gate. The implementation PR for #773 creates `REL-1`–`REL-14`, records
`REL-E1`, and keeps every pin of section 2 green; `qa-lead` then
re-pins each pending row with its `file:line` at the merged head and
flips the slice to complete. Until then no row reads "complete", and
the MVP Coverage line in `traceability-matrix.md` stays at 57/57.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1328
