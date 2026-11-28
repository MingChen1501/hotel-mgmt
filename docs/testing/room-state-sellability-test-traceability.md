# Room state sellability test traceability (Refs #636)

Status: active. Testing spec for the T2 room-state sellability change
([issue #636](https://github.com/MingChen1501/hotel-mgmt/issues/636),
audit finding M1), owned by `qa-lead`. It maps the change's
done-conditions — `AC-SEL-1`..`AC-SEL-4`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 29](../product/acceptance-criteria.md)
— the behaviour-scoped requirements `FR-SEL-1`..`FR-SEL-4`, owned by
`business-analyst` in
`docs/requirements/mvp-requirements.md` [section 37](../requirements/mvp-requirements.md),
and the business rule `BR-67` in
`docs/requirements/business-rules.md` to their guards: the pins that
exist on disk at this spec head, the guard registry `SL1`-`SL12`, and
the evidence rule `SL-E1`.

Written before the implementation PR. Every guard in the registry
except the desk-green row is a **named, missing obligation** at this
head: no row marks a guard complete before it exists and passes, and
the slice is not complete until the implementation PR merges and
`qa-lead` re-pins every row at the merged head (the `#588 -> #599`,
`#601`, and `#631` pattern). Section 2 cites what is on disk today and
what it proves; section 4 says which rows the implementation PR
creates and which pins it rewrites (never deletes).

