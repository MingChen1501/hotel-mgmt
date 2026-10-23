---
name: Go module
description: Sanctioned workflow for Go services — build/test/run/lint commands, module layout, conventions, contract-check usage, and guard-writing guide. Use when implementing, testing, or reviewing a change in a Go service of {{PROJECT_NAME}}.
trigger: "Working in a Go module: read this skill first — commands, layout, conventions, contract checks, guard guide."
---

# Go module workflow ({{PROJECT_NAME}})

Applies to every Go service in this project (see your project's
module-to-stack mapping). The worker skill points here as the
per-stack entry point; this skill covers only what a Go-module
change needs.

Source of truth for behaviour: your project's LLD (per-module
responsibilities, interfaces, data flows, error mapping), contract
catalog, schema doc, and error-handling doc. This skill adds no
behaviour.

## Commands (run from the module directory, e.g. `services/<module>`)

- Build: `go build ./...`
- Test: `go test ./...`
- Vet: `go vet ./...`
- Format check: `gofmt -l .` (empty output means clean)
- Migrate: `migrate -path migrations -database "$DATABASE_URL" up` (golang-migrate; down files are local-dev only)
- Run: `go run ./cmd/server`

Each module ships a `Dockerfile` and a README repeating these
commands.

## Layout

```text
services/<module>/
  cmd/server/        process entry point (reads config, wires store, serves HTTP)
  internal/
    handler/         HTTP adapters: routes, auth check, envelope errors
    service/         operation logic: config load, outbound calls, guard, store write
    store/           SQL for this schema only — never another module's tables
    outbox/          same-transaction event writer + dispatcher relay hooks
    auth/            local token/session validation with bounded revalidation
  migrations/        this schema's chain only: versioned up/down SQL pairs
  contract-tests/    fixtures per provided/consumed operation, incl. refusal branches
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
  this module provides or consumes, including the refusal branches
  and any concurrency guards run against the real store.
- Event checks: every emitted event validates against
  `contracts/events/` JSON Schemas; consumers test idempotent apply
  (duplicate delivery) and ordering per aggregate.
- Run the repo gate from the repo root before opening the PR:
  `script/contract-check.sh`.
- Versioning: additive changes bump minor (backward compatible);
  removals, renames, type changes, and new required fields are major
  with a deprecation window of at least one release.

## Guard-writing guide (this stack)

Capacity and exactly-one-winner guards belong in the store
transaction: count the conflicting rows and insert (or update) only
if capacity remains, writing the outbox event in the same
transaction. Schematic shape, not production code:

```go
tx := db.Begin()
var taken int
tx.QueryRow(`SELECT count(*) FROM bookings
  WHERE unit_id = $1 AND state IN ('confirmed','active')
    AND from_date < $3 AND to_date > $2`,
  unit, from, to).Scan(&taken)
if taken >= capacity {
    tx.Rollback()
    return Error{Code: "CONFLICT", Message: "no capacity for unit+dates"}
}
tx.Exec(`INSERT INTO bookings (...) VALUES (...)`)
tx.Exec(`INSERT INTO outbox (aggregate, event_type, payload, occurred_at)
  VALUES (...)`)
tx.Commit()
```

Event consumers: upsert read-model rows keyed by event id and
advance the consumer offset in the same transaction, so replays and
restarts converge without duplicates.

## How to add an endpoint + guard

1. Confirm the operation exists in the LLD and its pair binding in
   the contract catalog; if the requirements leave it undecided,
   stop and route back through the owning spec role.
2. Add the `contracts/http/` shape (request/response, errors) with a
   minor version bump, or note the reuse of an existing version.
3. Add the handler route with auth validation and envelope error mapping.
4. Implement the service step order from the LLD data flow (validate
   -> config -> outbound calls -> guarded atomic write -> outbox in
   the same transaction -> response).
5. Put the guard in the store transaction (count-then-write; offset
   advance for consumers).
6. Add `migrations/` SQL only if the schema changes (one schema per
   migration; header names the requirements trace; forward-only in
   production).
7. Add `contract-tests/` fixtures: happy path plus every refusal
   branch the error mapping names.
8. Run `go build ./...`, `go vet ./...`, `gofmt -l .`,
   `go test ./...`, the module migrations against a scratch
   database, and `script/contract-check.sh` from the repo root.
