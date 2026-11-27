# #638 Admin fail-closed boot — evidence

Before/after reproduction record for
[issue #638](https://github.com/MingChen1501/hotel-mgmt/issues/638)
(audit finding A1; `AC-BOOT-1`..`AC-BOOT-5`,
`FR-BOOT-1`..`FR-BOOT-5`, `BR-70`, LLD
[section 39](../../../architecture/lld.md#39-admin-refuses-to-boot-without-its-per-sale-signing-key-and-boot-secret-refs-638),
guards `BOOT1`–`BOOT5` and evidence rule `BOOT-E1` in
[the test traceability](../../admin-fail-closed-boot-test-traceability.md)).
The left column is the pre-change build; the right column is this
change. Every boot answer below was captured from a running service
process, not from a test assertion.

## Finding

The session signing key and the boot owner secret fell back to two
constants printed in this repository: `ADMIN_TOKEN_KEY` to
`dev-only-change-me` (`services/admin/src/store.ts:234`,
`services/admin/src/pgstore.ts:72` at the pre-change head) and
`ADMIN_BOOT_SECRET` to `change-me`
(`services/admin/src/server.ts:119-123`). A deployment that forgot
either variable booted and served with published credentials.

## Capture method

- Pre-change build: `21e116e` (this worktree's start; its code tree is
  the fail-open build because the spec commits touch `docs/` only)
  built with `npm ci && npm run build` in `services/admin`.
- Post-change build: this branch, the same two commands.
- Ports: pre-change Admin `18891`, post-change refusals `18892`–`18894`,
  dev-switch boot `18896`. Each build ran as its own `node
  dist/index.js` process with `DATABASE_URL` unset (in-memory store).
- The Postgres parity half ran on one scratch `postgres:16-alpine`
  container (`ao-638-pg`, loopback `55441`, fresh `hotel` database and
  the two Admin boot migrations applied). No compose command ran, so
  the owner's shared lab was not touched.
- Boots that must succeed were stopped with `SIGTERM` after the
  measured answer; refused boots exit on their own.
- Never printed secret values: the lines below quote only the variable
  names, and the sentinel values used in the guards are throwaway.

## BOOT1 — boot without the signing key

Pre-change (`env -u ADMIN_TOKEN_KEY -u ADMIN_BOOT_SECRET -u
ADMIN_DEV_MODE PORT=18891 node dist/index.js`): the process booted,
answered `/healthz`, and signed a session with `dev-only-change-me`:

```text
stdout: admin listening on :18891
GET /healthz -> {"service":"admin","status":"ok"}
POST /v1/admin/SignIn owner/change-me -> 200 {"token":"eyJ0aWQiOi...","role":"owner"}
```

This change (`ADMIN_BOOT_SECRET=after-boot-secret`, key unset, no
switch): exit `1`, no stdout, one stderr line, no port:

```text
exit=1
stdout:
stderr: admin: refusing to boot: ADMIN_TOKEN_KEY is unset, empty, or a published default; provision the per-sale secret or set ADMIN_DEV_MODE=1 for dev/test.
GET /healthz -> connection refused
```

## BOOT2 — boot without a usable boot secret

Pre-change: a missing `ADMIN_BOOT_SECRET` seeded `owner` with
`change-me`, and that sign-in answered `200` (the same boot as the
BOOT1 left column). This change (key provisioned, secret unset): exit
`1`, no stdout, one stderr line:

```text
exit=1
stdout:
stderr: admin: refusing to boot: ADMIN_BOOT_SECRET is unset, empty, or a published default; provision the per-sale secret or set ADMIN_DEV_MODE=1 for dev/test.
```

The denylist is five exact values for both secrets; the published
`change-me` as `ADMIN_TOKEN_KEY` is refused on the same line naming the
key, and the same denylist entries are refused for the boot secret
(`services/admin/src/bootConfig.test.ts` covers every entry, and
`server.test.ts` runs each refusal through the real entry point).

## BOOT2/B (Postgres parity) — no owner row, no migration

`TEST_PG_URL=postgresql://…@127.0.0.1:55441/hotel` and
`node --test --test-name-pattern "fail-closed boot on Postgres"
dist/pgstore.test.js`:

```text
ok 1 - fail-closed boot on Postgres (BOOT1, BOOT2)
# tests 3
# pass 3
# fail 0
# skipped 0
```

Each refused case drops the `admin` schema first and asserts it is
still absent after the exit, so a refusal that reached a migration or
the seed would fail the guard. The control case migrates, seeds exactly
one `owner` row, answers `/healthz`, signs in, and verifies the token
with the provisioned key (not `dev-only-change-me`).

## BOOT3 — the switch is the only way back

`env -u ADMIN_TOKEN_KEY -u ADMIN_BOOT_SECRET ADMIN_DEV_MODE=1
PORT=18896 node dist/index.js`:

```text
stdout: admin listening on :18896
stderr: admin: warning: ADMIN_DEV_MODE=1 is set; using the dev session key and the dev boot secret where a per-sale secret is not provisioned.
GET /healthz -> {"service":"admin","status":"ok"}
POST /v1/admin/SignIn owner/change-me -> 200 {"token":"eyJ0aWQiOi...","role":"owner"}
```

With the switch absent, empty, `0`, `01`, `true`, or `yes` the same
boot is refused on the BOOT1 line; with `NODE_ENV=production` and no
switch it is refused too, and the switch with `NODE_ENV=production`
still boots the dev profile (`bootConfig.test.ts` and `server.test.ts`
cover the matrix). A provided value wins over the fallback in both
slots.

## BOOT5 — the bundle carries the key and never the switch

- Before: `deploy/compose.yaml` passed `ADMIN_BOOT_SECRET` with the
  fallback `change-me-dev-only` and never passed `ADMIN_TOKEN_KEY`; a
  host that set neither booted on published values.
- After: both Admin secrets use a required `:?` interpolation, so
  `docker compose config` without them fails:

```text
error while interpolating services.admin.environment.ADMIN_BOOT_SECRET: required variable ADMIN_BOOT_SECRET is missing a value: ADMIN_BOOT_SECRET must be set to a per-sale owner boot secret (deployment.md section 2)
error while interpolating services.admin.environment.ADMIN_TOKEN_KEY: required variable ADMIN_TOKEN_KEY is missing a value: ADMIN_TOKEN_KEY must be set to a per-sale signing key (deployment.md section 2)
```

- `script/test-preflight-fail-closed.sh` (exit `0`):

```text
PASS: missing ADMIN_TOKEN_KEY (refused: ADMIN_TOKEN_KEY is unset or still a dev default).
PASS: default ADMIN_TOKEN_KEY (refused: ADMIN_TOKEN_KEY is unset or still a dev default).
PASS: ADMIN_DEV_MODE set (refused: ADMIN_DEV_MODE is set).
preflight fail-closed: 7 passed, 0 failed.
```

- The three CI e2e jobs set `ADMIN_TOKEN_KEY:
  e2e-ci-token-key-3f8v` beside `DB_PASSWORD` and `ADMIN_BOOT_SECRET`,
  and never set `ADMIN_DEV_MODE` (`bootConfig.test.ts` asserts all
  three jobs). The code denylist equals `script/preflight.sh:58-63`
  exactly; the same test compares the two lists.

## BOOT4 — the local test path keeps working

`env -u ADMIN_TOKEN_KEY -u ADMIN_BOOT_SECRET -u ADMIN_DEV_MODE npm test`
in `services/admin` (exit `0`):

```text
# tests 84
# pass 83
# fail 0
# skipped 1
```

The one skipped test is the existing Postgres suite, which skips
without `TEST_PG_URL` as it always has. The existing Admin assertions
keep their wording; every suite passes an explicit key or seeds the
owner directly, and the new boot guards set the environment for their
own child process only.

## Scope note

The Postgres half of the full suite also carries one pre-existing
assertion failure unrelated to this slice: `pgstore.test.ts` (the
"manages roles, unlock, sign-out, list, and audit" case) expects the
last-owner refusal for the caller's own role, while the store checks
self-change first. The store logic and that test are byte-identical to
`origin/master`; this slice neither changes nor depends on them, the
new BOOT1/BOOT2 Postgres guards pass in isolation above, and the
no-environment suite (`BOOT4`) is green.

## Commands

```sh
cd services/admin
npm ci && npm run build && env -u ADMIN_TOKEN_KEY -u ADMIN_BOOT_SECRET -u ADMIN_DEV_MODE npm test && npm run lint
cd ../.. && bash script/test-preflight-fail-closed.sh
bash script/catalogue-coverage-check.sh
bash script/contract-check.sh
```

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1312