Companion specs: LLD [section 36](../architecture/lld.md) (where the
set is computed in each store, the single-room reply, the subtract-once
rule, the per-flow diagram, and the verification plan this plan aligns
with), HLD section 28, product `AC-SEL-1`..`AC-SEL-4` with D-41
([decision log](../project/decision-log.md)) and R-22
([risk register](../project/risk-register.md)), requirements section 37
with its own `qa-lead` handoff (`S1`..`S9`, superseded here by `SL*`
because `S*` is taken by the #601 checkout-settlement registry), and
`BR-67`. This spec implements no code, changes no guard, adds no
catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2 (behaviour change; recorded by `product-owner` in the issue
  and in acceptance-criteria section 29, confirmed in LLD section 36):
  the arithmetic behind one existing read changes, so its
  caller-visible answer moves — `sellableCount` in the aggregate reply
  and in the single-room reply — while the operation, its request and
  response fields, its statuses, its refusal vocabulary, every desk
  layout, token, component, state, and copy, and every print rule stay
  as they are. No new subsystem, dependency edge, data model,
  lifecycle state, or code token appears, so no T3 escalation and no
  ADR.
- The change is one predicate in two places: `checkSellability` in the
  in-memory store and its Postgres twin. Nothing else in Rooms moves.
  `services/rooms/src/store.ts:334-386` and
  `services/rooms/src/pgstore.ts:341-411` are the whole surface; one
  route serves both branches (`services/rooms/src/server.ts:193-196`).
- The non-sellable state list is **explicit and exactly two names**:
  `out-of-order` and `occupied`. Every vacant state (`vacant-dirty`,
  `vacant-clean`, `vacant-inspected`) stays sellable. The test plan
  must therefore carry a positive control on each vacant state
  (`SL4`), not only the two negative cases — an implementation that
  inverted the list (or wrote "any state but the sellable ones") must
  fail this slice.
- The desk is unchanged. The Book confirm already re-reads the
  aggregate count and refuses below one with `desk.book.refused_soldout`
  (`app/src/views/BookView.vue:977-1011` on `origin/master` `b6ff53a`,
  `:1110-1117` for the `CONFLICT` mapping; see the pin note in
  section 2), and both block-note readers
  (`app/src/views/RoomsView.vue:544-593`,
  `app/src/views/DeskView.vue:1051-1100`) render a note only from a
  `STATE_ILLEGAL` block refusal. A desk edit in the implementation PR
  is drift, not scope, and fails `SL10`.
- No new NFR and no new catalogue key. No sentence is added or
  changed: the single-room non-sellable answer is a 200 carrying
  today's six fields with `sellableCount: 0`, so the desk refuses with
  the existing sold-out sentence, and the block refusal reuses
  `rooms.state.room_blocked`. `script/catalogue-coverage-check.sh`
  must stay green (`SL11`).
- The merged #631 reservation ceiling is **neither raised nor
  lowered**: Reservations still derives `totalCount - len(blockedRooms)`
  and reads neither `sellableCount` nor room state (ADR-0006 D2,
  `services/reservations/internal/availability/client.go:45-56`), so an
  `out-of-order` room stays inside that ceiling until the separate
  Reservations availability decision owns it. `SL9` is a diff gate,
  not a behaviour test: no Reservations client, fixture, or guard may
  be edited by the implementation PR.
- No MVP row moves. `FR-RTE-2` already promised a count that excludes
  occupied, blocked, and already-reserved rooms, so this change makes
  the read keep that promise; `FR-RMS-1` and `FR-RMS-3` keep their
  wording, and `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`,
  `NFR-I18N-1`, `NFR-BND-1`..`NFR-BND-3`, `NFR-AUD-1`, and `NFR-TZ-1`
  hold as written. The 57-row MVP coverage count in
  [traceability-matrix.md](traceability-matrix.md) stands unchanged and
  no MVP row may cite this slice as its guard. The slice rows live in
  traceability-matrix section 29.
- Guards are extended, never deleted. The existing sellability and
  block pins in section 2 keep their assertions; an all-vacant fixture
  still answers `1`, so the implementation PR adds the state cases
  beside the existing ones rather than rewriting their expectations.
- No schema, table, column, migration, backfill, stored value, event,
  or data-dictionary entry moves: no migration is added under
  `services/rooms/migrations/` (`001_boot.sql`, `002_schema.sql` today),
  and no room row is rewritten by the read. `SL11` diff-gates this.
- The finding itself is the before-state: an `out-of-order` room and an
  `occupied` room are each advertised as one sellable unit today,
  because no branch of `checkSellability` reads `room.state`. `SL-E1`
  records the pair.

## 2. Pins on disk at this spec head

The pins below exist at this head and prove what the "unchanged" and
"covered by re-run" rows rest on. They were re-read for this spec; none
is promised, none is a placeholder. Where a row names one of `SL1`-`SL12`
the guard itself is listed in section 3 (it does not exist yet).

**Pin note on `BookView.vue`.** The Book pins are read on
`origin/master` at `b6ff53a` — the tree this stack merges into, where
`#759` already rewired the confirm's price-basis path. On that tree the
confirm's sellability re-read and its zero-count refusal span
`:977-1011` (the read at `:982-993`, the sold-out refusal at
`:1004-1011`) and the `CONFLICT`-to-sold-out mapping is
`:1110-1117`. The spec branches were then cascaded onto the same master
commit, so the stack now carries `#759` as well and these are the only
offsets in play: the pre-`#759` numbering this note used to record
(`:912-947` with the refusal at `:940-947`, and `:1038-1045`) no longer
exists in any branch of the stack. The sibling spec PRs #756 and #757
were retargeted to the same pins, so every document in the set cites one
numbering.

| Pin | What it proves today |
|---|---|
| `services/rooms/src/store.ts:334-386` | `checkSellability` at large: the reversed-range refusal (`:345-347`), the single-room branch (`:348-368`, reply `:361-368` with `sellableCount: 1` at `:366`), and the aggregate branch (`:370-385`, `totalCount` `:382`, `sellableCount: ofType.length - blockedRooms.length` `:383`). No branch reads `room.state`: today's defect, at the line a state guard must land |
| `services/rooms/src/store.ts:17-30`, `:34-40` | The five-name state vocabulary and the fixed housekeeping transition table — the no-change side of `FR-SEL-3` |
| `services/rooms/src/pgstore.ts:341-411` | The Postgres twin: single room (`:355-380`, `:378` answering `sellableCount: 1`), the block refusal (`:364-372`), the aggregate count query (`:382-392`, a `count(*) FILTER (WHERE NOT EXISTS …)` that never names `r.state`), the `blockedRooms` query (`:393-402`), and the reply (`:403-410`) |
| `services/rooms/src/server.ts:193-196` | One route serves both branches: `POST /v1/rooms/CheckRoomTypeSellability` answers `store.checkSellability(body)` with a 200, so the reply shape is the branch's, not the route's |
| `services/rooms/src/server.test.ts:268-303` | The aggregate happy path: one created room (`vacant-inspected`) answers `totalCount: 1`, `sellableCount: 1`, `blockedRooms: []` — the all-vacant control `SL4` must keep |
| `services/rooms/src/server.test.ts:349-403` | Owner defines rooms; inventory rows and the aggregate availability answer agree (`:387-399` the same reply shape) |
| `services/rooms/src/server.test.ts:471-501` | The dirty -> clean -> inspected walk: every vacant state is reachable and legal, so the `SL4` fixture is realistic |
| `services/rooms/src/server.test.ts:502-527` | The single-room block refusal: 422 `STATE_ILLEGAL` with the block's reason — the precedence `SL7` extends to a block-covered `out-of-order` room |
| `services/rooms/src/server.test.ts:528-554` | Paired simultaneous assignments leave exactly one winner and one `CONFLICT`; the winner's room is `occupied` at that point, so the `SL2` fixture has a real producer |
| `services/rooms/src/server.test.ts:645-692` | A block subtracts one room from the aggregate (`sellableCount: 0` at `:666`, `blockedRooms: ["101"]` at `:665`) and a release returns it to sale (`:682-689`) — the exact arithmetic `SL1`-`SL3` must keep for blocks |
| `services/rooms/src/server.test.ts:693-717` | Releasing a range with no covering block refuses `STATE_ILLEGAL` (unknown room `NOT_FOUND`): the block-effect control beside `SL8` |
| `services/rooms/src/pgstore.test.ts:24-60` | The Postgres aggregate answers `sellableCount: 1` (`:35`) for a `vacant-inspected` room — the parity fixture's starting point. Skipped unless `TEST_PG_URL` is set (`:13`, `:24`) |
| `services/rooms/src/pgstore.test.ts:59-111` | The Postgres block subtract/release pair (`:78` zero, `:92` one) and the no-block release refusal (`:94-103`). Same skip rule |
| `app/src/views/BookView.vue:977-1011` (`origin/master` `b6ff53a`; the stack carries `#759`, so the same range) | The confirm re-reads the aggregate sellability for the quoted type and dates and refuses below one with `desk.book.refused_soldout` before it calls `CreateReservation` — the desk path `AC-SEL-2` relies on, needing no edit |
| `app/src/views/BookView.vue:1110-1117` (`origin/master` `b6ff53a`; the stack carries `#759`, so the same range) | A `CONFLICT` from `CreateReservation` maps to the same sold-out sentence — the second refusal path, unchanged |
| `app/src/views/BookView.test.ts:626-987` | The confirm sends the freshly read count as `sellableUnits` (the read is asserted at `:633-643`, the value at `:985`): the wiring `SL10` re-runs |
| `app/src/views/BookView.test.ts:989-1030` | A zero aggregate count refuses the booking with the sold-out string and never calls `CreateReservation` — the guard that turns `sellableCount: 0` into "not sold" with no desk change |
| `app/src/views/BookView.test.ts:1163-1189` | A `CONFLICT` maps to the same sold-out string (`SL10`'s second half) |
| `app/src/views/RoomsView.vue:544-593`, `app/src/views/RoomsView.test.ts:232-265`, `:526` | The block note reads only a `STATE_ILLEGAL` refusal carrying reason and dates, and the read always sends `roomType`, never `roomTypeId` — a state-aware 200 leaves both untouched |
| `app/src/views/DeskView.vue:1051-1100`, `app/src/views/DeskView.test.ts:291-340`, `:341-360` | The second block-note reader (the dashboard cards) and its read: same rule, same no-change obligation |
| `app/e2e/book.spec.ts:102-119` | The browser flow: a second overlapping confirm on a one-room type is refused with "No rooms of this type are free" — the served-SPA half of the desk refusal |
| `services/reservations/internal/availability/client.go:45-56`, `services/reservations/internal/availability/client_test.go:47` | The #631 ceiling is `totalCount - len(blockedRooms)` and the derived `sellableCount` is explicitly not consumed (ADR-0006 D2) — `SL9`'s "nothing moved" side |
| `contracts/http/CheckRoomTypeSellability.json` | The reply shape and the `sellableCount` description line; the upstream change is prose only (LLD 36.6) |
| `script/contract-check.sh`, `script/openapi-route-check.sh`, `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh` | The gates `SL11` re-runs |

Pass evidence for the covered-by-re-run rows at this head: the base
tree is green in CI on `origin/master` `b6ff53a` — checks
`node-build (rooms)`, `app-build`, `browser-e2e`, `contract-check`,
`ci`, `e2e-single-host`, and `dom-diff` all `success` (read with
`gh api repos/MingChen1501/hotel-mgmt/commits/b6ff53a/check-runs`). The
stack head `9e9d583` is docs-only, so its PR runs `ci`,
`contract-check`, and `e2e-single-host` with the node/app jobs
path-filtered out; the code pins above are byte-identical between the
stack head and `b6ff53a` for `services/rooms/**`,
`app/src/views/RoomsView.vue`, `app/src/views/DeskView.vue`,
`app/src/views/RoomsView.test.ts`, `app/src/views/DeskView.test.ts`,
`app/e2e/book.spec.ts`, `services/reservations/internal/availability/*`,
and the `BookView.test.ts` lines cited here are identical (its
master-only addition sits after line 1469; `git diff --stat
origin/master HEAD` shows only the `BookView.vue` shift and the
`CheckRoomTypeSellability.json` prose line on the files this slice
touches).

## 3. Guard registry SL1-SL12 and the evidence rule SL-E1

Naming: the registry uses `SL*` (sellability) and the owner cases use
`RSS-*` (section 6), so neither collides with the `FR-SEL-*` /
`AC-SEL-*` ids, with the requirements handoff's `S1`..`S9`, or with the
`S1`..`S12` registry of the #601 checkout-settlement slice. All twelve
guards were missing at the spec head and are **created by the #636
implementation PR**; they are listed `pending` in section 4 until
`qa-lead` re-pins them with `file:line` at the merged head.

Every refusal and every zero-count answer is asserted on the payload,
not only on the status: a 200 must carry the exact
`totalCount`/`sellableCount`/`blockedRooms` triple, and a 422 must carry
`code`, `roomNumber`, `dateFrom`, `dateTo`, and `reason`. A case that
asserts only "the response is 200" cannot tell the state-aware count
from today's block-only one.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `SL1` | Aggregate excludes an `out-of-order` room: one type holding three rooms, two vacant and one `out-of-order`, no block — 200 with `totalCount: 3`, `sellableCount: 2`, `blockedRooms: []`; the same room after `UpdateRoomState` back to `vacant-dirty` counts again | `services/rooms/src/server.test.ts` (request level, memory store) |
| `SL2` | Aggregate excludes an `occupied` room: an `AssignRoom`-driven occupied room plus one vacant room in the type — `totalCount: 2`, `sellableCount: 1`, `blockedRooms: []`; releasing the room to `vacant-dirty` restores `2`. The occupancy is produced through the public assign path, never by poking a private field | `services/rooms/src/server.test.ts` |
| `SL3` | Subtract once, never twice: an `out-of-order` room that a block also covers — `sellableCount: N - 1` (never `N - 2`), `blockedRooms` names that room exactly once and in the store's order, and a type whose every room is non-sellable answers `0`, never negative | `services/rooms/src/server.test.ts` |
| `SL4` | Vacant-state positive control: one room each in `vacant-dirty`, `vacant-clean`, and `vacant-inspected` — each counts as sellable in the aggregate and each answers `sellableCount: 1` on the single-room read, so the explicit list is not "vacant-inspected only" and not "any state but the sellable ones". A type with no rooms answers `0`/`0` | `services/rooms/src/server.test.ts` |
| `SL5` | Both stores agree: the same recorded-state fixture — one `out-of-order`, one `occupied`, one block-covered (and also `out-of-order`), two vacant — through the in-memory store and the Postgres store answers identical `totalCount`, `sellableCount`, and `blockedRooms`. The Postgres half is skipped unless `TEST_PG_URL` is set (`services/rooms/src/pgstore.test.ts:13`), so the parity run is recorded in the `postgres-parity (rooms)` CI job by `SL-E1`; the memory half alone is not evidence of parity | `services/rooms/src/server.test.ts` and `services/rooms/src/pgstore.test.ts` |
| `SL6` | Single-room non-sellable answer: a block-free `out-of-order` room and a block-free `occupied` room each answer 200 with `totalCount: 1`, `sellableCount: 0`, `blockedRooms: []` and never claim availability; the same read for a vacant room still answers `1`. The request level asserts the exact body, so a refusal (any 4xx) fails the case as well as a `sellableCount: 1` | `services/rooms/src/server.test.ts`; the Postgres twin rides `SL5`'s fixture |
| `SL7` | Block refusal keeps priority: an `out-of-order` room that a block also covers, single-room read — 422 `STATE_ILLEGAL` naming the room and carrying the block's `dateFrom`, `dateTo`, and `reason`, never a 200 with `sellableCount: 0`, in both stores. The implementation must not hoist the state test above the block test | `services/rooms/src/server.test.ts` (memory) and `services/rooms/src/pgstore.test.ts` (Postgres) |
| `SL8` | Release returns a room to sale only when its state is sellable: block an `out-of-order` room, release the block — 200, the room leaves `blockedRooms`, but `sellableCount` stays `0` until `UpdateRoomState` makes it vacant, and then it counts. `blockedRooms` membership and order, the `BlockRoom`/`ReleaseBlock` answers, and the stored block row are unchanged by state | `services/rooms/src/server.test.ts` |
| `SL9` | The #631 ceiling is neither raised nor lowered: no Reservations file, client, fixture, or guard is edited; the client still derives `totalCount - len(blockedRooms)` and never reads `sellableCount` or room state (`services/reservations/internal/availability/client.go:45-56`), and its suite plus `contract-check` stay green. A diff touching `services/reservations/**` fails the slice | diff gate over `git diff --name-only`; re-run `cd services/reservations && go test ./...` and `script/contract-check.sh` |
| `SL10` | Desk green, unchanged: every desk pin in section 2 passes with **no desk edit** — the Book confirm still re-reads the count and refuses a zero one with `desk.book.refused_soldout`, the `CONFLICT` path still maps to the same sentence, and both block-note readers still render a note only from a `STATE_ILLEGAL` block refusal. The obligation is "unchanged", not "new" | `app/src/views/BookView.test.ts:626-987`, `:989-1030`, `:1163-1189`, `app/src/views/RoomsView.test.ts:232-265`, `:526`, `app/src/views/DeskView.test.ts:291-340`, `:341-360`, `app/e2e/book.spec.ts:102-119` |
| `SL11` | Nothing else moves: the `CheckRoomTypeSellability` operation, route, request/response properties, required lists, statuses, and error list are unchanged with only the `sellableCount` description line naming room state; no catalogue key, sentence, schema, table, column, migration, backfill, or stored value is added or changed; the state vocabulary (`services/rooms/src/store.ts:17-30`) and every transition (`:34-40`) are untouched | `contracts/http/CheckRoomTypeSellability.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`, `script/catalogue-coverage-check.sh`, and a diff gate over `services/rooms/migrations/`, `messages/**`, and `contracts/errors/**` |
| `SL12` | NFR no-change re-run: the two-year perf guard, the catalogue gate, and the body-bound guards stay green with no edit — the read adds one comparison per room inside the query or loop it already runs (no round trip, no poll, no new blocking), no sentence moves, and no route or bound moves | `script/e2e-perf-check.sh` / the `perf-reporting-variant` and `ci` CI jobs, `script/catalogue-coverage-check.sh`, the per-service body-bound suites; all unchanged |
| `SL-E1` | Evidence rule: the implementation PR records the before/after pair for an aggregate read and a single-room read of an `out-of-order` room (`docs/testing/evidence/636/README.md`, created by that PR, same capture method as `docs/testing/evidence/631/README.md`), records the `TEST_PG_URL` parity run (`SL5`), and records the slice in `docs/testing/test-report.md` (`test-strategy.md` [section 3](test-strategy.md) exit criterion 6). Stays pending until all three are recorded | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row whose guard does not exist at this
head. Rows marked covered by re-run rest on pins that exist and pass
today (section 2) and must keep passing untouched. The rows stay
`pending` / `covered by re-run` until the implementation PR merges,
passes, and `qa-lead` re-pins every cell with `file:line` at the merged
head (section 8).

| Item | Required guard | Guard |
|---|---|---|
| `AC-SEL-1` — the aggregate reply counts only rooms that are both block-free and in a sellable state: an `out-of-order` and an `occupied` room are not counted for their type, the non-sellable list is exactly those two names while every vacant state stays sellable, `totalCount` keeps every room of the type, `blockedRooms` keeps today's content and order, a room both blocked and non-sellable is subtracted once and the count never goes below `0`, an empty type answers `0`/`0`, and both stores answer the same number | L1 acceptance: the two negative cases, the subtract-once case, the vacant-state control, and the store-parity case | **Pending** — `SL1`, `SL2`, `SL3`, `SL4`, `SL5`; today's block-only arithmetic is `services/rooms/src/store.ts:383` and `services/rooms/src/pgstore.ts:384-389` |
| `AC-SEL-2` — the single-room path answers `totalCount: 1`, `sellableCount: 0`, `blockedRooms: []` for a block-free non-sellable room without claiming availability, so the Book confirm refuses with its existing sold-out sentence and creates no reservation; a vacant block-free room still answers `1`; a block-covered room keeps the `STATE_ILLEGAL` block refusal with its dates and reason, which outranks the state answer | L1 acceptance: the two single-room non-sellable cases, the vacant control, the precedence case, and the desk re-run | **Pending** — `SL6`, `SL7`; desk half covered by re-run in `SL10` (`app/src/views/BookView.test.ts:989-1030`) |
| `AC-SEL-3` — block behaviour is unchanged: `blockedRooms` names exactly the block-covered rooms in their order, `BlockRoom`/`ReleaseBlock` keep their codes, statuses, details, and stored effect, a release returns a room to sale only when its state is sellable, and no state is added, removed, renamed, or re-transitioned | L1 acceptance: the release-only-when-sellable case plus the existing block guards re-run | **Pending** for `SL8`; **covered by re-run today** for the block guards themselves (`services/rooms/src/server.test.ts:502-527`, `:645-692`, `:693-717`, `services/rooms/src/pgstore.test.ts:59-111`) |
| `AC-SEL-4` — the #631 ceiling is neither raised nor lowered, the response shape and error list stand with only the `sellableCount` description line naming room state, `contract-check` stays green, no catalogue key or desk surface changes, and the implementation carries the out-of-order aggregate, occupied aggregate, single-room out-of-order and occupied, blocked-and-out-of-order single-subtraction, and vacant-state control cases in both stores with the existing sellability and block guards green | L1 acceptance + contract/LC + diff gates | **Pending** — `SL9`, `SL11`, with `SL1`-`SL8` carrying the case list; the existing pins `services/rooms/src/server.test.ts:268-303`, `:502-527`, `:645-692` must stay green |
| `FR-SEL-1` — the aggregate count excludes the non-sellable states once per room, `totalCount` stays the type, `blockedRooms` keeps its membership and order, an empty type answers `0`/`0`, and both stores agree (requirements section 37.3) | L1 acceptance | **Pending** — `SL1`, `SL2`, `SL3`, `SL4`, `SL5` |
| `FR-SEL-2` — the single-room read never claims availability for a non-sellable room, a vacant block-free room still answers `1`, and a block-covered room keeps the block refusal and its precedence | L1 acceptance | **Pending** — `SL6`, `SL7` |
| `FR-SEL-3` — block semantics and the room-state vocabulary stay exactly as they are: room state never adds a room to `blockedRooms`, the block operations keep their answers, a release returns a room to sale only when sellable, and no state or transition moves | L1 acceptance + no-change re-run | **Pending** for `SL8`; **covered by re-run today** for the vocabulary (`services/rooms/src/store.ts:17-30`, `:34-40`) and the block guards named under `AC-SEL-3` |
| `FR-SEL-4` — the merged reservation ceiling and the read contract stay as they are, with only the `sellableCount` description line naming room state and `contract-check` green | Diff gate + LC re-run | **Pending** — `SL9`, `SL11` |
| `BR-67` — a room reads as sellable only when no block covers the range and its state is neither `out-of-order` nor `occupied`; the aggregate subtracts each room once, `totalCount` and `blockedRooms` keep their meaning, every vacant state stays sellable, a block-free non-sellable single room answers `sellableCount: 0`, a block-covered room keeps the block refusal and its precedence, blocks and the vocabulary are unchanged, the #631 ceiling keeps reading `totalCount` and `blockedRooms` only, and the state list is fixed code, never per-hotel configuration | L1 acceptance + diff gates + evidence | **Pending** — `SL1`-`SL9`, `SL11`, `SL-E1` |
| `FR-RTE-2` / `FR-RMS-1` / `FR-RMS-3` (MVP rows, unchanged) — availability and room inventory keep their wording; the availability count now keeps the promise it already made, and the state vocabulary and block semantics stand | L1 re-run: the existing MVP guards unchanged | **Covered by re-run today** — `services/rooms/src/server.test.ts:268-303`, `:349-403`, `:471-501`, `:502-527`, `:645-692`, `services/rooms/src/pgstore.test.ts:22-57`, `:59-111`; the MVP guard slots in section 1 of the matrix stand unchanged and may not cite this slice |
| `NFR-CON-1` (unchanged) — the booking guard, its atomic shape, and the paired-attempt outcome do not move; the sellability read is not on the booking decision | L3 re-run plus the diff gate | **Covered by re-run today** — `services/rooms/src/server.test.ts:528-554` (paired assignments), `services/reservations/internal/availability/client_test.go:47`, and `SL9` (no Reservations edit); a booking-path change fails the row |
| `NFR-PERF-1` / `NFR-PERF-2` (unchanged) — the read adds one comparison per room inside the loop or query it already runs: no round trip, no poll, no new blocking | L2 PERF re-run, unedited | **Covered by re-run today** — `SL12`; the timed desk run and the `perf-reporting-variant` job must stay green with no edit |
| `NFR-I18N-1` (unchanged) — no sentence is added or changed; the sold-out and block sentences are reused | Catalogue gate, unedited | **Covered by re-run today** — `SL11`, `SL12`; `script/catalogue-coverage-check.sh` green with a byte-identical catalogue |
| Contract and LC | Real delta: one prose line in `contracts/http/CheckRoomTypeSellability.json` (`sellableCount` description plus its `traces`); no operation, route, property, required list, status, or error code moves | **Pending gate** — `SL11`; the contract edit is `architect`'s (LLD 36.6) |
| No-configuration and no-migration gate | Real delta: the non-sellable state list is one fixed code rule — no environment variable, `deploy/` file, compose file, or per-hotel setting carries it — and no migration, column, backfill, or stored value is added | **Pending diff gate** — `SL9`, `SL11`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-67) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` wording moves; `FR-SEL-1`..`FR-SEL-4` are behaviour-scoped additions outside the counted capability set | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`SL-E1`) | The aggregate and single-room before/after pairs, the `postgres-parity (rooms)` run, and the slice row in the test report | **Pending** — `docs/testing/evidence/636/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #636): 17 rows mapped to `AC-SEL-1`..`AC-SEL-4`,
`FR-SEL-1`..`FR-SEL-4`, `BR-67`, the unchanged MVP rows
`FR-RTE-2`/`FR-RMS-1`/`FR-RMS-3`, `NFR-CON-1`,
`NFR-PERF-1`/`NFR-PERF-2`, `NFR-I18N-1`, the contract/LC gate, the
configuration/migration gate, the MVP no-change gate, and `SL-E1`.
Seven rows carry a re-run-today half (the unchanged MVP rows, the
three NFR rows, the block/vocabulary halves inside `AC-SEL-3` and
`FR-SEL-3`, and the desk half inside `AC-SEL-2`); the rest are
**pending** the implementation PR — the rows
whose guards are `SL1`-`SL12`, the gates, and `SL-E1`. The slice is
**not complete** at this spec head; it completes when the
implementation PR merges with `SL1`-`SL12` green, `SL5`'s Postgres half
recorded in the `postgres-parity (rooms)` job, `SL-E1` recorded, and
`qa-lead` re-pins the rows at the merged head.

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: `docs/architecture/services/rooms.md` section 7) |
|---|---|---|
| L1 service, Rooms (memory store) | `SL1`, `SL2`, `SL3`, `SL4`, `SL6`, `SL8`, and the existing pins | `cd services/rooms && npm ci && npm run build && npm test && npm run lint` (CI `node-build (rooms)`) |
| L1 service, Rooms (Postgres parity) | `SL5`, `SL7`'s Postgres half | the Rooms suite in the `postgres-parity (rooms)` matrix job, which applies the Rooms migrations and exports `TEST_PG_URL`; the cases skip without it (`services/rooms/src/pgstore.test.ts:13`), and the job fails on any skipped case |
| LC contract | `SL11`: the one prose line, the unchanged shape, the fixtures | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`) |
| Desk regression (unit) | `SL10`: the Book, Rooms, and Desk pins stay green unchanged | `cd app && npm ci && npm run build && npm test` (CI `app-build`) |
| Desk regression (browser) | `SL10`: the sold-out confirm on the served SPA | CI `browser-e2e` |
| Reservations no-change re-run | `SL9`: the ceiling derivation and its suite | `cd services/reservations && go test ./...` (CI `go-build (reservations)`) |
| Gates | Links, harness conventions, catalogue, whitespace | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `script/catalogue-coverage-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `node-build
(rooms)`, `app-build`, `browser-e2e`, `go-build (reservations)`,
`contract-check`, `ci`, `e2e-single-host`, and `postgres-parity
(rooms, node)`. The Postgres half of `SL5` runs in the `postgres-parity
(rooms)` job, which applies the Rooms migrations, exports `TEST_PG_URL`,
and fails on any skipped case, so `SL-E1` records that job's run.

