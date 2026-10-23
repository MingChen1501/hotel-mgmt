---
name: Node module
description: Sanctioned workflow for Node.js/TypeScript services — build/test/run/lint commands, module layout, conventions, contract-check usage, and guard-writing guide. Use when implementing, testing, or reviewing a change in a Node.js service of {{PROJECT_NAME}}.
trigger: "Working in a Node.js module: read this skill first — commands, layout, conventions, contract checks, guard guide."
---

# Node module workflow ({{PROJECT_NAME}})

Applies to every Node.js/TypeScript service in this project (see
your project's module-to-stack mapping). The worker skill points
here as the per-stack entry point; this skill covers only what a
Node-module change needs.

Source of truth for behaviour: your project's LLD (per-module
responsibilities, interfaces, data flows, error mapping), contract
catalog, schema doc, and error-handling doc. This skill adds no
behaviour.

## Commands (run from the module directory, e.g. `services/<module>`)

- Install: `npm ci`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Migrate: `npm run migrate up` (node-pg-migrate, SQL-first, integer versions; down migrations are local-dev only)
- Run: `npm start` (production build) or `npm run dev` (local watch)

Each module ships a `Dockerfile` and a README repeating these
commands.

## Layout

```text
services/<module>/
  src/
    routes/          HTTP adapters: routes, auth check, envelope errors
    services/        operation logic: config load, outbound calls, guard, store write
    stores/          SQL for this schema only — never another module's tables
    outbox/          same-transaction event writer + dispatcher relay hooks
    auth/            local token/session validation with bounded revalidation
  migrations/        this schema's chain only
  contract-tests/    fixtures per provided/consumed operation, incl. refusal branches
  package.json       scripts: build, test, lint, migrate, start, dev
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
- Data: timezone-aware timestamps; money as integer minor units
  (never float); every business row carries audit columns
  (actor + timestamp); provider operations taking an idempotency key
  persist it UNIQUE and return the original result on repeat.
- Outbox: every state change other modules must see is written
  atomically with the change into the schema's `outbox` table; a
  dispatcher relays rows. No cross-schema reads, ever.
- Config: read shared settings at startup from the config provider,
  apply change events idempotently by event id afterwards, serve
  cached values when the provider is unreachable.

## Contract-check usage

- Consumer fixtures: `contract-tests/` holds request/response pairs
  plus refusal cases generated from `contracts/` for every operation
  this module provides or consumes, including the refusal branches,
  with concurrency guards exercised against the real store.
- Event checks: every emitted event validates against
  `contracts/events/` JSON Schemas; consumers test idempotent apply
  (duplicate delivery) and ordering per aggregate.
- Run the repo gate from the repo root before opening the PR:
  `script/contract-check.sh`.
- Versioning: additive changes bump minor (backward compatible);
  removals, renames, type changes, and new required fields are major
  with a deprecation window of at least one release.

## Guard-writing guide (this stack)

Exactly-one-winner assignment is a single conditional atomic write:
the row flips state only if it is still in the expected prior state
(and any exclusion such as a block range does not apply). Zero rows
affected means the race was lost. Schematic shape, not production
code:

```ts
const res = await db.query(
  `UPDATE units SET state = 'assigned',
     updated_by = $3, updated_at = now()
   WHERE id = $1 AND state = 'ready'
     AND NOT EXISTS (SELECT 1 FROM unit_blocks
       WHERE unit_id = $1 AND from_date <= $2 AND to_date >= $2)`,
  [unitId, businessDate, actor],
);
if (res.rowCount === 0) {
  const cur = await db.query(`SELECT state FROM units WHERE id = $1`, [unitId]);
  throw cur.rows[0]?.state === 'ready'
    ? new HttpError('CONFLICT', `unit ${unitId} just taken`)
    : new HttpError('STATE_ILLEGAL', `unit ${unitId} is ${cur.rows[0]?.state}`);
}
// same transaction: history row + outbox event, then commit
```

State-machine transitions are enforced in module logic with a
transition check; gated operations call the owning service's gate
first and refuse with the catalogued settlement code unless settled
or an authorised approval is recorded.

## How to add an endpoint + guard

1. Confirm the operation exists in the LLD and its pair binding in
   the contract catalog; if the requirements leave it undecided,
   stop and route back through the owning spec role.
2. Add the `contracts/http/` shape (request/response, errors) with a
   minor version bump, or note the reuse of an existing version.
3. Add the route with auth validation and envelope error mapping.
4. Implement the service step order from the LLD data flow (validate
   -> config -> outbound calls -> guarded atomic write -> outbox in
   the same transaction -> response).
5. Put the guard in the store write (conditional update for
   assignment; gate call before gated steps; transition check for
   state changes).
6. Add `migrations/` SQL only if the schema changes (one schema per
   migration; header names the requirements trace; forward-only in
   production).
7. Add `contract-tests/` fixtures: happy path plus every refusal
   branch the error mapping names.
8. Run `npm run build`, `npm run lint`, `npm test`, the module
   migrations against a scratch database, and
   `script/contract-check.sh` from the repo root.
