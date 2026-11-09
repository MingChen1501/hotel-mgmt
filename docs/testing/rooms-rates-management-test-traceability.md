# Rooms and rates management test traceability (Refs #590)

Status: active. Testing spec for the #590 rooms and rates management
desk screen, owned by `qa-lead`. It maps every done-condition of the
change — `AC-MANAGE-1..11`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 13](../product/acceptance-criteria.md) —
and every behaviour-scoped requirement — `FR-MGMT-1..12`, owned by
`business-analyst` in `docs/requirements/mvp-requirements.md`
[section 20](../requirements/mvp-requirements.md) — to its guard: the
parity guards that already exist on disk, cited `file:line` and
verified at this head, plus the new guards `M1`–`M10` and the
per-section evidence rule `MR-1` that the four section PRs must
create or satisfy. No row here marks a guard complete before that
guard exists and passes.

Companion specs: the T2 scope, UI contract, and plain-words states in
`docs/product/rooms-rates-management.md` (owned by `product-owner`,
sections 9, 10, and 15); the approved design board
`docs/design/RoomsRates.dc.md` (sections 4–7 wireframes, section 7.4
the no-price empty state); the per-flow implementation diagrams and
the G1–G6 decisions in `docs/architecture/lld.md` [section 19](../architecture/lld.md)
(owned by `architect`); the domain rule `BR-44` and the Nightly price
data-dictionary entry (`docs/requirements/business-rules.md`). This
spec implements no screen, adds no catalogue key, and changes no
product code.

Handoff note: the product spec (section 14) and the requirements
section 20.5 asked `qa-lead` for the test plan and traceability slice
over `AC-MANAGE-6..10` plus the per-section evidence rule, naming the
guards for the per-night write, the partial-failure resume, the floor
move, the room-type create/edit, and the refusal path. This document
delivers that for those five conditions and, because the matrix is
the owner's coverage surface, completes the map for `AC-MANAGE-1..11`
as well. The five guards the handoff names are `M3` (room-type
create/edit), `M5` (floor move with read-back), `M7` (per-night range
write), `M8` (partial-failure resume plus the explicit plan creation),
and `M10` (refusal path); the evidence rule is `MR-1`.

## 1. Scope and no-change statements

- Tier T2 reader-visible surface. The screen adds no MVP capability:
  it drives seven operations that already exist
  (`ListRoomTypes`, `UpsertRoomType`, `UpsertRoom`,
  `ListRoomsByState` in `services/rooms`;
  `UpsertRatePlan`, `UpsertRatePrice`, `QuotePrice` in
  `services/rates`), so the 57-row MVP coverage count in
  `traceability-matrix.md` stands unchanged and no MVP row may cite
  this slice as its guard. The slice rows live in
  `traceability-matrix.md` section 11.
- Operations, contracts, schemas, events, and stored values are
  untouched: no new operation, field, error code, state value, or
  table. The contract fixtures the parity guards already use
  (`contracts/http/ListRoomTypes.json`, `UpsertRoomType.json`,
  `UpsertRoom.json`, `ListRoomsByState.json`,
  `UpsertRatePlan.json`, `UpsertRatePrice.json`,
  `QuotePrice.json`) stay as they are, and the LC contract-check
  stage keeps running unchanged — this slice adds no seam, so it
  adds no new LC row.
- Refusal conditions stay untouched: `NOT_FOUND` for an unknown rate
  plan and an unknown room type, `VALIDATION_FAILED` for a bad field,
  `UNAUTHENTICATED` for an expired session, and the quote reasons
  `no_rate_price` / `no_rate_plan` fire on exactly the same
  conditions as today. The screen only maps them to plain sentences.
- The #589 booking-refusal wording is reused, not reworded: the
  management empty state reads the existing
  `desk.book.room_type_not_operational` /
  `desk.book.room_type_not_operational_short` keys
  (`messages/en.json:424-425`, `messages/vi.json:424-425`), and this
  slice adds no second phrase for the same condition.
- Guards are extended, never deleted. The route set, the shell nav
  arrays, and the per-screen title case grow by one entry
  (`app/src/router.test.ts:19-34`,
  `app/src/shell-restyle.test.ts:25-26`,
  `app/src/shell-titles.test.ts:31-54`); every existing assertion in
  them keeps its meaning.
