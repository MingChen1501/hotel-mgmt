# V2 evidence re-baseline test plan (Closes #550)

Status: active. Testing spec for the v2 side-by-side evidence
re-baseline, owned by `qa-lead`. It tells the render-regeneration
worker exactly what to capture (seven v2 board renders at the
established 1200px width into `docs/testing/evidence/550/`), how to
retire the stale v1 baselines, and which green extractor + gate runs
the baseline must be captured against. Docs only; it implements no
screen, changes no product code, no extractor, and no gate fixture.

Tier: T0 docs-only (prose/test plan only, no behaviour change — no
spec-reviewer gate; the render-regeneration implementation itself is
T1 test-only: evidence images and testing docs only, no new spec).
`docs/README.md` gains one Testing row in the same change.

## 1. Scope and no-change statements

In (from #550): re-render side-by-side evidence for all 7 v2 boards
(Main, Stay, Onboarding, Rooms, Book, Folio, Admin) at the established
1200px width into `docs/testing/evidence/550/`; remove or
supersede-note every stale v1 baseline render.

Out (from #550): extractor changes (#548, landed as PR #551);
gate fixture updates (#549, landed as PR #553 docs half + PR #554
fixture half); any product UI implementation.

Unblocked: #550 was blocked by #548 and #549 so the baseline would
match what CI enforces. Both are closed — the extractor suite is
green on the v2 boards (PR #551: 20/20; PR #554 re-confirms 25
passed in `tests/design-facts/extract-design-facts.test.mjs`) and
the gate fixtures target v2 with the Admin-board deferral recorded
(PR #553 allowlist + traceability docs; PR #554 non-live suites:
22 passed `e2e/dom-diff.spec.ts`, 21 passed
`e2e/design-facts.spec.ts`). The worker re-runs those suites at
capture time and records the CI `browser-e2e`
(`.github/workflows/ci.yml:512`) + `dom-diff` (`ci.yml:624`) run/job
ids in the evidence README (section 5) — that record is the
issue's third acceptance criterion made durable.

No-change statements (this plan changes none of these; a diff that
touches them is out of scope and fails review):

- Design source untouched: the seven `docs/design/*.dc.html` boards
  plus `docs/design/manifest.json` (bundle 07-11, v2 — supersedes
  all previous boards, `docs/design/README.md:5`) are read-only
  inputs. Never edit a board to fit a capture.
- Extractor untouched: `tests/design-facts/extract-design-facts.mjs`
  (`runExtraction` at `:610`, `extractScreenFacts` at `:436`,
  `SCHEMA_VERSION` at `:64` pinned to `schemaVersion` 1 per
  `docs/technical/desk-ui-fact-schema.md:59` with the v2-envelope
  note at `:141`) stays as the design-side byte path.
- Gate fixtures untouched: `app/e2e/design-facts.ts`
  (`FACT_SCHEMA_VERSION` at `:33`, six-screen `SCREEN_TABLE` at
  `:112` — Admin has no app screen and stays deferred),
  `app/e2e/dom-diff.ts` (`EMPTY_ALLOWLIST` at `:96`, per-screen
  allowlists at `:112,:159,:199,:259,:301`), and
  `docs/testing/dom-diff-allowlist.md` (v2 bundle source, Admin
  deferred, never allowlisted) stay as the enforcement path.
- No catalogue, print, or product behaviour change: captures render
  committed bytes only; the configured hotel name rule and print
  parity (`docs/testing/desk-restyle-test-traceability.md`
  sections 2–4) are unaffected.

## 2. Source-to-evidence map (EVID-1..7)

Each row is one capture case. Board order and 1200px widths come
from `docs/design/manifest.json:1` (order Main, Stay, Onboarding,
Rooms, Book, Folio, Admin; every board `w: 1200`). File names keep
the `evidence/538/` transitional convention
(`side-by-side-<Board>.png`, capitalised board key) so reviewers
can diff old against new file by file.

| Case | Board (design bytes) | Manifest title | Evidence file | Pairing |
|---|---|---|---|---|
| EVID-1 | `docs/design/Main.dc.html` | Desk board | `evidence/550/side-by-side-Main.png` | v2 board render (left, 1200px) + live app `/` (`desk-view`, `design-facts.ts:112`) at the same width (right) |
| EVID-2 | `docs/design/Stay.dc.html` | Check-in / check-out | `evidence/550/side-by-side-Stay.png` | v2 board + live app `/stay` (`stay-view`) |
| EVID-3 | `docs/design/Onboarding.dc.html` | First-time setup | `evidence/550/side-by-side-Onboarding.png` | v2 board + live app `/onboarding` (`onboarding-view`, empty-database launch state) |
| EVID-4 | `docs/design/Rooms.dc.html` | Room map | `evidence/550/side-by-side-Rooms.png` | v2 board + live app `/rooms` (`rooms-view`) |
| EVID-5 | `docs/design/Book.dc.html` | Booking | `evidence/550/side-by-side-Book.png` | v2 board + live app `/book` (`book-view`) |
| EVID-6 | `docs/design/Folio.dc.html` | Invoice | `evidence/550/side-by-side-Folio.png` | v2 board + live app `/folio` (`folio-view`) |
| EVID-7 | `docs/design/Admin.dc.html` | Admin | `evidence/550/side-by-side-Admin.png` | Board-only single 1200px render (no app screen exists, Refs #546) — same convention as the transitional `evidence/538/side-by-side-Admin.png` (1200 × 930) |

Capture rules (all seven cases):

1. Render the committed board bytes (the gate design side is the
   decoded design markup, never the raw bundler shell — the
   extractor decodes the embedded template payload, Refs #548,
   PR #551; inline React runtime scripts never enter a capture).
2. Board panel at the manifest 1200px width; app panel at the same
   CSS width with the standard seeded lab state (the A1 seed
   discipline, `docs/testing/phase-6-qa-a1-run-log.md`) so dynamic
   nodes stay comparable; allowlisted dynamic nodes
   (`dom-diff-allowlist.md` section 3) are expected to differ and
   are not failures.
3. No screenshot-snapshot tooling enters a gate: captures are
   manual review evidence (PNG), never Playwright snapshots — the
   zero-screenshot greps over the gate sources (`ci.yml:595`
   for design-facts, `ci.yml:690` for dom-diff) must stay green.
4. Traceability: the evidence README (section 5) records the
   sha256 of each board file at capture time, so every image is
   traceable to the committed `docs/design/*.dc.html` bytes.

## 3. Stale-baseline disposition (EVID-8)

No stale v1 baseline render may remain as the reference of record.
Default method is a `SUPERSEDED.md` note in the stale dir (points
at `evidence/550/` as the reference of record, names the
superseding PR); deleting the stale images instead is acceptable.
Leaving a stale dir unmarked is a failure.

| Stale dir | Contents (v1-era) | Disposition |
|---|---|---|
| `evidence/515/` | 6 side-by-side renders (v1 boards; no Admin) | Supersede-note or delete |
| `evidence/518/` | `side-by-side-shell-nav.png` (pre-token shell) | Supersede-note or delete |
| `evidence/519/` … `evidence/524/` | per-screen `before-*.png` / `after-*.png` / `side-by-side-*.png` triples from the #517 restyle child PRs (v1-based) | Supersede-note or delete; the triples stay in git history for audit |
| `evidence/538/` | 7 transitional renders (old v1 vs new v2; Admin single 1200px) | Keep as history with a transitional note (it documents the swap, PR #547) — explicitly not the reference of record |

After the change, `evidence/550/` is the single reference of
record for v2-based reviewer verification; section 5 of this plan
and the transitional note in `evidence/538/` both say so.

## 4. Traceability map (AC-550 to guards)

| #550 acceptance criterion | Case | Guard (`file:line` verified on disk) | Pass evidence required in the evidence README |
|---|---|---|---|
| New evidence dir holds one side-by-side render per v2 board (7 images, 1200px), each traceable to the committed `docs/design/*.dc.html` bytes | EVID-1..7 (section 2) + EVID-9 (section 5) | Design source `docs/design/README.md:5` (seven boards, bundle 07-11) + `docs/design/manifest.json:1` (order, 1200px widths); schema `docs/technical/desk-ui-fact-schema.md:59,141` | sha256 table per board; image dimensions recorded |
| No stale v1 baseline render remains as the reference of record (deleted or marked superseded) | EVID-8 (section 3) | Stale dirs on disk (`evidence/515/`, `evidence/518/`–`evidence/524/`, `evidence/538/`); live reference rule in `docs/testing/dom-diff-allowlist.md` (v2 bundle source) | List of added `SUPERSEDED.md` notes and/or deleted paths |
| The worker cites the green extractor + gate runs the baseline was captured against | EVID-9 (section 5) | Extractor `tests/design-facts/extract-design-facts.test.mjs` (25 tests: `:94` shape, `:134` nav, `:345` runtime-leakage, `:361` loud-failure, `:420` determinism, `:430` zero-binary, `:443` provenance, `:454` budgets) via `tests/design-facts/extract-design-facts.mjs:610`; gate specs `app/e2e/design-facts.spec.ts` + `app/e2e/dom-diff.spec.ts`; CI jobs `ci.yml:512` (browser-e2e, fresh records at `:586`) + `ci.yml:624` (dom-diff) | `node --test tests/design-facts/` result; non-live Playwright results; CI run/job ids for both jobs on the capture commit |

## 5. Evidence README (EVID-9) and exit criteria

The worker ships `docs/testing/evidence/550/README.md` with:

1. Per-board provenance: file, manifest title, sha256 at capture
   time, capture viewport/commands, image dimensions.
2. Green-run cites: extractor suite result
   (`node --test tests/design-facts/`), non-live gate results
   (`DESIGN_FACTS_DIR=… npx playwright test e2e/design-facts.spec.ts`,
   `npx playwright test e2e/dom-diff.spec.ts`), and the CI
   `browser-e2e` + `dom-diff` run/job ids on the capture commit.
3. Reference-of-record statement: `evidence/550/` supersedes the
   section 3 dirs for v2-based review; `evidence/538/` remains as the
   transitional history of the swap.

Exit criteria for the #550 implementation slice:

1. `evidence/550/` holds exactly 7 PNGs (section 2 table), each opening
   at the specified pairing with the board panel at 1200px.
2. Every image traces to committed board bytes via the README
   sha256 table (re-hash matches).
3. Every section 3 stale dir carries a `SUPERSEDED.md` note or has its
   stale images deleted; no unmarked v1 baseline remains.
4. The README cites green extractor + gate runs (local results
   plus both CI job ids); the two zero-screenshot greps
   (`ci.yml:595,690`) and `script/markdown-link-check.sh` pass.
5. No board, extractor, gate, catalogue, print, or product file
   changed in the implementation diff (images + notes + README
   only); rollback is a single-PR revert.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-763
