# CI/CD — pipeline stages, checks, and merge gates

Status: active. Pipeline stages, checks, and merge gates for the
hotel-mgmt MVP, owned by `release-manager` (Closes #133). This
document describes the live path-aware CI in
`.github/workflows/ci.yml` only — it changes no pipeline behaviour.
Needed pipeline changes become issues.

## 1. Triggers

- Every pull request runs the pipeline.
- Every push to the default branch (`master`) runs the full matrix,
  so the branch stays fully green.

## 2. Stages

- **changes.** Always runs. A path filter maps changed areas to the
  heavy jobs below (Go modules, Node modules, the desk-shell app,
  billing, services, contracts, frontend docs, deploy, scripts,
  workflow). Docs-only changes
  (`docs/**`, `template/**`, markdown, issue/PR templates) match no
  code filter, so every heavy job is skipped and the PR is gated on
  the always-on jobs (`changes`, `ci`, `doc-pins`, and
  `perf-reporting-variant`) alone. A change to the workflow file
  itself (or a push to `master`) runs the full matrix, so no PR goes
  green without its required checks. The desk-shell filter (`app/**`,
  `deploy/nginx/nginx.conf`, `deploy/compose.yaml`,
  `frontend/*.html`, `script/shell-served-check.sh`) gates the
  `app-build` job; the `browser-e2e` job runs when the shell or any
  service changed.
- **ci (metadata).** Always runs: shell syntax check over
  `script/*.sh`, required-paths check (AGENTS.md, README.md,
  `docs/README.md`, `docs/ao-rules.md`, issue conventions,
  permissions config, issue/PR templates), no merge-conflict
  markers in tracked files, no secrets-looking strings in tracked
  files, catalogue-coverage check (`script/catalogue-coverage-check.sh`),
  pre-flight fail-closed proof (`script/test-preflight-fail-closed.sh`),
  markdown-link check (`script/markdown-link-check.sh`: every
  markdown link resolves, no bare section glyphs), and the harness
  conventions self-check plus its `--self-test` red proof
  (`script/harness-conventions-check.sh`).
- **doc-pins.** Always runs: `script/doc-pin-check.sh` over
  `docs/architecture`, `docs/testing`, and `docs/requirements` with
  the shared keyword map and allow-list, checking each `path:line`
  pin against the content its cited line must contain rather than
  against the number alone; a pin with no supplied keyword is reported
  UNVERIFIED, never a pass, and an ambiguous suffix is reported rather
  than guessed. A wrong line, a missing file, a line past EOF, or an
  annotation with no pin is a finding, and the job is blocking since
  #787: a reviewed allow-list row can acknowledge a wrong-line,
  missing-file, or past-EOF finding, while a row that matches no
  finding is itself a stale-allow finding. The checker's own red proof
  (`script/doc-pin-check.test.sh`) runs in the `ci` job.
- **app-build.** When the desk shell changed: Node 22 install, build,
  lint, and test over `app/`, then the served-shell guard
  (`script/shell-served-check.sh`: placeholder, history-mode
  fallback to `/app/index.html`, print namespace, legacy cutover
  redirects, served mirror).
- **go-build.** Matrix over the changed Go modules
  (`reservations`, `rates`, `reporting`): build, vet, format check,
  test.
- **node-build.** Matrix over the changed Node modules (`stay`,
  `rooms`, `guests`, `admin`): install, build, lint, test.
- **billing-build.** When the billing service changed: Maven
  package (includes unit tests).
- **contract-check.** When contracts, services, scripts, or frontend
  docs (`frontend/docs/**`) changed:
  the repo contract gate (`script/contract-check.sh`), including the
  OpenAPI mirror gate (`script/openapi-route-check.sh`: the served
  `frontend/docs/openapi.yaml` mirror is byte-identical to
  `contracts/openapi.yaml`, neither copy carries a duplicate YAML
  mapping key — a finding names the key, both `file:line` positions,
  and the key path — and every spec route resolves to a contract
  route) plus the duplicate-key detector's own self-test
  (`script/openapi-route-check.test.sh`: a synthetic duplicate fails
  the gate and a clean fixture passes).
- **migrate-check.** When services or deploy changed: every module
  boot migration applies against a scratch PostgreSQL.
- **postgres-parity.** When a covered service or the workflow changed,
  or on a push to `master`: a matrix over the covered modules —
  `reservations` and `rates` (Go), `stay`, `rooms`, and `guests`
  (Node) — each against its own fresh `postgres:16-alpine` service
  with that module's migrations applied and `TEST_PG_URL`
  (`postgresql://hotel:hotel@127.0.0.1:5432/hotel`) exported. A guard
  fails the job on any failing, skipped, zero-case, or
  Postgres-nameless run, so a green run proves the Postgres stores
  were exercised rather than skipped. `admin` joins the matrix once
  #807 makes its suite green; a change that touches only
  `services/admin/**` therefore runs no parity module.
- **e2e-single-host.** When services, deploy, scripts, or contracts
  changed: per-hotel configuration prep, proxy configuration
  validation, pre-flight gate (fails closed on default secrets),
  then the desk loop end to end (book, verify, backup, restore,
  verify) with teardown.
- **browser-e2e.** When the shell, any service, or the design
  boards/facts harness changed: installer bring-up, then the
  Playwright Chromium suite over the served Vue SPA (`/app/*`:
  sign-in, booking, moves, charges, checkout, print), excluding the
  full-tree DOM diff spec (dedicated `dom-diff` job below), with the
  HTML report uploaded as an artefact and the lab torn down after.
- **dom-diff.** Only on FE PRs — `app/**`, `docs/design/**`, and
  gate files (`tests/design-facts/**`,
  `docs/technical/desk-ui-fact-schema.md`): installer bring-up,
  then only the full-tree DOM diff spec
  (`app/e2e/dom-diff.spec.ts`, text-only, no screenshots) with its
  own HTML report artefact and teardown. Backend-only PRs report
  SKIPPED and never block.
- **perf-reporting-variant.** Always runs: rebuilds two years of
  50-room data in-process and times each standard report (NFR-PERF-2
  record for `docs/testing/test-report.md`; CI runners are variants,
  never compared against single-host bounds).

## 3. Merge gates

- A PR merges only when every job its changed areas require is
  green; docs-only PRs are gated on the same always-on jobs alone
  (`changes`, `ci`, `doc-pins`, and `perf-reporting-variant`).
- A change to a covered service (`services/reservations/**`,
  `services/rates/**`, `services/stay/**`, `services/rooms/**`, or
  `services/guests/**`) requires `postgres-parity` green for that
  module, so the Postgres-backed half of its suite cannot merge with
  that half skipped. A PR that changes neither these services nor the
  workflow skips the job; a workflow change or a `master` push runs
  every module. `admin` is not a parity gate yet (see #807).
- Concurrency cancels in-progress runs per ref, so only the latest
  push per PR is gated.
- Release bookkeeping (`docs/release/*`) stays stubbed until the
  first release ships; per-release notes and rollback entries begin
  then.

## 4. Admin boot secrets in the pipeline (Refs #638)

The Admin service refuses to boot without its two per-sale secrets
(`ADMIN_TOKEN_KEY`, `ADMIN_BOOT_SECRET`) outside the explicit
`ADMIN_DEV_MODE=1` dev switch, so every job that starts the real service
has to carry them. As built (`AC-BOOT-5`):

- **The three container jobs.** `e2e-single-host`, `browser-e2e`, and
  `dom-diff` set `DB_PASSWORD`, `ADMIN_BOOT_SECRET`, and
  `ADMIN_TOKEN_KEY` to throwaway, non-default values
  (`.github/workflows/ci.yml:720-722` <!-- pin: DB_PASSWORD -->,
  `:796-798` <!-- pin: DB_PASSWORD -->,
  `:898-900` <!-- pin: DB_PASSWORD -->). They never set
  `ADMIN_DEV_MODE`, so the bring-up proves the production boot contract,
  not the dev path: an unprovisioned variable stops the installer proof
  at the Admin boot instead of letting it sign with a published key.
- **`script/e2e-desk-loop.sh` and `script/preflight.sh`** keep gating
  the same list, so the pre-flight step inside the installer proof fails
  closed and names the missing variable before any container starts.
- **`node-build`.** The Admin matrix job exports no `ADMIN_*` variable at
  all (`.github/workflows/ci.yml:367-398` <!-- pin: node-build -->), which
  is itself the proof that `cd services/admin && npm test` passes without
  the two secrets (`AC-BOOT-4`). Do not "fix" a red Admin build by
  exporting a secret into that job: the suite must not need one, and
  the guards that spawn the real boot set `ADMIN_DEV_MODE=1` for that
  child process only.
- **Values are throwaway.** Nothing in the pipeline reads a real sale's
  secret, and no job prints one; the fail-closed gates name the variable,
  never the value. A docs-only PR still skips every heavy job (section 2),
  so this delta adds no required check and no new gate.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-190

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-1281