### Execution order

1. Rooms memory suite: the new `SL*` cases first (a red case stops the
   run), then the existing sellability and block pins unchanged.
2. Rooms Postgres suite in the `postgres-parity (rooms)` job
   (`TEST_PG_URL` exported by the job) for `SL5` and `SL7`.
3. Reservations suite and `contract-check` (`SL9`, `SL11`): no
   Reservations diff and a green ceiling derivation.
4. Desk unit suite, then the browser flow (`SL10`).
5. `SL-E1`: the before/after pairs and the parity run, recorded.
6. Link, harness, and catalogue gates, then the test-report row.

### Entry criteria

1. The spec set is `active` and `spec-reviewer` has posted
   `SPEC-GATE PASS` on #636 (T2).
2. The stack specs this plan cites are active: `AC-SEL-1`..`AC-SEL-4`
   (acceptance-criteria section 29), `FR-SEL-1`..`FR-SEL-4` and `BR-67`
   (requirements section 37 and business rules), and LLD section 36.
3. The build under test is identified by commit, and the fixture is
   one room type whose rooms cover all five states plus one covering
   block, stated in the case table.

### Exit criteria

1. `SL1`-`SL12` exist and pass; every case asserts the exact
   `totalCount`/`sellableCount`/`blockedRooms` triple, and `SL7`
   asserts the full refusal payload.
