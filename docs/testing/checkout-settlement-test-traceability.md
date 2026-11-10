# Check-out settlement test traceability (Refs #601)

Status: active. Testing spec for the T3 server-side check-out
settlement gate ([issue #601](https://github.com/MingChen1501/hotel-mgmt/issues/601)),
owned by `qa-lead`. It maps the done-conditions of the change —
`AC-CKO-1` and `AC-CKO-2`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 14](../product/acceptance-criteria.md) —
and the behaviour-scoped requirements `FR-CKS-1`..`FR-CKS-5`, owned
by `business-analyst` in
`docs/requirements/mvp-requirements.md` [section 22](../requirements/mvp-requirements.md),
to their guards: the pins that exist on disk at this spec head, the
guard registry `S1`–`S12`, and the evidence rule `SR-1`.

Written before the implementation PR. Every guard in the registry is
a **named, missing obligation** at this head: no row here marks a
guard complete before it exists and passes, and the slice is not
complete until the implementation PR merges and `qa-lead` re-pins
every row at the merged head (the `#588 -> #599` pattern). Section 2
cites what is on disk today and what it proves; section 4 says which
of those pins the implementation PR rewrites (never deletes) and
which cases it must create.

Companion specs: ADR-0005
(`docs/architecture/decisions/adr-0005-server-side-checkout-gate.md`,
proposed; the owner accepts it before the implementation PR merges),
LLD [section 21](../architecture/lld.md) (gate algorithm, per-flow
diagrams, and the section 21.6 verification plan this plan aligns
with), `BR-17` / `BR-46` in
`docs/requirements/business-rules.md`, and the #588 evidence record
`docs/testing/evidence/588/README.md` (symptom 2(d), "server trust").
This spec implements no code, changes no guard, adds no catalogue
key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T3 (architectural: the check-out enforcement boundary moves
  from the desk client into Stay and adds one synchronous
  module-to-module read; contract change additive only, no schema or
  data-model change). The gate is the change; the desk is not.
- The desk is unchanged. `AC-DSK-18` and `AC-DSK-19` hold as
  written, the #588 and #600 panels keep their behaviour, copy,
  controls, and design facts, and every desk pin in section 2 must
  pass without a desk edit. A desk diff in the implementation PR is
  drift, not scope.
- No MVP row moves. `FR-FDK-2` and `FR-BIL-7` keep their wording and
  their existing guards and gain only the amendment pointer; the
  57-row MVP coverage count in `traceability-matrix.md` stands
  unchanged and no MVP row may cite this slice as its guard. The
  slice rows live in `traceability-matrix.md` section 13.
- No new NFR and no new catalogue key. The refusals reach the panel
  through the strings
  [section 19.3](../requirements/mvp-requirements.md) already
  specifies, and the service-side messages stay service catalogue
  entries, so `script/catalogue-coverage-check.sh` stays green.
  `reason` values (`no_approval`, `approval_incomplete`) are machine
  detail, not new desk copy.
- Contract: additive only (ADR-0005 D5). `CheckOut` keeps
  `folioBalanceMinor` and `openBalanceApproval` for the deprecation
  window with both advisory, and the error set gains `CONFLICT`
  (409) and `UPSTREAM_UNAVAILABLE` (503). The contract edit belongs
  to `architect`; this spec cites the re-run only (section 4). The
  LC stage keeps its per-module meaning: the new seam is Stay ->
  Billing `GetFolioBalance`, covered by the existing
  `contract-check` stage and the Stay fixtures, so this slice adds
  no new per-row LC cell.
- Guards are extended, never deleted. The #588 gate pins
  (`app/src/views/StayView.test.ts:1650-1746`,
  `:1747-1783`, `:1608-1649`) and the #600 review pins
  (`:1207-1290`, `:1291-1310`) keep their assertions; the
  implementation PR may tighten them with a `#601` note but must not
  drop a case.
- The #588 evidence record is the before/after pair for this change:
  symptom 2(d) — a close carrying `folioBalanceMinor` `120000` and an
  approval naming `role` `night-auditor`, answered `200` — is the
  exact request `S5` and the `SR-1` evidence re-run must now refuse
  (`docs/testing/evidence/588/README.md`).

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head
(`3c79797`; the code tree is identical to `master` at `0dcb68e`).
They pin today's client-trusting behaviour; the implementation PR
rewrites them in place, with a `#601` note, and never deletes one.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/stay/src/store.ts:148-166` (`checkFolioGate`) | The gate input is the request: a non-integer `folioBalanceMinor` is `VALIDATION_FAILED` (`:149-153`), a non-zero balance without an approval object is `SETTLEMENT_REQUIRED` (`:154-158`), and a non-object approval is `VALIDATION_FAILED` (`:159-166`). No folio is read and no provenance is checked | Replaced by the re-read gate. The request's fields become advisory: a non-object request approval must no longer be `VALIDATION_FAILED` — it is ignored (proved by `S6`) |
| `services/stay/src/store.ts:260-293` (`MemoryStayStore.checkOut`) | `checkFolioGate` at `:263` runs before the replay lookup (`:266-271`), the in-house check (`:276-281`), the flip (`:282`), the `checked-out` outbox push (`:284-288`), and the idempotency write (`:289-291`) | The Billing read and provenance validation sit where `:263` is, before the replay and the flip. A refusal writes no state, no event, and no idempotency record |
| `services/stay/src/pgstore.ts:161-166` (`PostgresStayStore.checkOut`) | The same `checkFolioGate` runs before the transaction at `:164`, so the two stores share one gate | Same insertion point; `S12` keeps the two stores in parity |
| `services/stay/src/server.test.ts:128-238` (HTTP check-out block) | Settled close `:129-145`; open-balance refusal decided on the presented balance `:147-163`; approved close decided on the presented approval, which carries no recorded time `:164-178` (the hole); replay and second close `:179-211`; paired simultaneous closes, one winner `:212-238` | Rewritten: every case stubs a folio read and the refusal cases assert in-house + no event. New cases are `S1`–`S10` |
| `services/stay/src/server.test.ts:378-459` (Postgres parity block) | Refuses on the presented balance `:429-432`; closes on the presented approval while asserting nothing about provenance `:433-442`; replay `:443-451`; second close `:452-455` | Rewritten for the read-side gate; `S12` adds the forged-balance and forged-approval pair over `PostgresStayStore` |
| `services/billing/src/main/java/com/hotel/billing/service/BillingService.java:255-272` (`recordOpenBalanceApproval`) | Refuses a blank `approvedBy` (`:257-259`) and a blank `role` (`:260-262`) only; any role string is recorded | `S11` adds the fixed-set refusal; the provenance fields it records are the ones Stay re-validates |
| `BillingService.java:302-314` (`approvalJson`) | The stored record carries `approvedBy`, `role`, `reason`, and a service-stamped `approvedAt` (`:309`) — never a body value | `S11` pins the body-supplied time being ignored and the service-stamped time surviving |
| `services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java:137-146`, `:148-163`, `:165-177` | Blank identity/role refused (`:137-146`), record stored (`:148-163`), replay (`:165-177`) | Extended with the out-of-set-role refusal and the stamp assertion; the existing assertions stay |
| `contracts/http/CheckOut.json` | `required` still lists `folioBalanceMinor` (`request.required`), `openBalanceApproval` is typed `object|null`, and the error list has no `CONFLICT` / `UPSTREAM_UNAVAILABLE` row | `architect`'s additive bump only. `S1`–`S10` bodies stay valid because the advisory fields keep being accepted |
| `contracts/errors/envelope.json:9`, `:22` | The code enum at `:9` has no `UPSTREAM_UNAVAILABLE`; the status map at `:22` maps `CONFLICT` to 409 | `architect` registers the code; the contract-check stage must then stay green |
| `services/stay/contract-tests/CheckOut.json`, `CheckOut-open-balance.json`, `CheckOut-approved.json`, `CheckOut-repeat.json` | The fixtures the Stay contract tests replay; they carry the pre-change request shape | Kept as the compatibility half: the desk build still sends these bodies, so the fixtures must keep passing unchanged |
| `app/src/views/StayView.test.ts:1650-1746`, `:1747-1783`, `:1608-1649`, `:1940-1974` | #588 desk side: a provenanced recorded approval closes, a free-form note is refused, the approver role is the fixed select, and the server's `SETTLEMENT_REQUIRED` still maps to the plain refusal | Stay green unchanged (desk-stay-green row) |
| `app/src/views/desk-edge-guards.test.ts:970-1033`, `:1182-1251` | One close with one release and re-read lists; a double-confirmed close closes once | Stay green unchanged |
| `app/e2e/stay.spec.ts:30-157` | The browser flow: unpaid close refused, approval recorded at the desk, close through the confirm dialog, room released, board and map read the dirty room | Stay green unchanged; this is the browser half of the desk-stay-green row |
| `script/e2e-desk-loop.sh:399-424` | The API desk loop: an unpaid close refused `SETTLEMENT_REQUIRED`, an approval recorded through Billing, the folio read back, the close sent with the read approval, then `closed` with the folio as invoice | Stay green unchanged, and it is the recipe `CKS-*` owner cases reuse |
| `deploy/compose.yaml:46`, `:77`, `:113` | `RATES_BASE_URL` on reservations (`:46`), the `stay` service block (`:77`), the `billing` service block (`:113`) | `BILLING_BASE_URL` is wired on `stay` the way `RATES_BASE_URL` is wired on reservations; `S9` proves the unwired case |

## 3. Guard registry S1–S12 and the evidence rule SR-1

All twelve guards are **missing at this spec head** and created by
the implementation PR: `S1`–`S10` and `S12` in
`services/stay/src/server.test.ts` (memory store) plus its Postgres
parity block, and `S11` in
`services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java`.
A refusal guard is not complete on a status code alone: it also
asserts the stay is still `in-house`, that no `stay.checked-out`
outbox row was written, and (for a route that would have released
the room) that no room state changed.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `S1` | Forged balance, low: Billing reads `6000` with no recorded approval while the request asserts `folioBalanceMinor: 0` — 409 `SETTLEMENT_REQUIRED`, stay in house, no event | `services/stay/src/server.test.ts` (memory) and the Postgres parity block |
| `S2` | Forged balance, high: Billing reads `0` while the request asserts `6000` with no approval — 200 closed, proving the claim is ignored in both directions, and the closed state carries no asserted amount | same |
| `S3` | Forged approval: the request carries a well-formed approval (`approvedBy`, fixed role, recorded time) while the folio records none — 409 `SETTLEMENT_REQUIRED`, `reason` `no_approval`, stay in house | same |
| `S4` | Incomplete record: the folio's approval misses the identity, the role, or the recorded time — 409 `SETTLEMENT_REQUIRED`, `reason` `approval_incomplete`, stay in house; one case per missing field | same |
| `S5` | Out-of-set role: the folio's approval names `night-auditor` — 409 `SETTLEMENT_REQUIRED`, stay in house. This is the #588 symptom 2(d) payload (`docs/testing/evidence/588/README.md`) as a named case | same |
| `S6` | Free-form record and ignored request shapes: a string or non-object approval on the folio refuses `SETTLEMENT_REQUIRED`; a string `openBalanceApproval` in the request is ignored, not `VALIDATION_FAILED`; a non-integer `folioBalanceMinor` in the request is likewise ignored | same |
| `S7` | Provenanced record: identity + `owner`/`manager`/`front-desk` + a recorded time on the folio — 200 closed, one `checked-out` event, invoice ref is the presented folio | same |
| `S8` | Folio mismatch: Billing returns a `folioId` different from the presented `folioId` — 409 `CONFLICT` naming both, stay in house, no event | same |
| `S9` | Unreadable folio: transport failure, timeout, 5xx, and an unwired client each refuse 503 `UPSTREAM_UNAVAILABLE` naming the upstream and the operation, stay in house, no event, no release; a 4xx provider envelope is surfaced unchanged (`UNAUTHENTICATED` stays `UNAUTHENTICATED`) | same |
| `S10` | Gate before replay, one winner: a replay of an `idempotencyKey` returns the original close only once its gate passes, a replay whose folio went open after the first close is refused rather than returned, and paired simultaneous closes still resolve one winner with the loser `STATE_ILLEGAL` and no event | same |
| `S11` | Billing write side: an out-of-set `role` is refused 400 `VALIDATION_FAILED` naming `role`; a body-supplied `approvedAt` is ignored and the stored record keeps the service-stamped time; blank `approvedBy` / `role` stay refused | `services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java` |
| `S12` | Postgres parity: the forged-balance pair (`S1`/`S2`) and the forged-approval pair (`S3`/`S7`) run over `PostgresStayStore`, proving the transaction path carries the same gate and writes no event on a refusal | `services/stay/src/server.test.ts` Postgres parity block |
| `SR-1` | Evidence rule: the implementation PR re-runs the #588 symptom 2(d) payload against the new close, records the `409 SETTLEMENT_REQUIRED` beside the recorded `200` in `docs/testing/evidence/601/README.md`, and records the slice's results in `docs/testing/test-report.md` (section 3 exit criterion 6). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row except the desk-stay-green row,
which is covered today by pins that exist and pass and must keep
passing untouched. For a pending row the guard does not exist at this
spec head: the implementation PR creates it, and `qa-lead` re-pins the
row with `file:line` at the merged head and flips it to covered only
when the guard passes.

| Item | Required guard | Guard |
|---|---|---|
| `AC-CKO-1` — the close is decided on the folio Billing holds: the folio is re-read on every route, the presented folio must be the one the balance came from, the request's balance and approval are advisory, and a non-zero read passes only with a provenanced recorded approval; every refusal leaves the stay in house with no release and no charge | L1 acceptance: the forged, incomplete, out-of-set, free-form, provenanced, and mismatch callers | **Pending** — `S1`, `S2`, `S3`, `S4`, `S5`, `S6`, `S7`, `S8`; existing pins to rewrite named in section 2 |
| `AC-CKO-2` — an unreadable folio refuses fail-closed with `UPSTREAM_UNAVAILABLE` (503) rather than closing on an unverified balance, a 4xx envelope is surfaced unchanged, and the settled or approved desk close keeps passing unchanged | L1 acceptance + fail-closed check | **Pending** — `S9` (unreadable) and `S7` (the desk's approved close); the desk half is the desk-stay-green row |
| `FR-CKS-1` — the close is decided on the folio Billing holds, and the request's `folioBalanceMinor` / `openBalanceApproval` are advisory and ignored | L1 acceptance, both directions | **Pending** — `S1` (asserted low ignored), `S2` (asserted high ignored), `S6` (request shapes ignored); existing pins `services/stay/src/server.test.ts:147-163` and `:429-432` prove today's opposite and are rewritten |
| `FR-CKS-2` — the folio presented as the invoice is the folio the balance came from | L1 acceptance | **Pending** — `S8`; no guard on disk |
| `FR-CKS-3` — an approval counts from the folio record, never from the request: identity, fixed role set, recorded time; incomplete/free-form/out-of-set refuses `SETTLEMENT_REQUIRED`; the write side refuses an out-of-set role and stamps the time | L1 acceptance (read side and write side) | **Pending** — `S3`, `S4`, `S5`, `S6`, `S7` (read side) and `S11` (write side); existing pins `server.test.ts:164-178`, `:433-442` close on the request (the hole) and `BillingServiceTest.java:137-163` cover only blanks |
| `FR-CKS-4` — an unreadable folio refuses the close fail-closed; a 4xx envelope is surfaced unchanged | L1 acceptance + fail-closed | **Pending** — `S9`; no guard on disk |
| `FR-CKS-5` — every route to the close is gated (gate before replay and before the conditional flip) and a refusal changes nothing | L1 + L3 paired concurrency | **Pending** — `S10` for the replay order and the paired winner; existing pins `server.test.ts:179-211` and `:212-238` (plus `:443-455`) keep the replay and winner assertions and are rewritten to the gate-first order |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `FR-CKO-4`, `FR-CKO-5`) | Behaviour check: the same request stops being trusted and the desk still shows the same lines | **Covered by re-run at this spec head** — `app/src/views/StayView.test.ts:1650-1746`, `:1747-1783`, `:1608-1649`, `:1940-1974`, `app/src/views/desk-edge-guards.test.ts:970-1033`, `:1182-1251`, `app/e2e/stay.spec.ts:30-157`, `script/e2e-desk-loop.sh:399-424`. These must pass unchanged after the implementation PR; a desk edit fails the row |
| Contract and LC | Re-run only: `CheckOut` keeps its advisory fields, the envelope registers `CONFLICT` (409) and `UPSTREAM_UNAVAILABLE` (503), the existing fixtures stay valid, and the Stay -> Billing `GetFolioBalance` seam passes the per-module contract stage | **Pending gate** — `contracts/http/CheckOut.json`, `contracts/errors/envelope.json:9`, `:22`, `services/stay/contract-tests/CheckOut*.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; the contract edit is `architect`'s (ADR-0005 D5) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-FDK-2` / `FR-BIL-7` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged; the `FR-FDK-2` / `FR-BIL-7` rows keep their guards and no MVP row cites this slice |
| Evidence cross-reference (`SR-1`) | The #588 symptom 2(d) payload is the named refusal, recorded before/after, and the slice is recorded in the test report | **Pending** — `S5` is the payload as a guard; `docs/testing/evidence/601/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 21.6](../architecture/lld.md)) |
|---|---|---|
| L1 service, Stay | `S1`–`S10` and the rewritten pins | `cd services/stay && npm ci && npm run build && npm test && npm run lint` |
| L1 service, Billing | `S11` and the existing approval tests | `cd services/billing && mvn verify` |
| LC contract | The `CheckOut` fixtures and the Stay -> Billing seam | `script/contract-check.sh`, `script/openapi-route-check.sh` |
| Desk regression (unit) | The #588/#600 desk pins stay green unchanged | `cd app && npm ci && npm run build && npm test` (CI `app-build`) |
| Desk regression (browser) | `app/e2e/stay.spec.ts` on the served SPA | CI `browser-e2e` |
| Live desk loop | The API loop's check-out step, the `CKS-*` recipe, and `SR-1` | `script/e2e-desk-loop.sh` (CI `e2e-single-host`) |
| Gates | Links and harness conventions | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR:
`node-build (stay)`, `billing-build`, `contract-check`,
`app-build`, `browser-e2e`, `e2e-single-host`, and `ci` (which runs
the catalogue coverage and link checks).

### Execution order

1. Stay service suite (memory store, then the Postgres parity block
   with `DATABASE_URL` set). A red `S*` case stops the run.
2. Billing suite (`S11`).
3. Contract and route checks (the additive bump must not break the
   desk build's fixtures).
4. Desk unit suite, then the browser flow, then the live desk loop.
5. `SR-1`: the evidence re-run against a lab stack, recorded.
6. Link and harness-convention gates, then the test-report row.

### Entry criteria

1. ADR-0005 is owner-accepted (`proposed -> accepted`) and this
   spec set has a `SPEC-GATE PASS` on #601 (T3).
2. The #588 desk build and the #600 review-step charge posting are
   merged (both are on `master` at this spec head), so the desk pins
   in section 2 are the real baseline.
3. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture
   method, `docs/testing/evidence/588/README.md`).

### Exit criteria

1. `S1`–`S12` exist and pass; every refusal case also asserts in
   house, no event, and no release.
2. Every desk pin in section 2 passes unchanged — no desk edit, no
   dropped assertion.
3. The contract stage is green with the additive error codes and the
   unchanged fixtures.
4. `SR-1` is recorded: the before/after pair in
   `docs/testing/evidence/601/README.md` and the slice row in
   `docs/testing/test-report.md`.
5. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
   section 4 at the merged head and flipped the rows.
6. Open failures are filed as issues with FR/NFR ids; no
   `risk-medium` failure is waived without owner approval.

### Negative controls

A refusal guard that only checks the HTTP status is insufficient.
Every `S1`, `S3`–`S6`, `S8`, `S9`, `S10` case asserts the stay is
still `in-house` after the refusal, that no `stay.checked-out` outbox
row was written, and that no idempotency record was stored — a
refusal that writes anything fails the case. `S2` is the pair's
positive control: the same path must close when the folio truly
reads zero, otherwise "ignored" could be hiding an always-refuse
gate.

## 6. Owner verification cases (CKS-1..CKS-11)

Plain-language cases the owner can run on the lab once the gate
lands, using the `script/e2e-desk-loop.sh:399-424` recipe (sign-in
token, seeded stay with a posted charge, `api stay CheckOut`
bodies). Steps are the same for each case: seed one in-house stay
with a known folio balance, then send the stated `CheckOut` body and
read the reply and `GetStay`.

| Case | Setup | Expected |
|---|---|---|
| `CKS-1` | Folio reads `6000`, no approval recorded; request says `folioBalanceMinor: 0` | 409 `SETTLEMENT_REQUIRED`; stay reads `in-house` |
| `CKS-2` | Folio reads `0`; request says `folioBalanceMinor: 6000` with no approval | 200 `closed`; the invoice is the presented folio |
| `CKS-3` | Folio reads `6000`, no approval; request carries a full approval object | 409 `SETTLEMENT_REQUIRED`, `reason` `no_approval`; stay in house |
| `CKS-4` | Folio approval recorded without a recorded time (or without the identity) | 409 `SETTLEMENT_REQUIRED`, `reason` `approval_incomplete`; stay in house |
| `CKS-5` | Folio approval names `night-auditor` (the #588 payload) | 409 `SETTLEMENT_REQUIRED`; stay in house — the exact call that answered `200` in the #588 record |
| `CKS-6` | Folio approval stored as a free-form string; and a request whose `openBalanceApproval` is a string | 409 `SETTLEMENT_REQUIRED` for the record; the string in the request changes nothing (no `VALIDATION_FAILED`) |
| `CKS-7` | Folio approval recorded at the desk as `manager`, read back with identity, role, and time | 200 `closed`; the desk shows the same approval line it showed before |
| `CKS-8` | Present a second, different folio id for the same stay | 409 `CONFLICT` naming both folios; stay in house |
| `CKS-9` | Stop Billing (or start Stay without `BILLING_BASE_URL`) | 503 `UPSTREAM_UNAVAILABLE` naming Billing and `GetFolioBalance`; stay in house; the desk keeps its plain error sentence |
| `CKS-10` | Replay the same `idempotencyKey` after the folio went from zero to open | The replay is refused, not returned as a close; the stay stays as it was before the replay |
| `CKS-11` | Record an approval with role `night-auditor` through the Billing route | 400 `VALIDATION_FAILED` naming `role`; a body-supplied `approvedAt` changes nothing (the record keeps the service time) |

Desk regression on the same build: the #588/#600 flow
(`CKS-D1`) unpaid close refused on the button and the confirm, the
approval recorded at the desk, the close through the dialog, the
room released and shown dirty; `CKS-D2` a free-form note still
refused; `CKS-D3` the approver-role control still offers only the
fixed three. Expected: unchanged from the #588 record, no desk copy
difference.

## 7. Evidence rule SR-1

The implementation PR records one before/after pair in
`docs/testing/evidence/601/README.md` (created by that PR, same
capture method as the #588 record):

- Before: the #588 symptom 2(d) payload against the pre-fix build —
  `{"folioBalanceMinor":120000,"openBalanceApproval":{"approvedBy":"manager","role":"night-auditor","reason":"","approvedAt":"2026-11-09T19:39:23Z"}}`
  answered `200`.
- After: the same body against the fixed build, with the folio
  carrying the same recorded approval — `409 SETTLEMENT_REQUIRED`,
  the stay still `in-house`, no `stay.checked-out` event.
- Plus the honest positive control: the same stay closed with a
  provenanced `manager` approval recorded through Billing — `200`.

The pair is the #588 evidence record's own payload, so the two
records read as one line: the UI half closed in #588, the server
half closes here. The slice's results also go to
`docs/testing/test-report.md` (exit criterion 6 of the
`test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 11 rows mapped, 1 covered by re-run only (the
desk-stay-green row — its pins exist and pass today and must keep
passing), and 10 pending rows whose guards are the registry
`S1`–`S12` plus the contract/LC gate, the MVP no-change gate, and
`SR-1`. The slice is **not complete**. It completes when the implementation PR merges with
`S1`–`S12` green, the desk pins unchanged, `SR-1` recorded, and
`qa-lead` re-pins every row in section 4 with `file:line` at the
merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a
fabricated pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-922
