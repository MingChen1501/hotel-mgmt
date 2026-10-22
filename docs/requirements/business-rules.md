# Business rules — small-hotel property management system

Status: active. Domain policies for the hotel-mgmt MVP gathered in
one place, owned by `business-analyst`. This document invents no new
policy: every rule traces to an existing FR/NFR, user story, PRD
statement, or sequence-diagram step, cited in the Trace column. Where
the sources leave a decision open, the rule points to an open question
in section 6 (owned by `business-analyst` for requirements wording;
product decisions owned by `product-owner` per the
domain-consistency-audit canonical list). Terminology follows
`docs/requirements/domain-consistency-audit.md` (one term per
concept): **reservation** for the stored record, **room** for the
physical sellable unit, **folio** / **invoice** / **receipt** for the
running account / final printed account / proof of one payment,
**charge item** for a hotel-defined sellable entity and **charge** for
a posted folio line, **price basis** for what a reservation was quoted
from.

Rule ids take the form `BR-<n>`. "Staff" means any signed-in
front-desk staff, manager, or owner account acting within its access
(`FR-ADM-2`, `NFR-SEC-1`).

## 1. Reservation lifecycle

| ID | Rule | Trace |
|---|---|---|
| BR-1 | A reservation exists in exactly one state at a time: confirmed, checked-in, closed, cancelled, or no-show. The order confirmed to checked-in to closed is never skipped or reordered. | FR-RES-1, FR-FDK-1, FR-FDK-2; state-machine.md; requirements §3.2 |
| BR-2 | A reservation can be modified (dates, room type, or guest) only before check-in. Every modification recalculates the quoted price from the rate plan in force and records who made the change and when. | FR-RES-2; NFR-AUD-1; US-RES-2 |
| BR-3 | A reservation can be cancelled only before check-in. Cancellation requires a reason from the hotel's own reason list; the reason is kept and the held availability is released for the cancelled dates. | FR-RES-3; FR-CUS-1 reason list (requirements §3.1); US-RES-3 |
| BR-4 | The hotel's own cancellation wording is the wording shown at booking, cancellation, and on the guest confirmation. | FR-CUS-2; FR-GST-4; PRD Journey A |
| BR-5 | A reservation whose arrival date has passed without check-in can be marked no-show. Marking no-show follows the hotel's no-show rule (whether any charge is kept and which reason list applies), releases the held room for sale, and keeps the no-show in the reservation history. | FR-RES-6; requirements §3.1; US-RES-6 |
| BR-6 | A same-day walk-in creates a reservation in the confirmed state, ready for immediate check-in, and places it on today's arrivals list. | FR-RES-4; FR-FDK-5; US-RES-4 |
| BR-7 | Whether the reservation reason is free text, a fixed list, or both is undecided. Until decided, a modification records the change and a cancellation requires a reason from the hotel's list. | OQ-2 (section 6); FR-RES-2; FR-RES-3 |

## 2. Overbooking prevention and availability

| ID | Rule | Trace |
|---|---|---|
| BR-8 | Two staff booking the last sellable room for overlapping dates cannot both succeed: exactly one booking succeeds and the other is refused with the conflict named. The sellable unit is the room; beds are attributes of rooms and room types, never separately sellable. | NFR-CON-1; US-RES-1; audit C-5 |
| BR-9 | Sellable availability for a room type and date excludes occupied rooms, out-of-order blocked rooms, and already-reserved rooms. | FR-RTE-2; FR-RMS-3; US-RTE-2 |
| BR-10 | A reservation that violates a minimum-stay or closed-to-arrival restriction on its dates is refused with the violated restriction named. | FR-RTE-4; US-RTE-4 |
| BR-11 | Two staff checking different guests into the same ready room at the same time cannot both succeed: exactly one check-in takes the room and the other is refused with the room conflict named. | NFR-CON-2; FR-FDK-1 |
| BR-12 | A room under an out-of-order or maintenance block for a date range takes no new reservation and no check-in on a blocked date. | FR-RMS-3; US-RMS-3 |

## 3. Price basis and rates

| ID | Rule | Trace |
|---|---|---|
| BR-13 | Every reservation carries the rate plan and price it was quoted from, with the nightly breakdown. A later rate change does not alter the quoted price unless staff explicitly recalculate it by modifying the reservation. | FR-RTE-5; FR-RES-1; FR-RES-2; US-RTE-5 |
| BR-14 | New reservations quote the nightly price the manager saved for that room type, season, and day. | FR-RTE-1; US-RTE-1 |
| BR-15 | A named discount or special price applied by the manager is kept by name on the reservation, and folio charges follow the adjusted price. | FR-RTE-3; US-RTE-3 |

## 4. Check-in, stay, and check-out

