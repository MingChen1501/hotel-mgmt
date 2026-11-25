# #627 backend faults answer `INTERNAL_ERROR` — evidence

Before/after reproduction record for
[issue #627](https://github.com/MingChen1501/hotel-mgmt/issues/627)
(audit finding C1; `AC-ERR-1`..`AC-ERR-5`,
`FR-ERR-1`..`FR-ERR-3`, `BR-59`, LLD section 28). Left column is the
pre-change build (`origin/master` at `13c0556`, the spec-set commit);
right column is this change. Every answer below was captured from a
running service process, not from a test assertion.

## Finding

An unexpected exception — a store or driver failure, a wiring fault —
reached each Node service's catch-all and was answered HTTP `500` with
the refusal code `VALIDATION_FAILED`, the token that states the
caller's request was wrong. A database failure therefore read to the
desk as bad input. The four catch-alls are
`services/stay/src/server.ts:80-85`, `services/guests/src/server.ts:51-56`,
`services/rooms/src/server.ts:51-56`, and
`services/admin/src/server.ts:59-64` at the pre-change head, and the
four maps carried no internal-error token.

## Capture method

- Isolated lab: one PostgreSQL 16 container started with
  `docker run --label ao.session=hotel-mgmt-1067`, published only on
  `127.0.0.1:55432`, with its own throwaway volume; the stay schema was
  migrated with the module's own `npm run migrate up`. The owner's live
  `hotel-mgmt` compose project was never touched (`script/compose-lab-guard.sh`
  rules followed: no shared-project command ran).
- Each service ran from its built `dist/` as a local process on a
  dedicated loopback port, with `DATABASE_URL` set. The pre-change
  build is a detached worktree of `origin/master` at `13c0556`, built
  with the module's own `npm run build`; the post-change build is this
  branch.
- Fault injection per service, deliberately chosen so the fault
  arrives at the query, not at the connection pool's idle socket:
  - Stay, Guests, Rooms: `DATABASE_URL` points at a loopback port with
    no listener (`127.0.0.1:55499`), so the first store call fails with
    a driver connection error, which is an ordinary exception and not
    an `HttpError`. The service starts and answers `/healthz` normally
    (in-memory health path), so the fault is a store failure on an
    otherwise serving process.
  - Admin: the module applies its own migrations at boot, so a dead
    port cannot reach the HTTP layer. Admin therefore booted against
    the live isolated database, signed in as `owner`, and the
    `admin` schema was dropped (`psql -c 'DROP SCHEMA admin CASCADE'`)
    after boot; the next config read fails with a driver error.
- Requests were sent with `curl`; the four envelope fields below are
  the literal response bodies.

## Before/after pair

| Service | Request | Before (`13c0556`) | After (this change) |
|---|---|---|---|
| Stay | `POST /v1/stay/GetStay` `{"stayId": "11111111-…"}` | `500` `{"code":"VALIDATION_FAILED","message":"Unexpected failure handling the request.","details":{},"traceId":"ce5bf454-…"}` | `500` `{"code":"INTERNAL_ERROR","message":"Unexpected failure handling the request.","details":{},"traceId":"75cec940-…"}` |
| Guests | `POST /v1/guests/GetGuest` `{"guestId": "11111111-…"}` | `500` `{"code":"VALIDATION_FAILED", …, "traceId":"03fff699-…"}` | `500` `{"code":"INTERNAL_ERROR", …, "traceId":"e086fc43-…"}` |
| Rooms | `POST /v1/rooms/ListRoomTypes` `{}` | `500` `{"code":"VALIDATION_FAILED", …, "traceId":"a3f2d0e3-…"}` | `500` `{"code":"INTERNAL_ERROR", …, "traceId":"6248542e-…"}` |
| Admin | `POST /v1/admin/GetHotelConfig` `{}` with the owner session | `500` `{"code":"VALIDATION_FAILED", …, "traceId":"cc6b0a7a-…"}` | `500` `{"code":"INTERNAL_ERROR", …, "traceId":"7d932230-…"}` |

In every row the status stays `500`, the message stays the catalogue
sentence `error.transport.unexpected` (`Unexpected failure handling the
request.`), `details` stays `{}`, and a fresh `traceId` is written; only
the `code` moves. Each service answered its next `/healthz` request
`200` after the fault, so one fault leaves it serving.

## Honest refusal controls

Captured on the same post-change process (Stay, port 18086), to show
the change moves only the non-refusal path:

| Case | Answer |
|---|---|
| Malformed JSON body | `400` `{"code":"VALIDATION_FAILED","message":"Request body is not valid JSON.", …}` |
| Missing session token | `401` `UNAUTHENTICATED` |
| `GET` on a known operation path / unknown route | `404` `{"code":"NOT_FOUND","message":"unknown path", …}` — Node still emits no `405` |

## Map and contract check

- `contracts/errors/envelope.json` already carries the three tokens
  from the #627 spec set: `INTERNAL_ERROR` 500, `UPSTREAM_UNAVAILABLE`
  503, `METHOD_NOT_ALLOWED` 405, in both the `code` enum and
  `statusMapping`.
- The four Node maps now answer those three tokens at the contract
  statuses (ERR5) and match the contract enum in both directions, minus
  the admin-only `IDENTITY_LOCKED` exception (ERR6). Admin's
  contract-sync walk (`services/admin/src/errors.test.ts`) was red on
  master before this change (`METHOD_NOT_ALLOWED: undefined !== 405`)
  and is green after it, with no assertion loosened.
- `script/contract-check.sh` and `script/openapi-route-check.sh` both
  PASSED on this branch.

## Recorded caveat (out of scope for #627)

Stopping the PostgreSQL server while a pooled idle client is connected
makes `pg` emit an unhandled pool `error` event, and the process exits
(observed once while setting up this reproduction). That is a
service-lifecycle gap — pool error handling and restart behaviour —
separate from the wire-code change here, which concerns what a failed
query answers. It is recorded so the fault-path reproduction above uses
a failing query rather than a killed server; it changes no guard in
this slice and is not fixed here.

## Regression re-runs

- Stay 37/37, Guests 26/26, Rooms 28/28, Admin 33 pass + 1 skipped
  (the database-gated case), all on `npm run build && npm test`; the
  same suites on the pre-change tree were 31, 20, 22, and 27 pass + 1
  skipped + the contract-sync failure.
- No desk surface, catalogue key, route, layout, or print rule moves,
  so `app/` needs no new case; the no-leak guard already rejects an
  `INTERNAL` token in rendered text.
