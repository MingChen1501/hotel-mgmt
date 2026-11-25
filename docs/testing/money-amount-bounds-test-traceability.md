# Money amount bounds test traceability (Refs #635)

Status: active. Testing spec for the T2 money-amount change
([issue #635](https://github.com/MingChen1501/hotel-mgmt/issues/635),
audit finding B2 — Billing's money adapter takes any JSON number and
truncates it to a whole minor unit, so `amountMinor: 12.99` posts 12
with no refusal, and no adapter bounds the magnitude, so a value far
beyond anything the product can produce enters the stored integer and
the folio), owned by `qa-lead`. It maps the change's done-conditions —
`AC-AMT-1`..`AC-AMT-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 23](../product/acceptance-criteria.md) —
the requirements `NFR-AMT-1`..`NFR-AMT-4`, owned by `business-analyst`
in `docs/requirements/mvp-requirements.md`
[section 31](../requirements/mvp-requirements.md), and the business rule
`BR-61` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md) to their guards:
the pins that exist on disk at this spec head, the guard registry
`AMT1`–`AMT20`, and the evidence rule `AMT-E1`.

Written before the implementation PR. Every new guard in the registry
is a **named, missing obligation** at this head — `amountOf` truncates
with `longValue()`, no money ceiling exists, and neither new catalogue
key exists — so no row here marks a guard complete before it exists and
passes, and the slice is not complete until the implementation PR
merges and `qa-lead` re-pins every row at the merged head (the
`#588 -> #599` pattern). Section 1 states the tier and the no-change
rules; section 2 cites what is on disk today and what it proves;
section 3 names the guards the implementation PR must create; section 4
is the traceability map; section 5 is the test plan it must run;
section 6 is the owner verification cases; section 7 the evidence rule;
section 8 the slice status and the re-pin rule.

Companion specs: scope decision D-35 in
`docs/project/decision-log.md`
[the decision log](../project/decision-log.md) and risk R-16 in
`docs/project/risk-register.md`
[the risk register](../project/risk-register.md); the ceiling, the
enforcement point in `amountOf`, the refusal shape, the percent split,
the per-flow diagram, the contract decision, and the verification plan
in `docs/architecture/lld.md` [section 30](../architecture/lld.md)
(30.1 the constant and the one helper, 30.2 what the refusal carries,
30.3 the percent adapter, 30.4 the folio-write refusal frame, 30.5 the
contract decision, 30.6 the verification plan); the planned per-service
delta in `docs/architecture/services/billing.md`
[section 10](../architecture/services/billing.md); the money convention
in `docs/technical/api-spec.md` [section 1](../technical/api-spec.md);
the refusal in the taxonomy in `docs/technical/error-handling.md`
[section 1.2](../technical/error-handling.md). Sibling tests this slice
must not disturb: the `traceability-matrix.md` sections 9-16 and 20-22
rows plus their registries (`checkout-settlement-test-traceability.md`
`S1`-`S12`, `departure-release-test-traceability.md` `DR1`-`DR13`,
`arrival-reassign-test-traceability.md` `RR1`-`RR13`,
`booking-management-view-test-traceability.md` `BM1`-`BM16`,
`folio-write-verification-test-traceability.md` `FW1`-`FW13`,
`internal-error-envelope-test-traceability.md` `ERR1`-`ERR9`, and
`body-bounds-test-traceability.md` `BND1`-`BND28`). This spec
implements no code, changes no guard, adds no catalogue key, and moves
no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `product-owner` (acceptance criteria
  section 23), `business-analyst` (requirements section 31), and
  `architect` (LLD section 30): a caller-visible refusal on four
  Billing operations, with no new subsystem, dependency edge, data
  model, lifecycle state, endpoint, reader-visible surface, or
  error-code token. No ADR: ADR-0004 D1 already covers the envelope.
- One ceiling for every money field — **1 000 000 000 000 minor
  units** — declared once in `BillingController` as a `static final`
  code constant, the same value for `PostCharge.amountMinor`,
  `RecordPayment.amountMinor`, and `UpsertChargeItem.priceMinor`,
  never configuration (D-35). It is derived from the largest
  legitimate single amount the product can produce, one room charge at
  a stay's frozen quoted total (`BR-45`) over the longest stay Rates
  accepts, 730 nights, at the owner boards' standard rate
  (65 700 000 000 minor units, more than 15 times below the ceiling),
  and it sits below 2<sup>53</sup> so every accepted amount round-trips
  exactly through JSON and the stored integer (`NFR-AMT-2`).
- A value that is not a whole number of minor units is **refused, never
  truncated**, and a magnitude above the ceiling is refused too: one
  HTTP 400 shared envelope, `code: "VALIDATION_FAILED"`, `details`
  naming the field, one plain catalogue sentence
  (`error.validation.amount_not_integer` or
  `error.validation.amount_above_ceiling`), and a fresh `traceId`
  (LLD 30.2). The refusal is raised in `amountOf`, before the service
  call, so no folio row, line, payment, balance movement, charge item,
  idempotency record, or outbox event is written (`AC-AMT-1`,
  `AC-AMT-2`).
- Whole-ness is a property of the value, not of its JSON spelling:
  `12.0` is the whole amount 12 and is accepted exactly as `12` is. An
  absent money field keeps `error.validation.field_required`, and a
  present value that is not a JSON number is refused with the existing
  `error.validation.field_number` sentence naming the field (`AC-AMT-1`,
  `AMT20`).
- The bound is on the magnitude: a huge negative amount is refused by
  the ceiling rule, while an in-range negative amount passes the
  adapter and keeps the service's existing sign refusal
  (`error.validation.amount_negative`, `error.validation.amount_positive`,
  or `error.validation.price_negative`, `BillingService.java:134-136`,
  `:172-174`, `:321-323`).
- The tax-rule percent is bounded **as a number, not as money**: a
  fractional percent such as `8.5` stays accepted and drives the
  derivation exactly as today, the 0-100 range stays the service's
  (`BillingService.java:340-342`, `error.validation.percent_range`), an
  absent `percent` keeps `error.validation.field_required`, and a
  present value that is not a JSON number answers
  `error.validation.field_number` naming `percent` instead of the
  missing-field sentence (LLD 30.3). No whole-number rule and no money
  ceiling apply to `percent`.
- A present **money** value that is not a JSON number is `AC-AMT-1`'s
  second case in acceptance criteria section 23 (LLD 30.3 states the
  adapter shape), and `AC-AMT-5` requires its guard: it answers
  `error.validation.field_number` naming the field instead of today's
  missing-field sentence and writes nothing. This spec therefore
  registers `AMT20` for that case, one assertion set per money field,
  and no existing assertion may move (`AMT17`).
- No new token, no contract change: `VALIDATION_FAILED` is already in
  the contract enum and maps to 400
  (`contracts/errors/envelope.json:9`, `:17`), the three request
  schemas already publish `"type": "integer"` with a `minimum` only
  (`contracts/http/PostCharge.json:18`, `RecordPayment.json:17`,
  `UpsertChargeItem.json:16`), and the ceiling deliberately stays out
  of the schemas because no validator runs on Billing's request path
  (LLD 30.5).
- No schema, table, column, migration, stored value, event, or backfill.
  No configuration, deployment, environment, or runbook delta: moving
  the ceiling into configuration is the T4 re-tier trigger (LLD 30.7).
- No desk change: both Folio money inputs already send whole minor
  units (`app/src/views/FolioView.vue:441-451`, the rounding at `:450`),
  so neither new refusal is reachable from the desk, and
  `amountMinor`/`priceMinor` match none of the field names a desk
  refusal branches on (`stayId`, `folioId`, `paymentId`).
- No MVP row moves: the 57-row coverage count in
  `traceability-matrix.md` stands unchanged and no MVP `FR-*`/`NFR-*`
  row may cite this slice as its guard; the slice rows live in
  `traceability-matrix.md` section 23, and the four `NFR-AMT-*` are
  requirement additions outside the counted MVP capability set.
- Change-level rollback is one revert: the constant, the two checks in
  `amountOf`, the percent presence/type split, and the two catalogue
  sentences fall back to today's truncating `amountOf`, and no
  migration or data repair exists in either direction.
- **No transitional red at this spec head.** The branch is docs-only,
  so the code tree is the base the stacked spec PRs branched from; no
  existing Billing assertion is edited here. The Billing suite was not
  re-run in this worktree (no JDK or Maven installed); it is the
  unchanged baseline the `billing-build` CI job last ran, and the
  implementation PR runs `mvn verify`.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is identical to the stacked spec PRs' base (the product,
architecture, and requirements spec PRs touch `docs/` only). They prove
today's behaviour: every money field is truncated through `longValue()`,
no magnitude is bounded, no ceiling constant and no whole-number or
ceiling catalogue key exists, and the sign and percent rules live in
the service. The implementation PR extends these in place with a
`#635` note and never deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:47-53` | `amountOf` accepts any `Number` and returns `number.longValue()` (`:50`); a non-`Number` falls through to the required-field refusal (`:52`); no whole-number check and no bound | `AMT1`-`AMT9` depend on `amountOf` doing a `BigDecimal` whole-number test, a magnitude check against the constant, and `longValueExact()` instead of the truncating conversion; `AMT20` splits presence from type so a present non-number names the field with `field_number` |
| `BillingController.java:55-64` | `percentOf` builds a `BigDecimal` from `number.toString()` (`:59`), maps a failed conversion to `error.validation.field_number` (`:61`), and otherwise answers the missing-field sentence (`:63`); the `instanceof Number` test doubles as the presence test | `AMT11` splits presence from type so a present non-number percent names `percent` with `field_number`; the conversion itself stays |
| `BillingController.java:86`, `:93`, `:129` | `PostCharge` reads `amountMinor` (`:86`), `RecordPayment` reads `amountMinor` (`:93`), `UpsertChargeItem` reads `priceMinor` (`:129`); no caller checks magnitude | `AMT1`-`AMT10` exercise all three call sites; the checks live in the one helper, not in the callers |
| `BillingController.java:67-72` | `requireToken` runs before any field is read on every route (`:84`, `:92`, `:128`, `:137`) | A money refusal must still answer after the token check, so a missing token stays `UNAUTHENTICATED` (`AMT17`) |
| `services/billing/src/main/java/com/hotel/billing/service/BillingService.java:134-136`, `:172-174`, `:321-323` | `postCharge` refuses a negative amount (`amount_negative`), `recordPayment` requires a positive one (`amount_positive`), `upsertChargeItem` refuses a negative price (`price_negative`) | `AMT13` guards these rules as the layer that keeps them; the adapter adds no sign rule of its own |
| `BillingService.java:340-342` | The percent 0-100 range refuses with `error.validation.percent_range`, `{min}`/`{max}` rendered through `Messages.formatNumber` (`:341`) | `AMT12` keeps this refusal unedited; the new ceiling sentence reuses the same formatter call |
| `services/billing/src/main/resources/messages/en.json:22-53` | The `error.validation.*` family: `:22` `field_required`, `:23` `field_number`, `:36` `amount_negative`, `:37` `amount_positive`, `:39` `price_negative`, `:40` `percent_range`; no `amount_not_integer` and no `amount_above_ceiling` | `AMT14` adds the two keys; the gate requires this file to stay byte-identical to the canonical `messages/en.json` |
| `messages/en.json:22-53`, `messages/vi.json` | The canonical catalogue carries the same family at the same lines and the same two absent keys; `messages/vi.json` carries the exact en key set with matching placeholders (`script/catalogue-coverage-check.sh:213-252`) | `AMT14` adds both keys to the canonical file, the byte-identical Billing mirror, and `messages/vi.json` in the same change |
| `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java:36-37` | `@WebMvcTest(BillingController.class)` with `MockMvc` (`:39-40`) and a mocked `BillingService` (`@MockBean` `:42-43`), so a refusal can be proven to precede any service call | `AMT1`-`AMT11`, `AMT13`, `AMT15`, `AMT20` extend this suite; every refusal case asserts `verifyNoInteractions(service)` |
| `BillingControllerTest.java:48`, `:63`, `:78`, `:296` | The existing controller cases: `PostCharge` 12 000 (`:48`), the taxed `PostCharge` 100 000 with tax 8 000 (`:63`), a whole percent `8` (`:78`), a receipt (`:296`) | `AMT10` and `AMT17` keep every one of these assertions untouched |
| `BillingControllerTest.java:326`, `:340`, `:351` | The #630 body-ceiling cases: over-limit refusal with `verifyNoInteractions`, the no-token over-limit case, and the at-ceiling control | `AMT17` keeps them green; `AMT1`-`AMT9` reuse the same harness and envelope assertions |
| `BillingControllerTest.java` (no case) | No controller test drives `RecordPayment` or `UpsertChargeItem` at all, and none sends a fractional value, a whole value written with a decimal point, or an over-ceiling amount | `AMT2`, `AMT3`, `AMT5`, `AMT6`, `AMT9`, `AMT10` create those cases |
| `services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java:103` | `upsertTaxFeeRuleRefusesBadInput`: blank name, absent percent, `-1`, and `101` all refuse `VALIDATION_FAILED`, and the repo is never touched | `AMT12` keeps it unedited; `AMT11` adds the `8.5` acceptance at the controller |
| `BillingServiceTest.java:54`, `:71`, `:86`, `:120` | The method refusal (`:54`), the idempotent replay (`:71`), the tax/fee derivation (`:86`), and the day-close totals (`:120`) | `AMT10` and `AMT17` keep them green untouched |
| `services/billing/src/test/java/com/hotel/billing/util/MessagesTest.java:24` | The byte-identical sampled catalogue guard, already covering `amount_negative` (`:38`), `amount_positive` (`:44`), `price_negative` (`:60`), and `percent_range` (`:62`) | `AMT14` adds one rendered row per new key |
| `contracts/http/PostCharge.json:18`, `RecordPayment.json:17`, `UpsertChargeItem.json:16` | Each money field is `"type": "integer"` with a `minimum` only — the whole-number type the service publishes and never enforced — and no `maximum` | `AMT16` keeps every contract byte identical; the ceiling stays out of the schemas (LLD 30.5) |
| `contracts/errors/envelope.json:9`, `:17` | `VALIDATION_FAILED` is in the `code` enum and maps to 400; no new token is needed | `AMT16` keeps the enum and mapping unchanged |
| `services/billing/src/main/java/com/hotel/billing/web/MaxBodySizeFilter.java:38` | `MAX_BODY_BYTES` is the established shape of a `static final` service constant the test reads from the declaration (the #630 pattern LLD 30.1 reuses) | `AMT7` reads `MONEY_CEILING_MINOR` the same way instead of repeating the literal |
| `app/src/views/FolioView.vue:441-451` | `parseMinor` trims, rejects a non-finite value, and returns `Math.round(major * 100)` (`:450`); both money inputs use it (`:979`, `:1042`) | `AMT18` re-runs the desk suites; no desk code change is permitted |
| `app/src/views/desk-edge-guards.test.ts:41-46` | A rendered API failure must carry no raw envelope token, status number, brace, or stack/trace text | `AMT18` re-runs it; neither new sentence names an internal detail |
| `services/guests/contract-tests/ProduceConfirmation.json:13` | The largest money fixture in the tree is 2 400 000 minor units (a quoted VND price); a repo-wide scan of `amountMinor`/`priceMinor` fixtures at this head finds no larger value | `AMT8` shows the ceiling is far above it (about 416 667 times) |
| `script/contract-check.sh`, `script/openapi-route-check.sh` | The contract-shape and route gates; both green at this head | `AMT16` keeps both green with no `contracts/` change |
| `script/catalogue-coverage-check.sh` | The catalogue-coverage gate (run in CI's `ci` job) | `AMT14` keeps it green with the two added keys |
| `grep -rn "MONEY_CEILING\|amount_not_integer\|amount_above_ceiling\|longValueExact" services/ contracts/ app/ messages/ script/` | No ceiling constant, no whole-number check, and neither new key exists anywhere in the tree at this head | The finding itself; `AMT1`-`AMT14` are the guards that would have caught it |

## 3. Guard registry AMT1-AMT20 and the evidence rule AMT-E1

Twenty obligations, all inside the one Billing service.
`AMT1`-`AMT11`, `AMT13`-`AMT15`, and `AMT20` are **missing guards** the
implementation PR creates (three fractional, three present non-number,
three over-ceiling, the constant, the boundary pair, the decimal-point
acceptance, the in-range regression, the percent split, the sign-rule
pins, the two catalogue sentences, and the idempotency case); `AMT12` re-runs the service's
percent-range case with no edit; `AMT16`-`AMT19` are re-runs and gates
the same PR must prove; `AMT-E1` is the evidence record. A money guard
is not complete on the returned status alone: every refusal case also
asserts the exact four-key envelope, the catalogue sentence,
`details.field`, a non-empty `traceId`, and that the service was never
called — a guard that refuses everything at 400 would pass a
status-only check.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `AMT1` | **`PostCharge.amountMinor` fractional refusal (`AC-AMT-1`, `NFR-AMT-1`, `BR-61`)**: send `12.99` and assert HTTP 400, a JSON body with **exactly** the four envelope keys, `code: "VALIDATION_FAILED"`, `details` deep-equal `{"field": "amountMinor"}`, `message === Messages.text("error.validation.amount_not_integer", Map.of("field", "amountMinor"))` ("amountMinor must be a whole number of minor units."), and a non-empty `traceId`; assert `verifyNoInteractions(service)` so the value is never truncated and nothing is written | `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java` (extend) |
| `AMT2` | **`RecordPayment.amountMinor` fractional refusal (`AC-AMT-1`, `NFR-AMT-1`, `BR-61`)**: the same assertions for `amountMinor: 12.99` on the payment route — the first controller case this route has | the same suite |
| `AMT3` | **`UpsertChargeItem.priceMinor` fractional refusal (`AC-AMT-1`, `NFR-AMT-1`, `BR-61`)**: the same assertions for `priceMinor: 12.99`, with `details.field` `priceMinor` and the sentence naming `priceMinor` — the first controller case this route has | the same suite |
| `AMT4` | **`PostCharge` over-ceiling refusal (`AC-AMT-2`, `NFR-AMT-2`, `BR-61`)**: send `1_000_000_000_001` and `-1_000_000_000_001` and assert the same envelope with `error.validation.amount_above_ceiling` ("amountMinor must be at most 1,000,000,000,000 minor units." rendered through `Messages.formatNumber`), `details.field` `amountMinor`, a non-empty `traceId`, and `verifyNoInteractions(service)` for both; then send an in-range `-1` and assert the service **is** called (the adapter adds no sign rule) with the service's own `amount_negative` refusal surfacing unchanged | the same suite |
| `AMT5` | **`RecordPayment` over-ceiling refusal**: the same three cases, with the in-range `0` and `-1` reaching the service and its `amount_positive` refusal surfacing unchanged, and `details.field` `amountMinor` | the same suite |
| `AMT6` | **`UpsertChargeItem` over-ceiling refusal**: the same three cases on `priceMinor`, with the in-range `-1` reaching the service and its `price_negative` refusal surfacing unchanged | the same suite |
| `AMT7` | **One declared ceiling constant (`AC-AMT-2`, `NFR-AMT-2`)**: assert the declared `BillingController.MONEY_CEILING_MINOR` equals `1_000_000_000_000`, is the same value the three fields are checked against, and is below `2^53`; the assertion reads the declaration (package-visible `static final`), never a repeated literal, so a changed constant fails the guard | the same suite |
| `AMT8` | **Boundary pair and the largest legitimate charge (`AC-AMT-2`, `AC-AMT-3`, `NFR-AMT-2`)**: for each money field, `1_000_000_000_000` is accepted (the service is called) and `1_000_000_000_001` is refused; `65_700_000_000` — one room charge at a 730-night stay at the owner boards' standard rate — is accepted, so a ceiling that is too small fails here | the same suite |
| `AMT9` | **Whole value spelled with a decimal point (`AC-AMT-3`, `NFR-AMT-1`)**: `12.0` is served exactly as `12` is for each money field — the same service call with the same `long` value and the same success answer — so whole-ness is read from the value, not the JSON spelling | the same suite |
| `AMT10` | **In-range regression per field (`AC-AMT-3`, `NFR-AMT-4`, `BR-61`)**: the existing `PostCharge` amounts and the taxed derivation keep their answer (`:48`, `:63`), `0` is accepted for `PostCharge.amountMinor` and `UpsertChargeItem.priceMinor`, an idempotent replay returns the original line (`BillingServiceTest.java:71` stays green), and `RecordPayment`/`UpsertChargeItem` gain an in-range success case because no controller test drives them today | the same suite |
| `AMT11` | **Percent adapter split (`AC-AMT-4`, `NFR-AMT-3`)**: a present non-numeric `percent` (a string, an object) answers `VALIDATION_FAILED` 400 with `details.field` `percent` and the `error.validation.field_number` sentence instead of the missing-field one; `8.5` is accepted and the service receives `BigDecimal("8.5")` exactly as today; an absent `percent` keeps `error.validation.field_required` | the same suite |
| `AMT12` | **Percent range unchanged (`AC-AMT-4`, `NFR-AMT-3`) — re-run, no edit**: the 0-100 refusal naming `percent` with `error.validation.percent_range` stays in the service and its case passes untouched; no whole-number rule and no money ceiling are applied to a percent | `services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java:103` — no edit permitted |
| `AMT13` | **Sign rules stay in the service (`AC-AMT-2`, `NFR-AMT-4`)**: add one service case per money field — `postCharge` with `-1` answers `amount_negative`, `recordPayment` with `0` and `-1` answers `amount_positive`, `upsertChargeItem` with `-1` answers `price_negative`, each with `details.field` `amountMinor` or `priceMinor` and the repo never touched — so the layer that owns the sign rule is guarded, and the adapter's pass-through of an in-range negative is not a duplicate rule | `BillingServiceTest.java` (extend) |
| `AMT14` | **Catalogue sentences (`AC-AMT-5`, `NFR-AMT-1`, `NFR-AMT-2`, `BR-61`)**: one assertion per new key pins the rendered sentence with its placeholders (`{field}` and `{max}` rendered through `Messages.formatNumber`); both keys exist in the canonical `messages/en.json`, the byte-identical Billing mirror `services/billing/src/main/resources/messages/en.json`, and `messages/vi.json` with the same placeholders; neither sentence names a stack trace, SQL, host, path, or internal class; `script/catalogue-coverage-check.sh` is green | `services/billing/src/test/java/com/hotel/billing/util/MessagesTest.java` (extend) |
| `AMT15` | **A refused request consumes no idempotency key (`AC-AMT-1`, `NFR-AMT-4`, `BR-61`)**: send a fractional `PostCharge` that carries an `idempotencyKey`, assert `verifyNoInteractions(service)`, then send the corrected whole amount **with the same key** and assert the service is called once — the refusal left no key claimed and the retry is a first attempt, not a replay | `BillingControllerTest.java` (extend) |
| `AMT16` | **Contract, envelope, and no-drift gate (`AC-AMT-3`, `AC-AMT-5`, `NFR-AMT-2`) — re-run, no edit**: `contracts/` carries no change (the enum, `statusMapping`, the three request schemas, and every fixture are byte-identical), the envelope's four fields and `ApiExceptionHandler` rendering are unchanged, and both `script/contract-check.sh` and `script/openapi-route-check.sh` stay green — so no new code token appears and no `maximum` sneaks into a schema without its own contract change | `contracts/**`, `services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java` — no edit permitted; both scripts |
| `AMT17` | **Existing Billing suites pass unedited (`AC-AMT-3`, `NFR-AMT-4`) — re-run, no edit**: every existing success and refusal assertion in `BillingControllerTest` (`:48`, `:63`, `:78`, `:106`, `:296`, `:326`, `:340`, `:351`) and `BillingServiceTest` (`:54`, `:71`, `:86`, `:103`, `:120`) passes with its assertions untouched, the missing-token case still answers `UNAUTHENTICATED`, and `mvn verify` is green — the boundary proof that nothing in-ceiling changed | both suites — no edit to an existing assertion |
| `AMT18` | **Desk parity re-run (`AC-AMT-3`, `BR-61`)**: the desk no-leak guard, the Folio money-input tests, the print tests, and the desk suites are green; `parseMinor` still sends whole minor units and no desk branch on `amountMinor` or `priceMinor` appears; no route, layout, print rule, or catalogue key beyond the two service sentences moves; `script/catalogue-coverage-check.sh` is green | `app/src/views/desk-edge-guards.test.ts:41-46`, `app/src/views/FolioView.test.ts`, `app/src/views/PrintView.test.ts`, `script/catalogue-coverage-check.sh` — no edit permitted |
| `AMT19` | **No-configuration gate (`AC-AMT-2`, `NFR-AMT-2`, `BR-61`)**: the diff carries no money ceiling in an environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; `MONEY_CEILING_MINOR` is the only source of the value and `Messages.formatNumber` the only renderer | diff inspection recorded in the implementation PR body; `deploy/**`, `docs/devops/**`, `docs/operations/**` — no ceiling edit permitted |
| `AMT20` | **Present non-number money refusal on all three adapters (`AC-AMT-1`, `AC-AMT-5`, `NFR-AMT-1`, `BR-61`)**: for each money field, send a present value that is not a JSON number (a string `"12"`, an object) and assert HTTP 400, the four-key envelope, `code: "VALIDATION_FAILED"`, `details` deep-equal `{"field": "<that field>"}`, `message === Messages.text("error.validation.field_number", Map.of("field", "<that field>"))` and **not** the `field_required` sentence, a non-empty `traceId`, and `verifyNoInteractions(service)`; an absent field still answers `field_required`, so "absent" and "wrong type" answer differently | `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java` (extend) |
| `AMT-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build and records the before/after pair in `docs/testing/evidence/635/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping
it to covered only when the guard passes. The desk pins, the contract
gate, and the existing in-ceiling answers are covered **by re-run
today** — they exist and pass and must keep passing untouched — but the
slice as a whole stays incomplete. The Billing suite and the desk
suites were not re-run in this worktree (docs-only branch, no JDK or
Maven); they are the unchanged baselines the `billing-build` and
`app-build` CI jobs last ran, and the implementation PR runs both.

| Item | Required guard | Guard |
|---|---|---|
| `AC-AMT-1` — a fractional or present non-number money value on `PostCharge`, `RecordPayment`, or `UpsertChargeItem` answers exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming that field, the `error.validation.amount_not_integer` sentence for a fractional number and the `error.validation.field_number` sentence for a present non-number value, a `traceId`), is never truncated, and writes nothing (traces to `NFR-AMT-1`, `BR-61`) | L1 acceptance: one fractional case and one present non-number case per money field plus the no-service-call evidence | **Pending** — `AMT1`-`AMT3`, `AMT15`, `AMT20`; today's opposite is `BillingController.java:47-53` (the truncation at `:50`, the missing-field answer at `:52`) reached from `:86`, `:93`, `:129` |
| `AC-AMT-2` — a magnitude above 1 000 000 000 000 minor units on the same three fields answers the same envelope with `error.validation.amount_above_ceiling` carrying the ceiling and writes nothing; a huge negative is refused by this rule while an in-range negative keeps the service's sign refusal (traces to `NFR-AMT-2`, `BR-61`) | L1 acceptance: the over-ceiling pair per field, the boundary pair, and the sign pass-through | **Pending** — `AMT4`-`AMT8`, `AMT13`, `AMT19`; no bound exists at `BillingController.java:47-53` |
| `AC-AMT-3` — a whole amount inside the ceiling behaves exactly as today (same status, code, message, `details`, stored effect), including `0`, an idempotent replay, the tax/fee derivation, and `12.0` accepted as `12`; an amount at exactly the ceiling is accepted and one minor unit more is refused; `contract-check` stays green with no contract file changed (traces to `NFR-AMT-1`, `NFR-AMT-4`, `BR-61`) | L1: the boundary pair, the decimal-point case, and the in-range regression; re-run: existing suites and contract gate | **Covered by re-run today for the existing in-ceiling answers (`AMT17`), and pending for the boundary pair, the decimal-point case, and the explicit regression (`AMT8`-`AMT10`, `AMT16`)** — the existing answers are pinned at `BillingControllerTest.java:48`, `:63`, `:296` and `BillingServiceTest.java:71`, `:86` |
| `AC-AMT-4` — the percent adapter answers `field_number` naming `percent` for a present value it cannot read as a finite number, keeps a fractional percent such as `8.5` accepted, keeps the service's 0-100 `percent_range` refusal, and keeps `field_required` for an absent `percent` (traces to `NFR-AMT-3`, `BR-61`) | L1 acceptance: the four percent cases | **Covered by re-run today for the 0-100 and absent-field halves (`AMT12`, `BillingServiceTest.java:103`), and pending for the type split and the `8.5` acceptance (`AMT11`)** — today's type fall-through is `BillingController.java:63-64` |
| `AC-AMT-5` — each of the three money adapters carries a fractional guard, a present non-number guard, and an over-ceiling guard with "the service was never called" evidence, the percent adapter has its unreadable-value guard, the boundary pair exists, an in-range regression case exists per field, and the catalogue guard pins both new sentences (evidence condition; no behaviour change) | L1 + evidence: `AMT1`-`AMT7`, `AMT8`, `AMT10`, `AMT11`, `AMT14`, `AMT20`, and the record | **Pending** — `AMT1`-`AMT7`, `AMT10`, `AMT11`, `AMT14`, `AMT20`, `AMT-E1` |
| `NFR-AMT-1` — a money amount is a whole number of minor units refused before any work when it is not: one 400 envelope naming the field, never truncated, nothing written, an absent field still `field_required`, a present non-number value refused with `field_number`, and a whole value written with a decimal point accepted (section 31.3) | L1 acceptance: the three fractional cases, the three present non-number cases, the decimal-point case, and the catalogue sentence | **Pending** — `AMT1`-`AMT3`, `AMT9`, `AMT14`, `AMT15`, `AMT20` |
| `NFR-AMT-2` — every money amount is bounded by one declared ceiling of 1 000 000 000 000 minor units, the same for all three fields, below 2<sup>53</sup>, carried by no configuration source; an amount at the ceiling is accepted and one more refused, and a 730-night charge at the standard rate (65 700 000 000) is accepted (section 31.3) | L1: the constant assertion and the boundary pair; LC: contract gate; diff gate: no configuration source | **Pending** — `AMT4`-`AMT8`, `AMT7`, `AMT16`, `AMT19`; the constant is missing from `BillingController.java:47-53`, and the shape to copy is `MaxBodySizeFilter.java:38` |
| `NFR-AMT-3` — the tax-rule percent is bounded as a number, never as money: an unreadable present value answers `field_number` naming `percent`, `8.5` stays accepted, the 0-100 range and the absent-field refusal keep their layer, and no money rule applies to a percent (section 31.3) | L1 acceptance: the percent cases plus the unedited service range case | **Pending** — `AMT11`, `AMT12` (the range half covered by re-run today) |
| `NFR-AMT-4` — every whole amount inside the ceiling behaves exactly as today, each money adapter carries its fractional, present non-number, and over-ceiling guards, the boundary pair and an in-range regression exist, the two catalogue sentences are pinned, `contract-check` stays green, and no desk surface changes (section 31.3) | L1 acceptance + re-run: the regression set, the catalogue guard, the contract gate, the desk suites | **Covered by re-run today for the existing answers and the desk (`AMT17`, `AMT18`, `AMT16`), and pending for the new guards and sentences (`AMT1`-`AMT14`, `AMT20`)** |
| `BR-61` — a money amount is a whole number of minor units bounded by one declared ceiling of 1 000 000 000 000 on every Billing money field; a fractional or over-ceiling value is refused with the shared envelope naming the field before any service, store, provider, or folio call, writes nothing, and leaves no idempotency record or outbox event; in-ceiling amounts behave as today; the ceiling is one code constant and the percent is bounded as a number (business rules) | L1 acceptance + evidence: the three fractional cases, the three over-ceiling cases, the boundary pair, and the lab record | **Pending** — `AMT1`-`AMT15`, `AMT19`, `AMT-E1`; today's breach is `BillingController.java:50` |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run** — `AMT18`; `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/desk-edge-guards.test.ts:621`, `:687`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh`; a flow edit fails the row |
| Contract and LC | Real delta: no contract file changes, no code token added, the envelope keeps its four fields, and both check scripts stay green; no `contracts/http/` operation changes | **Covered by re-run today** — `AMT16`; the files are `contracts/errors/envelope.json`, `contracts/http/PostCharge.json`, `RecordPayment.json`, `UpsertChargeItem.json`, `services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, envelope-field, or event change here is a re-tier finding (LLD 30.5, 30.7) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; the four `NFR-AMT-*` are the only requirement additions | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard (requirements 31.2) |
| Evidence cross-reference (`AMT-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/635/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 30](../architecture/lld.md) and `docs/architecture/services/billing.md` section 7 Operations) |
|---|---|---|
| L1 Billing controller | `AMT1`-`AMT11`, `AMT13`, `AMT15`, `AMT20` plus the `AMT17` re-run, no database needed (the service is mocked) | `cd services/billing && mvn test` (CI `billing-build` packages with the unit tests) |
| L1 Billing service | `AMT12`, `AMT13`, and the `AMT17` re-run | the same `mvn test` / `mvn verify` |
| L1 acceptance (owner) | The lab cases `AMT-1`..`AMT-8` of section 6 | isolated compose lab (section 7) |
| LC contract | `AMT16`: the contract byte-identical and both gates green | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`, plus the repo gate in `ci`) |
| Desk unit | `AMT18` re-run, with the #588/#600/#601/#646/#647/#648 pins | `cd app && npm ci && npm run build && npm run lint && npm test` (CI `app-build`) |
| Desk browser | The existing Playwright desk flows stay green; the change adds no browser-visible behaviour, so no new spec is required | CI `browser-e2e` |
| Live desk loop | The loop stays green unchanged; the `AMT-E1` before/after pair uses the isolated lab | `script/e2e-desk-loop.sh` (CI `e2e-single-host`) |
| Gates | Catalogue parity, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `billing-build`,
`contract-check`, `app-build`, `browser-e2e`, `e2e-single-host`, and
`ci` (catalogue, links, harness conventions, pre-flight proof).

### Execution order

1. The three fractional guards (`AMT1`-`AMT3`) and the three present
   non-number guards (`AMT20`) — fastest signal, the mocked service
   makes the "no call ran" assertion direct.
2. The ceiling constant and the three over-ceiling guards (`AMT7`,
   `AMT4`-`AMT6`), with the huge-negative case in each.
3. The boundary pair and the decimal-point acceptance (`AMT8`, `AMT9`),
   then the in-range regression (`AMT10`) — these are the
   "nothing changed" proof and must be green before the refusal set is
   considered complete.
4. The percent guards (`AMT11`) and the unedited range re-run
   (`AMT12`).
5. The sign-rule pins (`AMT13`) and the idempotency case (`AMT15`).
6. The catalogue rows (`AMT14`), with `script/catalogue-coverage-check.sh`
   re-run straight after.
7. The re-runs and gates: `AMT17` (existing suites untouched),
   `AMT16` (contract byte-identical), `AMT18` (desk parity), `AMT19`
   (no configuration source).
8. The isolated-lab reproduction and the before/after pair (`AMT-E1`),
   then the `test-report.md` row and the re-pin of section 4 at the
   merged head.

### Entry criteria

1. The #635 T2 spec set (product section 23, requirements section 31,
   `BR-61`, LLD section 30, the billing service design section 10, the
   api-spec and error-handling deltas, and this document) is on disk
   and the `spec-reviewer` has posted `SPEC-GATE PASS` on #635 or the
   spec stack.
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the decided ceiling, sentences, and
   enforcement point are the ones on disk.
3. The #588/#600/#601/#646/#647/#648 slices are merged, so the desk
   pins in section 2 are the real baseline.
4. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).
5. Baseline state: the existing Billing suites are green at the
   implementation PR's base (the `billing-build` job), and the desk
   suites are the unchanged `app-build` baseline.

### Exit criteria

1. `AMT1`-`AMT7` and `AMT20` exist and pass, each asserting the full
   envelope, the catalogue sentence, `details.field`, a non-empty
   `traceId`, and `verifyNoInteractions(service)` on every refusal, with
   the constant read from the declaration.
2. `AMT8`-`AMT10` pass: the boundary pair (1 000 000 000 000 accepted,
   1 000 000 000 001 refused) on all three fields, the 730-night charge
   accepted, `12.0` accepted as `12`, and `0` plus an idempotent replay
   unchanged.
3. `AMT11`-`AMT13` pass: the percent type split, `8.5` accepted, the
   0-100 refusal and absent-field refusal unedited, and one sign-rule
   case per money field in the service layer.
4. `AMT14`-`AMT15` pass: both sentences pinned with placeholders
   rendered, the catalogue gate green, and a refused keyed request
   followed by a corrected retry served as a first attempt.
5. `AMT16`-`AMT19` are green with their assertions untouched — no
   contract file changed, no existing refusal or success assertion
   moved, no desk branch or print rule moved, and no configuration
   source carries the ceiling.
6. `AMT-E1` is recorded: the `docs/testing/evidence/635/README.md`
   before/after pair and the `docs/testing/test-report.md` row.
7. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
8. Open failures are filed as issues with FR/NFR ids; no `risk-medium`
   failure is waived without owner approval.

### Negative controls

A guard that only checks `status === 400` or only sends a fractional
value is insufficient.

- `AMT1`-`AMT6` each assert `code === "VALIDATION_FAILED"` **and**
  `details` deep-equal `{"field": "<that field>"}` **and** the exact
  catalogue sentence, so an answer that reuses another 400 refusal
  (`field_required`, `field_number`, a sign refusal, or the body
  refusal) fails.
- Each refusal case asserts the exact four-key envelope and a non-empty
  `traceId`, so a second, partial, or field-less answer fails.
- Each refusal case asserts `verifyNoInteractions(service)`, so an
  adapter that truncates or passes the value to the service and refuses
  later cannot pass.
- `AMT4`-`AMT6` send **both** `1_000_000_000_001` and
  `-1_000_000_000_001`, so a ceiling implemented on the signed value
  only (which would admit a huge negative) fails.
- `AMT4`-`AMT6` also send an in-range negative and assert the service
  **is** called, so an adapter that duplicates the sign rule — or one
  that refuses every negative before the service — fails.
- `AMT8` sends 1 000 000 000 000, 1 000 000 000 001, and
  65 700 000 000, so a guard that only proves "some large amount is
  refused" cannot pass with a ceiling that is too small for the
  legitimate 730-night charge.
- `AMT9` asserts `12.0` reaches the service with `long` 12, so a check
  that reads the JSON type or the scale instead of the value fails.
- `AMT20` asserts `field_number` naming the field and **not**
  `field_required`, so a guard that leaves a present string on today's
  missing-field sentence fails, while an absent field still answers
  `field_required`.
- `AMT11` asserts `8.5` is **accepted**, so a guard that applies the
  money whole-number rule to a percent fails.
- `AMT12` and `AMT17` fail on a loosened assertion, not only on a red
  test: the existing cases are the "nothing changed" proof and may not
  be rewritten.
- `AMT14` asserts the rendered sentence, `{max}` included, so a pasted
  literal that drifts from `Messages.formatNumber` fails.
- `AMT18` fails on a rendered token or a desk branch on `amountMinor`/
  `priceMinor`, not only on a missing sentence.
- `AMT19` fails on a ceiling read from `process.env`, an environment
  placeholder in a deployment file, a compose override, or a runbook
  step.

## 6. Owner verification cases (AMT-1..AMT-8)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
in-house stay, `api billing <Operation>` bodies, and `psql` counts).
Steps are the same for each case unless stated: apply the hotel config,
sign in as `owner`, act as described, then read the reply and the desk
surface.

| Case | Setup | Expected |
|---|---|---|
| `AMT-1` | Send `amountMinor: 12.99` to `PostCharge`, then to `RecordPayment`, then `priceMinor: 12.99` to `UpsertChargeItem`, for the seeded in-house stay; then send the string form (`amountMinor: "12"`, `priceMinor: "12"`) to the same three | Each fractional value answers exactly one HTTP 400 with `code: "VALIDATION_FAILED"`, `details` naming the field, the sentence "<field> must be a whole number of minor units.", and a `traceId`; each string answers the same envelope with "<field> must be a number." (`field_number`, not `field_required`); nothing posts 12: the folio lines, balance, payments, and charge items are unchanged (`psql` count and balance before/after) |
| `AMT-2` | Send `amountMinor: 1000000000001`, then `amountMinor: -1000000000001` to `PostCharge` and repeat both on the payment route and on `UpsertChargeItem` (`priceMinor`); then send `amountMinor: -1` to `PostCharge`, `amountMinor: 0` to `RecordPayment`, and `priceMinor: -1` to `UpsertChargeItem` | The over-ceiling values answer the same envelope with "<field> must be at most 1,000,000,000,000 minor units." and write nothing; the in-range values answer the existing sign refusals: "amountMinor cannot be negative.", "amountMinor must be positive.", and "priceMinor cannot be negative." |
| `AMT-3` | Send `amountMinor: 1000000000000`, then `1000000000001`, then `12.0`, then `12` to `PostCharge` | The ceiling amount is accepted, one minor unit more is refused, and `12.0` is accepted exactly as `12` is (same line amount, same balance movement) |
| `AMT-4` | Run the ordinary desk money path: post a room charge, post an extra charge item, take a cash payment, let the tax rule derive, retry a charge with the same idempotency key | Everything behaves exactly as before the change: same amounts, same tax and fee, same balance, and the retry returns the original line |
| `AMT-5` | Send `percent: "eight"`, then `percent: 8.5`, then `percent: 101`, then omit `percent`, to `UpsertTaxFeeRule` | The string answers `field_number` naming `percent`, `8.5` is accepted and derives as today, `101` keeps "percent must be between 0 and 100.", and the omitted field keeps "percent is required." |
| `AMT-6` | Read the `AMT-1` and `AMT-2` replies and open a desk money screen | Each sentence is one plain sentence naming only the field and, for the ceiling, the maximum; the desk keeps its existing plain request-failed sentence and shows no code, status number, brace, or trace text |
| `AMT-7` | Inspect `deploy/`, the compose file, the runbooks, and a running Billing service's environment | No environment variable, deployment file, runbook step, or per-hotel setting carries or overrides the money ceiling; the only source is the code constant |
| `AMT-8` | Read `contracts/errors/envelope.json` and the three money request schemas, then run `script/contract-check.sh`, `script/openapi-route-check.sh`, and `script/catalogue-coverage-check.sh` | The enum and `statusMapping` are byte-identical (no new token), the three schemas keep `"type": "integer"` with their `minimum` and no `maximum`, no `contracts/` fixture changes, and all three gates pass |

## 7. Evidence rule AMT-E1

The implementation PR records, in `docs/testing/evidence/635/README.md`
(created by that PR, same capture method as the #588, #627, and #630
records), one before/after pair plus the finding, because the issue's
scope asks for the reproduction to live with the implementation:

- **The finding, reproduced on the pre-fix build from an isolated
  compose lab.** `PostCharge` with `amountMinor: 12.99` posts a line of
  12 and moves the balance by 12 with no refusal, and
  `amountMinor: 1000000000001` is accepted and stored, because
  `amountOf` converts with `longValue()`
  (`services/billing/src/main/java/com/hotel/billing/web/BillingController.java:50`).
  Capture the replies and the folio rows.
- **After**, the same steps against the fixed build: `12.99` and
  `1000000000001` get the one 400 envelope (`VALIDATION_FAILED`,
  `details.field` the money field, the plain sentence, a `traceId`) and
  the folio rows and balance are unchanged; a present non-number money
  value (a string `"12"`) answers `error.validation.field_number` naming
  the field instead of the missing-field sentence.
- **Plus the honest boundary control:** 1 000 000 000 000 is accepted
  and 1 000 000 000 001 refused, and `12.0` is accepted exactly as `12`
  is, so the pair shows a bound and a whole-number rule rather than a
  blanket refusal.
- **Plus the unchanged control:** an ordinary charge, an extra charge
  item, a payment, the tax derivation, an idempotent replay, a
  fractional percent `8.5`, the 0-100 percent refusal, and the three
  sign refusals all behave exactly as before, and the desk loop is
  unchanged.
- **Plus the no-configuration check:** the diff of `deploy/`,
  `docs/devops/`, and `docs/operations/` carries no money ceiling
  (`AMT19`).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 14 rows mapped to `AC-AMT-1`..`AC-AMT-5`,
`NFR-AMT-1`..`NFR-AMT-4`, and `BR-61` plus the gate boxes. Three rows
are covered by re-run today (the desk-green row, the contract/LC gate,
and the existing in-ceiling answers named inside `AC-AMT-3`,
`AC-AMT-4`, and `NFR-AMT-4` — their pins exist and pass and must keep
passing untouched), and the rest are **pending** the implementation PR:
the rows whose guards are the registry `AMT1`-`AMT20`, the `BR-61`
evidence row, the MVP no-change gate, and `AMT-E1`. The slice is **not
complete** at this spec head. It completes when the implementation PR
merges with `AMT1`-`AMT20` green, the section 2 pins refreshed where the
implementation moved a line, `AMT-E1` recorded, and `qa-lead` re-pins
every row in section 4 with `file:line` at the merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1118
