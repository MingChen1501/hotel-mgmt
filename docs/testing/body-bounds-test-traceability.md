# Request-body bounds and server timeouts test traceability (Refs #630)

Status: active. Testing spec for the T2 transport-bounds change
([issue #630](https://github.com/MingChen1501/hotel-mgmt/issues/630),
audit finding C5 — no backend service bounds a request body and no
server declares its own timeouts, so one oversized body or one slow peer
can exhaust the memory of the single on-premise host or hold a
connection and a worker for as long as the peer likes), owned by
`qa-lead`. It maps the change's done-conditions —
`AC-BND-1`..`AC-BND-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 22](../product/acceptance-criteria.md) —
the requirements `NFR-BND-1`..`NFR-BND-3`, owned by `business-analyst`
in `docs/requirements/mvp-requirements.md`
[section 30](../requirements/mvp-requirements.md), and the business rule
`BR-60` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md) to their guards:
the pins that exist on disk at this spec head, the guard registry
`BND1`–`BND28`, and the evidence rule `BND-E1`.

Written before the implementation PR. Every guard in the registry is a
**named, missing obligation** at this head — no service caps a body, no
server declares a timeout, and no catalogue carries the
`error.transport.body_too_large` sentence — so no row here marks a guard
complete before it exists and passes, and the slice is not complete
until the implementation PR merges and `qa-lead` re-pins every row at
the merged head (the `#588 -> #599` pattern). Section 1 states the tier
and the no-change rules; section 2 cites what is on disk today and what
it proves; section 3 names the guards the implementation PR must create;
section 4 is the traceability map; section 5 is the test plan it must
run; section 6 is the owner verification cases; section 7 the evidence
rule; section 8 the slice status and the re-pin rule.

Companion specs: scope decision D-34 in
`docs/project/decision-log.md`
[the decision log](../project/decision-log.md) and risk R-13 in
`docs/project/risk-register.md`
[the risk register](../project/risk-register.md); the enforcement point,
the refusal shape, the timeout values, the per-flow diagram, and the
verification plan in `docs/architecture/lld.md`
[section 29](../architecture/lld.md) (29.1 the ceiling and where each
service enforces it, 29.2 what the refusal carries, 29.3 the server
timeouts per stack, 29.4 the body-read diagram with its edge trace, 29.6
the verification plan); the taxonomy entry in
`docs/technical/error-handling.md`
[section 1.1](../technical/error-handling.md); the transport bounds in
`docs/technical/integration.md`
[section 10](../technical/integration.md); and the per-service ingress
notes in `docs/architecture/services/*.md` section 7. Sibling tests this
slice must not disturb: the `traceability-matrix.md` sections 9–16 and
20–21 rows plus their registries
(`checkout-settlement-test-traceability.md` `S1`–`S12`,
`departure-release-test-traceability.md` `DR1`–`DR13`,
`arrival-reassign-test-traceability.md` `RR1`–`RR13`,
`booking-management-view-test-traceability.md` `BM1`–`BM16`,
`folio-write-verification-test-traceability.md` `FW1`–`FW13`, and
`internal-error-envelope-test-traceability.md` `ERR1`–`ERR9`). This
spec implements no code, changes no guard, adds no catalogue key, and
moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `product-owner` (acceptance criteria section 22),
  `business-analyst` (requirements section 30), and `architect` (LLD
  section 29): a caller-visible refusal for a body above one declared
  ceiling plus an explicit server-settings change on every ingress path,
  with no new subsystem, dependency edge, data model, lifecycle state,
  reader-visible surface, or code token. No ADR: ADR-0004 D1 already
  covers the envelope, and no `PAYLOAD_TOO_LARGE` token is added.
- Eight backend services, three stacks: Stay, Guests, Rooms, and Admin
  (Node); Reservations, Rates, and Reporting (Go); Billing (Spring
  Boot). The ceiling is one number — **65 536 bytes (64 KiB)** —
  declared once per service as a named code constant
  (`MAX_BODY_BYTES` on Node and Billing, `maxBodyBytes` on Go), never
  configuration (D-34).
- The refusal is the existing shared envelope: HTTP 400,
  `code: "VALIDATION_FAILED"`, `details: {"field": "body"}`, the plain
  catalogue sentence `error.transport.body_too_large` ("Request body is
  too large."), and a fresh `traceId` — exactly one complete answer,
  with the surplus never accumulated in full and no truncated JSON
  parsed (LLD 29.2).
- Refuse before work: the ceiling is enforced while the body is read —
  Node `readBody`, Go `decodeBody` through `http.MaxBytesReader`, a
  Billing servlet filter ahead of `@RequestBody` binding — before JSON
  parsing and before any store, provider, or folio call, so a refused
  request writes nothing (AC-BND-1).
- Finite bounds on every server the bundle runs (LLD 29.3): Go
  `ReadHeaderTimeout` 5 s, `ReadTimeout` 10 s, `WriteTimeout` 15 s,
  `IdleTimeout` 60 s; Node `headersTimeout` 5 000 ms,
  `requestTimeout` 10 000 ms, `timeout` 15 000 ms, `keepAliveTimeout`
  10 000 ms; Billing
  `server.tomcat.connection-timeout=5s`,
  `server.tomcat.keep-alive-timeout=10s`, and
  `server.tomcat.max-swallow-size=65536`. Every bound stays above the
  longest legitimate wait — the 5-second Reservations → Rates pricing
  read (`services/reservations/internal/pricing/client.go:33`) and
  Stay's 2-second completion read
  (`services/stay/src/reservationsClient.ts:31`) — so no in-ceiling
  request is cut off.
- A timeout is **not** a refusal: a peer that stalls mid-body or
  mid-response is disconnected without an envelope, no operation ran,
  and the desk reads that request as failed exactly as it reads any
  dropped connection. No guard may assert an envelope on the timeout
  path.
- No new token, no contract change: `VALIDATION_FAILED` is already in
  the contract enum and `statusMapping`
  (`contracts/errors/envelope.json:9`, `:16-28`), the four Node maps
  already carry it at 400 (`services/stay/src/errors.ts:16-27`; Guests,
  Rooms, and Admin the same shape), and Billing renders every refusal
  through one envelope builder
  (`services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java:34-49`).
  `contracts/` is untouched.
- No configuration, deployment, environment, or runbook delta: neither
  the ceiling nor a timeout moves into an environment variable, a
  deployment file, a runbook step, or a per-hotel setting (D-34). Moving
  either into configuration is a T4 re-tier (LLD 29.7).
- No desk change: no route, layout, catalogue key beyond the one refusal
  sentence, or print rule moves. The refusal's
  `details.field` value `body` matches none of the field names a desk
  branch reads (`stayId`, `folioId`, `paymentId`), so no desk branch or
  sentence changes (AC-BND-4).
- No schema, table, column, migration, stored value, event, or backfill.
  No MVP row moves: the 57-row coverage count in
  `traceability-matrix.md` stands unchanged and no MVP `FR-*`/`NFR-*`
  row may cite this slice as its guard; the slice rows live in
  `traceability-matrix.md` section 22.
- Change-level rollback is one revert: the ceiling checks, the eight
  catalogue keys, the four Node server properties, the three Go
  `http.Server` structs, and Billing's filter and properties fall back
  to today's unbounded read and bare server, with no migration or data
  repair in either direction.
- **No transitional red at this spec head.** Unlike the #627 stack, no
  contract or map moves ahead of the guards: the code tree here is the
  base the stacked spec PRs branch from, the existing suites are
  untouched, and the three Go modules were re-run green on this branch
  (section 2). The implementation PR adds guards; it must not have to
  repair one.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is identical to the stacked spec PRs' base (the product,
architecture, and requirements spec PRs touch `docs/` only). They prove
today's behaviour: every body is accumulated without a cap, every server
is created bare, and no catalogue carries the too-large sentence. The
implementation PR extends these in place with a `#630` note and never
deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/stay/src/server.ts:10-35` | `readBody` pushes every chunk at `:13` and concatenates the lot at `:15`; no `content-length` check, byte count, or stop | `BND1` replaces the accumulation with a counting read that refuses at byte 65 537 and destroys the unread surplus after the answer |
| `services/guests/src/server.ts:10-35`, `services/rooms/src/server.ts:10-35` | The same copy (`:13` push, `:15` concatenate) | `BND2`, `BND3` |
| `services/admin/src/server.ts:9-34` | The same copy (`:12` push, `:14` concatenate) | `BND4` |
| `services/stay/src/server.ts:74-75`, `guests:45-46`, `rooms:45-46`, `admin:53-54` | `createServiceServer` returns a bare `createServer(...)`; no `headersTimeout`, `requestTimeout`, `timeout`, or `keepAliveTimeout` is set | `BND9`–`BND12` set and read the four values |
| `services/stay/src/index.ts:33-36`, `guests:20-22`, `rooms:20-22`, `admin:32-38` | Each server is started exactly as it came back, so Node's socket-inactivity timeout keeps its disabled default | The values must be set in `createServiceServer`, before `listen`; a guard reads them from the returned `Server` |
| `services/reservations/internal/handler/handler.go:43-66` | `decodeBody` hands `r.Body` straight to `json.NewDecoder` at `:48`; no `http.MaxBytesReader` | `BND5` checks `r.ContentLength` then wraps the body in `http.MaxBytesReader(w, r.Body, maxBodyBytes)` and drains |
| `services/rates/internal/handler/handler.go:41-64`, `services/reporting/internal/handler/handler.go:45-68` | The same copy (decoders at `:46` and `:50`) | `BND6`, `BND7` |
| `services/reservations/cmd/server/main.go:52`, `rates:42`, `reporting:34` | Each `main` calls the package-level `http.ListenAndServe(addr, newHandler(mux))`; `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, and `IdleTimeout` are all unset | `BND13`–`BND15` read the four fields from the `http.Server` the `main` builds (extract a constructor so the guard can call it) |
| `services/billing/src/main/resources/application.properties:1-8` | Only the port, the datasource, and Flyway; no `server.tomcat.*` timeout or size setting | `BND16` adds the three properties; the guard reads them from the classpath |
| `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:76` (and every sibling operation); `:67-71` (`requireToken`) | Spring binds `@RequestBody Map<String, Object>` before `requireToken` runs, so Jackson fills the body ahead of any controller check | `BND8` uses the servlet filter; an over-limit body is refused even without a token — still a refusal, never an admitted request |
| `contracts/errors/envelope.json:9`, `:16-28` | `VALIDATION_FAILED` is in the `code` enum (`:9`) and maps to 400 (`:17`); no `PAYLOAD_TOO_LARGE` token exists or is added | `BND25` proves the contract is untouched and the gate stays green |
| `services/stay/src/errors.ts:16-27`, `admin/src/errors.ts:14-26` | The four Node maps already carry `VALIDATION_FAILED` 400 | Unchanged; `BND25` keeps the three sibling maps aligned |
| `services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java:34-49` | Billing builds every refusal through one `envelope` helper (`:34-41`) and one `refusal` helper (`:43-45`) | Unchanged; `BND8` asserts the four fields |
| `services/stay/src/messages.en.json:4-9`, `guests`, `rooms`, `admin`; `services/reservations/internal/messages/en.json:4-9`, `rates`, `reporting`; `services/billing/src/main/resources/messages/en.json:4-9` | The `error.transport.*` family exists in all eight catalogues and has no `body_too_large` key | `BND17`–`BND24` add the key and pin its sentence in each service's message test |
| `services/stay/src/messages.test.ts:16-22`, `guests`, `rooms`, `admin` | Each catalogue guard renders its sampled transport sentences byte-identically (`:18-22` for Stay's five rows) | Extended in place with the too-large row; no existing row moves |
| `services/reservations/internal/messages/messages_test.go:26`, `rates`, `reporting` | The Go catalogue guard's sampled row list | The same extension per service |
| `services/billing/src/test/java/com/hotel/billing/util/MessagesTest.java:24` | The Billing catalogue guard's byte-identical assertions | The same extension |
| `services/stay/src/server.test.ts:17`, `guests:12`, `rooms:10`, `admin:8` | The bind-and-request harness each Node answer test reuses (`createServiceServer` + `listen(0)` + `fetch`), accepting an injected store | `BND1`–`BND4` and `BND9`–`BND12` extend these suites; the store stub is how "no operation ran" is proven |
| `services/reservations/internal/handler/handler_test.go:27`, `rates:15`, `reporting:35` | The Go `post` helper (`json.Marshal` + `httptest.NewRequest` + `httptest.NewRecorder`) | `BND5`–`BND7` use it and a raw-body variant for the over-limit case |
| `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java:32-37` | `@WebMvcTest(BillingController.class)` with a mocked `BillingService`, so a filter runs and `verifyNoInteractions(service)` proves the operation did not run | `BND8` extends this suite |
| `app/src/views/desk-edge-guards.test.ts:41-46` (used at `:621`, `:687`) | A rendered API failure must carry no raw envelope token, status number, brace, or stack/trace text | Green unchanged; `BND28` re-runs it and no desk branch on `body` may appear |
| `app/src/views/RoomsView.vue:678`, `app/src/api/client.ts:164` | A failed read renders the shell's plain request-failed sentence, never the token | Green unchanged (`AC-BND-4`) |
| `contracts/http/ModifyReservation.json` (3 530 bytes), `CreateReservation.json` (3 153), `AttachReservation.json` (3 118), `CheckOut.json` (3 093) | The largest request schemas, measured with `wc -c` at this head; each is at most 5.4% of the ceiling | No fixture changes; `BND26` keeps every under-ceiling answer |
| `script/contract-check.sh`, `script/openapi-route-check.sh` | The contract-shape and route gates; both green at this head | `BND25` keeps both green with no `contracts/` change |
| `script/catalogue-coverage-check.sh` | The EN/VI catalogue parity gate (run in CI's `metadata ci` job) | `BND17`–`BND24` keep it green with the eight added service keys |
| `grep -rn "MaxBytesReader\|MAX_BODY\|maxBody\|maxSwallowSize" services/ contracts/ app/ script/` | No bound is written anywhere in the tree at this head | The finding itself; `BND1`–`BND16` are the guards that would have caught it |

## 3. Guard registry BND1–BND28 and the evidence rule BND-E1

Twenty-eight obligations across the three stacks. `BND1`–`BND24` are
**missing guards** the implementation PR creates (the eight body guards,
the eight timeout guards, and the eight catalogue guards);
`BND25`–`BND28` are gates the same PR must prove; `BND-E1` is the
evidence record. A body guard is not complete on the returned status
alone: every case also asserts the exact envelope field set, the
catalogue sentence, the `details` field, a non-empty `traceId`, the
boundary pair (65 536 served, 65 537 refused), and that the operation
did not run — a guard that refuses everything at 400 would pass a
status-only check. A timeout guard reads values; it never sleeps.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `BND1` | **Stay over-limit refusal and boundary (`AC-BND-1`, `AC-BND-4`, `NFR-BND-1`, `NFR-BND-2`)**: declare the service constant and assert it equals 65 536; inject a `StayStoreAPI` stub that counts calls; send a 65 537-byte body with a valid token and assert HTTP 400, a JSON body with **exactly** the four envelope keys, `code === "VALIDATION_FAILED"`, `details` deep-equal `{"field": "body"}`, `message === msg("error.transport.body_too_large", {})`, and a non-empty `traceId`; assert the stub was called **zero** times; send a 65 536-byte body and assert it is not refused for size (the operation proceeds to its own validation/success answer); send a declared `Content-Length` over the ceiling and assert the refusal arrives without reading the stream; then assert a later in-ceiling request on the same server answers normally | `services/stay/src/server.test.ts` (extend; reuse the harness at `:17`) |
| `BND2` | **Guests**: the same nine assertions against a `GuestStoreAPI` stub | `services/guests/src/server.test.ts` (`:12`) |
| `BND3` | **Rooms**: the same against a `RoomStoreAPI` stub | `services/rooms/src/server.test.ts` (`:10`) |
| `BND4` | **Admin**: the same against an `AdminStoreAPI` stub (the boot/sign-in operations are the natural no-op witness) | `services/admin/src/server.test.ts` (`:8`) |
| `BND5` | **Reservations (`AC-BND-1`, `AC-BND-4`, `NFR-BND-1`, `NFR-BND-2`)**: assert `maxBodyBytes == 65536`; post a 65 537-byte body with `deskToken` through the existing `post` helper's raw-body variant and assert HTTP 400, exactly the four envelope keys, `code: "VALIDATION_FAILED"`, `details: {"field": "body"}`, the catalogue sentence, and a non-empty `traceId`; assert the in-memory store is unchanged (reservation count before/after); send a body with a lying `Content-Length` lower than its bytes and assert the decoder refuses at byte 65 537 rather than accepting the surplus; send 65 536 bytes and assert the operation runs | `services/reservations/internal/handler/handler_test.go` (extend; `post` at `:27`) |
| `BND6` | **Rates**: the same set against the rates store | `services/rates/internal/handler/handler_test.go` (`:15`) |
| `BND7` | **Reporting**: the same set against the reporting store | `services/reporting/internal/handler/handler_test.go` (`:35`) |
| `BND8` | **Billing (`AC-BND-1`, `AC-BND-4`, `NFR-BND-1`, `NFR-BND-2`)**: assert `MAX_BODY_BYTES == 65536`; POST a 65 537-byte body through MockMvc and assert HTTP 400 with the four fields, `VALIDATION_FAILED`, `details.field` `body`, the catalogue sentence, and a non-empty `traceId`; assert `verifyNoInteractions(service)` so no operation ran; assert the boundary pair (65 536 not refused for size, 65 537 refused); assert an over-limit body with **no** token is refused as `VALIDATION_FAILED` (the filter precedes the controller's `requireToken`, requirements 30.2) | `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java` (extend) |
| `BND9` | **Stay timeout (`AC-BND-3`, `NFR-BND-3`)**: after `createServiceServer`, assert `headersTimeout === 5000`, `requestTimeout === 10000`, `timeout === 15000`, `keepAliveTimeout === 10000` — exact values, so a Node default (non-zero) cannot pass — and assert each is non-zero | `services/stay/src/server.test.ts` |
| `BND10` | **Guests timeout**: the same four values | `services/guests/src/server.test.ts` |
| `BND11` | **Rooms timeout**: the same four values | `services/rooms/src/server.test.ts` |
| `BND12` | **Admin timeout**: the same four values | `services/admin/src/server.test.ts` |
| `BND13` | **Reservations timeout (`AC-BND-3`, `NFR-BND-3`)**: call the server constructor the `main` extracts (for example `newServer(addr, handler)`) and assert `ReadHeaderTimeout == 5*time.Second`, `ReadTimeout == 10*time.Second`, `WriteTimeout == 15*time.Second`, `IdleTimeout == 60*time.Second`, each non-zero | new `services/reservations/cmd/server/main_test.go` |
| `BND14` | **Rates timeout**: the same four fields | new `services/rates/cmd/server/main_test.go` |
| `BND15` | **Reporting timeout**: the same four fields | new `services/reporting/cmd/server/main_test.go` |
| `BND16` | **Billing timeout (`AC-BND-3`, `NFR-BND-3`)**: load `application.properties` from the classpath and assert `server.tomcat.connection-timeout=5s`, `server.tomcat.keep-alive-timeout=10s`, and `server.tomcat.max-swallow-size=65536`, with no zero/empty/placeholder value | new `services/billing/src/test/java/com/hotel/billing/config/ServerTimeoutPropertiesTest.java` |
| `BND17` | **Stay catalogue (`AC-BND-5`, `NFR-BND-1`)**: add `["error.transport.body_too_large", {}, "Request body is too large."]` to the byte-identical sampled list; the key exists in `messages.en.json` and the sentence names no byte count, field path, or internal name | `services/stay/src/messages.test.ts` |
| `BND18` | **Guests catalogue**: the same row | `services/guests/src/messages.test.ts` |
| `BND19` | **Rooms catalogue**: the same row | `services/rooms/src/messages.test.ts` |
| `BND20` | **Admin catalogue**: the same row | `services/admin/src/messages.test.ts` |
| `BND21` | **Reservations catalogue**: add the row to the Go sampled list | `services/reservations/internal/messages/messages_test.go` |
| `BND22` | **Rates catalogue**: the same row | `services/rates/internal/messages/messages_test.go` |
| `BND23` | **Reporting catalogue**: the same row | `services/reporting/internal/messages/messages_test.go` |
| `BND24` | **Billing catalogue**: assert `Messages.text("error.transport.body_too_large", Map.of())` equals the plain sentence | `services/billing/src/test/java/com/hotel/billing/util/MessagesTest.java` |
| `BND25` | **Contract and no-drift gate (`AC-BND-2`, `NFR-BND-2`) — re-run, no edit**: `contracts/` carries no change (the enum, `statusMapping`, every `contracts/http/` operation, and every fixture are byte-identical), the four Node maps and Billing's handler are unchanged, and `script/contract-check.sh` and `script/openapi-route-check.sh` stay green — so no service emits a code outside the single contract vocabulary and no `PAYLOAD_TOO_LARGE` token appears | `contracts/**`, `services/*/src/errors.ts`, `services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java` — no edit permitted; both scripts |
| `BND26` | **Under-ceiling re-run (`AC-BND-4`, `NFR-BND-1`) — re-run, no edit**: every existing success and refusal case in the four Node suites, the three Go handler suites, and `BillingControllerTest` passes with its assertions untouched, and every contract fixture behaves as today (each is far under the ceiling) — the boundary proof that nothing under the limit changed | `services/{stay,guests,rooms,admin}/src/server.test.ts`, `services/{reservations,rates,reporting}/internal/handler/handler_test.go`, `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java`, `script/contract-check.sh` — no edit permitted |
| `BND27` | **No-configuration gate (`AC-BND-2`, `NFR-BND-2`, `BR-60`)**: the diff carries no ceiling or timeout in an environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; the only configuration-shape change is the three fixed Billing properties of `BND16`, which are packaged constants, not environment placeholders | diff inspection recorded in the implementation PR body; `deploy/**`, `docs/devops/**`, `docs/operations/**` — no ceiling/timeout edit permitted |
| `BND28` | **Desk and catalogue parity re-run (`AC-BND-4`)**: the desk no-leak guard, the plain request-failed sentence pins, the desk suites, and `script/catalogue-coverage-check.sh` are green; `body` matches no desk refusal branch (`stayId`, `folioId`, `paymentId`); no route, layout, or print rule moves, and the eight added service catalogue keys are the only catalogue delta | `app/src/views/desk-edge-guards.test.ts`, `app/src/views/*.test.ts`, `app/src/api/client.ts`, `script/catalogue-coverage-check.sh` — no edit permitted |
| `BND-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build and records the before/after pair in `docs/testing/evidence/630/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping
it to covered only when the guard passes. The under-ceiling pins, the
desk pins, and the contract gate are covered **by re-run today** — they
exist and pass and must keep passing untouched — but the slice as a
whole stays incomplete. The three Go modules were re-run at this head
(`go build ./... && go vet ./... && go test ./...`: `reservations`,
`rates`, and `reporting` all `ok`, `cmd/server` has no test files yet);
the four Node suites and the Billing suite were not re-run here because
the branch is docs-only and this worktree carries no installed
`node_modules` and no Maven — they are the unchanged baseline the
`node-build` and `billing` CI jobs last ran, and the implementation PR
runs them.

| Item | Required guard | Guard |
|---|---|---|
| `AC-BND-1` — any request body above the declared maximum is refused with exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming `body`, the plain too-large sentence, a `traceId`) in each of Stay, Guests, Rooms, Admin, Reservations, Rates, Reporting, and Billing; the body is never parsed, the operation never runs, nothing is written, and the surplus is never accumulated in full (traces to `NFR-BND-1`, `BR-60`) | L1 acceptance: one over-limit case per service plus the no-operation evidence and the boundary pair | **Pending** — `BND1`–`BND8`; today's opposite is the uncapped `readBody`/`decodeBody` at `services/stay/src/server.ts:10-35`, `services/reservations/internal/handler/handler.go:43-66`, and the Billing `@RequestBody` binding at `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:76` |
| `AC-BND-2` — each service declares its ceiling once as a named constant of 65 536 bytes; no environment variable, deployment file, runbook step, or per-hotel setting carries or overrides it; the refusal adds no code token, and the contract enum, mapping, four Node maps, and Billing handler keep exactly today's codes (traces to `NFR-BND-2`, ADR-0004 D1) | L1: the constant assertion inside each body guard; LC: the contract gate; diff gate: no configuration source | **Pending** — `BND1`–`BND8` (constant clause), `BND25`, `BND27`; the contract baseline is `contracts/errors/envelope.json:9`, `:16-28` and the maps are `services/stay/src/errors.ts:16-27` / `admin:14-26` |
| `AC-BND-3` — every server carries an explicit header-read, body-read, response-write, and idle bound, none zero or unset — the Go servers' `ReadHeaderTimeout`/`ReadTimeout`/`WriteTimeout`/`IdleTimeout`, the Node servers' four properties, and Billing's connector and keep-alive settings — sized above the 5-second pricing read and the 2-second completion read (traces to `NFR-BND-3`, `NFR-PERF-1`, `NFR-AVL-1`) | L1: one value-reading guard per server, exact values, no sleeping test | **Pending** — `BND9`–`BND16`; today's bare servers are `services/stay/src/server.ts:74-75` (siblings `:45-46`, `admin:53-54`), `services/reservations/cmd/server/main.go:52` (Rates `:42`, Reporting `:34`), and `services/billing/src/main/resources/application.properties:1-8` |
| `AC-BND-4` — every body at or below 65 536 bytes behaves exactly as today (same status, code, message, `details`, and stored effect); a body at exactly 65 536 bytes is accepted and one byte more is refused; `contract-check` stays green with no contract file changed; the desk's screens, refusal sentences, routes, catalogue keys, and print rules are untouched, and `body` matches no desk branch (traces to `NFR-BND-1`, `FR-DSP-3`, `NFR-I18N-1`) | L1: the boundary pair inside every body guard; re-run: existing suites and fixtures; desk re-run | **Covered by re-run today for the existing answers, and `pending` for the boundary pair** — `BND26` and `BND28` exist as pins (`services/stay/src/server.test.ts:17` harness and the sibling suites; `app/src/views/desk-edge-guards.test.ts:41-46`; `contract-check` green), and the 65 536/65 537 pair is the `BND1`–`BND8` half |
| `AC-BND-5` — each of the eight services carries a guard that drives an over-limit body at its own ceiling with the refusal envelope and "no operation ran" evidence, plus the boundary pair; each server has a guard asserting its timeouts are explicit and non-zero; each service's catalogue guard pins the too-large sentence (evidence condition; no behaviour change) | L1 + evidence: 24 guards plus the record | **Pending** — `BND1`–`BND24` and `BND-E1` |
| `NFR-BND-1` — bodies are read under the declared ceiling and refused before any work: one HTTP 400 envelope, `VALIDATION_FAILED`, `details.field` `body`, the plain sentence, a fresh `traceId`, no surplus buffered, no truncated JSON parsed, no second answer; 65 536 served and 65 537 refused; the refusal names no byte count or internal name (section 30.3) | L1 acceptance: the per-service refusal and boundary cases; the re-run under-ceiling set | **Pending** — `BND1`–`BND8`, `BND17`–`BND24`, `BND26` |
| `NFR-BND-2` — the ceiling is one declared constant of 65 536 bytes in all eight services, never configuration; it is more than ten times the largest request schema (3 530 bytes); the refusal reuses `VALIDATION_FAILED` 400 and changes no contract file (section 30.3) | L1: per-service constant assertion; LC: contract gate; diff gate: no configuration source | **Pending** — the constant clause of `BND1`–`BND8`, `BND25`, `BND27` |
| `NFR-BND-3` — every server declares finite header-read, body-read, response-write, and idle bounds, none zero or unset; no in-ceiling call is cut off, including the 5-second pricing read and the 2-second completion read; a peer disconnected by a bound leaves no operation running and is promised no envelope (section 30.3) | L1: one value-reading guard per server, exact values | **Pending** — `BND9`–`BND16` |
| `BR-60` — a body above 65 536 bytes is the caller's mistake refused before any store, provider, or folio call with the shared envelope and a fresh correlation id; the ceiling is one code constant, never configuration; every server declares finite bounds sized above the longest legitimate provider wait; a timeout frees the connection without promising a refusal (business rules) | L1 acceptance + evidence: the eight refusals, the eight timeout guards, and the lab record | **Pending** — `BND1`–`BND16`, `BND27`, `BND-E1` |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run** — `BND28`; `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/desk-edge-guards.test.ts:621`, `:687`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh`; a flow edit fails the row |
| Contract and LC | Real delta: no contract file changes, no code token added, the four Node maps and the Billing handler keep their codes, and both check scripts stay green; no `contracts/http/` operation changes | **Covered by re-run today** — `BND25`; the files are `contracts/errors/envelope.json`, `services/*/src/errors.ts`, `services/billing/src/main/java/com/hotel/billing/web/ApiExceptionHandler.java`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, envelope-field, or event change here is a re-tier finding (LLD 29.5) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` or `NFR-*` wording moves; the three `NFR-BND-*` are the only requirement additions | **Pending gate** — the 57-row MVP coverage count stands unchanged in `traceability-matrix.md` and no MVP row cites this slice as its guard (requirements 30.2) |
| Evidence cross-reference (`BND-E1`) | The finding is reproduced from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/630/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 29](../architecture/lld.md) and each service's Operations section) |
|---|---|---|
| L1 Stay service | `BND1`, `BND9`, `BND17` plus the `BND26` re-run, no database needed | `cd services/stay && npm ci && npm run build && npm test && npm run lint` (CI `node-build` matrix) |
| L1 Guests service | `BND2`, `BND10`, `BND18` plus its re-run | `cd services/guests && npm ci && npm run build && npm test && npm run lint` (CI `node-build`) |
| L1 Rooms service | `BND3`, `BND11`, `BND19` plus its re-run | `cd services/rooms && npm ci && npm run build && npm test && npm run lint` (CI `node-build`) |
| L1 Admin service | `BND4`, `BND12`, `BND20` plus its re-run | `cd services/admin && npm ci && npm run build && npm test && npm run lint` (CI `node-build`) |
| L1 Reservations service | `BND5`, `BND13`, `BND21` plus the `BND26` re-run | `cd services/reservations && go build ./... && go vet ./... && go test ./...` (CI `go-build`) |
| L1 Rates service | `BND6`, `BND14`, `BND22` plus its re-run | `cd services/rates && go build ./... && go vet ./... && go test ./...` (CI `go-build`) |
| L1 Reporting service | `BND7`, `BND15`, `BND23` plus its re-run | `cd services/reporting && go build ./... && go vet ./... && go test ./...` (CI `go-build`) |
| L1 Billing service | `BND8`, `BND16`, `BND24` plus its re-run | `cd services/billing && mvn verify` (CI `billing`) |
| LC contract | `BND25`: the contract byte-identical and both gates green | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`, plus the repo gate in `ci`) |
| Desk unit | `BND28` re-run, with the #588/#600/#601/#646/#647/#648 pins | `cd app && npm ci && npm run build && npm run lint && npm test` (CI `app-build`) |
| Desk browser | The existing Playwright desk flows stay green; the change adds no browser-visible behaviour, so no new spec is required | CI `browser-e2e` |
| Live desk loop and lab | The loop stays green unchanged; the `BND-E1` before/after pair uses the isolated lab | `script/e2e-desk-loop.sh` (CI `e2e-single-host`); isolated compose lab for the record |
| Gates | Catalogue parity, links, harness conventions, whitespace, pre-flight proof | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `script/test-preflight-fail-closed.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `node-build` (the
four Node modules), `go-build` (the three Go modules), `billing`,
`contract-check`, `app-build`, `browser-e2e`, `e2e-single-host`, and
`ci` (catalogue, links, harness conventions, pre-flight proof).

### Execution order

1. The four Node body guards (`BND1`–`BND4`) — fastest signal, no
   database, and the harness already injects a store, so the
   "no operation ran" assertion is direct.
2. The three Go body guards (`BND5`–`BND7`), including the lying
   `Content-Length` case that proves the `http.MaxBytesReader` drain.
3. The Billing body guard (`BND8`) — the filter must precede
   `@RequestBody`, so the no-token over-limit case is the ordering
   proof.
4. The catalogue guards (`BND17`–`BND24`), with the gate
   (`script/catalogue-coverage-check.sh`) re-run straight after.
5. The timeout guards (`BND9`–`BND16`) — value reads only, no sleeping
   test.
6. The re-run and gates: `BND26` (every existing suite untouched),
   `BND25` (contract byte-identical), `BND27` (no configuration
   source), `BND28` (desk and catalogue parity).
7. The isolated-lab reproduction and the before/after pair (`BND-E1`),
   then the `test-report.md` row and the re-pin of section 4 at the
   merged head.

### Entry criteria

1. The #630 T2 spec set (product section 22, requirements section 30,
   `BR-60`, LLD section 29, the error-handling and integration deltas,
   and this document) carries a `SPEC-GATE PASS` on #630 or the spec
   stack.
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the decided ceiling and timeout
   values are the ones on disk.
3. The #588/#600/#601/#646/#647/#648 slices are merged, so the desk pins
   in section 2 are the real baseline.
4. The build under test is identified by commit and the lab seed matches
   `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).
5. Baseline state: the three Go modules are green at this head
   (re-run, section 4); the Node and Billing suites are the unchanged
   baseline the `node-build` and `billing` jobs last ran, because this
   docs-only branch touches no code path those jobs watch.

### Exit criteria

1. `BND1`–`BND8` exist and pass, each asserting the full envelope, the
   catalogue sentence, `details.field` `body`, a non-empty `traceId`,
   the 65 536/65 537 boundary pair, a declared `Content-Length` over the
   ceiling, "no operation ran", and a later in-ceiling request answered
   normally.
2. `BND9`–`BND16` pass across all eight servers with the exact declared
   values and no sleeping test, and every value clears the 5-second
   pricing read and the 2-second completion read.
3. `BND17`–`BND24` pass, each pinning "Request body is too large." in
   its own catalogue, and `script/catalogue-coverage-check.sh` is green.
4. `BND25`–`BND28` are green with their assertions untouched — no
   contract file changed, no existing refusal or success assertion
   moved, no configuration source added, no desk branch or print rule
   moved.
5. `BND-E1` is recorded: the `docs/testing/evidence/630/README.md`
   before/after pair and the `docs/testing/test-report.md` row.
6. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
7. Open failures are filed as issues with FR/NFR ids; no `risk-medium`
   failure is waived without owner approval.

### Negative controls

A guard that only checks `status === 400` or only sends an over-limit
body is insufficient.

- `BND1`–`BND8` each assert `code === "VALIDATION_FAILED"` **and**
  `details` deep-equal `{"field": "body"}` **and** the catalogue
  sentence, so an answer that reuses another 400 refusal (`bad_json`,
  `body_not_object`, or a field refusal) fails.
- Each body guard asserts the exact four-key envelope and a non-empty
  `traceId`, so a second, partial, or field-less answer fails.
- Each body guard asserts the operation did not run (stub call count on
  Node, store count on Go, `verifyNoInteractions` on Billing), so a
  service that reads the whole body and then refuses inside the
  operation fails.
- Each body guard sends **both** 65 536 (not refused for size) and
  65 537 (refused), so a guard that only proves "some large body is
  refused" cannot pass with a ceiling that is too small.
- `BND5`–`BND7` send a body whose declared `Content-Length` lies below
  its bytes, so a decoder that trusts the header and keeps reading past
  the ceiling fails.
- `BND13`–`BND15` assert the exact `time.Duration` values, and
  `BND9`–`BND12` the exact milliseconds: Node's defaults are non-zero
  (`requestTimeout` 300 000 ms, `headersTimeout` 60 000 ms), so a
  non-zero-only assertion would not catch a missing setting.
- No guard asserts an envelope on the timeout path; a timeout is a
  disconnect, not a refusal (section 1).
- `BND26` fails on a loosened assertion, not only on a red test: the
  existing cases are the `AC-BND-4` proof and may not be rewritten.
- `BND28` fails on a rendered token and on a desk branch on `body`, not
  only on a missing sentence.
- `BND27` fails on a ceiling or timeout read from `process.env`,
  `os.Getenv`, a `${...}` placeholder, a compose override, or a runbook
  step.

## 6. Owner verification cases (BND-1..BND-7)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
in-house stay, `api <module> <Operation>` bodies, and `psql` counts).
Steps are the same for each case unless stated: apply the hotel config,
sign in as `owner`, act as described, then read the reply and the desk
surface in both locales.

