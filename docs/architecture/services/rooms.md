# Rooms — as-built design

Status: active. Source page for the rooms module (single source of truth; `services/rooms/README.md` is a thin stub pointing here). Owned by `architect` (Closes #181).

## 1. Purpose

Inventory, housekeeping states, out-of-order blocks, room and room-type setup. Room states move `ready` ↔ `occupied`, with `dirty`/`cleaning` turnover and date-ranged out-of-order blocks in between.

Links: `docs/architecture/lld.md` section 3; `docs/requirements/sequence-diagrams.md` sections 8 (room move), 12 (housekeeping cleaning loop), 13 (out-of-order block and release); lifecycle states in `docs/architecture/state-machine.md`.

## 2. Pattern and layers as-built

Node.js/TypeScript flat `src/` files over raw `node:http`, wired in `services/rooms/src/index.ts` — same shape as Stay.

| Layer | Files | Responsibility |
|---|---|---|
| Transport + routing | `src/server.ts` | `createServiceServer` answers `GET /healthz` (:67), enforces Bearer presence (:80), routes `POST /v1/rooms/<Operation>` by case label |
| Identity | `src/auth.ts` | `extractBearer`: Bearer presence check, same skeleton contract as Stay |
| Validation + step order | `src/store.ts` (`RoomStore`, `RoomStoreAPI` at :166) | per-operation checks, sellability math, guarded assign/release/block transitions |
| Row storage | `src/store.ts` (in-memory), `src/pgstore.ts` (`PostgresRoomStore implements RoomStoreAPI` at :35) | identical semantics; Postgres selected at boot when `DATABASE_URL` is set |
| Errors | `src/errors.ts` | shared `HttpError` envelope (same code set as Stay) |
| Boot | `src/index.ts` | store selection by `DATABASE_URL`, `listen(PORT)` (default `8085`) |

The operation table (`src/server.ts:86-139`): `UpsertRoomType` (:86), `UpsertRoom` (:97), `UpdateRoomState` (:107), `ListRoomsByState` (:111), `CheckRoomTypeSellability` (:123), `AssignRoom` (:127), `ReleaseRoom` (:131), `BlockRoom` (:135), `ReleaseBlock` (:139).

## 3. Happy-path flowchart

AssignRoom (`POST /v1/rooms/AssignRoom`) — the desk's in-house placement:

```mermaid
flowchart TD
    A[Bearer token present] --> B[Read JSON body]
    B --> C[Room exists]
    C --> D[Room free for dates]
    D --> E[Mark occupied + stay link]
    E --> F[200 roomNumber stayLink]
```

Edge trace (every edge cites code):

- A–B: same transport contract as Stay (`src/server.ts:67-80`; body read per-operation from :86).
- C: unknown room key → `NOT_FOUND` (`src/store.ts:201-211`).
- D: block overlap for the dates → `STATE_ILLEGAL` (:320, :374); non-ready room → `STATE_ILLEGAL` (:385); a simultaneous last-room race refuses the loser with `CONFLICT` "was just taken" (:382).
- E: state flips to `occupied` with the stay link kept (`src/store.ts:358-399`); F: `roomNumber`, `stayLink`, `state` returned to the desk, which pairs it with Stay `MoveRoom`.

## 4. Failure/rollback flowchart

Release and block guards — the desk's turnover and out-of-order paths:

```mermaid
flowchart TD
    P[ReleaseRoom] --> Q[Room occupied?]
    Q -->|no| R422a[422 STATE_ILLEGAL, no change]
    Q -->|yes| S[Release to target state]
    T[BlockRoom] --> U[Room free, no identical block?]
    U -->|occupied| R422b[422 STATE_ILLEGAL, no change]
    U -->|duplicate| R400[400 VALIDATION_FAILED, no change]
    U -->|yes| V[Block recorded for range]
```

Edge trace:

- Q: releasing a non-occupied room → `STATE_ILLEGAL` (`src/store.ts:408`); releasing onto an occupied target state is refused (`src/store.ts:418`).
- U: blocking an occupied room → `STATE_ILLEGAL` (`src/store.ts:436`); an identical block already exists → `VALIDATION_FAILED` (:445).
- Reversed ranges are refused up front: `dateTo` before `dateFrom` → `VALIDATION_FAILED` (`src/store.ts:312,433,472`); unknown state values → `VALIDATION_FAILED` (:268, :295).

Rollback: none — each transition is a single guarded in-memory step; refusals precede mutation, and the desk drives multi-step moves (assign/release pairs) rather than the module compensating.

## 5. Outbound dependencies

None at runtime. Consumed by the desk loop (Stay `MoveRoom` pairs Rooms `AssignRoom`/`ReleaseRoom`) and by the future Reservations restriction seam via `CheckRoomTypeSellability` (`src/store.ts:300`). Hotel values come from `AdminService.GetHotelConfig` with a cached offline-first fallback (LLD section 0).

## 6. Error mapping

Same shared Node envelope as Stay (`src/errors.ts`; `docs/technical/error-handling.md` section 1). Codes observed in `src/store.ts`:

| Code | Status | Raised when |
|---|---|---|
| `VALIDATION_FAILED` | 400 | bad/unknown field, state, date range, duplicate block (:88, :95, :268, :295, :312, :433, :445, :472) |
| `NOT_FOUND` | 404 | unknown room type or room (:201, :210) |
| `CONFLICT` | 409 | room just taken in a race (:382) |
| `STATE_ILLEGAL` | 422 | blocked dates, wrong room state, occupied block target (:320, :374, :385, :408, :418, :436) |
| `UNAUTHENTICATED` | 401 | missing session token (`src/server.ts:80`) |

## 7. Operations

Run from `services/rooms`. Requires Node.js 22+. Build and test:

```sh
npm ci
npm run build
npm test
```

Lint:

```sh
npm run lint
```

Migrate (node-pg-migrate, SQL-first, forward-only in production):

```sh
npm run migrate -- up
```

`DATABASE_URL` must point at the module database (default `postgresql://hotel:change-me@db:5432/hotel` in compose).

Run — production build:

```sh
npm start
```

Local watch (type-checks, runs, and restarts TypeScript directly):

```sh
npm run dev
```

Configuration via environment: `PORT` (default `8085`); hotel values come from `AdminService.GetHotelConfig` with a cached offline-first fallback (see LLD section 0) and land in later slices.

Docker:

```sh
docker build -t hotel-rooms .
```

Contract tests: `contract-tests/` holds fixtures per provided/consumed operation once the first slice lands (see `contract-tests/README.md`). Run the repo gate from the repo root before opening a PR:

```sh
script/contract-check.sh
```

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-249
