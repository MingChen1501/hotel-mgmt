# Data dictionary — small-hotel property management system

Status: active. Shared definitions of the MVP data entities and
fields, owned by `business-analyst`. This document invents no new
behaviour: each entry uses the audit one-term-per-concept decisions
from `docs/requirements/domain-consistency-audit.md` (section 6),
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

Owning FRs: FR-RES-1, FR-RES-2, FR-RES-3, FR-RES-4, FR-RES-5,
FR-RES-6, FR-RTE-5, FR-CUS-1, FR-CUS-2.

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

Owning FRs: FR-FDK-1, FR-FDK-2, FR-FDK-3, FR-FDK-4, FR-FDK-5.

## 3. Folio

The single running account per stay, collecting room charges and
charge items on one side and payments on the other, with a running
balance. Exactly one folio exists per stay; folios cannot be split
across payers in the MVP.

Key fields: stay link; charge lines (item, amount, posting time, tax
and fee amounts); payment lines (method, amount, time); running
balance; authorised open-balance approval where recorded.

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

Owning FRs: FR-RTE-1, FR-RTE-2, FR-RTE-4, FR-RES-1, FR-ADM-3,
FR-ADM-4.

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

## 14. Coverage statement

Every audit terminology concept (T-1 reservation/booking, T-2
room/room type/bed type, T-3 folio/invoice/receipt, T-4 guest, T-5
charge item/charge/extra, T-6 price basis, T-7 hotel/property)
appears above with a definition, key fields, and owning FRs. Bare
**bill** is deprecated per T-3 and appears nowhere as a term;
**extra/extras** is kept only as informal prose shorthand, never in
normative wording, per T-5. No entry introduces behaviour beyond the
owning FRs.

Counts: 13 dictionary entries covering the 7 entity terminology concepts (T-1..T-7); T-8 is a spelling convention with no entry.
