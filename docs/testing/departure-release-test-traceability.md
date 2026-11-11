# Departure release test traceability (Refs #646)

Status: active. Testing spec for the T2 departure release and
same-day reuse change ([issue #646](https://github.com/MingChen1501/hotel-mgmt/issues/646)),
owned by `qa-lead`. It maps the done-conditions of the change —
`AC-DEP-1`..`AC-DEP-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 15](../product/acceptance-criteria.md) —
and the behaviour-scoped requirements `FR-DEP-1`..`FR-DEP-5`, owned
by `business-analyst` in
`docs/requirements/mvp-requirements.md` [section 23](../requirements/mvp-requirements.md),
to their guards: the pins that exist on disk at this spec head, the
guard registry `DR1`–`DR13`, and the evidence rule `DR-E1`.

Written before the implementation PR. Every guard in the registry is
a **named, missing obligation** at this head: no row here marks a
guard complete before it exists and passes, and the slice is not
complete until the implementation PR merges and `qa-lead` re-pins
every row at the merged head (the `#588 -> #599` pattern). Section 2
cites what is on disk today and what it proves; that table's note
column says which pins the implementation PR extends (never deletes),
and section 5 says which cases it must create.

Companion specs: the lifecycle shape and the per-flow diagrams in
`docs/architecture/lld.md` [section 22](../architecture/lld.md) (22.3
happy path, 22.4 failure and rollback, 22.6 verification plan this
plan aligns with), the joint reservation/stay state diagram in
`docs/architecture/state-machine.md` [section 1.1](../architecture/state-machine.md),
the desk delta and T2 UI contract in
`docs/product/desk-ui-design-rollout.md` [section 6.16](../product/desk-ui-design-rollout.md),
D-26 in `docs/project/decision-log.md`, R-10 in
`docs/project/risk-register.md`, and the sibling tests this slice
must not disturb: `checkout-settlement-test-traceability.md`
(#601, registry `S1`–`S12`) plus the #588 and #600 rows in
`traceability-matrix.md` sections 10 and 12. This spec implements no
code, changes no guard, adds no catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `architect` (LLD
  [section 22](../architecture/lld.md)): the close completes the
  booking behind it, so the booking leaves the active availability
  set. No lifecycle state is added (`closed` is already in `BR-1`, in
  the accepted state machine, and in the reservations `state` CHECK),
  no schema, no migration, and no desk flow change beyond the split
  sentence.
- The desk flow is one confirmation, unchanged: no second
  user-facing action and no new control. `AC-DSK-18` (the release) and
  `AC-DSK-19` (the room-charge review) hold as written, and the #588,
  #600, and #601 refusal paths keep refusing on the same conditions
  with the same plain words.
- No MVP row moves. `FR-FDK-2` and `FR-RTE-2` keep their wording and
  their existing guards and gain only the amendment pointer; the
  57-row MVP coverage count in `traceability-matrix.md` stands
  unchanged and no MVP row may cite this slice as its guard. The
  slice rows live in `traceability-matrix.md` section 14.
- No new NFR. Section 23.4 of the requirements is a no-change
  statement: catalogue coverage, desk response, concurrency, audit,
  retention, on-premise availability, time/locale, and roles all hold
  with the existing guards.
- No new catalogue key on the decided path, so
  `script/catalogue-coverage-check.sh` stays green. The split
  sentence is a key addition only if the implementation names it; if
  it does, it ships in both locales with placeholders intact and this
  document's `DR13` names it.
- Contract: additive only. A new provider operation
  `CheckOutReservation` (contract `ReservationService`, `1.0`) and one
  additive response field `bookingCompletion` on `CheckOut`
  (`1.0 -> 1.1`, LLD 22.5). No new error code, no event-schema
  change. The contract files and their fixtures land with the
  implementation PR, and `architect` owns the shape.
- Guards are extended, never deleted. The #588 release pins
  (`app/src/views/desk-edge-guards.test.ts:912-1032`,
  `app/src/views/StayView.test.ts:1086-1203`), the #600 review pins
  (`app/src/views/StayView.test.ts:1207-1290`, `:1291-1310`), the
  #601 desk pins (`app/src/views/StayView.test.ts:1650-1746`,
  `:1747-1783`, `:1608-1649`, `:1940-1974`), and the browser and live
  loop flows in section 2 keep their assertions. The implementation
  PR may tighten them with a `#646` note but must not drop a case.
- The `#601` settlement gate implementation is a sibling upstream
  slice: only its spec set is on `master` at this head (PRs
  #622/#623/#626), not its code. If the #646 implementation lands
  first, its refusal guards assert the refusal shape that exists at
  that head and the #601 cases (`S1`–`S12`) are added beside them when
  #601 merges; no #646 row depends on a guard that is not on disk.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head (`8263ab3`;
the code tree is identical to `master` at `8745afa`). They prove
today's behaviour: the booking keeps reading `checked-in` after a
close, and the room turnover path already exists. The implementation
PR extends these in place, with a `#646` note, and never deletes one.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/reservations/internal/store/store.go:108-117` (`Repository` interface) | The store surface stops at Create / Get / Query / CheckIn / Modify / Cancel / MarkNoShow: nothing closes a booking when a stay closes | Gains the check-out completion (target shape: `CheckOutReservation`); `DR1`, `DR3` |
| `store.go:194-196` (`activeState`) | Only `confirmed` and `checked-in` count as active — the set the availability guards and the modify guard already use | Unchanged; it is the reason a `closed` booking already releases the unit once one exists. `DR4`, `DR5` pin it |
| `store.go:201-260` (`Create`, guard at `:214-227`) | The create guard counts overlapping *active* rows, so today a departed booking still consumes a unit | Unchanged guard; `DR4` (closed booking consumes nothing), `DR5` (checked-in still consumes), `DR6` (early departure) |
| `store.go:274-292` (`Query`) | The calendar returns every overlapping row with its stored state, whatever the state | Unchanged; `DR10` pins the completed row reading `closed` while staying in the window |
| `store.go:297-320` (`CheckIn`) | The only transition out of `confirmed` is check-in and it links `stay_id`; the shape the completion mirrors | Unchanged; `DR1`/`DR10` reuse this conditional-write shape |
| `store.go:336-417` (`Modify`, guard at `:364-380`) | Modify counts the same active set and refuses a non-`confirmed` booking | Unchanged; `DR4` covers the modify guard, `DR10` covers the refusal on a completed booking |
| `store.go:422-462`, `:463-497` (`Cancel`, `MarkNoShow`) | Both refuse a `checked-in` booking and record the release | Unchanged; `DR10` asserts the refusal on a completed booking keeps the existing state refusal |
| `services/reservations/internal/handler/handler.go:121-285` | The operation surface is Create / Get / CheckIn / Modify / Cancel / MarkNoShow / QueryCalendar — no close, no reopen | The new provider operation lands beside `CheckInReservation` (`:184-205`) in the same style as `MarkNoShow` (`:266-284`); `DR1`, `DR10` assert no reopen route exists |
| `services/reservations/internal/store/postgres.go:177`, `:483` | The create guard (`:177`) and the modify guard (`:483`) filter `state IN ('confirmed','checked-in')` | Unchanged; `DR11` pins the same two behaviour cases over Postgres |
| `postgres.go:312-318` (`Query`), `:344-389` (`CheckIn`) | The Postgres calendar returns every state; the check-in transition is one conditional write with its change row | Unchanged; `DR11` adds the completion transition in the same transactional shape |
| `services/reservations/migrations/000002_schema.up.sql:29-33` | `state` CHECK already admits `closed`, and `stay_id` is `UUID NULL UNIQUE` | No migration: `DR1` resolves the booking by `stay_id`, never by guest name or dates |
| `services/reservations/migrations/000002_schema.up.sql:38-45` (`reservation_changes`) | The append-only change history exists (BR-2, NFR-AUD-1) | `DR1` asserts the completion's change row names `state`, the actor, and the time |
| `services/reservations/internal/pricing/client.go:43-97` | The Reservations -> Rates client pattern: forwarded bearer, timeout, mapped upstream failure | The Stay -> Reservations completion client follows this pattern; `DR8` covers its failure modes |
| `services/stay/src/store.ts:148-168` (`checkFolioGate`) | The gate input is still the request (`folioBalanceMinor` / `openBalanceApproval`) | Untouched by this slice; `DR8` asserts a refusal never reaches the flip or the completion call |
| `services/stay/src/store.ts:260-292` (`MemoryStayStore.checkOut`) | Gate (`:263`), replay (`:266-271`), in-house check (`:276-281`), flip (`:282`), one `checked-out` outbox row (`:284-288`), idempotency write (`:289-291`); no Reservations call | The completion call sits after the flip commits and before the reply; `DR7`, `DR8`, `DR9` |
| `services/stay/src/pgstore.ts:161-217` (`PostgresStayStore.checkOut`) | The same order inside one transaction: gate, replay claim, conditional flip, one outbox row, commit | Same insertion point after commit; `DR11` keeps the two stores in parity |
| `services/stay/src/server.ts:110-112` | The transport only checks the bearer is present; it is not threaded to the store | The caller token is threaded the way `services/reservations/internal/handler/handler.go:207`, `:235` threads it; `DR7` asserts the forwarded token |
| `services/stay/src/server.test.ts:128-238` (HTTP check-out block) | Settled close, open-balance refusal, approved close, replay, paired simultaneous closes | Extended: the completion call and the split outcomes; new cases `DR7`–`DR9` |
| `services/stay/src/reservationsClient.ts` (new) | The completion client: non-200 envelope code becomes the observed reason, an unreadable body or 5xx without a code becomes `UPSTREAM_UNAVAILABLE`, an aborted call or the bounded wait becomes `UPSTREAM_UNAVAILABLE`, a `200` without `reservationRef` becomes `UPSTREAM_UNAVAILABLE` | The client half of `DR8` lands in `services/stay/src/reservationsClient.test.ts` |
| `services/stay/src/server.test.ts:378-459` (Postgres block, check-out at `:406-459`) | The Postgres close: open-balance refusal, close with an approval, replay, second close `STATE_ILLEGAL` | Extended for the completion call and the split; `DR11` |
| `services/rooms/src/store.ts:35-39`, `:407-436` (`releaseRoom`) | `occupied -> vacant-dirty` on release; the transition map admits dirty -> clean -> inspected | Unchanged; `DR12` chains the desk path over it |
| `services/rooms/src/server.test.ts:271-301` | Dirty straight to inspected is refused `STATE_ILLEGAL`; dirty -> clean -> inspected succeeds | Unchanged; the per-step half of `DR12` |
| `app/src/views/RoomsView.vue:168`, `:182`, `:737`, `:741` | `Mark cleaned` and `Mark inspected` are the desk housekeeping controls and post `vacant-clean` / `vacant-inspected` | Unchanged; `DR12` drives them |
| `app/src/views/StayView.vue:928-941` | The arrival pick reads `QueryCalendar` and keeps only `confirmed` entries, then reads the booking back | Unchanged; `DR13` pins that a completed booking is never offered |
| `app/src/views/StayView.vue:1139-1140` | The assignment list loads `ListRoomsByState` `vacant-inspected` only | Unchanged; `DR12` asserts the reused room appears here after inspection |
| `app/src/views/StayView.vue:1538`, `:1603`, `:1624-1634` | The desk check-out: `onCheckOut`, the `CheckOut` post, then the `ReleaseRoom` post for the vacated room | `bookingCompletion` is read for the split sentence; the release logic is untouched; `DR13` |
| `app/src/views/StayView.test.ts:1086-1203` | Review, check out, release the departed room, refresh the lists (#588) | Stays green unchanged; the same-day chain is `DR12`, the split is `DR13` |
| `app/src/views/StayView.test.ts:1207-1290`, `:1291-1310` | The #600 room-charge review and no-double-post pair | Stays green unchanged |
| `app/src/views/StayView.test.ts:1530-1579`, `:1650-1746`, `:1747-1783`, `:1940-1974` | The #588/#601 desk gates: open-balance gate, provenanced approval closes, free-form note refused, server refusal mapped to plain words | Stay green unchanged; the refusal half of `DR8`'s desk assertion |
| `app/src/views/StayView.test.ts:394-463` | The ready-room preload and one-click commit (assignment path) | Stays green unchanged; `DR12` starts from the reused room being offered |
| `app/src/views/RoomsView.test.ts:290-348`, `:349-405` | Dirty -> clean and clean -> inspected through the desk buttons | Stay green unchanged; the button half of `DR12` |
| `app/src/views/desk-edge-guards.test.ts:912-1032` (QA-EDGE-8) | The dirty room is never offered as a check-in candidate, and one close releases the departed room once and re-reads the lists | Stays green unchanged; `DR12` extends it into one same-day chain, `DR13` into the split sentence |
| `app/e2e/stay.spec.ts:30-157` | The browser flow: unpaid close refused, approval recorded, close through the confirm dialog, room released, board and map read the dirty room | Stays green unchanged; it is the browser half of the desk-stay-green row |
| `script/e2e-desk-loop.sh:418-424` | The API desk loop: close `closed` with the folio as invoice, then `ReleaseRoom` `vacant-dirty` | Stays green unchanged; it is the recipe the `DEP-*` owner cases reuse |
| `contracts/http/CheckOut.json` (`version: 1.0`) | The response has no `bookingCompletion`; the error list has no upstream code | `architect`'s additive bump only (1.0 -> 1.1, LLD 22.5); `DR7` fixtures stay valid because the field is additive |

## 3. Guard registry DR1–DR13 and the evidence rule DR-E1

All thirteen guards are **missing at this spec head** and created by
the implementation PR: `DR1`–`DR6` and `DR10`–`DR11` in
`services/reservations` (`internal/store/store_test.go`,
`internal/handler/handler_test.go`, Postgres parity
`internal/store/postgres_test.go`), `DR7`–`DR9` and `DR11` in
`services/stay/src/server.test.ts` (memory store) plus its Postgres
parity block, with the client mapping of `DR8` in
`services/stay/src/reservationsClient.test.ts`, and `DR12`–`DR13` in
`app/src/views/StayView.test.ts`
with `app/src/views/desk-edge-guards.test.ts`. A guard is not
complete on a status code alone: `DR3` and `DR8` also assert the
booking's state is unchanged, that no `reservation_changes` row was
written, and (for a route that would have released the room) that no
room state changed.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `DR1` | Completed on the close: seed a `checked-in` booking with a `stay_id` and call `CheckOutReservation` — `200` with `state: "closed"`; the stay link, dates, room type, and price basis are kept; one `reservation_changes` row names `state` with `checked-in -> closed`, the actor, and the time; the read-back returns `closed`; **no `reservation.completed` event or outbox row is written** (LLD D5) | `services/reservations/internal/handler/handler_test.go` and `internal/store/store_test.go`; Postgres parity in `postgres_test.go` (`DR11`) |
| `DR2` | Completed once: a second `CheckOutReservation` for the same `stayId` returns the same `200 closed` with no second change row and no second event; a paired simultaneous pair resolves one winner and the loser completes nothing | same file as `DR1` |
| `DR3` | Wrong state and unknown link: the `stay_id` of a booking in `confirmed` or `cancelled` returns `422 STATE_ILLEGAL` naming the state and writes nothing; an unknown `stayId` returns `404 NOT_FOUND`; a blank `stayId` or `actor` returns `400 VALIDATION_FAILED` naming the field; a missing session token returns `401 UNAUTHENTICATED` | same file as `DR1` |
| `DR4` | Availability released: a `closed` booking overlapping a new same-type booking consumes no sellable unit, so the same-day booking is accepted (create **and** modify guards); the accepted booking carries the new state, and no availability correction is needed | `services/reservations/internal/store/store_test.go` and `internal/handler/handler_test.go`; Postgres parity (`DR11`) |
| `DR5` | Negative control: a `checked-in` booking overlapping the same request still consumes the unit and is refused `409 CONFLICT` with no availability. This is the pair that proves the fix is the booking's state and not a wider availability rule | same file as `DR4` |
| `DR6` | Early departure: booking A records departure tomorrow, booking B for the same type arrives today, and A's close completes — B's booking is no longer refused from that moment; A's dates and B's booking are unchanged and no date is rewritten | same file as `DR4` |
| `DR7` | Completion is called: a committed close posts `{stayId, actor}` to `CheckOutReservation` with the caller's bearer forwarded on a stubbed client, the reply carries `bookingCompletion.state = "completed"` and a `reservationRef`, and the `checked-out` event is written exactly once | `services/stay/src/server.test.ts` (memory store) |
| `DR8` | Split is reported: for each failure mode (transport error, timeout, 5xx, unwired client, provider `NOT_FOUND`, provider `STATE_ILLEGAL`) the close still answers `200` with `state: "closed"` and `bookingCompletion.state = "not-recorded"` plus the observed reason, the stay is closed, exactly one `checked-out` event exists, and no desk refusal code is invented. A gate refusal (open balance, settlement, folio mismatch, already closed) sends no completion call at all | `services/stay/src/server.test.ts` (store half, same file as `DR7`) and `services/stay/src/reservationsClient.test.ts` (client mapping: envelope code, unreadable 5xx, abort, bounded wait, `200` without `reservationRef`) |
| `DR9` | Stay replay repairs: a replayed `idempotencyKey` returns the stored close and re-attempts the idempotent completion, so a booking that was split is completed on the replay and transitions once; a replay after a successful completion writes nothing new | same file as `DR7` |
| `DR10` | Terminal reads and refusals: the calendar row for the completed booking carries `closed` and stays inside the queried window (history keeps the past stay); `GetReservation` returns `closed`; check-in, modify, cancel, and no-show on a completed booking are each refused with the module's existing state refusal and write nothing; the handler surface exposes no reopen operation | `services/reservations/internal/handler/handler_test.go` and `internal/store/store_test.go` |
| `DR11` | Postgres parity: the completion's conditional write plus the availability pair (`DR4`/`DR5`) run over `Postgres` with the same assertions and the same change row; the Stay close's completion call and split outcomes run over `PostgresStayStore` through the transaction path | `services/reservations/internal/store/postgres_test.go` and the Postgres block of `services/stay/src/server.test.ts` |
| `DR12` | Same-day turnover chain (one case): the room released by the close reads `vacant-dirty`; `Mark cleaned` then `Mark inspected` through the desk surface advance it; the assignment list offers it as `vacant-inspected`; it is assigned and the next guest is checked in the same day; a dirty or clean-only room is never offered. One case, not one per step, so the path is pinned end to end | `app/src/views/StayView.test.ts` (chain) with `app/src/views/desk-edge-guards.test.ts` QA-EDGE-8 (never offered while dirty) |
| `DR13` | Split sentence and completed-booking exclusion: when `bookingCompletion.state` is `not-recorded` the desk renders plain words that claim no completion and never render the envelope code (a catalogue key lands in both locales if the implementation names one); the arrival pick never offers a completed booking, so a same-day return is a new booking | `app/src/views/StayView.test.ts`; `app/src/views/desk-edge-guards.test.ts` |
| `DR-E1` | Evidence rule: the implementation PR records one before/after pair in `docs/testing/evidence/646/README.md` — the owner symptom (a departed booking still `checked-in`, same-day rebooking refused) against the pre-fix build, and the completed booking plus the accepted same-day rebooking against the fixed build — and records the slice in `docs/testing/test-report.md` (section 3 exit criterion 6 of `test-strategy.md`). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row except the desk-stay-green row,
which is covered today by pins that exist and pass and must keep
passing untouched. For a pending row the guard does not exist at this
spec head: the implementation PR creates it, and `qa-lead` re-pins the
row with `file:line` at the merged head and flips it to covered only
when the guard passes.

| Item | Required guard | Guard |
|---|---|---|
| `AC-DEP-1` — a committed check-out records the booking as completed (terminal `closed`), never `checked-in`, keeps the past stay visible in history, and the room-charge review that precedes the close still resolves the booking | L1 acceptance: the completion on the close, its read-back, and its idempotence | **Pending** — `DR1`, `DR2`, `DR7`; today's opposite is pinned at `services/reservations/internal/store/store.go:108-117` and `services/stay/src/store.ts:260-292` |
| `AC-DEP-2` — after A departs, B books the same room type for arrival today and is accepted (a normal or an early departure), and no no-availability refusal is caused by A's booking | L1 acceptance: availability after completion, plus the negative control and the early-departure pair | **Pending** — `DR4`, `DR5` (negative control), `DR6`; today's guard behaviour is `services/reservations/internal/store/store.go:214-227`, `:364-380`, `services/reservations/internal/store/postgres.go:177`, `:483` |
| `AC-DEP-3` — after housekeeping marks the departed room clean then inspected, it is offered and B is checked into it the same day, with no manual state edit and the inspected-only rule intact | Behaviour check: one same-day turnover chain through the desk, plus the per-step service pins | **Pending** — `DR12`; the per-step halves exist today at `services/rooms/src/server.test.ts:271-301`, `app/src/views/RoomsView.test.ts:290-348`, `:349-405`, `app/src/views/StayView.test.ts:394-463`, `app/src/views/desk-edge-guards.test.ts:912-1032` |
| `AC-DEP-4` — a completed booking reads completed and never returns to active: check-in, modify, cancel, and no-show are refused, no reopen exists, and a same-day return is a new booking | L1 acceptance: terminal reads and the four refusals, plus the surface check | **Pending** — `DR10`, `DR2`; existing state-refusal pins `services/reservations/internal/store/store_test.go:151-172`, `:265-303` keep their assertions |
| `AC-DEP-5` — every refused close leaves the stay in house and the booking active with no release and no completion; a committed close whose completion cannot be recorded is reported in plain words instead of claiming a truth the booking read contradicts | L1 acceptance (refusal set) + split reporting + desk wording | **Pending** — `DR8`, `DR9`, `DR13`; the #588/#600/#601 refusal pins listed in section 2 stay green |
| `FR-DEP-1` — the check-out completes the booking behind the stay, resolved by the stay link, with the actor and time recorded, completed once on a replay, and nothing changed by a refused close | L1 acceptance (Reservations and Stay, memory and Postgres) | **Pending** — `DR1`, `DR2`, `DR3`, `DR7`, `DR9`, `DR11`; no guard on disk |
| `FR-DEP-2` — only `confirmed` and `checked-in` bookings hold availability, so a completed booking blocks nothing and an early departure releases the remaining nights without a date rewrite | L1 acceptance + negative control | **Pending** — `DR4`, `DR5`, `DR6`, `DR11`; the guard filters that already carry the active set are cited in section 2 |
| `FR-DEP-3` — a completed booking reads completed through read-back, calendar, and history, and completion is terminal with no reopen route | L1 acceptance + surface check | **Pending** — `DR10`, `DR2`; `FR-RES-5` / `FR-GST-1` MVP rows keep their guards |
| `FR-DEP-4` — the departed room is reusable the same day through the desk path, and the dirty or clean-only room is never offered | Behaviour chain (desk) + service pins | **Pending** — `DR12`; `FR-RMS-2` keeps its service guard and `app/src/views/RoomsView.test.ts:290-405` keeps the button pair |
| `FR-DEP-5` — every refused close completes and releases nothing, and a split is reported rather than silent | L1 acceptance (refusals) + split reporting + desk wording | **Pending** — `DR8`, `DR9`, `DR13`; the #588 release, #600 posting, and #601 gate pins stay green |
| Lifecycle `D5` — no `reservation.completed` event in this change (LLD [section 22.5](../architecture/lld.md), deferred list D5) | L1 acceptance: the completion writes no outbox row and the event contract keeps its shape | **Pending** — the assertion inside `DR1` (`DR7` counts exactly one `checked-out` event on the Stay side); `contracts/events/reservation-events.json` unchanged |
| Lifecycle `D6` — bookings already stranded by the old behaviour are not repaired (LLD [section 22.4](../architecture/lld.md), D6) | No code guard by design: an operational note plus a follow-up | **Deferred (not a code guard)** — the `release-manager` note lands at merge and the reconciliation is a named follow-up; the repair path itself is a replay of the close (`DR9`), so a stranded row is repaired by the same mechanism the guard covers |
| #588 / #600 / #601 desk behaviour stays green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`) | Behaviour check: the close still releases once, the review still posts the room charge once, and every refusal keeps its plain words; no desk flow change | **Covered by re-run at this spec head** — `app/src/views/StayView.test.ts:1086-1203`, `:1207-1290`, `:1291-1310`, `:1530-1579`, `:1650-1746`, `:1747-1783`, `:1940-1974`, `app/src/views/desk-edge-guards.test.ts:912-1032`, `app/e2e/stay.spec.ts:30-157`, `script/e2e-desk-loop.sh:418-424`. These must pass unchanged after the implementation PR; a desk flow edit fails the row |
| Contract and LC | Re-run only: the new `CheckOutReservation` provider contract with its fixture, the additive `bookingCompletion` on `CheckOut`, the existing Stay fixtures still replay unchanged, and the Stay -> Reservations seam passes the per-module contract stage | **Pending gate** — `contracts/http/CheckOutReservation.json` (new), `contracts/http/CheckOut.json` (1.0 -> 1.1), `contracts/openapi.yaml`, `services/reservations/contract-tests/`, `services/stay/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; the contract edit is `architect`'s (LLD 22.5) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-FDK-2` and `FR-RTE-2` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged in `traceability-matrix.md` and no MVP row cites this slice as its guard |
| Evidence cross-reference (`DR-E1`) | The owner symptom is recorded before and after against a lab stack, and the slice is recorded in the test report | **Pending** — `docs/testing/evidence/646/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 22.6](../architecture/lld.md)) |
|---|---|---|
| L1 service, Reservations | `DR1`–`DR6`, `DR10`, and the Postgres parity half of `DR11` | `cd services/reservations && go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"` |
| L1 service, Stay | `DR7`–`DR9` and the Postgres half of `DR11`, plus the existing check-out block; the `DR8` client mapping runs in `src/reservationsClient.test.ts` under the same command | `cd services/stay && npm ci && npm run build && npm run lint && npm test` |
| LC contract | The new provider fixture and the additive `CheckOut` field | `script/contract-check.sh`, `script/openapi-route-check.sh` |
| Desk regression (unit) | `DR12`, `DR13`, and the #588/#600/#601 pins unchanged | `cd app && npm ci && npm run build && npm test` (CI `app-build`) |
| Desk regression (browser) | `app/e2e/stay.spec.ts` on the served SPA | CI `browser-e2e` |
| Live desk loop | The API loop's close and release steps, the `DEP-*` recipe, and `DR-E1` | `script/e2e-desk-loop.sh` (CI `e2e-single-host`) |
| Gates | Links and harness conventions | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `go-build`
(reservations), `node-build` (stay), `app-build`, `contract-check`,
`migrate-check` (the reservations module changes), `browser-e2e`,
`e2e-single-host`, and `ci` (which runs the catalogue coverage and
link checks).

### Execution order

1. Reservations suite (memory store, then the Postgres parity cases
   with `DATABASE_URL` set). A red `DR*` case stops the run.
2. Stay suite (memory store, then the Postgres block).
3. Contract and route checks (the additive operation and field must
   not break the existing desk fixtures).
4. Desk unit suite, then the browser flow, then the live desk loop.
5. `DR-E1`: the before/after evidence pair against a lab stack,
   recorded.
6. Link and harness-convention gates, then the test-report row.

### Entry criteria

1. The #646 T2 spec set (`docs/product/acceptance-criteria.md`
   section 15, `docs/requirements/mvp-requirements.md` section 23,
   `docs/architecture/lld.md` section 22, `docs/architecture/state-machine.md`
   section 1.1, and this document) carries a `SPEC-GATE PASS` on #646.
