# User stories — small-hotel property management system

Status: active. Stories expressing user needs per scope slice,
owned by `product-owner`. Personas are `P1` owner, `P2`
front-desk staff, and `P3` manager (see
`docs/product/personas.md`). Capabilities repeat the MVP product
scope (`docs/product/mvp-scope.md`, active); this document adds
no FR wording — traceability points at the MVP requirements
(`docs/requirements/mvp-requirements.md`, active), whose
acceptance criteria stay the testable definition. Stories for
Later capabilities state explicitly that no matching FR exists.
No architecture content, no implementation tickets, no dates.

Conventions: each story carries an id `US-<domain>-<n>`, the
form "As \<persona\>, I want \<capability\> so that
\<outcome\>", one acceptance-level statement, a `Traces to`
line with existing FR ids, and a note where an open question
remains (PRD open questions OQ-1–OQ-7).

## 1. Reservations and booking (persona: P2 front-desk staff)

- US-RES-1 — As front-desk staff, I want to record a
  reservation with dates, room type, guest, and price basis so
  that the reservation holds a room with a confirmed quote.
  Acceptance: given sellable availability for the dates, a
  confirmed entry appears with a unique reference and shows on
  the reservation calendar. Traces to: FR-RES-1, FR-RTE-5.
- US-RES-2 — As front-desk staff, I want to change the dates,
  room type, or guest of a reservation before check-in so that
  plan changes do not force a cancel and rebook.
  Acceptance: given a reservation not yet checked in, confirmed
  changes reprice from the rate plan in force and record who
  changed what and when. Traces to: FR-RES-2. Open question:
  reason format for changes is undecided (PRD OQ-2).
- US-RES-3 — As front-desk staff, I want to cancel a
  reservation with a recorded reason so that released
  availability is traceable. Acceptance: given a reservation
  not yet checked in, cancelling with a reason sets the
  cancelled state and frees the held dates. Traces to:
  FR-RES-3. Open question: reason list shape is undecided
  (PRD OQ-2).
- US-RES-4 — As front-desk staff, I want to create a same-day
  reservation for a guest at the desk so that walk-ins can be
  checked in immediately. Acceptance: given tonight's
  availability, the booking is created ready for immediate
  check-in and appears on today's arrivals list. Traces to:
  FR-RES-4.
- US-RES-5 — As front-desk staff, I want to see reservations
  across dates and room types on one screen so that I can
  answer availability questions at a glance. Acceptance: given
  bookings across dates and types, each appears on its correct
  dates with room type and state, with detail on selection.
  Traces to: FR-RES-5.
- US-RES-6 — As front-desk staff, I want to mark an unarrived
  reservation as no-show so that the held room returns to
  sale. Acceptance: given a reservation past its arrival date
  without check-in, marking no-show releases the room and keeps
  the history. Traces to: FR-RES-6.

## 2. Front-desk check-in and check-out (persona: P2 front-desk staff)

- US-FDK-1 — As front-desk staff, I want to check arriving
  guests into a ready room so that the stay starts against the
  booked room type. Acceptance: given a due reservation and a
  vacant, clean, inspected room of the booked type, check-in
  links stay to room and the room reads occupied. Traces to:
  FR-FDK-1.
- US-FDK-2 — As front-desk staff, I want to check guests out
  and present the folio so that the stay closes cleanly and
  the room is freed. Acceptance: given an in-house stay with a
  settled folio, check-out closes the stay, presents the final
  invoice, and leaves the room vacant and dirty. Traces to:
  FR-FDK-2, FR-BIL-7.
- US-FDK-3 — As front-desk staff, I want to move a guest to
  another room mid-stay so that room problems do not force a
  new booking. Acceptance: given an in-house stay and a vacant,
  clean, inspected room, the stay relinks, both room states
  update, and the move stays in the history. Traces to:
  FR-FDK-3.
