# Internal-error envelope test traceability (Refs #627)

Status: active. Testing spec for the T2 backend-fault vocabulary change
([issue #627](https://github.com/MingChen1501/hotel-mgmt/issues/627),
audit finding C1 — a backend 500 answers the refusal code
`VALIDATION_FAILED`, so a database failure reads to the desk as bad
input), owned by `qa-lead`. It maps the change's done-conditions —
`AC-ERR-1`..`AC-ERR-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 21](../product/acceptance-criteria.md) —
and its behaviour-scoped requirements `FR-ERR-1`..`FR-ERR-3`, owned by
`business-analyst` in `docs/requirements/mvp-requirements.md`
[section 29](../requirements/mvp-requirements.md), plus the business
rule `BR-59` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), to their
guards: the pins that exist on disk at this spec head, the guard
registry `ERR1`–`ERR9`, and the evidence rule `ERR-E1`.

Written before the implementation PR. Every guard in the registry is a
**named, missing obligation** at this head — the four services answer
the 500 with the wrong token and none of the four maps carries an
internal-error entry — so no row here marks a guard complete before it
exists and passes, and the slice is not complete until the
implementation PR merges and `qa-lead` re-pins every row at the merged
head (the `#588 -> #599` pattern). Section 2 cites what is on disk today
and what it proves; section 3 names the guards the implementation PR
must create; section 5 is the test plan it must run.

Companion specs: the product decision D-33 in
`docs/project/decision-log.md`
[the decision log](../project/decision-log.md); the contract
registration and the technical taxonomy in
`contracts/errors/envelope.json` and
`docs/technical/error-handling.md`
[section 1](../technical/error-handling.md); the layer ownership, the
per-service path, and the failure/rollback statement in
`docs/architecture/lld.md` [section 28](../architecture/lld.md) (28.1
what the contract registers, 28.2 the unexpected-exception path per Node
service with its edge trace, 28.3 failure, rollback, and what does not
change); and the sibling tests this slice must not disturb: the
`traceability-matrix.md` sections 9–16 and 20 rows plus their
registries (`checkout-settlement-test-traceability.md` `S1`–`S12`,
`departure-release-test-traceability.md` `DR1`–`DR13`,
`arrival-reassign-test-traceability.md` `RR1`–`RR13`,
`booking-management-view-test-traceability.md` `BM1`–`BM16`,
`folio-write-verification-test-traceability.md` `FW1`–`FW13`). This
spec implements no code, changes no guard, adds no catalogue key, and
moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `product-owner` and `architect` (LLD section
  28): a caller-visible wire-vocabulary change — one new `code` token on
  the `5xx` path plus a grown contract enum — with no new subsystem,
  dependency edge, data model, lifecycle state, event, or
  reader-visible surface. ADR-0004 D1 already covers additive error
  codes, so no new ADR.
- Four Node services only: Stay, Guests, Rooms, and Admin. The Go and
  Billing conformance changes that consume `METHOD_NOT_ALLOWED` (405)
  are #628 and #629; the Go/Java `5xx` mappings are separate issues.
  Deduplicating the four `errors.ts` copies into a shared module is a
  repo-layout decision with its own issue and is out of scope here.
- No MVP row moves. No `FR-RES-*`, `FR-FDK-*`, `FR-RMS-*`, `FR-RTE-*`,
  `FR-GST-*`, `FR-BIL-*`, `FR-RPT-*`, `FR-ADM-*`, or `FR-CUS-*`
  condition changes; the 57-row MVP coverage count in
  `traceability-matrix.md` stands unchanged and no MVP row may cite
  this slice as its guard. The slice rows live in
  `traceability-matrix.md` section 21.
- No new NFR (requirements section 29.4 is a no-change statement). The
  existing guards hold: `NFR-I18N-1` (the fault sentence stays the
  `error.transport.unexpected` catalogue string and no token is
  rendered), `NFR-AUD-1` (no audit entry is added; `traceId` correlation
  is unchanged), `NFR-AVL-1` (a fault stays an unreadable outcome under
  the taxonomy section 4 rule), `NFR-PERF-1` (no call, retry, backoff,
  or wait is added), `NFR-CON-1`/`NFR-CON-2` (idempotency and the paired
  writes are untouched), `NFR-SEC-1`/`NFR-SEC-2` (no role change; a
  rejected session keeps `UNAUTHENTICATED`), `NFR-DSK-2` (no print rule
  moves), and `NFR-TZ-1`/`BR-43` (no date form changes).
- No desk change: no route, layout, catalogue key, sentence, or print
  rule moves. A failed read already renders the shell's plain
  request-failed sentence (`app/src/views/RoomsView.vue:677-681`) and a
  desk guard already forbids a raw envelope token or a status number in
  rendered text (`app/src/views/desk-edge-guards.test.ts:41-46`), so
  the token reaches no screen (`AC-ERR-5`).
- No schema, table, column, migration, stored value, event, or
  backfill. Change-level rollback is one revert: the four catch-all
  literals fall back to `VALIDATION_FAILED`-on-500 and the enum loses
  the three tokens.
- **Known transitional red at this stack head.** The contract enum and
  `statusMapping` change lands ahead of the four maps (LLD 28.1), so
  `services/admin` `npm test` fails today on the contract-sync walk
  (`services/admin/src/errors.test.ts:25-29`) with
  `METHOD_NOT_ALLOWED: undefined !== 405` — the guard is doing its job.
  Stay (31/31), Guests (20/20), and Rooms (22/22) stay green because
  none of them reads the contract. CI does not show it because
  `node-build` runs only when a `services/` path changes, and the spec
  PRs touch `docs/` and `contracts/errors/` only. The implementation
  PR's map edit (`ERR5`) is what turns that guard green, so a green
  four-service baseline requires `ERR5` first; the rest of section 5
  runs on the Stay, Guests, and Rooms suites, which are green today.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is identical to the stacked spec PRs' base (the product, contract,
and requirements spec PRs touch `docs/` and `contracts/errors/` only).
They prove today's behaviour: every Node catch-all answers a 500 with
`VALIDATION_FAILED`, and no Node map carries an internal-error token.
The implementation PR extends these in place with a `#627` note and
never deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/stay/src/server.ts:74-89` (`createServiceServer`) | The catch-all: `.catch` at `:76`, the `HttpError` arm at `:77-78` (`writeJson(res, err.status, errorEnvelope(err))`), and the else arm at `:79-86` writing a `500` body at `:80-85` with the literal `code: "VALIDATION_FAILED"` at `:81`, `msg("error.transport.unexpected", {})` at `:82`, `details: {}` at `:83`, `traceId: randomUUID()` at `:84` | Only `:81` changes, to `INTERNAL_ERROR`; `ERR1` asserts the whole envelope at that arm |
| `services/guests/src/server.ts:45-60` | The same shape: `.catch` at `:47`, `HttpError` arm `:48-49`, else arm `:50-57`, `500` body `:51-56`, the literal at `:52` | `ERR2` |
| `services/rooms/src/server.ts:45-60` | The same shape: `.catch` at `:47`, `HttpError` arm `:48-49`, else arm `:50-57`, `500` body `:51-56`, the literal at `:52` | `ERR3` |
| `services/admin/src/server.ts:53-68` | The same shape: `.catch` at `:55`, `HttpError` arm `:56-57`, else arm `:58-65`, `500` body `:59-64`, the literal at `:60` | `ERR4` |
| `services/{stay,guests,rooms}/src/errors.ts:4-11`, `:13-21` | The `ErrorCode` union and `STATUS_BY_CODE` register seven refusal codes and no internal-error, upstream, or method token; `HttpError` reads its status from that map at `:31` | `ERR5`, `ERR6` extend each map with `INTERNAL_ERROR` 500, `UPSTREAM_UNAVAILABLE` 503, and `METHOD_NOT_ALLOWED` 405 |
| `services/admin/src/errors.ts:4-12`, `:14-23` | The same seven plus `IDENTITY_LOCKED` 401 — the only map entry the three sibling services do not carry | `ERR5` keeps the admin-only entry and adds the same three tokens |
| `services/admin/src/errors.test.ts:12-17`, `:19-23`, `:25-29` | The contract-sync guard: it reads `contracts/errors/envelope.json`, pins `IDENTITY_LOCKED` 401, and constructs **every** `statusMapping` entry through `new HttpError(code, "refused").status`. At this stack head it is **red** — `METHOD_NOT_ALLOWED: undefined !== 405` — because the contract moved ahead of the map | Extended by `ERR5`, which adds the three map entries and turns this walk green; it must then stay green untouched, which is what makes the enum and the four maps move together |
| `contracts/errors/envelope.json:9`, `:16-28` | The `code` enum already lists the three tokens (`:9`) and `statusMapping` already carries `METHOD_NOT_ALLOWED` 405 (`:25`), `INTERNAL_ERROR` 500 (`:26`), and `UPSTREAM_UNAVAILABLE` 503 (`:27`); the four Node maps do not follow yet | The contract half lands in the architect spec PR; `ERR9` verifies the registration and `ERR5`/`ERR6` verify the maps follow |
| `docs/technical/error-handling.md:11-39` | The taxonomy names the whole vocabulary including `UPSTREAM_UNAVAILABLE` (`:26-28`), `INTERNAL_ERROR` (`:29-34`), and `METHOD_NOT_ALLOWED` (`:35-39`) with their statuses | `ERR9` verifies the delta is described; the file is `architect`-owned and this slice does not author it |
| `services/stay/src/messages.test.ts:21` | The 500 sentence is catalogue-owned and byte-pinned: `error.transport.unexpected` renders `Unexpected failure handling the request.` | `ERR1`–`ERR4` assert `body.message` equals `msg("error.transport.unexpected", {})`, so a driver-leaking message fails |
| `messages/en.json:7`, `messages/vi.json:7` | The same key exists in both locales; the VI rendering is `Xử lý yêu cầu thất bại ngoài dự kiến.` | No key is added or removed; `ERR8` and `script/catalogue-coverage-check.sh` prove it |
| `services/stay/src/pgstore.ts:205-219`, `:299-301`, `:352-363` | The Postgres store throws `HttpError` only for a product refusal (`NOT_FOUND` at `:212-214` and `:352-354`, `STATE_ILLEGAL` at `:215-219` and `:300`, `VALIDATION_FAILED` at `:358-363`) while its pool and client calls (`:194-204`, `:344-346`) are unguarded | This is why a driver error is an ordinary exception and lands in the catch-all's else arm — the finding; `ERR1` reproduces it through a stub store that throws a plain `Error` |
| `services/reservations/internal/service/service.go:76-83` | Reservations already answers `UPSTREAM_UNAVAILABLE` 503 (`restrictionsUnavailable`), which the enum now registers | Unchanged; `ERR-7` keeps that meaning intact and `ERR5` maps the token |
| `services/stay/src/server.ts:101-108`, `:167-174`; the same pair in the three siblings (`guests:72-79`, `:141-148`; `rooms:72-79`, `:161-168`; `admin:86-93`, `:144-151`) | A wrong method on a known operation path, or an unknown operation, answers `404 NOT_FOUND` | Unchanged; Node emits no `405`, and `ERR7` pins that |
| `services/stay/src/store.ts:130` (`StayStoreAPI`), `services/guests/src/store.ts:138` (`GuestStoreAPI`), `services/rooms/src/store.ts:167` (`RoomStoreAPI`), `services/admin/src/store.ts:115` (`AdminStoreAPI`) | Each server takes its store as a constructor argument (`server.ts:74`, `:45`, `:45`, `:53`), so a test can inject a store whose operation throws | `ERR1`–`ERR4` inject that stub; the pattern already exists at `services/rooms/src/server.test.ts:27-39` and `services/admin/src/server.test.ts:31-40` |
| `services/stay/src/server.test.ts:48-56`; `guests:43-51`; `rooms:50-56`; `admin:51-57` | The existing refusal pin per service: an unknown path answers `404 NOT_FOUND` with the envelope | Must pass unchanged; they are the `FR-ERR-3` half of the run |
| `services/rooms/src/server.test.ts:60-66`; `admin/src/server.test.ts:103-108` | Missing-token refusals answer `UNAUTHENTICATED` | Must pass unchanged |
| `services/admin/src/server.test.ts:137`, `:175`, `:313-333`, `:370`; `guests/src/server.test.ts:158`, `:353-379`; `stay/src/server.test.ts:317` | `VALIDATION_FAILED` refusals keep their code on malformed input | Must pass unchanged, and no assertion may move to the 500 path |
| `app/src/views/desk-edge-guards.test.ts:41-46` (`expectNoRawLeak`, `INTERNAL` already in the regex at `:42`), used at `:621`, `:687`, `:1057`, `:1078`, `:1104`, `:1131` | No raw envelope token, status number, brace, or stack/trace text reaches rendered text; the generic sentence the desk shows instead is pinned at `:620` (`That did not work`) | Green unchanged; `ERR8` needs no new desk case, because the change adds no sentence |
| `app/src/views/RoomsView.vue:669-681` (`loadError` fallback, the `desk.shell.request_failed` call at `:677-681`), `app/src/api/client.ts:164`, `:195` | A failed read renders the shell's plain request-failed sentence and the client never surfaces the token | Green unchanged (`AC-ERR-5`) |
| `script/contract-check.sh` (JSON parse over `contracts/**`, then the curated OpenAPI gate) and `script/openapi-route-check.sh` | The contract-shape gates | `ERR9` keeps both green; no `contracts/http/` operation changes in this slice |
| `script/catalogue-coverage-check.sh` | The EN/VI catalogue parity gate (run in CI's `ci` job) | `ERR8` keeps it green with no key added |

## 3. Guard registry ERR1–ERR9 and the evidence rule ERR-E1

Nine obligations. `ERR1`–`ERR6` are **missing guards** the
implementation PR creates: `ERR1`–`ERR4` one per Node service in that
service's `server.test.ts`, and `ERR5`/`ERR6` across the four
`errors.test.ts` files (Admin's exists and is extended; the three
siblings get one). `ERR7`, `ERR8`, and `ERR9` are gate rows the same PR
must prove green: `ERR7` passes today on Stay, Guests, and Rooms and
must stay untouched, `ERR9` is already satisfied by the architect's
contract change at this head (`script/contract-check.sh` and
`script/openapi-route-check.sh` both PASS), and `ERR8` last ran green in
CI on the master commit that last changed `app/`. `ERR5` is also the
guard that clears the stack's one transitional red (section 1): the
contract moved ahead of the maps, so Admin's contract-sync walk fails
until the map edit lands. A fault-path guard is not complete on the
returned status alone: every case also asserts the envelope field set,
the catalogue sentence, a non-empty `traceId`, and — as a positive
control — that an `HttpError` refusal on the same route still answers
its own code and status, because a catch-all that answers
`INTERNAL_ERROR` for everything would pass a status-only check.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `ERR1` | **Stay fault answer (`AC-ERR-1`, `FR-ERR-1`)**: inject a `StayStoreAPI` stub whose operation throws a plain `Error` (not an `HttpError`); assert the answer is HTTP `500`, a JSON body with **exactly** the four envelope keys (`code`, `message`, `details`, `traceId`), `code === "INTERNAL_ERROR"`, `code !== "VALIDATION_FAILED"`, `message === msg("error.transport.unexpected", {})` (no driver, SQL, host, path, or stack text), `details` deep-equal `{}`, and a non-empty `traceId`; then assert the **next** request on the same server answers normally, and that an `HttpError` refusal on the same route still answers its own code and status (the positive control) | `services/stay/src/server.test.ts` |
| `ERR2` | **Guests fault answer (`AC-ERR-1`, `FR-ERR-1`)**: the same seven assertions against a `GuestStoreAPI` stub that throws a plain `Error`, plus the next-request and `HttpError`-refusal controls | `services/guests/src/server.test.ts` |
| `ERR3` | **Rooms fault answer (`AC-ERR-1`, `FR-ERR-1`)**: the same seven assertions against a `RoomStoreAPI` stub that throws a plain `Error`, plus the next-request and `HttpError`-refusal controls (the `withServer(store)` helper at `:27-39` already accepts a store) | `services/rooms/src/server.test.ts` |
| `ERR4` | **Admin fault answer (`AC-ERR-1`, `FR-ERR-1`)**: the same seven assertions against an `AdminStoreAPI` stub that throws a plain `Error`, plus the next-request and `HttpError`-refusal controls (the `withServer(store)` helper at `:31-40` already accepts a store) | `services/admin/src/server.test.ts` |
| `ERR5` | **Four-map conformance (`AC-ERR-2`, `FR-ERR-2`)**: `INTERNAL_ERROR` resolves to `500`, `UPSTREAM_UNAVAILABLE` to `503`, and `METHOD_NOT_ALLOWED` to `405` through `new HttpError(code, "refused").status` in **all four Node maps** — `services/stay/src/errors.ts`, `services/guests/src/errors.ts`, `services/rooms/src/errors.ts`, and `services/admin/src/errors.ts` — and every `statusMapping` entry in `contracts/errors/envelope.json` resolves in each map it claims, with `IDENTITY_LOCKED` 401 remaining the admin-only entry the three siblings keep out. This case turns Admin's existing contract-sync walk (`services/admin/src/errors.test.ts:25-29`, red at this stack head) green and keeps it green | new `services/{stay,guests,rooms}/src/errors.test.ts`; extended `services/admin/src/errors.test.ts` |
| `ERR6` | **No-drift guard (`AC-ERR-2`, `FR-ERR-2`)**: for each of the four services the map's code set equals the contract's `statusMapping` key set minus the documented admin-only exception, in **both** directions — an enum code missing from a map fails, and a map entry the enum omits fails — and an unregistered token (`new HttpError("NOT_A_CONTRACT_CODE" as ErrorCode, "x").status`) resolves to no status, so the map cannot silently invent an answer for a code the contract does not list | the same four `errors.test.ts` files |
| `ERR7` | **Refusal pins unchanged (`AC-ERR-3`, `FR-ERR-3`) — re-run, no edit**: the four unknown-path `NOT_FOUND` cases, the missing-token `UNAUTHENTICATED` cases, and every `VALIDATION_FAILED` case in the four service suites pass with their assertions untouched; the four maps keep every refusal status; a wrong method on a known operation path and an unknown operation still answer `404 NOT_FOUND` from a Node service (no Node route answers `405`); no product refusal is reclassified as `INTERNAL_ERROR` | `services/{stay,guests,rooms,admin}/src/server.test.ts`, the four `errors.ts` maps — no edit permitted |
| `ERR8` | **Desk and catalogue unchanged (`AC-ERR-5`) — re-run, no edit**: the desk no-leak guard (`expectNoRawLeak` already rejects `INTERNAL`), the plain request-failed sentence pins, the desk suites, and `script/catalogue-coverage-check.sh` are green with no key added or removed; no route, layout, or print rule moves | `app/src/views/desk-edge-guards.test.ts`, `app/src/views/*.test.ts`, `messages/en.json`, `messages/vi.json`, `script/catalogue-coverage-check.sh` — no edit permitted |
| `ERR9` | **Contract and LC gate (`AC-ERR-2`, `FR-ERR-2`)**: `contracts/errors/envelope.json` lists `INTERNAL_ERROR` 500, `UPSTREAM_UNAVAILABLE` 503, and `METHOD_NOT_ALLOWED` 405 in both its `code` enum and its `statusMapping`; `docs/technical/error-handling.md` section 1 describes all three with their statuses; `script/contract-check.sh` and `script/openapi-route-check.sh` are green; no `contracts/http/` operation file changes, so no served or derived copy drifts | `contracts/errors/envelope.json`, `docs/technical/error-handling.md`, `script/contract-check.sh`, `script/openapi-route-check.sh` |
| `ERR-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build and records the before/after pair in `docs/testing/evidence/627/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` section 3). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping
it to covered only when the guard passes. The refusal pins, the desk
pins, and the BR-59 refusal clause are covered **by re-run today** —
they exist and pass and must keep passing untouched — but the slice as a
whole stays incomplete. The service-side pins were re-run at this head
(Stay 31/31, Guests 20/20, Rooms 22/22 green; Admin 27 pass, 1 skip, and
the contract-sync failure of section 1); the desk pins last ran in CI on
the master commit that last changed `app/` (`464b864`, run green), and
no `app/` path changed since, so they are the same code and tests.

| Item | Required guard | Guard |
|---|---|---|
| `AC-ERR-1` — an unexpected exception in any operation of Stay, Guests, Rooms, or Admin answers HTTP 500 with the shared envelope, `code` equal to `INTERNAL_ERROR` and never `VALIDATION_FAILED`, the plain unexpected-failure sentence with no driver/SQL/host/path/stack text, no invented `details` field, and a `traceId`; the same service answers its next request normally (traces to `FR-ERR-1`, `FR-DSP-3`, `NFR-I18N-1`, `NFR-AUD-1`) | L1 acceptance: one fault case per service plus the next-request control | **Pending** — `ERR1`, `ERR2`, `ERR3`, `ERR4`; today's opposite is pinned at `services/stay/src/server.ts:81`, `guests:52`, `rooms:52`, `admin:60` |
| `AC-ERR-2` — the contract lists `INTERNAL_ERROR` (500), `UPSTREAM_UNAVAILABLE` (503), and `METHOD_NOT_ALLOWED` (405) in its enum and `statusMapping`, the taxonomy describes them, every served or derived copy matches under `contract-check`, and each of the four Node maps accepts the three tokens at those statuses (`IDENTITY_LOCKED` staying admin-only), so no service emits a code outside the contract (traces to `FR-ERR-2`, ADR-0004 D1) | L1 + LC: the four maps, the contract-sync walk, the no-drift pair, the two check scripts | **Pending** — `ERR5`, `ERR6`, `ERR9`; the enum is `contracts/errors/envelope.json:9` and the mapping `:16-28`, and the maps are `services/{stay,guests,rooms}/src/errors.ts:4-21` and `admin:4-23`. The contract half is already on disk at this head, so Admin's contract-sync walk (`services/admin/src/errors.test.ts:25-29`) is **red** until `ERR5` lands |
| `AC-ERR-3` — every existing refusal keeps its code and status (`VALIDATION_FAILED` 400, `UNAUTHENTICATED` 401, `IDENTITY_LOCKED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `SETTLEMENT_REQUIRED` 409, `STATE_ILLEGAL` 422, `UPSTREAM_UNAVAILABLE` 503) and nothing is reclassified as an internal error, so `AC-FDK-2`, `AC-CKO-1`, and `AC-CKO-2` hold as written (traces to `FR-ERR-3`) | L1: re-run of the refusal pins, no assertion moved | **Covered by re-run; re-pinned only when the fault guards are green** — `ERR7`; the pins are `services/stay/src/server.test.ts:48-56`, `:147-163`, `guests:43-51`, `:139-163`, `rooms:50-66`, `admin:51-57`, `:103-108`, plus `services/reservations/internal/service/service.go:76-83` for the 503 meaning |
| `AC-ERR-4` — each of the four Node services carries a guard that drives its unexpected-exception path with a failure that is not an `HttpError` and asserts HTTP 500, a JSON reply, the four envelope keys, and `code: "INTERNAL_ERROR"` — never `VALIDATION_FAILED` — plus a guard pinning that no service emits a code outside the contract enum, with `contract-check` and the Admin contract-sync guard green (evidence condition; no behaviour change) | L1 + LC + evidence | **Pending** — `ERR1`–`ERR4`, `ERR5`, `ERR6`, `ERR9`, and `ERR-E1` for the record |
| `AC-ERR-5` — every desk screen and print surface behaves exactly as today for these answers: the plain request-failed sentence for a failed read, the unreadable-outcome rule for a `5xx`, the existing refusal sentences for `4xx`, no rendered token, no new catalogue key, no route/layout/print change (traces to `FR-DSP-3`, `NFR-I18N-1`) | Behaviour re-run: desk suites, no-leak guard, catalogue gate | **Covered by re-run at this spec head** — `ERR8`; pins are `app/src/views/desk-edge-guards.test.ts:41-46` (with `:621`, `:687`), `app/src/views/RoomsView.vue:677-681`, `app/src/api/client.ts:164`, `:195`, `messages/en.json:7`, `messages/vi.json:7`. They must pass unchanged after the implementation PR |
| `FR-ERR-1` — an unexpected failure answers `INTERNAL_ERROR`, never `VALIDATION_FAILED`, with the four-field envelope, the plain sentence, empty `details`, a present `traceId`, a next request answered normally, the same answer on a retry, and every named refusal keeping its own code and status (section 29.3) | L1 acceptance: per-service fault case with the envelope-shape and refusal-split assertions | **Pending** — `ERR1`–`ERR4`, `ERR7`, `ERR8` |
| `FR-ERR-2` — the codes a service serves are the contract's one vocabulary: the enum and `statusMapping` register the three tokens, the taxonomy describes them, each of the four maps accepts them at those statuses, `contract-check` and the Admin contract-sync guard pass, and a later added code moves the maps and the guard in the same change (section 29.3) | L1 + LC: four-map conformance, no-drift, contract-shape gates | **Pending** — `ERR5`, `ERR6`, `ERR9` |
| `FR-ERR-3` — every existing refusal keeps its code, status, `message`, and `details`; a refusal and a fault on the same operation never share a token; the earlier refusal conditions hold; a Node service keeps `404 NOT_FOUND` for a wrong method or unknown operation and `405` stays unreachable from Node (section 29.3) | L1 acceptance: refusal re-run plus the wrong-method/unknown-operation pair | **Covered by re-run today; re-pinned with the slice** — `ERR7` and the positive control inside `ERR1`–`ERR4` |
| `BR-59` — a failure the system did not plan for is reported as an internal fault, never as bad input; `VALIDATION_FAILED` keeps its meaning only; the answer keeps the four fields, reads as one plain sentence with no internal detail, and carries a correlation id; the code vocabulary is the contract's single enum (business rules) | L1 acceptance + evidence: the fault answer in every service, the sentence, the correlation id, and the lab reproduction | **Pending** — `ERR1`–`ERR4`, `ERR8`, `ERR-E1`; today's behaviour breaches the rule at `services/stay/src/server.ts:81` and the three siblings, reached from `services/stay/src/pgstore.ts:205-219` on a store failure |
| Desk flows stay green (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`, `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`, and the #647/#648 pins) | Behaviour check: the check-out review, the settlement refusals, the departure completion, the reassignment path, and the booking register keep their words and calls | **Covered by re-run at this spec head** — `app/src/views/StayView.test.ts:1113-1233`, `:1308-1457`, `:1528-1629`, `:1630-1750`, `:1884-2040`, `app/src/views/PrintView.test.ts:273-342`, `:724-756`, `app/src/views/desk-edge-guards.test.ts:621`, `:687`, `app/e2e/stay.spec.ts`, `script/e2e-desk-loop.sh`. These must pass unchanged after the implementation PR; a flow edit fails the row |
| Contract and LC | Real delta: the envelope registers `INTERNAL_ERROR` 500, `UPSTREAM_UNAVAILABLE` 503, and `METHOD_NOT_ALLOWED` 405 in enum and mapping, the four maps follow, the taxonomy describes them, and both check scripts stay green; no `contracts/http/` operation changes | **Pending gate** — `ERR9`; the files are `contracts/errors/envelope.json`, `docs/technical/error-handling.md`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a schema, operation, envelope-field, or event change here is a re-tier finding (LLD 28.3) |
| MVP no-change statement | No new MVP row, story, or FR id; no `FR-*` or `NFR-*` wording moves; `BR-59` is the only added rule | **Pending gate** — the 57-row MVP coverage count stands unchanged in `traceability-matrix.md` and no MVP row cites this slice as its guard (requirements 29.2) |
| Evidence cross-reference (`ERR-E1`) | The finding is reproduced from an isolated lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/627/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 28](../architecture/lld.md)) |
|---|---|---|
| L1 Stay service | `ERR1` plus the `ERR7` refusals in the Stay suite, no database needed | `cd services/stay && npm ci && npm run build && npm test && npm run lint` (CI `node-build` matrix) |
| L1 Guests service | `ERR2` plus its refusals | `cd services/guests && npm ci && npm run build && npm test && npm run lint` (CI `node-build`) |
| L1 Rooms service | `ERR3` plus its refusals | `cd services/rooms && npm ci && npm run build && npm test && npm run lint` (CI `node-build`) |
| L1 Admin service | `ERR4`, `ERR5` (extended), `ERR6` plus its refusals | `cd services/admin && npm ci && npm run build && npm test && npm run lint` (CI `node-build`) |
| LC contract | `ERR5`, `ERR6`, `ERR9`: the envelope and the four maps against the single source, and the curated route gate | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`, plus the repo gate in CI `ci`) |
| Desk unit | `ERR8` re-run, with the #588/#600/#601/#646/#647/#648 pins | `cd app && npm ci && npm run build && npm run lint && npm test` (CI `app-build`) |
| Desk browser | The existing Playwright desk flows stay green; the change adds no browser-visible behaviour, so no new spec is required | CI `browser-e2e` |
| Live desk loop and lab | The loop stays green unchanged; the `ERR-E1` before/after pair uses the isolated lab | `script/e2e-desk-loop.sh` (CI `e2e-single-host`); isolated compose lab for the record |
| Gates | Catalogue parity, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `node-build` (the
four Node modules), `contract-check`, `app-build`, `browser-e2e`,
`e2e-single-host`, `go-build` (the Reservations 503 pin), and `ci`
(catalogue, links, harness conventions, pre-flight proof).

### Execution order

1. The four service suites with the new fault cases (`ERR1`–`ERR4`). A
   red case stops the run: the wrong token is the finding this slice
   fixes.
2. The map conformance and no-drift guards (`ERR5`, `ERR6`) — the first
   green to restore, because Admin's contract-sync walk is red at the
   stack head until the map edit lands.
3. The refusal re-run (`ERR7`) — the proof that nothing was
   reclassified; it must pass without an edit.
4. The contract and route gates (`ERR9`).
5. Desk unit and catalogue gates (`ERR8`), then the browser suite.
6. The live desk loop, then the lab reproduction and the before/after
   pair (`ERR-E1`).
7. The test-report row and the re-pin of section 4 at the merged head.

### Entry criteria

1. The #627 T2 spec set (product section 21, requirements section 29,
   `BR-59`, the contract enum, error-handling section 1, LLD section 28,
   and this document) carries a `SPEC-GATE PASS` on #627 or the spec
   stack.
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the contract enum genuinely carries
   the three tokens before the maps are edited. **Baseline state:** at
   the stack tip Stay (31), Guests (20), and Rooms (22) suites pass,
   while Admin passes 27 with one failure — the contract-sync walk —
   and one skip, the expected transitional red of section 1. A green
   Admin suite is an exit condition of this slice, not an entry
   condition.
3. The #588/#600/#601/#646/#647/#648 slices are merged, so the desk pins
   in section 2 are the real baseline.
4. The build under test is identified by commit and the lab seed matches
   `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).

### Exit criteria

1. `ERR1`–`ERR4` exist and pass, each asserting the full envelope, the
   catalogue sentence, the empty `details`, a non-empty `traceId`, the
   next-request control, and the `HttpError`-refusal positive control.
2. `ERR5` and `ERR6` pass across **all four** Node maps, and the Admin
   contract-sync guard passes without an edit.
3. `ERR7` and `ERR8` pass with their assertions untouched — no dropped
   refusal case, no new catalogue key, no desk flow edit.
4. `ERR9` is green: the enum and mapping carry the three tokens, the
   taxonomy describes them, and both check scripts pass.
5. `ERR-E1` is recorded: the `docs/testing/evidence/627/README.md`
   before/after pair and the `docs/testing/test-report.md` row.
6. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
7. Open failures are filed as issues with FR/NFR ids; no `risk-medium`
   failure is waived without owner approval.

### Negative controls

A guard that only checks `status === 500` or `code === "INTERNAL_ERROR"`
is insufficient.

- `ERR1`–`ERR4` each carry the positive control: an `HttpError` refusal
  on the same route must still answer its own code and status, so a
  catch-all that answers `INTERNAL_ERROR` for everything fails the case.
- `ERR1`–`ERR4` assert `message === msg("error.transport.unexpected",
  {})` and the exact four-key set, so a driver, SQL, host, path, or
  stack string — or an invented `details` field — fails.
- `ERR1`–`ERR4` assert a non-empty `traceId`, so an answer that drops
  the correlation id for a fault fails.
- `ERR5` and `ERR6` compare the maps with the enum in **both**
  directions and include the unregistered-token case; a guard that only
  walks `statusMapping` cannot catch a map entry the enum omits.
- `ERR7` fails on a loosened assertion, not only on a red test: the
  refusal cases are the `FR-ERR-3` proof and may not be rewritten.
- `ERR8` fails on a rendered token and on an added catalogue key, not
  only on a missing sentence.
- `ERR9` fails on a contract edit no map follows (the enum and `ERR5`
  are read together) and on a stale taxonomy description.

## 6. Owner verification cases (ERR-1..ERR-8)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
in-house stay, `api <module> <Operation>` bodies, and `psql` counts).
Steps are the same for each case unless stated: apply the hotel config,
sign in as `owner`, act as described, then read the reply and the desk
surface in both locales.

| Case | Setup | Expected |
|---|---|---|
| `ERR-1` | Stop the database the Node services use, then press a desk action that reads or writes through Stay | The reply is HTTP 500 with `code: "INTERNAL_ERROR"` — never `VALIDATION_FAILED` — carrying the plain `Unexpected failure handling the request.` sentence, an empty `details` object, and a `traceId`; no SQL, host, path, or stack text appears |
| `ERR-2` | Repeat the same fault for Guests, Rooms, and Admin | The same envelope and the same code on all three; no service answers a different token for the same meaning |
| `ERR-3` | Refusal control on the same build: a malformed body, a missing session token, and an unknown route | `400 VALIDATION_FAILED` naming the field, `401 UNAUTHENTICATED`, and `404 NOT_FOUND` exactly as today; no refusal reads `INTERNAL_ERROR` |
| `ERR-4` | Read `contracts/errors/envelope.json` and run `script/contract-check.sh` with the Admin suite | The enum and mapping list `INTERNAL_ERROR` 500, `UPSTREAM_UNAVAILABLE` 503, and `METHOD_NOT_ALLOWED` 405; the gate passes; the Admin suite resolves every mapping entry |
| `ERR-5` | After the fault, restore the database and repeat the same desk action | The action succeeds normally — one fault leaves the service serving |
| `ERR-6` | With the fault present, watch a desk screen (Rooms map and one read panel) in EN and VI | One plain sentence — `That did not work. Try again; if it keeps failing, tell the manager.` and its VI rendering — with no code, status number, brace, or trace text; the rest of the desk stays usable |
| `ERR-7` | Stop Rates and attempt a booking that has to check a stay restriction | The answer is `503 UPSTREAM_UNAVAILABLE` from Reservations, unchanged — a fault token never replaces the upstream meaning |
| `ERR-8` | Send a GET to a known Node operation path, then run the desk regression loop | `404 NOT_FOUND` (Node emits no `405`); the check-out review, settlement refusals, departure completion, reassignment path, booking register, and the live loop are unchanged |

## 7. Evidence rule ERR-E1

The implementation PR records, in `docs/testing/evidence/627/README.md`
(created by that PR, same capture method as the #588 record), one
before/after pair plus the finding, because the issue's scope asks for
the reproduction to live with the implementation:

- **The finding, reproduced on the pre-fix build from an isolated
  compose lab.** With the database stopped, a desk action through Stay,
  Guests, Rooms, or Admin answers HTTP 500 with `code:
  "VALIDATION_FAILED"` (`services/stay/src/server.ts:81` and the three
  siblings), so the reply reports the caller's input as wrong while the
  cause is a store failure reached through an unguarded pool call
  (`services/stay/src/pgstore.ts:205-219`, `:344-346`). Capture the
  reply body.
- **After**, the same steps against the fixed build: the same 500
  carries `code: "INTERNAL_ERROR"`, the plain catalogue sentence, an
  empty `details` object, and a `traceId`, in all four services.
- **Plus the honest refusal control:** the same build still answers
  `400 VALIDATION_FAILED` for a malformed body, `401 UNAUTHENTICATED`
  for a missing token, and `404 NOT_FOUND` for an unknown route, so the
  fix moves only the non-refusal path.
- **Plus the map check:** the four services' maps and the contract enum
  agree on the three tokens, and `script/contract-check.sh` passes —
  the pair that closes the drift `UPSTREAM_UNAVAILABLE` had.

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 13 rows mapped to `AC-ERR-1`..`AC-ERR-5`,
`FR-ERR-1`..`FR-ERR-3`, and `BR-59` plus the gate boxes; 3 rows are
covered by re-run today (`AC-ERR-3`, `AC-ERR-5`, `FR-ERR-3` — their pins
exist and pass and must keep passing untouched), and 10 are pending the
implementation PR: the condition and requirement rows whose guards are
the registry `ERR1`–`ERR9`, the `BR-59` evidence row, the desk-green
row, the contract/LC gate, the MVP no-change gate, and `ERR-E1`. One
transitional red is inherited from the spec stack: Admin's
contract-sync walk fails at this head because the contract registers the
three tokens before the maps (section 1), and `ERR5` closes it. The
slice is **not complete** at this spec head. It completes when the
implementation PR merges with `ERR1`–`ERR9` green, the section 2 pins
unchanged, `ERR-E1` recorded, and `qa-lead` re-pins every row in section
4 with `file:line` at the merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1063
