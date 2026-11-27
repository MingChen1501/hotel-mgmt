# #807 Admin Postgres parity suite — evidence

Repair record for
[issue #807](https://github.com/MingChen1501/hotel-mgmt/issues/807)
(`FR-ADM-2`, `FR-SEC-3`, `NFR-AUD-1`; the `postgres-parity` stage of
[#769](https://github.com/MingChen1501/hotel-mgmt/issues/769) in
[ci-cd.md](../../../devops/ci-cd.md) section 2). This record pairs the
recorded failing run on master with the green run on this branch, so
the Admin suite can gate the DB-backed job.

## Builds and lab

| Half | Build | Notes |
|---|---|---|
| Before | `origin/master` at `60a4c94`, `services/admin` in a clean worktree (`npm ci && npm run build`) | reproduces the issue's `tests 9, pass 8, fail 1` on `dist/pgstore.test.js` |
| After | this branch, `services/admin` (`npm ci && npm run build`) | the two fixes below |
| Postgres | a throwaway `postgres:16-alpine` container created for this session (`pg807`, `127.0.0.1:55437`) with `migrations/001_boot.sql` and `002_schema.sql` applied to two fresh databases (`hotel` and `hotel_pre`) | the owner's shared `hotel-mgmt` lab and compose project were not touched |

Commands, from `services/admin`:

```sh
TEST_PG_URL=postgresql://hotel:hotel@127.0.0.1:55437/hotel_pre \
  node --test --test-concurrency=1 --test-reporter=tap dist/pgstore.test.js
TEST_PG_URL=postgresql://hotel:hotel@127.0.0.1:55437/hotel \
  node --test --test-concurrency=1 --test-reporter=tap "dist/**/*.test.js"
npm test
```

## Before — the recorded failure on master

The last-owner case called `updateUserRole(owner, ...)` with the target
owner as the caller, so the own-role guard answered first:

```text
# tests 9
# pass 8
# fail 1
    not ok 4 - manages roles, unlock, sign-out, list, and audit over persisted rows (FR-ADM-2, NFR-SEC-1/2, NFR-AUD-1)
      error: |-
        The input did not match the regular expression /last remaining owner/. Input:

        'Error: You cannot change your own role.'
```

That assertion failure masked the second finding: once the caller path
was repaired, the same case failed at `config.updated`, because a
profile-column write (`timezone`) was reported as
`profile.updated:hotel_profile`.

## Finding 1 — the last-owner guard needs a second owner as the caller

`services/admin/src/pgstore.test.ts` now mirrors the in-memory HTTP
guard (`services/admin/src/server.test.ts`, "refuses to demote the last
remaining owner"): it creates a second owner, demotes it to manager
through the boot owner, then asks the second owner's session to demote
the boot owner. The own-role guard no longer matches, so the case
reaches `error.validation.last_owner`, and the user list expects the
third account.

## Finding 2 — a profile-column write is a `config.updated` entry

`services/admin/src/pgstore.ts` derives the audit view from the stored
rows. The profile row carries one `updated_by`/`updated_at` for the
whole aggregate, so the Postgres entry keeps `hotel_profile` as its
entity but now uses the action both stores record for a config write:
`config.updated`. The in-memory store derives one `config.updated`
entry per config key from its map (`services/admin/src/store.ts`), and
`AC-SEC-3` / `FR-SEC-3` require both stores to agree on the action
and actor. The test asserts the action, the actor (`owner`), the
aggregate entity, and the absence of `profile.updated`, so the parity
claim is pinned rather than weakened.

## After — both suites green

With `TEST_PG_URL` set (the CI parity configuration):

```text
# tests 93
# pass 93
# fail 0
# skipped 0
ok 13 - admin postgres store
ok 14 - fail-closed boot on Postgres (BOOT1, BOOT2)
```

Without `TEST_PG_URL` (the ordinary `npm test` path):

```text
# tests 84
# pass 83
# fail 0
# skipped 1
```

The one skipped case is the Postgres suite's own skip guard, unchanged
from before this change; the DB-backed job exports `TEST_PG_URL`, so
its skip guard fails the run if that half ever disappears.

## CI gate

`.github/workflows/ci.yml` now lists `admin` in the `postgres-matrix`
selection and in the `postgres-parity` job, and the two hold-out
comments naming #807 are gone. Because this PR changes the workflow,
the `changes` job runs the full matrix (including `admin`) on it; later
Admin-only PRs select the Admin entry through `NODE_ADMIN`.

## Observed on PR #814

[PR #814](https://github.com/MingChen1501/hotel-mgmt/pull/814) at
`b70c275` ran the full matrix (the workflow change selects every
`postgres-parity` module) in CI run `46072273883`, with all 24 checks
green:

| Job | Result |
|---|---|
| `postgres-parity (admin, node)` (`140751832869`) | `# tests 93`, `# pass 93`, `# fail 0`, `# skipped 0`; the guard's own summary `node: tests=93 passed=93 failed=0 skipped=0 postgres_suites=2` |
| `node-build (admin)` (`140751832789`) | `# tests 84`, `# pass 83`, `# fail 0`, `# skipped 1` (the Postgres suite's own skip guard, `TEST_PG_URL` unset) |

The two configurations therefore stay distinct. With `TEST_PG_URL`
exported — the parity job sets it in its `env` block — any skipped test
or suite, a run that executes zero cases, or a run with no
Postgres-named suite fails the job, so a green `admin` entry proves the
Postgres store ran instead of being skipped. With `TEST_PG_URL` unset,
the ordinary `npm test` path keeps the one suite-level skip and stays
green, and the parity job does not run at all. A later Admin-only PR
selects just the Admin entry through `NODE_ADMIN`.

Takeover record: dev-takeover (AO session hotel-mgmt-1360).

No migration, message, contract enum, or unrelated Admin behaviour
changed.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1357