- US-FDK-4 — As front-desk staff, I want to record early
  arrivals and late departures so that off-hours stays stay
  visible. Acceptance: given actual times outside the hotel's
  standard times, the recorded times persist on the stay and on
  the daily lists. Traces to: FR-FDK-4.
- US-FDK-5 — As front-desk staff, I want daily lists of
  expected, in-house, and leaving guests so that the desk
  knows the day at a glance. Acceptance: given today's mix of
  reservations and stays, each guest appears exactly once in
  the right group with name, room or room type, and state.
  Traces to: FR-FDK-5.

## 3. Rooms and housekeeping (personas: P2 front-desk staff, P3 manager)

- US-RMS-1 — As front-desk staff, I want every room with its
  current state in one view so that I never assign a room
  blind. Acceptance: given rooms in any mix of states, each
  appears exactly once with its correct state. Traces to:
  FR-RMS-1.
- US-RMS-2 — As front-desk staff, I want to mark rooms dirty,
  clean, and inspected as work completes so that ready rooms
  become assignable. Acceptance: given a dirty room, marking
  clean then inspected advances the state with actor and time,
  and inspected vacant rooms are offered at check-in. Traces
  to: FR-RMS-2.
- US-RMS-3 — As manager, I want to take rooms out of sale with
  a reason and date range so that maintenance rooms are never
  sold. Acceptance: given a blocked range, the room shows out
  of order and refuses new reservations and check-ins on
  blocked dates. Traces to: FR-RMS-3.
- US-RMS-4 — As manager, I want to define floors, bed types,
  and features per room and room type so that assignment uses
  real room attributes. Acceptance: given saved attributes,
  they appear in the inventory and at check-in assignment.
  Traces to: FR-RMS-4.

## 4. Rates and availability (personas: P3 manager, P2 front-desk staff)

- US-RTE-1 — As manager, I want to define sellable prices per
  room type, season, and day so that quotes follow the
  commercial plan. Acceptance: given a saved nightly price for
  a room type and date, new reservations for that combination
  quote it. Traces to: FR-RTE-1.
- US-RTE-2 — As front-desk staff, I want sellable rooms by
  room type and date at a glance so that I quote only what can
  be sold. Acceptance: given rooms, reservations, and blocks,
  each room type and date shows the sellable count excluding
  occupied, blocked, and reserved rooms. Traces to: FR-RTE-2.
- US-RTE-3 — As manager, I want to apply a named discount or
  special price so that agreed deals are recorded, not
  improvised. Acceptance: given a quoted reservation, the
  applied adjustment keeps its name and the folio follows the
  adjusted price. Traces to: FR-RTE-3.
- US-RTE-4 — As manager, I want minimum-stay and
  closed-to-arrival rules so that constrained dates protect
  occupancy. Acceptance: given a restriction on a date range, a
  violating reservation attempt is refused naming the
  restriction. Traces to: FR-RTE-4.
- US-RTE-5 — As front-desk staff, I want every reservation to
  carry its quoted price basis so that later rate changes do
  not silently alter confirmed quotes. Acceptance: given the
  rate plan at booking time, the reservation keeps the plan
  and nightly breakdown until explicitly recalculated. Traces
  to: FR-RTE-5.

## 5. Guests and CRM (persona: P2 front-desk staff)

- US-GST-1 — As front-desk staff, I want one guest record with
  past and upcoming stays so that I serve with full context.
  Acceptance: given linked stays, the profile shows details
  with every past and upcoming stay. Traces to: FR-GST-1.
  Open question: deletion and retention limits undecided (PRD
  OQ-4).
- US-GST-2 — As front-desk staff, I want preferences and notes
  shown before booking confirmation so that guest wishes are
  honoured up front. Acceptance: given saved preferences or
  notes, starting a reservation surfaces them before confirm.
  Traces to: FR-GST-2.
- US-GST-3 — As front-desk staff, I want returning guests
  flagged at booking time so that I can greet and serve them
  well. Acceptance: given a guest with a completed stay, search
  flags them as returning with the past-stay count. Traces to:
  FR-GST-3.
