---
name: Spring module
description: Sanctioned workflow for the Spring Boot service (Billing) — build/test/run commands, module layout, conventions, contract-check usage, and guard-writing guide. Use when implementing, testing, or reviewing a change in services/billing.
trigger: "Working in the Spring Boot module (billing): read this skill first — commands, layout, conventions, contract checks, guard guide."
---

# Spring module workflow (Billing)

Applies to `services/billing`, the one Spring-context service in the
budget (LLD [section 6](../../../docs/architecture/lld.md); ADR-0001 primary mapping). The worker skill points
here as the per-stack entry point; this skill covers only what a
Billing change needs.

Source of truth for behaviour: `docs/architecture/lld.md` ([sections 0, 6](../../../docs/architecture/lld.md)),
`docs/technical/integration.md` ([sections 3–4](../../../docs/technical/integration.md)), `docs/technical/schema.md`
(section 6), `docs/technical/error-handling.md`. This skill adds no
behaviour.

## Module on this stack

Billing provides `BillingService`: folio balance reads, the checkout
gate (`GetFolioBalance`, `RequestCheckoutGate`), charges and payments
(`PostCharge`, `RecordPayment`), invoice/receipt production, and
day-close (`RunDayClose`). It consumes `StayService.GetStayRef` so
every line matches its stay exactly, and opens exactly one folio per
stay driven by `StayEvents.checked-in` (BR-21). Fixed-until-decided:
payment methods are cash/card only (OQ-1); day-close runs without a
sign-off step (OQ-3).

## Commands (run from `services/billing`)

- Package: `mvn package` (use `./mvnw package` when the wrapper is present)
- Test: `mvn test`
- Full verify: `mvn verify` (unit + contract tests before packaging)
- Migrate: Flyway runs versioned `V<n>__` SQL from
  `src/main/resources/db/migration` automatically at startup
  (forward-only in production; ad-hoc runs via `mvn
  flyway:migrate` against a scratch database only)
- Run: `mvn spring-boot:run` (local) or `java -jar
  target/billing-*.jar` (packaged)

The module ships a `Dockerfile` and a README repeating these
commands (LLD [section 9](../../../docs/architecture/lld.md)).

## Layout

```text
services/billing/
  src/main/java/.../
    web/             HTTP adapters: POST /v1/<contract>/<Operation>, token check, envelope errors
    service/         operation logic: config load, GetStayRef call, item/tax resolution, guarded write
    repo/            SQL/JPA for the billing schema only — never another module's tables
    outbox/          same-transaction event writer + dispatcher relay hooks
    auth/            local token validation (HMAC signature + expiry, bounded revalidation)
  src/main/resources/db/migration/   Flyway chain: V<n>__*.sql (schema.md section 9)
  src/test/          unit tests (exact-decimal arithmetic, gate branches, day-close totals)
  contract-tests/    fixtures per provided/consumed operation, incl. refusal branches
  pom.xml
  Dockerfile
  README             build/test/run commands
```

## Conventions (LLD [section 0](../../../docs/architecture/lld.md), binding on every module)

- Transport: synchronous calls are HTTP/JSON POST behind Nginx at
  `/v1/<contract-lowercase>/<Operation>` with a JSON body; the opaque
  session token travels in the `Authorization` header.
- Identity: validate the token locally (HMAC signature + expiry);
  re-check revocation with Admin at least every 5 minutes and always
  on sensitive operations (open-balance approvals, day-close).
- Errors: the shared envelope (`code`, `message`, `details`,
  `traceId`); session problems use `UNAUTHENTICATED`; undefined
  charge items and non cash/card methods use `VALIDATION_FAILED`
  naming the item; open balance without approval uses
  `SETTLEMENT_REQUIRED`.
- Data: `timestamptz` timestamps; money as BIGINT minor units in
  storage with exact decimal (`BigDecimal`) arithmetic in memory —
  never floating point; every business row carries
  `created_by/created_at/updated_by/updated_at`; charge/payment
  operations persist their `idempotencyKey` UNIQUE and return the
  original result on repeat.
