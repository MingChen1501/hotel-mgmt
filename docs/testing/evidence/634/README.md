# #634 folio write stay verification — evidence

Before/after reproduction record for
[issue #634](https://github.com/MingChen1501/hotel-mgmt/issues/634)
(audit finding B1; `AC-FWV-1`..`AC-FWV-7`, `FR-FWV-1`..`FR-FWV-5`,
`BR-50`/`BR-51`, ADR-0008, LLD
[section 27](../../../architecture/lld.md#27-folio-writes-verify-the-stay-refs-634)),
guards `FW1`–`FW13` as the active registry
(`docs/testing/folio-write-verification-test-traceability.md` section 3)
defines them: `FW5` is the client classification, `FW9` the transport
envelope, `FW10`–`FW12` the desk and contract suites, and `FW13` the
live desk loop. The left column is the pre-change build; the right
column is this change. Every answer below was captured from a running
service process and its database, not from a test assertion.

## Finding

`ensureFolio` inserted a folio for any UUID `stayId` with no Stay read,
and all four folio routes reached it with the caller's id. A charge, a
payment, or an open-balance approval could therefore be written against
a stay that did not exist or had already checked out — an orphan folio
Stay's check-out gate never reads, and money rows with no stay behind
them.

## Capture method

- Pre-change build: `git archive origin/master services/billing` (the
  master tree is the pre-change tree; the spec PRs touched `docs/` and
  the accepted ADR only), packaged with `mvn -DskipTests package` in
  the `maven:3.9-eclipse-temurin-21` image.
- Post-change build: this branch, packaged the same way.
- Each jar ran as its own container on a dedicated loopback port
  (`18891` pre, `18892` post), network host, against a throwaway
  PostgreSQL 16 container (`--label ao.session=hotel-mgmt-1197`, port
  `55441`, separate `hotel` / `hotel_post` databases).
- Stay was a loopback stub on `127.0.0.1:18084` answering
  `POST /v1/stay/GetStayRef` with the four answers the classification
  must tell apart: in-house `200`, unknown-stay `404` naming the
  requested id, closed-stay `422 STATE_ILLEGAL`, and `500`. The stub
  logged every call, including the forwarded `Authorization` header.
- Requests: `POST /v1/billing/<Operation>` with
  `Content-Type: application/json` and `Authorization: Bearer lab-token`.
  `psql` read the folio, line, payment, and outbox counts.
- Lab containers and the stub were removed after the capture. No
  `docker compose` command touched the shared `hotel-mgmt` project and
  no lab volume was kept.

## Before/after — the finding

| Step | Pre-change build | This change |
|---|---|---|
| `GetFolioBalance` for stay `22222222-…` (unknown to Stay) | `200`, folio `0542c6bd-…` created — **orphan folio** | `404 {"code":"NOT_FOUND","message":"No stay matches that ID.","details":{"upstream":"stay","stayId":"22222222-…"}}` |
| `PostCharge` for stay `33333333-…` (Stay answers `STATE_ILLEGAL`) | `200`, line `c545897d-…`, balance moved | `422 {"code":"STATE_ILLEGAL","message":"Stay 33333333-… is closed, not in house, so nothing was recorded.","details":{"upstream":"stay","stayId":"33333333-…","state":"closed"}}` |
| `RecordPayment` for stay `44444444-…` (Stay answers `500`) | `200`, payment `12d4abed-…`, balance `-6000` | `503 {"code":"UPSTREAM_UNAVAILABLE","message":"The stay could not be checked, so nothing was recorded.","details":{"upstream":"stay","operation":"GetStayRef"}}` |
| Rows after the three calls | `folios=3`, `charges=1`, `payments=1`, `outbox=2` | `folios=0`, `charges=0`, `payments=0`, `outbox=0` |

The pre-change build made no Stay call at all (the stub log stayed
empty); the post-change build made one call per route before writing.

## Post-change — the desk flow still works

| Step | Answer |
|---|---|
| `GetFolioBalance` for in-house stay `11111111-…` with no folio | `200`, folio `db205cf9-…` created at `balanceMinor: 0` |
| `PostCharge` `12000` on the same stay | `200`, line `a64e74b3-…` |
| `GetFolioBalance` again | `200`, `balanceMinor: 12000` and the line presented; **no Stay call** (stub log) so a departed guest's invoice and receipts keep printing |
| Stay stub stopped, `RecordPayment` then attempted | `503 UPSTREAM_UNAVAILABLE`, nothing written |
| Rows after all five calls | `folios=1`, `charges=1`, `payments=0`, `outbox=1`, `balance_minor=12000` |

The forwarded header was `Authorization: 'Bearer lab-token'` on every
call, and the request body carried the caller's `stayId`.

## Guards

Guard IDs are the registry obligations, not one ID per test method:
every case under an ID proves part of that obligation.

| Product condition | Guard | Pass evidence |
|---|---|---|
| `AC-FWV-1` unknown stay (with and without a key) | `BillingServiceTest` `fw2UnknownStayRefuses…` (`FW2`, `:539`–`:597`) and `fw1VerificationPrecedes…` (`FW1`, `:464`–`:537`); `BillingControllerTest` `fw9UnknownStayRendersNotFoundNamingTheStay` (`FW9`, `:713`) | `NOT_FOUND`, `verifyNoInteractions(repo)`; lab `404` and zero rows |
| `AC-FWV-2` closed stay, with or without a folio, and the post-close retry | `fw3ClosedStayRefuses…` (`FW3`, `:599`–`:677`); `fw9ClosedStayRendersStateIllegalNamingTheState` (`FW9`, `:700`) | `STATE_ILLEGAL` naming `closed`, no repository call; the existing folio keeps its line and balance and the replay leaves it in place |
| `AC-FWV-3` unreadable Stay on all four folio routes, and the retry after recovery | `fw4UnreadableStayRefuses…` (`FW4`, `:679`–`:750`); `fw5…` client classification against the `HttpServer` stub (`FW5`, `StayClientTest.java:76`–`:171`, `StayClientWiringTest.java:16`); `fw9UnreadableStayRendersUpstreamUnavailableThroughTheEnvelope` (`FW9`, `:684`) | `503` with `{upstream, operation}`, no `ensureFolio`; the retry commits once; the client covers `200`, correct-id `404`, wrong-id `404`, `422`, `401`, `5xx`, malformed body, timeout, connection refusal, unwired client |
| `AC-FWV-4` fresh check-in regression | `fw6FreshCheckInStillCreatesItsFolioOnTheFirstRead` (`FW6`, `:752`), `fw6VerifiedStayWritesCommitWithTheirLineBalanceAndEvent` (`:767`) | folio created at zero on the first read; the three writes keep their line, balance movement, and `folio.*` event; lab `200` |
| `AC-FWV-5` departed-stay reads and print parity | `fw7ExistingFolioReads…`, `fw7ClosedStayWithNoFolioRefuses…`, `fw7InvoiceAndReceiptStillMatchTheStoredRows` (`FW7`, `:796`–`:842`) | existing folio served with no Stay call; closed folio-less stay refused; invoice and receipt still match the stored rows; lab second read made no stub call |
| `AC-FWV-7` bounded close path | `fw8VerificationRunsOutsideTheTransactionalWriter` (`FW8`, `:844`), plus the `FW1` ordering cases | `InOrder` pins verify → `ensureFolio` → the writes; reflection pins `BillingService` folio methods non-transactional, `FolioWriter` methods `@Transactional`, and the writer carries no client dependency |
| `AC-FWV-1`–`AC-FWV-3` live desk loop | `script/e2e-desk-loop.sh` post-close and unknown-stay block (`FW13`) | after the close, `PostCharge` and `RecordPayment` are refused `STATE_ILLEGAL` with the `billing.folios` / `folio_charge_lines` / `folio_payment_lines` counts unchanged; an unknown id answers `NOT_FOUND` with `0` `billing.folios` rows |

## Gates

- `cd services/billing && mvn verify`: 114 tests, 0 failures (51
  service, 11 client, 1 wiring, 44 controller, plus the config,
  messages, and health suites).
- `script/e2e-desk-loop.sh`: the `FW13` post-close and unknown-stay
  block reads the row counts with `psql`.
- `script/contract-check.sh`, `script/openapi-route-check.sh`,
  `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`:
  PASS.
- Desk: `app/src/views/FolioView.test.ts` covers the three new refusal
  sentences on charge and open, plus the existing happy path (41 tests).
- Slice record: `docs/testing/test-report.md` section 1.19.