- US-GST-4 — As front-desk staff, I want a confirmation I can
  share with the guest so that the booking is acknowledged in
  writing. Acceptance: given a confirmed reservation, the
  confirmation shows hotel, guest, dates, room type, and price
  in printable or sendable form. Traces to: FR-GST-4.

## 6. Billing and folio (personas: P2 front-desk staff, P3 manager)

- US-BIL-1 — As front-desk staff, I want one running folio per
  stay so that charges and payments stay in a single place.
  Acceptance: given a checked-in stay, exactly one folio shows
  every charge and payment with a running balance. Traces to:
  FR-BIL-1.
- US-BIL-2 — As front-desk staff, I want to post nightly room
  charges and hotel extras so that the folio reflects the
  stay. Acceptance: given an in-house stay, each posted line
  shows item, amount, and time and moves the balance. Traces
  to: FR-BIL-2.
- US-BIL-3 — As front-desk staff, I want to record cash and
  card payments so that guest payments reduce the balance.
  Acceptance: given an open folio, a recorded payment shows
  method and time and lowers the balance. Traces to:
  FR-BIL-3. Open question: further payment methods undecided
  (PRD OQ-1).
- US-BIL-4 — As front-desk staff, I want a printable invoice and
  receipt so that the guest leaves with proof. Acceptance:
  given charges and payments, the invoice matches folio lines and
  balance and each receipt matches one payment. Traces to:
  FR-BIL-4.
- US-BIL-5 — As manager, I want hotel-set tax and fee rules
  applied to charges so that every folio follows the hotel's
  rules. Acceptance: given set rules, posted charges derive
  tax and fee amounts and the balance includes them. Traces
  to: FR-BIL-5.
- US-BIL-6 — As manager, I want day-close totals of charges
  and payments so that the day balances against the folios.
  Acceptance: given a business date's activity, day-close
  produces per-method totals agreeing with that day's folios.
  Traces to: FR-BIL-6. Open question: sign-off meaning
  undecided (PRD OQ-3).
- US-BIL-7 — As front-desk staff, I want check-out refused on
  an unsettled folio without approval so that open balances
  never leave silently. Acceptance: given a non-zero balance,
  check-out is refused unless an authorised approval is
  recorded. Traces to: FR-BIL-7.

## 7. Reporting (personas: P1 owner, P3 manager, P2 front-desk staff)

- US-RPT-1 — As owner, I want occupied and available rooms over
  a chosen period so that I can answer how full we are.
  Acceptance: given bookings across a period, each date shows
  counts agreeing with system reservations and stays. Traces
  to: FR-RPT-1.
- US-RPT-2 — As owner, I want room and extra revenue totals
  over a chosen period so that I can answer what we earned.
  Acceptance: given posted charges, the totals agree with the
  period's folios. Traces to: FR-RPT-2.
- US-RPT-3 — As manager, I want a one-page daily sheet of
  arrivals, in-house guests, departures, and open balances so
  that the day is managed from one view. Acceptance: given
  today's records, all four groups appear agreeing with the
  underlying data. Traces to: FR-RPT-3.
- US-RPT-4 — As front-desk staff, I want rooms needing
  cleaning or inspection right now so that housekeeping work
  is never missed. Acceptance: given dirty and uninspected
  rooms, exactly those appear. Traces to: FR-RPT-4.

## 8. Configuration and administration (personas: P1 owner, P3 manager)

- US-ADM-1 — As owner, I want to set the hotel's identity and
  local settings so that prints and hotel-wide dates follow
  our details. Acceptance: given saved details, they appear
  on confirmations, invoices, and receipts and govern dates and
  stay policies. Traces to: FR-ADM-1.
- US-ADM-2 — As owner, I want accounts for owner, manager, and
  front-desk staff with matching access so that each role
  reaches exactly its functions. Acceptance: given a saved
  account with one of the three roles, sign-in works and
  function reach matches the role. Traces to: FR-ADM-2.
