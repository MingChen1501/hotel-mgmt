# E2E QA pass on the Vue desk UI after merges #407 and #408 (run log)

Status: complete — all five suites PASS, no defects found. QA
execution for issue #409 (post-merge verification of PR #407 `fix(catalogue): Catalogue hardcoded shell
and view UI strings` and PR #408 `fix(print): Isolate print
documents from shell chrome`, both merged to master). No behaviour
change in this session: read-only verification run; the only commit
is this log file. Any failure is filed as a separate fix issue and
linked here; no fixes land in this session (out of scope per #409).

## 0. Build, seed, environment, and method facts

| Fact | Value |
|---|---|
| QA build (worktree HEAD) | `89cbcba` (`fix(print): Isolate print documents from shell chrome (#408)`), on top of `b59fead` (`fix(catalogue): catalogue hardcoded shell and view UI strings (#407)`) |
| Branch | `ao/hotel-mgmt-523/409-e2e-qa-pass`, tracked from `origin/master` |
| Secrets | Per-run generated `DB_PASSWORD` / `ADMIN_BOOT_SECRET` for the loop-kept stack (fail-closed on dev defaults, never printed) |
| Desk UI build | `(cd app && npm ci && npm run build)` (`vue-tsc --noEmit` + `vite build`), green; `app/dist/` served by the loop and the served-shell guard |
| Method | Five suites per #409 scope: (1) full desk loop via `script/e2e-desk-loop.sh --keep-up`; (2) browser E2E (`npx playwright test --project=chromium`) against the loop-kept stack; (3) app vitest (`npm test`); (4) catalogue coverage gate (`script/catalogue-coverage-check.sh`); (5) print isolation characterisation (`script/shell-served-check.sh` + print-focused vitest + `print.spec.ts` browser spec) |

## 1. Full desk loop (`script/e2e-desk-loop.sh`) — PASS

- Command: `DB_PASSWORD=<per-run> ADMIN_BOOT_SECRET=<per-run> script/e2e-desk-loop.sh --keep-up --staging-dir /tmp/opencode/409/backup-staging` (fresh `docker compose up -d --build`, secrets generated per run, never printed)
- Result: **PASS** — `e2e: SUCCEEDED.`, `EXIT=0`, 24 `e2e: PASS` lines, zero FAIL lines.
- Evidence: `e2e: EVIDENCE: reservation=RSV-NGYBHUT7 state=confirmed totalMinor=240000 arrival=2026-11-27 departure=2026-11-29 stay=a83f144e-f434-4926-9731-2f3d055d2576 state=closed invoice=6667dd9e-0e21-4cd7-af67-b3e49af8835a dayCloseDate=2026-10-28 chargesTotal=122500 folioBalance=62500 elapsed=113s (RTO budget 4h).`
- Coverage of the pass: book → check-in (AssignRoom → Stay CheckIn → reservation check-in) → mid-stay move (E2E-101 → E2E-102, old room vacant-dirty) → early-arrival times + daily lists → folio charge/payment/invoice/receipt/day-close (charges 122500, cash 60000, balance 62500) → checkout refusal on open balance (`SETTLEMENT_REQUIRED`) → approval → close with invoice-as-folio → room release → expectation record → backup (43 user tables, read-back verified) → desk backup-report line → restore drill verify-only in 4s (RTO 4h) → re-verify (booking confirmed, stay closed, day-close intact, all desk modules healthy). Stack left up with `--keep-up` for the browser suite in section 2.
- Note: a first browser-suite attempt ran with an empty `ADMIN_BOOT_SECRET` (shell `cd` mistake in the harness invocation, not a product failure) and its 20 failures are discarded; the rerun below uses the loop-kept stack's secret.

## 2. Browser E2E suite (`app`, `chromium` project) — PASS

- Command: `ADMIN_BOOT_SECRET=<loop-kept-stack secret> npx playwright test --project=chromium` (CI gate project only, headless, workers 1; secret taken from the loop-kept `hotel-mgmt-admin-1` container env, never printed)
- Result: **PASS** — 23 passed (29.5s), `EXIT=0`, zero failures, zero loopback-guard violations (offline-LAN guard clean in every spec's `afterEach`).
- Per-file: `smoke.spec.ts` 3 (desk entry + API reachability), `signin.spec.ts` 3 (owner sign-in → dashboard, locked identity wording, signed-out session routed to gate), `book.spec.ts` 5 (walk-in quote/confirm, unpriced-date refusal, sold-out refusal, missing-guest naming, restriction naming), `desk.spec.ts` 3 (backup success line + lists + cross-check, missing-report warning, keyboard-focus outline), `stay.spec.ts` 3 (check-in/move/times/approval/dialog check-out, taken-room refusal, already-closed refusal), `folio.spec.ts` 3 (charge/pay/balance agreement, unknown charge-item refusal, bad payment-method refusal), `print.spec.ts` 3 (invoice/receipt/confirmation match the folio incl. the #408 print-media block asserting `shell-nav` hidden under print emulation while the active document stays visible; unknown-ref and unknown-folio states).
- Stack torn down after the run (`docker compose down`); no containers left behind.

## 3. App vitest suite — PASS

- Command: `(cd app && npm ci && npm test)`
- Result: **PASS** — Test Files 15 passed (15), Tests 235 passed (235), duration ~21s.
- Covers the #407 catalogue surface (`App.test.ts` shell/offline-banner/nav tests) and the #408 print isolation pins (`PrintView.test.ts`, `BookView.test.ts`, `shell-styling.test.ts`).

## 4. Catalogue coverage gate (#407) — PASS

- Command: `script/catalogue-coverage-check.sh`
- Result: **PASS** — `messages/en.json` parses with 612 keys; sample resolves 383/383 keys with exact params and call sites; 8 runtime mirrors byte-identical; `app/src` 291/291 literal `t()` keys resolve; shell nav 6/6 labelKeys resolve; `messages/vi.json` 612/612 keys with matching placeholders; no static `aria-label` literals; no static `<noscript>` blocks (section 7 checks from #407 green).

## 5. Print isolation characterisation (#408) — PASS (static + unit halves)

- Command: `script/shell-served-check.sh` — **PASS** (full output: preconditions, nginx contract, UI-consistency static half PASS — 3 `<style>` blocks cited and medium-owned, route table and shell nav match on 6 routes, `PrintView.vue` keeps cited `@media print` rules, built assets carry `@media print`, served routes, legacy redirects, OpenAPI mirror byte-identical with 14/14 spec operations).
- Built-bytes proof: `app/dist/assets/*.css` carries `@media print{[data-testid=shell-nav]{display:none}` twice (once per print view — `PrintView.vue` and `BookView.vue`), so the `:global` selector compiles to a truly global rule that hides the shell nav on paper while the shell stylesheet stays screen-only.
- Print-focused vitest: **PASS** — `npx vitest run src/views/PrintView.test.ts src/views/BookView.test.ts src/shell-styling.test.ts`: 3 files, 68 tests passed.
- Browser `print.spec.ts`: runs with the suite in section 2 (includes the print-media block asserting `shell-nav` is hidden under print emulation while the active document stays visible).

## 6. Defects filed

None — all five suites passed; no fix issue needed.

## 7. Acceptance mapping (issue #409)

| Criterion | Status |
|---|---|
| 1. Each of the five suites is run and reported PASS/FAIL with evidence | **Met** — desk loop PASS (section 1, EVIDENCE line + exit 0); browser E2E PASS 23/23 (section 2); app vitest PASS 235/235 (section 3); catalogue gate PASS (section 4); print characterisation PASS incl. built-bytes proof (section 5) |
| 2. The report states the desk-loop outcome after merges #407 and #408 | **Met** — section 1: `e2e: SUCCEEDED.`, exit 0, full book→close→backup→restore→re-verify cycle on the post-merge tree |
| 3. Any bug found is filed as a separate fix issue linked from the report | **Met vacuously** — no bugs found, none filed (section 6) |

Verdict: the desk still works end to end with the #407 catalogue-string changes and the #408 print isolation in place. Clean bill.
