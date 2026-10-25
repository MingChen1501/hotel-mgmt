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
workflow customisation). "Staff" means any signed-in owner, manager,
or front-desk account acting within its access.

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
  linked to the room, and the room state becomes occupied. Traces to:
  US-FDK-1; FR-FDK-1.
- AC-FDK-2 — Given an in-house stay with a settled folio (zero
  balance) or an authorised approval recorded under FR-BIL-7, when
  staff check the guest out, then the stay is closed, the folio is
  presented as the final invoice, and the room state becomes vacant
  and dirty. Traces to: US-FDK-2; FR-FDK-2, FR-BIL-7.
- AC-FDK-3 — Given an in-house stay and a vacant, clean, inspected
  room, when staff move the guest to the new room, then the stay links
  to the new room, the old room becomes vacant and dirty, and the move
  with both room numbers and its time is kept in the stay history.
  Traces to: US-FDK-3; FR-FDK-3.
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

Scaffold slice of ADR-0003 (accepted 2026-10-25): a placeholder
Vue 3 + Vite shell served under `/app/` with no app routes beyond
the placeholder. This slice records only the shell's
done-conditions; it adds no product capability and changes no MVP
behaviour. Requirements wording is owned by `business-analyst`
(`docs/requirements/mvp-requirements.md` §7: FR-SHL-1..4,
NFR-SHL-1..3); design lives in `docs/architecture/hld.md` §11 and
`docs/architecture/lld.md` §11 (placeholder render §11.1,
shared-client 401-to-sign-out §11.2, offline banner/manual retry
§11.3); guard mapping lives in
`docs/testing/traceability-matrix.md` §3. Each condition below is
testable on a single on-premise instance running the shell
alongside the untouched legacy pages. No condition traces to an
MVP user story: the shell precedes all screen migrations, and the
MVP stories (US-RES-1 through US-CUS-3) keep their existing
done-conditions in sections 1–9, which hold unchanged because
staff work continues on the legacy pages during the parallel run.
These shell conditions are temporary scaffold needs and are
superseded per screen as follow-up issues land real routes.

- AC-SHL-1 — Given staff load the shell at `/app/` or any
  `/app/*` history-mode path (deep link or reload included), when
  the shell boots, then exactly one placeholder route renders and
  no other app route exists or is reachable. Traces to: FR-SHL-1
  (no MVP story; scaffold only, superseded as screen issues land
  real routes).
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
  lands in a follow-up issue. Traces to: FR-SHL-3 (no MVP story;
  reservation only).
- AC-SHL-4 — Given the shell is deployed, when staff load any
  legacy page at `/` or the `/docs` Swagger mirror, then each
  serves exactly its pre-slice content, and the byte-identical
  OpenAPI mirror (`contracts/openapi.yaml` vs
  `frontend/docs/openapi.yaml`) stays green. Traces to: FR-SHL-4
  (no MVP story; parallel-run preservation).
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

Slice done when: the placeholder renders at `/app/` and on deep
links with no other route reachable, the shared client clears the
`sessionStorage` token and routes to sign-in on any 401, the
`/app/print/` namespace renders nothing, every legacy page and
the `/docs` mirror serve pre-slice content with the OpenAPI
mirror green, the new CI job is green, every sampled non-asset
`/app/*` path falls back to `/app/index.html` (never
`/index.html`), and a dropped connection shows the banner with a
manual retry and queues zero writes.

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
§7: FR-SHL-1..4, NFR-SHL-1..3) and to no MVP story — the shell
adds no MVP capability, so the 43-condition MVP count above
stands unchanged and the section 1–9 done-conditions hold as
written. The shell conditions are superseded per screen as
follow-up issues land real routes (catalogue, desk, book, stay,
folio, print, admin, decommission).

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-384
