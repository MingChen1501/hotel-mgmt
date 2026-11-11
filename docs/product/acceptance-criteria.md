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
  appears on the reservation calendar. Traces to: US-RES-1; FR-RES-1,
  FR-RTE-5.
- AC-RES-2 — Given a reservation that has not been checked in, when
  staff change its dates, room type, or guest and confirm, then the
  reservation reflects the new values, its quoted price is
  recalculated from the rate plan in force, and the change is recorded
  with who made it and when. Traces to: US-RES-2; FR-RES-2. Open
  question: reason format for changes is undecided (PRD OQ-2).
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
  FR-RES-5.
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
  the room it assigned when that commit does not land (`AC-REA-1`,
  Refs #647). Traces to: US-FDK-1; FR-FDK-1.
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
  excluding occupied, blocked, and already-reserved rooms. Traces to:
  US-RTE-2; FR-RTE-2.
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

- AC-BIL-1 — Given a checked-in stay, when staff open its folio, then
  a single folio exists for the stay showing every posted charge and
  payment with a running balance. Traces to: US-BIL-1; FR-BIL-1.
- AC-BIL-2 — Given an in-house stay, when staff post a nightly room
  charge or a hotel-defined charge item, then the folio line shows the
  item, amount, and posting time, and the balance increases by the line
  amount. Traces to: US-BIL-2; FR-BIL-2.
- AC-BIL-3 — Given an open folio with a balance, when staff record a
  cash or card payment with its amount, then the payment appears on the
  folio with method and time, and the balance decreases by the paid
  amount. Traces to: US-BIL-3; FR-BIL-3. Open question: further payment
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
  against the folio. Traces to: US-BIL-7; FR-BIL-7.

Slice done when: one folio per stay carries every charge and payment
with a running balance, invoices and receipts match the folio
exactly, hotel tax and fee rules shape every balance, day-close totals
agree with the day's folios, and open balances block check-out without
a recorded approval.

## 7. Reporting

- AC-RPT-1 — Given bookings across a chosen period, when the owner
  opens the occupancy report, then each date shows occupied and
  available room counts that agree with the reservations and stays in
  the system. Traces to: US-RPT-1; FR-RPT-1.
- AC-RPT-2 — Given posted charges across a chosen period, when the
  owner opens the revenue summary, then room revenue and extra revenue
  totals agree with the folios posted in that period. Traces to:
  US-RPT-2; FR-RPT-2.
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
  FR-ADM-1.
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
  lists use those standard times. Traces to: US-ADM-4; FR-ADM-4.
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
  change).

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
the balance it gates on is read, per AC-DSK-19.

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
  with the whole screen switching between EN and VI. Traces to:
  US-FDK-5; FR-FDK-5 (no MVP story change; shell visuals only).
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
  QueryCalendar (`services/reservations/internal/handler/handler.go:121-285`),
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
  (the booking read, the stay write, or the reservation check-in),
  when the refusal returns, then the panel releases the room it
  assigned in that same commit back to the ready (`vacant-inspected`)
  state it held before the attempt, reports the refusal in plain
  catalogue words, and leaves no room occupied with no stay behind it.
  A definitive refusal only: an unreadable outcome (transport failure,
  timeout, server error) releases nothing and is reported as an
  outcome to re-read, so a guest who did arrive is never left in a
  room the system has just handed back. Traces to: US-FDK-1;
  FR-FDK-1; BR-16, BR-28, NFR-CON-2 (Refs #647).
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
commit does not land), and `AC-FDK-3` gains the `AC-REA-2`/`AC-REA-4`
pointer (the desk path that performs a move); both conditions stand as
written otherwise.

Done when: a guest checked into the wrong room ends up recorded in the
right one, the vacated room reads vacant and dirty on the board and
the Rooms map, the move with both room numbers and its time is kept
and shown to staff, and no refused or aborted attempt leaves a room
occupied with no stay behind it — with the existing check-in,
check-out, settlement, and departure guards green.

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
room it assigned when the commit does not land (switch after a
preload), the Stay screen's reassignment affordance releases the
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

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-959