- Outbox: every posted charge/payment and every day-close run is
  written atomically with the change into the schema's `outbox`
  table; a dispatcher relays rows. No cross-schema reads, ever.
- Config: read section 3.1 values at startup via `GetHotelConfig` (charge
  items `FR-CUS-3`, tax/fee rules `FR-BIL-5`, approval rule
  `FR-BIL-7`), apply `ConfigChangedEvents` idempotently by event id
  afterwards, serve cached values when Admin is unreachable.

## Contract-check usage

- Consumer fixtures: `contract-tests/` holds request/response pairs
  plus refusal cases generated from `contracts/` for every operation
  Billing provides or consumes (integration.md [sections 3–4](../../../docs/technical/integration.md)), including the
  `SETTLEMENT_REQUIRED` gate branch, the undefined-item
  `VALIDATION_FAILED` branch, and the `GetStayRef` read contract.
- Event checks: every emitted `FolioEvents` payload validates
  against `contracts/events/` JSON Schemas; day-close totals must
  agree with the folio lines of the date (BR-26).
- Run the repo gate from the repo root before opening the PR:
  `script/contract-check.sh`. It fails on unparseable schemas,
  fixtures referencing unknown operations, and breaking
  `contracts/` changes without a major bump + deprecation note.
- Versioning: additive changes bump minor (backward compatible);
  removals, renames, type changes, and new required fields are major
  with a deprecation window of at least one release (integration.md
  section 8).

## Guard-writing guide (this stack)

The `PostCharge` guard (LLD [section 6](../../../docs/architecture/lld.md)) is a single transaction: validate
token + role -> `GetStayRef` (stay in house) -> resolve the item
against hotel charge items and tax/fee rules with exact decimal
arithmetic -> append the line, update the running balance, and write
the outbox event atomically. Schematic shape, not production code:

```java
@Transactional
public FolioLine postCharge(StayLink stay, ChargeItem item,
    Money amount, IdempotencyKey key) {
  StayRef ref = stayService.getStayRef(stay);      // stay must be in house
  ChargeItem defined = chargeItems.resolve(item);  // else VALIDATION_FAILED naming item
  Money tax = taxRules.derive(defined, amount);    // BigDecimal, never double
  if (!idempotencyKeys.insertIfAbsent(key)) {
    return folioLines.findByKey(key);              // repeat returns the original line
  }
  FolioLine line = folioLines.append(ref.folioId(), defined, amount, tax);
  folios.addToBalance(ref.folioId(), amount.plus(tax));
  outbox.write(ref.folioId(), "FolioEvents.charge-posted", line);
  return line;                                     // commit covers line + balance + outbox
}
```

Day-close aggregates posted lines per business date and must agree
with the folios (BR-26); invoices and receipts are presentations of
stored rows, never stored rows themselves.

## How to add an endpoint + guard

1. Confirm the operation exists in `docs/architecture/lld.md` and its
   pair binding in `docs/technical/integration.md`; if the FRs leave
   it undecided, stop and route back through the owning spec role.
2. Add the `contracts/http/` shape (request/response, errors) with a
   minor version bump, or note the reuse of an existing version.
3. Add the web adapter (`POST /v1/<contract>/<Operation>`) with
   token + role validation and envelope error mapping.
4. Implement the service step order from the LLD data flow (validate
   -> `GetStayRef` -> item/tax resolution -> guarded atomic write
   with outbox -> response).
5. Keep money exact (`BigDecimal` in memory, minor units persisted)
   and the charge/payment write in one transaction with the balance
   update and the outbox row.
6. Add Flyway `V<n>__` SQL only if the schema changes (billing
   schema only; header names the FR trace; forward-only in
   production).
7. Add `contract-tests/` fixtures: happy path plus every refusal
   branch the LLD error mapping names.
8. Run `mvn verify`, the Flyway chain against a scratch database,
   and `script/contract-check.sh` from the repo root.