| Case | Setup | Expected |
|---|---|---|
| `BND-1` | Send a 70 000-byte POST body (a valid JSON object padded with a filler field) to a write operation on each stack: Stay, Guests, Rooms, Admin, Reservations, Rates, Reporting, and Billing | Each service answers exactly one HTTP 400 with `code: "VALIDATION_FAILED"`, `details` `{"field": "body"}`, the plain `Request body is too large.` sentence, and a `traceId`; no row, folio line, balance, or event changes (`psql` count before/after); the desk shows its existing plain refusal, never the token |
| `BND-2` | Repeat the same operation with a body of exactly 65 536 bytes, then one of 65 537 bytes | The 65 536-byte body is not refused for size (its own success or field validation answer); the 65 537-byte body is refused with the `BND-1` envelope; nothing in between flips unpredictably |
| `BND-3` | Open a connection to each service and send headers or a body very slowly (`nc` or `curl --limit-rate`), then stop reading the response | The server frees the connection inside its declared bound (header read 5 s, body read 10 s or Billing's 5 s connector timeout, write 15 s, idle 10–60 s), no worker stays held, no envelope is expected, and a normal request immediately afterwards is served |
| `BND-4` | Run the full desk loop (`script/e2e-desk-loop.sh`) on the same build | Booking, check-in, folio charge, check-out review, settlement refusal and approval, departure completion, reassignment, and the booking register behave exactly as before; no code, status number, brace, or trace text appears on any screen in EN or VI |
| `BND-5` | Read the reply of `BND-1` in each service and open the desk refusal in EN and VI | One plain sentence with no byte count, field path, or internal name; the service catalogue carries `error.transport.body_too_large`; the desk keeps its existing refusal and request-failed sentences |
| `BND-6` | Inspect `deploy/`, the compose file, the runbooks, and a running service's environment | No environment variable, deployment file, runbook step, or per-hotel setting carries or overrides the ceiling or a timeout; the values are the code constants and the packaged Billing properties |
| `BND-7` | Read `contracts/errors/envelope.json` and run `script/contract-check.sh` and `script/openapi-route-check.sh` | The enum and `statusMapping` are byte-identical to before (no `PAYLOAD_TOO_LARGE`), no `contracts/http/` operation or fixture changes, and both gates pass |

## 7. Evidence rule BND-E1

The implementation PR records, in `docs/testing/evidence/630/README.md`
(created by that PR, same capture method as the #588 and #627 records),
one before/after pair plus the finding, because the issue's scope asks
for the reproduction to live with the implementation:

- **The finding, reproduced on the pre-fix build from an isolated
  compose lab.** A 70 000-byte body is read and buffered whole by each
  service — the unbounded `readBody` on Node
  (`services/stay/src/server.ts:10-35` and the three siblings),
  `decodeBody` on Go
  (`services/reservations/internal/handler/handler.go:43-66` and the two
  siblings), and the Billing `@RequestBody` binding
  (`services/billing/src/main/java/com/hotel/billing/web/BillingController.java:76`) —
  and the reply is the service's own JSON or field refusal, never a
  too-large refusal; a connection that stalls mid-body is held past the
  bound the change will declare. Capture the reply and the held-connection
  observation.
- **After**, the same steps against the fixed build: the same body gets
  the one 400 envelope (`VALIDATION_FAILED`, `details` `{"field":
  "body"}`, the plain sentence, a `traceId`) in all eight services, the
  same store counts before and after, and the stalled connection is
  freed inside the declared bound.
- **Plus the honest boundary control:** a body at exactly 65 536 bytes
  is not refused for size and one byte more is refused, so the pair shows
  a ceiling rather than a blanket refusal.
- **Plus the unchanged control:** a malformed body still answers
  `400 VALIDATION_FAILED` with its own `bad_json` sentence, a missing
  token still answers `401 UNAUTHENTICATED` on Node and Go, and the desk
  loop is unchanged in both locales.
- **Plus the no-configuration check:** the diff of `deploy/`,
  `docs/devops/`, and `docs/operations/` carries no ceiling or timeout
  setting (`BND27`).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 13 rows mapped to `AC-BND-1`..`AC-BND-5`,
`NFR-BND-1`..`NFR-BND-3`, and `BR-60` plus the gate boxes. Three rows
are covered by re-run today (`AC-BND-4`, the desk-green row, and the
contract/LC gate — their pins exist and pass and must keep passing
untouched; the 65 536/65 537 boundary half of `AC-BND-4` is still
`pending` on `BND1`–`BND8`), and the rest are **pending** the
implementation PR: the rows whose guards are the registry
`BND1`–`BND28`, the `BR-60` evidence row, the MVP no-change gate, and
`BND-E1`. The slice is **not complete** at this spec head. It completes
when the implementation PR merges with `BND1`–`BND28` green, the
section 2 pins unchanged, `BND-E1` recorded, and `qa-lead` re-pins every
row in section 4 with `file:line` at the merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1080
