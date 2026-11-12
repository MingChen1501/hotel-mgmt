# Booking management desk view (Refs #648)

Status: active. Product-owner spec for the read-only desk screen where
staff browse the bookings for a chosen date range — who booked which
room type, for which dates, at which quoted price — and open one
booking's read-back detail (issue #648, owner manual QA 2026-11-10).

Tier: **T2** (reader-visible UI change: one new route, one new nav tab,
and a read-only screen over existing contracts). No backend, contract,
schema, catalogue-structure, lifecycle, or print change. The screen
reads only operations that already exist: `QueryCalendar`,
`GetReservation`, `ListRoomTypes`, `ListArrivalsDepartures`, and
`ListRoomsByState`.

Relationship to the MVP: this is the desk surface that `US-RES-5` /
`FR-RES-5` / `AC-RES-5` already promise — staff see reservations across
dates and room types on one screen, and selecting one shows its
reference, guest, and price — and that the product never built. It adds
no MVP capability, no story, and no FR; the date-by-room-type grid half
of `FR-RES-5` stays unimplemented and is recorded as a gap (section 12,
G1) rather than claimed here.

The binding Given/When/Then done-conditions live in
`docs/product/acceptance-criteria.md` [section 17](acceptance-criteria.md)
(`AC-BMV-1..7`), and section 10 below maps each id to the section of
this spec that carries its detail. The condensed desk-rollout delta and
its EN+VI copy table live in
`docs/product/desk-ui-design-rollout.md` [section 6.18](desk-ui-design-rollout.md).
FR/NFR wording is owned by `business-analyst`, the route/nav LLD delta
and the per-flow implementation diagram by `architect`, guard mapping
by `qa-lead`, and the gate verdict by `spec-reviewer` (section 12 lists
each handoff and what it owes).

## 1. Problem and outcome

Owner QA (2026-11-10) found that the desk has no booking-management
view:

- The desk app has screens for the board (`DeskView`), booking creation
  (`BookView`), stay check-in/check-out (`StayView`), rooms and rates
  (`RoomsView`, `ManageView`), folio, print, admin, and first-run setup
  (`app/src/router.ts`). `BookView` creates a booking and shows its
  confirmation; no screen lists existing bookings across dates, so a
  booking is not browsable again after its confirmation.
- The booking itself already carries everything the owner asked for, on
  the wire: `QueryCalendar` returns the bookings overlapping a range
  with their reference, room type, dates, state, and stay link;
  `GetReservation` returns the full record with the guest snapshot and
  the frozen `priceBasis` (`totalMinor`, `discountName`); `ListRoomTypes`
  names the room type; `ListArrivalsDepartures` and `ListRoomsByState`
  resolve the room an in-house guest holds.
- So the data exists and the requirement exists; only the surface is
  missing. Staff answer "who booked which room, for which dates, at
  what price" today only by reading records one reference at a time.

Outcome of this screen: staff open one screen, choose a date range, and
read one row per booking — guest, reference, room type, assigned room
when the guest is in house, arrival, departure, nights, quoted total,
and state — then open a row for the booking's read-back detail. The
view is read-only: it never creates, changes, cancels, checks in, or
checks out anything.

## 2. Scope in / out

In:

- One new screen at `/app/bookings` (route `bookings`, view
  `app/src/views/BookingsView.vue`, test hook `bookings-view`).
- One new nav tab after `Book`, labelled `Sổ đặt phòng` / `Bookings`
  (section 3).
- A date-range filter (first night and last night, inclusive) with an
  explicit apply action and an app-locale date picker per field.
- One row per booking staying at least one night in the chosen range,
  carrying guest name, booking reference, room type, assigned room when
  the guest is in house, arrival, departure, nights, quoted total, and
  state; the row is ordered and capped as section 5 states.
- A row detail card read back fresh from `GetReservation` (section 6).
- The plain-words loading, empty, read-error, partial-row,
  partial-column, and detail-error states (section 7).
