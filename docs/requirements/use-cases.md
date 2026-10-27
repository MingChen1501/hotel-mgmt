# Use cases — small-hotel property management system

Status: active. Actor-goal flows through the MVP, owned by
`business-analyst`. This document adds no new behaviour: every step
maps to the FR or NFR that already requires it in
`docs/requirements/mvp-requirements.md` (cited per step), and
configurable steps name the per-hotel control from requirements
section 3.1. Entity meanings follow
`docs/requirements/data-dictionary.md`; domain policies follow
`docs/requirements/business-rules.md`; time-ordered depictions of the
same flows live in `docs/requirements/sequence-diagrams.md`
(referenced per use case as Seq-n). Terminology follows the audit one
term per concept (see the sequence-diagrams legend).

Actors: **Front-desk staff** operate the desk day to day;
**Manager** additionally controls rates, rooms, and reports;
**Owner** additionally controls users and hotel setup. Guests are not
system users.

## UC-1 — Book a direct reservation

Actor: Front-desk staff. Goal: hold a room for a guest for the
requested dates. Stories: US-RES-1, US-RTE-5, US-GST-2, US-GST-3.
Depiction: Seq-1, Seq-2.

Preconditions: rooms, room types, and rate plans exist; the guest is
identified.

Main flow:

1. Staff open the availability view for the requested date range and
   propose a room type and dates. [FR-RTE-2]
2. Staff look the guest up; for a returning guest the profile shows
   stay history with the returning flag and past-stay count, and
   saved preferences and notes are shown before confirmation.
   [FR-GST-1, FR-GST-2, FR-GST-3]
3. Staff enter dates, room type, guest, and price basis and confirm.
   Mandatory guest fields set by the hotel are enforced.
   [FR-RES-1, FR-RTE-5, FR-CUS-1]
4. The reservation is recorded with a unique reference, the quoted
   price from the rate plan in force, and the hotel's cancellation
   wording; it appears on the reservation calendar. [FR-RES-1,
   FR-RES-5, FR-CUS-2]
5. Staff produce the booking confirmation record to share with the
   guest. [FR-GST-4]

Extensions/exceptions:

- 3a. A hotel-mandatory guest field is missing: the booking is
  refused and the missing field is named; nothing is created.
  [FR-CUS-1]
- 3b. The dates violate a minimum-stay or closed-to-arrival
  restriction: the booking is refused with the restriction named.
  [FR-RTE-4]
- 3c. No sellable unit is left, or a simultaneous booking wins the
  last room first: the booking is refused with the room type and
  dates named as conflict. [NFR-CON-1]
- 4a. The manager applies a named discount or special price instead:
  the reservation shows the adjusted price with the discount name
  kept. [FR-RTE-3]

Postconditions: the reservation exists in the confirmed state on the
calendar with its price basis, or it was refused and nothing was
created.

## UC-2 — Modify a reservation

Actor: Front-desk staff. Goal: change dates, room type, or guest
before arrival. Story: US-RES-2. Depiction: Seq-3.

Preconditions: the reservation exists and has not been checked in.

Main flow:

1. Staff open the reservation before check-in. [FR-RES-2]
2. Staff change the dates, room type, or guest and confirm; mandatory
   guest fields set by the hotel are enforced. [FR-RES-2, FR-CUS-1]
3. The quoted price is recalculated from the rate plan in force, and
   the change is recorded with who made it and when. [FR-RES-2,
   FR-RTE-5, NFR-AUD-1]
4. The reservation shows the new values on the calendar. [FR-RES-2,
   FR-RES-5]

Extensions/exceptions:

- 2a. The new dates violate a stay restriction: the modification is
  refused with the restriction named; the reservation is unchanged.
  [FR-RTE-4]
- 2b. No sellable unit is left for the new values: the modification
  is refused with the conflict named; the reservation is unchanged.
  [NFR-CON-1]

Postconditions: the reservation shows the new values with the
recalculated price and change record, or it stays unchanged.

## UC-3 — Cancel a reservation

Actor: Front-desk staff. Goal: release a booking that will not be
used. Story: US-RES-3. Depiction: Seq-4.

Preconditions: the reservation exists and has not been checked in.

Main flow:

1. Staff open the reservation before check-in. [FR-RES-3]
2. Staff cancel it with a reason from the hotel's own reason list;
   the hotel's cancellation wording applies. [FR-RES-3, FR-CUS-2]
3. The reservation state becomes cancelled with the reason kept, and
   the held availability is released for the cancelled dates.
   [FR-RES-3, NFR-AUD-1]