| ID | Rule | Trace |
|---|---|---|
| BR-16 | Check-in requires a vacant, clean, inspected room of the booked type. On check-in the reservation becomes an in-house stay linked to the room, and the room state becomes occupied. | FR-FDK-1; FR-RMS-2; US-FDK-1 |
| BR-17 | Check-out with a non-zero folio balance is refused unless an authorised approval for the open balance is recorded against the folio. Whether approval is needed and which role may approve follows the hotel's open-balance rule. | FR-BIL-7; FR-FDK-2; requirements §3.1; US-BIL-7 |
| BR-18 | On check-out the stay is closed, the folio is presented as the final invoice, and the room state becomes vacant and dirty. | FR-FDK-2; FR-BIL-4; US-FDK-2 |
| BR-19 | A guest can be moved to another vacant, clean, inspected room mid-stay. The stay links to the new room, the old room becomes vacant and dirty, and the move with both room numbers and its time is kept in the stay history. | FR-FDK-3; US-FDK-3 |
| BR-20 | Actual arrival and departure times falling outside the hotel's standard times are recorded against the stay and stay visible on the arrivals and departures lists. The hotel's own check-in and check-out times are the ones shown and enforced. | FR-FDK-4; FR-CUS-2; FR-ADM-4; US-FDK-4 |

## 5. Folio, settlement, and receipts

| ID | Rule | Trace |
|---|---|---|
| BR-21 | Each stay has exactly one running folio collecting room charges and charge items. Folios cannot be split across payers in the MVP. | FR-BIL-1; requirements §3.2; US-BIL-1 |
| BR-22 | Only hotel-defined charge items can be posted to a folio. Each posted line shows the item, amount, and posting time, and increases the balance by the line amount. | FR-BIL-2; FR-CUS-3; US-BIL-2 |
| BR-23 | Cash and card are the only payment methods. Each recorded payment shows method and time and decreases the balance by the paid amount. | FR-BIL-3; requirements §3.2; US-BIL-3 |
| BR-24 | The printed invoice matches the folio lines and balance exactly; each receipt matches one recorded payment. | FR-BIL-4; US-BIL-4 |
| BR-25 | Tax and fee amounts on folio lines derive from the hotel's tax and fee rules, and the balance includes them. | FR-BIL-5; US-BIL-5 |
| BR-26 | Day-close produces the totals of charges and of payments per method for the business date, and the totals agree with the folios posted that day. Which totals must balance and who signs them off is undecided. | FR-BIL-6; OQ-3 (section 6); US-BIL-6 |
| BR-27 | Which payment methods beyond cash and card (for example bank transfer or hotel credit) payment recording must support on day one is undecided. Until decided, payment recording covers cash and card only. | OQ-1 (section 6); FR-BIL-3 |

## 6. Rooms and housekeeping

| ID | Rule | Trace |
|---|---|---|
| BR-28 | Room states advance dirty to clean to inspected as work completes; each change records who made it and when. Only a vacant, clean, inspected room is offered for check-in assignment. | FR-RMS-2; NFR-AUD-1; US-RMS-2 |
| BR-29 | A manager-set block takes a room out of sale for a recorded reason and date range; the room shows out of order for that range. | FR-RMS-3; US-RMS-3 |
| BR-30 | Floor, bed type, capacity, and features saved per room and room type appear in the room inventory and are available when assigning rooms at check-in. | FR-RMS-4; FR-ADM-3; US-RMS-4 |

## 7. Guests

| ID | Rule | Trace |
|---|---|---|
| BR-31 | One record per guest carries details with every past and upcoming stay linked to it. Saved preferences and notes are shown before a new booking for that guest is confirmed. | FR-GST-1; FR-GST-2; US-GST-1; US-GST-2 |
| BR-32 | A guest with at least one completed stay is flagged as returning at booking time, with the count of past stays visible. | FR-GST-3; US-GST-3 |
| BR-33 | Which guest details are mandatory at booking and at check-in is set per hotel. Confirming a booking or check-in without a mandatory field is refused and the missing field is named. | FR-CUS-1; requirements §3.1; US-CUS-1 |
| BR-34 | Which guest fields, if any, the system must refuse to delete, and the legal minimum retention period if longer than the system floor, are undecided. | OQ-4 (section 6); NFR-RET-1 |

## 8. Roles, audit, and data protection