- Zero new design tokens: `app/src/theme/tokens.ts` is untouched, and
  the DOM-vs-design gate (`app/e2e/design-facts.spec.ts`) stays green
  under the app-only nav-tab allowance recorded in
  `docs/technical/desk-ui-fact-schema.md` section 8.
- Catalogue rule holds (`NFR-DSK-1`, `NFR-I18N-1`): each section PR
  adds only its own keys, in both `messages/en.json` and
  `messages/vi.json`, with placeholders intact, and
  `script/catalogue-coverage-check.sh` stays green including its
  eight byte-identical runtime mirrors (for example
  `services/rooms/src/messages.en.json`,
  `services/rates/internal/messages/en.json`).
- Out of scope for testing here: any new pricing semantic (seasons,
  derived or child rates, occupancy pricing, plan defaults, tax
  math), any delete or rename operation, clearing a floor back to
  un-filed, server-side role enforcement (G6), the seed data and
  install path, and the booking-refusal wording itself (#589). A
  section PR that drifts into one of those fails review rather than
  extending this plan.
- The screen is the seventh desk surface but is not added to
  `manual-qa-testsuite.md` (that suite is written per screen for the
  six-screen desk rollout). The owner-verification surface for this
  change is section 5 of this document plus the VI/EN screenshots
  each section PR carries under `MR-1`.

## 2. Parity guards on disk (section PRs extend, never delete)

Every citation below was read at this head. Each row names what the
management screen must keep working.

| Surface | Existing guard (`file:line`, verified) | What must stay true |
|---|---|---|
| Route set | `app/src/router.test.ts:19-34` asserts the nine routes and their names | The tenth route (`manage`) is added to the same assertion with a note; no route is removed or renamed, and the placeholder catch-all keeps its behaviour |
| Shell nav | `app/src/App.vue:261-269` (`NAV_ITEMS`), `app/src/shell-restyle.test.ts:25-26` (`EN_NAV` / `VI_NAV`), `:202-220` (active pill per destination), `:223-244` (whole-shell locale switch) | The `manage` tab sits after `Rooms` in both arrays with `Quản lý` / `Manage`; the active pill and the locale switch keep working for every other destination |
| Document title | `app/src/shell-titles.test.ts:31-54` (per-screen titles on navigation) | One new case names `desk.shell.doc_title_manage`; every existing title case is unchanged |
| Shared room-type read | `services/rooms/src/server.test.ts:105-127` (list with names, stable order), `:129-135` (empty list) | `ListRoomTypes` keeps its name order and its empty answer, which is what makes a type created on this screen appear on Book |
| Room-type write | `services/rooms/src/server.test.ts:68-103` (type plus room plus sellability), `:137-147` (unknown type `NOT_FOUND`), `services/rooms/src/pgstore.ts:138-192` (upsert keyed by name, `:157` merges features when absent), `services/rooms/src/store.ts:217-235` | `UpsertRoomType` keeps its key, its feature-preserving merge, and its only capacity floor (minimum 1) |
| Room write and floor | `services/rooms/src/server.test.ts:149-202` (owner defines rooms; inventory plus availability uptake), `:241-269` (stored floor in inventory rows), `services/rooms/src/pgstore.ts:194-263` (`:213` `COALESCE($3, floor)`), `services/rooms/src/store.ts:237-260` (`:246` keeps a stored floor, `:255` keeps a stored state), `services/rooms/src/server.ts:112-124` (a room with no floor omits the member) | `UpsertRoom` stays keyed by number; an absent `floor` keeps the stored value, an empty string would store an empty label, and a setup write never transitions a room's state |
| Floor grouping precedent | `app/src/views/RoomsView.vue:460-495` (floor groups plus the unknown-floor group), `app/src/views/RoomsView.vue:601-613` (`ListRoomTypes` read for type names), `app/src/views/RoomsView.test.ts:495-521` (floor grouping case) | The management list groups by the same floor keys and uses the same `desk.rooms.floor_title` / `desk.rooms.floor_unknown` wording |
| First-run write precedent | `app/src/views/OnboardingView.vue:913-940` (type writes `:921`, room writes `:935`, blank floor omitted `:928-933`), `app/src/App.vue:308-330` and `app/src/onboardingGate.ts:25-38` (wizard launches on an unconfigured database only), `app/src/views/OnboardingView.test.ts:348-356`, `app/src/onboarding-restyle.test.ts:133-141` | The wizard keeps working on a fresh database; the blank-floor payload rule the management screen follows is the one already proven here |
| Nightly price write | `services/rates/internal/store/store.go:179-195` (`:189` unknown plan `NOT_FOUND` with `ratePlanName`), `services/rates/internal/store/postgres.go:115-145` (`:134-135` `ON CONFLICT (rate_plan_id, room_type_id, night_date)`), `services/rates/internal/handler/handler.go:140-167` (route and field validation), `services/rates/internal/store/postgres_test.go:56-82` (two nights write two `rate_prices` rows and the quote follows) | One `UpsertRatePrice` call writes exactly one night and an upsert on the same key replaces that night, which is what makes a per-night fan-out safe to repeat |
| Plan write | `services/rates/internal/store/postgres.go:92-95` (a name conflict overwrites the description), `services/rates/internal/handler/handler.go:118-138` (name-only payload is valid) | `UpsertRatePlan` is only ever sent from the explicit create action with the name only |
| Price read | `app/src/views/BookView.vue:498-506` (`no_rate_price` / `no_rate_plan` classifier), `:609` (nightly `formatVnd` call site), `:664-670` (the not-open-for-booking notice), `services/rates/internal/store/store.go:265-274` (`:271` the priced-night refusal with its reason), `app/src/views/BookView.test.ts:999-1058` (not-operational marking) | The management grid classifies a night with the same two reasons and renders the same phrase; `QuotePrice` still refuses a range that contains an unpriced night, which is why the grid reads one night at a time |
| Money and date shapes | `app/src/i18n/index.ts:165-171` (`formatVnd`, integer minor units in, `đ` out) | Prices render in the desk money shape and are sent as integer minor units; night dates travel as ISO |
| Cosmetic role gate precedent | `app/src/views/AdminView.vue:480-483` (`canManage` from the session role), `app/src/views/AdminView.test.ts:465-485` (manager console), `:487-516` (front-desk read-only, zero admin calls), `app/src/stores/session.ts:22` (`SESSION_ROLE_KEY`), `:50-75` (role persisted beside the token) | The management screen decides rendering from the same store value and sends nothing on the read-only path |
| Expiry path | `app/src/api/client.ts:96-110` (`expireSession` plus the single 401 path), `:168-183` (401 branch) | An expired session on this screen clears the token and returns to the gate; no envelope code reaches the screen |
| Browser seed | `app/e2e/desk-flow.ts:135-166` (type, rooms, plan, and nightly prices seeded through the API) | The seed stays a precondition for other browser flows; it is not evidence for this screen performing those writes |
| Design-facts gate | `app/e2e/design-facts.ts:964-971` (`nav.order` comparison), `app/e2e/design-facts.spec.ts:626-645` (expected order over the mapped records), `docs/technical/desk-ui-fact-schema.md` section 8 (app-only nav-tab allowance) | Only the allowance entry may diverge from the boards; every other tab, label, token, and active pill still matches |

## 3. New guards M1–M10 and the evidence rule MR-1

No `M` guard exists today; each row names the section PR that must
create it. The implementation split is the product spec's (section
14): (1) route, nav, shell entry, and the read-only refusal path;
(2) room types; (3) rooms and floors; (4) nightly prices and the
no-price empty state. A matrix row is complete only when its guard
exists and passes in `app-build` (component guards) or `browser-e2e`
(browser guards).