- US-ADM-3 — As owner, I want to define rooms, types, and
  capacity so that the desk sells the real property.
  Acceptance: given saved rooms, they appear in inventory,
  availability, and calendar with type and capacity. Traces
  to: FR-ADM-3.
- US-ADM-4 — As manager, I want to enter rate plans, standard
  times, and stay policies so that pricing and lists follow
  our setup. Acceptance: given saved plans, times, and
  policies, new reservations price from them and lists use the
  standard times. Traces to: FR-ADM-4.
- US-ADM-5 — As owner, I want to export data and keep
  restorable on-premise copies so that the hotel survives host
  failure. Acceptance: given a run request, a complete copy is
  written on-premise with a success-or-failure report. Traces
  to: FR-ADM-5. Open question: minimum operable backup story
  undecided (PRD OQ-5).

## 9. Per-hotel workflow customisation (personas: P1 owner, P3 manager)

- US-CUS-1 — As owner, I want to choose which guest details
  are mandatory at booking and check-in so that our desk
  collects what we require. Acceptance: given a mandatory
  field, confirming without it is refused naming the field.
  Traces to: FR-CUS-1.
- US-CUS-2 — As owner, I want our own check-in and check-out
  times and cancellation wording so that the desk enforces
  and shows our policies. Acceptance: given saved times and
  wording, booking, check-in, and cancellation use them.
  Traces to: FR-CUS-2.
- US-CUS-3 — As manager, I want to define our own charge
  items so that the folio sells what we offer. Acceptance:
  given a named charge item with a price, staff can post it to any
  folio and invoices show its name. Traces to: FR-CUS-3. Open
  question: which observed variations become standard options
  is undecided (PRD OQ-6).

## 10. Beyond MVP — stories with no matching FR

The following Later capabilities (scope sections 4–5; roadmap
Horizons 2–3) have no FR in the MVP requirements and must not be
read as requiring one. Each story states this explicitly instead
of inventing an FR. This section is a non-exhaustive sample: the
absence of a Later story for a capability implies nothing about
its priority or scope.

- US-LATER-1 — As manager, I want guests to book their own
  rooms through the hotel's website so that direct demand is
  captured without desk work. No matching FR exists (guest
  self-service online booking is Later).
- US-LATER-2 — As manager, I want inventory synced with online
  travel agencies so that OTA bookings do not double-book the
  house. No matching FR exists (channel manager and OTA
  integration is Later).
- US-LATER-3 — As front-desk staff, I want to split one stay's
  charges across payers so that shared folios are settled
  fairly. No matching FR exists (split and shared folios are
  Later).
- US-LATER-4 — As manager, I want card charging inside the
  system so that payments reconcile without separate
  terminals. No matching FR exists (integrated payment
  processing is Later).
- US-LATER-5 — As manager, I want to build my own reports
  beyond the standard set so that special questions are
  answered without help. No matching FR exists (custom report
  builder is Later).
- US-LATER-6 — As owner, I want cross-property comparisons so
  that a future hotel group sees shared oversight. No matching
  FR exists (cross-property analytics and multi-property
  operation are Later).
- US-LATER-7 — As owner, I want access setups beyond the three
  default roles so that larger teams get fitting access. No
  matching FR exists (custom roles are Later).
- US-LATER-8 — As manager, I want event-driven workflow steps
  such as automatic reminders so that routine follow-ups run
  themselves. No matching FR exists (automated workflow rules
  are Later).

## Traceability summary

43 MVP stories trace to 40 MVP capabilities and 43 FR ids;
coverage follows the requirements traceability table
(`docs/requirements/mvp-requirements.md`, section 4): every FR
from FR-RES-1 through FR-CUS-3 has at least one story above,
and no story invents an FR. 8 Later stories carry an explicit
no-matching-FR statement. This document contains no FR wording
changes: where acceptance detail is needed, the referenced FR
acceptance criteria govern.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-38