- Catalogue-backed EN+VI copy for every new label and message (section
  9), and the design-facts assertion for the new app-only tab (section
  8).

Out:

- Editing, modifying, or cancelling a booking, and marking a no-show —
  `ModifyReservation`, `CancelReservation`, and `MarkNoShow` exist and
  are a different flow; this view offers no write action of any kind.
- Check-in, check-out, room assignment, or room moves — the Stay screen
  owns those.
- A new backend endpoint or any contract change, including a list
  operation that would return guest and total in one read (section 12,
  G2).
- A date-by-room-type calendar grid, a state/room-type filter, column
  sorting, paging controls, export, or reporting output.
- Print output: nothing on this screen is guest-facing.
- Changes to the board, the Stay, Book, Folio, or Rooms screens.
- Role-based refusal: the screen is read-only, so every signed-in hotel
  role sees the same view (section 8).

## 3. Entry, layout, and ordering

- **Route and title.** Path `/bookings`, route name `bookings`, view
  `app/src/views/BookingsView.vue`, document title from
  `desk.shell.doc_title_bookings`. Served under the existing `/app/`
  history base, so the URL is `/app/bookings`.
- **Nav.** One new tab immediately after `Book`, labelled
  `desk.shell.nav_bookings` (`Sổ đặt phòng` / `Bookings`). It groups
  booking creation (`Book`) with booking browsing, and leaves the
  operational chain `Stay` -> `Folio` uninterrupted. The tab is
  app-only: the owner-supplied v2 boards do not draw it (section 8).
- **Nine tabs and width.** The nine-tab row keeps the brand-only
  shrink rule: the brand stays the only shrinkable item, the locale
  pill and the session control keep their size, and no tab ever
  shrinks, truncates, or wraps its label — every tab keeps its label,
  height, `44px` target, `8px` radius, and ink (the narrow-band spacing
  below adjusts padding and gap only). The new label is the short noun
  form (`Sổ đặt phòng` / `Bookings`) so the row fits the `1200px`
  content width.