| # | Guard to create | Asserts (the case) | Covers | Created by |
|---|---|---|---|---|
| M1 | Route, nav, and title entry | The route set holds ten routes including `manage`; the signed-in shell renders eight tabs with `Quản lý` / `Manage` immediately after `Rooms` in both locales; navigating to `/manage` highlights that tab and sets the document title from `desk.shell.doc_title_manage`; every other route, the sign-in gate, and the print surfaces render as before; the screen title and intro resolve through the catalogue in the active locale | AC-MANAGE-1; FR-MGMT-1 | Section PR 1 |
| M2 | Room-type list and empty state | One row per type with name, guests, and bed type under a heading carrying the count; a missing capacity or bed type renders a muted placeholder and never a guessed value; an empty database renders the empty sentence with the first action and no invented row | AC-MANAGE-2; FR-MGMT-2 | Section PR 2 |
| M3 | Room-type create and edit | A save posts one `UpsertRoomType` carrying `name`, `actor`, and only the filled fields; an existing type's features survive because the body has no `features` member; the name field is read-only while editing and its helper sentence is shown; the card returns to the create state, `ListRoomTypes` re-reads, and the saved row shows the stored values with a success line naming the type; a blank name or a guest count outside `1..20` names the field and sends zero requests | AC-MANAGE-3; FR-MGMT-3 | Section PR 2 |
| M4 | Add or update a room | A save posts one `UpsertRoom` keyed by number with the selected type's name, the actor, and a `floor` member only when the field is non-blank (never `''`); a new room appears in its floor group (or the no-floor group) after the re-read; an existing number updates that room and a second save does not add one; the screen writes no state of its own | AC-MANAGE-4; FR-MGMT-4 | Section PR 3 |
| M5 | Floor move with read-back | Editing a row's floor and saving posts `UpsertRoom` for that number with the typed floor and the row's chosen type, then re-reads `ListRoomTypes` and the five `ListRoomsByState` reads merged by `roomId`; the room renders under the new floor with its state and occupancy unchanged and is not duplicated; a failed state read renders that group unavailable with a plain sentence and a retry while the other groups still render; a blank floor field keeps the stored floor and sends no `floor` member | AC-MANAGE-5; FR-MGMT-5 | Section PR 3 |
| M6 | Per-night price grid read | With a type, a plan name, and a first and last night, the grid renders one column per night with the weekday, the desk date form, and the stored price in the desk money shape; a night with no stored price reads the no-price state and never a carried, defaulted, or zero price; a night whose read failed reads the could-not-read state; a plan that does not exist takes the plan-missing state instead of prices; a longer range pages rather than truncating, and each visible page issues one single-night `QuotePrice` per visible night and none off-page | AC-MANAGE-6 (read half), AC-MANAGE-9 (no-price half); FR-MGMT-6 | Section PR 4 |
| M7 | Per-night range write | One save over an inclusive range posts one `UpsertRatePrice` per night in date order, each carrying the plan name, the room-type uuid from `ListRoomTypes`, the ISO night date, and the amount in integer minor units, and the 1st-to-7th range posts seven calls; a range longer than 31 nights or a last night before the first night is refused in plain words with zero requests; a missing, non-integer, or out-of-range amount names the field and sends nothing; the grid re-reads the saved range and a `QuotePrice` for those dates returns the stored prices; the save action is disabled while a write is in flight and a replayed click starts no second round | AC-MANAGE-6 (write half), AC-MANAGE-8 (in-flight half); FR-MGMT-7 | Section PR 4 |
| M8 | Unknown plan, partial save, and resume | A first write refused as an unknown plan shows the plain plan-missing sentence plus the explicit create action and writes no further night; the create action posts exactly one `UpsertRatePlan` with the name only and then retries the nights still pending; declining it creates no plan and writes no night; a failure at any other night stops the loop with the nights already written left written, states saved-of-total, names the first night that did not save, and resumes from that night so no night is written twice or skipped; no plan is created before or as a precaution during a save | AC-MANAGE-7, AC-MANAGE-8; FR-MGMT-8, FR-MGMT-10 | Section PR 4 |
| M9 | No-price empty state | When no visible night has a price, the section renders the not-open-for-booking title and body using the existing `desk.book.room_type_not_operational` keys (no second phrase), states that a price is needed for those dates, names the action that opens it, shows no price and no zero, and keeps the pricing form visible and usable inside the state | AC-MANAGE-9; FR-MGMT-9 | Section PR 4 |
| M10 | Refusal path | With a front-desk role, every list still renders, the plain notice states that only the owner or a manager can change the setup, and every create and save action is disabled with the plain refusal sentence; triggering a disabled action sends zero requests; a server refusal renders that same sentence with no envelope code, field name, or status number; a 401 follows the existing expire-to-gate path; with an owner or manager role the same screen renders its actions enabled and issues no refusal copy | AC-MANAGE-10; FR-MGMT-11 | Section PR 1 |
| MR-1 | Per-section evidence rule (a review obligation, not a test file) | Each section PR carries the five proofs listed in section 6: its operation exercised end to end with the read-back that proves the stored state, its states asserted in catalogue wording, catalogue parity in both locales, zero new tokens with the design-facts gate green, and VI plus EN screenshots against that section of the board | AC-MANAGE-11; FR-MGMT-12 | Every section PR (1–4) |

