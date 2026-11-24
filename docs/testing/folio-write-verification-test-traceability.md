# Folio write verification test traceability (Refs #634)

Status: active. Testing spec for the T3 folio write verification change
([issue #634](https://github.com/MingChen1501/hotel-mgmt/issues/634),
audit finding B1 — the #625 class, a client-supplied identifier decides
a money outcome), owned by `qa-lead`. It maps the done-conditions of the
change — `AC-FWV-1`..`AC-FWV-7`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 18](../product/acceptance-criteria.md) —
and the behaviour-scoped requirements `FR-FWV-1`..`FR-FWV-5`, owned by
`business-analyst` in `docs/requirements/mvp-requirements.md`
[section 26](../requirements/mvp-requirements.md), to their guards: the
pins that exist on disk at this spec head, the guard registry
`FW1`–`FW13`, and the evidence rule `FW-E1`.

Written before the implementation PR. Every guard in the registry is a
**named, missing obligation** at this head: no row here marks a guard
complete before it exists and passes, and the slice is not complete
until the implementation PR merges and `qa-lead` re-pins every row at
the merged head (the `#588 -> #599` pattern). Section 2 cites what is on
disk today and what it proves; section 5 says which cases the
implementation PR must create. The issue's accepted conditions name the
three caller classes the guards must cover — the unknown-stay caller,
the closed-stay caller, and the unreadable-Stay caller — for each of the
three writes and for the folio-creating read, plus the two regression
paths (a fresh in-house check-in still creates its folio; a departed
stay's folio still opens and still prints).

Companion specs: the decision record
[ADR-0008](../architecture/decisions/adr-0008-folio-write-stay-verification.md)
(`proposed`; the owner flips it `accepted` before the implementation PR
merges), the layer ownership and answer classification in
`docs/architecture/lld.md` [section 25](../architecture/lld.md) (25.1
ownership, 25.2 the per-route target algorithm and the complete Stay
answer table, 25.3–25.6 the four per-flow diagrams, 25.7 the contract
delta, 25.8 the verification plan this document aligns with, 25.9 the
residual risks R5/R8 and the post-departure consequence); the seam
contract C8 in `docs/technical/integration.md`
[section 3](../technical/integration.md) and the refusal set in
`docs/technical/error-handling.md` [section 5](../technical/error-handling.md);
the desk delta and the three EN+VI sentences in
`docs/product/desk-ui-design-rollout.md`
[section 6.19](../product/desk-ui-design-rollout.md); D-30 in
`docs/project/decision-log.md` [the decision log](../project/decision-log.md);
and the sibling tests this slice must not disturb:
`checkout-settlement-test-traceability.md` (#601, registry `S1`–`S12`),
`departure-release-test-traceability.md` (#646, registry `DR1`–`DR13`),
`arrival-reassign-test-traceability.md` (#647, registry `RR1`–`RR13`),
`booking-management-view-test-traceability.md` (#648, registry
`BM1`–`BM16`), plus the #586/#588/#590/#600/#601/#646/#647/#648 rows in
`traceability-matrix.md` sections 9–16. This spec implements no code,
changes no guard, adds no catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T3, confirmed by `architect` (LLD section 25): Billing gains its
  first runtime outbound read of Stay — a new fail-closed dependency
  edge on the money path — and a new contract error set. No new
  operation, request or response field, lifecycle state, event, schema,
  table, column, or migration.
- No MVP row moves. `FR-BIL-1`, `FR-BIL-2`, `FR-BIL-3`, and `FR-BIL-7`
  keep their wording and their existing guards and gain only the
  amendment pointer; the 57-row MVP coverage count in
  `traceability-matrix.md` stands unchanged and no MVP row may cite this
  slice as its guard. The slice rows live in `traceability-matrix.md`
  section 19.
- No new NFR. Requirements section 26.4 is a no-change statement:
  availability, desk response, concurrency, security, i18n, audit,
  print, and time/locale all hold with the existing guards
  (`NFR-AVL-1`, `NFR-PERF-1`, `NFR-CON-1`, `NFR-CON-2`, `NFR-SEC-1`,
  `NFR-SEC-2`, `NFR-I18N-1`, `NFR-DSK-1`, `NFR-DSK-2`, `NFR-AUD-1`,
  `NFR-TZ-1`).
- Contract: the `architect` owns a **minor** delta (LLD 25.7) — the four
  folio operations gain `NOT_FOUND`, `STATE_ILLEGAL`, and
  `UPSTREAM_UNAVAILABLE`, `contracts/errors/envelope.json` registers the
  code and the `503` mapping, and `GetStayRef` is unchanged. The LC
  stage is a real gate here (`FW12`), not a re-run of a no-change
  statement.
- Guards are extended, never deleted. The Billing service and transport
  suites keep their existing assertions (section 2); the desk pins
  `AC-DSK-17`, `AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, and
  `AC-DEP-1`..`AC-DEP-5` stay green unchanged. The implementation PR may
  tighten a pin with a `#634` note but must not drop a case.
- The read split is the reading this traceability enforces (LLD 25.2,
  requirements 26.5): `AC-FWV-5` governs the read of an **existing**
  folio (served from Billing in every stay state, so a Stay outage never
  blocks the departure invoice), and `AC-FWV-3`'s "open the folio
  balance" clause binds the **folio-creating** read. `product-owner`
  confirms that reading at the spec gate; it is carried as an explicit
  row in section 4 until then, and `FW7` is the guard that proves it.
- Named consequence, deliberately out of scope (`AC-FWV-2`, D-30, LLD
  25.9): an open balance approved at check-out can no longer be settled
  by a folio write after departure, because every write verifies the
  stay. No guard in this document asserts a late-settlement path; if the
  owner wants one it needs its own issue and its own specs.
- Copy: the three `desk.folio.*` keys of rollout section 6.19 are the
  implementation PR's to add in both locales. They are `{param}`-free by
  decision, so no placeholder drift is possible; `FW11` fails an
  invented key or a one-locale key.
- No phantom promises: every guard this change needs is named as a
  missing obligation (`FW1`–`FW13`) and lands in a file that exists or
  that the implementation PR creates; no row is flipped to covered
  before the guard exists and passes.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is identical to `origin/master` at `464b864` (the sibling spec PRs
touch `docs/` only). They prove today's behaviour: `ensureFolio`
creates a folio for any UUID, and no Billing Stay client exists. The
implementation PR extends these in place, with a `#634` note, and never
deletes one.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:65-71` (`ensureFolio`) | Inserts the folio for the handed stay id with `ON CONFLICT (stay_id) DO NOTHING` and returns `findFolioByStay`; never asks Stay — the finding this change closes | The write that must be preceded by a verified stay; `FW1`–`FW4` assert it is never reached on a refusal |
| `services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:73-77` (`findFolioByStay`) | The folio-existence lookup the read split turns on (LLD 25.2) | `FW7` asserts an existing folio answers without a stay read; a miss is where the verifier runs |
| `services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:99-107`, `:109-115`, `:135-139`, `:143-147`, `:220-235`, `:237-240` | `insertCharge`, `insertPayment`, `addToBalance`, `recordApproval`, `claimOrWait`, `outbox` — the six calls a refusal must not make | `FW1`–`FW4`, `FW7` verify zero interactions on each of them, a call count rather than only the returned status (LLD 25.8) |
| `services/billing/src/main/java/com/hotel/billing/service/BillingService.java:120-123` (`getFolioBalance`) | Validate, then `ensureFolio` — a balance read creates the folio for any uuid | Extended: the read verifies only when the stay carries no folio (`FW7`); the in-house path still creates it (`FW6`) |
| `services/billing/src/main/java/com/hotel/billing/service/BillingService.java:126-163` (`postCharge`), `:167-190` (`recordPayment`), `:255-279` (`recordOpenBalanceApproval`) | Today's order is validate → `ensureFolio` (`:142`, `:176`, `:264`) → claim (`:146`, `:180`, `:267`) → insert, `addToBalance`, `outbox` (`:158-162`, `:185-188`, `:275-277`) | The verification moves ahead of `ensureFolio` and the claim; `FW1` pins the order with an in-order assertion |
| `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:67-71` (`requireToken`), `:74-78`, `:81-86`, `:89-95`, `:141-147` | Bearer gate and the four folio routes' request parsing | Unchanged; `FW9` asserts the refusals travel through the shared envelope and that a missing token still reads `UNAUTHENTICATED` |
| `services/billing/src/main/java/com/hotel/billing/web/ApiException.java:34-45` | `validation`, `notFound`, `settlementRequired` only — no upstream code | The implementation adds the upstream refusal; `FW9` asserts its status/details mapping |
| `contracts/errors/envelope.json` | The code enum lists no `UPSTREAM_UNAVAILABLE` and `statusMapping` no `503` | `FW12` asserts the registration (ADR-0005's named drift) |
| `contracts/http/GetFolioBalance.json`, `PostCharge.json`, `RecordPayment.json`, `RecordOpenBalanceApproval.json` | All four at version `1.0` with `UNAUTHENTICATED` and `VALIDATION_FAILED` only | `FW12` asserts the three added codes and the minor bump; `GetStayRef.json` stays unchanged |
| `services/stay/src/store.ts:406-423` (`getStayRef`) | The provider read answers `NOT_FOUND` naming the stay (`:413-415`) and `STATE_ILLEGAL` naming the stay and state (`:416-421`); `in-house` only | Unchanged; it is the exact answer set the Billing verifier classifies (`FW5`) |
| `services/stay/src/pgstore.ts:387-407` | The same two refusals on the Postgres store | Unchanged; it is the durable provider half `FW13` exercises live |
| `services/stay/src/server.ts:152-156` | The `GetStayRef` route | Unchanged; the Billing client posts to it (`FW5`, `FW13`) |
| `services/stay/src/server.test.ts:330-348` | The provider guard: an in-house stay answers `200` and a closed stay `422 STATE_ILLEGAL`; no unknown-id case exists there | Stays green; `FW5` covers the unknown-stay answer from the consumer side, and no new Stay guard is required by this change |
| `services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java:36-58` (harness and first case) | A mocked-repository service suite with no database and no stay client (`:39-43` `@Mock BillingRepository`, `@InjectMocks BillingService`; `:53-58` the first refusal case) | The seam the new guards mock is the stay-verification client interface (LLD 25.2); every `FW1`–`FW4`, `FW6`–`FW8` case lands here |
| `BillingServiceTest.java:71-84` (replay), `:148-198` (approval record and read-back), `:211-261` (invoice and receipts) | Today's successful writes, the recorded approval shape, and the printed documents | Stay green unchanged; they are the regression half of `FW6`/`FW7` and must pass without a desk edit (`AC-FWV-4`) |
| `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java:37-177` | The routes' response shapes, the two existing refusal mappings, and the missing-token gate | Extended by `FW9`; existing assertions stay |
| `services/reservations/internal/pricing/client.go:43-96` | The established upstream-call shape (POST, Bearer forward, bounded timeout) and the fail-closed `UPSTREAM_UNAVAILABLE` answer this client follows | The pattern `FW5` holds the new Billing client to |
| `services/billing/src/main/java/com/hotel/billing/config/DatabaseConfig.java:55` | The 10-connection Hikari pool the NFR-PERF-1 load would starve if a connection were held across the verification call | `FW8` asserts the verification runs outside the transactional writer (LLD 25.2, 25.9) |
| `deploy/compose.yaml:81`, `:85`, `:116-128` | Stay publishes `PORT: "8084"` and wires `RESERVATIONS_BASE_URL`; the billing service carries no `STAY_BASE_URL` today | `FW13` runs the live loop with the wired `STAY_BASE_URL`; a missing wiring must read `UPSTREAM_UNAVAILABLE`, never an unverified folio (`FW4`) |
| `app/src/views/FolioView.vue:944-962` | The existing unknown-folio open sentence and its `NOT_FOUND`/`VALIDATION_FAILED` mapping | Stays; `FW10` asserts it is unchanged while the two new refusal sentences are added beside it |
| `app/src/views/FolioView.vue:566-575` | The generic `desk.shell.request_failed` fallback every unnamed failure reads today — wrong for an unknown or closed stay, where retrying can never work | `FW10` asserts a `STATE_ILLEGAL`, an unknown stay, and a `503` each render their own sentence instead of this fallback |
| `app/src/views/FolioView.vue:1010-1040`, `:1075-1095` | The charge and payment refusal mappings (undefined item, bad method) | Stays green; they show the code-based branching pattern the three new sentences follow |
| `app/src/views/FolioView.test.ts:181-224` (open), `:225-286` (charge and payment), `:395-430` (unknown folio on open) | The desk's existing folio success and refusal cases | Extended by `FW10`; no case is deleted |
| `app/src/views/PrintView.vue:1028`, `:1120`, `:1157` | The print screen opens the folio with `GetFolioBalance`, then presents `ProduceInvoice` / `ProduceReceipt` — the departed stay's paper trail | Unchanged; `FW7` (service) and the green `PrintView` pins prove a departed stay's folio still opens and prints (`AC-FWV-5`) |
| `app/src/views/PrintView.test.ts:273-342`, `:724-756` | Invoice and receipt render their stored rows exactly, and one print document is isolated at a time | Stay green unchanged (`AC-FWV-5`, `NFR-DSK-2`); a flow edit fails the desk-green row |
| `app/src/api/client.ts:143-204` | `apiFetch`: an offline throw carries no status, a `401` routes to the gate, and a non-envelope `!ok` surfaces the status as the code | The desk refusal split reads these fields; `FW10` asserts the `503` and `422` envelopes map by code, never by status alone |
| `messages/en.json:636`, `messages/vi.json:636` | `desk.folio.refused_unknown_folio` exists in both locales; `refused_unknown_stay`, `refused_closed_stay`, and `refused_unreadable_stay` do not | `FW11` creates the three keys in both catalogues; the implementation must not invent wording beyond rollout section 6.19 |
| `script/catalogue-coverage-check.sh` | The EN/VI parity gate | `FW11` keeps it green with the three added keys |
| `script/e2e-desk-loop.sh:363-397` | The live charge, payment, approval, invoice, and receipt steps of the desk loop | The green half `FW13` re-runs and extends |
| `script/e2e-desk-loop.sh:399-418` | The check-out with the recorded approval, the `SETTLEMENT_REQUIRED` refusal, the close, and the post-close `GetStayRef` `STATE_ILLEGAL` | `FW13` adds the folio-write half after the close: a `PostCharge`/`RecordPayment` on the closed stay is refused and the folio row count is unchanged |
| `script/contract-check.sh`, `script/openapi-route-check.sh` | The contract-shape and curated-route gates | `FW12` keeps both green; `openapi.yaml` lists no Billing folio operation, so it gains no entry |

## 3. Guard registry FW1–FW13 and the evidence rule FW-E1

All thirteen guards are **missing at this spec head** and created by the
implementation PR: `FW1`–`FW4` and `FW6`–`FW8` in
`BillingServiceTest.java`, `FW5` in a new Billing stay-client test,
`FW9` in `BillingControllerTest.java`, `FW10` in
`app/src/views/FolioView.test.ts`, `FW11` across the two catalogues and
the catalogue gate, `FW12` across the contract files and the two check
scripts, and `FW13` in `script/e2e-desk-loop.sh`. A service guard is not
complete on the returned status alone: every refusal case also asserts
the **call list** (which repository and client methods ran, in which
order, how many times) and the end state, because the defect this slice
fixes is an ordering defect — a refusal can return the right status
while a row was still written.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `FW1` | **Verify-first ordering, all three writes**: `PostCharge`, `RecordPayment`, and `RecordOpenBalanceApproval` each call the stay verifier with the caller's session and the requested stay before `ensureFolio`, before `claimOrWait`, and before every insert/balance/approval/outbox call — asserted in order — whether or not the stay already carries a folio, and with and without an idempotency key | `BillingServiceTest.java` |
| `FW2` | **Unknown stay, all three writes**: an id Stay answers `NOT_FOUND` for yields `404 NOT_FOUND` naming the stay, and the repository mock records no `ensureFolio`, `insertCharge`, `insertPayment`, `addToBalance`, `recordApproval`, `claimOrWait`, or `outbox`; a repeated request and a keyed request answer the same; a `NOT_FOUND` naming a different stay or naming none answers `503`, never `404` (a wiring fault is not a stay fact) | same file |
| `FW3` | **Closed stay, all three writes**: a stay Stay answers `422 STATE_ILLEGAL` for yields `422 STATE_ILLEGAL` naming the stay and the state with nothing written, with and without an existing folio; an existing folio keeps exactly the lines and balance it had; a retry of a committed write whose first attempt landed before the close is refused while the recorded line stays on the folio | same file |
| `FW4` | **Unreadable Stay, all four folio routes**: a transport failure, a timeout, a `5xx` envelope, a non-envelope body, and an unwired client each answer `503 UPSTREAM_UNAVAILABLE` with `{upstream: "stay", operation: "GetStayRef"}` and write nothing; a `401` envelope surfaces `UNAUTHENTICATED` unchanged; the folio-less balance read is included, so no unverified folio is created; a retry after Stay answers commits once, because the refusal preceded the claim | same file |
| `FW5` | **Client answer classification**: the new Billing Stay client, unit-tested against a JDK `HttpServer` stub (no database, so `mvn test` stays offline), classifies `200 in-house`, an unknown-stay `404`, a wrong-id `404`, a `422`, a `503`, a malformed body, and a connection refusal exactly as the LLD 25.2 table requires; the caller's `Authorization` header is forwarded verbatim and the call is bounded at the 2-second timeout | new `services/billing/src/test/java/com/hotel/billing/client/StayClientTest.java` |
| `FW6` | **Fresh check-in regression (`AC-FWV-4`)**: `GetFolioBalance` on a verified in-house stay with no folio creates exactly one folio at zero balance with the acting account; the three writes then commit with the same line, the same balance movement, and the same `folio.*` outbox event as today | `BillingServiceTest.java` |
| `FW7` | **Read split (`AC-FWV-5`)**: opening a stay that already carries a folio makes **no** stay read and answers in every stay state — a closed, departed stay included — with the verifier configured to refuse if it is called; a closed stay with no folio answers `STATE_ILLEGAL` and creates nothing; `ProduceInvoice` / `ProduceReceipt` still match the folio lines and balance | same file |
| `FW8` | **Bounded close path (`AC-FWV-7`)**: `GetStayRef` is the only outbound call on the folio path (no Billing re-entry from inside the read, so the close path stays one hop), and the verification runs outside the transactional writer — an ordering assertion on the mocked verifier and repository plus a wiring check that the transactional writer carries no outbound client dependency (LLD 25.2, `DatabaseConfig.java:55`) | same file |
| `FW9` | **Transport envelope**: the three refusals travel through the shared envelope with their statuses and details (`404 NOT_FOUND {upstream, stayId}`, `422 STATE_ILLEGAL {upstream, stayId, state}`, `503 UPSTREAM_UNAVAILABLE {upstream, operation}`); a missing token still answers `UNAUTHENTICATED`; the existing route-shape cases are unchanged | `BillingControllerTest.java` |
| `FW10` | **Desk refusals (`AC-FWV-6`)**: a `NOT_FOUND` write refusal, a `STATE_ILLEGAL` write refusal, and a `503` each render their own plain catalogue sentence in the open form, the charges card, and the payment card; no envelope code, status number, or stack trace appears; the entered values stay in place and the fields stay usable; the existing unknown-folio open sentence, the departure statements, and the Stay panel's refusal sentences stay as they are; the same cases pass in EN and VI | `app/src/views/FolioView.test.ts` |
| `FW11` | **Catalogue (`AC-FWV-6`, `NFR-I18N-1`)**: `desk.folio.refused_unknown_stay`, `desk.folio.refused_closed_stay`, and `desk.folio.refused_unreadable_stay` exist in `messages/en.json` and `messages/vi.json` with the rollout section 6.19 wording, are `{param}`-free in both locales, and `script/catalogue-coverage-check.sh` is green; an invented key fails the case rather than passing an absent one | `messages/en.json`, `messages/vi.json`, `script/catalogue-coverage-check.sh` |
| `FW12` | **Contract and LC**: the four folio contracts list `NOT_FOUND`, `STATE_ILLEGAL`, and `UPSTREAM_UNAVAILABLE` and move `1.0 -> 1.1` (additive per ADR-0004 D1); `contracts/errors/envelope.json` registers the code and the `503` mapping; `GetStayRef.json` is unchanged; `script/contract-check.sh` and `script/openapi-route-check.sh` are green | `contracts/http/*.json`, `contracts/errors/envelope.json`, `script/contract-check.sh`, `script/openapi-route-check.sh` |
| `FW13` | **Live desk loop and lab**: the existing charge, payment, approval, invoice, receipt, and check-out steps still pass; after the close, a `PostCharge` and a `RecordPayment` on the same stay are refused `STATE_ILLEGAL` and the `billing.folios` / `folio_charge_lines` / `folio_payment_lines` row counts for that stay are unchanged; a write on an id no stay names answers `NOT_FOUND` and a `psql` count shows **no** `billing.folios` row for it | `script/e2e-desk-loop.sh` |
| `FW-E1` | **Evidence rule**: the implementation PR records the lab reproduction of the finding — the pre-fix orphan folio for a random UUID and the post-close write that was accepted — in the PR body or an issue comment as the issue's scope requires, records the before/after pair in `docs/testing/evidence/634/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` section 3). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row except the desk-stay-green row, which
is covered today by pins that exist and pass and must keep passing
untouched. For a pending row the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head and flips it to covered only when the
guard passes.

| Item | Required guard | Guard |
|---|---|---|
| `AC-FWV-1` — a charge, a payment, or an open-balance approval against a stay id that names no stay is refused `NOT_FOUND` (404) naming the stay, and nothing is written — no folio row, no line, no balance movement, no recorded approval, no outbox event — the same on all three writes, on a repeated request, and with or without an idempotency key | L1 acceptance: three writes, zero-write call list, repeat and key | **Pending** — `FW2`, `FW1`, `FW9`, `FW10`; today's opposite is pinned at `BillingRepository.java:65-71` and `BillingService.java:121`/`:142`/`:176`/`:264` |
| `AC-FWV-2` — a write against a stay Stay reports outside `in-house` is refused `STATE_ILLEGAL` (422) naming the stay and its state, whether or not a folio exists; an existing folio keeps exactly its lines and balance, no event is emitted, and its invoice still matches | L1 acceptance: three writes, with and without an existing folio, replay after the close | **Pending** — `FW3`, `FW1`, `FW9`, `FW10`; the provider refusal it rests on is pinned at `services/stay/src/store.ts:416-421` and `services/stay/src/server.test.ts:330-348` |
| `AC-FWV-3` — a Stay that cannot be read refuses the route fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming the upstream and the operation, creates nothing, moves no balance, records no approval, emits no event, and a retried call after recovery commits once; a `4xx` envelope from Stay surfaces unchanged, so a rejected session reads `UNAUTHENTICATED` and never as an outage | L1 acceptance: the five unreadable classes plus the `401` and wrong-id split | **Pending** — `FW4`, `FW5`, `FW9`, `FW10`; the answer table it follows is LLD 25.2 and the fail-closed precedent is `services/reservations/internal/pricing/client.go:88-96` |
| `AC-FWV-4` — a verified in-house stay with no folio still gets its folio on the first balance read (one folio, zero balance, acting account recorded, plain no-lines sentence), and a charge, payment, or approval for it commits as today with the same line, balance movement, and outbox event | L1 acceptance: folio creation plus the three writes' success shape | **Pending** — `FW6`; today's success behaviour is pinned at `BillingServiceTest.java:71-84`, `:148-198`, `:211-261` and must stay green untouched |
| `AC-FWV-5` — a stay that already carries a folio is served from Billing in every stay state, so the departure invoice and each receipt still print and still match; a stay with no folio that is not in house is refused `NOT_FOUND` / `STATE_ILLEGAL` and creates nothing | L1 acceptance: no stay read on an existing folio, the closed-stay print pair, the folio-less refusal | **Pending** — `FW7` (service read split and print parity), `FW3` (folio-less closed refusal), with the desk pins `app/src/views/PrintView.vue:1028`, `:1120`, `:1157` and `app/src/views/PrintView.test.ts:273-342`, `:724-756` green unchanged |
| `AC-FWV-6` — every refusal renders as one plain sentence in the active locale naming what was refused and that nothing was recorded (unknown stay, closed stay, unreadable Stay with a retry that can help), with no code, status, trace, or invented amount, the fields usable, the rest of the desk working, the existing sentences unchanged, both catalogues carrying the keys, and the catalogue gate green | L1 acceptance: three sentences × two locales plus the no-code and usable-field assertions | **Pending** — `FW10`, `FW11`; the fallback the new sentences replace is `app/src/views/FolioView.vue:566-575` and the existing sentence is `:944-962` |
| `AC-FWV-7` — guards cover the unknown-stay, closed-stay, and unreadable-Stay callers for each write and for the folio-creating read, plus both regression paths; the only new call is the registered C8 read, one hop, so the close path stays bounded; `UPSTREAM_UNAVAILABLE` is registered in the envelope; and the existing gate guards stay green unchanged | L1 + LC + behaviour re-run | **Pending** — `FW1`–`FW13` and `FW-E1`; the green half is the desk-stay-green row below, the registration is `FW12`, and the one-hop bound is `FW8` |
| `FR-FWV-1` — every folio write verifies the stay before the claim and before any row, whether or not the folio exists, with the caller's session forwarded; only an in-house answer proceeds; a replay is served only from a verified in-house stay (section 26.3) | L1 acceptance + ordering assertion | **Pending** — `FW1`, `FW2`, `FW3`, `FW4`, `FW7` |
| `FR-FWV-2` — an unknown stay is refused `NOT_FOUND` (404) naming it and nothing is written on any of the three writes, on a repeat, and with or without a key; a `NOT_FOUND` naming a different stay is a wiring fault that takes the fail-closed answer (section 26.3) | L1 acceptance + the wrong-id split | **Pending** — `FW2`, `FW4`, `FW9` |
| `FR-FWV-3` — a stay outside `in-house` is refused `STATE_ILLEGAL` (422) naming the stay and state, with or without an existing folio, and nothing is written; an existing folio keeps its lines and balance; a retry of a committed write after the close is refused while the recorded line stays (section 26.3) | L1 acceptance: the folio and no-folio pair plus the replay case | **Pending** — `FW3`, `FW1`, `FW9` |
| `FR-FWV-4` — an unreadable Stay refuses the route `UPSTREAM_UNAVAILABLE` (503) naming `stay` and `GetStayRef` and writes nothing; a `401`/`403`/other `4xx` envelope surfaces unchanged; an unread Stay is never replaced by a cached or assumed state; once Stay answers, the retried call commits once and not twice (section 26.3) | L1 acceptance: the unreadable set plus the surface-unchanged and retry cases | **Pending** — `FW4`, `FW5`, `FW9`; `FW7` proves the read split does not widen the outage to an existing folio |
| `FR-FWV-5` — a folio Billing already holds stays readable in every stay state without a stay read; a folio-less in-house stay still creates its one zero-balance folio as today; a folio-less unknown, outside-`in-house`, or unreadable stay refuses with the same answer and writes nothing (section 26.3) | L1 acceptance + the no-stay-read assertion | **Pending** — `FW7`, `FW6`, `FW3`, `FW4` |
| `AC-FWV-3` / `AC-FWV-5` disposition (the folio-creating read versus the existing-folio read) | The gate sees the reading and the guard that proves it: `AC-FWV-5` settles the existing-folio read and `AC-FWV-3`'s balance-read clause binds the folio-creating read (LLD 25.2, requirements 26.5) | **Pending** — `FW7` is the guard and the only outstanding obligation on the row; `product-owner` confirms the reading at the spec gate, which is the only open item left |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the room charge, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run at this spec head** — `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `:2152-2194`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/FolioView.test.ts:181-430`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh:363-418`. These must pass unchanged after the implementation PR; a flow edit fails the row |
| Contract and LC | Real delta: the four folio operations gain three codes and a minor bump, the envelope registers the code and `503`, `GetStayRef` is unchanged, and both check scripts stay green | **Pending gate** — `FW12`; the files are `contracts/http/GetFolioBalance.json`, `PostCharge.json`, `RecordPayment.json`, `RecordOpenBalanceApproval.json`, `GetStayRef.json`, `contracts/errors/envelope.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, or event change here is a re-tier finding (LLD 25.7, 25.9) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-BIL-1`, `FR-BIL-2`, `FR-BIL-3`, and `FR-BIL-7` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged in `traceability-matrix.md` and no MVP row cites this slice as its guard (requirements 26.2) |
| Evidence cross-reference (`FW-E1`) | The finding is reproduced from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/634/README.md` and the `test-report.md` row are created by the implementation PR; the reproduction is also stated in that PR's body or an issue comment |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 25.8](../architecture/lld.md)) |
|---|---|---|
| L1 Billing service | `FW1`–`FW4` and `FW6`–`FW8` plus the existing service suite, database-free | `cd services/billing && mvn verify` (CI `billing-build`) |
| L1 Billing client | `FW5` against a JDK `HttpServer` stub, database-free | same command |
| L1 Billing transport | `FW9` plus the existing route cases | same command |
| LC contract | `FW12`: the four contract files, the envelope, and both check scripts | `script/contract-check.sh`, `script/openapi-route-check.sh` |
| L1 Stay service | The provider pins of section 2 unchanged — this slice adds no Stay code, but the seam must stay green | `cd services/stay && npm ci && npm run build && npm test && npm run lint` |
| Desk unit | `FW10`, `FW11`, and the #588/#600/#601/#646/#647/#648 pins unchanged | `cd app && npm ci && npm run build && npm run lint && npm test` (CI `app-build`) |
| Desk browser | The existing `app/e2e/stay.spec.ts` flow on the served SPA stays green (the refusal path is unit- and loop-covered; no new browser spec is required) | CI `browser-e2e` |
| Live desk loop and lab | `FW13` and `FW-E1`: the full charge → payment → approval → check-out chain, then the post-close refusals, the unknown-stay refusal, and the row counts | `script/e2e-desk-loop.sh` (CI `e2e-single-host`); the isolated-compose lab for the reproduction record |
| Gates | Catalogue, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `billing-build`,
`node-build` (stay), `contract-check`, `app-build`, `browser-e2e`,
`e2e-single-host`, `dom-diff`, and `ci` (which runs the catalogue
coverage and link checks).

### Execution order

1. Billing service suite (`FW1`–`FW4`, `FW6`–`FW8`). A red case stops
   the run: the money-path ordering is the defect this slice fixes.
2. Billing client suite (`FW5`) — the answer classification the
   ordering guards depend on.
3. Billing transport suite (`FW9`).
4. Contract and route checks (`FW12`) — the LC gate, not a re-run.
5. Stay suite — the provider pins unchanged.
6. Desk unit suite (`FW10`, `FW11`), then the browser suite.
7. Live desk loop (`FW13`), then `FW-E1`: the lab reproduction and the
   before/after pair.
8. Catalogue, link, and harness-convention gates, then the test-report
   row.

### Entry criteria

1. The #634 T3 spec set (product section 18, rollout section 6.19,
   requirements section 26, ADR-0008, LLD section 25, HLD section 18,
   error-handling section 5, integration C8, and this document) carries
   a `SPEC-GATE PASS` on #634 / the spec stack.
2. ADR-0008 is `accepted` (the owner's flip) before the implementation
   PR merges; the implementation PR may open while it is `proposed`,
   following the established order.
3. The #588/#600/#601/#646/#647/#648 slices are merged (all on `master`
   at this spec head), so the desk pins in section 2 are the real
   baseline.
4. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).

### Exit criteria

1. `FW1`–`FW13` exist and pass; every refusal case asserts the call
   list, that no unplanned write or outbox row happened, and that the
   end state matches the stay and folio reads.
2. Every pin in section 2 passes unchanged — no dropped assertion and
   no flow edit on the desk; the existing Billing, Stay, and app suites
   stay green without a desk change (`AC-FWV-4`).
3. The contract stage is green with the specified delta landed
   (`FW12`), and `openapi.yaml` still lists its curated 14 operations.
4. `FW-E1` is recorded: the pre-fix and post-fix lab pair in
   `docs/testing/evidence/634/README.md` and the slice row in
   `docs/testing/test-report.md`.
5. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
6. Open failures are filed as issues with FR/NFR ids; no `risk-medium`
   failure is waived without owner approval.

### Negative controls

A guard that only checks the returned status is insufficient.

- `FW1` and `FW2`–`FW4` each assert the exact call list. A `404` can be
  returned while `ensureFolio` already inserted the row — the status
  alone proves nothing on this path.
- `FW7` carries its own positive control: a folio-less in-house read
  **must** call the verifier and create the folio, so "no stay call"
  cannot hide an always-silent read split.
- `FW4` carries the wrong-id pair: a `404` naming a different stay or
  naming none must read `503`, because a misconfigured base URL must
  never read as a product refusal on a money path.
- `FW13` reads row counts with `psql`, not only the HTTP answer, so a
  written-then-rolled-back half-record is caught at the table.
- `FW10` fails on a rendered code or status, not only on a missing
  sentence: the generic `request_failed` fallback must not remain the
  answer for a closed stay.
- `FW11` fails an invented key, not only a missing one.

## 6. Owner verification cases (FWV-1..FWV-10)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh:363-418` recipe (sign-in token, a
seeded in-house stay with a folio, a seeded closed stay, `api billing
PostCharge` / `RecordPayment` / `RecordOpenBalanceApproval` /
`GetFolioBalance` bodies, and `psql` counts on `billing.folios`). Steps
are the same for each case unless stated: seed the stay, act as
described, then read the reply, `GetFolioBalance`, the `psql` row counts
for the stay, and the desk Folio screen in both locales.

| Case | Setup | Expected |
|---|---|---|
| `FWV-1` | Post a charge against a random UUID that names no stay | `404 NOT_FOUND` naming the id; no `billing.folios` row for it, no line, no balance movement, no outbox row; the desk says no stay matches that ID and nothing was recorded |
| `FWV-2` | Record a payment and then an open-balance approval against the same unknown id | The same `404` on both; no folio row appears; a repeated request and a request with an idempotency key answer the same |
| `FWV-3` | Post a charge against an in-house stay, check the guest out, then post a charge, record a payment, and record an approval on the closed stay | All three refuse `422 STATE_ILLEGAL` naming the stay and `closed`; the folio keeps exactly the lines and balance it had; the departure invoice still matches the folio |
| `FWV-4` | Open the same closed stay's folio and print its invoice and one receipt | The folio opens with its lines and balance and both documents print unchanged, with Stay reachable or not (the read takes no stay call) |
| `FWV-5` | Check a new guest in, open the folio for the first time, then post a charge and take a payment | One folio at zero balance is created on the first open, the empty no-lines sentence shows, then the charge and payment commit with today's lines, balance, and events |
| `FWV-6` | Open a folio for an in-house stay that has never had one, with Stay stopped | `503 UPSTREAM_UNAVAILABLE` naming `stay` and `GetStayRef`; no folio row is created; the desk says the stay could not be checked, nothing was recorded, and offers the retry |
| `FWV-7` | With Stay stopped, post a charge to a stay that already has a folio | `503` and nothing written; once Stay answers again, the retried charge commits exactly once (no duplicate line) |
| `FWV-8` | Make Stay reject the session (or call with a bad token) and post a charge | The provider's `401` surfaces as `UNAUTHENTICATED`, never as an outage, and nothing is written |
| `FWV-9` | Refuse each of the three cases on the desk (unknown stay, closed stay, Stay down) and read the panel in EN and VI | Each shows its own plain sentence from section 6.19, no code, status, or stack trace; the entered values stay in place and the rest of the desk stays usable |
| `FWV-10` | Desk regression on the same build: the check-out review room charge (#600), the unpaid-close refusal and approval close (#601), the departure release (#646), the reassignment path (#647), and the booking register (#648); then run the live desk loop | Unchanged from their records; the loop is green through charge, payment, approval, close, invoice, and receipt, and the post-close write refusal answers `STATE_ILLEGAL` |

## 7. Evidence rule FW-E1

The implementation PR records, in `docs/testing/evidence/634/README.md`
(created by that PR, same capture method as the #588 record), one
before/after pair plus the finding, because the issue's scope asks for
the reproduction to live with the implementation:

- **The finding, reproduced on the pre-fix build from an isolated
  compose lab.** Post a charge against a random UUID that names no stay:
  the reply is a success and `billing.folios` gains an orphan row
  (`BillingRepository.java:65-71`), with a charge line and a
  `folio.charge-posted` outbox row behind it, and Stay's check-out gate
  never reads that folio. Then post a charge to a stay checked out
  earlier: it is accepted, so the folio's balance moves after the close.
- **After**, the same steps against the fixed build: the unknown-id
  charge answers `404 NOT_FOUND` with the four row counts unchanged, the
  post-close charge answers `422 STATE_ILLEGAL` with the folio's lines
  and balance intact, and a folio-less read with Stay stopped answers
  `503 UPSTREAM_UNAVAILABLE` while creating no folio row.
- **Plus the honest positive control:** a fresh in-house check-in still
  opens its folio on the first balance read, and its charge, payment,
  and approval still commit and still appear on the invoice — so the
  fix is the verification, not a wider refusal rule.
- **Plus the timing observation:** with Stay stopped, the folio write
  answers inside the `NFR-PERF-1` 3-second action bound because the
  verification call is bounded at 2 seconds (LLD 25.2); a hanging
  request is a failure of the row, not an accepted slow path.

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 17 rows mapped, 1 covered by re-run only (the
desk-stay-green row — its pins exist and pass today and must keep
passing), and 16 pending rows whose guards are the registry
`FW1`–`FW13` plus the contract/LC gate, the MVP no-change gate, the
`AC-FWV-3` / `AC-FWV-5` disposition row, and `FW-E1`. The slice is
**not complete**. It completes when the implementation PR merges with
`FW1`–`FW13` green, the section 2 pins unchanged, `FW-E1` recorded, and
`qa-lead` re-pins every row in section 4 with `file:line` at the merged
head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1048
