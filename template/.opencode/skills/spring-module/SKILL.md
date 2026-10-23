---
name: Spring module
description: Sanctioned workflow for Spring Boot services — build/test/run commands, module layout, conventions, contract-check usage, and guard-writing guide. Use when implementing, testing, or reviewing a change in a Spring Boot service of {{PROJECT_NAME}}.
trigger: "Working in a Spring Boot module: read this skill first — commands, layout, conventions, contract checks, guard guide."
---

# Spring module workflow ({{PROJECT_NAME}})

Applies to every Spring Boot service in this project (see your
project's module-to-stack mapping). The worker skill points here as
the per-stack entry point; this skill covers only what a
Spring-module change needs.

Source of truth for behaviour: your project's LLD (per-module
responsibilities, interfaces, data flows, error mapping), contract
catalog, schema doc, and error-handling doc. This skill adds no
behaviour.

## Commands (run from the module directory, e.g. `services/<module>`)

- Package: `mvn package` (use `./mvnw package` when the wrapper is present)
- Test: `mvn test`
- Full verify: `mvn verify` (unit + contract tests before packaging)
- Migrate: Flyway runs versioned `V<n>__` SQL from
  `src/main/resources/db/migration` automatically at startup
  (forward-only in production; ad-hoc runs via `mvn
  flyway:migrate` against a scratch database only)
- Run: `mvn spring-boot:run` (local) or `java -jar
  target/<module>-*.jar` (packaged)

Each module ships a `Dockerfile` and a README repeating these
commands.

## Layout

```text
services/<module>/
  src/main/java/.../
    web/             HTTP adapters: routes, auth check, envelope errors
    service/         operation logic: config load, outbound calls, guarded write
    repo/            SQL/JPA for this schema only — never another module's tables
    outbox/          same-transaction event writer + dispatcher relay hooks
    auth/            local token/session validation with bounded revalidation
  src/main/resources/db/migration/   Flyway chain: V<n>__*.sql
  src/test/          unit tests
  contract-tests/    fixtures per provided/consumed operation, incl. refusal branches
  pom.xml
  Dockerfile
  README             build/test/run commands
```

## Conventions (binding on every module)

- Transport: synchronous calls are HTTP/JSON POST behind the gateway
  at the documented base path with a JSON body; the session token
  travels in the `Authorization` header.
- Identity: validate the token locally where the design allows, with
  bounded revalidation against the identity provider; enforce idle
  expiry and lockout per the security spec.
- Errors: the shared envelope (`code`, `message`, `details`,
  `traceId`); use the catalogued codes from the error-handling doc,
  never ad-hoc strings.
- Data: timezone-aware timestamps; money as integer minor units in
  storage with exact decimal (`BigDecimal`) arithmetic in memory —
  never floating point; every business row carries audit columns
  (actor + timestamp); operations taking an idempotency key persist
  it UNIQUE and return the original result on repeat.
- Outbox: every state change other modules must see is written
  atomically with the change into the schema's `outbox` table; a
  dispatcher relays rows. No cross-schema reads, ever.
- Config: read shared settings at startup from the config provider,
  apply change events idempotently by event id afterwards, serve
  cached values when the provider is unreachable.

## Contract-check usage

- Consumer fixtures: `contract-tests/` holds request/response pairs
  plus refusal cases generated from `contracts/` for every operation
  this module provides or consumes, including the refusal branches.
- Event checks: every emitted event validates against
  `contracts/events/` JSON Schemas; totals and derived records must
  agree with their source rows.
- Run the repo gate from the repo root before opening the PR:
  `script/contract-check.sh`.
- Versioning: additive changes bump minor (backward compatible);
  removals, renames, type changes, and new required fields are major
  with a deprecation window of at least one release.

## Guard-writing guide (this stack)

Guarded writes are a single transaction: validate auth -> read the
owning record -> resolve inputs against the configured reference
data with exact decimal arithmetic -> append the line, update the
derived total, and write the outbox event atomically. Schematic
shape, not production code:

```java
@Transactional
public LedgerLine postEntry(OwnerRef owner, LedgerItem item,
    Money amount, IdempotencyKey key) {
  OwnerRecord ref = ownerService.getOwnerRef(owner); // owning record must be open
  LedgerItem defined = ledgerItems.resolve(item);    // else VALIDATION_FAILED naming item
  Money derived = rules.derive(defined, amount);     // BigDecimal, never double
  if (!idempotencyKeys.insertIfAbsent(key)) {
    return ledgerLines.findByKey(key);               // repeat returns the original line
  }
  LedgerLine line = ledgerLines.append(ref.ledgerId(), defined, amount, derived);
  ledgers.addToTotal(ref.ledgerId(), amount.plus(derived));
  outbox.write(ref.ledgerId(), "LedgerEvents.entry-posted", line);
  return line;                                       // commit covers line + total + outbox
}
```

Presentations (invoices, receipts, reports) render stored rows and
are never stored rows themselves.

## How to add an endpoint + guard

1. Confirm the operation exists in the LLD and its pair binding in
   the contract catalog; if the requirements leave it undecided,
   stop and route back through the owning spec role.
2. Add the `contracts/http/` shape (request/response, errors) with a
   minor version bump, or note the reuse of an existing version.
3. Add the web adapter with auth validation and envelope error mapping.
4. Implement the service step order from the LLD data flow (validate
   -> owning-record read -> reference-data resolution -> guarded
   atomic write with outbox -> response).
5. Keep money exact (`BigDecimal` in memory, minor units persisted)
   and the write in one transaction with the total update and the
   outbox row.
6. Add Flyway `V<n>__` SQL only if the schema changes (one schema
   per migration; header names the requirements trace; forward-only
   in production).
7. Add `contract-tests/` fixtures: happy path plus every refusal
   branch the error mapping names.
8. Run `mvn verify`, the Flyway chain against a scratch database,
   and `script/contract-check.sh` from the repo root.
