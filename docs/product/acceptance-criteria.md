# Acceptance criteria — small-hotel property management system

Status: active. Slice-level done-conditions for the hotel-mgmt MVP,
owned by `product-owner`. Each condition below is a testable statement
in Given/When/Then form: a slice is done when every condition in its
section holds on a single on-premise instance holding one property's
data. Every condition carries a `Traces to` line pointing at the user
story (`docs/product/user-stories.md`, active) and the functional
requirement (`docs/requirements/mvp-requirements.md`, active) it
checks; where a story records an open question, the condition checks
the behaviour as specified today and the question is named, not
decided here.

This document adds no scope: capabilities the MVP product scope
(`docs/product/mvp-scope.md`, active) tags Later or out of scope have
no done-conditions here, and the Beyond-MVP stories (US-LATER-1
through US-LATER-8) are explicitly excluded. FR wording is owned by
`business-analyst` and is not changed here — where detail is needed,
the referenced FR acceptance criteria govern. No dates, milestones, or
commitments appear in this document; horizons and order live in the
roadmap (`docs/product/roadmap.md`, active).

Conventions: condition ids take the form `AC-<domain>-<n>`, where the
domain code matches the story and FR domains (`RES` reservations and
booking, `FDK` front desk, `RMS` rooms and housekeeping, `RTE` rates
and availability, `GST` guests/CRM, `BIL` billing and folio, `RPT`
reporting, `ADM` configuration and administration, `CUS` per-hotel
workflow customisation, `DEP` departure release and same-day reuse).
"Staff" means any signed-in owner, manager, or front-desk account
acting within its access.

## 1. Booking flow (reservations)

