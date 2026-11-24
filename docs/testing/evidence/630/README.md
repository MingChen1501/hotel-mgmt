# #630 request-body ceiling and server timeouts — evidence

Before/after reproduction record for
[issue #630](https://github.com/MingChen1501/hotel-mgmt/issues/630)
(audit finding C5; `AC-BND-1`..`AC-BND-5`, `NFR-BND-1`..`NFR-BND-3`,
`BR-60`, LLD [section 29](../../architecture/lld.md#29-bounded-request-bodies-and-finite-server-timeouts-refs-630),
guards `BND1`–`BND28` and evidence rule `BND-E1` in
[the test traceability](../body-bounds-test-traceability.md)).
Left column is the pre-change build; right column is this change.
Every answer below was captured from a running service process, not
from a test assertion.

## Finding

No backend service bounded a request body, and no server declared its
own timeouts:

- Node services accumulated every chunk (`readBody`,
  `services/stay/src/server.ts:10-35` and the three siblings at the
  pre-change head) and concatenated the lot, so a 70 000-byte body was
  read whole and the operation ran.
- Go services handed `r.Body` straight to `json.NewDecoder`
  (`services/reservations/internal/handler/handler.go:43-66`, Rates
  `:41-64`, Reporting `:45-68` at the pre-change head), so the same
  body was decoded whole.
- Billing bound `@RequestBody` with Jackson before any controller
  check (`services/billing/src/main/java/com/hotel/billing/web/BillingController.java:76`),
  so a 70 000-byte body was parsed whole and only the missing token
  answered.
- No Go `main` set `ReadHeaderTimeout`/`ReadTimeout`/`WriteTimeout`/
  `IdleTimeout` (`:52`, `:42`, `:34`), no Node `createServiceServer`
  set `headersTimeout`/`requestTimeout`/`timeout`/`keepAliveTimeout`,
  and `services/billing/src/main/resources/application.properties`
  carried no Tomcat bound. A peer that sent headers and then stalled
  mid-body was held for as long as it liked.

## Capture method

- Pre-change build: `git archive origin/master` at `a56b808`, the
  commit this branch is based on (its code tree is the pre-change
  tree; the spec PRs touched `docs/` only). Each service was built
  with its own toolchain (`npm run build` with the module's
  `node_modules`; `go build ./cmd/server`; `mvn -DskipTests package`
  for Billing).
- Post-change build: this branch, built the same way.
- Every service ran as its own process on a dedicated loopback port
  (18710–18803), the way the #627 record
  ([`../627/README.md`](../627/README.md)) did — no shared compose lab
  was touched and no lab volume was created. Node and Go ran their
  in-memory stores (no `DATABASE_URL`), so the refused request had no
  database to write to and the capture stays about the ingress path.
  Billing booted as a Spring Boot jar against a throwaway PostgreSQL 16
  container (`--label ao.session=hotel-mgmt-1084`, port 55433, own
  database, removed after the capture; `script/compose-lab-guard.sh`
  rules respected — no shared `hotel-mgmt` compose command ran).
- Payloads: a valid JSON object padded with a filler field
  (`{"pad":"…"}`) at exactly 70 000, 65 536, and 65 537 bytes.
  `POST` with `Content-Type: application/json` and a lab-only Bearer
  token (omitted only for the Billing trust-boundary case).
- The stalled-connection probe opens the socket, sends a complete
  request line and headers declaring `Content-Length: 100`, sends ten
  body bytes, then reads until the server closes; it gives up after
  15 s and records "still open".

## Before/after — a 70 000-byte body

| Service | Pre-change build | This change |
|---|---|---|
| Stay | `POST /v1/stay/QueryStays` → `200 {"state":null,"stays":[]}` — the body was read whole and the operation ran | `400 {"code":"VALIDATION_FAILED","message":"Request body is too large.","details":{"field":"body"},"traceId":"…"}` |
| Guests | `POST /v1/guests/UpsertGuest` → `400 VALIDATION_FAILED "fullName is required." details.field fullName` — the padded body was parsed and the operation ran | `400 VALIDATION_FAILED "Request body is too large." details.field body` |
| Rooms | `POST /v1/rooms/ListRoomTypes` → `200 {"roomTypes":[]}` | `400 VALIDATION_FAILED "Request body is too large." details.field body` |
| Admin | `POST /v1/admin/SignIn` → `400 VALIDATION_FAILED "signinIdentity is required." details.field signinIdentity` | `400 VALIDATION_FAILED "Request body is too large." details.field body` |
| Reservations | `POST /v1/reservations/CreateReservation` → `400 VALIDATION_FAILED "roomTypeId is required." details.field roomTypeId` | `400 VALIDATION_FAILED "Request body is too large." details.field body` |
| Rates | `POST /v1/rates/UpsertRatePlan` → `400 VALIDATION_FAILED "name is required." details.field name` | `400 VALIDATION_FAILED "Request body is too large." details.field body` |
| Reporting | `POST /v1/reporting/OccupancyReport` → `400 VALIDATION_FAILED "dateFrom is required." details.field dateFrom` | `400 VALIDATION_FAILED "Request body is too large." details.field body` |
| Billing | `POST /v1/billing/PostCharge` (no token) → `401 {"code":"UNAUTHENTICATED","message":"Missing session token.","details":{},"traceId":"…"}` — Jackson bound the whole body first | `400 VALIDATION_FAILED "Request body is too large." details.field body` |

Every post-change answer is one complete JSON object with exactly
`code`, `message`, `details`, `traceId`; `details` is exactly
`{"field":"body"}`, the sentence is the catalogue's
`error.transport.body_too_large` ("Request body is too large."), and
the `traceId` differs per request.

## Boundary control — 65 536 served, 65 537 refused

| Service | 65 536 bytes | 65 537 bytes |
|---|---|---|
| Stay | `200 {"state":null,"stays":[]}` | `400` too-large envelope |
| Guests | `400 "fullName is required."` (its own field refusal — not refused for size) | `400` too-large envelope |
| Rooms | `200 {"roomTypes":[]}` | `400` too-large envelope |
| Admin | `400 "signinIdentity is required."` | `400` too-large envelope |
| Reservations | `400 "roomTypeId is required."` | `400` too-large envelope |
| Rates | `400 "name is required."` | `400` too-large envelope |
| Reporting | `400 "dateFrom is required."` | `400` too-large envelope |
| Billing | `401 UNAUTHENTICATED` (the controller's own check — the body passed the filter) | `400` too-large envelope |

The pair shows a ceiling, not a blanket refusal: a body at the declared
maximum still reaches the operation's own answer.

## Stalled mid-body connection

The probe sent complete headers declaring `Content-Length: 100` and
ten body bytes, then waited.

| Build | Stay | Reservations | Billing |
|---|---|---|---|
| Pre-change | still open after 15 s | still open after 15 s | still open after 15 s |
| This change | closed after 15.0 s | closed after 10.0 s | closed after 10.0 s |

The post-change closes are the declared bounds acting (Node's
`timeout` 15 s socket bound on this path, Go's `ReadTimeout` 10 s,
Tomcat's connector bound); the pre-change builds never freed the
connection. No envelope is expected or promised on a timed-out
connection (`AC-BND-3`, traceability section 1): the probe recorded a
close, not a refusal.

## Unchanged control

| Case | Pre-change | This change |
|---|---|---|
| Stay, malformed body `{` | `400 VALIDATION_FAILED "Request body is not valid JSON." details {}` | byte-identical code, message, details |
| Stay, missing token | `401 UNAUTHENTICATED "Missing session token." details {}` | byte-identical |
| Reservations, malformed body `{` | `400 VALIDATION_FAILED "Request body is not valid JSON." details {}` | byte-identical |

## No-configuration check (`BND27`)

The diff carries no ceiling or timeout in an environment variable, a
`deploy/` file, the compose file, `docs/devops/`, `docs/operations/`, or
a per-hotel setting. The only configuration-shaped change is the three
fixed `server.tomcat.*` constants in the packaged
`services/billing/src/main/resources/application.properties` (no `${…}`
placeholder), and the eight ceilings are code constants
(`MAX_BODY_BYTES` on Node and Billing, `maxBodyBytes` on Go).

## Billing timeout confirmation — the Tomcat claim, checked

The capture confirmed against the Spring Boot 3.4.1 / Tomcat 10.1
connector reference:

- **Holds.** `connection-timeout` 5 s bounds the request line and
  headers and, with `disableUploadTimeout` at its true default, the
  request-body read; `keep-alive-timeout` 10 s bounds an idle socket;
  `max-swallow-size` 65 536 bounds what the connector discards of an
  abandoned body. The stalled-body capture above shows a finite
  post-change close on this stack.
- **Does not hold.** LLD 29.7 says Tomcat's connector timeout "is the
  socket read and write timeout". Tomcat 10.1 has no response-write
  timeout attribute: `connectionTimeout` maps to a socket read timeout,
  and nothing bounds how long a peer may refuse to drain a response.
  The spec is left as written (the deviation is reported to the
  orchestrator rather than weakened here); the shipped properties bound
  header read, body read, and idle, and a response write stall is not
  bounded on this stack.

## Reproduce

```sh
# pre-change tree
mkdir -p /tmp/prefix630 && git archive origin/master | tar -x -C /tmp/prefix630
# Node: symlink the module's node_modules, npm run build, PORT=<port> node dist/index.js
# Go:   go build -o /tmp/server ./cmd/server, PORT=<port> /tmp/server
# Billing: mvn -o -DskipTests package, DATABASE_URL=postgresql://hotel:change-me@127.0.0.1:55433/hotel
#          DB_USER=hotel DB_PASSWORD=change-me PORT=<port> java -jar target/billing-0.1.0.jar

python3 - <<'PY'
open("/tmp/p70000.json", "w").write('{"pad":"' + "x" * 69990 + '"}')
PY
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer lab-token' --data-binary @/tmp/p70000.json \
  http://127.0.0.1:<port>/v1/stay/QueryStays
```

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1084
