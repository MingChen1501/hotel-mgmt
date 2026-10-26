# Local dev setup + admin secret management

Status: active. Dev-lab setup and admin secret handling for hotel-mgmt,
owned by `release-manager` (Closes #283). This page is the lab path only:
a new developer goes from a fresh checkout to a signed-in desk UI plus a
working API/DB session. The pilot install path stays in
`docs/devops/deployment.md`; the daily operating procedures stay in
`docs/operations/runbook.md`. Nothing here changes any setup flow, secret
scheme, or code — every step below is verified against the compose file,
the seed, the admin store code, and the sign-in route.

## 1. Prerequisites

- Docker with the compose plugin (`docker compose version` answers).
- A checkout of this repository; all commands below run from the repo root.
- Host minimums and secret gates are enforced by `script/preflight.sh`
  (it fails closed — see section 4); run it before anything else.
- Ports: the reverse proxy listens on host port `80`
  (`deploy/compose.yaml`, `proxy` service). Module ports `8081–8088`
  are container-internal only; the desk and API testing always go
  through `http://127.0.0.1` (see `deploy/nginx/nginx.conf`).

## 2. Per-hotel config copy

The release bundle is identical for every property; the hotel's
differences live in a per-hotel configuration set that is mounted next
to the bundle, never baked into images (`deploy/compose.yaml` header
comment; `deploy/config/README.md`).

```sh
cp deploy/config/hotel.example.json deploy/config/hotel.json
${EDITOR:-vi} deploy/config/hotel.json   # the hotel's own values
script/validate-hotel-config.sh --config deploy/config/hotel.json
```

Rules (enforced by `script/validate-hotel-config.sh` and
`script/preflight.sh`, which refuses any `EXAMPLE-001` placeholder):

- Fill in the hotel's own values for every section (identity, times,
  rooms, rates, stay policies, charge items, taxes, backup schedule).
- Never leave `EXAMPLE-` placeholders in `hotel.json`.
- Never commit real hotel data: `deploy/config/hotel.json` is gitignored
  (see `.gitignore`), as are the Ansible inventory and `backup-staging/`.

## 3. Secrets provisioning (env file only)

Two per-sale secrets, never stored in the repo:

| Secret | Consumed by |
|---|---|
| `DB_PASSWORD` | every service's `DATABASE_URL` and `POSTGRES_PASSWORD` (`deploy/compose.yaml`) |
| `ADMIN_BOOT_SECRET` | the `admin` service at boot (`ADMIN_BOOT_IDENTITY` defaults to `owner`) |

Recommended mechanism — one env file in the home directory, readable
only by you, sourced in each terminal before any stack command:

```sh
# One-time setup:
printf 'DB_PASSWORD=<generate-a-strong-secret>\nADMIN_BOOT_SECRET=<generate-another-strong-secret>\n' > ~/hotel-mgmt.env
chmod 600 ~/hotel-mgmt.env

# In every terminal before stack commands:
set -a; source ~/hotel-mgmt.env; set +a
```

Never put either secret in the repo, in an image, in `hotel.json`
(`deploy/config/hotel.example.json` states: secrets are NEVER stored
there), or in a shared chat. Both `script/preflight.sh` and
`script/e2e-desk-loop.sh` refuse to run while either secret is unset or
still a dev default (`change-me`, `change-me-dev-only`, `password`,
`hotel`, `hotel-dev-only`).

## 4. Stack up: canonical vs raw

**Canonical — `script/install.sh`.** Runs pre-flight (fails closed on
default secrets, placeholder or malformed configuration, unmet host
minimums), then the desk-loop proof (book → check in → post a charge →
check out → backup → restore drill → re-verify), and leaves the stack up
for handover:

```sh
set -a; source ~/hotel-mgmt.env; set +a
cp deploy/config/hotel.example.json deploy/config/hotel.json  # if not done yet
script/install.sh   # [--config deploy/config/hotel.json] [--staging-dir ./backup-staging] [--base-url http://127.0.0.1]
```

**Raw — `docker compose` directly (lab only).** Brings up containers
without any gates; you then apply migrations and the boot seed by hand:

```sh
set -a; source ~/hotel-mgmt.env; set +a
docker compose -f deploy/compose.yaml up -d --build
# wait until every module answers through the proxy:
for m in reservations rates reporting stay rooms guests billing admin; do
  curl -fsS --noproxy '*' http://127.0.0.1/v1/$m/healthz
done
# apply each service's migrations, then the boot seed (idempotent):
docker compose -f deploy/compose.yaml exec -T db psql -U hotel -d hotel -v ON_ERROR_STOP=1 -f - <services/admin/migrations/001_boot.sql
# … (one per migration file; full list in script/e2e-desk-loop.sh) …
docker compose -f deploy/compose.yaml exec -T db psql -U hotel -d hotel -v ON_ERROR_STOP=1 -f - <deploy/seed/boot.sql
```

Prefer `install.sh` for anything resembling a handover; use the raw path
only to inspect or debug the lab stack step by step.

## 5. Admin hash lifecycle

- **Boot provisioning.** At startup the admin service reads
  `ADMIN_BOOT_IDENTITY`/`ADMIN_BOOT_SECRET` from the environment and
  ensures the boot user exists (`bootStoreFromEnvironment` in
  `services/admin/src/server.ts`; `ensureBootUser` in
  `services/admin/src/pgstore.ts` uses `INSERT … ON CONFLICT DO NOTHING`,
  so restarts never duplicate or overwrite the owner). No credential hash
  lives in `deploy/seed/boot.sql` (stated in its header comment).
