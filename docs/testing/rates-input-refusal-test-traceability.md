# Rates fail-closed input test traceability (Refs #633)

Status: active. Testing spec for the T2 Rates fail-closed input change
([issue #633](https://github.com/MingChen1501/hotel-mgmt/issues/633),
audit findings T1–T3), owned by `qa-lead`. It maps the change's
done-conditions — `AC-RTE-6`..`AC-RTE-10`, owned by `product-owner` in
`docs/product/acceptance-criteria.md`
[section 30](../product/acceptance-criteria.md#30-rates-refuses-malformed-restriction-and-availability-input-refs-633)
— the behaviour-scoped requirements `FR-RTE-6`..`FR-RTE-10` and the
business rule `BR-68`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 38](../requirements/mvp-requirements.md#38-rates-refuses-malformed-restriction-and-availability-input-refs-633)
and `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), to their
guards: the pins that exist on disk at this spec head, the guard
registry `RTE1`–`RTE14`, and the evidence rule `RTE-E1`.

Written before the implementation PR. Every guard in the registry
except the covered-by-re-run rows is a **named, missing obligation** at
this head: no row marks a guard complete before it exists and passes,
and the slice is not complete until the implementation PR merges and
`qa-lead` re-pins every row at the merged head (the `#588` → `#599`,
`#601`, and `#631` pattern). Section 2 cites what is on disk today and
what it proves; section 4 says which rows the implementation PR creates
and which pins it re-seeds (never deletes).

Companion specs: LLD
[section 37](../architecture/lld.md#37-rates-refuses-malformed-restriction-and-availability-input-refs-633)
(where each check sits, the `totalUnits` precedence rule, the overflow
helper set, the per-flow diagrams, and the verification plan this plan
aligns with), HLD
[section 29](../architecture/hld.md#29-rates-refuses-malformed-restriction-and-availability-input-refs-633),
the refreshed Rates flowcharts
([sections 3–4](../architecture/services/rates.md)), the error-vocabulary
delta (`docs/technical/error-handling.md`
[section 1.7](../technical/error-handling.md)), product
`AC-RTE-6`..`AC-RTE-10` with D-42
([decision log](../project/decision-log.md)) and R-23
([risk register](../project/risk-register.md)), requirements section 38
with its own `qa-lead` handoff, and `BR-68`. This spec implements no
code, changes no guard, adds no catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2 (behaviour change; recorded by `product-owner` in the issue
  and acceptance-criteria section 30, confirmed in LLD section 37):
  four existing operations gain a refusal and one read stops answering
  a caller value, so their caller-visible answers move — while every
  operation, route, request and response field, status, envelope token,
  schema table, lifecycle state, desk surface, label, and print rule
  stays as it is. No new subsystem, dependency edge, data model, or
  code token appears, so no T3 escalation and no ADR.
- The change is five rules on one existing surface:
  `UpsertRestriction` (the boolean and the priced-type check),
  `CheckSellableCount` (the count is the plan default, `totalUnits`
  inert), `QuotePrice` (the overflow guard), and `UpsertRatePlan` (the
  two text bounds and the non-string refusals). The whole surface is
  `services/rates/internal/handler/handler.go:157-333`,
  `services/rates/internal/store/store.go:139-371`, and
  `services/rates/internal/store/postgres.go:83-406`.
- The availability count's precedence is **unconditional**: the count
  is the first plan in name order that prices the type and carries a
  `defaultUnits`, else `0`, and a request-carried `totalUnits` never
  sets it. The test plan must therefore carry both directions — a small
  value must not hide availability and a huge value must not buy any —
  because a guard that only proves "a large value does not raise" would
  pass an implementation that also lowers the count.
- "Priced" means a rate-price row, never a plan `defaultUnits`
  (`BR-44`). A plan that carries a `defaultUnits` and no price row does
  not satisfy the restriction check; `RTE4` carries that case so an
  implementation that tests the wrong thing fails.
- The reservation ceiling is **neither raised nor lowered**: Reservations
  still derives `totalCount - len(blockedRooms)` from the Rooms
  sellability read (ADR-0006 D2, `AC-OVB-1`;
  `services/reservations/internal/availability/client.go:45-56`), never
  reads `totalUnits` (no service outside Rates calls
  `CheckSellableCount` at all), and no Reservations file, client,
  fixture, or guard is edited. `RTE14` diff-gates this.
- The desk is unchanged. No desk screen sends `UpsertRestriction` or
  `CheckSellableCount`; the Manage panel sends `UpsertRatePlan` and
  `UpsertRatePrice` only, and its existing plain failure sentence renders
  any new plan refusal, so no desk file may appear in the implementation
  diff. The one browser flow that writes a restriction does so through
  the API helper on a **priced** type (section 2), so it stays green
  with no edit and `RTE14` re-runs it.
- No new NFR and no stored-shape change. The five rules are fixed code
  rules, never per-hotel configuration (`BR-68`, requirements section 9),
  and no migration, column, backfill, truncation, or stored-value
  rewrite is added; `NFR-BND-1`..`NFR-BND-3`, `NFR-CON-1`,
  `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-AUD-1`, and `NFR-TZ-1`
  hold as written. `NFR-I18N-1` holds through new catalogue keys, not
  new literal copy.
- Two already-recorded consequences are **not** repair obligations:
  restriction windows stored today with a coerced `false` keep that
  value, and a price row already stored above the quote guard's range is
  not rewritten (it refuses quotes for its type until corrected, R-23).
  No guard may assert a repair.
- No MVP row moves. `FR-RTE-1`, `FR-RTE-2`, `FR-RTE-4`, and `FR-RTE-5`
  keep their capability wording; the new obligations live in
  `FR-RTE-6`..`FR-RTE-10`. The 57-row MVP coverage count in
  [traceability-matrix.md](traceability-matrix.md) stands unchanged and
  no MVP row may cite this slice as its guard. The slice rows live in
  traceability-matrix section 30.
- Guards are extended, never deleted. The existing restriction,
  availability, quote, and plan guards keep their assertions; the
  implementation PR adds the new cases beside them and re-seeds the four
  fixtures section 2 names, which today would be refused by the new
  rules. Dropping an existing assertion instead of re-seeding is drift
  and fails `RTE14`.
- `UpsertRatePrice`'s room-type shape check is explicitly out of scope
  (requirements 38.6): the same class of defect, but #633 does not name
  it. No guard in this slice may assert a price write's room-type
  refusal, and the implementation PR must not add one.
- The finding itself is the before-state, recorded by `RTE-E1`: a JSON
  `"true"` restriction stores `false` and never applies, an unpriced
  `roomTypeId` stores a window that matches nothing, a caller's
  `totalUnits` becomes the answer the desk reads, an overflowing quote
  serves a wrapped total, and a 65-character plan name is stored
  unbounded.

## 2. Pins on disk at this spec head

The pins below exist at this head and prove what the "unchanged" and
"covered by re-run" rows rest on. They were re-read for this spec; none
is promised, none is a placeholder. Where a row names one of
`RTE1`–`RTE14` the guard itself is listed in section 3 (it does not
exist yet).

| Pin | What it proves today |
|---|---|
| `services/rates/internal/handler/handler.go:234` | `closed, _ := body["closedToArrival"].(bool)` — the coercion T1 names: `"true"`, `1`, `"yes"`, and `null` all become `false` and are passed to the store at `:235` |
| `services/rates/internal/handler/handler.go:208-241` | The whole restriction write path: required-field and date checks (`:209-233`), the coercion (`:234`), the store call (`:235`), the echo (`:240`) — where the boolean check must land and where the response shape is asserted |
| `services/rates/internal/store/store.go:198-213` | The in-memory restriction write: date checks (`:200-207`), then an unconditional append (`:211`) and `restriction-changed` emit (`:212`) with no room-type shape or price-row test — the silent-no-op hole |
| `services/rates/internal/store/postgres.go:149-175` | The Postgres write: same date checks, the `22P02` answer surfaced as `VALIDATION_FAILED` naming `roomTypeId` (`:170-172`), the insert (`:164-169`), the outbox emit (`:175`) — the answer the in-memory store must match |
| `services/rates/internal/store/store.go:320-322` | `CheckRestrictions` refuses only a stored `closedToArrival: true` window covering the arrival, naming `closed-to-arrival` — the behaviour a correct write must preserve and a coerced write silently loses |
| `services/rates/internal/handler/handler.go:315-322` | The existing `totalUnits` shape check (`rates.validation.total_units`) that stays as is, and `:324` the store call that must stop carrying the value |
| `services/rates/internal/store/store.go:333-377` | The count path today: the plan scan runs **only** when `totalUnits` is nil (`:347-355`), the caller value is echoed (`:373-377`), and the unknown-type answer splits on the field's presence — `NOT_FOUND` absent (`:364-366`), `VALIDATION_FAILED` `rates.validation.no_inventory` present (`:367-369`) |
| `services/rates/internal/store/postgres.go:368-415` | The Postgres twin of the same split (`:396-401` count query, `:402-404` / `:405-407` the two unknown-type answers) — the parity target |
| `services/rates/internal/store/store.go:241-295` | The quote body: the 730-night cap (`:254`), the per-night price lookup and night append (`:265-273`), the unchecked sum (`:274`), the truncated percent result (`:284`), and the zero clamp after an amount discount (`:286-289`) |
| `services/rates/internal/store/postgres.go:245-308` | The Postgres quote twin: same cap, unchecked sum (`:289`), percent (`:303`), subtract and clamp (`:305-308`) |
| `services/rates/internal/store/store.go:29-39` | The three error constructors (`validation`, `notFound`, `stateIllegal`) the new refusals reuse — no new code token |
| `services/rates/internal/handler/handler.go:34-41` | `writeOpError`: the shared envelope shape — `code`, `message`, `details`, and a fresh `traceId` — that every refusal case must assert |
| `services/rates/internal/store/store.go:161-176`, `postgres.go:83-113` | `UpsertRatePlan` in both stores: name as the key, description stored verbatim, `defaultUnits` kept on an update that omits it — no bound and no type test anywhere, which is the T3 hole |
| `services/rates/internal/handler/handler.go:157-177` | The plan write handler: `name` required with no length (`:158-162`), `description` coerced to `""` when not a string (`:163`), `defaultUnits` (`:164-174`), and the echo (`:176`) — where the bound and type checks land |
| `services/rates/migrations/000002_schema.up.sql:19-20`, `:35` | `name TEXT`, `description TEXT` with no length, and `CHECK (price_minor >= 0)` — the schema allows any `int64` at or above zero, so the overflow guard must be a code rule, not a stored-price ceiling |
| `services/rates/internal/handler/handler_test.go:15-32`, `:34-45` | The `post` helper (status + decoded body) and `seedLoop` (one plan with `defaultUnits: 1` plus two nights at 12 000) — the fixture every new case reuses |
| `services/rates/internal/handler/handler_test.go:47-74` | `TestDeskLoopSetRateSearchQuote`: sends `totalUnits: 1` with a plan default of `1` and asserts three date entries — the value is indistinguishable from the plan default, so the guard cannot tell an inert field from an honoured one |
| `services/rates/internal/handler/handler_test.go:99-114` | `TestRestrictionRefusalNamesRestriction`: a min-stay write on a **priced** type (priced through `seedLoop`), then the 422 naming `min-stay` — the accepted write path the new refusals must not break |
| `services/rates/internal/handler/handler_test.go:116-137` | `TestClosedToArrivalRefusalNamesRestriction`: a `closedToArrival: true` window is stored, an arrival inside refuses `STATE_ILLEGAL` naming `closed-to-arrival`, an arrival outside passes — the accepted-boolean half of `AC-RTE-6` |
| `services/rates/internal/handler/handler_test.go:138-164`, `:165-195` | `TestQuoteAppliesAmountDiscount` (floor at zero) and `TestQuoteBreakdownSumsToTotal` (two nights sum to 24 000, 10 % discount answers 21 600) — the byte-identical non-overflow half of `AC-RTE-9` |
| `services/rates/internal/handler/handler_test.go:208-216` | `TestUnknownOperationAnswersEnvelope`: the shared-envelope and fresh-`traceId` assertion shape every refusal case reuses |
| `services/rates/internal/store/store_test.go:21-49`, `:50-70`, `:71-95`, `:96-130` | The quote guards at store level: `no_rate_price` / `no_rate_plan` reasons, two nights totalling 24 000, and the 730-night cap with the 731-night `VALIDATION_FAILED` — the byte-identical side of `AC-RTE-9` |
| `services/rates/internal/store/postgres_test.go:13-25`, `:27-40` | `pgTestDB` skips without `TEST_PG_URL`, and `pgWipe` deletes `outbox`, `rate_prices`, `stay_restrictions`, `discounts`, and `rate_plans` — the parity run needs a scratch database, and the outbox table gives the "no event" assertion |
| `services/rates/internal/store/postgres_test.go:46-90` | `TestPostgresDeskLoop`: plan with `defaultUnits: 2`, prices seeded, `CheckSellableCount(…, &units)` with `units = 2`, and `counts[0] == 2` — passes the plan default, so the field is indistinguishable here too; **must be re-seeded with a value different from the plan default** |
| `services/rates/internal/store/postgres_test.go:91-111` | `TestPostgresRestrictionRefusalNamesRestriction`: writes a restriction with **no price row seeded**, then asserts the 422 — the assertion stays, the fixture must seed a price first |
| `services/rates/internal/store/postgres_test.go:112-134` | `TestPostgresClosedToArrivalRefusal`: same missing price seed, same 422/outside-window assertions — assertion stays, seed added |
| `services/rates/internal/store/postgres_test.go:135-192`, `:193-229` | `TestPostgresQuoteDiscounts` (percent + amount + floor) and `TestPostgresQuoteBreakdown` (two nights sum 24 000, total 21 600) — the Postgres byte-identical side of `AC-RTE-9` |
| `services/rates/contract-tests/CheckSellableCount.json` | The fixture keeps `totalUnits: 1` and asserts `status: 200` only — it must keep passing with the field inert |
| `services/rates/contract-tests/UpsertRestriction.json`, `CheckRestrictions-closed-to-arrival.json`, `QuotePrice.json`, `UpsertRatePlan.json` | The operation fixtures at this head; `script/contract-check.sh` parses them and checks each names a known operation (shape-only, never executed) |
| `contracts/http/UpsertRestriction.json:36` | The new `NOT_FOUND` (404) line for a room type no rate price row names, and the `VALIDATION_FAILED` when-line naming the non-boolean `closedToArrival` and the malformed `roomTypeId` — the contract delta this slice's guard re-runs |
| `contracts/http/CheckSellableCount.json:41` | `NOT_FOUND` now names a missing rate-price row only, "with or without totalUnits" — the shape `RTE8` asserts at the operation boundary |
| `contracts/http/QuotePrice.json:46` | The `STATE_ILLEGAL` (422) entry with `details.reason` `total_overflow` and no total or nights — the payload `RTE9`/`RTE10` assert |
| `messages/en.json:146-162` | The canonical `rates.*` sentences this service renders (`rates.validation.total_units` `:149`, `rates.notfound.room_type` `:159`, `rates.state.closed_to_arrival` `:161`), and `messages/en.json:27` the `error.validation.must_be_uuid` sentence the malformed-id refusal reuses |
| `services/rates/internal/messages/en.json:27`, `:146-162` | The Rates runtime mirror (byte-identical to the canonical file), and `messages/vi.json:27`, `:149`, `:159` its Vietnamese parity side |
| `services/rates/internal/messages/messages_test.go:22-58` | `TestSampledMessagesRenderByteIdentical`: the sampled-key assertions per new sentence — a new key must be added here with its exact rendering |
| `app/e2e/book.spec.ts:140-161` | The one browser flow that writes a restriction: `closedToArrival: true` through `apiOp` on the flow's room type, expecting the on-screen `closed-to-arrival` refusal — accepted only if that type is priced |
| `app/e2e/desk-flow.ts:154-167` | `setupFlowContext` seeds the plan and **two nightly price rows** for `window.night1`/`window.night2` before the flow writes its restriction, so the priced-type rule keeps the browser flow green with no edit |
| `script/e2e-desk-loop.sh:290`, `script/e2e-perf-check.sh:179` | The two scripts that send `totalUnits` (a real count and `50`) and assert status only — they keep passing with the field inert |
| `services/reservations/internal/availability/client.go:45-56` | The merged #631 ceiling is `totalCount - len(blockedRooms)` and never reads Rates' `sellableCount` or `totalUnits` — the "nothing moved" side of `RTE14` |
| `script/contract-check.sh`, `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh` | The gates `RTE14` re-runs; the catalogue script also asserts the eight runtime mirrors are byte-identical to `messages/en.json` and that `messages/vi.json` is at parity with matching placeholders |
| `.github/workflows/ci.yml:270-306`, `:396-405` | The `go-build (<module>)` matrix (build, vet, `gofmt -l`, `go test ./...`) and the `contract-check` job — the CI evidence `RTE14` reads |

Pass evidence for the covered-by-re-run rows at this head: the base
tree is green on `origin/master` `8a45afd` — `go-build (rates)`,
`go-build (reservations)`, `ci`, `contract-check`, `browser-e2e`,
`app-build`, `e2e-single-host`, and `perf-reporting-variant` all
`success` (read with `gh api
repos/MingChen1501/hotel-mgmt/commits/8a45afd/check-runs`). This spec
stack is docs-and-contract only: `git diff --stat origin/master HEAD --
services/rates/ app/ services/reservations/` is empty, so every code pin
above is byte-identical to that green base, and the stack head
`50ae2a1` is docs-only (its PR runs `ci`, `contract-check`, and
`e2e-single-host`, with the build matrices path-filtered out). The
implementation PR supplies the `go-build (rates)` evidence, which is why
its job list is stated in section 5 and `RTE-E1` records the Postgres
half separately.

## 3. Guard registry RTE1-RTE14 and the evidence rule RTE-E1

Naming: the registry uses `RTE*` (Rates inputs) and the owner cases use
`RTE-*` (section 6), so neither collides with the `FR-RTE-*` /
`AC-RTE-*` requirement and condition ids. All guards except the
covered-by-re-run rows are **created by the #633 implementation PR**;
they are listed `pending` in section 4 until `qa-lead` re-pins them
with `file:line` at the merged head.

Every refusal is asserted on the payload, not only on the status: a
400/404/422 must carry `code`, `details` (the named field and, for the
quote, the reason), a plain `message` with no envelope code, status
number, or stack text, and a fresh `traceId`. Every refusal is also
asserted on its **stored effect** — the following read still answers as
it did, and no event is emitted — because a 4xx followed by a stored row
is exactly the fail-open shape this slice removes.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `RTE1` | A non-boolean `closedToArrival` is refused, never coerced: four sub-cases — `"true"`, `1`, `"yes"`, `null` — each answer exactly one 400 `VALIDATION_FAILED` with `details.field` `closedToArrival`, one plain catalogue sentence, and a fresh `traceId`; a following `CheckRestrictions` for those dates still answers 200 `allowed: true`, proving nothing was stored; the stored restriction count and the event list are unchanged (memory: the store's event slice; Postgres: `rates.stay_restrictions` and `rates.outbox` row counts). The memory and Postgres halves refuse identically | `services/rates/internal/handler/handler_test.go` (memory, request level) and `services/rates/internal/store/postgres_test.go` (Postgres, at least `"true"` and `1`) |
| `RTE2` | The boolean and omitted cases keep today's behaviour: a `true` window is stored and refuses an arrival inside its dates with 422 `STATE_ILLEGAL` naming `closed-to-arrival` while an arrival outside passes; a `false` window never refuses on that ground; an **omitted** field stores `false` (asserted on the echoed response `closedToArrival: false` and on `CheckRestrictions` allowing) | **Covered by re-run** for `true`/outside (`services/rates/internal/handler/handler_test.go:116-137`); **pending** for the `false` control and the omitted-field case in the memory store, and for the Postgres mirror after its re-seed (section 2) |
| `RTE3` | A malformed `roomTypeId` is refused in both stores: `not-a-uuid` answers 400 `VALIDATION_FAILED` with `details.field` `roomTypeId` and the existing `error.validation.must_be_uuid` sentence, the stored restriction set and event list are unchanged, and the in-memory store gives the same answer the Postgres store already gives (`postgres.go:170-172`) — a divergence fails the case | `services/rates/internal/handler/handler_test.go` (memory) and `services/rates/internal/store/postgres_test.go` (Postgres; the Postgres half already answers this and the guard pins it) |
| `RTE4` | A well-formed UUID no rate price row names is refused 404 `NOT_FOUND` with `details.roomTypeId`, one plain sentence, a fresh `traceId`, nothing stored, and no `restriction-changed` event — in both stores. The case also covers the **wrong** implementation target: a plan that carries a `defaultUnits` but no price row for the type is still "unpriced" and is refused, so a check against the plan default fails the guard | `services/rates/internal/handler/handler_test.go` and `services/rates/internal/store/postgres_test.go` |
| `RTE5` | A priced type is still accepted whatever its plan's `defaultUnits` is or is not: the write answers 200 with the echoed window and `CheckRestrictions` applies it exactly as today (a `true` window refuses inside, a min-stay window refuses short stays) — in both stores | **Covered by re-run** after the price seed is added to the two Postgres restriction fixtures (`services/rates/internal/handler/handler_test.go:99-114`, `:116-137`; `postgres_test.go:91-111`, `:112-134`) |
| `RTE6` | `totalUnits` never sets the count, in both directions and in both stores: a plan default of `4` with `totalUnits: 1` answers `4`; a priced type whose plan carries **no** `defaultUnits` with `totalUnits: 9` answers `0`; a huge value (`9223372036854775807`) changes nothing; and an absent field answers the same plan default / `0`. A guard that only proves the huge value does not raise the count fails the case | `services/rates/internal/handler/handler_test.go` (memory, request level) and `services/rates/internal/store/postgres_test.go` (Postgres, rewritten so the sent `totalUnits` differs from the plan default) |
| `RTE7` | The `totalUnits` shape check is unchanged and fires before any store work: `-1` and `"1"` each answer exactly one 400 `VALIDATION_FAILED` with `details.field` `totalUnits` and the `rates.validation.total_units` sentence; a valid `totalUnits` still answers 200 (now inert) | `services/rates/internal/handler/handler_test.go` |
| `RTE8` | An unknown type answers one thing whatever the request carries: 404 `NOT_FOUND` naming the type **with** `totalUnits` present and **with** it absent, in both stores, and the old 400 `rates.validation.no_inventory` answer is gone; the response shape and the one entry per date for a priced type are unchanged | `services/rates/internal/handler/handler_test.go` and `services/rates/internal/store/postgres_test.go` |
| `RTE9` | A quote whose nightly sum would leave `int64` is refused: two stored prices near `MaxInt64` answer exactly one 422 `STATE_ILLEGAL` with `details.field` `roomTypeId` and `details.reason` `total_overflow`, one plain sentence, a fresh `traceId`, and **no** `totalMinor` and **no** `nights` in the body (a 422 carrying a wrapped or zero total fails the case), in both stores | `services/rates/internal/handler/handler_test.go` (the full HTTP envelope, reusing the `writeOpError` shape at `handler.go:34-41`) plus `services/rates/internal/store/store_test.go` and `postgres_test.go` (the `OpError` code, status, and details from each store) |
| `RTE10` | A quote whose percent multiplication would leave `int64` is refused the same way: two prices whose sum survives the add but exceeds `MaxInt64/100`, quoted with a percent discount, answer the same 422 payload and no total, in both stores. The amount-subtraction step cannot leave `int64` with non-negative operands (LLD 37.3), so it is a code-reading obligation — one guarded subtract helper in the package — not a behavioural case; the guard must not claim a case it cannot construct | `services/rates/internal/handler/handler_test.go` and `services/rates/internal/store/store_test.go` / `postgres_test.go` (same split as `RTE9`) |
| `RTE11` | Every non-overflowing quote stays byte-identical: 24 000 for two 12 000 nights, 21 600 after a 10 % discount, the floor-at-zero after an amount discount, the 730-night quote, the 731-night `VALIDATION_FAILED` naming `departureDate`, and the two #589 reasons (`no_rate_price`, `no_rate_plan`) unchanged — in both stores | **Covered by re-run** — `services/rates/internal/store/store_test.go:21-49`, `:50-70`, `:71-95`, `:96-130`; `services/rates/internal/handler/handler_test.go:138-164`, `:165-195`; `services/rates/internal/store/postgres_test.go:135-192`, `:193-229` |
| `RTE12` | The plan `name` bound is one code-point rule: 64 code points are accepted and stored as sent; 65 are refused with 400 `VALIDATION_FAILED`, `details.field` `name`, and the plain sentence carrying the bound; the 65-code-point fixture uses a multi-byte character (for example `ế` repeated) so a byte-length implementation fails, and the 64-code-point control fails an off-by-one | `services/rates/internal/handler/handler_test.go` (request level) and both stores (store level) |
| `RTE13` | The plan `description` bound and the text types: 2 000 code points accepted and stored, 2 001 refused naming `description` (same multi-byte control); an absent `description` keeps today's empty value; a present `description` that is a number or an object is refused naming `description` instead of being stored empty; a present `name` that is not a string is refused naming `name`; a refused **update** leaves the stored row and text intact (no overwrite, no truncation, asserted on the store directly because no read operation returns a plan); a plan stored before the bound (seeded directly: the memory map, or SQL on the Postgres side) still quotes exactly as today, proving no read-time re-validation was added — in both stores | `services/rates/internal/handler/handler_test.go` (request level) and `services/rates/internal/store/store_test.go` / `postgres_test.go` (store level) |
| `RTE14` | Nothing else moves: the catalogue carries one key per new sentence (the boolean, the overflow, and the bound sentence(s) — one `{field}`+`{max}` key or one per field, whichever the implementation lands), present in `messages/en.json`, byte-identical in all eight runtime mirrors, and at parity in `messages/vi.json` with matching placeholders, with the sampled assertions added to `messages_test.go`; the three contract files carry the prose/error-list delta with no new enum token and `UpsertRatePlan` gaining no `maxLength`; no migration file appears under `services/rates/migrations/`; no desk file, route, control, label, state, or copy changes and the browser restriction flow stays green; no `services/reservations/**` file is edited and its suite stays green; the two e2e scripts that send `totalUnits` keep answering 200 | Diff gate over `git diff --name-only` + `script/catalogue-coverage-check.sh`, `script/contract-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `services/rates/internal/messages/messages_test.go`, and the `browser-e2e` job |
| `RTE-E1` | Evidence rule: the implementation PR records the before/after pairs for the coerced boolean, the unpriced room type, the caller-set count, the overflowing quote, and the unbounded plan name (`docs/testing/evidence/633/README.md`, created by that PR, same capture method as the `#631`, `#636`, and `#642` records), records the `TEST_PG_URL` parity run, and records the slice row in `docs/testing/test-report.md` (`test-strategy.md` [section 3](test-strategy.md) exit criterion 6). Stays pending until all three are recorded | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row whose guard does not exist at this
head. Rows marked covered by re-run rest on pins that exist and pass
today (section 2) and must keep passing untouched — with the four
re-seeds named in section 2 applied to their fixtures, never to their
assertions. The rows stay `pending` / `covered by re-run` until the
implementation PR merges, passes, and `qa-lead` re-pins every cell with
`file:line` at the merged head (section 8).

| Item | Required guard | Guard |
|---|---|---|
| `AC-RTE-6` — a present `closedToArrival` must be `true` or `false`; a `true` window still refuses an arrival inside its dates with `STATE_ILLEGAL` naming `closed-to-arrival`, a `false` window never refuses on that ground, an omitted field stores `false`, and any non-boolean (`"true"`, `1`, `"yes"`, `null`) is refused 400 `VALIDATION_FAILED` naming `closedToArrival` with nothing stored, no event, and no silent `false` reaching the store (traces to US-RTE-4; `FR-RTE-4`, `FR-RTE-6`; `BR-10`, `BR-68`) | L1 acceptance: the four non-boolean refusals with their stored-effect proof, the two accepted booleans, and the omitted default | **Pending** — `RTE1`; **covered by re-run today** for the accepted `true`/outside-window half (`services/rates/internal/handler/handler_test.go:116-137`, `services/rates/internal/store/postgres_test.go:112-134` after its re-seed); today's coercion is `handler.go:234` and the store it silently reaches is `store.go:211` |
| `AC-RTE-7` — a restriction binds only to a room type Pricing can price: a non-UUID is refused 400 `VALIDATION_FAILED` naming `roomTypeId` in both stores, a UUID no rate-price row mentions is refused 404 `NOT_FOUND` naming the type with nothing stored and no event, a priced type is stored and applied exactly as today whatever its `defaultUnits` is or is not, so no window can exist that matches nothing (traces to US-RTE-4; `FR-RTE-4`, `FR-RTE-7`; `BR-10`, `BR-44`, `BR-68`) | L1 acceptance: the malformed-id pair, the unpriced-UUID case, the priced-type positive control, and the `defaultUnits`-is-not-a-price case | **Pending** — `RTE3`, `RTE4`; **covered by re-run today** for the accepted priced write (`handler_test.go:99-114`, `:116-137`, `postgres_test.go:91-111`, `:112-134` after their price seeds); the Postgres malformed-id answer already exists at `postgres.go:170-172`, the memory store's missing check at `store.go:198-213` |
| `AC-RTE-8` — the availability answer is the server's: the first plan in name order that prices the type and carries a `defaultUnits`, else `0`; a request `totalUnits` neither raises nor lowers it (a large value buys nothing, a small or zero value hides nothing) and is refused 400 naming the field when it is not an integer at or above zero; an unknown type refuses 404 `NOT_FOUND` naming the type whether or not the field is present; the response shape, per-date list, date-order refusal, both stores, and the #631 ceiling are unchanged (traces to US-RTE-2; `FR-RTE-2`, `FR-RTE-8`; `BR-9`, `BR-47`, `BR-68`) | L1 acceptance: the plan-default cases (small and huge field values), the no-default `0` case, the shape refusals, the unknown-type pair, and the unchanged shape/ceiling re-run | **Pending** — `RTE6`, `RTE7`, `RTE8`; today's caller-set count is `store.go:347-355` / `postgres.go:380-393` and the split unknown-type answers are `store.go:364-369` / `postgres.go:402-407`; the #631 ceiling re-run is `services/reservations/internal/availability/client.go:45-56` |
| `AC-RTE-9` — a quote whose nightly sum, percent multiplication, or amount subtraction would leave the `int64` range refuses `STATE_ILLEGAL` (422) naming `roomTypeId` with `reason: "total_overflow"` and no total and no partial nights list, while every non-overflowing quote is byte-identical (same nightly breakdown, truncated percent, zero clamp, 730-night cap) and no write-time price ceiling or migration is added (traces to US-RTE-1, US-RTE-5; `FR-RTE-1`, `FR-RTE-3`, `FR-RTE-5`, `FR-RTE-9`; `BR-13`, `BR-14`, `BR-52`, `BR-68`) | L1 acceptance: the sum-overflow and multiply-overflow cases with the no-partial-result assertion, plus the byte-identical re-run | **Pending** — `RTE9`, `RTE10`; **covered by re-run today** for the byte-identical half (`store_test.go:71-95`, `:96-130`, `handler_test.go:138-164`, `:165-195`, `postgres_test.go:135-192`, `:193-229`); today's unchecked arithmetic is `store.go:274`, `:284`, `:286-289` / `postgres.go:289`, `:303`, `:305-308` |
| `AC-RTE-10` — `name` is at most 64 and `description` at most 2 000 code points on write, both code constants in both stores, a refused write stores, overwrites, and truncates nothing, a present non-string `name` or `description` is refused naming the field instead of becoming empty, an absent `description` keeps today's empty value, the plan's identity and upsert semantics are unchanged, and there is no migration, backfill, or read-time re-validation (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-RTE-10`; `NFR-I18N-1`, `BR-68`) | L1 acceptance: the two boundary pairs (64/65, 2 000/2 001) in code points, the non-string pair, the update-keeps-the-row case, and the pre-bound stored row that still quotes | **Pending** — `RTE12`, `RTE13`; today's unbounded/coerced read is `handler.go:158-163` and the unchecked stores are `store.go:161-176` / `postgres.go:83-113`; the schema allowance is `migrations/000002_schema.up.sql:19-20` |
| `FR-RTE-6` — a present `closedToArrival` is a JSON boolean or the write is refused, with the accepted path unchanged and the omitted default kept (requirements 38.3) | L1 acceptance | **Pending** — `RTE1`; **covered by re-run today** for the accepted `true` half (`handler_test.go:116-137`) |
| `FR-RTE-7` — a restriction binds only to a UUID room type Pricing prices, `VALIDATION_FAILED` for the shape and `NOT_FOUND` for the unpriced type, nothing stored and no event in either store, with a priced type still accepted whatever its `defaultUnits` (requirements 38.3) | L1 acceptance | **Pending** — `RTE3`, `RTE4`; **covered by re-run today** for the accepted priced write (`handler_test.go:99-114`) |
| `FR-RTE-8` — the availability count is the plan default, else `0`, and `totalUnits` is advisory, shape-checked, and never sets the count, with an unknown type refused `NOT_FOUND` with or without the field (requirements 38.3) | L1 acceptance | **Pending** — `RTE6`, `RTE7`, `RTE8` |
| `FR-RTE-9` — a quote the service cannot represent is refused `STATE_ILLEGAL` with `reason` `total_overflow` and no total or nights, every non-overflowing quote byte-identical, both stores (requirements 38.3) | L1 acceptance | **Pending** — `RTE9`, `RTE10`; **covered by re-run today** for the byte-identical half (`store_test.go:71-95`, `handler_test.go:165-195`, `postgres_test.go:193-229`) |
| `FR-RTE-10` — plan `name` at most 64 and `description` at most 2 000 code points on write, non-strings refused naming the field, no truncation, no read-time re-validation, upsert semantics unchanged (requirements 38.3) | L1 acceptance | **Pending** — `RTE12`, `RTE13` |
| `BR-68` — the five fail-closed input rules for Rates: the boolean, the priced type, the advisory count, the overflow refusal with no partial total, and the two text bounds with non-string refusals, all fixed code rules with no per-hotel setting (business rules section 3; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `RTE1`–`RTE14`, `RTE-E1` |
| `FR-RTE-1` / `FR-RTE-2` / `FR-RTE-4` / `FR-RTE-5` (MVP rows, unchanged) — rate plans, the availability overview, stay restrictions, and the frozen price basis keep their wording and their guards; this change makes the service honour the promises they already made | L1 re-run: the four MVP guard slots in matrix section 1, unedited | **Covered by re-run today** — `services/rates` `TestDeskLoopSetRateSearchQuote`, `TestQuoteAppliesNamedDiscount`, `TestQuoteAppliesAmountDiscount`, `TestQuoteBreakdownSumsToTotal`, `TestRestrictionRefusalNamesRestriction`, `TestClosedToArrivalRefusalNamesRestriction` and their Postgres twins; the MVP rows in matrix section 1 stand unchanged and may not cite this slice as their guard |
| `NFR-I18N-1` (unchanged) — every new refusal resolves through the catalogue, renders no envelope code, status number, or stack text, carries the bound through `{max}`, and keeps the English and Vietnamese key sets at parity with matching placeholders | Catalogue gate | **Pending** — `RTE14` and the sampled assertions in `services/rates/internal/messages/messages_test.go`; `script/catalogue-coverage-check.sh` must be green with the new keys in `messages/en.json`, the eight byte-identical mirrors, and `messages/vi.json` at parity |
| `NFR-BND-1`..`NFR-BND-3`, `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-AUD-1`, `NFR-TZ-1` (unchanged) — no route, body ceiling, lock, transaction, round trip, outside dependency, event, or date format moves; the new checks are one comparison or one indexed lookup inside the request already served | No-change re-run | **Covered by re-run today** — the body-bound and server-timeout guards, the paired-attempt guards, the timed desk run, and the two e2e scripts; a new route, body bound, or migration fails `RTE14` |
| Contract and LC | Real delta: `UpsertRestriction` gains a `NOT_FOUND` error line and the when-line names the non-boolean flag and the malformed id; `CheckSellableCount`'s `totalUnits` description becomes advisory-only; `QuotePrice` gains the `STATE_ILLEGAL` `total_overflow` line; `UpsertRatePlan` gains no `maxLength`; no operation, route, property, required list, status, or enum token is added | **Pending gate** — `RTE14`; the contract edits are `architect`'s (LLD 37.5) and the fixtures stay shape-only |
| No-configuration and no-migration gate | Real delta: the five rules are fixed code constants carried by no environment variable, `deploy/` file, compose file, or per-hotel setting, and no migration, column, backfill, truncation, or stored-value rewrite is added | **Pending diff gate** — `RTE14`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-68) |
| No-desk-change gate | Real delta: no desk screen sends the two operations whose refusals move, the Manage panel's plain failure sentence renders any new refusal, and the one browser flow that writes a restriction does so on a priced type | **Pending gate** — `RTE14`; the pins are `app/e2e/book.spec.ts:140-161`, `app/e2e/desk-flow.ts:154-167`, and the `browser-e2e` job |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` capability wording moves; `FR-RTE-6`..`FR-RTE-10` are behaviour-scoped additions outside the counted capability set (requirements 38.2, 38.3) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`RTE-E1`) | The five before/after pairs, the `TEST_PG_URL` Postgres parity run, and the slice row in the test report | **Pending** — `docs/testing/evidence/633/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #633): 19 rows mapped to `AC-RTE-6`..`AC-RTE-10`,
`FR-RTE-6`..`FR-RTE-10`, `BR-68`, the unchanged MVP rows
`FR-RTE-1`/`FR-RTE-2`/`FR-RTE-4`/`FR-RTE-5`, `NFR-I18N-1`, the
no-change NFR group, the contract/LC gate, the configuration/migration
gate, the no-desk-change gate, the MVP no-change gate, and `RTE-E1`.
Eight rows carry a re-run-today half (the unchanged MVP row, the
no-change NFR row, and the accepted-write or byte-identical halves
inside `AC-RTE-6`, `AC-RTE-7`, `AC-RTE-9`, `FR-RTE-6`, `FR-RTE-7`, and
`FR-RTE-9`); the other eleven are **pending** the implementation PR —
the rows whose guards are `RTE1`–`RTE14`, the gates, and `RTE-E1`. The
slice is **not complete** at this spec head; it completes when the
implementation PR merges with `RTE1`–`RTE14` green, `RTE6`/`RTE8`/`RTE9`/
`RTE10`/`RTE12`/`RTE13`'s Postgres halves recorded on a scratch
database, `RTE-E1` recorded, and `qa-lead` re-pins the rows at the
merged head.

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: `docs/architecture/services/rates.md` section 7) |
|---|---|---|
| L1 service, Rates (memory store) | `RTE1`–`RTE13` memory halves, plus every existing rates pin | `cd services/rates && go build ./... && go test ./... && go vet ./... && gofmt -l .` (CI `go-build (rates)`; `gofmt -l .` must print nothing) |
| L1 service, Rates (Postgres parity) | `RTE1`, `RTE3`, `RTE4`, `RTE6`, `RTE8`, `RTE9`, `RTE10`, `RTE12`, `RTE13` Postgres halves | `cd services/rates && TEST_PG_URL=postgres://… go test ./internal/store/` on a **scratch** database (the fixtures wipe `rates.*`, section 2); the cases skip without `TEST_PG_URL` |
| LC contract | `RTE14`: the three contract files, the untouched `UpsertRatePlan` manifest, the shape-only fixtures | `script/contract-check.sh` (CI `contract-check`, which runs only when `contracts/` or services change) |
| Catalogue | `RTE14`: the new keys, the eight byte-identical mirrors, the Vietnamese parity, the sampled renderings | `script/catalogue-coverage-check.sh` (CI `ci`) |
| Browser regression | `RTE14`: the restriction refusal on screen still reaches `closed-to-arrival` with no desk edit | CI `browser-e2e` (or `cd app && npx playwright test e2e/book.spec.ts` against a served stack) |
| No-change re-run | `RTE14`: the Reservations ceiling, the two `totalUnits` e2e scripts | `cd services/reservations && go test ./...` (CI `go-build (reservations)`); the `e2e-single-host` job for `script/e2e-desk-loop.sh:290` and `script/e2e-perf-check.sh:179` |
| Gates | Links, harness conventions, whitespace | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `go-build (rates)`,
`go-build (reservations)`, `contract-check`, `ci`, `browser-e2e`, and
`e2e-single-host`. The Postgres half is not a CI job (the matrix sets no
`TEST_PG_URL`), which is why `RTE-E1` records the parity run explicitly;
adding a database-backed job would be a CI change outside this slice's
scope.

### Execution order

1. Rates memory suite: the new `RTE*` cases first (a red case stops the
   run), then every existing rates pin unchanged.
2. Rates Postgres suite with `TEST_PG_URL` on a scratch database: the
   parity cases, the four re-seeded fixtures, then the wiped fixture
   rows.
3. `script/contract-check.sh` and the catalogue gate (`RTE14`): the three
   contract files resolve and the new keys render in both locales.
4. The browser restriction flow and the two `totalUnits` e2e scripts
   (`RTE14`): still green with no desk or script edit.
5. Reservations suite (`RTE14`): no diff, ceiling derivation green.
6. `RTE-E1`: the five before/after pairs and the parity run, recorded;
   then the `test-report.md` row.
7. Link, harness, and whitespace gates; then `qa-lead` re-pins section 4
   at the merged head.

### Entry criteria

1. The spec set is `active` and `spec-reviewer` has posted `SPEC-GATE
   PASS` on #633 (T2).
2. The companion specs this plan cites are active: acceptance-criteria
   section 30 (`AC-RTE-6`..`AC-RTE-10`), requirements section 38
   (`FR-RTE-6`..`FR-RTE-10`, `BR-68`), LLD section 37, HLD section 29,
   and the refreshed Rates flowcharts.
3. The build under test is identified by commit, and the fixture is the
   `seedLoop` shape (one plan, two nights) plus, for the Postgres half, a
   scratch database with the Rates migrations applied and the outbox
   table read for the "no event" assertions.

### Exit criteria

1. `RTE1`–`RTE14` exist and pass; every refusal asserts the full payload
   (`code`, `details`, `message`, `traceId`) **and** its stored effect,
   and every overflow case asserts the absence of `totalMinor` and
   `nights`.
2. The Postgres halves ran with `TEST_PG_URL` on a scratch database and
   answered the same codes, statuses, and payload shapes as the in-memory
   store.
3. `RTE11` holds unchanged: every existing quote guard passes with no
   assertion edit.
4. `RTE14` holds: the catalogue is extended (not rewritten), the contract
   delta is prose-only plus error-list lines, no migration appears, no
   desk file is in the diff, and no `services/reservations/**` file is in
   the diff.
5. `RTE-E1` is recorded: the five evidence pairs in
   `docs/testing/evidence/633/README.md` and the slice row in
   `docs/testing/test-report.md`.
6. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section 4
   at the merged head and flipped the rows.
7. Open failures are filed as issues with FR/NFR ids; no `risk-high`
   failure is waived without owner approval.

### Negative controls

- **A refusal must leave nothing behind.** `RTE1`, `RTE3`, `RTE4`, and
  `RTE13` each assert both the 4xx payload and the unchanged stored
  state (a following read still answers as before; the restriction, plan,
  and outbox row counts are unchanged). A 4xx that still stored the row
  is the exact fail-open shape this slice removes.
- **`totalUnits` must move nothing in either direction.** `RTE6` carries
  a small value, a huge value, and a priced type whose plan sets no
  default (`0`). "A large value does not raise the count" alone would
  pass an implementation that also hides inventory on a small value.
- **"Priced" must mean a price row.** `RTE4`'s plan-with-`defaultUnits`
  -and-no-price case fails an implementation that tests the plan default
  instead of the price rows (`BR-44`).
- **No partial quote may escape.** `RTE9`/`RTE10` assert the body carries
  no `totalMinor` and no `nights`; a 422 carrying a wrapped, negative,
  zeroed, or truncated total fails, and so does a nights list.
- **The boundary, not only the overflow.** `RTE11` pins the
  non-overflowing side (24 000, 21 600, zero clamp, 730 nights) so a
  guard that refuses everything fails.
- **Bounds are counted in code points.** `RTE12`/`RTE13` use a
  multi-byte 65/2 001-code-point fixture (a byte-length implementation
  fails) and a 64/2 000-code-point control (an off-by-one fails).
- **Both stores must agree.** Every refusal case that can be run in both
  stores runs in both; a passing memory case is never taken as evidence
  for the SQL path, which is a separate expression and, for the
  malformed id, a different mechanism (`22P02` mapping).
- **The ceiling must not move.** `RTE14` is a diff gate: a
  `services/reservations/**` hunk fails the row even if its tests stay
  green, because the availability meaning belongs to the separate
  Reservations issue.

## 6. Owner verification cases (RTE-1..RTE-10)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` seed recipe (sign-in token, one room
type with a priced plan). Each case states what to send and what to see;
"the window did not apply" is checked with `CheckRestrictions` for the
same dates.

| Case | Setup | Expected |
|---|---|---|
| `RTE-1` | Send `UpsertRestriction` with `closedToArrival: "true"` (a string) for a priced type | 400 `VALIDATION_FAILED` naming `closedToArrival`, one plain sentence, and a `CheckRestrictions` for those dates still allows — no window was stored |
| `RTE-2` | Send the same write with `closedToArrival: true`, then check an arrival inside the window and one outside | Inside: 422 `STATE_ILLEGAL` naming `closed-to-arrival`; outside: 200 allowed |
| `RTE-3` | Send a restriction with `roomTypeId: "not-a-uuid"`, then with a random well-formed UUID on a type with no price rows | 400 naming `roomTypeId`, then 404 `NOT_FOUND` naming the type; in both cases nothing is stored |
| `RTE-4` | On a type whose plan sets `defaultUnits: 4`, read availability with `totalUnits: 1` | The answer is `4` for each date — the request value is ignored |
| `RTE-5` | On a priced type whose plan sets no `defaultUnits`, read availability with `totalUnits: 9` | The answer is `0` for each date |
| `RTE-6` | Read availability for a type no price row names, once with and once without `totalUnits` | Both answer 404 `NOT_FOUND` naming the type |
| `RTE-7` | Store two nightly prices near the `int64` maximum for one type, then quote | 422 `STATE_ILLEGAL` naming `roomTypeId` with reason `total_overflow`, and no total and no nights in the answer |
| `RTE-8` | Create a plan with a 65-character name, then one with a 2 001-character description; then a 64/2 000 pair | The over-bound pair is refused naming the field with the bound in the sentence; the boundary pair is created and echoed |
| `RTE-9` | Book through the desk on a priced type | The quote, confirm, and stored reservation are exactly as before the change |
| `RTE-10` | Repeat `RTE-1`, `RTE-3`, `RTE-4`, and `RTE-7` on the Postgres-backed build | The same statuses, codes, and details as the in-memory build |

Desk regression on the same build: `RTE-D1` the Manage panel still
creates a plan and saves nightly prices; `RTE-D2` the Book confirm still
refuses a restricted arrival with its existing sentence; `RTE-D3` no new
control, label, state, or copy appears. Expected: unchanged from the
pre-change desk.

## 7. Evidence rule RTE-E1

The implementation PR records five before/after pairs plus the parity
run (`docs/testing/evidence/633/README.md`, created by that PR, same
capture method as the `#631`, `#636`, and `#642` records):

- **Boolean pair.** Before: a restriction written with `closedToArrival:
  "true"` answers 200 and stores `false`, so an arrival inside the window
  is allowed. After: the same request is refused 400 naming the field and
  the window is not stored.
- **Priced-type pair.** Before: a restriction for a well-formed UUID no
  price row names answers 200 and stores a window that matches nothing.
  After: 404 `NOT_FOUND` naming the type, nothing stored, no event.
- **Count pair.** Before: `CheckSellableCount` with `totalUnits: 9` on a
  type whose plan default is `4` answers `9`. After: the same read
  answers `4` (and `0` for a priced type whose plan sets no default).
- **Overflow pair.** Before: two prices near the `int64` maximum quote a
  wrapped total. After: 422 `STATE_ILLEGAL` with `reason`
  `total_overflow`, no total, no nights.
- **Bound pair.** Before: a 65-character plan name is accepted and
  stored. After: 400 naming `name` with the bound in the sentence, and
  the stored plan is unchanged.
- **Parity run.** The Postgres halves of `RTE1`, `RTE3`, `RTE4`, `RTE6`,
  `RTE9`, and `RTE12` executed with `TEST_PG_URL` on a scratch database,
  with the identical payloads from both stores recorded and the command
  pasted (the Go matrix sets no `TEST_PG_URL`, so a green
  `go-build (rates)` job is not parity evidence on its own).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and the re-pin rule

At the spec head: 19 rows mapped — eight rows carry a re-run-today half
whose pins exist and pass (the unchanged MVP row, the no-change NFR row,
and the accepted-write or byte-identical quote halves named in section 2)
and the other eleven are **pending** the implementation PR (the registry
`RTE1`–`RTE14`, the gates, the MVP no-change gate, and `RTE-E1`). The
slice is **not complete** at this spec head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise. When the implementation PR merges, `qa-lead`
re-reads every `file:line`, rewrites the pins in place (never deletes
one), records the merged head SHA in the matrix section 30 status line,
and flips the rows. A row whose guard the PR did not create stays
pending and is filed as a gap on #633.

The four re-seeds in section 2 are **fixture** changes, not assertion
changes: `TestPostgresRestrictionRefusalNamesRestriction`,
`TestPostgresClosedToArrivalRefusal`, `TestPostgresDeskLoop`, and
`TestDeskLoopSetRateSearchQuote` keep what they assert and gain the
price row or the differing `totalUnits` the new rules require. The same
PR rewires the call sites of the two signatures that change
(`UpsertRatePlan` gains an error return at `store_test.go:23`, `:54`,
`:73`, `:98` and `postgres_test.go:52`, `:140`, `:198`;
`CheckSellableCount` loses the `totalUnits` parameter at
`postgres_test.go:72`) without moving an assertion. Deleting an
assertion instead of re-seeding fails `RTE14`.

The 57/57 MVP coverage count in
[traceability-matrix.md](traceability-matrix.md) stands unchanged: this
slice adds no MVP capability, and no MVP row may cite it as its guard.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1249