2. `SL5`'s Postgres half ran with `TEST_PG_URL` and answered the same
   triple as the in-memory store.
3. `SL9` holds: no `services/reservations/**` file is in the diff and
   its suite is green.
4. `SL10` holds: no desk file is in the diff and every desk pin passes
   unchanged.
5. `SL11`/`SL12` hold: the contract is prose-only, the catalogue is
   byte-identical, and no migration is added.
6. `SL-E1` is recorded: the evidence pairs in
   `docs/testing/evidence/636/README.md` and the slice row in
   `docs/testing/test-report.md`.
7. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
   section 4 at the merged head and flipped the rows.
8. Open failures are filed as issues with FR/NFR ids; no `risk-high`
   failure is waived without owner approval.

### Negative controls

- **The list must not invert or over-reach.** `SL4` is the positive
  control: all three vacant states must stay sellable, so an
  implementation that excludes anything beyond `out-of-order` and
  `occupied` fails. `SL3`'s "all rooms non-sellable answers `0`" and
  `SL1`'s "state restored counts again" close the other side: a count
  that can only go down is as wrong as one that never moves.
- **The block path must stay on top.** `SL7` reads a block-covered
  `out-of-order` room and demands the 422 block refusal with its dates
  and reason. A 200 with `sellableCount: 0` fails the case, because it
  would silently disable both desk block notes.