## 4. Traceability map (AC-MANAGE and FR-MGMT to guards)

Statuses read at this head: nothing under `app/src` routes to
`/manage` (`app/src/router.test.ts:19-34` pins nine routes), no
`app/src/views/ManageView.vue` exists, and nothing under `app/src`
calls `/v1/rates/UpsertRatePrice` today (the only callers are the
browser seed at `app/e2e/desk-flow.ts:161-166` and curl). Every row
is therefore **pending** its section PR; the parity column names what
must survive it.

| Item | Guard type | Guard and status |
|---|---|---|
| `AC-MANAGE-1` — one tab after `Rooms`, route `/app/manage`, unchanged shared shell, title and intro in both locales | Presentational route and shell check | Parity: `app/src/router.test.ts:19-34`, `app/src/App.vue:261-269`, `app/src/shell-restyle.test.ts:25-26,202-220,223-244`, `app/src/shell-titles.test.ts:31-54`. New: `M1`. Pending section PR 1 |
| `AC-MANAGE-2` — room-type list with count heading, muted placeholders, empty sentence | Presentational list check | Parity: `services/rooms/src/server.test.ts:105-127,129-135`. New: `M2`. Pending section PR 2 |
| `AC-MANAGE-3` — create or edit a type through `UpsertRoomType`, features preserved, re-read, locked name, invalid input sends nothing | Behaviour check with a zero-request validation half | Parity: `services/rooms/src/server.test.ts:68-103`, `services/rooms/src/pgstore.ts:138-192`, `services/rooms/src/store.ts:217-235`. New: `M3`. Pending section PR 2 |
| `AC-MANAGE-4` — add a room through `UpsertRoom`, keyed by number, grouped under its floor, state assigned by the service | Behaviour check with payload and read-back halves | Parity: `services/rooms/src/server.test.ts:149-202,241-269`, `services/rooms/src/pgstore.ts:213`, `services/rooms/src/store.ts:237-260`, `app/src/views/OnboardingView.vue:928-933`. New: `M4`. Pending section PR 3 |
| `AC-MANAGE-5` — a floor move persists through `UpsertRoom` and `ListRoomsByState` reports it with state and occupancy unchanged | Behaviour check with the merged five-read reload | Parity: `services/rooms/src/server.test.ts:241-269`, `app/src/views/RoomsView.vue:460-495`, `app/src/views/RoomsView.test.ts:495-521`. New: `M5`. Pending section PR 3 |
| `AC-MANAGE-6` — a range writes one row per night and the desk can quote the type for those dates | Behaviour check (call count, order, units, quote after) | Parity: `services/rates/internal/store/postgres_test.go:56-82`, `services/rates/internal/handler/handler.go:140-167`, `services/rates/internal/store/store.go:179-195`. New: `M6` (read) and `M7` (write). Pending section PR 4 |
| `AC-MANAGE-7` — an unknown plan surfaces the explicit create action; it posts the name only and retries the pending nights | Behaviour check on the refusal classification and the single plan write | Parity: `services/rates/internal/store/store.go:189`, `services/rates/internal/store/postgres.go:92-95`, `services/rates/internal/handler/handler.go:118-138`. New: `M8`. Pending section PR 4 |
| `AC-MANAGE-8` — a partial save reports saved/total and the first unsaved night; resume starts there | Behaviour check on the stop, the count, and the resume index | Parity: `services/rates/internal/store/postgres.go:134-135` (the upsert key that makes resume safe). New: `M7` (in-flight half) and `M8` (stop and resume halves). Pending section PR 4 |
| `AC-MANAGE-9` — the no-price state says not open for booking, invents no price, keeps the form usable | Presentational state check plus a no-invention assertion | Parity: `app/src/views/BookView.vue:664-670`, `app/src/views/BookView.test.ts:999-1058`, `messages/en.json:424-425`, `messages/vi.json:424-425`. New: `M6` (no-price column) and `M9`. Pending section PR 4 |
| `AC-MANAGE-10` — a front-desk role gets the read-only screen and the plain refusal; a server refusal maps to it | Behaviour check with a zero-write half and a refusal-mapping half | Parity: `app/src/views/AdminView.vue:480-483`, `app/src/views/AdminView.test.ts:465-485,487-516`, `app/src/stores/session.ts:22,50-75`, `app/src/api/client.ts:96-110,168-183`. New: `M10`. Pending section PR 1 |
| `AC-MANAGE-11` — every section PR carries catalogue parity, no new token, operation tests, and section evidence | Review obligation | `MR-1` (section 6): `script/catalogue-coverage-check.sh`, `app/e2e/design-facts.spec.ts`, and the PR's screenshots and read-back evidence. Pending each section PR |
| `FR-MGMT-1` — one management entry inside the shared desk shell | Presentational route and shell check | Parity as `AC-MANAGE-1`. New: `M1`. Pending PR 1 |
| `FR-MGMT-2` — staff can read every room type the property sells | Presentational list check plus the shared-read assertion | Parity: `services/rooms/src/server.test.ts:105-135`. New: `M2`. Pending PR 2 |
| `FR-MGMT-3` — create a type and change an existing type's capacity and bed type | Behaviour check plus validation with zero requests | Parity: `services/rooms/src/server.test.ts:68-103`, `services/rooms/src/pgstore.ts:157`. New: `M3`. Pending PR 2 |
| `FR-MGMT-4` — add a room, or update one by number, with the no-floor-member rule | Behaviour check on the payload and the read-back | Parity: `services/rooms/src/pgstore.ts:213`, `services/rooms/src/store.ts:246,255`. New: `M4`. Pending PR 3 |
| `FR-MGMT-5` — move a room between floors without changing anything else; a failed state read degrades only its group | Behaviour check plus the degraded-read half | Parity: `services/rooms/src/server.ts:112-124`, `services/rooms/src/store.ts:255`. New: `M5`. Pending PR 3 |
| `FR-MGMT-6` — read the stored nightly price of every night in the selected range | Behaviour check per column state plus the paging bound | Parity: `app/src/views/BookView.vue:498-506`, `services/rates/internal/store/store.go:265-274`. New: `M6`. Pending PR 4 |
| `FR-MGMT-7` — one save writes one nightly row per night of an inclusive range | Behaviour check on count, order, units, pre-send refusals, in-flight state, and the quote after | Parity: `services/rates/internal/store/postgres_test.go:56-82`, `services/rates/internal/handler/handler.go:140-167`. New: `M7`. Pending PR 4 |
| `FR-MGMT-8` — an unknown plan is named and created only on an explicit action | Behaviour check on classification, the single name-only plan write, and the retry | Parity: `services/rates/internal/store/store.go:189`, `services/rates/internal/store/postgres.go:92-95`. New: `M8`. Pending PR 4 |
| `FR-MGMT-9` — a type with no price is stated as not open for booking with the action that opens it | Presentational state check with the reuse assertion | Parity: `app/src/views/BookView.vue:664-670`, `messages/en.json:424-425`. New: `M9`. Pending PR 4 |
| `FR-MGMT-10` — a partial save states what was written and resumes where it stopped | Behaviour check on saved-of-total, the named night, and the resume index | Parity: the upsert key at `services/rates/internal/store/postgres.go:134-135`. New: `M8`. Pending PR 4 |
| `FR-MGMT-11` — a non-manager role gets the read-only screen and the refusal in product wording | Behaviour check with zero writes and the refusal mapping | Parity: `app/src/views/AdminView.test.ts:487-516`, `app/src/api/client.ts:96-110`. New: `M10`. Pending PR 1 |
| `FR-MGMT-12` — every state is worded in plain language in both locales | L2 catalogue check plus the state assertions inside `M1`–`M10` | `script/catalogue-coverage-check.sh` (fail-closed, both catalogues plus the eight mirrors) with `MR-1`. Pending each section PR |

