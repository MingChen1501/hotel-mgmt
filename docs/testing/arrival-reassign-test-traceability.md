# Arrival reassignment test traceability (Refs #647)

Status: active. Testing spec for the T2 arrival room reassignment and
stale-hold release change
([issue #647](https://github.com/MingChen1501/hotel-mgmt/issues/647)),
owned by `qa-lead`. It maps the done-conditions of the change —
`AC-REA-1`..`AC-REA-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 16](../product/acceptance-criteria.md) —
and the behaviour-scoped requirements `FR-REA-1`..`FR-REA-5`, owned
by `business-analyst` in
`docs/requirements/mvp-requirements.md` [section 24](../requirements/mvp-requirements.md),
to their guards: the pins that exist on disk at this spec head, the
guard registry `RR1`–`RR13`, and the evidence rule `RR-E1`.

Written before the implementation PR. Every guard in the registry is
a **named, missing obligation** at this head: no row here marks a
guard complete before it exists and passes, and the slice is not
complete until the implementation PR merges and `qa-lead` re-pins
every row at the merged head (the `#588 -> #599` pattern). Section 2
cites what is on disk today and what it proves; that table's note
column says which pins the implementation PR extends (never deletes),
and section 5 says which cases it must create.

Companion specs: the layer ownership, the definitive-versus-unreadable
rule, and the two per-flow diagrams in `docs/architecture/lld.md`
[section 23](../architecture/lld.md) (23.1 ownership, 23.2 the
compensation rule, 23.3/23.4 the two target algorithms, 23.5/23.6 the
diagrams, 23.8 the verification plan this plan aligns with, 23.9 the
residual risks R12–R16); the two release targets in
`docs/architecture/state-machine.md` [section 2.1](../architecture/state-machine.md);
the desk delta and T2 UI contract in
`docs/product/desk-ui-design-rollout.md` [section 6.17](../product/desk-ui-design-rollout.md)
with its 20-key EN+VI copy table; D-27 in
`docs/project/decision-log.md`; R-11 in `docs/project/risk-register.md`;
and the sibling tests this slice must not disturb:
`checkout-settlement-test-traceability.md` (#601, registry `S1`–`S12`),
`departure-release-test-traceability.md` (#646, registry
`DR1`–`DR13`), plus the #586/#588/#596/#600/#614 rows in
`traceability-matrix.md` sections 9–14. This spec implements no code,
changes no guard, adds no catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `architect` (LLD
  [section 23](../architecture/lld.md)): a reader-visible desk action
  over room and stay state, delivered with three operations that
  already exist (`AssignRoom`, `MoveRoom`, `ReleaseRoom`). No new
  operation, field, lifecycle state, event, schema, or migration.
- No MVP row moves. `FR-FDK-1` and `FR-FDK-3` keep their wording and
  their existing guards and gain only the amendment pointer; the
  57-row MVP coverage count in `traceability-matrix.md` stands
  unchanged and no MVP row may cite this slice as its guard. The
  slice rows live in `traceability-matrix.md` section 15.
- No new NFR. Requirements section 24.4 is a no-change statement:
  catalogue coverage, desk response, concurrency, audit, retention,
  on-premise availability, time/locale, and roles all hold with the
  existing guards.
- Contract: **no change at all** (LLD 23.7). The three operations are
  used in the shapes `contracts/http/AssignRoom.json`,
  `MoveRoom.json`, and `ReleaseRoom.json` already carry, no error code
  is added, and no event or schema changes. The LC stage is therefore a
  re-run (`script/contract-check.sh`,
  `script/openapi-route-check.sh`) and this slice adds no per-row LC
  cell.
- Guards are extended, never deleted. The #586/#596/#614 commit-window
  pins (`app/src/views/StayView.test.ts:2390-2537`, `:2538-2666`), the
  #588 release pin (`:1086-1206`), the #600 room-charge pin
  (`:1281-1362`), the #601 desk pins, and the #646 pins keep their
  assertions. The implementation PR may tighten them with a `#647`
  note but must not drop a case.
- The retired-hook pin `app/src/stay-restyle.test.ts:120-151` is
  **re-pinned**, not deleted (LLD 23.8, R16): the card and the
  `MoveRoom` call become decided additions while every other retired
  v1 hook stays absent.
- Copy: the 20 keys of rollout section 6.17 are the implementation
  PR's to add in both locales with placeholders intact. Both sentences
  the arrival half leaves implicit are keyed at the stack base — the
  arrival-compensation sentence (`desk.stay.checkin_compensated`) and
  the post-stay reservation-link sentence
  (`desk.stay.checkin_link_not_recorded`, LLD 23.9 R15) — so no copy
  work is outstanding: the implementation must not invent wording, and
  `RR13` fails an invented string rather than accepting one.
- Design facts: the one additive `Move room` card is recorded as a
  **decided addition** in the design-facts comparison (LLD R16), never
  by removing the Stay screen from that comparison.
- Disposition recorded for the gate (LLD 23.9 R14, closed at the stack
  base): `AC-REA-1` already scopes its release list to a later step
  "that does not land while no stay was recorded (the booking read or
  the stay write)" and states the post-stay split explicitly, so no
  reword is outstanding. **`FR-REA-1` governs the reservation-link
  case**: `RR4` asserts that a reservation-link failure after the stay
  committed releases nothing and reports the split, and that guard is
  the only outstanding obligation on the row — there is no
  `product-owner` follow-up left. The row is mapped that way in
  section 4 rather than left ambiguous.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head (the stack's
architecture commit `979f644`; the code tree is identical to `master`
at `61bb8dd`, since the three sibling spec PRs touch only `docs/`).
They prove today's behaviour: the assignment never comes back, and the
desk has no move path. The implementation PR extends these in place,
with a `#647` note, and never deletes one.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/rooms/src/store.ts:361-405` (`assignRoom`) | Replay by `idempotencyKey` (`:365-369`), blocked room `STATE_ILLEGAL` (`:377-385`), taken room `CONFLICT` (`:386-388`), not-ready `STATE_ILLEGAL` (`:389-394`), then the flip with history and `room.state-changed` (`:395-402`) | Unchanged. `RR1`/`RR7`/`RR9` assert the desk calls it once per action with the chosen room; `RR9` relies on the two refusals proving no write happened |
| `services/rooms/src/store.ts:407-436` (`releaseRoom`) | Occupied-only guard `STATE_ILLEGAL` (`:414-420`), explicit `toState` defaulting to `vacant-dirty`, `occupied` refused `VALIDATION_FAILED` (`:421-427`), then the write with history and event (`:428-432`) | Unchanged. The compensating release passes `vacant-inspected`; `RR2`, `RR3`, `RR6`, `RR9` assert exactly one call and the target |
| `services/rooms/src/store.ts:32-40` (`ALLOWED_TRANSITIONS`) | `occupied: ["vacant-dirty"]` — `UpdateRoomState` cannot reach `vacant-inspected`; `ReleaseRoom`'s explicit `toState` is the only path (state-machine [section 2.1](../architecture/state-machine.md)) | Unchanged. `RR6` asserts a `STATE_ILLEGAL` release answer is read as "already free", never retried as a manual state edit |
| `services/rooms/src/store.ts:398-402`, `:428-432` | The assign and release history rows plus the `room.state-changed` event | Unchanged. This is the recorded half of `FR-REA-5`; `RR6`/`RR9` read it through the desk assertions and the service pins below |
| `services/stay/src/store.ts:332-376` (`moveRoom`) | Replay by key, unknown stay `NOT_FOUND`, non-in-house `STATE_ILLEGAL`, same room `VALIDATION_FAILED`, `move {fromRoomId,toRoomId,movedAt}`, `moved` outbox row | Unchanged. `RR7`/`RR8` release the echo's `fromRoomId`; `RR9` asserts the stay-side refusal |
| `app/src/views/StayView.vue:1115-1217` (`loadCandidates` preload) | The arrival pick reads `GetReservation` and `ListRoomsByState` `vacant-inspected` and assigns nothing | Unchanged. `RR1` pins the absence of `AssignRoom` during the preload |
| `app/src/views/StayView.vue:1224-1247` (`onCheckIn` guards) | In-flight no-op, need-arrival and need-room refusals, retry after a failed preload instead of a stale commit | Unchanged. `RR1`/`RR9` keep these guard assertions |
| `app/src/views/StayView.vue:1246-1261` | One `stayId` plus the assignment key, and the `AssignRoom` post carrying `stayLink: stayId` | The assignment the compensation targets; `RR1`–`RR3` assert one call with the chosen room |
| `app/src/views/StayView.vue:1281-1295`, `:1296-1336` | The booking read and the stay write; every refusal returns without releasing the room just assigned — the reported stale hold | Extended with the outcome classification (LLD 23.3 table); `RR2`–`RR6` |
| `app/src/views/StayView.vue:999-1048` (`loadPanelData`) | `ListArrivalsDepartures` plus every room-state read; `readyRooms` is the `vacant-inspected` list (`:597`, `:1028-1030`), reloaded at `:1154` | Unchanged. `RR7`/`RR8` reuse it for the move card's picks and the post-move reload |
| `app/src/views/StayView.vue:980-996` (`renderRows`) | In-house rows carry `roomId`, the panel's remembered room | Unchanged. This is the stale-row input `RR8` proves is never the release source |
| `app/src/api/client.ts:143-197` (`apiFetch`) | Offline throws `code: "OFFLINE"` with no status (`:160-167`), `401` routes to the gate (`:169-171`), a non-envelope `!ok` surfaces the status as the code (`:186-196`) | The definitive/unreadable split reads these fields; `RR5` pins no release on the unreadable set |
| `app/src/stay-restyle.test.ts:120-151` (retired-hook pin) | `data-testid="stay-move-card"`, `stay-move-room`, `/v1/stay/MoveRoom`, and `onMove` are listed as absent on purpose | Re-pinned for the decided card and call (`RR10`); every other hook stays absent and nothing is deleted |
| `app/src/views/StayView.test.ts:394-463` | Ready-room load and one-click commit | Extended into the switch-after-preload case (`RR1`); existing assertions stay |
| `app/src/views/StayView.test.ts:555-599` | Single ready-room candidate auto-select | Stays green unchanged |
| `app/src/views/StayView.test.ts:1029-1058`, `:1059-1085` | Taken-room and already-checked-in refusals map to plain catalogue sentences | Stay green; `RR9`'s lead refusal reuses the pattern |
| `app/src/views/StayView.test.ts:2253-2279` | A double-clicked check-in assigns once | Extended: one compensation at most (`RR9`) |
| `app/src/views/StayView.test.ts:2390-2537`, `:2538-2666` | The #586/#596/#614 commit-window guards (`AC-DSK-17`) | Stay green unchanged; the release ordering sits inside the same window |
| `app/src/views/StayView.test.ts:1086-1206`, `:1281-1362` | The #588 check-out release and the #600 room-charge review | Stay green unchanged |
| `app/src/views/desk-edge-guards.test.ts:899-1033` (QA-EDGE-8), `:1449-1700` (same-day chain) | The dirty room is never a check-in candidate; one close releases once; the same-day reuse chain | Stay green unchanged |
| `services/rooms/src/server.test.ts:328-354`, `:355-381`, `:455-500` | One winner on paired assignment, idempotent assignment replay, and the rooms-side move end to end (assign, release `vacant-dirty`, walk back, re-assign) | Stay green; they are the service half of `RR7`/`RR9` |
| `services/stay/src/server.test.ts:241-258`, `:259-292`, `:406-460` | A move keeps both rooms and the time in history; unknown/closed/same-room refusals; Postgres parity | Stay green; the durable move record `FR-REA-5` cites |
| `script/e2e-desk-loop.sh:342-348` | The API desk loop's assign 102 / move / release 101 to `vacant-dirty` chain | Unchanged; it is the recipe the `REA-*` owner cases and `RR-E1` reuse |
| `app/e2e/stay.spec.ts:30-177` | The browser flow: check-in, unpaid refusal, approval, dialog check-out, room release | Extended with the two switch scenarios (`RR11`) |
| `app/e2e/design-facts.spec.ts:183-460` | The Stay screen's extracted design facts | Extended so the additive card is a decided fact (`RR12`), not an exemption |
| `messages/en.json:472`, `messages/vi.json:472` (`desk.stay.room_already_free`) | The already-free sentence exists in both locales | Reused for the release-found-a-free-room answer on both paths; `RR6` |
| `contracts/http/AssignRoom.json`, `MoveRoom.json`, `ReleaseRoom.json` | The three operations with `stayLink`, the `move` echo, and the explicit `toState` | Unchanged (LLD 23.7); the existing fixtures stay valid and must replay |

## 3. Guard registry RR1–RR13 and the evidence rule RR-E1

All thirteen guards are **missing at this spec head** and created by
the implementation PR: `RR1`–`RR9` in
`app/src/views/StayView.test.ts`, `RR10` in
`app/src/stay-restyle.test.ts`, `RR11`/`RR12` in `app/e2e/`, and
`RR13` across `messages/en.json`, `messages/vi.json`, and
`script/catalogue-coverage-check.sh`. A desk guard is not complete on
a rendered sentence alone: every refusal case also asserts the exact
call list (which operations ran, in which order, how many times) and
the end state the desk reports, because the defect this slice fixes is
an ordering defect and a sentence can be right while the calls are
wrong.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `RR1` | **Switch after preload**: the preload issues no `AssignRoom`; picking room 102 after a preload that loaded the booked type's ready rooms (101 included) commits exactly one `AssignRoom` naming 102 with `stayLink` equal to the generated stay id, and 101 is never written | `app/src/views/StayView.test.ts` |
| `RR2` | **Arrival compensation at the booking read**: a definitive `GetReservation` refusal after the assignment issues exactly one `ReleaseRoom` with `toState: "vacant-inspected"` for the assigned room, no `CheckIn`, the plain refusal sentence, and the freed-room sentence once the key exists (LLD R15) | same file |
| `RR3` | **Arrival compensation at the stay write**: a definitive `CheckIn` refusal (the already-checked-in case) after the assignment issues exactly one `ReleaseRoom` `vacant-inspected`, no `CheckInReservation`, and the same plain pair of sentences | same file |
| `RR4` | **Reservation link refused after the stay landed**: a `CheckInReservation` refusal after a committed `CheckIn` issues **no** `ReleaseRoom`; the stay stays in house, the room stays occupied, and the desk reports the split in plain words without claiming the link. This is the guard behind the `AC-REA-1` / `FR-REA-1` disposition (LLD R14) | same file |
| `RR5` | **Unreadable outcomes release nothing**: an offline throw, a 5xx envelope, and a non-envelope failure at the assignment, the booking read, and the stay write each issue no `ReleaseRoom` and render the room-naming reload sentence, never a freed-room claim; the positive control in the same fixture proves a definitive refusal on the same step does release, so "no release" cannot hide an always-silent path | same file |
| `RR6` | **A compensation that fails is named**: a refused or unreadable compensating `ReleaseRoom` renders the room-still-occupied sentence and claims no free room; a `STATE_ILLEGAL` (not occupied) answer renders `desk.stay.room_already_free` instead, and no `UpdateRoomState` call is made | same file |
| `RR7` | **Reassignment after a committed check-in**: the move card assigns the target, moves the stay, then releases the echo's `move.fromRoomId` to `vacant-dirty` — asserted as the call order, not only the end state — and the receipt names the guest, both room numbers, and `move.movedAt` in the hotel's local time; the board and room lists reload | same file |
| `RR8` | **Mid-stay move on the same path**: an earlier-day in-house stay moved to a ready room keeps `state: in-house` and the folio link, records the move, releases the old room to `vacant-dirty`, and releases the echo's `fromRoomId` even when the panel's remembered row names a different room (the stale-row case) | same file |
| `RR9` | **Partial-failure ordering**: a lead refusal (`CONFLICT` target) issues no `MoveRoom` and no `ReleaseRoom`; a stay-side definitive refusal compensates the target once with `toState: "vacant-inspected"` and claims no move; a release that fails after the move committed names the old room and rolls nothing back (no second `AssignRoom`, no second `MoveRoom`); an unreadable outcome names both rooms; a replayed or double-clicked action performs one compensation at most | same file |
| `RR10` | **Retired-pin re-pin**: `app/src/stay-restyle.test.ts` keeps every retired v1 hook absent except `data-testid="stay-move-card"`, `stay-move-room`, and the `/v1/stay/MoveRoom` call, which are asserted present as decided additions | `app/src/stay-restyle.test.ts` |
| `RR11` | **Browser switch scenarios**: one switch-after-preload scenario and one switch-after-commit scenario assert on the served SPA that the desk board and the Rooms map show only the room the guest is in, and that the vacated room reads vacant | `app/e2e/stay.spec.ts` |
| `RR12` | **Design fact**: the additive `Move room` card is recorded in the design-facts comparison as a decided addition for the Stay screen; the screen is still compared and no exemption silences it | `app/e2e/design-facts.spec.ts` |
| `RR13` | **Catalogue**: all 20 keys of rollout section 6.17's table exist in `messages/en.json` and `messages/vi.json` with their placeholders intact and their EN/VI pairs matching the table, including the two keyed sentences `desk.stay.checkin_compensated` and `desk.stay.checkin_link_not_recorded` (LLD 23.9 R15); no invented string stands in for a table key (the case fails on an invented key, not on an absent one); `script/catalogue-coverage-check.sh` is green | `messages/en.json`, `messages/vi.json`, `script/catalogue-coverage-check.sh` |
| `RR-E1` | **Evidence rule**: the implementation PR records the isolated-compose lab reproduction of the owner symptom — **which path leaves the stale hold** (switch after a preload, switch after a commit, or a mid-stay move) — in the PR body or an issue comment as the issue's scope requires, records the before/after pair in `docs/testing/evidence/647/README.md`, and records the slice in `docs/testing/test-report.md` (section 3 exit criterion 6 of `test-strategy.md`). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row except the desk-stay-green row,
which is covered today by pins that exist and pass and must keep
passing untouched. For a pending row the guard does not exist at this
spec head: the implementation PR creates it, and `qa-lead` re-pins the
row with `file:line` at the merged head and flips it to covered only
when the guard passes.

| Item | Required guard | Guard |
|---|---|---|
| `AC-REA-1` — the commit assigns only the room the guest is in, and a definitive failure of a step that leaves no stay behind releases the assigned room back to `vacant-inspected` with a plain refusal; an unreadable outcome releases nothing. Read with `FR-REA-1` governing the reservation-link case (section 1, LLD R14) | L1 acceptance: switch after preload, both compensating failures, the post-stay split, and the unreadable set | **Pending** — `RR1`, `RR2`, `RR3`, `RR4`, `RR5`; today's opposite is pinned at `app/src/views/StayView.vue:1246-1261` and `:1281-1336`, with the existing refusal patterns at `app/src/views/StayView.test.ts:1029-1085`, `:2253-2279` |
| `AC-REA-2` — after a committed check-in in 101, reassigning to 102 leaves 102 occupied, 101 vacant and dirty, the board and the Rooms map showing only 102, the stay in house with its folio link, and the move (from, to, time) kept and shown | L1 acceptance + browser end state | **Pending** — `RR7`, `RR11`; the service halves exist at `services/rooms/src/server.test.ts:455-500` and `services/stay/src/server.test.ts:241-258` and stay green |
| `AC-REA-3` — no room is left occupied by an aborted reassignment: a refusal before the target assignment changes nothing, one after it releases the target back to ready, a failing compensation is named, an unreadable outcome releases nothing, and the refusal is one plain sentence | L1 acceptance: the four ordering cases | **Pending** — `RR6`, `RR9`; the room-side release guard it relies on is `services/rooms/src/store.ts:407-436` |
| `AC-REA-4` — an earlier-day in-house stay moves to another ready room through the same single path: the old room becomes vacant and dirty, the stay names the new room, the move is kept, and the stay's in-house state and folio link are unchanged | L1 acceptance on the same desk path | **Pending** — `RR8`; the stay-side behaviour is pinned today at `services/stay/src/server.test.ts:241-292`, `:406-460` |
| `AC-REA-5` — the four regression cases each carry a unit guard plus the e2e/lab guard, the existing check-in, release, charge, settlement, and departure guards stay green, the copy exists in both locales, and the one decided UI fact is recorded | L1 + browser + catalogue + design-facts | **Pending** — `RR1`–`RR13` and `RR-E1`, with the green half on the desk-stay-green row and the catalogue/design gates in `RR12`/`RR13` |
| `FR-REA-1` — the commit assigns the chosen room and takes back the assignment when a step that leaves no stay fails definitively; the post-stay split is reported and releases nothing; an unreadable step releases nothing; one compensation per action | L1 acceptance, all five branches | **Pending** — `RR1`, `RR2`, `RR3`, `RR4`, `RR5`, `RR6`, `RR9` (one-compensation half) |
| `FR-REA-2` — the desk reassigns a checked-in guest and releases the vacated room to `vacant-dirty` in the same commit window, in the order assign, move, release, with the move kept and shown | L1 acceptance + call-order assertion | **Pending** — `RR7`, `RR11`; the rooms-side order already exists at `services/rooms/src/server.test.ts:455-500` |
| `FR-REA-3` — a refused or aborted reassignment leaves no room occupied by the attempt, and the compensating release targets `vacant-inspected` | L1 acceptance + compensation target | **Pending** — `RR6`, `RR9`; `services/rooms/src/server.test.ts:328-354`, `:355-381` keep the one-winner and replay halves |
| `FR-REA-4` — a mid-stay move runs the same single path with the same ordering and refusals, and the stay keeps its in-house state and folio link | L1 acceptance on the same card | **Pending** — `RR8`; no second mechanic may appear (`RR10` asserts no second card hook) |
| `FR-REA-5` — the reassignment is recorded, visible, and guarded: the move keeps from-room, to-room, time, and actor; the desk names both numbers and the time; the four cases carry unit plus e2e/lab guards; every new string is in both locales; the decided card is a recorded design fact | L1 + audit + browser + catalogue + design-facts | **Pending** — `RR7`/`RR8` (receipt), `RR10` (re-pin), `RR11`, `RR12`, `RR13`; the durable record is pinned today at `services/stay/src/server.test.ts:241-258` and `services/rooms/src/store.ts:398-402`, `:428-432` and must stay green |
| `AC-REA-1` / `FR-REA-1` disposition (LLD R14, closed at the stack base) | The gate sees the reading and the guard that proves it; the criterion already scopes its release list and both copy points are keyed (LLD R15), so no reword or copy follow-up remains | **Pending** — `RR4` (`app/src/views/StayView.test.ts`, created by the implementation PR) is the guard and the only outstanding obligation on the row |
| Desk flows stay green (`AC-DSK-17`, `AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`) | Behaviour check: the preload and commit window, the check-out release, the room charge, the settlement refusals, and the departure completion keep their words and calls; no desk flow they pin changes | **Covered by re-run at this spec head** — `app/src/views/StayView.test.ts:2390-2537`, `:2538-2666`, `:1086-1206`, `:1281-1362`, `:1530-1579`, `:1650-1783`, `:1940-1974`, `app/src/views/desk-edge-guards.test.ts:899-1033`, `:1449-1700`, `app/e2e/stay.spec.ts:30-177`, `script/e2e-desk-loop.sh:342-348`. These must pass unchanged after the implementation PR; a flow edit fails the row |
| Contract and LC | Re-run only: the three operations keep their shapes, no error code is added, and the existing fixtures replay unchanged | **Pending gate** — `contracts/http/AssignRoom.json`, `MoveRoom.json`, `ReleaseRoom.json`, `contracts/errors/envelope.json`, `services/rooms/contract-tests/`, `services/stay/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a contract delta here is a re-tier finding (LLD 23.7, 23.9) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-FDK-1` and `FR-FDK-3` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged in `traceability-matrix.md` and no MVP row cites this slice as its guard |
| Evidence cross-reference (`RR-E1`) | The stale-hold path is recorded from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/647/README.md` and the `test-report.md` row are created by the implementation PR; the reproduction path is also recorded in that PR's body or an issue comment |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 23.8](../architecture/lld.md)) |
|---|---|---|
| L1 service, Rooms | The assign / release / move pins of section 2 unchanged, including the `vacant-inspected` release target | `cd services/rooms && npm ci && npm run build && npm test` |
| L1 service, Stay | The move pins and the Postgres move parity unchanged | `cd services/stay && npm ci && npm run build && npm test` |
| LC contract | The three unchanged operation fixtures and the Rooms/Stay seams | `script/contract-check.sh`, `script/openapi-route-check.sh` |
| Desk unit | `RR1`–`RR10` plus the #586/#588/#596/#600/#601/#614/#646 pins unchanged | `cd app && npm ci && npm run build && npm run lint && npm test` (CI `app-build`) |
| Desk browser | `RR11`, `RR12`, and the existing `app/e2e/stay.spec.ts` flow on the served SPA | CI `browser-e2e` |
| Design-fact extraction | The Stay screen's extracted facts carry the decided card | the extractor step plus the Playwright step in `.github/workflows/ci.yml` |
| Live desk loop and lab | The assign / move / release chain, the `REA-*` recipes, and `RR-E1` | `script/e2e-desk-loop.sh` (CI `e2e-single-host`); the isolated-compose lab for the reproduction record |
| Gates | Catalogue, links, harness conventions | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR:
`app-build`, `browser-e2e`, `dom-diff`, `node-build` (rooms and stay),
`contract-check`, `e2e-single-host`, and `ci` (which runs the catalogue
coverage and link checks).

### Execution order

1. Service suites (rooms, then stay) — the green half must be green
   before the desk cases are read, because `RR7`/`RR9` depend on their
   behaviour, not on new service code.
2. Contract and route checks (the re-run must prove the no-change
   statement).
3. Desk unit suite (`RR1`–`RR10`). A red `RR*` case stops the run.
4. Desk browser suite (`RR11`, `RR12`), then the live desk loop.
5. `RR-E1`: the lab reproduction record and the before/after pair.
6. Catalogue, link, and harness-convention gates, then the
   test-report row.

### Entry criteria

1. The #647 T2 spec set (`docs/product/acceptance-criteria.md`
   section 16, `docs/product/desk-ui-design-rollout.md` section 6.17,
   `docs/requirements/mvp-requirements.md` section 24,
   `docs/architecture/lld.md` section 23,
   `docs/architecture/state-machine.md` section 2.1, and this document)
   carries a `SPEC-GATE PASS` on #647 / the spec stack.
2. The #586/#596/#614 commit-window slices, the #588 release, the #600
   room charge, the #601 settlement gate, and the #646 departure
   release are merged (all on `master` at this spec head), so the desk
   pins in section 2 are the real baseline.
3. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture
   method, `docs/testing/evidence/588/README.md`).