- **Both stores must agree.** `SL5` runs the same fixture through the
  memory and Postgres paths; a passing memory case is never taken as
  evidence for the SQL predicate, which is a separate expression.
- **One subtraction only.** `SL3` asserts `N - 1` for a room that is
  both blocked and `out-of-order`, and that `blockedRooms` still names
  it once; `N - 2` and a negative count both fail.
- **The booking guard must not move.** `SL9` is a diff gate, not a
  behaviour re-test: a `services/reservations/**` hunk fails the row
  even if every test stays green, because the ceiling's meaning is the
  requirement.

## 6. Owner verification cases (RSS-1..RSS-10)

Plain-language cases the owner can run on the lab once the change
lands, using the existing desk surfaces and the
`script/e2e-desk-loop.sh` seed recipe (sign-in token, one room type
with named rooms). Steps are the same for each case: seed the stated
rooms and blocks, then read the aggregate reply, the single-room reply
for the named room, and the desk's Book confirm.

| Case | Setup | Expected |
|---|---|---|
| `RSS-1` | Type with three rooms, all vacant; read the aggregate | `totalCount: 3`, `sellableCount: 3`, `blockedRooms: []` |
| `RSS-2` | Set one room `out-of-order`; read the aggregate | `totalCount: 3`, `sellableCount: 2`, `blockedRooms: []` — the out-of-order room is not offered |
| `RSS-3` | Put one room in service (assign it), then read the aggregate | `totalCount: 3`, `sellableCount` excludes the occupied room; the desk's count drops by one |
| `RSS-4` | Set one room `out-of-order` and block the same dates | `sellableCount` drops by one, not two, and `blockedRooms` names that room once |
| `RSS-5` | Read one room at a time for each state: vacant-dirty, vacant-clean, vacant-inspected | Each answers 200 with `sellableCount: 1` — dirty rooms are still sellable for a future stay |
| `RSS-6` | Read one room at a time for an `out-of-order` room and an `occupied` room, no block | Each answers 200 with `totalCount: 1`, `sellableCount: 0`, `blockedRooms: []` |
| `RSS-7` | Book the quoted type and dates through the Book panel while the only room of that type is `out-of-order` | The confirm refuses with "No rooms of this type are free for these dates." and no booking is created |
| `RSS-8` | Block an `out-of-order` room, then read that room | 422 `STATE_ILLEGAL` naming the block's dates and reason, and the Rooms map still shows the covering-block note |
| `RSS-9` | Block an `out-of-order` room, release the block, read the aggregate | The room leaves `blockedRooms` but stays unsellable (`sellableCount` unchanged) until its state returns to a vacant one |
| `RSS-10` | Repeat `RSS-2` and `RSS-6` on the Postgres-backed build | The same numbers as the in-memory build |