- AC-RES-1 — Given sellable availability for the requested dates, when
  staff enter stay dates, room type, guest, and price basis and
  confirm, then the reservation exists with a unique reference, the
  requested dates, room type, guest link, and quoted price, and it
  appears on the reservation calendar. What "sellable" means is decided
  by the service from the capacity the hotel records, never by the
  number the request carries (`AC-OVB-1`, Refs #631). Traces to:
  US-RES-1; FR-RES-1, FR-RTE-5. Pointer: the quoted price this
  condition freezes is the Pricing quote read at commit, and a request
  asserting a different total is refused rather than repaired — this
  condition in price terms is `AC-PRC-1`/`AC-PRC-2` (Refs #632).
- AC-RES-2 — Given a reservation that has not been checked in, when
  staff change its dates, room type, or guest and confirm, then the
  reservation reflects the new values, its quoted price is
  recalculated from the rate plan in force, and the change is recorded
  with who made it and when. The same derived availability governs the
  change, so a move to sold-out dates or a sold-out type refuses
  (`AC-OVB-1`, Refs #631). Traces to: US-RES-2; FR-RES-2. Pointer:
  the recalculated price is the Pricing quote re-frozen on the same
  terms, with the price-basis change and its actor kept in the change
  history — this condition in price terms is `AC-PRC-4` (Refs #632).
  Open question: reason format for changes is undecided (PRD OQ-2).
- AC-RES-3 — Given a reservation that has not been checked in, when
  staff cancel it and record a cancellation reason, then the
  reservation state becomes cancelled with the reason kept, and the
  held availability is released for the cancelled dates. Traces to:
  US-RES-3; FR-RES-3. Open question: reason list shape is undecided
  (PRD OQ-2).
- AC-RES-4 — Given a guest arrives without a reservation and a room
  type has availability for tonight, when staff create the reservation
  with today as arrival, then the reservation is created in the
  confirmed state, ready for immediate check-in, and appears on
  today's arrivals list. Traces to: US-RES-4; FR-RES-4.
- AC-RES-5 — Given reservations exist across several dates and room
  types, when staff open the calendar, then every reservation appears
  on its correct dates with its room type and state, and selecting one
  shows its reference, guest, and price. Traces to: US-RES-5;
  FR-RES-5. Pointer: the desk list-and-detail surface that satisfies
  this condition in list form is `AC-BMV-2`/`AC-BMV-5` (Refs #648);
  the date-by-room-type grid half stays open and is recorded as a gap
  in `docs/product/booking-management-view.md`.
- AC-RES-6 — Given a reservation whose arrival date has passed without
  check-in, when staff mark it as no-show, then the reservation state
  becomes no-show, the held room is released for sale, and the no-show
  is kept in the reservation history. Traces to: US-RES-6; FR-RES-6.

Slice done when: direct, modified, cancelled, walk-in, and no-show
reservations all behave as above and every reservation is visible on
the calendar with correct dates, room type, and state.

## 2. Front desk (check-in and check-out)

- AC-FDK-1 — Given a reservation due for arrival and a vacant, clean,
  inspected room of the booked type, when staff check the guest in
  against that room, then the reservation becomes an in-house stay
  linked to the room, and the room state becomes occupied. The desk
  commit assigns only the room the guest is actually in and takes back
  the room it assigned when that commit does not land and no stay was
  recorded (`AC-REA-1`, Refs #647). Traces to: US-FDK-1; FR-FDK-1.
- AC-FDK-2 — Given an in-house stay with a settled folio (zero
  balance) or an authorised approval recorded under FR-BIL-7, when
  staff check the guest out, then the stay is closed, the folio is
  presented as the final invoice, and the room state becomes vacant
  and dirty. The desk surfaces must reach that room state without a
  second manual step and must refuse an unapproved open-balance
  close on every route they offer (`AC-DSK-18`, Refs #588), and
  the folio they close must carry the stay's room charge, posted
  by the desk check-out review before it presents a balance
  (`AC-DSK-19`, Refs #600), and the service refuses that same
  close on its own when it is not asked against the folio Billing
  holds or carries an approval Billing did not record, whatever
  the request asserts (`AC-CKO-1`, `AC-CKO-2`, Refs #601). The booking
  behind the stay is completed by that same close and stops counting
  as an active booking, so the departed room type can be sold again
  the same day (`AC-DEP-1`, `AC-DEP-2`, `AC-DEP-4`, Refs #646).
  Traces to: US-FDK-2; FR-FDK-2, FR-BIL-2, FR-BIL-7.
- AC-FDK-3 — Given an in-house stay and a vacant, clean, inspected
  room, when staff move the guest to the new room, then the stay links
  to the new room, the old room becomes vacant and dirty, and the move
  with both room numbers and its time is kept in the stay history. The
  Stay screen carries the reassignment affordance that performs it
  (`AC-REA-2`, `AC-REA-4`, Refs #647). Traces to: US-FDK-3; FR-FDK-3.
- AC-FDK-4 — Given an in-house stay whose actual arrival or departure
  falls outside the hotel's standard times, when staff record the
  early arrival or late departure, then the actual times are kept on
  the stay and remain visible on the arrivals and departures lists.
  Traces to: US-FDK-4; FR-FDK-4.
- AC-FDK-5 — Given reservations, in-house stays, and departures exist
  for today, when staff open the daily lists, then expected arrivals,
  in-house guests, and due departures each appear exactly once with
  guest name, room or room type, and state. Traces to: US-FDK-5;
  FR-FDK-5.

Slice done when: a guest can be checked in against a ready room, moved
mid-stay with history kept, and checked out with a settled folio, with
off-hours times recorded and the daily lists showing each guest
exactly once in the right group.

## 3. Rooms and housekeeping

- AC-RMS-1 — Given rooms exist in any mix of occupied, vacant, dirty,
  clean, inspected, and out-of-order states, when staff open the room
  view, then every room appears exactly once with its correct current
  state. Traces to: US-RMS-1; FR-RMS-1.
- AC-RMS-2 — Given a room in a dirty state, when staff mark it clean
  and then inspected, then the room state advances through each
  recorded change with who made it and when, and an inspected vacant
  room is offered for check-in assignment. Traces to: US-RMS-2;
  FR-RMS-2.
- AC-RMS-3 — Given a room and a date range with a recorded reason,
  when the manager blocks the room, then the room shows out of order
  for that range, and no new reservation or check-in can take that
  room for a blocked date. Traces to: US-RMS-3; FR-RMS-3.
- AC-RMS-4 — Given a new or edited room or room type, when the manager
  saves its floor, bed type, capacity, and features, then the values
  appear in the room inventory and are available when assigning rooms
  at check-in. Traces to: US-RMS-4; FR-RMS-4.

Slice done when: every room shows its true state in one view,
housekeeping transitions are recorded with actor and time, blocked
rooms refuse sale on blocked dates, and room attributes feed
assignment.

## 4. Rates and availability

- AC-RTE-1 — Given a room type and a date range, when the manager
  saves a nightly price for that combination, then new reservations
  for that room type and date quote that price. Traces to: US-RTE-1;
  FR-RTE-1.
- AC-RTE-2 — Given rooms, reservations, and out-of-order blocks
  exist, when staff open the availability view for a date range, then
  each room type and date shows the count of rooms still sellable,
  excluding occupied, blocked, and already-reserved rooms (the
  server-side sellability read's state arithmetic is
  `AC-SEL-1`..`AC-SEL-4`, section 29). Traces to: US-RTE-2; FR-RTE-2.
- AC-RTE-3 — Given a reservation with a quoted price, when the manager
  applies a named discount or special price, then the reservation shows
  the adjusted price with the discount name kept, and the folio charges
  follow the adjusted price. Traces to: US-RTE-3; FR-RTE-3.
- AC-RTE-4 — Given a minimum-stay or closed-to-arrival restriction on
  a date range, when staff attempt a reservation that violates it, then
  the reservation is refused with the violated restriction named.
  Traces to: US-RTE-4; FR-RTE-4.
- AC-RTE-5 — Given an applicable rate plan at booking time, when the
  reservation is created, then it records the rate plan used and the
  nightly breakdown, so a later rate change does not alter the quoted
  price unless staff explicitly recalculate it under FR-RES-2. Traces
  to: US-RTE-5; FR-RTE-5.

Slice done when: saved prices drive new quotes, the availability view
excludes everything unsellable, named discounts survive onto the
folio, violating bookings are refused naming the restriction, and
confirmed quotes keep their price basis.

## 5. Guests and CRM

- AC-GST-1 — Given stays linked to a guest, when staff open the guest
  profile, then the profile shows the guest's details with every past
  and upcoming stay linked to it. Traces to: US-GST-1; FR-GST-1. Open
  question: deletion and retention limits undecided (PRD OQ-4).
- AC-GST-2 — Given a guest profile with saved preferences or notes,
  when staff start a new reservation for that guest, then the
  preferences and notes are shown before the booking is confirmed.
  Traces to: US-GST-2; FR-GST-2.
- AC-GST-3 — Given a guest with at least one completed stay, when
  staff search for the guest while booking, then the guest is flagged
  as returning with the count of past stays visible. Traces to:
  US-GST-3; FR-GST-3.
- AC-GST-4 — Given a confirmed reservation, when staff request its
  confirmation, then a confirmation showing the hotel, guest, dates,
  room type, and quoted price is produced in a form the hotel can print
  or send as a message. Traces to: US-GST-4; FR-GST-4.

Slice done when: each guest has one profile with full stay history,
preferences surface before confirmation, returning guests are flagged
with a stay count, and every confirmed booking yields a shareable
confirmation.

## 6. Billing and folio

- AC-BIL-1 — Given a checked-in stay that Billing can verify, when
  staff open its folio, then a single folio exists for the stay showing
  every posted charge and payment with a running balance (`AC-FWV-1`,
  `AC-FWV-4`, Refs #634). Traces to: US-BIL-1; FR-BIL-1.
- AC-BIL-2 — Given an in-house stay that Billing can verify, when staff
  post a nightly room charge or a hotel-defined charge item, then the
  folio line shows the item, amount, and posting time, and the balance
  increases by the line amount (`AC-FWV-2`, `AC-FWV-3`, Refs #634).
  Traces to: US-BIL-2; FR-BIL-2.
- AC-BIL-3 — Given an open folio with a balance, when staff record a
  cash or card payment with its amount, then the payment appears on the
  folio with method and time, and the balance decreases by the paid
  amount (`AC-FWV-2`, `AC-FWV-3`, Refs #634). Traces to: US-BIL-3;
  FR-BIL-3. Open question: further payment
  methods undecided (PRD OQ-1).
- AC-BIL-4 — Given a folio with charges and payments, when staff
  request the invoice or a receipt, then the printed invoice matches
  the folio lines and balance exactly, and each receipt matches one
  recorded payment. Traces to: US-BIL-4; FR-BIL-4.
- AC-BIL-5 — Given tax and fee rules set by the hotel, when a charge
  is posted, then the folio shows the tax and fee amounts derived from
  those rules, and the balance includes them. Traces to: US-BIL-5;
  FR-BIL-5.
- AC-BIL-6 — Given a business date with posted charges and recorded
  payments, when the manager runs day-close, then the system produces
  the totals of charges and of payments per method for that date, and
  the totals agree with the folios posted that day. Traces to:
  US-BIL-6; FR-BIL-6. Open question: sign-off meaning undecided (PRD
  OQ-3).
- AC-BIL-7 — Given an in-house stay whose folio has a non-zero
  balance, when staff attempt check-out, then check-out is refused
  unless an authorised approval for the open balance is recorded
  against the folio, and that approval is only recordable while the
  stay is in house (`AC-FWV-2`, Refs #634). Traces to: US-BIL-7;
  FR-BIL-7.

Slice done when: one folio per stay carries every charge and payment
with a running balance, invoices and receipts match the folio
exactly, hotel tax and fee rules shape every balance, day-close totals
agree with the day's folios, and open balances block check-out without
a recorded approval.

## 7. Reporting

- AC-RPT-1 — Given bookings across a chosen period, when the owner
  opens the occupancy report, then each date shows occupied and
  available room counts that agree with the reservations and stays in
  the system. A window wider than the declared report span cap is
  refused instead of walked (`AC-RPT-5`, Refs #641). Traces to:
  US-RPT-1; FR-RPT-1.
- AC-RPT-2 — Given posted charges across a chosen period, when the
  owner opens the revenue summary, then room revenue and extra revenue
  totals agree with the folios posted in that period. The window
  carries the same declared span cap (`AC-RPT-5`, Refs #641). Traces
  to: US-RPT-2; FR-RPT-2.
- AC-RPT-3 — Given today's reservations, stays, and folios, when the
  manager opens the daily sheet, then arrivals, in-house guests,
  departures, and folios with open balances each appear with figures
  that agree with the underlying records. Traces to: US-RPT-3;
  FR-RPT-3.
- AC-RPT-4 — Given rooms in dirty and clean-but-uninspected states,
  when staff open the housekeeping report, then every room needing
  cleaning or inspection appears, and rooms already inspected or out of
  order do not. Traces to: US-RPT-4; FR-RPT-4.

Slice done when: all four standard reports open against live data and
every figure in them agrees with the underlying reservations, stays,
folios, and room states.

## 8. Configuration and administration

- AC-ADM-1 — Given valid hotel identity, contact, and local settings
  entered by the owner, when saved, then the details appear on
  confirmations, invoices, and receipts, and the local settings govern
  dates, times, and stay policies hotel-wide. Traces to: US-ADM-1;
  FR-ADM-1. Config writes are shape-checked and the session is checked
  before the body is parsed (`AC-CFG-1`..`AC-CFG-3`).
- AC-ADM-2 — Given a new user with a name, sign-in identity, and one
  of the three roles, when the owner saves the account, then the user
  can sign in and can reach exactly the functions its role permits:
  front-desk staff operate the desk, the manager additionally controls
  rates, rooms, and reports, and the owner additionally controls users
  and hotel setup. Traces to: US-ADM-2; FR-ADM-2.
- AC-ADM-3 — Given rooms with numbers, room types, floors, and
  capacity entered by the owner, when saved, then the rooms appear in
  the inventory, availability, and calendar with the defined capacity
  and type. Traces to: US-ADM-3; FR-ADM-3.
- AC-ADM-4 — Given rate plans, standard check-in and check-out times,
  and stay policies entered by the manager, when saved, then new
  reservations price from those rate plans and arrivals and departures
  lists use those standard times. Traces to: US-ADM-4; FR-ADM-4. The
  saved times and policies are shape-checked per `AC-CFG-3`.
- AC-ADM-5 — Given the owner's request, when an export or backup runs,
  then a complete copy of the hotel's data (reservations, stays,
  folios, and payments) is written to on-premise storage and the
  system reports success or failure of the run to the owner. Traces
  to: US-ADM-5; FR-ADM-5. Open question: minimum operable backup story
  undecided (PRD OQ-5).

Slice done when: the owner can set up hotel identity, users and roles,
and rooms entirely in the system, the manager's rate and policy setup
drives pricing and lists, and an export or backup run leaves a
complete on-premise copy with a visible success-or-failure report.

## 9. Per-hotel workflow customisation

- AC-CUS-1 — Given the owner marks a guest field mandatory for booking
  or for check-in, when staff confirm a booking or check-in without
  that field, then the action is refused and the missing field is
  named. Traces to: US-CUS-1; FR-CUS-1.
- AC-CUS-2 — Given times and cancellation wording saved by the owner,
  when staff book, check in, or cancel, then the hotel's own times and
  wording are the ones shown and enforced. Traces to: US-CUS-2;
  FR-CUS-2.
- AC-CUS-3 — Given a charge item with a name and price defined by the
  manager, when staff post charges, then the hotel's item is available
  to post to any folio and appears on invoices under its own name.
  Traces to: US-CUS-3; FR-CUS-3. Open question: which observed
  variations become standard options is undecided (PRD OQ-6).

Slice done when: required-field, policy, and charge-item setup is
changeable without code changes and the desk enforces and displays the
hotel's own configuration immediately after saving.

## 10. Desk UI migration shell slice (Refs #291)

Scaffold slice of ADR-0003 (accepted 2026-10-25): the placeholder
Vue 3 + Vite shell served under `/app/` from which the screen
migrations started. This slice records only the shell's
done-conditions; it adds no product capability and changes no MVP
behaviour. Requirements wording is owned by `business-analyst`
(`docs/requirements/mvp-requirements.md` [section 7](../requirements/mvp-requirements.md): FR-SHL-1..4,
NFR-SHL-1..3); design lives in `docs/architecture/hld.md` [section 11](../architecture/hld.md) and
`docs/architecture/lld.md` [section 11](../architecture/lld.md) (placeholder render section 11.1,
shared-client 401-to-sign-out section 11.2, offline banner/manual retry
section 11.3); guard mapping lives in
`docs/testing/traceability-matrix.md` [section 3](../testing/traceability-matrix.md). Each condition below was
testable on a single on-premise instance running the shell
alongside the untouched legacy pages. No condition traces to an
MVP user story: the MVP stories (US-RES-1 through US-CUS-3) keep
their existing done-conditions in sections 1–9, which hold
unchanged. The screen migrations have since landed as real routes
— catalogue (#305), desk (#306), book (#307), stay (#308), folio
(#309), print (#310), admin (#311) — and the legacy static pages
are decommissioned with 301 redirects to the `/app/` routes
(#313). Placeholder-only conditions below are marked superseded
where the landed screens replace them; the standing shell
behaviours (shared-client sign-in, `/app/` fallback, offline
banner, CI job, OpenAPI mirror) hold as written.

- AC-SHL-1 — Given staff load the shell at `/app/` or any
  `/app/*` history-mode path (deep link or reload included), when
  the shell boots, then exactly one placeholder route renders and
  no other app route exists or is reachable. Traces to: FR-SHL-1
  (no MVP story; scaffold only — SUPERSEDED: real routes landed
  for desk #306, book #307, stay #308, folio #309, print #310,
  and admin #311, so the single-placeholder assertion held for
  the scaffold slice only).
- AC-SHL-2 — Given a signed-in session in the shell, when any API
  call through the shared Bearer client receives a `401` /
  `UNAUTHENTICATED` response, then the session store token is
  cleared and the shell routes to sign-in; the token persists in
  `sessionStorage` (survives reload, dies with the tab). Traces
  to: FR-SHL-2 (no MVP story; single 401 path replacing the
  per-page token blocks).
- AC-SHL-3 — Given staff load any `/app/print/...` path, when the
  shell routes it, then no print document is rendered: the
  `/app/print/` namespace is reserved only, and the print route
  lands in a follow-up issue. Traces to: FR-SHL-3 (no MVP story
  — SUPERSEDED: print screens landed under `/app/print/` per
  #310; the namespace reservation held for the scaffold slice
  only).
- AC-SHL-4 — Given the shell is deployed, when staff load the
  `/docs` Swagger mirror, then it serves its content with the
  byte-identical
  OpenAPI mirror (`contracts/openapi.yaml` vs
  `frontend/docs/openapi.yaml`) staying green; legacy static
  pages are decommissioned and 301 redirect to the `/app/` routes
  (#313). Traces to: FR-SHL-4
  (no MVP story; mirror half stands, served-legacy half
  SUPERSEDED by #313 — legacy pages are decommissioned and 301
  redirect to the `/app/` routes).
- AC-SHL-5 — Given a commit touching the shell, when the new CI
  job (Node 22 + `npm ci` + build + test, matching the existing
  Node matrix) runs, then build and test both pass, and a red job
  blocks the change. Traces to: NFR-SHL-1 (no MVP story; target:
  100% of shell commits green before merge).
- AC-SHL-6 — Given any `/app/*` path with no matching static file
  (deep link, reload, unknown path), when Nginx serves it, then
  the response is `/app/index.html` with a 200 status — NOT
  `/index.html` (owner-mandated correction carried from ADR-0003).
  Traces to: NFR-SHL-2 (no MVP story; target: 100% of sampled
  non-asset `/app/*` paths return the shell entry).
- AC-SHL-7 — Given the shell loses connectivity, when an API call
  fails or the browser fires `offline`, then a banner names the
  disconnect and offers a safe manual retry, and no desk write is
  queued for later replay. Traces to: NFR-SHL-3 (no MVP story;
  target: 100% of disconnect drills show the banner and queue 0
  writes; queueing is forbidden because desk writes are
  synchronous authoritative ops).

Slice done when: the scaffold placeholder rendered at `/app/`
and on deep links with no other route reachable (AC-SHL-1,
scaffold slice only — real routes landed per #306–#311), the
shared client clears the `sessionStorage` token and routes to
sign-in on any 401, the `/app/print/` namespace reservation held
until print screens landed per #310, the served-legacy half held
until legacy pages were decommissioned per #313 with the OpenAPI
mirror green throughout, the new CI job is green, every sampled
non-asset `/app/*` path falls back to `/app/index.html` (never
`/index.html`), and a dropped connection shows the banner with a
manual retry and queues zero writes.

## 11. Desk UI design rollout (Refs #419)

Product-owner rollout spec: `docs/product/desk-ui-design-rollout.md`
(active). The owner-supplied Claude UI design is authoritative over
conflicting parts of the #412 journey record (D-12 in
`docs/project/decision-log.md`); each conflict found during
implementation is recorded on the affected sub-issue with the
owner decision. These 19 conditions cover the six screens
(Main #420, Stay #422, Onboarding #425 plus steps 2–4 in #438,
Rooms #424, Book #421, Folio #423) plus the shared shell,
the catalogue rule, the business-date display decision
(#503, AC-DSK-12), the quote/folio money and date display
decision (#565, AC-DSK-13), the open-folio guest and room
context in the charges-card title (#568, AC-DSK-14), the
app-localized Book date pickers (#581, AC-DSK-15), the
list-backed stay picker on the Folio and Print open steps
(#582, AC-DSK-16), the Stay arrival-pick candidate preload
(#586, AC-DSK-17), the Stay check-out room release plus
unpaid-close gate (#588, AC-DSK-18), and the room charge the
Stay check-out review posts before the gate reads the balance
(#600, AC-DSK-19). They
add no MVP capability: the four restyles change presentation
only, the Rooms map visualises existing room state
(`US-RMS-1`), and the wizard operationalises first-run setup
of existing hotel configuration (`US-ADM-1`, `US-ADM-3`).
Refusal semantics are unchanged throughout (`FR-RTE-4`,
`FR-CUS-1`, `FR-BIL-7` fire on exactly the same conditions);
where a condition instead makes an existing rule reachable from
the desk screen (`AC-DSK-17` load timing, `AC-DSK-18` release
and gate routes, `AC-DSK-19` charge posting before the gate),
it implements `FR-FDK-2`/`FR-BIL-2`/`FR-BIL-7` at the screen and
changes no rule.
FR/NFR wording is owned by `business-analyst` and guard mapping
by `qa-lead` (see the rollout spec, section 8); the conditions
below check behaviour only.

- AC-DSK-1 — Given staff are signed in on any of the six
  screens, when they look at the shell, then the teal header
  shows the configured hotel name, the nav tabs appear in
  canvas-manifest order (Main, Stay, Onboarding, Rooms, Book,
  Folio) with the active screen highlighted, and the locale
  toggle switches the whole screen between EN and VI with no
  mixed-locale copy. Traces to: US-FDK-5; FR-FDK-5 (no MVP
  story change; shared shell only).
- AC-DSK-2 — Given today has arrivals, in-house stays, rooms
  needing cleaning, and an out-of-service room, when staff open
  the Main board, then arrivals-today, in-house, departures
  (or its empty state), need-cleaning with the two action
  buttons, and out-of-service with reason and date each render
  per the design, and the two housekeeping buttons change room
  state with the board counts refreshing accordingly. Traces
  to: US-FDK-5, US-RMS-2; FR-FDK-5, FR-RMS-2.
- AC-DSK-3 — Given a guest and sellable dates, when staff work
  the Book screen, then guest search, guest registration,
  get-quote, and confirm-booking complete exactly as today in
  the new two-column layout (guest card above quote card left;
  dates/room/discount card right). Traces to: US-RES-1,
  US-GST-3; FR-RES-1, FR-GST-3.
- AC-DSK-4 — Given a booking with no room preselected, when
  staff open Stay check-in, then the room select shows the
  explicit placeholder and hint, and check-in stays blocked
  until a ready room is chosen; given a ready room chosen,
  check-in completes as today, and checkout still requires a
  fully-paid folio. The candidate load timing (arrival pick) and
  the room-error lifecycle follow `AC-DSK-17`. Traces to:
  US-FDK-1, US-FDK-2; FR-FDK-1, FR-FDK-2, FR-BIL-7.
- AC-DSK-5 — Given an in-house stay with charges and payments,
  when staff work the Folio screen, then posting a charge and
  recording a payment update the running balance exactly as
  today in the new charges/payments two-card layout with
  locale-correct amount formatting in the design VND shape
  (AC-DSK-13). Traces to: US-BIL-1, US-BIL-2, US-BIL-3;
  FR-BIL-1, FR-BIL-2, FR-BIL-3, FR-MNY-1.
- AC-DSK-6 — Given rooms across three floors in a mix of the
  five statuses, when staff open the Rooms map, then the
  summary counts always match the rendered room cards, and each
  card shows its status chip, room type, and the live note
  (occupant plus checkout date, out-of-service reason plus
  date, or upcoming arrival) per the design. Traces to:
  US-RMS-1, US-RMS-2, US-RMS-3; FR-RMS-1, FR-RMS-2, FR-RMS-3.
- AC-DSK-7 — Given an empty database, when the app loads, then
  the Onboarding wizard launches and walks staff through setup
  with progress and back/continue navigation; step 1 persists
  the hotel name, which then appears in the shell header and on
  printed documents; given a seeded database, the wizard never
  launches. Traces to: US-ADM-1, US-ADM-3; FR-ADM-1, FR-ADM-3.
  (Gate plus step 1; steps 2–4 carry their own conditions
  AC-DSK-9..11 below.)
- AC-DSK-8 — Given any of the six screens in either locale,
  when staff read the screen, then every user-visible string
  resolves through the VI-primary catalogue with the coverage
  check green, and the hotel name shown is the configured
  value, never hardcoded example content. Traces to: US-ADM-1;
  FR-ADM-1 (catalogue rule; no behaviour change).
- AC-DSK-9 — Given the wizard at step 2 with the hotel name
  already saved, when staff enter the remaining hotel config
  details (identity, contact, local settings) and continue,
  then the details persist through the existing
  hotel-configuration path and appear on confirmations,
  invoices, and receipts with the local settings governing
  dates, times, and stay policies; back returns to step 1
  with entered values kept, and a validation failure keeps
  staff on step 2 naming the missing field with nothing
  persisted. Traces to: US-ADM-1; FR-ADM-1 (Refs #438; no
  MVP capability added).
- AC-DSK-10 — Given the wizard at step 3, when staff enter
  rooms with numbers, room types, floors, and capacity and
  continue, then the rooms persist through the existing seed
  path and appear in the inventory, availability, and
  calendar with the defined capacity and type; back returns
  to step 2 with entered values kept, and a validation
  failure keeps staff on step 3 naming the missing field
  with nothing persisted. Traces to: US-ADM-3; FR-ADM-3
  (Refs #438; no MVP capability added).
- AC-DSK-11 — Given the wizard at step 4, when staff create
  the first owner account (name, sign-in identity, owner
  role) and finish, then the account persists through the
  existing admin user path, the owner can sign in and reach
  exactly the owner-permitted functions, and the wizard
  completes to the desk and never shows again; back returns
  to step 3 with entered values kept, and a validation
  failure keeps staff on step 4 naming the missing field.
  Traces to: US-ADM-2; FR-ADM-2 (Refs #438; no MVP
  capability added).

- AC-DSK-12 — Given the desk holds any business date (for
  example `2026-10-28`, a Wednesday), when staff open the Main
  board, the Rooms map, or Stay check-in/out in either locale,
  then each business-date line renders the weekday-long locale
  form (`Thứ Tư, 28/10/2026` in VI, `Wednesday, 10/28/2026` in
  EN) while every `businessDate` request field, validation
  message, and catalogue key stays exactly as today.
  Traces to: US-FDK-5; FR-FDK-5 (Refs #503; presentation only,
  no MVP capability added, no FR wording changed).

- AC-DSK-13 — Given a priced quote and an in-house folio, when
  staff read the Book quote or the Folio board in either locale,
  then every amount renders the design VND shape (locale
  grouping, no decimals, the `đ` suffix — `1.200.000 đ` in VI,
  `1,200,000 đ` in EN) and each nightly quote line renders its
  date as `dd/mm/yyyy` (`08/12/2026`, never a raw ISO string),
  while every stored, transmitted, and printed value stays
  exactly as today (minor-unit amounts, ISO dates, the folio
  running balance, the settlement gate, and print output
  unchanged), and the quote keeps the app row labels
  (`Số đêm:`, `Tổng cộng:`) and the empty-before-quote state.
  Traces to: US-RES-1, US-BIL-1, US-BIL-2; FR-MNY-1, FR-MNY-2
  (Refs #565; presentation only, no MVP capability added, no FR
  wording changed).

- AC-DSK-14 — Given a stay with a folio and a resolvable guest and
  room, when staff open that folio in either locale, then the
  charges-card title names the open folio's guest and room like the
  board (VI `Khoản phí · Lê Minh · P.201`, EN
  `Charges · Lê Minh · Room 201`) through one new catalogue key,
  while the raw stay and folio IDs stay behind the existing
  reference disclosure and no record ID appears in the title or the
  balance line; when the typed stay ID changes the guest and room
  context clears immediately and a slow read for the earlier stay
  never paints, a refused stay read keeps the plain title, and an
  unresolved half takes the catalogue wording (`Unknown guest`,
  `Room number unavailable`) — never an ID. Traces to: US-BIL-1,
  US-GST-1, US-RMS-1; FR-BIL-1, FR-GST-1, FR-RMS-1 (Refs #568;
  reader-visible title context only, no MVP capability added, no
  FR wording changed).

- AC-DSK-15 — Given staff work the Book screen in either app
  locale under any browser UI language, when they read, pick, or
  type the arrival and departure dates, then the field text,
  placeholder, typed/parsed form, and opened calendar follow the
  app locale (VI `dd/mm/yyyy`, `Tháng 12 2026`, `T2`…`CN`; EN
  `mm/dd/yyyy`, `December 2026`, `S`…`S`) and never
  `navigator.language` or the `<html lang>` attribute; a day
  chosen from the calendar overlay or typed in full still reaches
  the quote and booking payloads as canonical ISO `yyyy-mm-dd`, a
  real day change re-renders the quote through the existing
  `onStayInput` path, a VI/EN switch re-renders the same day
  without losing or shifting it and without clearing the quote,
  and an impossible, incomplete, or non-date entry leaves the
  canonical value empty or at the last valid day — never a
  malformed or shifted payload date. Traces to: US-RES-1;
  FR-BDP-1, FR-BDP-2, FR-BDP-3 (Refs #581; new input mechanism,
  no MVP capability added, no FR wording changed).

- AC-DSK-16 — Given the desk has a business date and an in-house
  stay, when staff open a folio on the Folio or Print screen, then
  the open step leads with a select of that business date's
  in-house stays from `ListArrivalsDepartures`, each option
  labelled with the guest and the room number resolved through
  `ListRoomsByState`, and picking one opens that folio without
  typing an identifier; the stay-ID text field stays visible and
  working beside the select as the manual fallback for a stay
  outside the list, a failed or empty list read shows a plain
  notice and leaves manual entry working, and the identifier sent
  to `GetFolioBalance`, `PostCharge`, and `RecordPayment` is the
  same value typed entry sent. Room-number fields that refer to an
  existing room use `ListRoomsByState`; the Onboarding room
  creation field keeps manual entry because no room list exists
  during first-run setup, and the booking-reference field on Print
  keeps manual entry because no list API exists for references.
  Traces to: US-BIL-1, US-FDK-5; FR-LSP-1, FR-LSP-2, FR-LSP-3
  (Refs #582; input mechanism and list reads only, no MVP
  capability added, no FR wording changed).

- AC-DSK-17 — Given arrivals loaded on Stay, when staff pick an
  arrival, then the room select is populated with the booked
  type's ready rooms without a Check in click: exactly one ready
  room binds automatically with no hint and no error, several
  ready rooms show the explicit empty placeholder plus the amber
  hint, zero ready rooms of the booked type show the plain
  no-ready-rooms error with the booked-type status, and an
  unknown reference shows the plain refusal; a new arrival pick
  clears the previous booking's candidates, bound room, and
  error first, and a slow read for an earlier pick never paints
  into the later one. Given several ready rooms, when staff
  select a valid room, then the `Pick a ready room first.`
  message and the amber hint disappear immediately and a valid
  selection renders no error. Given a populated picker and a
  selected room, when staff click Check in, then
  `AssignRoom` → `CheckIn` → `CheckInReservation` run once with
  the existing request bodies, no extra candidate read happens
  (the loaded booking is reused), a second click while in flight
  is a no-op, and the existing `need_arrival` / `need_room` /
  unknown-reference / no-ready-rooms / `CONFLICT` refusals fire
  on the same conditions with the same plain strings in both
  locales (catalogue unchanged). Traces to: US-FDK-1, US-FDK-2;
  FR-FDK-1, FR-FDK-2 (Refs #586; load-timing and error-lifecycle
  change only, no MVP capability added, no backend or
  request-field change).

- AC-DSK-18 — Given an in-house stay with a zero folio balance,
  when staff check the guest out, then the close runs once (a
  replayed or double click is a no-op), the departed room is
  released to `vacant-dirty` through `ReleaseRoom` with the room
  number the stay held (never a retyped or guessed number), the
  Stay in-house list no longer names the guest while the departing
  list keeps today's checkout, and the Main board and Rooms map
  show the room vacant on their own load — no manual reload, no
  separate release step. Given a close that succeeds and a release
  call that then fails, then the close stands, the panel says in
  plain catalogue words that the guest is checked out while the
  room still reads occupied, and names the next step; the close is
  never reported as failed and no room is reported released before
  it is. Given an open-balance folio with no recorded approval,
  when staff attempt check-out by any route — the Check out
  button, the confirm dialog, a replayed or double click — then no
  close commits, the stay remains in house, and the refusal is the
  plain catalogue sentence naming the approval next step. Given a
  balance that moved between review and confirm, then the freshly
  read balance governs: a non-zero balance without a recorded
  approval refuses and keeps the stay in house. Given an open
  balance with an approval recorded through
  `RecordOpenBalanceApproval`, when staff check out, then the
  close succeeds and the panel shows the recorded approver
  identity, role, and recorded time in the desk time form; an
  approval object without an identity or a recorded time, or with
  a role outside the hotel's three defined roles, is not an
  approval — it refuses in the plain incomplete-approval sentence
  with the stay still in house. Traces to: US-FDK-2; FR-FDK-2,
  FR-BIL-7, BR-17, BR-18 (Refs #588; release-and-gate enforcement
  in the Stay panel only, no backend, contract, schema,
  stored-value, print, or charging-policy change).

- AC-DSK-19 — Given an in-house stay whose folio carries no room
  charge, when staff open the check-out review, then the desk posts
  the stay's room charge through `PostCharge` before it presents a
  balance: exactly one line of kind `nightly-room-charge` for the
  stay, named for the room the stay held (or the plain room-charge
  name when the loaded room state cannot name it), its amount equal
  to the stay's frozen quoted total (`priceBasis.totalMinor`,
  `FR-RTE-5`, never a re-derived or today's-price figure), written
  under one key per stay so a repeated review replays rather than
  posts again, and the balance line the review then shows includes
  that charge.
  Given a folio that already carries a room-charge line (posted from
  the Folio screen or by the API desk loop), when staff review, then
  nothing is posted a second time and the review reads the stored
  lines and balance as they are. Given a stay whose quoted total is
  zero, then no line is posted and the review proceeds on the folio
  as read, so a free stay still closes on the zero balance `BR-17`
  allows. Given a stay whose booking cannot be resolved from the
  calendar it was checked in against, when staff review, then the
  panel refuses in one plain catalogue sentence naming the room
  charge and the next step (check the booking, try again), with no
  technical code and no raw envelope, nothing is posted, and no
  balance or check-out route is presented. Given a room-charge post
  that is refused or fails, when staff review, then the review ends
  in the plain panel error sentence for that refusal, no balance or
  check-out route is presented, and the stay remains in house — a
  charge that did not land never reads as a reviewed folio. Given a
  folio that now carries the posted room charge with an open
  balance, then the `AC-DSK-18` gate governs unchanged: check-out is
  refused without a recorded approval on every UI route and passes
  on a settled folio or a provenanced recorded approval. Traces to:
  US-FDK-2, US-BIL-1, US-BIL-2; FR-FDK-2, FR-BIL-1, FR-BIL-2,
  FR-BIL-7, FR-RTE-5, BR-17 (Refs #600; charge posting on the desk
  check-out review only — no nightly scheduler, no rates repricing
  or proration, no payment capture, no gate, print, or stored-value
  change). Pointer: the Book screen's price-changed recovery, which is
  what keeps a posted total one the clerk has seen, is `AC-DSK-20`
  (Refs #632); its guard mapping stays `qa-lead`'s handoff.

- AC-DSK-20 — Given the Book screen has quoted a stay and the clerk
  confirms it, when the reservation service refuses because the total
  the screen holds no longer matches the price in force
  (`PRICE_CHANGED`), then the screen re-reads the quote for the same
  room type, dates, and discount, shows the new total in one plain
  catalogue sentence that names it and asks for a second confirmation,
  and only a second `Confirm` books — the desk never books at a total
  the clerk has not seen, never presents the earlier total as booked,
  and the second confirm still books once on a double click. When that
  re-read itself fails, the screen says in plain words that the price
  could not be re-read and nothing was booked, and it reuses the
  existing no-price wording when the type lost its price for those
  dates. When the refusal is an unreadable Pricing service
  (`UPSTREAM_UNAVAILABLE`) instead, the screen keeps the quote it
  displayed and the existing plain error sentence, so a retry sends the
  same booking without a re-quote. When the totals agree, nothing on
  the screen changes: the quote, the sold-out and booking-rule
  refusals, the confirmation, and the print surface behave as they do
  today. Traces to: US-RES-1; FR-RES-1, FR-RTE-5; BR-13 (Refs #632;
  desk half of `AC-PRC-1`..`AC-PRC-3`).

Rollout done when: the six sub-issues each close with a merged
implementation PR (the wizard slice spans #425 step 1 plus the
#438 steps 2–4 PR), every screen checks against its design file
card by card, the #412 conflicts (if any) carry owner
decisions on the affected sub-issues, the shell, catalogue,
and print-preservation rules above hold on all six screens,
and the business-date lines render per AC-DSK-12 with ISO kept
on the wire, the quote and folio amounts render the design
VND shape with the quote nights in the desk date form per
AC-DSK-13 (values and print unchanged), and the Folio charges
card names the open folio's guest and room with the raw IDs
still behind the reference disclosure per AC-DSK-14, and the
Book arrival/departure fields are app-localized pickers that keep
the ISO payload per AC-DSK-15, and the Folio and Print open steps
lead with the business date's in-house stay select while keeping
manual stay-ID entry and sending the same identifier per
AC-DSK-16, and the Stay arrival pick loads the booked-type ready
rooms with the commit still on the Check in button and a valid
room selection clearing the guard message per AC-DSK-17, and the
Stay check-out releases the departed room and gates every UI route
to the close on the freshly read balance per AC-DSK-18, and the
Stay check-out review posts the stay's room charge once, before
the balance it gates on is read, per AC-DSK-19, and the Book screen
recovers a price-changed refusal by re-quoting and asking for a
second confirm per AC-DSK-20.

## 12. Desk UI pixel-faithful restyle (Refs #517)

Product-owner restyle spec:
`docs/product/desk-ui-pixel-faithful-restyle.md` (active). Owner
decision B (2026-11-07, D-15 in `docs/project/decision-log.md`):
the desk UI matches the owner-supplied boards as closely as
possible — exact colors including the `#0F766E` primary, fonts,
spacing, radii, and layout per the `docs/design/*.dc.html` inline
styles — abandoning PrimeVue default styling wherever it diverges,
with full markup rebuild per surface authorized. ADR-0003 is
partially superseded for desk surfaces only (platform, serving,
auth, catalogue plumbing, print routes, and CI stand; PrimeVue
stays as a logic carrier where needed, its default visuals
replaced by the design tokens); the `architect` records the ADR
update. These 8 conditions cover the shell (#518) plus the six
screens (Main #519, Book #520, Stay #521, Folio #522, Rooms #523,
Onboarding #524). They add no MVP capability and change no
behaviour: logic, hooks, stores, API calls, flows, copy,
catalogue keys, validation, and refusal semantics hold exactly as
today — only markup and styling move to the design values.
Rebaseline note (Refs #586, 2026-11-09): the Stay check-in
candidate load timing and the room-error lifecycle are superseded
by `AC-DSK-4`/`AC-DSK-17` and the rollout spec section 6.12 (the
arrival pick loads the booked-type ready rooms; the commit stays
on the Check in button); the restyle conditions above are
otherwise unchanged. Second rebaseline note (Refs #588,
2026-11-09): the Stay check-out now releases the departed room and
gates every UI route to the close on the freshly read balance,
superseded by `AC-DSK-18` and the rollout spec section 6.13 (the
settled-folio checkout gate is no longer "exactly as today" — it
releases the room and re-checks the balance at confirm); every
other restyle condition below is unchanged. FR/NFR
wording is owned by `business-analyst` and guard mapping by
`qa-lead` (see the restyle spec, section 9); the conditions below
check behaviour and evidence only. Conformance evidence is twofold
on every child PR: the design-facts gate is green (nav order and
labels, headings, buttons, inputs, token colours per the fact
schema), and side-by-side before/after screenshots cover what
schema v1 excludes (layout geometry, typography, radii, spacing),
reviewed by the owner per screen. The money and quote-date display
shape is decided separately by AC-DSK-13 (#565, rollout spec
section 6.8): the restyle conditions below cover layout and tokens
only, and the quote/folio renders follow that display decision. The
open folio's guest and room context in the charges-card title is
likewise decided by AC-DSK-14 (#568, rollout spec section 6.9): the
Folio restyle covers layout and tokens, and the title composition
follows that decision.

- AC-RST-1 — Given staff are signed in on any desk surface, when
  they look at the shell, then the teal header shows the
  configured hotel name at the design height, padding, and brand
  size, the nav tabs render the design padding, radius, and
  active-tab inversion with the shared-shell tab set, and the
  locale pill renders the design border, radius, and padding
  with the whole screen switching between EN and VI. The nav-spacing
  clause is re-baselined by the #648 owner decision (D-29): the design
  `8px` gap and `10px 16px` tab padding hold from a `1280px` viewport
  and wider, and below `1280px` the decided narrow values (`4px` gap,
  `10px 12px` padding) hold with the label, height, `44px` target,
  radius, and inversion unchanged. Traces to:
  US-FDK-5; FR-FDK-5 (no MVP story change; shell visuals only; Refs
  #648).
- AC-RST-2 — Given today has arrivals, in-house stays, rooms
  needing cleaning, and an out-of-service room, when staff open
  the Main board, then the business-date row, the two card-grid
  rows, row dividers, the departures empty state, and the two
  housekeeping action buttons render the design tokens and layout
  per the restyle spec, while desk reads, housekeeping state
  transitions with count refresh, and the weekday-long
  business-date render behave exactly as today. Traces to:
  US-FDK-5, US-RMS-2; FR-FDK-5, FR-RMS-2.
- AC-RST-3 — Given a guest and sellable dates, when staff work
  the Book screen, then the title, the two-column grid, the stay
  field grid, labels, controls, quote rows, and helper copy render
  the design tokens and layout per the restyle spec, while guest
  search, walk-in registration, get-quote-then-confirm, and the
  empty-vs-quoted presentation complete exactly as today. Traces
  to: US-RES-1, US-GST-3; FR-RES-1, FR-GST-3.
- AC-RST-4 — Given bookings and stays for the business date, when
  staff work Stay check-in/out, then the intro, the five stacked
  cards, labels, controls, and the folio-reconciliation hint
  render the design tokens and layout per the restyle spec, while
  the check-in flow keeps its commit on the Check in button with
  the arrival pick loading the booked-type ready rooms (the load
  half of the T3 single-vs-two-step item is resolved by #586,
  `AC-DSK-17`), the empty room-select placeholder blocks check-in
  until a ready room is chosen, a valid room selection never
  leaves the `Pick a ready room first.` message behind, and move
  and times flows behave exactly as today while the check-out
  panel releases the departed room and re-checks the balance at
  confirm per `AC-DSK-18`. Traces to: US-FDK-1, US-FDK-2;
  FR-FDK-1, FR-FDK-2, FR-BIL-7 (Refs #586; behaviour re-baselined
  to `AC-DSK-17`; Refs #588, re-baselined to `AC-DSK-18`).
- AC-RST-5 — Given an in-house stay with charges and payments,
  when staff work the Folio screen, then the two-card grid, the
  balance-due accent size and colour, example lines, labels, and
  controls render the design tokens and layout per the restyle
  spec, while the per-stay open form, charge posting, payment
  recording, the running balance, and print output behave exactly
  as today. Traces to: US-BIL-1, US-BIL-2, US-BIL-3; FR-BIL-1,
  FR-BIL-2, FR-BIL-3.
- AC-RST-6 — Given rooms across floors in a mix of the five
  statuses, when staff open the Rooms map, then the title row,
  the status-chip row with dots, floor sections and grids, and
  room cards with numbers, badges, type lines, and note lines
  render the design tokens and layout per the restyle spec, while
  live state rendering, the summary-counts-match-cards invariant,
  housekeeping buttons, and floor grouping behave exactly as
  today with chip wording unchanged. Traces to: US-RMS-1,
  US-RMS-2, US-RMS-3; FR-RMS-1, FR-RMS-2, FR-RMS-3.
- AC-RST-7 — Given an empty database, when the app loads, then
  the Onboarding wizard header, centred column, progress line and
  bar, card, input, helper, and continue action render the design
  tokens and layout per the restyle spec, while launch gating,
  all four steps with progress and back/continue navigation,
  per-step validation, hotel-name persistence and surfacing, and
  step wording behave exactly as today; given a seeded database,
  the wizard never launches. Traces to: US-ADM-1, US-ADM-3;
  FR-ADM-1, FR-ADM-3.
- AC-RST-8 — Given any of the seven surfaces in either locale,
  when its child implementation PR is reviewed, then the PR body
  carries side-by-side before/after screenshots matching the
  board closely enough for card-by-card review, the design-facts
  gate is green for the surface, every user-visible string
  resolves through the VI-primary catalogue with the coverage
  check green, the hotel name shown is the configured value, and
  the screen carries a per-screen owner review before merge.
  Traces to: US-ADM-1; FR-ADM-1 (evidence and catalogue rule; no
  behaviour change).

Restyle done when: the seven child issues each close with a merged
implementation PR, every surface checks against its board
screenshot side by side, the #518 board-conflict call carries an
owner decision on that issue, the shell, catalogue, and
print-preservation rules above hold on all seven surfaces, and no
child PR ships a behaviour, copy, API, or refusal-semantics change
without an owner decision recorded on its issue.

## 13. Rooms and rates management desk screen (Refs #590)

Product-owner spec:
`docs/product/rooms-rates-management.md` (active), with the approved
design board `docs/design/RoomsRates.dc.md` as its layout source. The
owner approved the design on #590 on 2026-11-09 (O-1 nav tab after
Rooms, O-2 three stacked card groups, O-3 a 31-night range cap, O-4 the
rate plan created only through the explicit create action), recorded as
D-23 in `docs/project/decision-log.md`. The screen adds no pricing
semantics: it writes the existing per-night price records and the
existing room and room-type records through today's operations, so
these conditions add a reader-visible surface, not an MVP capability.
FR/NFR wording is owned by `business-analyst` and guard mapping by
`qa-lead`; the conditions below check behaviour and evidence only.

- AC-MANAGE-1 — Given a signed-in user of any hotel role, when they
  open the desk shell and choose the manage tab, then the tab sits
  after `Rooms` and opens the screen at `/app/manage` inside the
  unchanged shared shell, with the tab label, route title, screen
  title, and intro resolved through the catalogue in the active
  locale, and every other route, the sign-in gate, and the print
  surfaces behave as before. Traces to: US-ADM-3, US-ADM-4;
  FR-ADM-3, FR-ADM-4.
- AC-MANAGE-2 — Given room types exist, or the database has none,
  when the manager opens the room-types section, then every type is
  listed with its name, guests, and bed type under a heading carrying
  the count, a missing value renders a muted placeholder rather than a
  guessed one, and an empty database shows the empty sentence with the
  first action and no invented row. Traces to: US-ADM-3, US-RMS-4;
  FR-ADM-3, FR-RMS-4.
- AC-MANAGE-3 — Given the room-type form, when the manager saves a
  name with optional guests inside `1..20` and an optional bed type,
  then the type persists through `UpsertRoomType` with the actor and
  the filled fields only, an existing type keeps its features because
  features are never sent, the list re-reads and shows the saved
  values, and the success line names the type; while editing the name
  is read-only with its helper sentence; an invalid value names the
  field in plain words and sends nothing. Traces to: US-ADM-3,
  US-RMS-4; FR-ADM-3, FR-RMS-4.
- AC-MANAGE-4 — Given at least one room type, when the manager saves a
  new room number with a type and optional floor, bed type, and
  guests, then the room persists through `UpsertRoom` keyed by number,
  appears grouped under its floor (or the no-floor group) after the
  list re-read, and reaches booking and the room map with the state
  the service assigned, never a state the screen wrote. Traces to:
  US-ADM-3, US-RMS-4; FR-ADM-3, FR-RMS-4.
- AC-MANAGE-5 — Given a room on a floor, when the manager changes its
  floor in its row and saves, then `UpsertRoom` persists the new floor,
  the row re-renders under the new floor after `ListRoomsByState`
  re-reads, the room's state, occupancy, and history are unchanged, and
  the Rooms map reports the new floor on its next load. Traces to:
  US-RMS-4; FR-RMS-4.
- AC-MANAGE-6 — Given a room type, a rate-plan name, and an inclusive
  range of at most 31 nights with a whole amount, when the manager
  saves, then one `UpsertRatePrice` row is written per night in date
  order for that plan, room type, and night date in integer minor
  units, the grid re-reads the stored rows, and a quote for that room
  type and date returns the new prices. Traces to: US-RTE-1;
  FR-RTE-1.
- AC-MANAGE-7 — Given the named rate plan does not exist yet, when the
  first write is refused as an unknown plan, then the screen says so
  and offers the create action, that action posts `UpsertRatePlan`
  with the name only and retries the pending nights, and no plan is
  created or overwritten without it. Traces to: US-RTE-1, US-ADM-4;
  FR-RTE-1, FR-ADM-4.
- AC-MANAGE-8 — Given a multi-night save that fails at one night, when
  the failure is reported, then the nights already written stay
  written, a plain line states saved/total and names the first night
  that did not save, the resume action starts at that night, no night
  is written twice or skipped, and the save action stays disabled while
  a write is in flight. Traces to: US-RTE-1; FR-RTE-1.
- AC-MANAGE-9 — Given no price row exists for any visible night, when
  the manager reads the prices section, then the screen states that the
  room type is not open for booking together with the action that opens
  it, no price is invented, carried from another night, or shown as
  zero, a night that could not be read says so, and the pricing form
  stays usable inside the empty state. Traces to: US-RTE-1; FR-RTE-1
  (wording aligned with the #589 booking refusal).
- AC-MANAGE-10 — Given a signed-in front-desk account, when they open
  the screen, then every list renders read-only with the notice that
  only the owner or a manager can change the setup, create and save
  actions are disabled with the plain refusal sentence, and a refusal
  returned by the server maps to that same sentence instead of a
  technical code, while an expired session follows the existing
  expire-to-gate path. Traces to: US-ADM-2; FR-ADM-2 (refusal wording
  on the product surface; server-side role enforcement is a follow-up).
- AC-MANAGE-11 — Given an implementation PR for one section of the
  screen, when it is reviewed, then that section's strings exist in
  both catalogues with matching placeholders, no design token was
  added, the operation the PR drives carries tests including its
  read-back, and the PR carries VI and EN screenshots against the
  approved board section. Traces to: US-ADM-3, US-ADM-4; FR-ADM-3,
  FR-ADM-4 (evidence condition; no behaviour change).

Done when: the four split PRs in the spec (entry and refusal path, room
types, rooms and floors, nightly prices and the empty state) each close
against `AC-MANAGE-1..11`, a price range writes one row per night and a
quote follows it, a floor move is reported by the room map, a room type
created or edited here reaches booking, and the refusal path speaks
product wording in both locales.

## 14. Server-side check-out settlement gate (Refs #601)

Product-owner scope decision and acceptance conditions for the
service half of the check-out gate that the #588 lab record left
open as symptom 2(d), "server trust"
(`docs/testing/evidence/588/README.md`). #588 closed the desk half
under the owner's UI-first constraint: the panel re-reads the folio
on every route, offers the fixed role set, and shows the recorded
approval, but the close still decided on values the request carried.
These conditions cover the other half — the stay service decides the
close from what Billing holds.

Tier T3: the change gives Stay its first runtime read of Billing and
a new fail-closed dependency edge on the money path, and its decision
record is ADR-0005
(`docs/architecture/decisions/adr-0005-server-side-checkout-gate.md`,
proposed; the owner accepts it before the implementation PR merges).
The conditions below are the product half. The desk UI contract
delta is in `docs/product/desk-ui-design-rollout.md`
[section 6.15](desk-ui-design-rollout.md), the gate algorithm and the
per-flow diagrams are in `docs/architecture/lld.md`
[section 21](../architecture/lld.md), and FR/NFR wording, guards and
traceability, and release notes stay with `business-analyst`,
`qa-lead`, and `release-manager`. The `CKO` domain code follows the
`FR-CKO-*` check-out gate family these conditions trace to.

- AC-CKO-1 — Given an in-house stay, when a caller requests the
  close — the desk, the API desk loop, or a caller that bypasses the
  desk entirely — then the decision is made on the folio Billing
  holds, not on the balance the request carries: the folio is
  re-read on every route to the close, the folio the caller presents
  must be the folio the balance came from (a different folio refuses
  with `CONFLICT` and the stay remains in house), and the request's
  own balance and approval values are advisory only, so a request
  claiming a zero balance for a folio that still owes money refuses
  and a request claiming a balance for a settled folio still closes.
  Given the folio Billing returns carries a non-zero balance, when
  the caller requests the close, then it commits only when the
  approval Billing recorded carries an approver identity, a role
  from the hotel's fixed three (`owner`, `manager`, `front-desk`),
  and a recorded time; an approval that is absent, free-form,
  missing the identity or the time, or naming a role outside that
  set is not an approval and the close refuses with
  `SETTLEMENT_REQUIRED`, so an approval object sent with the
  request (including one naming a role such as `night-auditor`)
  never stands in for the record. In every refusal the stay remains
  in house, no room is released, no charge is written, and no
  invoice is presented as a closed stay. Traces to: US-FDK-2;
  FR-CKO-4, FR-CKO-5, FR-BIL-7, BR-17 (Refs #601).
- AC-CKO-2 — Given an in-house stay whose folio cannot be read from
  Billing — a transport failure, a timeout, a 5xx, or a client that
  is not wired — when a caller requests the close, then the close is
  refused fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming the
  upstream and the operation, the stay remains in house, and no
  close ever proceeds on a balance nobody verified; a Billing
  refusal that carries a 4xx envelope is surfaced unchanged, so a
  rejected session still refuses as `UNAUTHENTICATED`. Given the
  settled or approved close the desk offers today, when staff take
  it, then it commits through the same request and shows the same
  lines, because the desk already re-reads the folio on every route
  and its request is unchanged: the #588 desk conditions
  (`AC-DSK-18`, `FR-CKO-4`, `FR-CKO-5`) hold as written, the
  check-out release and the charge-posting review still run
  (`AC-DSK-19`), and no desk screen, copy, or design fact changes.
  Traces to: US-FDK-2; FR-CKO-4, FR-BIL-7, BR-17; ADR-0005
  (Refs #601).

Done when: a close that asserts a balance or an approval the folio
does not hold is refused with `SETTLEMENT_REQUIRED` and leaves the
stay in house, the same close the desk sends still commits a settled
or provenanced stay, an unreadable folio refuses the close
fail-closed instead of closing on an unverified balance, and the
#588 desk guards plus the release and charge-posting guards stay
green unchanged (`AC-DSK-18`, `AC-DSK-19`, `FR-CKO-4`,
`FR-CKO-5`).

## 15. Departure release and same-day reuse after check-out (Refs #646)

Product-owner scope decision and acceptance conditions for the
owner-reported defect from manual QA on 2026-11-10: after guest A
checks out, A's booking still reads as booked/checked-in in the
booking history and calendar, keeps counting as an active booking
against sellable availability, and the departed room is therefore not
usable for a same-day arrival. The report is confirmed against the
as-built code at this spec head; the layer that holds the stale state
is the reservation lifecycle, not room state and not the desk read
(details below).

Tier T2 (proposed; `architect` confirms and re-tiers if the chosen
shape adds a lifecycle state the accepted state machine does not
already carry): this closes a lifecycle gap on an existing state set
rather than introducing a subsystem or a new state — the terminal
`closed` booking state is already normative in `BR-1`
(`docs/requirements/business-rules.md`) and in the accepted booking
state machine (`docs/architecture/state-machine.md`,
`checked_in -> closed` on check-out per `FR-FDK-2`), so the product
expectation does not change. The conditions below are the product
half. FR/NFR wording (including the active-reservation set and the
check-out amendment to `FR-FDK-2`) is owned by `business-analyst`,
the lifecycle shape and per-flow diagrams by `architect`, guard
mapping and traceability by `qa-lead`, and the gate verdict by
`spec-reviewer`. The desk-visible delta and the T2 UI contract
statements are in `docs/product/desk-ui-design-rollout.md`
[section 6.16](desk-ui-design-rollout.md); the scope decision is
recorded as D-26 in `docs/project/decision-log.md`.

As-built validation (read-only code trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **Reservations holds the stale state.** Only `confirmed` and
  `checked-in` count as active (`activeState`,
  `services/reservations/internal/store/store.go:194-196`), the
  booking guard counts overlapping active rows (`:214-226`), and
  `QueryCalendar` returns every overlapping row whatever its state
  (`:274-291`). `CheckIn` (`:297-318`) is the only transition out of
  `confirmed` besides cancel and no-show, and the operation surface
  stops at Create / Get / CheckIn / Modify / Cancel / MarkNoShow /
  QueryCalendar (`services/reservations/internal/handler/handler.go:122-286`),
  so nothing closes a booking when the stay closes.
- **Stay closes only its own record.** `checkOut` moves the stay to
  `closed` and emits a `checked-out` outbox event
  (`services/stay/src/store.ts:260-292`); it makes no Reservations
  call, so the booking behind the stay keeps its `checked-in` state.
- **Rooms is not stale after #588/#637.** `ReleaseRoom` moves the
  room `occupied -> vacant-dirty`
  (`services/rooms/src/store.ts:407-436`); the Rooms map already
  offers `Mark cleaned` and `Mark inspected`
  (`app/src/views/RoomsView.vue:162-183`, `:695-741`), and the Stay
  check-in list already loads `vacant-inspected` rooms
  (`app/src/views/StayView.vue:1139-1140`), so the housekeeping half
  of the same-day turnover path is reachable from the desk today.
- **Conclusion.** The defect is the missing terminal effect of
  check-out on the booking. Room turnover (`BR-16`, `BR-28`) and the
  desk release (`BR-18`, `AC-DSK-18`) already behave as specified;
  they are blocked only because the departed booking still reads
  active.

- AC-DEP-1 — Given an in-house stay whose check-out commits, when
  staff read the booking for the stay's dates — the reservation
  calendar, the booking read-back, or any surface that names it —
  then the booking is recorded in the terminal closed (completed)
  state `BR-1` and the state machine already name, never as
  `checked-in`; the past stay remains visible in the guest's booking
  history; and the room-charge review that precedes the close still
  resolves the stay's booking (`AC-DSK-19` holds). Traces to:
  US-FDK-2, US-GST-1; FR-FDK-2, FR-GST-1; BR-1, BR-18 (Refs #646).
- AC-DEP-2 — Given guest A has checked out from a booking whose
  recorded departure is today or later (a normal or an early
  departure), when staff book guest B for the same room type with
  arrival today, then the booking is accepted: A's completed booking
  contributes nothing to the sellable-unit count or the overbooking
  guard, and no no-availability refusal is caused by it. Given B's
  same-day booking exists before A's early departure is recorded,
  when A checks out, then A's booking stops blocking B from that
  moment, with no edit to B's booking and no manual availability
  correction. Traces to: US-RES-1, US-RES-5, US-FDK-2; FR-RES-5,
  FR-RTE-2, FR-FDK-2; BR-1, BR-8, BR-9 (Refs #646).
- AC-DEP-3 — Given A departed room 101 today and the room reads
  `vacant-dirty`, when housekeeping marks it clean and then inspected
  on the desk's rooms surface, then the room is offered for
  assignment and guest B can be checked into 101 the same day, with
  no manual state edit behind the UI and no new control; the desk
  release the close performs (`AC-DSK-18`) and the inspected-only
  assignment rule (`BR-16`, `BR-28`) hold exactly as written.
  Traces to: US-RMS-2, US-FDK-1; FR-RMS-2, FR-FDK-1; BR-16, BR-28
  (Refs #646).
- AC-DEP-4 — Given a booking completed by check-out, when staff read
  it or attempt to act on it again (check in, modify, cancel, or mark
  no-show), then the booking never returns to an active state and
  those attempts are refused; the completed stay's nights stay in
  history, and a guest who returns the same day is a new booking, not
  a reopened one. Traces to: US-FDK-2; FR-FDK-2; BR-1, BR-18
  (Refs #646).
- AC-DEP-5 — Given an in-house stay, when a check-out is refused —
  an open balance with no provenanced approval, an unreadable folio,
  an already-closed stay, or any other refusal — then the stay
  remains in house and the booking remains active, because nothing is
  completed or released for a close that did not commit; and when a
  close commits but the booking's terminal effect cannot be recorded,
  then the desk reports that outcome in plain words instead of
  claiming a truth the booking read contradicts, and the split is
  named as a follow-up rather than left silent. The #588 release
  guards, the #600 room-charge posting, and the #601 settlement
  enforcement refuse and commit exactly as they do today. Traces to:
  US-FDK-2; FR-FDK-2, FR-BIL-7; BR-17, BR-18, BR-46 (Refs #646).

Done when: a departed booking reads completed and stops appearing as
an active/checked-in booking, the same room type can be booked and the
same room checked into again the same day after the housekeeping
steps, an early departure releases the remaining nights without
touching the next booking, a completed booking can never be reopened
or acted on, and every refusal leaves the stay in house with the
booking still active and the existing check-out guards green.

## 16. Arrival room reassignment and stale-hold release (Refs #647)

Product-owner scope decision and acceptance conditions for the
owner-reported defect from manual QA on 2026-11-10 (#647): a guest
expected in room 101 is checked into 102 instead, and room 101 keeps
reading booked/occupied with a stale stay link. The desk has no
swap/reassign action, so the only cure today is a manual room-state
edit or a direct API call. The move semantics themselves are already
normative — `AC-FDK-3`, `FR-FDK-3`, and `BR-19` say a move keeps the
stay on the new room, leaves the old room vacant and dirty, and keeps
both room numbers and the time in the stay history. What the product
spec never stated is the arrival-time half: which room a check-in
commit may assign, and what happens to a room the commit assigned when
the commit does not land. That is the gap this section closes; it adds
no story, FR, or business rule, and it rewords none.

Tier T2 (proposed; `architect` confirms): a reader-visible desk action
over room and stay state, delivered with existing operations only
(`AssignRoom`, `MoveRoom`, `ReleaseRoom`) — no new endpoint, no schema
change, no lifecycle state, since the mid-stay move already exists in
the contract (`contracts/http/MoveRoom.json`) and in `stay_moves`. The
conditions below are the product half. FR/NFR wording is owned by
`business-analyst`, the per-flow implementation diagram (happy path
plus failure/rollback path) by `architect`, guard mapping and
traceability by `qa-lead`, and the gate verdict by `spec-reviewer`.
The desk-visible delta and the T2 UI contract statements are in
`docs/product/desk-ui-design-rollout.md`
[section 6.17](desk-ui-design-rollout.md); the scope decision is
recorded as D-27 in `docs/project/decision-log.md`.

As-built validation (read-only code trace at this spec head — the
isolated-lab reproduction belongs in the implementation PR body or an
issue comment, per the issue's scope):

- **A booking carries no room number.** `CreateReservation` takes room
  type, dates, and price only (`contracts/http/CreateReservation.json`),
  so "the room the guest is in" is the desk's assignment, never a
  booking fact.
- **Assignment is a plain room-state write.** `assignRoom` flips
  `vacant-inspected -> occupied`, records the transition and the
  `stayLink` (`services/rooms/src/store.ts:365-405`), and nothing but
  an explicit `ReleaseRoom` (`:407-436`) moves that room out of
  `occupied`. `UpdateRoomState` cannot even reach `vacant-inspected`
  from `occupied` (`:34-40`), which is why the stale hold needs a
  manual fix today.
- **The check-in commit assigns first and never takes it back.** The
  commit runs `AssignRoom` (`app/src/views/StayView.vue:1249-1261`),
  then the booking read (`:1280-1295`), then the stay write
  (`:1303-1323`), then the reservation check-in (`:1324-1336`). Every
  refusal path in that window returns without releasing the room it
  just assigned, so a refused check-in after the assignment leaves the
  room `occupied` with a `stayLink` no stay row answers — the reported
  stale hold, whichever of the desk's three paths leaves it (the lab
  reproduction records which one does).
- **The panel has no move control, and deliberately so.** The v2 Stay
  panel is the two-card check-in/check-out board
  (`app/src/views/StayView.vue:1-12`), its success reset clears the
  picker (`:1337-1356`), and nothing under `app/src` calls
  `/v1/stay/MoveRoom` — a pin the restyle suite holds on purpose
  (`app/src/stay-restyle.test.ts:136-142`).
- **The move itself already behaves.** `moveRoom` keeps the stay
  in-house, refuses a same-room move and a closed stay, and keeps
  `fromRoomId`, `toRoomId`, and `movedAt` in the stay history
  (`services/stay/src/store.ts:327-373`); the contract states that the
  room assignment and release around it are the desk's own calls
  (`contracts/http/MoveRoom.json`). The defect is therefore the desk's
  missing affordance and its commit ordering, not the stay operation
  and not the room state machine.
- **The preload guards are intact and stay.** The #586/#596/#614
  candidate-preload and commit-window guards are in place
  (`app/src/views/StayView.vue:1117-1372`); none of them handles the
  desk changing the room after a preload or after a commit, which is
  the new half here (`AC-DSK-17` stands).

- AC-REA-1 — Given an arrival pick has preloaded the booked type's
  ready rooms and staff then choose a different ready room, when the
  check-in commits, then that commit assigns only the chosen room and
  never assigns the room the preload bound; and given the commit has
  assigned a room and a later step of that same commit does not land
  while no stay was recorded (the booking read or the stay write),
  when the refusal returns, then the panel releases the room it
  assigned in that same commit back to the ready (`vacant-inspected`)
  state it held before the attempt, reports the refusal in plain
  catalogue words, and leaves no room occupied with no stay behind it.
  A room a live stay names is never freed: when the stay write landed
  and only the reservation check-in did not, the panel releases
  nothing, reports that split in plain words, and leaves the room
  occupied with the stay in house. A definitive refusal only: an
  unreadable outcome (transport failure, timeout, server error)
  releases nothing and is reported as an outcome to re-read, so a
  guest who did arrive is never left in a room the system has just
  handed back. Traces to: US-FDK-1; FR-FDK-1; BR-16, BR-28, NFR-CON-2
  (Refs #647).
- AC-REA-2 — Given a committed check-in in room 101, when staff
  reassign the guest to room 102 through the Stay screen, then the
  stay names 102, room 102 reads occupied, room 101 reads vacant and
  dirty, both changes land in the same commit window so the board and
  the Rooms map show only 102 occupied, and the move — from room 101
  to room 102 with its time — is kept in the stay history and shown to
  staff in plain words. The stay stays in house and keeps its folio
  link. Traces to: US-FDK-1, US-FDK-3; FR-FDK-1, FR-FDK-3; BR-19
  (Refs #647).
- AC-REA-3 — Given a reassignment attempt, when any step refuses — the
  target room was just taken, is not ready, or is blocked; the stay is
  no longer in house; a required field is missing — then no room is
  left occupied by the aborted attempt: a refusal before the target is
  assigned changes nothing, a refusal after the target was assigned
  releases that target back to the ready state it held before the
  attempt, and the refusal is one plain catalogue sentence, never an
  envelope code. When that compensating release itself fails, the
  panel names the room that still reads occupied and does not claim
  the move happened; when the refusal is an unreadable outcome, the
  panel names both rooms and asks staff to reload before acting again.
  Traces to: US-FDK-3; FR-FDK-3; BR-19, BR-28, NFR-CON-2 (Refs #647).
- AC-REA-4 — Given an in-house stay from an earlier day, when staff
  move the guest to another ready room, then the old room becomes
  vacant and dirty, the stay names the new room, and the move with
  both room numbers and its time is kept in the stay history — the
  same single path as the arrival-time reassignment, with the stay's
  in-house state and folio link unchanged. Traces to: US-FDK-3;
  FR-FDK-3; BR-19 (Refs #647).
- AC-REA-5 — Given the reassignment path ships, when the change is
  verified, then switch-after-preload, switch-after-commit, mid-stay
  move, and the partial-failure ordering each have a unit test plus
  the e2e/lab guard the issue asks for; the #586/#596/#614 preload and
  commit guards, `AC-DSK-17`, the `AC-DSK-18` release, the
  `AC-DSK-19` room charge, `AC-CKO-1`/`AC-CKO-2` settlement, and
  `AC-DEP-1`..`AC-DEP-5` all keep passing; every new string exists in
  both locales with its placeholders intact and the catalogue coverage
  check is green; and the one decided UI fact this change adds — the
  move card the owner board does not carry — is recorded as a decided
  addition in the design-facts gate instead of being silenced by
  deleting the screen's comparison. Traces to: NFR-CON-2,
  NFR-I18N-1; Refs #647.

Pointer: `AC-FDK-1` gains the `AC-REA-1` pointer (the desk assigns only
the room the commit uses and releases a room it assigned when the
commit does not land and no stay was recorded, never a room a live stay
names), and `AC-FDK-3` gains the `AC-REA-2`/`AC-REA-4`
pointer (the desk path that performs a move); both conditions stand as
written otherwise.

Done when: a guest checked into the wrong room ends up recorded in the
right one, the vacated room reads vacant and dirty on the board and
the Rooms map, the move with both room numbers and its time is kept
and shown to staff, and no refused or aborted attempt leaves a room
occupied with no stay behind it — with the existing check-in,
check-out, settlement, and departure guards green.

## 17. Booking management desk view (Refs #648)

Product-owner scope decision and acceptance conditions for the
owner-reported gap from manual QA on 2026-11-10: the desk has no
booking-management view, so staff cannot answer "who booked which
room, for which dates, at what price" without reading records one
reference at a time. The requirement already exists — `US-RES-5`,
`FR-RES-5`, and `AC-RES-5` say staff see reservations across dates
and room types on one screen with the reference, guest, and price on
selection — and only the surface is missing. These conditions cover
that surface in its list-and-detail form; the date-by-room-type grid
half of `FR-RES-5` stays unimplemented and is recorded as a gap, not
claimed here.

Tier T2: a reader-visible screen over existing contracts only
(`QueryCalendar`, `GetReservation`, `ListRoomTypes`,
`ListArrivalsDepartures`, `ListRoomsByState`) — no new endpoint, no
contract or schema change, no lifecycle state, and no write. The
conditions below are the product half. FR/NFR wording is owned by
`business-analyst`, the route/nav LLD delta and the per-flow
implementation diagram by `architect`, guard mapping and traceability
by `qa-lead`, and the gate verdict by `spec-reviewer`. The desk-visible
delta and the EN+VI copy are in
`docs/product/desk-ui-design-rollout.md`
[section 6.18](desk-ui-design-rollout.md); the full screen spec is
`docs/product/booking-management-view.md` (active); the scope decision
is recorded as D-28 in `docs/project/decision-log.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **No screen lists bookings.** `app/src/router.ts` registers the desk,
  book, stay, onboarding, rooms, manage, folio, print, and admin routes
  and nothing else; `BookView` creates a booking and renders the
  confirmation, and no view calls `QueryCalendar` to list bookings for
  staff browsing.
- **The data is all there.** `QueryCalendar` returns the overlapping
  bookings with reference, room type, dates, state, and stay link
  (`contracts/http/QueryCalendar.json`), and the overlap rule is
  `arrival < dateTo` and `departure > dateFrom`
  (`services/reservations/internal/store/store.go:191-193`,
  `services/reservations/internal/store/postgres.go:311-321`).
  `GetReservation` returns the guest snapshot and the frozen price
  basis (`priceBasis.totalMinor`, `priceBasis.discountName`) beside the
  state and stay link
  (`services/reservations/internal/handler/handler.go:168-181`).
- **The assigned room needs two reads.** A booking carries no room
  number; the room a guest holds is the in-house stay's `roomId`
  (`services/stay/src/server.ts:42-60`) resolved to a number through
  the occupied room list
  (`services/rooms/src/server.ts:114-126`), which is how the desk
  already maps rooms on other screens.
- **Neither list read guarantees an order.** The in-memory calendar
  read iterates a map and the Postgres read carries no `ORDER BY`, so
  the screen must sort the rows itself.

- AC-BMV-1 — Given a signed-in user of any hotel role, when they open
  the desk shell and choose the bookings tab, then the tab sits
  immediately after `Book` and opens the screen at `/app/bookings`
  inside the unchanged shared shell, with the tab label, route title,
  screen title, and intro resolved through the catalogue in the active
  locale, the nine-tab row inside the `1200px` content width with the
  brand as the only shrinkable item, at the design nav spacing from a
  `1280px` viewport and wider and the decided narrow spacing below it
  (`4px` inter-tab gap, `10px 12px` tab padding, labels and `44px`
  targets unchanged; D-29), and every other route, the
  sign-in gate, and the print surfaces behaving as before. Traces to:
  US-RES-5; FR-RES-5, FR-DSP-1, NFR-I18N-1 (Refs #648).
- AC-BMV-2 — Given bookings exist, when staff open the screen on its
  default range (the business date through the next six nights) or
  apply another range, then every booking staying at least one night
  in the range is listed once, ordered by arrival then reference, each
  row carrying the guest name, booking reference, room type, the
  assigned room when the guest is in house and a plain placeholder
  otherwise, the arrival and departure dates, the night count, the
  quoted total in the desk money form, and the state chip; no booking
  in the range is invented or silently dropped, and a range holding
  more than 50 bookings renders the earliest 50 with one plain sentence
  stating the count and asking staff to narrow the dates. Traces to:
  US-RES-5; FR-RES-5, FR-RTE-5 (Refs #648).
- AC-BMV-3 — Given the first-night and last-night fields, when staff
  choose an inclusive night range and apply it, then only bookings
  staying at least one night in that range are listed (`dateFrom` is
  the first night and `dateTo` is the last night plus one day, so a
  booking staying the last night is included and one departing on the
  first night is not), the list re-reads once with the apply action
  and fields disabled while it runs, the selection and detail clear,
  and a last night before the first night or a missing field names the
  field in plain words and sends nothing. Traces to: US-RES-5;
  FR-RES-5 (Refs #648).
- AC-BMV-4 — Given the chosen range holds no booking, when the list
  renders, then one plain catalogue sentence names the range in the
  desk date form, no row is invented, and the filter stays usable.
  Traces to: US-RES-5; FR-RES-5, FR-DSP-3 (Refs #648).
- AC-BMV-5 — Given a listed booking, when staff select its row, then
  the detail reads the booking back with `GetReservation` and shows
  its reference, guest, room type, assigned room when the guest is in
  house and a plain placeholder otherwise, arrival, departure, nights,
  quoted total, the recorded discount when the price basis carries
  one, and its state — read back rather than re-derived, with no
  write, edit, cancel, no-show, check-in, or check-out action — and
  selecting another row replaces the detail while applying a new range
  clears it. Traces to: US-RES-5; FR-RES-5, FR-RTE-5 (Refs #648).
- AC-BMV-6 — Given a list, per-row, room-type, in-house, occupied-room,
  or detail read fails, when the screen renders, then the failure
  follows its class: a failed list read or detail read is one plain
  catalogue sentence naming what could not be read with a retry
  action; a failed per-row, room-type, in-house, or occupied-room read
  keeps every row it can, shows that the affected cells could not be
  read instead of a guessed guest name, amount, room, or type, and
  states the degradation in one notice above the list — the rows whose
  guest name or total could not be read are counted, and each failed
  column is named in one plain sentence — with no retry action of its
  own, because re-applying the range reads again; no booking is
  silently dropped, no stack trace or code is shown, and the rest of
  the desk remains usable. Traces to:
  US-RES-5; FR-RES-5, FR-DSP-3 (Refs #648).
- AC-BMV-7 — Given the screen ships, when it is verified, then it
  offers no write action and calls only the existing operations
  (`QueryCalendar`, `GetReservation`, `ListRoomTypes`,
  `ListArrivalsDepartures`, `ListRoomsByState`) with no direct
  database or service-store access; every new string exists in both
  catalogues with matching placeholders and
  `script/catalogue-coverage-check.sh` is green; the design-facts gate
  records the new app-only tab through a declared allowance entry and
  pins the screen's static content in its own tests, with every board
  screen still green; and the owner has reviewed the built screen
  against the v2 design boards. Traces to: US-RES-5; FR-RES-5,
  FR-DSP-3, NFR-I18N-1 (evidence condition; no behaviour change).

Pointer: `AC-RES-5` gains the `AC-BMV-2`/`AC-BMV-5` pointer (the desk
list-and-detail surface that shows each booking on its dates with type,
state, guest, reference, and price); the condition stands as written
otherwise, and its grid-placement half stays open as the spec records.

Done when: staff open the bookings tab, read one row per booking for
the chosen range with guest, reference, room type, assigned room,
dates, nights, quoted total, and state, open any row for the fresh
`GetReservation` read-back, see the plain empty and failure sentences
instead of invented values, and the owner accepts the screen against
the design boards — with the desk's existing guards green.
## 18. Server-side reservation price basis (Refs #632)

Product-owner scope decision and acceptance conditions for audit
finding R2 (the #625 class, filed as #632): the reservation's frozen
price basis is client-supplied. `CreateReservation` reads
`priceBasis.totalMinor` from the request body and only checks that it
is present and non-negative
(`services/reservations/internal/service/service.go:158-160`), the
handler reads the same value from the body — Create at
`services/reservations/internal/handler/handler.go:181`, Modify at
`:297` — the store persists it verbatim
(`services/reservations/internal/store/store.go:274-275`) and re-freezes
it on Modify (`:472-476`), and no `QuotePrice` call exists on the
booking path — the rates client the service wires today runs only
`CheckRestrictions`
(`services/reservations/internal/pricing/client.go:43-85`). A caller
that never touches the desk can therefore freeze any total it likes,
and the check-out review posts the room charge from that frozen total
(#600, D-24), so the number a caller invents becomes the money the
guest is charged.

Tier T3 (proposed; `architect` confirms and authors the decision
record): the change gives Reservations its first synchronous read of
Rates' pricing side and makes Pricing the authority for a stored money
fact — the same shape ADR-0005
(`docs/architecture/decisions/adr-0005-server-side-checkout-gate.md`,
proposed) records for the check-out gate — and the owner accepts the
ADR before the implementation PR merges. The conditions below are the
product half. FR/NFR wording is owned by `business-analyst`, the
contract delta and the per-flow diagrams (happy path plus
refusal/failure path) by `architect`, guard mapping and traceability
by `qa-lead`, and release notes and rollback by `release-manager`.
`PRC` is the domain code for this family.

As-built validation (read-only code trace at this spec head):

- **The frozen total is whatever the caller sent.** The only checks on
  it are presence and `>= 0`
  (`services/reservations/internal/service/service.go:158-160` on
  Create, `:250-252` on Modify), and the validated value is handed
  straight to the store (`:189`, `:306`) which persists it
  (`services/reservations/internal/store/store.go:274-275`) and re-freezes
  it on Modify (`:472-476`). Nothing compares it to a rate.
- **Nothing on the booking path quotes.** The wired rates client has
  one operation, `CheckRestrictions`
  (`services/reservations/internal/pricing/client.go:43-85`); the
  booking path makes no `QuotePrice` call, so the price is never read
  from the service that owns prices.
- **The desk already quotes the way the server would.** The Book
  screen reads `QuotePrice` with the room type, arrival date,
  departure date, and the typed discount
  (`app/src/views/BookView.vue:807-820`) and sends that total back as
  `priceBasis` (`:948-958`), so a recompute over the same inputs
  reproduces the number the clerk saw.
- **The recompute needs no stored rate plan.** `QuotePrice` resolves
  the plan when exactly one prices the type and refuses with
  `details.reason: no_rate_plan` when none does
  (`contracts/http/QuotePrice.json`, its `ratePlanName` note) — the
  same call shape the desk already makes. A booking row records the
  total and the discount name only
  (`services/reservations/internal/store/store.go:47-63`), while
  `FR-RTE-5` names the rate plan and the nightly breakdown; widening
  what a reservation stores is out of scope here (#632 Out), so the
  recompute uses the effective room type, dates, and discount the
  booking already has.
- **Downstream money reads the frozen total.** The #600 check-out
  review posts one `nightly-room-charge` line at
  `priceBasis.totalMinor` (D-24), so this is the number the folio and
  the printed documents carry: verifying it is what makes the rest of
  the money path trustworthy.

Decision (five parts):

1. **Pricing is the only source of the frozen total.** On Create and
   on Modify the frozen total and the stored discount name are the
   ones `QuotePrice` returns for the effective room type, dates, and
   discount, read during that same request. The request's
   `priceBasis.totalMinor` never sets a stored value.
2. **A disagreement refuses; it is never repaired in place.** A
   request that asserts a different total — lower, higher, or zero for
   a priced stay — is refused with `PRICE_CHANGED` (409) naming both
   totals, so the caller re-quotes against the price in force. Nothing
   is booked and nothing is stored at an unverified total: silently
   substituting the server total would still charge a guest a price
   nobody showed them, and `BR-13` keeps a quoted price fixed until
   staff explicitly recalculate it (`FR-RES-2`), which a refusal makes
   visible instead of doing behind the desk's back.
3. **Unreadable Pricing fails closed; a definitive answer is
   surfaced.** Transport failure, timeout, 5xx, or an unwired client
   refuses the booking with `UPSTREAM_UNAVAILABLE` (503) naming the
   upstream and the operation, the same treatment the check-out gate
   gives an unreadable folio (ADR-0005). A definitive Rates refusal —
   no price for a night, no plan pricing the type, an unknown discount
   — is surfaced unchanged, so a type that is not open for booking
   still refuses in the terms the desk's quote step already reports.
4. **Modify reprices identically and keeps the trail.** The change
   path recomputes from the effective (post-change) type, dates, and
   discount, refuses a disagreement and an unreadable Pricing the same
   way, and records a price-basis change with the actor and time when
   the recomputed total differs from the stored one, as `BR-2` and
   `NFR-AUD-1` already require.
5. **The desk never books a total it has not shown.** A price-changed
   refusal is recovered on the Book screen by re-quoting and asking
   for a second confirmation (`AC-DSK-20`, desk delta in
   `docs/product/desk-ui-design-rollout.md`
   [section 6.19](desk-ui-design-rollout.md)); a booking already
   stored by an earlier replay is returned at the total it was stored
   with.

- AC-PRC-1 — Given a booking attempt with a valid room type, dates,
  and guest, when the reservation is created, then the frozen price
  basis is the `QuotePrice` total read from Rates for the effective
  room type, arrival date, departure date, and discount during that
  same request, the stored discount name is the one the quote returns,
  and the request's `priceBasis.totalMinor` never sets the stored
  total: a request whose total equals the quote is booked at that
  total exactly as today, and the stored value is what
  `GetReservation` reports and what the calendar and the check-out
  room charge read. Given a repeated request carrying the same
  `idempotencyKey` for a booking already stored, then the booking is
  returned at the total it was stored with — never a second quote and
  never a repricing refusal for a booking that already exists.
  Traces to: US-RES-1; FR-RES-1, FR-RTE-5; BR-13.
- AC-PRC-2 — Given a booking attempt whose `priceBasis.totalMinor`
  differs from the quote the server computes — lower, higher, or zero
  for a priced stay — when the caller confirms, then no reservation is
  created, no availability is consumed, and the refusal names the
  disagreement with `PRICE_CHANGED` (409) carrying both totals
  (`requestedTotalMinor`, `quotedTotalMinor`) plus the room type and
  the dates, so the caller can re-quote against the price in force. A
  disagreeing total is never stored, rounded, or repaired in place:
  the frozen total on a stored booking is always the server's, and a
  booking that legitimately quotes zero (a complimentary discount) is
  booked at zero only when the quote says zero. Traces to: US-RES-1;
  FR-RES-1, FR-RTE-5; BR-13.
- AC-PRC-3 — Given a booking attempt where Pricing cannot be read — a
  transport failure, a timeout, a 5xx, an unparseable envelope, or an
  unwired client — when the caller confirms, then the booking is
  refused fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming
  upstream `rates` and operation `QuotePrice`, and nothing is stored,
  booked, or released: no stay is ever created at an unverified,
  invented, or assumed-zero total. Given a definitive Rates refusal
  instead, when the caller confirms, then it is surfaced unchanged:
  `NOT_FOUND` with `details.reason` `no_rate_price` (a night has no
  price row) or `no_rate_plan` (no plan prices the type), and
  `VALIDATION_FAILED` for an unknown discount — the same terms the
  desk's quote step already reports, with nothing stored. Traces to:
  US-RES-1; FR-RTE-1, FR-RTE-5; BR-13.
- AC-PRC-4 — Given a confirmed reservation, when staff change its
  dates, room type, guest, or discount, then the new frozen total is
  the `QuotePrice` total for the effective type, dates, and discount
  (the request's value is compared, never stored), a disagreement
  refuses with `PRICE_CHANGED` and changes nothing, an unreadable
  Pricing refuses with `UPSTREAM_UNAVAILABLE`, and a definitive Rates
  refusal is surfaced unchanged — in every refusal the reservation
  keeps its stored dates, type, guest, and total. When the recomputed
  total differs from the stored one, the change history records the
  price-basis change with the actor and the time it was recorded, and
  a reservation that already left the confirmed state still refuses
  as today. Traces to: US-RES-2; FR-RES-2, FR-RTE-5; BR-2, BR-13,
  NFR-AUD-1.
- AC-PRC-5 — Given this change ships, when it is verified, then the
  guards cover the forged-low caller, the forged-high caller, a
  matching caller (including a legitimate zero total), the unreadable
  Pricing caller, each definitive Rates refusal, and the Modify
  reprice with its change-history row and actor; the #600 room charge
  still posts the frozen total, and the `AC-RES-1`, `AC-RES-2`,
  `AC-DSK-13`, `AC-DSK-19`, and `AC-CKO-1`/`AC-CKO-2` guards keep
  passing unchanged. Traces to: NFR-AUD-1; Refs #632.

Pointer: `AC-RES-1` gains the `AC-PRC-1`/`AC-PRC-2` pointer (the
quoted price a booking freezes is the price Pricing returns at commit,
and a request asserting a different total is refused), and
`AC-RES-2` gains the `AC-PRC-4` pointer (the recalculated price on a
change is the Pricing quote, re-frozen with the actor kept in the
change history); both conditions stand as written otherwise.
`AC-DSK-19` keeps its behaviour and now reads a verified frozen total,
and gains the `AC-DSK-20` pointer for the price-changed recovery on
the Book screen; its guard mapping stays `qa-lead`'s handoff.

Rollout and rollback: the change is one service-side behaviour change
plus one desk recovery path, with no schema, migration, backfill, or
stored-shape change — a reservation keeps the price basis it already
stores. Bookings frozen at a client-supplied total before this change
keep that total: they are not re-derived or rewritten, and the Modify
path reprices the next time staff change the booking. Rollback is
reverting the single implementation PR, which returns the desk-supplied
price; the desk and the service move together, because the desk's
`PRICE_CHANGED` recovery is inert when the service never raises it.
Release notes, the rollback note, and any operational note for
installs with existing bookings are `release-manager` handoffs.

Done when: a booking attempt asserting a total Pricing does not return
is refused and stores nothing, a booking that agrees freezes the
Pricing total and the desk room charge posts that total, an unreadable
Pricing refuses every create and modify attempt instead of freezing an
unverified price, a Modify reprices the same way and keeps the actor in
the change history, and the #600/#588/#601 guards plus the desk quote
flow stay green.
## 19. Server-side reservation availability (Refs #631)

Product-owner scope decision and acceptance conditions for audit
finding R1 on the booking path (#625 class: a client-supplied value
decides the outcome). Today `sellableUnits` arrives in the request
body — `services/reservations/internal/handler/handler.go:168` and
`:183` on `CreateReservation`, `:278` and `:290` on
`ModifyReservation` — and the overbooking guard compares the count of
overlapping active reservations against that caller-supplied number
(`services/reservations/internal/store/store.go:222` on Create,
`:415` on Modify). A caller that sends a large number therefore never
sees `CONFLICT` and can overbook, and nothing on the booking path
reads the capacity the hotel actually holds for the room type and the
stay dates.

Tier T3: the availability decision moves from a request field to a
server-side read of the hotel's recorded capacity, which gives the
booking path a fail-closed capacity dependency and changes the
booking workflow's trust boundary. The decision record is the
`architect`'s ADR for the capacity seam (ADR-0006, accepted
2026-11-24), and the implementation
design plus the per-flow happy and failure/rollback diagrams are the
`architect`'s HLD/LLD delta. Which service owns the capacity read —
Rates' per-date sellable inventory or the Rooms room inventory — is
the `architect`'s decision, and the product conditions below hold
whichever source is chosen: the caller never sets the capacity. FR/NFR
wording and business rules are the `business-analyst` handoff, guard
mapping and traceability are `qa-lead`'s, the release and rollback
note is `release-manager`'s, and the gate verdict is
`spec-reviewer`'s. The `OVB` domain code names the overbooking guard
family these conditions trace to.

- AC-OVB-1 — Given a room type with N sellable units recorded for a
  stay's dates, when callers create reservations for overlapping dates
  of that type, then the guard decides on the recorded capacity and
  not on the request's `sellableUnits`: a caller that sends a number
  far above N buys no extra booking, a caller that sends a number
  below N, sends zero, or omits the field altogether is not refused
  while recorded units are still free, the Nth overlapping reservation
  that holds a unit is the last one accepted, and the next one refuses
  with `CONFLICT` naming the room type and the dates and writes
  nothing — so the field is optional and advisory and can neither
  raise nor lower the ceiling, while a malformed value is still
  refused as `VALIDATION_FAILED` naming the field. Given a room type
  whose recorded capacity for those dates is zero, when a caller books
  it, then the refusal is the same sold-out `CONFLICT` naming the type
  and dates, never a fail-closed `UPSTREAM_UNAVAILABLE`: a sold-out
  type is not an outage. Given a confirmed reservation, when a caller
  changes its dates or room type to a combination whose recorded
  capacity is already fully booked, then
  the change refuses with `CONFLICT`, the reservation keeps its
  previous dates, type, guest, and price, and no change-history entry
  is written. Given a reservation that is cancelled, marked no-show,
  or closed, when its dates are considered, then it releases its held
  unit exactly as today, so freed capacity becomes sellable again;
  given a reservation that is checked in, when its dates are
  considered, then it keeps holding its unit exactly as today, because
  the in-house share of a room type must not be subtracted from the
  recorded capacity twice (BR-47).
  Traces to: US-RES-1, US-RES-2; FR-RES-1, FR-RES-2, FR-RTE-5,
  NFR-CON-1 (Refs #631).
- AC-OVB-2 — Given the capacity source for a booking's room type and
  dates cannot be read — a transport failure, a timeout, a 5xx, or a
  client that is not wired — when a caller creates or modifies a
  reservation, then the booking is refused fail-closed with
  `UPSTREAM_UNAVAILABLE` (503) naming the upstream and the operation,
  nothing is written, no capacity is assumed from a previous request,
  and no booking is ever accepted against an unverified capacity; a
  capacity-source refusal that carries a 4xx envelope is surfaced
  unchanged, so a rejected session still refuses as
  `UNAUTHENTICATED`. Given no capacity source is configured at all,
  when a caller books, then the booking refuses the same way, so an
  unwired service can never fall back to the request's number.
  Traces to: US-RES-1, US-RES-2; FR-RES-1, FR-RES-2, NFR-CON-1
  (Refs #631).
- AC-OVB-3 — Given the derived capacity and the counted bookings, when
  two callers request the last sellable unit at the same time, then
  exactly one commits and the other refuses with `CONFLICT`, and no
  interleaving lets both through: the capacity is read on the attempt
  and the count-and-insert comparison stays in one critical section,
  so the guard keeps the atomic shape it has today. Given a repeated
  request carrying the same idempotency key, when it replays, then the
  original reservation is returned and no second unit is consumed.
  Given the desk Book screen, when staff quote and confirm, then the
  panel's flow, its own fresh sellability pre-check, the request it
  sends (including `sellableUnits`), and every refusal sentence stay
  as they are — a `CONFLICT` still reads as the sold-out sentence
  (`desk.book.refused_soldout`) and an unreadable capacity source
  reads as the plain request-failed sentence
  (`desk.shell.request_failed`), with no new catalogue key, control,
  or screen. Traces to: US-RES-1; FR-RES-1, FR-RES-2, FR-RTE-5,
  NFR-CON-1 (Refs #631).

Done when: an inflated `sellableUnits` no longer buys extra bookings on
Create or Modify, a request that omits, zeroes, or understates the
field is still booked while recorded capacity is free, a checked-in
reservation still holds its unit while cancelled and no-show rows
release theirs, an unreadable capacity source refuses the booking
fail-closed instead of accepting it, two simultaneous last-unit
requests still yield exactly one winner and one `CONFLICT`, and the
desk Book panel and its guards stay green unchanged.

## 20. Folio writes refuse a stay Billing cannot verify (Refs #634)

Product-owner scope decision and acceptance conditions for audit
finding B1 (#625 class: a client-supplied identifier decides a money
outcome). Billing creates a folio for any UUID stay id it is handed,
with no Stay read, so a charge, a payment, or an open-balance approval
can be written against a stay that does not exist or is already closed
— an orphan folio Stay's check-out gate never reads, and money rows
with no stay behind them.

Tier T3 (confirmed): Billing gains its first runtime outbound read of
Stay and a new fail-closed dependency edge on the money path — the
mirror of #601 (section 14). `architect` owns the decision record
(ADR-0008, accepted by the owner 2026-11-26), the HLD/LLD delta, and the
per-flow implementation diagram with the happy path and the
failure/rollback path. The conditions below are the product half.
FR/NFR wording is owned by `business-analyst`, guard
mapping and traceability by `qa-lead`, the release note and the
availability ops note by `release-manager`, and the gate verdict by
`spec-reviewer`. The desk-visible delta and the EN+VI copy are in
`docs/product/desk-ui-design-rollout.md`
[section 6.21](desk-ui-design-rollout.md); the scope decision is D-32 in
`docs/project/decision-log.md`. `FWV` is the domain code for this
family — no `FR-FWV-*` family exists, and these conditions trace to the
existing `FR-BIL-*` family.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **A folio is created for any id.** `ensureFolio` inserts the row for
  the handed stay id with `ON CONFLICT (stay_id) DO NOTHING` and never
  asks Stay
  (`services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:65-71`),
  and all four folio routes reach it with the client's id
  (`services/billing/src/main/java/com/hotel/billing/service/BillingService.java:121`
  GetFolioBalance, `:142` PostCharge, `:176` RecordPayment, `:264`
  RecordOpenBalanceApproval).
- **The provider-side read already exists.** `GetStayRef` returns the
  stay link and refuses an unknown stay with `NOT_FOUND` and a stay that
  is not in house with `STATE_ILLEGAL`
  (`services/stay/src/store.ts:406-423`, the Postgres store
  `services/stay/src/pgstore.ts:387-409`, routed at
  `services/stay/src/server.ts:152-156`); the seam is registered as C8
  in `docs/technical/integration.md`
  ([section 3](../technical/integration.md)) and its REST surface is
  `GET /v2/stays/{stayId}/ref`
  (`docs/architecture/rest-resource-surface.md:111`,
  `docs/architecture/lld.md:164`).
- **Billing never calls it.** No Stay client exists under
  `services/billing/src`, and ADR-0005's consequences record that
  "Billing's C8 `GetStayRef` is specified but not called today"; the
  threat model carries the consequence as the post-close charge gap that
  names this change as its follow-up
  (`docs/technical/security-threat-model.md`, R5).
- **Neither refusal code is wired in Billing yet.** `ApiException`
  offers `validation`, `notFound`, and `settlementRequired` only
  (`services/billing/src/main/java/com/hotel/billing/web/ApiException.java:34-45`),
  and `UPSTREAM_UNAVAILABLE` is absent from the shared envelope enum
  (`contracts/errors/envelope.json`), so registering the code is part of
  this change — the same registration ADR-0005 already requires.
- **The desk reads a departed guest's folio today.** The print screen
  opens the folio with `GetFolioBalance` and then presents
  `ProduceInvoice` / `ProduceReceipt`
  (`app/src/views/PrintView.vue:1028`, `:1120`, `:1157`), so a
  post-departure read must keep working.
- **The desk has no copy for the new refusals.** The folio panel maps a
  `NOT_FOUND` open to one plain sentence
  (`app/src/views/FolioView.vue:944-962`) and falls back to the generic
  sentence for every other failure (`:566-575`), so a closed stay and an
  unreadable Stay would read as "try again" today.

Product rules (decided here):

1. **No folio without a verified stay.** A folio is created only for a
   stay Stay confirms exists and is in house.
2. **Every folio write verifies.** `PostCharge`, `RecordPayment`, and
   `RecordOpenBalanceApproval` ask Stay every time, whether or not the
   folio already exists.
3. **A folio Billing already holds stays readable in every stay
   state.** The read a departed stay's invoice and receipts need is
   served from the folio Billing holds, so closing a stay never costs
   staff the paper trail.
4. **Fail closed, never guess.** A Stay that cannot be read refuses the
   route with `UPSTREAM_UNAVAILABLE` (503); nothing is created,
   written, or emitted.
5. **No new refusal vocabulary.** The two definitive refusals are the
   ones Stay already returns — `NOT_FOUND` (404) for an unknown stay and
   `STATE_ILLEGAL` (422) for a stay that is not in house — and a
   malformed stay id keeps today's `VALIDATION_FAILED` naming `stayId`.

- AC-FWV-1 — Given a stay id that names no stay Stay knows
  (`GetStayRef` answers `NOT_FOUND`), when a caller posts a charge,
  records a payment, or records an open-balance approval, then the write
  is refused with `NOT_FOUND` (404) naming the stay, and nothing is
  written: no folio row is created for the id, no charge line and no
  payment line exists, no folio balance moves, no approval is recorded,
  and no outbox event is emitted — the same on all three operations, on
  a repeated request, and whether or not the request carries an
  idempotency key, with the refusal in plain words rather than a stack
  trace or a raw code. Traces to: US-BIL-1, US-BIL-2, US-BIL-3,
  US-BIL-7; FR-BIL-1, FR-BIL-2, FR-BIL-3, FR-BIL-7, BR-21.
- AC-FWV-2 — Given a stay Stay reports outside `in-house` — a closed
  departure above all — when a caller posts a charge, records a payment,
  or records an approval against it, then the write is refused with
  `STATE_ILLEGAL` (422) naming the stay and the state it is in, whether
  or not the stay already carries a folio, so a post-departure charge,
  payment, or approval is refused as well; that folio keeps exactly the
  lines and balance it had, no outbox event is emitted, and the invoice
  it presents still matches what Billing holds. Traces to: US-BIL-1,
  US-BIL-2, US-BIL-3, US-BIL-7; FR-BIL-1, FR-BIL-2, FR-BIL-3, FR-BIL-7,
  BR-21, BR-24.
- AC-FWV-3 — Given Stay cannot be read for a stay — a transport
  failure, a timeout, a 5xx, or a client that is not wired — when a
  caller opens the folio balance, posts a charge, records a payment, or
  records an approval, then the call fails closed with
  `UPSTREAM_UNAVAILABLE` (503) naming the upstream and the operation, no
  folio is created or written, no balance moves, no approval is
  recorded, and no outbox event is emitted, so an unverified folio is
  never created and no write is ever half-recorded; once Stay answers
  again the retried call commits once and not twice. Traces to: US-BIL-1,
  US-BIL-2, US-BIL-3, US-BIL-7; FR-BIL-1, FR-BIL-2, FR-BIL-3, FR-BIL-7;
  the fail-closed availability rule is R7 in the threat model (Refs
  #601).
- AC-FWV-4 — Given a stay Stay confirms is in house and that carries no
  folio yet, when staff open its balance on the Folio screen or the Stay
  check-out review reads it, then the folio is created exactly as today
  — one folio for the stay, a zero balance, the acting account recorded
  — and the screen shows the empty folio with its plain no-lines
  sentence; when a charge is posted, a payment recorded, or an approval
  recorded for that stay, then each commits as today with the same line,
  the same balance movement, and the same outbox event. Traces to:
  US-BIL-1, US-BIL-2, US-BIL-3, US-BIL-7; FR-BIL-1, FR-BIL-2,
  FR-BIL-3, FR-BIL-7, BR-21, BR-23.
- AC-FWV-5 — Given a stay that already carries a folio, when staff open
  its balance, then the read is served from what Billing holds in every
  stay state — a closed, departed stay included — so the departure
  invoice and each payment receipt still print and still match the folio
  lines and balance exactly; given a stay that carries no folio and is
  not in house, when staff open it, then the open is refused with the
  same `NOT_FOUND` / `STATE_ILLEGAL` refusal as the writes and creates
  nothing, so no orphan folio exists for a stay Billing cannot verify.
  Traces to: US-BIL-1, US-BIL-4; FR-BIL-1, FR-BIL-4, BR-24.
- AC-FWV-6 — Given a folio route is refused, when the desk renders it,
  then the panel shows one plain sentence in the active locale naming
  what was refused and that nothing was recorded: an unknown stay says
  no stay matches the id, a closed stay says the stay is already checked
  out and no charge or payment can be added after that, and an
  unreadable Stay says the stay could not be checked, with a retry that
  can help; no technical code, status number, stack trace, or invented
  amount, balance, or line appears, the fields stay usable, and the rest
  of the desk keeps working. The existing unknown-folio open sentence,
  the departure statements, and the Stay panel's existing refusal
  sentences stay as they are, and every new sentence exists in both
  catalogues with matching placeholders and
  `script/catalogue-coverage-check.sh` green. Traces to: US-BIL-1,
  US-BIL-2; FR-BIL-1, FR-DSP-3, NFR-I18N-1.
- AC-FWV-7 — Given the change ships, when it is verified, then guards
  cover the unknown-stay caller, the closed-stay caller, and the
  unreadable-Stay caller for each of the three writes and for the
  folio-creating read, plus the two regression paths (a fresh in-house
  check-in still creates its folio; a departed stay's folio still opens
  and still prints); the only new call is the registered C8 read — one
  hop, never a Billing call from inside the read — so the close path
  Stay -> Billing -> Stay stays bounded and cannot recurse;
  `UPSTREAM_UNAVAILABLE` is registered in
  `contracts/errors/envelope.json` beside the codes it already lists;
  and the existing gate guards (`AC-DSK-18`, `AC-DSK-19`, `AC-CKO-1`,
  `AC-CKO-2`, `AC-DEP-1`..`AC-DEP-5`) stay green unchanged. Traces to:
  US-BIL-1, US-BIL-2, US-BIL-3, US-BIL-7; FR-BIL-1, FR-BIL-2,
  FR-BIL-3, FR-BIL-7 (evidence condition; no behaviour change).

Pointer: `AC-BIL-1`, `AC-BIL-2`, `AC-BIL-3`, and `AC-BIL-7` gain the
`AC-FWV-1`..`AC-FWV-3` pointer (those conditions now hold for a stay the
system has verified, and a folio write on a stay Billing cannot verify
is refused instead of recorded); the four conditions stand as written
otherwise.

Done when: a charge, a payment, or an open-balance approval against a
stay that does not exist is refused with `NOT_FOUND` and writes nothing,
the same three against a closed stay are refused with `STATE_ILLEGAL`
whether or not a folio exists, an unreadable Stay refuses every folio
route fail-closed with `UPSTREAM_UNAVAILABLE` instead of creating an
unverified folio, a fresh in-house check-in still gets its folio on the
first balance read, a departed stay's folio and its invoice still read
and print, and the desk says each refusal in plain words in both
locales.

## 21. Backend faults report an internal-error code (Refs #627)

Product-owner scope decision and acceptance conditions for audit
finding C1 (issue #627): every Node service answers an unexpected
exception with HTTP 500 but the body code `VALIDATION_FAILED`, so a
database failure, a wiring fault, or a crash reads to the desk as bad
input. One code for the 5xx path, registered in the shared contract and
honoured by all four Node maps.

Tier T2: a caller-visible wire-vocabulary change — a new `code` token
on the 5xx path plus a grown contract enum — with no new subsystem,
dependency edge, data model, lifecycle state, or reader-visible
surface; ADR-0004 D1 already covers additive error codes, so no new
ADR. The conditions below are the product half. Contract registration
and the technical taxonomy are owned by `architect`
(`contracts/errors/envelope.json`, `docs/technical/error-handling.md`
section 1, and the LLD section that draws the unexpected-exception path
for the four Node services); FR/NFR wording by `business-analyst`
(`docs/requirements/mvp-requirements.md` section 29, the `FR-ERR-*`
family these conditions cite as `FR-ERR-1`..`FR-ERR-3`); guard mapping
and traceability by `qa-lead` (`docs/testing/traceability-matrix.md`
section 21); and the gate verdict by `spec-reviewer`. The change
carries no UI contract section because no desk surface changes: a
failed read already renders the shell's plain request-failed sentence
(`app/src/views/RoomsView.vue:669-681`) and every `5xx` already reads
as an unreadable outcome (`docs/technical/error-handling.md`
[section 4](../technical/error-handling.md), Refs #647). The scope
decision is D-33 in `docs/project/decision-log.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **Every catch-all answers a 500 with `VALIDATION_FAILED`.** Each Node
  service writes the unexpected-exception reply with that code:
  `services/stay/src/server.ts:76-87` (the 500 body at `:80-85`),
  `services/guests/src/server.ts:47-57` (`:51-56`),
  `services/rooms/src/server.ts:47-57` (`:51-56`), and
  `services/admin/src/server.ts:55-66` (`:59-64`).
- **No internal-error token exists.** The four maps carry the same
  seven refusal codes — Admin adds `IDENTITY_LOCKED` as an eighth and
  no service carries an internal-error token
  (`services/stay/src/errors.ts:4-21`,
  `services/guests/src/errors.ts:4-21`,
  `services/rooms/src/errors.ts:4-21`,
  `services/admin/src/errors.ts:4-23`) — the contract enum lists eight
  codes (`contracts/errors/envelope.json:9`), and the technical taxonomy
  names the refusal vocabulary without an internal-error code
  (`docs/technical/error-handling.md:13-22`).
- **A store failure reaches that catch-all.** The Postgres store calls
  the pool and its clients directly (`services/stay/src/pgstore.ts:207-211`,
  `:302-306`, `:344-351`) and throws `HttpError` only for a product
  refusal (`:212-219`, `:300`, `:352-362`), so a driver error is not an
  `HttpError` and the desk is told its input was wrong.
- **`UPSTREAM_UNAVAILABLE` is emitted and documented but unregistered.**
  Reservations returns it at
  `services/reservations/internal/service/service.go:76-83` and the
  taxonomy describes it at `docs/technical/error-handling.md:20-22`,
  yet it is absent from the contract enum
  (`contracts/errors/envelope.json:9`) and from all four Node maps; the
  Admin contract-sync guard walks the contract's `statusMapping`
  (`services/admin/src/errors.test.ts:25-29`), so the registration and
  the four maps have to move together.
- **The desk does not branch on the code of a 5xx.** A failed read
  renders the shell's plain request-failed sentence
  (`app/src/views/RoomsView.vue:669-681`), the one code-dependent
  refusal branch on a money read matches `NOT_FOUND` or
  `VALIDATION_FAILED` naming a field (`app/src/views/PrintView.vue:1042-1052`),
  and a desk guard already forbids a raw code token in rendered text
  (`app/src/views/desk-edge-guards.test.ts:42`).

Product rules (decided here):

1. **A backend fault is never bad input.** `VALIDATION_FAILED` (400)
   states that the caller's request was wrong; an unexpected
   server-side failure is nobody's input error and must not borrow that
   code.
2. **One token for one meaning.** `INTERNAL_ERROR` (500) is the only
   code an unexpected exception answers with, in all four Node
   services and for every later caller.
3. **The envelope shape does not change.** The `5xx` answer keeps
   `code`, `message`, `details`, and `traceId`; its message stays the
   existing plain unexpected-failure catalogue sentence with no driver,
   SQL, host, path, or stack-trace text, and `traceId` still links the
   answer to the audit entry.
4. **The contract enum is the single vocabulary.** This change
   registers `INTERNAL_ERROR` (500), `UPSTREAM_UNAVAILABLE` (503), and
   `METHOD_NOT_ALLOWED` (405) in `contracts/errors/envelope.json` and
   describes all three in the technical taxonomy; all four Node maps
   accept them, so a service cannot emit a code the contract does not
   list, and both the `contract-check` gate and the Admin
   contract-sync guard stay green. The #634 spec set promised
   `UPSTREAM_UNAVAILABLE`'s registration in its own change; this change
   takes that edit (one change owns the enum, so two PRs cannot edit it
   or leave a spec-versus-file mismatch), and the sentence in
   `docs/technical/error-handling.md` section 5 that placed it there is
   reconciled by `architect` to point at this change.
5. **A wrong method is a conformance answer, not a product refusal.**
   The Go and Billing conformance issues (#628, #629) need a `405` code
   for a wrong-method call on a known route; the vocabulary carries
   `METHOD_NOT_ALLOWED` (405) rather than borrowing `NOT_FOUND`, and no
   desk action can receive it because the desk never sends a wrong
   method. Registering it in the same edit keeps the enum to one change
   for all three issues.
6. **Existing refusals are untouched.** Every refusal path keeps its
   code and status, and the desk's sentences, routes, catalogues, and
   print rules stay as written.

- AC-ERR-1 — Given a caller reaches any operation of Stay, Guests,
  Rooms, or Admin and the operation fails for a reason that is not a
  product refusal — an unexpected exception, a store or driver
  failure, a wiring bug — when the service answers, then the answer is
  HTTP 500 carrying the shared envelope with `code` equal to
  `INTERNAL_ERROR`, never `VALIDATION_FAILED`; the message is the
  existing plain unexpected-failure sentence with no driver, SQL, host,
  path, or stack-trace text; `details` carries no invented field; and
  `traceId` is present for every answer, so the desk can tell a fault
  from bad input and support can trace it. The same service answers its
  next request normally, so one fault never leaves the module unable to
  serve. Traces to: FR-ERR-1 (Refs #627); FR-DSP-3, NFR-I18N-1,
  NFR-AUD-1.
- AC-ERR-2 — Given the shared contract, when the change lands, then
  `contracts/errors/envelope.json` lists `INTERNAL_ERROR` (500),
  `UPSTREAM_UNAVAILABLE` (503), and `METHOD_NOT_ALLOWED` (405) in its
  `code` enum and its `statusMapping`, the technical taxonomy describes
  all three beside the codes it already names, and every served or
  derived copy matches the single source under `contract-check`; all
  four Node maps accept the three tokens with those statuses — the
  three services that do not lock an identity keep their existing
  admin-only `IDENTITY_LOCKED` entry — so no service can emit a code
  outside the contract, and the Admin guard that resolves every
  `statusMapping` entry in code stays green. Traces to: FR-ERR-2
  (Refs #627); ADR-0004 D1 (additive code).
- AC-ERR-3 — Given an existing refusal — a malformed body or a
  malformed field (`VALIDATION_FAILED`, 400), a rejected session
  (`UNAUTHENTICATED`, 401), a locked identity (`IDENTITY_LOCKED`, 401),
  an out-of-role attempt (`FORBIDDEN`, 403), an unknown route, path, or
  stay (`NOT_FOUND`, 404), a conflict (`CONFLICT`, 409), an illegal
  state (`STATE_ILLEGAL`, 422), an unmet settlement gate
  (`SETTLEMENT_REQUIRED`, 409), or an unreadable provider
  (`UPSTREAM_UNAVAILABLE`, 503) — when it is raised, then its code and
  status are exactly what they are today and no product refusal is
  reclassified as an internal error, so the refusal conditions written
  earlier (`AC-FDK-2`, `AC-CKO-1`, `AC-CKO-2`) hold as written. Traces
  to: FR-ERR-3 (Refs #627).
- AC-ERR-4 — Given the change ships, when it is verified, then each of
  the four Node services carries a guard that drives its
  unexpected-exception path with a failure that is not an `HttpError`
  and asserts HTTP 500, a JSON reply, the four envelope keys, and
  `code` equal to `INTERNAL_ERROR` — never `VALIDATION_FAILED` — and a
  guard pins that no service emits a code outside the contract enum;
  `contract-check` and the Admin contract-sync guard are green. Traces
  to: FR-ERR-1, FR-ERR-2; NFR-I18N-1 (evidence condition; no behaviour
  change).
- AC-ERR-5 — Given any desk screen or print surface reads a failure,
  when one of these answers arrives, then the desk behaves exactly as
  today: the shell's plain request-failed sentence for a failed read,
  the unreadable-outcome rule for a `5xx` (nothing released, the rooms
  named for re-read), and the existing refusal sentences for the `4xx`
  paths; no `INTERNAL_ERROR`, `UPSTREAM_UNAVAILABLE`, or
  `METHOD_NOT_ALLOWED` token is rendered as text, no catalogue key is
  added, and no route, layout, or print rule changes. Traces to:
  FR-DSP-3, NFR-I18N-1; the section 4 unreadable-outcome rule
  (Refs #647).

Done when: a database failure or any other unexpected exception in
Stay, Guests, Rooms, or Admin answers HTTP 500 with the shared envelope
and `code: "INTERNAL_ERROR"` instead of `VALIDATION_FAILED`, the
contract and the technical taxonomy register `INTERNAL_ERROR`,
`UPSTREAM_UNAVAILABLE`, and `METHOD_NOT_ALLOWED` with their statuses
and the four Node maps follow them, every existing refusal keeps its
code and status, each service carries a `5xx`-path guard, and the
desk's sentences, routes, catalogues, and print surfaces are unchanged.

## 22. Bounded request bodies and finite server timeouts (Refs #630)

Product-owner scope decision and acceptance conditions for audit
finding C5 (issue #630): no backend service bounds a request body and
no server declares its own timeouts, so one oversized body or one slow
peer can exhaust the memory of the single on-premise host or hold a
connection and a worker for as long as the peer likes. One declared
maximum per service, one shared refusal, and finite read/write/idle
bounds on every server the bundle runs.

Tier T2: a caller-visible refusal (a body over the declared limit) plus
a server-settings change on every ingress path, with no new subsystem,
dependency edge, data model, lifecycle state, or reader-visible surface,
and no new code token — ADR-0004 D1 keeps the error envelope and its
status mapping exactly as they are. The conditions below are the
product half. FR/NFR wording is owned by `business-analyst`
(`docs/requirements/mvp-requirements.md` section 30, the `NFR-BND-*`
family these conditions cite); the over-limit edge diagram and the
chosen Go timeout values by `architect` (LLD section 29 and
`docs/architecture/services/*.md` section 7); guard mapping by
`qa-lead` (`docs/testing/traceability-matrix.md` section 22); the gate
verdict by `spec-reviewer`. No UI contract section: no desk surface
changes, because the desk never sends a body near the limit and every
refusal it can meet is already read through the existing plain
refusal and request-failed sentences. The scope decision is D-34 in
`docs/project/decision-log.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **The four Node services accumulate a body with no bound.** `readBody`
  pushes every chunk into an array and concatenates the lot before
  parsing: `services/stay/src/server.ts:10-35` (the chunk push at `:13`,
  the concatenation at `:15`), `services/guests/src/server.ts:10-35`
  (`:13`, `:15`), `services/rooms/src/server.ts:10-35` (`:13`, `:15`),
  and `services/admin/src/server.ts:9-34` (`:12`, `:14`). No service
  inspects `content-length`, counts bytes, or stops reading.
- **The four Node servers set no timeout of their own.** Each server is
  created bare (`services/stay/src/server.ts:75`,
  `services/guests/src/server.ts:46`, `services/rooms/src/server.ts:46`,
  `services/admin/src/server.ts:54`) and started as it came back
  (`services/stay/src/index.ts:34`, `services/guests/src/index.ts:21`,
  `services/rooms/src/index.ts:21`, `services/admin/src/index.ts:34`),
  so the socket-inactivity timeout keeps Node's "disabled" default and a
  half-open body read holds the socket indefinitely.
- **The three Go services decode the raw body with no cap.** `decodeBody`
  hands `r.Body` straight to the decoder:
  `services/reservations/internal/handler/handler.go:43` (decoder at
  `:48`), `services/rates/internal/handler/handler.go:41` (`:46`), and
  `services/reporting/internal/handler/handler.go:45` (`:50`); no
  `http.MaxBytesReader` is used anywhere in the tree.
- **The three Go servers run with zero explicit timeouts.** Each `main`
  calls `http.ListenAndServe` with an `http.Server` that carries only an
  address: `services/reservations/cmd/server/main.go:52`,
  `services/rates/cmd/server/main.go:42`,
  `services/reporting/cmd/server/main.go:34`. `ReadHeaderTimeout`,
  `ReadTimeout`, `WriteTimeout`, and `IdleTimeout` are all unset, so a
  peer may take unlimited time to send headers, body, or drain the
  response.
- **Billing's embedded server declares no bound either.**
  `services/billing/src/main/resources/application.properties:1-9`
  carries only the port, the datasource, and Flyway — no
  `server.tomcat.*` timeout or size setting — and every operation reads
  the body through `@RequestBody Map<String, Object>`
  (`services/billing/src/main/java/com/hotel/billing/web/BillingController.java:20`,
  e.g. `:74-76`), so Jackson buffers whatever arrives before any handler
  validation runs.
- **No bound exists anywhere in the tree today.** No `MaxBytesReader`,
  `maxBody`/`MAX_BODY`, `maxPostSize`, `maxSwallowSize`, or
  `*-http.*-size` setting is written in `services/`, `contracts/`, or
  `app/`, and no document states a body size rule.
- **The largest contract payload is small and known.**
  `contracts/http/ModifyReservation.json` is the biggest request schema
  at 3 530 bytes (next: `CreateReservation.json` 3 153,
  `AttachReservation.json` 3 118, `CheckOut.json` 3 093) and the
  contract-test fixtures sit below those, so a 64 KiB ceiling leaves
  more than 18× headroom over anything the desk can send.

Product rules (decided here):

1. **One number for every ingress path.** The request-body maximum is
   **65 536 bytes (64 KiB)** in all eight backend services — Stay,
   Guests, Rooms, Admin, Reservations, Rates, Reporting, and Billing —
   declared as a named constant in each service's own code. The number
   is derived from the largest existing contract fixture with wide
   headroom, so no legitimate desk payload is anywhere near it.
2. **The bound is a constant, not configuration.** It is not an
   environment variable, not a deployment setting, and not something an
   operator tunes per hotel. Keeping it in code keeps this a T2 change
   with no deployment, environment, runbook, or per-hotel configuration
   delta; a hotel that ever needs a different ceiling files an issue
   that owns the T4 work.
3. **An oversized body is the caller's mistake, not a fault.** It
   refuses with the shared envelope and `VALIDATION_FAILED` (400) with
   `details` naming `body` and the new plain catalogue sentence
   `error.transport.body_too_large` ("Request body is too large.") — the
   existing refusal vocabulary, not a new `PAYLOAD_TOO_LARGE` token — so
   the contract enum, the status mapping, the four Node code maps, and
   the Billing exception handler stay unchanged. The key joins the
   existing `error.transport.*` family in every service's catalogue (the
   four Node `messages.en.json` files, the three Go message sets, and
   Billing's `messages/en.json`), so the refusal is a plain sentence in
   every service and both desk locales, never a raw code or a byte
   count.
4. **Refuse before work.** The ceiling is enforced while the body is
   read, before it is parsed and before any store, provider, or folio
   call runs, so a refused request changes nothing: no row, line,
   balance, outbox event, or state transition, and no half-finished
   operation left for a retry to trip over.
5. **One complete answer, never a partial one.** The refusal is exactly
   one envelope reply with `code`, `message`, `details`, and `traceId`;
   the rest of the surplus body is not buffered in memory and no
   truncated JSON is parsed or half-written response is sent.
6. **Finite timeouts on every server the bundle runs.** Each server
   binds a header-read, a body-read, a response-write, and an idle
   bound; none is left zero or unset. A peer that opens a connection
   and sends nothing, or stalls mid-body or mid-response, is freed
   within the declared bound while a legitimate desk call — including a
   handler that waits on a bounded provider read (the Reservations →
   Rates pricing client's 5-second budget,
   `services/reservations/internal/pricing/client.go:33`, and Stay's
   2-second completion read,
   `services/stay/src/reservationsClient.ts:31`) — still completes.
7. **Nothing under the limit changes.** Every body at or below the
   ceiling is served exactly as today: same codes, statuses, messages,
   and state. No desk screen, catalogue key, route, print rule, or
   contract file changes, and the conditions written earlier
   (`AC-ERR-1`, `AC-FWV-1`, `AC-CKO-1`) hold as written.

- AC-BND-1 — Given any request that carries a body, when its size
  exceeds the declared maximum, then the service answers exactly one
  HTTP 400 with the shared envelope — `code` `VALIDATION_FAILED`,
  `details` naming the field `body`, `traceId` present, and the plain
  `error.transport.body_too_large` sentence — in each of Stay, Guests,
  Rooms, Admin, Reservations, Rates, Reporting, and Billing; the body is
  never scanned or parsed as JSON, the operation never runs, no store
  row, folio line, balance, outbox event, or state change is written,
  and the surplus bytes are never accumulated in full, so a refused
  request leaves no trace beyond the refusal itself. For an operation
  that requires a session, an unauthenticated request is refused with
  `UNAUTHENTICATED` (401) before the body is read, so this ceiling
  applies to every request that reaches the body read (`AC-CFG-1`,
  `AC-CFG-2`). Traces to:
  NFR-BND-1 (Refs #630); NFR-I18N-1, NFR-AVL-1.
- AC-BND-2 — Given the eight services and their body ceilings, when the
  change lands, then each service declares its ceiling once as a named
  constant, the value is 65 536 bytes in all eight, and no environment
  variable, deployment file, runbook step, or per-hotel configuration
  entry carries or overrides it, so the bundle's behaviour is the same
  on every installation. The ceiling is at least ten times the largest
  request schema the contracts hold (`contracts/http/ModifyReservation.json`,
  3 530 bytes), and the refusal adds no code token: the contract enum
  and `statusMapping` (`contracts/errors/envelope.json`), the four Node
  maps, and the Billing exception handler keep exactly the codes they
  have today. Traces to: NFR-BND-2 (Refs #630); ADR-0004 D1.
- AC-BND-3 — Given a peer that connects to any of the eight services,
  when it sends headers slowly, stalls part-way through a body, stops
  reading the response, or sits idle on an open connection, then the
  server frees that connection within a declared bound instead of
  holding a worker indefinitely: each server carries an explicit
  header-read, body-read, response-write, and idle value (the three Go
  servers set `ReadHeaderTimeout`, `ReadTimeout`, `WriteTimeout`, and
  `IdleTimeout`; the four Node servers and Billing's embedded server set
  their equivalents), no unbounded or disabled timeout remains, and the
  chosen values stay long enough for a legitimate desk call — including
  a handler waiting on the 5-second pricing read and the 2-second
  completion read — so no in-limit request is cut off by a timeout.
  Traces to: NFR-BND-3 (Refs #630); NFR-PERF-1, NFR-AVL-1.
- AC-BND-4 — Given every request schema, contract-test fixture, and
  desk payload the product already sends, when it is under the ceiling,
  then it behaves exactly as today — same status, code, message,
  `details`, and stored effect — a body at exactly 65 536 bytes is
  accepted and one byte more is refused, `contract-check` stays green
  with no contract file changed, and the desk's screens, plain refusal
  sentences, routes, catalogue keys, and print rules are untouched
  (the refusal's `body` field name deliberately matches none of the
  field names the desk branches on, `stayId`, `folioId`, `paymentId`,
  so no desk branch changes). Traces to: NFR-BND-1 (Refs #630);
  FR-DSP-3, NFR-I18N-1.
- AC-BND-5 — Given the change ships, when it is verified, then each of
  the eight services carries a guard that drives an over-limit body at
  its own ceiling and asserts the refusal envelope (HTTP 400,
  `VALIDATION_FAILED`, `details.body`, a `traceId`) together with "no
  operation ran" evidence, each guard also covers the boundary (a body
  at the ceiling is accepted, one byte over is refused), each server has
  a guard asserting its timeout values are explicit and non-zero, and
  each service's message-catalogue guard pins the
  `error.transport.body_too_large` sentence, so a future change cannot
  drop a ceiling, a timeout, or the sentence silently. Traces to:
  NFR-BND-1, NFR-BND-2, NFR-BND-3 (Refs #630); NFR-I18N-1 (evidence
  condition; no behaviour change).

Done when: every one of the eight backend services refuses a request
body above 65 536 bytes with the shared envelope and `VALIDATION_FAILED`
naming `body`, has changed nothing for that request, and runs with
explicit finite read/write/idle timeouts; no environment variable,
deployment file, or contract file changes; every payload under the
ceiling behaves as before; and each service carries an over-limit
boundary guard plus a timeout guard.

## 23. Money amounts carry an explicit ceiling and refuse a fractional value (Refs #635)

Product-owner scope decision and acceptance conditions for audit
finding B2 (issue #635): Billing's HTTP adapters take any JSON number
as a money amount and truncate it to a whole minor unit, so
`amountMinor: 12.99` posts 12 with no refusal, and no adapter bounds
the magnitude, so a value far beyond anything the product can
legitimately produce enters the stored `long` and the folio. One
declared ceiling, one refusal for a value that is not a whole number of
minor units, and the sign and percent rules that already exist left
exactly where they are.

Tier T2: a new caller-visible refusal on four Billing operations, with
no new subsystem, dependency edge, data model, lifecycle state,
endpoint, reader-visible surface, or error-code token — ADR-0004 D1
keeps the envelope and its status mapping exactly as they are. The
conditions below are the product half. FR/NFR wording is owned by
`business-analyst` (`docs/requirements/mvp-requirements.md` section
31) and the business rule that states the ceiling is BR-61
(`docs/requirements/business-rules.md`); the adapter edge on the
folio-write refusal diagram is `architect` (`docs/architecture/lld.md`
section 30); guard mapping is `qa-lead`
(`docs/testing/traceability-matrix.md` section 23); the gate verdict
by `spec-reviewer`. No UI contract section: no desk surface changes,
because every desk money input is already converted to whole minor
units before it is sent (`app/src/views/FolioView.vue:441-451`,
`Math.round(major * 100)`), so neither new refusal is reachable from
the desk, and the two refusals a third-party caller can meet are read
through the existing plain request-failed sentence rather than a new
desk branch. The scope decision is D-35 in
`docs/project/decision-log.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **The money adapter truncates instead of refusing.** `amountOf`
  takes any `Number`, calls `longValue()` on it, and returns the
  result, so `12.99` silently becomes `12` and a value beyond a
  `double`'s exact integer range loses precision before it is stored:
  `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:47-53`.
  A value that is present but not a JSON number also lands on the
  missing-field sentence today (`error.validation.field_required`,
  `:52`), so the adapter cannot tell "absent" from "wrong type".
- **The same helper serves all three money fields and bounds none of
  them.** `PostCharge` passes `amountOf(body, "amountMinor")`
  (`BillingController.java:86`), `RecordPayment` passes
  `amountOf(body, "amountMinor")` (`:93`), and `UpsertChargeItem`
  passes `amountOf(body, "priceMinor")` (`:129`); no caller checks the
  magnitude, and no constant in the tree states a ceiling.
- **The percent adapter converts, but reads no bound of its own.**
  `percentOf` builds a `BigDecimal` from `number.toString()` and maps a
  failed conversion to the field-number sentence
  (`BillingController.java:55-64`); the 0–100 range is the service's
  (`BillingService.java:340-342`, `error.validation.percent_range`).
- **The sign rules already exist one layer below and stay there.**
  `postCharge` refuses a negative amount (`BillingService.java:134-136`,
  `error.validation.amount_negative`), `recordPayment` requires a
  positive one (`:172-174`, `error.validation.amount_positive`), and
  `upsertChargeItem` refuses a negative price (`:321-323`,
  `error.validation.price_negative`).
- **The desk cannot send a fractional amount.** Both Folio money
  inputs run through `parseMinor`, which multiplies the typed major
  amount by 100 and rounds it to a whole number
  (`app/src/views/FolioView.vue:441-451`), so the fractional and
  over-ceiling cases are API-caller cases, not desk cases.
- **The largest money value the product already carries is small and
  known.** The biggest amount in the contract-test fixtures is
  2 400 000 minor units (a quoted VND price,
  `services/guests/contract-tests/ProduceConfirmation.json`,
  `:13`; the same value in `AttachReservation.json` `:11`, `:20`), and
  the biggest amount on the owner design boards is a two-night room
  charge of `1.800.000 đ` = 180 000 000 minor units
  (`docs/design/Folio.dc.html`).
- **The longest legitimate stay is bounded.** Rates refuses a quote
  range longer than 730 nights (`services/rates/internal/store/store.go:254`,
  `services/rates/internal/store/postgres.go:258`,
  `docs/architecture/services/rates.md`, section 3), so the largest
  single charge the product can produce — one room charge at a stay's
  frozen quoted total (`BR-45`) — is a 730-night amount, not an
  arbitrary one.
- **A JSON double stays exact far above any hotel amount.** Whole
  integers are represented exactly only up to 2<sup>53</sup> =
  9 007 199 254 740 992, so a ceiling has to sit below that to keep
  every accepted amount exact.
- **No money ceiling exists in any document today.** No request schema,
  business rule, requirement, or service design states a maximum money
  amount: the three Billing request schemas that carry a money field
  declare `"type": "integer"` with a `minimum` only
  (`contracts/http/PostCharge.json`,
  `contracts/http/RecordPayment.json`,
  `contracts/http/UpsertChargeItem.json`), so the bound is a new rule
  rather than conformance to an existing one.

Product rules (decided here):

1. **One ceiling for every money adapter: 1 000 000 000 000 minor
   units.** The same number bounds `PostCharge.amountMinor`,
   `RecordPayment.amountMinor`, and `UpsertChargeItem.priceMinor`. It is
   a named constant in the Billing adapter, not configuration, and not
   something an operator tunes per hotel — the #630 ceiling pattern —
   so this change carries no deployment, environment, runbook, or
   per-hotel configuration delta.
2. **The ceiling is derived, not guessed.** The largest amount the
   product can legitimately produce is one room charge at a stay's
   frozen quoted total (`BR-45`), bounded by the longest stay Rates
   accepts (730 nights) times a plausible nightly price. At the owner
   boards' standard rate (900 000 đ a night — `1.800.000 đ` for two
   nights, 180 000 000 minor units) a 730-night charge is
   65 700 000 000 minor units, and the ceiling sits more than 15× above
   that, so a stay priced up to about 13 698 630 đ a night still posts
   as one charge at the extreme. It is also about 416 667× the largest
   money fixture the contracts carry (2 400 000 minor units) and four
   orders of magnitude below 2<sup>53</sup>, so every accepted amount
   round-trips exactly through JSON and the stored `long`.
3. **A fractional amount is refused, never truncated.** A value that is
   not a whole number of minor units refuses with the shared envelope
   and `VALIDATION_FAILED` (400), `details` naming the field, and one
   new plain sentence `error.validation.amount_not_integer`
   ("{field} must be a whole number of minor units."), so `12.99` never
   posts 12, and the refusal happens in the adapter before any service,
   store, provider, or folio call runs.
4. **A magnitude above the ceiling is refused naming the field.** A
   value whose magnitude exceeds 1 000 000 000 000 minor units refuses
   with the same envelope and `VALIDATION_FAILED` (400), `details`
   naming the field, and one new plain sentence
   `error.validation.amount_above_ceiling` ("{field} must be at most
   {max} minor units."), with `{max}` rendered through the existing
   number formatter rather than pasted. The ceiling applies to the
   magnitude, so a huge negative amount is refused by this rule while
   an in-range negative amount keeps its existing sign refusal.
5. **A whole value spelled with a decimal point is still a whole
   amount.** The rule is about the value, not its JSON spelling:
   `12.0` is 12 minor units and is accepted exactly as `12` is, so a
   caller whose serialiser writes whole numbers with a decimal point
   is not refused. An absent field keeps today's
   `error.validation.field_required` refusal, and a present value that
   is not a JSON number at all (for example a string `"12"`) is refused
   with the existing `error.validation.field_number` sentence naming
   the field instead of today's missing-field one, so "absent" and
   "wrong type" read as the two different caller mistakes they are;
   `AC-AMT-1` covers both.
6. **The percent adapter bounds the number, not the money.** A tax rate
   is not a money amount: a fractional percent such as `8.5` stays
   accepted and drives the derivation exactly as today
   (`BillingService.java:340-342` keeps the 0–100 range and its
   `error.validation.percent_range` sentence), and a percent that is
   not a finite JSON number refuses naming `percent` with
   `error.validation.field_number`. No fractional rule and no new
   ceiling apply to `percent`.
7. **The sign rules stay where they are.** `amount_negative`,
   `amount_positive`, and `price_negative` keep their codes, statuses,
   sentences, and layer (`BillingService.java:134-136`, `:172-174`,
   `:321-323`); the adapter adds no sign rule of its own, so an
   in-range amount outside the field's allowed sign is refused by the
   service exactly as today.
8. **Nothing inside the ceiling changes.** Every whole amount at or
   below 1 000 000 000 000 minor units is served exactly as today —
   same status, code, message, `details`, and stored effect, including
   idempotent replays and the tax/fee derivation — and no desk screen,
   catalogue key, route, print rule, or contract file changes. Whether
   the request schemas also declare the ceiling as a `maximum` is the
   `architect`'s contract decision and does not change these
   conditions: the refusal is enforced in the adapter either way.

- AC-AMT-1 — Given a money field on `PostCharge`, `RecordPayment`, or
  `UpsertChargeItem`, when the caller sends a value that is not a whole
  number of minor units — a fractional number such as
  `amountMinor: 12.99`, or a present value that is not a JSON number at
  all such as `amountMinor: "12"` — then the service answers exactly
  one HTTP 400 with the shared envelope — code `VALIDATION_FAILED`,
  `details` naming that field, a `traceId`, and the
  `error.validation.amount_not_integer` sentence for the fractional
  number while the non-number value keeps the existing
  `error.validation.field_number` sentence instead of the missing-field
  one — the value is never truncated, and no folio row, line, payment,
  balance movement, charge item, idempotency record, or outbox event is
  written, because the refusal happens in the adapter before the
  service is called. Traces to: FR-BIL-2, FR-BIL-3 (Refs #635);
  AC-BIL-2, AC-BIL-3; BR-61.
- AC-AMT-2 — Given the same three money fields, when the caller sends a
  value whose magnitude exceeds 1 000 000 000 000 minor units, then the
  service answers exactly one HTTP 400 with the shared envelope — code
  `VALIDATION_FAILED`, `details` naming that field, the
  `error.validation.amount_above_ceiling` sentence carrying the ceiling,
  and a `traceId` — and writes nothing, and the same refusal covers a
  large negative amount, while an in-range negative amount keeps the
  existing sign refusal `error.validation.amount_negative` or
  `error.validation.price_negative`. Traces to: FR-BIL-2, FR-BIL-3
  (Refs #635); AC-BIL-2, AC-BIL-3; BR-61.
- AC-AMT-3 — Given a whole amount inside the ceiling, when it is sent to
  any of the three money fields, then the operation behaves exactly as
  today — same status, code, message, `details`, and stored effect —
  including `0` for `PostCharge.amountMinor` and
  `UpsertChargeItem.priceMinor`, an idempotent replay, the tax and fee
  derivation, and a value written with a decimal point (`12.0`) being
  accepted as `12`; an amount at exactly 1 000 000 000 000 minor units
  is accepted and one minor unit more is refused, and `contract-check`
  stays green with no contract file changed. Traces to: FR-BIL-2,
  FR-BIL-3, FR-BIL-5 (Refs #635); AC-BIL-2, AC-BIL-3, AC-BIL-5;
  BR-61.
- AC-AMT-4 — Given the tax-rule percent adapter, when a caller sends a
  percent that is not a finite JSON number, then the service answers
  `VALIDATION_FAILED` (400) with `details` naming `percent` and the
  `error.validation.field_number` sentence instead of the missing-field
  one; a fractional percent such as `8.5` stays accepted and drives the
  derivation exactly as today, an out-of-range percent keeps the
  service's existing `error.validation.percent_range` refusal naming
  `percent`, and an absent `percent` keeps
  `error.validation.field_required`. Traces to: FR-BIL-5 (Refs #635);
  AC-BIL-5; BR-61.
- AC-AMT-5 — Given the change ships, when it is verified, then
  `BillingControllerTest` carries, for each of the three money adapters,
  a guard that drives the fractional value, a present non-number value,
  and the over-ceiling value and asserts the refusal
  (`VALIDATION_FAILED`, the field in `details`, the plain sentence, a
  `traceId`) together with "the service was never called" evidence, a
  guard for the percent adapter's unreadable value, the boundary pair
  (an amount at the ceiling is accepted and one minor unit more is
  refused), and an in-range regression case per money field, and the
  Billing message-catalogue guard pins both new sentences, so a future
  change cannot drop the ceiling, the whole-number rule, or a sentence
  silently. Traces to: FR-BIL-2, FR-BIL-3, FR-BIL-5 (Refs #635);
  NFR-I18N-1 (evidence condition; no behaviour change); BR-61.

Done when: `PostCharge`, `RecordPayment`, and `UpsertChargeItem` refuse
a fractional, non-number, or over-ceiling money value with the shared
envelope and `VALIDATION_FAILED` naming the field and write nothing for
that request; the tax-rule percent adapter refuses a value it cannot
read as a finite number while keeping fractional percents and the
existing 0–100 range; every whole amount inside the ceiling behaves
exactly as before with no contract, desk, catalogue, route, or print
change; and each adapter carries a fractional guard, a non-number
guard, an over-ceiling guard, and its boundary pair.

## 24. Reporting date ranges carry a declared span cap (Refs #641)

Product-owner scope decision and acceptance conditions for audit
finding P1 (issue #641): `parseRange` checks a report window's shape
and order but never its span, and both range reports then walk every
date in the window under the store lock, so one request such as
`0001-01-01`..`9999-12-31` loops over millions of dates while every
other report waits behind the same mutex — a self-inflicted denial of
service on the single on-premise host. One declared span cap on both
range reports, one shared refusal, and nothing inside the cap moves.

Tier T2 (thin): a caller-visible refusal on two read operations, with
no new subsystem, dependency edge, data model, lifecycle state, or
code token, and no reader-visible surface — ADR-0004 D1 keeps the
envelope and its status mapping exactly as they are. Not T1: T1 covers
typos, test-only work, and dependency bumps, while this adds a refusal
a caller can meet. Not T3 either: the cap adopts a bound the product
already documents, so no architectural decision and no ADR is added.
The conditions below are the product half. FR/NFR wording is owned by
`business-analyst` (`docs/requirements/mvp-requirements.md` section
32) and the business rule that states the cap is BR-62
(`docs/requirements/business-rules.md`); the LLD delta and the refusal
edge on the reporting service design's failure flowchart and error
mapping by `architect` (LLD section 31,
`docs/architecture/services/reporting.md` sections 4 and 6, refreshed
by the implementation PR per maintain-with-code); guard mapping by
`qa-lead` (`docs/testing/traceability-matrix.md` section 24); the gate
verdict by `spec-reviewer`. No UI contract section: no desk screen
calls `OccupancyReport` or `RevenueSummary` today (no view and no
route under `app/src` reaches either operation), so no screen,
catalogue key, route, or print rule changes. The scope decision is
D-36 in `docs/project/decision-log.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **The window is shape- and order-checked, never bounded by span.**
  `parseRange` parses both dates, refuses a malformed one naming the
  field, and refuses `dateTo` before `dateFrom`; nothing compares the
  distance between the two ends
  (`services/reporting/internal/store/store.go:440-453`).
- **Both range reports walk every date under the store lock.**
  `Occupancy` takes `s.mu.Lock()` at `:465` and loops `for day :=
  from; !day.After(to)` at `:480`, scanning every active reservation
  for every room type on every date; `Revenue` takes the lock at
  `:520` and walks the same inclusive loop at `:523`. A
  `0001-01-01`..`9999-12-31` window is millions of iterations holding
  a mutex every other report read needs, so one caller stalls all
  reporting.
- **Both ends are inclusive in both reports.** The loops stop at
  `!day.After(to)`, so a window of 730 nights returns 731 dates —
  the shape the existing report guards and perf evidence already
  exercise.
- **The refusal vocabulary is already there.** `VALIDATION_FAILED`
  (400) is what a bad window answers today, raised through the
  `validation(field, message)` constructor that puts the field in
  `details` (`services/reporting/internal/store/store.go:28`,
  `:450`), and both contracts list it
  (`contracts/http/OccupancyReport.json:43`,
  `contracts/http/RevenueSummary.json:42`).
- **The product's documented reporting need is two years.**
  `NFR-PERF-2` states that the owner or manager opens any standard
  report over two years of a 50-room hotel's data and it completes
  within 5 seconds (`docs/requirements/mvp-requirements.md:513`), and
  the guard that measures it generates exactly that window — 731
  dates, 2024-01-01 to 2025-12-31 (`docs/testing/test-report.md:290`,
  `:297-298`), measured at 505 ms for `OccupancyReport` and 0 ms for
  `RevenueSummary` (`docs/testing/phase-6-qa-a2-run-log.md:107-108`).
- **Rates already refuses a range longer than 730 nights.** `Quote`
  counts the nights and refuses when there are more than 730
  (`services/rates/internal/store/store.go:254`), documented in
  `docs/architecture/services/rates.md` (section 3), so the backends
  currently disagree on the longest range they accept; the reporting
  cap adopts that same number.
- **No cap exists in any document or contract today.** Neither request
  manifest states a maximum
  (`contracts/http/OccupancyReport.json:13-16`,
  `contracts/http/RevenueSummary.json:13-16`), and no requirement,
  business rule, or service design bounds a report window, so this is
  a new rule rather than conformance to an existing one.

Product rules (decided here):

1. **One span cap for both range reports: 730 nights.** `dateTo` may be
   at most 730 nights after `dateFrom`, which is 731 inclusive dates.
   That is exactly the two-year window `NFR-PERF-2` documents and the
   existing `TestPerfTwoYearReportsRecordTimings` generates
   (2024-01-01 to 2025-12-31), and the same number Rates uses for a
   stay range (`services/rates/internal/store/store.go:254`), so the
   two backends agree and no documented reporting need is cut. The cap
   is a named constant in the reporting store, not per-hotel
   configuration and not an environment variable, so this change
   carries no deployment, environment, or runbook delta.
2. **The cap is a span, not a data window.** A window that ends today,
   a window that ended years ago, and a window before any data exists
   are all accepted as long as the span is within the cap, and the
   reports keep the row shape they return today for dates with no
   data.
3. **A wider window is refused with the shared envelope before any
   work starts.** The answer is exactly one HTTP 400 with code
   `VALIDATION_FAILED`, `details` naming `dateTo`, a `traceId`, and one
   new plain sentence `reporting.validation.date_range_span` —
   "dateTo must be at most 730 nights after dateFrom." with the cap
   rendered from the constant rather than pasted — raised in
   `parseRange` before the store lock is taken and before any per-date
   loop runs, so the refused request never holds the mutex and no other
   read waits behind it. Missing, malformed, and out-of-order windows
   keep today's codes, statuses, and sentences.
4. **Nothing inside the cap changes.** Every accepted window returns
   exactly the rows, row order, zero-filled dates, and `asOf` it
   returns today; `DailySheet` (one business date) and
   `HousekeepingReport` (no range in its read) are untouched, and
   pagination stays out of scope.
5. **The refusal is proven at the boundary and one night past it.** The
   implementation carries a guard that drives a window one night over
   the cap and asserts the refusal for both operations, a guard that
   asserts the at-cap window still returns today's rows, and the
   existing malformed-window and out-of-order guards keep passing.

- AC-RPT-5 — Given `OccupancyReport` or `RevenueSummary`, when the
  caller sends a window whose `dateTo` is more than 730 nights after
  `dateFrom` — including `0001-01-01`..`9999-12-31` — then the service
  answers exactly one HTTP 400 with the shared envelope: code
  `VALIDATION_FAILED`, `details` naming `dateTo`, the
  `reporting.validation.date_range_span` sentence carrying the bound,
  and a `traceId`; no `nights` and no `days` rows come back, and the
  refusal happens before the store lock and before any per-date loop,
  so no other report read waits on it. A missing, malformed, or
  out-of-order window keeps its existing `VALIDATION_FAILED` sentence
  and field. Traces to: FR-RPT-1, FR-RPT-2 (Refs #641);
  NFR-PERF-2; AC-RPT-1, AC-RPT-2.
- AC-RPT-6 — Given a window whose `dateTo` is exactly 730 nights after
  `dateFrom` (731 inclusive dates, the shape of the two-year window
  2024-01-01..2025-12-31), when either report is read, then it returns
  exactly the rows it returns today — the same dates and row order,
  the same occupied and available counts, the same room and extra
  revenue totals, the same zero rows for dates without charges, and
  the same `asOf` — while one more night (`dateTo` 731 nights after
  `dateFrom`) is refused as `AC-RPT-5` describes; `DailySheet` and
  `HousekeepingReport` answer exactly as before. Traces to: FR-RPT-1,
  FR-RPT-2 (Refs #641); NFR-PERF-2; AC-RPT-1, AC-RPT-2.
- AC-RPT-7 — Given the change ships, when it is verified, then one
  named constant states the 730-night cap and both range reports read
  it, no environment variable, deployment setting, or per-hotel
  configuration carries it, and the reporting store's own guards pin
  the over-cap refusal for both operations, the at-cap acceptance for
  both, and the one-night-past-the-cap refusal beside the existing
  malformed and order guards; no desk screen, catalogue key, route,
  print rule, or contract operation changes — whether the two request
  manifests also describe the cap is the `architect`'s contract
  decision and changes none of these conditions — and `contract-check`
  stays green. Traces to: FR-RPT-1, FR-RPT-2 (Refs #641);
  NFR-PERF-2, NFR-I18N-1 (evidence condition; no behaviour change).

Done when: `OccupancyReport` and `RevenueSummary` refuse a window
wider than 730 nights with the shared envelope and `VALIDATION_FAILED`
naming `dateTo` before the store lock and before any per-date loop; a
window at the 730-night cap returns exactly today's rows and one night
more is refused; `DailySheet` and `HousekeepingReport` are untouched;
and the store carries the over-cap guard, the at-cap guard, and their
boundary pair.

## 25. Guest identity lookups refuse an ambiguous name and guest payloads carry declared bounds (Refs #640)

Product-owner scope decision and acceptance conditions for audit
findings G1, G2, and G3 (issue #640): a name lookup returns the first
guest whose full name matches, so two guests sharing a name hand the
desk the wrong profile (PII) instead of an ambiguity refusal; the guest
`contact`/`preferences` objects and `notes` string are stored exactly
as sent, with no per-field shape, length, or size bound; and the
confirmation snapshot's date check is a regular expression, so
`2026-13-45` is accepted where the Go services refuse it. One
ambiguity refusal, one declared shape and two declared lengths on the
guest write, one calendar-valid date check, and nothing else moves.

Tier T2: caller-visible refusals on one read operation and one write
operation, with no new subsystem, dependency edge, data model,
lifecycle state, or code token, and one reader-visible desk state on
the Book screen's guest find — so the UI contract delta is section 6.22
in `docs/product/desk-ui-design-rollout.md` (one new plain refusal
sentence, both locales; no layout, component, token, route, or print
change). ADR-0004 D1 keeps the error envelope and its status mapping
exactly as they are. The conditions below are the product half. FR
wording is owned by `business-analyst`
(`docs/requirements/mvp-requirements.md` section 33, the `FR-GID-1`..
`FR-GID-3` family these conditions cite); no NFR is added and no
existing NFR changes — section 33.4 is the no-change statement, so the
conditions keep tracing to the existing `NFR-I18N-1` (the three
catalogue sentences, both locales) and `NFR-AUD-1` (a refusal records
and emits nothing). The LLD delta and the
refusal edges on the Guests service design's flowcharts and error
mapping by `architect` (LLD section 32,
`docs/architecture/services/guests.md` sections 4 and 6, refreshed by
the implementation PR per maintain-with-code), with the `IdentifyGuest`
error-list line in `contracts/http/IdentifyGuest.json` and the
`docs/technical/error-handling.md` section 1.4 note; guard mapping by
`qa-lead` (`docs/testing/traceability-matrix.md` section 25); the gate
verdict by `spec-reviewer`. The business rule that states the
ambiguity and the two bounds is BR-63
(`docs/requirements/business-rules.md`). The scope decision is D-37 in
`docs/project/decision-log.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **A name lookup takes the first match in both stores.** The
  in-memory `findGuest` walks the map and returns the first record whose
  `fullName` equals the wanted name
  (`services/guests/src/store.ts:308-326`, the loop and return at
  `:318-322`), and the Postgres store runs
  `SELECT … WHERE full_name = $1 LIMIT 1` with no `ORDER BY`
  (`services/guests/src/pgstore.ts:181-190`), so with two guests named
  alike the answer is whichever row the store reaches first — the wrong
  profile, wrong stay links, and wrong preferences and notes, returned
  as a success.
- **`IdentifyGuest` is the only contract operation reachable by name.**
  Its request accepts `guestId` or `fullName`
  (`contracts/http/IdentifyGuest.json:11-16`, the `fullName` property at
  `:15`); `GetGuest` requires `guestId`
  (`contracts/http/GetGuest.json:11-13`) and `GetBookingContext` takes
  only `guestId` (`contracts/http/GetBookingContext.json:11-13`).
  `findGuest` is shared by `identifyGuest`, `getBookingContext`, and
  `getGuest` (`services/guests/src/store.ts:243`, `:253`, `:258`), so
  the rule lands once per store and the two `guestId` reads keep their
  behaviour.
- **`contact` and `preferences` accept anything object-shaped and
  silently drop everything else.** `asObject` returns the value
  unchanged when it is an object and `{}` otherwise
  (`services/guests/src/store.ts:166-168`), and `upsertGuest` stores
  `contact: asObject(input.contact)` and
  `preferences: asObject(input.preferences)` (`:231-232`). An array is
  an object for that test, so `contact: [1,2]` is stored as an array;
  nested objects, null values, thousands of fields, and values of any
  length pass; a string or a number is not refused either — it becomes
  `{}`. The Postgres store follows the same helper
  (`services/guests/src/pgstore.ts:25-27`, `:70-71`).
- **`notes` is stored as any string, and a non-string is silently
  ignored.** `notes` is `typeof input.notes === "string" ? input.notes
  : (existing?.notes ?? "")` (`services/guests/src/store.ts:233`,
  `services/guests/src/pgstore.ts:72`), so a ten-megabyte note is stored
  as sent, while a number or an object is accepted and quietly replaced
  by the stored value instead of refusing the field.
- **`requireDate` checks the shape only.** The helper refuses only a
  value that is not a string, or does not match `^\d{4}-\d{2}-\d{2}$`
  (`services/guests/src/store.ts:170-175`), and it is applied to
  `dates.checkIn` and `dates.checkOut` in the confirmation snapshot
  (`:208`). `2026-13-45`, `2026-02-31`, and `2026-00-10` all match, so
  they are attached and produced as confirmation dates; a real
  February 29 (`2024-02-29`) is a valid date and must stay accepted.
- **The Go services refuse a calendar-invalid date.** They parse every
  date with `time.Parse("2006-01-02", …)`
  (`services/reservations/internal/service/service.go:144`, `:148`;
  `services/reservations/internal/handler/handler.go:365`, `:369`), so
  the Node guest service is the outlier rather than being ahead.
- **Nothing bounds either payload today.** The `UpsertGuest` request
  lists `contact` and `preferences` as free-form objects and `notes` as
  a plain string with no `maxLength`
  (`contracts/http/UpsertGuest.json:17-19`), the schema stores all three
  in unconstrained columns (`contact JSONB`, `preferences JSONB`,
  `notes TEXT`; `services/guests/migrations/002_schema.sql:23-27`), and
  no requirement, business rule, or service design states a shape or a
  length, so this is a new rule rather than conformance to one.
- **Every existing fixture is tiny.** The largest existing values are
  `preferences: {"floor":"high"}`
  (`services/guests/contract-tests/UpsertGuest.json:8`,
  `services/guests/src/server.test.ts:67`), `contact:
  {"phone":"+84-900-000-020"}` (`server.test.ts:173`), `contact:
  {"idDocument":"E2E-0001"}` (`script/e2e-desk-loop.sh:263`), and
  `notes: "Prefers a quiet high floor."` — 28 characters
  (`server.test.ts:127`, `:175`) — so each bound below carries more
  than nine times the headroom over the largest fixture in the tree.
- **No desk flow sends `contact`, `preferences`, or `notes`.** The Book
  screen's registration posts only `fullName` and `actor`
  (`app/src/views/BookView.vue:748-762`, the body at `:761`); the
  values are written only by the e2e and perf seeds
  (`script/e2e-desk-loop.sh:263`, `script/e2e-perf-check.sh:143`), so
  the new bounds cannot refuse a desk action.
- **The desk reads a name miss and everything else differently.** The
  guest find maps `NOT_FOUND` to `desk.book.guest_notfound`
  (`app/src/views/BookView.vue:736-742`) and every other failure to the
  generic `desk.shell.request_failed` sentence (`:744`, `:480-485`), so
  an ambiguity refusal would today read as "That did not work. Try
  again; if it keeps failing, tell the manager." — wrong on both counts:
  the name is the problem, and a retry can never help.
- **The refusal code is already in the vocabulary.**
  `VALIDATION_FAILED` (400) is the caller-input code — "the caller's
  body or a field is wrong"
  (`docs/technical/error-handling.md:18-21`) — and it is already in the
  contract enum (`contracts/errors/envelope.json:9`), so no enum edit
  and no status-mapping change are needed. `CONFLICT` (409) is the
  state-conflict code the booking and room guards use for a race, not a
  caller's lookup key.

Product rules (decided here):

1. **An ambiguous name is refused, never resolved by first match.** A
   name that matches no guest keeps `NOT_FOUND` as today; a name that
   matches exactly one guest returns that profile exactly as today; a
   name that matches two or more guests returns exactly one refusal
   with no profile, no `contact`, `preferences`, `notes`, or
   `stayLinks`, so two guests sharing a name can never hand the desk
   another guest's details. The lookup must count the matches before it
   answers — a `LIMIT 1` first row is not an answer.
2. **The ambiguity is `VALIDATION_FAILED` (400) naming `fullName`.**
   The envelope carries `details` `{"field": "fullName", "fullName":
   <the searched name>, "matches": <number of matches>}`, a `traceId`,
   and one plain sentence in the Guests catalogue —
   `guests.validation.ambiguous_name`, "The name {fullName} matches more
   than one guest; identify the guest by id." — raised by both stores
   before any profile is assembled. No new code token, no contract enum
   change, and no `CONFLICT` for a lookup: 409 stays the state-conflict
   answer (a room just taken), not a caller's key.
3. **`contact` and `preferences` carry one declared shape.** A present
   value must be a plain JSON object — never an array, string, number,
   or boolean — with at most 16 fields, each key a non-empty string of
   at most 64 characters, and each value a string of at most 256
   characters, a finite number, or a boolean; a nested object, an
   array entry, or a null entry is refused, and a string, number, or
   boolean sent in place of the object is refused instead of today's
   silent `{}`. An absent field keeps today's behaviour exactly
   (`contact` becomes `{}`, `preferences` keeps the stored object) and
   an explicit `null` field keeps today's behaviour as well, because the
   fields are optional and no caller sends `null`. Both bounds are
   named constants in the service code, not configuration.
4. **`notes` carries one declared length.** A present `notes` must be a
   string of at most 2 000 characters (UTF-16 code units, the length
   the stores already compute), and a present non-string value is
   refused instead of today's silent fall-back to the stored note. An
   absent `notes` keeps today's behaviour exactly (the stored note on
   update, the empty string on create). The length is a named constant
   in the service code, not configuration.
5. **Writes are bounded; reads are not.** The two shapes and the length
   apply to `UpsertGuest`, the only operation that writes these fields,
   and to both stores, so the in-memory store and the Postgres store
   refuse the same values. No migration, backfill, or data repair is
   part of this change: a profile already holding a longer note or a
   differently shaped object still reads exactly as today through
   `GetGuest`, `IdentifyGuest`, and `GetBookingContext`, and nothing is
   re-validated or dropped on read.
6. **The confirmation snapshot takes real calendar dates.** In
   `AttachReservation`, `dates.checkIn` and `dates.checkOut` must be
   dates that exist on the calendar — `2024-02-29` is accepted,
   `2026-02-31`, `2026-13-45`, and `2026-00-10` are refused with the
   existing `VALIDATION_FAILED` sentence `guests.validation.date_format`
   naming the field (`dates.checkIn` or `dates.checkOut`), so no new
   catalogue key is added for this half. The date-order rule is not
   added here: `checkIn` after `checkOut` stays as accepted as it is
   today (named consequence below), and no other operation's date
   handling changes.
7. **A refused write writes nothing, and the desk says so plainly.**
   Every refusal above is raised before the record, its stay links, and
   its `guest-upserted` outbox event are written, in both stores, so a
   refused `UpsertGuest` leaves no row, no link, and no event and the
   stored profile is untouched. On the Book screen's guest find, an
   ambiguity refusal reads as one new plain sentence
   `desk.book.guest_ambiguous` in both locales — "That name matches more
   than one guest, so no profile was opened. Ask the manager to check
   the guest records." — resolves no guest, keeps the Find and Register
   controls and the entered name in place, and never reads as the
   `desk.book.guest_notfound` sentence or the generic request-failed
   one; the desk switches on the envelope code and field, never on the
   sentence.
8. **The refusal set is pinned by guards before merge.** The
   implementation carries a guard per refusal — two guests with one
   name for the ambiguity, the at-bound and one-over cases for the two
   lengths and the field, key, and value shapes, the leap-day and
   calendar-invalid dates — plus the regression guards that a unique
   name and a `guestId` lookup answer exactly as today, in both stores
   (or through the one shared validator both call), with the existing
   guest and Book-screen suites green.

- AC-GID-1 — Given two guests whose `fullName` is the same string,
  when `IdentifyGuest` is called with that name, then the answer is
  exactly one HTTP 400 with the shared envelope: code
  `VALIDATION_FAILED`, `details` naming `fullName` with the searched
  name and the match count, the
  `guests.validation.ambiguous_name` sentence, and a `traceId`; no
  profile, `contact`, `preferences`, `notes`, or `stayLinks` come back,
  and the same refusal is produced by both stores. Traces to:
  FR-GID-1 (Refs #640); FR-GST-1, FR-GST-3; AC-GST-1.
- AC-GID-2 — Given a name that matches exactly one guest, when
  `IdentifyGuest` is called with that name, then the profile and its
  stay links come back exactly as today; and given a name that matches
  no guest, the answer stays `NOT_FOUND` with today's sentence. A
  `guestId` lookup through `IdentifyGuest`, `GetGuest`, or
  `GetBookingContext` answers exactly as today, including for two
  guests who share a name. Traces to: FR-GID-1 (Refs #640); FR-GST-1,
  FR-GST-3; AC-GST-1, AC-GST-3.
- AC-GID-3 — Given `UpsertGuest`, when `contact` or `preferences` is
  present and is an array, a string, a number, or a boolean, or holds
  more than 16 fields, an empty or over-64-character key, a nested
  object, an array entry, a null entry, a string entry longer than 256
  characters, or a number entry that is not finite, then the whole
  upsert is refused with HTTP 400 `VALIDATION_FAILED` naming `contact`
  or `preferences`, one plain sentence stating the shape, and a
  `traceId`; no record, stay link, or outbox event is written and the
  stored profile is unchanged. Traces to: FR-GID-2 (Refs #640);
  FR-GST-1, FR-GST-2; AC-GST-2.
- AC-GID-4 — Given `UpsertGuest`, when `notes` is present and is not a
  string, or is a string longer than 2 000 characters, then the whole
  upsert is refused with HTTP 400 `VALIDATION_FAILED` naming `notes`,
  one plain sentence carrying the length, and a `traceId`, writing
  nothing; a note of exactly 2 000 characters is stored as sent, and an
  absent `notes` keeps today's behaviour. Traces to: FR-GID-2 (Refs
  #640); FR-GST-2; AC-GST-2.
- AC-GID-5 — Given `AttachReservation`, when `dates.checkIn` or
  `dates.checkOut` is a calendar-invalid date such as `2026-13-45` or
  `2026-02-31`, then the snapshot is refused with HTTP 400
  `VALIDATION_FAILED` naming that field and the existing
  `guests.validation.date_format` sentence, and no confirmation is
  stored; `2024-02-29` is accepted, and no other operation's date
  handling changes. Traces to: FR-GID-3 (Refs #640); FR-GST-4;
  AC-GST-4.
- AC-GID-6 — Given an ambiguity refusal on the Book screen's guest
  find, when it is shown, then it reads as the one new plain sentence
  `desk.book.guest_ambiguous` in both locales, no guest is resolved and
  no profile is shown, the entered name and the Find and Register
  controls stay in place, and the generic request-failed sentence and
  the not-found sentence are not used; the screen keeps its layout,
  component mapping, design tokens, route, and print rules, and
  `script/catalogue-coverage-check.sh` stays green. Traces to: FR-GID-1
  (Refs #640); FR-DSP-3, NFR-I18N-1; AC-DSK-1, AC-DSK-2.
- AC-GID-7 — Given the change ships, when it is verified, then each
  bound is a named constant in the service code and no environment
  variable, deployment setting, or per-hotel configuration carries it;
  both stores refuse the same values; the ambiguity, shape, length, and
  date guards and their at-bound and one-over boundary cases exist
  beside the regression guards for the unique name, the unknown name,
  and every `guestId` read; no schema migration, backfill, or data
  repair exists; `contract-check` stays green with no code token added;
  and no print document, announcement, or other desk surface changes.
  Traces to: FR-GID-1, FR-GID-2, FR-GID-3 (Refs #640); NFR-I18N-1,
  NFR-AUD-1 (evidence condition; no behaviour change).

Done when: a name that matches two guests is refused with
`VALIDATION_FAILED` naming `fullName` and returns no profile in both
stores while a unique name and every `guestId` lookup answer exactly as
today; an oversized or wrongly typed `contact`, `preferences`, or
`notes` is refused naming the field and writes nothing; a
calendar-invalid confirmation date such as `2026-13-45` is refused
naming the field; the Book screen's guest find says the ambiguity in
plain words in both locales; and the guards for every refusal and its
boundary exist with the existing guest and Book suites green.

## 26. Admin authenticates before parsing and refuses a malformed config write (Refs #639)

Product-owner scope decision and acceptance conditions for audit
findings A2, A3, and A5 (issue #639): the Admin service reads and
parses every request body before it checks the session, so an
unauthenticated caller gets the parse error — and the parse work —
ahead of the auth answer; and `UpdateHotelConfig` stores any key with
any value, shape-checking only `name`, so a malformed
`requiredGuestFields` write silently replaces the configured
mandatory-field list. One ordering rule and one per-key shape table;
nothing else moves. A5 (reuse the module bearer helper instead of the
service's own regex) changes no caller-visible behaviour: the
conditions below pin the ordering and the refusals, and the code shape
is the `dev`/`architect` handoff named here.

Tier T2: caller-visible refusals on one operation family, with no new
subsystem, dependency edge, data model, lifecycle state, or code token,
and no reader-visible desk change — so no UI-contract section is
required and none is added. ADR-0004 D1 keeps the error envelope and
its status mapping exactly as they are. The conditions below are the
product half. FR/NFR wording is owned by `business-analyst`
(`docs/requirements/mvp-requirements.md` section 34) and the business
rule that states the ordering and the per-key shapes is BR-64
(`docs/requirements/business-rules.md`); the LLD delta and the refusal
edges on the Admin service design's flowcharts and error mapping by
`architect` (LLD section 33, `docs/architecture/services/admin.md`
sections 2, 4, and 6, refreshed by the implementation PR per
maintain-with-code), with the `UpdateHotelConfig` error list in
`contracts/http/UpdateHotelConfig.json` and the
`docs/technical/error-handling.md` section 1.5 note; guard mapping by
`qa-lead` (`docs/testing/traceability-matrix.md` section 26); the gate
verdict by `spec-reviewer`. The scope decision is D-38 in
`docs/project/decision-log.md` and the over-strict-shape risk is R-19
in `docs/project/risk-register.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **The body is parsed before the session is checked.** `handleRequest`
  matches the route, reads the body at
  `services/admin/src/server.ts:144` (`const body = await
  readBody(req, res)`), and only then branches on `SignIn` (`:146-150`)
  and on the bearer token (`:151-155`). The parse refusals therefore
  run first: invalid JSON answers HTTP 400 `VALIDATION_FAILED` with
  `error.transport.bad_json` (`:61-70`), a non-object body
  `error.transport.body_not_object` (`:63-66`), and an over-ceiling
  body `error.transport.body_too_large` (`:15-17`, `:30-34`,
  `:38-50`) — all before the missing-token refusal at `:151-155` can
  fire, so an unauthenticated `UpdateHotelConfig` with a malformed body
  learns that the body was malformed.
- **`SignIn` is the one unauthenticated operation and it needs its
  body.** `:146-150`; the existing over-limit guards drive exactly that
  operation (`services/admin/src/bodyBound.test.ts:13-18`), so they
  keep their behaviour once the read moves behind the token check for
  every other operation.
- **The nearest auth guard proves only the well-formed case.**
  `services/admin/src/server.test.ts:105-111` posts a valid `{}` with
  no token and asserts 401; no guard sends a malformed body while
  unauthenticated, and no guard proves that the parse did not run.
- **Admin re-implements the bearer parse.**
  `services/admin/src/server.ts:83-90` duplicates the helper the three
  other Node services share (`services/guests/src/auth.ts:8-15`, and
  the same file under `services/stay/src` and `services/rooms/src`);
  A5 has no caller-visible effect, so the conditions below pin the
  result of the ordering, not the helper.
- **`UpdateHotelConfig` shape-checks only `name`.** In the in-memory
  store, `values` must be an object
  (`services/admin/src/store.ts:478-480`), `updatedBy` must be a
  non-empty string (`:481`), `name` must be non-blank (`:483-487`),
  and then every entry is written exactly as sent (`:488-492`). The
  Postgres store repeats the same checks and additionally refuses a
  `retentionFloorDays` that is not a non-negative integer
  (`services/admin/src/pgstore.ts:500-537`, `:538-551`), so the two
  stores already disagree on one key.
- **A malformed `requiredGuestFields` write is stored silently.** The
  key is seeded as a one-entry array (`services/admin/src/store.ts:166`,
  `services/admin/src/pgstore.ts:50`) and the deployment set declares
  it an array with at least one entry
  (`deploy/config/schema.json:92-96`); the deployment apply writes it
  through `UpdateHotelConfig` (`script/apply-hotel-config.sh:90-112`,
  the call at `:115-116`). The guests mandatory-field gate is specified
  to read the hotel's list (`FR-CUS-1`) while the Guests store still
  enforces a hard-coded `["fullName"]` baseline
  (`services/guests/src/store.ts:26-28`, used by `mandatoryFieldStatus`
  at `:35-38`), so a malformed write corrupts the configured value the
  gate is specified to read and tells no caller.
- **Every writer in the tree already sends a conforming value.** The
  onboarding wizard writes `name`
  (`app/src/views/OnboardingView.vue:744-747`) and `timezone` and
  `retentionFloorDays` (`:808-819`); `script/apply-hotel-config.sh`
  writes the deployment set through the same operation (`:90-112`,
  `:115-116`) after `script/validate-hotel-config.sh` has checked it
  against `deploy/config/schema.json` (`HH:MM` times `:45-61`,
  `requiredGuestFields` and `cancellationReasons` with one or more
  entries `:92-101`, retention floor minimum `:133-136`); and the
  existing config tests write `standardCheckinTime` and
  `standardCheckoutTime` as `HH:MM`
  (`services/admin/src/server.test.ts:191-272`, values at `:212-213`).
  The table in rule 5 therefore admits every payload the tree sends.
- **Both refusal codes already exist.** `UNAUTHENTICATED` (401) and
  `VALIDATION_FAILED` (400) are in the contract enum and the status
  mapping (`contracts/errors/envelope.json:9`, `:17-18`), and Admin
  already maps both (`services/admin/src/errors.ts:4-27`), so no new
  token and no enum or mapping edit are needed.
- **The desk already routes a 401 to the sign-in gate.** The shared
  client clears the session on any 401 and routes to sign-in
  (`app/src/api/client.ts:7-10`, `:168-183`), and the onboarding step
  maps `FORBIDDEN` and otherwise shows the plain request-failed
  sentence (`app/src/views/OnboardingView.vue:752-769`), so the
  ordering fix changes no desk screen, copy, route, or print rule.

Product rules (decided here):

1. **Authenticate before parsing, for every operation except
   `SignIn`.** A `POST /v1/admin/<Operation>` other than `SignIn`
   resolves the session first — a missing token, an invalid or expired
   token, a revoked or signed-out session, or a deleted user — and only
   a resolved session lets the service read the body. The read, the
   ceiling, the JSON object check, and the per-key rules then run in
   today's order. `SignIn` keeps today's order exactly, because it is
   the one operation with no session to check: its body is read and its
   fields validated as today.
2. **The unauthenticated answer is `UNAUTHENTICATED` (401), never a
   parse error.** An unauthenticated request with a malformed body
   answers exactly one envelope: code `UNAUTHENTICATED` (401) with
   today's existing sentence (`error.auth.missing_token` when the
   header is absent, the existing invalid, expired, revoked, or orphan
   sentence otherwise), `details` as today, and a fresh `traceId`. No
   new code token, no status-mapping change, no `VALIDATION_FAILED`,
   and none of the `error.transport.bad_json`, `body_not_object`, or
   `body_too_large` sentences. The payload is never read or parsed, so
   the caller cannot learn whether it was well formed, oversized, or
   which field it named.
3. **For a session-guarded operation the order is 401, then 400, then
   403.** A request that is both unauthenticated and malformed answers
   401: the session refusal outranks every body and field refusal,
   including the 65 536-byte ceiling. An authenticated caller with a
   malformed body still answers 400 in today's wording, and the role
   refusal `FORBIDDEN` (403) is reached only when the body is well
   formed — the role check stays where it is, after the body read, so
   400 precedes 403. Moving the role check ahead of the parse is not
   part of this change (named consequence below).
4. **Route matching does not move.** `GET /healthz`, the
   `POST /v1/admin/<Operation>` match, and the unknown-path 404 stay
   before the session check and read no body, so an unknown path
   answers today's 404 with or without a token. This change moves only
   the body read.
5. **An `UpdateHotelConfig` value is checked against one per-key table
   before anything is written.** A present key in the table must have
   its declared shape; a key outside the table keeps today's behaviour
   exactly, written as sent, because a full config schema engine is out
   of scope. The rules are derived from the keys the Admin service
   already serves and the payloads the tree already sends, so no
   legitimate hotel setting is refused:
   - `name` — non-empty text after trimming. Today's rule, unchanged;
     the refusal keeps `error.validation.field_required`.
   - `timezone` — non-empty text after trimming. Refusal:
     `error.validation.config_text` ("{field} must be non-empty
     text.").
   - `standardCheckinTime` — text matching
     `^([01][0-9]|2[0-3]):[0-5][0-9]$` (24-hour `HH:MM`). Refusal:
     `error.validation.config_time` ("{field} must be a 24-hour HH:MM
     time.").
   - `standardCheckoutTime` — the same rule and sentence.
   - `requiredGuestFields` — an array with at least one entry; every
     entry is text that is non-empty after trimming; no two entries are
     equal after trimming. Refusal:
     `error.validation.config_required_fields` ("{field} must list at
     least one guest field, each a non-empty entry, without
     duplicates.").
   - `cancellationReasons` — an array whose every entry is text that is
     non-empty after trimming; the empty array is allowed, because the
     Admin seed already serves `[]` and a hotel may keep no reason
     list, while the deployment set's one-or-more floor stays the
     installer's check. Refusal: `error.validation.config_list`
     ("{field} must be a list of non-empty text entries.").
   - `retentionFloorDays` — a whole number at or above 0. The refusal
     reuses `error.validation.retention_floor` ("retentionFloorDays
     must be a non-negative integer."), which the Postgres store
     already raises. The deployment set's 30-day floor stays the
     installer's check, so a lower floor written directly through the
     API is not refused by this change.
   - `cancellationWording` — text; the empty string is allowed.
     Refusal: `error.validation.config_optional_text` ("{field} must be
     text.").
   - `address`, `phone`, `email` — text each; the empty string is
     allowed. The same `error.validation.config_optional_text`
     sentence.
6. **One refusal per write, naming the key, and nothing is written.**
   Every present table key is checked before the first write; the first
   offending key answers exactly one envelope: HTTP 400
   `VALIDATION_FAILED` with `details` `{"field": <key>}`, that key's
   sentence, and a fresh `traceId`. Nothing is written for the refused
   request — not the offending key, and not a valid key sent in the
   same request — and no `config.updated` audit entry is recorded for
   it. A `values` that is not an object and a missing or blank
   `updatedBy` keep their existing refusals and their first place ahead
   of the per-key checks (`error.validation.values_object`, and
   `error.validation.field_required` naming `updatedBy`).
7. **The stores agree, and a valid write is exactly today's.** The one
   per-key check runs before the write in both stores, or in one helper
   both call, so the in-memory and the Postgres store refuse the same
   values and the Postgres `retentionFloorDays` rule stops being the
   odd one out. Every value that satisfies the table is stored
   verbatim, read back through `GetHotelConfig` unchanged, and recorded
   on the audit trail as today; no key is normalised, trimmed, coerced,
   or dropped.
8. **No new vocabulary, no desk change, no migration.** Both codes
   already exist (rule 2); no enum or status-mapping edit, no new
   control, route, label, desk state, or print rule, and no schema,
   table, migration, or backfill. The new Admin sentences are service
   messages, added to the canonical English and Vietnamese catalogues
   and the runtime mirror by the implementation PR; the desk keeps
   `desk.shell.request_failed` for an unexpected config refusal and its
   existing 401 gate path, so no reader-visible UI changes and no
   UI-contract section applies.
9. **The guards ship with the change.** `server.test.ts` covers both
   acceptance criteria: a raw malformed body with no `Authorization`
   header on `UpdateHotelConfig` answering 401 `UNAUTHENTICATED` (and
   the invalid-token case), the authenticated malformed-body regression
   (still 400 with today's sentence), and one shape refusal per rule in
   rule 5 — including the audit's `requiredGuestFields` case as a
   string in place of the array, an empty array, an empty entry, and a
   duplicate entry — plus the boundary values that must stay accepted
   (a one-entry guest-field list, `00:00` and `23:59`, `0` retention
   days, an empty reason list, and empty profile text). A refusal guard
   asserts the stored values and the audit log are unchanged, so
   "nothing written" is proven, not assumed. The existing identity,
   audit, body-ceiling, and internal-error suites stay green.

- AC-CFG-1 — Given no `Authorization` header, or an invalid, expired,
  or revoked session, when `UpdateHotelConfig` is called with a
  malformed body (invalid JSON, a non-object body, or a body above
  65 536 bytes), then the answer is exactly one HTTP 401 with code
  `UNAUTHENTICATED`, the matching existing `error.auth.*` sentence,
  `details` as today, and a `traceId`; no `VALIDATION_FAILED`, no
  `error.transport.bad_json`, `body_not_object`, or `body_too_large`
  sentence, and no config change. Traces to: FR-ADM-1, FR-DSP-3;
  NFR-SEC-2; AC-BND-1.
- AC-CFG-2 — Given a well-formed body, when `UpdateHotelConfig` is
  called without a session, then the answer is today's 401; and given
  a valid session, when the body is malformed, then the answer is
  today's HTTP 400 `VALIDATION_FAILED` with the existing transport
  sentence. `SignIn` keeps today's order in both directions: an
  unauthenticated sign-in with a malformed body still answers 400, and
  a well-formed sign-in answers as today. A front-desk caller with a
  well-formed body is refused with `FORBIDDEN` (403), so the observed
  order is 401 before 400 and 400 before 403. Traces to: FR-ADM-1,
  FR-ADM-2, FR-DSP-3; NFR-SEC-2; AC-BND-1, AC-BND-2.
- AC-CFG-3 — Given an authenticated `UpdateHotelConfig`, when a value
  breaks its key's rule in rule 5 — a blank `timezone`, a
  `standardCheckinTime` or `standardCheckoutTime` that is not a
  24-hour `HH:MM` time, a `requiredGuestFields` that is not an array,
  an empty array, holds an empty entry or a duplicate entry, a
  `cancellationReasons` with a non-text or empty entry, a
  `retentionFloorDays` that is fractional or negative, or a
  `cancellationWording`, `address`, `phone`, or `email` that is not
  text — then the whole write is refused with exactly one HTTP 400
  `VALIDATION_FAILED`, `details` naming that key, the key's plain
  sentence, and a `traceId`; nothing is written, no `config.updated`
  entry is recorded, and a valid key sent in the same request is not
  stored either. Traces to: FR-ADM-1, FR-ADM-4, FR-CUS-1, FR-CUS-2,
  FR-RES-3; AC-ADM-1, AC-ADM-4, AC-CUS-1, AC-CUS-2.
- AC-CFG-4 — Given an authenticated `UpdateHotelConfig`, when every
  present value satisfies rule 5, then the write behaves exactly as
  today: the values are stored verbatim, `GetHotelConfig` reads them
  back unchanged, the `config.updated` audit entries appear with the
  caller's `updatedBy` and time, and the in-memory and the Postgres
  store answer the same. A key outside the table, and an absent key,
  keep today's behaviour exactly. (The recorded-actor half of this
  condition is superseded by section 27 (`AC-SEC-3`, Refs #643): the
  audit entry records the caller's `signinIdentity`, not the request's
  `updatedBy`; every other clause here holds.) Traces to: FR-ADM-1,
  FR-ADM-4; NFR-AUD-1; AC-ADM-1, AC-ADM-4.
- AC-CFG-5 — Given the change ships, when it is verified, then
  `server.test.ts` carries the guards AC-CFG-1, AC-CFG-2, and AC-CFG-3
  name, including the `requiredGuestFields` refusal and the accepted
  boundary values; no contract token, status mapping, or schema file
  is edited; the five new sentences exist in the canonical English and
  Vietnamese catalogues and the runtime mirror with matching
  placeholders, and `script/catalogue-coverage-check.sh` stays green;
  no desk screen, control, route, label, desk state, or print rule
  changes, so no UI-contract section applies; and the existing
  identity, audit, body-ceiling, and internal-error suites stay green.
  Traces to: FR-ADM-1, FR-DSP-3; NFR-I18N-1, NFR-SEC-2, NFR-AUD-1
  (evidence condition; no behaviour change).

Done when: an unauthenticated `UpdateHotelConfig` with a malformed or
oversized body answers one 401 `UNAUTHENTICATED` envelope and no parse
error while `SignIn` and an authenticated malformed body keep today's
order; a config write whose value breaks a table key's shape is refused
with `VALIDATION_FAILED` naming that key and writes nothing, in both
stores; every value that satisfies the table is stored, read back, and
audited exactly as today; and `server.test.ts` carries the guards for
both refusals and their boundaries with the existing Admin suites
green.

## 27. The audit actor comes from the session, never from the request (Refs #643)

Product-owner scope decision and acceptance conditions for audit
finding C6 (issue #643): every write path in Stay, Guests, Rooms,
Reservations, and Billing records the `actor` string the request
supplied, so each outbox event, change row, and state-history row
attributes the change to a name the caller chose — the attribution
`NFR-AUD-1` promises (`docs/requirements/mvp-requirements.md:507-513`)
is decided by the caller. Admin resolves a caller from the token
(`services/admin/src/server.ts:157-166`) and records that identity on
account writes, but its config write still records the request's
`updatedBy`. One rule — the recorded actor is the authenticated
session, and the request string is never authoritative — applies to
every write across Node, Go, and Billing. Token verification, HMAC,
expiry and revocation checks, and role-based authorization stay out of
scope: they are the planned identity-hardening slice (LLD section 0;
`services/stay/src/auth.ts:3-7` and the same file under
`services/guests/src` and `services/rooms/src`), and this change is
deliberately narrower — where the recorded actor value comes from.

Tier T2: the response and the stored business effect of every write
stay as today and only the recorded actor value moves, with no new
subsystem, dependency edge, data model, lifecycle state, or code
token, and no reader-visible desk change — so no UI-contract section
is required and none is added. The conditions below are the product
half. FR/NFR wording is owned by `business-analyst`
(`docs/requirements/mvp-requirements.md` section 35) and the business
rule that states the provenance rule is BR-65
(`docs/requirements/business-rules.md`); the LLD delta with the actor
resolution on the write path for Node, Go, and Billing is by
`architect` (LLD section 34, and the audit lines of the service
designs under `docs/architecture/services/`, refreshed by the
implementation PR per maintain-with-code); guard mapping by `qa-lead`
(`docs/testing/traceability-matrix.md` section 27); the gate verdict
by `spec-reviewer`. The scope decision is D-39 in
`docs/project/decision-log.md` and the mis-attribution and
interim-token risk is R-20 in `docs/project/risk-register.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **The Node identity helper checks presence only, and the token never
  reaches a store.** `extractBearer` returns the token and nothing
  else (`services/stay/src/auth.ts:8-15`, copied in
  `services/guests/src/auth.ts:8-15` and
  `services/rooms/src/auth.ts:8-15`); the comment at `:3-7` says the
  token "travels through as the audit actor fallback", but Stay passes
  it only to `checkOut` for the Reservations forward
  (`services/stay/src/server.ts:159`, `:184`) while `checkIn` (`:167`),
  `moveRoom` (`:189`), and `recordActualTimes` (`:197`) receive the raw
  body; Guests and Rooms check presence and pass no token on
  (`services/guests/src/server.ts:130`,
  `services/rooms/src/server.ts:130`).
- **Every Node store requires the body actor and persists it as the
  audit actor.** Stay `services/stay/src/store.ts:216` (CheckIn),
  `:294` (CheckOut), `:335` (MoveRoom), `:383` (RecordActualTimes),
  with the value written into the outbox payload at `:237`, `:315`,
  `:367`, `:398`. Guests `services/guests/src/store.ts:319`, payload
  `:337`. Rooms `services/rooms/src/store.ts:219`, `:239`, `:268`,
  `:375`, `:413`, `:438`, `:477`, state history at `:506` and outbox
  at `:510-515`.
- **Reservations takes the actor from the body on every write.** The
  raw `Authorization` header is already in hand in the authed wrapper
  (`services/reservations/internal/handler/handler.go:141-158`) but is
  forwarded only to the pricing and stay-restriction reads; each write
  reads `body["actor"]` instead: `:176` (Create), `:238` (CheckIn),
  `:256` (CheckOut, required), `:290` (Modify), `:323` (Cancel), `:342`
  (MarkNoShow). That value becomes the change row's `created_by` and
  the outbox actor (`internal/store/postgres.go:368`, `:376`, `:384`,
  `:444`, `:456`, `:691`, `:699`, `:715`, `:720`, `:777`, `:785`,
  `:792`, `:797`).
- **Billing turns a non-string actor into the empty string and refuses
  the blank.** `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:39-42`
  maps anything that is not a string to `""`; every adapter passes it
  as the service actor after `requireToken` (`:117-121`), at `:128`,
  `:136`, `:144`, `:151`, `:165`, `:172`, `:179`, `:188`, `:196-198`,
  and `BillingService.actorOf`
  (`service/BillingService.java:110-115`) refuses a blank value naming
  `actor`. The stored values are that string
  (`repo/BillingRepository.java:65-71`, `:100-105`, `:109-111`,
  `:135-137`, `:143-145`, `:154-160`, `:176-191`, `:237-239`).
- **Admin resolves the caller, but its config write still trusts the
  body.** `handleRequest` extracts the token
  (`services/admin/src/server.ts:157`), authenticates it (`:164`), and
  passes the resolved caller to every write; account writes record
  `caller.signinIdentity` (`src/store.ts:368`, `:403`, `:425`, `:466`).
  `UpdateHotelConfig` alone still records `input.updatedBy`
  (`src/store.ts:556`, `:565`; `src/pgstore.ts:511`, `:524`, `:532`)
  and refuses a missing one (BR-64). The boot seed writes the
  server-side `boot` actor with no request (`src/store.ts:262-275`).
- **Every write contract requires the field today.** `actor` is
  required in the write requests (e.g. `contracts/http/CheckIn.json:13`,
  `contracts/http/UpsertGuest.json:13`,
  `contracts/http/CheckOutReservation.json:19`) and `updatedBy` in
  `contracts/http/UpdateHotelConfig.json:13`, so the field keeps its
  shape and no caller breaks (rule 3).
- **The audit columns and outbox payloads are text and JSON, so no
  migration is needed.** `services/stay/migrations/002_schema.sql:31-33`,
  `services/billing/src/main/resources/db/migration/V2__schema.sql:23-25`,
  and the outbox tables' `created_by TEXT` with a JSONB `payload`
  (`services/stay/migrations/001_boot.sql:9-16`,
  `services/billing/src/main/resources/db/migration/V1__boot.sql:9-16`);
  a signed session token is about 125 characters
  (`services/admin/src/store.ts:79-83`) and every audit column is
  `TEXT`. No consumer reads the payload `actor` as a display value:
  Reporting exposes no raw payload
  (`services/reporting/internal/handler/handler.go:136-232`) and no
  desk surface renders a Stay/Guests/Rooms/Reservations/Billing actor
  (`app/src/views/PrintView.vue:1030`, `:1122`, `:1159` send one and
  display none), while Admin's audit view reads only Admin's own
  tables (`services/admin/src/store.ts:484-522`).

Product rules (decided here):

1. **The recorded actor is the session, never the request.** Every
   write that persists an actor with its timestamp records the session
   the request authenticated, and no write path reads `actor` (or
   Admin's `updatedBy`) from the body for the recorded value. The
   request-supplied name may appear only as the annotation rule 3
   allows.
2. **The value is the resolved identity where the service resolves
   one, otherwise the session token.** Admin verifies the token into a
   caller, so its writes record that caller's `signinIdentity`. Stay,
   Guests, Rooms, Reservations, and Billing authenticate presence only,
   so they record the session token the request presented — the value
   without the `Bearer ` prefix, so one session records one identical
   string in every service and a Stay close and the Reservations
   completion it forwards agree. Resolving that token to a human
   identity on those five services is the identity-hardening slice, not
   this change: here the source is fixed, and the resolved value
   replaces the token at the same seam when that slice lands.
3. **The request field is demoted, never refused.** The `actor` and
   `updatedBy` fields keep their contract shape, their required flag,
   and their existing validation refusals, and their value is never the
   recorded actor. Where the write emits a JSON outbox payload, a
   request value that differs from the session actor is preserved
   additively as `requestActor` in that payload; when it equals the
   session actor or is blank, no key is added, so an honest caller's
   payloads stay exactly as today. Where the write
   records only a column — change rows, state history, Admin audit rows
   — the request value is dropped and the row shape is unchanged, with
   no migration and no backfill. A disagreement never refuses: every
   desk call the tree makes today keeps its status, its stored effect,
   and its response, because the desk still sends its display name and
   the desk UI's actor field is out of scope.
4. **No session, no request actor.** Every `/v1/*` write already
   refuses a missing token with `UNAUTHENTICATED` (401) before it
   writes, so the actor never falls back to the body. The one write
   path with no request session is the Admin boot seed, which keeps its
   server-side `boot` actor. A provider-to-provider call carries the
   caller's own session: Stay's `CheckOut` forwards the desk token to
   `CheckOutReservation` (`services/stay/src/reservationsClient.ts:34-44`),
   so both the Stay rows and the Reservations rows record the same
   session token and the forwarded `actor` is an annotation only.
5. **Nothing else moves.** No new error code, catalogue key, desk
   state, control, route, print rule, contract file, schema, table, or
   migration, and no reader-visible desk change. Token verification,
   HMAC, expiry, revocation, and role authorization are unchanged and
   are the named out-of-scope slice. The interim token value is bounded
   by the session's 15-minute idle lifetime and is never written to a
   log line.

Named consequences, not decided here: the open-balance approval
provenance (`approvedBy` and `role` in `RecordOpenBalanceApproval`) is
a different recorded claim and keeps its own, already decided handling
(`AC-CKO-1` re-derives the approval server-side), so this change
touches only the actor column and payload field; making the request
`actor`/`updatedBy` optional or removing it once the desk stops sending
it, and the single cross-service actor value, arrive with the
identity-hardening slice and a later contract cleanup.

- AC-SEC-1 — Given a valid session, when a write through Stay
  (`CheckIn`, `CheckOut`, `MoveRoom`, `RecordActualTimes`), Guests
  (`UpsertGuest`), Rooms (`UpsertRoomType`, `UpsertRoom`,
  `UpdateRoomState`, `AssignRoom`, `ReleaseRoom`, `BlockRoom`,
  `ReleaseBlock`), Reservations (`CreateReservation`,
  `CheckInReservation`, `CheckOutReservation`, `ModifyReservation`,
  `CancelReservation`, `MarkNoShow`), or Billing (`GetFolioBalance`,
  `PostCharge`, `RecordPayment`, `RecordOpenBalanceApproval`,
  `RunDayClose`, `ProduceInvoice`, `ProduceReceipt`,
  `UpsertChargeItem`, `UpsertTaxFeeRule`) commits, then every outbox
  event, change row, and state-history row it writes records the
  session token the request presented as the actor, not the request's
  `actor` string; an operation that persists no audit row is unchanged.
  Traces to: FR-RES-1, FR-RES-2, FR-FDK-2, FR-FDK-3, FR-FDK-4,
  FR-RMS-1, FR-RMS-2, FR-RMS-3, FR-BIL-1, FR-BIL-2, FR-BIL-3,
  FR-BIL-5, FR-ADM-1; NFR-AUD-1, NFR-SEC-2; AC-RES-1, AC-FDK-2,
  AC-BIL-1, AC-BIL-2, AC-BIL-3.
- AC-SEC-2 — Given a valid session for one staff member, when a write
  sends an `actor` naming another person (or any other text), then the
  answer and the stored business effect are exactly those of the same
  write carrying the honest value, the recorded actor is the session
  token, the supplied value never appears as the actor, and where the
  write emits a JSON outbox payload it appears only as `requestActor`.
  A write whose `actor` equals the session actor adds no `requestActor`
  key, so its payload is byte-for-byte today's. Traces to:
  NFR-AUD-1, NFR-SEC-2; AC-SEC-1.
- AC-SEC-3 — Given an authenticated `UpdateHotelConfig` by an owner or
  manager, when the write succeeds, then the `config.updated` audit
  rows and the stored profile rows record the caller's
  `signinIdentity`, never the body's `updatedBy`, while the body field
  stays required with its existing refusals and every value that
  satisfies the per-key table is stored, read back, and timed exactly
  as today. A body `updatedBy` naming another person changes nothing
  but the dropped annotation. The recorded-actor half of `AC-CFG-4` is
  superseded by this condition; every other clause of `AC-CFG-4`
  holds. Traces to: FR-ADM-1, FR-ADM-4; NFR-AUD-1, NFR-SEC-2;
  AC-CFG-4.
- AC-SEC-4 — Given no `Authorization` header, when any write is
  called, then the answer is today's HTTP 401 `UNAUTHENTICATED` and
  nothing is written, so the actor never comes from the body. Given the
  Stay `CheckOut` that completes its booking, then Stay's own rows and
  the forwarded Reservations `CheckOutReservation` rows record the same
  desk session token, and the forwarded `actor` never overrides it.
  The Admin boot seed keeps the server-side `boot` actor. Traces to:
  FR-DEP-1, FR-DEP-5, FR-ADM-1; NFR-AUD-1, NFR-SEC-2.
- AC-SEC-5 — Given the change ships, when it is verified, then outbox
  payloads and change/history rows keep their existing keys and
  columns with `requestActor` the only addition; every write contract
  file is unchanged; no error code, catalogue key, desk screen,
  control, route, label, desk state, print rule, schema, table,
  migration, or backfill is added; token verification, HMAC, expiry,
  revocation, and role checks are unchanged; and the tree carries one
  spoofed-actor guard per write operation per stack — Node store tests
  for Stay, Guests, and Rooms, Go handler or store tests for the six
  reservation writes, Billing controller or service tests for its
  adapters, and the Admin config test — each asserting that the
  recorded actor is the session and the spoofed value is demoted, with
  the existing suites green. Traces to: NFR-AUD-1, NFR-SEC-2
  (evidence condition; no additional behaviour).

Done when: every write through Stay, Guests, Rooms, Reservations, and
Billing records the session token instead of the request string; a
spoofed actor changes nothing but an additive `requestActor`
annotation; Admin's config write records the resolved caller; provider
calls and the no-session boot path keep their actor source; payloads,
rows, and contracts are unchanged or extended additively; and the
spoofed-actor guards pass with the existing suites green.

## 28. A failed Reporting rebuild keeps the last good read model (Refs #642)

Product-owner scope decision and acceptance conditions for audit
finding P2 (issue #642): `Rebuild` empties every projection, consumer
offset, and as-of stamp before it replays an outbox slice
(`services/reporting/internal/store/store.go:225-243` — the maps are
replaced under the lock at `:227-235` and the mutex released at
`:236`), then returns on the first event that will not project
(`:237-241`). Reads take the same mutex per call and never refuse
(`Occupancy` locks at `:479`, `Revenue` at `:534`, `Sheet` at `:560`,
`Housekeeping` at `:633`), so a rebuild that aborts part-way leaves the
desk reading an empty or partial projection set whose `asOf` is the
newest event that did apply (`:215-217`) — occupancy and revenue read
as zero or short with a freshness stamp that looks as plausible as a
healthy rebuild's. One rule: a rebuild publishes only a fully replayed
set, and an aborted rebuild changes nothing the desk can read.

Tier T2: one internal lifecycle for one existing operation — a rebuild
publishes its result all at once instead of in place — with no new
subsystem, dependency edge, data model, or code token, no new
operation or route, and no read response, field, or contract change,
so no status field joins any contract and no T3 escalation applies.
Surfacing a rebuild failure through the read endpoints is explicitly
out of this issue's scope; if it is ever wanted, it adds a response or
status field to a read contract and becomes its own T3 decision with an
ADR and a diagram delta. Not T1 either: the failure path's behaviour
for the operator and for a concurrent reader changes, and T1 covers
typos, test-only work, and dependency bumps. The conditions below are
the product half. FR/NFR wording is owned by `business-analyst`
(`docs/requirements/mvp-requirements.md` section 36), and the business
rule that states the all-or-nothing publication is BR-66
(`docs/requirements/business-rules.md`); the LLD delta with the
build-aside/swap shape and the refreshed rebuild edges on the reporting
service design's flowcharts is by `architect` (LLD section 35,
`docs/architecture/services/reporting.md` sections 3 and 4, refreshed by
the implementation PR per maintain-with-code); guard mapping by
`qa-lead` (`docs/testing/traceability-matrix.md` section 28); the gate
verdict by `spec-reviewer`. No UI contract section: no desk screen
renders rebuild state, and no read route, response field, catalogue
key, control, or print rule changes. The scope decision is D-40 in
`docs/project/decision-log.md` and the stale-or-partial read-model risk
is R-21 in `docs/project/risk-register.md`.

As-built validation (read-only trace at this spec head — the
implementation lab reproduction belongs in the implementation PR body
or an issue comment):

- **The rebuild empties the published set before it replays
  anything.** `Rebuild` takes the mutex, replaces `seen`, `offsets`,
  `asOf`, and all six projection maps with empty values
  (`services/reporting/internal/store/store.go:225-235`), releases the
  mutex (`:236`), and only then feeds the events through `Apply`
  (`:237-241`), so the published read model is empty from the first
  moment of the rebuild.
- **One refused event ends the replay and leaves the half-built set in
  place.** `Rebuild` returns the first `OpError` from `Apply` (`:238`,
  `:239`) without restoring anything, so every projection applied before
  the bad event stays served and every event after it never lands. The
  refusal vocabulary is today's — `VALIDATION_FAILED` naming the field
  through `validation(field, message)` (`:28-30`), raised by `project`
  for a missing or malformed payload field (for example `:251-264`).
- **`Apply` records an event only after it projects, but the stamp it
  records is what a partial set carries.** `Apply` validates the id
  (`:202-204`), skips an already-seen id (`:205-207`), projects
  (`:208-210`), and only then records the id, the per-subscription
  offset, and the as-of time (`:211-217`); a replay that stops early
  therefore seals a complete-looking as-of stamp over an incomplete set.
- **Reads serve whatever the maps hold and never refuse.** The handler
  package states the design ("a lagging rebuild shows through the as-of
  timestamp, never by refusing the desk",
  `services/reporting/internal/handler/handler.go:1-8`), and each report
  takes the mutex and reads the live maps at `:479` (`Occupancy`),
  `:534` (`Revenue`), `:560` (`Sheet`), `:633` (`Housekeeping`), so a
  read issued between two replay steps sees the half-built model, not
  the previous one.
- **The rebuild has no HTTP operation; its only operator-facing channel
  is the returned error.** `cmd/server/main.go` mounts `GET /healthz`
  (`:30`) and the read prefix `POST /v1/reporting/` (`:32`), and the
  store is exposed for the rebuild job through `service.Store()`
  (`services/reporting/internal/service/service.go:24-27`), so no read
  route or status field reports a rebuild today — which is why the
  issue rules read-endpoint surfacing out of scope and this decision
  keeps the error return as the observation point.
- **The consumer offsets are the job's resume record and are emptied
  too.** `Rebuild` clears `offsets` (`:228`) and `Apply` advances one
  subscription at a time (`:212-214`); `Offsets()` hands the record back
  for resume (`:649-658`) and `AsOf()` the freshness stamp (`:661-666`).
  A failed rebuild that kept a partial offset record would let a retry
  skip the events it never applied.
- **No guard drives a failing rebuild today.** The rebuild guards all
  drive clean slices — `TestRebuildMatchesSourceRows`
  (`services/reporting/internal/store/store_test.go:63`),
  `TestDuplicateDeliveryNeverDoubleCounts` (`:142`),
  `TestConsumerOffsetsAdvancePerSubscription` (`:192`), and
  `TestRebuildTracksRoomsNeedingWork` (`:273`) — while
  `TestMalformedEventsAreRefused` (`:228`) feeds bad events through
  `Apply` alone, on a store that has never served a row.

Product rules (decided here):

1. **Build aside, swap on success.** A rebuild constructs a fresh
   candidate set — its own `seen`, per-subscription offsets, as-of
   stamp, and projection maps — without touching the published one, and
   installs that candidate in one critical-section swap only after every
   event in the slice has projected. The published set therefore changes
   exactly once per rebuild, from one complete state to another.
2. **An aborted rebuild publishes nothing.** On the first refused event
   the candidate is discarded, the refusal is returned unchanged (same
   code, status, message, and details as today's `OpError`), and the
   published projections, `seen` record, per-subscription offsets, and
   as-of stamp keep the values they held before the rebuild started.
   Every report keeps answering the rows it answered before, and a retry
   replays from the same offset record because nothing moved.
3. **The failure is observable to the operator through the error
   return, never silent, and never through a read.** The rebuild call
   answers the same `VALIDATION_FAILED` refusal it answers today, naming
   the field that stopped the replay; the read model's freshness stamp
   stays at the last successfully applied event time instead of
   advancing over a partial replay. No read route, response field,
   status field, or new operation is added — surfacing rebuild state
   through reads stays out of scope as the issue scopes it — and the
   desk keeps reading last-good rows with a visibly older as-of stamp
   rather than zeros with a fresh-looking one.
4. **A successful rebuild is byte-identical to today's.** For the same
   event slice, the rows, row order, zero-filled dates, revenue totals,
   daily-sheet groups, housekeeping list, and as-of stamp served after
   the swap are exactly what today's clear-and-replay produces, and the
   per-subscription offsets name the same last-applied event ids, so
   resume behaviour and every existing report guard keep their
   expectations. Idempotency survives the swap: re-applying an event
   from the replayed slice stays a no-op.
5. **The swap is the only publication point, and reads never refuse.**
   A read issued while a rebuild runs answers either the complete
   pre-rebuild set or the complete post-rebuild set, with the as-of
   stamp belonging to that same set; a read is never refused for
   staleness and never blocked for longer than the swap. The rebuild
   remains a single writer, as today — serialising concurrent rebuild
   calls is not part of this change (rule 6).
6. **Nothing else moves.** No contract file, schema, error code,
   catalogue key, desk screen, control, route, print rule, migration, or
   backfill is added or changed; the 730-night range cap (BR-62,
   section 24) and every existing refusal keep their behaviour; the
   in-memory read model keeps its shape, and the planned Postgres
   persistence of the read model will keep these same rebuild semantics
   when it lands.

Named consequences, not decided here: surfacing a rebuild failure or
status through the read endpoints or a separate status/health surface
(a T3 change if a contract field joins), bounding or serialising
concurrent rebuild calls, and persisting the read model to Postgres all
stay outside this change.

- AC-RPT-8 — Given a read model already serving rows from a completed
  rebuild, when a later rebuild meets an event it cannot project
  mid-stream, then the rebuild returns the same refusal it returns today
  — `VALIDATION_FAILED` naming the offending field with today's
  sentence — and immediately after it every report (`OccupancyReport`,
  `RevenueSummary`, `DailySheet`, `HousekeepingReport`) answers exactly
  the rows, row order, and `asOf` it served before the rebuild started,
  with the per-subscription offset record unchanged, so a retry replays
  from the same place. Traces to: FR-RPT-1, FR-RPT-2, FR-RPT-3, FR-RPT-4
  (Refs #642); AC-RPT-1, AC-RPT-2, AC-RPT-3, AC-RPT-4.
- AC-RPT-9 — Given a rebuild that is replaying or has aborted, when any
  report is read, then the read answers from one complete set — the
  pre-rebuild set until the swap, the post-rebuild set after it — never
  an empty or partially built set, and the `asOf` it carries belongs to
  that same set (zero only on a store that has never applied an event);
  the read is never refused for staleness and is never blocked for
  longer than the swap. Traces to: FR-RPT-1, FR-RPT-2, FR-RPT-3,
  FR-RPT-4 (Refs #642); AC-RPT-8.
- AC-RPT-10 — Given a rebuild replays a slice whose events all project,
  when it completes, then every report and the per-subscription offset
  record are exactly today's clear-and-replay output for that slice, and
  re-applying a replayed event stays a no-op; the change carries a guard
  that feeds a bad event mid-stream and asserts the pre-rebuild rows,
  order, and `asOf` are still served, a guard that asserts a failing
  rebuild leaves the offset record unchanged, and a guard that asserts a
  successful rebuild matches today's rows, while the existing rebuild
  guards and the range-cap guards stay green; no contract file, schema,
  route, desk surface, catalogue key, or print rule changes and
  `contract-check` stays green. Traces to: FR-RPT-1, FR-RPT-2,
  FR-RPT-3, FR-RPT-4 (Refs #642); AC-RPT-1, AC-RPT-2, AC-RPT-3,
  AC-RPT-4 (evidence condition; no additional behaviour).

Done when: a rebuild that fails part-way returns today's refusal and
leaves the previously served projections, offsets, and as-of stamp
intact; a read issued during or after a failed rebuild answers one
complete set and is never refused; a successful rebuild still produces
exactly today's rows, order, zero-filled dates, offsets, and `asOf`; and
the store carries the mid-stream bad-event guard beside the existing
rebuild guards.

## 29. Room state counts in sellability (Refs #636)

Product-owner scope decision and acceptance conditions for audit
finding M1: the sellability answer counts date-ranged blocks but never
room state, so a room out of order for maintenance — or a room with a
guest in it — is advertised as sellable. As built at this spec head,
`checkSellability` subtracts only block-covered rooms: the aggregate
branch takes every room of the type (`services/rooms/src/store.ts:370`,
`totalCount` at `:382`) and reports
`ofType.length - blockedRooms.length` (`:383`, `blockedRooms` built at
`:371-377`); the single-room branch returns `totalCount: 1` and
`sellableCount: 1` for any room that no block covers
(`:348-368`, the reply at `:361-368`). The room states are `occupied`,
`vacant-dirty`, `vacant-clean`, `vacant-inspected`, and `out-of-order`
(`:17-30`), and the Postgres twin answers the same way
(`services/rooms/src/pgstore.ts:341-380` single room,
`:382-392`'s count query for the aggregate). Because the aggregate count
is the desk's availability figure and the single-room answer is what the
Book confirm re-reads before it creates a reservation
(`app/src/views/BookView.vue:977-1011`), a room taken out of service is
offered to the desk and can be sold.

Tier T2: the arithmetic behind one existing read operation changes, so
its caller-visible answer moves while the operation, its request and
response fields, its statuses, its refusal vocabulary, every desk
layout, token, component, state, and copy, and every print rule stay as
they are — no new subsystem, dependency edge, data model, lifecycle
state, or code token, so no T3 escalation applies; not T1 either, since
availability the desk depends on changes for the reader. The change
moves `sellableCount` and the single-room reply only: #631 already
merged the reservation ceiling as `totalCount - len(blockedRooms)` and
deliberately does not consume `sellableCount` (ADR-0006 D2;
`docs/architecture/services/rooms.md` section 9), and this issue puts
Reservations' own availability decision out of scope, so the ceiling is
untouched here in either direction. The conditions below are the
product half. FR/NFR wording and the business rule that states the
sellable state list are the `business-analyst` handoff
(`docs/requirements/mvp-requirements.md` section 37, BR-67); the
contract description line for `sellableCount`
(`contracts/http/CheckRoomTypeSellability.json`), the LLD delta, and the
refreshed sellability edges on the rooms service-design flowcharts
(including the failure/rollback path) are the `architect` handoff
(`docs/architecture/lld.md` section 36,
`docs/architecture/services/rooms.md` sections 3 and 4, refreshed by the
implementation PR per maintain-with-code); guard mapping is `qa-lead`'s
(`docs/testing/traceability-matrix.md` section 29); the release and
rollback note is `release-manager`'s; the gate verdict is
`spec-reviewer`'s. No UI contract section: no screen, control, route,
catalogue key, state, or copy is added or changed — the Book confirm
already refuses a zero count with `desk.book.refused_soldout`
(`app/src/views/BookView.vue:1004-1011`) and keeps that sentence. The scope
decision is D-41 in `docs/project/decision-log.md`, and the
under-counting risk the issue names is R-22 in
`docs/project/risk-register.md`. `SEL` is the domain code for this
family.

- AC-SEL-1 — Given a room type holding N rooms, some of them
  `out-of-order` or `occupied`, some `vacant-dirty`, `vacant-clean`, or
  `vacant-inspected`, and some covered by a date-ranged block, when the
  aggregate sellability read for that type and range is answered, then
  `sellableCount` counts only rooms that are both block-free and in a
  sellable state, so an `out-of-order` room and an `occupied` room are
  not counted as sellable for their type; the non-sellable state list is
  exactly `out-of-order` and `occupied`, and every vacant state stays
  sellable, so a dirty room is still offered for a future stay — the
  list is explicit, not "any state but the sellable ones", so under-counting
  is bounded by those two names; `totalCount` stays N and keeps
  today's meaning (every room of the type, whatever its state);
  `blockedRooms` keeps today's content and order (exactly the rooms a
  block covers for the range, and only those); a room that is both
  block-covered and in a non-sellable state is subtracted once, so
  `sellableCount` never goes below `0` and never subtracts the same
  room twice; a type with no rooms answers `totalCount: 0` and
  `sellableCount: 0`; and both stores (in-memory and Postgres) answer
  the same number for the same recorded state. Traces to: US-RTE-2,
  US-RMS-1; FR-RTE-2, FR-RMS-1, FR-RMS-3, BR-12, BR-67 (Refs #636).
- AC-SEL-2 — Given one named `roomNumber` and a date range, when that
  room is `out-of-order` or `occupied` and no block covers the range,
  then the read answers success with `totalCount: 1`,
  `sellableCount: 0`, and `blockedRooms: []`, and never claims
  availability — the reply reuses today's envelope, status, and fields,
  with no new error code and no new sentence, so the desk Book confirm
  refuses the booking with the existing sold-out sentence
  (`desk.book.refused_soldout`) and creates no reservation; when the
  named room is `vacant-dirty`, `vacant-clean`, or `vacant-inspected`
  and block-free, then `sellableCount: 1` exactly as today; and when a
  block covers the range, then the existing block refusal stands
  unchanged in both stores — `STATE_ILLEGAL` naming the room and
  carrying the block's dates and reason (`rooms.state.room_blocked`) —
  and is never replaced by the state answer, so a block-covered
  out-of-order room still refuses through the block path. Traces to:
  US-RTE-2, US-RMS-3; FR-RTE-2, FR-RMS-3, BR-12, BR-67 (Refs #636).
- AC-SEL-3 — Given the block behaviour the desk depends on, when this
  change lands, then it is unchanged: a room is named in `blockedRooms`
  for exactly the ranges a block covers and for no other reason
  (room state never adds a room to that list), `BlockRoom` and
  `ReleaseBlock` keep today's codes, statuses, details, and stored
  effect, releasing a block returns the room to sale exactly as today
  when its state is sellable and leaves it unsellable when it is
  `out-of-order` or `occupied`, and no room state is added, removed, or
  re-named and no state-machine transition moves. Traces to: US-RMS-3;
  FR-RMS-3, BR-12 (Refs #636).
- AC-SEL-4 — Given the merged server-side availability derivation
  (#631, ADR-0006 D2), when this change lands, then the reservation
  ceiling is neither raised nor lowered: Reservations still derives
  `totalCount - len(blockedRooms)` and reads neither `sellableCount`
  nor room state, so an out-of-order room remains inside that ceiling
  until the separate Reservations availability decision owns it — this
  issue neither widens nor narrows the booking guard; the response
  shape, required fields, operation name, route, statuses, and error
  list of `CheckRoomTypeSellability` stay as today, with only the
  `sellableCount` description line updated to name room state, and
  `contract-check` stays green; no catalogue key, desk screen, control,
  layout, token, state, or print rule changes; and the implementation
  carries guards for the out-of-order aggregate case, the occupied
  aggregate case, the single-room out-of-order and occupied cases, the
  blocked-and-out-of-order single-subtraction case, and the sellable
  vacant-state control, in both stores, with the existing sellability
  and block guards (`services/rooms/src/server.test.ts:268-303`,
  `:502-527`, `:645-692`) green. Traces to: US-RTE-2, US-RES-1;
  FR-RTE-2, FR-RTE-5, FR-RMS-3, NFR-CON-1 (Refs #636, Refs #631).

Done when: an `out-of-order` or `occupied` room is not counted as
sellable in the aggregate reply for its type, the single-room path
answers `sellableCount: 0` for such a room without claiming availability
and the Book confirm refuses it with the existing sold-out sentence, a
blocked room keeps its exact `blockedRooms` membership and its
`STATE_ILLEGAL` refusal, the explicit non-sellable state list is
`out-of-order` and `occupied` while every vacant state stays sellable,
a room that is both blocked and non-sellable is subtracted once, and the
merged #631 reservation ceiling, the response contract, the desk
surfaces, and every existing guard keep their behaviour.

## 30. Rates refuses malformed restriction and availability input (Refs #633)

Product-owner scope decision and acceptance conditions for audit
findings T1–T3 on the Rates side (the #625 class: an input, or an
unchecked arithmetic step, silently decides an answer). The service owns
stay restrictions, availability counts, and the quoted price basis, and
it still coerces, trusts, and stores values it either cannot honour or
cannot represent: a non-boolean `closedToArrival` is read as `false`, a
restriction is stored for a room type Rates knows no price for, a
caller-supplied `totalUnits` sets the availability answer, the quote
total is summed with no overflow check, and rate-plan text has no
length bound.

What #631 and #632 already settled, and what this section does not
reopen:

- **#631 (merged) moved the booking ceiling off the request.** The
  overbooking guard derives its ceiling from the Rooms inventory,
  `totalCount - len(blockedRooms)`, and the request's `sellableUnits` is
  optional and advisory (ADR-0006 D2; `AC-OVB-1`). No application calls
  Rates' `CheckSellableCount` any more — Reservations and the desk both
  read Rooms — so the operation's `totalUnits` field is a
  caller-controlled inventory input with no consumer left that needs
  it. This section closes that field; it does not move the #631 ceiling
  in either direction.
- **#632 (merged) made the Rates quote the frozen price basis.** On
  Create and Modify the stored total is what `QuotePrice` returns for
  the effective room type, dates, and discount
  (`services/reservations/internal/service/service.go:253-267`,
  `:385-400`), the request total is advisory and compared
  (`AC-PRC-1`..`AC-PRC-2`), and the check-out review posts that frozen
  total as the room charge (`app/src/views/StayView.vue:1849-1867`).
  The consumer now refuses a wrapped *negative* total as unreadable
  (`services/reservations/internal/pricing/client.go:157-169`,
  `total < 0`), but a multiple wrap can land on a small positive total
  that consumer cannot tell from a real one — so the guard belongs
  where the arithmetic happens, in Rates. This section closes that, and
  does not re-decide the price authority.

As-built validation (read-only code trace at this spec head):

- **`closedToArrival` is coerced, never checked.**
  `closed, _ := body["closedToArrival"].(bool)`
  (`services/rates/internal/handler/handler.go:234`) turns `"true"`, `1`,
  `"yes"`, and `null` into `false`, and the store persists that `false`
  (`services/rates/internal/store/store.go:210`); `CheckRestrictions`
  refuses only when the stored flag is `true`
  (`:320-322`), so a manager who wrote a closed-to-arrival window
  through a JSON string gets a window that never applies and no message
  says so.
- **A restriction binds to any `roomTypeId` string.** The handler checks
  presence only (`services/rates/internal/handler/handler.go:209-213`)
  and both stores append the row verbatim
  (`services/rates/internal/store/store.go:198-214`;
  `services/rates/internal/store/postgres.go:149-188`). The schema keeps
  `room_type_id UUID NOT NULL` as a logical reference to Rooms with no
  cross-schema foreign key (`services/rates/migrations/000002_schema.up.sql:28-33`,
  `:48`), so the Postgres store already refuses a non-UUID through the
  driver's `22P02` answer (`services/rates/internal/store/postgres.go:170-172`)
  while the in-memory store accepts any string — the two stores already
  disagree — and a well-formed UUID for a type no plan prices is
  accepted by both, creating a window that matches nothing.
- **The availability count is whatever the caller sent.**
  `CheckSellableCount` takes the request `totalUnits` as the answer when
  it is present (`services/rates/internal/store/store.go:347-355`,
  `services/rates/internal/store/postgres.go:380-388`) and only falls
  back to the plan's `defaultUnits`, then `0`
  (`services/rates/internal/store/store.go:356-372`), so a caller sets
  the number the desk reads. The operation's only remaining exercisers
  are its contract fixture
  (`services/rates/contract-tests/CheckSellableCount.json`) and the e2e
  scripts (`script/e2e-desk-loop.sh:290`,
  `script/e2e-perf-check.sh:179`); neither asserts the returned count.
- **The quote sum is unchecked.** `quoted.TotalMinor += price.PriceMinor`
  (`services/rates/internal/store/store.go:274`) has no overflow guard,
  and neither has the percent multiplication (`:284`) or the amount
  subtraction (`:286`). Stored prices are any `int64` at or above zero
  (`:180-182`; `services/rates/internal/store/postgres.go:116-119`), so
  one absurd stored price plus a second night wraps the sum.
- **Rate-plan text is unbounded.** `name` is required but has no length
  (`services/rates/internal/handler/handler.go:158-162`), `description`
  is coerced (`:163`), so a non-string silently becomes the empty
  string, and neither store nor schema bounds either
  (`services/rates/internal/store/store.go:161-176`;
  `services/rates/migrations/000002_schema.up.sql:18-20` —
  `name TEXT`, `description TEXT`). The 65 536-byte body ceiling (#630, `AC-BND-1`)
  bounds one request, not a stored row, and the plan name is a map key
  and a desk label (`app/src/views/ManageView.vue:449-458`, `:1824`,
  `:1860`).

Tier T2: four existing operations change a caller-visible answer — a
refusal where a value was silently coerced, a refusal where a
restriction was stored, a count the caller no longer sets, and a refusal
where a total wrapped — while no operation, route, request or response
field, status set, schema table, lifecycle state, desk screen, control,
catalogue key, or print rule is added or removed. The one field that
becomes inert (`totalUnits`) keeps its place in the request schema as
advisory, the deprecation shape #631 gave `sellableUnits`, so no
contract shape moves and no T3 escalation applies; every refusal uses a
code already in the shared enum (`VALIDATION_FAILED`, `NOT_FOUND`,
`STATE_ILLEGAL`), so no enum edit. No UI contract section applies: no
screen, control, route, state, or copy changes, and no desk surface even
sends `UpsertRestriction` or `CheckSellableCount` — the Manage screen
creates plans and saves nightly prices only
(`app/src/views/ManageView.vue:1824`, `:1860`).

Decisions (five parts):

1. **A boolean field is a boolean.** A present `closedToArrival` must be
   JSON `true` or `false`; anything else — `"true"`, `1`, `"yes"`,
   `null` — is refused with `VALIDATION_FAILED` (400) naming
   `closedToArrival` and nothing is stored. Never coerced, because a
   coerced `false` is indistinguishable from a manager's deliberate
   open window. An omitted field keeps the contract default `false`
   exactly as today.
2. **A restriction binds only to a type Pricing can price.** A present
   `roomTypeId` must be a UUID and must already carry at least one rate
   price row; the first refusal is `VALIDATION_FAILED` naming
   `roomTypeId` (the shape both stores already agree on in Postgres),
   the second `NOT_FOUND` naming the type. In both cases nothing is
   stored and no `restriction-changed` event is emitted. "Known" means
   priced, not "configured with a `defaultUnits`": a plan default is not
   a price (`BR-44`), and the rule is checked inside each store so the
   in-memory and Postgres stores refuse the same requests.
3. **The availability count is the server's, never the caller's.**
   `totalUnits` is accepted for contract compatibility and shape-checked
   only (an integer at or above zero when present, otherwise
   `VALIDATION_FAILED` naming the field), and it never sets the answer:
   the count is the first plan in name order that prices the type and
   carries a `defaultUnits`, else `0` for a known type, and an unknown
   type refuses `NOT_FOUND` whether or not the field is present. This
   adopts the advisory-field shape #631 gave `sellableUnits` on the
   booking contract rather than refusing the field outright, so no
   request field is removed; removing it stays a later contract change.
4. **A quote that cannot be represented refuses.** Every step that can
   overflow is checked — the nightly sum, the percent multiplication,
   and the amount subtraction — and an overflow refuses with
   `STATE_ILLEGAL` (422) naming `roomTypeId` and carrying
   `reason: "total_overflow"`, with no nights list and no total
   returned. `STATE_ILLEGAL` is already registered and already means
   "the recorded state makes this request impossible" in this service;
   no wrapped total is ever served, because since #632 the served total
   is the money the guest is charged.
5. **Rate-plan text carries one bound each, and a type is text when it
   says so.** `name` is at most 64 characters and `description` at most
   2 000 characters, both counted in Unicode code points on the value as
   stored, and both are code constants, never configuration. A present
   `description` (and a present `name`) that is not a string is refused
   with `VALIDATION_FAILED` naming the field instead of today's silent
   empty string; an absent `description` keeps today's empty value. The
   bounds apply on write only: no migration, backfill, truncation, or
   re-validation on read, so a row already holding longer text reads
   exactly as today.

- AC-RTE-6 — Given a restriction write with `closedToArrival` present,
  when the value is `true` or `false`, then the window is stored with
  that flag and `CheckRestrictions` keeps today's behaviour — a
  `true` window refuses an arrival inside its dates with `STATE_ILLEGAL`
  naming `closed-to-arrival`, a `false` window never refuses on that
  ground, and an omitted field stores `false` as the contract default;
  when the value is any non-boolean (`"true"`, `1`, `"yes"`, `null`),
  then the write is refused with `VALIDATION_FAILED` (400) naming
  `closedToArrival` in `details.field`, nothing is stored, no
  `restriction-changed` event is emitted, and the window never reaches
  the store as a silent `false`. Traces to: US-RTE-4; FR-RTE-4;
  BR-10.
- AC-RTE-7 — Given a restriction write, when `roomTypeId` is not a UUID,
  then the write is refused with `VALIDATION_FAILED` (400) naming
  `roomTypeId`, the same answer the Postgres store already gives, so the
  in-memory and Postgres stores refuse identically; when it is a UUID
  for which no rate price row exists in any plan, then the write is
  refused with `NOT_FOUND` (404) naming `roomTypeId` and nothing is
  stored and no event is emitted; when it is a UUID that at least one
  plan prices for at least one night, then the window is stored and
  `CheckRestrictions` applies it exactly as today, whatever the plan's
  `defaultUnits` is or is not. In every refusal the stored restriction
  set is unchanged, so no window can exist that matches nothing.
  Traces to: US-RTE-4; FR-RTE-4; BR-10, BR-44.
- AC-RTE-8 — Given an availability read for a known room type, when the
  request carries `totalUnits`, then the answer is the plan default the
  server records for that type (the first plan in name order that prices
  the type and carries a `defaultUnits`), else `0` — the field neither
  raises nor lowers any count, a large value buys no extra availability
  and a small or zero value hides none; when the field is absent, the
  answer is the same plan default, else `0`; when the value is present
  and not an integer at or above zero, then the read is refused with
  `VALIDATION_FAILED` (400) naming `totalUnits`; when the room type has
  no price row at all, then the read is refused `NOT_FOUND` (404)
  naming the type whether or not the field is present, so an unknown
  type never answers a count. The response shape, the per-date list,
  the date-order refusal, and both stores stay as today, the
  reservation ceiling #631 derives is untouched, and the operation's
  contract fixture keeps passing (with its `totalUnits` now inert).
  Traces to: US-RTE-2; FR-RTE-2; BR-9, BR-47 (Refs #631).
- AC-RTE-9 — Given a quote whose nights, prices, and discount are
  otherwise valid, when the nightly sum, the percent multiplication, or
  the amount subtraction would leave the `int64` range, then the quote
  is refused with `STATE_ILLEGAL` (422) naming `roomTypeId` and
  `reason: "total_overflow"`, and no wrapped, negative, or truncated
  `totalMinor` and no partial nights list is returned, so no unquotable
  stay can freeze a price basis (#632) or become a room charge (D-24);
  when every step stays inside the range, then the answer is
  byte-identical to today — the same nightly breakdown, the same
  truncated integer percentage result, and the same non-negative clamp
  after an amount discount — and the 730-night range cap is unchanged.
  The guard is a code rule, not a stored-price ceiling: no write-time
  price bound, migration, or configuration is added.
  Traces to: US-RTE-1, US-RTE-5; FR-RTE-1, FR-RTE-3, FR-RTE-5;
  BR-13, BR-14, BR-52 (Refs #632).
- AC-RTE-10 — Given a rate-plan write, when `name` is at most 64
  characters and `description` at most 2 000 characters (or is absent),
  then the plan is created or updated exactly as today and the response
  carries the stored values; when `name` or a present `description`
  exceeds its bound, then the write is refused with `VALIDATION_FAILED`
  (400) naming the field in `details.field` with a plain catalogue
  sentence carrying the bound, and nothing is stored, overwritten, or
  truncated; when a present `name` or `description` is not a string,
  then the write is refused the same way instead of the non-string
  description becoming an empty one. The bounds are code constants
  applied in both stores on write only, with no migration, backfill, or
  read-time re-validation, the plan's identity and upsert semantics
  (name as the key, an update keeping the stored `defaultUnits` when the
  request omits it) are unchanged, and the desk keeps its existing
  rendering: a plan name above the bound reads as the Manage panel's
  existing plain failure sentence, and no control, route, label, state,
  catalogue key, or print rule changes.
  Traces to: US-RTE-1, US-ADM-4; FR-RTE-1, NFR-I18N-1.

Pointers: `AC-RTE-2` gains the `AC-RTE-8` pointer (the availability
count a caller reads is the server's plan default, never a request
field); `AC-RTE-4` gains the `AC-RTE-6` and `AC-RTE-7` pointers (a
restriction is stored only when the boolean and the room type are
usable); `AC-MANAGE-7` gains the `AC-RTE-10` pointer (the plan the desk
creates carries the declared name bound); each condition stands as
written otherwise.

Rollout and rollback: one service-side behaviour change across four
existing operations, with no schema, migration, backfill, or stored-shape
change. Restrictions already stored with a coerced `false` keep that
value — they are not re-read, re-interpreted, or deleted — so a manager
who wrote one must re-save it with a real boolean; a price row already
stored above the quote guard's range is not rewritten, it refuses quotes
for its type until corrected (R-23). Rollback is reverting the single
implementation PR, which returns the coercion, the caller-set count, and
the unchecked arithmetic. The desk needs no coordinated change because
no desk surface sends these operations.

Done when: `closedToArrival: "true"` and every other non-boolean value
is refused naming the field instead of being stored as `false`, a
restriction for an unpriced or malformed room type is refused and stores
nothing, the availability count is the plan default (else `0`) with the
request's `totalUnits` inert and never refused for its magnitude alone,
a quote that would overflow refuses instead of wrapping, rate-plan
`name` and `description` honour their declared bounds and types, and the
#631 reservation ceiling, the #632 price basis, the existing Rates
refusal vocabulary, and every existing guard keep their behaviour.

## 31. Room and room-type capacity is a whole number of at least 1 (Refs #637)

Product-owner scope decision and acceptance conditions for audit
finding M3 on the Rooms side. Both inventory writes store the guest
count with a `typeof` check and nothing else — `typeof input.capacity
=== "number"` at `services/rooms/src/store.ts:248` (`UpsertRoomType`)
and `:279` (`UpsertRoom`), and the same two lines in the Postgres store
at `services/rooms/src/pgstore.ts:146`, `:207` — while the contracts
the service already publishes declare `capacity` as
`{"type": "integer", "minimum": 1}`
(`contracts/http/UpsertRoom.json:19`,
`contracts/http/UpsertRoomType.json:16`) and the LLD already lists
`VALIDATION_FAILED` as the answer of both operations
(`docs/architecture/lld.md:236`). The rule is declared and
unimplemented, and the two stores disagree about what an unusable value
does.

Scope note — two parts of the filed issue are deliberately not decided
here:

- **The release half (audit finding M2) is dropped.** `ReleaseRoom`'s
  explicit `toState` is the specified compensating-release path under
  #647: an assignment aborted before any stay exists releases its room
  to `vacant-inspected`, a step `UpdateRoomState`'s
  `ALLOWED_TRANSITIONS` deliberately cannot express
  (`docs/architecture/state-machine.md:129-166`, section 2.1;
  `FR-REA-1`, `FR-REA-3`). Routing release through the transition table
  would refuse that step and regress shipped behaviour, so nothing in
  this section touches `releaseRoom`, its targets, or the table. The
  narrower drift the same audit found — `vacant-clean` and
  `out-of-order` admitted as release targets that no specification
  names (`contracts/http/ReleaseRoom.json:16`) — is a contract-enum
  tightening that needs its own issue and its own decision; the
  architect ruling on #637 (issue comment 7203636486) records both.
- **`features` stays unbounded.** No product or business rule bounds the
  object anywhere: both contracts say `additionalProperties: true`, and
  nothing in the schema, the LLD, the requirements, or the data
  dictionary sets a size, a key count, or a value type, so the
  65 536-byte body ceiling (#630) stays its only bound. A concrete bound
  is product/business wording first and must not be invented in an
  implementation PR; it needs its own issue.

As-built validation (read-only code trace at this spec head):

- **The check is a type assertion, not a rule.** `store.ts:248`, `:279`
  and `pgstore.ts:146`, `:207` accept any value whose `typeof` is
  `"number"`, so `-1`, `0`, `2.5`, `Infinity`, and `NaN` all pass.
  `NaN` only arrives through a direct store call (JSON cannot carry it),
  but `1e999` parses to `Infinity` in `JSON.parse`, so the HTTP surface
  reaches a non-finite value too.
- **Each store then does something different with an unusable value.**
  The in-memory store saves it verbatim (`rooms` and `room_types` are
  plain records); Postgres writes it into an `INT` column with no
  `CHECK` (`services/rooms/migrations/002_schema.sql:20`, `:38`), so a
  negative or zero is stored, a fractional value is rounded by the
  assignment cast, and `Infinity` fails the driver and surfaces as the
  service's `INTERNAL_ERROR` 500 (`services/rooms/src/errors.ts:26`)
  instead of a refusal. Two stores, two effects, and neither refuses.
- **A present non-number is silently dropped.** `capacity: "2"`,
  `null`, `true`, or `[2]` fails the `typeof` test and falls through to
  the stored value (`store.ts:248`, `:279`; the Postgres update
  `COALESCE` at `pgstore.ts:221`), so a caller's unusable value is
  reported as success with the old or null capacity. That is the same
  fail-closed defect class #633, #639, and #640 closed elsewhere.
- **No desk surface offers a refused value, except one.** `ManageView`
  refuses anything but digits at or above `1` before it sends
  (`app/src/views/ManageView.vue:1071-1085` for a room type,
  `:1300-1309` for a room), and the contract fixtures, the e2e scripts,
  and the deployment set all send whole numbers
  (`services/rooms/contract-tests/UpsertRoom.json`,
  `UpsertRoomType.json`; `script/e2e-desk-loop.sh:271`;
  `deploy/config/hotel.example.json:23-25`). The exception is the
  onboarding wizard, whose capacity rule accepts a whole number "of 0 or
  more" (`app/src/views/OnboardingView.vue:857-863`, `:579-581`; the
  sentence at `messages/en.json:700` and `messages/vi.json:700`), so a
  manager who types `0` there would newly meet a server refusal.
- **The floor is `1`, not `0`.** `FR-MGMT-3` words the desk range as
  `1..20` and the contract's own minimum is `1`
  (`docs/requirements/mvp-requirements.md:4149-4160`), so the filed
  issue's "non-negative" is corrected to "at least 1" here: a room or
  room type that sleeps no one is not a hotel record.

Tier T2: two existing operations gain a caller-visible refusal for a
value they used to store or silently drop, with no new operation,
route, request or response field, status set, schema table, lifecycle
state, migration, desk screen, control, or print rule; every refusal
uses `VALIDATION_FAILED`, already in the shared enum and already
promised by `docs/architecture/lld.md:236`. The one reader-visible move
is a single onboarding refusal sentence, covered by the UI contract
below.

Decisions (three parts):

1. **A present capacity is a whole number of at least 1, or it is
   refused.** A present `capacity` must be a JSON number whose value is
   an integer at or above `1`. No upper bound is added: the contract
   sets only a minimum, and the `1..20` range the manage form enforces
   stays a client sanity bound (`AC-MANAGE-3`), not a server rule. An
   omitted `capacity` keeps today's behaviour exactly — a create stores
   no capacity (`null`), an update keeps the stored one — because
   omitting the field is how the desk says "leave this alone".
2. **An unusable capacity is refused by name, never coerced or
   dropped.** A negative, zero, fractional, non-finite, `NaN`, or
   non-number value (`"2"`, `null`, `true`, `[2]`) is refused with
   `VALIDATION_FAILED` (400), `details.field: "capacity"`, and one plain
   sentence stating the whole-number-of-at-least-1 rule, in both
   operations and both stores. Nothing is written: no row is created, an
   existing row keeps every one of its fields, and no `room-upserted`
   event is emitted, so a refused write can never be read as a
   successful save.
3. **Both stores refuse identically, inside the store.** The rule is one
   shared check in `store.ts` used by both `RoomStore` and
   `PostgresRoomStore`, running before any write, so the in-memory and
   Postgres answers agree and a driver error never becomes an
   `INTERNAL_ERROR` 500 for a value this service can name. No migration,
   `CHECK` constraint, or backfill is added: the rule is module logic,
   which is where `docs/technical/schema.md` section 3 already keeps the
   housekeeping order, and a value already stored keeps reading exactly
   as today.

- AC-CAP-1 — Given a room-type or room write, when `capacity` is
  present as an integer at or above `1` (for example `1`, `2`, or `21`,
  which the contract admits because it sets no maximum), then the value
  is stored verbatim and comes back unchanged — the `UpsertRoomType`
  response and the next `ListRoomTypes` read carry it for a room type,
  and a room's stored value is readable from its row exactly as today —
  while every other field is written exactly as today; when `capacity`
  is omitted, then a create stores no capacity and an update keeps the
  stored one, and no state, number, floor, bed type, or features value
  moves. The published response and read shapes are unchanged, so no
  field joins `UpsertRoom`, `ListRoomsByState`, or `ListRoomTypes`
  here. Traces to: US-ADM-2, US-ADM-3, US-RMS-4; FR-RMS-4, FR-ADM-3.
- AC-CAP-2 — Given a room-type or room write with `capacity` present,
  when the value is negative (`-1`), zero (`0`), fractional (`2.5`),
  non-finite (`1e999` over HTTP, `Infinity` directly), `NaN` (direct
  store call), or any non-number (`"2"`, `null`, `true`, `[2]`), then
  the write is refused with `VALIDATION_FAILED` (400) naming `capacity`
  in `details.field` with the plain catalogue sentence, nothing is
  created or overwritten, an existing room or type keeps every stored
  field and its state, no `room-upserted` event is emitted, and the same
  request gets the same answer from the in-memory and Postgres stores —
  never a success carrying the old value, and never an `INTERNAL_ERROR`
  500. Traces to: US-ADM-2, US-ADM-3, US-RMS-4; FR-RMS-4, FR-ADM-3,
  NFR-I18N-1.
- AC-CAP-3 — Given either store, when a request is refused under
  AC-CAP-2, then the stored rows are byte-identical to before the
  request (a stored capacity of any value, including one written before
  this change, keeps reading as today) and no migration, `CHECK`
  constraint, backfill, truncation, or read-time re-validation exists;
  when the same accepted request runs against both stores, then both
  answer the same status and stored values, so the store choice at boot
  is not observable in the capacity. Traces to: FR-RMS-4, FR-ADM-3,
  NFR-CON-1.
- AC-CAP-4 — Given the onboarding wizard's step 3, when a manager
  enters a capacity, then the field's rule matches the server floor — a
  whole number of `1` or more, or empty for "no capacity" — and a value
  outside it is refused in plain words before anything is sent, in
  English and Vietnamese; the manage screen's own `1..20` rule, its
  sentences, and every other wizard field keep working exactly as today.
  Traces to: US-ADM-3; FR-ADM-3, FR-MGMT-3, NFR-I18N-1.

UI contract (one onboarding refusal sentence, Refs #637):

- **Layout, shell, navigation.** Unchanged: step 3 of the onboarding
  wizard keeps its position, its section order, and the
  `onboarding-type-capacity-<n>` text input; no route, step, control, or
  print surface is added or moved.
- **Component mapping and tokens.** The existing text input and the
  existing `desk.onboarding.capacity_invalid` catalogue key carry the
  message; no new token, component, or icon is introduced.
- **States in plain words.** *Idle*: the helper copy as today. *Empty*:
  leaving the field empty sends no `capacity`, which stays valid.
  *Refusal*: the form-level sentence says the capacity must be a whole
  number of guests of 1 or more, or left empty — EN "Enter a whole
  number of guests of 1 or more, or leave it empty.", with the matching
  Vietnamese sentence — and nothing is sent. *Saving*: unchanged.
  *Server refusal*: a value the server refuses still maps to the
  existing plain failure sentence, never a technical code.
- **Print.** No print surface renders the wizard.

Pointers: `AC-RMS-4` gains the `AC-CAP-1`..`AC-CAP-3` pointers (a saved
capacity is a whole number of at least 1 and a refused one is not
saved); `AC-MANAGE-3` and `AC-MANAGE-4` gain the `AC-CAP-1` and
`AC-CAP-2` pointers (the manage forms' capacity reaches the same server
rule); `AC-DSK-10` gains the `AC-CAP-4` pointer (the wizard's capacity
obeys the same floor); each condition stands as written otherwise.

Rollout and rollback: one module-side rule plus one wizard sentence.
Values already stored outside the rule — a negative, zero, rounded
fraction, or `Infinity` accepted by an earlier release — are neither
rewritten nor repaired, and they keep reading exactly as today, so a
manager who wants them corrected re-saves the room or type (R-24). The
desk needs no coordinated release: the manage screen already sends only
whole numbers at or above `1`, and the wizard change ships in the same
release bundle. No schema, migration, or stored-shape change exists, so
rollback is reverting the single implementation PR, which returns the
type assertion and the wizard's `0`-accepting sentence.

Done when: a negative, zero, fractional, non-finite, `NaN`, or
non-number `capacity` is refused `VALIDATION_FAILED` naming the field in
both `UpsertRoom` and `UpsertRoomType` and in both stores with nothing
written and no event emitted; a whole number at or above `1` is stored
verbatim, with `21` accepted and an omitted value keeping today's
meaning; `features` stays unbounded, the state machine and the release
path are untouched, no contract shape, schema, migration, or status set
changes, and the existing Rooms guards and the #630 body-ceiling guards
keep their behaviour.

## Traceability summary

43 done-conditions cover all 9 MVP slices from the roadmap
(Horizon 1): booking flow (6), front desk (5), rooms/housekeeping (4),
rates/availability (5), guests (4), billing/folio (7), reporting (4),
admin/config (5), workflow customisation (3). Every MVP story
(US-RES-1 through US-CUS-3) has exactly one done-condition above, and
every MVP FR (FR-RES-1 through FR-CUS-3) is referenced by at least one
condition's `Traces to` line; no condition references a Later story or
invents an FR. Open questions OQ-1 through OQ-6 are named where their
stories carry them; none is decided here.

Shell-slice addendum (Refs #291): 7 scaffold done-conditions
(AC-SHL-1..7) cover the `/app/` migration shell. Each traces to
its shell requirement (`docs/requirements/mvp-requirements.md`
[section 7](../requirements/mvp-requirements.md): FR-SHL-1..4, NFR-SHL-1..3) and to no MVP story — the shell
adds no MVP capability, so the 43-condition MVP count above
stands unchanged and the section 1–9 done-conditions hold as
written. The shell conditions were superseded per screen as
follow-up issues landed real routes — catalogue (#305), desk
(#306), book (#307), stay (#308), folio (#309), print (#310),
admin (#311), decommission (#313): AC-SHL-1, AC-SHL-3, and the
served-legacy half of AC-SHL-4 are superseded as marked above;
AC-SHL-2, AC-SHL-5, AC-SHL-6, AC-SHL-7, and the mirror half of
AC-SHL-4 stand.

Rollout addendum (Refs #419, plus #438, #503, #565, #568, and
#581): 15 desk-UI conditions (AC-DSK-1..15,
section 11) cover the six-screen Claude design rollout plus the
onboarding steps 2–4 follow-up, the business-date display
decision, the quote/folio money and date display decision, the
open-folio guest and room context in the charges-card title, and
the app-localized Book date pickers.
Each traces to its existing
MVP story and FR; no condition adds an
MVP capability, invents a story, or changes FR wording, so the
43-condition MVP count above stands unchanged and the sections
1–9 done-conditions hold as written.

Restyle addendum (Refs #517): 8 pixel-faithful conditions
(AC-RST-1..8, section 12) cover the shell plus the six-screen
owner-design rebuild. Each traces to its existing MVP story and
FR; no condition adds an MVP capability, invents a story, or
changes FR wording, so the 43-condition MVP count above stands
unchanged and the sections 1–9 and 11 done-conditions hold as
written.

Management addendum (Refs #590): 11 conditions (AC-MANAGE-1..11,
section 13) cover the new rooms and rates management desk screen —
its entry, room types, rooms and floors, the nightly price range
write including plan creation and partial-failure resume, the
no-price empty state, the non-manager refusal path, and the
per-PR evidence rule. Each traces to its existing MVP story and
FR (US-ADM-2, US-ADM-3, US-ADM-4, US-RMS-4, US-RTE-1;
FR-ADM-2..4, FR-RMS-4, FR-RTE-1); no condition adds an MVP
capability, invents a story, or changes FR wording, so the
43-condition MVP count above stands unchanged and the sections
1–9, 11, and 12 done-conditions hold as written.

Charge-posting addendum (Refs #600): one further condition
(AC-DSK-19, section 11) covers the room charge the Stay check-out
review posts before it presents a balance — the posting point the
#588 record left as a follow-up (symptom 2c, "missing (charge
posting)"). Section 11 therefore carries 19 conditions
(AC-DSK-1..19), and `AC-FDK-2` in section 2 gains the `AC-DSK-19`
pointer beside its `AC-DSK-18` one. It traces to existing stories
and FRs (US-FDK-2, US-BIL-1, US-BIL-2; FR-FDK-2, FR-BIL-1,
FR-BIL-2, FR-BIL-7, FR-RTE-5, BR-17); no story, FR, or business
rule is added or reworded, and the #588 gate conditions
(`AC-DSK-18`) stand as written, so the 43-condition MVP count
above stands unchanged and the sections 1–9, 12, and 13
done-conditions keep their behaviour (section 2 gains only the
pointer, section 11 gains the one condition).

Server-side settlement addendum (Refs #601): two further conditions
(AC-CKO-1, AC-CKO-2, section 14) cover the service half of the #588
check-out gate — the balance and the recorded approval are
re-derived from Billing at the close instead of trusted from the
request, and an unreadable folio refuses the close fail-closed
rather than closing on an unverified balance (the #588 record's
symptom 2(d), "server trust"). They trace to the existing story and
FRs (US-FDK-2; FR-CKO-4, FR-CKO-5, FR-BIL-7, BR-17) and add no
story, FR, or business rule, so the 43-condition MVP count above
stands unchanged and the sections 1–13 done-conditions keep their
behaviour: `AC-FDK-2` gains only the pointer, and the desk
conditions `AC-DSK-18` and `AC-DSK-19` stand as written with their
guards unchanged.

Departure-release addendum (Refs #646): five further conditions
(AC-DEP-1..5, section 15) cover the terminal effect of a check-out on
the booking behind the stay — the departed booking reads completed
and stops counting as an active booking, the same room type sells and
the same room turns over the same day, an early departure releases
the remaining nights, a completed booking never reopens, and a
refused close completes and releases nothing. They trace to existing
stories and FRs (US-FDK-2, US-GST-1, US-RES-1, US-RES-5, US-RMS-2,
US-FDK-1; FR-FDK-2, FR-GST-1, FR-RES-5, FR-RTE-2, FR-RMS-2, FR-BIL-7)
and to existing business rules (BR-1, BR-8, BR-9, BR-16, BR-17,
BR-18, BR-28, BR-46); no story, FR, or business rule is added or
reworded, and the state they rely on is the `closed` state `BR-1` and
the booking state machine already name. The 43-condition MVP count
above stands unchanged, and the sections 1–14 done-conditions keep
their behaviour: `AC-FDK-2` gains only the pointer. `DEP` is the
domain code for this family.

Reassignment addendum (Refs #647): five further conditions
(AC-REA-1..5, section 16) cover the arrival-time half of a room move —
the desk commit assigns only the room the guest is in and releases a
room it assigned when the commit does not land and no stay was
recorded (switch after a preload), the Stay screen's reassignment
affordance releases the
vacated room to housekeeping and keeps the move (from room, to room,
time) visible to staff (switch after a commit, and mid-stay), and
every refused or aborted attempt leaves no room occupied with no stay
behind it. They trace to existing stories and FRs (US-FDK-1,
US-FDK-3; FR-FDK-1, FR-FDK-3) and to existing business rules (BR-16,
BR-19, BR-28) plus NFR-CON-2; no story, FR, or business rule is added
or reworded, the move semantics are the ones `AC-FDK-3`, `FR-FDK-3`,
and `BR-19` already state, and no lifecycle state, contract operation,
or schema change is introduced. The 43-condition MVP count above
stands unchanged, and the sections 1–15 done-conditions keep their
behaviour: `AC-FDK-1` and `AC-FDK-3` gain only the pointer. `REA` is
the domain code for this family.

Booking-register addendum (Refs #648): seven further conditions
(AC-BMV-1..7, section 17) cover the missing booking-management desk
view — its tab and route, the date-range list with guest, reference,
room type, assigned room, dates, nights, quoted total, and state, the
inclusive-night filter and its plain empty state, the fresh
`GetReservation` row detail, the plain failure states with no invented
values, and the read-only evidence rule (no write, existing operations
only, catalogue parity, design-facts allowance, owner review of the
screen). They trace to the existing story and FRs (US-RES-5;
FR-RES-5, FR-RTE-5, FR-DSP-1, FR-DSP-3, NFR-I18N-1) — this is the
surface `AC-RES-5` already promised, not a new MVP capability, and no
story, FR, or business rule is added or reworded. `AC-RES-5` gains
only the `AC-BMV-2`/`AC-BMV-5` pointer, its grid-placement half stays
open, and the 43-condition MVP count above stands unchanged, so the
sections 1–16 done-conditions keep their behaviour. `BMV` is the
domain code for this family.

Price-authority addendum (Refs #632): five further conditions
(AC-PRC-1..5, section 18) cover the reservation price basis — the
frozen total and discount name are re-derived from the Rates
`QuotePrice` read taken during the create or modify request instead of
trusted from the body, a request whose total disagrees is refused with
`PRICE_CHANGED` rather than repaired in place, an unreadable Pricing
service refuses every booking attempt fail-closed with
`UPSTREAM_UNAVAILABLE` while a definitive Rates refusal is surfaced
unchanged, and Modify reprices on the same terms with the actor kept
in the change history. They trace to existing stories and FRs
(US-RES-1, US-RES-2; FR-RES-1, FR-RES-2, FR-RTE-1, FR-RTE-5) and to
existing business rules (BR-2, BR-13) plus NFR-AUD-1; no story, FR,
or business rule is added or reworded, the price basis a reservation
stores keeps its shape, and no lifecycle state, operation shape, or
schema change is introduced. The 43-condition MVP count above stands
unchanged, and the sections 1–17 done-conditions keep their
behaviour: `AC-RES-1` and `AC-RES-2` gain only the pointer, section 11
gains `AC-DSK-20` for the desk recovery, and `AC-DSK-19` gains only
its pointer. `PRC` is the domain code for this family.

Folio-verification addendum (Refs #634): seven further conditions
(AC-FWV-1..7, section 20) cover the money-path half of audit
finding B1 — a folio is created only for a stay Stay confirms exists
and is in house, the three folio writes verify the stay every time
(an unknown stay refuses with `NOT_FOUND`, a closed stay with
`STATE_ILLEGAL`, and neither writes a folio, a line, a balance change,
or an outbox event), an unreadable Stay refuses fail-closed with
`UPSTREAM_UNAVAILABLE` instead of creating an unverified folio, a fresh
in-house check-in still gets its folio on the first balance read, a
folio Billing already holds stays readable in every stay state so the
departure invoice and receipts still print, the desk says each refusal
in plain words in both locales, and the evidence condition names the
guards, the bounded close path, and the envelope registration. They
trace to existing stories and FRs (US-BIL-1, US-BIL-2, US-BIL-3,
US-BIL-4, US-BIL-7; FR-BIL-1, FR-BIL-2, FR-BIL-3, FR-BIL-4, FR-BIL-7,
FR-DSP-3, NFR-I18N-1) and add no story, FR, or business rule.
`AC-BIL-1`, `AC-BIL-2`, `AC-BIL-3`, and `AC-BIL-7` gain only the
pointer, the 43-condition MVP count above stands unchanged, and the
sections 1–17 done-conditions keep their behaviour. `FWV` is the domain
code for this family.

Error-vocabulary addendum (Refs #627): five further conditions
(AC-ERR-1..5, section 21) cover audit finding C1 — an unexpected
exception in Stay, Guests, Rooms, or Admin answers HTTP 500 with the
shared envelope and `INTERNAL_ERROR` instead of `VALIDATION_FAILED`; the
contract and the technical taxonomy register that token together with
the already-emitted `UPSTREAM_UNAVAILABLE` (503) and the wrong-method
`METHOD_NOT_ALLOWED` (405) the Go and Billing conformance issues need;
all four Node maps follow the contract; every existing refusal keeps its
code and status; and no desk surface or copy changes. They trace to the
requirements-side `FR-ERR-1`..`FR-ERR-3` family this change adds
(`docs/requirements/mvp-requirements.md` section 29) and to the existing
`FR-DSP-3`, `NFR-I18N-1`, and `NFR-AUD-1`; no story or business rule is
added or reworded, the refusal conditions written earlier keep their
behaviour (`AC-FDK-2`, `AC-CKO-1`, and `AC-CKO-2` hold as written), and
the 43-condition MVP count above stands unchanged, so the sections 1–17
and 20 done-conditions keep their behaviour. `ERR` is the domain code
for this family.

Body-bound addendum (Refs #630): five further conditions (AC-BND-1..5,
section 22) cover audit finding C5 — every backend service refuses a
request body above one declared 64 KiB ceiling with the shared envelope
and `VALIDATION_FAILED` naming `body`, writes nothing for the refused
request, and never buffers the surplus; each server the bundle runs
carries explicit finite read/write/idle timeouts; the ceiling is a code
constant in all eight services rather than an environment or deployment
setting; every payload under the ceiling behaves exactly as today with
no contract, desk, catalogue, route, or print change; and each service
carries an over-limit boundary guard plus a timeout guard. They trace to
the requirements-side `NFR-BND-1`..`NFR-BND-3` family this spec set
adds (`docs/requirements/mvp-requirements.md` section 30) and to the
existing `NFR-I18N-1`, `NFR-AVL-1`, `NFR-PERF-1`, and `FR-DSP-3`; no
story is added or reworded, and the wording of the body-bound business
rule is the `business-analyst` handoff
(`docs/requirements/business-rules.md` BR-60). The refusal reuses the
existing vocabulary, so `AC-ERR-1` and its sections keep their
behaviour, the refusal conditions written earlier (`AC-FDK-2`,
`AC-CKO-1`, `AC-CKO-2`, `AC-FWV-1`) hold as written, the 43-condition
MVP count above stands unchanged, and the sections 1–17, 20, and 21
done-conditions keep their behaviour. `BND` is the domain code for this
family.

Money-ceiling addendum (Refs #635): five further conditions
(AC-AMT-1..5, section 23) cover audit finding B2 — Billing's money
adapters no longer truncate a fractional amount or accept an unbounded
one: `PostCharge`, `RecordPayment`, and `UpsertChargeItem` refuse a
value that is not a whole number of minor units, a present non-number
value (with the existing field-number sentence instead of the
missing-field one), and a value above the
declared 1 000 000 000 000 minor-unit ceiling with the shared envelope
and `VALIDATION_FAILED` naming the field, write nothing for that
request, and serve every whole amount inside the ceiling exactly as
today; the tax-rule percent adapter refuses a value it cannot read as a
finite number while keeping fractional percents and the existing 0–100
service range. The ceiling is derived from the longest stay Rates
accepts (730 nights) and the owner boards' nightly rate, and it sits
four orders of magnitude below the exact-integer limit of a JSON
double. They trace to the existing `FR-BIL-2`, `FR-BIL-3`, and
`FR-BIL-5` and to `AC-BIL-2`, `AC-BIL-3`, and `AC-BIL-5`; no story is
added or reworded, and the wording of the money-ceiling business rule
is the `business-analyst` handoff
(`docs/requirements/business-rules.md` BR-61, with the requirements
delta in `docs/requirements/mvp-requirements.md` section 31). The
refusals reuse the existing vocabulary and the existing sentences'
layer split, so `AC-ERR-1` keeps its sections, the refusal conditions
written earlier (`AC-FDK-2`, `AC-CKO-1`, `AC-CKO-2`, `AC-FWV-1`,
`AC-BND-1`) hold as written, the 43-condition MVP count above stands
unchanged, and the sections 1–17 and 19–22 done-conditions keep their
behaviour. `AMT` is the domain code for this family.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1089

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-989

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1045

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1057

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1077

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1013
Server-derived availability addendum (Refs #631): three further
conditions (AC-OVB-1..AC-OVB-3, section 19) cover audit finding R1 on
the booking path — the overbooking guard decides on the capacity the
hotel records for the room type and dates instead of the
`sellableUnits` the request carries, an unreadable capacity source
refuses the booking fail-closed with `UPSTREAM_UNAVAILABLE` rather
than accepting it, and the guard keeps its single-critical-section
atomic shape. They trace to the existing stories and FRs (US-RES-1,
US-RES-2; FR-RES-1, FR-RES-2, FR-RTE-5, NFR-CON-1) and add no story,
FR, or business rule, so the 43-condition MVP count above stands
unchanged and the sections 1–17 done-conditions keep their behaviour:
`AC-RES-1` and `AC-RES-2` gain only the pointer, and the desk Book
conditions and their refusal copy stand as written.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1119

Report-range addendum (Refs #641): three further conditions
(AC-RPT-5..AC-RPT-7, section 24) cover audit finding P1 — the
`OccupancyReport` and `RevenueSummary` window is refused with the shared
envelope and `VALIDATION_FAILED` naming `dateTo` before the store lock
and before any per-date loop, so one caller can no longer loop for
millions of dates while every other report waits behind the same mutex;
a window whose `dateTo` is exactly 730 nights after `dateFrom` (731
inclusive dates) returns exactly today's rows and one night more is
refused; and the cap is one named constant in the reporting store, not
configuration, with `DailySheet`, `HousekeepingReport`, and every desk
surface unchanged. The bound adopts the number Rates already uses for a
stay range (`services/rates/internal/store/store.go:254`) and matches
the two-year reporting need `NFR-PERF-2` documents. They trace to the
existing `FR-RPT-1` and `FR-RPT-2` and to the existing `NFR-PERF-2`; no
story, FR, or business rule is added or reworded here, the
requirements-side FR/NFR delta is the `business-analyst` handoff
(`docs/requirements/mvp-requirements.md` section 32), and the business
rule that states the cap is BR-62
(`docs/requirements/business-rules.md`). The refusal reuses the existing
vocabulary and the existing reporting error mapping, so the conditions
written earlier hold as written — `AC-RPT-1` and `AC-RPT-2` gain only
the `AC-RPT-5` pointer, `AC-RPT-3` and `AC-RPT-4` are untouched, and
the 43-condition MVP count above stands unchanged, so the sections 1–17
and 19–23 done-conditions keep their behaviour. `RPT` stays the domain
code for this family.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1128

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1139

Guest-identity addendum (Refs #640): seven further conditions
(AC-GID-1..AC-GID-7, section 25) cover audit findings G1, G2, and G3 —
a name that matches two guests is refused with the shared envelope and
`VALIDATION_FAILED` naming `fullName` and returns no profile in both
stores, while a unique name and every `guestId` read answer exactly as
today; `contact` and `preferences` carry one declared shape (a plain
object of at most 16 string-keyed fields whose values are short
strings, finite numbers, or booleans) and `notes` one declared length
(2 000 characters), refused naming the field and writing nothing, with
reads unchanged so no stored profile is re-validated or dropped; a
calendar-invalid confirmation date such as `2026-13-45` is refused
naming the field; and the Book screen's guest find says the ambiguity
in one new plain sentence in both locales instead of the generic
request-failed one. The bounds are taken from the largest existing
fixtures in the tree (a 28-character note, one-field objects) with more
than nine times headroom, and both sit far under the 64 KiB body
ceiling the #630 change declares, so no legitimate desk payload is
near them. They trace to the existing `FR-GST-1`, `FR-GST-2`,
`FR-GST-3`, `FR-GST-4`, `FR-DSP-3`, `NFR-I18N-1`, and `NFR-AUD-1`; the
requirements-side `FR-GID-1`..`FR-GID-3` family this spec set adds is
the `business-analyst` handoff (`docs/requirements/mvp-requirements.md`
section 33), no NFR is added and no existing NFR changes (section 33.4
is the no-change statement), the business rule that states the
ambiguity and the two bounds is BR-63
(`docs/requirements/business-rules.md`), and the LLD
delta, the contract error-list line, and the service-design refusal
edges are the `architect` handoff. The refusals reuse the existing
vocabulary and the existing guest date sentence, so the conditions
written earlier hold as written, the 43-condition MVP count above
stands unchanged, and the sections 1–17 and 19–24 done-conditions keep
their behaviour. `GID` is the domain code for this family.

Admin-ordering addendum (Refs #639): five further conditions
(AC-CFG-1..AC-CFG-5, section 26) cover audit findings A2, A3, and A5 —
the Admin service parses the body before it checks the session, so an
unauthenticated `UpdateHotelConfig` with a malformed or oversized body
gets the parse error a valid caller would get, and `UpdateHotelConfig`
stores any key with any value while shape-checking only `name`. The
session check moves ahead of the body read for every operation except
`SignIn`, so 401 precedes every 400 (and 400 precedes 403 for an
authenticated front-desk caller); the refusal is the existing
`UNAUTHENTICATED` (401) envelope with no new token, and the payload is
never read, so the caller learns nothing about it. One per-key shape
table — `name`, `timezone`, `standardCheckinTime`,
`standardCheckoutTime`, `requiredGuestFields`, `cancellationReasons`,
`retentionFloorDays`, and the profile text keys — refuses a malformed
value with `VALIDATION_FAILED` (400) naming the key and writes nothing,
while every value that satisfies the table is stored, read back, and
audited exactly as today and a key outside the table keeps today's
behaviour; the rules are derived from the payloads the onboarding
wizard, the deployment apply, and the existing config tests already
send, so no legitimate hotel setting is refused (R-19). No new
vocabulary, contract enum, status mapping, schema, migration, desk
screen, route, or copy changes, so no UI-contract section applies. They
trace to the existing `FR-ADM-1`, `FR-ADM-2`, `FR-ADM-4`, `FR-CUS-1`,
`FR-CUS-2`, `FR-RES-3`, `FR-DSP-3`, `NFR-SEC-2`, `NFR-AUD-1`, and
`NFR-I18N-1`; the requirements-side FR/NFR delta is the
`business-analyst` handoff (`docs/requirements/mvp-requirements.md`
section 34), the business rule that states the ordering and the shapes
is BR-64 (`docs/requirements/business-rules.md`), and the LLD delta,
the Admin service-design refusal edges, the contract error-list line,
and the error-handling note are the `architect` handoff. `AC-ADM-1` and
`AC-ADM-4` gain only the pointer, the conditions written earlier hold as
written (`AC-BND-1` and `AC-BND-2` keep their behaviour for every request
that reaches the body read, with the session refusal ordered ahead for
an unauthenticated one), the 43-condition MVP count above stands
unchanged, and the sections 1–17 and 19–25 done-conditions keep their
behaviour. `CFG` is the domain code for this family.

Audit-actor addendum (Refs #643): five further conditions
(AC-SEC-1..AC-SEC-5, section 27) cover audit finding C6 — every write
path records the `actor` string the request supplied, so the audit
trail `NFR-AUD-1` promises attributes a change to a name the caller
chose. The recorded actor becomes the session: the caller's
`signinIdentity` in Admin (whose config write still trusts the body
`updatedBy` today) and the session token — without the `Bearer `
prefix — in Stay, Guests, Rooms, Reservations, and Billing, which
authenticate presence only until the identity-hardening slice resolves
the same seam to a human identity. The request field keeps its contract
shape, its required flag, and its existing refusals; a disagreeing
value is demoted to an additive `requestActor` annotation in JSON
outbox payloads only, is dropped where a row records only a column, and
never refuses a write, because the desk still sends its display name
and the desk UI's actor field is out of scope. Stay's forwarded
`CheckOutReservation` carries the caller's own token, so both rows
agree, and the Admin boot seed keeps its server-side `boot` actor. No
new error code, catalogue key, desk screen, control, route, label,
desk state, print rule, contract file, schema, table, migration, or
backfill is added, and token verification, HMAC, expiry, revocation,
and role authorization stay out of scope. They trace to the existing
`FR-RES-1`, `FR-RES-2`, `FR-FDK-2`, `FR-FDK-3`, `FR-FDK-4`,
`FR-RMS-1`, `FR-RMS-2`, `FR-RMS-3`, `FR-BIL-1`, `FR-BIL-2`,
`FR-BIL-3`, `FR-BIL-5`, `FR-ADM-1`, `FR-ADM-4`, `FR-DEP-1`,
`FR-DEP-5`, `NFR-AUD-1`, and `NFR-SEC-2`; no story, FR, or business
rule is added or reworded here — the requirements-side FR/NFR delta and
the provenance rule BR-65 are the `business-analyst` handoff
(`docs/requirements/mvp-requirements.md` section 35), and the LLD delta
with the actor-resolution diagram on the write path for Node, Go, and
Billing, plus the refreshed audit lines of the service designs, are the
`architect` handoff (LLD section 34). `AC-CFG-4` loses only the
recorded-actor half to `AC-SEC-3`, the conditions written earlier hold
as written, the 43-condition MVP count above stands unchanged, and the
sections 1–17 and 19–25 done-conditions keep their behaviour (section
26 keeps every condition except that one half). `SEC` is the domain
code for this family.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1173

Rebuild-consistency addendum (Refs #642): three further conditions
(AC-RPT-8..AC-RPT-10, section 28) cover audit finding P2 — `Rebuild`
empties every projection, offset, and as-of stamp before replaying and
returns on the first bad event, so a failed rebuild leaves the desk
reading an empty or partial read model whose freshness stamp looks as
plausible as a healthy one. The rebuild now builds aside and swaps on
success, so an aborted rebuild publishes nothing: the previously served
rows, their order, the per-subscription offset record, and the `asOf`
stamp stay exactly as they were, the refusal returns unchanged, and a
read issued during or after the rebuild answers one complete set — the
pre-rebuild one until the swap, the post-rebuild one after it — and is
never refused for staleness. A successful rebuild stays byte-identical
to today's clear-and-replay output, and no read route, response field,
status field, error code, catalogue key, desk screen, contract file,
schema, migration, or print rule changes; surfacing a rebuild failure
through the read endpoints is out of scope, so the operator observes the
failure through the rebuild call's error return and the unchanged
last-good freshness stamp. They trace to the existing `FR-RPT-1`,
`FR-RPT-2`, `FR-RPT-3`, `FR-RPT-4` and to `AC-RPT-1`..`AC-RPT-4`; no
story, FR, or business rule is added or reworded here — the
requirements-side FR/NFR delta is the `business-analyst` handoff
(`docs/requirements/mvp-requirements.md` section 36) and the
all-or-nothing publication rule is BR-66
(`docs/requirements/business-rules.md`) — and the LLD delta with the
build-aside/swap shape and the refreshed rebuild edges on the reporting
service design belong to the `architect` handoff (LLD section 35). The
conditions written earlier hold as written: the 43-condition MVP count
above stands unchanged and the sections 1–17 and 19–27 done-conditions
keep their behaviour. `RPT` stays the domain code for this family.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1205

Sellability-state addendum (Refs #636): four further conditions
(AC-SEL-1..AC-SEL-4, section 29) cover audit finding M1 — the
sellability read subtracts only date-ranged blocks, so an
`out-of-order` room (and an `occupied` one) is advertised as sellable in
the aggregate count for its type and in the single-room reply. The
aggregate `sellableCount` now counts only rooms that are both block-free
and in a sellable state, with the non-sellable state list stated
explicitly as `out-of-order` and `occupied` and every vacant state still
sellable, while `totalCount` and `blockedRooms` keep their content and a
room that is both blocked and non-sellable is subtracted once; the
single-room path answers `sellableCount: 0` instead of claiming
availability, so the desk Book confirm refuses with its existing
sold-out sentence, and the existing block refusal keeps its place; the
block behaviour, the room-state vocabulary, and the state machine do not
move; and the merged #631 reservation ceiling
(`totalCount - len(blockedRooms)`, ADR-0006 D2) is neither raised nor
lowered. They trace to the existing `AC-RTE-2` (which already promises
an availability count that excludes occupied, blocked, and reserved
rooms), `AC-RMS-3`, and the existing stories and FRs (US-RTE-2,
US-RMS-1, US-RMS-3, US-RES-1; FR-RTE-2, FR-RTE-5, FR-RMS-1, FR-RMS-3,
NFR-CON-1) plus the existing `BR-12`; no story, FR, or business rule is
added or reworded here — the requirements-side delta and the sellable
state-list rule are the `business-analyst` handoff
(`docs/requirements/mvp-requirements.md` section 37, BR-67) — and the
contract description line, the LLD delta, and the refreshed rooms
flowcharts are the `architect` handoff. `AC-RTE-2` gains only the
pointer; the conditions written earlier hold as written, the
43-condition MVP count above stands unchanged, and the sections 1–17,
19–28 done-conditions keep their behaviour. `SEL` is the domain code
for this family.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1214

Fail-closed Rates input addendum (Refs #633): five further conditions
(AC-RTE-6..AC-RTE-10, section 30) cover audit findings T1–T3 on the
Rates side — a non-boolean `closedToArrival` is coerced to `false` so a
closed-to-arrival window never applies, a restriction is stored for any
`roomTypeId` string (and for a UUID no plan prices), the availability
read answers whatever `totalUnits` the caller sent, the quote total is
summed (and discounted) with no overflow check, and rate-plan `name` and
`description` carry no bound while a non-string description silently
becomes empty. A present `closedToArrival` must be a boolean and is
refused by name otherwise; a restriction binds only to a UUID room type
that at least one plan already prices, refused `VALIDATION_FAILED` or
`NOT_FOUND` otherwise with nothing stored and no event emitted;
`totalUnits` becomes advisory-only, shape-checked and never honoured, so
the count is the server's plan default (else `0`) and an unknown type
refuses `NOT_FOUND` either way; a quote whose sum, percent
multiplication, or amount subtraction would leave the `int64` range
refuses with `STATE_ILLEGAL` naming `total_overflow` instead of serving
a wrapped total that #632 would freeze as a price basis and the desk
would post as a room charge; and `name`/`description` carry declared
lengths (64 / 2 000 characters) with present non-strings refused. No
operation, route, request or response field, status set, schema table,
lifecycle state, desk screen, control, catalogue key, or print rule is
added or removed — `totalUnits` keeps its request place as advisory,
the deprecation shape #631 gave `sellableUnits` — so no contract shape
moves and the tier stays T2; every refusal uses a code already in the
shared enum. They trace to the existing `FR-RTE-1`, `FR-RTE-2`,
`FR-RTE-4`, `FR-RTE-5`, `NFR-I18N-1`, `BR-9`, `BR-10`, `BR-13`,
`BR-14`, `BR-44`, `BR-47`, `BR-52`, `AC-OVB-1`, `AC-OVB-2`,
`AC-PRC-1`, and `AC-PRC-2`; no story, FR, or business rule is added or
reworded here — the requirements-side FR/NFR delta and the business rule
that states the fail-closed input rules are the `business-analyst`
handoff (`docs/requirements/mvp-requirements.md` section 38, BR-68) — and
the contract description/error-list lines, the LLD delta, the refreshed
Rates flowcharts, and the per-flow happy and refusal diagrams are the
`architect` handoff (LLD section 37, HLD section 29). `AC-RTE-2` and
`AC-RTE-4` gain only the pointers above, `AC-MANAGE-7` gains the
`AC-RTE-10` pointer, the conditions written earlier hold as written,
the 43-condition MVP count above stands unchanged, and the sections
1–17 and 19–29 done-conditions keep their behaviour. `RTE` stays the
domain code for this family.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1246

Capacity-validation addendum (Refs #637): four further conditions
(AC-CAP-1..AC-CAP-4, section 31) cover audit finding M3 on the Rooms
side, rescoped to the capacity half — both inventory writes check only
`typeof capacity === "number"`, so a negative, zero, fractional,
non-finite, `NaN`, or non-number value is stored verbatim, rounded by
the Postgres `INT` cast, surfaced as an `INTERNAL_ERROR` 500, or
silently dropped to the stored value, while both contracts already
declare `capacity` as an integer with a minimum of `1` and the LLD
already promises `VALIDATION_FAILED`. A present capacity must now be a
whole number at or above `1` with no upper bound added, and every other
present value is refused `VALIDATION_FAILED` naming `capacity` in both
operations and both stores with nothing written and no event emitted;
an omitted capacity keeps today's create-null / update-keeps meaning;
both stores refuse identically from one shared check inside the store
with no migration, `CHECK`, backfill, truncation, or read-time
re-validation; and the onboarding wizard's capacity rule is aligned with
the same floor in both locales, which is the change's only
reader-visible move and is covered by the section's compact UI contract.
They trace to the existing `AC-RMS-4`, `AC-MANAGE-3`, `AC-MANAGE-4`,
`AC-DSK-10`, and the stories and FRs behind them (US-ADM-2, US-ADM-3,
US-RMS-4; FR-RMS-4, FR-ADM-3, FR-MGMT-3, NFR-CON-1, NFR-I18N-1); no
story, FR, or business rule is added or reworded here — the
requirements-side FR/NFR sentence and the data-dictionary capacity
entry are the `business-analyst` handoff
(`docs/requirements/mvp-requirements.md` section 39, BR-69) — and the
contract `errors[].when` lines, the LLD per-field rule and edge trace,
the API-spec note, and the schema section-3 note are the `architect`
handoff (HLD section 30, LLD section 38). Two parts of the filed issue
are explicitly not decided here: the release half (audit finding M2) is
dropped because `ReleaseRoom`'s explicit `toState` is the specified
compensating release under #647 (section 2.1) and must not be routed through
`ALLOWED_TRANSITIONS`, with the `vacant-clean`/`out-of-order` target
narrowing left to its own contract-tightening issue; and the `features`
bound is left out because no product or business rule bounds the object
anywhere, so it needs its own decision. The conditions written earlier
hold as written, the 43-condition MVP count above stands unchanged, and
the sections 1–17 and 19–30 done-conditions keep their behaviour. `CAP`
is the domain code for this family.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-1259
