# Admin fail-closed boot test traceability (Refs #638)

Status: active. Testing spec for the T4 Admin fail-closed secret boot
change ([issue #638](https://github.com/MingChen1501/hotel-mgmt/issues/638),
audit finding A1), owned by `qa-lead`. It maps the change's
done-conditions — `AC-BOOT-1`..`AC-BOOT-5`, owned by `product-owner` in
`docs/product/acceptance-criteria.md`
[section 32](../product/acceptance-criteria.md#32-admin-refuses-to-boot-without-its-per-sale-secrets-refs-638)
— and the behaviour-scoped requirements `FR-BOOT-1`..`FR-BOOT-5` plus
the business rule `BR-70`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 40](../requirements/mvp-requirements.md#40-admin-refuses-to-boot-without-its-per-sale-secrets-refs-638)
and `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md), to their
guards: the pins that exist on disk at this spec head, the guard
registry `BOOT1`–`BOOT5`, the residual-risk record `BOOT-R1`, and the
evidence rule `BOOT-E1`.

Written before the implementation PR. Every guard in the registry is a
**named, missing obligation** at this head: nothing in the tree boots
the Admin entry point without the two variables and asserts a refusal —
the two compiled-in fallback expressions are the before-state — so no
row marks a guard complete, and the slice is not complete until the
implementation PR merges and `qa-lead` re-pins every row at the merged
head (the `#588` → `#599`, `#601`, `#631`, `#633` pattern). Section 2
cites what is on disk today and what it proves; section 4 says which
rows the implementation PR creates and which pins it must keep
byte-identical.

Companion specs: LLD
[section 39](../architecture/lld.md#39-admin-refuses-to-boot-without-its-per-sale-signing-key-and-boot-secret-refs-638)
(where the resolver sits, the variable table, the switch and denylist,
the three boot diagrams, and the verification plan this plan aligns
with), HLD
[section 31](../architecture/hld.md#31-admin-refuses-to-boot-without-its-per-sale-signing-key-and-boot-secret-refs-638),
the Admin design's Operations delta
([section 7](../architecture/services/admin.md#7-operations)), the
threat-model sections 4, 5, and 8 (R12)
(`docs/technical/security-threat-model.md`), the `AdminService` row in
`docs/technical/api-spec.md` section 2, product `AC-BOOT-1`..`AC-BOOT-5`
with D-44 ([decision log](../project/decision-log.md)) and R-25
([risk register](../project/risk-register.md)), requirements section 40
with its own `qa-lead` handoff, and `BR-70`. This spec implements no
code, changes no guard, adds no catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T4 (recorded by `product-owner` in the issue and
  acceptance-criteria section 32, confirmed in LLD section 39): a
  boot-time behaviour change plus a deployment and environment contract
  change — one new mandatory secret (`ADMIN_TOKEN_KEY`), one removed
  bundle fallback per Admin secret, one explicit `ADMIN_DEV_MODE=1`
  switch, and the pre-flight/install/upgrade deltas that keep the gates
  honest. No subsystem, dependency edge, operation, route, request or
  response field, status, envelope token, schema table, lifecycle
  state, desk control, catalogue key, migration, or print rule is added
  or removed, so no T3 escalation and no ADR. Nothing reader-visible
  moves, so no UI contract applies.
- The whole surface is `services/admin/src/bootConfig.ts` (new),
  `services/admin/src/index.ts:16-38` (one resolver call at the top of
  `main`), the two store constructors (`services/admin/src/store.ts:234`,
  `services/admin/src/pgstore.ts:72`), the `createServiceServer` default
  store (`services/admin/src/server.ts:97`), `bootStoreFromEnvironment`
  (`services/admin/src/server.ts:119-123`), and the bundle/gate files
  listed in section 2. No other Admin module is in scope.
- The failure is a **boot outcome**, not an HTTP answer: there is no
  request, response, status, envelope, or catalogue sentence at that
  point. The one plain English line goes to stderr, exits `1`, and never
  prints a secret value. No guard in this slice may assert an envelope
  code, an HTTP status, or a catalogue key for it.
- `ADMIN_DEV_MODE` is the **only** switch and only the exact string `1`
  enables it. Absent, empty, `0`, `01`, `true`, `yes`, or anything else
  is the fail-closed path. `NODE_ENV` decides nothing in either
  direction — the image sets it (`services/admin/Dockerfile:13`) and a
  local run does not, so a guard on it would either re-open the hole or
  break the local path. No guard may assert any other variable as a
  switch.
- Two mandatory secrets, one denylist, five values: `ADMIN_TOKEN_KEY`
  and `ADMIN_BOOT_SECRET` are refused when unset, empty, or exactly one
  of `change-me`, `change-me-dev-only`, `password`, `hotel`,
  `hotel-dev-only` — the same list `script/preflight.sh:56-61` holds.
  Unset and empty (`""`) are the same failure; the comparison is exact
  and case-sensitive; there is no trimming and **no length or strength
  policy** (a short but unpublished value is accepted, requirements
  40.6). No guard may assert a minimum key length or a strength rule.
- `ADMIN_BOOT_IDENTITY` keeps today's semantics untouched: only
  `undefined` falls back to `owner`. `PORT` and `DATABASE_URL` keep
  their defaults, and the store/migration/seed/listen order is
  unchanged for a boot that succeeds. No guard may assert a change to
  any of them.
- Refusal precedence is fixed: `ADMIN_TOKEN_KEY` is checked first, then
  `ADMIN_BOOT_SECRET`, so a boot with both missing names the key and the
  second failure surfaces on the next boot. The exit code is exactly
  `1`; no stack trace and no envelope are printed. No guard may assert
  which of two *simultaneously unusable* variables is named beyond this
  order.
- No schema move: no migration file appears under
  `services/admin/migrations/` (today `001_boot.sql`, `002_schema.sql`),
  no column, `CHECK`, index, backfill, or stored value changes, and a
  refused boot writes nothing at all. No guard may assert a repair, a
  backfill, or a read-time re-validation.
- No reader-visible surface changes: no route, shell, layout, control,
  screen state, copy sentence, print rule, or e2e desk step moves, and
  no catalogue key is added — the boot line is an operator log, so the
  English and Vietnamese key sets stay at parity by not moving
  (`NFR-I18N-1`).
- No new MVP row, story, or FR capability. `FR-ADM-1`, `FR-ADM-2`, and
  `FR-ADM-4` keep their wording and their existing guards; the new
  obligations live in `FR-BOOT-1`..`FR-BOOT-5` / `BR-70`. The 57/57 MVP
  coverage count in [traceability-matrix.md](traceability-matrix.md)
  stands unchanged and no MVP row may cite this slice as its guard. The
  slice rows live in traceability matrix section 32.
- Guards are extended, never weakened. The Admin suites today pass an
  explicit key and seed the owner directly
  (`services/admin/src/server.test.ts:28-32`,
  `services/admin/src/auth.test.ts:44-47`,
  `services/admin/src/pgstore.test.ts:33-38`,
  `services/admin/src/bodyBound.test.ts:112`,
  `services/admin/src/migrate.test.ts:38-39`), so the fail-closed
  boot breaks no existing assertion; deleting or loosening one instead
  of adding cases beside it is drift and fails `BOOT4`.
- The finding itself is the before-state, recorded by `BOOT-E1`: a boot
  with no `ADMIN_TOKEN_KEY` signs sessions with a key published in this
  repository (`services/admin/src/store.ts:234`,
  `services/admin/src/pgstore.ts:72`), and a boot with no
  `ADMIN_BOOT_SECRET` seeds an `owner` account whose password is
  `change-me` (`services/admin/src/server.ts:119-123`), so anyone who
  reads this tree can mint or use a live owner session.

## 2. Pins on disk at this spec head

The pins below exist at this head and prove what the "covered by
re-run" and "pinned today" halves rest on. They were re-read for this
spec; none is promised, none is a placeholder. Where a row names one of
`BOOT1`–`BOOT5` the guard itself is listed in section 3 (it does not
exist yet). The code pins are byte-identical to `origin/master`
`ff081e8`, the pre-change head this spec was written against: this spec
stack (#781, #782, #783, and this PR) is docs-only, so nothing under
`services/`, `script/`, `deploy/`, or `app/` moves. The one exception is
`.github/workflows/ci.yml`: #788 (`1eab7cb`) inserted 35 lines after
that base, so the CI pins were re-read at the landing base (`97bb1da`)
and moved 465→500, 540→575, 641→676, and 308-340→343-375.

| Pin | What it proves today |
|---|---|
| `services/admin/src/store.ts:79-98` | `signSessionToken` and `verifySessionToken` — the HMAC pair every issued and verified session token passes through |
| `services/admin/src/store.ts:234` | `this.key = tokenKey ?? process.env["ADMIN_TOKEN_KEY"] ?? "dev-only-change-me"` in `new AdminStore()` — the first fail-open expression `BOOT1` removes from the production path |
| `services/admin/src/store.ts:262-281` | `ensureBootUser` (memory): the `boot` actor, `hashSecret(secret)`, and the `owner` role — the seed a refused boot must never reach |
| `services/admin/src/store.ts:309-318` | `signIn`'s random-UUID `tokenId` and `sessions.set` — the session record the signature covers |
| `services/admin/src/store.ts:320-322` | `authenticate` verifying through `verifySessionToken(this.key, token)` — the verification path a fallback key weakens |
| `services/admin/src/store.ts:589-590` | `signToken` calling `signSessionToken(this.key, tokenId)` — the one issue path |
| `services/admin/src/pgstore.ts:72` | The same `dev-only-change-me` fallback in `PostgresAdminStore` — the second expression `BOOT1` removes |
| `services/admin/src/pgstore.ts:90-110` | The Postgres `ensureBootUser`: `INSERT INTO admin.users … ON CONFLICT (signin_identity) DO NOTHING` with `created_by`/`updated_by` `boot` — the row a refused boot must never create |
| `services/admin/src/pgstore.ts:163-176` | `authenticate`/session resolution on the Postgres store — the verification parity target |
| `services/admin/src/server.ts:97` | `createServiceServer(service: string, store: AdminStoreAPI = new AdminStore())` — the third keyless construction path LLD 39.1 deletes |
| `services/admin/src/server.ts:119-123` | `bootStoreFromEnvironment`: `ADMIN_BOOT_IDENTITY` default `owner` and `ADMIN_BOOT_SECRET ?? "change-me"` — the published owner password `BOOT2` removes |
| `services/admin/src/server.ts:131-134` | `GET /healthz` answering `{ service, status: "ok" }` — the edge a refused boot makes unreachable |
| `services/admin/src/index.ts:16-38` | `main`'s boot order: `new AdminStore()` (`:17`), the `DATABASE_URL` branch with `new Pool` (`:20`) and `applyAdminMigrations` (`:27-28`), `PostgresAdminStore` (`:29`), `bootStoreFromEnvironment` (`:31`), `createServiceServer` (`:32`), `listen` (`:34-38`) — the order the resolver precedes |
| `services/admin/src/index.ts:7` | `PORT` read at module load with no side effect — the one module-level environment read that is not a secret |
| `services/admin/Dockerfile:13` | `ENV NODE_ENV=production` — why `NODE_ENV` cannot be the switch |
| `services/admin/src/server.test.ts:28-32` | `bootStore()`: `new AdminStore("test-key")` plus `ensureBootUser("owner", "owner-secret")` — the explicit-key/direct-seed pattern every suite uses |
| `services/admin/src/auth.test.ts:44-47` | The module-local bearer helper suite's own `new AdminStore("test-key")` + `ensureBootUser` |
| `services/admin/src/bodyBound.test.ts:112` | `new AdminStore("test-key")` in the body-bound suite |
| `services/admin/src/pgstore.test.ts:33-38` | The Postgres suite guard (`DATABASE_URL` skip) and `new PostgresAdminStore(pool, "test-key")` + `ensureBootUser` |
| `services/admin/src/migrate.test.ts:38-39` | `new PostgresAdminStore(pool, "test-key")` + `ensureBootUser` in the migration suite |
| `services/admin/src/messages.test.ts` | The catalogue-parity suite that keeps the English/Vietnamese key sets equal — untouched by this slice |
| `services/admin/migrations/001_boot.sql`, `002_schema.sql` | The only two Admin migrations — the no-migration gate `BOOT5`/diff check re-runs |
| `script/preflight.sh:56-61` | `is_default_secret()` — the five-value denylist the service's code constant must equal (`BOOT5` parity) |
| `script/preflight.sh:63-73` | The two existing per-sale checks (`DB_PASSWORD`, `ADMIN_BOOT_SECRET`) that never look at `ADMIN_TOKEN_KEY` |
| `deploy/compose.yaml:138-149` | The `admin` service: `DATABASE_URL` (`:143`), `ADMIN_BOOT_IDENTITY: ${ADMIN_BOOT_IDENTITY:-owner}` (`:148`), `ADMIN_BOOT_SECRET: ${ADMIN_BOOT_SECRET:-change-me-dev-only}` (`:149`), and no `ADMIN_TOKEN_KEY` at all — the bundle fail-open `BOOT5` removes |
| `deploy/ansible/playbook.yaml:37-43` | The pre-install task refusing `DB_PASSWORD`/`ADMIN_BOOT_SECRET` against a three-value subset and never checking `ADMIN_TOKEN_KEY` or `ADMIN_DEV_MODE` |
| `.github/workflows/ci.yml:500`, `:575`, `:676` | The three e2e jobs (`e2e-single-host`, `browser-e2e`, `dom-diff`) setting `ADMIN_BOOT_SECRET` only — no signing key and no switch today |
| `.github/workflows/ci.yml:343-375` | The `node-build` matrix job that runs `npm ci`, `npm run build`, `npm run lint`, `npm test` per Node module with no `ADMIN_*` variable exported — the `BOOT4` path |
| `script/test-preflight-fail-closed.sh:28-48` | The pre-flight refusal harness (`expect_fail`) that today proves the two-secret cases and gains the key and switch cases |
| `script/install.sh:60-64`, `script/demo-poc.sh:70-81`, `script/e2e-desk-loop.sh:150-161`, `script/e2e-perf-check.sh:40-42`, `script/apply-hotel-config.sh:51-53` | The entry points that gate on `ADMIN_BOOT_SECRET` today and gain `ADMIN_TOKEN_KEY` |
| `docs/devops/local-dev-setup.md:51-63` | The env-file secret provisioning section (`DB_PASSWORD`, `ADMIN_BOOT_SECRET`) the third secret joins (`release-manager` handoff) |
| `docs/architecture/services/admin.md:175-275` | The Admin Operations section (`npm ci`, `npm run build`, `npm test`, `npm run lint`, migrate, run) the verification commands below come from |
| `script/contract-check.sh`, `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh` | The root gates `BOOT5`'s no-change half re-runs on the implementation PR |

Pass evidence for the covered-by-re-run rows at this head: the code
pins above are byte-identical to `origin/master` `ff081e8`, the base the
sibling spec halves were written against, and the four docs commits on
top of it (`2d1bf5f`, `d326601`, `a79ebe2`, `e1fee68`) touch `docs/`
only. `.github/workflows/ci.yml` is the one exception: #788 (`1eab7cb`)
inserted 35 lines after that base, so its pins were re-read at the
landing base (`97bb1da`) and moved to 500/575/676 and 343-375. The
Admin suites themselves are the pass evidence that a fail-closed boot
breaks no existing assertion: every one constructs a store with an
explicit key and seeds the owner directly (the pins in the table), so
none reads `ADMIN_TOKEN_KEY` or `ADMIN_BOOT_SECRET`. This spec PR is
docs-only and runs the docs and `ci` jobs with the build matrices
path-filtered out; the implementation PR supplies the `node-build
(admin)`, `e2e-single-host`, `browser-e2e`, `contract-check`, and `ci`
evidence (`dom-diff` is FE-only and SKIPPED for this Admin-only slice —
`.github/workflows/ci.yml:87-91`, `:185-190`), which is why its job list
is stated in section 5 and `BOOT-E1` records the bundle and Postgres
halves separately.

## 3. Guard registry BOOT1-BOOT5, the residual-risk record BOOT-R1, and the evidence rule BOOT-E1

Naming: the registry uses `BOOT*` (the ids requirements 40.5 already
names, kept verbatim so the requirements handoff, the LLD verification
plan, and this registry use one name) and the owner cases use `BOOT-*`
(section 6), so neither collides with the `FR-BOOT-*` / `AC-BOOT-*`
requirement and condition ids. All five guards are **created by the
#638 implementation PR**; they are listed `pending` in section 4 until
`qa-lead` re-pins them with `file:line` at the merged head.

Two rules apply to every boot guard. First, the **absence proof**: a
refused boot is asserted on the process outcome (non-zero exit, the
stderr line) **and** on what did not happen — no store method reached,
no migration applied, no owner row created in either store, no port
listening, `/healthz` unreachable — because an exit code alone cannot
distinguish a refusal from a crash after a seed, and a refusal placed
after the seed is the exact fail-open shape this slice removes. Second,
the **no-secret-in-output rule**: no refusal or warning line may contain
the value presented for either variable. The in-memory halves drive the
real entry point in a child process; the Postgres halves run in the
`postgres-parity (admin)` job (a fresh scratch database through
`TEST_PG_URL`), which fails on a skipped case.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `BOOT1` | A production boot without a signing key is refused before any side effect: with `ADMIN_BOOT_SECRET` provisioned, `ADMIN_TOKEN_KEY` unset — and again empty (`""`) — and no switch, the process exits `1` and writes exactly one stderr line naming `ADMIN_TOKEN_KEY`, the two ways forward, and never a value; no listen, no `/healthz` answer, no store method called, and no token signed or verified. The resolver-level half calls `resolveBootConfig` with a constructed environment and asserts the `BootConfigError` names the variable without a value; the Postgres half runs under the suite gate `TEST_PG_URL` (`services/admin/src/pgstore.test.ts:17`) and hands that same value to the spawned refused-boot child as `DATABASE_URL` (`:381`, `:393`), which the service reads at boot (`services/admin/src/index.ts:14`); it proves no migration ran and `admin.users` stays empty, so the refusal precedes the connection. Control: with a provisioned non-default key the same command boots, answers `/healthz`, and signs and verifies a token. Code-reading half: no keyless construction path survives — `grep -rn ADMIN_TOKEN_KEY services/admin/src` names the resolver only, neither store constructor reads the environment, and `createServiceServer` has no default store (`services/admin/src/server.ts:97`) | `services/admin/src/bootConfig.test.ts` (resolver unit) + `services/admin/src/server.test.ts` (child-process boot, memory) + `services/admin/src/pgstore.test.ts` (child-process boot on a scratch database) |
| `BOOT2` | A production boot without a usable owner secret is refused, and no published default seeds an owner: with `ADMIN_TOKEN_KEY` provisioned, boot once with `ADMIN_BOOT_SECRET` unset, once empty, and once per denylist entry (`change-me`, `change-me-dev-only`, `password`, `hotel`, `hotel-dev-only`) and no switch; each exits `1` with one stderr line naming `ADMIN_BOOT_SECRET`, never the value, creates no owner in either store (`usersByIdentity` / `SELECT … FROM admin.users`), and `/healthz` refuses. Control: a provisioned non-default secret seeds the owner exactly as today — the same `boot` actor, `owner` role, and hash-only storage (`services/admin/src/server.test.ts:28-32`, `services/admin/src/pgstore.test.ts:33-38`) | `services/admin/src/bootConfig.test.ts` + `services/admin/src/server.test.ts` (memory) + `services/admin/src/pgstore.test.ts` (Postgres) |
| `BOOT3` | The switch is the only way back to the dev fallbacks, and nothing else enables them: with `ADMIN_DEV_MODE=1` and both variables absent the service boots, signs and verifies with `dev-only-change-me`, seeds `change-me`, and logs exactly one warning naming the switch and each fallback in use; a provided value still wins in both slots; with the switch absent, empty, `0`, `01`, `true`, or `yes` each boot refuses per `BOOT1`/`BOOT2`; with `NODE_ENV=production` and no switch it still refuses, and with the switch on `NODE_ENV` changes nothing. The resolver unit asserts the same switch matrix directly | `services/admin/src/bootConfig.test.ts` + `services/admin/src/server.test.ts` |
| `BOOT4` | The local suite is green with neither variable exported: `env -u ADMIN_TOKEN_KEY -u ADMIN_BOOT_SECRET npm test` in `services/admin` exits `0`, every existing Admin assertion keeps its wording (the seven suites, including `messages.test.ts`), any suite that exercises the real boot sets `ADMIN_DEV_MODE=1` for that child process only, and the `node-build (admin)` CI job still runs with no `ADMIN_*` variable exported (`ci.yml:343-375`) | `services/admin` suite run + CI `node-build (admin)` + diff gate (no assertion deleted or loosened) |
| `BOOT5` | The bundle carries the third secret and never the switch, and the denylist cannot drift: `deploy/compose.yaml` passes `ADMIN_TOKEN_KEY` with no fallback for either Admin secret and never sets `ADMIN_DEV_MODE`; `script/preflight.sh` and the Ansible pre-check refuse a missing or denylisted `ADMIN_TOKEN_KEY`, keep refusing a missing or denylisted `ADMIN_BOOT_SECRET`, and refuse `ADMIN_DEV_MODE` set; `script/test-preflight-fail-closed.sh` proves each refusal; the three e2e jobs set an explicit non-default `ADMIN_TOKEN_KEY` beside the existing boot secret and boot with no switch; and the service's five-value code constant equals `script/preflight.sh:56-61` exactly — one assertion compares the two lists, because the shell and the Node build unit have no import edge. No-change half: no new catalogue key, contract token, route, request or response field, bound, migration, or stored value, proven by `script/contract-check.sh`, `script/catalogue-coverage-check.sh`, and a diff over `services/admin/migrations/` | `script/test-preflight-fail-closed.sh` (new key/switch cases) + a bundle assertion over `deploy/compose.yaml`, `script/preflight.sh`, `deploy/ansible/playbook.yaml`, and `.github/workflows/ci.yml` + the denylist-parity assertion beside the code constant |
| `BOOT-R1` | **Residual-risk record, not a guard.** Three accepted residuals, each named by the sibling specs: (a) a fail-closed boot is an availability change — an upgrade that skips `ADMIN_TOKEN_KEY` stops Admin, the sign-in service, until the variable is provisioned (R-25, threat model R12; the mitigation is the same-release bundle/pre-flight/runbook delta, never a fallback); (b) a short but unpublished key is accepted because no length or strength policy exists in the tree (requirements 40.6 — inventing one is its own decision); (c) a gate-bypassed install that sets `ADMIN_DEV_MODE=1` restores both defaults, which no service-side guard can prevent (the gates refuse the switch; the service only logs the warning). `DB_PASSWORD`'s own compose default and `NODE_ENV` semantics are out of scope. **No guard in this slice may assert a fix for any of these** | Risk register R-25 + threat model R12 + this row; follow-up decisions required |
| `BOOT-E1` | Evidence rule: the implementation PR records the before/after pairs for the two fail-closed boots, the denylist, the switch, and the bundle gate plus the `postgres-parity (admin)` parity run and the no-environment suite run (`docs/testing/evidence/638/README.md`, created by that PR, same capture method as the `#631`, `#633`, `#636`, `#637`, and `#642` records), and records the slice row in `docs/testing/test-report.md` (`test-strategy.md` [section 3](test-strategy.md) exit criterion 6). Stays pending until all three are recorded | Evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row whose guard does not exist at this
head. Rows marked covered by re-run rest on pins that exist and pass
today (section 2) and must keep passing untouched. The rows stay
`pending` / `covered by re-run` until the implementation PR merges,
passes, and `qa-lead` re-pins every cell with `file:line` at the merged
head (section 8).

| Item | Required guard | Guard |
|---|---|---|
| `AC-BOOT-1` — outside the explicit dev switch, a boot without `ADMIN_TOKEN_KEY` (unset or empty) exits non-zero before the port, the Postgres connection, a migration, a seed, or one served request, with one plain line naming the variable and no token signed or verified with a fallback key (traces to US-ADM-2; `FR-ADM-2`, `NFR-SEC-1`, `NFR-SEC-2`, `FR-BOOT-1`; `BR-70`) | L1 acceptance: the unset and empty cases with the exit code, the stderr line, the no-listen and no-`/healthz` proofs, the no-store and no-migration proofs, and the provisioned-key control | **Pending** — `BOOT1`; today's fail-open expression is `services/admin/src/store.ts:234`, `services/admin/src/pgstore.ts:72` |
| `AC-BOOT-2` — outside the switch, a boot without a usable `ADMIN_BOOT_SECRET` (unset, empty, or one of the five denylisted values) exits non-zero on the same terms, names the variable and never the value, creates no owner, so neither the `change-me` seed nor the compose `change-me-dev-only` fallback reaches a running service (traces to US-ADM-2; `FR-ADM-2`, `NFR-SEC-1`, `NFR-SEC-2`, `NFR-DEP-1`, `FR-BOOT-2`; `BR-70`) | L1 acceptance: the unset, empty, and five denylist cases in both stores, the no-owner-row proof, the no-value-in-output proof, and the provisioned-secret control | **Pending** — `BOOT2`; today's seed is `services/admin/src/server.ts:119-123` and the denylist is `script/preflight.sh:56-61` |
| `AC-BOOT-3` — with `ADMIN_DEV_MODE=1` a missing key uses `dev-only-change-me` and a missing boot secret uses `change-me`, a provided value wins, and the boot logs one warning naming the switch and both fallbacks; with the switch absent, empty, `0`, or any other value the fail-closed rules apply; no other variable, `NODE_ENV` included, enables the fallbacks (traces to `NFR-SEC-2`, `FR-BOOT-3`; `BR-70`) | L1 acceptance: the switch-on boot with the warning, the provided-value-wins pair, the switch-off matrix, and the `NODE_ENV=production` case | **Pending** — `BOOT3`; the boot order it joins is `services/admin/src/index.ts:16-38`, and `NODE_ENV` is set by `services/admin/Dockerfile:13` |
| `AC-BOOT-4` — a checkout with neither variable exported runs `npm test` in `services/admin` green, with the existing Admin suites keeping their assertions and any real-boot suite covered by the switch for that process (traces to `NFR-SEC-2`, `FR-BOOT-4`; `BR-70`) | L1 suite run + diff gate: the no-environment command, the unchanged assertions, and the CI job's empty environment | **Pending** — `BOOT4`; the explicit-key pins that make it achievable are `services/admin/src/server.test.ts:28-32`, `services/admin/src/auth.test.ts:44-47`, `services/admin/src/bodyBound.test.ts:112`, `services/admin/src/pgstore.test.ts:33-38`, `services/admin/src/migrate.test.ts:38-39` |
| `AC-BOOT-5` — the release bundle carries the change: compose supplies no Admin-secret fallback and passes `ADMIN_TOKEN_KEY`; the CI e2e jobs set an explicit non-default key beside the boot secret and boot with no switch; pre-flight and the Ansible pre-check refuse a missing or default key and refuse `ADMIN_DEV_MODE`; the local-dev/env-file, deployment, runbook, release-note, and rollback documents name the third secret and the new failure mode; the two fail-closed boots and the switch path are covered by tests; nothing else moves (traces to `NFR-DEP-1`, `NFR-SEC-1`, `NFR-SEC-2`, `FR-BOOT-5`; `BR-70`) | L4 install/upgrade drill + bundle gate + diff gate: the compose/pre-flight/Ansible/CI assertions, the denylist parity, the document deltas, and the no-change surface | **Pending** — `BOOT5`; today's bundle is `deploy/compose.yaml:138-149`, `deploy/ansible/playbook.yaml:37-43`, `.github/workflows/ci.yml:500`/`:575`/`:676`, and `script/preflight.sh:56-73` |
| `FR-BOOT-1` — a boot without a signing key is refused before any side effect (requirements 40.3) | L1 acceptance | **Pending** — `BOOT1` |
| `FR-BOOT-2` — a boot without a usable boot secret is refused and no published default seeds an owner (requirements 40.3) | L1 acceptance | **Pending** — `BOOT2` |
| `FR-BOOT-3` — the explicit dev switch is the only path back to the dev fallbacks (requirements 40.3) | L1 acceptance | **Pending** — `BOOT3` |
| `FR-BOOT-4` — the local test path still boots without the variables (requirements 40.3) | L1 suite run + diff gate | **Pending** — `BOOT4` |
| `FR-BOOT-5` — the release bundle carries the third secret and never the switch (requirements 40.3) | L4 drill + bundle gate | **Pending** — `BOOT5` |
| `BR-70` — the Admin boot rule: outside `ADMIN_DEV_MODE=1` both secrets are mandatory, unset/empty/denylisted values refuse the boot before any side effect with one line naming the variable and never its value, nothing is seeded or served, the switch alone restores the dev fallbacks with one warning, `NODE_ENV` enables nothing, and the key is the third per-sale secret gated by the pre-flight (business rules section 8; section 9 fixed row) | L1 acceptance + bundle gate + evidence | **Pending** — `BOOT1`–`BOOT5`, `BOOT-E1` |
| `FR-ADM-1` / `FR-ADM-2` / `FR-ADM-4` (MVP rows, unchanged) — hotel profile setup, user accounts and roles, and rate-plan/policy setup keep their wording and their guards; a successful boot serves every operation exactly as today | L1 re-run: the three MVP guard slots in matrix sections 1–2, unedited | **Covered by re-run today** — `services/admin` tests `saves local settings and enforces role reach`, the per-role create/refusal/lockout suite and fixtures (matrix section 1, `FR-ADM-1`/`FR-ADM-2`), and the `FR-ADM-4` config guard; the MVP rows in section 1 stand unchanged and may not cite this slice as their guard |
| `NFR-SEC-1` / `NFR-SEC-2` (unchanged) — role reach does not move, and sign-in, lockout, idle expiry, token verification, revocation, and role authorization are unchanged; only the source of the key a token is signed with at boot moves | L2 re-run | **Covered by re-run today** — the role-matrix and `NFR-SEC-2` guards in matrix section 2 plus `services/admin/src/auth.test.ts`; a role or lockout assertion change fails `BOOT4` |
| `NFR-DEP-1` / `NFR-AVL-1` (unchanged) — one installation still serves one property, every decision is local to the Admin process at boot, no new host, port, or outside dependency appears, and a boot that would have been insecure stops instead of serving | L2/L4 re-run | **Covered by re-run today** — the pre-flight/install gates (`script/preflight.sh:63-73`, `script/test-preflight-fail-closed.sh:28-48`) and the e2e single-host bring-up; the availability cost of a refusal is R-25/R12, not an NFR change |
| `NFR-AUD-1` (unchanged) — the boot seed keeps its server-side `boot` actor, a refused boot writes no audit entry, and no recorded shape changes | L2 re-run | **Covered by re-run today** — `services/admin/src/store.ts:262-281` and the Postgres twin at `services/admin/src/pgstore.ts:90-110` (actor `boot`, hash-only storage); the no-entry half is a `BOOT1`/`BOOT2` assertion |
| `NFR-I18N-1` (unchanged) — the failure is one plain English operator log line, not a catalogue sentence: no catalogue key, Vietnamese twin, or message mirror is added, the English and Vietnamese key sets stay at parity, and no desk sentence renders an envelope code, status number, or stack text | Catalogue gate + diff gate | **Covered by re-run today** — `script/catalogue-coverage-check.sh` and `services/admin/src/messages.test.ts`; a new catalogue key for the boot line fails `BOOT5`'s no-change half |
| `NFR-BND-1`..`NFR-BND-3`, `NFR-PERF-1`/`NFR-PERF-2`, `NFR-RET-1`, `NFR-TZ-1` (unchanged) — no route, body ceiling, parse refusal, header, body-read, response-write, idle bound, desk read, stored record, or date format moves; a successful boot serves `/healthz` and every operation exactly as today | No-change re-run | **Covered by re-run today** — the #627/#630 Admin envelope and body-bound guards (`services/admin/src/errors.test.ts`, `bodyBound.test.ts`), the timed desk run, and the restore drill; a new route, bound, or migration fails `BOOT5`'s diff half |
| Contract and LC gate | No `contracts/` change at all: a boot refusal has no request, response, status, envelope, or code token, `contracts/errors/envelope.json` gains no token, every fixture keeps its answer, and `script/contract-check.sh` stays green; the `AdminService` row in `docs/technical/api-spec.md` section 2 gains one deployment-precondition sentence only | **Pending gate** — `BOOT5`'s no-change half; the api-spec sentence is `architect`'s (LLD 39.5) |
| No-configuration and no-migration gate | Real delta: the denylist is one fixed code constant that equals `script/preflight.sh:56-61`, the switch is read only by the Admin service, and no `deploy/` setting, per-hotel config key, migration, column, `CHECK`, backfill, or stored-value rewrite is added | **Pending gate** — `BOOT5` (parity and bundle) + the diff gate; the fixed side is `docs/requirements/business-rules.md` section 9 (`BR-70`) |
| Deployment and env gate (`release-manager`) | Real delta: `ADMIN_TOKEN_KEY` joins `DB_PASSWORD` and `ADMIN_BOOT_SECRET` in the env file, the install/upgrade entry points, the deployment and local-dev documents, the runbook symptom ("Admin refuses to boot"), the release note, and the rollback note; the one-time re-sign-in is named | **Pending** — owned outside this slice; `BOOT5` asserts the executable half (compose, pre-flight, Ansible, CI) and the document half is `release-manager`'s handoff |
| Residual risk `BOOT-R1` | The fail-closed boot can stop a deployment that relied on the defaults; a short but unpublished key is accepted; a gate-bypassed switch restores the defaults; `DB_PASSWORD` and `NODE_ENV` are out of scope | **Recorded, not guarded** — R-25, threat model R12, LLD 39.6, and this row; no guard may assert a fix |
| Evidence cross-reference (`BOOT-E1`) | The before/after pairs, the `postgres-parity (admin)` run, the no-environment suite run, and the slice row in the test report | **Pending** — `docs/testing/evidence/638/README.md` and the `test-report.md` row are created by the implementation PR |

Slice coverage (Refs #638): 22 rows mapped to `AC-BOOT-1`..`AC-BOOT-5`,
`FR-BOOT-1`..`FR-BOOT-5`, `BR-70`, the unchanged MVP rows
`FR-ADM-1`/`FR-ADM-2`/`FR-ADM-4`, the unchanged NFR rows
`NFR-SEC-1`/`NFR-SEC-2`, `NFR-DEP-1`/`NFR-AVL-1`, `NFR-AUD-1`,
`NFR-I18N-1`, and the `NFR-BND-1`..`NFR-BND-3` / `NFR-PERF` / retention
/ timezone group, the contract/LC gate, the configuration/migration
gate, the deployment/env gate, the residual-risk record `BOOT-R1`, and
`BOOT-E1`. Six rows carry a pinned-today half (the unchanged MVP row,
the unchanged `NFR-SEC` row, the `NFR-DEP`/`NFR-AVL` row, the
`NFR-AUD-1` row, the `NFR-I18N-1` row, and the no-change
`NFR-BND`/`NFR-PERF`/retention/timezone row); the other sixteen are
**pending** the implementation PR. The slice is **not complete** at this
spec head; it completes when the implementation PR merges with
`BOOT1`–`BOOT5` green, the Postgres halves recorded in the
`postgres-parity (admin)` job, `BOOT-E1` recorded, and `qa-lead` re-pins
the rows at the merged head. The MVP Coverage line in
[traceability-matrix.md](traceability-matrix.md) stands unchanged at
57/57.

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: `docs/architecture/services/admin.md` section 7) |
|---|---|---|
| L1 service, Admin (memory store) | `BOOT1`–`BOOT3` child-process boots and resolver units, `BOOT4`, plus every existing Admin pin | `cd services/admin && npm ci && npm run build && npm test && npm run lint` (CI `node-build (admin)`; `npm test` builds first) |
| L1 service, Admin (Postgres parity) | The `BOOT1`/`BOOT2` scratch-database halves: no migration applied by the refused boot, no `admin.users` row, the provisioned controls seed and sign in | the Admin suite in the `postgres-parity (admin)` matrix job, which applies the Admin migrations and exports `TEST_PG_URL`; the suite gate is `services/admin/src/pgstore.test.ts:17` (`const DATABASE_URL = process.env["TEST_PG_URL"]`), the cases skip without it, and the spawned refused-boot child receives that value as `DATABASE_URL` (`:381`, `:393`), which the service reads at boot (`services/admin/src/index.ts:14`); the job fails on any skipped case |
| L1 service, Admin (no-environment path) | `BOOT4`: the suite from a shell with neither variable exported | `cd services/admin && env -u ADMIN_TOKEN_KEY -u ADMIN_BOOT_SECRET npm test` |
| L4 bundle and gate | `BOOT5`: compose, pre-flight, Ansible, the denylist parity, and the new pre-flight refusal cases | `bash script/test-preflight-fail-closed.sh` (plus `docker compose -f deploy/compose.yaml config` on a machine with Compose) |
| LC contract | The no-change half: no contract file moved and every fixture still resolves | `script/contract-check.sh` (CI `contract-check`) |
| Catalogue | The no-change half: no new key, both locales at parity | `script/catalogue-coverage-check.sh` (CI `ci`) |
| E2E regression | The `e2e-single-host` and `browser-e2e` jobs boot Admin with explicit non-default values and no switch, and the desk loop still signs in; `dom-diff` is FE-only and SKIPPED for an Admin-only change | CI `e2e-single-host`, `browser-e2e`; `dom-diff` is path-filtered to `app/**`, `docs/design/**`, `tests/design-facts/**`, and `docs/technical/desk-ui-fact-schema.md` (`.github/workflows/ci.yml:87-91`) and reports SKIPPED otherwise (`.github/workflows/ci.yml:185-190`) |
| Gates | Links, harness conventions, whitespace | `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `node-build
(admin)`, `e2e-single-host`, `browser-e2e`, `contract-check`,
`migrate-check`, `ci`, and `postgres-parity (admin, node)`. `dom-diff` is
FE-only — path-filtered to `app/**`, `docs/design/**`,
`tests/design-facts/**`, and `docs/technical/desk-ui-fact-schema.md`
(`.github/workflows/ci.yml:87-91`) and SKIPPED for this Admin-only slice
(`.github/workflows/ci.yml:185-190`) — so it is not a required check here.
The Postgres parity half runs in the `postgres-parity (admin)` job, which
applies the Admin migrations, exports `TEST_PG_URL`, and fails on any
skipped case, so `BOOT-E1` records that job's run.

### Execution order

1. Resolver units and the memory child-process boots: the new
   `BOOT1`–`BOOT3` cases first (a red case stops the run), then every
   existing Admin pin unchanged.
2. The Admin Postgres suite in the `postgres-parity (admin)` job
   (`TEST_PG_URL` exported by the job): the refused-boot halves (zero
   migrations, zero `admin.users` rows) and the provisioned controls.
3. `BOOT4`: the suite again from a shell with neither variable
   exported, then `script/contract-check.sh` and the catalogue gate.
4. `BOOT5`: the pre-flight refusal cases, the compose/Ansible/CI
   assertions, and the denylist-parity check.
5. The three e2e jobs on the bundle with explicit non-default values
   and no switch, proving the fail-closed contract is satisfiable.
6. `BOOT-E1`: the before/after pairs, the parity run, and the
   no-environment run recorded; then the `test-report.md` row.
7. Link, harness, and whitespace gates; then `qa-lead` re-pins section 4
   at the merged head.

### Entry criteria

1. The spec set is `active` and `spec-reviewer` has posted `SPEC-GATE
   PASS` on #638 (T4).
2. The companion specs this plan cites are active: acceptance-criteria
   section 32 (`AC-BOOT-1`..`AC-BOOT-5`), requirements section 40
   (`FR-BOOT-1`..`FR-BOOT-5`, `BR-70`), HLD section 31, LLD section 39,
   and the Admin design's Operations delta.
3. The build under test is identified by commit. The memory half needs
   no database; the Postgres half needs a scratch database carrying the
   two Admin migrations and readable `admin.users` rows; the bundle half
   needs a Compose-capable host and the env file with non-default
   values for both secrets and no switch.

### Exit criteria

1. `BOOT1`–`BOOT5` exist and pass; every refusal asserts the process
   outcome **and** its absence proofs (no store call, no migration, no
   owner row, no listen, no `/healthz`), and no secret value appears in
   any line.
2. The Postgres halves ran in the `postgres-parity (admin)` job and
   showed the same refusals and absences as the memory halves, with the
   provisioned controls booting on both.
3. `BOOT4` holds: the suite is green with neither variable exported,
   every existing Admin assertion keeps its wording, and the
   `node-build (admin)` job exports no `ADMIN_*` variable.
4. `BOOT5` holds: compose supplies no Admin-secret fallback and passes
   `ADMIN_TOKEN_KEY`; pre-flight, Ansible, and the three e2e jobs carry
   explicit values and refuse the switch; the code denylist equals
   `script/preflight.sh:56-61`; no new catalogue key, contract token, or
   migration appeared.
5. `BOOT-E1` is recorded: the evidence pairs in
   `docs/testing/evidence/638/README.md` and the slice row in
   `docs/testing/test-report.md`.
6. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
7. Open failures are filed as issues with FR/NFR ids; no `risk-high`
   failure is waived without owner approval.

### Negative controls

- **A refusal must leave nothing behind.** `BOOT1`/`BOOT2` assert the
  absent store call, migration, owner row, port, and `/healthz` answer;
  an exit code after a seed is the exact fail-open shape this slice
  removes.
- **The control must boot.** `BOOT1` and `BOOT2` each carry a
  provisioned-value control, so a check that refuses everything fails:
  a real key and secret must boot, answer `/healthz`, seed the owner,
  and sign a session.
- **Empty is not "provided".** `BOOT1` and `BOOT2` send `""`
  explicitly; a guard that only tests `undefined` passes the unset case
  and fails the empty one.
- **The denylist is five exact values, both secrets.** `BOOT2` loops
  every entry and `BOOT5` compares the code list to the shell list; a
  case-insensitive or trimmed comparison, or a check applied to only one
  secret, fails.
- **The switch is exactly `1`.** `BOOT3` sends `0`, `01`, `true`, and
  `yes` and expects refusal each time; a truthiness check would boot on
  all four.
- **`NODE_ENV` decides nothing.** `BOOT3` runs `NODE_ENV=production`
  with no switch and expects a refusal, then the switch with both
  `NODE_ENV` values and expects the warning; a gate keyed on
  `NODE_ENV` fails one half or the other.
- **No value is ever printed.** `BOOT2` presents a unique non-default
  sentinel as the offending secret and asserts the stderr line does not
  contain it; a line that echoes the value fails even with the right
  exit code.
- **The local path must stay green.** `BOOT4` runs the suite with
  neither variable exported; a change that requires the variables on
  the test path fails.

## 6. Owner verification cases (BOOT-1..BOOT-8)

Plain-language cases the owner can run on the lab once the change lands,
using the bundle and the env file from
`docs/devops/local-dev-setup.md` section 3. Each case states what to set
and what to see.

| Case | Setup | Expected |
|---|---|---|
| `BOOT-1` | Start Admin with no `ADMIN_TOKEN_KEY` set, `ADMIN_BOOT_SECRET` set to a real value, and no switch | The container stops, exits `1`, and prints one line naming `ADMIN_TOKEN_KEY`; the desk cannot open, and `GET /healthz` refuses to connect |
| `BOOT-2` | Set a real `ADMIN_TOKEN_KEY`, remove `ADMIN_BOOT_SECRET`, no switch | The same stop, with the line naming `ADMIN_BOOT_SECRET` |
| `BOOT-3` | Keep the real key, set `ADMIN_BOOT_SECRET=change-me`, then `change-me-dev-only`, then `password` | Each start stops with the line naming `ADMIN_BOOT_SECRET` and never shows the value; sign-in with that value never works because no owner is seeded |
| `BOOT-4` | Set both variables to real non-default values and no switch | Admin boots, `/healthz` answers `ok`, and the owner signs in with the provisioned boot secret |
| `BOOT-5` | With both variables unset, set `ADMIN_DEV_MODE=1` | Admin boots, prints one warning naming the switch, and the owner signs in with `change-me`; the desk works for dev |
| `BOOT-6` | With both variables unset, set `ADMIN_DEV_MODE=0`, then `NODE_ENV=production` only | Each start is refused exactly as `BOOT-1`; neither value re-opens the defaults |
| `BOOT-7` | Run the install or upgrade pre-flight with `ADMIN_TOKEN_KEY` missing, then with a denylisted key, then with `ADMIN_DEV_MODE` set | Each pre-flight refuses before the bundle starts, naming the missing or default key or the switch |
| `BOOT-8` | After a first boot with a real key, sign in with a token minted before the change | The old token is refused and the owner signs in again once — expected, not a defect |

Bundle regression on the same build: `BOOT-D1` the desk sign-in and
sign-out still work with the provisioned values; `BOOT-D2` the admin
console still reads and saves the hotel config and lists users;
`BOOT-D3` the audit log still lists account and config changes. Expected:
unchanged from the pre-change desk.

## 7. Evidence rule BOOT-E1

The implementation PR records five before/after pairs plus two runs
(`docs/testing/evidence/638/README.md`, created by that PR, same capture
method as the `#631`, `#633`, `#636`, `#637`, and `#642` records):

- **Signing-key pair.** Before: with no `ADMIN_TOKEN_KEY`, Admin boots,
  answers `/healthz`, and issues and verifies session tokens with
  `dev-only-change-me` — a key printed in this repository. After: the
  same start exits `1`, prints one line naming `ADMIN_TOKEN_KEY`, opens
  no port, and signs nothing.
- **Boot-secret pair.** Before: with no `ADMIN_BOOT_SECRET`, Admin seeds
  an `owner` account whose password is `change-me`, and signing in with
  `change-me` works on a fresh install. After: the start exits `1`,
  names `ADMIN_BOOT_SECRET`, and creates no owner row in either store,
  so the published password never opens anything.
- **Compose-fallback pair.** Before: an install that leaves
  `ADMIN_BOOT_SECRET` unset boots with the bundle fallback
  `change-me-dev-only` and seeds the owner with it. After: the boot is
  refused (the fallback is denylisted), and the bundle no longer
  supplies a fallback for either Admin secret.
- **Switch pair.** After: with `ADMIN_DEV_MODE=1` and both variables
  unset the service boots, logs the one warning, signs with
  `dev-only-change-me`, and seeds `change-me`; with the switch `0` or
  absent the same start is refused — recorded as the dev-path proof.
- **Bundle-gate pair.** Before: pre-flight and the Ansible pre-check
  pass with no `ADMIN_TOKEN_KEY` and with `ADMIN_DEV_MODE` set. After:
  each refuses, and `script/test-preflight-fail-closed.sh` prints the
  new PASS lines for both.
- **Parity run.** The `BOOT1`/`BOOT2` Postgres halves executed in the
  `postgres-parity (admin)` job: the refused suite leaves `admin.users`
  empty and no migration row applied, and the provisioned control suite
  migrates, seeds, and signs in — with the job's pass summary pasted (a
  green `node-build (admin)` job alone is not parity evidence).
- **No-environment run.** `env -u ADMIN_TOKEN_KEY -u
  ADMIN_BOOT_SECRET npm test` in `services/admin`, pasted with the pass
  summary, plus the `node-build (admin)` run id.

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and the re-pin rule

At the spec head: 22 rows mapped — six rows carry a pinned-today half
whose pins exist and pass (the unchanged MVP row, the unchanged
`NFR-SEC` row, the `NFR-DEP`/`NFR-AVL` row, the `NFR-AUD-1` row, the
`NFR-I18N-1` row, and the no-change `NFR-BND`/`NFR-PERF`/`NFR-RET`/
`NFR-TZ` row) and the other sixteen are **pending** the
implementation PR (the registry `BOOT1`–`BOOT5`, the gates, the
residual-risk record, the deployment/env gate, and `BOOT-E1`). The slice
is **not complete** at this spec head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise. When the implementation PR merges, `qa-lead`
re-reads every `file:line`, rewrites the pins in place (never deletes
one), records the merged head SHA in the matrix section 32 status line,
and flips the rows. A row whose guard the PR did not create stays
pending and is filed as a gap on #638.

The wiring changes the implementation PR is expected to make are not
assertion changes: `resolveBootConfig`/`BootConfigError` land in
`services/admin/src/bootConfig.ts`, the resolver is called as the first
statement of `main`, the two store constructors and the
`createServiceServer` default stop carrying a keyless path,
`bootStoreFromEnvironment` takes the resolved identity and secret, and
the bundle/pre-flight/CI files carry the new variable and refuse the
switch. Every existing Admin assertion — including the explicit-key
boot helpers at `services/admin/src/server.test.ts:28-32`,
`services/admin/src/auth.test.ts:44-47`,
`services/admin/src/pgstore.test.ts:33-38`,
`services/admin/src/bodyBound.test.ts:112`, and
`services/admin/src/migrate.test.ts:38-39` — must keep its wording.
Deleting or loosening an assertion instead of adding cases beside it
fails `BOOT4`.

The 57/57 MVP coverage count in
[traceability-matrix.md](traceability-matrix.md) stands unchanged: this
slice adds no MVP capability, and no MVP row may cite it as its guard.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1280
