# Data dictionary — small-hotel property management system

Status: active. Shared definitions of the MVP data entities and
fields, owned by `business-analyst`. This document invents no new
behaviour: each entry uses the audit one-term-per-concept decisions
from `docs/requirements/domain-consistency-audit.md` ([section 6](domain-consistency-audit.md)),
defines the concept, lists its key fields, and names the owning FRs
from `docs/requirements/mvp-requirements.md`. Behavioural rules that
constrain these entities live in
`docs/requirements/business-rules.md`; lifecycle states live in
`docs/architecture/state-machine.md`.

Conventions: **reservation** is the stored record (**booking** only
for the act of creating one); **room** is the physical sellable unit
and **room type** the priced category; **folio** is the running
account per stay, **invoice** the final printed account presented at
check-out, **receipt** the proof of one payment; **charge item** is a
hotel-defined sellable entity and **charge** a posted folio line;
**price basis** is what a reservation was quoted from; **hotel** is
the business and **property** the deployment/data-isolation context.

## 1. Reservation

A stored record of a guest's planned stay: dates, room type, guest,
and price basis, held against the hotel's availability until check-in,
cancellation, or no-show.

Key fields: unique reference; arrival and departure dates; room type;
guest link; quoted price with nightly breakdown and rate plan used
(price basis); state (confirmed, checked-in, closed, cancelled,
no-show); cancellation or no-show reason where applicable; change
history with actor and timestamp.

The unit a reservation holds is decided against the capacity the hotel
records for the room type and those dates, never against a number the
request carries: `sellableUnits` on a create or modify request is
advisory input, not a reservation field, and a reservation is refused
with `CONFLICT` naming the room type and dates once the recorded
capacity is reached (`BR-47`). A booking whose capacity source cannot
be read is refused fail-closed and no reservation is stored (`BR-48`).

Owning FRs: FR-RES-1, FR-RES-2, FR-RES-3, FR-RES-4, FR-RES-5,
FR-RES-6, FR-RTE-5, FR-CUS-1, FR-CUS-2, FR-OVB-1, FR-OVB-2.

## 2. Stay

An in-house record created at check-in from a confirmed reservation,
linking the guest to one room at a time until check-out closes it. A
stay exists only between check-in and check-out; the lifecycle order
reservation precedes check-in precedes stay precedes check-out is
fixed.

Key fields: link to the originating reservation; guest link; current
room link; actual arrival and departure times (including recorded
early arrival and late departure); room-move history with both room
numbers and times; state (in house, closed).

A stay reaches `closed` only through the settlement gate, and that
gate is decided on the folio the system holds: the stored balance and
the approval recorded against it, never a balance or approval a
request supplies (`BR-46`). A stay whose folio cannot be read stays in
house.

Owning FRs: FR-FDK-1, FR-FDK-2, FR-FDK-3, FR-FDK-4, FR-FDK-5.

## 3. Folio

The single running account per stay, collecting room charges and
charge items on one side and payments on the other, with a running
balance. Exactly one folio exists per stay; folios cannot be split
across payers in the MVP.

Key fields: stay link; charge lines (item, amount, posting time, tax
and fee amounts); payment lines (method, amount, time); running
balance; authorised open-balance approval where recorded, carrying
the approver identity, the role held, the reason where one was
given, and the recorded time.

The folio is the only authority for the two facts the check-out gate
reads: its running balance and its open-balance approval. Once
recorded, the approval is part of the folio record — the role must be
one of the hotel's fixed three and the recorded time is written by
the service, not supplied by a caller — and a close decides on those
stored values alone (`BR-46`). A `folioBalanceMinor` or
`openBalanceApproval` travelling on a check-out request is advisory
input, not a folio field: it is neither stored nor trusted.

Owning FRs: FR-BIL-1, FR-BIL-2, FR-BIL-3, FR-BIL-5, FR-BIL-7.

## 4. Invoice

The final printed account presented to the guest at check-out. The
invoice matches the folio lines and balance exactly; it is a
presentation of the folio, not a separate account.

