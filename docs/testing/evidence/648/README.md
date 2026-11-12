# #648 Booking management desk view — evidence

Evidence record for
[issue #648](https://github.com/MingChen1501/hotel-mgmt/issues/648)
(`AC-BMV-1`..`AC-BMV-7`, `FR-BMV-1`..`FR-BMV-7`, guard registry
`BM1`–`BM15`, rule `BM-E1`; traceability
`docs/testing/booking-management-view-test-traceability.md`). The
screen spec is `docs/product/booking-management-view.md`; the flow
diagrams are `docs/architecture/lld.md` section 24.

## What the change is

One read-only desk screen at `/app/bookings` with one tab immediately
after `Book` (`Sổ đặt phòng` / `Bookings`). It reads five operations
that already exist — `QueryCalendar`, `GetReservation`,
`ListRoomTypes`, `ListArrivalsDepartures`, `ListRoomsByState` — and
writes nothing. No backend, contract, schema, event, or migration
change; rollback is one revert.

## Before / after

**Before** (owner manual QA 2026-11-10, translated): the desk has no
booking-management view. `BookView` ends at its confirmation, and no
screen lists existing bookings across dates, so staff answer "who
booked which room, for which dates, at what price" only by reading one
record at a time. There is no screen to screenshot: the master route
table registers desk, book, stay, onboarding, rooms, manage, folio,
print, and admin and nothing that lists bookings
(`app/src/router.ts`), and the visible nav renders eight tabs
(`app/src/App.test.ts`). The "before" pair is therefore the record of
the missing surface, not an image of it.

**After**: one row per booking staying at least one night in the
chosen range, ordered by arrival then reference, capped at 50, each
row showing guest, reference, room type, assigned room when the guest
is in house (otherwise `—`), arrival, departure, nights, quoted total,
and the state chip; a row opens the fresh `GetReservation` read-back
under the list; an empty range is one plain sentence naming the range
in the desk date form; a failed read is plain catalogue wording with a
retry.

## Captures

| File | Shows |
|---|---|
| `bookings-register-vi-en.png` | The register with three bookings and the read-back detail card open. Left VI, right EN, same fixture data; the selected row carries the 3px primary-accent left rule and the ink weight with every column still on the header's grid (the offset sits inside the guest cell, not on the row), and the state chips are the neutral chip surface (`In house` / `Đang lưu trú`, `Booked` / `Đã đặt`, `Cancelled` / `Đã huỷ`). |
| `bookings-empty-vi-en.png` | The empty range: one muted sentence naming both nights in `dd/mm/yyyy`, no invented row, filter still usable. Left VI, right EN. |
| `measurements.json` | The rendered shell measurement in both locales at the desk kiosk width (1280px viewport, `1200px` content column) and in the design's 1200px band: nine tabs, no wrap, and no horizontal overflow of the tab row (`scrollWidth == clientWidth`). |

Capture method: this branch's `app/dist` (built with `npm run build`,
not hand-edited) served by `vite preview`, rendered in Chromium
(Playwright 1.64.1) at the desk kiosk viewport 1280x800, desk locale
switched through the shell pill, element screenshots of
`[data-testid="bookings-view"]`, paired across a 20px gutter with a
label bar. The five register reads are answered with fixture data for
the capture (guest names, references, and totals are illustrative), so
these images evidence the **rendered screen and its stylesheet**, not
the live read path. The live read path is proven separately below.

## Nine tabs and the header width (R-12)

The tab is app-only, so the header row has to carry nine tabs plus the
brand, the locale pill, and the session control inside the desk
design's width. Measured on the built shell (`measurements.json`, both
the app font and a wide fallback font so host font-metric differences
are covered):

| Viewport | Gap | Brand (VI / EN, app font) | Brand (VI / EN, wide fallback) | Overflow |
|---|---|---|---|---|
| 1200 | 4px | 72px / 120px | 37px / 137px | none (`scrollWidth == clientWidth`) |
| 1279 | 4px | 120px / 120px | 116px / 137px | none |
| 1280 | 8px (design) | 36px / 120px | 1px / 137px | none |
| 1366 | 8px (design) | 120px / 120px | 87px / 137px | none |