- **Narrow-width nav spacing (owner decision, #648).** From a `1280px`
  viewport and wider the nav renders the design values exactly — `8px`
  inter-tab gap and `10px 16px` tab padding. Below a `1280px` viewport
  (`@media screen and (max-width: 1279px)` in `app/src/App.vue`) the
  shell tightens that spacing instead of shortening the label: the
  inter-tab gap goes `8px` -> `4px` and each tab's side padding
  `10px 16px` -> `10px 12px`, which returns `8px` of width per tab to
  the row. Everything else is unchanged in that band: the tab label,
  the `10px` vertical padding, the `44px` minimum height, the `8px`
  radius, the active-tab inversion, the locale pill, the session
  control, and the brand-only shrink rule. This is the only shell value
  that departs from the boards, it is deliberate, it is limited to the
  sub-`1280px` band (which includes the `1200px` desk-kiosk viewport
  the owner measured), and the boards stay read-only: the divergence is
  recorded here and in
  [the restyle spec](desk-ui-pixel-faithful-restyle.md) (section 4,
  "Narrow-width nav overrides"), with the decision recorded as D-29 in
  `docs/project/decision-log.md`. The alternative — a shorter tab label
  — stays reserved to the owner and was declined for this change.
- **Width evidence.** The first implementation PR carries the
  nine-tab-row evidence in both locales: the `1200px` band (the design
  column) and the narrow band either side of the breakpoint
  (`1279px` and `1280px`), so a reader can see that the row fits, that
  nothing truncates or wraps, and that the design values return at and
  above `1280px`. The shell guard `app/src/shell-restyle.test.ts` pins
  both the base design rules and the narrow block, so a future
  breakpoint or value change fails the guard instead of the render.
- **Overflow rule.** If a measured row still overflows, the owner
  decides between a shorter label and a further shell rule change — the
  tab never silently truncates or wraps.
- **Shell.** The shared shell (teal header, tabs, locale pill, session
  control, sign-in gate, content column) is unchanged, and this screen
  adds no print route.
- **Layout, top to bottom.**
  1. Screen title (`desk.bookings.title`) and one intro line stating
     that the view is read-only (`desk.bookings.intro`).
  2. A filter card: first night, last night (app-locale date pickers),
     and the apply action (`desk.bookings.show`), with one helper line
     stating that the list holds bookings staying at least one night in
     the range (`desk.bookings.range_hint`).
  3. A list card: one static column-header row, then one booking row
     per booking, in the order section 5 fixes.
  4. A detail card, present only after a row is chosen (section 6).
  Cards, rows, chips, and controls reuse the existing token set and the
  existing component patterns; this screen introduces no new pattern.
- **Order.** The filter comes before the list because the range is the
  screen's only input; the detail sits below the list because it
  depends on the selected row and must never replace the list.
- **No landing empty screen.** The screen reads the default range on
  entry, so staff land on a list (or the empty sentence), never on a
  blank page waiting for input.

## 4. The date-range filter

- **Fields.** `First night` and `Last night` (`desk.bookings.range_from`,
  `desk.bookings.range_to`), both required, both the app-localized
  date-picker treatment the Book screen uses (Refs #581, D-18). Dates
  on the wire stay ISO `YYYY-MM-DD`; the picker renders the desk form.
- **Default.** On entry the range is the business date through six
  nights after it — seven nights, the desk's working week — anchored on
  the same local business date the desk board derives
  (`localBusinessDate()`,
  `app/src/views/DeskView.vue:531-535`).
- **Contract mapping.** The range is inclusive of both nights in
  product words. `QueryCalendar` compares `arrival < dateTo` and
  `departure > dateFrom`
  (`services/reservations/internal/store/store.go:191-193`,
  `services/reservations/internal/store/postgres.go:311-321`), so the
  screen sends `dateFrom` = first night and `dateTo` = last night plus
  one day. A booking staying the night of `Last night` is therefore
  listed, and a booking that departs on `First night` is not.
- **Apply.** One explicit action re-reads the list; the screen does not
  re-query on every keystroke. While a read is running the action and
  both fields are disabled, and a second click is a no-op.
- **Validation.** A last night before the first night, or a missing
  field, names the field in plain words and sends nothing
  (`desk.bookings.range_invalid`); no request is issued for an invalid
  range.
- **No range-length cap.** The range may span any number of nights; the
  row cap in section 5 bounds the reads instead.
- **Applying a new range clears the selection.** A detail read back for
  a row that the new range no longer lists would contradict the list,
  so the selection and the detail card clear on every list read.

## 5. Booking rows

- **What one row carries.** Guest name, booking reference, room type,
  assigned room (when the guest is in house, otherwise `—`), arrival
  date, departure date, nights, quoted total, and state
  (`AC-BMV-2`). The reference renders in the muted ink under the guest
  name, so the widest value does not drive the row height.
- **How the row is built from existing reads.**
  - `QueryCalendar(dateFrom, dateTo)` gives one entry per booking
    overlapping the range: reference, room type id, arrival, departure,
    state, and the stay id when the booking is checked in.
  - `GetReservation(reference)` per listed booking gives the guest
    snapshot (`guest.fullName`) and the frozen price basis
    (`priceBasis.totalMinor`, `priceBasis.discountName`); the total is
    rendered through `formatVnd` (Refs #565, D-16).
  - `ListRoomTypes` maps the room type id to its name.
  - `ListArrivalsDepartures(businessDate)` gives the in-house stays
    (`stayId` -> `roomId`), and `ListRoomsByState("occupied")` gives
    `roomId` -> room number. Together they resolve the assigned room
    for a `checked-in` row.
  - Nights are the whole-day difference between departure and arrival,
    rendered as a plain count.
- **Assigned room rules.** A `confirmed` booking holds a room type, not
  a room (a booking carries no room number; assignment is the desk's
  room-state write, Refs #647), so its assigned-room cell reads `—`. A
  `checked-in` row whose stay is not in the in-house list, or whose
  room is not in the occupied list, also reads `—`: the screen never
  guesses a room. A `closed` booking reads `—` as well, because the
  room a departed guest held is not exposed by any list read (G4).
- **State wording.** The state renders as a chip naming the state in
  catalogue words: booked, in house, checked out, cancelled, no-show,
  and an unknown-state fallback that never prints a raw code. The chip
  uses the existing neutral chip surface and border; no new colour
  token is introduced. A `cancelled` or `no-show` row renders its value
  text in the muted ink so it reads as inactive at a glance.
- **Ordering.** Rows sort by arrival date ascending, then by booking
  reference ascending. The order is computed on the screen because
  neither calendar read guarantees one (the in-memory store iterates a
  map, `services/reservations/internal/store/store.go:274-291`, and the
  Postgres read carries no `ORDER BY`,
  `services/reservations/internal/store/postgres.go:311-321`).
- **Cap.** One list read renders at most 50 bookings. When the range
  holds more, the earliest 50 (by the order above) render and one
  plain sentence states the count and asks staff to narrow the dates
  (`desk.bookings.capped`, `{count}`). The cap bounds the per-row
  `GetReservation` fan-out; it is not pagination, and there is no next
  page in v1 (G3).
- **Every state is listed.** The calendar read returns bookings in every
  state, and the register lists them all — a completed or cancelled
  booking in the range is history the desk must still read. There is no
  state filter in v1.
- **Row interaction.** The guest name is the row's action: a link-styled
  button (44px target) that opens the detail, so keyboard and
  screen-reader users have one obvious control per row; a pointer click
  anywhere else on the row performs the same action. The selected row
  keeps a visible marker: a 3px inset left rule in the primary accent
  and its guest name in the ink weight, both from the existing tokens.
- **Not a phantom list.** A booking is never dropped silently: a row
  whose per-row read failed renders the fields it does have and says so
  (section 7).

## 6. Row detail

- **Trigger.** Choosing a row reads `GetReservation(reference)` fresh
  and renders the detail card under the list. The read is always fresh:
  the booking may have changed since the list read, and the read-back is
  authoritative over the row it came from.
- **Contents.** Reference, guest name, room type, assigned room (the
  same in-house/occupied resolution as the row, otherwise `—`), arrival,
  departure, nights, quoted total, the recorded discount name when the
  price basis carries one, and the state chip (`AC-BMV-5`).
- **Read-back, not re-derivation.** The detail shows the record the
  operation returned. It does not recalculate the total, reprice the
  stay, or re-derive a state from the dates.
- **Selection.** Choosing another row replaces the detail; applying a
  new range clears it. The detail card is absent until a selection, so
  the screen never fakes an empty booking.
- **Read-only.** The detail carries no action: no edit, cancel, no-show,
  check-in, or check-out control, and no link into an edit flow.

## 7. States in plain words

| State | Screen behaviour |
|---|---|
| Loading (list) | One line names the screen being read (`desk.bookings.loading`); the shell stays visible; the filter is disabled and a repeat apply is a no-op. |
| Empty | No booking stays in the range: one muted sentence names the range in the desk date form (`desk.bookings.empty`, `{from}`, `{to}`) and no row is invented. |
| Read error (list) | One plain sentence names what could not be read with a retry action (`desk.bookings.read_failed`, `desk.bookings.retry`); no stack trace, no code, no zero-filled rows, and the rest of the desk stays usable. |
| Partial row | A row whose `GetReservation` read failed keeps its calendar fields, shows `desk.bookings.cell_unreadable` in the guest-name and total cells, and is counted in one notice above the list (`desk.bookings.row_partial`, `{count}`). |
| Partial column | A failed `ListRoomTypes`, `ListArrivalsDepartures`, or occupied-room read leaves the affected cells reading `desk.bookings.cell_unreadable` and puts one plain sentence naming that column in the notice above the list (`desk.bookings.column_partial`, `{column}` — the heading of the failed read's column: `desk.bookings.col_room_type` or `desk.bookings.col_room`); every other cell still renders. |
| Detail error | One sentence names the booking that could not be read with a retry action (`desk.bookings.detail_failed`, `{ref}`); the list stays as it was and the previous detail is not kept as if it were current. |
| Refusal | Not applicable: the view performs no write, so it refuses nothing. |

Retry follows the failure class, as the LLD's failure table fixes it. The
list read and the detail read each carry one retry action
(`desk.bookings.retry`). The per-row and shared-map classes carry none:
their rows stay, the notice above the list counts the incomplete rows
(`desk.bookings.row_partial`) and names the failed column
(`desk.bookings.column_partial`), and re-applying the range is the
retry.

Every state above — both partial classes included — maps to a
VI-primary catalogue key in both locales; no state is implied and left
unworded.

## 8. UI contract (T2 reader-visible change)

- **Layout shell and navigation scope.** The shared shell is unchanged
  (teal header, tabs, locale pill, session control, `1200px` content
  column, sign-in gate). This change adds exactly one tab and one
  route; every other destination, the sign-in gate, and the print
  surfaces keep their current behaviour. The nine-tab row keeps the
  brand-only shrink rule (section 3), and it carries the decided
  narrow-width spacing below a `1280px` viewport (section 3), which is
  the only shell value this change touches.
- **Design source and boards.** The owner-supplied v2 boards are
  authoritative for the desk (`docs/design/README.md`) and none of them
  draws this screen. The screen therefore composes the board
  vocabulary it already uses: the shell and tokens of the tabbed
  boards, the card-and-row pattern of the board lists, the state-chip
  shape of the room map, and the app-locale date-picker treatment of
  the Book screen. No design board is edited, and no new board file is
  created; the owner reviews the built screen against the boards
  (`owner-review`), exactly as `AC-BMV-7` states.
- **Component mapping per pattern.** One filter card (two date pickers,
  one button, one helper line), one list card (a static header row plus
  one row per booking, the guest name as the row action), and one
  detail card (label/value lines plus the state chip). PrimeVue stays
  the logic carrier only, as on every restyled screen; the visuals come
  from the desk tokens.
- **Design-token scope.** Zero new tokens; `app/src/theme/tokens.ts` is
  untouched. Money renders through the existing formatter
  (`formatVnd`, integer minor units on the wire), row dates render the
  desk date form (`dd/mm/yyyy`), and the range fields keep ISO on the
  wire.
- **States.** Section 7 is the complete state list.
- **Content and locale.** Every visible string is a VI-primary
  catalogue key with EN parity (section 9); keys land with the
  implementation PRs, one section per PR, and
  `script/catalogue-coverage-check.sh` stays the gate.
- **Print rules.** Not applicable — the screen has no print output and
  its styling does not leak into the existing print routes.
- **Accessibility and targets.** Every control keeps the `44px` target
  and the label-above-input pattern the rest of the desk uses; each row
  has exactly one keyboard stop (its action), and the selected row is
  marked visually and not by colour alone (the left rule plus the ink
  weight).
- **Design-facts gate.** The new tab is app-only, so the gate needs a
  second allowance entry in
  `docs/technical/desk-ui-fact-schema.md` section 8 (owned by
  `architect`, recorded at the spec stage) plus its consumer entry in
  `app/e2e/design-facts.ts`
  (`NAV_TAB_ALLOWANCES`): route key `bookings`, after `book`, labels
  `Sổ đặt phòng` / `Bookings`, declared design source
  `docs/design/Main.dc.html` (the shell tab pattern this screen reuses)
  and this spec for the screen body. The screen has no board record, so
  its static content is pinned by its own unit and flow tests (the
  `manage` precedent) while the gate keeps asserting the shell tab and
  every other board screen unchanged.

## 9. Catalogue keys

Proposed keys, not added, by this spec; each implementation PR adds only
the keys its section needs, in both catalogues, with placeholders
matching. The table holds 41 keys: 39 `desk.bookings.*` and the two
`desk.shell.*` keys.

The catalogue layer substitutes `{param}` into one flat pattern and has
no plural forms, so `desk.bookings.row_partial` counts *of* the listed
bookings instead of putting the numeral in front of a countable noun:
one failed row reads "Could not read the guest name or total for 1 of
the listed bookings.", and several read the same sentence with the
higher count (G1 on PR #689). `desk.bookings.capped` keeps its plural
wording because its count is always the 50-row cap, never one.

| Key | English | Vietnamese (primary) |
|---|---|---|
| `desk.shell.nav_bookings` | Bookings | Sổ đặt phòng |
| `desk.shell.doc_title_bookings` | Bookings | Sổ đặt phòng |
| `desk.bookings.title` | Bookings | Sổ đặt phòng |
| `desk.bookings.intro` | Every booking in the chosen dates. This page only reads. | Mọi đặt phòng trong khoảng ngày đã chọn. Trang này chỉ để xem. |
| `desk.bookings.range_from` | First night | Từ đêm |
| `desk.bookings.range_to` | Last night | Đến đêm |
| `desk.bookings.range_hint` | The list holds every booking staying at least one night between these two nights. | Danh sách gồm mọi đặt phòng có ít nhất một đêm trong khoảng hai đêm này. |
| `desk.bookings.show` | Show | Xem |
| `desk.bookings.range_invalid` | The last night must not be before the first night. | Đêm cuối không được trước đêm đầu. |
| `desk.bookings.loading` | Loading the booking register… | Đang tải sổ đặt phòng… |
| `desk.bookings.empty` | No booking stays between {from} and {to}. | Không có đặt phòng nào trong khoảng {from} – {to}. |
| `desk.bookings.read_failed` | Could not read the booking register. | Không đọc được sổ đặt phòng. |
| `desk.bookings.retry` | Try again | Thử lại |
| `desk.bookings.row_partial` | Could not read the guest name or total for {count} of the listed bookings. | Không đọc được tên khách hoặc tổng tiền của {count} đặt phòng trong danh sách. |
| `desk.bookings.column_partial` | The {column} column could not be read. | Không đọc được cột {column}. |
| `desk.bookings.capped` | Showing the first {count} bookings. Narrow the dates to see the rest. | Đang hiện {count} đặt phòng đầu tiên. Thu hẹp khoảng ngày để xem phần còn lại. |
| `desk.bookings.cell_unreadable` | could not read | không đọc được |
| `desk.bookings.col_guest` | Guest | Khách |
| `desk.bookings.col_ref` | Reference | Mã đặt phòng |
| `desk.bookings.col_room_type` | Room type | Hạng phòng |
| `desk.bookings.col_room` | Room | Phòng |
| `desk.bookings.col_arrival` | Arrival | Ngày đến |
| `desk.bookings.col_departure` | Departure | Ngày đi |
| `desk.bookings.col_nights` | Nights | Số đêm |
| `desk.bookings.col_total` | Total | Tổng cộng |
| `desk.bookings.col_state` | State | Trạng thái |
| `desk.bookings.open_row` | Open the booking for {guest} ({ref}) | Mở đặt phòng của {guest} ({ref}) |
| `desk.bookings.state_confirmed` | Booked | Đã đặt |
| `desk.bookings.state_checked_in` | In house | Đang lưu trú |
| `desk.bookings.state_closed` | Checked out | Đã trả phòng |
| `desk.bookings.state_cancelled` | Cancelled | Đã huỷ |
| `desk.bookings.state_no_show` | No-show | Không đến |
| `desk.bookings.state_unknown` | Unknown | Không rõ |
| `desk.bookings.detail_heading` | Booking detail | Chi tiết đặt phòng |
| `desk.bookings.detail_guest` | Guest | Khách |
| `desk.bookings.detail_room_type` | Room type | Hạng phòng |
| `desk.bookings.detail_room` | Assigned room | Phòng đang ở |
| `desk.bookings.detail_arrival` | Arrival | Ngày đến |
| `desk.bookings.detail_departure` | Departure | Ngày đi |
| `desk.bookings.detail_discount` | Discount: {name} | Giảm giá: {name} |
| `desk.bookings.detail_failed` | Could not read booking {ref}. | Không đọc được đặt phòng {ref}. |

Reused keys (not added): `desk.book.reference` for the reference line,
`desk.book.night_count` for the night count, `desk.book.quote_total`
for the quoted total, and the shared row/card patterns. The `—`
placeholder for an absent value is a plain glyph, as on the Manage
screen, not a catalogue string.

## 10. Acceptance criteria map (`AC-BMV-*`)

The canonical Given/When/Then wording lives in
`docs/product/acceptance-criteria.md` section 17. This table keeps the
id-to-detail link for reviewers.

| Id | One-line intent | Detail in this spec | Issue #648 criterion |
|---|---|---|---|
| `AC-BMV-1` | Entry: one tab after `Book`, route `/bookings`, shared shell unchanged, screen title and intro in both locales, nine tabs inside the content width | Section 3 | In: navigation entry; AC 5 (catalogue) |
| `AC-BMV-2` | The list renders every booking staying in the range with guest, reference, room type, assigned room when in house, dates, nights, quoted total, and state, ordered and capped | Sections 4, 5 | AC 1 |
| `AC-BMV-3` | The date filter re-reads the list for the inclusive night range, refuses an inverted range in plain words, and clears the selection | Section 4 | AC 2 (filter half) |
| `AC-BMV-4` | An empty range shows one plain sentence naming the range and invents no row | Section 7 | AC 2 (empty half) |
| `AC-BMV-5` | A selected row opens the fresh `GetReservation` read-back: dates, price basis, state, assigned room, guest, room type | Section 6 | AC 3 |
| `AC-BMV-6` | A failed list or detail read is one plain sentence with a retry; a failed row or shared-map read keeps the row and states the unreadable cell, with one notice counting incomplete rows and naming the failed column, no retry of its own; no booking is silently dropped; the rest of the desk stays usable | Section 7 | AC 4 |
| `AC-BMV-7` | Read-only surface over existing operations with no database access; EN+VI parity and a green catalogue check; the design-facts gate records the new tab; the owner reviewed the screen | Sections 2, 8, 9 | AC 5, AC 6 |

## 11. Acceptance mapping (issue #648)

| Issue criterion | Evidence |
|---|---|
| 1. Each row shows guest, reference, room type and assigned room when checked in, arrival, departure, and quoted total | Section 5 (fields and their reads); `AC-BMV-2` |
| 2. A date range lists only bookings overlapping it; an empty range shows a plain empty state naming the range | Section 4 (inclusive nights, `dateTo` mapping, validation); section 7 (empty sentence); `AC-BMV-3`, `AC-BMV-4` |
| 3. A selected row opens the read-back booking (dates, price basis, state, assigned room) from `GetReservation` | Section 6; `AC-BMV-5` |
| 4. A failed read shows plain catalogue words and leaves the rest of the desk usable | Section 7 (list, partial, detail rows); `AC-BMV-6` |
| 5. Every new string is catalogue-backed EN+VI; the design-facts gate asserts the new screen; the view performs no direct database access | Section 9 (key table); section 8 (design-facts allowance); sections 2 and 8 (existing operations only, no store or database access); `AC-BMV-7` |
| 6. The owner reviewed the screen against the design boards | Section 8 (design source and owner review); `AC-BMV-7`; the `owner-review` label on #648 |
| 7. The T2 spec set exists and `spec-reviewer` posts `SPEC-GATE PASS` before implementation | This document (`active` in `docs/README.md`), acceptance criteria section 17, rollout section 6.18, decision log D-28, and the section 12 handoffs; the verdict is posted on #648 |

## 12. Handoffs, gaps, and the implementation split

Gaps this spec lives inside, each recorded rather than papered over:

- **G1 — no calendar grid.** `FR-RES-5` also asks for bookings "across
  dates and room types"; this screen is the list-and-detail half, and a
  date-by-room-type grid stays unimplemented. If the owner wants the
  grid, it is a new product decision and a follow-up issue, not a
  silent extension of this one.
- **G2 — no list operation with guest and total.** `QueryCalendar`
  carries no guest and no price, so the list completes each row through
  one `GetReservation` (and one `ListRoomTypes` per load for the type
  names). A `ListReservations` read would remove the fan-out and is an
  `architect` follow-up if the desk measures it as slow; this change
  stays inside today's operations.
- **G3 — no paging and no filters beyond the range.** The 50-row cap
  plus the narrow-the-dates sentence is the whole v1 story; a state
  filter, a room-type filter (the contract already accepts
  `roomTypeId`), column sorting, and paging are follow-ups.
- **G4 — no room on a closed booking.** No read exposes the room a
  departed guest held, so a `closed` row and its detail read `—`; a
  booking-history room column is a follow-up if the owner asks.
- **G5 — no write path.** Modification, cancellation, and no-show are
  separate flows with their own specs; this screen offers none.
- **G6 — client-side read only.** The screen reads with the signed-in
  session token like every other desk screen and adds no role gate of
  its own, because it writes nothing.

Handoffs (owners, not this role):

- `business-analyst` — FR/NFR delta for the reader-visible surface:
  the route and nav entry, the range filter and its inclusive-nights
  mapping, the read-only list and detail, and the plain-words state
  coverage, against `FR-RES-5` (and `FR-RES-1` / `FR-RTE-5` for the
  record and the frozen price basis), `FR-DSP-1`, `FR-DSP-3`, and
  `NFR-I18N-1`.
- `architect` — LLD delta for the `bookings` route, view, and nav
  entry; the per-flow implementation diagram (happy path plus
  failure/rollback path with code edges) for the list read and its
  per-row completion; the second app-only nav allowance in
  `docs/technical/desk-ui-fact-schema.md` section 8; and a decision on
  G2 (keep the fan-out, or add a list operation as a follow-up).
- `qa-lead` — test plan and traceability slice for `AC-BMV-1..7`,
  naming the guards for the range mapping, the row fields, the empty
  and error states, the cap, the detail read-back, and the tab/label
  assertions that move with the ninth tab
  (`app/src/App.test.ts:182-207`, `app/src/shell-restyle.test.ts:26-27`,
  `app/src/router.test.ts:155-175`, `app/e2e/manage.spec.ts:73`, and the
  design-facts allowance) — including the narrow-width nav block, whose
  `gap` and tab `padding` need a rule-body assertion of their own
  because the existing guard reads only the first matching rule body.
- `release-manager` — a release note entry and the rollback pointer
  for the new screen (no migration; a single revert).
- `spec-reviewer` — one verdict on the then-current head before any
  implementation PR opens.

Implementation split (one small PR per slice, after a gate PASS; the
owner may re-split):

1. Route, nav tab, shell entry, the design-facts allowance entry, the
   filter card, and the screen's states scaffold.
2. The list read: `QueryCalendar` plus the per-row completion and the
   room-type/room/in-house maps, with rows, ordering, cap, and the
   partial-row notice.
3. The row detail read-back and its error state.
4. The browser/lab check of the read path (may fold into slice 2 at the
   owner's direction).

## 13. Evidence required on each implementation PR

- The slice's read path is exercised end to end against the live stack,
  with the read-back that proves the rendered values (a created booking
  appears in the list with its guest, type, dates, and total; the
  detail re-reads the same booking).
- The slice's states (loading, empty, read error, partial row, partial
  column, detail error) are shown or asserted in tests, in catalogue
  wording.
- Catalogue parity: EN and VI keys for the slice, placeholders
  matching, `script/catalogue-coverage-check.sh` green.
- No new design token; the design-facts gate green with the new
  allowance entry and every board screen unchanged.
- The 1200px shell evidence in both locales for the nine-tab row on
  slice 1, plus the narrow band either side of the breakpoint
  (`1279px` and `1280px`, section 3), and side-by-side VI and EN
  screenshots of the slice against the boards the screen borrows from.


<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1013
