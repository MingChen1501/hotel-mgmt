# ADR-0005: Server-side check-out gate — Stay re-derives the balance and approval provenance

Status: proposed (Refs #601). Owned by `architect`.

Date: 2026-11-10 (proposed).

## Context

The #588 lab reproduction (isolated compose lab, 2026-11-09; record in
`docs/testing/evidence/588/README.md`, symptom 2(d) "Server trust")
found that the check-out gate is enforced only by the desk client. Two
server-side holes remain:

- Stay's gate (`services/stay/src/store.ts:148-168`, called at `:263`)
  refuses a non-zero balance only when no approval object travels with
  the request. The balance it reads is the caller's
  `folioBalanceMinor`, and the approval is the caller's
  `openBalanceApproval`; neither is checked against the folio Billing
  actually holds.
- Billing's `RecordOpenBalanceApproval`
  (`services/billing/src/main/java/com/hotel/billing/service/BillingService.java:255-262`)
  requires non-blank `approvedBy` and `role` but accepts any role
  string, so `night-auditor` is recorded as an approval.

A caller that bypasses the desk can therefore send a matching balance
plus an arbitrary approval object and close an unpaid stay. #588 closed
the UI half under the owner's UI-first constraint and recorded this
hole as **server trust, defence in depth**, out of that PR's scope.

Inputs this record builds on:

- `BR-17` (`docs/requirements/business-rules.md`) already states what
  an approval is: the record of who approved, the role they hold, and
  when it was recorded; a free-form note, a missing identity or time, or
  a role outside the hotel's fixed three does not count. `FR-CKO-4` /
  `FR-CKO-5` and `AC-DSK-18` already state the desk behaviour.
- The fixed three roles (`owner`, `manager`, `front-desk`) are fixed by
  requirements section 3.2 and never travel as config
  (`docs/technical/security-threat-model.md` section 1).
- The established server-side check pattern: Reservations calls Rates
  inside a desk step with `RATES_BASE_URL`, the caller's Bearer token
  forwarded, a 5-second timeout, and a fail-closed 503
  `UPSTREAM_UNAVAILABLE`
  (`services/reservations/internal/pricing/client.go`;
  `docs/architecture/services/reservations.md` section 5).
- `docs/technical/integration.md` C7/F4: Billing's
  `RequestCheckoutGate` was specified but never built; settlement is
  enforced stay-side against `GetFolioBalance` plus recorded approvals.

## Decision

### D1 — Authority: Billing owns the folio facts, Stay owns the close, the browser asserts neither

Billing is the only authority for a folio's balance and for the
recorded open-balance approval. Stay is the only authority for the
`in-house -> closed` transition. The desk browser may assert which stay
and which folio it is closing, the actual departure time, and an
idempotency key; it may not assert the balance or the approval. A
request field that restates a Billing-owned fact is advisory input at
most and is never used to decide the close.

### D2 — Stay re-reads the folio through Billing at the close

`StayService.CheckOut` calls `BillingService.GetFolioBalance`
(`POST {BILLING_BASE_URL}/v1/billing/GetFolioBalance`) with the stay id
and the caller's Bearer token forwarded, and uses the returned
`balanceMinor`, `folioId`, and `openBalanceApproval`. The read runs on
every close route, including an idempotent replay, before the
conditional state flip. The presented `folioId` must equal the folio
Billing returns for the stay; a mismatch is refused rather than closed
against a folio the balance did not come from.

### D3 — Provenance is validated at write and re-validated at read

An approval counts only when all three hold: a non-blank approver
identity, a role from the fixed three (`owner`, `manager`,
`front-desk`), and a recorded time that is present and parseable.
Billing enforces this at write — it refuses an out-of-set role and
stamps `approvedAt` server-side, never from the request body — and Stay
re-validates the same three fields on the read as defence in depth. An
incomplete, free-form, or out-of-set approval is refused with
`SETTLEMENT_REQUIRED` and the stay remains in house. Which of the three
may approve, and whether approval is needed at all, stays the hotel
open-balance rule (requirements section 3.1) and is not decided here.

### D4 — Fail closed on an unread folio