| ID | Rule | Trace |
|---|---|---|
| BR-35 | Exactly three roles exist: owner, manager, and front-desk staff. Front-desk staff operate the desk; the manager additionally controls rates, rooms, and reports; the owner additionally controls users and hotel setup. Guests have no sign-in. | FR-ADM-2; NFR-SEC-1; US-ADM-2 |
| BR-36 | Every creation, change, cancellation, state transition, charge, and payment records the acting user and timestamp, and the trail cannot be edited through normal use. Recording only: an on-screen audit log view is Later. | NFR-AUD-1; US-ADM-5 note |
| BR-37 | One installation serves exactly one hotel property: only that property's data can ever appear on any screen, report, or export. | NFR-DEP-1; FR-ADM-1 |
| BR-38 | Daily backups bound data loss to at most one operating day (RPO at most 24 hours); restore on equivalent on-premise hardware completes within half a working day (RTO at most 4 hours); every backup run reports plain success or failure with its time. | NFR-BKP-1; NFR-BKP-2; FR-ADM-5 |
| BR-39 | Closed stays, folios, payments, and their audit entries stay retrievable for at least 24 months in the live system, and records newer than the hotel's configured retention floor cannot be purged. | NFR-RET-1; FR-ADM-1 |
| BR-40 | Every timestamped record carries its UTC offset; every date shown or reported follows the hotel's local calendar day. | NFR-TZ-1; FR-ADM-1 |
| BR-41 | The desk keeps working through an internet outage: booking, check-in, check-out, charge posting, payment recording, and invoice printing all complete on the on-premise installation as when connected. | NFR-AVL-1; PRD assumptions |
| BR-42 | A wrong secret entered 5 times in a row locks the identity until the owner or manager unlocks it; a session idle 15 minutes signs out. | NFR-SEC-2 |

## 9. Per-hotel configurable vs fixed split

Per requirements section 3. Configurable items change through the
hotel's settings with immediate effect and no code changes, each
change recording who made it and when (`NFR-AUD-1`, requirements
§3.3). Fixed items no hotel may change in the MVP.

| Part | Configurable (control) | Fixed |
|---|---|---|
| Required guest fields | Which details are mandatory at booking and check-in (`BR-33`) | — |
| Standard times | The hotel's check-in and check-out times (`BR-20`) | — |
| Cancellation | Hotel reason list (`BR-3`); hotel wording (`BR-4`) | Cancel only before check-in |
| No-show | Whether any charge is kept; which reason list applies (`BR-5`) | Only past arrival date; history kept |
| Open-balance check-out | Whether approval is needed; which role may approve (`BR-17`) | Lifecycle order confirmed to checked-in to closed |
| Charge items | The hotel's own items with names and prices (`BR-22`) | Only defined items postable; one folio per stay |
| Taxes and fees | The hotel's tax and fee rules (`BR-25`) | — |
| Stay restrictions | Minimum stay and closed-to-arrival days per date range (`BR-10`) | Violating reservations refused with the restriction named |
| Discounts | Named discounts the manager may apply (`BR-15`) | Applied discounts kept by name |
| Rate plans | Sellable prices per room type, season, day (`BR-14`) | Quoted price basis unchanged unless recalculated (`BR-13`) |
| Out-of-order blocks | Reason and date range per block (`BR-29`) | Blocked dates take no reservation or check-in |
| Payment methods | — (none) | Cash and card only (`BR-23`) |
| Folio structure | — (none) | One folio per stay; no split across payers (`BR-21`) |
| Roles and access | — (none) | Three fixed roles with fixed reach (`BR-35`) |
| Automation | — (none) | No automatic status changes, reminders, or messages from lifecycle events |

## 10. Open questions (owned by `business-analyst` for requirements wording)

Canonical PRD numbering per the domain-consistency audit (section 5).
Product decisions owned by `product-owner`; `business-analyst` owns
the requirements-wording impact once decided. OQ-6 (which variations
become standard options) and OQ-7 (evidence of domain completeness)
are product-owned with no requirements wording at stake.

| ID | Question | Touched rules |
|---|---|---|
| OQ-1 | Which payment methods beyond cash and card must payment recording support on day one (e.g. bank transfer, hotel credit)? | BR-23, BR-27 |
| OQ-2 | Free text, fixed list, or both for reservation change and cancellation reasons? | BR-2, BR-3, BR-7 |
| OQ-3 | What does day-close mean for a hotel that never fully closes: which totals must balance and who signs them off? | BR-26 |
| OQ-4 | Which guest fields, if any, must the system refuse to delete, and for how long are past stays kept (including any legal minimum beyond 24 months)? | BR-34, BR-39 |
| OQ-5 | Minimum operable backup-and-restore story: who triggers a backup and how do they know it worked? | BR-38 |

## 11. Coverage statement

Every domain policy stated in `FR-CUS-*`, requirements section 3,
the PRD journeys and assumptions, and the sequence diagrams appears
exactly once above (BR-1..BR-42); policies with no decided source
appear as open questions OQ-1..OQ-5. No rule introduces behaviour
beyond the traced FRs/NFRs/stories. Later capabilities from
requirements section 6 (waitlist, split folios, integrated payments,
automated workflow rules, multi-property operation, and the rest)
carry no rule here.

Counts: 42 business rules, 5 open questions.