Extensions/exceptions: none beyond the precondition — a checked-in
reservation cannot be cancelled; the stay is closed through UC-8
instead. [FR-RES-3, FR-FDK-2]

Postconditions: the reservation is cancelled with its reason kept
and the dates sellable again.

## UC-4 — Book a walk-in guest

Actor: Front-desk staff. Goal: place a guest arriving without a
reservation tonight. Story: US-RES-4. Depiction: Seq-6.

Preconditions: a guest arrives without a reservation; a room type has
availability for tonight.

Main flow:

1. Staff identify the guest at the desk; preferences and notes are
   shown before confirmation. [FR-GST-1, FR-GST-2, FR-GST-3]
2. Staff check tonight's sellable rooms for the room type.
   [FR-RTE-2]
3. Staff create the reservation with today as arrival; mandatory
   guest fields set by the hotel are enforced. [FR-RES-4, FR-CUS-1]
4. The reservation is recorded with its price basis and appears on
   today's arrivals list in the confirmed state, ready for immediate
   check-in. [FR-RES-4, FR-RTE-5, FR-FDK-5]
5. Staff produce the booking confirmation record. [FR-GST-4]

Extensions/exceptions:

- 3a. No sellable unit is left for tonight: the walk-in is refused
  with the room type and dates named as conflict. [NFR-CON-1]

Postconditions: the reservation exists in the confirmed state on
today's arrivals list, or it was refused and nothing was created.

## UC-5 — Mark a no-show

Actor: Front-desk staff. Goal: close out an unarrived booking and
release its room. Story: US-RES-6. Depiction: Seq-5.

Preconditions: the reservation's arrival date has passed without
check-in.

Main flow:

1. Staff open the unarrived reservation past its arrival date.
   [FR-RES-6]
2. Staff mark it as no-show following the hotel's no-show rule and
   reason list. [FR-RES-6]
3. The reservation state becomes no-show with history kept, and the
   held room is released for sale. [FR-RES-6, NFR-AUD-1]

Extensions/exceptions: none — marking applies only past the arrival
date. [FR-RES-6]

Postconditions: the reservation is no-show with history kept and the
room sellable again.

## UC-6 — Check in a guest

Actor: Front-desk staff. Goal: register an arrival and assign a
ready room. Story: US-FDK-1. Depiction: Seq-7.

Preconditions: the reservation is due for arrival; a vacant, clean,
inspected room of the booked type exists.

Main flow:

1. Staff open today's arrivals list. [FR-FDK-5]
2. Staff pick a vacant, clean, inspected room of the booked type,
   using the room's floor, bed type, and features. [FR-FDK-1,
   FR-RMS-2, FR-RMS-4]
3. Staff check the guest in against that room; mandatory check-in
   fields set by the hotel are enforced. [FR-FDK-1, FR-CUS-1]
4. The reservation becomes an in-house stay linked to the room, and
   the room state becomes occupied; the change records who made it
   and when. [FR-FDK-1, NFR-AUD-1]
5. An early arrival is recorded against the stay where applicable.
   [FR-FDK-4]

Extensions/exceptions:

- 2a. A simultaneous check-in takes the same room first: check-in is
  refused with the room conflict named. [NFR-CON-2]
- 3a. A hotel-mandatory check-in field is missing: check-in is
  refused and the missing field is named. [FR-CUS-1]

Postconditions: the stay is in house linked to the room and the room
is occupied, or check-in was refused and nothing was created.

## UC-7 — Move a guest mid-stay

Actor: Front-desk staff. Goal: relocate an in-house guest to another
room. Story: US-FDK-3. Depiction: Seq-8.

Preconditions: the stay is in house; a vacant, clean, inspected room
exists.

Main flow:

1. Staff pick a vacant, clean, inspected room. [FR-FDK-3]
2. Staff move the guest; the stay links to the new room and the old
   room becomes vacant and dirty. [FR-FDK-3]
3. The move with both room numbers and its time is kept in the stay
   history with actor and timestamp. [FR-FDK-3, NFR-AUD-1]

Extensions/exceptions: none beyond the precondition — the target
room must be vacant, clean, and inspected. [FR-FDK-3]

Postconditions: the stay links to the new room, the old room is
vacant and dirty, and the move is kept in the stay history.

## UC-8 — Check out a guest

Actor: Front-desk staff. Goal: settle, close the stay, and release
the room. Stories: US-FDK-2, US-BIL-7. Depiction: Seq-9, Seq-11.

Preconditions: the stay is in house; its folio has been reviewed.

Main flow:

1. Staff review the folio with its running balance. [FR-BIL-1]
2. Staff settle the folio by recording the final cash or card
   payment, or record an authorised approval for the open balance
   where the hotel's rule allows it. [FR-BIL-3, FR-BIL-7]
3. Staff check the guest out and present the folio as the final
   invoice; each receipt matches one recorded payment. [FR-FDK-2,
   FR-BIL-4]
4. The stay is closed and the room becomes vacant and dirty; a late
   departure is recorded against the stay where applicable.
   [FR-FDK-2, FR-FDK-4]

Extensions/exceptions:

- 2a. The folio has an open balance with neither payment nor
  authorised approval recorded: check-out is refused until the folio
  is settled or approved. [FR-BIL-7]
- 3a. The hotel's internet connection is down: check-out, payment
  recording, and invoice printing all complete on the on-premise
  installation exactly as when connected. [NFR-AVL-1]

Postconditions: the stay is closed with the invoice presented and
the room vacant and dirty, or check-out was refused and the stay
remains in house.

## UC-9 — Post charges and record payments

Actor: Front-desk staff. Goal: keep the stay folio current through
the stay. Stories: US-BIL-1, US-BIL-2, US-BIL-3, US-BIL-4, US-BIL-5.
Depiction: Seq-10, Seq-11.

Preconditions: the stay is in house with its single folio open.

Main flow:

1. Staff open the stay folio. [FR-BIL-1]
2. Staff post a nightly room charge or a hotel-defined charge item;
   the line shows item, amount, and posting time, with tax and fee
   amounts derived from the hotel's rules. [FR-BIL-2, FR-CUS-3,
   FR-BIL-5]
3. The running balance increases by the line amount. [FR-BIL-2]
4. Staff record a cash or card payment; the payment shows method and
   time and the balance decreases by the paid amount. [FR-BIL-3]
5. Staff produce the invoice and per-payment receipts on request.
   [FR-BIL-4]

Extensions/exceptions:

- 2a. The item is not defined by the hotel: the charge is refused;
  only defined items can be posted and the folio is unchanged.
  [FR-BIL-2, FR-CUS-3]

Postconditions: the folio shows every posted charge and payment
with a running balance; refused charges leave the folio unchanged.

## UC-10 — Run housekeeping and hand rooms back

Actors: Front-desk staff. Housekeeping updates are performed by
staff signed in under one of the three roles (`FR-ADM-2` /
`BR-35` / `NFR-SEC-1`) acting in a housekeeping capacity —
housekeeping is an operational hat, not a fourth sign-in role.
Goal: return dirty rooms to assignable state. Stories: US-RMS-1, US-RMS-2, US-RPT-4.
Depiction: Seq-12.

Preconditions: rooms exist in the inventory with live states
visible.

Main flow:

1. Check-out or a room move releases a room as vacant and dirty.
   [FR-FDK-2, FR-FDK-3]
2. Staff open the housekeeping report: rooms needing cleaning or
   inspection appear; inspected and out-of-order rooms do not.
   [FR-RPT-4]
3. Staff in the housekeeping capacity mark the room clean when work
   completes, then mark it inspected; each change records who made
   it and when.
   [FR-RMS-2, NFR-AUD-1]
4. Inspected vacant rooms are offered for check-in assignment, and
   every room appears exactly once with its current state in the
   room view. [FR-RMS-2, FR-FDK-1, FR-RMS-1]

Extensions/exceptions:

- 3a. The manager blocks the room out of order with a recorded
  reason and date range instead: it shows out of order for that
  range and takes no reservation or check-in on a blocked date.
  [FR-RMS-3]

Postconditions: cleaned rooms are inspected and offered for
check-in; rooms needing work appear in the housekeeping report.

## UC-11 — Manage rates, availability, and rooms (manager)

Actor: Manager. Goal: keep sellable prices, restrictions, and room
setup current. Stories: US-RTE-1, US-RTE-3, US-RTE-4, US-RMS-3,
US-RMS-4, US-ADM-4, US-CUS-3, US-BIL-5, US-BIL-6. Depiction: Seq-13,
Seq-14.

Preconditions: the manager is signed in.

Main flow:

1. The manager saves a nightly price per room type, season, and day;
   new reservations quote that price. [FR-RTE-1, FR-ADM-4]
2. The manager sets minimum-stay or closed-to-arrival days per date
   range; violating reservations are refused with the restriction
   named. [FR-RTE-4]
3. The manager applies a named discount or special price to a
   reservation where needed. [FR-RTE-3]
4. The manager defines floors, bed types, and features per room and
   room type for use at check-in assignment. [FR-RMS-4]
