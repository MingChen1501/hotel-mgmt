# Desk styling test traceability (Refs #338)

Status: active. Testing spec for the Phase 2 implementation of the
#338 desk UI styling pass, owned by `qa-lead`. It names the
characterization and unit guards that already cover the shell, the
sign-in paths, the plain-words states, and print isolation
(`file:line`, all verified on disk), and names the missing guards
explicitly as TBD for the Phase 2 implementation PR to create.
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
| FR-DSP-1 shell shape | Six routes + placeholder catch-all: `app/src/router.test.ts:17` (`holds the desk, book, stay, folio, print, and admin routes plus the placeholder catch-all`); per-route render: `app/src/router.test.ts:32,40,48,56,64,72`; unknown print sub-paths stay shell-served: `app/src/router.test.ts:91` | Route set and fallback unchanged; nav is additive only |
| FR-DSP-1 per-screen render | Render suites: `app/src/views/DeskView.test.ts:126` (desk suite), `BookView.test.ts:202` (book suite), `StayView.test.ts:243`, `FolioView.test.ts:175`, `PrintView.test.ts:212`, `AdminView.test.ts:192` (signed-in content tests) | Screens still render their content inside the new shell column; hooks (`*-view`, `offline-banner`) kept |
| FR-DSP-2 sign-in copies (move to gate) | Per-screen signed-out form: `DeskView.test.ts:134`, `BookView.test.ts:210`, `StayView.test.ts:234`, `FolioView.test.ts:166`, `PrintView.test.ts:203`, `AdminView.test.ts:183`; sign-in happy paths: `DeskView.test.ts:143`, `BookView.test.ts:219`; sign-out back to form: `DeskView.test.ts:341`, `BookView.test.ts:961` | Coverage moves to the one shell gate with the tests, not away from it |
| FR-DSP-2 session mechanics (unchanged) | Token in `sessionStorage` only, reload restore, sign-out clears: `app/src/stores/session.test.ts:21,33,43`; reload straight into dashboard: `DeskView.test.ts:355`; 401 clears token and routes to sign-in: `app/src/api/client.test.ts:55`; `UNAUTHENTICATED` envelope on HTTP 200 also signs out: `app/src/api/client.test.ts:68` | Token mechanics, lockout, and idle sign-out unchanged (`NFR-SEC-2` holds) |
| FR-DSP-2 sign-in wording baseline | Failure without sign-in: `DeskView.test.ts:288`; locked wording distinct from wrong-secret: `DeskView.test.ts:302`, `AdminView.test.ts:368`; session-expired string on 401: `DeskView.test.ts:320`, `StayView.test.ts:614`, `FolioView.test.ts:350`, `AdminView.test.ts:318` | Wording becomes one plain sentence per `FR-DSP-3`; codes (`UNAUTHENTICATED`, `IDENTITY_LOCKED`) unchanged |
| FR-DSP-3 empty/error wording baseline | Empty catalogue string: `DeskView.test.ts:247`; unknown-guest catalogue fallback: `DeskView.test.ts:199`; book refusal catalogue mapping: `BookView.test.ts:736,768,792` (noprice, soldout, restriction); stay refusal mapping: `StayView.test.ts:311,334,367`; folio plain-words validation: `FolioView.test.ts:268`; print plain-words validation: `PrintView.test.ts:351` | Refusal-condition tests keep asserting the same conditions; only the asserted wording changes to plain sentences |
| FR-DSP-3 loading guards baseline | Double-submit guards: `BookView.test.ts:825` (one `CreateReservation` per quote key), `StayView.test.ts:584` (one `AssignRoom` per double-click), `FolioView.test.ts:302` (charge click guarded in flight), `PrintView.test.ts:372` (invoice click guarded) | Buttons that would repeat a write stay disabled until the call returns; no double-charge from repeat taps |
| FR-DSP-3 offline wording (unchanged) | Banner hooks and behaviour: `app/src/App.test.ts:29,36,54,89` (hide while online, name the disconnect with manual retry, retry re-issues only on staff action, keep banner with reason on retry failure); zero queued writes: `app/src/api/client.test.ts:137,154` | Offline banner and manual retry stay exactly as they are (contract section 2; `NFR-SHL-3`) |
| FR-DSP-4 print parity | Invoice matches folio lines and balance: `PrintView.test.ts:250`; one receipt per payment: `PrintView.test.ts:275`; confirmation with formatted price: `PrintView.test.ts:303`; print-alone-and-clear-marker: `PrintView.test.ts:476`; print isolation pinned at SFC source: `PrintView.test.ts:544` (`@media print`, non-document subtrees hidden, active document printable) and `BookView.test.ts:1046` (confirmation isolation, legacy `book.html` parity) | Printed output matches folio exactly; print CSS preserved; screen styling does not leak into print |
| Dashboard backup line (context) | Success line from served report feed: `DeskView.test.ts:370`; failure and missing-report lines: `DeskView.test.ts:391,414` | Dashboard content renders inside the shell unchanged |

