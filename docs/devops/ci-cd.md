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
  the metadata `ci` job alone. A change to the workflow file itself
  (or a push to `master`) runs the full matrix, so no PR goes green
  without its required checks. The desk-shell filter (`app/**`,
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
  `contracts/openapi.yaml` and every spec route resolves to a
  contract route).
- **migrate-check.** When services or deploy changed: every module
  boot migration applies against a scratch PostgreSQL.
- **e2e-single-host.** When services, deploy, scripts, or contracts
  changed: per-hotel configuration prep, proxy configuration
  validation, pre-flight gate (fails closed on default secrets),
  then the desk loop end to end (book, verify, backup, restore,
  verify) with teardown.
- **browser-e2e.** When the shell or any service changed: installer
  bring-up, then the Playwright Chromium suite over the served Vue
  SPA (`/app/*`: sign-in, booking, moves, charges, checkout, print),
  with the HTML report uploaded as an artefact and the lab torn
  down after.
- **perf-reporting-variant.** Always runs: rebuilds two years of
  50-room data in-process and times each standard report (NFR-PERF-2
  record for `docs/testing/test-report.md`; CI runners are variants,
  never compared against single-host bounds).

## 3. Merge gates

- A PR merges only when every job its changed areas require is
  green; docs-only PRs are gated on the metadata `ci` job alone.
- Concurrency cancels in-progress runs per ref, so only the latest
  push per PR is gated.
- Release bookkeeping (`docs/release/*`) stays stubbed until the
  first release ships; per-release notes and rollback entries begin
  then.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-190
