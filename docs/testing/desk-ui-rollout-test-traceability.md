# Desk UI rollout test traceability (Refs #419, #438)

Status: active. Testing spec for the owner-supplied six-screen
Claude desk UI design rollout (Main desk board #420, Book #421,
Stay check-in/out #422, Folio #423, Rooms visual map #424, 4-step
Onboarding wizard #425 plus steps 2–4 in #438), owned by
`qa-lead`. It maps every rollout done-condition (AC-DSK-1..11,
owned by `product-owner` in
`docs/product/acceptance-criteria.md` section 11, PR #426 plus
AC-DSK-9..11 on the #438 stack in PR #441) and every rollout
requirement (FR-DSK-1..7, NFR-DSK-1..3, owned by
`business-analyst` in `docs/requirements/mvp-requirements.md`
section 10, PR #427, plus wizard-scoped FR-DSK-8..10 in section
11 on the #438 stack in PR #442) to its guard: existing parity guards by `file:line`
(all verified on disk) plus the new rollout guards D1–D12 that the
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
  2–4 content (Refs #438) — steps 2–4 are now specified, not
  assumed: exact fields and validation live with
  `business-analyst` (`mvp-requirements.md` section 11,
  `FR-DSK-8..10`, PR #442), the per-flow diagram with
  `architect` (LLD section 13.4 node J, PR #443), and the
  guard assertions below (D10–D12). D7 keeps covering launch,
  step 1, and the seeded no-launch rule only.

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
| AC-DSK-9 Wizard step 2 | Step-2 persistence rides the existing `UpdateHotelConfig` matrix guards: persist `services/admin/src/server.test.ts:148` (values round trip `:155`–`:165`); blank name refused `:170` (assertion `:174`–`:175`); front-desk attempt refused `FORBIDDEN` `:180` (assertion `:184`–`:185`; also `:260`–`:268` in the stay-times test); stay-times and wording save with read-back `:189`–`:245`; timezone write with the actor in the audit log `services/admin/src/pgstore.test.ts:103` (actor assertion `:109`–`:110`) | Hotel-configuration surface unchanged; only first-run entry through the wizard is new (D10) |
| AC-DSK-10 Wizard step 3 | Step-3 persistence rides the existing seed-path matrix guards: type upsert `services/rooms/src/server.test.ts:70` (second type `:109`); room upsert `:79`; unknown room type refused `NOT_FOUND` `:137`–`:147`; owner defines rooms with inventory plus availability uptake `:149`–`:202`; the e2e desk-loop rooms step `script/e2e-desk-loop.sh:266` (type plus two rooms with a sellability check). Duplicate numbers have no server guard — `UpsertRoom` updates on duplicate (`services/rooms/src/store.ts:237-260`, `services/rooms/src/pgstore.ts:194-213`) — so the wizard refuses a repeated number in the batch client-side naming the number before anything persists (FR-DSK-9, PR #442) | Seed path and room state machine unchanged; only first-run entry through the wizard is new (D11) |
| AC-DSK-11 Wizard step 4 | Step-4 persistence rides the existing `CreateUser` matrix guards: create `:122` of `services/admin/src/server.test.ts` (assertion `:126`); duplicate identity refused `VALIDATION_FAILED` `:132` (assertion `:136`–`:137`); role validation `:283`–`:335` incl. bad role `:315` (assertion `:322`–`:323`) and self-change guard `:325`–`:333`; last-owner guard `:337`–`:372`; front-desk role change refused `FORBIDDEN` `:374`–`:400` (assertion `:397`–`:398`); lockout path `:82`–`:101`; unlock with sign-in retry `:402`–`:437`; unlock refusals `:440`–`:486`; secret rotation with old-stops/new-signs-in round trip `:536`–`:563` and per-role rotation recorded in the audit log `:614`–`:647`; empty secret refused server-side `services/admin/src/pgstore.ts:209`–`:210` (`VALIDATION_FAILED` naming `secret`); front-desk `CreateUser` refused `FORBIDDEN` code-enforced `services/admin/src/pgstore.ts:204`–`:205` (no on-disk test; nearest sibling guards `:177`–`:185`, `:390`–`:398`) | Admin user surface unchanged; only first-run entry through the wizard is new (D12) |
| AC-DSK-8 catalogue + hotel name | `script/catalogue-coverage-check.sh` (fail-closed scan over `app/src/` plus both catalogue files) with `messages/en.json` and `messages/vi.json` on disk; configured-name read-back rides the `FR-ADM-1` matrix guards (`apply-hotel-config.sh` verification) | Every screen string resolves through the catalogue in both locales; the hotel name shown is the configured value, never the design example content. New-key coverage rides D1–D7 plus D10–D12; the served-print name assertion is D8 |

## 3. New rollout guards D1–D12 (created by the screen PRs)

No D-guard exists yet: each row names the screen PR that must
create it. A rollout matrix row is complete only when its
D-guard exists and passes. D10–D12 cover onboarding wizard
steps 2–4 (Refs #438) and are created by the single steps 2–4
screen PR, not by #425.

| # | Guard to create | Covers | Created by |
|---|---|---|---|
| D1 | Six-screen shell render assertions: the teal header shows the configured hotel name (never the design example content); nav tabs appear in canvas-manifest order (Main, Stay, Onboarding, Rooms, Book, Folio) with the active screen highlighted; the locale toggle switches the whole screen between EN and VI with no mixed-locale copy; the sign-in gate behaves exactly as today | AC-DSK-1, AC-DSK-8 (header half); FR-DSK-1, NFR-DSK-1 | The screen PR that implements the shared shell (recorded on #420); the other five screen PRs reuse it, never duplicate it |
| D2 | Main-board design assertions: arrivals-today, in-house, departures (or its explicit empty state), need-cleaning with the two housekeeping buttons, and out-of-service with reason and date render per the design grouping; driving both buttons advances room state through the existing transitions with actor and time recorded, and the board counts refresh to match | AC-DSK-2; FR-DSK-2 | #420 |
| D3 | Book two-column layout assertions: guest card above quote card on the left, dates/room/discount card on the right; flow and refusal tests stay untouched | AC-DSK-3; FR-DSK-3 | #421 |
| D4 | Stay hint-wording assertion: the empty placeholder ships with the pick-a-ready-room hint and check-in stays blocked with the plain-words next step until a ready room is chosen; refusal-condition and auto-select tests stay untouched | AC-DSK-4; FR-DSK-4 | #422 |
| D5 | Folio two-card layout plus locale-amount assertions: charges and payments cards per the design; amounts format locale-correctly in EN and VI; posting and balance tests stay untouched | AC-DSK-5; FR-DSK-5 | #423 |
| D6 | Rooms-map assertions over seeded floors and statuses: summary counts always equal the rendered room cards; each card shows its status chip (the one chip vocabulary shared with the Main board), room type, and the live note (occupant plus checkout date, out-of-service reason plus date, or upcoming arrival); the map is read-only — no per-card action buttons until the #424 owner decision lands | AC-DSK-6; FR-DSK-6 | #424 |
| D7 | Wizard assertions: the wizard launches on an empty database with progress and back/continue navigation; step 1 persists the hotel name, which then appears in the shell header and on printed documents; the wizard never launches on a seeded database | AC-DSK-7; FR-DSK-7 | #425 |
| D8 | Served-print assertions: no rollout styling leaks into the printed receipt, invoice, or confirmation (extends `shell-styling.test.ts:78` and `PrintView.test.ts:272,306,655,723` to the rollout stylesheets); the configured hotel name appears on every printed document; printed values still match the folio exactly | NFR-DSK-2; AC-DSK-7 (print half) | #423 (folio/print screen PR) |
| D9 | 44px touch-target audit: every interactive element on all six screens (nav items, buttons, links, form inputs, per-card elements, wizard navigation — including the Rooms map and the wizard) presents a hit target of at least 44 by 44 CSS px with zero adjacent-target overlaps | NFR-DSK-3 | #420–#425 (each screen PR audits its own screen; the last screen PR to merge records the six-screen rollup) |
| D10 | Wizard step-2 assertions (Refs #438; fields and validation per `FR-DSK-8`, PR #442; flow per LLD node J1–J4, PR #443): at 50 percent progress, contact details (address, phone, email) are each optional and stored verbatim when entered; a blank timezone is refused naming the timezone field; a non-integer or negative retention floor is refused naming the retention-floor field while blank keeps the 365-day default; continue persists through `UpdateHotelConfig` with actor and timestamp recorded (`NFR-AUD-1`); back returns to step 1 with entered values kept; a validation failure keeps staff on step 2, names the missing or invalid field in plain words, and persists nothing for the step | AC-DSK-9; FR-DSK-8 | The #438 steps 2–4 screen PR (extends `OnboardingView.test.ts:61,90,104,126,161,190,224`; backend behaviour already guarded by `services/admin/src/server.test.ts:148` persist with values round trip `:155`–`:165`, `:170` blank-name refusal, `:180` front-desk `FORBIDDEN`, `:189`–`:245` stay-times/wording save with read-back, and `services/admin/src/pgstore.test.ts:103` timezone write with actor in audit) |
| D11 | Wizard step-3 assertions (Refs #438; fields and validation per `FR-DSK-9`, PR #442; flow per LLD node J5–J8, PR #443): at 75 percent progress, a blank room-type name is refused naming the room-type name; a blank room number is refused naming the room number; a repeated number in the batch is refused client-side naming the number (no server guard: `UpsertRoom` updates on duplicate); a room with no link to a type saved in this step is refused naming the type; continue persists types first then rooms through `UpsertRoomType` / `UpsertRoom` with actor and timestamp recorded (`NFR-AUD-1`); saved rooms appear in the inventory, availability, and calendar with the defined capacity and type (`FR-ADM-3` holds); back returns to step 2 with entered values kept; a validation failure keeps staff on step 3, names the missing, duplicate, or unlinked field in plain words, and persists nothing for the step | AC-DSK-10; FR-DSK-9 | The #438 steps 2–4 screen PR (new view assertions; backend behaviour already guarded by `services/rooms/src/server.test.ts:70` type upsert, `:79` room upsert, `:109` second type, `:137`–`:147` unknown-type `NOT_FOUND`, `:149`–`:202` owner defines rooms with inventory plus availability uptake, plus the e2e desk-loop rooms step `script/e2e-desk-loop.sh:266`; duplicate detection is wizard client-side batch validation with no server guard) |
| D12 | Wizard step-4 assertions (Refs #438; fields and validation per `FR-DSK-10`, PR #442; flow per LLD node J9–J12, PR #443): at 100 percent progress, a blank display name is refused naming the name field, a blank sign-in identity is refused naming the identity field, an already-used identity is refused naming the identity, and an empty secret is refused naming the secret field (`NFR-SEC-2` holds); the role is fixed to owner; finish persists through `CreateUser` with the creator recorded, the owner signs in and reaches exactly the owner-permitted functions, and the wizard completes to the desk and never shows again on the now-seeded database (`FR-DSK-7` holds); back returns to step 3 with entered values kept; a validation failure keeps staff on step 4, names the missing or taken field in plain words, and creates no account | AC-DSK-11; FR-DSK-10 | The #438 steps 2–4 screen PR (new view assertions; backend behaviour already guarded by `services/admin/src/server.test.ts:122` create, `:132` duplicate identity refused, `:283`–`:335` role validation, `:337`–`:372` last-owner guard, `:374`–`:400` front-desk role change refused, `:82`–`:101` lockout path, `:402`–`:437` unlock with sign-in retry, `:440`–`:486` unlock refusals, `:536`–`:563` rotation round trip, `:614`–`:647` rotation audit, and `services/admin/src/pgstore.ts:209`–`:210` empty-secret refusal plus `:204`–`:205` front-desk `CreateUser` refusal, both code-enforced) |

## 4. Traceability map (AC-DSK to guards)

| AC-DSK (traces per the `product-owner` section 11 `Traces to` lines) | FR/NFR-DSK | Guard (section 2 parity + section 3 new guards) | Status and pass evidence |
|---|---|---|---|
| AC-DSK-1 — shared shell in canvas-manifest order with locale toggle | FR-DSK-1 | Parity: `router.test.ts:17,32,40,48,56,64,72,91` + `App.test.ts:147,186,201,216` suite + `session.test.ts:21,33,43` + `client.test.ts:55,68,83,117,137,154` + **D1 new** | Baseline green in the `app/` unit suite; D1 pending the shell screen PR (recorded on #420) |
| AC-DSK-2 — Main board with housekeeping buttons and refreshed counts | FR-DSK-2 | Parity: `DeskView.test.ts:182,202,224,298,352` + `DeskView.vue:109,121,133,147` + unchanged `FR-RMS-2` / `NFR-AUD-1` matrix guards + **D2 new** | Baseline green; D2 pending #420 |
| AC-DSK-3 — Book two-column layout, flow unchanged | FR-DSK-3 | Parity: `BookView.test.ts:333,381,550,757,787,811,844,1063` + unchanged `FR-RES-1` / `FR-GST-3` matrix guards + **D3 new** | Baseline green; D3 pending #421 |
| AC-DSK-4 — Stay explicit empty placeholder with hint, check-in blocked | FR-DSK-4 | Parity: `StayView.vue:167` + `StayView.test.ts:295,314-317,348,380` + checkout gates `:721,759,803` + unchanged `FR-FDK-1/2` / `FR-BIL-7` matrix guards + **D4 new** | Baseline green; D4 pending #422 |
| AC-DSK-5 — Folio two-card layout, balance unchanged | FR-DSK-5 | Parity: `FolioView.test.ts:177,213,244,275,309,346,383,419` + unchanged `FR-BIL-1/2/3` matrix guards + **D5 new** | Baseline green; D5 pending #423 |
| AC-DSK-6 — Rooms map with counts matching cards | FR-DSK-6 | Parity: unchanged `FR-RMS-1/2/3` matrix guards + **D6 new** (no view exists; `router.test.ts:17` pins the current 7-route set) | D6 pending #424 (read-only; actions gated on the #424 owner decision) |
| AC-DSK-7 — Onboarding wizard gated to first run, step-1 name persisted | FR-DSK-7 | Parity: unchanged `FR-ADM-1` matrix guards + `PrintView.test.ts:342` + **D7 new** (extends `OnboardingView.test.ts:61,90,104,126,161,190,224`) + **D8 new** (printed name) | D7 shipped in #425 (PR #437: launch, step-1 name, seeded no-launch); steps 2–4 carry their own rows below; D8 pending #423 |
| AC-DSK-8 — VI-primary catalogue, hotel name configurable | NFR-DSK-1 | `script/catalogue-coverage-check.sh` green + `messages/en.json` + `messages/vi.json` + new `desk.rooms.*`, `desk.onboarding.*`, `stay.checkin.*`, `desk.empty.*` keys per screen PR + **D1 new** (header name) + **D8 new** (printed name) | Catalogue job green; new-key coverage and D1/D8 pending the screen PRs; steps 2–4 `desk.onboarding.*` keys land en + vi on the #438 screen PR with the coverage check green |
| AC-DSK-9 — Wizard step 2: remaining hotel profile persisted via the config path | FR-DSK-8 (fields and validation, PR #442; flow LLD node J1–J4, PR #443) | Parity: `UpdateHotelConfig` guards `services/admin/src/server.test.ts:148` (persist; values round trip `:155`–`:165`), `:170` (blank name refused), `:180` (front-desk `FORBIDDEN`), `:189`–`:245` (stay-times/wording save with read-back) + `services/admin/src/pgstore.test.ts:103` (timezone write with actor in audit) + **D10 new** (step-2 view assertions: optional contacts verbatim, blank timezone refused, bad retention floor refused, back keeps values, nothing persisted on failure) | Baseline green; D10 pending the #438 steps 2–4 screen PR |
| AC-DSK-10 — Wizard step 3: rooms and room types persisted via the seed path | FR-DSK-9 (fields and validation, PR #442; flow LLD node J5–J8, PR #443) | Parity: `UpsertRoomType` / `UpsertRoom` guards `services/rooms/src/server.test.ts:70` (type upsert), `:79` (room upsert), `:109` (second type), `:137`–`:147` (unknown-type `NOT_FOUND`), `:149`–`:202` (owner defines rooms; inventory + availability uptake) + e2e desk-loop rooms step `script/e2e-desk-loop.sh:266` + **D11 new** (step-3 view assertions: blank/unlinked refusals and intra-batch duplicate refusal client-side, each naming the field, inventory/availability/calendar uptake, back keeps values, nothing persisted on failure) | Baseline green; D11 pending the #438 steps 2–4 screen PR |
| AC-DSK-11 — Wizard step 4: first owner account persisted via the admin user path | FR-DSK-10 (fields and validation, PR #442; flow LLD node J9–J12, PR #443) | Parity: `CreateUser` guards `services/admin/src/server.test.ts:122` (create), `:132` (duplicate identity refused), `:283`–`:335` (role validation incl. bad-role), `:337`–`:372` (last-owner guard), `:374`–`:400` (front-desk role change `FORBIDDEN`), `:82`–`:101` (lockout path), `:402`–`:437` (unlock), `:440`–`:486` (unlock refusals), `:536`–`:563` (rotation round trip), `:614`–`:647` (rotation audit) + `services/admin/src/pgstore.ts:209`–`:210` (empty secret refused, code-enforced) and `:204`–`:205` (front-desk `CreateUser` `FORBIDDEN`, code-enforced) + **D12 new** (step-4 view assertions: blank/taken/empty-secret refusals naming the field, fixed owner role, working owner sign-in, completion to the desk, wizard never shows again, back keeps values, no account created on failure) | Baseline green; D12 pending the #438 steps 2–4 screen PR |

## 5. Exit criteria for the rollout testing slice

1. Every section 2 parity guard still passes (updated where
   markup changed, none deleted without replacement).
2. Guards D1–D12 exist and pass (section 3); the `app/` unit
   suite is green on every screen PR.
3. `catalogue-coverage-check.sh` is green on every screen PR,
   including the new `desk.rooms.*`, `desk.onboarding.*`,
   `stay.checkin.*`, and `desk.empty.*` keys in both locales
   with placeholders intact.
4. Served-print assertions hold (D8 plus the unchanged
   `FR-BIL-4` backend exact-match guards): zero
   print-output differences attributable to the rollout.
5. No matrix MVP row flipped to TBD; the 57/57 MVP count
   stands; all 11 rollout-slice matrix rows map with their
   D-guards landed.
6. Each screen checks against its design file card by card
   (issue-body criterion); the check is recorded on the
   per-screen sub-issue (#420–#425) and, for wizard steps
   2–4, on #438.
7. Open failures are filed with `AC-DSK-*` / `FR-DSK-*` /
   `NFR-DSK-*` ids, and results are recorded in the
   consolidated `docs/testing/test-report.md` (exists; no new
   run-log file is promised here — the QA execution slice
   creates it, not this spec).

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-580
