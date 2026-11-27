# Failed rate-plan write test traceability (Refs #767)

Status: active. Testing spec for the T2 plan-write failure change
([issue #767](https://github.com/MingChen1501/hotel-mgmt/issues/767)),
owned by `qa-lead`. It maps the change's done-conditions —
`AC-PLN-1`..`AC-PLN-4`, owned by `product-owner` in
`docs/product/acceptance-criteria.md`
[section 33](../product/acceptance-criteria.md#33-a-failed-rate-plan-write-is-refused-never-reported-as-success-refs-767)
— and the behaviour-scoped requirements `FR-PLN-1`..`FR-PLN-5` plus the
business rule `BR-71`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 41](../requirements/mvp-requirements.md#41-a-failed-rate-plan-write-is-refused-never-reported-as-success-refs-767)
and `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), to their
guards: the pins that exist on disk at this spec head, the guard
registry `PLN-1`–`PLN-9`, the residual-risk record `PLN-R1`, and the
evidence rule `PLN-E1`.

Written before the implementation PR. The change is one error branch in
one existing operation, so every guard in the registry is a **named,
missing obligation** at this head: the Rates suite contains no
plan-write failure guard at all, and `TestPostgresDeskLoop` proves only
the healthy path. No row marks a guard complete, and the slice is not
complete until the implementation PR merges and `qa-lead` re-pins every
row at the merged head (the `#588` → `#599`, `#601`, `#631`, `#633`,
`#637` pattern). Section 2 cites what is on disk today and what it
proves; section 5 says which rows the implementation PR creates and
which pins it must keep byte-identical.

Companion specs: acceptance-criteria section 33 (the four conditions and
the `AC-MANAGE-7` / `AC-RTE-10` pointers), requirements section 41 with
its own `qa-lead` handoff (41.5), `BR-71`, LLD
[section 40](../architecture/lld.md#40-a-failed-rates-rate-plan-write-is-refused-never-reported-as-success-refs-767)
(where the branch sits, exactly which `*OpError` it returns, the
transaction and rollback semantics, retryability, the per-flow diagrams,
the contract and verification plan, and the residual risks), HLD
[section 32](../architecture/hld.md#32-a-failed-rates-rate-plan-write-is-refused-never-reported-as-success-refs-767),
the refreshed Rates flowcharts
([sections 4 and 6](../architecture/services/rates.md#4-failurerollback-flowchart)),
product D-45 ([decision log](../project/decision-log.md)) and R-26
([risk register](../project/risk-register.md)), and the contract
`contracts/http/UpsertRatePlan.json` with its fixture. This spec
implements no code, changes no guard, adds no catalogue key, moves no
MVP row, and adds no test level.

## 1. Scope, tier, and no-change statements

- Tier T2 (recorded by `product-owner` in acceptance-criteria section
  33, confirmed in LLD section 40): one existing operation changes a
  caller-visible answer — a store failure where a fabricated success
  was returned — while no operation, route, request or response field,
  status set, envelope token, schema table, lifecycle state, desk
  control, catalogue key, migration, or print rule is added or removed.
  No T3 escalation, no ADR, and no UI-contract section applies.
- The whole surface is one branch:
  `services/rates/internal/store/postgres.go:104-110` (today the
  comment plus `return plan, nil` at `:109`) becomes
  `return nil, storeFailure()`. The success path
  (`:88`, `:95-103`, `:111-119`), the best-effort outbox helper
  (`services/rates/internal/store/postgres.go:70-79`), the in-memory
  store (`services/rates/internal/store/store.go:270-287`), the
  `Repository` interface (`services/rates/internal/store/store.go:243`),
  and the handler's success branch
  (`services/rates/internal/handler/handler.go:226-231`) must not move.
- **The failure this change reports is a driver failure on the Postgres
  store.** The in-memory store has no driver to fail, so **no guard may
  invent an in-memory driver failure or add one to `Store`** (LLD 40.6).
  The in-memory store's obligation in this slice is parity of the
  unchanged answers: its existing refusal class (the plan-text bounds,
  `services/rates/internal/store/fail_closed_test.go:155-191`) still
  stores nothing and emits no event, and its create/update success
  answers stay byte-identical.
- A driver failure is a failure, not a plan: the store returns a `nil`
  plan and the existing `storeFailure()` answer
  (`VALIDATION_FAILED`, status 500, the plain
  `rates.store.unavailable` sentence, an empty `details` map), never a
  request-shaped plan and never an empty `id` (AC-PLN-1, FR-PLN-1).
- Nothing is written and no event is emitted on the failure. The plan
  statement is its own transaction and the failure branch returns before
  the outbox call (`services/rates/internal/store/postgres.go:118`), so the stored plan set, its
  prices, and its events are exactly what they were before the request
  (AC-PLN-1, FR-PLN-2).
- The handler answers the existing failure envelope at HTTP 500 with a
  fresh `traceId` and never a `200`; no phantom plan is therefore
  readable, priceable, or quotable between the failure and a retry
  (AC-PLN-2, FR-PLN-3).
- The request is valid and retriable: the same request repeated after
  the database recovers is the ordinary upsert on the plan name — create
  on the first success, update afterwards, exactly one outbox event per
  successful write — with no replay, repair, queue, or idempotency key
  (FR-PLN-4).
- The success path is untouched: the same row values (name as the key,
  the sent description, the stored `defaultUnits` when an update omits
  it), the same outbox event the store emits today, and the same `200`
  body with the stored `id`, `name`, and `description` (AC-PLN-3,
  FR-PLN-5).
- **The store-failure token is not moved here.** `storeFailure()`
  answers `VALIDATION_FAILED` at 500 while `BR-59` and
  `docs/technical/error-handling.md` section 1 reserve `INTERNAL_ERROR`
  for a store or driver failure. Aligning it moves every Rates write's
  failure answer, so it is the separate change recorded in R-26 and
  `PLN-R1`; **no guard in this slice may assert an `INTERNAL_ERROR`
  token or a new code/status on this branch.**
- No contract edit, and none is allowed by this slice: the refusal
  reuses the answer class the service already produces, so
  `contracts/http/UpsertRatePlan.json` keeps its request and response
  schema, required lists, and its two error entries; `UpsertRatePrice`
  already answers the same 500 without a manifest line, so adding one to
  the plan manifest alone would make the pair declare different answers
  for the same class. **No guard may assert a new 500 error entry or a
  new envelope token.**
- No schema move: no migration file appears under
  `services/rates/migrations/`, no `CHECK`, column, index, backfill,
  truncation, or stored-value rewrite is added, and no data-dictionary
  entry changes. **No guard may assert a repair of a plan the fault
  previously "created" — no such row was ever stored.**
- No desk change: the Manage screen's two plan-create paths
  (`app/src/views/ManageView.vue:1816-1840`,
  `:1852-1876`) already render their existing generic failure sentence
  (`:1833`, `:1869`) and return; a real failure now lands there instead
  of a phantom `200` advancing the screen. **No guard may assert a new
  desk control, label, state, or copy string.**
- No new MVP row, story, or FR capability. `FR-RTE-1`, `FR-RTE-10`, and
  `FR-ADM-4` keep their wording and their existing guards; the new
  obligations live in `FR-PLN-1`..`FR-PLN-5` / `BR-71`. The 57/57 MVP
  coverage count in [traceability-matrix.md](traceability-matrix.md)
  stands unchanged and no MVP row may cite this slice as its guard. The
  slice rows live in traceability-matrix section 33.
- Guards are extended, never deleted: every existing Rates guard,
  contract fixture, e2e script, and desk test must keep passing with no
  assertion edit. Editing an existing assertion instead of adding cases
  beside it is drift and fails `PLN-9`.
- Refusal precedence is not decided here (requirements 41.6): the
  handler's field checks and the store's plan-text bounds keep their
  order, and the new failure answer applies only after they pass. No
  guard may assert which refusal wins when two *invalid fields* are sent
  at once.
- The finding itself is the before-state `PLN-E1` records: a failing
  Postgres plan write answers `200` with `{"id": "", "name": …}` while no
  row exists and no `rate-plan-changed` row was emitted, and the next
  `UpsertRatePrice` for that name answers `NOT_FOUND`.

## 2. Pins on disk at this spec head

The pins below exist at this head and prove what the
"covered by re-run" and "pinned today" halves rest on. They were re-read
for this spec; none is promised and none is a placeholder. Where a row
names one of `PLN-1`–`PLN-9` the guard itself is listed in section 3 (it
does not exist yet). The code tree is byte-identical to the green base
`origin/master` `1eab7cb`, because this stack is docs-only.

| Pin | What it proves today |
|---|---|
| `services/rates/internal/store/postgres.go:58-60` | `storeFailure()`: the one `*OpError` the refusal must reuse — `Code` `VALIDATION_FAILED`, `Status` 500, the `rates.store.unavailable` sentence, an empty non-nil `Details` map |
| `services/rates/internal/store/postgres.go:70-79` | The best-effort `outbox` helper: `_, _ = p.db.Exec(...)` ignores its own error and stays exactly as it is |
| `services/rates/internal/store/postgres.go:84` | `UpsertRatePlan`'s existing `(*RatePlan, *OpError)` signature — no interface or handler signature moves |
| `services/rates/internal/store/postgres.go:85-87` | `planText` re-checks the two text bounds before any statement — the only refusals that must keep precedence over the new failure |
| `services/rates/internal/store/postgres.go:88` | The request-shaped plan is built before the write — the record the faulty branch returned |
| `services/rates/internal/store/postgres.go:95-103` | The single `INSERT … ON CONFLICT (name) DO UPDATE … RETURNING id, default_units` through `QueryRow(...).Scan(...)` — the only statement whose error the change reads |
| `services/rates/internal/store/postgres.go:104-110` | The fault: the `if err != nil` branch with the #767 comment and `return plan, nil` at `:109` — the exact line the implementation replaces |
| `services/rates/internal/store/postgres.go:111-117` | The success-path copy of the returned `id` and `default_units` onto the plan — untouched |
| `services/rates/internal/store/postgres.go:118` | The one `rate-plan-changed` outbox call on the success path — the branch a failure must never reach |
| `services/rates/internal/store/postgres.go:119` | The success return (`return plan, nil`) — untouched |
| `services/rates/internal/store/postgres.go:131-133` | `UpsertRatePrice`'s plan lookup (`SELECT id FROM rates.rate_plans WHERE name = $1`, `:131`) and its `NOT_FOUND` answer naming `ratePlanName` (`:132-133`) — the "no phantom plan readable" price answer, beside the two `storeFailure()` returns at `:135`, `:150` |
| `services/rates/internal/store/postgres.go:446-469` | `quotePlan`: an unknown named plan answers `NOT_FOUND` naming `ratePlanName` (`:453`), and a type no plan prices answers `NOT_FOUND` with `details.reason` `no_rate_plan` (`:467`) — the "no phantom plan readable" answers |
| `services/rates/internal/store/store.go:243` | `Repository.UpsertRatePlan(name, description string, defaultUnits *int) (*RatePlan, *OpError)` — the refused shape already exists, so the signature must not move |
| `services/rates/internal/store/store.go:270-287` | The in-memory `UpsertRatePlan`: bounds (`:271-273`), create writes under the mutex (`:274-284`), emits `rate-plan-changed` on create only (`:285`), and its update path returns the stored plan with no event (`:276-281`) — all three behaviours stay |
| `services/rates/internal/store/store.go:51-52`, `:92-96` | `MaxPlanNameRunes = 64`, `MaxPlanDescriptionRunes = 2000`, and `planText` — the in-memory refusal the "both stores store nothing" half re-runs |
| `services/rates/migrations/000002_schema.up.sql:19` | `name TEXT UNIQUE NOT NULL` — the upsert key that makes a retry create-then-update and never a second row |
| `services/rates/migrations/000003_default_units.up.sql:13` | `default_units INT NULL` — the column the update keeps when the request omits it |
| `services/rates/internal/messages/en.json:166` | `"rates.store.unavailable": "Pricing store unavailable."` — the one plain sentence the failure envelope carries; no new key |
| `services/rates/internal/handler/handler.go:34-41` | `writeOpError`: `{code, message, details, traceId}` with a fresh `traceID()` — the shared envelope, no new field |
| `services/rates/internal/handler/handler.go:155` | `NewMux(st store.Repository)` — a stub repository or a closed-pool `Postgres` can drive the handler directly |
| `services/rates/internal/handler/handler.go:178` | The `POST /v1/rates/UpsertRatePlan` route — unchanged |
| `services/rates/internal/handler/handler.go:179-225` | The handler's field checks (name, description, `defaultUnits`) and their 400 answers — unchanged and ahead of the store call |
| `services/rates/internal/handler/handler.go:226-231` | `st.UpsertRatePlan(...)` at `:226`, the `oerr != nil` branch at `:227-230`, and the `200` body `{id, name, description}` at `:231` — the branch that turns a non-nil `*OpError` into the failure envelope |
| `services/rates/internal/handler/handler_test.go:15-32` | `post`: the request helper the handler-level guards reuse (token, status, decoded JSON) |
| `services/rates/internal/handler/handler_test.go:34-45` | `seedLoop`: the healthy plan create followed by two price writes — the success path that must stay green |
| `services/rates/internal/handler/handler_test.go:47-82` | `TestDeskLoopSetRateSearchQuote`: the MVP `FR-RTE-1` guard (plan + prices drive the quote and the plan-default count) — must pass untouched |
| `services/rates/internal/handler/fail_closed_test.go:36-62` | `assertRefusal`: asserts status, code, `details`, a plain message with no envelope code, and a non-empty `traceId` — the shape `PLN-3` reuses |
| `services/rates/internal/handler/fail_closed_test.go:343-378` | `TestRatePlanTextBounds`: the accepted boundaries and the 400 refusals on the handler path — the in-memory "refusal stores nothing" twin |
| `services/rates/internal/store/fail_closed_test.go:29-42` | `assertStoreRefusal`: the `*OpError` shape helper `PLN-1` reuses (`nil`, code, status, details, message) |
| `services/rates/internal/store/fail_closed_test.go:155-191` | `TestUpsertRatePlanTextBounds`: a refused in-memory plan write emits no event (`:162-168`) and a refused update keeps the stored description (`:174-179`) — the in-memory half of "nothing stored, no event" |
| `services/rates/internal/store/postgres_test.go:13-25` | `pgTestDB`: opens the scratch engine from `TEST_PG_URL` and `t.Skip`s without it — the pattern the Postgres halves follow, and the reason `PLN-1`/`PLN-3` must not depend on it |
| `services/rates/internal/store/postgres_test.go:27-40` | `pgWipe`: clears `rates.outbox`, `rate_prices`, `stay_restrictions`, `discounts`, `rate_plans` — the scratch-database fixture the row-count halves need |
| `services/rates/internal/store/postgres_test.go:58-98` | `TestPostgresDeskLoop`: the healthy plan create with `defaultUnits: 2`, two price rows, the restriction check, the quote, and the plan-default count — the success path `PLN-5` extends, asserted today without an outbox count |
| `services/rates/internal/store/postgres_fail_closed_test.go:115-159` | `TestPostgresRatePlanTextBounds`: the Postgres bound refusals, the refused update that keeps the stored description, and the pre-bound row that still quotes |
| `services/rates/internal/store/postgres_fail_closed_test.go:161-169` | `pgPlanExists`: the "the over-bound name was stored" helper (`:127-129`) — reusable for "the phantom plan is absent" |
| `services/rates/internal/store/postgres_handler_test.go:24-47`, `:49-64`, `:66-83` | `pgHTTPDB`, `pgPost`, `pgAssertRefusal`: the Postgres-backed handler harness (`handler.NewMux(store.NewPostgres(db))`, `:107`) — the pattern for a Postgres handler half if the implementation adds one |
| `app/src/views/ManageView.vue:921-923` | `errorGeneric` = `desk.manage.error_generic` ("That did not save. Check the values and try again.") — the existing failure sentence |
| `app/src/views/ManageView.vue:1816-1840` | The read-path plan create: `UpsertRatePlan` (`:1824-1827`), the catch that sets `ratesError` and returns (`:1828-1834`), then `writeStoredPlan(plan)` and `readPrices()` (`:1838-1839`) — only on success |
| `app/src/views/ManageView.vue:1852-1876` | The explicit plan create: `UpsertRatePlan` (`:1860-1863`), the catch that sets `ratesError` and returns (`:1864-1870`), then `planMissing.value = null` and `writeNights(...)` (`:1874-1875`) — only on success |
| `app/src/views/ManageView.test.ts:633-662` | `offers the explicit plan creation when the read names an unknown plan, then re-reads` — the success twin of the read path |
| `app/src/views/ManageView.test.ts:754-786` | `offers the explicit plan creation on the first unknown-plan refusal, then retries` — the success twin of the pending-nights path |
| `contracts/http/UpsertRatePlan.json:13`, `:22-24`, `:29-32` | Request `required: ["name"]`; response `required: ["id", "name"]` with `id` `"format": "uuid"` — the schema the phantom empty `id` violated; the two error entries stay as they are |
| `services/rates/contract-tests/UpsertRatePlan.json` | The happy-path fixture (`status: 200`, name `Standard`) — shape-only and must pass unchanged |
| `script/contract-check.sh` | The contract gate `PLN-6` re-runs |
| `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `script/catalogue-coverage-check.sh` | The `ci`-job gates this docs change and the implementation PR must keep green |

Pass evidence for the covered-by-re-run rows at this head: the base code
tree is `origin/master` `1eab7cb`, where every check-run reports
`success` (`go-build (rates)`, `app-build`, `browser-e2e`,
`contract-check`, `ci`, `doc-pins`, `e2e-single-host`,
`migrate-check`, and the other module matrices; read with
`gh api repos/MingChen1501/hotel-mgmt/commits/1eab7cb/check-runs`). This
stack is docs-only — its diff against `origin/master` is empty under
`services/rates`, `contracts/`, and `app/` — so every code pin above is
byte-identical to that green base. The implementation PR supplies the
`go-build (rates)` evidence for the new guards; the Postgres halves are
not a CI job (the matrix sets no `TEST_PG_URL`), which is why `PLN-E1`
records that run explicitly.

## 3. Guard registry PLN-1–PLN-9, the residual-risk record PLN-R1, and the evidence rule PLN-E1

Naming: the registry uses `PLN-*` (the ids requirements section 41.5
already names for the four handoff guards) and the owner cases use
`PLN-C*` (section 6), so neither collides with the `FR-PLN-*` /
`AC-PLN-*` requirement and condition ids. The handoff's four are carried
unchanged as `PLN-1`–`PLN-4`; `PLN-5`–`PLN-9` are added here for the
healthy-update proof, the contract/LC gate, the no-move diff gate, the
desk regression, and the no-change NFR re-run. All guards are
**created by the #767 implementation PR**; they are listed `pending` in
section 4 until `qa-lead` re-pins them with `file:line` at the merged
head.

Every refusal is asserted on the payload, not only on the status: a 500
must carry `code: "VALIDATION_FAILED"`, an empty `details` object, the
one plain `rates.store.unavailable` sentence with no envelope code,
status number, driver, SQL, host, or stack text, and a fresh `traceId`.
The failure assertions use the store-failure answer the sibling write
already gives, never a new one. The hermetic halves run with
`TEST_PG_URL` unset and must never skip; the Postgres halves run on a
scratch database through `TEST_PG_URL` and are skipped without it, and
no key claim of this slice rests on a skipped half alone.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `PLN-1` | The store refuses a forced driver failure and never returns a plan: a `Postgres` store over (a) a **closed pool** and (b) a **stubbed `database/sql` driver** whose plan-statement query fails is called with a valid name, description, and `defaultUnits`; the call returns `nil` and a non-nil `*OpError` equal field-for-field to `storeFailure()` — `VALIDATION_FAILED`, status 500, the `rates.store.unavailable` sentence, an **empty non-nil** `details` map — and never a request-shaped plan, a partial record, or an `id` of `""`. The guard fails if the error is swallowed again (the `return plan, nil` at `services/rates/internal/store/postgres.go:109` restored). It runs with `TEST_PG_URL` unset and is never skipped | `services/rates/internal/store/plan_failure_test.go` (new file, package `store`, so the unexported `storeFailure()` is reachable), no database required |
| `PLN-2` | Nothing is stored, no event is emitted, and no phantom plan is readable. Hermetic half: the stubbed driver records every statement — the plan upsert is attempted and **no `INSERT INTO rates.outbox` and no successful `rates.rate_plans` write ever occurs** (the failure branch returns before `p.outbox`, `services/rates/internal/store/postgres.go:118`). Scratch-database half (`TEST_PG_URL`): count `rates.rate_plans` and `rates.outbox` before and after the forced failure (a reopened pool because the failing handle is closed): the plan count is unchanged, no new `rate-plan-changed` row exists, `pgPlanExists` reports the name absent, `UpsertRatePrice` for that name answers 404 `NOT_FOUND` naming `ratePlanName`, and `Quote` with the phantom plan name answers 404 naming `ratePlanName` (a type no plan prices answers `reason: "no_rate_plan"`, `services/rates/internal/store/postgres.go:467`). Both stores: the in-memory analog is `TestUpsertRatePlanTextBounds`, whose refusal stores nothing and emits no event; no in-memory driver failure is invented | `services/rates/internal/store/plan_failure_test.go` (hermetic) and a `TEST_PG_URL` half in the same file (store level, scratch database) |
| `PLN-3` | The handler answers the store-failure envelope, never a success with an empty `id`: `handler.NewMux` over a `Postgres` store on a closed pool, and over a stub `Repository` returning `(nil, storeFailure-shaped error)`, each answer exactly one `500` with `code` `VALIDATION_FAILED`, the `rates.store.unavailable` sentence, an empty `details` object, and a non-empty fresh `traceId` per call — **never** `200`, never a body carrying `id`/`name`/`description`, and never a 400 (the request is valid). The handler's existing 400 checks keep their answers when the store would also fail | `services/rates/internal/handler/plan_failure_test.go` (new file, package `handler_test`, stub `store.Repository` + closed-pool `store.NewPostgres`) |
| `PLN-4` | A retry after recovery creates the plan and the failure leaves no residue: after the forced failure, the same request repeated against a recovered database answers `200` with a non-empty UUID `id`, the stored row carries the sent `name` and `description`, `pgPlanExists` returns that `id`, and the outbox gains exactly the events a healthy write emits — none from the failed attempt. A second identical request is an update (same row, no second plan). Hermetic option: the stubbed driver fails the first plan query and answers a row afterwards, so the retry half also runs without a database. The failed request's count delta is asserted in `PLN-2` | `services/rates/internal/store/plan_failure_test.go` (hermetic switchable stub) and its `TEST_PG_URL` half (reopened pool) |
| `PLN-5` | The healthy create and update path is unchanged: a Postgres create with `defaultUnits` stores and answers the stored UUID `id`, `name`, `description`; a following update that omits `defaultUnits` keeps the stored value and updates the description; each successful Postgres write emits exactly one `rate-plan-changed` row (the store's existing behaviour), and the `200` body is byte-identical to today's. The in-memory create emits once and an in-memory update emits none (both unchanged). The handler create-then-price-then-quote path and the in-memory plan write keep passing untouched. No guard adds an event to the in-memory update path | `services/rates/internal/store/plan_failure_test.go` (`TEST_PG_URL` update half + memory half beside the existing `TestPostgresDeskLoop` / `TestUpsertRatePlanTextBounds`) |
| `PLN-6` | Contract and LC: `contracts/http/UpsertRatePlan.json` and `contracts/errors/envelope.json` are **not edited** — no new error entry, code token, status, request or response property, or required-list change; the response still requires `id` as a UUID (the schema the phantom `id: ""` violated); `services/rates/contract-tests/UpsertRatePlan.json` keeps passing with no edit; `script/contract-check.sh` is green; the `PricingService` row in `docs/technical/api-spec.md` section 2 keeps its wording. No guard asserts a 500 manifest line | `script/contract-check.sh` (CI `contract-check`) + diff gate over `contracts/` |
| `PLN-7` | Nothing else moves: the diff adds no `services/rates/migrations/` file, no column, `CHECK`, index, backfill, or stored-value rewrite; `services/rates/internal/store/postgres.go:70-79` (best-effort outbox helper), `services/rates/internal/store/postgres.go:88`, `services/rates/internal/store/postgres.go:111-119` (success path), `services/rates/internal/store/store.go:270-287` (in-memory store), `services/rates/internal/store/store.go:243` (interface), and `services/rates/internal/handler/handler.go:226-231` (success branch) are byte-identical; no `BEGIN`/`Tx`, retry loop, queue, idempotency key, compensating action, or outbox-error check appears; no environment variable, `deploy/` file, compose file, or per-hotel setting carries the rule; no catalogue key is added; the store-failure token is unchanged | Diff gate over `git diff --name-only` + `go vet ./...`, `gofmt -l .`, and `script/catalogue-coverage-check.sh` |
| `PLN-8` | The desk reports a failed plan write in its existing sentence and does not advance: with the backend answering the `500` store-failure envelope for `UpsertRatePlan`, both create paths (read-path `ManageView.vue:1816-1840` and explicit `:1852-1876`) render the existing `desk.manage.error_generic` sentence (`:1833`, `:1869`), make **no** `UpsertRatePrice` call, do not remember a plan (`writeStoredPlan` not reached, `:1838`), and keep the pending nights pending (`planMissing` stays set, `:1874-1875`); the two success twins (`ManageView.test.ts:633-662`, `:754-786`) keep passing with no edit; no desk control, label, state, or copy changes | `app/src/views/ManageView.test.ts` (new failure cases beside the two success twins) |
| `PLN-9` | Nothing else moves at the no-change level: no route, body ceiling, server timeout, lock, transaction, round trip, outside dependency, event, actor, or date format moves. The #630 body-bound/timeout guards, the paired-attempt concurrency guards, the timed desk run, the audit-actor suite, and the timezone guards pass untouched; a refused write records nothing and emits no event; a committed Postgres write keeps its `system` actor exactly as today; `script/catalogue-coverage-check.sh` stays green with no new key | No-change re-run: the existing `go-build (rates)`, `app-build`, `e2e-single-host`, and `ci` jobs; a new route, body bound, migration, or catalogue key fails `PLN-7` |
| `PLN-R1` | **Residual-risk record, not a guard.** Three pre-existing directions stay and are named, never fixed here: (1) `storeFailure()` answers `VALIDATION_FAILED` at 500 while `BR-59` reserves `INTERNAL_ERROR` for a store failure — the sibling writes already answer the same way, and aligning all thirteen call sites is the separate change in R-26; (2) the outbox helper stays best-effort, so a committed plan can still miss its event; (3) an ambiguous commit can leave a stored plan whose acknowledgement was lost, and a retry converges it while a never-retried plan stays outbox-less. **No guard in this slice may assert an `INTERNAL_ERROR` token, an outbox check, a retry loop, or an idempotency key** | Risk register R-26 + LLD 40.6 + this row; follow-up decision required |
| `PLN-E1` | Evidence rule: the implementation PR records the before/after pairs (the phantom `200` with `id: ""` and no row/no event → the `500` envelope with an empty `id`-free body), the "nothing stored, nothing readable" proof, the retry-after-recovery proof, and the byte-identical healthy create/update pair in `docs/testing/evidence/767/README.md` (created by that PR, same capture method as the `#631`, `#633`, `#636`, `#637`, and `#642` records); records the `TEST_PG_URL` row-count/parity run with the command pasted; and records the slice row in `docs/testing/test-report.md` (`test-strategy.md` [section 3](test-strategy.md) exit criterion 6). Stays pending until all three are recorded | Evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row whose guard does not exist at this
head. Rows marked pinned-today rest on pins that exist and pass today
(section 2) and must keep passing untouched. The rows stay `pending` /
`covered by re-run` until the implementation PR merges, passes, and
`qa-lead` re-pins every cell with `file:line` at the merged head
(section 8).

| Item | Required guard | Guard |
|---|---|---|
| `AC-PLN-1` — a Postgres store whose plan write cannot succeed returns a `nil` plan and the existing store-failure answer (the `rates.store.unavailable` sentence, empty `details`, a fresh `traceId`), never the request-shaped plan or an empty `id`, and no `rates.rate_plans` row and no `rate-plan-changed` row appear (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`; `BR-59`) | L1 acceptance: the forced-failure refusal on both the closed-pool and stubbed-driver shapes, the full envelope, and the no-row/no-event proof | **Pending** — `PLN-1`, `PLN-2`; **pinned today** only for the faulty branch (`services/rates/internal/store/postgres.go:104-110`) and the sibling answer (`:135`, `:150`) |
| `AC-PLN-2` — the failing Postgres database makes `POST /v1/rates/UpsertRatePlan` answer HTTP 500 with the shared envelope and never `200` with an empty or fabricated `id`; the Manage screen shows its existing failure sentence and does not advance, and a retry against a healthy database creates the plan (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-ADM-4`; `BR-59`) | L1 acceptance: the 500 envelope over a real store and over a stub repository, the never-200/never-success-body proof, the desk sentence and no-price-write proof, and the retry | **Pending** — `PLN-3`, `PLN-4`, `PLN-8`; **pinned today** only for the desktop success twins (`app/src/views/ManageView.test.ts:633-662`, `:754-786`) |
| `AC-PLN-3` — a healthy database keeps the stored row values, the one `rate-plan-changed` outbox row, and the `200` body identical to today's, an update omitting `defaultUnits` keeps the stored one, the in-memory store answers exactly as now, and no contract, schema, migration, status set, catalogue key, desk control, or print rule moves (traces to US-RTE-1, US-ADM-4; `FR-RTE-1`, `FR-RTE-10`) | L1 acceptance + diff gate: the create/update row, the per-write event, the byte-identical body, the in-memory create-only emit, and the no-move diff | **Pending** — `PLN-5`, `PLN-7`; **covered by re-run today** for the existing healthy halves (`services/rates/internal/store/postgres_test.go:58-98`, `services/rates/internal/store/fail_closed_test.go:155-191`, `services/rates/internal/handler/handler_test.go:34-45`) |
| `AC-PLN-4` — the guard suite exercises the driver failure (closed pool, cancelled context, or stubbed `*sql.DB`), asserts AC-PLN-1's refusal, AC-PLN-2's absent success body, and the absent outbox row, fails if the error is swallowed again, and `go test ./...` in `services/rates` is green with and without `TEST_PG_URL` while the existing healthy-path guards pass (traces to `AC-PLN-1`..`AC-PLN-3`; `FR-RTE-1`) | L1 acceptance: the guard-to-anti-regression pin, the suite green in both configurations, and the untouched healthy guards | **Pending** — `PLN-1`–`PLN-5`, `PLN-9`; **covered by re-run today** for the suite's current green state (`go-build (rates)` `success` at `1eab7cb`) |
| `FR-PLN-1` — a failed plan write returns the store-failure answer and no plan, never the request-shaped plan, an empty `id`, or a partial record (requirements 41.3) | L1 acceptance | **Pending** — `PLN-1` |
| `FR-PLN-2` — nothing is stored and no `rate-plan-changed` event is emitted on a failed write, so no phantom plan can be read, priced, or quoted and the stored plan set is exactly what it was (requirements 41.3) | L1 acceptance | **Pending** — `PLN-2`; **covered by re-run today** for the in-memory refusal twin (`services/rates/internal/store/fail_closed_test.go:155-191`) |
| `FR-PLN-3` — the handler answers the store-failure envelope at 500 and never a `200` with an empty or fabricated `id`; the Manage screen shows its existing failure sentence and does not advance (requirements 41.3) | L1 acceptance | **Pending** — `PLN-3`, `PLN-8` |
| `FR-PLN-4` — the same request retried after the database recovers creates or updates the plan exactly as a healthy write, with no replay, repair, or duplicate of the failed attempt and no event from it (requirements 41.3) | L1 acceptance | **Pending** — `PLN-4` |
| `FR-PLN-5` — a healthy create and update keep the stored row values (including the stored `defaultUnits` on an omitted update), the event the store emits today, and the `200` body; the in-memory store answers as now; no contract, schema, migration, status set, catalogue key, desk control, or print rule moves (requirements 41.3) | L1 acceptance + diff gate | **Pending** — `PLN-5`, `PLN-7`; **covered by re-run today** for the create half (`services/rates/internal/store/postgres_test.go:58-98`, `services/rates/internal/handler/handler_test.go:47-82`) |
| `BR-71` — a rate-plan write the store could not perform is a failure, never a stored plan: the existing store-failure answer and no plan, the handler's failure envelope and never a 2xx, nothing stored for the named failure classes and no `rate-plan-changed` event, a retriable request, and the healthy create/update row, event, and response unchanged, in both stores; a fixed code rule (business rules section 3; section 9 fixed row) | L1 acceptance + diff gates + evidence | **Pending** — `PLN-1`–`PLN-9`, `PLN-E1` |
| Both stores store nothing on a refusal — the Postgres driver-failure refusal (`PLN-1`, `PLN-2`) and the in-memory bound refusal (`TestUpsertRatePlanTextBounds`, `TestRatePlanTextBounds`) each leave the plan set and the event stream unchanged, and the in-memory store gains no driver failure and no new failure mode | L1 acceptance + diff gate | **Pending** — `PLN-1`, `PLN-2`, `PLN-7`; **covered by re-run today** for the in-memory refusal (`services/rates/internal/store/fail_closed_test.go:155-191`, `services/rates/internal/handler/fail_closed_test.go:343-378`) |
| `FR-RTE-1` / `FR-RTE-10` / `FR-ADM-4` (MVP rows, unchanged) — rate plans, the plan text bounds, and rate-plan/policy setup keep their wording and their guards; this change makes the service report a write it could not perform as a failure rather than widening any FR | L1 re-run: the MVP guard slots in matrix section 1, unedited | **Covered by re-run today** — `services/rates` `TestDeskLoopSetRateSearchQuote` (`services/rates/internal/handler/handler_test.go:47-82`) and the plan bound/desk fixtures; the MVP rows in section 1 stand unchanged and may not cite this slice as their guard |
| `AC-MANAGE-7` / `AC-RTE-10` (unchanged conditions with the new pointers) — the Manage screen's create action reports a failed plan write in its existing sentence and does not advance, and a failed plan write stores nothing while a healthy one answers as today; both conditions stand as written otherwise | L1 re-run + new desk failure case | **Pending** — `PLN-8`; **covered by re-run today** for the success paths (`app/src/views/ManageView.test.ts:633-662`, `:754-786`) |
| `NFR-I18N-1` (unchanged) — the failure reuses the existing `rates.store.unavailable` catalogue sentence, renders no envelope code, status number, driver, SQL, host, or stack text, and adds no catalogue key, so the English and Vietnamese key sets stay at parity | Catalogue gate | **Covered by re-run today** — `script/catalogue-coverage-check.sh` is green at `1eab7cb`; `PLN-7` fails a new key, and `PLN-3` asserts the plain sentence |
| `NFR-AUD-1` (unchanged) — a refused write records nothing and emits no event; a committed write keeps its actor and timestamp exactly as today | L1 acceptance + no-change re-run | **Pending** — `PLN-2`, `PLN-5`; **covered by re-run today** for the committed-write actor on the sibling paths (`services/rates/internal/store/postgres.go:95-101`, the `'system'` actor) |
| `NFR-BND-1`..`NFR-BND-3`, `NFR-CON-1`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-AVL-1`, `NFR-TZ-1` (unchanged) — no route, body ceiling, server timeout, lock, transaction, round trip, outside dependency, or date format moves; the change is one error test on a write the service already serves | No-change re-run | **Covered by re-run today** — the #630 body-bound and timeout guards, the paired-attempt guards, the timed desk run, and the timezone guards; a new route, body bound, or migration fails `PLN-7` |
| Contract and LC | Real delta: none. `contracts/http/UpsertRatePlan.json` keeps its request/response schema, required lists, and two error entries; no 500 line and no envelope token is added; the response still requires `id` as a UUID; the fixture is unchanged | **Pending gate** — `PLN-6`; no contract edit is architect-owned here (LLD 40.5 records why the pair is left consistent) |
| No-configuration and no-migration gate | Real delta: none. The refusal is the existing code path carried by no environment variable, `deploy/` file, compose file, or per-hotel setting; no migration, column, `CHECK`, backfill, index, transaction, retry loop, or stored-value rewrite is added | **Pending diff gate** — `PLN-7`; the fixed side is `docs/requirements/business-rules.md` section 9 (BR-71) |
| No-desk-regression gate | Real delta: the Manage screen's two create paths are byte-identical; they already render the existing `desk.manage.error_generic` sentence on a rejected write, and only the backend answer changes from a phantom `200` to a `500`; no other desk control, label, state, or copy moves | **Pending gate** — `PLN-8`; the pins are `app/src/views/ManageView.vue:1816-1840`, `:1852-1876`, and `app/src/views/ManageView.test.ts:633-662`, `:754-786` |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` capability wording moves; `FR-PLN-1`..`FR-PLN-5` are behaviour-scoped additions outside the counted capability set (requirements 41.2, 41.3) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Residual risk `PLN-R1` | The store-failure token (`VALIDATION_FAILED` at 500 versus `BR-59`'s `INTERNAL_ERROR`), the best-effort outbox helper, and the ambiguous-commit case stay exactly as they are; the slice neither aligns the token nor wraps the statements nor checks the outbox, and no guard may assert any of those | **Recorded, not guarded** — R-26, LLD 40.6, and this row; a fix is its own decision |
| Evidence cross-reference (`PLN-E1`) | The before/after pairs, the retry and no-phantom proofs, the `TEST_PG_URL` row-count run, and the slice row in the test report | **Pending** — `docs/testing/evidence/767/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #767): 22 rows mapped to
`AC-PLN-1`..`AC-PLN-4`, `FR-PLN-1`..`FR-PLN-5`, `BR-71`, the both-stores
no-store/no-event row, the unchanged MVP rows
`FR-RTE-1`/`FR-RTE-10`/`FR-ADM-4`, the unchanged conditions
`AC-MANAGE-7`/`AC-RTE-10`, `NFR-I18N-1`, `NFR-AUD-1`, the no-change NFR
group, the contract/LC gate, the configuration/migration gate, the
no-desk-regression gate, the MVP no-change gate, the residual-risk
record `PLN-R1`, and `PLN-E1`. Five rows carry a covered-by-re-run half
(the unchanged MVP row, the unchanged conditions row, the no-change NFR
row, `NFR-I18N-1`, and the accepted-write halves inside `AC-PLN-3`,
`FR-PLN-2`, `FR-PLN-5`, and the both-stores row); the other seventeen
are **pending** the implementation PR. The slice is **not complete** at
this spec head; it completes when the implementation PR merges with
`PLN-1`–`PLN-9` green, the Postgres halves recorded on a scratch
database, `PLN-E1` recorded, and `qa-lead` re-pins the rows at the
merged head. The MVP Coverage line below stands unchanged at 57/57.

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: `docs/architecture/services/rates.md` section 7) |
|---|---|---|
| L1 store, Rates (hermetic) | `PLN-1`, `PLN-2` hermetic half, `PLN-4` hermetic half, `PLN-5` memory half — with `TEST_PG_URL` unset | `cd services/rates && go build ./... && go vet ./... && gofmt -l . && go test ./...` (CI `go-build (rates)`; `gofmt -l .` must print nothing) |
| L1 store, Rates (Postgres parity) | `PLN-2` row counts, `PLN-4` retry, `PLN-5` update half on a **scratch** database (the fixtures wipe `rates.*`) | `cd services/rates && TEST_PG_URL=postgres://… go test ./...`; the Postgres halves skip without `TEST_PG_URL` |
| L1 handler | `PLN-3` over a stub `Repository` and a closed-pool `Postgres`; the existing create-then-price-then-quote guard | `cd services/rates && go test ./internal/handler/...` |
| L1 desk UI | `PLN-8` failure cases beside the two success twins; the unchanged Manage pins | `cd app && npm ci && npm run build && npm test && npm run lint` (CI `app-build`) |
| LC contract | `PLN-6`: the two contracts, the untouched fixture, `contract-check.sh` | `script/contract-check.sh` (CI `contract-check`) |
| Catalogue | `NFR-I18N-1` re-run: no new key, the existing sentence resolves | `script/catalogue-coverage-check.sh` (CI `ci`) |
| No-change re-run | `PLN-9`: the body-bound, timeout, concurrency, audit, and timezone guards plus the desk-loop proof | the existing `go-build (rates)`, `app-build`, `e2e-single-host`, and `ci` jobs |
| Gates | Links, harness conventions, whitespace | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR:
`go-build (rates)`, `app-build`, `contract-check`, `ci`, and
`e2e-single-host`, with `browser-e2e` running when the desk test file is
in the change set. The Postgres half is not a CI job (the matrix sets no
`TEST_PG_URL`), which is why `PLN-E1` records the row-count/parity run
explicitly and why `PLN-1`/`PLN-3` must prove the failure without a
database. Adding a database-backed job is a CI change outside this
slice's scope.

### Execution order

1. Rates hermetic store suite: `PLN-1`, the `PLN-2` driver-recording
   half, and the `PLN-4` switchable-stub half first (a red case stops
   the run), then every existing rates pin unchanged.
2. Rates Postgres suite with `TEST_PG_URL` on a scratch database: the
   `PLN-2` before/after counts, `PLN-4` retry, and `PLN-5` update half,
   then the wiped fixture rows.
3. Handler suite (`PLN-3`): the stub repository, then the closed-pool
   `Postgres`, then the untouched create-then-price-then-quote guard.
4. Contract and catalogue gates (`PLN-6`, `NFR-I18N-1`): the two
   contracts resolve and no key/entry was added.
5. The app suite (`PLN-8`): the two failure cases, then the two success
   twins and the manage pin.
6. `PLN-E1`: the before/after pairs, the retry and no-phantom proofs,
   and the `TEST_PG_URL` row-count run recorded; then the
   `test-report.md` row.
7. Link, harness, and whitespace gates; then `qa-lead` re-pins section 4
   at the merged head.

### Entry criteria

1. The spec set is `active` and `spec-reviewer` has posted `SPEC-GATE
   PASS` on #767 (T2).
2. The companion specs this plan cites are active: acceptance-criteria
   section 33 (`AC-PLN-1`..`AC-PLN-4`), requirements section 41
   (`FR-PLN-1`..`FR-PLN-5`, `BR-71`), LLD section 40, HLD section 32,
   and the refreshed Rates sections 4 and 6.
3. The build under test is identified by commit; the hermetic half
   needs no database, and the Postgres half needs a scratch database
   carrying the Rates migrations (`000001_boot`, `000002_schema`,
   `000003_default_units`) with `rates.outbox` readable for the
   "no event" counts.

### Exit criteria

1. `PLN-1`–`PLN-9` exist and pass; every failure assertion checks the
   full payload (`code`, `status`-equivalent HTTP answer, empty
   `details`, plain `message`, fresh `traceId`) **and** its stored effect
   (no plan row, no outbox row).
2. `PLN-1` and the `PLN-2`/`PLN-4` hermetic halves ran with
   `TEST_PG_URL` unset and did not skip; the Postgres halves ran on a
   scratch database and answered the same codes and payload shapes.
3. `PLN-7` holds unchanged: no migration, no transaction, no retry
   loop, no outbox-error check, no success-path edit, no in-memory-store
   edit, no interface edit, and no new catalogue key in the diff.
4. `PLN-5` holds: the healthy create and update row, event, and `200`
   body are byte-identical, and the update-omitting-`defaultUnits` case
   keeps the stored value.
5. `PLN-8` holds: both desk create paths render the existing failure
   sentence on the `500` and write no price, and the success twins pass
   with no assertion edit.
6. `PLN-E1` is recorded: the evidence pairs in
   `docs/testing/evidence/767/README.md` and the slice row in
   `docs/testing/test-report.md`.
7. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
8. Open failures are filed as issues with FR/NFR ids; no `risk-high`
   failure is waived without owner approval.

### Negative controls

- **The failure must reach the caller.** `PLN-1` asserts a non-nil
  `*OpError` on the store itself; a guard that only asserts "no success
  body" would pass on the faulty tree, because the faulty tree already
  stores nothing. The anti-regression pin is the `nil` error: restoring
  `return plan, nil` must turn `PLN-1` red.
- **The handler must not fabricate.** `PLN-3` asserts the absence of
  `id`/`name`/`description` in the 500 body as well as the status, so a
  handler that maps the failure to `200 {"id": ""}` cannot pass on the
  status alone.
- **Nothing may be written or emitted.** `PLN-2` asserts the row count
  and the outbox count around the forced failure; a refusal that still
  reached `p.outbox` (or a future edit that moved the event before the
  error check) must fail.
- **No phantom plan may be readable.** `PLN-2` calls `UpsertRatePrice`
  and `Quote` for the failed name and requires `NOT_FOUND`; a phantom
  row left by a partial write would pass a "status 500" check and fail
  this one.
- **The retry is a real write.** `PLN-4` requires a non-empty UUID `id`,
  the stored row, and the healthy event, so a guard that only repeats
  the request and checks the status cannot pass.
- **The healthy path must stay byte-identical.** `PLN-5` re-runs the
  create and adds the omitted-`defaultUnits` update; an implementation
  that "fixes" the failure by changing the success values or the
  in-memory emit fails here.
- **The failure guard must not skip.** `PLN-1` and the hermetic
  `PLN-2`/`PLN-4` halves run with `TEST_PG_URL` unset; a guard shaped
  like `pgTestDB` that skips without a database is not evidence and
  fails this spec.
- **No new token may be invented.** `PLN-1` compares against
  `storeFailure()`; a guard that asserts `INTERNAL_ERROR`, a new
  `details` field, or a different status contradicts `BR-71` and
  `PLN-R1`.

## 6. Owner verification cases (PLN-C1..PLN-C8)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` seed recipe (sign-in token, one room
type) and the issue's reproduction for the failure half. Each case
states what to send and what to see.

| Case | Setup | Expected |
|---|---|---|
| `PLN-C1` | `POST /v1/rates/UpsertRatePlan` with `{"name":"RACK","description":"Rack rate"}` on a healthy build | `200` with a non-empty UUID `id`, `name` `RACK`, `description` `Rack rate`; `rates.rate_plans` has the row and `rates.outbox` has one `rate-plan-changed` |
| `PLN-C2` | Repeat `PLN-C1` with `{"name":"RACK","description":"Rack rate v2"}` (no `defaultUnits`) | `200` with the same `id`; the stored `defaultUnits` is unchanged, the description updates, and one more `rate-plan-changed` row is written |
| `PLN-C3` | Make the plan write fail (the issue's recipe: revoke `INSERT` on `rates.rate_plans`, drop the `rates` schema, or a closed pool), then repeat the `PLN-C1` body | `500` with `code` `VALIDATION_FAILED`, the plain "Pricing store unavailable." sentence, empty `details`, and a `traceId` — never `200` and never an `id` |
| `PLN-C4` | After `PLN-C3`, run `SELECT * FROM rates.rate_plans WHERE name = 'RACK'` and count `rates.outbox` rows for `rate-plan-changed` | No row, and no `rate-plan-changed` row from the failed attempt |
| `PLN-C5` | After `PLN-C3`, `POST /v1/rates/UpsertRatePrice` for `RACK` and `QuotePrice` naming `RACK` | Both answer `404 NOT_FOUND`; the earlier "success" did not exist, so no phantom plan is readable or priceable |
| `PLN-C6` | Recover the database and repeat the `PLN-C1` body | `200` with a non-empty UUID `id`; the row is stored and exactly the healthy event is written — no replay or duplicate from `PLN-C3` |
| `PLN-C7` | On the Manage screen, trigger both plan creates (a read that names an unknown plan, then the explicit create) against a failing plan write | The existing "That did not save. Check the values and try again." sentence shows on both paths, no nightly-price write follows, and the screen does not treat a plan as created |
| `PLN-C8` | Repeat `PLN-C3`–`PLN-C6` on a Postgres-backed build | The same status, code, message, and `details` as the in-memory build's handler answers, and the same no-row/no-event/retry result |

Desk regression on the same build: `PLN-D1` the Manage screen still
creates a plan and writes nightly prices on a healthy backend; `PLN-D2`
a healthy update still keeps the stored `defaultUnits`; `PLN-D3` no new
control, label, state, or copy appears. Expected: unchanged from the
pre-change desk.

## 7. Evidence rule PLN-E1

The implementation PR records three before/after pairs plus the parity
run (`docs/testing/evidence/767/README.md`, created by that PR, same
capture method as the `#631`, `#633`, `#636`, `#637`, and `#642`
records):

- **Phantom-success pair.** Before: a `POST /v1/rates/UpsertRatePlan`
  against a database that cannot write answers `200` with
  `{"id": "", "name": "RACK", "description": "Rack rate"}` — a value the
  operation's own response schema forbids. After: the same request
  answers `500` with the `VALIDATION_FAILED` envelope, the plain
  "Pricing store unavailable." sentence, empty `details`, and a
  `traceId`.
- **Nothing-stored, nothing-readable pair.** Before: on the failing
  build the `200` names a plan that `SELECT * FROM rates.rate_plans` does
  not contain and whose `rates.outbox` has no `rate-plan-changed` row;
  the next `UpsertRatePrice` for the name answers `NOT_FOUND`. After:
  the refusal stores no row and writes no event, and the same
  `UpsertRatePrice`/`QuotePrice` calls still answer `NOT_FOUND` — with
  the refusal itself never claiming a plan.
- **Retry pair.** Before: nothing to retry against (the first call
  claimed success, so a retry is a silent update of a non-existent row).
  After: the failed request repeated once the database can write answers
  `200` with a non-empty UUID `id`, stores the row, and writes exactly
  the healthy `rate-plan-changed` row, with no residue from the failed
  attempt.
- **Healthy-path pair.** Before and after: the create and the
  update-omitting-`defaultUnits` write the same row values, the same one
  event per successful write, and the same `200` body — byte-identical,
  so the fix changes only the failure branch.
- **Parity run.** `PLN-2`'s row counts, `PLN-4`'s retry, and `PLN-5`'s
  update half executed with `TEST_PG_URL` on a scratch database, with the
  statement counts and row counts pasted (the Go matrix sets no
  `TEST_PG_URL`, so a green `go-build (rates)` job is not parity evidence
  on its own), alongside the hermetic `PLN-1`/`PLN-3` run with the
  variable unset.

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and the re-pin rule

At the spec head: 22 rows mapped — five rows carry a covered-by-re-run
half whose pins exist and pass (the unchanged MVP row, the unchanged
`AC-MANAGE-7`/`AC-RTE-10` row, `NFR-I18N-1`, the no-change NFR row, and
the accepted-write halves inside `AC-PLN-3`, `FR-PLN-2`, `FR-PLN-5`, and
the both-stores row) and the other seventeen are **pending** the
implementation PR (the registry `PLN-1`–`PLN-9`, the gates, the
residual-risk record, the MVP no-change gate, and `PLN-E1`). The slice is
**not complete** at this spec head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise. When the implementation PR merges, `qa-lead`
re-reads every `file:line`, rewrites the pins in place (never deletes
one), records the merged head SHA in the matrix section 33 status line,
and flips the rows. A row whose guard the PR did not create stays
pending and is filed as a gap on #767.

The one wiring change the implementation PR is expected to make is not
an assertion change: `services/rates/internal/store/postgres.go:109`'s `return plan, nil` becomes
`return nil, storeFailure()` and the #767 comment above it is deleted;
the success path (`services/rates/internal/store/postgres.go:88`,
`services/rates/internal/store/postgres.go:95-103`,
`services/rates/internal/store/postgres.go:111-119`), the in-memory store, the
`Repository` interface, the handler's success branch, and the best-effort
outbox helper stay byte-identical. Every existing assertion — including
`TestPostgresDeskLoop` (`services/rates/internal/store/postgres_test.go:58-98`), the handler's
create-then-price-then-quote guard (`services/rates/internal/handler/handler_test.go:47-82`), and the two
desk success twins (`ManageView.test.ts:633-662`, `:754-786`) — must keep
its wording. Deleting or loosening an assertion instead of adding cases
fails `PLN-9`.

The 57/57 MVP coverage count in
[traceability-matrix.md](traceability-matrix.md) stands unchanged: this
slice adds no MVP capability, and no MVP row may cite it as its guard.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1289
