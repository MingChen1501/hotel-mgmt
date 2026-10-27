---
name: Node module
description: Sanctioned workflow for the Node.js/TypeScript services (Stay, Rooms, Guests, Admin) — build/test/run/lint commands, module layout, conventions, contract-check usage, and guard-writing guide. Use when implementing, testing, or reviewing a change in services/stay, services/rooms, services/guests, or services/admin.
trigger: "Working in a Node.js module (stay, rooms, guests, admin): read this skill first — commands, layout, conventions, contract checks, guard guide."
---

# Node module workflow (Stay, Rooms, Guests, Admin)

Applies to `services/stay`, `services/rooms`, `services/guests`,
and `services/admin` (LLD [section 9](../../../docs/architecture/lld.md); ADR-0001 primary mapping). The worker
skill points here as the per-stack entry point; this skill covers
only what a Node-module change needs.

Source of truth for behaviour: `docs/architecture/lld.md` ([sections 0, 2, 3,
5, 8](../../../docs/architecture/lld.md)), `docs/technical/integration.md`, `docs/technical/schema.md`,
`docs/technical/error-handling.md`. This skill adds no behaviour.

## Modules on this stack

| Module | Provides | Consumes | Guards |
|---|---|---|---|
| Stay (LLD [section 2](../../../docs/architecture/lld.md)) | `StayService` (check-in/out, moves, actual times, arrivals/departures) | RES `GetDueReservation`, Rooms find/assign/release, Guests `GetGuest`, Billing `GetFolioBalance`/`RequestCheckoutGate` | Folio gate before check-out (`SETTLEMENT_REQUIRED`, BR-17) |
| Rooms (LLD [section 3](../../../docs/architecture/lld.md)) | `RoomInventoryService` (sellability, find/assign/release, states, blocks, setup) | — (provider-side atomic guard) | `AssignRoom` conditional atomic write (`NFR-CON-2`); dirty -> clean -> inspected order (BR-28) |
| Guests (LLD [section 5](../../../docs/architecture/lld.md)) | `GuestService` (identify, booking context, upsert, confirmation) | Stay lifecycle links via `StayEvents` | Hotel-mandatory fields from cached config (`FR-CUS-1`) |
| Admin (LLD [section 8](../../../docs/architecture/lld.md)) | `AdminService` (config, users/roles, identity, export/backup) | Export slices from RES, STAY, BIL, GST, ROOM, RATE | 5-strike lockout, 15-minute idle expiry, role checks |

## Commands (run from the module directory, e.g. `services/stay`)

- Install: `npm ci`
- Build: `npm run build`
- Test: `npm test`
- Lint: `npm run lint`
- Migrate: `npm run migrate up` (node-pg-migrate, SQL-first, integer versions; down migrations are local-dev only)
- Run: `npm start` (production build) or `npm run dev` (local watch)

Each module ships a `Dockerfile` and a README repeating these
commands (LLD [section 9](../../../docs/architecture/lld.md)).

## Layout

```text
services/<module>/
  src/
    routes/          HTTP adapters: POST /v1/<contract>/<Operation>, token check, envelope errors
    services/        operation logic: config load, outbound calls, guard, store write
    stores/          SQL for this schema only — never another module's tables
    outbox/          same-transaction event writer + dispatcher relay hooks
    auth/            local token validation (HMAC signature + expiry, bounded revalidation)
  migrations/        this schema's chain only (schema.md section 9)
  contract-tests/    fixtures per provided/consumed operation, incl. refusal branches
  package.json       scripts: build, test, lint, migrate, start, dev
  Dockerfile
  README             build/test/run commands
```

## Conventions (LLD [section 0](../../../docs/architecture/lld.md), binding on every module)

- Transport: synchronous calls are HTTP/JSON POST behind Nginx at
  `/v1/<contract-lowercase>/<Operation>` with a JSON body; the opaque
  session token travels in the `Authorization` header.