### Exit criteria

1. `RR1`–`RR13` exist and pass; every refusal case also asserts the
   call list, that no unplanned write happened, and that the end state
   the desk reports matches the rooms and stay reads.
2. Every pin in section 2 passes unchanged — no dropped assertion and
   no flow edit; `RR10` proves the retired-hook pin was re-pinned
   rather than relaxed.
3. The contract stage is green with no contract delta.
4. `RR-E1` is recorded: the stale-hold path, the before/after pair in
   `docs/testing/evidence/647/README.md`, and the slice row in
   `docs/testing/test-report.md`.
5. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
   section 4 at the merged head and flipped the rows.
6. Open failures are filed as issues with FR/NFR ids; no
   `risk-medium` failure is waived without owner approval.

### Negative controls

A guard that only checks the rendered sentence is insufficient.

- `RR2`, `RR3`, `RR4`, `RR5`, and `RR9` each assert the exact call
  list, so a sentence can never pass while the release is missing or
  doubled.
- `RR4` is the pair that keeps the compensation honest: releasing a
  room a live stay names would be worse than the stale hold, so the
  post-stay split must release nothing.
- `RR5` carries its own positive control: the same fixture with a
  definitive refusal must release, otherwise "no release" could hide
  an always-silent path.
- `RR9` asserts the no-rollback decision: a release that fails after
  the move names the old room and never writes a second move or a
  second assignment. `RR6` proves the already-free answer is read as
  success rather than retried.