If Billing cannot be read (transport failure, timeout, 5xx, or an
unwired client), the close is refused with `UPSTREAM_UNAVAILABLE` (503)
naming the upstream and operation, and the stay remains in house. The
offline-first cached-config rule does not extend to a money fact: a
close never proceeds on a balance nobody verified. A Billing refusal
that carries a 4xx envelope is surfaced unchanged (a rejected session
stays `UNAUTHENTICATED`).

### D5 — Additive contract change, no schema change

`CheckOut` keeps accepting `folioBalanceMinor` and
`openBalanceApproval` for the deprecation window so the #588 desk
build keeps working, but both become optional and advisory: the server
ignores them. The error set gains `UPSTREAM_UNAVAILABLE` (503) and
`CONFLICT` (409, presented folio is not the stay's folio). That is a
minor contract bump under ADR-0004 D1 (relaxed requirement plus new
error codes; no field removed, renamed, or retyped). No schema, table,
migration, or event changes.

### D6 — The desk workflow is unchanged

The #588 panel already re-reads the folio on every route, offers the
fixed role set, and sends the fresh balance plus the recorded approval.
No desk code, copy, or design fact changes; the same request simply
stops being trusted.

## Consequences

- Stay gains its first runtime outbound dependency: `BILLING_BASE_URL`
  (default `http://billing:8087` in compose), a 5-second timeout, and
  the caller's Bearer token forwarded. No runtime cycle is created:
  Billing's C8 `GetStayRef` is specified but not called today
  (`docs/architecture/services/billing.md` section 5).
- `UPSTREAM_UNAVAILABLE` becomes a registered envelope code (it is
  already emitted by Reservations but was missing from
  `contracts/errors/envelope.json`), fixing that drift.
- The close is a two-service read plus a local conditional write. It is
  not atomic across services: a charge that lands between the read and
  the flip can still be missed by the gate (residual risk R5 in
  `docs/technical/security-threat-model.md` section 8). The window is
  one close on a single-desk, single-property installation, and the
  #600 review-step charge posting already narrows it.
- Guards: Stay service tests for the forged-balance, forged-approval,
  incomplete-approval, out-of-set-role, folio-mismatch, and
  Billing-unreachable callers; Billing tests for the role-set refusal
  and the server-side time stamp; the #588 desk guards
  (`AC-DSK-18`, `FR-CKO-4`, `FR-CKO-5`) stay green. The verification
  plan is in `docs/architecture/lld.md` section 21.6; the qa-lead
  traceability row is a sibling handoff.
- This ADR starts at `proposed`; only the owner flips it to
  `accepted`. The implementation PR starts only after owner acceptance
  plus a T3 `SPEC-GATE PASS` on #601.
- Rollback: revert the single implementation PR. The desk keeps the
  #588 client-side gate; the additive contract fields stay valid for
  the desk build that still sends them; no data migration exists in
  either direction.

## Out of scope

- Authorization: which of the fixed three may approve an open balance,
  and whether an approval is required at all (the section 3.1 config
  fan-out). This record only validates that a recorded approval is
  well-formed and provenanced.
- Charging policy: when and what the desk charges (BR-45 / #600 and
  the sibling charge-posting follow-up).
- Billing's approval-write policy beyond provenance validation.
- Binding the asserted `actor` to the session token (HMAC validation);
  recorded as residual risk R6.
- Desk panel changes (#588, merged).

## Options considered

### Option A — Keep trusting the client (status quo)

- Upside: no change, no new dependency.
- Downside: a desk-bypassing caller closes an unpaid stay with an
  arbitrary approval. Rejected: this is the finding.

### Option B — Move the gate into Billing (`RequestCheckoutGate`)

- Upside: one authority for the folio decision.
- Downside: Billing would need the stay state and would decide the
  close, duplicating the transition Stay owns; it revives a deferred
  operation and adds a Billing -> Stay read on the money path, which is
  a cycle with the existing C8 contract. Rejected.

### Option C — Stay re-reads and re-validates (chosen)

- Upside: the enforcement point stays where the state transition is;
  reuses `GetFolioBalance` and the Reservations -> Rates fail-closed
  pattern; no new operation, no schema change.
- Downside: one extra synchronous read per close and a non-atomic
  read-then-flip window (R5).

### Option D — Event-driven reconciliation

- Upside: no synchronous dependency.
- Downside: a reconciliation after the fact is not a gate; the stay is
  already closed. Rejected.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-919