- Identity: validate the token locally (HMAC signature + expiry);
  re-check revocation with Admin at least every 5 minutes and always
  on sensitive operations (user/role changes, open-balance
  approvals, day-close). Idle sessions end after 15 minutes;
  identities lock after 5 consecutive wrong secrets.
- Errors: the shared envelope (`code`, `message`, `details`,
  `traceId`); session problems use `UNAUTHENTICATED`; out-of-role
  uses `FORBIDDEN`; room races use `CONFLICT`; illegal housekeeping
  transitions use `STATE_ILLEGAL`; open balance without approval
  uses `SETTLEMENT_REQUIRED`.
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
  this module provides or consumes (integration.md [section 9](../../../docs/technical/integration.md)), including
  the `CONFLICT`/`STATE_ILLEGAL` room branches and the
  `SETTLEMENT_REQUIRED` folio-gate branch, with the
  paired-concurrency guard exercised against the real store
  (`NFR-CON-2`).
- Event checks: every emitted event validates against
  `contracts/events/` JSON Schemas; consumers test idempotent apply
  (duplicate delivery) and ordering per aggregate.
- Run the repo gate from the repo root before opening the PR:
  `script/contract-check.sh`. It fails on unparseable schemas,
  fixtures referencing unknown operations, and breaking
  `contracts/` changes without a major bump + deprecation note.
- Versioning: additive changes bump minor (backward compatible);
  removals, renames, type changes, and new required fields are major
  with a deprecation window of at least one release (integration.md
  section 8).

## Guard-writing guide (this stack)

The `AssignRoom` guard (LLD [section 3](../../../docs/architecture/lld.md), `NFR-CON-2`) is a single conditional
atomic write: the room row flips to occupied only if it is currently
vacant-inspected and no block covers the date. Zero rows affected
means the race was lost. Schematic shape, not production code:

```ts
const res = await db.query(
  `UPDATE rooms SET state = 'occupied',
     updated_by = $4, updated_at = now()
   WHERE id = $1 AND state = 'vacant-inspected'
     AND NOT EXISTS (SELECT 1 FROM room_blocks
       WHERE room_id = $1 AND date_from <= $2 AND date_to >= $2)`,
  [roomId, businessDate, stayLink, actor],
);
if (res.rowCount === 0) {
  const cur = await db.query(`SELECT state FROM rooms WHERE id = $1`, [roomId]);
  throw cur.rows[0]?.state === 'vacant-inspected'
    ? new HttpError('CONFLICT', `room ${roomNumber} just taken`)
    : new HttpError('STATE_ILLEGAL', `room ${roomNumber} is ${cur.rows[0]?.state}`);
}
// same transaction: history row + outbox event, then commit
```

Housekeeping transitions enforce dirty -> clean -> inspected in
module logic with a transition check (BR-28); the check-out path
calls the folio gate first and refuses with `SETTLEMENT_REQUIRED`
unless settled or an authorised approval is recorded (BR-17).

## How to add an endpoint + guard

1. Confirm the operation exists in `docs/architecture/lld.md` and its
   pair binding in `docs/technical/integration.md`; if the FRs leave
   it undecided, stop and route back through the owning spec role.
2. Add the `contracts/http/` shape (request/response, errors) with a
   minor version bump, or note the reuse of an existing version.
3. Add the route (`POST /v1/<contract>/<Operation>`) with token +
   role validation and envelope error mapping.
4. Implement the service step order from the LLD data flow (validate
   -> config -> outbound calls -> guarded atomic write -> outbox in
   the same transaction -> response).
5. Put the guard in the store write (conditional update for room
   assignment; gate call before check-out; transition check for
   state changes).
6. Add `migrations/` SQL only if the schema changes (one schema per
   migration; header names the FR trace; forward-only in
   production).
7. Add `contract-tests/` fixtures: happy path plus every refusal
   branch the LLD error mapping names.
8. Run `npm run build`, `npm run lint`, `npm test`, the module
   migrations against a scratch database, and
   `script/contract-check.sh` from the repo root.