- `RR10` fails a deleted pin, not only a missing hook: relaxing the
  retired-hook list to silence the card is the failure mode it guards.

## 6. Owner verification cases (REA-1..REA-9)

Plain-language cases the owner can run on the lab once the change
lands, using the `script/e2e-desk-loop.sh:342-348` recipe (sign-in
token, seeded room type with at least two ready rooms, a booking with
a stay, `api rooms AssignRoom` / `api stay MoveRoom` /
`api rooms ReleaseRoom` bodies) plus the desk. Steps are the same for
each case unless stated: seed guest A arriving today, then act as
described and read the reply, `GetStay`, `ListRoomsByState` for both
rooms, and the desk board and Rooms map.

| Case | Setup | Expected |
|---|---|---|
| `REA-1` | Open A's arrival so the panel preloads the ready rooms (101 among them), pick 102, then check in | Only 102 is assigned and reads occupied; 101 still reads `vacant-inspected`; the stay names 102; the preload issued no assignment |
| `REA-2` | Preload A's arrival, pick 101, then make the booking read fail before the commit lands | 101 reads `vacant-inspected` again; the desk says the check-in was refused and the room is free; no stay exists |
| `REA-3` | Pick 101, commit against a booking that is already checked in | One release back to ready; the desk names 101 as free; no half stay, no second assignment |
| `REA-4` | Check A in to 101, then make the reservation link fail on the same commit | 101 stays occupied and A's stay stays in house; the desk reports that the booking link is not recorded, without claiming a release |
| `REA-5` | Stop a service mid-commit (or drop the network) and commit | Nothing is released; the desk names the room and asks staff to reload and check before acting again |
| `REA-6` | A is committed in 101; reassign to 102 through the `Move room` card | 102 occupied, 101 `vacant-dirty`, the board and map show only 102; the receipt names A, 101, 102, and the time; `stay_moves` keeps from, to, time, actor |
| `REA-7` | Next day, move A from 102 to another ready room | Same single path; old room `vacant-dirty`; the stay stays in house with its folio link; the move is recorded |
| `REA-8` | Reassign A to a room another desk takes at the same moment; then repeat with a stay that closed under the desk | First: one plain refusal, nothing moves. Second: the target goes back to ready and the desk says the move was refused and the target is free |
| `REA-9` | Desk regression on the same build: the #586/#596/#614 commit window, the #588 release, the #600 room charge, the #601 unpaid-close refusal, and the #646 departure split; then read the desk in both locales | Unchanged from their records; every new string appears in EN and VI with its room numbers and time filled in |