## 5. Test cases for owner verification

Each case is human-executable against a running stack, in the order a
manager meets the screen. The precondition column names the hotel
setup; the guard column names the automated case that carries the
same assertion, so an owner check and a CI check never disagree. A
case is marked pass only with the observed result, never by
inspection of the code.

| Id | Precondition | Steps | Expected result | Guard |
|---|---|---|---|---|
| TC-MANAGE-1 | Any seeded hotel, signed in as owner, VI active | Open the desk shell | A `Quản lý` tab sits immediately after `Sơ đồ phòng`; choosing it loads `/app/manage` with the screen title and intro in Vietnamese; the header, locale pill, session control, and every other tab look and behave as before | `M1` |
| TC-MANAGE-2 | Same session, EN switched | Switch the locale on the management screen, then open Print and Book | Every management string, tab label, and document title flips to English with no mixed copy; Print and Book render exactly as before and no print route gains management content | `M1` |
| TC-MANAGE-3 | A property with two or more room types, one of them without a bed type | Open the room-types section | One row per type with name, guests, and bed type; the heading carries the count; the missing bed type shows a muted placeholder, not a guess | `M2` |
| TC-MANAGE-4 | A fresh database with no room type | Open the room-types section | The empty sentence and the first action render; no invented row appears | `M2` |
| TC-MANAGE-5 | A room type that already has features set | Edit that type: change guests to 3, save; reopen it | The type keeps its features, shows 3 guests, and the list shows the new value after the re-read; the success line names the type; no second type appears in the list or on the Book screen | `M3` |
| TC-MANAGE-6 | The room-type form, create state | Enter a blank name, then guests `0`, then guests `21`, saving each time | Each attempt names the field and the correction in plain words and writes nothing; the list keeps its previous values | `M3` |
| TC-MANAGE-7 | At least one room type, no room numbered `305` | Add room `305` with that type, floor `3`, save; open the room map | The room appears under floor 3 on the management list and on the room map with the state the service assigned (vacant and inspected); the success line names `305` | `M4` |
| TC-MANAGE-8 | Room `305` on floor 3 | Change its floor to `4` in its row, save; open the room map; then reopen the room's booking state | The management list shows it under floor 4 and not under floor 3, the room map reports floor 4, and the room's state and current occupancy are unchanged | `M5` |
| TC-MANAGE-9 | A room with no floor | Add a floor to that room and save | The room moves out of the no-floor group into the named floor group; no second room appears | `M5`, `M4` |
| TC-MANAGE-10 | A room type with no price for the coming week, and a rate-plan name nobody has created | Read the prices section for that type and week | The plan-missing state names the missing plan and offers the create action; nothing is written and no plan exists yet | `M8` |
| TC-MANAGE-11 | The same read, with the plan created | Read the week again | One column per night with weekday, `dd/mm` date, and the not-open-for-booking empty state (no price, never `0 đ`), with the pricing form still usable inside it | `M6`, `M9` |
| TC-MANAGE-12 | The pricing form open on that type and week | Enter first night, last night seven nights later, and `1200000`, then save | Seven nightly rows are written in date order; the grid re-reads and shows `1.200.000 đ` on every night; the success line names seven nights and the type; the Book screen can then quote that type for those dates | `M7` |
| TC-MANAGE-13 | The pricing form | Try a range of 32 nights, then a last night before the first, then an amount of `12,5` | Each attempt refuses in plain words naming what to change, and nothing is sent (no new rows, no plan) | `M7` |
| TC-MANAGE-14 | A price set for a week | Change the amount and save the same week again | The same seven rows are replaced, not duplicated; the grid shows the new amount on every night and the quote follows it | `M7` |
| TC-MANAGE-15 | A multi-night save arranged to fail at the fourth night (for example by stopping the rates service after the third) | Save seven nights, then restore service and resume | The screen stops, states three of seven saved, names the fourth night, writes nothing further; resuming writes nights four to seven only, and the grid then shows all seven without a duplicate row | `M8` |
| TC-MANAGE-16 | A seeded hotel, signed in as front desk | Open the management screen and try every action | Every list renders read-only, the plain notice says only the owner or a manager can change the setup, every create and save action is disabled with the plain refusal sentence, and nothing is written | `M10` |
| TC-MANAGE-17 | The same front-desk session; a manager changes the roles on another tab | Trigger a write while the session's role still reads front desk, then let the session expire and retry | The write sends nothing; on the expired session the desk returns to the sign-in gate with the existing expiry notice and no technical code | `M10` |
| TC-MANAGE-18 | Any section change | Review the section PR | It shows its operation exercised with the read-back, its states in catalogue wording, both locales, no new token, the design-facts gate green, and VI plus EN screenshots against that section of `docs/design/RoomsRates.dc.md` | `MR-1` |

