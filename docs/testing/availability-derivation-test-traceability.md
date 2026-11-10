# Reservation availability derivation test traceability (Refs #631)

Status: active. Testing spec for the T3 server-side reservation
availability derivation ([issue #631](https://github.com/MingChen1501/hotel-mgmt/issues/631)),
owned by `qa-lead`. It maps the done-conditions of the change —
`AC-OVB-1`..`AC-OVB-3`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 15](../product/acceptance-criteria.md) —
the behaviour-scoped requirements `FR-OVB-1`..`FR-OVB-4`, owned by
`business-analyst` in
`docs/requirements/mvp-requirements.md` [section 23](../requirements/mvp-requirements.md),
and business rules `BR-47`..`BR-49` in
`docs/requirements/business-rules.md`, to their guards: the pins that
exist on disk at this spec head, the guard registry `O1`–`O13`, and
the evidence rule `OR-1`.

Written before the implementation PR. Every guard in the registry
except the desk re-run row is a **named, missing obligation** at this
head: no row here marks a guard complete before it exists and passes,
and the slice is not complete until the implementation PR merges and
`qa-lead` re-pins every row at the merged head (the `#588 -> #599`
and `#601` pattern). Section 2 cites what is on disk today and what it
proves; section 4 says which rows the implementation PR creates and
which pins it rewrites (never deletes).

Companion specs: ADR-0006
(`docs/architecture/decisions/adr-0006-server-side-availability-derivation.md`,
proposed; the owner accepts it before the implementation PR merges),
LLD [section 22](../architecture/lld.md) (guard algorithm, per-flow
diagrams, and the section 22.6 verification plan this plan aligns
with), HLD section 5, the `AC-OVB-1`..`AC-OVB-3` product conditions,
and the #588 evidence record `docs/testing/evidence/588/README.md`
(the prior client-trust boundary record this slice's evidence pair
follows). This spec implements no code, changes no guard, adds no
catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T3 (architectural: the overbooking decision's ceiling moves
  from a request field to another module's recorded room inventory,
  adding one synchronous Reservations -> Rooms read with a
  fail-closed refusal; the contract change is additive only and there
  is no schema or data-model change). The guard is the change; the
  desk is not.
- The desk is unchanged. `AC-OVB-3` pins the Book panel's flow, its
  own fresh sellability pre-check, the request it sends (including
  `sellableUnits`), and its two refusal sentences. Every desk pin in
  section 2 must pass without a desk edit; a desk diff in the
  implementation PR is drift, not scope.
- No MVP row moves. `FR-RES-1`, `FR-RES-2`, `FR-RTE-2`, and
  `NFR-CON-1` keep their wording, targets, and existing guards and
  gain only the amendment pointer; the 57-row MVP coverage count in
  `traceability-matrix.md` stands unchanged and no MVP row may cite
  this slice as its guard. The slice rows live in
  `traceability-matrix.md` section 14.
- No new NFR and no new catalogue key. The refusals reach the panel
  through the strings that already exist: `desk.book.refused_soldout`
  for `CONFLICT` (`app/src/views/BookView.vue:916-919`) and
  `desk.shell.request_failed` for the 503
  (`app/src/views/BookView.vue:477-482`), so
  `script/catalogue-coverage-check.sh` stays green.
- Contract: additive only (ADR-0006 D6). `CreateReservation` moves
  1.1 -> 1.2 and `ModifyReservation` 1.0 -> 1.1: `sellableUnits`
  becomes optional and advisory, and the error set gains
  `UPSTREAM_UNAVAILABLE` (503); `contracts/errors/envelope.json`
  registers the code and the status. The contract edit belongs to
  `architect`; this spec cites the re-run only (section 4). The LC
  stage keeps its per-module meaning: the new seam is Reservations ->
  Rooms `CheckRoomTypeSellability`, covered by the existing
  `contract-check` stage through
  `services/reservations/contract-tests/CheckRoomTypeSellability-consumed.json`,
  so this slice adds no new per-row LC cell.
- Guards are extended, never deleted. The existing pairs in section 2
  (`store_test.go:31-70`, `:86-105`, `:173-235`, `postgres_test.go:106-135`,
  `handler_test.go:59-91`, `service_test.go:92-119`) keep their
  assertions; the implementation PR rewrites them to a derived ceiling
  with a `#631` note and must not drop a case.
- The finding itself is the before-state: a request carrying
  `sellableUnits: 999` overbooks without ever seeing `CONFLICT`, and
  an unread capacity is never consulted at all. `OR-1` records the
  pair.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head (`e5fa91a`;
the code tree is identical to `master` at `8745afa`, the three stack
commits are docs-only). They pin today's request-trusting behaviour;
the implementation PR rewrites the behaviour pins in place, with a
`#631` note, and never deletes one.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/reservations/internal/handler/handler.go:129`, `:144` (`CreateReservation`) | `sellableUnits` is read from the request body and threaded into `service.CreateRequest`; nothing reads a capacity source | Replaced by the server-derived ceiling; the field stays accepted and ignored |
| `services/reservations/internal/handler/handler.go:217`, `:229` (`ModifyReservation`) | The same read on the modify path | Same on modify; the ceiling is read for the effective type and dates |
| `services/reservations/internal/handler/handler.go:344-349` (`sellUnits`) | An absent `sellableUnits` becomes `0`, which the store then refuses as `VALIDATION_FAILED` | Removed: absent must be accepted (`O3`); the body is shape-checked only when the field is present |
| `services/reservations/internal/store/store.go:202-203`, `:337-338` | `input.SellableUnits < 1` is a hard validation on both paths, so the request's number is a decision input | Removed; the guard reads the derived capacity input instead |
| `services/reservations/internal/store/store.go:194-196` (`activeState`) | The counted states are `confirmed` and `checked-in` | Kept as built (`O10`) |
| `services/reservations/internal/store/store.go:201-226` (`Create`) | The mutex at `:205`, the replay lookup at `:208`, the overlap count, and `if booked >= input.SellableUnits` at `:221` inside one critical section | The same critical section compares against the derived ceiling; the request's number does not reach the store (`O8`) |
| `services/reservations/internal/store/store.go:336-380` (`Modify`) | The twin guard at `:375`, excluding the reservation itself (`:368`) | Same, on the effective type and dates (`O4`, `O8`) |
| `services/reservations/internal/store/postgres.go:146-147`, `:183`, `:412-413`, `:489` | The Postgres twin validates and compares the request's number in its transaction | Both paths take the derived ceiling as input (`O11`) |
| `services/reservations/internal/service/service.go:114-119`, `:219-224` | The Rates stay-restriction check runs first and refuses `STATE_ILLEGAL` before the guard | The capacity read is inserted after the restriction check and before the store call; the refusal order is unchanged |
| `services/reservations/internal/service/service.go:207-218` | The effective room type and dates of a modification (request value, else the stored row) | The capacity read uses these effective values |
| `services/reservations/internal/service/service.go:126`, `:232` | The request's `sellableUnits` is threaded into `store.CreateInput` / `store.ModifyInput` | Replaced by the derived ceiling; the request field is no longer threaded into the store |
| `services/reservations/internal/pricing/client.go:33`, `:53-59`, `:89-96` | The wired Reservations -> Rates client: five-second timeout, Bearer token forwarded, fail-closed `UPSTREAM_UNAVAILABLE` 503 naming upstream and operation | The shape the availability client follows (`O6`, `O7`) |
| `services/reservations/internal/store/store_test.go:31-70` (`TestPairedBookingExactlyOneWins`) | Paired create yields exactly one winner and one `CONFLICT` naming type+dates, one row — with the ceiling fed from the request today | Rewritten to the derived ceiling; the assertions stay (`O8`) |
| `services/reservations/internal/store/store_test.go:86-105` (`TestIdempotentReplayReturnsOriginal`) | A repeated key returns the original record and writes one row | Kept with a derived ceiling (`O9`) |
| `services/reservations/internal/store/store_test.go:173-235` (`TestPairedModifyExactlyOneWins`) | Paired modify onto the last unit yields one winner and one `CONFLICT` | Kept (`O8`) |
| `services/reservations/internal/store/store_test.go:107-150`, `:238-263`, `:304-337` | Modify reprices and records the change; cancel and no-show release the held dates | Keep green; they are the release half of `O10` |
| `services/reservations/internal/store/postgres_test.go:106-135` (`TestPostgresPairedBookingExactlyOneWins`) | The Postgres transaction yields one winner under the same pair | Extended for the derived ceiling (`O11`) |
| `services/reservations/internal/handler/handler_test.go:59-91` (`TestDeskLoopBookThenOverbookingRefused`); request body at `:46-58` sets `sellableUnits: 1` | First booking accepted, second overlapping refused 409 `CONFLICT` — both decide on the request's number | Extended: the same two calls with an inflated number (`O2`) |
| `services/reservations/internal/service/service_test.go:92-119` (`TestGuardRefusesSecondBookingForLastUnit`), `:80-90` (`TestCreateNilHookFailsClosed`) | The service-level pair and the wired-hook fail-closed precedent | Extended with the availability hook (`O5`, `O6`) |
| `services/reservations/internal/pricing/client_test.go:61-84` | Fail-closed 503 on an unreachable and an unparseable upstream | The pattern `O6` copies for Rooms |
| `services/rooms/src/store.ts:307-359` (`checkSellability`), `:343-356` (of-type rooms and blocked rooms) | The reply the ceiling derives from: `totalCount`, `blockedRooms`, and the derived `sellableCount` | Consumed fields are `totalCount` and `blockedRooms`; `sellableCount` is not consumed (ADR-0006 D2) |
| `services/rooms/src/server.ts:141` | The `CheckRoomTypeSellability` route the consumer calls | Unchanged |
| `contracts/http/CreateReservation.json` (version `1.1`; `request.required` includes `sellableUnits`, `minimum: 1`) | The caller's number is contract-required | `architect` bumps to `1.2`: optional and advisory, errors add `UPSTREAM_UNAVAILABLE` (503) |
| `contracts/http/ModifyReservation.json` (version `1.0`; `request.required` includes `sellableUnits`) | The same on modify | `architect` bumps to `1.1` |
| `contracts/http/CheckRoomTypeSellability.json` (version `1.0`; required `totalCount`, `sellableCount`, `blockedRooms`) | The shape the new consumer reads | Shape unchanged; the server-side consumer goes live |
| `contracts/errors/envelope.json:9`, `:22` | The code enum has no `UPSTREAM_UNAVAILABLE` and `statusMapping` maps `CONFLICT` to 409 with no 503 row | `architect` registers the code and status; `contract-check` must stay green (`O13`) |
| `services/reservations/contract-tests/CreateReservation.json`, `CreateReservation-conflict.json`, `ModifyReservation.json`, `ModifyReservation-conflict.json`, `CheckRoomTypeSellability-consumed.json` | The compatibility fixtures, including the consumer fixture for the new seam | Kept as the compatibility half; the consumer fixture gains the derived-ceiling assertion (`O13`) |
| `deploy/compose.yaml:46`, `:89-99` | `RATES_BASE_URL` on reservations; the `rooms` service block | `ROOMS_BASE_URL` is wired the way `RATES_BASE_URL` is; `O6` proves the unwired case |
| `app/src/views/BookView.vue:893-929`, `:916-919`, `:477-482` | The Book panel pre-checks sellability, sends the searched count, and maps `CONFLICT` to `desk.book.refused_soldout` and an unreadable source to `desk.shell.request_failed` | Unchanged (desk-green row) |
| `app/src/views/BookView.test.ts:556`, `:770`, `:919`, `:1093`, `:1158` | The desk unit pins: the confirm sends the searched count, a second overlapping booking sends it too, nothing sellable refuses without a create, the sold-out sentence, one create per double-click | Unchanged (desk-green row) |
| `app/e2e/book.spec.ts:51`, `:102` | The browser booking flow and the second-overlapping-refused case | Unchanged (desk-green row) |
| `script/e2e-desk-loop.sh:299`, `:332` | The API booking steps send `sellableUnits` | Unchanged, and it is the recipe the `AVD-*` owner cases reuse |

## 3. Guard registry O1–O13 and the evidence rule OR-1

Naming: `O` ids name guards and `AVD-*` (section 6) names owner cases,
so neither collides with the `FR-OVB-*` requirement ids. All twelve
new guards (`O1`–`O11` and `O13`) are **missing at this spec head** and
created by the implementation PR: `O1`, `O4`, `O8`–`O10` in
`services/reservations/internal/store/store_test.go`, `O2`, `O3` in
`services/reservations/internal/handler/handler_test.go` (with `O3`'s
service-level half in `internal/service/service_test.go`), `O5`, `O6`
in `internal/service/service_test.go` with the client half in a new
`internal/availability/client_test.go`, `O7` in
`internal/availability/client_test.go`, `O11` in
`internal/store/postgres_test.go`, and `O13` as the contract re-run.
A refusal guard is not complete on a status code alone: it also
asserts that no reservation row was written, that no change-history
entry and no outbox event were written, and that no idempotency
record was stored.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `O1` | Inflated create, store level: a derived ceiling of 1 already held by one confirmed row — `sellableUnits: 999` in the input buys no unit; 409 `CONFLICT` naming the room type and dates, no row stored | `services/reservations/internal/store/store_test.go` |
| `O2` | Inflated create, request level: the body carries `sellableUnits: 999` while a Rooms stub answers `totalCount: 1`, `blockedRooms: []` and one confirmed hold exists — 409 `CONFLICT`, nothing written, proving the body number never reaches the guard | `services/reservations/internal/handler/handler_test.go` |
| `O3` | The value cannot refuse either: `sellableUnits: 1` with a derived ceiling of 3 and two holds — 200; an absent `sellableUnits` — 200; `sellableUnits: -1` or a non-integer — 400 `VALIDATION_FAILED` naming `sellableUnits` (shape only, no decision) | `internal/handler/handler_test.go` and `internal/service/service_test.go` |
| `O4` | Inflated modify: modify into sold-out dates and into a sold-out type with `sellableUnits: 999` — 409 `CONFLICT`, the reservation keeps its previous dates, type, guest, and price, and no change-history entry is written | `internal/store/store_test.go` and `internal/handler/handler_test.go` |
| `O5` | Zero capacity is sold out, not an outage: Rooms answers `totalCount: 2` with both rooms blocked — 409 `CONFLICT` naming type and dates, never 503, nothing written | `internal/service/service_test.go` and `internal/handler/handler_test.go` |
| `O6` | Unreadable capacity fails closed: transport failure, timeout, 5xx, an unparseable reply (missing or non-integer `totalCount` / `blockedRooms`), and an unwired client each refuse 503 `UPSTREAM_UNAVAILABLE` with `{upstream: "rooms", operation: "CheckRoomTypeSellability"}`, nothing written; one case per cause, on create and on modify | `internal/availability/client_test.go` and `internal/service/service_test.go` |
| `O7` | Provider 4xx pass-through: Rooms answers `NOT_FOUND` for an unknown type and `UNAUTHENTICATED` for a rejected session — both surfaced unchanged, never rewritten to 503 | `internal/availability/client_test.go` |
| `O8` | Atomicity with a derived ceiling: paired simultaneous last-unit creates and paired simultaneous modifies — exactly one 200 and one 409 `CONFLICT`; the ceiling is read once per attempt and the count-and-insert comparison stays in one critical section | `internal/store/store_test.go` (memory) |
| `O9` | Replay consumes no second unit: the same `idempotencyKey` returns the original record and stores one row, with the ceiling derived | `internal/store/store_test.go` |
| `O10` | Counted states stay as built (`activeState` counts `confirmed` and `checked-in` only): a cancelled, a no-show, and a closed row stop counting (the released unit is sellable again) and a checked-in row keeps counting against the ceiling | `internal/store/store_test.go` |
| `O11` | Postgres parity: the inflated create (`O1`), the inflated modify (`O4`), the paired last-unit create (`O8`), and the replay (`O9`) run over `PostgresStore` with the derived ceiling and write nothing on a refusal | `internal/store/postgres_test.go` |
| `O12` | Desk green: every desk pin in section 2 passes **unchanged** after the implementation PR — the panel still pre-checks, still sends `sellableUnits`, still shows `desk.book.refused_soldout` and `desk.shell.request_failed`, and still creates once per double-click. Existing and passing today; the obligation is "unchanged", not "new" | `app/src/views/BookView.test.ts:556`, `:770`, `:919`, `:1093`, `:1158`, `app/e2e/book.spec.ts:51`, `:102`, `script/e2e-desk-loop.sh:299`, `:332` |
| `O13` | Contract and LC: `CreateReservation` 1.2 and `ModifyReservation` 1.1 carry `sellableUnits` optional and advisory with the `UPSTREAM_UNAVAILABLE` (503) error row, the envelope registers the code and status, the existing fixtures stay valid, and the consumer fixture asserts the derived ceiling | `contracts/http/CreateReservation.json`, `contracts/http/ModifyReservation.json`, `contracts/errors/envelope.json:9`, `:22`, `services/reservations/contract-tests/*.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; the contract edit is `architect`'s (ADR-0006 D6) |
| `OR-1` | Evidence rule: the implementation PR records the before/after pair for an inflated `sellableUnits` booking and for an unreadable capacity source in `docs/testing/evidence/631/README.md` and records the slice in `docs/testing/test-report.md` (section 3 exit criterion 6). Stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row except the desk-green row, which is
covered today by pins that exist and pass and must keep passing
untouched. For a pending row the guard does not exist at this spec
head: the implementation PR creates it, and `qa-lead` re-pins the row
with `file:line` at the merged head and flips it to covered only when
the guard passes.

| Item | Required guard | Guard |
|---|---|---|
| `AC-OVB-1` — the guard decides on the recorded capacity, not the request's `sellableUnits`: inflated buys nothing, low or absent refuses nothing, the Nth overlapping confirmed reservation is the last accepted, the next refuses `CONFLICT` naming type and dates and writes nothing; a modification into sold-out capacity refuses with the reservation unchanged; a recorded capacity of zero is that same sold-out `CONFLICT`, never a fail-closed `UPSTREAM_UNAVAILABLE`; a cancelled, no-show, or closed reservation releases its held unit exactly as today, so freed capacity becomes sellable again, while a checked-in row keeps holding its unit exactly as today, because the in-house share of a room type must not be subtracted from the recorded capacity twice (`BR-47`) | L1 acceptance, both directions, plus L3 pairing | **Pending** — `O1`, `O2`, `O3`, `O4`, `O8`, `O10`; existing pins `store_test.go:31-70`, `:173-235`, `handler_test.go:59-91` prove today's request-fed guard and are rewritten |
| `AC-OVB-2` — an unreadable capacity source refuses fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming the upstream and the operation, nothing written, no earlier read reused, no request number as fallback; a 4xx envelope is surfaced unchanged; an unwired client refuses the same way | L1 acceptance + fail-closed check | **Pending** — `O6` (transport, timeout, 5xx, unparseable, unwired), `O7` (4xx pass-through); existing pin `pricing/client.go:89-96` is the code precedent and `client_test.go:61-84` the test pattern |
| `AC-OVB-3` — two simultaneous last-unit requests yield exactly one winner and one `CONFLICT`, the capacity read on the attempt and the count-and-insert in one critical section; a replay returns the original and consumes no second unit; the desk Book flow, its pre-check, its request, and its refusal sentences stay as they are | L1 + L3 paired concurrency + desk re-run | **Pending** for the service half (`O8`, `O9`); **covered by re-run** for the desk half (`O12`) |
| `FR-OVB-1` — the ceiling is the capacity the hotel records for the room type and dates; the request's number can neither raise nor lower it (mvp-requirements section 23.3) | L1 acceptance, inflated and low/absent | **Pending** — `O1`, `O2` (inflated), `O3` (low, absent, malformed), `O11` (Postgres parity) |
| `FR-OVB-2` — a modification is decided on the same ceiling and refuses without changing the reservation: previous dates, type, guest, and price kept, no change-history entry, the request's number changes nothing | L1 acceptance | **Pending** — `O4`, `O11`; existing pin `store_test.go:173-235` proves the pairing but feeds the ceiling from the request |
| `FR-OVB-3` — an unreadable capacity source refuses fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming upstream and operation and writes nothing; a 4xx envelope is surfaced unchanged; a readable zero capacity is a sold-out `CONFLICT`, never a 5xx | L1 acceptance + fail-closed | **Pending** — `O5` (zero is a conflict), `O6` (unreadable), `O7` (4xx); no guard on disk |
| `FR-OVB-4` — the guard stays atomic and a replay consumes no second unit: capacity read on the attempt, the request's number never in the comparison, count-and-insert in one critical section | L1 + L3 paired concurrency | **Pending** — `O8`, `O9`, `O11`; existing pins `store_test.go:31-70`, `:86-105`, `:173-235`, `postgres_test.go:106-135` keep the one-winner and replay assertions and are rewritten |
| `BR-47` — the overbooking ceiling is the recorded capacity for the type and dates; a request value neither raises nor lowers it; cancelled, no-show, and closed reservations release their hold, a checked-in one keeps it | L1 acceptance + counted-state check | **Pending** — `O1`–`O5`, `O10`; existing pins `store_test.go:238-263`, `:304-337` prove the releases today |
| `BR-48` — the capacity is read on every attempt and never cached or inferred; an unreadable source refuses fail-closed 503 and nothing is written; a 4xx envelope is surfaced unchanged; a zero capacity is a sold-out `CONFLICT` | L1 acceptance + fail-closed | **Pending** — `O5`, `O6`, `O7`; no guard on disk |
| `BR-49` — the guard keeps its atomic shape, so two simultaneous last-unit requests yield one winner and one `CONFLICT`, and a replay takes no second unit | L1 + L3 paired concurrency | **Pending** — `O8`, `O9`, `O11` |
| Desk flows stay green (`AC-DSK` Book slice, `FR-RES-1`, `FR-RES-2`, `AC-OVB-3`) | Behaviour check: the same request stops being trusted and the desk still shows the same lines | **Covered by re-run at this spec head** — `app/src/views/BookView.test.ts:556`, `:770`, `:919`, `:1093`, `:1158`, `app/e2e/book.spec.ts:51`, `:102`, `script/e2e-desk-loop.sh:299`, `:332`. These must pass unchanged after the implementation PR; a desk edit fails the row |
| Contract and LC | Re-run only: `CreateReservation` 1.2 and `ModifyReservation` 1.1 keep the now-advisory field, the envelope registers `UPSTREAM_UNAVAILABLE` (503), the existing fixtures stay valid, and the Reservations -> Rooms `CheckRoomTypeSellability` seam passes the per-module contract stage | **Pending gate** — `O13`; the contract edit is `architect`'s (ADR-0006 D6) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-RES-1`, `FR-RES-2`, `FR-RTE-2`, `NFR-CON-1` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged; each of those rows keeps its existing guard and no MVP row cites this slice |
| Evidence cross-reference (`OR-1`) | The inflated-input and unreadable-capacity pairs are recorded before/after, and the slice is recorded in the test report | **Pending** — `O2` and `O6` are the payloads as guards; `docs/testing/evidence/631/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 22.6](../architecture/lld.md)) |
|---|---|---|
| L1 service, Reservations | `O1`–`O11` and the rewritten pins | `cd services/reservations && go build ./... && go test ./... && go vet ./... && gofmt -l .` |
| L1 service, Rooms (unaffected, must stay green) | The sellability reply the ceiling derives from | `cd services/rooms && npm ci && npm run build && npm test && npm run lint` |
| LC contract | `O13`: the bumped request contracts, the envelope registration, the existing fixtures, and the new consumer fixture | `script/contract-check.sh`, `script/openapi-route-check.sh` |
| Desk regression (unit) | `O12`: the Book pins stay green unchanged | `cd app && npm ci && npm run build && npm test` (CI `app-build`) |
| Desk regression (browser) | `app/e2e/book.spec.ts` on the served SPA | CI `browser-e2e` |
| Live desk loop | The API booking steps and the `AVD-*` recipe | `script/e2e-desk-loop.sh` (CI `e2e-single-host`) |
| Gates | Links, harness conventions, whitespace | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `go-build
(reservations)`, `node-build (rooms)`, `contract-check`, `app-build`,
`browser-e2e`, `e2e-single-host`, and `ci` (which runs the catalogue
coverage and link checks).

### Execution order

1. Reservations service suite (memory store first, then the Postgres
   parity cases with `DATABASE_URL` set). A red `O*` case stops the
   run.
2. Rooms suite, proving the consumed reply's meaning did not move.
3. Contract and route checks (the additive bump must not break the
   desk build's fixtures, and the consumer fixture must resolve).
4. Desk unit suite, then the browser flow, then the live desk loop.
5. `OR-1`: the evidence pairs against a lab stack, recorded.
6. Link and harness-convention gates, then the test-report row.

### Entry criteria

1. ADR-0006 is owner-accepted (`proposed -> accepted`) and this spec
   set has a `SPEC-GATE PASS` on #631 (T3).
2. The stack specs this plan cites are active: `AC-OVB-1`..`AC-OVB-3`
   (acceptance-criteria section 15), `FR-OVB-1`..`FR-OVB-4` and
   `BR-47`..`BR-49`, and LLD section 22.
3. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json`, with room counts and
   blocks the cases state.

### Exit criteria

1. `O1`–`O11` and `O13` exist and pass; every refusal case also
   asserts no reservation row, no change-history entry, no event, and
   no idempotency record.
2. `O12` passes unchanged — no desk edit, no dropped assertion.
3. The contract stage is green with the additive bump: the advisory
   field, the `UPSTREAM_UNAVAILABLE` registration, the unchanged
   fixtures, and the consumer fixture.
4. `OR-1` is recorded: the before/after pairs in
   `docs/testing/evidence/631/README.md` and the slice row in
   `docs/testing/test-report.md`.
5. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
   section 4 at the merged head and flipped the rows.
6. Open failures are filed as issues with FR/NFR ids; no
   `risk-high` failure is waived without owner approval.

### Negative controls

A refusal guard that only checks the HTTP status is insufficient.
Every `O1`, `O2`, `O4`, `O5`, `O6`, `O8`, `O11` case also asserts the
store holds the same row count as before the call, that no
change-history entry was appended, that no reservation event was
queued, and that no `idempotency_keys` row was written. `O3` is the
positive control pair: the same path must accept a bookable stay with
a low or absent `sellableUnits`, otherwise "ignored" could be hiding
an always-refuse guard. `O5` and `O6` separate the two error families
in both directions: a zero capacity must never become a 503, and an
unreadable reply must never become a 409 sold-out.

## 6. Owner verification cases (AVD-1..AVD-10)

Plain-language cases the owner can run on the lab once the change
lands, using the `script/e2e-desk-loop.sh:299`, `:332` recipe
(sign-in token, seeded rooms of one type, `api reservations
CreateReservation` / `ModifyReservation` bodies). Steps are the same
for each case: seed the stated rooms and blocks, then send the stated
body and read the reply, `GetReservation`, and the reservation
calendar.

| Case | Setup | Expected |
|---|---|---|
| `AVD-1` | Type with 1 room, no block, one confirmed overlapping reservation; create with `sellableUnits: 999` | 409 `CONFLICT` naming the room type and dates; the calendar still shows one reservation |
| `AVD-2` | Type with 3 rooms, no block, no hold; create with `sellableUnits: 999` | 200 with a reference — the guard is not a rubber stamp in the safe direction |
| `AVD-3` | Type with 3 rooms, two overlapping confirmed reservations; create with `sellableUnits: 1`, then the same body without the field | Both 200 — a low or absent value refuses nothing |
| `AVD-4` | Type with 2 rooms, one confirmed overlapping reservation; create twice more | The second create is accepted (unit 2) and the third is 409 `CONFLICT` |
| `AVD-5` | Existing reservation; target dates fully held by other reservations; modify with `sellableUnits: 999` | 409 `CONFLICT`; the reservation keeps its dates, type, guest, and price, and `GetReservation` shows no new change entry |
| `AVD-6` | Existing reservation; modify it into a fully held room type with `sellableUnits: 999` | 409 `CONFLICT`; the reservation is unchanged as in `AVD-5` |
| `AVD-7` | Type whose only rooms are blocked for the target dates; create with `sellableUnits: 999` | 409 `CONFLICT` naming type and dates — not 503 |
| `AVD-8` | Stop Rooms, or start Reservations without `ROOMS_BASE_URL`; create and modify | 503 `UPSTREAM_UNAVAILABLE` naming rooms and `CheckRoomTypeSellability`; nothing created or changed; the desk shows its plain request-failed sentence |
| `AVD-9` | Type with 1 room free; two signed-in staff submit overlapping creates at the same time (and the same with two modifies onto the last unit) | Exactly one 200 and one 409 `CONFLICT`; repeat ten times, 0 double-bookings |
| `AVD-10` | Create once, then resend the identical body with the same `idempotencyKey` | The original reference is returned; the calendar still shows one reservation |

Desk regression on the same build: `AVD-D1` book through the panel
and confirm; `AVD-D2` a sold-out type refuses on confirm with the
sold-out sentence; `AVD-D3` a double-clicked confirm creates once.
Expected: unchanged from the pre-change desk, no copy difference, no
new control.

## 7. Evidence rule OR-1

The implementation PR records two before/after pairs in
`docs/testing/evidence/631/README.md` (created by that PR, same
capture method as the #588 record):

- Overbooking pair. Before: seed one room of a type and one confirmed
  overlapping reservation, then create with `sellableUnits: 999` —
  today's build answers 200 and overbooks. After: the same body and
  seed answer 409 `CONFLICT` and the calendar still shows one
  reservation. Positive control: the same body on a type with three
  rooms and no hold answers 200 on both builds.
- Unreadable-capacity pair. Before: with Rooms stopped (or
  `ROOMS_BASE_URL` unset) the create answers 200 on today's build
  because no capacity is read at all. After: the same call answers 503
  `UPSTREAM_UNAVAILABLE` with `{upstream: "rooms", operation:
  "CheckRoomTypeSellability"}` and nothing is written.

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 14 rows mapped — 1 covered by re-run only (the
desk-green row: its pins exist and pass today and must keep passing)
and 13 **pending** rows whose guards are the registry `O1`–`O13` plus
the contract/LC gate, the MVP no-change gate, and `OR-1`. The slice is
**not complete**. It completes when the implementation PR merges with
`O1`–`O11` and `O13` green, `O12` unchanged, `OR-1` recorded, and
`qa-lead` re-pins every row in section 4 with `file:line` at the
merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a
fabricated pin is a phantom promise. The 57/57 MVP coverage count in
`traceability-matrix.md` stands unchanged and no MVP row cites this
slice.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-935