## 7. Evidence rule RR-E1

The implementation PR records, in `docs/testing/evidence/647/README.md`
(created by that PR, same capture method as the #588 record), one
before/after pair plus the reproduction finding:

- **Which path leaves the stale hold.** The issue's scope asks for the
  reproduction record: the lab run identifies whether the hold comes
  from a switch after a preload, from a switch after a commit (an
  aborted commit that kept its assignment), or from a mid-stay move,
  and the PR body or an issue comment states which. The as-built trace
  in section 2 predicts the aborted commit at
  `app/src/views/StayView.vue:1281-1336` and the missing post-commit
  path; the record confirms or corrects that prediction rather than
  repeating it.
- **Before**, against the pre-fix build, with the seeded room numbers
  101 and 102: the reproduced path leaves 101 `occupied` with a
  `stayLink` that no stay row answers (arrival), and the desk offers no
  action that clears it — the exception today is a manual room-state
  edit or a direct API call.
- **After**, against the fixed build, the same steps: the aborted
  commit leaves 101 `vacant-inspected` with the pair visible in
  `rooms.room_status_history`, and the reassignment path leaves 101
  `vacant-dirty`, 102 `occupied`, and one `stay_moves` row naming from,
  to, time, and actor.
- **Plus the honest positive control:** a switch after a preload
  commits to the chosen room only, and 101 is never written — so the
  fix is the ordering, not a wider release rule.

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 15 rows mapped, 1 covered by re-run only (the
desk-stay-green row — its pins exist and pass today and must keep
passing), and 14 pending rows whose guards are the registry
`RR1`–`RR13` plus the contract/LC gate, the MVP no-change gate, the
`AC-REA-1` / `FR-REA-1` disposition row, and `RR-E1`. The slice is
**not complete**. It completes when the implementation PR merges with
`RR1`–`RR13` green, the section 2 pins unchanged, `RR-E1` recorded,
and `qa-lead` re-pins every row in section 4 with `file:line` at the
merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a
fabricated pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-962