Key fields: hotel identity; guest; stay dates; every folio charge and
payment line; total balance; hotel cancellation wording and local
settings where applicable.

Owning FRs: FR-BIL-4, FR-FDK-2, FR-ADM-1.

## 5. Receipt

The proof of one recorded payment against a folio. Each receipt
matches exactly one recorded payment.

Key fields: folio link; payment method (cash or card); amount; time;
hotel identity.

Owning FRs: FR-BIL-4, FR-BIL-3.

## 6. Charge item

A hotel-defined sellable entity (for example breakfast, laundry, or
minibar) with a name and price, set by the manager. Only defined
charge items can be posted to a folio; invoices show the hotel's own
names.

Key fields: name; price; defining manager and time.

Owning FRs: FR-CUS-3, FR-BIL-2.

## 7. Charge

A posted folio line: one nightly room charge or one posted charge
item, with tax and fee amounts derived from the hotel's rules. Each
charge increases the folio balance by its line amount.

Key fields: folio link; item (nightly room charge or charge item);
amount; posting time; derived tax and fee amounts.

Owning FRs: FR-BIL-2, FR-BIL-5.

A stay carries at most one nightly room charge line (`BR-45`): the
desk check-out posts it at the stay's frozen quoted total when the
folio carries none, one line for the whole stay rather than one line
per night, and never a second one. That amount is the price basis
total of the booking the stay was checked in against (section 11), not
a re-derived figure, and a stay quoted at zero carries no room charge.

## 8. Room

The physical sellable unit of the hotel: one numbered space a guest
occupies. The room is the only sellable unit; beds are attributes,
never separately sellable.

Key fields: room number; room type; floor; bed type; capacity;
features; current state (occupied, vacant dirty, vacant clean,
vacant inspected, out of order); state-change history with actor and
timestamp.

Owning FRs: FR-RMS-1, FR-RMS-2, FR-RMS-3, FR-RMS-4, FR-ADM-3,
FR-FDK-1, FR-FDK-3.

## 9. Room type

The priced category of rooms (for example single, double, suite)
that rate plans, availability counts, and reservations are expressed
in. Individual rooms are assigned from the booked type at check-in.

Key fields: name; capacity; bed type and features; nightly prices per
season and day (rate plan); stay restrictions (minimum stay,
closed-to-arrival days) per date range.

Availability for a room type and a date range is a derived fact from
the room inventory: the rooms of the type less the rooms blocked for
those dates (`BR-9`). That derived capacity is the overbooking
guard's ceiling, read on every booking attempt and never taken from a
request (`BR-47`, `BR-48`); a type with no such unit for the dates is
sold out, which is a conflict and not an outage.

Owning FRs: FR-RTE-1, FR-RTE-2, FR-RTE-4, FR-RES-1, FR-ADM-3,
FR-ADM-4, FR-OVB-1, FR-OVB-3.

## 10. Guest

The person staying: one record per guest carrying details with every
past and upcoming stay linked to it. Guests are not system users;
staff book on their behalf.

Key fields: identifying details (which are mandatory is set per
hotel); contact details; preferences and notes; stay history with
past-stay count; returning flag.

Owning FRs: FR-GST-1, FR-GST-2, FR-GST-3, FR-CUS-1.

## 11. Price basis

What a reservation was quoted from: the rate plan in force at booking
time with the nightly breakdown. The price basis is recorded on the
reservation so a later rate change does not alter the quoted price
unless staff explicitly recalculate it by modifying the reservation.

Key fields: rate plan reference; nightly breakdown; quoted total;
applied named discount or special price where applicable.

Owning FRs: FR-RTE-5, FR-RES-1, FR-RES-2, FR-RTE-1, FR-RTE-3.

## 12. Hotel

The business: identity, contact details, and local settings that
govern dates, times, and stay policies hotel-wide and appear on
confirmations, invoices, and receipts.