## 6. The per-section evidence rule (MR-1)

Every section PR satisfies all six obligations in the same change.
The rule is deliberately per section, because each PR drives one
operation set and must prove that set on its own rather than inherit
proof from a sibling PR.

1. **Operation plus read-back.** The PR exercises the operation it
   drives end to end and shows the read that proves the stored state
   afterwards — `ListRoomTypes` for a type, `ListRoomsByState` for a
   room or a floor move, and `QuotePrice` for a price range. The
   doubling below is the required pairing:

   | Section PR | Drives | Read-back proof | Guard |
   |---|---|---|---|
   | 1 — entry and refusal path | no write | the screen renders read-only with zero requests | `M1`, `M10` |
   | 2 — room types | `UpsertRoomType` | `ListRoomTypes` shows the saved values with features intact | `M2`, `M3` |
   | 3 — rooms and floors | `UpsertRoom` | the five `ListRoomsByState` reads show the room under its new floor with its state unchanged | `M4`, `M5` |
   | 4 — nightly prices | `UpsertRatePrice`, `UpsertRatePlan` on the explicit action | `QuotePrice` per night returns the stored prices, and the Book screen offers the type | `M6`, `M7`, `M8`, `M9` |

2. **States in catalogue wording.** The section's loading, empty, read
   error, validation, refusal, partial-save, and success states are
   asserted with catalogue keys in both locales, per the plain-words
   state table in the product spec (sections 7 and 9).
