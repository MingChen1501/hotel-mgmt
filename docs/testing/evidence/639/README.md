# #639 Admin authenticate-before-parse and config-shape refusal — evidence

Before/after reproduction record for
[issue #639](https://github.com/MingChen1501/hotel-mgmt/issues/639)
(audit findings A2, A3, and A5; `AC-CFG-1`..`AC-CFG-5`, `FR-CFG-1`..
`FR-CFG-3`, `BR-64`, LLD
[section 33](../../../architecture/lld.md#33-admin-authenticates-before-parsing-and-refuses-a-malformed-config-write-refs-639),
guards `CFG1`–`CFG24` and evidence rule `CFG-E1` in
[the test traceability](../../admin-auth-config-test-traceability.md)).
The left column is the pre-change build; the right column is this
change. Every answer below was captured from a running service
process, not from a test assertion.

## Finding

`handleRequest` matched the route, read the body
(`services/admin/src/server.ts:144` pre-change), and only then checked
the bearer token and called `store.authenticate` (`:151-155`
pre-change). Every parse refusal therefore ran ahead of the auth
answer: an unauthenticated caller learned that its body was malformed,
was not a JSON object, or was oversized, and paid the parse on a
session that was never checked. Separately,
`AdminStore.updateConfig` shape-checked only `name` and then stored
every entry as sent (`services/admin/src/store.ts:471-494`
pre-change), so a `requiredGuestFields` sent as a string replaced the
configured guest-field list silently; and Admin carried its own Bearer
regex (`services/admin/src/server.ts:83-90` pre-change) instead of the
module helper its three sibling Node services carry.

## Capture method

- Pre-change build: `git archive 0a10229 services/admin` (the base this
  branch is based on; its code tree is the pre-change tree, because the
  #639 spec commits touch `docs/` only) extracted into
  `/tmp/opencode/639-pre`, then `npm run build`.
- Post-change build: this branch, `npm run build` in `services/admin`.
- Each build ran as its own process through the stock
  `dist/index.js` wiring: in-memory store on `18851` (pre) and `18853`
  (post), Postgres store on `18852` (pre) and `18854` (post) with
  `DATABASE_URL` pointing at one scratch `postgres:16-alpine`
  container (`ao-639-pg`, loopback `55439`) and two fresh databases
  (`hotel_pre`, `hotel_post`); the module applied its own boot
  migrations at startup. No compose command ran, so the owner's shared
  lab was not touched.
- Each process booted `owner` (`owner-secret`) and, for the ordering
  trio, one front-desk account (`desk-1`) created through
  `CreateUser`.
- Requests: `POST /v1/admin/<Operation>` with
  `Content-Type: application/json`, `curl --data-binary`, and the
  exact body shapes quoted below. The 65 537-byte body is one
  `values`/`updatedBy` object padded with a filler field.

## A2 — the parse leak (before/after)

`UpdateHotelConfig` unless stated otherwise. Same request, four
processes; the Postgres and in-memory builds answered identically in
every row, so the columns are per build, not per store.

| Request | Pre-change (`0a10229`) | This change |
|---|---|---|
| no `Authorization` header, body `{"values": ` (invalid JSON) | `400 {"code":"VALIDATION_FAILED","message":"Request body is not valid JSON.","details":{},"traceId":"d07306a6…"}` | `401 {"code":"UNAUTHENTICATED","message":"Missing session token.","details":{},"traceId":"85a8f766…"}` |
| no header, body `[1,2,3]` | `401` missing session token (the array is a JSON non-object the reader accepts through `typeof parsed === "object"`) | `401` the same sentence |
| no header, body 65 537 bytes | `400 {"code":"VALIDATION_FAILED","message":"Request body is too large.","details":{"field":"body"},"traceId":"f6b46d0e…"}` | `401` missing session token |
| `Authorization: Bearer not-a-session`, invalid JSON | `400` invalid JSON, `error.transport.bad_json` | `401 {"code":"UNAUTHENTICATED","message":"Invalid or expired session token.","details":{},"traceId":"b139a65a…"}` |
| no header, well-formed body | `401` missing session token | `401` missing session token (unchanged) |
| `SignIn` with no header, invalid JSON | `400` invalid JSON | `400` invalid JSON (unchanged: `SignIn` keeps 400-first) |
| owner token, invalid JSON | `400` invalid JSON | `400` invalid JSON (unchanged: a resolved session keeps today's 400) |
| front-desk token, invalid JSON | `400` invalid JSON | `400` invalid JSON (unchanged) |
| front-desk token, well-formed body | `403 {"code":"FORBIDDEN","message":"Front-desk accounts cannot change hotel config.","details":{"role":"front-desk"},"traceId":"c6eb2ff3…"}` | `403` the same envelope (unchanged: `FORBIDDEN` follows a well-formed body) |
| no header, then a later request on the same server | served | served — the 401 closes the connection without reading or measuring the unread body, and the server keeps answering |

The refusal is one complete JSON object with exactly `code`,
`message`, `details`, and `traceId`; none of the `bad_json`,
`body_not_object`, or `body_too_large` sentences comes back on an
unauthenticated request, so the caller cannot learn the payload's
size, shape, or fields. The front-desk trio shows the observed order
is 401 (no session), then 400 (malformed body), then 403 (well-formed
body).

## A3 — the silent config corruption (before/after)

`UpdateHotelConfig` as the signed-in owner, four processes, one write
per row. `GetHotelConfig` follows each write.

| Write (`values`) | Pre-change in-memory | Pre-change Postgres | This change, both stores |
|---|---|---|---|
| `{"requiredGuestFields":"fullName","retentionFloorDays":"365"}` | `200`; stored as sent — the guest-field list is now the string `"fullName"` and the retention floor the text `"365"` | `200`; the guest-field list is the string `"fullName"`, and the retention floor is coerced to the number `365` through `Number(value)` — the two stores already disagreed | `400 {"code":"VALIDATION_FAILED","message":"requiredGuestFields must list at least one guest field, each a non-empty entry, without duplicates.","details":{"field":"requiredGuestFields"},"traceId":"e949c98c…"}` |
| `{"requiredGuestFields":"fullName"}` | `200`; `GetHotelConfig` reads `"requiredGuestFields":"fullName"` (the A3 corruption) | `200`; the same corrupt value persisted | `400`, the same sentence, `details.field` `requiredGuestFields` |
| `{"retentionFloorDays":"365"}` | `200`; `GetHotelConfig` reads the text `"365"` | `200`; `GetHotelConfig` reads the number `365` (the coercion) | `400 {"code":"VALIDATION_FAILED","message":"retentionFloorDays must be a non-negative integer.","details":{"field":"retentionFloorDays"},"traceId":"6906f45a…"}` |
| honest control: `{"requiredGuestFields":["fullName"],"retentionFloorDays":365}` | `200`; read back `["fullName"]` and `365` | `200`; read back identically | `200`; read back identically (`["fullName"]`, `365`), unedited by the new rule |

The pre-change Postgres column is the honest reading of the finding:
the rollup text number is coerced rather than refused, so the same
request stores a text in one store and a number in the other. After
this change both stores refuse both malformed values naming the key,
and the one deliberate narrowing (a text number is no longer accepted
by the Postgres path) is recorded in LLD 33.3 and R-19. No writer in
the tree sends a text number: `script/apply-hotel-config.sh:108`
sends the JSON number.

### The whole write is refused, and nothing is recorded

One request that changes `timezone` to a valid value **and** breaks
`requiredGuestFields`, against the post-change in-memory process:

```
### QueryAuditLog before the refused write
{"entries":[{"at":"…","actor":"boot","action":"user.created","entity":"owner","detail":"Owner (owner)"}]}
### refused write (valid timezone beside a malformed requiredGuestFields)
400
{"code":"VALIDATION_FAILED","message":"requiredGuestFields must list at least one guest field, each a non-empty entry, without duplicates.","details":{"field":"requiredGuestFields"},"traceId":"0b93efb7…"}
### QueryAuditLog after the refused write
{"entries":[{"at":"…","actor":"boot","action":"user.created","entity":"owner","detail":"Owner (owner)"}]}
### GetHotelConfig after the refused write
{"schemaVersion":1,"values":{"name":"Skeleton Hotel","timezone":"UTC","standardCheckinTime":"14:00","standardCheckoutTime":"12:00","retentionFloorDays":365,"requiredGuestFields":["fullName"],"cancellationReasons":[],"noshowRule":{},"approvalRule":{"required":false}}}
```

The valid sibling key is not stored (`timezone` stays `UTC`), the
seeded list is untouched, and the audit trail carries no
`config.updated` entry for the attempt. The Postgres path decides the
same check before `withTx` opens (`services/admin/src/pgstore.ts:516`
before `:518`), so no statement runs for a refused write.

## A5 — the duplicated Bearer parse

- Pre-change: `services/admin/src/server.ts:83-90` carried its own
  `bearerToken` regex, a near-copy of
  `services/guests/src/auth.ts:8-15` (byte-identical under
  `services/stay/src` and `services/rooms/src`). Admin had no
  `src/auth.ts`.
- This change: `services/admin/src/auth.ts:1-14` carries the module
  helper `extractBearer`, imported at
  `services/admin/src/server.ts:3` and called at `:157`; the inline
  `bearerToken` is gone. No import crosses a service boundary — each
  Node service keeps its own copy because each is a separate private
  package (`CFG20`'s source guard asserts it).
- Parity, from `services/admin/src/auth.test.ts`: `Bearer tok` and
  `Bearer  tok ` resolve the session (200); `bearer tok`, `Bearer `,
  an absent header, and `Basic tok` answer today's missing-token 401
  on a session-guarded operation — exactly the pre-change outcome, so
  A5 changes no answer.

## Unchanged controls

| Step | Answer |
|---|---|
| `GET /healthz`, with and without a token | `200 {"service":"admin","status":"ok"}`, unchanged |
| unknown path (`GET /v1/admin/CheckIn`) | `404 NOT_FOUND`, unchanged (route matching did not move) |
| `SignIn` at 65 536 and 65 537 bytes | served and refused exactly as before (`bodyBound.test.ts`) |
| five wrong secrets then the right one | `IDENTITY_LOCKED`, unchanged |
| an unexpected store exception | `INTERNAL_ERROR` (500) with the four-key envelope, unchanged |
| desk on a 401 | clears the session and routes to sign-in (`app/src/api/client.ts`), unchanged — no desk file is touched |

## No-configuration and no-migration check (CFG24)

The ordering, the per-key table, and the five sentences are code rules
and constants: `services/admin/src/server.ts` (statement order),
`services/admin/src/store.ts:121-185` (the one table and validator),
and the three catalogue files. The diff carries no change under
`deploy/`, `docs/devops/`, `docs/operations/`, any compose file, or
`services/admin/migrations/`; no environment variable, deployment
file, or per-hotel setting carries an order, a shape, or a sentence;
no schema, table, column, migration, or backfill is added, and no
stored value is rewritten (`GetHotelConfig` re-validates nothing, so a
value stored before this change keeps reading as stored).

## Gates

- `services/admin`: `npm run build`, `npm run lint`, `npm test`
  (without a database: 59 tests, 58 pass, 1 Postgres case skipped).
- `services/admin` with `TEST_PG_URL` against the scratch container:
  the new `CFG18` parity case passes for both the refusal set and the
  accepted boundary. The pre-existing `#149` role/audit case
  (`pgstore.test.ts:75-131`) fails the same way on the pre-change
  build: it expects `/last remaining owner/` for an owner demoting
  itself, which the self-change check refuses first
  ("You cannot change your own role."). It is unrelated to this change,
  is not visible in CI (`node-build` runs without `TEST_PG_URL`), and
  is left to its own issue rather than widened into this PR.
- `script/contract-check.sh`, `script/openapi-route-check.sh`,
  `script/catalogue-coverage-check.sh`,
  `script/markdown-link-check.sh`,
  `script/harness-conventions-check.sh`, `git diff --check`: PASS.
  `contracts/` is byte-identical; the five new catalogue keys exist in
  the canonical file, the Vietnamese locale, and every runtime mirror
  (the mirrors are byte-identical copies).
- Slice record: `docs/testing/test-report.md` section 8.1; guard
  re-pins at the merged head are the `qa-lead` half
  (`docs/testing/admin-auth-config-test-traceability.md` section 8).

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1169