2. The #588 desk release and the #600 room-charge posting are merged
   (both on `master` at this spec head), so the desk pins in section 2
   are the real baseline. The #601 settlement gate is a sibling slice;
   see section 1 for how its cases compose with this one.
3. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture
   method, `docs/testing/evidence/588/README.md`).

### Exit criteria

1. `DR1`–`DR13` exist and pass; every refusal and wrong-state case
   also asserts the booking state unchanged, no change row, and no
   event.
2. Every desk pin in section 2 passes unchanged — no dropped
   assertion and no desk flow edit.
3. The contract stage is green with the additive operation and field
   and the unchanged Stay fixtures.
4. `DR-E1` is recorded: the before/after pair in
   `docs/testing/evidence/646/README.md` and the slice row in
   `docs/testing/test-report.md`.
5. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
   section 4 at the merged head and flipped the rows.
6. Open failures are filed as issues with FR/NFR ids; no
   `risk-medium` failure is waived without owner approval.

### Negative controls

A guard that only checks a status code is insufficient.

- `DR3`, `DR8`, and `DR10` assert the booking is still in its prior
  state, that no `reservation_changes` row was written, that no
  completion was recorded, and that no room was released.
- `DR5` is the pair that keeps the fix honest: a `checked-in` booking
  must still consume the unit, otherwise "released" could be hiding a
  wider availability rule that lets the same night be sold twice.
