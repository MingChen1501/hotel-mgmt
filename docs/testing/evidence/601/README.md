# #601 server-side check-out settlement gate — evidence

Status: active. Laboratory record for
[issue #601](https://github.com/MingChen1501/hotel-mgmt/issues/601)
(`BR-46`, `FR-CKO-4`, `FR-CKO-5`, `AC-CKO-1`, `AC-CKO-2`): the close now
decides on the folio Billing holds and on the recorded approval's
provenance, never on what the request asserts. It is the server half of
the #588 finding recorded as symptom 2(d) "Server trust" in
[`docs/testing/evidence/588/README.md`](../588/README.md), and it lands
the target written in
[ADR-0005](../../architecture/decisions/adr-0005-server-side-checkout-gate.md)
and [`docs/architecture/lld.md`](../../architecture/lld.md) section 21.

## 1. The before/after pair

| | Before (master, #588 build) | After (this branch) |
|---|---|---|
| Request | `POST /v1/stay/CheckOut` with `folioBalanceMinor: 120000` and `openBalanceApproval: {approvedBy: "manager", role: "night-auditor", approvedAt: "2026-11-09T19:39:23Z"}` | the same body |
| Billing holds | balance `120000`, approval with role `night-auditor` (the #588 record: `RecordOpenBalanceApproval` accepted any role string) | the same stored row |
| Billing write side | `RecordOpenBalanceApproval` with `role: "night-auditor"` → `200` recorded | `400 VALIDATION_FAILED` naming `role` |
| Stay close | `200` closed — the request's numbers were the gate input and the approval was never checked | `409 SETTLEMENT_REQUIRED` `{reason: "approval_incomplete"}`, stay in house, no `stay.checked-out` event |

The #588 payload is reproduced verbatim in the transcript below (A2,
A4). It is the exact request the #588 record captured as a `200`.

## 2. Method, environment, and scope

- Isolated lab only: the shared `hotel-mgmt` compose project was not
  touched and no compose command ran. Services came up on loopback, all
  started by this session and torn down after the run:
  - `postgres:16-alpine` container (`--label ao.session`, isolated
    database `hotel_lab` for Stay and `hotel_lab_billing` for Billing so
    each module's own migrations own its schema), published on
    `127.0.0.1:55432`;
  - Billing: `maven:3.9-eclipse-temurin-21` running
    `mvn -o -B spring-boot:run` on `127.0.0.1:8087` (Flyway applied the
    billing schema on boot), `--network host`;
  - Stay: `node dist/index.js` on `127.0.0.1:8084` with
    `DATABASE_URL=…hotel_lab` and `BILLING_BASE_URL=http://127.0.0.1:8087`,
    so the close takes the real `GetFolioBalance` HTTP path.
- Data was seeded through the public contracts only — `CheckIn`,
  `GetFolioBalance`, `PostCharge` (one `nightly-room-charge` of
  `120000`) — except step A3, which places the pre-#601 approval row
  directly (`UPDATE billing.folios SET open_balance_approval = …`),
  because #601 makes Billing refuse to create that record. The legacy
  row is what a folio recorded before this change still carries.
- Both stores run the same gate: the in-memory parity is covered by the
  unit guards (section 4) and the Postgres path by the S12 parity block;
  the lab above exercised the Postgres path end to end.
- Not covered here: the full compose desk loop (`e2e-single-host`) and
  the browser desk flows. Those are unchanged by this change (no desk
  file is touched) and stay pinned by the #588 guards, `AC-DSK-18`,
  `FR-CKO-4`, `FR-CKO-5`. Residual risk R5 (a charge that lands between
  the read and the flip) is recorded in the LLD, not fixable here.

## 3. Transcript

Scenario A — an open folio, a forged zero balance, the write-side role
refusal, and the #588 2(d) payload:

```
--- A0 post the nightly room charge of 120000
HTTP 200 {"lineId":"27a3fd61-…","folioId":"531c0f4a-…","stayId":"7278dbf8-…","itemKind":"nightly-room-charge","amountMinor":120000,…}
billing holds: folio 531c0f4a-… balance 120000 approval null
--- A1 forged balance low: request asserts folioBalanceMinor 0
HTTP 409 {"code":"SETTLEMENT_REQUIRED","message":"The folio has an open balance and no approval is recorded.","details":{"folioId":"531c0f4a-…","reason":"no_approval"}}
--- A2 write side: RecordOpenBalanceApproval with role night-auditor
HTTP 400 {"code":"VALIDATION_FAILED","message":"role must be owner, manager, or front-desk.","details":{"field":"role"}}
--- A3 a legacy out-of-set-role approval already stored against the folio (pre-#601 data)
billing now holds: balance 120000 approval {"role": "night-auditor", "reason": "", "approvedAt": "2026-11-09T19:39:23Z", "approvedBy": "manager"}
--- A4 the #588 symptom 2(d) close payload
HTTP 409 {"code":"SETTLEMENT_REQUIRED","message":"The recorded approval has no approver, no hotel role, or no recorded time.","details":{"folioId":"531c0f4a-…","reason":"approval_incomplete"}}
--- A5 stay state after the refusals
{"stayId":"7278dbf8-…","state":"in-house","actualDeparture":null}
--- A6 desk flow: a provenanced approval recorded through Billing closes
HTTP 200 {"folioId":"531c0f4a-…","balanceMinor":120000,"openBalanceApproval":{"role":"manager","reason":"Guest pays next visit","approvedAt":"2026-11-10T11:22:26.419179362Z","approvedBy":"Manager Nam"}}
billing now holds: balance 120000 approval {"role": "manager", …, "approvedBy": "Manager Nam"}
HTTP 200 {"stayId":"7278dbf8-…","state":"closed","invoiceRef":"531c0f4a-…"}
```

Scenario B — a settled folio, a forged open balance (the claim is
ignored in both directions):

```
billing holds: folio c38c4634-… balance 0 approval null
HTTP 200 {"stayId":"af9d7ee7-…","state":"closed","invoiceRef":"c38c4634-…"}
```

Scenario C — an unreadable folio fails the close closed:

```
billing holds: folio b5d5a415-… balance 0 approval null
HTTP 503 {"code":"UPSTREAM_UNAVAILABLE","message":"The folio balance could not be read, so check-out was refused.","details":{"upstream":"billing","operation":"GetFolioBalance"}}
--- C2 stay state after the fail-closed refusal
{"stayId":"91a3d51e-…","state":"in-house","actualDeparture":null}
```

## 4. Guard results at this branch head

| Guard | Case (file, case name) | Result |
|---|---|---|
| `S1` | `services/stay/src/server.test.ts` "ignores a forged zero balance while the folio still owes money" | PASS |
| `S2` | same file "ignores a forged open balance when the folio is settled" | PASS |
| `S3` | same file "ignores an approval the folio does not hold" | PASS |
| `S4` | same file "refuses a recorded approval missing identity, role, or recorded time" (five variants) | PASS |
| `S5` | same file "refuses a recorded approval naming a role outside the fixed three" | PASS |
| `S6` | same file "refuses a free-form recorded approval and ignores free-form request shapes" | PASS |
| `S7` | same file "closes a provenanced open balance for every fixed approver role" | PASS |
| `S8` | same file "refuses a close against a folio that is not the stay's folio" | PASS |
| `S9` | same file "refuses fail-closed when the folio cannot be read" (unreadable, unwired, 4xx surfaced) + `services/stay/src/billing.test.ts` (transport, timeout, unreachable, 5xx, unknown code, malformed body) | PASS |
| `S10` | same file "gates a replay before returning the stored close" and "grants exactly one winner for paired simultaneous check-outs" | PASS |
| `S11` | `services/billing/src/test/java/com/hotel/billing/service/BillingServiceTest.java` "recordApprovalRefusesARoleOutsideTheFixedThree" and "recordApprovalStampsTheRecordedTimeAndTheFixedRole" | PASS |
| `S12` | `services/stay/src/server.test.ts` "closes, moves, and times the stay row through the gated transaction (S12)" over `PostgresStayStore` | PASS (run with a local `TEST_PG_URL`) |

Commands and counts:

- `cd services/stay && npm run build && npm test` — 34 tests, 34 pass,
  lint clean.
- `TEST_PG_URL=postgresql://…/hotel node --test "dist/server.test.js"` —
  25 tests, 25 pass (the Postgres parity block, including `S12`).
- `cd services/billing && mvn -o -B test` — 35 tests, 35 pass
  (BillingServiceTest 19, BillingControllerTest 11, MessagesTest 4,
  HealthControllerTest 1).
- `script/contract-check.sh`, `script/openapi-route-check.sh`,
  `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh` —
  PASS.

## 5. Cross-references

- Before/after source: [`docs/testing/evidence/588/README.md`](../588/README.md)
  symptom 2(d) "Server trust".
- Decision and design:
  [ADR-0005](../../architecture/decisions/adr-0005-server-side-checkout-gate.md),
  [`docs/architecture/lld.md`](../../architecture/lld.md) section 21,
  [`docs/architecture/services/stay.md`](../../architecture/services/stay.md)
  sections 4-6, [`docs/technical/integration.md`](../../technical/integration.md) C7.
- Product and requirements delta:
  [`docs/product/acceptance-criteria.md`](../../product/acceptance-criteria.md)
  section 14 (`AC-CKO-1`, `AC-CKO-2`),
  [`docs/requirements/mvp-requirements.md`](../../requirements/mvp-requirements.md)
  section 22 (`FR-CKS-1`..`FR-CKS-5`),
  [`docs/requirements/business-rules.md`](../../requirements/business-rules.md)
  `BR-46`.
- Guard traceability and the `test-report.md` row are the `qa-lead`
  re-pin handoff at the merged head.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-924
