# Browser E2E plan — Playwright desk flows (issue #334)

Status: active. Testing spec for the real-browser E2E suite over the
Vue desk SPA (`app/`, served under `/app/`), owned by `qa-lead`.
It specifies the suite's flows, browsers, CI placement, Playwright
install discipline, and pass criteria — including the MIME-type
smoke assertion that keeps the blank-desk class fixed in #335 from
regressing silently. The suite is built (scaffold plus all six flow
specs on disk, `browser-e2e` CI job green); the per-flow guard
cells in section 7 name the landed specs. No product or behaviour
change lives here.

## 0. The two "e2e" levels — named once, used everywhere

The word "e2e" has meant two different things in this repo. From
this plan on, every doc, job name, and script message uses one of
these two names:

- **API-loop E2E** (`script/e2e-desk-loop.sh`, CI job
  `e2e-single-host`): bash+curl through the proxy, proving the
  contract path book → check-in → charge/pay → check-out →
  backup → restore. It never opens a browser; it cannot see a
  blank screen, a dead button, a mis-scoped print stylesheet, or a
  wrong MIME type.
- **Browser E2E** (this plan, issue #334): Playwright driving
  Chromium against the served Vue SPA (`/app/*`), proving what
  the API loop cannot — that a person at the desk can sign in,
  book, move, charge, pay, check out, and print, and that every
  refusal surfaces on screen with its cause named.

Both stay. The API loop remains the contract-path and
backup/restore proof; the browser suite is the screen proof. A
change is not "covered e2e" unless the level that can see its
failure mode ran green.

## 1. Scope — flows per screen

Each desk screen gets at least one happy-path browser test plus
the key refusal paths. Routes live under `/app/` (history mode,
`app/src/router.ts`); selectors use the existing `data-testid`
hooks in `app/src/views/*.vue` — if a hook is missing the
implementation adds it to the view (test hook only, no behaviour
change).

| # | Screen (route) | Happy path | Refusal / edge paths | FR/NFR |
|---|---|---|---|---|
| 1 | Sign-in (every view: `desk-signin-form`, `book-signin-form`, `print-signin-form`, `*-signin-error`) | owner sign-in returns a token and lands on the desk dashboard (`desk-dashboard`) | wrong secret surfaces the error panel (no navigation); locked identity surfaces `IDENTITY_LOCKED` distinctly from wrong-secret (per #332); signed-out state routes back to sign-in on the next write (shared-client 401 behaviour) | FR-ADM-2, NFR-SEC-2 |
| 2 | Book with quote (`/app/book`: `book-quote`, `book-quote-section`, `book-confirm`, `book-result`, `book-confirm-error`) | search sellable type → quote shows the total → confirm returns a `confirmed` ref readable on screen | overbooking refusal surfaces `CONFLICT` naming type+dates; restriction refusal names the restriction; missing mandatory guest field names the field | FR-RES-1, FR-RTE-1/2/4/5, FR-CUS-1/2, NFR-CON-1 (single-attempt side; paired attempts stay API-level) |
| 3 | Check-in / move / check-out with folio gate (`/app/stay`: `stay-checkin`, `stay-checkin-status`, `stay-move-status`, `stay-checkout`, `stay-checkout-status`, `stay-review`, `stay-approval-section`) | tonight check-in → move to a ready room (old room `vacant-dirty`) → open-balance check-out refused → record approval → check-out closes with invoice ref | `SETTLEMENT_REQUIRED` refusal stays on screen with the balance shown; second close refused `STATE_ILLEGAL`; move to a taken room refused with the cause named; early/late times kept and visible (`stay-times-status`) | FR-FDK-1/2/3/4, FR-BIL-7 |
| 4 | Charge + pay + balance agreement (`/app/folio`: `folio-open`, `folio-charge`, `folio-charge-status`, `folio-payment-status`, `folio-status`) | open stay folio → post room + extra lines → record cash payment → every line and the running balance on screen agree with a direct `GetFolio` read | undefined charge item refused with the cause named; bad payment method refused; balance after each step equals the API folio balance (screen-vs-API agreement assert) | FR-BIL-1/2/3/5, FR-CUS-3 |
| 5 | Invoice / receipt print isolation (`/app/print`: `print-open`, `print-invoice`, `print-invoice-document`, `print-folio-status`) | invoice document renders with lines + total equal to the folio; receipt equals the recorded payment | unknown folio / unknown payment show the not-found state, not a blank page; print CSS scope: the invoice document carries the print stylesheet link and non-print chrome is excluded by the print-media rule — asserted by DOM/CSSOM inspection where headless allows; hard limits (real paper layout, multi-page breaks) are documented as manual-only in the run log | FR-BIL-4 |
| 6 | Dashboard backup-report line (`/app/`: `desk-backup-report`, `desk-arrivals-table`, `desk-sheet-line`) | newest `backup-report.json` renders as the success line with its time after a loop backup | missing/stale report renders the failed-report warning, never an empty section | FR-ADM-5, NFR-BKP-2 |

Admin console (`/app/admin`: `admin-console`, `admin-signin-error`)
is covered for sign-in reach only (flow 1); full user/role matrix
coverage stays API-level per the matrix.

## 2. Browsers and devices

- **CI gate: Chromium only** (headless), desktop viewport
  (1280×800). One browser keeps the job fast and deterministic;
  Chromium is the browser the desk kiosk runs.
- **Local pre-push (recommended, not gated):** the same suite
  with `--project=chromium-headed` for a headed sanity look
  before opening the PR.
- No WebKit/Firefox matrix, no mobile viewports, no
  visual-regression snapshots (out of scope per #334 unless
  trivial). If the owner later needs a second browser, it lands
  as a follow-up issue with its own flake budget — not as
  scope creep in the implementation PR.

## 3. CI placement — relative to `e2e-single-host`

- New sibling job **`browser-e2e`** in `.github/workflows/ci.yml`,
  gated by the existing `changes` gate: it runs when the
  `app-shell` filter matches (`app/**`, `deploy/nginx/nginx.conf`,
  `deploy/compose.yaml`, `frontend/*.html`,
  `script/shell-served-check.sh`) **or** when any `services/**`
  filter matches (contract drift must break the screens loudly),
  plus on workflow changes and pushes to master (same full-run
  rule as every other job).
- It runs **after** `e2e-single-host` brings up the same compose
  stack: the job reuses the installer path (`script/install.sh`
  with the CI hotel config) so the stack under test is identical
  to the API-loop proof, then runs `npx playwright test` from
  `app/` against `http://127.0.0.1/app/`. Stack bring-up is
  shared, not duplicated — the job either `needs:
  e2e-single-host` with the stack kept up via artifacts, or
  re-runs the same bring-up steps in-job; the implementation PR
  picks the cheaper reliable option and documents it.
- Docs-only changes skip everything (existing `changes` rule);
  the metadata `ci` job stays the only gate for those PRs.

## 4. Playwright installation and caching — no CDN at runtime

The lab runs on an offline LAN: at test time nothing may be
fetched from a CDN. The implementation PR must therefore:

1. Pin `playwright` plus `@playwright/test` in `app/package.json`
   (exact versions, lockfile committed).
2. Install browsers with `npx playwright install --with-deps
   chromium` **at image/layer build time** (CI cache or a
   pre-baked step), never lazily at test time. The sanctioned
   route is the official Playwright image
   (`mcr.microsoft.com/playwright:vX.Y.Z`) for the test step, or
   the default runner image with the browser path cached via
   `actions/cache` on `~/.cache/ms-playwright` keyed by the
   lockfile hash — the PR picks one and records why.
3. Serve all reporters locally: the HTML reporter output is
   uploaded as a CI artifact (`actions/upload-artifact`); no
   externally hosted reporter, no CDN fonts/scripts in the test
   harness. The SPA itself already ships zero CDN dependencies
   (vendored Vite build); the suite must fail closed if a test
   run emits any non-loopback request (assert via request
   interception in a global setup hook).

## 5. What counts as green

`npx playwright test` green locally against a fresh stack, and
the `browser-e2e` CI job green on PRs touching `app/`, means:

1. Every flow in section 1 passes on Chromium headless,
   including each named refusal surfacing its cause on screen.
2. **MIME-type smoke first:** before any flow test, a smoke
   spec asserts `Content-Type: text/javascript` (or
   `application/javascript`) on the served `dist/assets/*.js`
   and `text/css` on `dist/assets/*.css` through the proxy, plus
   that `/app/` renders exactly one view root with no blank
   fallback. This is the regression net for the #335
   white-screen class (missing `mime.types` include → every
   asset `text/plain` → browser refuses the ES module → blank
   desk). Red here blocks the run with a pointer to the Nginx
   config, not a wall of flow failures.
3. Zero non-loopback network requests during the run
   (section 4.3 hook).
4. Flake budget: each spec retries at most once in CI
   (`retries: 1`); a second consecutive failure is a bug, not
   a retry bump.
5. Print isolation limits (section 1, flow 5) are asserted
   where headless allows and the remainder is logged as
   manual-only with the headless limitation named.

## 6. Out of scope

Product or behaviour changes; visual-regression snapshots;
WebKit/Firefox matrices; mobile viewports; PERF timing inside
the browser suite (PERF stays with `e2e-perf-check.sh` and the
reporting timings); paired-simultaneous concurrency (stays
API-level, NFR-CON-1/2).

## 7. Traceability note

This plan adds a **screen-proof layer**, not new FR/NFR rows:
every flow above cites existing matrix rows whose guards already
exist (API/unit level). Each flow below names its landed Playwright
spec (`app/e2e/<flow>.spec.ts`) as an *additional* guard on the
already-covered row — no row flipped to TBD, no coverage count
changed, and no FR/NFR may cite the browser suite as its *only*
guard.

| Flow | Landed browser guard | Existing row(s) it strengthens |
|---|---|---|
| Sign-in incl. wrong-secret + locked | `app/e2e/signin.spec.ts` | FR-ADM-2, NFR-SEC-2 |
| Book with quote incl. refusals | `app/e2e/book.spec.ts` | FR-RES-1, FR-RTE-1/2/4/5, FR-CUS-1/2 |
| Check-in / move / check-out with folio gate | `app/e2e/stay.spec.ts` | FR-FDK-1/2/3/4, FR-BIL-7 |
| Charge + pay + balance agreement | `app/e2e/folio.spec.ts` | FR-BIL-1/2/3/5, FR-CUS-3 |
| Invoice / receipt print isolation | `app/e2e/print.spec.ts` | FR-BIL-4 |
| Dashboard backup-report line | `app/e2e/desk.spec.ts` (with the MIME smoke in `app/e2e/smoke.spec.ts` — scaffold landed in PR #341, flow specs in the follow-ups) | FR-ADM-5, NFR-BKP-2 |

## 8. Seed and fixture discipline

The suite runs against the same fresh stack as the API loop
(`script/install.sh` bring-up, `deploy/seed/boot.sql` seed, the
CI hotel config applied through `script/apply-hotel-config.sh`
so hotel values are the hotel's own, not boot defaults). Dates
derive from the business clock the same way the API loop
derives them (walk-in = today, booking windows relative to
today). No test writes to the seed files; per-run entities use
distinct ids/names so reruns never collide.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-436
