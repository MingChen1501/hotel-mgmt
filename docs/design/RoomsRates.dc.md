# RoomsRates — rooms and rates management desk screen (design draft, Refs #590)

Status: **draft for owner approval** (not yet an approved design; no
implementation may start). Owner: `product-owner` (Refs #590).

This is the reviewable design source for the new desk screen that lets a
manager configure room types, place rooms on floors, and set nightly
prices per room type per date — the gap recorded in issue #590 (every
one of those operations is API-only today, so a property cannot price
its rooms through the product).

Design source is **team-owned** (owner direction 2026-11-09, recorded as
D-22 in `docs/project/decision-log.md`): `product-owner` drafts the board
here for owner review; an owner-approved design gates the spec gate and
only then does `dev` implement. Where this draft and the owner-supplied
v2 boards (`Main.dc.html`, `Rooms.dc.html`, `Admin.dc.html`, …)
disagree, the v2 boards win — this draft only adds a screen they do not
cover and reuses their language.

Board naming: `RoomsRates` is the board id. The canvas bundle
(`RoomsRates.dc.html` plus a `manifest.json` entry) is owner-supplied
once the owner approves this draft; until then this markdown file is the
board. See "Rules" in `docs/design/README.md`.

## 1. Scope in / out

In (the three sections of #590 plus the states the screen owes the desk):

- (a) Room types — list, create, edit (capacity, bed type).
- (b) Rooms and floor assignment — list grouped by floor, create a room,
  move a room to another floor, change a room's type.
- (c) Nightly prices — per room type per date, including a date-range
  entry that writes one nightly price row per night.
- (d) The empty state a manager sees when a room type has no price for
  the selected dates, using the "not open for booking" vocabulary the
  owner decision on #589 introduced.
- The refusal path for non-manager roles, in product wording.
- States: loading, empty, error, refusal, partial-save, success, all in
  plain words.

Out:

- New pricing semantics: seasons, child/derived rates,
  occupancy-based pricing, plan-level defaults, tax or fee math. The
  screen edits the existing per-night price records only.
- Deleting room types, rooms, rate plans, or prices (no operation
  exists; see G4 in section 9).
- Renaming a room type or a room number in place (the operations are
  keyed by name/number; see G1 and G3).
- Seed data, install-path changes, and the booking-refusal wording
  itself (tracked with #589).
- Booking/quote behaviour beyond consuming the prices this screen
  writes.

## 2. Where the screen lives

- Route `/app/manage`, route name `manage`, view `app/src/views/ManageView.vue`,
  document title key `desk.shell.doc_title_manage`.
- Nav: one new tab after `Rooms` (`desk.shell.nav_manage`), a sibling of
  the shared shell tabs in `app/src/App.vue`. Owner decision **O-1**.
- Reachable only when signed in, like every desk screen; the sign-in
  gate is unchanged.
- No print route: nothing here is guest-facing, so the print surface is
  untouched.

Header risk (already known from #564): the bar is one fixed
`60px` row with the brand as the only shrinkable item. A short label
(`Quản lý` / `Manage`) keeps eight tabs inside the `1200px` content
width; a long label would compete with the brand. If the owner prefers
no eighth tab (O-1 fallback), the same screen becomes an entry card on
the Rooms map header, and the route/nav decision is the only thing that
changes.

## 3. Design language (reused, no new tokens)

Everything comes from the existing token set in
`docs/product/desk-ui-pixel-faithful-restyle.md` section 3 and
`app/src/theme/tokens.ts` — this screen adds **no token**:

- Header teal `#0F4C47` (60px), page `#F4F6F5`, ink `#1B2B2A`, muted
  `#4B5D5B`, cards white with `#D9E0DE` border, `12px` radius, `18px`
  padding, row dividers `1px solid #EEF1F0`.
- Primary action `#0F766E`; every control and button `min-height:44px`
  with `8px` radius; labels `14px`; rows `15px`; h1 `22px/700`, h2
  `18px`, card h3 `16px`; content width `1200px`, section gap `16px`,
  page column gap `20px`.
- Status chips `999px` with `12px` dots at radius `3px`; the
  out-of-service / needs-action accents already exist for room states.
- Money and dates render through the existing helpers (`formatVnd`,
  the D-16 VND shape `1.800.000 đ`), and date fields follow the D-18
  decision (app-locale `DatePicker`, VI `dd/mm/yyyy`, EN
  `mm/dd/yyyy`). Wire payloads stay ISO `yyyy-mm-dd`; amounts stay
  integer minor units on the wire.
- VI-primary: every string is a catalogue key in `messages/vi.json`
  and `messages/en.json` (section 12); this draft adds no key to the
  catalogue — keys land with the implementation PRs.

## 4. Screen shell wireframe

Wireframe key: `[ ]` input, `( )` select, `{ }` action, `*` key data,
`!` status/error line, `...` repeated rows, `—` unknown/absent value.

```text
+--------------------------------------------------------------------------+
| [Hotel name]  Lễ tân  Phòng  Quản lý*  Đặt phòng  Nhận/trả  Hoá đơn      |
|                                          [VI | EN]     [Tài khoản]      |
+--------------------------------------------------------------------------+
|                                                                          |
|  Quản lý phòng và giá                                       h1 22px/700  |
|  Thiết lập loại phòng, xếp phòng theo tầng, đặt giá mỗi đêm. muted 14px  |
|                                                                          |
|  ! <refusal / error line, only when present>                             |
|                                                                          |
|  == 1. Loại phòng ==                                            h2 18px  |
|  +---------------------------------------+  +--------------------------+  |
|  | Loại phòng (4)                        |  | Sửa loại phòng           |  |
|  | ------------------------------------- |  |                          |  |
|  | * Deluxe    2 khách · Giường đôi {Sửa}|  | Tên *                    |  |
|  | * Standard  2 khách · Giường đơn {Sửa}|  | [Deluxe            ]     |  |
|  | ...                                   |  | ! tên không đổi được     |  |
|  | (empty) chưa có loại phòng nào        |  | Số khách                 |  |
|  |                                       |  | [2                 ]     |  |
|  |                                       |  | Loại giường              |  |
|  |                                       |  | (Giường đôi        )     |  |
|  |                                       |  | {Lưu loại phòng}         |  |
|  +---------------------------------------+  +--------------------------+  |
|                                                                          |
|  == 2. Phòng và tầng ==                                          h2 18px  |
|  +----------------------------------------------------------------------+ |
|  | Thêm phòng                                                           | |
|  | Số phòng *  Loại phòng *  Tầng  Loại giường  Số khách                | |
|  | [        ]  (Deluxe  )    [   ]  [        ]  [      ]                | |
|  | {Lưu phòng}                                                          | |
|  +----------------------------------------------------------------------+ |
|  +----------------------------------------------------------------------+ |
|  | Tầng 1 (6 phòng)                                                     | |
|  | ----------------------------------------------                       | |
|  | * 101  Deluxe    [Tầng 1 ]  (Deluxe    )  {Lưu}                      | |
|  | * 102  Deluxe    [Tầng 1 ]  (Deluxe    )  {Lưu}                      | |
|  | Tầng 2 (4 phòng)                                                     | |
|  | * 201  Suite     [Tầng 2 ]  (Suite     )  {Lưu}                      | |
|  | Chưa xếp tầng (2 phòng)                                              | |
|  | * 301  Standard  [       ]  (Standard  )  {Lưu}                      | |
|  | (empty) chưa có phòng nào                                            | |
|  +----------------------------------------------------------------------+ |
|                                                                          |
|  == 3. Giá theo ngày ==                                          h2 18px  |
|  +----------------------------------------------------------------------+ |
|  | Loại phòng (Deluxe  )   Bảng giá [Giá chuẩn      ]                    | |
|  | Đêm đầu [01/12/2026]   Đêm cuối [07/12/2026]   {Xem giá}              | |
|  | * 7 đêm · 01/12/2026 → 07/12/2026                                    | |
|  | -------------------------------------------------------------------- | |
|  |  T3       T4       T5       T6       T7       CN       T2            | |
|  |  01/12    02/12    03/12    04/12    05/12    06/12    07/12         | |
|  |  850.000đ 850.000đ —        850.000đ 1.100.000đ —     850.000đ       | |
|  | -------------------------------------------------------------------- | |
|  | Giá mỗi đêm  [850000        ] đ         {Lưu 7 đêm}                   | |
|  | Thay giá 5 đêm đã có và thêm 2 đêm trống.             muted 14px     | |
|  | ! đã lưu 3/7 đêm · đêm 04/12 chưa lưu   {Lưu tiếp các đêm còn lại}    | |
|  +----------------------------------------------------------------------+ |
+--------------------------------------------------------------------------+
```

Section order is the setup order: types → rooms → prices. A manager
therefore never lands on "no room types" while trying to price one.

## 5. Section 1 — Room types

### 5.1 List card

- Left card, `1.4fr`, one `15px` row per type with `1px solid #EEF1F0`
  dividers: name (ink `600`), capacity and bed type in muted `14px`,
  and an `{Sửa}` button on the right (`44px` target).
- Heading `Loại phòng ({count})`.
- Empty state (muted `15px`, inside the card): `Chưa có loại phòng nào.
  Tạo loại phòng đầu tiên để bắt đầu xếp phòng.` — no fake rows.
- Row meta shows `—` for a missing capacity or bed type (never a
  guessed value).

### 5.2 Create / edit card

- Right card, `1fr`, heading `Sửa loại phòng` (`Loại phòng mới` when
  creating), fields in the v2 label-above-input pattern (label `14px`,
  control full-width `min-height:44px`, `6px` gap).
- Fields:
  - **Name** (`Tên`, required) — text. When **editing**, the name is
    read-only with the helper `Không đổi được tên ở đây. Tên khác sẽ
    tạo một loại phòng mới.` (see G1: the operation is keyed by name).
  - **Guests** (`Số khách`) — integer `1..20`, optional.
  - **Bed type** (`Loại giường`) — select of the catalogue-led options
    `Giường đôi` / `Hai giường đơn` / `Giường đơn`, optional.
- `{Lưu loại phòng}` posts `UpsertRoomType` with `name`, `actor`, and
  only the fields the manager filled. **Features are never sent**, so
  an existing type's `features` object is preserved by the service
  (`services/rooms/src/pgstore.ts` merges the stored value when the
  field is absent).
- After a save: the card switches back to `Loại phòng mới`, the list
  reloads (`ListRoomTypes`), and a success line reads `Đã lưu
  {name}.` — the row a manager just saved is visible with the new
  values, which is the same read-back discipline the rest of the desk
  uses.
- Validation before the call, in plain words, naming the field: empty
  name; guests outside `1..20` (a UI sanity bound, not a contract
  limit); nothing else is required.

## 6. Section 2 — Rooms and floors

### 6.1 Add-room card

- Fields: **Room number** (required), **Room type** (select from
  `ListRoomTypes`, required), **Floor** (text, optional), **Bed type**
  (optional), **Guests** (optional).
- `{Lưu phòng}` posts `UpsertRoom` with `number`, `roomType` (the
  selected type's **name**), `floor` when filled, and `actor`. A room
  number that already exists is an update, not a duplicate — the
  operation is keyed by number, and the screen says so in the success
  line (`Đã lưu phòng {number}.`).
- A new room starts `vacant-inspected` server-side, so it is bookable
  and appears on the room map immediately; the screen never invents a
  state.

### 6.2 Floor-grouped list card

- Rooms are grouped by floor: one section per floor, ordered by floor
  label as returned (`Tầng {floor} ({count})`, reusing
  `desk.rooms.floor_title`), plus a final `Chưa xếp tầng` section
  (reusing `desk.rooms.floor_unknown`) for rooms with no floor.
- Each row: room number (`22px` is the room-map card size — here the
  row uses `15px` ink `600`), current type (muted), a **floor input**
  prefilled with the room's floor, a **type select** prefilled with the
  room's type, and `{Lưu}`.
- Saving a row posts `UpsertRoom` with the row's `number`, the chosen
  `roomType` name, the typed `floor` (a filled value moves the room;
  the screen never clears a floor in v1 — see G5), and `actor`; then the
  list reloads from `ListRoomsByState` and the room shows under its new
  floor. This is acceptance criterion 5 and it is the only write path
  that moves a room.
- Moving a room never changes its state, occupancy, or history: the
  service preserves `state` on update.
- Empty state: `Chưa có phòng nào. Thêm phòng đầu tiên để bắt đầu sơ
  đồ phòng.`

### 6.3 Reading the rooms

There is no "list all rooms" operation; the screen merges the five
`ListRoomsByState` reads (`occupied`, `vacant-dirty`, `vacant-clean`,
`vacant-inspected`, `out-of-order`), keyed by `roomId`, and keeps the
`floor` each response carries. A failed read of one state renders that
group's rooms as unavailable with a plain notice rather than dropping
them silently — the same rule the Rooms map follows (see G2).

## 7. Section 3 — Nightly prices

### 7.1 Controls

- **Room type** (select from `ListRoomTypes`, required).
- **Rate plan** (text, required) — the plan name. There is no
  list-plans operation today (G2), so the field is prefilled with the
  plan name this browser last saved successfully (a UI preference only,
  never auth data; `hotel-mgmt.desk.manage.rate-plan`), and is empty on
  first use with the helper `Khi lưu, bảng giá này sẽ được tạo nếu chưa
  có.` (Owner decision O-4.)
- **First night** / **Last night** — the D-18 app-locale date pickers.
  The range is **inclusive of both ends**: 01/12 → 07/12 is 7 nights,
  each night being the date the guest sleeps. Last night must not be
  before the first night; a range longer than 31 nights is refused in
  plain words (O-3).
- `{Xem giá}` re-reads the visible grid.

### 7.2 Price grid (read)

- One column per night, `7` nights per page with `{Trước}` / `{Sau}`
  paging for longer ranges; each column shows the weekday short name,
  `dd/mm`, and the stored price in the D-16 VND shape.
- A night with no price row renders `—` plus the muted `chưa có giá`
  caption. A night whose read failed renders `—` plus `không đọc được`.
  **A price is never invented, carried over from a neighbouring night,
  or shown as `0`.**
- How the grid reads, using today's only price read: one single-night
  `QuotePrice` call per visible night, `arrivalDate` = the night and
  `departureDate` = the night plus one day, with the plan name passed
  explicitly (7 calls per viewed page, ≤ 14 for a two-page range),
  because a multi-night quote fails on the first unpriced night and
  cannot report the others (`docs/architecture/services/rates.md`
  section 3). Result mapping: `200` renders the returned `priceMinor`;
  `NOT_FOUND` with `details.reason` `no_rate_price` or `no_rate_plan`
  means "no price for that night"; `NOT_FOUND` naming an unknown rate
  plan renders the plan-missing state (section 7.3); any other failure
  renders "could not read". This keeps the grid exact and stateless, and
  it is replaced by a proper list operation if the architect chooses to
  add one (G2).

### 7.3 Range entry (write)

- **Price per night** — whole major units (đồng), digits only, `0` to
  `100 000 000`. The value is converted to `priceMinor` (`× 100`) on
  save, integer arithmetic only, exactly as the desk already parses
  amounts (`app/src/views/FolioView.vue` `parseMinor`).
- `{Lưu N đêm}` writes **one `UpsertRatePrice` row per night**, in date
  order, with `ratePlanName`, `roomTypeId` (the selected type's id),
  `nightDate` (ISO), `priceMinor`.
- The button names the night count (`Lưu 7 đêm`) so the write is
  predictable before the click, and the helper line states what will
  change: `Thay giá {priced} đêm đã có và thêm {empty} đêm còn trống.`
  (counts come from the grid read).
- **Plan creation path:** the first write can fail with `NOT_FOUND`
  ("unknown rate plan"). That is the screen's only signal that the plan
  does not exist, so the screen maps it to `Chưa có bảng giá với tên
  này.` plus `{Tạo bảng giá này}`; that action posts `UpsertRatePlan`
  with `{name}` only and then retries the pending night writes. A plan
  is therefore never created behind the manager's back, and an existing
  plan is never re-submitted — which matters because `UpsertRatePlan`
  overwrites `description` on a name conflict
  (`services/rates/internal/store/postgres.go`), so the screen must
  never call it as a "just in case" step before a save.
- **Partial failure:** writes stop at the first failure; already-saved
  nights stay saved (the operation is idempotent per plan/type/date).
  The screen reports `Đã lưu {saved}/{total} đêm. Ngày {date} chưa lưu
  được; hãy thử lại.` with `{Lưu tiếp các đêm còn lại}`, which resumes
  at the first unsaved night — never at the start, so no row is written
  twice needlessly and no night is skipped.
- **Success:** `Đã lưu {nights} đêm cho {roomType}.` and the grid
  re-reads the saved range so the manager sees the stored rows.
- Save is disabled while the call is in flight (repeat-write rule), and
  the control keeps its label while busy (`Đang lưu 3/7…`).

### 7.4 No-price empty state (the "not open for booking" state)

When every visible night has no price row, the card replaces the grid
with the empty state (centred, muted `15px`, max width `560px`):

```text
+----------------------------------------------------------------------+
| Loại phòng (Deluxe  )   Bảng giá [Giá chuẩn      ]                    |
| Đêm đầu [01/12/2026]   Đêm cuối [07/12/2026]   {Xem giá}              |
|                                                                       |
|              Loại phòng này chưa mở bán                              |
|   Chưa đặt giá cho các ngày này nên lễ tân chưa thể báo giá.          |
|   Nhập giá mỗi đêm bên dưới để mở bán.                               |
|                                                                       |
|  Giá mỗi đêm [850000        ] đ        {Lưu 7 đêm}                    |
+----------------------------------------------------------------------+
```

- The wording deliberately reuses #589's vocabulary: a type with no
  price for the selected dates is **not open for booking**
  (`desk.book.room_type_not_operational` on the Book screen), and this
  screen is where the manager opens it. The two surfaces must never
  drift: the Book screen's phrase is the source, this card points at
  the action.
- The pricing form stays usable inside the empty state; a manager can
  price the range without leaving the card.

## 8. Refusal path for non-manager roles

- The write controls are owner/manager only. The signed-in role comes
  from the session store (the same cosmetic gate the Admin screen
  already uses, `app/src/views/AdminView.vue` `canManage`).
- `front-desk` sees the same screen, read-only: every list renders, and
  a muted notice sits under the intro — `Bạn xem được thiết lập ở đây;
  chỉ chủ hoặc quản lý mới sửa được.` Create/save buttons are disabled
  with the plain sentence `Chỉ chủ hoặc quản lý mới sửa được phòng và
  giá. Nhờ quản lý nếu cần đổi.` No technical code, no blank card,
  no silent no-op.
- If a write is nevertheless refused by the server (`FORBIDDEN`), the
  envelope code maps to that same sentence — codes never reach the
  screen. A `401` follows the existing expire-to-gate path.
- Honest limitation, recorded here and handed to the architect (G6):
  today the rooms and rates operations check the Bearer token only
  (`services/rooms/src/auth.ts`), so this refusal is a product-surface
  rule, not an enforced permission. Server-side role enforcement is a
  separate security slice, not this design.

## 9. Operations used, and the gaps this design does not paper over

| Need | Operation today | Notes |
|---|---|---|
| List types | `POST /v1/rooms/ListRoomTypes` | id, name, capacity, bedType |
| Create/edit type | `POST /v1/rooms/UpsertRoomType` | keyed by **name**; `features` preserved when omitted |
| List rooms | `POST /v1/rooms/ListRoomsByState` ×5 | merge by `roomId`; carries `floor`; no list-all op (G2) |
| Create/update room, floor | `POST /v1/rooms/UpsertRoom` | keyed by **number**; `state` preserved on update |
| Create plan | `POST /v1/rates/UpsertRatePlan` | keyed by **name**; reached only through the 404 path |
| Write one night | `POST /v1/rates/UpsertRatePrice` | one row per (plan, type, night); idempotent |
| Read prices | `POST /v1/rates/QuotePrice` | one night per call; `details.reason` names the cause (G2) |

Gaps (each one is a design constraint, not a promise):

- **G1 — no rename.** `UpsertRoomType` is keyed by name and has no id
  field, so renaming a type would create a second type. The design locks
  the name field while editing and says so. A rename operation is a
  separate product decision.
- **G2 — no list operations for plans or prices.** Plans are free text
  plus the create-on-404 path; prices are read one night at a time
  through `QuotePrice`. If the architect wants `ListRatePlans` /
  `ListRatePrices`, that is an additive read surface agreed at the spec
  gate; this design works without it and gets simpler with it.
- **G3 — rooms are listed by state.** Five reads per load, merged. Same
  shape the Rooms map already uses.
- **G4 — no deletes.** No delete operation exists for types, rooms,
  plans, or prices; the screen offers none and files any owner request
  as a follow-up.
- **G5 — clearing a floor.** `UpsertRoom` treats an absent `floor` as
  "keep the stored value" (`services/rooms/src/pgstore.ts`); an empty
  string is stored as `''`, not as "no floor". The design therefore
  offers no "clear floor" action in v1: a manager moves a room to
  another floor, never back to unfiled. Read-back shows `''` as
  `Chưa xếp tầng`. Whether an explicit clear is worth an operation
  change is a spec-gate question for the architect.
- **G6 — client-side role gate only** (section 8).

## 10. States in plain words

The `FR-DSP-3` plain-words rule holds on every part of the screen:

| State | Screen behaviour |
|---|---|
| Loading | One line names the region being read (`Đang tải phòng và giá…`); the shell stays visible; repeat calls do not stack. |
| Empty (types) | `Chưa có loại phòng nào. Tạo loại phòng đầu tiên để bắt đầu xếp phòng.` |
| Empty (rooms) | `Chưa có phòng nào. Thêm phòng đầu tiên để bắt đầu sơ đồ phòng.` |
| Empty (prices) | Section 7.4 — not open for booking, plus the action. |
| Read error | A plain sentence naming what could not be read and `{Thử lại}`; no stack trace, no envelope code, no zero-filled rows. |
| Validation | Names the field and what to change; nothing is sent. |
| Refusal | Section 8 wording; controls disabled or the save refused with the same sentence. |
| Partial save | Section 7.3 — states saved/total, names the first failed night, offers resume. |
| Success | Confirms the object and count, then shows the re-read state. |

## 11. UI contract (T2 reader-visible change)

- **Layout shell and navigation scope.** The shared shell is unchanged
  (teal `60px` header, tabs, locale pill, session control, `1200px`
  content column). This change adds one tab (O-1) and one route; every
  other destination, the sign-in gate, and the print surface stay as
  they are.
- **Component mapping per pattern.** Cards/rows/buttons/inputs/selects/
  chips follow the v2 token set in section 3 and the existing
  PrimeVue-as-logic-carrier rule (restyle spec section 2): a component
  may keep its behaviour (focus, keyboard, ARIA, validation state) while
  its visuals come from the design values. Date fields reuse the D-18
  `DatePicker` treatment. No new component pattern is introduced.
- **Design-token scope.** Zero new tokens; `app/src/theme/tokens.ts` is
  untouched by this screen.
- **States.** Section 10 is the complete state list; no state is implied
  and left unworded.
- **Print rules.** Not applicable — the screen has no print output, and
  screen styling does not leak into the existing print routes.

## 12. Proposed catalogue keys (VI-primary, EN alongside)

All keys are **proposed** for the implementation PRs; this design change
adds none to `messages/*.json` and leaves `script/catalogue-coverage-check.sh`
untouched. Prefix `desk.manage.*` (surface `desk`, domain `manage`),
plus one shell key for the tab and one for the route title.

| Key | EN | VI |
|---|---|---|
| `desk.shell.nav_manage` | Manage | Quản lý |
| `desk.shell.doc_title_manage` | Rooms and rates | Phòng và giá |
| `desk.manage.title` | Manage rooms and rates | Quản lý phòng và giá |
| `desk.manage.intro` | Set up room types, place rooms on floors, and set the nightly price for each date. | Thiết lập loại phòng, xếp phòng theo tầng và đặt giá mỗi đêm cho từng ngày. |
| `desk.manage.loading` | Loading rooms and prices… | Đang tải phòng và giá… |
| `desk.manage.noscript` | This page needs JavaScript to manage rooms and prices. | Trang này cần JavaScript để quản lý phòng và giá. |
| `desk.manage.read_error` | Could not read the setup. Try again. | Không đọc được thiết lập. Hãy thử lại. |
| `desk.manage.retry` | Try again | Thử lại |
| `desk.manage.refused_role` | Only the owner or a manager can change rooms and prices. Ask a manager if something needs changing. | Chỉ chủ hoặc quản lý mới sửa được phòng và giá. Nhờ quản lý nếu cần đổi. |
| `desk.manage.role_readonly` | You can see the setup here; only the owner or a manager can change it. | Bạn xem được thiết lập ở đây; chỉ chủ hoặc quản lý mới sửa được. |
| `desk.manage.edit` | Edit | Sửa |
| `desk.manage.types_heading` | Room types ({count}) | Loại phòng ({count}) |
| `desk.manage.types_empty` | No room types yet. Create the first type so rooms can be set up. | Chưa có loại phòng nào. Tạo loại phòng đầu tiên để bắt đầu xếp phòng. |
| `desk.manage.type_new_heading` | New room type | Loại phòng mới |
| `desk.manage.type_edit_heading` | Edit room type | Sửa loại phòng |
| `desk.manage.type_name_label` | Type name | Tên loại phòng |
| `desk.manage.type_name_locked` | The name cannot be changed here. A different name creates a new room type. | Không đổi được tên ở đây. Tên khác sẽ tạo một loại phòng mới. |
| `desk.manage.type_capacity_label` | Guests | Số khách |
| `desk.manage.type_bed_label` | Bed type | Loại giường |
| `desk.manage.bed_double` | Double bed | Giường đôi |
| `desk.manage.bed_twin` | Twin beds | Hai giường đơn |
| `desk.manage.bed_single` | Single bed | Giường đơn |
| `desk.manage.type_row_meta` | {capacity} guests · {bedType} | {capacity} khách · {bedType} |
| `desk.manage.type_save` | Save room type | Lưu loại phòng |
| `desk.manage.type_saved` | Saved {name}. | Đã lưu {name}. |
| `desk.manage.rooms_add_heading` | Add a room | Thêm phòng |
| `desk.manage.room_number_label` | Room number | Số phòng |
| `desk.manage.room_type_label` | Room type | Loại phòng |
| `desk.manage.room_floor_label` | Floor | Tầng |
| `desk.manage.save` | Save | Lưu |
| `desk.manage.room_save` | Save room | Lưu phòng |
| `desk.manage.room_saved` | Saved room {number}. | Đã lưu phòng {number}. |
| `desk.manage.room_count` | ({count} rooms) | ({count} phòng) |
| `desk.manage.rooms_empty` | No rooms yet. Add the first room to start the room map. | Chưa có phòng nào. Thêm phòng đầu tiên để bắt đầu sơ đồ phòng. |
| `desk.manage.rates_heading` | Nightly prices | Giá theo ngày |
| `desk.manage.rate_plan_label` | Rate plan | Bảng giá |
| `desk.manage.rate_plan_hint` | If this rate plan does not exist yet, the screen offers to create it before saving prices. | Nếu chưa có bảng giá này, màn hình sẽ hỏi tạo trước khi lưu giá. |
| `desk.manage.rate_from_label` | First night | Đêm đầu |
| `desk.manage.rate_to_label` | Last night | Đêm cuối |
| `desk.manage.rate_range_summary` | {nights} nights, {from} to {to} | {nights} đêm, {from} đến {to} |
| `desk.manage.rate_reload` | Read prices | Xem giá |
| `desk.manage.rate_price_label` | Price per night | Giá mỗi đêm |
| `desk.manage.rate_save` | Save {nights} nights | Lưu {nights} đêm |
| `desk.manage.rate_saving` | Saving {saved}/{total}… | Đang lưu {saved}/{total}… |
| `desk.manage.rate_saved` | Saved {nights} nights for {roomType}. | Đã lưu {nights} đêm cho {roomType}. |
| `desk.manage.rate_partial` | Saved {saved}/{total} nights. {date} did not save; try again. | Đã lưu {saved}/{total} đêm. Ngày {date} chưa lưu được; hãy thử lại. |
| `desk.manage.rate_retry` | Save the remaining nights | Lưu tiếp các đêm còn lại |
| `desk.manage.rate_overwrite_note` | This replaces {priced} nights that already have a price and adds {empty} empty nights. | Thay giá {priced} đêm đã có và thêm {empty} đêm còn trống. |
| `desk.manage.rate_night_missing` | no price | chưa có giá |
| `desk.manage.rate_night_unreadable` | could not read | không đọc được |
| `desk.manage.rate_empty_title` | This room type is not open for booking | Loại phòng này chưa mở bán |
| `desk.manage.rate_empty_body` | No price is set for these dates, so the front desk cannot quote it. Enter a nightly price below to open it. | Chưa đặt giá cho các ngày này nên lễ tân chưa thể báo giá. Nhập giá mỗi đêm bên dưới để mở bán. |
| `desk.manage.rate_plan_missing` | No rate plan has this name yet. | Chưa có bảng giá với tên này. |
| `desk.manage.rate_plan_create` | Create this rate plan | Tạo bảng giá này |
| `desk.manage.rate_plan_created` | Created the rate plan {plan}. | Đã tạo bảng giá {plan}. |
| `desk.manage.need_fields` | Choose a room type, a rate plan, and both dates. | Hãy chọn loại phòng, bảng giá và cả hai ngày. |
| `desk.manage.need_price` | Enter a price per night. | Hãy nhập giá mỗi đêm. |
| `desk.manage.range_order` | The last night cannot be before the first night. | Đêm cuối không thể trước đêm đầu. |
| `desk.manage.range_too_long` | Choose at most {max} nights at a time. | Mỗi lần chỉ chọn tối đa {max} đêm. |
| `desk.manage.price_invalid` | Enter a whole amount between 0 and 100000000. | Hãy nhập số tiền tròn từ 0 đến 100000000. |
| `desk.manage.error_generic` | That did not save. Check the values and try again. | Chưa lưu được. Hãy kiểm tra lại giá trị và thử lại. |

Reused keys (no new copy): `desk.rooms.floor_title`,
`desk.rooms.floor_unknown`, `desk.rooms.refresh`, `desk.admin.role_*`,
`desk.book.room_type_not_operational` (the Book-screen phrase this
empty state must stay aligned with).

## 13. Owner decisions needed (approval checklist)

Approving this draft means approving these four calls. Each has a
recommendation; any change is cheap now and expensive after the gate.

- **O-1 — entry point.** New nav tab `Quản lý` / `Manage` after `Rooms`
  (recommended, one route, no extra tap), or a `{Quản lý phòng và giá}`
  entry card on the Rooms map header (no header change, one extra tap).
- **O-2 — section layout.** Three stacked card groups on one screen in
  setup order (recommended: matches the Admin board's stacked cards, no
  hidden state, splits cleanly into three child issues), or an in-page
  segmented control with three tabs (shorter page, one more state).
- **O-3 — range cap.** A single save covers at most 31 nights
  (recommended: a month is the desk's real planning horizon and each
  night is one write), or a longer cap.
- **O-4 — rate plan entry.** Free-text plan name, remembered per
  browser, created through the explicit `{Tạo bảng giá này}` affordance
  on the first `NOT_FOUND` (recommended: no guessing, no silent plan
  creation, works with today's operations), or wait for a
  `ListRatePlans` read before the screen ships.

## 14. Acceptance mapping (issue #590)

| Issue criterion | Design evidence |
|---|---|
| 1. Wireframes/mocks for the three sections plus the no-price empty state in `docs/design/`, linked from the issue | This file: sections 4–7 (wireframes), 7.4 (empty state); registered in `docs/design/README.md` and `docs/README.md` |
| 2. Owner records approval on the issue | Section 13 checklist; approval is recorded on #590 before the spec gate starts |
| 3. Required specs `active` and `spec-reviewer` PASS before implementation | Handoff list in section 15; nothing in this change implements or activates a spec |
| 4. A price for a type over a date range writes one row per night and the desk can quote it | Section 7.3 (write path, per-night rows, partial-failure resume); the quote itself is the Book screen's existing path |
| 5. Moving a room to another floor persists and the room map reports it | Section 6.2 (`UpsertRoom`, reload from `ListRoomsByState`) |
| 6. Creating or editing a type persists and the Book screen lists it | Sections 5.2 (create/edit), 9 (`ListRoomTypes` is the shared read the Book screen also uses) |
| 7. Non-manager refusal path in product wording | Section 8 |
| 8. Implementation lands in small PRs with tests | Section 15 split (one section per child issue), each with its own guards |

## 15. Handoffs after owner approval (not started here)

Once the owner approves the design on #590, the spec gate needs:

- `product-owner` — product spec carrying the approved screen scope, the
  UI contract from section 11, and the binding acceptance criteria
  (`AC-*` ids) for the three sections; this draft is the design source
  it cites.
- `business-analyst` — FR/NFR delta for the new desk surface (write
  operations already exist; the delta is the reader-visible UI and its
  guards) plus traceability inputs.
- `architect` — architecture delta: the `ManageView` route and nav
  addition in the LLD, and a decision on G2 (`ListRatePlans` /
  `ListRatePrices`) and G6 (server-side role enforcement) — both may be
  recorded as explicit follow-ups instead of changes.
- `qa-lead` — test plan and traceability for AC 4–7, including the
  per-night write, the partial-failure resume, and the refusal path.
- `spec-reviewer` — one `SPEC-GATE PASS` verdict on #590 before any
  implementation PR opens.
- Split for implementation (one small PR each, after PASS): (1) route +
  nav + shell + read-only refusal; (2) room types; (3) rooms and floors;
  (4) nightly prices and the empty state. The owner may re-split.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-884
