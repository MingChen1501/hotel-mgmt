# Desk restyle test traceability (Refs #517)

Status: active. Testing spec for the #517 pixel-faithful desk restyle
epic (owner decision B, 2026-11-07), owned by `qa-lead`. It maps every
restyle done-condition (AC-RST-1..8, owned by `product-owner` in
`docs/product/acceptance-criteria.md` section 12, PR #525) and every
restyle requirement (FR-RST-1..7, NFR-RST-1..3, owned by
`business-analyst` in `docs/requirements/mvp-requirements.md`
section 13, PR #526) to its guard: existing parity guards by
`file:line` (all verified on disk) plus the new restyle guards R1–R9
that the per-screen child implementation PRs (#518–#524) must create.
Companion specs: the T2 restyle spec with the UI contract
(`docs/product/desk-ui-pixel-faithful-restyle.md`, PR #525); the
FR/NFR delta (PR #526); the ADR-0003 partial-supersession record
(`docs/architecture/decisions/adr-0003-desk-ui-vue-vite.md`, PR
#527). This spec supplies SPEC-GATE FAIL finding 3 on PR #525; it
implements no screen and changes no product code.

Rebaseline note (Refs #586, 2026-11-09): the Stay check-in candidate
load timing and the room-error lifecycle are re-baselined by
`AC-DSK-17` (rollout spec section 6.12; `FR-CIP-1`..`FR-CIP-4` in
`mvp-requirements.md` section 18). The arrival pick now loads the
booked-type ready rooms, a valid room selection clears the
`Pick a ready room first.` message, and the commit still happens on
the Check in button. `AC-RST-4` / `FR-RST-4` keep their restyle
conditions (stacked cards, placeholder, auto-select, move/times,
checkout gate) and point at `AC-DSK-17` for the load timing; R4
still asserts design values only, and the check-in guard, auto-select,
and commit cases moved to the new timing with the #586 change shipped
in PR #594 (rewritten with a note, never deleted).

## 1. Scope and no-change statements

- Presentation only. The slice rebuilds markup and styling to the
  owner boards (`docs/design/*.dc.html` inline styles) while logic,
  hooks, stores, routers, API calls, request fields, state
  transitions, validation, copy, catalogue keys, and print output
  stay exactly as today (the `business-analyst` no-change
  statements in `mvp-requirements.md` section 13 and the
  `architect` change/stay boundary in the ADR-0003 record hold for
  testing too). One re-baselined exception (Refs #586): the Stay
  check-in candidate load timing and the room-error lifecycle follow
  `AC-DSK-17` / `FR-CIP-1`..`FR-CIP-4`, as the rebaseline note above
  and section 4 record; nothing else in this slice moves.
- The `traceability-matrix.md` MVP coverage count stands unchanged:
  AC-RST / FR-RST / NFR-RST rows live in this dedicated restyle
  slice (section 4), never as new matrix rows, and no existing
  matrix guard may cite this restyle as its guard.
- Refusal-condition tests stay untouched: `CONFLICT`,
  `STATE_ILLEGAL`, `VALIDATION_FAILED`, `SETTLEMENT_REQUIRED`,
  `IDENTITY_LOCKED`, and `UNAUTHENTICATED` still fire on exactly
  the same conditions — only on-screen visuals move to the design
  values. A restyle diff that alters any refusal condition is out
  of scope and fails review.
- Catalogue rule holds (`NFR-RST-1`, extending `NFR-I18N-1`): every
  user-visible string resolves through `t()` in both
  `messages/en.json` and `messages/vi.json` with placeholders
  intact, and `script/catalogue-coverage-check.sh` is green on
  every child PR. This restyle is expected to add zero keys; any
  key a worker needs follows the normal catalogue process and is
  recorded in the child PR body. The hotel name shown is the
  configured value, never the boards' example content.
- `data-testid` hooks stay: each child PR keeps every hook the
  guards below rely on (or moves it with its test), updates
  characterization tests where markup changed, and deletes no test
  without replacement.
- Open owner calls constrain two guards (recorded on the affected
  child issue with the owner decision, never assumed): the shell
  tab set (R1 asserts the decided set only — the seven v2 design
  header tabs render as seven nav tabs with Onboarding as the
  tab-less deep route, Refs #539; the Rooms tab landed in #552), and the
  #495–#500 REPORTED flow/copy items, which stay reported
  (child PRs assert visuals only, never decide copy or flow). One
  of those items moved on its load half only: the T3
  single-vs-two-step check-in item (#497) is resolved by #586 per
  `AC-DSK-17` — the arrival pick loads the candidates, the commit
  stays on the button, and no other flow or copy item changes.

## 2. Parity guards (existing on disk; child PRs extend, never delete)

| FR-RST | Existing guard (`file:line` verified) | What the restyle must keep working |
|---|---|---|
| FR-RST-1 shared shell | Shell nav root `app/src/App.vue:127`, per-route tabs `:139`, active class `:141`; nav set `app/src/App.vue:221` (`NAV_ITEMS`); route shape `app/src/router.ts:47` (desk) through the print/admin/placeholder tail; shell-nav items `app/src/App.test.ts:189`, configured hotel name in the header `:217`, per-destination active highlight `:373` | Shell routing, nav, session, gate, and offline behaviour unchanged; the teal header and tab visuals are new (R1) |
| FR-RST-2 Main board | Five design cards with housekeeping buttons and the out-of-service note `app/src/views/DeskView.test.ts:286`; weekday-long business-date header `:268` (render `:240`); dirty-to-clean with count refresh `:347`; clean-to-inspected `:407`; sellability through the contract `roomType` field `:327` | Board lanes, transitions, count refresh, and payload fields unchanged; date-row/grid/divider design values are new (R2) |
| FR-RST-3 Book screen | Two-column design cards with the guest card above the quote card `app/src/views/BookView.test.ts:241`; quote with nightly lines and total `:382`; confirm with guest snapshot, frozen price basis, sellable count, one idempotency key `:397`; sold-out refusal `:851`; restriction refusal `:875` | Guest search, walk-in, get-quote-then-confirm flow, and refusals run exactly as today; grid/label/control design values are new (R3) |
| FR-RST-4 Stay check-in/out | Panel data load (arrivals, in-house, departures) under the shell session `app/src/views/StayView.test.ts:296`; arrival-pick candidate load `:332` (placeholder-first options `:357`); `need_room` guard with no `AssignRoom` call `:453`; single-candidate auto-select `:493`; zero-balance checkout without approval `:1024`; design cards with the room hint and checkout gate note `:1831` | Stacked-card design values are new (R4). The check-in cases moved to the arrival-pick load timing with the #586 change shipped in PR #594 and were rewritten with a note, never deleted: the arrival pick alone populates the picker, a valid select clears the guard, and one button click commits (`AC-DSK-17`). The #594 cases add the guard cleared on a valid pick `:402`, the plain no-ready-rooms error with a retrying click `:538`, the failed-preload retry `:607`, the mid-load arrival clear `:665`, and the late-read rule `:723`. Placeholder gate, auto-select, move/times flows, and the settled-folio checkout gate behave as specified |
| FR-RST-5 Folio screen | Charges/payments two-card layout with locale-correct amounts `app/src/views/FolioView.test.ts:501`; room-charge post with idempotency key and re-read `:215`; card payment with idempotency key and re-read `:246`; restyle kept out of print `:565` | Per-stay open form, charge posting, payment recording, running balance, and print output unchanged; two-card grid and balance-accent design values are new (R5) |
| FR-RST-6 Rooms map | Summary-counts-match-cards invariant across all five statuses `app/src/views/RoomsView.test.ts:193`; per-card chips, types, and live notes `:228`; dirty-to-clean with count refresh `:286`; clean-to-inspected `:345` | Live state rendering, the invariant, housekeeping buttons, floor grouping, and chip wording unchanged; title/chip/floor/card design values are new (R6) |
| FR-RST-7 Onboarding wizard | Step 1 per the design on an empty database `app/src/views/OnboardingView.test.ts:61`; seeded-database redirect to the shell `:124`; hotel-name persist and advance to step 2 `:198`; step 4 at 100 percent with the owner role fixed `:709` | Launch gating, four-step flow with progress and back/continue navigation, per-step validation, persistence, and wording unchanged; slim-header/column/progress/card/input design values are new (R7) |
| NFR-RST-1 catalogue + hotel name | `script/catalogue-coverage-check.sh` (fail-closed scan over `app/src/` plus both catalogue files) with `messages/en.json:568` (`desk.shell.brand`) and `messages/vi.json` parity | Every screen string resolves through the catalogue in both locales; the name shown is the configured value; new-key coverage rides R1 (header) and R8 (printed name) |
| NFR-RST-2 print parity | Invoice matching folio lines and balance `app/src/views/PrintView.test.ts:272`; one receipt per recorded payment `:306`; folio restyle kept out of print `app/src/views/FolioView.test.ts:565` | Printed output matches the folio exactly and no screen styling leaks into print; the served-print restyle assertion is new (R8) |
| NFR-RST-3 token source | Single source `app/src/theme/tokens.ts:22` (header `#0F4C47`), `:23` (primary `#0F766E`), `:15` (page `#F4F6F5`), `:17` (ink `#1B2B2A`); pins `app/src/theme/tokens.test.ts:43` (primary fill), `:52` (focus ring), `:69` (scale alignment), `:75` (no residual PrimeVue default) | Token edits land in `tokens.ts` in one place; the seven-surface 44px audit and the no-fork pin are new (R9) |
| Design-facts gate (schema v1, v2 boards) | Seven-board manifest covered minus deferred Admin: `SCREEN_TABLE` `app/e2e/design-facts.ts:104` carries the six boards with a running app screen (Main, Stay, Onboarding, Rooms, Book, Folio) with route and view hook; the seventh board Admin has no app screen and is deferred, never asserted (Refs #546, Refs #549). Schema v1 is unchanged (#551 added a v2-envelope provenance note with no record-shape change, so `FACT_SCHEMA_VERSION` stays 1). Matching app DOM passes `app/e2e/design-facts.spec.ts:159`; mismatches fail with design `file:line` vs app selector `:379`; token colours resolve through computed styles `:491`; live shell conformance (tokens, tab labels, active state per screen) `:517` | The gate already asserts nav order/labels, headings, buttons, inputs, and token colours per the fact schema on matching and live DOM; restyle child PRs keep it green per covered surface, never weaken it |
| DOM-diff dynamic data | Owner-approved exemptions `docs/testing/dom-diff-allowlist.md` (section 3 entries, section 5 approval path; v2 7-board bundle with the Admin board deferred, Refs #549) | Dates, counts, and names render live data; exemptions stay allowlist-only — a restyle diff on a non-exempt node is a real failure; no Admin-board diff is asserted or exempted until #546 lands |

## 3. New restyle guards R1–R9 (created by the child PRs)

No R-guard exists yet: each row names the child PR that must create
it. A section 4 matrix row is complete only when its R-guard exists
and passes. Screenshots and per-screen owner review have no
automated guard by design (section 4, AC-RST-8): the child PR body
carries side-by-side before/after screenshots covering what fact
schema v1 excludes (layout geometry, typography, radii, spacing),
and the owner reviews per screen before merge — screenshots and
owner review must not be read as passing without both artefacts on
the child issue and PR.

| # | Guard to create | Covers | Created by |
|---|---|---|---|
| R1 | Seven-surface shell render assertions: the teal header shows the configured hotel name (never the design example content) at the design height, padding, and brand size; nav tabs render the design padding/radius with the active tab inverted; the locale pill renders the design border/radius/padding and the toggle switches the whole screen EN/VI with no mixed-locale copy; the sign-in gate behaves exactly as today; the #518 board-conflict owner decision is recorded on the issue before merge | AC-RST-1, AC-RST-8 (shell half); FR-RST-1, NFR-RST-1 (header-name half) | #518 (shell/nav); the six screen PRs reuse it, never duplicate it |
| R2 | Main design-value assertions only: business-date row, `3×1` card grids over two rows, row dividers, departures empty state, two housekeeping action buttons per the design values; both buttons still drive the existing transitions with count refresh | AC-RST-2; FR-RST-2 | #519 |
| R3 | Book design-value assertions only: title, two-column grid, stay field grid, labels, full-width controls, quote rows, helper copy per the design values; search, walk-in, quote, confirm, and refusal tests stay untouched | AC-RST-3; FR-RST-3 | #520 |
| R4 | Stay design-value assertions only: intro, five stacked cards, labels, full-width controls, folio-reconciliation hint per the design values; the check-in guard, auto-select, and commit cases now run on the arrival-pick load timing with the #586 change shipped in PR #594 (Refs `AC-DSK-17`, `D17`; rewritten with a note, never deleted), and the #594 cases covering the no-ready-rooms error, the guard cleared on select, the failed-preload retry, the mid-load clear, and the late read live in the same suite under `D17`; placeholder gate, move/times, and checkout-gate tests stay untouched | AC-RST-4; FR-RST-4 (`AC-DSK-17` for the load timing) | #521 |
| R5 | Folio design-value assertions only: two-card grid, balance-due accent size and colour, example lines, labels, full-width controls per the design values; open, posting, balance, and print tests stay untouched | AC-RST-5; FR-RST-5 | #522 |
| R6 | Rooms design-value assertions only: title row, chip row with dots, floor sections and grids, room cards (number, badge, type, note) per the design values; live-state, invariant, button, grouping, and wording tests stay untouched | AC-RST-6; FR-RST-6 | #523 |
| R7 | Onboarding design-value assertions only: slim header, centred column, progress line and bar at 25/50/75/100 percent, card, input, helper, continue action per the design values; gating, four-step flow, validation, persistence, and wording tests stay untouched | AC-RST-7; FR-RST-7 | #524 |
| R8 | Served-print restyle assertions: no restyle stylesheet leaks into the printed receipt, invoice, or confirmation (extends `PrintView.test.ts:272,306` and `FolioView.test.ts:565` to the restyle stylesheets); the configured hotel name appears on every printed document; printed values still match the folio exactly | AC-RST-5 (print half), AC-RST-7 (print half), AC-RST-8; NFR-RST-2, NFR-RST-1 (printed-name half) | #522 (folio/print screen PR) |
| R9 | Seven-surface 44px touch-target audit plus no-token-fork pin: every interactive element on all seven surfaces (nav items, buttons, links, form inputs, per-card elements, wizard navigation) presents a hit target of at least 44 by 44 CSS px with zero adjacent-target overlaps (100% meet); every rendered colour, radius, and spacing value resolves through `app/src/theme/tokens.ts` (extends `tokens.test.ts:43,52,69,75`), with zero per-surface forks | AC-RST-8; NFR-RST-3 | Each child PR (#518–#524) audits its own surface; the last child PR to merge records the seven-surface rollup |

## 4. Traceability map (AC-RST to guards)

| AC-RST (traces per the `product-owner` section 12 `Traces to` lines) | FR/NFR-RST | Guard (section 2 parity + section 3 new guards) | Status and pass evidence |
|---|---|---|---|
| AC-RST-1 — shell with teal header, tab inversion, locale pill | FR-RST-1 | Parity: `App.vue:127,139,141,221` + `router.ts:47` + `App.test.ts:189,217,373` + **R1 new** | Baseline green in the `app/` unit suite; R1 pending #518 (decided tab set recorded on the issue) |
| AC-RST-2 — Main board per the design, behaviour unchanged | FR-RST-2 | Parity: `DeskView.test.ts:240,268,286,327,347,407` + **R2 new** | Baseline green; R2 pending #519 |
| AC-RST-3 — Book two-column layout, flow unchanged | FR-RST-3 | Parity: `BookView.test.ts:241,382,397,851,875` + **R3 new** | Baseline green; R3 pending #520 |
| AC-RST-4 — Stay stacked cards; check-in flow re-baselined to the arrival-pick load with the commit on the button (Refs #586, `AC-DSK-17`) | FR-RST-4 | Parity: `StayView.test.ts:296,332,453,493,1024,1831` + unchanged `FR-FDK-1/2` / `FR-BIL-7` matrix guards + **R4 new**; the arrival-flow pin `:332` (placeholder-first `:357`) runs on the pick timing with the #586 change shipped in PR #594, and the no-ready-rooms error (`:538`), guard-cleared-on-select (`:402`), failed-preload retry (`:607`), mid-load clear (`:665`), and late-read (`:723`) cases landed there (`AC-DSK-17`, `D17`) | Baseline green; R4 shipped with #521; the #586 guard rewrite landed in #594 (no guard deleted) |
| AC-RST-5 — Folio two-card grid with balance accent, print unchanged | FR-RST-5 | Parity: `FolioView.test.ts:215,246,501,565` + unchanged `FR-BIL-1/2/3` matrix guards + **R5 new** + **R8 new** (print half) | Baseline green; R5/R8 pending #522 |
| AC-RST-6 — Rooms map per the design, wording unchanged | FR-RST-6 | Parity: `RoomsView.test.ts:193,228,286,345` + unchanged `FR-RMS-1/2/3` matrix guards + **R6 new** | Baseline green; R6 pending #523 |
| AC-RST-7 — Onboarding wizard per the design, seeded never launches | FR-RST-7 | Parity: `OnboardingView.test.ts:61,124,198,709` + **R7 new** + **R8 new** (printed-name half) | Baseline green; R7 pending #524, R8 pending #522 |
| AC-RST-8 — screenshots, facts gate, catalogue, hotel name, owner review | NFR-RST-1, NFR-RST-2, NFR-RST-3 | `catalogue-coverage-check.sh` green + `messages/en.json:568` + `vi.json` parity + facts gate `design-facts.spec.ts:159,379,491,517` green per covered surface (Admin deferred, Refs #549) + **R1 new** (header name) + **R8 new** (served print) + **R9 new** (targets + no-fork) + screenshots with per-screen owner review (no automated guard by design) | Catalogue job and facts gate green at baseline; R1/R8/R9 pending the child PRs; screenshots + owner review recorded on each child issue (#518–#524) and PR before merge |

## 5. Exit criteria for the restyle testing slice

1. Every section 2 parity guard still passes (updated where
   markup changed, none deleted without replacement). The Stay
   check-in cases moved to the arrival-pick load timing with the
   #586 change shipped in PR #594 (Refs `AC-DSK-17`): they were
   rewritten with a note, and the new no-ready-rooms,
   error-cleared-on-select, failed-preload retry, mid-load clear,
   and late-read cases landed in the same change.
2. Guards R1–R9 exist and pass (section 3); the `app/` unit suite
   and the design-facts gate are green on every child PR.
3. `catalogue-coverage-check.sh` is green on every child PR with
   zero expected new keys; any needed key lands en + vi through
   the normal catalogue process and is recorded in the child PR
   body; 0 hardcoded hotel-name occurrences.
4. Served-print assertions hold (R8 plus the unchanged `FR-BIL-4`
   backend exact-match guards): zero print-output differences
   attributable to the restyle.
5. No matrix MVP row flipped to TBD; the MVP coverage count
   stands; all 8 restyle-slice matrix rows map with their R-guards
   landed.
6. Each surface checks against its board card by card
   (issue-body criterion); the check is recorded on the per-screen
   child issue (#518–#524) with before/after screenshots and a
   per-screen owner review.
7. Open failures are filed with `AC-RST-*` / `FR-RST-*` /
   `NFR-RST-*` ids, and results are recorded in the consolidated
   `docs/testing/test-report.md` (exists; no new run-log file is
   promised here — the QA execution slice creates it, not this
   spec).

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-721
