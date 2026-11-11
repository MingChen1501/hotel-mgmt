# Stay — as-built design

Status: active. Source page for the stay / front-desk module (single source of truth; `services/stay/README.md` is a thin stub pointing here). Owned by `architect` (Closes #181).

## 1. Purpose

Check-in, check-out with the folio gate, room moves, early/late actual times, arrivals/departures. Stay state machine: `in-house` → `closed`.

Links: `docs/architecture/lld.md` [section 2](../lld.md); `docs/requirements/sequence-diagrams.md` [sections 7](../../requirements/sequence-diagrams.md) (check-in), 8 (room move), 9 (check-out); lifecycle states in `docs/architecture/state-machine.md`.

## 2. Pattern and layers as-built

Node.js/TypeScript flat `src/` files over raw `node:http` (no web framework), wired in `services/stay/src/index.ts`.

| Layer | Files | Responsibility |
|---|---|---|
| Transport + routing | `src/server.ts` | `createServiceServer` answers `GET /healthz`, matches `POST /v1/stay/<Operation>` by regex, enforces Bearer presence, decodes the body, maps `HttpError` to the envelope |
| Identity | `src/auth.ts` | `extractBearer`: Bearer presence check; the token travels as the audit actor fallback until HMAC validation lands |
| Validation + step order | `src/store.ts` (`StayStore`, `StayStoreAPI`) | per-operation input checks, folio gate, idempotent in-house/closed transitions, outbox events |
| Row storage | `src/store.ts` (in-memory `Map`s), `src/pgstore.ts` (`PostgresStayStore implements StayStoreAPI`) | identical semantics; Postgres selected at boot when `DATABASE_URL` is set |
| Errors | `src/errors.ts` | `HttpError` code→status map, `errorEnvelope` |
| Boot | `src/index.ts` | store selection by `DATABASE_URL`, `listen(PORT)` |

The operation table (`src/server.ts:116-171`): `CheckIn` (:116), `GetStay` (:121), `QueryStays` (:126), `CheckOut` (:131), `MoveRoom` (:136), `RecordActualTimes` (:144), `GetStayRef` (:149), `ListArrivalsDepartures` (:154); unknown operations return `NOT_FOUND` (:164-171).

## 3. Happy-path flowchart

CheckIn (`POST /v1/stay/CheckIn`):

```mermaid
flowchart TD
    A[Bearer token present] --> B[Read JSON body]
    B --> C[Validate stay reservation guest room actor]
    C --> D[No existing stay for reservation]
    D --> E[Persist in-house + checked-in event]
    E --> F[200 stayId]
```

Edge trace (every edge cites code):

- A: `extractBearer` absent → `UNAUTHENTICATED` (`src/server.ts:110-111`; `src/auth.ts`).
- B: empty body → `{}`; non-object or unparsable JSON → `VALIDATION_FAILED` (`src/server.ts:9-33`).
- C: `stayId`/`reservationId`/`guestId`/`roomId` UUID checks, `actor` required (`src/store.ts:189-194` via `requireUuid`/`requireString` at :39-46).
- D: existing stay for the reservation → `CONFLICT` with both ids (`src/store.ts:195-199`); an already-known `stayId` returns the stored record idempotently (:201-202).
- E: record stored `in-house`, `stay.checked-in` outbox event queued (:204-220); F: `stayId`, `roomId`, `state` returned (`src/server.ts:116-119` via `stayPayload` at :42-59).

## 4. Failure/rollback flowchart

CheckOut (`POST /v1/stay/CheckOut`) — the folio-gated close:

```mermaid
flowchart TD
    G[Folio gate] --> H[Idempotency replay?]
    H -->|key seen| R200[200 original close]
    H -->|new| I[Stay exists and in-house?]
    I -->|yes| J[Close + checked-out event]
    G -->|unsettled, no approval| R409[409 SETTLEMENT_REQUIRED, stays in-house]
    I -->|no| RERR[404 NOT_FOUND or 422 STATE_ILLEGAL]
```

Edge trace:

- G: non-integer balance → `VALIDATION_FAILED`; non-zero balance without a recorded `openBalanceApproval` object → `SETTLEMENT_REQUIRED`, stay remains in house (`src/store.ts:148-168`); gate runs before any state read (`src/store.ts:260-264`).
- H: replayed `idempotencyKey` returns the original close (`src/store.ts:266-271`); paired simultaneous check-outs resolve exactly one winner, the loser is refused below.
- I: unknown stay → `NOT_FOUND` (:273-274); already `closed` → `STATE_ILLEGAL` (:276-281).
- J: state flips to `closed`, `actualDeparture` stamped, `stay.checked-out` outbox event queued, key recorded (:282-292).
- MoveRoom follows the same shape: in-house conditional write with idempotent key replay (`src/store.ts:300-344`); room assignment/release around it is the desk's Rooms `AssignRoom`/`ReleaseRoom` calls, not a stay-side rollback.

## 5. Outbound dependencies

None at runtime. The folio-gate inputs (`folioBalanceMinor`, `openBalanceApproval`) arrive inside the `CheckOut` request — the desk fetches them from Billing `GetFolioBalance` first. The stay links back to Reservations via `CheckInReservation` (called by the desk with the new stay id). Emits `stay.checked-in` / `stay.checked-out` outbox events (`src/store.ts:215-219,284-288`; Postgres `src/pgstore.ts:97,201,286,349`, helper :460-468) consumed by Reporting and Guests `linkStay`. Hotel values come from `AdminService.GetHotelConfig` with a cached offline-first fallback (LLD [section 0](../lld.md)).

See also: [deployment](../system-architecture.md) (section 1), [C4 containers](../c4-containers.md), and [event flow](../event-flow.md) (this service's outbox emissions).

## 6. Error mapping

Envelope `{code, message, details, traceId}` (`src/errors.ts:36-43`; transport mapping `src/server.ts:76-88`) to `docs/technical/error-handling.md` [section 1](../../technical/error-handling.md). Code→status map (`src/errors.ts:5-24`):

| Code | Status | Raised when |
|---|---|---|
| `VALIDATION_FAILED` | 400 | bad JSON, bad UUID/date/field, bad folio-gate shape |
| `UNAUTHENTICATED` | 401 | missing session token |
| `NOT_FOUND` | 404 | unknown stay, reservation, path, or operation |
| `CONFLICT` | 409 | reservation already checked in; room just taken (rooms) |
| `STATE_ILLEGAL` | 422 | step on a wrong-state stay/room |
| `SETTLEMENT_REQUIRED` | 409 | open folio balance without approval at check-out |
| `FORBIDDEN` | 403 | role-refused admin operation (admin module) |

## 7. Operations

Run from `services/stay`. Requires Node.js 22+. Build and test:

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

`DATABASE_URL` must point at the module database (default `postgresql://hotel:change-me@db:5432/hotel` in compose). Without `DATABASE_URL` the in-memory store serves with identical check-in semantics (`src/index.ts`); with it, `PostgresStayStore` persists every row.

Run — production build:

```sh
npm start
```

Local watch (type-checks, runs, and restarts TypeScript directly):

```sh
npm run dev
```

Configuration via environment: `PORT` (default `8084`); hotel values come from `AdminService.GetHotelConfig` with a cached offline-first fallback (see LLD [section 0](../lld.md)) and land in later slices.

Docker:

```sh
docker build -t hotel-stay .
```

Contract tests: `contract-tests/` holds fixtures per provided/consumed operation once the first slice lands (see `contract-tests/README.md`). Run the repo gate from the repo root before opening a PR:

```sh
script/contract-check.sh
```

## 8. Planned delta — server-side check-out gate (Refs #601, ADR-0005 proposed)

Not as-built yet: this section records the target the implementation PR
folds into sections 2, 4, 5, and 6 in the same change
(maintain-with-code). Today the gate (`src/store.ts:148-168`, called at
`:263`) trusts the request's `folioBalanceMinor` / `openBalanceApproval`,
and section 5 says "None at runtime".

- New outbound client: one Billing `GetFolioBalance` read at the close,
  `BILLING_BASE_URL` (default `http://billing:8087`), caller Bearer
  token forwarded, 5-second timeout, fail closed with
  `UPSTREAM_UNAVAILABLE` 503 — the Reservations -> Rates pattern
  (`services/reservations/internal/pricing/client.go`).
- `checkOut` uses the read's `balanceMinor` and `openBalanceApproval`,
  binds the request's `folioId` to the folio Billing returns, and keeps
  the conditional `in-house -> closed` flip and the idempotent replay.
- The request's `folioBalanceMinor` / `openBalanceApproval` become
  advisory and ignored; the contract delta is LLD section 21.5.
- New `UPSTREAM_UNAVAILABLE` 503 in `src/errors.ts` and the message
  catalogue, plus the incomplete-approval refusal wording.

Design: `docs/architecture/lld.md` section 21; threat-model B5 and
residual risks R5–R7 in `docs/technical/security-threat-model.md`.

## 9. Planned delta — departure completes the booking (Refs #646)

Not as-built yet: `checkOut` closes only the stay row and queues
`stay.checked-out` (`src/store.ts:282-290`; Postgres
`src/pgstore.ts:161-206`), so the booking behind the stay keeps reading
`checked-in`. This section records the target the implementation PR
folds into sections 2, 4, 5, and 6 in the same change
(maintain-with-code). It layers on the #601 delta above: the completion
runs after the flip, whichever order the two clients land in.

- New outbound client: one Reservations `CheckOutReservation` call after
  the conditional `in-house -> closed` flip commits and before the
  reply — `RESERVATIONS_BASE_URL` (default `http://reservations:8081`),
  caller Bearer token forwarded, 2-second timeout. The transport must
  thread the bearer into the store the way the Reservations handler
  threads it (`services/reservations/internal/handler/handler.go:207`,
  `:235`); today `src/server.ts:110-112` only checks presence.
- The response gains `bookingCompletion`:
  `{state: "completed" | "not-recorded", reservationRef?, reason?}`.
  Any non-recording outcome (transport, timeout, 5xx, unwired, provider
  4xx) leaves the close `200`/`closed` and reports the split; it is
  never turned into a refused close (FR-DEP-5).
- An idempotent replay re-attempts the idempotent completion so a retry
  after a split repairs the booking; the booking still transitions once.
- Sections 3 and 4 gain the completion step in the CheckOut flowcharts;
  section 5's "None at runtime" becomes the Billing and Reservations
  clients; section 6 gains no new code.

Design: `docs/architecture/lld.md` section 22; product UI contract
`docs/product/desk-ui-design-rollout.md` section 6.16 (the plain split
sentence, no technical code).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-946