- `DR8` also asserts the positive control beside each split: the same
  route with a reachable Reservations returns `bookingCompletion.state
  = completed`, so "not recorded" cannot hide an always-failing call.
- `DR12` asserts the refusal half of the turnover: a dirty or
  clean-only room is never offered, so same-day reuse never skips
  housekeeping (`BR-16`, `BR-28`).

## 6. Owner verification cases (DEP-1..DEP-9)

Plain-language cases the owner can run on the lab once the change
lands, using the `script/e2e-desk-loop.sh:418-424` recipe (sign-in
token, seeded room type with at least two sellable units, a booking
with a stay, `api stay CheckOut` bodies). Steps are the same for each
case unless stated: seed one in-house stay with a known folio, then
act as described and read the reply, `GetReservation`,
`QueryCalendar`, `GetStay`, and the rooms inventory.

| Case | Setup | Expected |
|---|---|---|
| `DEP-1` | Book A for room type T, arrival today, departure tomorrow; check A in to room 101; settle the folio; check A out | `CheckOut` answers `200 closed` with `bookingCompletion.state` `completed`; `GetReservation` for A reads `closed`; `QueryCalendar` for these dates still returns A's row with state `closed` (history keeps the past stay) |
| `DEP-2` | Continue from `DEP-1`: book B for type T, arrival today, departure tomorrow, with the same sellable-unit count that refused a second booking before the fix | B's booking is accepted `201`/`200 confirmed` with no `CONFLICT` no-availability refusal |
| `DEP-3` | Continue from `DEP-2`: the desk shows room 101 `vacant-dirty`; press `Mark cleaned`, then `Mark inspected` on the rooms surface; pick B's arrival and room 101 on the stay surface | 101 reads `vacant-inspected`, appears in the assignment list, is assigned, and B is checked in the same day; no dirty or clean-only room is ever offered |
| `DEP-4` | A keeps a departure of tomorrow; B books type T arrival today **before** A checks out; then A checks out early | A's booking reads `closed` with its recorded dates unchanged; B is no longer blocked and can be checked in the same day; no availability correction is made |
| `DEP-5` | On A's completed booking: attempt check-in, modify, cancel, and mark no-show through the API and the desk | Each attempt is refused with the module's existing state refusal in plain words; the booking stays `closed`; no operation reopens it; a returning guest is booked fresh |
| `DEP-6` | Three refused closes on an in-house stay: an open balance with no provenanced approval, an unreadable folio (stop Billing or unwire the client), and a replay of an already-used close | Every attempt is refused exactly as #588/#600/#601 specify; the stay stays in house, the booking still reads `checked-in`, and no room is released |
| `DEP-7` | Stop Reservations (or start Stay without its base URL), then check out a settled stay; restart Reservations and replay the same close key | The close answers `200 closed` with `bookingCompletion.state` `not-recorded` and a reason; the desk shows plain words and claims no completion; after the replay the booking reads `closed` once, with one change row |
| `DEP-8` | Inspect the reservation event stream and the change history after `DEP-1` | No `reservation.completed` event and no outbox row is written by the completion; the change history carries one `state` row with the actor and time |
| `DEP-9` | Desk regression on the same build: the #588 release, the #600 room-charge review, and the #601 unpaid-close refusal | Unchanged from their records: one release per close, one room charge per stay, the unpaid close refused on every route with the same plain words |

