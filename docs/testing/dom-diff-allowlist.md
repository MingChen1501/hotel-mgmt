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
  `BOOK_SCREEN_ALLOWLIST`, and the Stay screen through
  `STAY_SCREEN_ALLOWLIST`; the other three screens
  still run with no exemptions until their entries are approved
  and wired the same way.

## 3. Approved entries

| ID | Screen | Node path | Exempted field | Dynamic data | Why exempt | Approved |
|---|---|---|---|---|---|---|
| DD-01 | Main | design `/html[0]/body[0]/x-dc[0]/div[0]/div[1]/div[0]/div[1]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/p[0]/strong[0]` | text | Business date (design `Thứ Tư, 28/10/2026` vs live clock `2026-11-06`) | Frozen snapshot vs the business clock; differs on every run by nature (display format itself is Refs #495 S9, separate issue) | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-02 | Main | design `/html[0]/body[0]/x-dc[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Example content vs the configured hotel name, never hardcoded by design | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-03 | Main | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/h3[0]` + `/div[0]/div[0]/span[0]` + `/div[0]/div[1]/span[0]` | text | Arrival count `(2)` plus guest name/code rows (`Nguyễn Văn An · ABC123`, `Trần Thị Bình · XYZ456`) | Seed- and action-dependent arrivals; the count-bearing heading is exempted wholesale (one text node), static prefix stays pinned by the fact-level decided content | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-04 | Main | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[1]/h3[0]` + `/div[1]/div[0]/span[0]` + `/div[1]/div[0]/span[1]` + `/div[1]/div[1]/span[0]` + `/div[1]/div[1]/span[1]` | text | In-house count `(5)` plus guest name/code/checkout rows (`Lê Minh · P.201`, `đến 30/10`, `Phạm Hoa · P.305`, `đến 29/10`) | Seed- and action-dependent occupancy; same wholesale-heading note as DD-03 | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-05 | Main | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[2]/h3[0]` | text | Departure count (`Khách đi hôm nay (0)`) | Seed- and action-dependent departures; same wholesale-heading note as DD-03 | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-06 | Main | design `/html[0]/body[0]/x-dc[0]/div[0]/div[3]/div[0]/div[0]/span[0]` + `/div[3]/div[1]/div[0]/span[0]` + `/div[3]/div[2]/div[0]/span[0]` + `/div[3]/div[2]/div[0]/span[1]` | text | Housekeeping room refs (`P.101`, `P.102`, `P.103 · hỏng điều hoà`) and date (`đến 01/11`) | Seed-dependent room state and block reason/date | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-07 | Main | app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/section[0..4]/h3[0]` (one entry per lane, five entries; settled post-load paths — the loading skeleton shifts the lane board from `div[2]` to `div[1]`, so the gate waits for `desk-roommap` visible before extracting) | text | Room-map lane counts (`Đang có khách (0)`, `Sẵn sàng (đã kiểm tra) (2)`, `Sạch, chờ kiểm tra (0)`, `Phòng bẩn (0)`, `Ngưng bán (0)`) | Seed-driven counts; headings exempted wholesale, lane chip labels stay pinned by the fact-level decided room map (#491) | #495 orchestrator decision (owner-delegated) 2026-11-06 |
| DD-08 | Book | design `/html[0]/body[0]/x-dc[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Same shared shell header as Main DD-02 (identical paths): example content vs the configured hotel name, never hardcoded by design | #496 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-09 | Book | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[1]/div[0]/label[2]/select[0]` subtree; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/form[0]/div[0]/div[1]/div[0]/div[0]/div[1]/label[2]/select[0]` subtree | text | Room-type options (design illustration `Phòng đôi` vs API-driven catalogue, boot seed `Standard Double`) | Seed-dependent catalogue; the whole select subtree is exempted (current and future options), static label/placeholder copy stays pinned by the fact-level decided inputs | #496 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-10 | Stay | design `/html[0]/body[0]/x-dc[0]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/nav[0]/span[0]` | text | Hotel name (design `Khách sạn Hoa Mai` vs configured hotel) | Same shared shell header as Main DD-02 and Book DD-08 (identical paths): example content vs the configured hotel name, never hardcoded by design | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-11 | Stay | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[0]/strong[0]`; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[0]/div[0]/div[1]/p[0]/strong[0]` | text | Business date (design `28/10/2026` vs live clock ISO) | Frozen snapshot vs the business clock; only the date-bearing strong is exempted, the surrounding line (static prefix, `Tải lại` button) stays pinned by the fact-level decided content (display format itself is Refs #495 S9, separate issue) | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-12 | Stay | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[0]/div[1]` + `/div[2]` + `/div[3]` | text | Stay-list example rows (`Nguyễn Văn An · Phòng 205`, `Lê Minh · Phòng 201`, `Phạm Hoa · Phòng 203`) | Seed- and action-dependent lists; example content that can never coincide with live data. The list headings carry no entry (unlike the Main board they bear no counts — static copy pinned by the fact-level decided headings); app-side rows carry no entry yet (fresh lab renders empty tables; rows proposed when a run with stay data shows them, same note as Main DD-03..DD-05) | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |
| DD-13 | Stay | design `/html[0]/body[0]/x-dc[0]/div[0]/div[2]/div[1]/label[2]/select[0]` subtree + `/div[2]/div[2]/label[1]/select[0]` subtree; app `/html[0]/body[0]/div[0]/div[0]/div[0]/div[0]/main[0]/section[0]/div[1]/div[0]/div[1]/div[0]/label[2]/select[0]` subtree + `/div[2]/div[0]/div[1]/div[0]/label[1]/select[0]` subtree | text | Room options (design illustration check-in `205`, move `202`/`204` vs API-driven ready-room catalogue, boot seed rooms) | Seed-dependent catalogue; both select subtrees exempted wholesale (current and future options), static label/placeholder copy stays pinned by the fact-level decided inputs | #497 orchestrator pattern approval (owner-delegated, same categories as #495); owner veto welcome |

Wired into the gate as `MAIN_SCREEN_ALLOWLIST` (Main DD-01..DD-07),
`BOOK_SCREEN_ALLOWLIST` (Book DD-08..DD-09), and
`STAY_SCREEN_ALLOWLIST` (Stay DD-10..DD-13) in
`app/e2e/dom-diff.ts` (each `skipPaths` entry cites its DD-ID);
the live gate (`app/e2e/dom-diff.spec.ts`) applies the matching
screen allowlist and keeps `EMPTY_ALLOWLIST` for the other three
screens.
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
- Design source of truth: `docs/design/*.dc.html`
  (`docs/design/README.md`, Closes #462).
- Rollout done-conditions: `docs/product/acceptance-criteria.md`
  section 11; rollout traceability:
  `docs/testing/desk-ui-rollout-test-traceability.md`.
