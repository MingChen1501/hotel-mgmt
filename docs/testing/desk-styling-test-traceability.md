# Desk styling test traceability (Refs #338)

Status: active. Testing spec for the Phase 2 implementation of the
#338 desk UI styling pass, owned by `qa-lead`. It names the
characterization and unit guards that cover the shell, the
sign-in paths, the plain-words states, and print isolation
(`file:line`, all verified on disk), plus the Phase 2 guards
M1–M6 that the implementation PR (#348) landed (M7 stays gated
per section 4).
Companion specs: requirements delta in
`docs/requirements/mvp-requirements.md` [section 8](../requirements/mvp-requirements.md) (`FR-DSP-1..4`,
`NFR-DSP-1..2`, landed via #344, owned by `business-analyst`);
design and per-flow diagrams in `docs/architecture/hld.md` [section 12](../architecture/hld.md) and
`docs/architecture/lld.md` [section 12](../architecture/lld.md) (landed via #345, owned by
`architect`); the approved Phase 1 UI contract itself is the
`product-owner` contract comment on #338.

## 1. Scope and no-change statements

- Presentation only. The slice changes no behaviour, route, API,
  contract, schema, error code, or refusal condition; the
  `business-analyst` no-change statements (`mvp-requirements.md`
  [section 8.1](../requirements/mvp-requirements.md)) and the `architect` no-change note (`lld.md` [section 12.6](../architecture/lld.md)) hold
  for testing too.
- The `traceability-matrix.md` 57-row MVP coverage count stands
  unchanged: `FR-DSP-*` / `NFR-DSP-*` are presentation-scoped
  items that map here only, never as new matrix rows, and no
  existing matrix guard may cite this styling pass as its guard.
- Refusal-condition tests stay untouched: `CONFLICT`,
  `STATE_ILLEGAL`, `VALIDATION_FAILED`, `SETTLEMENT_REQUIRED`,
  `IDENTITY_LOCKED`, and `UNAUTHENTICATED` still fire on exactly
  the same conditions — only on-screen wording becomes plain
  sentences (`FR-DSP-3`). A Phase 2 diff that alters any refusal
  condition is out of scope and fails review.
- Catalogue rule holds (`NFR-I18N-1`): every new plain-words
  sentence ships in `messages/en.json` and stays covered by
  `script/catalogue-coverage-check.sh`.
- `data-testid` hooks stay: the Phase 2 PR keeps every hook the
  guards below rely on (or moves it with its test), updates
  characterization tests where markup changed, and deletes no
  test without replacement.

## 2. Parity guards (existing on disk; Phase 2 extends, never deletes)

| Pres item | Existing guard (`file:line` verified) | What Phase 2 must keep working |
|---|---|---|
| FR-DSP-1 shell shape | Seven routes plus placeholder catch-all: `app/src/router.test.ts:17` (`holds the desk, book, stay, folio, print, and admin routes plus the placeholder catch-all`); per-route render: `app/src/router.test.ts:32,40,48,56,64,72`; unknown print sub-paths stay shell-served: `app/src/router.test.ts:91` | Route set and fallback unchanged; nav is additive only |
| FR-DSP-1 per-screen render | Render suites under the shell session (no per-screen sign-in copy in any view): `DeskView.test.ts:151,164` (dashboard frame, Bearer loads); `BookView.test.ts:224,235` (booking form, shell session); `StayView.test.ts:264,277` (stay lists, Bearer lists); `FolioView.test.ts:164,177` (folio form, running balance); `PrintView.test.ts:216,229` (print form, folio open); `AdminView.test.ts:190,207` (restricted notice when unsigned; users/config/audit under the shell session) | Screens still render their content inside the shell column; hooks (`*-view`, `offline-banner`) kept |
| FR-DSP-2 sign-in (moved to the gate) | Single-gate suite: `app/src/App.test.ts:216` (`shell sign-in gate`) — sign-in lands on the requested screen `:254`; wrong secret reads as one plain sentence `:285`; validation failure reads as the same sentence `:308`; locked identity distinct from wrong secret `:330`; sign-out back to the gate with the token cleared `:361`; expired notice on the gate after a mid-session 401 `:423` | Coverage moved to the one shell gate with the tests, not away from it |
| FR-DSP-2 session mechanics (unchanged) | Token in `sessionStorage` only, reload restore, sign-out clears: `app/src/stores/session.test.ts:21,33,43`; 401 clears token and routes to sign-in: `app/src/api/client.test.ts:55`; `UNAUTHENTICATED` envelope on HTTP 200 also signs out: `app/src/api/client.test.ts:68` | Token mechanics, lockout, and idle sign-out unchanged (`NFR-SEC-2` holds) |
| FR-DSP-2 sign-in wording baseline | Failed sign-in reads as one plain sentence: `App.test.ts:285,308`; locked wording distinct from wrong-secret: `App.test.ts:330` (client guard `client.test.ts:83`); session-expired notice on 401: `App.test.ts:423` (client guard `client.test.ts:117`) | Wording is one plain sentence per `FR-DSP-3`; codes (`UNAUTHENTICATED`, `IDENTITY_LOCKED`) unchanged |
| FR-DSP-3 empty/error wording baseline | Transport failure as one plain sentence, no technical code: `DeskView.test.ts:352`; book refusal catalogue mapping: `BookView.test.ts:757,787,811` (noprice, soldout, restriction); stay refusal mapping: `StayView.test.ts:476,499,530` (unknown ref, taken room, already checked in); folio plain-words validation: `FolioView.test.ts:275,309,346,383`; print plain-words validation: `PrintView.test.ts:390,418,455,491,527` | Refusal-condition tests assert the same conditions; only the asserted wording is plain sentences |
| FR-DSP-3 loading guards baseline | Double-submit guards: `BookView.test.ts:844` (one `CreateReservation` per quote key), `StayView.test.ts:888` (one `AssignRoom` per double-click), `FolioView.test.ts:419` (charge click guarded in flight), `PrintView.test.ts:548` (invoice click guarded) | Buttons that would repeat a write stay disabled until the call returns; no double-charge from repeat taps |
| FR-DSP-3 offline wording (unchanged) | Banner hooks and behaviour: `app/src/App.test.ts:29,36,54,89` (hide while online, name the disconnect with manual retry, retry re-issues only on staff action, keep banner with reason on retry failure); zero queued writes: `app/src/api/client.test.ts:137,154` | Offline banner and manual retry stay exactly as they are (contract section 2; `NFR-SHL-3`) |
| FR-DSP-4 print parity | Invoice matches folio lines and balance: `PrintView.test.ts:272`; one receipt per payment: `PrintView.test.ts:306`; confirmation with formatted price: `PrintView.test.ts:342`; print-alone-and-clear-marker: `PrintView.test.ts:655`; print isolation pinned at SFC source: `app/src/shell-styling.test.ts:78` (`@media screen` only for the shell, print-only styles for book/print) and `PrintView.test.ts:723` (one document at a time, legacy `print.html` parity) and `BookView.test.ts:1063` (confirmation isolation, legacy `book.html` parity — legacy pages decommissioned in #313, structure parity kept) | Printed output matches folio exactly; print CSS preserved; screen styling does not leak into print |
| Dashboard backup line (context) | Success line from served report feed: `DeskView.test.ts:410`; failure line plus support wording: `DeskView.test.ts:431`; missing report treated as failed: `DeskView.test.ts:454` | Dashboard content renders inside the shell unchanged |

## 3. Phase 2 guards (landed — M1–M6; M7 gated)

M1–M6 landed in the Phase 2 implementation (#348) and are cited
below with their guards. M7 stays gated behind the owner approval
in section 4: no run record may be claimed until the QA execution
slice records it.

| # | Guard (landed) | Covers | Traceability |
|---|---|---|---|
| M1 | Shell-nav render + active-highlight assertions on all six routes: six destinations in contract section 2 order (Desk · Book · Stay · Folio · Print · Admin) plus user name plus Sign out (`app/src/App.test.ts:147`); active route marked exactly once (`app/src/App.test.ts:186`); unknown paths keep the nav with no active destination (`app/src/App.test.ts:201`) | `FR-DSP-1` | In the shell suite; keeps `router.test.ts:17` route-shape guard intact |
| M2 | Single-gate sign-in tests: signed-out visitor on every `/app/*` path sees only the shell form (`app/src/App.test.ts:216` suite — `:254` lands on the requested screen, `:285,308` failures read as one plain sentence, `:330` locked distinct, `:361` sign-out to the gate, `:423` expired notice); per-screen copies removed with their tests | `FR-DSP-2` | Moved (not deleted) from the per-screen sign-in suites; extends `session.test.ts:21,33,43` and `client.test.ts:55,68,83` coverage |
| M3 | Per-screen loading/empty/error/refusal wording assertions: loading names the affected region with the rest visible; every empty list names what is empty plus the next step; errors never surface technical codes; every refusal is one plain sentence naming the cause and the next step (section 2 wording baselines, e.g. `DeskView.test.ts:352`; loading guards `BookView.test.ts:844`, `StayView.test.ts:888`, `FolioView.test.ts:419`, `PrintView.test.ts:548`) | `FR-DSP-3` | Extends the section 2 wording baselines; refusal-condition halves of those tests assert unchanged conditions |
| M4 | Served-print no-leak assertion: printed receipt/invoice/confirmation still match the folio exactly after the restyle, and no screen style leaks into print (`app/src/shell-styling.test.ts:78` — shell CSS inside `@media screen` only, book/print styles print-only; `PrintView.test.ts:272,306,655,723`; `BookView.test.ts:1063`) | `FR-DSP-4` | Extends `PrintView.test.ts` parity tests; print CSS preserved |
| M5 | Keyboard-focus visibility check over the six routes: every interactive element shows the 2px desk-blue outline on focus (`app/src/shell-styling.test.ts:111` — ring pinned at the shell source `:119`, every focusable control visible on `/`, `/book`, `/stay`, `/folio`, `/print`, `/admin`) | `NFR-DSP-2` | Target 100%; unit-level guard in the shell suite |
| M6 | Screen-proof browser specs for the restyled screens (book, stay, folio, print flows per `browser-e2e-plan.md` [section 1](browser-e2e-plan.md)): all six `app/e2e/*.spec.ts` flow specs plus `smoke.spec.ts` (MIME smoke, PR #341) exist on disk and run in the `browser-e2e` CI job | `FR-DSP-1..4` screen layer | Strengthens existing matrix rows as additional guards only (plan section 7); no row cites the browser suite as its only guard |
| M7 | Stand-in demo run record (scripted unassisted book → check-in → charge → pay → check-out → print pass) | `NFR-DSP-1` | Specified in section 4 below; exit signal 1/1 unassisted passes |

## 4. Stand-in demo run record (NFR-DSP-1)

The `qa-lead`-owned run record is the acceptance proof for the
issue-body criterion. It is a manual record, not an automated
guard, and it runs under a standing sequencing gate.

- **Sequencing gate (owner direction 2026-10-26, recorded on
  #338):** no QA activity on the built UI before the owner
  approves it. Sequence: Phase 2 implements → reviewer APPROVE +
  green CI → orchestrator presents the built UI to the owner →
  owner approves → the stand-in demo runs. This spec defines the
  record; it does not perform it.
- **Script:** a signed-in non-technical stand-in, with no
  guidance beyond the screens, works book → check-in → charge →
  pay → check-out → print receipt/invoice on the UI alone.
  The script uses the same seed discipline as the A1 run logs
  (fresh stack, hotel's own config applied, business-clock dates).
- **Pass rule:** every step completes guided only by what the
  screens say; every refusal met along the way reads as a plain
  sentence naming the cause and the next step. Target: 1/1
  unassisted passes.
- **Recording:** results are recorded in the consolidated
  `docs/testing/test-report.md` (exists). A dedicated run log
  under `docs/testing/` may be added by the QA execution slice;
  this spec promises no such file (no phantom promises — it is
  created by that slice, not this one).
- **Failure handling:** any step the stand-in cannot complete
  unassisted, or any refusal that reads as a technical code, is
  filed as an issue against #338 with the `FR-DSP-*` / `NFR-DSP-1`
  id attached; no `risk-high` / `risk-very-high` failure is
  waived without owner approval (per `test-strategy.md` [section 3](test-strategy.md) item 5).

## 5. Traceability map (DSP items to guards)

| Pres item | Guard (section 2 parity + section 3 Phase 2 guards) | Pass evidence |
|---|---|---|
| FR-DSP-1 | `router.test.ts:17,32,40,48,56,64,72,91` + per-screen render suites (section 2) + **M1 landed** | `app/` unit suite green; shell-nav assertions green |
| FR-DSP-2 | Single gate suite (`App.test.ts:216` — M2) + `session.test.ts:21,33,43` + `client.test.ts:55,68,83,117` (section 2) | `app/` unit suite green; single-gate assertions green; `NFR-SEC-2` guards still green |
| FR-DSP-3 | Wording baselines + double-submit guards + offline banner guards (section 2) + **M3 landed** + `catalogue-coverage-check.sh` green | `app/` unit suite green; `ci` catalogue job green; no technical code on any screen |
| FR-DSP-4 | `PrintView.test.ts:272,306,342,655,723` + `shell-styling.test.ts:78` (section 2) + **M4 landed** + unchanged `FR-BIL-4` backend exact-match guards | Unit + served-print assertions green; `FR-BIL-4` guards green |
| NFR-DSP-1 | **M7 run record** (post-owner-approval, section 4) | 1/1 unassisted passes recorded in `test-report.md` |
| NFR-DSP-2 | **M5 landed** (`shell-styling.test.ts:111`) | 100% of interactive elements on the six routes show the focus indicator |

## 6. Exit criteria for the Phase 2 testing slice

1. Every section 2 parity guard still passes (updated where markup
   changed, none deleted without replacement).
2. Guards M1–M6 exist and pass (section 3); M7 passes after the
   owner approves the built UI (section 4 gate).
3. `catalogue-coverage-check.sh` green on every new sentence;
   `browser-e2e` job green including the MIME smoke.
4. No matrix row flipped to TBD; the 57/57 MVP count stands.
5. Open failures filed with `FR-DSP-*` / `NFR-DSP-*` ids; results
   recorded in `test-report.md`.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-446
