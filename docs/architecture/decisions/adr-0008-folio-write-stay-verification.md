# ADR-0008: Folio write verification — Billing verifies the stay before any folio write

Status: proposed (Refs #634). Owned by `architect`.

Date: 2026-11-25 (proposed).

## Context

Audit finding B1 (the #625 class: a client-supplied identifier decides a
money outcome, filed as #634). Billing creates a folio for any UUID
`stayId` it is handed and never reads Stay first. Traced read-only at
this spec head:

- `ensureFolio` inserts the folio row for the handed stay id with
  `ON CONFLICT (stay_id) DO NOTHING` and returns it, with no Stay read
  (`services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:65-71`).
- All four folio routes reach it with the caller's id — `GetFolioBalance`
  (`service/BillingService.java:121`), `PostCharge` (`:142`),
  `RecordPayment` (`:176`), and `RecordOpenBalanceApproval` (`:264`) —
  so a charge, a payment, or an open-balance approval can be written
  against a stay that does not exist or is already closed.
- The consequence is two-sided: an orphan folio that Stay's check-out
  gate never reads, and money rows with no stay behind them. The threat
  model already carries the post-close half as residual risk R5 and
  names this change as its follow-up
  (`docs/technical/security-threat-model.md` section 8).
- Nothing in Billing refuses a non-in-house stay: `ApiException` offers
  `validation`, `notFound`, and `settlementRequired` only
  (`web/ApiException.java:33-43`), and `UPSTREAM_UNAVAILABLE` is absent
  from the shared envelope enum
  (`contracts/errors/envelope.json`), so both codes this record needs
  are wiring, not design, work.

The provider-side read already exists and already refuses exactly the two
states a folio write must refuse: `GetStayRef` answers `NOT_FOUND` for an
unknown stay and `STATE_ILLEGAL` naming the state for anything outside
`in-house` (`services/stay/src/store.ts:406-423`, the Postgres store
`services/stay/src/pgstore.ts:387-409`, routed at
`services/stay/src/server.ts:152-156`). The seam is registered as C8 in
`docs/technical/integration.md` section 3 and its REST projection is
`GET /v2/stays/{stayId}/ref`
(`docs/architecture/rest-resource-surface.md:111`,
`docs/architecture/lld.md:164`), but no client under
`services/billing/src` calls it — ADR-0005's consequences record that
"Billing's C8 `GetStayRef` is specified but not called today"
(`docs/architecture/decisions/adr-0005-server-side-checkout-gate.md`).

Inputs this record builds on:

- Product scope and done-conditions:
  `docs/product/acceptance-criteria.md` section 20 (`AC-FWV-1`..`AC-FWV-7`),
  the scope decision D-32 in `docs/project/decision-log.md`, and the desk
  delta in `docs/product/desk-ui-design-rollout.md` section 6.21.
- `BR-18` already states that no folio line posts against a closed stay
  and `BR-21` that a stay carries exactly one folio; `FR-BIL-1`..`FR-BIL-4`
  and `FR-BIL-7` already require that every folio line and receipt
  matches its stay. No rule is reworded here.
- The precedent this decision mirrors: ADR-0005 (#601) makes the module
  that owns a fact the authority at the decision point, treats the
  caller's restatement as advisory, and fails closed with
  `UPSTREAM_UNAVAILABLE`.
- The established sync pattern: HTTP/JSON `POST /v1/<contract>/<Operation>`
  with the caller's Bearer token forwarded, a fixed timeout, and a
  fail-closed 503 on anything unreadable
  (`services/reservations/internal/pricing/client.go:22-96`;
  `docs/architecture/services/reservations.md` section 5).

## Decision

### D1 — Authority: Stay owns the stay's existence and state, Billing owns the folio, the caller asserts neither

Stay is the only authority for whether a stay exists and which lifecycle
state it is in. Billing is the only authority for a folio's lines, its
balance, and its recorded open-balance approval. The caller's `stayId`
selects which stay a folio write is about; it never proves that stay
exists, is in house, or may take a line. Billing therefore asks Stay
before it writes, and never infers a stay from the id alone.

### D2 — Verify before every folio write, and before creating a folio on a read

- `PostCharge`, `RecordPayment`, and `RecordOpenBalanceApproval` call
  `GetStayRef` on every request, whether or not a folio already exists, so
  a post-departure charge, payment, or approval is refused as well. The
  existing folio is not evidence that the stay may still take a line.
- `GetFolioBalance` verifies only when the stay carries no folio: a folio
  that Billing already holds is served from Billing in every stay state,
  which keeps the departure invoice and each payment receipt readable and
  printable after the guest leaves. A stay with no folio is verified
  before one is created, so an unverifiable stay never gets an orphan
  folio from a read.

The two product conditions overlap on the read: `AC-FWV-5` (an existing
folio is served in every stay state) governs it, and `AC-FWV-3`'s
"open the folio balance" clause binds the folio-creating read. Serving an
existing folio cannot produce an unverified folio, which is what
`AC-FWV-3` exists to prevent, so the readings do not conflict in effect;
the resolution is written out in `docs/architecture/lld.md` section 27.2
for the `product-owner` to confirm at the spec gate.

### D3 — No new refusal vocabulary

The two definitive refusals are the ones Stay already returns:

| Stay's answer | Billing's answer | Status |
|---|---|---|
| `NOT_FOUND` (unknown stay) | `NOT_FOUND`, details `{upstream: "stay", stayId}` | 404 |
| `STATE_ILLEGAL` naming the state | `STATE_ILLEGAL`, details `{upstream: "stay", stayId, state}` | 422 |

A malformed `stayId` keeps today's `VALIDATION_FAILED` naming `stayId`
in Billing before any call is made. No new code, message key family, or
desk sentence family is invented on the error side.

### D4 — Fail closed on an unreadable Stay

If Stay cannot be read — transport failure, timeout, `5xx`, a non-envelope
body, or an unwired client — the route is refused with
`UPSTREAM_UNAVAILABLE` (503), details
`{upstream: "stay", operation: "GetStayRef"}`, and nothing is written: no
folio row, no line, no balance movement, no approval, no outbox event.
The offline-first cached-config rule does not extend to stay state: a
folio write never proceeds on a stay nobody verified, exactly as an
unverified balance never passes the #601 close gate.

Two classification rules keep the answer honest:

- A `4xx` provider envelope is surfaced unchanged, so a rejected session
  stays `UNAUTHENTICATED` and is not reported as an outage.
- A `404` counts as the definitive unknown-stay answer only when its
  `details.stayId` matches the request's `stayId` (Stay always sends that
  field). A `404` that does not name the requested stay is a wiring
  fault — a wrong base URL or path — and is `UPSTREAM_UNAVAILABLE`,
  never "no such stay": a misconfiguration must not read on the money
  path as a product refusal.

### D5 — Verify first, then claim, then write; and verify outside the database transaction

Per route the order becomes: shape validation, stay verification,
idempotency claim, insert + balance movement + outbox event. Because the
verification precedes the claim and every insert, a refusal provably
writes nothing — the same on a repeated request and with or without an
idempotency key (product `AC-FWV-1`).

The verification call runs before the route's `@Transactional` work
begins, not inside it: holding a Postgres connection open across a
network call that may take the full timeout would starve the billing pool
under the `NFR-PERF-1` load, and a rollback of a transaction that never
wrote anything is noise. The implementation therefore splits the route
into a non-transactional verification step (a small `StayVerifier`
component injected into `BillingService`) and the existing transactional
write, so the transaction boundary covers exactly the writes it already
covers.

### D6 — Dependency edge, bounded at one hop

Billing gains its first runtime outbound call: `STAY_BASE_URL` (default
`http://stay:8084` in the compose network, the port Stay already
publishes, `deploy/compose.yaml:77-90`, `PORT` at `:81`), a 2-second
timeout, and the caller's Bearer token forwarded. Two seconds keeps a
stuck Stay inside `NFR-PERF-1`'s 3-second bound for charge posting and
payment recording, with the local write inside the remainder; it matches
the #646 completion timeout.

The Billing <-> Stay cycle is bounded and cannot recurse: `GetStayRef` is
a leaf read that makes no outbound call, so the close path Stay ->
Billing(`GetFolioBalance`) -> Stay(`GetStayRef`, only when no folio
exists) -> return ends after one hop.

### D7 — No schema, no operation, no event; the contract change is error-code additive

No table, column, migration, operation, request field, response field, or
event changes. The change is error-set additive on the four operations
(minor version bump under ADR-0004 D1, the same reading ADR-0005 used):

| File | Change |
|---|---|
| `contracts/http/GetFolioBalance.json` | errors add `NOT_FOUND` (unknown stay on a folio-less read), `STATE_ILLEGAL` (stay not in house), `UPSTREAM_UNAVAILABLE` (Stay unreadable); `1.0 -> 1.1` |
| `contracts/http/PostCharge.json` | errors add the same three; `1.0 -> 1.1` |
| `contracts/http/RecordPayment.json` | errors add the same three; `1.0 -> 1.1` |
| `contracts/http/RecordOpenBalanceApproval.json` | errors add the same three; `1.0 -> 1.1` |
| `contracts/errors/envelope.json` | add `UPSTREAM_UNAVAILABLE` to the enum and `503` to `statusMapping` — the drift ADR-0005 already names |

`GET /v2/stays/{stayId}/ref` and `contracts/http/GetStayRef.json` are
unchanged: the provider side already answers correctly.

## Consequences

- Billing gains its first runtime outbound dependency on the money path:
  `STAY_BASE_URL`, a 2-second timeout, and the caller's token. Every folio
  write costs one extra synchronous read, inside the `NFR-PERF-1` bound.
- Availability is coupled in the deliberate direction: while Stay is
  unreadable, folio writes and folio-less reads refuse. That is the point
  of failing closed, and it is recorded as residual risk R8 in
  `docs/technical/security-threat-model.md` with an availability alert,
  not a cached stay state, as the mitigation (`NFR-AVL-1` does not extend
  to an unverified stay).
- The verify-then-write window is not atomic across services: a stay that
  closes between the verify and the insert still takes the line. Bounded
  by the 2-second timeout, by single-desk scale, and by the #601 close
  re-reading the balance immediately before its flip; the remaining
  window is residual risk R5's mirror image and is named, not hidden.
- Two named behavioural consequences, both accepted on the product side
  and both out of scope here:
  - **No post-departure settlement by folio write.** An open balance
    approved at check-out can no longer be settled by a `RecordPayment`
    after the guest leaves; the receipt for a payment recorded before
    departure still prints. A late-settlement path needs its own issue.
  - **A replay on a closed stay refuses.** A retried charge whose first
    attempt committed before the close now answers `STATE_ILLEGAL`
    instead of replaying the original line. The money already recorded is
    unchanged and the folio still shows it; the retry is simply refused.
- Folio rows a live installation already holds orphaned stay as they are:
  this change prevents new ones, it does not delete existing data.
- Guards: Billing unit guards for the unknown-stay, closed-stay, and
  unreadable-Stay callers on each route plus the two regression paths
  (`AC-FWV-7`); the verification plan is
  `docs/architecture/lld.md` section 27.8 and the qa-lead traceability
  row is a sibling handoff.
- This ADR starts at `proposed`; only the owner flips it to `accepted`.
  The implementation PR starts only after owner acceptance plus a T3
  `SPEC-GATE PASS` on #634.
- Rollback: revert the single implementation PR. The previous
  ensure-on-first-use behaviour returns, the new client and its
  configuration go with the code, and no schema, migration, backfill, or
  data repair exists in either direction; folios already written stay.

## Out of scope

- The approval-role rule (#625): whether approval is required and which
  of the fixed three may approve.
- A late-settlement flow for an approved open balance paid after
  departure (the named consequence above).
- Read-only invoice and receipt lookups by folio id (listed in the audit,
  no issue filed).
- Deleting or migrating the orphan folios a live install may already
  hold.
- Binding the asserted `actor` to the session token (residual risk R6,
  unchanged).
- Any caching, mirroring, or offline replica of stay state inside
  Billing.
- Desk panel, copy, and print changes: the refusal sentences are product
  section 6.21 and land with the implementation PR.

## Options considered

### Option A — Keep creating the folio for any id (status quo)

- Upside: no change, no new dependency.
- Downside: a caller that bypasses the desk writes money rows against a
  stay that never existed or has already left; the check-out gate never
  reads the orphan folio. Rejected: this is the finding.

### Option B — Verify only when the folio is created

- Upside: the smallest change; one read per new folio, nothing on the
  steady-state path.
- Downside: a folio that already exists keeps accepting charges, payments,
  and approvals after the stay closed, which is the post-close half of
  the finding (`BR-18`) and the half the audit named first. Rejected: it
  fixes orphan creation while leaving the money rows it exists to stop.

### Option C — Verify on every write and before creating a folio on a read (chosen)

- Upside: closes both halves with the read Stay already publishes;
  reuses a registered seam and the established fail-closed pattern; no
  schema, operation, or event change; the desk keeps its flows and an
  existing folio stays printable in every stay state.
- Downside: one synchronous read on every folio write, a new
  availability dependency on the money path, and a non-atomic
  verify-then-write window (R5 mirror, R8).

### Option D — Move folio creation and the money writes into Stay

- Upside: one authority for both the stay and its folio.
- Downside: reverses the module boundary the whole system is built on
  (Billing owns folios, day-close, and the reporting feed) and pulls the
  money model into the Node service; rejected as a re-architecture far
  beyond the finding.

### Option E — Reconcile after the fact with events

- Upside: no synchronous dependency.
- Downside: a reconciliation pass is not a gate; the money row is already
  written and the desk already told the clerk it landed. Rejected.

### Option F — Mirror stay state inside Billing for offline writes

- Upside: no call on the write path.
- Downside: a replica is stale by construction, and a stale "in house"
  is exactly the wrong answer on the money path; the offline-first rule
  is for cached configuration, never for a fact that decides money.
  Rejected.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1046