At the 1200px band the VI row does not fit at the design's 8px gap: the
brand is already fully shrunk (the design's only shrinkable item) and
the session control spilled past the bar, which the `signin.spec.ts`
header pin catches. The owner's decision — the
[screen/gap note on #648](https://github.com/MingChen1501/hotel-mgmt/issues/648#issuecomment-6809532757)
— is to tighten the spacing rather than change the label, so below a
1280px viewport the nav gap goes 8px → 4px and each tab keeps 12px side
padding instead of 16px (`app/src/App.vue`, pinned by
`app/src/shell-restyle.test.ts`). Every tab, the locale pill, and the session
control keep their size, the brand stays the only shrinkable item, and
1280px and wider keep the design gap and padding exactly. The label is
unchanged (`Sổ đặt phòng` / `Bookings`).

## Live read-path evidence (`BM-E1`)

- **Browser read path, CI `browser-e2e`** — `app/e2e/bookings.spec.ts`:
  a booking created through the public contract (`setupFlowContext` →
  `QuotePrice` → `CheckRoomTypeSellability` → `CreateReservation`) is
  found again on `/app/bookings` with its guest, room type, arrival,
  departure, nights, and quoted total; its row opens and the detail
  re-reads the same booking; a far-future range shows the plain empty
  sentence; a route-intercepted `QueryCalendar` failure renders the
  plain read-failed sentence with a usable retry; the tab count (nine),
  the `Bookings` label, its position after `Book`, and the active pill
  are asserted.
- **Desk unit guards, CI `app-build`** — `app/src/views/BookingsView.test.ts`
  (`BM1`–`BM12` plus the catalogue half of `BM15`) asserts every list
  guard together with the exact read call list: one `QueryCalendar`,
  one `ListRoomTypes`, one `ListArrivalsDepartures` on the business
  date, one `ListRoomsByState("occupied")`, one `GetReservation` per
  capped row, and no `GetGuest` (no guest fan-out). The fetch stub
  accepts only the five read paths, so any write operation fails the
  suite (`BM2`).
- **Shell pins moved, not relaxed** — `app/src/App.test.ts`,
  `app/src/shell-restyle.test.ts`, `app/src/i18n/locale-switch.test.ts`,
  `app/src/router.test.ts`, `app/src/shell-titles.test.ts`, and
  `app/e2e/manage.spec.ts` carry the nine-tab row, the route, and the
  document titles.
- **Design facts** — `app/e2e/design-facts.ts` now declares the second
  app-only allowance (`bookings`, after `book`, `Sổ đặt phòng` /
  `Bookings`, source `docs/design/Main.dc.html`), matching
  `docs/technical/desk-ui-fact-schema.md` section 8. The gate runs in
  CI `browser-e2e` with the `dom-diff` job; every owner board screen is
  unchanged and no board file is edited.
- **Catalogue** — `script/catalogue-coverage-check.sh` green: the 41
  keys of product spec section 9 exist in both catalogues with matching
  placeholders, and the eight runtime mirrors are byte-identical.

## Review follow-ups (PR #689)

The read-only review of the first implementation head raised four
code-level findings; each is fixed with its own guard, and the
spec-doc half of the shell decision is a separate change.

- **Empty sentence (S1).** The sentence now names the *applied* range —
  stored when the read starts — not the pickers' live values, so editing
  a picker or a refused inverted apply cannot reword a list nobody
  re-read. `BM9` pins the exact sentence and both negative cases.
- **Read bound (S2).** The in-house pair is two calls, so one apply is at
  most 54 reads. `BM7` now asserts the apply's total read count, and the
  qa-lead row states 54.
- **Inactive row ink (S3).** A cancelled or no-show row mutes its guest
  name too, not only the inherited text; pinned at the source in
  `app/src/bookings-restyle.test.ts` because jsdom cannot resolve the
  stylesheet.
- **Detail total (G2) and missing type id (G4).** A read-back without a
  total reads the unreadable wording instead of `0 đ`, and a successful
  type read that lacks a row's id names the room-type column instead of
  showing an unexplained unreadable cell.
- **Touch targets (G5).** `app/src/bookings-restyle.test.ts` pins the two
  filter actions and the row action at the 44px target.

### Second review (head `ae7261d`)

- **Empty in-house negative control (B1).** `BM6` now seeds `inHouse: []`
  with one `checked-in` row: the Room cell reads `—` and neither a
  `bookings-column-partial` nor a `bookings-row-partial` notice renders,
  so an empty answer can never be counted as a failed column. The same
  case also asserts that re-applying the same range reads the same 50
  bookings, the other registry claim that had no case.
- **Selected-row alignment (S1).** The 10px offset moved from the grid
  row into the guest cell, so the selected row's columns stay on the
  header and sibling-row tracks; `app/src/bookings-restyle.test.ts` pins
  the row rule as the 3px inset only and the offset inside the guest
  cell, and the register capture above was regenerated from this head.
- **LLD read bound (S2).** `docs/architecture/lld.md` section 24.7 G2
  now states at most 54 reads per apply (the in-house pair is two
  calls), matching `BM7`, the traceability row, `docs/testing/test-report.md`,
  and this record.

## Owner review

The screen carries `owner-review`. It has no board of its own, so the
review is against the boards it borrows from: the shared shell and tab
pattern (`docs/design/Main.dc.html`), the card-and-row list treatment,
the neutral state-chip shape, and the Book screen's app-locale date
pickers. The owner note on #648
([screen/gap decision](https://github.com/MingChen1501/hotel-mgmt/issues/648#issuecomment-6809532757))
records the header-overflow decision above and its acceptance of that
point; the full screen acceptance rides on the implementation PR review.