Desk regression on the same build: `RSS-D1` book a type with one
vacant room and confirm; `RSS-D2` a sold-out type refuses on confirm
with the sold-out sentence; `RSS-D3` the dashboard and the rooms map
still show covering-block notes and no new control or copy appears.
Expected: unchanged from the pre-change desk.

## 7. Evidence rule SL-E1

The implementation PR records three artefacts
(`docs/testing/evidence/636/README.md`, created by that PR, same
capture method as the `#588` and `#631` records):

- **Aggregate pair.** Before: a type with three rooms, one
  `out-of-order`, answers `sellableCount: 3` on today's build. After:
  the same seed answers `sellableCount: 2` with `totalCount: 3` and
  `blockedRooms: []`.
- **Single-room pair.** Before: a block-free `out-of-order` room
  answers `sellableCount: 1` on today's build. After: the same read
  answers `sellableCount: 0`, and the Book confirm refuses with the
  existing sold-out sentence while creating no reservation.
- **Parity run.** The `SL5` fixture executed in the `postgres-parity
  (rooms)` job, which applies the Rooms migrations, exports
  `TEST_PG_URL`, and fails on any skipped case; the identical triple
  from both stores is recorded (a green `node-build (rooms)` job alone
  is not parity evidence).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and the re-pin rule

At the spec head: 17 rows mapped — seven rows carry a re-run-today half
whose pins exist and pass (`services/rooms/src/server.test.ts`,
`services/rooms/src/pgstore.test.ts`, `app/src/views/BookView.test.ts`,
`app/src/views/RoomsView.test.ts`, `app/src/views/DeskView.test.ts`,
`app/e2e/book.spec.ts`) and the other ten are **pending** the
implementation PR (the registry `SL1`-`SL12`, the gates, the MVP
no-change gate, and `SL-E1`). The slice is **not complete** at this
spec head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise. When the implementation PR merges, `qa-lead`
re-reads every `file:line`, rewrites the pins in place (never deletes
one), records the merged head SHA in the matrix section 29 status line,
and flips the rows. A row whose guard the PR did not create stays
pending and is filed as a gap on #636.

The 57/57 MVP coverage count in
[traceability-matrix.md](traceability-matrix.md) stands unchanged: this
slice adds no MVP capability, and no MVP row may cite it as its guard.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1235
