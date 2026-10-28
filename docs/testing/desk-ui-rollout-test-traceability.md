# Desk UI rollout test traceability (Refs #419)

Status: active. Testing spec for the owner-supplied six-screen
Claude desk UI design rollout (Main desk board #420, Book #421,
Stay check-in/out #422, Folio #423, Rooms visual map #424, 4-step
Onboarding wizard #425), owned by `qa-lead`. It maps every rollout
done-condition (AC-DSK-1..8, owned by `product-owner` in
`docs/product/acceptance-criteria.md` section 11) and every rollout
requirement (FR-DSK-1..7, NFR-DSK-1..3, owned by
`business-analyst` in `docs/requirements/mvp-requirements.md`
section 10) to its guard: existing parity guards by `file:line`
(all verified on disk) plus the new rollout guards D1–D9 that the
per-screen implementation PRs must create. Companion specs: the T2
UI contract in `docs/product/desk-ui-design-rollout.md` sections
3–4 (owned by `product-owner`); per-flow diagrams with happy path
plus failure/rollback path (owned by `architect`, SPEC-GATE FAIL
finding 3 on PR #426). This spec supplies SPEC-GATE FAIL finding 2
on PR #426; it implements no screen and changes no product code.

## 1. Scope and no-change statements

- Presentation plus narrowly-scoped screen behaviour only. The
  `business-analyst` no-change statements
  (`mvp-requirements.md` section 10.1: all MVP FR/NFR wording
  unchanged, refusal semantics unchanged, no data-model impact,
  no new business rules) hold for testing too.
- The `traceability-matrix.md` 57-row MVP coverage count stands
  unchanged: AC-DSK rows live in a dedicated rollout slice
  (`traceability-matrix.md` section 4), never as new MVP rows,
  and no existing matrix guard may cite this rollout as its
  guard.
- Refusal-condition tests stay untouched: `CONFLICT`,
  `STATE_ILLEGAL`, `VALIDATION_FAILED`, `SETTLEMENT_REQUIRED`,
  `IDENTITY_LOCKED`, and `UNAUTHENTICATED` still fire on exactly
  the same conditions — only on-screen wording is plain
  stand-in-readable sentences (`FR-DSP-3`). A screen-PR diff
  that alters any refusal condition is out of scope and fails
  review.
- Catalogue rule holds (`NFR-I18N-1`, extended by `NFR-DSK-1`):
  every new or changed string ships in both `messages/en.json`
  and `messages/vi.json` with placeholders intact, and
  `script/catalogue-coverage-check.sh` is green on every screen
  PR. New keys land through the normal catalogue process:
  `desk.rooms.*`, `desk.onboarding.*`, `stay.checkin.*`,
  `desk.empty.*`.
- `data-testid` hooks stay: each screen PR keeps every hook the
  guards below rely on (or moves it with its test), updates
  characterization tests where markup changed, and deletes no
  test without replacement.
- Open owner calls constrain two guards (recorded on the
  affected sub-issue with the owner decision, never assumed):
  Rooms-map per-card action placement (#424) — D6 asserts a
  read-only map only and no action is invented; wizard steps
  2–4 content (#425) — D7 covers launch, step 1, and the seeded
  no-launch rule only.

## 2. Parity guards (existing on disk; screen PRs extend, never delete)

| AC-DSK | Existing guard (`file:line` verified) | What the rollout must keep working |
|---|---|---|
| AC-DSK-1 shared shell | Route shape plus placeholder catch-all: `app/src/router.test.ts:17`; per-route render `:32,40,48,56,64,72`; unknown print sub-paths stay shell-served `:91`; shell nav six destinations plus user plus sign-out `app/src/App.test.ts:147`; active route highlighted exactly once `:186` (each block); unknown paths keep the nav with no active destination `:201`; single-gate sign-in suite `App.test.ts:216` (`:254` lands, `:285,308` failures read as one plain sentence, `:330` locked distinct, `:361` sign-out to the gate, `:423` expired notice); session mechanics `app/src/stores/session.test.ts:21,33,43`; 401 handling `app/src/api/client.test.ts:55,68,83,117`; offline banner `App.test.ts:29,36,54,89` with zero queued writes `client.test.ts:137,154` | Shell routing, gate, session, and offline behaviour unchanged. New in this rollout (D1): canvas-manifest tab order (Main, Stay, Onboarding, Rooms, Book, Folio), the configured hotel name in the teal header, and the whole-screen EN/VI toggle |
| AC-DSK-2 Main board | Arrivals/in-house/departures render `app/src/views/DeskView.test.ts:182`; attention lists plus DailySheet cross-check `:202`; five-lane room board with occupants `:224`; plain-words empty states when every list is empty `:298`; transport failure as one plain sentence `:352`; board lanes at source `app/src/views/DeskView.vue:109` (dirty), `:121` (uninspected), `:133` (out-of-service), `:147` (board) | Board lanes and empty states keep rendering; the two housekeeping buttons are new (D2) and must drive the existing dirty-to-clean-to-inspected transitions only |
| AC-DSK-3 Book | Confirm with guest snapshot, frozen price basis, searched sellable count, one idempotency key `app/src/views/BookView.test.ts:333`; guest-name snapshot (issue #321) `:381`; overlapping-book sellable count (issue #322) `:550`; refusal mapping `:757,787,811`; double-click confirm guard `:844`; confirmation print isolation `:1063` | Booking flow and refusals run exactly as today; only the two-column layout is new (D3) |
| AC-DSK-4 Stay placeholder | Arrival-pick test with placeholder-first options `app/src/views/StayView.test.ts:295` (asserts `:314-317`: picker opens on `Pick a ready room…` with empty value, Refs #411); `need_room` guard with no `AssignRoom` call `:348`; single-candidate auto-select `:380`; explicit empty option at source `app/src/views/StayView.vue:167`; checkout gates `:721` (zero-balance), `:759` (approval form), `:803` (`SETTLEMENT_REQUIRED` reopen) | Placeholder, guard, auto-select, and checkout gating behave exactly as today; only the pick-a-ready-room hint wording is new (D4) |
| AC-DSK-5 Folio | Folio open with running balance `app/src/views/FolioView.test.ts:177`; room-charge post `:213`; card payment `:244`; plain-words validation `:275,309,346,383`; charge click guarded in flight `:419` | Posting, payment, and balance behave exactly as today; only the charges/payments two-card layout with locale-correct amounts is new (D5) |
| AC-DSK-6 Rooms map | No map view or route exists (`app/src/router.ts` carries no map route; `router.test.ts:17` pins the 7-route set). State baselines ride the existing matrix guards (`FR-RMS-1`, `FR-RMS-2`, `FR-RMS-3`); the shared chip vocabulary is the Main-board status set (AC-DSK-2) | Room state machine and transitions unchanged; the whole map surface is new (D6), read-only over existing state |
| AC-DSK-7 Onboarding wizard | No wizard view or route exists (the empty-database path has no screen). Step-1 persistence rides the existing matrix guards (`FR-ADM-1`); printed hotel-name behaviour rides `PrintView.test.ts:342` plus the unchanged `FR-BIL-4` backend exact-match guards | Hotel-configuration surface and print content unchanged; the whole wizard surface is new (D7), gated to first run |
| AC-DSK-8 catalogue + hotel name | `script/catalogue-coverage-check.sh` (fail-closed scan over `app/src/` plus both catalogue files) with `messages/en.json` and `messages/vi.json` on disk; configured-name read-back rides the `FR-ADM-1` matrix guards (`apply-hotel-config.sh` verification) | Every screen string resolves through the catalogue in both locales; the hotel name shown is the configured value, never the design example content. New-key coverage rides D1–D7; the served-print name assertion is D8 |

## 3. New rollout guards D1–D9 (created by the screen PRs)

No D-guard exists yet: each row names the screen PR that must
create it. A rollout matrix row is complete only when its
D-guard exists and passes.

| # | Guard to create | Covers | Created by |
|---|---|---|---|
| D1 | Six-screen shell render assertions: the teal header shows the configured hotel name (never the design example content); nav tabs appear in canvas-manifest order (Main, Stay, Onboarding, Rooms, Book, Folio) with the active screen highlighted; the locale toggle switches the whole screen between EN and VI with no mixed-locale copy; the sign-in gate behaves exactly as today | AC-DSK-1, AC-DSK-8 (header half); FR-DSK-1, NFR-DSK-1 | The screen PR that implements the shared shell (recorded on #420); the other five screen PRs reuse it, never duplicate it |
| D2 | Main-board design assertions: arrivals-today, in-house, departures (or its explicit empty state), need-cleaning with the two housekeeping buttons, and out-of-service with reason and date render per the design grouping; driving both buttons advances room state through the existing transitions with actor and time recorded, and the board counts refresh to match | AC-DSK-2; FR-DSK-2 | #420 |
| D3 | Book two-column layout assertions: guest card above quote card on the left, dates/room/discount card on the right; flow and refusal tests stay untouched | AC-DSK-3; FR-DSK-3 | #421 |
| D4 | Stay hint-wording assertion: the empty placeholder ships with the pick-a-ready-room hint and check-in stays blocked with the plain-words next step until a ready room is chosen; refusal-condition and auto-select tests stay untouched | AC-DSK-4; FR-DSK-4 | #422 |
| D5 | Folio two-card layout plus locale-amount assertions: charges and payments cards per the design; amounts format locale-correctly in EN and VI; posting and balance tests stay untouched | AC-DSK-5; FR-DSK-5 | #423 |
| D6 | Rooms-map assertions over seeded floors and statuses: summary counts always equal the rendered room cards; each card shows its status chip (the one chip vocabulary shared with the Main board), room type, and the live note (occupant plus checkout date, out-of-service reason plus date, or upcoming arrival); the map is read-only — no per-card action buttons until the #424 owner decision lands | AC-DSK-6; FR-DSK-6 | #424 |
| D7 | Wizard assertions: the wizard launches on an empty database with progress and back/continue navigation; step 1 persists the hotel name, which then appears in the shell header and on printed documents; the wizard never launches on a seeded database; steps 2–4 ride the future `product-owner` spec, never assumed content | AC-DSK-7; FR-DSK-7 | #425 |
| D8 | Served-print assertions: no rollout styling leaks into the printed receipt, invoice, or confirmation (extends `shell-styling.test.ts:78` and `PrintView.test.ts:272,306,655,723` to the rollout stylesheets); the configured hotel name appears on every printed document; printed values still match the folio exactly | NFR-DSK-2; AC-DSK-7 (print half) | #423 (folio/print screen PR) |
| D9 | 44px touch-target audit: every interactive element on all six screens (nav items, buttons, links, form inputs, per-card elements, wizard navigation — including the Rooms map and the wizard) presents a hit target of at least 44 by 44 CSS px with zero adjacent-target overlaps | NFR-DSK-3 | #420–#425 (each screen PR audits its own screen; the last screen PR to merge records the six-screen rollup) |

## 4. Traceability map (AC-DSK to guards)

| AC-DSK (traces per the `product-owner` section 11 `Traces to` lines) | FR/NFR-DSK | Guard (section 2 parity + section 3 new guards) | Status and pass evidence |
|---|---|---|---|
| AC-DSK-1 — shared shell in canvas-manifest order with locale toggle | FR-DSK-1 | Parity: `router.test.ts:17,32,40,48,56,64,72,91` + `App.test.ts:147,186,201,216` suite + `session.test.ts:21,33,43` + `client.test.ts:55,68,83,117,137,154` + **D1 new** | Baseline green in the `app/` unit suite; D1 pending the shell screen PR (recorded on #420) |
| AC-DSK-2 — Main board with housekeeping buttons and refreshed counts | FR-DSK-2 | Parity: `DeskView.test.ts:182,202,224,298,352` + `DeskView.vue:109,121,133,147` + unchanged `FR-RMS-2` / `NFR-AUD-1` matrix guards + **D2 new** | Baseline green; D2 pending #420 |
| AC-DSK-3 — Book two-column layout, flow unchanged | FR-DSK-3 | Parity: `BookView.test.ts:333,381,550,757,787,811,844,1063` + unchanged `FR-RES-1` / `FR-GST-3` matrix guards + **D3 new** | Baseline green; D3 pending #421 |
| AC-DSK-4 — Stay explicit empty placeholder with hint, check-in blocked | FR-DSK-4 | Parity: `StayView.vue:167` + `StayView.test.ts:295,314-317,348,380` + checkout gates `:721,759,803` + unchanged `FR-FDK-1/2` / `FR-BIL-7` matrix guards + **D4 new** | Baseline green; D4 pending #422 |
| AC-DSK-5 — Folio two-card layout, balance unchanged | FR-DSK-5 | Parity: `FolioView.test.ts:177,213,244,275,309,346,383,419` + unchanged `FR-BIL-1/2/3` matrix guards + **D5 new** | Baseline green; D5 pending #423 |
| AC-DSK-6 — Rooms map with counts matching cards | FR-DSK-6 | Parity: unchanged `FR-RMS-1/2/3` matrix guards + **D6 new** (no view exists; `router.test.ts:17` pins the current 7-route set) | D6 pending #424 (read-only; actions gated on the #424 owner decision) |
| AC-DSK-7 — Onboarding wizard gated to first run, step-1 name persisted | FR-DSK-7 | Parity: unchanged `FR-ADM-1` matrix guards + `PrintView.test.ts:342` + **D7 new** (no view exists) + **D8 new** (printed name) | D7 pending #425 (steps 2–4 gated on the future `product-owner` spec); D8 pending #423 |
| AC-DSK-8 — VI-primary catalogue, hotel name configurable | NFR-DSK-1 | `script/catalogue-coverage-check.sh` green + `messages/en.json` + `messages/vi.json` + new `desk.rooms.*`, `desk.onboarding.*`, `stay.checkin.*`, `desk.empty.*` keys per screen PR + **D1 new** (header name) + **D8 new** (printed name) | Catalogue job green; new-key coverage and D1/D8 pending the screen PRs |

## 5. Exit criteria for the rollout testing slice

1. Every section 2 parity guard still passes (updated where
   markup changed, none deleted without replacement).
2. Guards D1–D9 exist and pass (section 3); the `app/` unit
   suite is green on every screen PR.
3. `catalogue-coverage-check.sh` is green on every screen PR,
   including the new `desk.rooms.*`, `desk.onboarding.*`,
   `stay.checkin.*`, and `desk.empty.*` keys in both locales
   with placeholders intact.
4. Served-print assertions hold (D8 plus the unchanged
   `FR-BIL-4` backend exact-match guards): zero
   print-output differences attributable to the rollout.
5. No matrix MVP row flipped to TBD; the 57/57 MVP count
   stands; all 8 rollout-slice matrix rows map with their
   D-guards landed.
6. Each screen checks against its design file card by card
   (issue-body criterion); the check is recorded on the
   per-screen sub-issue (#420–#425).
7. Open failures are filed with `AC-DSK-*` / `FR-DSK-*` /
   `NFR-DSK-*` ids, and results are recorded in the
   consolidated `docs/testing/test-report.md` (exists; no new
   run-log file is promised here — the QA execution slice
   creates it, not this spec).

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-543
