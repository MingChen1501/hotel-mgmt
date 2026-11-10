# Rooms and rates management desk screen (Refs #590)

Status: active. Product-owner spec for the new desk screen where a
manager sets up room types, places rooms on floors, and sets the
nightly price per room type per date (issue #590). Every one of those
operations exists on the API today and none of them is reachable from
the product, so a property cannot price its rooms without curl.

Tier: **T2** (reader-visible UI change: a new route, a new nav entry,
and writes through the existing rooms and rates operations). No schema
change, no new pricing semantics, no booking/quote behaviour change
beyond consuming the prices this screen writes.

Design source: `docs/design/RoomsRates.dc.md`, approved by the owner on
#590 on 2026-11-09. The approval fixes the four decisions this spec
builds on — O-1 a `Quản lý` / `Manage` nav tab after `Rooms`, O-2 three
stacked card groups on one screen, O-3 a single save covers at most 31
nights, O-4 the rate plan is a free-text name that is created only
through the explicit create action on the first unknown-plan reply. The
approval is recorded as D-23 in
`docs/project/decision-log.md`; the team-owned design source itself is
D-22.

The binding Given/When/Then done-conditions live in
`docs/product/acceptance-criteria.md` [section 13](acceptance-criteria.md)
(`AC-MANAGE-1..11`), and section 12 below maps each id to the section
of this spec that carries its detail. FR/NFR wording is owned by
`business-analyst`, the route and shell LLD delta plus the four
implementation flow diagrams and the G2/G6 calls are owned by
`architect`, and guard mapping is owned by `qa-lead` (section 14 lists
each handoff and what it owes).

## 1. Problem and outcome

Owner QA (2026-11-09) found that room types, floors, and nightly prices
are API-only:

- Onboarding step 3 creates room types and rooms with an optional floor
  once, against an empty database, and never again.
- Nothing under `app/src` calls `UpsertRatePlan` or `UpsertRatePrice`.
  To price a room the staff must `POST /v1/rates/UpsertRatePlan` and
  then `POST /v1/rates/UpsertRatePrice` once per night by hand.
- The booking refusal behind #589 ("this room type is not open for
  booking") is a true statement with no in-product way to make it
  false.

Outcome of this screen: a manager opens one screen, creates or edits a
room type, moves a room between floors, and prices a room type across a
date range — one nightly price row per night — and the front desk can
then quote it. The no-price state stops being a dead end: it names the
missing price and carries the action that fixes it.

## 2. Scope in / out

In:

- One new screen at `/app/manage` (route `manage`,
  `app/src/views/ManageView.vue`) with three stacked card groups in
  setup order: (A) room types, (B) rooms and floors, (C) nightly
  prices.
- Section A: list every room type, edit capacity and bed type, create a
  new type.
- Section B: add a room, change a room's type, move a room to another
  floor, and read the rooms grouped by floor.
- Section C: read the stored price per night for a room type and a date
  range, write the same price to every night of an inclusive range
  (one row per night), name the rate plan, and create the plan through
  the explicit create action when it does not exist yet (O-4).
- The no-price empty state, worded with #589's "not open for booking"
  vocabulary.
- The refusal path for a signed-in front-desk role: the same screen,
  read-only, in product wording.
- Loading, empty, error, validation, refusal, partial-save, and success
  states in plain words (section 9).

Out:

- New pricing semantics: seasons, child or derived rates,
  occupancy-based pricing, plan-level defaults, tax or fee math. The
  screen edits the existing per-night price records only.
- Deleting room types, rooms, rate plans, or prices — no operation
  exists, so the screen offers none.
- Renaming a room type or a room number in place (both operations are
  keyed by the name/number; see section 14, G1 and G3).
- Clearing a floor back to "unfiled" (section 14, G5).
- Seed data, the install path, and the booking-refusal wording itself
  (tracked with #589).
- Server-side role enforcement: this screen's refusal is a product
  surface rule on top of today's token-only operations (section 14,
  G6).
- Print output: nothing on this screen is guest-facing.

## 3. Entry, layout, and ordering

- **Route and title.** Path `/manage`, route name `manage`, view
  `app/src/views/ManageView.vue`, document title from
  `desk.shell.doc_title_manage`. Served under the existing `/app/`
  history base, so the URL is `/app/manage`.
- **Nav.** One new tab after `Rooms`, labelled
  `desk.shell.nav_manage` (`Quản lý` / `Manage`) — O-1. The shared
  shell's shrink rule is unchanged: the brand stays the only
  shrinkable item and the short label keeps eight tabs inside the
  `1200px` content width.
- **Order.** Section order is the setup order: types, then rooms and
  floors, then prices. A manager therefore never lands on "no room
  types" while trying to price one.
- **Shell.** The shared shell (header, locale pill, session control,
  sign-in gate, content column) is unchanged and this screen adds no
  print route.
- **Layout.** Wireframes: design board sections 4 to 7. Section A is a
  list card (`1.4fr`) beside a create/edit card (`1fr`); section B is an
  add-room card above a floor-grouped list card; section C is a control
  row, a per-night grid, and a range-entry row. Cards, rows, buttons,
  inputs, selects, and status chips follow the existing token set — the
  screen adds none.

## 4. Section A — room types

- **List.** One row per type: name (ink `600`), capacity and bed type
  in muted text, and an edit action per row. The heading carries the
  count. A missing capacity or bed type renders `—`, never a guessed
  value.
- **Create.** Name (required), guests (optional, integer `1..20`), bed
  type (optional, catalogue-led select). Saving posts
  `UpsertRoomType` with the values the manager filled and the actor.
  Features are never sent, so an existing type's features are
  preserved by the service.
- **Edit.** The same card, pre-filled. The name is read-only while
  editing, with the helper that a different name would create a second
  type (G1). Editing may change capacity, bed type, or both.
- **Read-back.** After a save the card returns to the create state, the
  list re-reads `ListRoomTypes`, and the saved row is visible with the
  new values. The success line names the type.
- **Shared read.** `ListRoomTypes` is also what the Book screen reads,
  so a type created or edited here is quotable and bookable there
  without any further step.
- **Empty state.** Plain sentence with the first action, no fake rows.

## 5. Section B — rooms and floors

- **Add room.** Room number (required), room type (required, select
  fed by `ListRoomTypes`), floor (optional text), bed type (optional),
  guests (optional). Saving posts `UpsertRoom` with the number, the
  selected type's name, the floor when filled, and the actor. The
  operation is keyed by room number, so an existing number is an update
  and the screen says so.
- **New rooms are normal rooms.** The service creates them in a
  bookable vacant-inspected state; the screen never invents a state and
  never writes one.
- **Floor grouping.** Rooms are grouped per floor label as returned,
  plus a final "no floor yet" group for rooms with an empty floor,
  reusing the Rooms map's floor keys. Each row shows the number, the
  current type, a floor field pre-filled with the current floor, a type
  select pre-filled with the current type, and a save action.
- **Floor move.** Saving a row posts `UpsertRoom` for that number with
  the typed floor, the chosen type, and the actor; the list then
  re-reads `ListRoomsByState` and the room renders under its new floor.
  Moving a room changes neither its state, its occupancy, nor its
  history — the service preserves state on update — and the Rooms map
  reports the new floor on its own load.
- **Reading the rooms.** There is no "list all rooms" operation: the
  screen merges the five `ListRoomsByState` reads (occupied,
  vacant-dirty, vacant-clean, vacant-inspected, out-of-order) by
  `roomId`, keeping each response's floor. A failed read of one state
  renders that group explicitly unavailable; rooms are never silently
  dropped.
- **No clear-floor action in v1.** An absent floor means "keep the
  stored value" and an empty string is stored as an empty floor label,
  so the screen offers moving a room, never un-filing it (G5).
- **Empty state.** Plain sentence with the first action.

## 6. Section C — nightly prices

- **Controls.** Room type (required, select), rate plan (required
  free-text name, remembered per browser as a UI preference only, empty
  on first use with the helper that the plan is created when saved —
  O-4), first night and last night (the app-locale date pickers; the
  range is inclusive of both ends), and an explicit read action.
- **Range cap.** A single save covers at most 31 nights (O-3). The
  last night may not be before the first night; both cases refuse in
  plain words before anything is sent.
- **Grid (read).** One column per night: weekday, `dd/mm`, and the
  stored price in the desk money shape. Longer ranges page seven nights
  at a time. A night with no price row renders "no price"; a night
  whose read failed renders "could not read". A price is never
  invented, carried from a neighbouring night, or shown as zero.
- **How the grid reads.** Today's only price read is a single-night
  `QuotePrice` per night (arrival = the night, departure = the night
  plus one day, plan named explicitly), because a multi-night quote
  fails on the first unpriced night and cannot report the others. The
  grid therefore issues one call per visible night and maps
  `no_rate_price` / `no_rate_plan` to "no price" and an unknown plan to
  the plan-missing state. This is exact and stateless; it is replaced
  by a list operation if the architect adds one (G2).
- **Write.** The price is entered in whole major units (đồng), digits
  only, `0` to `100 000 000`, and converted to integer minor units on
  save. Saving writes one `UpsertRatePrice` row per night, in date
  order, for the selected plan, room type, and night date. The action
  names the night count (`Lưu 7 đêm`) and the helper states how many
  nights will be replaced and how many filled, so the write is
  predictable before the click.
- **Plan creation.** The first write can fail with an unknown rate
  plan. That is the only signal that the plan does not exist, so the
  screen says so and offers the explicit create action; that action
  posts `UpsertRatePlan` with the name only and then retries the
  pending nights. The screen never creates a plan behind the manager's
  back and never calls `UpsertRatePlan` as a precaution — that
  operation overwrites the description on a name conflict.
- **Partial failure.** Writes stop at the first failure. Nights already
  written stay written (the operation is idempotent per plan, type, and
  date). The screen states saved/total and names the first night that
  did not save, and offers to resume from that night — never from the
  start, so nothing is written twice needlessly and no night is
  skipped.
- **Success.** The success line names the night count and the room
  type, and the grid re-reads the saved range so the manager sees the
  stored rows.
- **Repeat-write rule.** The action is disabled while the call is in
  flight and keeps its label with a progress count.

## 7. The no-price empty state

When no visible night has a price row, section C replaces the grid with
a centred, muted, width-limited empty state:

- Title: this room type is not open for booking.
- Body: no price is set for these dates, so the front desk cannot quote
  it; enter a nightly price below to open it.
- The pricing form stays visible and usable inside the empty state, so
  the manager opens the type without leaving the card.

Wording rule: this state reuses #589's vocabulary on purpose. The Book
screen says a type is not open for booking when a night has no price;
this screen is where that becomes false. The two surfaces must not
drift — the Book phrase is the source, and this card points at the
action that satisfies it.

## 8. Refusal path for non-manager roles

- The signed-in role comes from the session store — the same cosmetic
  gate the Admin screen already uses.
- A front-desk account sees the whole screen read-only: every list
  renders, and a muted notice under the intro says that the setup is
  visible here and only the owner or a manager can change it.
- Create and save actions are disabled with one plain sentence: only
  the owner or a manager can change rooms and prices, ask a manager if
  something needs changing. No technical code, no blank card, no
  silent no-op.
- If a write is nevertheless refused by the server, the refusal maps to
  the same sentence. Envelope codes never reach the screen; an expired
  session follows the existing expire-to-gate path.
- This is a product-surface rule, not an enforced permission: the rooms
  and rates operations check the token only today. Server-side role
  enforcement is a separate security slice and is recorded as a
  follow-up (G6), not claimed here.

## 9. States in plain words

| State | Screen behaviour |
|---|---|
| Loading | One line names the region being read; the shell stays visible; repeat calls do not stack. |
| Empty (types) | No room types yet, with the first action. |
| Empty (rooms) | No rooms yet, with the first action. |
| Empty (prices) | Section 7: not open for booking, plus the pricing form. |
| Read error | A plain sentence naming what could not be read plus a retry action; no stack trace, no code, no zero-filled rows. |
| Validation | Names the field and what to change; nothing is sent. |
| Refusal | Section 8 wording, on disabled controls or on a refused save. |
| Partial save | Saved/total, the first night that did not save, and the resume action. |
| Success | Names the object and the count, then shows the re-read state. |

Every state above is in the VI-primary catalogue in both locales; no
state is implied and left unworded.

## 10. UI contract (T2 reader-visible change)

- **Layout shell and navigation scope.** The shared shell is unchanged
  (header, tabs, locale pill, session control, `1200px` content
  column). This change adds exactly one tab and one route; every other
  destination, the sign-in gate, and the print surfaces keep their
  current behaviour. The shell's shrink rule still holds with eight
  tabs: the brand is the only shrinkable item.
- **Component mapping per pattern.** Cards, rows, buttons, inputs,
  selects, and status chips follow the existing token set and the
  standing PrimeVue-as-logic-carrier rule (a component keeps its
  behaviour — focus, keyboard, ARIA, validation state — while its
  visuals come from the design values). Date fields reuse the existing
  app-locale date-picker treatment. No new component pattern is
  introduced.
- **Design-token scope.** Zero new tokens; `app/src/theme/tokens.ts` is
  untouched by this screen. Money renders through the existing formatter
  (integer minor units on the wire), and dates render in the desk form
  (ISO on the wire).
- **States.** Section 9 is the complete state list.
- **Content and locale.** Every visible string is a VI-primary
  catalogue key with EN parity; this spec adds no key, keys land with
  the implementation PRs (one section per PR) and
  `script/catalogue-coverage-check.sh` stays the gate.
- **Print rules.** Not applicable — the screen has no print output, and
  screen styling does not leak into the existing print routes.
- **Accessibility and targets.** Every control keeps the `44px` target
  and the label-above-input pattern the rest of the desk uses.

## 11. Catalogue keys

The design board (section 12 there) carries the proposed key list with
EN and VI copy: `desk.shell.nav_manage`,
`desk.shell.doc_title_manage`, the `desk.manage.*` surface, and reuse of
`desk.rooms.floor_title`, `desk.rooms.floor_unknown`,
`desk.rooms.refresh`, the `desk.admin.role_*` keys, and
`desk.book.room_type_not_operational` for the aligned "not open for
booking" phrase. Keys are proposed, not added, by this spec; each
implementation PR adds only the keys its section needs, in both
catalogues, with placeholders matching.

## 12. Acceptance criteria map (`AC-MANAGE-*`)

The canonical Given/When/Then wording lives in
`docs/product/acceptance-criteria.md` section 13. This table keeps the
id-to-detail link for reviewers.

| Id | One-line intent | Detail in this spec | Issue #590 criterion |
|---|---|---|---|
| `AC-MANAGE-1` | Entry: one tab after `Rooms`, route `/manage`, shared shell unchanged, screen title and intro in both locales | Section 3 | 1 (design link), 8 |
| `AC-MANAGE-2` | Room-type list renders every type with `—` placeholders and the empty sentence on an empty database | Section 4 | 6 |
| `AC-MANAGE-3` | Create or edit a room type persists through `UpsertRoomType`, features preserved, list re-read, name locked while editing, invalid input sends nothing | Section 4 | 6 |
| `AC-MANAGE-4` | Add a room persists through `UpsertRoom`, keyed by number, appears under its floor and on the room map | Section 5 | 6 (room half) |
| `AC-MANAGE-5` | Move a room to another floor persists through `UpsertRoom` and `ListRoomsByState` reports the new floor with state unchanged | Section 5 | 5 |
| `AC-MANAGE-6` | A price range writes one `UpsertRatePrice` row per night in date order, and the desk can quote the type for those dates | Section 6 | 4 |
| `AC-MANAGE-7` | An unknown rate plan surfaces the explicit create action; creating posts `UpsertRatePlan` with the name only and retries the pending nights | Section 6 | 4 |
| `AC-MANAGE-8` | A partial save reports saved/total and the first unsaved night, and the resume action starts at that night | Section 6 | 4, 8 |
| `AC-MANAGE-9` | The no-price state says "not open for booking", invents no price, and keeps the pricing form usable | Section 7 | 1 (empty state), 4 |
| `AC-MANAGE-10` | A front-desk role gets the read-only screen with the plain refusal sentence, and a server refusal maps to the same sentence | Section 8 | 7 |
| `AC-MANAGE-11` | Every implementation PR carries catalogue parity, no new token, operation-level tests, and section evidence against the board | Sections 9, 10, 14 | 8 |

## 13. Acceptance mapping (issue #590)

| Issue criterion | Evidence |
|---|---|
| 1. Wireframes/mocks for the three sections plus the no-price empty state in `docs/design/`, linked from the issue | `docs/design/RoomsRates.dc.md` sections 4 to 7 (wireframes), section 7.4 (empty state); registered in `docs/design/README.md` and `docs/README.md`; linked from #590 |
| 2. Owner records design approval on the issue | Owner decision 2026-11-09 on #590 (O-1 nav tab, O-2 three stacked card groups, O-3 31-night cap, O-4 explicit plan creation); recorded as D-23 in `docs/project/decision-log.md`; the board's status line now reads approved |
| 3. Required specs exist and are `active`, and `spec-reviewer` posts PASS before implementation | This document (`active` in `docs/README.md`), acceptance criteria section 13, and the sibling handoffs in section 14; the verdict is posted on #590 |
| 4. A price for a type over a date range writes one row per night and the desk can quote it | Section 6 (write path, per-night rows, plan creation, partial failure); `AC-MANAGE-6..8` |
| 5. Moving a room to another floor persists and `ListRoomsByState` reports it | Section 5 (row save and reload); `AC-MANAGE-5` |
| 6. Creating or editing a type persists and the Book screen lists it | Section 4 (`ListRoomTypes` is the shared read); `AC-MANAGE-3`, `AC-MANAGE-4` |
| 7. Non-manager refusal path in product wording | Section 8; `AC-MANAGE-10` |
| 8. Implementation lands as small PRs with tests for the operation each drives | Sections 12 and 14 (split and evidence); `AC-MANAGE-11` |

## 14. Handoffs, gaps, and the implementation split

Gaps this spec lives inside, each recorded rather than papered over
(owner: `architect` to confirm or convert into a follow-up):

- **G1 — no rename.** `UpsertRoomType` is keyed by name, so renaming
  would create a second type. The name is locked while editing.
- **G2 — no list operations for plans or prices.** Plans are free text
  plus the explicit create path; prices are read one night at a time
  through `QuotePrice`. Adding `ListRatePlans` / `ListRatePrices` is an
  architect call at the gate; recording them as follow-ups keeps this
  change at T2, adding them now makes it T3.
- **G3 — rooms are listed by state.** Five reads per load, merged, the
  same shape the Rooms map uses.
- **G4 — no deletes.** The screen offers none; an owner request becomes
  a follow-up.
- **G5 — no clear floor.** An absent floor keeps the stored value and
  an empty string is stored as an empty label, so v1 only moves rooms.
- **G6 — client-side role gate only.** Server-side role enforcement is
  a separate security slice; this screen must not claim it.

Handoffs (owners, not this role):

- `business-analyst` — FR/NFR delta for the reader-visible surface:
  the route/nav entry, the per-night range write, the name-lock and
  no-clear-floor limits, and the refusal path, against `FR-RMS-4`,
  `FR-RTE-1`, `FR-ADM-2`, `FR-ADM-3`, and `FR-ADM-4`.
- `architect` — LLD delta for the `manage` route, view, and nav entry;
  a recorded decision on G2 and G6; and one implementation flow diagram
  per touched flow (happy path plus failure/rollback path, with code
  edges) for: the range price write including partial failure and
  resume, the floor move with read-back, the room-type create/edit, and
  the refusal path.
- `qa-lead` — test plan and traceability slice for `AC-MANAGE-6..10`
  plus the per-section evidence rule, naming the guards for the
  per-night write, the partial-failure resume, the floor move, the
  room-type create/edit, and the refusal path.
- `spec-reviewer` — one verdict on the then-current head before any
  implementation PR opens.

Implementation split (one small PR per section, after a gate PASS; the
owner may re-split): (1) route, nav, shell entry, and the read-only
refusal path; (2) room types; (3) rooms and floors; (4) nightly prices
and the no-price empty state. Each PR carries tests for the operation
it drives, screenshots in both locales for its section, catalogue
parity, and the evidence of the read-back its section performs.

## 15. Evidence required on each implementation PR

- The operation the section drives is exercised end to end: create/edit
  a type, add or move a room, or write a nightly range — with the
  read-back that proves the stored state after the write.
- The section's states (loading, empty, read error, validation,
  refusal, partial save where applicable, success) are shown or
  asserted in tests, in catalogue wording.
- Catalogue parity: EN and VI keys for the section, placeholders
  matching, `script/catalogue-coverage-check.sh` green.
- No new design token, and the design-facts gate still green with the
  section's facts added.
- Side-by-side VI and EN screenshots against the approved board
  section for that PR.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-886