5. The manager defines the hotel's charge items and tax and fee
   rules; folio lines follow them. [FR-CUS-3, FR-BIL-5]
6. The manager runs day-close; totals of charges and of payments per
   method agree with the folios posted that day. [FR-BIL-6]

Extensions/exceptions:

- 6a. Day-close sign-off and balancing rules are undecided (OQ-3):
  day-close produces per-method totals without a sign-off step.
  [FR-BIL-6]

Postconditions: new bookings, charges, and prints follow the saved
setup immediately with no code changes. [Requirements section 3.3]

## UC-12 — Set up the hotel and oversee it (owner)

Actor: Owner. Goal: configure the property, its users, and its
policies, and oversee occupancy and revenue. Stories: US-ADM-1,
US-ADM-2, US-ADM-3, US-ADM-5, US-CUS-1, US-CUS-2, US-RPT-1, US-RPT-2,
US-RPT-3. Depiction: Seq-14.

Preconditions: the owner is signed in.

Main flow:

1. The owner sets the hotel's identity, contact details, and local
   settings; they appear on confirmations, invoices, and receipts
   and govern dates and times hotel-wide. [FR-ADM-1]
2. The owner defines rooms, types, floors, and capacity; they appear
   in inventory, availability, and the calendar. [FR-ADM-3]
3. The owner creates accounts for owner, manager, and front-desk
   staff with matching access. [FR-ADM-2]
4. The owner sets required guest fields, standard times, and
   cancellation wording; the desk enforces and shows them.
   [FR-CUS-1, FR-CUS-2]
5. The owner exports hotel data and keeps restorable on-premise
   copies, with success or failure reported. [FR-ADM-5, NFR-BKP-1,
   NFR-BKP-2]
6. The owner opens the occupancy report and revenue summary; each
   date's occupied and available counts and each revenue total agree
   with the underlying records. The manager opens the daily sheet of
   arrivals, in-house guests, departures, and open balances.
   [FR-RPT-1, FR-RPT-2, FR-RPT-3]

Extensions/exceptions:

- 3a. A user attempts a function its role is not granted: access is
  refused; guests have no sign-in. [NFR-SEC-1]
- 5a. A purge is attempted within the hotel's retention floor:
  records newer than the floor are kept and the purge refuses them.
  [NFR-RET-1]

Postconditions: the hotel operates on its own setup with users,
policies, and oversight in place; every configuration change
records who made it and when. [NFR-AUD-1]

## Coverage statement

The 12 use cases cover all 43 FRs and the 14 NFRs where they
constrain behaviour (NFR-CON-1 in UC-1/UC-2/UC-4, NFR-CON-2 in UC-6,
NFR-AVL-1 in UC-8, NFR-AUD-1 wherever a change is recorded, NFR-SEC-1/NFR-SEC-2 and
NFR-RET-1 in UC-12, NFR-DEP-1/NFR-BKP-1/NFR-BKP-2/NFR-TZ-1 in the
supporting rules). Every step maps to at least one FR id; every FR
appears in at least one use case:

| FR | Use case(s) |
|---|---|
| FR-RES-1..6 | UC-1, UC-2, UC-3, UC-4, UC-5 |
| FR-FDK-1..5 | UC-6, UC-8, UC-7, UC-6/UC-8, UC-1/UC-4/UC-6 |
| FR-RMS-1..4 | UC-10, UC-10, UC-10, UC-6/UC-11 |
| FR-RTE-1..5 | UC-11, UC-1/UC-4, UC-1/UC-11, UC-1/UC-2/UC-11, UC-1/UC-2/UC-4 |
| FR-GST-1..4 | UC-1/UC-4, UC-1/UC-4, UC-1/UC-4, UC-1/UC-4 |
| FR-BIL-1..7 | UC-8/UC-9, UC-9, UC-8/UC-9, UC-8/UC-9, UC-9/UC-11, UC-11, UC-8 |
| FR-RPT-1..4 | UC-12, UC-12, UC-12, UC-10 |
| FR-ADM-1..5 | UC-12, UC-12, UC-12/UC-11, UC-11, UC-12 |
| FR-CUS-1..3 | UC-1/UC-2/UC-4/UC-6/UC-12, UC-1/UC-3/UC-12, UC-9/UC-11 |

No use case introduces behaviour beyond the mapped FRs. Later
capabilities from requirements section 6 (waitlist, self-service,
split folios, custom roles, workflow automation, and the rest) carry
no use case here.

Counts: 12 use cases; 43/43 FRs mapped.