## 3. Missing guards (TBD — Phase 2 implementation PR must create)

No row below may be marked complete until its guard exists and
passes. Each names the required guard type so the `spec-reviewer`
gate can check it.

| # | Required guard | Covers | Traceability |
|---|---|---|---|
| M1 | Shell-nav render + active-highlight assertions on each of the six routes: six destinations in contract section 2 order (Desk · Book · Stay · Folio · Print · Admin) plus user name plus Sign out; active route bold + desk-blue underline, exactly one active at a time | `FR-DSP-1` | New assertions in the router/shell suite; keeps `router.test.ts:17` route-shape guard intact |
| M2 | Single-gate sign-in tests: signed-out visitor on every `/app/*` path sees only the shell form; per-screen copies gone; failed sign-in reads as one plain sentence; sign-out returns to the gate and clears the token | `FR-DSP-2` | Moved (not deleted) from the section 2 per-screen sign-in guards; extends `session.test.ts` and `client.test.ts:55` coverage |
| M3 | Per-screen loading/empty/error/refusal wording assertions: loading names the affected region with the rest visible; every empty list names what is empty plus the next step; errors never surface technical codes; every refusal is one plain sentence naming the cause and the next step | `FR-DSP-3` | Extends the section 2 wording baselines; refusal-condition halves of those tests assert unchanged conditions |
| M4 | Served-print no-leak assertion: printed receipt/invoice/confirmation still match the folio exactly after the restyle, and no screen style leaks into print | `FR-DSP-4` | Extends `PrintView.test.ts:250,544` and `BookView.test.ts:1046`; print CSS preserved |
| M5 | Keyboard-focus visibility check over the six routes: every interactive element shows the 2px desk-blue outline on focus | `NFR-DSP-2` | Target 100%; new guard (unit or browser-level at the implementation PR's choice, recorded here when it lands) |
| M6 | Screen-proof browser specs for the restyled screens (book, stay, folio, print flows per `browser-e2e-plan.md` [section 1](browser-e2e-plan.md)): only `app/e2e/smoke.spec.ts` (MIME smoke, DONE in PR #341) exists on disk today; the flow specs are TBD and the implementation PR creates them | `FR-DSP-1..4` screen layer | Strengthens existing matrix rows as additional guards only (plan section 7); no row cites the browser suite as its only guard |
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
  waived without owner approval (per `test-strategy.md` [section 3.5](test-strategy.md)).

## 5. Traceability map (DSP items to guards)

| Pres item | Guard (existing → section 2, or TBD → section 3) | Pass evidence |
|---|---|---|
| FR-DSP-1 | `router.test.ts:17,32,40,48,56,64,72,91` + per-screen render suites (section 2) + **M1 TBD** | `app/` unit suite green; M1 assertions green |
| FR-DSP-2 | Per-screen sign-in suites + `session.test.ts:21,33,43` + `client.test.ts:55,68` (section 2) + **M2 TBD** | `app/` unit suite green; single-gate assertions green; `NFR-SEC-2` guards still green |
| FR-DSP-3 | Wording baselines + double-submit guards + offline banner guards (section 2) + **M3 TBD** + `catalogue-coverage-check.sh` green | `app/` unit suite green; `ci` catalogue job green; no technical code on any screen |
| FR-DSP-4 | `PrintView.test.ts:250,275,303,476,544` + `BookView.test.ts:1046` (section 2) + **M4 TBD** + unchanged `FR-BIL-4` backend exact-match guards | Unit + served-print assertions green; `FR-BIL-4` guards green |
| NFR-DSP-1 | **M7 run record** (post-owner-approval, section 4) | 1/1 unassisted passes recorded in `test-report.md` |
| NFR-DSP-2 | **M5 TBD** | 100% of interactive elements on the six routes show the focus indicator |

## 6. Exit criteria for the Phase 2 testing slice

1. Every section 2 parity guard still passes (updated where markup
   changed, none deleted without replacement).
2. Every section 3 TBD guard (M1–M7) exists and passes, except M7 which
   passes after the owner approves the built UI (section 4 gate).
3. `catalogue-coverage-check.sh` green on every new sentence;
   `browser-e2e` job green including the MIME smoke.
4. No matrix row flipped to TBD; the 57/57 MVP count stands.
5. Open failures filed with `FR-DSP-*` / `NFR-DSP-*` ids; results
   recorded in `test-report.md`.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-446
