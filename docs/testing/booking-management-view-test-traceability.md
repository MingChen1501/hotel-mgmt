# Booking management view test traceability (Refs #648)

Status: active. Testing spec for the T2 read-only booking register
([issue #648](https://github.com/MingChen1501/hotel-mgmt/issues/648)),
owned by `qa-lead`. It maps the done-conditions of the change —
`AC-BMV-1`..`AC-BMV-7`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 17](../product/acceptance-criteria.md) —
and the behaviour-scoped requirements `FR-BMV-1`..`FR-BMV-7`, owned
by `business-analyst` in
`docs/requirements/mvp-requirements.md` [section 25](../requirements/mvp-requirements.md),
to their guards: the pins that exist on disk at this spec head, the
guard registry `BM1`–`BM16`, and the evidence rule `BM-E1`.

Written before the implementation PR. Every guard in the registry is a
**named, missing obligation** at this head: no row here marks a guard
complete before it exists and passes, and the slice is not complete
until the implementation PRs merge and `qa-lead` re-pins every row at
the merged head (the `#588 -> #599` pattern). Section 2 cites what is
on disk today and what it proves; that table's note column says which
pins the implementation PR extends (never deletes), and section 5 says
which cases it must create.

Companion specs: the screen spec and its T2 UI contract in
`docs/product/booking-management-view.md` (sections 2–9, the 41-key
copy table in section 9, the design-facts allowance rule in section 8,
the evidence list in section 13); the desk delta in
`docs/product/desk-ui-design-rollout.md`
[section 6.18](../product/desk-ui-design-rollout.md); D-28 in
`docs/project/decision-log.md`; the route, load-composition, failure-class,
diagram, and contract deltas in `docs/architecture/lld.md`
[section 24](../architecture/lld.md) (24.1 ownership, 24.2 the load
composition and the range mapping, 24.3 the failure classes and the
`—`-versus-`cell_unreadable` rule, 24.4 the target algorithm, 24.5/24.6
the two per-flow diagrams, 24.7 the contract no-change statement and the
G2 decision, 24.8 the verification plan this plan aligns with, 24.9 the
residual risks R15–R19); the app-only nav allowance in
`docs/technical/desk-ui-fact-schema.md` [section 8](../technical/desk-ui-fact-schema.md);
and the sibling test specs this slice must not disturb:
`arrival-reassign-test-traceability.md` (#647, registry `RR1`–`RR13`),
`departure-release-test-traceability.md` (#646, `DR1`–`DR13`),
`checkout-settlement-test-traceability.md` (#601, `S1`–`S12`),
`rooms-rates-management-test-traceability.md` (#590, `M1`–`M10`), and
`desk-ui-rollout-test-traceability.md` (#419, `D1`–`D19`), plus the
#565/#568/#581/#582/#586/#588/#590/#600/#601/#646/#647 rows in
`traceability-matrix.md` sections 5–15. This spec implements no code,
changes no guard, adds no catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `architect` (LLD
  [section 24](../architecture/lld.md)): a reader-visible desk screen
  delivered over five operations that already exist —
  `QueryCalendar`, `GetReservation`, `ListRoomTypes`,
  `ListArrivalsDepartures`, `ListRoomsByState`. No new operation,
  field, error code, lifecycle state, event, schema, or migration.
- No MVP row moves. `FR-RES-5` keeps its wording and its guards and
  gains only the amendment pointer; the 57-row MVP coverage count in
  `traceability-matrix.md` stands unchanged and no MVP row may cite
  this slice as its guard. The slice rows live in
  `traceability-matrix.md` section 16. This slice is the surface
  `US-RES-5` / `FR-RES-5` / `AC-RES-5` already promised; the
  date-by-room-type grid half of `FR-RES-5` stays unimplemented (G1).
- No new NFR. Requirements section 25.4 is a no-change statement:
  catalogue coverage, desk response, concurrency, audit, retention,
  availability, time/locale, touch targets, and print isolation all
  hold with the existing guards; the new screen's own touch targets are
  additionally pinned at the source in `app/src/bookings-restyle.test.ts`
  (the actions and the row action at 44px). `NFR-PERF-1` holds under the 50-row
  cap: one apply is at most 54 reads (one calendar, one room-type list,
  the two calls of the in-house pair, at most 50 row reads, LLD 24.2), so
  the fan-out is bounded rather than removed (G2); the guard half is
  `BM7`, which pins the apply's total read count.
- Contract: **no change at all** (LLD 24.7). The five operations are
  used in the shapes `contracts/http/QueryCalendar.json`,
  `GetReservation.json`, `ListRoomTypes.json`,
  `ListArrivalsDepartures.json`, and `ListRoomsByState.json` already
  carry; an added operation, field, or code is a re-tier finding. The
  LC stage is therefore a re-run
  (`script/contract-check.sh`, `script/openapi-route-check.sh`) and
  this slice adds no contract delta.
- Guards are extended, never deleted. The eight-tab pins
  (`app/src/App.test.ts:182-215`, `app/src/shell-restyle.test.ts:28-29`,
  `app/src/router.test.ts:155-179`,
  `app/e2e/manage.spec.ts:72-75`), the design-facts allowance list, and
  every board-screen suite keep their assertions and move only by the
  ninth tab; the implementation PR adds a `#648` note but drops no
  case. `BM14` fails a deleted or relaxed pin, not only a missing
  allowance entry.
- The narrow-width nav block is pinned the same way, never relaxed. The
  existing shell reader takes the first matching rule body, so it reads
  the design `gap`/`padding` and would keep passing on the override;
  the dedicated `BM16` case therefore reads the band with its own reader
  scoped from the `@media screen and (max-width: 1279px)` opener and
  asserts both bands (`app/src/App.vue:534`, `:573`, `:2735-2744` on the
  #689 head, with the case and readers at
  `app/src/shell-restyle.test.ts:40-59` and `:118-133` there). The base
  assertions stay as they are, the design values hold at `1280px` and
  wider, and the narrow values hold below it (D-29).
- Copy: the 41 keys of product spec section 9 (39 `desk.bookings.*`
  plus `desk.shell.nav_bookings` and `desk.shell.doc_title_bookings`)
  are the implementation PRs' to add in both locales with placeholders
  intact; `desk.book.reference`, `desk.book.night_count`,
  `desk.book.quote_total`, and `desk.today.unknown_guest` are reused,
  not re-added. The implementation must not invent wording, and `BM15`
  fails an invented key rather than accepting one.
- **R18 is closed in the product spec.** The catalogue now carries
  `desk.bookings.column_partial` (`{column}`) for a failed
  `ListRoomTypes` / in-house / occupied read, with `{column}` filled
  from the failed read's own heading (`desk.bookings.col_room_type` or
  `desk.bookings.col_room`), so the notice is column-truthful without
  merging the shared-map class into `desk.bookings.row_partial`
  (LLD 24.9, `docs/architecture/lld.md` R18). The retry rule follows
  the LLD's failure table: the list read and the detail read carry one
  retry action each, while the partial row and shared-map classes carry
  none and re-applying the range reads again. `BM11` asserts the two
  partial classes stay distinct and the no-retry rule; `BM15` pins the
  41 keys.
- Read-only by construction, and guarded as such: `BM2` pins the call
  set to exactly the five read operations with no direct database,
  reservation-store, or service-internal access, and no write action
  anywhere on the screen (`AC-BMV-7`).
- Gaps this slice lives inside (product spec section 12), each with the
  guard that keeps it honest rather than papered over: G1 no
  date-by-room-type grid (no guard claims one; the grid stays a
  follow-up), G2 no composed list read (`BM7` bounds the fan-out at one
  row read per capped row), G3 no paging and no filter beyond the range
  (`BM7`'s count sentence is the whole v1 story), G4 no room on a
  closed booking (`BM6` asserts `—`), G5 no write path (`BM2`), G6 no
  role gate of its own (every signed-in hotel role sees the same
  read-only view).

## 2. Pins on disk at this spec head

Every `file:line` below was re-read on this branch head. The code tree
is identical to `origin/master` at `8cb42ca` (the #673 merge): the
sibling spec PRs (#674, #675, #676) touch `docs/` only, and
`git diff --stat origin/master HEAD -- . ':(exclude)docs'` is empty. A
local `master` ref that lags origin can mislead a reader here, so read
these rows against the checkout's code tree, not against a stale ref.
They prove today's behaviour: no screen lists bookings, the range and
record reads already answer the facts, and the shell pins the eight-tab
row. The implementation PR extends these in place, with a `#648` note,
and never deletes one.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `app/src/router.ts:44-118` | Ten route entries — desk, book, stay, onboarding, rooms, manage, folio, print, admin, and the catch-all placeholder — and no route that lists bookings | Adds `bookings` (path `/bookings`, name `bookings`, `docTitleKey: 'desk.shell.doc_title_bookings'` with its fallback) between `book` and `stay`; the app-only `manage` route at `:82-89` is the shape |
| `app/src/App.vue:263-272` (`NAV_ITEMS`) | The visible eight-tab list: desk, rooms, manage, book, stay, folio, print, admin | One entry `{ name: 'bookings', to: '/bookings', labelKey: 'desk.shell.nav_bookings', fallback: 'Bookings' }` after `book`; the brand-only shrink rule and the tab markup are untouched |
| `app/src/App.test.ts:182-215` | The rendered tab list plus hrefs, eight tabs in order | Extended to nine with `Bookings` and `/app/bookings` between `Book` and `Stay`; every other entry keeps its text and href |
| `app/src/App.test.ts:379-405` (active-pill `it.each`) | Seven route/nav rows assert exactly one highlighted tab and one `aria-current="page"` | The implementation adds the `/bookings` → `shell-nav-bookings` row (or pins the active pill in the screen's own suite); the existing rows stay |
| `app/src/shell-restyle.test.ts:28-29` (`EN_NAV` / `VI_NAV`) | The EN and VI nav label arrays the restyle parity checks use | Both arrays follow the same nine-tab order with `Bookings` / `Sổ đặt phòng` after `Book` / `Đặt phòng` |
| `app/src/router.test.ts:155-179` | Per-route document titles including the app-only `manage` title, with `Object.keys(expected)` length 8 | Adds `bookings: { key: 'desk.shell.doc_title_bookings', fallback: 'Bookings' }` and moves the length to 9; print and the placeholder stay on the default title |
| `app/e2e/manage.spec.ts:72-75` | The served SPA's tab count (8), the `manage` label, and its active class | The count moves to 9 and the `manage` assertions stay; the bookings tab's own count, label, and active pill are `BM13`'s to assert |
| `app/e2e/design-facts.ts:509-533` (`NAV_TAB_ALLOWANCES`, `withNavTabAllowances`) | One committed allowance entry (`manage`, after `rooms`) and its deterministic insertion into the compared order | A second entry — route key `bookings`, `afterRouteKey: 'book',` labels `Sổ đặt phòng` / `Bookings`, design source `docs/design/Main.dc.html` — lands in the PR that first renders the tab; the mechanism is unchanged |
| `app/e2e/design-facts.spec.ts:640-661` | The nav-order comparison through `withNavTabAllowances` plus the per-allowance label check | Re-run, not edited: the gate compares the nine rendered tabs and every board screen unchanged |
| `docs/technical/desk-ui-fact-schema.md:257-317` (section 8) | The allowance rule text, with both entries declared and the consumer-entry sequencing (`manage` landed in PR #609 after schema PR #607) | Committed by the stack's architecture PR; the implementation PR implements the entry in `app/e2e/design-facts.ts` and does not re-word the schema |
| `app/src/views/DeskView.vue:531-535` | The board's local business date, the desk's anchor for "today" | The register's default range uses the shared helper below, never a second derivation |
| `app/src/stay-options.ts:50-55` (`localBusinessDate`) | The exported business-date helper Main, Stay, and the Print/Folio pickers already send | Reused for the default range and the in-house read's `businessDate`; the chosen range is never sent as the business date |
| `services/reservations/internal/store/store.go:191-193` (`overlaps`) | The overlap rule is `arrival < existingDeparture && departure > existingArrival` — a half-open window | The reason the screen sends `dateTo` = last night + 1 day; `BM3` asserts both boundaries against this rule |
| `services/reservations/internal/store/postgres.go:311-323` | The Postgres range read filters `arrival_date < $2 AND departure_date > $1` and carries no `ORDER BY` | Unchanged. `BM7` asserts the screen sorts, because neither read guarantees an order |
| `services/reservations/internal/store/store.go:275-291` | The in-memory `Query` iterates `s.byRef` (map order) and returns every overlapping entry | Unchanged. `BM7`'s seeded list returns rows in a shuffled order to prove the sort |
| `services/reservations/internal/handler/handler.go:161-181` | `GetReservation` replies with `reservationRef`, `roomTypeId`, the dates, `guest`, `priceBasis { totalMinor, discountName }`, `state`, and `stayId` | Unchanged. `BM5`/`BM12` read the guest and the frozen total from this reply and never reprice or re-derive the state |
| `services/reservations/internal/handler/handler_test.go:166-171` (`TestDeskLifecycleModifyCancelNoShowCalendar`) | The record read already answers reference, guest, price, and state on every entry (the calendar drill-down case) | Stays green unchanged; it is the service half of `FR-BMV-5` |
| `services/stay/src/server.ts:42-60` (`stayPayload`) | A stay row carries `stayId`, `roomId`, and `state` | Unchanged. This is the `stayId -> roomId` half of the assigned-room resolution |
| `services/stay/src/server.ts:157-165` (`ListArrivalsDepartures`) | The reply carries `arrivals`, `inHouse`, and `departures` for the business date | Unchanged. `BM6` asserts an empty `inHouse` is a legitimate answer (`—`), not a partial row |
| `services/stay/src/store.ts:432-440` | `inHouse` is `state === "in-house"` for the business date — a point-in-time read, not a range read (R15) | Unchanged. A `checked-in` booking whose `stayId` is absent reads `—` (`BM6`) |
| `services/rooms/src/server.ts:112-126` (`ListRoomsByState`) | `rooms[]` carries `roomId`, `number`, `roomTypeId`, and `state` | Unchanged. `BM5` resolves the in-house `roomId` to a number through the `occupied` lane |
| `app/src/views/DeskView.vue:1102-1130` | The board already reads `ListArrivalsDepartures { businessDate }` then the `ListRoomsByState` lanes | The register reads the same pair once per apply, stay read first; no second copy of the mapping |
| `app/src/stay-options.ts:85-153` | The existing pair plus `loadInHouseStayOptions`' per-stay `GetGuest` label loop (LLD 24.2) | The register extracts/reuses the map half only: calling `loadInHouseStayOptions` would pay a guest read per in-house stay. `BM5` asserts the absence of the `GetGuest` fan-out |
| `app/src/stay-options.ts:56-58` (`unknownGuest`) | The catalogue-backed `desk.today.unknown_guest` wording | Reused for a successful row read whose snapshot carries no usable `fullName` (a data defect, not a failed read, and not counted in the notice); never a raw `guestId` (the #372 rule) |
| `app/src/api/client.ts:143-202` (`apiFetch`) | Offline throws `code: "OFFLINE"` with no status (`:158-165`), `401` routes to the sign-in gate (`:168-169`), a non-envelope `!ok` reply surfaces the status as the code (`:185-199`) | The failure classes of LLD 24.3 read these fields; `BM10` pins the list failure and the 401 passthrough, `BM11` the partial classes |
| `app/src/views/DeskView.test.ts:582-606`, `:265` | A failed guest read renders the catalogue wording instead of a raw value; the departures row falls back to `Unknown guest` | The plain-words pattern `BM10`/`BM11` reuse; the board assertions stay green |
| `app/src/views/DeskView.test.ts:617` | The plain-words empty-state suite (no list invents a row) | The pattern `BM9` follows on the register |
| `app/src/views/ManageView.test.ts:279` | An app-only screen pins its own static content (`manage-view`) in its own suite, because no board carries it | The precedent `BM14` cites: the register has no board record, so its static content is pinned by its own unit and flow tests |
| `app/src/i18n/index.ts:165-171` (`formatVnd`), `:179-187` (`formatDeskDate`) | The desk money form (integer minor units, no decimals) and the `dd/mm/yyyy` date form | Every quoted total renders through `formatVnd` and every date through `formatDeskDate`; no new token and no new formatter (`BM5`, `BM15`) |
| `messages/en.json:713-714`, `messages/vi.json:713-714` | The `desk.shell.nav_manage` and `desk.shell.doc_title_manage` keys in both locales | The pattern for the two new shell keys; `BM15` requires both locales with matching placeholders |
| `app/src/views/BookView.vue:157-190`, `:948-952` | The app-locale date-picker treatment (Refs #581) and the confirmation `GetReservation` read | The filter's two pickers copy the treatment; the confirmation read is the same operation the detail re-reads fresh |
| `app/src/views/PrintView.vue:788-792`, `:1208-1212` | `ListRoomTypes` and `GetReservation` are already read from another desk screen | Confirms the five reads are an existing integration surface: no new client seam |
| `contracts/http/QueryCalendar.json`, `GetReservation.json`, `ListRoomTypes.json`, `ListArrivalsDepartures.json`, `ListRoomsByState.json` | The five operation shapes the register consumes, unchanged | No delta (LLD 24.7); the existing fixtures replay |
| `script/e2e-desk-loop.sh:299-314`, `:490-492` | The API book → `GetReservation` → `QueryCalendar` read-back that the desk loop already runs | The recipe the `BMV-*` owner cases and `BM-E1` reuse; a created booking is read back by reference and listed by range |
| `app/src/views/StayView.test.ts:350-2695`, `:2696-3310`; `app/src/views/desk-edge-guards.test.ts:912-1032`, `:1449-1700`; `app/e2e/stay.spec.ts:30-314`; `script/e2e-desk-loop.sh:342-348` | The #588/#600/#601/#646/#647 desk and stay behaviour the register only reads from | Stay green untouched; a desk flow edit in the implementation PR fails the desk-stay-green row |
| `script/catalogue-coverage-check.sh` | The catalogue parity gate (EN/VI coverage, placeholders, mirrors) | Run on every implementation PR; `BM15` is its `desk.bookings.*` half |

## 3. Guard registry BM1–BM16 and the evidence rule BM-E1

All sixteen guards are **missing at this spec head** and created by the
implementation PRs: `BM1`–`BM12` in `app/src/views/BookingsView.test.ts`
(new) plus the extended shell suites (`App.test.ts`,
`shell-restyle.test.ts`, `router.test.ts`), `BM13` in
`app/e2e/bookings.spec.ts` (new), `BM14` across
`app/e2e/design-facts.ts` and the gate run, `BM15` across
`messages/en.json`, `messages/vi.json`, and
`script/catalogue-coverage-check.sh`, and `BM16` in the extended shell
suite. `BM16` is the narrow-width nav block of product spec section 3
and of the `AC-BMV-1` / `AC-RST-1` re-baseline (D-29): its case exists
on the #689 implementation head (`app/src/App.vue:2735-2744`,
`app/src/shell-restyle.test.ts:118-133` with the band readers at
`:40-59`) and, as with every other row here, is absent from this
docs-only head and from `origin/master` until that PR lands. A register
guard is not complete
on a rendered sentence alone: every list guard also asserts the exact
call list (which of the five operations ran, in which order, how many
times) and the values it returned, because this screen composes five
reads and a cell can be right while the read behind it is wrong.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `BM1` | **Entry, route, and titles**: the ninth tab renders immediately after `Book` with `href` `/app/bookings` and the catalogue label in both locales; the `bookings` route carries `desk.shell.doc_title_bookings` with its fallback; the screen renders its title and the read-only intro from the catalogue; every other tab, the sign-in gate, and the print routes are unchanged | `app/src/App.test.ts` (extend `:182-215`), `app/src/shell-restyle.test.ts` (`:28-29`), `app/src/router.test.ts` (extend `:155-179`), `app/src/views/BookingsView.test.ts` |
| `BM2` | **Read-only surface and call set**: the suite's fetch stub accepts only the five read paths and fails the test on any other path, so no write operation can run; a sixth path (create, modify, cancel, no-show, check-in, check-out, room action, guest read) fails the case; the view source carries no direct reservation-store, database, or service-internal access; the screen renders no create, edit, cancel, no-show, check-in, check-out, or room control and no link into an edit flow | `app/src/views/BookingsView.test.ts` |
| `BM3` | **Default range and the inclusive-night mapping**: on entry the range is the business date through six nights after it, so the first apply sends `dateFrom` = business date and `dateTo` = business date + 7 days; a chosen range sends `dateFrom` = first night and `dateTo` = last night + 1 day; a booking staying the last night is listed and a booking departing on the first night is not (both boundaries asserted against the `overlaps` rule) | `app/src/views/BookingsView.test.ts` |
| `BM4` | **Validation, one read per apply, in-flight no-op, selection clear**: a last night before the first night and a missing field each render `range_invalid` naming the field and issue no request; one apply issues exactly one `QueryCalendar`; both fields and the action are disabled while the read runs and a second click issues nothing; every completed list read clears the selected row and the detail card | same file |
| `BM5` | **Row fields from the five reads**: a seeded list renders one row per booking staying in the range with guest name, reference, room type name, assigned room when in house, arrival, departure, nights, quoted total through `formatVnd`, and the state chip; one apply issues exactly one `QueryCalendar`, one `ListRoomTypes`, one `ListArrivalsDepartures` (business date from `localBusinessDate()`), one `ListRoomsByState('occupied')`, and exactly one `GetReservation` per capped row — and **no** `GetGuest` and no `loadInHouseStayOptions` call (no guest fan-out) | same file |
| `BM6` | **Assigned room by rule, never by guess**: a `confirmed` row reads `—` (a booking holds a type, not a room); a `closed` row reads `—` (no read exposes the departed guest's room, G4); a `checked-in` row whose `stayId` is absent from `inHouse`, or whose `roomId` is absent from the `occupied` lane, reads `—`; no raw room id or `roomTypeId` ever reaches the screen; an empty `inHouse` read is **not** counted as a partial row | same file |
| `BM7` | **Ordering and the 50-row cap**: rows sort by arrival date then reference whatever order `QueryCalendar` returned; a range with 51 bookings renders the earliest 50 plus one `capped` sentence carrying `{count}`, and the 51st booking issues **no** row read (the cap is applied before the fan-out); the same range reads the same 50 bookings on a re-run; at most 54 reads per apply (the in-house pair is two calls), asserted as the apply's total read count | same file |
| `BM8` | **State coverage and wording**: all five states (`confirmed`, `checked-in`, `closed`, `cancelled`, `no-show`) are listed with no state filter and no booking hidden; each renders its catalogue chip and never a raw state code; an unknown state reads the catalogue fallback and never prints the code; a `cancelled` / `no-show` row reads in the muted ink — the row scope and the guest-name action it contains, pinned at the source in `app/src/bookings-restyle.test.ts` because jsdom cannot resolve the stylesheet | same file, `app/src/bookings-restyle.test.ts` |
| `BM9` | **Empty range**: one muted sentence naming the applied range (the range the visible list was read for, never the pickers' current values) in the desk date form (`dd/mm/yyyy`) with no row invented, and the filter stays usable (a following apply issues one read); editing a picker or a refused inverted apply leaves the sentence on the range it last read | same file |
| `BM10` | **List read failure and retry**: an offline throw, a `5xx` envelope, and a non-envelope reply each render `read_failed` plus a `retry` action in catalogue words, invent no row (no zero-filled row, no `—`-only row set), surface no stack trace or envelope code, and leave the shell and the rest of the desk usable; the retry re-runs the same apply with the same range and issues exactly one `QueryCalendar`; a `401` rethrows to the sign-in gate and renders no local error | same file |
| `BM11` | **Partial rows and partial columns**: a failed per-row `GetReservation` keeps the row's calendar cells (reference, type from the map, dates, nights, state), reads `cell_unreadable` in the guest-name and total cells, is counted in one `desk.bookings.row_partial` notice, and is never dropped; a failed `ListRoomTypes`, in-house, or occupied read leaves the affected cells reading `cell_unreadable` and puts one `desk.bookings.column_partial` sentence naming that column's heading (`desk.bookings.col_room_type` or `desk.bookings.col_room`) in the notice above the list, never the row count sentence and never an invented or misreporting sentence (R18 closed); a **successful** type read that lacks a row's type id is that column's failure too, so it carries the same one sentence rather than an unexplained unreadable cell; neither partial class renders a retry action, because re-applying the range reads again; every other cell still renders; the empty-in-house case of `BM6` is the negative control that keeps "partial" honest | same file |
| `BM12` | **Detail read-back and detail failure**: selecting a row issues one fresh `GetReservation` and renders reference, guest, room type, assigned room, arrival, departure, nights, quoted total, the recorded discount name when the basis carries one, and the state chip — the values returned, with no recalculation, no repricing, and no state re-derived from the dates; the detail offers no action; a second selection replaces it and a new range clears it; the card is absent before any selection (no faked empty booking); a failed detail read renders `detail_failed` with `{ref}` plus a `retry`, leaves the list exactly as it was, and does not keep the previous detail as current | same file |
| `BM13` | **Browser read path on the served SPA**: a booking created through the Book screen or the API is found again on `/app/bookings` with its guest, room type, arrival, departure, and quoted total; its row opens and the detail re-reads the same booking; a far-future range shows the plain empty sentence; a route-intercepted failure renders the plain catalogue words with a usable retry; the tab count (nine), the `Bookings` label, position after `Book`, and the active pill are asserted; VI and EN screenshots are recorded | `app/e2e/bookings.spec.ts` |
| `BM14` | **Design facts and the unchanged boards**: `NAV_TAB_ALLOWANCES` carries the second entry — route key `bookings`, position after `book`, labels `Sổ đặt phòng` / `Bookings`, design source `docs/design/Main.dc.html` — matching the schema text of section 8; the gate's nav-order and per-allowance label checks pass with the nine rendered tabs; the seven board screens and the `manage` allowance stay green; no board file is edited and no new board is created; the screen's static content is pinned in its own unit and flow suites (the `manage` precedent) because it has no board record | `app/e2e/design-facts.ts`, `app/e2e/design-facts.spec.ts`, `app/src/views/BookingsView.test.ts` |
| `BM15` | **Catalogue parity**: all 41 keys of product spec section 9 exist in `messages/en.json` and `messages/vi.json` with their placeholders intact and their EN/VI pairs matching the table (39 `desk.bookings.*`, including the `{column}` placeholder in `desk.bookings.column_partial`, plus the two shell keys); the reused keys (`desk.book.reference`, `desk.book.night_count`, `desk.book.quote_total`, `desk.today.unknown_guest`) still resolve; no invented string stands in for a table key (the case fails on an invented key, not only on an absent one); `script/catalogue-coverage-check.sh` is green | `messages/en.json`, `messages/vi.json`, `script/catalogue-coverage-check.sh` |
| `BM16` | **Narrow-width nav spacing, both bands pinned**: the shell suite reads the narrow band with its own reader (`narrowBandSource` / `narrowRuleBody` scoped from the `@media screen and (max-width: 1279px)` opener) instead of the first-match `ruleBody`, so the tightening override can never be read as the design value and a missing band fails closed; the case asserts the base `#shell .shell-nav` body still carries `gap: 8px` and the `#shell .shell-nav-item` body still carries `padding: 10px 16px` (the `1280px`-and-wider design values), and that inside the band `#shell .shell-nav` reads `gap: 4px` and `#shell .shell-nav-item` / `#shell .shell-nav-item.shell-nav-active` read `padding: 10px 12px`; the label, the `10px` vertical padding, the `44px` minimum height, the `8px` radius, the active-tab inversion, the locale pill, the session control, and the brand-only shrink rule are asserted unchanged in both bands; a dropped band, a moved breakpoint, or a value flipped between the bands fails the case, and a first-match read of the narrow block is the negative control that fails it | `app/src/shell-restyle.test.ts` (extend the R1 shell suite; the case and its readers sit at `:40-59` and `:118-133` on the #689 head against `app/src/App.vue:534`, `:573`, `:2735-2744`) |
| `BM-E1` | **Evidence rule**: the implementation PR records the live read-path check (a booking created through the desk appears on `/app/bookings` with its guest, type, dates, and total, and the detail re-reads the same booking), the before/after pair in `docs/testing/evidence/648/README.md` (before: no screen lists bookings and staff read one reference at a time; after: the row and the read-back), the nine-tab `1200px` measurement in both locales plus the narrow band either side of the breakpoint (`1279px` and `1280px`) in both locales, so the record shows the design spacing returning at `1280px` and the decided narrow values holding at `1279px` with no label wrapped or truncated, and the owner's screen review recorded on the issue (`owner-review`, `AC-BMV-7`); the slice is recorded in `docs/testing/test-report.md` (exit criterion 6 of `test-strategy.md` section 3) | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row except the desk-green row, which is
covered today by pins that exist and pass and must keep passing
untouched. For a pending row the guard does not exist at this spec
head: the implementation PR creates it, and `qa-lead` re-pins the row
with `file:line` at the merged head and flips it to covered only when
the guard passes.

| Item | Required guard | Guard |
|---|---|---|
| `AC-BMV-1` — the bookings tab sits immediately after `Book`, opens `/app/bookings` inside the unchanged shell, with the tab label, route title, screen title, and intro resolved through the catalogue in the active locale, the nine-tab row inside the `1200px` content width, the design nav spacing (`8px` inter-tab gap, `10px 16px` tab padding) from a `1280px` viewport and wider and the decided narrow spacing below it (`4px` gap, `10px 12px` padding, with the label, height, `44px` target, radius, and inversion unchanged; D-29), and every other route, gate, and print surface behaving as before | L1 acceptance: route, tab, titles, both width bands | **Pending** — `BM1`, `BM3` (default range on entry), `BM16` (the narrow block's own rule-body assertion, so the base design values cannot be read for the override), `BM-E1` (the `1200px` measurement plus the `1279px`/`1280px` pair, all in both locales); today's eight-tab pins are `app/src/App.test.ts:182-215`, `app/src/shell-restyle.test.ts:28-29` (the first-match reader only, so it cannot see the narrow band), `app/src/router.test.ts:155-179`, `app/e2e/manage.spec.ts:72-75` |
| `AC-BMV-2` — every booking staying at least one night in the range is listed once, ordered by arrival then reference, each row carrying guest, reference, room type, assigned room when in house and a plain placeholder otherwise, arrival, departure, nights, quoted total, and the state chip; never invented or silently dropped, and more than 50 renders the earliest 50 with one sentence | L1 acceptance: row fields, order, cap, assigned-room rules | **Pending** — `BM5`, `BM6`, `BM7`, `BM8`; the service halves exist at `services/reservations/internal/handler/handler.go:161-181`, `services/stay/src/server.ts:157-165`, `services/rooms/src/server.ts:112-126` and stay green |
| `AC-BMV-3` — an applied inclusive night range lists only bookings staying at least one night in it (`dateFrom` = first night, `dateTo` = last night + 1 day), the list re-reads once with the fields and action disabled, the selection and detail clear, and an inverted or missing range names the field and sends nothing | L1 acceptance: both boundaries, one read per apply, validation | **Pending** — `BM3`, `BM4`; the contract rule is pinned today at `services/reservations/internal/store/store.go:191-193` and `services/reservations/internal/store/postgres.go:311-323` |
| `AC-BMV-4` — an empty range shows one plain catalogue sentence naming the range in the desk date form, invents no row, and leaves the filter usable | L1 acceptance: wording plus the usable filter | **Pending** — `BM9`, with the wording pattern at `app/src/views/DeskView.test.ts:617` |
| `AC-BMV-5` — selecting a row reads the booking back with `GetReservation` and shows reference, guest, room type, assigned room, arrival, departure, nights, quoted total, the recorded discount when present, and the state — read back, never re-derived, with no write action; another selection replaces it and a new range clears it | L1 acceptance: read-back fields, no re-derivation, selection rules | **Pending** — `BM12`; the read shape is pinned today at `services/reservations/internal/handler/handler.go:161-181` and `services/reservations/internal/handler/handler_test.go:166-171` and stays green |
| `AC-BMV-6` — a failed read follows its class: a failed list or detail read is one plain catalogue sentence with a retry; a failed per-row, room-type, in-house, or occupied-room read keeps every row it can, the affected cells say they could not be read instead of a guessed value, and one notice above the list counts the incomplete rows and names each failed column in its own sentence, with no retry action because re-applying the range reads again; no booking is dropped, no stack trace or code is shown, and the rest of the desk remains usable | L1 acceptance: the whole failure matrix | **Pending** — `BM10`, `BM11`, `BM12` (detail half); the client classification is pinned at `app/src/api/client.ts:143-202`; both partial-class sentences are now worded (`desk.bookings.row_partial`, `desk.bookings.column_partial`), so the row asserts the distinct keys rather than an open R18 gap |
| `AC-BMV-7` — the screen offers no write action and calls only the five existing operations with no direct database or store access, every new string exists in both catalogues with matching placeholders and the catalogue check is green, the design-facts gate records the app-only tab with every board screen green, and the owner has reviewed the built screen | L1 + call-set + catalogue + design-facts + owner evidence | **Pending** — `BM2` (call set and no write), `BM15`, `BM14`, `BM-E1` (owner review recorded) |
| `FR-BMV-1` — one read-only booking register in the shared desk shell: tab after `Book`, `/app/bookings`, catalogue-resolved label, title, and intro, every other tab and route unchanged, the shell's one decided exception below a `1280px` viewport (inter-tab gap `8px` -> `4px` and tab side padding `10px 16px` -> `10px 12px`, while `1280px` and wider keep the design values and the label, `10px` vertical padding, `44px` target, `8px` radius, active-tab inversion, locale pill, session control, and brand-only shrink rule are unchanged in both bands; D-29), the design token set gaining nothing, and no write action or edit link anywhere (section 25.3) | L1 acceptance + a no-write assertion + both nav bands | **Pending** — `BM1`, `BM2`, `BM16` (each band read through its own rule-body reader, because the first-match reader reads the design value for the override), `BM-E1` (the `1200px` measurement plus the `1279px`/`1280px` pair, all in both locales); no guard on disk |
| `FR-BMV-2` — every booking staying at least one night is listed once with the desk's facts, ordered by arrival then reference, every state listed, at most 50 rows with the narrow-the-dates sentence, assigned room only when in house, a per-row failure kept and stated, and nothing invented or dropped (section 25.3) | L1 acceptance: fields, order, cap, states, assigned room, partial row | **Pending** — `BM5`, `BM6`, `BM7`, `BM8`, `BM11`; no guard on disk |
| `FR-BMV-3` — the night filter is inclusive and maps `dateFrom`/`dateTo` as above, one read per apply with fields and action disabled and a repeated click a no-op, the selection clears on every list read, an invalid range sends nothing, and the range length is uncapped (section 25.3) | L1 acceptance + call-count assertion | **Pending** — `BM3`, `BM4`; the `overlaps` rule it depends on is `services/reservations/internal/store/store.go:191-193` |
| `FR-BMV-4` — an empty range is one plain sentence naming the range in the desk date form, with no row invented and a usable filter (section 25.3) | L1 acceptance | **Pending** — `BM9`; no guard on disk |
| `FR-BMV-5` — a selected row opens the fresh read-back detail with the record's values (reference, guest, type, room, dates, nights, total, recorded discount, state), no recalculation or re-derivation, no action, replace on a second selection, clear on a new range, and no card before a selection (section 25.3) | L1 acceptance: read-back plus the selection rules | **Pending** — `BM12`; the record read is pinned at `services/reservations/internal/handler/handler.go:161-181` and must stay green |
| `FR-BMV-6` — a failed list or detail read is one plain sentence naming what could not be read with a retry action; a failed per-row, room-type, in-house, or occupied-room read keeps every row it can, the affected cells state they are unreadable instead of a guessed guest, amount, room, or type, and one notice above the list counts the incomplete rows and names each failed column in one plain sentence, with no retry action of its own because re-applying the range reads again; no booking is dropped, no stack trace or envelope code surfaces, the desk stays usable, and a failed detail read keeps the list and does not keep the old detail as current (section 25.3) | L1 acceptance: failure matrix at unit level | **Pending** — `BM10`, `BM11`, `BM12`; the client's offline/`401`/non-envelope split is `app/src/api/client.ts:143-202` |
| `FR-BMV-7` — the register calls only the five operations with the signed-in session, with no database, reservation-store, or service-internal access and no new operation; no write action; every new string in both catalogues with matching placeholders and the catalogue gate green; the design-facts gate records the app-only tab with every board green; the owner reviewed the built screen (section 25.3) | L1 + call-set + catalogue + design-facts + owner evidence | **Pending** — `BM2`, `BM15`, `BM14`, `BM-E1`; no guard on disk for the call set or the owner record |
| Desk screens stay green (`AC-DSK-*`, `AC-CKO-*`, `AC-DEP-*`, `AC-REA-*`) | Behaviour check: the board, Book, Stay, Folio, Print, Rooms, and Manage screens keep their words, calls, and flows; no desk flow they pin changes | **Covered by re-run at this spec head** — `app/src/views/StayView.test.ts:350-2695`, `:2696-3310`, `app/src/views/desk-edge-guards.test.ts:912-1032`, `:1449-1700`, `app/e2e/stay.spec.ts:30-314`, `script/e2e-desk-loop.sh:342-348`, plus the board, Book, Rooms, Manage, Folio, Print, and Admin unit suites. These must pass unchanged after the implementation PR; a flow edit fails the row |
| Contract and LC | Re-run only: the five operations keep their shapes, no error code is added, and the existing fixtures replay unchanged | **Pending gate** — `contracts/http/QueryCalendar.json`, `GetReservation.json`, `ListRoomTypes.json`, `ListArrivalsDepartures.json`, `ListRoomsByState.json`, `contracts/errors/envelope.json`, `services/reservations/contract-tests/`, `services/stay/contract-tests/`, `services/rooms/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a contract delta here is a re-tier finding (LLD 24.7, 24.9) |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-RES-5` gains only the amendment pointer and `AC-RES-5` the `AC-BMV-2`/`AC-BMV-5` pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged in `traceability-matrix.md` and no MVP row cites this slice as its guard |
| Evidence cross-reference (`BM-E1`) | The live read path, the before/after pair, the `1200px` measurement, the `1279px`/`1280px` pair in both locales, and the owner's screen review are recorded | **Pending** — `docs/testing/evidence/648/README.md` and the `test-report.md` row are created by the implementation PR; the owner review is recorded on #648 |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 24.8](../architecture/lld.md)) |
|---|---|---|
| L1 desk unit, new screen | `BM1`–`BM12` in `app/src/views/BookingsView.test.ts` | `cd app && npm ci && npm run build && npm run lint && npm test` (CI `app-build`) |
| L1 desk unit, extended shell pins | `BM1`'s tab, label, and title cases in `App.test.ts`, `shell-restyle.test.ts`, `router.test.ts`, and `BM16`'s narrow-band rule-body case in `shell-restyle.test.ts` | same command |
| L1 service, green half | The five operations' existing suites, unchanged (Reservations Go, Stay Node, Rooms Node) | `cd services/reservations && go build ./... && go test ./...`; `cd services/stay && npm ci && npm run build && npm test`; `cd services/rooms && npm ci && npm run build && npm test` |
| LC contract | The five unchanged operation fixtures and the desk seams | `script/contract-check.sh`, `script/openapi-route-check.sh` |
| Desk browser | `BM13` on the served SPA, plus the existing screen specs and the `manage` tab-count pin moved to nine | CI `browser-e2e` |
| Design facts | `BM14`: the second allowance entry against the seven boards | the design-facts specs in CI `browser-e2e` (the extractor step plus the Playwright step in `.github/workflows/ci.yml`); CI `dom-diff` must stay green with the seven boards unchanged |
| Live desk loop and lab | The book → list → detail read path and the `BMV-*` recipes | `script/e2e-desk-loop.sh` (CI `e2e-single-host`); the isolated-compose lab for the evidence record |
| Gates | Catalogue, links, harness conventions | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `app-build`,
`browser-e2e`, `dom-diff`, `contract-check`, `e2e-single-host`, and
`ci` (which runs the catalogue coverage, link, and harness-convention
checks). The service jobs (`go-build`, `node-build`) are path-filtered
and do not run for a desk-only change; when the implementation PR
touches no service file they stay skipped, and a service edit in that
PR is a scope finding rather than an expected path.

### Execution order

1. The green half: the five operations' existing suites. They must pass
   untouched before the register cases are read, because the register
   consumes their behaviour and adds no service code.
2. Contract and route checks (the re-run must prove the no-change
   statement).
3. Desk unit suite (`BM1`–`BM12`) and the extended shell pins (`BM1`,
   `BM16`). A red `BM*` case stops the run.
4. Desk browser suite (`BM13`) and the design-facts run (`BM14`).
5. `BM-E1`: the live read path, the before/after pair, the `1200px`
   measurement, the `1279px`/`1280px` pair, and the owner review.
6. Catalogue, link, and harness-convention gates, then the
   test-report row.

### Entry criteria

1. The #648 T2 spec set (`docs/product/acceptance-criteria.md`
   section 17, `docs/product/booking-management-view.md`,
   `docs/product/desk-ui-design-rollout.md` section 6.18,
   `docs/requirements/mvp-requirements.md` section 25,
   `docs/architecture/lld.md` section 24,
   `docs/technical/desk-ui-fact-schema.md` section 8, and this
   document) carries a `SPEC-GATE PASS` on #648 / the spec stack.
2. The #646/#647 desk work and #673 are merged (all on `origin/master`
   at this spec head), so the section 2 pins are the real baseline.
3. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture
   method, `docs/testing/evidence/588/README.md`).

### Exit criteria

1. `BM1`–`BM16` exist and pass; every list case also asserts the exact
   call list and the values returned, and `BM2` proves no path outside
   the five reads can run. `BM16` pins both nav bands, so neither the
   design values nor the narrow override can pass on the other's
   assertion.
2. Every pin in section 2 passes unchanged — no dropped shell
   assertion and no board-screen edit; the eight-tab pins moved to
   nine rather than relaxed.
3. The contract stage is green with no contract delta.
4. `BM-E1` is recorded: the live read path, the before/after pair in
   `docs/testing/evidence/648/README.md`, the `1200px` measurement and
   the `1279px`/`1280px` pair in both locales, the owner review on
   #648, and the slice row in
   `docs/testing/test-report.md`.
5. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
   section 4 at the merged head and flipped the rows.
6. Open failures are filed as issues with FR/NFR ids; no
   `risk-medium` failure is waived without owner approval.

### Negative controls

A guard that only checks the rendered sentence is insufficient.

- `BM2` asserts the call set, so a screen that renders the right rows
  while also calling a write operation fails. The five-read assertion
  is the `AC-BMV-7` no-write guard, not a comment.
- `BM3` asserts **both** boundaries — a booking departing on the first
  night is excluded and a booking staying the last night is included.
  A single-direction case passes an off-by-one mapping, which is this
  slice's defect shape (the half-open contract window).
- `BM5` asserts the read counts, including the absence of `GetGuest`
  and `loadInHouseStayOptions`: a register that reused the stay-picker
  helper would render correctly while paying a guest read per in-house
  stay (LLD 24.2).
- `BM6` and `BM11` keep `—` (absent by rule) and `cell_unreadable`
  (absent by failure) in separate cases, so a read failure can never
  read as a legitimate absence; `BM6`'s empty-in-house case is the
  counter-case that keeps "partial" from swallowing an empty answer.
- `BM7` asserts the 51st booking issues no row read: a slice applied
  after the reads would pass on the rendered rows while leaving the
  fan-out unbounded.
- `BM8` asserts all five states plus the unknown fallback: a chip that
  prints a raw code passes a one-state guard.
- `BM10`'s retry case asserts a second `QueryCalendar` for the same
  range, so a retry affordance that renders but issues nothing fails.
- `BM11` fails a notice that merges the two partial classes: the row
  class is the counted `desk.bookings.row_partial` sentence, and each
  failed shared-map column gets its own `desk.bookings.column_partial`
  sentence naming that column's heading; a retry control on either
  partial class also fails, because re-applying the range is the retry.
- `BM13` triggers the failure with route interception on the served
  SPA, so the plain words are proven in the browser and not only in
  jsdom.
- `BM15` fails an invented key, not only an absent one; a screen
  holding a hard-coded sentence where a table key belongs fails even
  when it renders correct copy.

## 6. Owner verification cases (BMV-1..BMV-9)

Plain-language cases the owner can run on the lab once the change
lands, using the `script/e2e-desk-loop.sh:299-314` recipe (sign-in
token, a seeded room type, a booking with a guest and a price) plus the
desk. Steps are the same for each case unless stated: seed at least
two bookings with different room types, one checked in for today, and
read the row, the detail, and the API's `GetReservation` reply.

| Case | Setup | Expected |
|---|---|---|
| `BMV-1` | Sign in and read the tab row; open `Bookings`; switch the locale | Nine tabs, `Bookings` / `Sổ đặt phòng` immediately after `Book`, the screen title and the read-only intro in the active locale, the row inside the 1200px content width with no tab wrapped or truncated, the design nav spacing at `1280px` and the decided narrow spacing at `1279px` (labels, heights, and targets unchanged in both), and every other tab and the print routes unchanged |
| `BMV-2` | Open the screen on its default range (business date through six nights) | One row per booking staying in that range with guest, reference, room type, assigned room (in house only), arrival, departure, nights, quoted total, and state; rows ordered by arrival then reference |
| `BMV-3` | Book A arriving Tuesday and departing Wednesday (it departs on the first night), and B arriving Wednesday and departing Thursday (it stays the last night); set Wednesday as both the first and the last night, then apply | B is listed; A is not. That is the inclusive-night mapping in one glance: the night of the last night is in range, and a booking that leaves on the first night is not |
| `BMV-4` | Set the last night before the first night and apply | One plain sentence naming the field, nothing sent (no list change, no spinner), and the previous list still readable |
| `BMV-5` | Select a row, then select another, then apply a new range | The detail shows the record the API returned — reference, guest, type, room, dates, nights, total, the discount name when one was recorded, and the state — with no action button; the second selection replaces it; the new range clears it |
| `BMV-6` | Stop the reservations service, apply; then stop the rooms service and apply; then fail only one row's read | First: one plain read-failed sentence with a retry, no invented rows, the rest of the desk usable. Second: the affected cells say they could not be read and one notice sentence names the failed column; there is no retry control — applying the range again reads again. Third: the row keeps its calendar fields, its guest and total say they could not be read, and it is counted in the row-partial notice |
| `BMV-7` | Apply a range with no bookings (a far-future week) | One muted sentence naming the range in `dd/mm/yyyy`, no row, and the filter still usable |
| `BMV-8` | Seed 51 bookings (API loop) in one range and apply | The earliest 50 render, the count sentence names 50 and asks to narrow the dates, and the 51st booking is not read (no detail, no row) |
| `BMV-9` | Read the screen for write affordances and re-read it in both locales at `1200px`, `1279px`, and `1280px` | No create, edit, cancel, no-show, check-in, check-out, or room control and no edit link; every string in EN and VI with its values filled; the nine-tab row measured in both locales at all three widths and recorded in the evidence note, with the narrow values at `1279px` and the design values returning at `1280px`; the owner's acceptance recorded on #648 |

## 7. Evidence rule BM-E1

The implementation PR records, in `docs/testing/evidence/648/README.md`
(created by that PR, same capture method as the #588 record):

- **The live read path.** A booking created through the desk is found
  again on `/app/bookings` with its guest, room type, arrival,
  departure, and quoted total, and selecting its row re-reads the same
  booking through `GetReservation` — the reply values and the rendered
  detail side by side. The API half reuses the loop's
  `CreateReservation` → `GetReservation` → `QueryCalendar` read-back
  (`script/e2e-desk-loop.sh:299-314`).
- **Before/after.** Before: the desk has no screen that lists bookings
  and staff read one reference at a time (the owner's 2026-11-10
  report). After: one row per booking for the chosen range with guest,
  reference, type, assigned room, dates, nights, total, and state, plus
  the read-back detail. The record confirms or corrects that
  description rather than repeating it.
- **The ninth tab across the width bands.** The measured nine-tab row
  in both locales at `1200px`, the design column, and at the pair
  either side of the breakpoint (`1279px` and `1280px`), with the tab,
  locale pill, and session control unsized and the brand as the only
  shrinkable item (product spec section 3, risk register R-12). At
  `1280px` and wider the record shows the design `8px` gap and
  `10px 16px` tab padding; at `1279px` it shows the decided narrow
  values (`4px` gap, `10px 12px` padding, D-29) with no label wrapped
  or truncated. An overflow at either width is an owner decision, never
  a silent truncation, and the narrow block's rule-body case (`BM16`)
  is the automated half of the same evidence.
- **The owner's screen review.** The owner reviews the built screen
  against the v2 design boards and the state list, and the acceptance
  is recorded on #648 (the issue carries `owner-review`); the screen
  has no board of its own, so the review is against the boards it
  borrows from (the shell tab pattern, the card-and-row list, the state
  chip, the Book date picker).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of `test-strategy.md` [section 3](test-strategy.md)), on the
section 1 pattern.

## 8. Slice status and re-pin rule

At this spec head: 18 rows mapped, 1 covered by re-run only (the
desk-stay-green row — its pins exist and pass today and must keep
passing), and 17 pending rows whose guards are the registry
`BM1`–`BM16` plus the contract/LC gate, the MVP no-change gate, and
`BM-E1`. The slice is **not complete**. It completes when the
implementation PRs merge with `BM1`–`BM16` green, the section 2 pins
unchanged, `BM-E1` recorded with the owner review on #648, and
`qa-lead` re-pins every row in section 4 with `file:line` at the merged
head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a fabricated
pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1016
