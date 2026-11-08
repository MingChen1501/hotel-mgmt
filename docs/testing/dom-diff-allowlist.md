# DOM diff dynamic-data allowlist (Closes #482)

Status: active. Owner-approved dynamic-data exemptions for the
node-by-node DOM diff gate (`app/e2e/dom-diff.ts` plus
`app/e2e/dom-diff.spec.ts`, Closes #480), owned by `qa-lead`.
The gate diffs the owner design HTML (`docs/design/*.dc.html`)
against the running desk UI node-by-node; nodes carrying dynamic
data (dates, counts, names) would otherwise fail on every run, so
they are exempted only through this allowlist. No exemption exists
outside this document: when the gate exempts a node, the exemption
is traceable to an entry in section 3, and section 5 states the
owner-approval path to add one. Docs only; no product behaviour
change, no gate script change, no CI workflow change.

Design source is the v2 7-board bundle (bundle 07-11, Closes #538):
`docs/design/*.dc.html` plus the board order in
`docs/design/manifest.json` (Main, Stay, Onboarding, Rooms, Book,
Folio, Admin). Each v2 file is a bundler shell; the gate design
side is the decoded design markup (the extractor decodes the
embedded template payload, Refs #548, PR #551) — the raw shell
bytes never enter a diff. The gate covers the six boards with a
running app screen; the seventh board (Admin) has no app screen
yet and is deferred, never allowlisted (section 2 records the
disposition, Refs #546, Refs #549).

## 1. Rule

The gate exempts dynamic data only via the owner-approved
allowlist in section 3. Concretely:

- Every `skipPaths` entry wired into the gate MUST cite one entry
  ID from section 3 (e.g. `DD-01`) in a code comment next to it.
- A diff on an allowlisted node path is a gate-harness bug, not a
  product regression: it means the hook or the entry drifted.
- A diff on a non-allowlisted node is a real gate failure, even
  when the text looks "obviously dynamic" (a date, a count, a
  name). The fix is to propose an entry via section 5, never to
  widen the hook or to edit the design files.

## 2. How the gate references this document

The hook lives in `app/e2e/dom-diff.ts` and this module only owns
the mechanism; the approved data list lives here:

- `DomDiffAllowlist.skipPaths`: each entry is a node path of the
  form `/html[0]/body[0]/...`. An entry exempts that node and its
  whole subtree (the entry itself plus anything under
  `entry + '/'`).
- `isAllowlisted(path, allowlist)`: the prefix check the diff
  applies on both sides (design nodes in section order first,
  then app-side extras).
- `unusedAllowlistEntries(design, actual, allowlist)`: reports
  entries that match zero nodes on either side. The gate logs
  these as warnings; a stale entry (after unrelated structural
  drift) silently stops exempting anything, so a warning here is
  the signal to re-point or retire the entry.
- `EMPTY_ALLOWLIST` (`skipPaths: []`): the default for screens
  with no approved entries. The Main screen wires its section 3
  entries through `MAIN_SCREEN_ALLOWLIST`, the Book screen through
  `BOOK_SCREEN_ALLOWLIST`, the Stay screen through
  `STAY_SCREEN_ALLOWLIST`, the Folio screen through
  `FOLIO_SCREEN_ALLOWLIST`, and the Rooms screen through
  `ROOMS_SCREEN_ALLOWLIST`; Onboarding still runs with no
  exemptions (Refs #500: no dynamic-data nodes surface on that
  screen — every diff is the accepted shape divergence, so there
  is nothing to approve or wire).

## 3. Approved entries

| ID | Screen | Node path | Exempted field | Dynamic data | Why exempt | Approved |
|---|---|---|---|---|---|---|
| DD-01 | Main | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[1]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/p[0]/strong[0]` | text | Business date (design `Thứ Tư, 28/10/2026` vs live clock `2026-11-06`) | Frozen snapshot vs the business clock; differs on every run by nature (display format itself is Refs #495 S9, separate issue) | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-02 | Main | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Example content vs the configured hotel name, never hardcoded by design | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-03 | Main | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[0]/h3[0]` + `/div[0]/div[0]/span[0]` + `/div[0]/div[1]/span[0]` | text | Arrival count `(2)` plus guest name/code rows (`Nguyễn Văn An · ABC123`, `Trần Thị Bình · XYZ456`) | Seed- and action-dependent arrivals; the count-bearing heading is exempted wholesale (one text node), static prefix stays pinned by the fact-level decided content | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-04 | Main | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[1]/h3[0]` + `/div[1]/div[0]/span[0]` + `/div[1]/div[0]/span[1]` + `/div[1]/div[1]/span[0]` + `/div[1]/div[1]/span[1]` | text | In-house count `(5)` plus guest name/code/checkout rows (`Lê Minh · P.201`, `đến 30/10`, `Phạm Hoa · P.305`, `đến 29/10`) | Seed- and action-dependent occupancy; same wholesale-heading note as DD-03 | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-05 | Main | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/div[2]/h3[0]` | text | Departure count (`Khách đi hôm nay (0)`) | Seed- and action-dependent departures; same wholesale-heading note as DD-03 | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-06 | Main | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[0]/div[0]/span[0]` + `/div[3]/div[1]/div[0]/span[0]` + `/div[3]/div[2]/div[0]/span[0]` + `/div[3]/div[2]/div[0]/span[1]` | text | Housekeeping room refs (`P.101`, `P.102`, `P.103 · hỏng điều hoà`) and date (`đến 01/11`) | Seed-dependent room state and block reason/date | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-07 | Main | app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[0..4]/h3[0]` (one entry per lane, five entries; settled post-load paths — the loading skeleton shifts the lane board from `div[2]` to `div[1]`, so the gate waits for `desk-roommap` visible before extracting) | text | Room-map lane counts (`Đang có khách (0)`, `Sẵn sàng (đã kiểm tra) (2)`, `Sạch, chờ kiểm tra (0)`, `Phòng bẩn (0)`, `Ngưng bán (0)`) | Seed-driven counts; headings exempted wholesale, lane chip labels stay pinned by the fact-level decided room map (#491) | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-08 | Book | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Same shared shell header as Main DD-02 (identical paths): example content vs the configured hotel name, never hardcoded by design | #496 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-09 | Book | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[1]/div[0]/label[2]/select[0]` subtree; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/form[0]/div[0]/div[1]/div[0]/div[0]/div[1]/label[2]/select[0]` subtree | text | Room-type options (design illustration `Phòng đôi` vs API-driven catalogue, boot seed `Standard Double`) | Seed-dependent catalogue; the whole select subtree is exempted (current and future options), static label/placeholder copy stays pinned by the fact-level decided inputs | #496 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-10 | Stay | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Same shared shell header as Main DD-02 and Book DD-08 (identical paths): example content vs the configured hotel name, never hardcoded by design | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-11 | Stay | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[0]/strong[0]` (app-side path retired Refs #541 — the v2 rebuild drops the lists card, so no business-date node exists on screen) | text | Business date (design `28/10/2026` vs the retired v1 lists card) | Frozen snapshot with no live counterpart: the design path stays wired as the stale-entry tracking signal until a section-5 retirement is owner-approved (the v1 app-side date path retired with the lists card, Refs #541) | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-12 | Stay | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[1]` + `/div[2]` + `/div[3]` | text | Stay-list example rows (`Nguyễn Văn An · Phòng 205`, `Lê Minh · Phòng 201`, `Phạm Hoa · Phòng 203`) | Seed- and action-dependent lists; example content that can never coincide with live data. The design paths stay wired as the stale-entry tracking signal until a section-5 retirement is owner-approved; the v2 screen carries no tables at all (Refs #541), so no app rows exist to exempt | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-13 | Stay | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[0]/select[0]` subtree + `/div[1]/div[0]/label[1]/select[0]` subtree + `/div[1]/div[1]/label[0]/select[0]` subtree; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/div[0]/div[1]/div[0]/label[0]/select[0]` subtree + `/div[0]/div[0]/div[0]/div[1]/div[0]/label[1]/select[0]` subtree + `/div[0]/div[1]/div[0]/div[1]/div[0]/label[0]/select[0]` subtree | text | Catalogue options (design check-in guest-name options, room prompt plus ready-room options, and checkout stay options vs API-driven catalogues: reservation calendar, ready-room pool, in-house/departures lists) | Seed-dependent catalogues; all three v2 panel select subtrees exempted wholesale (current and future options), static label/placeholder copy stays pinned by the fact-level decided inputs (re-pointed from the two v2-reshaped v1 selects per the orchestrator decision on #549: same functional elements; Refs #541 re-points the app side to the `stay-panels` grid and retires the move-room path) | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-14 | Folio | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Same shared shell header as Main DD-02, Book DD-08, and Stay DD-10 (identical paths): example content vs the configured hotel name, never hardcoded by design | #498 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-15 | Folio | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/h3[0]` + `/div[1]/div[0]/div[0]` + `/div[1]/div[0]/div[1]` | text | Charge examples (`Khoản phí · Lê Minh · P.201`, `Tiền phòng 2 đêm` / `1.800.000 đ`, `Nước uống` / `60.000 đ`) | Seed- and action-dependent folio lines; example content that can never coincide with live data. Only the value-bearing nodes are exempted (the charge rows exempt wholesale with their `span`/`strong` children via subtree prefix); the static board copy around them (card heading shape aside, both input labels, the charge button) stays out as S1 residuals | #498 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-16 | Folio | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[1]/div[1]` + `/div[1]/div[1]/div[2]` | text | Payment examples (`960.000 đ` balance due, `Tiền mặt` / `900.000 đ` payment row) | Seed- and action-dependent folio balance and payment lines; example content that can never coincide with live data (fresh lab opens no folio, balance line empty). Only the value-bearing nodes are exempted; the static `Còn phải trả` due label stays out as an S1 residual. App-side folio lines carry no entry yet (fresh lab renders the empty folio state; rows proposed when a run with folio data shows them, same note as Stay DD-12) | #498 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-17 | Rooms | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Same shared shell header as Main DD-02, Book DD-08, Stay DD-10, and Folio DD-14 (identical paths): example content vs the configured hotel name, never hardcoded by design | #499 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-18 | Rooms | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[1]/div[0]/div[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/div[0]/div[0]/h1[0]/strong[0]` | text | Summary date head (design `Sơ đồ phòng · 28/10/2026` vs the live eyebrow date strong; the split-off counts line `18 phòng, 6 phòng có khách` carries no entry — orchestrator decision on #549, date node only, never the parent div) | Frozen snapshot date vs the business clock; differ on every run by nature. Only the date head is exempted (the design date node plus the app eyebrow date strong alone); the counts line and the static title lines stay out as S1 residuals. Refs #543: re-pointed to the v2 eyebrow `h1/strong` from the hotel-lab-773 observed render | #499 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-19 | Rooms | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[2]/span[0..4]` (five entries); app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/ul[0]/li[0..4]` (five entries) | text | Summary chips (design `Sẵn sàng · 8`, `Có khách · 6`, `Cần dọn · 2`, `Chờ kiểm tra · 1`, `Ngừng sử dụng · 1` vs seed-driven live chips, fresh lab `2/0/0/0/0`) | Seed-dependent counts; the count-bearing nodes are exempted wholesale (one entry per chip, same note as Main DD-07), while the qualified app chip labels stay pinned by the fact-level decided room map (#491) | #499 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-20 | Rooms | design `/html[0]/body[0]/div[0]/div[0]/div[0]/div[3]/div[1]` + `/div[4]/div[1]` + `/div[5]/div[1]` | text | Example room cards (three floors, 18 cards: numbers, statuses, type lines, notes with guest names, checkout dates, and the block reason) | Seed- and action-dependent room state; example content that can never coincide with live data. The whole card grids are exempted (current and future rooms under the same floor subtrees); the floor titles above them stay out as S1 residuals. App-side cards carry no entry yet (fresh-lab cards for seed rooms 101/102 are flow-state, same note as Stay DD-12) | #499 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |

Wired into the gate as `MAIN_SCREEN_ALLOWLIST` (Main DD-01..DD-07),
`BOOK_SCREEN_ALLOWLIST` (Book DD-08..DD-09),
`STAY_SCREEN_ALLOWLIST` (Stay DD-10..DD-13),
`FOLIO_SCREEN_ALLOWLIST` (Folio DD-14..DD-16), and
`ROOMS_SCREEN_ALLOWLIST` (Rooms DD-17..DD-20) in
`app/e2e/dom-diff.ts` (each `skipPaths` entry cites its DD-ID);
the live gate (`app/e2e/dom-diff.spec.ts`) applies the matching
screen allowlist and keeps `EMPTY_ALLOWLIST` for the one
remaining covered screen without approved entries (Onboarding).

Gate coverage follows the seven-board manifest
(`docs/design/manifest.json` order, bundle 07-11, Closes #538)
minus the deferred Admin board: `SCREEN_TABLE`
(`app/e2e/design-facts.ts:104`) carries the six boards with a
running app screen (Main, Stay, Onboarding, Rooms, Book, Folio).
Extraction coverage is seven boards — the extractor already
emits the seventh record (`Admin.facts.json`, Refs #548, PR
#551) — while gate assertion coverage is six screens.

Admin-board disposition (Refs #549): DEFERRED. The Admin board
(`Admin.dc.html`, `Quản trị`) has no app counterpart: the board
is new in bundle 07-11 with no predecessor screen, and the
Admin screen is unbuilt (open issue #546). Neither the
design-facts gate nor the dom-diff gate asserts the Admin board,
and the Admin board carries no allowlist entry — entries exempt
dynamic data on covered screens and require observed gate
output per section 5, neither of which exists for Admin. When
#546 lands, the dev fixture update adds the Admin screen to the
gate tables and proposes entries from observed output through
section 5; this document records the new entries, it does not
pre-approve them.

The lab-evidence paragraphs below were recorded against the v1
boards and stand as the v1 baseline: entry validity against the
v2 decoded markup is re-verified by the #549 dev fixture update,
and the counts are re-baselined by the separate evidence issue
(#550). A DD entry whose v2 decoded path no longer matches any
node surfaces as an `unusedAllowlistEntries` warning — that
warning, not a silent pass, is the signal to re-point or retire
the entry per section 5. Re-verification verdict (Refs #549, live
Chromium renders of all seven v2 boards): re-pointed — Main
DD-01..DD-06, Book DD-08, Stay DD-10/DD-13 (three reshaped panel
selects, orchestrator decision), Folio DD-14..DD-16, Rooms
DD-17/DD-18 (date node only, orchestrator decision)/DD-19/DD-20;
kept wired pending section-5 retirement (no v2 counterpart) —
Book DD-09 (v2 Book carries no select), Stay DD-11 (v2 Stay shows
no business date), Stay DD-12 (v2 Stay carries no list rows); the
split-off Rooms counts line (`div[1]/div[0]/div[1]`) is a new-entry
candidate for #550, never a blanket-cover.
Lab evidence (isolated `hotel-lab-686`, 2026-11-06, settled
post-load extraction): Main `252` non-allowlisted diffs before
wiring (the prior sweep's `253` minus the S2 title diff, now
closed) → `230` after, all remaining diffs `node` presence
mismatches from the accepted PrimeVue-shell-vs-design-markup
divergence (Refs #495 S1); zero stale entries. Table body rows
carry no entries yet: the lab seed renders no stay rows, and
section 5 requires observed gate output before any path may be
cited — rows are proposed when a run with stay data shows them.

Lab evidence (isolated `hotel-lab-691`, 2026-11-06, `vi` locale,
Chromium, `--workers=1`): Book `130` non-allowlisted diffs before
wiring (design 59 nodes, app 81 nodes: 59 design-side `x-dc`
subtree nodes plus 71 app-side shell/PrimeVue/head extras, zero
text/colour/font/visibility diffs on shared paths — the accepted
S1 shape divergence) → `122` after DD-08..DD-09 (hotel name +
both room-type option subtrees); all remaining diffs `node`
presence mismatches; zero stale entries. The design quote rows
(`Số đêm 2`, `Tổng tiền 1.800.000 đ`) carry no entry: the fresh
lab renders the empty quote state (`book-quote-empty`), a
flow-state divergence reported on #496 rather than exempted.

Lab evidence (isolated `hotel-lab-693`, 2026-11-06, `vi` locale,
Chromium, `--workers=1`): Stay `243` non-allowlisted diffs before
wiring (design 74 nodes, app 179 nodes: 69 design-side `x-dc`
subtree nodes plus 174 app-side shell/PrimeVue/head extras, zero
text/colour/font/visibility diffs — the accepted S1 shape
divergence; served title already `Nhận phòng` via the #495 S2
follow-through) → `225` after DD-10..DD-13 (hotel name,
business-date strongs, three example list rows, all four
room-option select subtrees); all remaining diffs `node`
presence mismatches; zero stale entries. The design list headings
carry no entry (no counts — static copy pinned by the fact-level
decided headings); app-side list rows carry no entry yet (fresh
lab renders empty DataTables — flow-state, rows proposed when a
run with stay data shows them).

Lab evidence (isolated `hotel-lab-695`, 2026-11-06, `vi` locale,
Chromium, `--workers=1`): Folio `137` non-allowlisted diffs before
wiring (design 41 nodes, app 106 nodes: 36 design-side `x-dc`
subtree nodes plus 101 app-side shell/PrimeVue/head extras, zero
text/colour/font/visibility diffs — the accepted S1 shape
divergence; served title already `Hoá đơn` via the #495 S2
follow-through, verified live in both locales) → `124` after
DD-14..DD-16 (hotel name, charge heading plus both charge rows
with their `span`/`strong` children, balance-due value and payment
row with its children); all remaining diffs `node` presence
mismatches; zero stale entries. The static board copy around the
exempted values (both card headings, the `Còn phải trả` due label,
all four input labels, both buttons) carries no entry — S1
residuals. App-side folio lines carry no entry yet (fresh lab
opens no folio and renders the empty folio state — flow-state,
rows proposed when a run with folio data shows them).

Lab evidence (isolated `hotel-lab-697`, 2026-11-06, `vi` locale,
Chromium, `--workers=1`): Rooms `222` non-allowlisted diffs before
wiring (design 152 nodes, app 80 nodes: 147 design-side `x-dc`
subtree nodes plus 75 app-side shell/PrimeVue/head extras, zero
text/colour/font/visibility diffs — the accepted S1 shape
divergence; served title already `Sơ đồ phòng` via the #495 S2
follow-through, verified live) → `82` after DD-17..DD-20 (hotel
name, summary line plus business-date strong, all five chip
spans plus all five chip lis, all three card grids with their
children); all remaining diffs `node` presence mismatches; zero
stale entries. The static board copy around the exempted values
(the h1, both h2s, the `Tải lại` button) carries no entry — S1
residuals. App-side room cards carry no entry yet (fresh-lab
cards for seed rooms 101/102 are flow-state, rows proposed when
a run with richer room data shows them).

Lab evidence (isolated `hotel-lab-771`, 2026-11-07, `vi` locale,
Chromium, `--workers=1`): Onboarding `61` non-allowlisted diffs
with `EMPTY_ALLOWLIST` (design 18 nodes, app 43 nodes: the 2
SPA head tags (`meta`, `link`) plus shell/PrimeVue structure —
the accepted S1 shape divergence; served title already
`Thiết lập lần đầu` via the #495 S2 follow-through, verified
live, byte-identical to the design `<title>` so no title diff
surfaces). The `61` split into `43` `node` presence mismatches
(shell/PrimeVue structure vs design-literal markup) plus `18`
top-level pairing diffs where the shell page and the bare board
align positionally: `17` box/typography pairings on the shell
wrappers and the board header bar, and `1` text pairing of the
board header-bar text (`Thiết lập khách sạn`) against shell
structure that carries no text — the header stays shell-owned
with no app counterpart (same rule as the Stay board header
mapping to the shell nav, Refs #541). No wiring follows: no
dynamic-data nodes surface on either side, so Onboarding keeps
`EMPTY_ALLOWLIST` with zero stale entries trivially. The drawn
step-1 copy (phase progress line, h3, helper, placeholder
example, Continue) matches the board byte-for-byte in the live
VI DOM and is pinned by the `DECIDED_CONTENT` Onboarding entry
(`app/e2e/design-facts.ts`, Refs #542), not by this gate.

## 4. Eligible categories

These categories may be proposed as entries; none is exempt until
it has a row in section 3 with owner approval:

- Dates and timestamps (business date, check-in/out dates,
  "today" labels): differ between the static design snapshot and
  any live run.
- Counts and totals (room counts, occupancy numbers, folio
  totals): depend on lab seed data and actions taken during the
  run.
- Names and identifiers (guest names, staff names, room
  references): depend on lab seed data.
- Locale-formatted values (date/number/currency renderings of
  the above): vary with the desk locale under test, not with
  product correctness.

Out of scope for exemption: styling, layout, visibility, fonts,
colours, static copy, and structure. Those always diff as real
failures.

## 5. Owner-approval path to add an entry

1. Propose: open (or comment on) a Testing issue naming the
   screen, the node path, the dynamic data, and which category
   from section 4 it falls under, with the gate output showing
   the failure.
2. Owner approves: the owner records approval on the issue
   (explicit approval comment). No entry is valid without it.
3. Record: add a row to section 3 with the next `DD-NN` ID, the
   approval issue/comment reference, and the date.
4. Wire: add the node path to the gate `skipPaths` with a code
   comment citing the entry ID, in the same or a follow-up PR.
5. Retire: when an entry goes stale (the gate reports it via
   `unusedAllowlistEntries`) or the data becomes static, remove
   the `skipPaths` entry and mark the row retired with the
   reason. Rollback of this document is a single-PR revert.

## 6. Traceability

- Gate source of truth: `app/e2e/dom-diff.ts` (hook) and
  `app/e2e/dom-diff.spec.ts` (gate spec, Closes #480).
- Design source of truth: `docs/design/*.dc.html` (v2 7-board
  bundle 07-11, Closes #538; board order in `manifest.json`:
  Main, Stay, Onboarding, Rooms, Book, Folio, Admin) —
  `docs/design/README.md` (Closes #462).
- Admin-board gate disposition: deferred, never allowlisted —
  no app screen exists yet (open issue #546); recorded in
  section 2 (Refs #549).
- Rollout done-conditions: `docs/product/acceptance-criteria.md`
  section 11; rollout traceability:
  `docs/testing/desk-ui-rollout-test-traceability.md`.
