# Admin authenticate-before-parse and config-shape test traceability (Refs #639)

Status: active. Testing spec for the T2 Admin request-ordering and
config-write change ([issue #639](https://github.com/MingChen1501/hotel-mgmt/issues/639),
audit findings A2, A3, and A5 — the Admin service reads and parses every
request body before it checks the session, so an unauthenticated caller
gets the parse error and the parse work ahead of the auth answer;
`UpdateHotelConfig` stores any key with any value, shape-checking only
`name`, so a malformed `requiredGuestFields` write silently replaces the
mandatory-field list the Guests gate is specified to read; and the
service re-implements the Bearer parse the sibling Node services share),
owned by `qa-lead`. It maps the change's done-conditions — `AC-CFG-1`..
`AC-CFG-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md`
[section 26](../product/acceptance-criteria.md#26-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639) —
the requirements `FR-CFG-1`..`FR-CFG-3`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 34](../requirements/mvp-requirements.md#34-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639),
and the business rule `BR-64` with its per-key table in
`docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md#config-write-shapes-br-64)
to their guards: the pins that exist on disk at this spec head, the
guard registry `CFG1`-`CFG24`, and the evidence rule `CFG-E1`.

Written before the implementation PR. Every new guard in the registry is
a **named, missing obligation** at this head — the body is still read
before the session check (`services/admin/src/server.ts:144` versus
`:146-155`), no per-key shape table exists (`services/admin/src/store.ts:471-494`,
with only `name` checked), no new catalogue key exists, and
`services/admin/src/auth.ts` does not exist — so no row here marks a
guard complete before it exists and passes, and the slice is not
complete until the implementation PR merges and `qa-lead` re-pins every
row at the merged head (the `#588 -> #599` pattern). Section 1 states
the tier and the no-change rules; section 2 cites what is on disk today
and what it proves; section 3 names the guards the implementation PR
must create; section 4 is the traceability map; section 5 is the test
plan it must run; section 6 is the owner verification cases; section 7
the evidence rule; section 8 the slice status and the re-pin rule.

Companion specs: scope decision D-38 in `docs/project/decision-log.md`
[the decision log](../project/decision-log.md) and risk R-19 in
`docs/project/risk-register.md` [the risk register](../project/risk-register.md);
the request order, the module-local bearer helper, the shared per-key
table, the four per-flow diagrams, the contract decision, and the
verification plan in `docs/architecture/lld.md`
[section 33](../architecture/lld.md#33-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639);
the planned delta on the Admin service page
(`docs/architecture/services/admin.md`
[section 2](../architecture/services/admin.md), with the refusal edges in
section 4 and the error rows in section 6); the HLD row in
`docs/architecture/hld.md`
[section 25](../architecture/hld.md); the ordering and shape convention
in `docs/technical/api-spec.md`
[section 1](../technical/api-spec.md); the refusal in the taxonomy in
`docs/technical/error-handling.md`
[section 1.5](../technical/error-handling.md); and the `when` clauses in
`contracts/http/UpdateHotelConfig.json:31-35`. Sibling tests this slice
must not disturb: the `traceability-matrix.md` MVP rows and sections
9-16 and 20-25 plus their registries (`S1`-`S12`, `DR1`-`DR13`,
`RR1`-`RR13`, `BM1`-`BM16`, `FW1`-`FW13`, `ERR1`-`ERR9`, `BND1`-`BND28`,
`AMT1`-`AMT20`, `RPT1`-`RPT14`, and `GID1`-`GID14`). This spec
implements no code, changes no guard, adds no catalogue key, and moves
no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `product-owner` (acceptance criteria section
  26), `business-analyst` (requirements section 34), and `architect`
  (LLD section 33): caller-visible refusals on one operation family,
  with no new subsystem, dependency edge, data model, lifecycle state,
  endpoint, reader-visible surface, or error-code token. No ADR:
  ADR-0004 D1 keeps the shared envelope and its status mapping exactly
  as they are.
- **Authenticate before parsing, for every operation except `SignIn`.**
  A `POST /v1/admin/<Operation>` other than `SignIn` resolves the session
  before the body is read; the read, the 65 536-byte ceiling, the JSON
  object check, and the per-key rules then run in today's order. The
  observed order for a session-guarded operation is **401, then 400,
  then 403**: a request that is both unauthenticated and malformed
  answers 401, an authenticated malformed body answers today's 400, and
  the role refusal 403 is reached only for a well-formed body. `SignIn`
  keeps today's order exactly, because it is the one operation with no
  session to check.
- **The unauthenticated answer is one envelope, never a parse error.**
  HTTP 401, `code: "UNAUTHENTICATED"`, today's matching `error.auth.*`
  sentence (`error.auth.missing_token` when the header is absent; the
  existing invalid, expired, revoked, signed-out, or orphan sentence
  otherwise), `details` as today, and a fresh `traceId`. No
  `VALIDATION_FAILED`, and none of the `error.transport.bad_json`,
  `body_not_object`, or `body_too_large` sentences. The payload is never
  read or parsed, so its size, shape, and fields stay unobservable.
- **Route matching does not move.** `GET /healthz`, the
  `POST /v1/admin/<Operation>` match, and the unknown-path 404 stay
  before the session check and read no body; the four declared server
  bounds and `MAX_BODY_BYTES = 65536` do not change.
- **One per-key shape table is applied before the first write.** A
  present table key must carry its declared shape: `name` and `timezone`
  non-empty text after trimming; `standardCheckinTime` and
  `standardCheckoutTime` a 24-hour `HH:MM` time; `requiredGuestFields` a
  non-empty array of non-blank text entries with no two entries equal
  after trimming; `cancellationReasons` an array of non-blank text
  entries with `[]` allowed; `retentionFloorDays` a whole number at or
  above 0; `cancellationWording`, `address`, `phone`, and `email` text
  with `""` allowed. A key outside the table keeps today's behaviour,
  written as sent.
- **One refusal per write, naming the key, and nothing is written.**
  The first offending key refuses the whole request with exactly one
  HTTP 400 envelope: `code: "VALIDATION_FAILED"`, `details`
  `{"field": <key>}`, that key's catalogue sentence, and a fresh
  `traceId`. No key of that request is stored — the offending key and any
  valid key sent beside it — and no `config.updated` audit entry appears
  for it. A `values` that is not an object and a missing or blank
  `updatedBy` keep their existing refusals and their first place ahead of
  the per-key checks.
- **A satisfying write is exactly today's, in both stores.** Values are
  stored verbatim (no normalisation, trimming, coercion, or dropping),
  read back through `GetHotelConfig` unchanged, and recorded as
  `config.updated` entries with the caller's `updatedBy` and time. The
  in-memory and Postgres stores refuse the same values and store the same
  accepted values, so the Postgres `retentionFloorDays` rule stops being
  the odd one out.
- **No new vocabulary and no contract operation change.**
  `UNAUTHENTICATED` (401) and `VALIDATION_FAILED` (400) already exist in
  the contract enum and the Admin status map
  (`contracts/errors/envelope.json:9`, `:17-18`;
  `services/admin/src/errors.ts:4-29`), so no enum entry, status mapping,
  schema file, operation, request/response field, or version changes.
  `contracts/http/UpdateHotelConfig.json` gains error-list prose only.
- **A5 changes no answer.** The Bearer token is read through one
  module-local helper (`services/admin/src/auth.ts`, the same file the
  three sibling Node services carry; no cross-package import). The
  accepted and refused header forms and every resulting answer stay
  exactly as today, so the helper reuse is pinned by parity, not by a new
  behaviour claim.
- **No desk change, no migration, no configuration source.** The shared
  client still routes a 401 to the sign-in gate and the onboarding step
  still shows the plain request-failed sentence; no screen, control,
  route, label, desk state, or print rule changes, so no UI-contract
  section applies. The five new Admin sentences are service messages
  added to both canonical locales and the runtime mirror. No schema,
  table, column, migration, backfill, environment variable, deployment
  file, or per-hotel setting carries the ordering, a shape, or a
  sentence.
- **No MVP row moves:** the 57-row coverage count in
  `traceability-matrix.md` stands unchanged and no MVP `FR-*`/`NFR-*` row
  may cite this slice as its guard; the slice rows live in
  `traceability-matrix.md` section 26, and `FR-CFG-1`..`FR-CFG-3` are
  requirement additions outside the counted MVP capability set.
- Change-level rollback is one revert: the moved body read, the per-key
  check, the five sentences, the helper file, and the guards fall back to
  today's order and today's name-only check together, and every request
  the service accepted before is accepted again. No migration or data
  repair exists in either direction.
- **No transitional red at this spec head.** The branch is docs-only, so
  the code tree is the base the stacked spec PRs branched from. The Node
  and app suites were not re-run in this worktree as part of the spec
  work; they are the unchanged baseline the `node-build (admin)` and
  `app-build` CI jobs last ran, and the implementation PR runs them.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is identical to the stacked spec PRs' base (the product,
requirements, architecture, and testing spec PRs touch `docs/` only).
They prove today's behaviour: the body is read before the session is
checked, the service carries its own Bearer regex, `UpdateHotelConfig`
shape-checks only `name`, the two stores already disagree on
`retentionFloorDays`, and no ordering guard, per-key guard, per-key
sentence, or helper file exists. The implementation PR extends these in
place with a `#639` note and never deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/admin/src/server.ts:144` | `handleRequest` reads the body (`const body = await readBody(req, res)`) before any session check | `CFG1`-`CFG5`: the read moves below the `SignIn` branch and the token check for every other operation; the 401 cases fail if it stays here |
| `server.ts:146-150` | The `SignIn` branch consumes the body first — the one operation with no session to check | `CFG6`: `SignIn` keeps this order in both directions, with its lockout |
| `server.ts:151-155` | The token is read and `store.authenticate` runs only after the body parse | `CFG1`-`CFG6`: these become the first statements after route matching for non-`SignIn` operations |
| `server.ts:83-90` | A module-local `bearerToken` duplicates `services/guests/src/auth.ts:8-15` (`services/stay/src` and `services/rooms/src` carry byte-identical copies) | `CFG20`: replace with the module-local `src/auth.ts` helper; the header-form parity table proves no answer changes |
| `server.ts:131-134` | `GET /healthz` answers before route matching and reads no body | `CFG21`: stays green with and without a token |
| `server.ts:135-143` | The `POST /v1/admin/<Operation>` match and the unknown-path 404 run before the body read | `CFG21`: route matching does not move; an unknown path with or without a token answers today's 404 |
| `server.ts:19-76`, `:61-70` | `readBody` parses the body and refuses invalid JSON with `error.transport.bad_json` (`:69`) and a non-object with `body_not_object` (`:64`) | `CFG5`: today's 400 wording for a resolved session; `CFG1`/`CFG2`: never reached without a session |
| `server.ts:15-17`, `:30-34`, `:38-50` | The 65 536-byte ceiling refuses a declared content-length above it before the first chunk and stops streaming at byte 65 537 with `error.transport.body_too_large` | `CFG3`: an unauthenticated over-limit body answers 401 before this helper runs; `CFG21`: `SignIn` keeps the ceiling pair |
| `server.ts:112-115` | The four finite server bounds (5 000 / 10 000 / 15 000 / 10 000 ms) are declared before `listen` | `CFG21`: the timeout guard stays green untouched |
| `server.ts:99-110` | An `HttpError` renders the shared four-key envelope; anything else renders `INTERNAL_ERROR` | `CFG13`: every refusal assertion reads the four keys; `CFG21`: the internal-error guard stays green |
| `server.ts:156-200` | The operation switch runs after the session resolves; each route passes the body to its store method | `CFG5`, `CFG6`: the role 403 stays after the body read, so 400 precedes 403 |
| `server.test.ts:8-25` | The shared `request` helper JSON-stringifies its body (`:22`), so it cannot send a raw malformed string | `CFG1`-`CFG3`: the guard needs a raw-string form (or the `rawPost` shape from `bodyBound.test.ts:55-80`) |
| `server.test.ts:44-59` | `/healthz` and the unknown-path 404 cases exist with no envelope change | `CFG21`: re-run with no edit |
| `server.test.ts:84-103` | The 5-strike lockout case answers `IDENTITY_LOCKED` | `CFG6`: `SignIn` keeps its lockout and order; `CFG21`: re-run with no edit |
| `server.test.ts:105-111` | The nearest auth guard posts a well-formed `{}` with no token to `GetHotelConfig` and asserts 401 | `CFG1`-`CFG4`: extend with malformed raw bodies on `UpdateHotelConfig`; this case stays unedited |
| `server.test.ts:113-189` | An owner save stores `name`/`timezone`/`standardCheckinTime` and reads back (`:147-167`), a blank `name` answers 400 `VALIDATION_FAILED` (`:169-177`), a front-desk caller gets 403 (`:179-187`) | `CFG7`, `CFG13`, `CFG14`, `CFG16`: extend beside these; the existing assertions stay byte-identical |
| `server.test.ts:191-272` | `standardCheckinTime: "15:00"`, `standardCheckoutTime: "11:00"`, and `cancellationWording` are stored and read back verbatim (`:212-213`), and a front-desk wording write answers 403 (`:262-270`) | `CFG8`, `CFG16`: the accepted boundary case reuses this shape; the 403 order clause is `CFG6` |
| `server.test.ts:653-695` | `QueryAuditLog` returns `config.updated` entries with actor, entity, and a descending timestamp order after a config write (`:669-690`) | `CFG14`, `CFG16`: the audit log is read before and after a refused write to prove no entry appears and committed writes keep theirs |
| `server.test.ts:751-790` | The unexpected-exception and same-route `HttpError` cases pin `INTERNAL_ERROR` and the code/status split | `CFG21`: re-run with no assertion edit |
| `bodyBound.test.ts:13-18` | The ceiling guards drive `SignIn` (an unknown identity answers 401 at the ceiling) | `CFG21`: `SignIn` remains the one body-carrying unauthenticated operation; the pair stays green |
| `bodyBound.test.ts:33-51` | `countingStore` proxies the store so a guard can prove the refused request reached no operation (`calls()`) | `CFG1`-`CFG4`: reuse this pattern; a 401 that read the body or called the store fails the count |
| `bodyBound.test.ts:55-80` | `rawPost` sends a raw body buffer with an optional declared `Content-Length` | `CFG1`-`CFG3`: the malformed, non-object, and over-limit unauthenticated cases reuse this helper |
| `bodyBound.test.ts:106-144` | The over-limit refusal, the 65 536/65 537 boundary pair, the declared-length refusal, and the no-operation evidence all pass | `CFG21`: must stay green with no edit |
| `bodyBound.test.ts:146-158` | The four finite bounds are asserted by value | `CFG21`: must stay green with no edit |
| `store.ts:471-494` | `updateConfig` checks the role (`:475-477`), `values` as an object (`:478-480`), `updatedBy` (`:481`), and only `name` (`:483-487`), then writes every entry as sent (`:488-492`) — the A3 breach | `CFG7`-`CFG14`: the per-key check goes after the existing refusals and before the write loop |
| `store.ts:106-111` | `requiredString` trims for the check only and returns the trimmed value; the caller keeps the original | `CFG7`, `CFG16`: `name`/`timezone` reuse the rule; no stored value is rewritten |
| `store.ts:160-173` | The seed serves `requiredGuestFields: ["fullName"]` (`:166`) and `cancellationReasons: []` (`:167`) | `CFG9`, `CFG10`, `CFG16`: the seed shapes prove the empty reason list is legitimate and the one-entry guest list is the floor |
| `store.ts:435-444` | `config.updated` entries derive from each record's `updatedBy`/`updatedAt`, newest first | `CFG14`: a refused write must leave this derivation untouched |
| `pgstore.ts:500-533` | The Postgres twin repeats the role, `values`, and `updatedBy` checks (`:504-510`) and writes profile-backed and jsonb-backed keys inside one transaction (`:512-530`) | `CFG14`, `CFG18`: the shared per-key check goes before `withTx`, so a refusal writes no row |
| `pgstore.ts:538-553` | `profileValue` refuses a non-integer or negative `retentionFloorDays` (`:545-552`) but coerces a text number through `Number(value)` (`:546`) — the rule the in-memory store lacks | `CFG11`, `CFG18`: the shared table makes both stores refuse the same values; the deliberate text-number narrowing is asserted |
| `pgstore.ts:34-42`, `:44-54` | `PROFILE_COLUMNS` single-homes seven keys in `admin.hotel_profile`; `CONFIG_DEFAULTS` seeds `requiredGuestFields: ["fullName"]` (`:50`) and `cancellationReasons: []` (`:51`) | `CFG17`, `CFG18`: the table applies to both the profile-backed and the jsonb-backed paths |
| `pgstore.test.ts:10`, `:30` | The Postgres suite reads `process.env["TEST_PG_URL"]` (`:10`) and skips when it is unset (`:30`) | `CFG18`: the parity case uses the same `TEST_PG_URL` skip contract |
| `pgstore.test.ts:31-56` | The config round trip signs in, reads `timezone: "UTC"`, updates it, and reads it back | `CFG18`: stay unedited; the parity guards extend beside it |
| `messages.test.ts:16-53` | The sampled-sentence guard pins every admin envelope string, including `error.validation.values_object` (`:48`) and `retention_floor` (`:49`) | `CFG19`: add one sample per new key beside these; the existing rows stay byte-identical |
| `messages.en.json:23-34`, `messages/en.json:33-34`, `messages/vi.json:33-34` | The Admin mirror, the canonical English catalogue, and the canonical Vietnamese catalogue carry the same validation keys at the same lines; there is no config-shape sentence | `CFG19`: add the five keys to the mirror and both canonical locales with matching `{field}` placeholders |
| `contracts/http/UpdateHotelConfig.json:15-19`, `:31-35` | The request manifest keeps `values` as `additionalProperties: true`; the error list already carries `UNAUTHENTICATED`, `FORBIDDEN`, and `VALIDATION_FAILED` with the architect's ordering prose | `CFG23`: no validator on the Admin path reads a schema keyword; only the error-list prose is in play, and both contract gates stay green |
| `services/admin/contract-tests/UpdateHotelConfig.json`, `GetHotelConfig.json` | The happy-path fixtures send `values` + `updatedBy` and expect the stored snapshot | `CFG23`: both fixtures stay byte-identical |
| `errors.ts:4-29`, `:31-42`, `:44-51` | `UNAUTHENTICATED` and `VALIDATION_FAILED` are in both the code token set and `STATUS_BY_CODE` (401/400), `HttpError` derives `status` from the map, and `errorEnvelope` renders the four keys with a fresh `traceId` | `CFG13`: every refusal assertion reads those four keys; `CFG23`: no token, enum, or mapping edit; `CFG21`: the mapping guard stays green |
| `errors.test.ts:30-34`, `:37-42`, `:44-49` | Every contract status maps to the same HTTP status in code, the internal/upstream/method tokens keep their statuses, and the enum matches in both directions | `CFG21`, `CFG23`: re-run with no assertion edit |
| `app/src/api/client.ts:7-10`, `:168-183` | Any 401 (or a 200 carrying `UNAUTHENTICATED`) clears the session and routes to sign-in | `CFG22`: a 401 from any admin call still lands on the sign-in gate; the desk guards stay green unedited |
| `app/src/views/OnboardingView.vue:744-747`, `:804-820`, `:752-769` | The wizard writes `name` (`:744-747`) and `timezone`/`address`/`phone`/`email`/`retentionFloorDays` (`:804-820`), and maps `FORBIDDEN` or otherwise the plain request-failed sentence (`:752-769`) | `CFG16`, `CFG22`: the wizard's payloads satisfy the table, and no desk state changes; no UI contract applies |
| `deploy/config/schema.json:92-96`, `:97-101` | The deployment set declares `requiredGuestFields` and `cancellationReasons` as arrays with `minItems: 1` | `CFG10`, `CFG16`: the API accepts an empty reason list while the installer keeps its one-or-more floor — a deliberate split, not a drift |
| `script/apply-hotel-config.sh:90-110`, `:114-116` | The deployment apply sends seventeen values, including the five table keys plus keys outside it (`propertyCode`, `currency`, `chargeItems`, …), through one `UpdateHotelConfig` call | `CFG17`: keys outside the table must keep working, because the apply script sends them |
| `script/validate-hotel-config.sh:87`, `:93-94`, `:144-149`, `:164-166` | The pre-flight enforces strict 24-hour `HH:MM` (`:87`, `:93-94`), one-or-more guest fields and reasons (`:144-149`), and a 30-day retention floor (`:164-166`) | `CFG8`, `CFG9`, `CFG16`: every payload the installer admits satisfies the API table; the installer's floor stays its own check |
| `grep -rn "src/auth.js\|config_required_fields\|config_time\|config_optional_text\|config_list\|config_text" services/admin` | No module-local bearer helper and none of the five new sentences exist at this head | The finding itself; `CFG1`-`CFG20` are the guards that would have caught it |

## 3. Guard registry CFG1-CFG24 and the evidence rule CFG-E1

Twenty-four obligations inside Admin plus one evidence record. `CFG1`-
`CFG20` and `CFG24` are **missing guards** the implementation PR creates
(the four unauthenticated refusals, the no-work proof inside them, the
authenticated malformed regression, the ordering case, the eleven table
keys in six guard groups, the envelope/sentence check, the whole-write proof, the
existing-refusals-first case, the accepted boundaries, the outside-table
key, the Postgres parity, the catalogue keys, the bearer parity table,
and the diff gate); `CFG21`-`CFG23` are re-runs and gates the same PR
proves. A refusal guard is not complete on the status alone: every
refusal case also asserts the exact four-key envelope, `code`,
`details.field`, the exact catalogue sentence, a non-empty `traceId`, and
one answer — a guard that refuses everything at 400, or that accepts
another 400 sentence, would pass a status-only check.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `CFG1` | **Unauthenticated invalid JSON answers 401, never a parse error (`AC-CFG-1`, `FR-CFG-1`, `BR-64`)**: a raw body such as `{"values": ` with **no** `Authorization` header on `POST /v1/admin/UpdateHotelConfig` answers exactly one HTTP 401 whose body has exactly `code`, `message`, `details`, `traceId`, `code === "UNAUTHENTICATED"`, `message === msg("error.auth.missing_token", {})` ("Missing session token."), today's `details`, and a non-empty `traceId`; it does **not** answer `error.transport.bad_json`; the counting store records zero calls | `services/admin/src/server.test.ts` (extend; new raw-body helper) |
| `CFG2` | **Unauthenticated non-object body answers 401 (`AC-CFG-1`, `FR-CFG-1`, `BR-64`)**: a raw body of `[1,2,3]` and separately `"text"` with no header answers the same 401 `UNAUTHENTICATED` envelope and never `error.transport.body_not_object`; the counting store records zero calls | the same suite |
| `CFG3` | **Unauthenticated over-limit body answers 401 (`AC-CFG-1`, `FR-CFG-1`, `NFR-BND-1`, `BR-64`)**: a raw 65 537-byte body and a 70 000-byte declared `Content-Length` with no `Authorization` header each answer the 401 `UNAUTHENTICATED` envelope and never `error.transport.body_too_large`; the counting store records zero calls, so the ceiling is not reached ahead of the session check | the same suite (reuse `paddedBody` from `bodyBound.test.ts:25-32`) |
| `CFG4` | **Unauthenticated invalid, expired, revoked, signed-out, or orphan session answers its existing sentence (`AC-CFG-1`, `FR-CFG-1`, `BR-64`)**: each token form with a malformed raw body answers 401 `UNAUTHENTICATED` with the matching existing `error.auth.session_invalid` / `session_idle` / `session_revoked` / `session_orphan` sentence, no parse sentence, and no config change; the store's `authenticate` is reached and the parse is not | the same suite |
| `CFG5` | **An authenticated malformed body still answers today's 400 (`AC-CFG-2`, `FR-CFG-1`, `BR-64`)**: with an owner token, invalid JSON answers HTTP 400 `code: "VALIDATION_FAILED"` with `error.transport.bad_json` and a non-object body with `error.transport.body_not_object`, exactly as today; `GetHotelConfig` is unchanged afterwards and no `config.updated` entry appears | the same suite |
| `CFG6` | **The order is 401, then 400, then 403, and `SignIn` keeps 400-first (`AC-CFG-2`, `FR-CFG-1`, `BR-64`)**: (a) a front-desk caller **without** a token and with a malformed body answers 401, not 400 or 403; (b) the same caller with a valid token and a malformed body answers 400; (c) the same caller with a valid token and a well-formed body answers 403 `FORBIDDEN`; (d) an unauthenticated `SignIn` with a malformed body still answers 400, and a well-formed `SignIn` answers as today; (e) a well-formed body with no token on `UpdateHotelConfig` answers today's 401 | the same suite (one case per ordering pair) |
| `CFG7` | **`name` and `timezone` shape (`AC-CFG-3`, `FR-CFG-2`)**: a blank `name` keeps today's 400 `VALIDATION_FAILED` with `error.validation.field_required` naming `name`; a blank, whitespace-only, non-string, or present-`null` `timezone` answers 400 `VALIDATION_FAILED`, `details` `{"field": "timezone"}`, `error.validation.config_text` ("timezone must be non-empty text."), a non-empty `traceId`; a non-blank `timezone` is stored as sent | the same suite |
| `CFG8` | **`standardCheckinTime`/`standardCheckoutTime` shape (`AC-CFG-3`, `FR-CFG-2`)**: each field sent as `24:00`, `8:00`, `0800`, `14:60`, `14:00:00`, a number, a boolean, or a present `null` answers 400 `VALIDATION_FAILED` naming that field with `error.validation.config_time` ("{field} must be a 24-hour HH:MM time."); the two fields are checked independently, so a bad check-out time refuses naming `standardCheckoutTime` | the same suite |
| `CFG9` | **`requiredGuestFields` shape — the audit's A3 case first (`AC-CFG-3`, `FR-CFG-2`, `FR-CUS-1`)**: a string in place of the array (the A3 case), an empty array, an empty entry, a whitespace-only entry, a non-text entry, and two entries equal after trimming each answer 400 `VALIDATION_FAILED` naming `requiredGuestFields` with `error.validation.config_required_fields`; `GetHotelConfig` still serves the seeded `["fullName"]` afterwards | the same suite |
| `CFG10` | **`cancellationReasons` shape (`AC-CFG-3`, `FR-CFG-2`, `FR-RES-3`)**: a non-array (object or string), a number entry, an empty entry, and a whitespace-only entry each answer 400 `VALIDATION_FAILED` naming `cancellationReasons` with `error.validation.config_list`; the empty array is **accepted** (`CFG16`) | the same suite |
| `CFG11` | **`retentionFloorDays` shape in both stores (`AC-CFG-3`, `FR-CFG-2`, `NFR-RET-1`)**: a fractional number (`365.5`), a negative number (`-1`), a text number (`"365"`), a boolean, and a present `null` each answer 400 `VALIDATION_FAILED` naming `retentionFloorDays` with the existing `error.validation.retention_floor`; the text-number case is the deliberate narrowing the LLD records, and both stores refuse it | the same suite plus `services/admin/src/pgstore.test.ts` (parity half) |
| `CFG12` | **`cancellationWording`, `address`, `phone`, `email` shape (`AC-CFG-3`, `FR-CFG-2`, `FR-ADM-1`)**: each key sent as a number, a boolean, an object, an array, or a present `null` answers 400 `VALIDATION_FAILED` naming that key with `error.validation.config_optional_text`; each key sent as `""` is **accepted** (`CFG16`) | the same suite |
| `CFG13` | **Every refusal is one correct envelope with its own sentence (`AC-CFG-3`, `AC-CFG-5`, `NFR-I18N-1`, `BR-64`)**: for one representative value per rule, `CFG7`-`CFG12` assert exactly the four envelope keys, the status and `code`, `details` deep-equal `{"field": <key>}`, the sentence from the table, and a non-empty `traceId`; a key sent beside another key's refusal never changes which sentence answers | the same suite |
| `CFG14` | **The whole write is refused and nothing is written (`AC-CFG-3`, `FR-CFG-2`, `NFR-AUD-1`, `BR-64`)**: a request that sends a valid key (`timezone`) beside an offending key (`requiredGuestFields`) stores neither — `GetHotelConfig` shows the previous values for both keys — and `QueryAuditLog` carries no `config.updated` entry for either key from that request, while the entries that existed before the attempt are unchanged; repeated for one in-memory and one Postgres run | `services/admin/src/server.test.ts` (extend) and `pgstore.test.ts` (parity half) |
| `CFG15` | **The existing refusals keep their first place (`AC-CFG-3`, `FR-CFG-2`)**: a `values` that is a string, an array, or `null` answers `error.validation.values_object` naming `values` even when a table key is also wrong; a missing, blank, or non-string `updatedBy` answers `error.validation.field_required` naming `updatedBy` even beside an offending table key — the per-key checks never pre-empt them | `server.test.ts` (extend) |
| `CFG16` | **Accepted boundaries are stored and read back verbatim (`AC-CFG-4`, `FR-CFG-3`, `BR-64`)**: one request sends a one-entry `requiredGuestFields`, `standardCheckinTime: "00:00"`, `standardCheckoutTime: "23:59"`, `retentionFloorDays: 0`, `cancellationReasons: []`, and `""` for `cancellationWording`, `address`, `phone`, and `email`; each is stored as sent, `GetHotelConfig` reads it back unchanged (no trimming, coercion, or dropping), and the `config.updated` entries carry the caller's `updatedBy` and a timestamp | `server.test.ts` (extend) and `pgstore.test.ts` (parity half) |
| `CFG17` | **A key outside the table is written as sent and an absent key is untouched (`AC-CFG-4`, `FR-CFG-3`)**: the deployment set's non-table keys (`propertyCode`, `currency`, `chargeItems`, `taxAndFeeRules`, `restrictions`, `discounts`, `ratePlans`, `roomTypes`, `noshowRule`, `openBalanceCheckoutRule`) are written exactly as sent, and a request that omits `timezone` leaves the stored `timezone` unchanged | `server.test.ts` (extend) |
| `CFG18` | **Postgres parity with the in-memory store (`AC-CFG-3`, `AC-CFG-4`, `FR-CFG-3`, `BR-64`)**: one `pgstore.test.ts` case (skipped unless `TEST_PG_URL` is set, the `:10`/`:30` contract) proves the same refused value (`requiredGuestFields: "fullName"`, `retentionFloorDays: "365"`) answers the same code, `details`, and sentence in both stores, and that one accepted boundary value is stored and read back identically; the existing round trip (`:31-56`) stays unedited | `services/admin/src/pgstore.test.ts` (extend) |
| `CFG19` | **The five new sentences exist in both locales and the mirror (`AC-CFG-5`, `NFR-I18N-1`)**: one sample row per key — `error.validation.config_text`, `config_time`, `config_required_fields`, `config_list`, `config_optional_text` — pins the exact sentence with `{field}` rendered; each key exists in `services/admin/src/messages.en.json`, `messages/en.json`, and `messages/vi.json` with the same placeholder; no sentence renders an envelope code, status number, stack trace, SQL, host, or path; `script/catalogue-coverage-check.sh` is green | `services/admin/src/messages.test.ts` (extend), the three catalogue files, and the gate |
| `CFG20` | **The shared bearer helper changes no answer (A5, `AC-CFG-5`, `FR-CFG-3`)**: `services/admin/src/auth.ts` exposes the module-local `extractBearer`; one parity case drives the header forms `Bearer tok`, `Bearer  tok ` (surrounding whitespace), `bearer tok`, `Bearer `, absent, and `Basic tok` through the helper and through the server on a session-guarded operation, asserting the same accepted/refused outcome as today and the same 401 sentence; the service imports no helper across services | `services/admin/src/server.test.ts` or a new `services/admin/src/auth.test.ts` (new), plus the diff gate in `CFG24` |
| `CFG21` | **Route matching, transport bounds, and unrelated suites do not move (`AC-CFG-2`, `AC-CFG-5`, `NFR-BND-1`..`NFR-BND-3`, `NFR-SEC-2`) — re-run, no assertion edit**: `/healthz` with and without a token, the unknown-path 404 with and without a token, the `SignIn` 65 536/65 537 pair and declared-length refusal, `MAX_BODY_BYTES === 65536`, the four finite server bounds, the `IDENTITY_LOCKED` lockout, the internal-error envelope, and the code-to-status mapping all answer exactly as before | `server.test.ts:44-59`, `:84-103`, `:751-790`, `bodyBound.test.ts:106-158`, `errors.test.ts:30-49` — no edit permitted |
| `CFG22` | **The desk does not change (`AC-CFG-5`) — re-run, no assertion edit**: a 401 from any admin call still clears the session and routes to sign-in; an unexpected config refusal still reads as the plain request-failed sentence and `FORBIDDEN` as the onboarding sentence; the admin console's config and audit reads behave as before; no screen, control, route, label, desk state, or print rule is added or renamed | `app/src/api/client.test.ts:55-81`, `app/src/views/AdminView.test.ts:229-465`, `app/src/views/OnboardingView.test.ts` — no edit permitted |
| `CFG23` | **Contract, envelope, and no-new-token gate (`AC-CFG-5`, `NFR-I18N-1`) — re-run, no edit**: `contracts/errors/envelope.json` keeps its four fields and its enum/status mapping, `contracts/http/UpdateHotelConfig.json` gains error-list prose only (no operation, request/response field, `additionalProperties` value, version, or `openapi.yaml` change), both happy-path fixtures are byte-identical, and `script/contract-check.sh` plus `script/openapi-route-check.sh` stay green | `contracts/**`, `services/admin/contract-tests/**`, both scripts — no edit permitted beyond the error-list prose |
| `CFG24` | **No-configuration, no-migration, and helper-placement gate (`AC-CFG-5`, `BR-64`)**: diff inspection records that (a) the ordering, the per-key table, and the five sentences are code rules and constants, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; (b) no schema, table, column, migration, backfill, or stored-value rewrite exists; (c) the body read sits below the session check for every non-`SignIn` operation and the per-key check sits above the first write in both stores; (d) the Bearer parse exists once in `services/admin/src/auth.ts` with no cross-service import | diff inspection recorded in the implementation PR body; `services/admin/src/{server,store,pgstore,auth}.ts`, `deploy/**`, `docs/devops/**`, `docs/operations/**` |
| `CFG-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build and records the before/after pair in `docs/testing/evidence/639/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` [section 3](test-strategy.md#3-exit-criteria-per-slice)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping
it to covered only when the guard passes. The existing auth, config,
audit, body-ceiling, error-mapping, and desk rows are covered **by
re-run today** where their pins exist and pass — they must keep passing
untouched — but the slice as a whole stays incomplete. The Node and app
suites were not re-run in this worktree (docs-only branch); they are the
unchanged baselines the `node-build (admin)` and `app-build` CI jobs
last ran, and the implementation PR runs both.

| Item | Required guard | Guard |
|---|---|---|
| `AC-CFG-1` — no `Authorization` header, or an invalid, expired, or revoked session, with a malformed body (invalid JSON, a non-object, or above 65 536 bytes) on `UpdateHotelConfig` answers exactly one HTTP 401 `UNAUTHENTICATED` with the matching existing `error.auth.*` sentence, `details` as today, and a `traceId`; no `VALIDATION_FAILED` and none of the transport sentences, and no config change (traces to `FR-ADM-1`, `FR-DSP-3`, `NFR-SEC-2`, `AC-BND-1`) | L1 acceptance: one malformed case per shape at HTTP level, the invalid-token variant, and the no-store-call evidence | **Pending** — `CFG1`-`CFG4`; today's opposite is the body read at `services/admin/src/server.ts:144` firing before the token check at `:151-155` |
| `AC-CFG-2` — a well-formed body with no session answers today's 401; a valid session with a malformed body answers today's 400 with the existing transport sentence; `SignIn` keeps today's order in both directions; a front-desk caller with a well-formed body answers 403, so the order is 401 before 400 and 400 before 403 (traces to `FR-ADM-1`, `FR-ADM-2`, `NFR-SEC-2`, `AC-BND-1`, `AC-BND-2`) | L1 acceptance: the five ordering pairs, the `SignIn` pair, and the unchanged well-formed 401 | **Covered by re-run today for the well-formed no-token 401 (`server.test.ts:105-111`), the `SignIn` lockout (`:84-103`), the authenticated 400 (`:169-177`), and the front-desk 403 (`:179-187`, `:262-270`); pending the explicit ordering pairs (`CFG6`) and the authenticated malformed-body regression (`CFG5`)** |
| `AC-CFG-3` — an authenticated `UpdateHotelConfig` whose value breaks its key's rule is refused with exactly one HTTP 400 `VALIDATION_FAILED`, `details` naming that key, the key's plain sentence, and a `traceId`; nothing is written, no `config.updated` entry appears, and a valid key sent in the same request is not stored (traces to `FR-ADM-1`, `FR-ADM-4`, `FR-CUS-1`, `FR-CUS-2`, `FR-RES-3`, `AC-ADM-1`, `AC-ADM-4`, `AC-CUS-1`, `AC-CUS-2`) | L1 acceptance: one refusal per rule with the envelope/sentence assertions, the A3 case first, and the whole-write proof | **Pending** — `CFG7`-`CFG14`; today's opposite is the name-only check at `services/admin/src/store.ts:483-487` followed by the unconditional write at `:488-492` |
| `AC-CFG-4` — an authenticated `UpdateHotelConfig` whose present values all satisfy the table behaves exactly as today: values stored verbatim, `GetHotelConfig` reads them back unchanged, `config.updated` entries carry the caller's `updatedBy` and time, both stores agree, and an outside-table key and an absent key keep today's behaviour (traces to `FR-ADM-1`, `FR-ADM-4`, `NFR-AUD-1`, `AC-ADM-1`, `AC-ADM-4`) | L1 acceptance: the accepted boundary set, the audit entries, the outside-table key, and store parity | **Covered by re-run today for the existing in-table answers (`server.test.ts:147-167`, `:206-247`, `pgstore.test.ts:31-56`) and pending the explicit boundary set, the audit assertion, the outside-table key, and parity (`CFG16`-`CFG18`)** |
| `AC-CFG-5` — `server.test.ts` carries the guards `AC-CFG-1`..`AC-CFG-3` name, including the `requiredGuestFields` refusal and the accepted boundaries; no contract token, status mapping, or schema file is edited; the five new sentences exist in both locales and the mirror with matching placeholders and the catalogue gate is green; no desk screen, control, route, label, state, or print rule changes; the existing identity, audit, body-ceiling, and internal-error suites stay green (traces to `FR-ADM-1`, `FR-DSP-3`, `NFR-I18N-1`, `NFR-SEC-2`, `NFR-AUD-1`; evidence condition) | L1 + evidence: the full guard set, the catalogue gate, the contract gates, the untouched suites, and the record | **Pending** — `CFG1`-`CFG20`, `CFG-E1`; the re-run halves are `CFG21`-`CFG23` |
| `FR-CFG-1` — a session-guarded Admin operation checks the session before it reads the body; unauthorized malformed and oversized bodies answer 401, a resolved session keeps today's 400, the front-desk 403 follows a well-formed body, `SignIn` keeps today's order, and route matching reads no body (requirements 34.3) | L1 acceptance: `CFG1`-`CFG6`, plus the unchanged route and transport cases | **Pending** — `CFG1`-`CFG6`; today's breach is `server.ts:144` |
| `FR-CFG-2` — a present value that breaks its key's table shape refuses the whole write naming the key with `VALIDATION_FAILED`, nothing written and no `config.updated` entry, the existing `values`/`updatedBy` refusals first, and an outside-table key written as sent (requirements 34.3) | L1 acceptance: `CFG7`-`CFG15`, `CFG17`, plus the sentence table | **Pending** — `CFG7`-`CFG15`, `CFG17`; today's breach is `store.ts:471-494` |
| `FR-CFG-3` — a write that satisfies the table is stored, read back, and audited exactly as today in both stores, boundaries included, the shared bearer helper changes no answer, and an absent key is untouched (requirements 34.3) | L1 acceptance: `CFG16`, `CFG18`, `CFG20`, plus the unedited round-trip cases | **Covered by re-run today for the existing round trips (`server.test.ts:191-272`, `pgstore.test.ts:31-56`) and pending the boundary, parity, and helper-parity cases (`CFG16`, `CFG18`, `CFG20`)** |
| `BR-64` — a session-guarded Admin request is answered only after the session is checked, one config write is checked against one per-key table before the first write, a refusal names the key with nothing written, both stores agree, and the ordering, shapes, and sentences are code rules, never configuration (business rules) | L1 acceptance + evidence: every refusal, the whole-write proof, the boundary set, the diff gate, and the lab record | **Pending** — `CFG1`-`CFG20`, `CFG24`, `CFG-E1` |
| `NFR-SEC-2` (unchanged) — a missing, invalid, expired, revoked, signed-out, or orphan session is refused 401 with its existing sentence before any parse work, the 5-strike lockout stands, and the 15-minute idle expiry is unchanged | L1: `CFG1`-`CFG4`, `CFG6`; re-run: the lockout and sign-out cases | **Covered by re-run today for the lockout and the well-formed 401 (`server.test.ts:84-103`, `:105-111`, `:490-527`) and pending the malformed-body ordering (`CFG1`-`CFG4`)** |
| `NFR-BND-1`..`NFR-BND-3` (unchanged) — the 65 536-byte ceiling, the parse and ceiling sentences, the four finite server bounds, and `MAX_BODY_BYTES` are unchanged; the ceiling applies to every request that reaches the body read, and `SignIn` keeps it exactly as today | L1: `CFG3` (the 401 outranks the ceiling), `CFG21`'s ceiling pair and bounds | **Covered by re-run today for `SignIn`'s ceiling pair, the declared-length refusal, the constant, and the bounds (`bodyBound.test.ts:106-158`) and pending the unauthenticated-over-limit case (`CFG3`)** |
| `NFR-AUD-1` (unchanged) — a refused config write records nothing and leaves no `config.updated` entry; a committed write keeps the acting `updatedBy` and its time | L1: `CFG14` (nothing written, no entry) and `CFG16`'s audit assertion | **Covered by re-run today for the committed-write half (`server.test.ts:653-695`) and pending the refusal half (`CFG14`)** |
| `NFR-I18N-1` (unchanged) — the five new Admin sentences resolve through the catalogue in both locales with matching placeholders, no sentence renders a code, status, or stack trace, and the catalogue gate is green | L1 catalogue: `CFG19`, `CFG13`; gate: `script/catalogue-coverage-check.sh` | **Covered by re-run today for the existing sentences (`messages.test.ts:16-53`) and pending the five new keys** |
| `FR-ADM-1` / `FR-ADM-4` (MVP rows, unchanged) — the hotel profile and policy values still save, read back, and reach the desk exactly as today, now through the shape table | L1 acceptance: the accepted boundary and outside-table cases on the same operation | **Covered by re-run today for the row itself (`server.test.ts:113-189`, `:191-272`) and pending the new refusals (`CFG7`-`CFG17`)** — the MVP guard slots in `traceability-matrix.md` section 1 stand unchanged and may not cite this slice |
| `FR-CUS-1` / `FR-CUS-2` (MVP rows, unchanged) — the required-guest-field list and the stay times and wording still save and read back verbatim, so the Guests mandatory-field gate keeps reading a conforming value | L1 acceptance: the `requiredGuestFields` refusal set and the boundary acceptance on the same operation | **Covered by re-run today for the row itself (`server.test.ts:191-272`) and pending the `requiredGuestFields` guards (`CFG9`, `CFG10`, `CFG16`)** |
| Desk flows and client stay green | Behaviour check: a 401 still routes to sign-in, the onboarding step still maps `FORBIDDEN` and otherwise the plain sentence, and the admin console reads config and audit as before | **Covered by re-run** — `CFG22`; `app/src/api/client.test.ts:55-81`, `app/src/views/AdminView.test.ts:229-465`, `app/src/views/OnboardingView.test.ts`; a screen, route, label, or print-rule edit fails the row |
| Contract and LC | Real delta: no contract token, status mapping, enum entry, operation, request/response field, or fixture changes beyond the `UpdateHotelConfig` error-list prose, the envelope keeps its four fields, and both check scripts stay green | **Covered by re-run today** — `CFG23`; the files are `contracts/http/UpdateHotelConfig.json`, `contracts/errors/envelope.json`, `services/admin/contract-tests/*`, `services/admin/src/errors.ts`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a token, enum, mapping, or schema change here is a re-tier finding (LLD 33.5, 33.8) |
| No-configuration and no-migration gate | Real delta: the ordering, the per-key table, and the five sentences are code rules and constants, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration file is added and no stored row is rewritten; the Bearer parse exists once, module-locally | **Pending diff gate** — `CFG24`; the fixed side is recorded in `docs/requirements/business-rules.md` section 9 (BR-64) |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-CFG-1`..`FR-CFG-3` are requirement additions outside the counted set and no NFR is added (requirements 34.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`CFG-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/639/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 33.6](../architecture/lld.md#336-verification-plan) and `docs/architecture/services/admin.md` [section 7](../architecture/services/admin.md#7-operations)) |
|---|---|---|
| L1 Admin server | `CFG1`-`CFG21` | `cd services/admin && npm ci && npm run build && npm test` |
| L1 Admin catalogue | `CFG19` and `CFG13`'s rendered-sentence half | the same `npm test` (the `messages.test.ts` half) |
| L1 Admin Postgres | `CFG11`, `CFG14`, `CFG16`, `CFG18` | the same `npm test` with `TEST_PG_URL` set; the `migrate-check` CI job applies the schema |
| L1 Desk client | `CFG22` | `cd app && npm test` (`vitest run`) |
| LC contract | `CFG23`: the manifests and fixtures byte-identical, both gates green | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`) |
| Gates | Catalogue parity, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |
| Lint | Both stacks' lint rules | `cd services/admin && npm run lint`; `cd app && npm run lint` |

CI jobs that must be green on the implementation PR: `node-build
(admin)`, `app-build`, `contract-check`, and `ci` (catalogue, links,
harness conventions). `e2e-single-host` runs on a `services/**` change
and must stay green: it installs the deployment config through
`UpdateHotelConfig`, so a wrong shape rule blocks the installer and
fails that job rather than passing silently. `browser-e2e` also runs on
a `services/**` change and must stay green with unchanged assertions
and snapshots. `dom-diff` runs only on an `app/**` change, which this
slice does not make, so it has nothing new to allowlist.
`perf-reporting-variant` and the timed desk check inside
`e2e-single-host` stay as they are: the session lookup is the one the
post-parse path already made, and a refused request now skips a parse
(LLD 33.7).

### Execution order

1. The ordering change in `handleRequest` and the raw-body helper
   (`CFG1`-`CFG3`) with the counting-store assertion — these fail
   loudly if the body is still read or the store is still reached
   without a session.
2. The token-form variants and the `SignIn`/route boundary (`CFG4`,
   `CFG6`) — the ordering pairs, including the well-formed 401 and the
   400-before-403 case.
3. The authenticated malformed-body regression (`CFG5`) — proves the
   move did not drop today's 400 wording.
4. The shared per-key table, rule by rule (`CFG7`-`CFG12`), then the
   envelope/sentence check (`CFG13`) — the narrowest proof that each
   rule answers its own key and its own sentence.
5. The whole-write proof (`CFG14`) and the existing-refusals-first case
   (`CFG15`) — the audit and stored-value assertions that make
   "nothing written" proven, not assumed.
6. The accepted boundaries (`CFG16`) and the outside-table key
   (`CFG17`), then the Postgres parity (`CFG18`).
7. The five catalogue keys and their samples (`CFG19`), with
   `script/catalogue-coverage-check.sh` re-run straight after, and the
   bearer parity table (`CFG20`).
8. The re-runs and gates (`CFG21`-`CFG24`), then the isolated-lab
   reproduction and the before/after pair (`CFG-E1`), the
   `test-report.md` row, and the re-pin of section 4 at the merged head.

### Entry criteria

1. The #639 T2 spec set (product section 26, requirements section 34,
   `BR-64`, LLD section 33, the Admin service page sections 2/4/6, the
   api-spec and error-handling deltas, the `UpdateHotelConfig` error-list
   prose, and this document) is on disk, and the `spec-reviewer` has
   posted `SPEC-GATE PASS` on #639 or the spec stack (#734 -> #735 ->
   #736 -> this PR).
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the decided order, table, sentences,
   and visual refusal edges are the ones on disk.
3. The #627/#630 and #588/#600/#601/#646/#647/#648 slices are merged, so
   the envelope, body-bound, desk, and settlement pins this slice re-runs
   are the real baseline.
4. The build under test is identified by commit and the lab seed matches
   `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).
5. Baseline state: the Admin Node suite, the app Vitest suite, and both
   contract gates are green at the implementation PR's base
   (`node-build (admin)`, `app-build`, `contract-check`).

### Exit criteria

1. `CFG1`-`CFG4` pass: each unauthenticated malformed or oversized body
   answers exactly one 401 `UNAUTHENTICATED` envelope with the matching
   existing sentence and no transport sentence, and the counting store
   proves no operation ran.
2. `CFG5` and `CFG6` pass: an authenticated malformed body keeps today's
   400 wording; the ordering pairs answer 401, then 400, then 403; and
   `SignIn` answers 400 first in both directions with its lockout.
3. `CFG7`-`CFG13` pass: every rule refuses with HTTP 400
   `VALIDATION_FAILED`, `details` naming the key, its own sentence, and a
   non-empty `traceId`, the `requiredGuestFields` A3 case included.
4. `CFG14` and `CFG15` pass: a refused write stores no key of the
   request and adds no `config.updated` entry, and the `values`/
   `updatedBy` refusals keep their first place.
5. `CFG16`-`CFG18` pass: the boundary values, the outside-table keys,
   and the absent key behave as today in both stores, and the two stores
   refuse and accept the same values.
6. `CFG19` passes: the five sentences exist in both locales and the
   mirror with matching placeholders, and the catalogue gate is green.
7. `CFG20` passes: the shared helper accepts and refuses exactly the
   header forms the service does today, and the parse exists once.
8. `CFG21`-`CFG23` are green with their assertions and fixtures
   untouched — no existing auth, config, audit, ceiling, mapping, or desk
   assertion moved, and no contract manifest or fixture changed beyond
   the error-list prose.
9. `CFG24` is recorded: the diff carries no configuration source, no
   migration, the specified placement, and one module-local helper.
10. `CFG-E1` is recorded: the `docs/testing/evidence/639/README.md`
    before/after pair and the `docs/testing/test-report.md` row.
11. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
    4 at the merged head and flipped the rows.
12. Open failures are filed as issues with FR/NFR ids; no `risk-medium`
    failure is waived without owner approval.

### Negative controls

A guard that only checks `status === 401`/`400`, or that sends one
refused value, is insufficient.

- `CFG1`-`CFG4` assert the 401 **message** is the auth sentence and that
  no transport sentence appears, so an implementation that still parses
  and then re-orders the answer on a well-formed body fails on the
  malformed one.
- `CFG1`-`CFG4` assert the counting store's `calls() === 0` and that a
  later in-ceiling request on the same server still works, so an
  implementation that answers 401 after reading the body (or that leaks
  a closed connection) fails.
- `CFG3` sends both a streamed 65 537-byte body and a declared 70 000-byte
  `Content-Length`, so a check placed inside `readBody` rather than above
  it fails on at least one form.
- `CFG5` asserts today's transport sentence and the four-key envelope, so
  an implementation that returns a generic 400 for an authenticated
  malformed body fails.
- `CFG6` asserts all five ordering pairs, so an implementation that moves
  the role check above the body (403 before 400) or that changes
  `SignIn`'s order fails.
- `CFG7`-`CFG12` each send the accepted value beside the refused one
  (for example `"14:00"` beside `"24:00"`, and the one-entry list beside
  the empty list), so an over-strict rule that refuses every write, or a
  rule that refuses the boundary, fails rather than passing on refusals
  alone.
- `CFG9` sends the audit's own A3 case (a string in place of the array)
  first, so an implementation that only checks array length fails.
- `CFG13` asserts `details` deep-equal and the exact sentence per key, so
  an implementation that borrows `field_required` for every key, or that
  names a sibling key, fails.
- `CFG14` reads `GetHotelConfig` and `QueryAuditLog` before and after the
  refused request, so an implementation that writes the valid sibling
  key, or that records a `config.updated` entry with an unchanged value,
  fails.
- `CFG15` sends a wrong table key beside a non-object `values` and a
  blank `updatedBy`, so an implementation that runs the per-key checks
  first fails.
- `CFG16` asserts the stored values are byte-identical (no trimming or
  coercion), so an implementation that normalises `" 14:00 "` or turns
  `0` into `"0"` fails.
- `CFG17` sends the deployment set's outside-table keys, so an
  over-broad table that refuses them fails the installer's payload.
- `CFG18` asserts the same refusal and acceptance in both stores, so the
  Postgres `Number(value)` coercion surviving beside a strict in-memory
  rule fails.
- `CFG19` asserts the rendered `{field}` sentence, so a pasted literal
  that drifts from the key name fails.
- `CFG20` asserts the refused header forms as well as the accepted ones,
  so a "simplified" regex that accepts `bearer tok` or rejects
  surrounding whitespace fails.
- `CFG21`-`CFG23` fail on a loosened or rewritten assertion, not only on
  a red test: the existing cases are the "nothing changed" proof and may
  not be edited.

## 6. Owner verification cases (CFG-1..CFG-10)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
store, `api admin <Operation>` bodies, and `psql` counts where the lab
persists). Steps are the same for each case unless stated: sign in as
`owner`, act as described, then read the reply.

| Case | Setup | Expected |
|---|---|---|
| `CFG-1` | Send `UpdateHotelConfig` with no `Authorization` header and a body that is not valid JSON | The reply is one 401 "Missing session token." in the usual error shape with a reference id — not "Request body is not valid JSON." Nothing about the body appears in the reply |
| `CFG-2` | Send the same request with a body that is a JSON list instead of an object, then one above 65 536 bytes, still with no header | Each reply is the same 401 "Missing session token." — never "must be a JSON object" and never "too large" |
| `CFG-3` | Sign in as an owner, then edit the config with a blank `timezone`, a check-in time of `24:00`, and a `requiredGuestFields` value sent as `"fullName"` (a text, not a list) | Each is refused with 400 "…must be non-empty text.", "…must be a 24-hour HH:MM time.", and "…must list at least one guest field, each a non-empty entry, without duplicates.", naming the key; the hotel settings screen still shows the old values after each attempt |
| `CFG-4` | Send one request that changes `timezone` to a valid value **and** breaks `requiredGuestFields`, then reopen the settings and the audit list | The request is refused naming `requiredGuestFields`, the timezone is unchanged, and the audit list has no new config-change rows for that attempt |
| `CFG-5` | Save one-entry `requiredGuestFields`, `00:00` check-in, `23:59` check-out, `0` retention days, no cancellation reasons, and empty cancellation wording, address, phone, and email | The save succeeds, every value reads back exactly as typed, and the audit list shows one config-change row per key with the acting user and the time |
| `CFG-6` | Sign in as a front-desk user and try to change the config with a good body; then try again with a broken body; then with no session at all | The good body answers 403 "Front-desk accounts cannot change hotel config."; the broken body answers the plain 400; the no-session attempt answers 401 first |
| `CFG-7` | Sign in with a wrong password five times, then with the right one | The fifth wrong attempt locks the identity, the right password still answers the locked message, and the lock can be cleared by an owner — exactly as before |
| `CFG-8` | Apply the deployment config set on a fresh lab (`script/apply-hotel-config.sh`) | The apply succeeds and verifies the read-back, so the installer's payloads satisfy the table; the hotel's own name, times, guest fields, reasons, and retention floor are in effect |
| `CFG-9` | Inspect `deploy/`, the compose file, the runbooks, and a running Admin service's environment; run `script/contract-check.sh`, `script/openapi-route-check.sh`, and `script/catalogue-coverage-check.sh`; look for a new migration file | No environment variable, deployment file, runbook step, or per-hotel setting carries the order or a shape; no new enum token or status appears; all three gates pass; `services/admin/migrations/` carries no new file |
| `CFG-10` | Read the Admin service's refusal sentences in the hotel's language | The five new sentences appear in both languages with the key name filled in, and none shows an error code, a status number, or a technical trace |

## 7. Evidence rule CFG-E1

The implementation PR records, in `docs/testing/evidence/639/README.md`
(created by that PR, same capture method as the #588, #627, #630, #635,
#640, and #641 records), one before/after pair per finding:

- **A2 — the parse leak, on the pre-fix build from an isolated compose
  lab.** `UpdateHotelConfig` with a malformed body and no token answers
  a 400 carrying `error.transport.bad_json` (and an over-limit body a
  400 `body_too_large`), with the code pins (`server.ts:144` before
  `:151-155`). After the fix the same requests answer the one 401
  `UNAUTHENTICATED` envelope, and the pre-parse work is gone — record the
  same request with a front-desk token (400, then 403 on a good body) so
  the ordering change is visible in one capture.
- **A3 — the silent config corruption, on the pre-fix build.** Send
  `UpdateHotelConfig` with `requiredGuestFields: "fullName"` and
  `retentionFloorDays: "365"`: the pre-fix in-memory store accepts both
  and `GetHotelConfig` reads the string back, while the Postgres store
  refuses the retention text number (pins `store.ts:471-494`,
  `pgstore.ts:545-552`). After the fix both stores refuse both values
  naming the key with nothing written, and the honest control
  (`requiredGuestFields: ["fullName"]` and `retentionFloorDays: 365`) is
  accepted and read back as sent.
- **A5 — the duplicated Bearer parse, on the pre-fix build.** Trace the
  service's own regex at `server.ts:83-90` beside
  `services/guests/src/auth.ts:8-15`; after the fix the service imports
  the module-local `src/auth.ts` helper and the header-form parity table
  answers exactly as before, with no cross-service import.
- **Plus the unchanged controls:** the well-formed no-token 401, the
  `SignIn` 400-first order and lockout, the authenticated 400 wording,
  the `SignIn` 65 536/65 537 ceiling pair, `/healthz`, the unknown-path
  404, the internal-error envelope, and the desk's 401 sign-in gate.
- **Plus the no-configuration and no-migration check:** the diff of
  `deploy/`, `docs/devops/`, `docs/operations/`, and
  `services/admin/migrations/` carries no order, shape, or sentence
  source and no new file (`CFG24`).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md`
[section 3](test-strategy.md#3-exit-criteria-per-slice)).

## 8. Slice status and re-pin rule

At this spec head: 20 rows mapped to `AC-CFG-1`..`AC-CFG-5`,
`FR-CFG-1`..`FR-CFG-3`, `BR-64`, the four unchanged NFR rows, the two
unchanged MVP row pairs, the desk-green row, the contract/LC row, the
configuration/migration gate, the MVP no-change gate, and `CFG-E1`.
Eight rows carry re-run evidence today (the four unchanged NFR rows, the
two MVP row pairs, the desk-green row, and the contract/LC gate — their
pins exist and pass and must keep passing untouched), plus the re-run
halves named inside `AC-CFG-2`, `AC-CFG-4`, and `FR-CFG-3`; the rest are
**pending** the implementation PR: the rows whose guards are the
registry `CFG1`-`CFG20`, the `BR-64` evidence row, the MVP no-change
gate, and `CFG-E1`. The slice is **not complete** at this spec head. It
completes when the implementation PR merges with `CFG1`-`CFG24` green,
the section 2 pins refreshed where the implementation moved a line,
`CFG-E1` recorded, and `qa-lead` re-pins every row in section 4 with
`file:line` at the merged head. No row in this document may be flipped
to covered while its guard is absent from the tree or failing: a
pending row is honest, a fabricated pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1165