3. **Catalogue parity.** Only the section's own keys are added, in
   `messages/en.json` and `messages/vi.json`, with placeholders
   matching, and `script/catalogue-coverage-check.sh` is green
   including the eight byte-identical mirrors. The shared
   not-open-for-booking phrase is reused, never re-keyed.
4. **No new design token.** `app/src/theme/tokens.ts` shows no diff,
   and `app/e2e/design-facts.spec.ts` is green with the section's
   facts added under the app-only nav-tab allowance
   (`docs/technical/desk-ui-fact-schema.md` section 8).
5. **Board evidence in both locales.** VI and EN screenshots of the
   section render sit beside the matching board section of
   `docs/design/RoomsRates.dc.md` (section 5 room types, 6 rooms and
   floors, 7 nightly prices and the empty state), and the PR records
   where they live. Screenshots are captured from the served app, not
   assembled.
6. **Browser coverage.** The section adds its browser assertion to the
   `browser-e2e` suite. The seeded writes at
   `app/e2e/desk-flow.ts:135-166` stay a precondition for other
   flows and are never cited as proof that the screen performs them;
   the PR states which seeded write its section can now perform
   through the UI.

## 7. Exit criteria for this slice

The slice exits testing when all of the following hold, matching the
`test-strategy.md` exit criteria with the #590 specifics:

1. All four section PRs have landed with `M1`–`M10` present and
   passing, and no existing guard named in section 2 was deleted or
   weakened.
2. Every `AC-MANAGE-1..11` row in section 4 reads covered, and every
   `FR-MGMT-1..12` row names a passing guard.
3. `MR-1` is satisfied on each of the four PRs, with the VI and EN
   screenshots recorded.
4. `app-build`, `browser-e2e`, the catalogue check, the design-facts
   gate, the contract checkpoint, and the markdown link check are
   green at the merged head.
5. The 57-row MVP coverage count in `traceability-matrix.md` is
   unchanged, and the slice's own coverage line records the
   AC-MANAGE rows.
6. Any open failure is filed as an issue with its `AC-MANAGE` /
   `FR-MGMT` id attached; nothing is waived without owner approval,
   and the `risk-medium` + `owner-review` labels keep the merge bar
   where the issue set it.

Until every item above holds, no `AC-MANAGE` row may be reported as
covered on #590, and no testing document may claim a guard that this
spec names but no PR has created.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-889
