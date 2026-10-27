---
name: Go module
description: Sanctioned workflow for the Go services (Reservations, Rates, Reporting) — build/test/run/lint commands, module layout, conventions, contract-check usage, and guard-writing guide. Use when implementing, testing, or reviewing a change in services/reservations, services/rates, or services/reporting.
trigger: "Working in a Go module (reservations, rates, reporting): read this skill first — commands, layout, conventions, contract checks, guard guide."
---

# Go module workflow (Reservations, Rates, Reporting)

Applies to `services/reservations`, `services/rates`, and
`services/reporting` (LLD [section 9](../../../docs/architecture/lld.md); ADR-0001 primary mapping). The worker
skill points here as the per-stack entry point; this skill covers only
what a Go-module change needs.

Source of truth for behaviour: `docs/architecture/lld.md` ([sections 0, 1, 4,
7](../../../docs/architecture/lld.md)), `docs/technical/integration.md`, `docs/technical/schema.md`,
`docs/technical/error-handling.md`. This skill adds no behaviour.

## Modules on this stack

| Module | Provides | Consumes | Guards |
|---|---|---|---|
| Reservations (LLD [section 1](../../../docs/architecture/lld.md)) | `ReservationService` (create/modify/cancel/no-show/calendar) | Pricing `CheckSellableCount`/`CheckRestrictions`/`QuotePrice`, Rooms `CheckRoomTypeSellability`, Guests `IdentifyGuest`/`GetBookingContext` | Overbooking guard in the create/modify transaction (`NFR-CON-1`) |
| Rates (LLD [section 4](../../../docs/architecture/lld.md)) | `PricingService` (counts, restrictions, quotes, plan setup) | Cached inventory inputs + live calls; authoritative guard stays in Reservations | Quoted basis frozen at booking (BR-13) |
| Reporting (LLD [section 7](../../../docs/architecture/lld.md)) | Read API (occupancy, revenue, daily sheet, housekeeping) over its own read model | All event families, idempotent apply by event id | Consumer offsets per subscription; as-of timestamp on every report |

## Commands (run from the module directory, e.g. `services/reservations`)

- Build: `go build ./...`
- Test: `go test ./...`
- Vet: `go vet ./...`
- Format check: `gofmt -l .` (empty output means clean)
- Migrate: `migrate -path migrations -database "$DATABASE_URL" up` (golang-migrate; down files are local-dev only)
- Run: `go run ./cmd/server` (config via environment; values from `AdminService.GetHotelConfig` with cached offline-first fallback)

Each module ships a `Dockerfile` and a README repeating these
commands (LLD [section 9](../../../docs/architecture/lld.md)).

## Layout

```text
services/<module>/
  cmd/server/        process entry point (reads config, wires store, serves HTTP)
  internal/
    handler/         HTTP adapters: POST /v1/<contract>/<Operation>, token check, envelope errors
    service/         operation logic: config load, outbound calls, guard, store write
    store/           SQL for this schema only — never another module's tables
    outbox/          same-transaction event writer + dispatcher relay hooks
    auth/            local token validation (HMAC signature + expiry, bounded revalidation)
  migrations/        this schema's chain only: versioned up/down SQL pairs (schema.md section 9)
  contract-tests/    fixtures per provided/consumed operation, incl. refusal branches
  Dockerfile
  README             build/test/run commands
```

## Conventions (LLD [section 0](../../../docs/architecture/lld.md), binding on every module)

- Transport: synchronous calls are HTTP/JSON POST behind Nginx at
  `/v1/<contract-lowercase>/<Operation>` with a JSON body; the opaque
  session token travels in the `Authorization` header.
- Identity: validate the token locally (HMAC signature + expiry);
  re-check revocation with Admin at least every 5 minutes and always
  on sensitive operations. Idle sessions end after 15 minutes;
  identities lock after 5 consecutive wrong secrets.
- Errors: the shared envelope (`code`, `message`, `details`,
  `traceId`); session problems use `UNAUTHENTICATED`; capacity races
  use `CONFLICT`; blocked/illegal states use `STATE_ILLEGAL`; open
  balance without approval uses `SETTLEMENT_REQUIRED`.
