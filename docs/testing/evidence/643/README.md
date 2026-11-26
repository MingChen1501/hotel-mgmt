# #643 session-derived audit actor — evidence

Before/after reproduction record for
[issue #643](https://github.com/MingChen1501/hotel-mgmt/issues/643)
(audit finding C6; `AC-SEC-1`..`AC-SEC-5`, `FR-SEC-1`..`FR-SEC-4`,
`BR-65`, LLD
[section 34](../../../architecture/lld.md#34-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643),
guards `SEC1`–`SEC36` and evidence rule `SEC-E1` in
[the test traceability](../../audit-actor-test-traceability.md)).
The left column is the pre-change build; the right column is this
change. Every answer below was captured from a running service
process, not from a test assertion.

## Finding

Every write path read the audit actor from the request body:
`services/stay/src/store.ts` (the four writes), `services/guests/src/store.ts`
(`UpsertGuest`), `services/rooms/src/store.ts` (the seven writes),
`services/reservations/internal/handler/handler.go` (the six writes),
`services/billing/src/main/java/com/hotel/billing/web/BillingController.java`
(nine adapters into `BillingService`), and
`services/admin/src/store.ts` (`UpdateHotelConfig` via `input.updatedBy`).
The Bearer token the request already authenticated with was checked and
discarded, so every outbox event, change row, and state-history row
attributed the change to a string the caller chose — the attribution
`NFR-AUD-1` promises.

## Capture method

- Pre-change build: `git archive 65e6655` (the spec head; its code tree
  is the pre-change tree because the spec commits touch `docs/` plus two
  contract `description` strings) extracted into
  `/tmp/opencode/643-pre`, then `npm run build` in `services/stay`,
  `services/guests`, `services/rooms`, and `services/admin`; `go build
  ./cmd/server` in `services/reservations`; `mvn -B -DskipTests package`
  in `services/billing`.
- Post-change build: this branch, the same four `npm run build`, the same
  `go build`, and the same `mvn` package.
- Each build ran as its own process against one scratch
  `postgres:16-alpine` container (`ao-643-pg`, loopback `55441`) with two
  fresh databases (`hotel_pre`, `hotel_post`) that received every
  module's boot migration. No compose command ran, so the owner's shared
  lab was not touched. Billing ran as its packaged jar in a
  `eclipse-temurin:21-jre` container on the host network because no JDK
  is installed on the host.
- Ports: Stay `18851`/`18853`, Rooms `18861`/`18863`, Reservations
  `18871`/`18873` (with stub Rates and Rooms capacity upstreams),
  Billing `18881`/`18883`, Admin `18891`/`18893` (pre/post).
- Requests: `POST /v1/<service>/<Operation>` with
  `Content-Type: application/json` and `Authorization: Bearer
  desk-token-e2e` unless stated; the spoofed body always carries
  `"actor": "mallory"` (Admin: `"updatedBy": "mallory"`). Reads are
  `psql` over the same databases.

## C6 — the caller-chosen actor (before/after)

Same request to each build; the recorded values below are the stored
rows.

| Write | Pre-change (`65e6655`) | This change |
|---|---|---|
| Stay `CheckIn` (token `desk-token-e2e`, body `mallory`) | `stay.stays.created_by = updated_by = mallory`; `checked-in` payload `{"actor": "mallory", ...}`, outbox `created_by = mallory` | `stay.stays.created_by = updated_by = desk-token-e2e`; payload `{"actor": "desk-token-e2e", ..., "requestActor": "mallory"}`, outbox `created_by = desk-token-e2e` |
| Rooms `UpdateRoomState` (token, body `mallory`) | `rooms.room_status_history.created_by = mallory`; `state-changed` payload `{"actor": "mallory", ...}`, outbox `created_by = mallory` | history `created_by = desk-token-e2e`; payload `{"actor": "desk-token-e2e", ..., "requestActor": "mallory"}`, outbox `created_by = desk-token-e2e` |
| Reservations `ModifyReservation` (token, body `mallory`) | change rows `dates`/`priceBasis.created_by = mallory`; `modified` payload `{"actor": "mallory", ...}`, outbox `created_by = mallory` | all change rows `created_by = desk-token-e2e`; payload `{"actor": "desk-token-e2e", ..., "requestActor": "mallory"}`, outbox `created_by = desk-token-e2e` |
| Billing `PostCharge` (token, body `mallory`) | `billing.folios.created_by = mallory`; `folio_charge_lines.created_by = mallory`; `charge-posted` payload `{"folioId": ..., "lineId": ...}`, outbox `created_by = mallory` | folio and line `created_by = desk-token-e2e`; payload gains `"requestActor": "mallory"`, outbox `created_by = desk-token-e2e` |
| Admin `UpdateHotelConfig` (owner token, body `updatedBy: mallory`) | `admin.hotel_profile.updated_by = mallory` | `admin.hotel_profile.updated_by = owner` (the resolved `signinIdentity`); the body value is dropped |

The request's answer is unchanged in every row: each call answered the
same 200 with the same body shape the honest-value call returns (Stay
`{"stayId", "state": "in-house", ...}`, Rooms
`{"roomNumber","oldState","newState"}`, Reservations
`{"recalculatedTotal": 26000, ...}`, Billing the line view, Admin the
config values).

## The honest control

The same five writes with an actor equal to the session return the same
answer and store the same business effect, and their payloads carry no
`requestActor` key:

- Stay `CheckIn` payload keys are `actor`, `reservationId`, `roomId`,
  `stayId` on both builds, with `actor = desk-token-e2e`.
- Rooms `UpdateRoomState` payload keeps `actor`, `newState`, `oldState`,
  `roomNumber` on both builds.
- Reservations `ModifyReservation` payload keeps
  `actor`, `arrivalDate`, `departureDate`, `guestId`, `priceBasisTotal`,
  `reservationRef`, `roomTypeId` on the honest write.
- Billing `PostCharge` payload keys are `folioId`, `lineId` on both
  builds; the honest payload gains no key.
- Admin `UpdateHotelConfig` with `updatedBy: owner` stores `owner`.

So the demotion did not become a refusal and did not change a stored
business effect.

## The no-session control

One write per service with no `Authorization` header answered the
existing 401 and recorded nothing; the row counts before and after are
identical. Stay returned the same envelope as before the change.

| Request | Answer | Rows |
|---|---|---|
| Stay `CheckIn` | `401 {"code":"UNAUTHENTICATED","message":"Missing session token.",...}` | unchanged |
| Rooms `UpdateRoomState` | `401 UNAUTHENTICATED` | unchanged |
| Reservations `CancelReservation` | `401 UNAUTHENTICATED` | unchanged |
| Billing `PostCharge` | `401 UNAUTHENTICATED` | unchanged |
| Admin `UpdateHotelConfig` | `401 UNAUTHENTICATED` | unchanged |

Counts for the post build before the five calls
(`stay.stays stay.outbox rooms.room_status_history rooms.outbox
reservations.reservation_changes reservations.outbox
billing.folio_charge_lines billing.outbox`) were
`2 2 2 5 6 4 2 2` and stayed `2 2 2 5 6 4 2 2` afterwards. The Stay
and Guests cases are the new HTTP-level guards (`SEC32`); the Rooms,
Reservations, Billing, and Admin ones re-run existing guards.

## The forwarded completion

One Stay close whose booking completes was captured on both sides. A
Reservations booking was checked in with stay id
`aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`, Stay checked the same stay in,
then closed it with the desk token and an `actor` of `front-desk`:

- `stay.outbox` `checked-in` and `checked-out`: `actor =
  desk-token-e2e`, `requestActor = front-desk`, `created_by =
  desk-token-e2e`.
- `reservations.reservation_changes` for that booking:
  `"confirmed"`, `"checked-in"`, `"closed"` — every row
  `created_by = desk-token-e2e`.
- The completion answered `bookingCompletion: {"state": "completed",
  "reservationRef": "RSV-ZJFMZQVT"}`.

Both sides record one identical session string; the forwarded
`front-desk` appears only as the annotation.

## The boot seed

A fresh Admin boot logs the owner in and its `user.created` audit entry
records `actor = boot` with no request — `admin.users.created_by =
boot` in both databases, unchanged by this slice (`SEC34`).

## The unchanged controls

- The `actor`/`updatedBy` refusals keep their code, field, and sentence
  (`SEC31`): a missing or blank value still answers HTTP 400
  `VALIDATION_FAILED` naming the field, and a disagreement adds no
  refusal.
- The front-desk 403 on `UpdateHotelConfig` and the role checks are
  untouched; token verification, HMAC, expiry, revocation, and the desk
  UI's actor field are out of scope by design.
- The desk payloads are unchanged: `app/src/views/PrintView.vue` still
  sends `session.displayName` as `actor`, and no surface renders an
  actor (the desk suites and `browser-e2e`/`e2e-single-host` CI jobs are
  the re-run half).
- `script/contract-check.sh` (117 fixtures and every manifest),
  `script/openapi-route-check.sh`, and
  `script/catalogue-coverage-check.sh` are green with no contract,
  catalogue, or OpenAPI edit in this PR.
- Outbox payload key sets changed only by `requestActor`; change,
  history, and audit columns keep their names and `TEXT`/JSONB types.

## The no-configuration and no-migration check

`git diff --stat` for this branch touches no `deploy/`, `docs/devops/`,
`docs/operations/`, or `services/*/migrations/` file, and no
environment variable, per-hotel setting, schema, table, column,
backfill, or stored-row rewrite carries the provenance rule: the
recorded actor is derived from the header the request already
authenticated with, in code (`SEC36`).

## Slice record

- Test report: `docs/testing/test-report.md` section 8.1 row `#643`.
- Guard re-pins at the merged head are the `qa-lead` half
  (`docs/testing/audit-actor-test-traceability.md` section 4).


<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1182