- **Hash only, never plaintext.** Secrets are stored exclusively as a
  SHA-256 hex digest in `admin.users.secret_hash` (`hashSecret` in
  `services/admin/src/store.ts`; table comment in
  `services/admin/migrations/002_schema.sql`: "secrets are hashes only,
  never plaintext").
- **SignIn → Bearer token.** `POST /v1/admin/SignIn` with
  `{"signinIdentity": "owner", "secret": "<boot secret>"}` returns
  `{token, …user}`; the token is an HMAC-signed opaque session token with
  15-minute idle expiry (`services/admin/src/server.ts`,
  `services/admin/src/pgstore.ts` sign-in path). Every other admin
  operation requires `Authorization: Bearer <token>`.
- **First sign-in in the desk UI.** Open `http://127.0.0.1/app/admin`,
  enter the sign-in identity and boot secret, and confirm the desk lands
  signed in (admin console sign-in section).

## 6. Lockout and unlock

- **5-strike, 15-minute, persisted lockout.** Five consecutive wrong
  secrets lock the identity for 15 minutes (`MAX_FAILURES = 5`,
  `LOCKOUT_MS = 15 min` in `services/admin/src/store.ts`; `recordFailure`
  in `services/admin/src/pgstore.ts` writes
  `locked_until = now() + 15 minutes`). The lock is enforced both
  in-memory and from the `admin.users.locked_until` column, so restarts
  do not clear it. Do not keep retrying a locked identity
  (`docs/operations/runbook.md`, section 6).
- **Unlock path 1 — owner/manager in the system.** Another owner or
  manager signs in and calls `UnlockIdentity` (or clicks Unlock in
  the admin console at `/app/admin`, which lists locked identities with an Unlock button).
  Refuses with `not_locked` when the identity is not actually locked.
- **Unlock path 2 — wait it out.** After 15 minutes the lock expires and
  the correct secret signs in again (successful sign-in clears
  `locked_until`).
- **Unlock path 3 — DB escape hatch (lab/support only).** When no owner
  or manager sign-in is available, clear the column directly — this is
  exactly the write `UnlockIdentity` performs:

```sh
docker compose -f deploy/compose.yaml exec -T db psql -U hotel -d hotel -c \
  "UPDATE admin.users SET locked_until = NULL, updated_at = now() WHERE signin_identity = 'owner';"
```

## 7. Secret rotation

There is **no supported secret-rotation operation** in the current Admin
contract: the operation switch in `services/admin/src/server.ts` offers
`GetHotelConfig`, `UpdateHotelConfig`, `CreateUser` (the only operation
that accepts a secret, for new users), `UpdateUserRole`,
`UnlockIdentity`, `SignOut`, `ListUsers`, and `QueryAuditLog` — no
change-secret or rotate-secret path. Rotation is therefore **TBD**:
tracked in follow-up issue #284. Do not invent a rotation procedure;
until #284 lands, a replacement secret means creating a new user or
re-provisioning the boot identity out of band, never editing a hash
by hand.

## 8. API testing

- Through the proxy, one contract operation per call:
  `POST http://127.0.0.1/v1/<contract>/<Operation>` with
  `Content-Type: application/json` and, except for `SignIn`,
  `Authorization: Bearer <token>` (helper pattern in
  `script/e2e-desk-loop.sh`; route convention in
  `deploy/nginx/nginx.conf`). A refusal answers outside 2xx with the
  shared error envelope (`code`, `message`, `details`, `traceId`).
- Contract bodies and error codes are the source of truth in
  `contracts/openapi.yaml` (e.g. `/v1/admin/SignIn` request/response,
  lockout refusal after 5 failures).
- Interactive exploration: Swagger UI at `http://127.0.0.1/docs/`
  (vendored assets, works offline; served spec mirrors
  `contracts/openapi.yaml`).

## 9. DB access

```sh
docker compose -f deploy/compose.yaml exec -T db psql -U hotel -d hotel
```

One PostgreSQL engine, one schema per module (each service owns its
migration chain): `reservations`, `rates`, `reporting`, `stay`, `rooms`,
`guests`, `billing`, `admin`. Examples:

```sql
SELECT signin_identity, role, locked_until FROM admin.users;
SELECT name FROM admin.hotel_profile LIMIT 1;
SELECT number, state FROM rooms.rooms;
```

## 10. Teardown

From the repo root:

```sh
docker compose -f deploy/compose.yaml down     # stop + remove containers; data (pgdata) kept
docker compose -f deploy/compose.yaml down -v  # also DESTROYS all data (fresh DB next bring-up)
```

**Volume-password pitfall.** `POSTGRES_PASSWORD` only initialises an
empty data directory: with an existing `pgdata` volume, changing
`DB_PASSWORD` in the environment does **not** change the database
password, and the modules will fail to authenticate. Keep the same
`DB_PASSWORD` across restarts of the same volume; if the password must
change, `down -v` and bring the stack up fresh (all lab data is lost —
that is the point of `-v`).

## Verification checklist (definition of done for this page)

A new developer following sections 1–9 reaches, with no outside help:

1. `script/preflight.sh` passes (or its failures name the exact secret/placeholder to fix).
2. The stack answers on `http://127.0.0.1/v1/<module>/healthz` for all eight modules.
3. Owner sign-in succeeds at `/app/admin` and `POST /v1/admin/SignIn` returns a token.
4. An authenticated call (e.g. `GetHotelConfig`) and one desk-loop write succeed.
5. `psql` through `compose exec db` reads `admin.users` and module tables.