- Data: `timestamptz` timestamps; money as BIGINT minor units (never
  float); every business row carries `created_by/created_at/
  updated_by/updated_at`; provider operations taking an
  `idempotencyKey` persist it UNIQUE and return the original result
  on repeat.
- Outbox: every state change other modules must see is written
  atomically with the change into the schema's `outbox` table; a
  dispatcher relays rows. No cross-schema reads, ever.
- Config: read section 3.1 values at startup via `GetHotelConfig`, apply
  `ConfigChangedEvents` idempotently by event id afterwards, serve
  cached values when Admin is unreachable.

## Contract-check usage

- Consumer fixtures: `contract-tests/` holds request/response pairs
  plus refusal cases generated from `contracts/` for every operation
  this module provides or consumes (integration.md [section 9](../../../docs/technical/integration.md)), including the
  `CONFLICT` refusal branches and the paired-concurrency guards run
  against the real store (`NFR-CON-1`).
- Event checks: every emitted event validates against
  `contracts/events/` JSON Schemas; Reporting tests duplicate
  delivery (idempotent apply) and per-aggregate ordering.
- Run the repo gate from the repo root before opening the PR:
  `script/contract-check.sh`. It fails on unparseable schemas,
  fixtures referencing unknown operations, and breaking
  `contracts/` changes without a major bump + deprecation note.
- Versioning: additive changes bump minor (backward compatible);
  removals, renames, type changes, and new required fields are major
  with a deprecation window of at least one release (integration.md
  section 8).

## Guard-writing guide (this stack)

The Reservations overbooking guard (LLD [section 1](../../../docs/architecture/lld.md), `NFR-CON-1`): the
create/modify transaction counts overlapping `confirmed` and
`checked-in` rows for the type/dates (checked-in rows cover the
in-house share, so the guard never reads another store) and inserts
only if capacity remains. Schematic shape, not production code:

```go
tx := db.Begin()
var booked int
tx.QueryRow(`SELECT count(*) FROM reservations
  WHERE room_type_id = $1 AND state IN ('confirmed','checked-in')
    AND arrival_date < $3 AND departure_date > $2`,
  roomType, arrival, departure).Scan(&booked)
if booked >= sellable {
    tx.Rollback()
    return Error{Code: "CONFLICT", Message: "no sellable unit for type+dates"}
}
tx.Exec(`INSERT INTO reservations (...) VALUES (...)`)
tx.Exec(`INSERT INTO outbox (aggregate, event_type, payload, occurred_at)
  VALUES (...)`)
tx.Commit()
```

Reporting consumers: upsert read-model rows keyed by event id and
advance `consumer_offsets` in the same transaction, so replays and
restarts converge without duplicates (LLD [section 7](../../../docs/architecture/lld.md)).

## How to add an endpoint + guard

1. Confirm the operation exists in `docs/architecture/lld.md` and its
   pair binding in `docs/technical/integration.md`; if the FRs leave
   it undecided, stop and route back through the owning spec role.
2. Add the `contracts/http/` shape (request/response, errors) with a
   minor version bump, or note the reuse of an existing version.
3. Add the handler route (`POST /v1/<contract>/<Operation>`) with
   token + role validation and envelope error mapping.
4. Implement the service step order from the LLD data flow (validate
   -> config -> outbound calls -> guarded atomic write -> outbox in
   the same transaction -> response).
5. Put the guard in the store transaction (count-then-insert for
   Reservations; read-model upsert + offset advance for Reporting).
6. Add `migrations/` SQL only if the schema changes (one schema per
   migration; header names the FR trace; forward-only in
   production).
7. Add `contract-tests/` fixtures: happy path plus every refusal
   branch the LLD error mapping names.
8. Run `go build ./...`, `go vet ./...`, `gofmt -l .`,
   `go test ./...`, the module migrations against a scratch
   database, and `script/contract-check.sh` from the repo root.
