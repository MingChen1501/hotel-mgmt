# Desk UI pixel-faithful restyle — owner-design rebuild spec (Closes #517)

Status: active. Product-owner restyle spec for the #517 epic, owned by
`product-owner` (Closes #517). Proposed tier T2 (reader-visible UI
change across seven desk surfaces; no new subsystem, no data-model
change, no API, flow, copy, or refusal-semantics change).
This document sets scope, the shared design tokens extracted from the
owner-supplied boards, the per-surface rebuild-vs-keep mapping for the
shell (#518) plus the six screens (#519–#524), the T2 UI contract
section, and the acceptance conditions; the binding Given/When/Then
done-conditions live in `docs/product/acceptance-criteria.md`
[section 12](acceptance-criteria.md) as `AC-RST-1` through `AC-RST-8`.
FR/NFR wording is owned by `business-analyst`, the ADR-0003
partial-supersession record and flow detail by `architect`, and guard
mapping by `qa-lead` (section 9 lists each required handoff without
repeating it). No implementation ships in this change; no product code
is touched.

## 1. Owner decision and scope in / out

Owner decision B (2026-11-07, recorded as D-15 in
`docs/project/decision-log.md`): the desk UI must match the
owner-supplied design boards as closely as possible — exact colors
including the `#0F766E` primary, fonts, spacing, radii, and layout per
the `docs/design/*.dc.html` inline styles — abandoning PrimeVue
default styling wherever it diverges. Full markup rebuild per screen
is authorized where patching cannot reach the design values.

In:

- Shell/nav chrome (#518) plus six screens: Main (#519), Book (#520),
  Stay (#521), Folio (#522), Rooms (#523), Onboarding (#524) — one
  small task and one PR per child issue, in any order.
- Shared token set (section 3) plus per-surface rebuild-vs-keep
  mappings (sections 4–5): logic, hooks, stores, and API calls stay;
  markup and styling are rebuilt to the design values.
- Per-screen owner review and before/after screenshot evidence in
  every child issue and PR body (section 7).
- Recording the ADR-0003 partial supersession for desk surfaces
  (section 2; the ADR file update itself is `architect`-owned).

Out:

- Behaviour, data, flow, copy, catalogue-key, API, validation, or
  refusal-semantics changes — visual restyle only. Anything
  discovered is filed as a follow-up, never snuck into a restyle PR.
- Non-desk surfaces (print, admin, sign-in gate keep their current
  presentation and stay reachable).
- Editing the owner-supplied `docs/design/*` files (never edit
  designs to fit implementation).

## 2. ADR-0003 boundary: partial supersession for desk surfaces

ADR-0003 (Vue 3 + Vite CSR static build served by Nginx under `/app/`)
stands in full for platform, serving, auth, catalogue plumbing, print
routes, and CI. It is PARTIALLY SUPERSEDED for desk surfaces only, as
follows — the `architect` has recorded this boundary in the ADR file itself
(`docs/architecture/decisions/adr-0003-desk-ui-vue-vite.md`,
"Partial supersession for desk surfaces", PR #527 — section 9
handoff A-517-1, now LANDED); the wording here remains the product-owner
scope statement, not the ADR edit:

- Stays: Vue 3 + Vite CSR static `dist/`, `/app/` location block with
  `/app/index.html` fallback, history routing, one shared Bearer API
  client (`sessionStorage` token, single 401 to sign-in path, no write
  queueing), one `t()` catalogue wrapper, print routes under
  `/app/print/...`, the Node CI job, and the OpenAPI mirror.
- Stays as logic carriers: PrimeVue components may remain where they
  carry behaviour (focus management, keyboard operation, ARIA roles,
  validation states, dialogs, tables) — what is replaced is their
  rendered visual styling wherever it diverges from the design values.
- Changes: every desk surface renders the section 3 token values and
  the per-surface layout in sections 4–5; PrimeVue default visual
  styling (stock fills, radii, spacing, typography) is overridden or
  the markup is rebuilt outright to reach the design values.
- The #495–#500 parity-sweep S1 resolutions ("PrimeVue shell
  accepted, full-tree literalism rejected") are superseded by owner
  decision B for visuals: closeness to the boards is now the goal,
  with full rebuild authorized. The sweeps' flow/copy REPORTED items
  (Stay T3, Folio F3, Rooms R3, Onboarding O3/O4) stay
  reported, not decided — visual restyle only; any copy or flow
  divergence a worker finds is recorded on the affected child issue
  for an owner decision, never changed silently. (Book B3 is the
  exception: resolved at #565 — see
  `docs/product/desk-ui-design-rollout.md` section 6.8.)

## 3. Shared design tokens (extracted from the boards)

Every value below is read verbatim from the inline styles of the six
boards; the `file:line` refs are illustrative anchors (each board
keeps its screen on one long line 2 — cited as `:<line>` per the
fact-schema provenance convention). Token changes land in
`app/src/theme/tokens.ts` in one place and all seven surfaces pick
them up together. No per-surface colour, radius, or target-size
deviations; a surface that needs one files it as a follow-up instead
of forking a token.

Colors (all six boards agree on the core eight; accents per board):

- Header teal `#0F4C47` (nav bar background, every board line 2).
- Primary action `#0F766E` (all buttons, progress bar, ready accents).
- Page background `#F4F6F5`; ink `#1B2B2A`; muted `#4B5D5B`
  (labels, hints, empty states).
- Card border `#D9E0DE`; row divider `#EEF1F0`
  (all boards except Stay, which uses the card border only).
- Locale-pill border `#9CC9C4` (every board header).
- Status accents (Rooms board line 2): occupied `#1D4E89`,
  needs-clean `#8A4B08`, awaiting-inspection `#5B3F9A`,
  out-of-service `#4B5563`; room-card tints `#E3F3EC` (ready),
  `#E1ECF9` (occupied), `#FCEBD2` (needs-clean), `#ECE6F7`
  (inspection), `#E6E8E7` (out-of-service); room-note ink `#3B4A48`.
- Balance-due accent `#8A4B08` (Folio board line 2).

Type (`font-family:system-ui,sans-serif` on every board root):

- App font stack stays `system-ui, -apple-system, "Segoe UI", Roboto,
  sans-serif` (already renders the design stack first).
- Sizes: h1 `22px`, h2 `18px`, card h3 `16px`, hero number
  `26px/700`, brand `18px`, rows `15px`, labels/hints `14px`,
  room-card notes `13–14px`, chips/badges `12px/600`, balance due
  `30px/700`, room numbers `22px`.

Spacing and radii:

- Page column `gap:20px`, content `gap:16px`, card `gap:10px`
  (room cards `gap:6px`); outer padding `0 24px`; card padding
  `18px` (room cards `14px`); row padding `10px 0`.
- Card radius `12px`; buttons/tabs `8px`; locale pill `8px`;
  summary chips `999px` with `12px` dots at radius `3px`;
  room badges `6px`; progress track/bar `4px` radius.
- Minimum touch/keyboard target `44px` on every interactive element
  (buttons `min-height:44px`, inputs/selects `min-height:44px`).
- Header height `60px`; content width `1200px`; Onboarding column
  `560px` centred; room cards `min-height:104px`.

## 4. Shell rebuild-vs-keep mapping (child issue #518)

Design source: the header block on line 2 of every board
(`Main.dc.html:2`, `Book.dc.html:2`, `Stay.dc.html:2`,
`Folio.dc.html:2`, `Rooms.dc.html:2`, `Onboarding.dc.html:2` —
Onboarding carries the slimmer setup header instead of nav tabs).

Rebuild (markup + styling to the design values):

- Teal header bar: a fixed `height:60px` single row
  (`flex-wrap:nowrap`), `background:#0F4C47`, `color:#fff`,
  `padding:0 24px`, brand `18px` with `margin-right:24px`. The brand,
  the seven design tabs, the locale pill, and the session control
  share that one row at 1200px: tabs, pill, and session control never
  shrink, and the brand is the only shrinkable item (ellipsis), so a
  long configured hotel name truncates instead of wrapping the bar
  (Refs #564).
- Eighth tab (Refs #590): the approved rooms and rates management
  screen adds one tab after `Rooms` (`desk.shell.nav_manage`,
  `Quản lý` / `Manage`, owner decision O-1). The eight-tab row keeps
  this same shrink rule unchanged — the brand stays the only
  shrinkable item, and the short label is what keeps the row inside
  the 1200px content width (`docs/product/rooms-rates-management.md`
  section 3).
- Nav tabs: `padding:10px 16px`, `radius:8px`; the active tab is
  inverted (`background:#fff`, `color:#0F4C47`, `font-weight:600`).
- Locale pill: `margin-left:auto`, `1px solid #9CC9C4`,
  `radius:8px`, `padding:6px 12px`; the header pill renders the
  design's compact `VI | EN` codes in design order
  (`desk.shell.locale_short_vi` / `desk.shell.locale_short_en`),
  while the sign-in gate keeps its full-word `English` / `Tiếng Việt`
  labels where there is room. Both forms resolve through `t()`
  (Refs #564).

Keep (behaviour, untouched):

- Router, history-mode `/app/` serving and fallback, session store
  with `sessionStorage` token and the single 401 to sign-in path.
- Locale-toggle behaviour (whole-screen EN/VI switch, no
  mixed-locale copy); sign-in gate behaviour unchanged.
- The shared-shell nav set from rollout section 4.1 (Main, Stay,
  Onboarding, Rooms, Book, Folio with the active screen
  highlighted; print and admin reachable as today).

App-only session controls (beyond the design; Refs #338, Refs #339,
Refs #564):

- The boards are signed-in artboards and draw no session control; the
  app keeps its accepted signed-in identity and Sign out as one
  compact account disclosure at the end of the bar. A single trigger
  button (`desk.shell.session_menu`) opens a panel carrying the
  signed-in name and Sign out; Escape closes the panel and returns
  focus to the trigger, and a screen or locale change closes it. The
  trigger and Sign out keep the 44px target, and the panel is an
  overflow layer below the bar (`position:absolute`), so it never
  adds a second header row.

Known board-vs-board conflict (record the owner call on #518, do not
guess): the five tabbed boards show six tabs (no Onboarding/Rooms
tabs) and the Rooms board highlights `Lễ tân` instead of its own tab.
The section 4.1 shared-shell rule holds unless the owner decides
otherwise on #518; the decision is recorded on the issue.

## 5. Per-screen rebuild-vs-keep mappings (#519–#524)

Each screen: exact design source, layout to reproduce, what stays.

### 5.1 Main desk board (#519) — `docs/design/Main.dc.html:2`

- Layout: business-date row (muted `14px` label, `26px/700` value,
  primary refresh button) above a `repeat(3,1fr)` card grid
  (`gap:16px`); two grid rows (arrivals / in-house / departures
  empty state; need-cleaning with action buttons /
  awaiting-inspection with action button / out-of-service with
  reason and date). Cards per section 3; rows `15px` with
  `1px solid #EEF1F0` top dividers; empty state muted `15px`.
- Keep: desk read API calls (`businessDate` request field unchanged),
  housekeeping clean/inspect state transitions with count refresh,
  the AC-DSK-12 weekday-long business-date render (landed, #513),
  the Stay placeholder/checkout-gate semantics where surfaced.
- Rebuild: board markup and styling to the values above.

### 5.2 Book screen (#520) — `docs/design/Book.dc.html:2`–`:5`

- Layout: h1 `22px` title; `1.3fr 1fr` two-column grid (guest card
  above quote card left; stay card right); stay fields in a
  `repeat(4,1fr)` grid; labels `14px`, inputs/selects full-width
  `min-height:44px` with `margin-top:6px`; quote rows `15px` with
  dividers; muted helper copy `14px`.
- Keep: guest search, walk-in registration, get-quote then
  confirm-booking flow exactly as today; room-type placeholder
  behaviour; folio/pricing logic untouched.
- Rebuild: screen markup and styling. The B3 quote-copy
  REPORTED item (#496) is resolved by the #565 decision
  (`docs/product/desk-ui-design-rollout.md` section 6.8): the
  app row labels and the empty-vs-quoted presentation stay, and
  the quote money and nightly dates render the design shape
  (`AC-DSK-13`).

### 5.3 Stay check-in/out (#521) — `docs/design/Stay.dc.html:2`–`:7`

- Layout: h1 `22px` intro; five stacked cards (daily lists;
  check-in; move; times; checkout with folio-reconciliation hint
  in muted `14px`); labels `14px`, controls full-width
  `min-height:44px`; business-date line with primary reload button.
- Keep: the arrival-pick candidate preload with the commit still on
  the Check in button (Refs #586; rollout spec section 6.12,
  `AC-DSK-17`) — the arrival pick loads the booked-type ready rooms,
  a valid room select clears the `Pick a ready room first.` message,
  and the Check in click commits once; the explicit empty room-select
  placeholder with hint blocking check-in until a ready room is
  chosen (AC-DSK-4), move/times flows, and the check-out card's
  settled-folio gate plus the room release on close (Refs #588;
  rollout spec section 6.13, `AC-DSK-18`) — the departed room is
  released to vacant-dirty after a committed close, the gate holds
  on every UI route against the freshly read balance, and the
  approver-role field becomes a catalogue-led role select so a
  free-form string cannot stand in for the recorded approval; all
  request fields unchanged.
- Rebuild: screen markup and styling. The T3 single-vs-two-step
  REPORTED item (#497) is resolved on its load half by #586 — the
  arrival pick populates the room select like the one-form board,
  while the commit deliberately stays on the button per the owner
  request; no markup or step-structure rebuild beyond that load move.

### 5.4 Folio invoice (#522) — `docs/design/Folio.dc.html:2`

- Layout: `1fr 1fr` two-card grid (charges card; payment card with
  muted `Còn phải trả` label and `30px/700 #8A4B08` balance);
  example lines `15px` with dividers; labels `14px`, inputs
  full-width `min-height:44px`.
- Keep: per-stay open form (stay-ID entry stays — the F3 REPORTED
  item, #498), charge posting and payment recording with running
  balance exactly as today, locale-correct amount formatting,
  folio/invoice print output unchanged.
- Separate decision (not this restyle): the charges-card title
  names the open folio's guest and room per `AC-DSK-14`
  (#568, rollout spec section 6.9); the restyle covers that title's
  layout and tokens only, and the raw IDs stay behind the reference
  disclosure.
- Rebuild: screen markup and styling.

### 5.5 Rooms map (#523) — `docs/design/Rooms.dc.html:2`

- Layout: title row (`26px/700` h1, muted `14px` summary line,
  primary reload button); status-chip row (`999px` chips,
  `12px` dots at radius `3px`); floor sections (h2 `18px`,
  `margin:0 0 8px`); `repeat(6,1fr)` floor grids (`gap:12px`);
  room cards (status tint background, `radius:12px`, `padding:14px`,
  `gap:6px`, `min-height:104px`; `22px` number; `12px/600` badge
  with `radius:6px padding:4px 8px`; `13px` type in `#3B4A48`;
  `14px` note line).
- Keep: live room-state rendering, the summary-counts-match-cards
  invariant (AC-DSK-6), housekeeping buttons, floor grouping,
  all reads unchanged.
- Rebuild: screen markup and styling. The R3 chip-vocabulary
  REPORTED item (#499) stays reported: app wording is unchanged
  unless the owner decides on #523.

### 5.6 Onboarding wizard (#524) — `docs/design/Onboarding.dc.html:2`

- Layout: slim setup header (`height:60px`, teal, `18px/700`);
  centred `560px` column (`gap:16px`); muted progress line;
  `8px` track (`#D9E0DE`, radius `4px`) with primary bar at
  25/50/75/100 percent; card per section 3 with `16px` h3;
  input `min-height:44px`; muted helper `14px`; primary continue.
- Keep: empty-database launch gating with seeded redirect, all
  four steps with progress and back/continue navigation, per-step
  validation naming the missing field with nothing persisted on
  failure, hotel-name persistence and its surfacing (AC-DSK-7,
  AC-DSK-9..11), steps 2–4 field/validation definitions.
- Rebuild: wizard markup and styling. The O3/O4 step-naming and
  helper/placeholder REPORTED items (#500) stay reported: wording
  is unchanged unless the owner decides on #524.

## 6. UI contract (T2 reader-visible UI change)

### 6.1 Layout shell and navigation scope

Section 4 is the shell contract; sections 5.1–5.6 are the per-screen
layouts. Print and admin destinations stay reachable as today and
keep their current presentation. The sign-in gate behaviour is
unchanged. The #518 board-conflict note (section 4) is resolved by
an owner decision on that issue before its implementation PR merges.

### 6.2 Component mapping per pattern

- Cards, rows, buttons, inputs, tabs, chips, badges, and progress
  follow sections 3–5 exactly; PrimeVue components kept as logic
  carriers are re-skinned to those values (section 2).
- Status chips/badges use the Rooms-board accents and tints
  (section 3); the Main board and Rooms map keep their shared
  vocabulary wording unchanged (copy is out of this restyle).
- Forms keep their existing fields, order, actions, and flow
  states (including deliberately kept extras recorded in the
  #495–#500 sweeps); only presentation changes.

### 6.3 Design-token scope

Section 3 is the complete token set. No per-surface deviations; a
surface that needs one files it as a follow-up instead of forking
a token. All token edits land in `app/src/theme/tokens.ts` in one
place.

### 6.4 States in plain words

The rollout `FR-DSP-3` plain-words rule holds on every surface:
loading names the affected region while the rest stays visible;
repeat-write buttons stay disabled until the call returns; every
list keeps its explicit empty state; errors never surface technical
codes; refusals keep their existing conditions with stand-in
readable wording. State semantics are unchanged — only their
visuals move to the design values.

### 6.5 Print rules

Screen styling does not leak into print: receipts, invoices, and
confirmations print exactly as today (the `FR-DSP-4` preservation
rule holds), and the configured hotel name appears on every printed
document.

## 7. Catalogue and locale rule

- Single source of truth stays `messages/` (`messages/README.md`):
  every user-visible string resolves through `t()`; behaviour
  switches on envelope codes, never on wording.
- The pilot desk is VI-primary: any new or changed copy ships in
  both `messages/vi.json` and `messages/en.json` with `{param}`
  placeholders intact, and `script/catalogue-coverage-check.sh` is
  green on every child PR. This restyle is expected to add zero
  keys; any key a worker needs follows the normal catalogue process
  and is recorded in the child PR body.
- The hotel name is configuration (persisted through the existing
  hotel-configuration surface, `FR-ADM-1`); the boards' hotel name
  is example content only and must stay configurable, never
  hardcoded.

## 8. Acceptance criteria summary

The binding done-conditions are `AC-RST-1` through `AC-RST-8` in
`docs/product/acceptance-criteria.md` [section 12](acceptance-criteria.md).
In short: each of the seven surfaces matches its board's token
values and layout closely enough for side-by-side screenshot review;
logic, flows, copy, APIs, and refusal semantics hold unchanged; the
design-facts gate (nav, headings, buttons, inputs, tokens per the
fact schema) is green on every child PR; geometry, typography,
radii, and spacing — out of scope for schema v1 — are covered by
the per-screen owner screenshot review; and every child issue and
PR carries its evidence with an owner review before merge.

## 9. Spec handoffs (landed; required before any child implementation PR opens)

Each owning role's slice has landed on `master` via the #517 stack;
this spec references them by section, never repeats them:

- `business-analyst`: FR/NFR delta for #517 landed as
  `docs/requirements/mvp-requirements.md`
  [section 13](../requirements/mvp-requirements.md) (PR #526) —
  13.1 explicit no-change statements, 13.2 `FR-RST-1`..`FR-RST-7`,
  13.3 `NFR-RST-1`..`NFR-RST-3`, 13.4 traceability handoff for
  `qa-lead`. Status: LANDED.
- `architect`: ADR-0003 partial-supersession record for desk
  surfaces landed as `docs/architecture/decisions/adr-0003-desk-ui-vue-vite.md`
  ("Partial supersession for desk surfaces", PR #527), with the
  subsystem boundary in `docs/architecture/hld.md`
  [section 14](../architecture/hld.md) and the build-ready
  decomposition in `docs/architecture/lld.md`
  [section 15](../architecture/lld.md); ADR status stays
  `accepted`. Status: LANDED.
- `qa-lead`: guard mapping for #517 landed as
  `docs/testing/desk-restyle-test-traceability.md`
  [sections 1–5](../testing/desk-restyle-test-traceability.md)
  (PR #528) — scope and no-change statements, parity guards, new
  restyle guards R1–R9, the AC-RST traceability map, and exit
  criteria. Status: LANDED.
- `spec-reviewer`: gates each child implementation PR (#518–#524)
  on this spec plus the three handoffs above; implementation starts
  only on PASS.

## 10. Acceptance mapping (issue #517 and child issues #518–#524)

| Criterion | Evidence in this spec |
|---|---|
| 7 child issues exist (shell/nav + Main + Book + Stay + Folio + Rooms + Onboarding), each with design refs, catalogue impact, screenshot-evidence requirement | #518–#524 open with per-issue scope; design refs sections 4–5; catalogue section 7; evidence section 8 / AC-RST-8 |
| ADR-0003 supersession for desk surfaces recorded in-tree | Section 2 boundary; decision-log D-15; architect ADR record LANDED (`adr-0003-desk-ui-vue-vite.md` Partial-supersession section + `hld.md` s14 + `lld.md` s15, PR #527) |
| Product-owner restyle spec written and active (spec-reviewer PASS) before any child implementation PR opens | This document (active) + AC-RST-1..8 ([section 12](acceptance-criteria.md)); gate section 9 |
| Every child issue and its PR carry before/after screenshot evidence and per-screen owner review | Section 8 / AC-RST-8; owner-review labels on #517–#524 |

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-871