## 7. Evidence rule DR-E1

The implementation PR records one before/after pair in
`docs/testing/evidence/646/README.md` (created by that PR, same
capture method as the #588 record):

- Before, against the pre-fix build: guest A books type T (arrival
  today, departure tomorrow), checks in to 101, and only the stay is
  closed through `CheckOut` plus `ReleaseRoom`. A's booking still reads
  `checked-in`, `QueryCalendar` still names A as active, and B's
  same-day booking for type T is refused `CONFLICT` "no availability".
- After, against the fixed build, with the same seed: A's booking reads
  `closed` with its dates, and B's same-day booking is accepted. The
  record shows the room turnover too: 101 released `vacant-dirty`,
  marked clean, marked inspected, offered, and B checked in the same
  day.
- Plus the honest split control: with Reservations stopped, the same
  close answers `200 closed` with `bookingCompletion.state`
  `not-recorded`, and a replay after Reservations returns completes
  the booking once.

The pair reads as the owner's report line by line: the symptom, then
the same lab steps behaving as specified. The slice's results also go
to `docs/testing/test-report.md` (exit criterion 6 of the
`test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 16 rows mapped, 1 covered by re-run only (the
desk-stay-green row — its pins exist and pass today and must keep
passing), 1 deferred by design (lifecycle `D6`, an operational note
rather than a code guard), and 14 pending rows whose guards are the
registry `DR1`–`DR13` plus the contract/LC gate, the MVP no-change
gate, the lifecycle `D5` event assertion, and `DR-E1`. The slice is
**not complete**. It completes when the implementation PR merges with
`DR1`–`DR13` green, the desk pins unchanged, `DR-E1` recorded, and
`qa-lead` re-pins every row in section 4 with `file:line` at the
merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a
fabricated pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-947