Key fields: identity (name); contact details; local settings
(timezone, standard check-in and check-out times, retention floor);
cancellation wording; cancellation and no-show reason lists; required
guest-field choices; tax and fee rules; open-balance approval rule.

Owning FRs: FR-ADM-1, FR-CUS-1, FR-CUS-2, FR-BIL-5, FR-BIL-7,
FR-GST-4.

## 13. Property

The deployment and data-isolation context: one installation serves
exactly one hotel property, and that property's rooms, reservations,
guests, and folios belong to it alone. Multi-property operation of
any kind is excluded from the MVP.

Key fields: property identity; on-premise installation reference;
complete data copy source for export and backup (reservations,
stays, folios, payments).

Owning FRs: FR-ADM-3, FR-ADM-5; NFR-DEP-1, NFR-BKP-1, NFR-BKP-2.

## 14. Business date

The hotel's operating calendar day: the single date every
daily desk list, report, and day-close run keys on. The
canonical form is `YYYY-MM-DD` (stored and transmitted;
see BR-43); the desk header renders the locale long-weekday
form derived from it (see FR-DSK-11).

Key fields: canonical date (`YYYY-MM-DD` on the hotel's
local calendar day, `NFR-TZ-1`); derived display form per
active locale (`FR-DSK-11` — VI `Thứ Tư, 28/10/2026`,
EN `Wednesday, 10/28/2026` for 2026-10-28).

Owning FRs: FR-BIL-6, FR-FDK-5, FR-RPT-3, FR-DSK-11.

## 15. Nightly price

The sellable price of one room type for one night under one rate
plan: the unit a reservation is quoted from and the record the
management screen writes. Exactly one nightly price exists per rate
plan, room type, and night date; a range is a run of these records,
never a single range record, and a night with no record has no price
(BR-44). The price is money in integer minor units, and changes to a
nightly price never alter a reservation already quoted from it
(BR-13).

Key fields: rate plan name; room type; night date (`YYYY-MM-DD`,
`NFR-TZ-1`); price in integer minor units.

Owning FRs: FR-RTE-1, FR-RTE-5, FR-MGMT-6, FR-MGMT-7, FR-MGMT-8,
FR-MGMT-9.

## 16. Coverage statement

Every audit terminology concept (T-1 reservation/booking, T-2
room/room type/bed type, T-3 folio/invoice/receipt, T-4 guest, T-5
charge item/charge/extra, T-6 price basis, T-7 hotel/property)
appears above with a definition, key fields, and owning FRs. Bare
**bill** is deprecated per T-3 and appears nowhere as a term;
**extra/extras** is kept only as informal prose shorthand, never in
normative wording, per T-5. No entry introduces behaviour beyond the
owning FRs. The Business date entry (section 14) defines a
previously undefined term referenced by `FR-BIL-6`; it adds no
behaviour beyond the owning FRs. The Nightly price entry (section 15)
defines the per-night price record the #590 management screen writes,
tracing `FR-RTE-1` and `BR-44`, and adds no behaviour beyond them. The
Charge entry (section 7) gains the once-per-stay room-charge statement
the #600 desk check-out relies on (`BR-45`, `FR-CKP-1`..`FR-CKP-5`) and
adds no entry, field, or behaviour beyond those sources. The Folio
entry (section 3) states which of its fields the #601 settlement gate
decides on, and the Stay entry (section 2) states that the close is
decided on those stored facts (`BR-46`, `FR-CKS-1`..`FR-CKS-5`); both
add no entry, field, or behaviour beyond those sources. The
Reservation entry (section 1) and the Room type entry (section 9)
state where a booking's capacity ceiling comes from — the recorded
room inventory, never the request's `sellableUnits` (`BR-47`,
`BR-48`, `FR-OVB-1`, `FR-OVB-3`) — and add no entry, field, or
behaviour beyond those sources.

Counts: 15 dictionary entries covering the 7 entity terminology concepts (T-1..T-7); T-8 is a spelling convention with no entry.

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-934
