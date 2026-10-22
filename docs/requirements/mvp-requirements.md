# MVP requirements — small-hotel property management system

Status: active. Requirements wording for the hotel-mgmt MVP, owned by
`business-analyst`. Every functional requirement (FR) below implements
an MVP capability from the product scope
(`docs/product/mvp-scope.md`, active); capabilities the product scope
tags Later or lists as out of scope have no FR here and are named in
section 6 instead. Non-functional requirements (NFRs) carry measurable
targets and state no schema, module boundary, technology, or stack
choice. Test-case authorship belongs to `qa-lead`; the handoff notes
in section 4 say what each guard must observe.

## Conventions

- FR ids take the form `FR-<domain>-<n>`, where the domain code is one
  of `RES` (reservations and booking), `FDK` (front-desk check-in and
  check-out), `RMS` (rooms and housekeeping), `RTE` (rates and
  availability), `GST` (guests/CRM), `BIL` (billing and folio), `RPT`
  (reporting), `ADM` (configuration and administration), `CUS`
  (per-hotel workflow customisation).
- NFR ids take the form `NFR-<area>-<n>`.
- Each FR states observable behaviour followed by Given/When/Then
  acceptance criteria that a tester can execute without guessing at
  unspecified behaviour.
- "Staff" means any signed-in front-desk staff, manager, or owner
  account acting within its access; role limits live in `FR-ADM-2`
  and `NFR-SEC-1`.

## 1. Functional requirements

### 1.1 Reservations and booking (`FR-RES-*`)

FR-RES-1 — Create direct reservation. Staff can record a reservation
with stay dates, room type, guest, and price basis.
Given a room type has sellable availability for the requested dates;
when staff enter the dates, room type, guest, and price basis and
confirm; then the reservation exists with a unique reference, the
requested dates, room type, guest link, and quoted price, and it
appears on the reservation calendar.

FR-RES-2 — Modify reservation. Staff can change the dates, room type,
or guest of an existing reservation before check-in.
Given a reservation that has not been checked in; when staff change
its dates, room type, or guest and confirm; then the reservation
reflects the new values, its quoted price is recalculated from the
rate plan in force, and the change is recorded with who made it and
when.

FR-RES-3 — Cancel reservation with reason. Staff can cancel a
reservation before check-in and must record a reason.
Given a reservation that has not been checked in; when staff cancel it
and record a cancellation reason; then the reservation state becomes
cancelled with the reason kept, and the held availability is released
for the cancelled dates.

FR-RES-4 — Walk-in booking. Staff can create a same-day reservation
for a guest at the desk.
Given a guest arrives without a reservation and a room type has
availability for tonight; when staff create the reservation with
today as arrival; then the reservation is created in the confirmed
state, ready for immediate check-in, and appears on today's arrivals list.

FR-RES-5 — Reservation calendar. Staff can see reservations across
dates and room types on one screen.
Given reservations exist across several dates and room types; when
staff open the calendar; then every reservation appears on its
correct dates with its room type and state, and selecting one shows
its reference, guest, and price.

FR-RES-6 — No-show handling. Staff can mark an unarrived reservation
as no-show and release the held room.
Given a reservation whose arrival date has passed without check-in;
when staff mark it as no-show; then the reservation state becomes
no-show, the held room is released for sale, and the no-show is kept
in the reservation history.

### 1.2 Front-desk check-in and check-out (`FR-FDK-*`)

FR-FDK-1 — Check-in. Staff can register arriving guests and assign a
ready room.
Given a reservation due for arrival and a vacant, clean, inspected
room of the booked type; when staff check the guest in against that
room; then the reservation becomes an in-house stay linked to the
room, and the room state becomes occupied.

FR-FDK-2 — Check-out. Staff can close the stay, present the folio,
and release the room.
Given an in-house stay with a settled folio (zero balance) or an
authorised approval recorded under `FR-BIL-7`; when staff check the
guest out; then the stay is closed, the folio is presented as the
final invoice, and the room state becomes vacant and dirty.

FR-FDK-3 — Room moves. Staff can move a guest to another room
mid-stay with the history kept.
Given an in-house stay and a vacant, clean, inspected room; when
staff move the guest to the new room; then the stay links to the new
room, the old room becomes vacant and dirty, and the move with both
room numbers and its time is kept in the stay history.

FR-FDK-4 — Early check-in and late check-out. Staff can record early
arrivals and late departures against the stay.
Given an in-house stay whose actual arrival or departure falls
outside the hotel's standard times; when staff record the early
arrival or late departure; then the actual times are kept on the
stay and remain visible on the arrivals and departures lists.

FR-FDK-5 — Arrivals and departures list. Staff can see daily lists of
who is expected, in house, and leaving.
Given reservations, in-house stays, and departures exist for today;
when staff open the daily lists; then expected arrivals, in-house
guests, and due departures each appear exactly once with guest name,
room or room type, and state.

### 1.3 Rooms and housekeeping (`FR-RMS-*`)

FR-RMS-1 — Room inventory with live status. Staff can see every room
with its current state.
Given rooms exist in any mix of occupied, vacant, dirty, clean,
inspected, and out-of-order states; when staff open the room view;
then every room appears exactly once with its correct current state.

FR-RMS-2 — Housekeeping status updates. Staff can mark rooms dirty,
clean, or inspected as work completes.
Given a room in a dirty state; when staff mark it clean and then
inspected; then the room state advances through each recorded change
with who made it and when, and an inspected vacant room is offered
for check-in assignment.

FR-RMS-3 — Out-of-order and maintenance blocks. The manager can take
rooms out of sale with a recorded reason and date range.
Given a room and a date range with a recorded reason; when the
manager blocks the room; then the room shows out of order for that
range, and no new reservation or check-in can take that room for a
blocked date.

FR-RMS-4 — Room setup and attributes. The manager can define floors,
bed types, and features per room and room type.
Given a new or edited room or room type; when the manager saves its
floor, bed type, capacity, and features; then the values appear in
the room inventory and are available when assigning rooms at
check-in.

### 1.4 Rates and availability (`FR-RTE-*`)

FR-RTE-1 — Rate plans per room type. The manager can define sellable
prices per room type, season, and day.
Given a room type and a date range; when the manager saves a nightly
price for that combination; then new reservations for that room type
and date quote that price.

FR-RTE-2 — Availability overview. Staff can see sellable rooms by
room type and date at a glance.
Given rooms, reservations, and out-of-order blocks exist; when staff
open the availability view for a date range; then each room type and
date shows the count of rooms still sellable, excluding occupied,
blocked, and already-reserved rooms.

FR-RTE-3 — Manual discounts and special rates. The manager can apply
a named discount or special price to a reservation.
Given a reservation with a quoted price; when the manager applies a
named discount or special price; then the reservation shows the
adjusted price with the discount name kept, and the folio charges
follow the adjusted price.

FR-RTE-4 — Stay restrictions. The manager can set minimum stay or
closed-to-arrival days per date range.
Given a minimum-stay or closed-to-arrival restriction on a date
range; when staff attempt a reservation that violates it; then the
reservation is refused with the violated restriction named.

FR-RTE-5 — Reservation price basis. Every reservation carries the
rate plan and price it was quoted from.
Given an applicable rate plan at booking time; when the reservation
is created; then it records the rate plan used and the nightly
breakdown, so a later rate change does not alter the quoted price
unless staff explicitly recalculate it under `FR-RES-2`.

### 1.5 Guests and CRM (`FR-GST-*`)

FR-GST-1 — Guest profiles with stay history. Staff can keep one
record per guest with past and upcoming stays.
Given stays linked to a guest; when staff open the guest profile;
then the profile shows the guest's details with every past and
upcoming stay linked to it.

FR-GST-2 — Guest preferences and notes. Staff can store preferences
and remarks that are visible at booking time.
Given a guest profile with saved preferences or notes; when staff
start a new reservation for that guest; then the preferences and
notes are shown before the booking is confirmed.

FR-GST-3 — Repeat-guest recognition. Staff can see that a guest has
stayed before at booking time.
Given a guest with at least one completed stay; when staff search
for the guest while booking; then the guest is flagged as returning
with the count of past stays visible.

FR-GST-4 — Booking confirmation record. Staff can produce a
confirmation the hotel can share with the guest.
Given a confirmed reservation; when staff request its confirmation;
then a confirmation showing the hotel, guest, dates, room type, and
quoted price is produced in a form the hotel can print or send as a
message.

### 1.6 Billing and folio (`FR-BIL-*`)

FR-BIL-1 — Guest folio. Each stay has one running folio collecting
room charges and charge items.
Given a checked-in stay; when staff open its folio; then a single
folio exists for the stay showing every posted charge and payment
with a running balance.

FR-BIL-2 — Room and extra charges. Staff can post nightly room
charges and charge items to the folio.
Given an in-house stay; when staff post a nightly room charge or a
hotel-defined charge item; then the folio line shows the item, amount,
and posting time, and the balance increases by the line amount.

FR-BIL-3 — Payment recording. Staff can record cash and card
payments against the folio.
Given an open folio with a balance; when staff record a cash or card
payment with its amount; then the payment appears on the folio with
method and time, and the balance decreases by the paid amount.

FR-BIL-4 — Invoice and receipt. Staff can produce a printable
invoice and payment receipt for the guest.
Given a folio with charges and payments; when staff request the
invoice or a receipt; then the printed invoice matches the folio
lines and balance exactly, and each receipt matches one recorded payment.

FR-BIL-5 — Configurable taxes and fees. Hotel-set tax and fee rules
apply to folio lines.
Given tax and fee rules set by the hotel; when a charge is posted;
then the folio shows the tax and fee amounts derived from those
rules, and the balance includes them.

FR-BIL-6 — Day-close totals. The manager can close the day with
totals of charges and payments taken.
Given a business date with posted charges and recorded payments;
when the manager runs day-close; then the system produces the totals
of charges and of payments per method for that date, and the totals
agree with the folios posted that day.

FR-BIL-7 — Settlement before check-out. Check-out requires a settled
folio or a recorded approval.
Given an in-house stay whose folio has a non-zero balance; when staff
attempt check-out; then check-out is refused unless an authorised
approval for the open balance is recorded against the folio.

### 1.7 Reporting (`FR-RPT-*`)

FR-RPT-1 — Occupancy report. The owner can see occupied and
available rooms over a chosen period.
Given bookings across a chosen period; when the owner opens the
occupancy report; then each date shows occupied and available room
counts that agree with the reservations and stays in the system.

FR-RPT-2 — Revenue summary. The owner can see room and extra revenue
totals over a chosen period.
Given posted charges across a chosen period; when the owner opens the
revenue summary; then room revenue and extra revenue totals agree
with the folios posted in that period.

FR-RPT-3 — Front-desk daily sheet. The manager can open a one-page
view of arrivals, in-house guests, departures, and open balances.
Given today's reservations, stays, and folios; when the manager
opens the daily sheet; then arrivals, in-house guests, departures,
and folios with open balances each appear with figures that agree
with the underlying records.

FR-RPT-4 — Housekeeping status report. Staff can see rooms needing
cleaning or inspection right now.
Given rooms in dirty and clean-but-uninspected states; when staff
open the housekeeping report; then every room needing cleaning or
inspection appears, and rooms already inspected or out of order do
not.

### 1.8 Configuration and administration (`FR-ADM-*`)

FR-ADM-1 — Hotel profile setup. The owner can set the hotel's
identity, contact details, and local settings.
Given valid hotel identity, contact, and local settings entered by
the owner; when saved; then the details appear on confirmations,
invoices, and receipts, and the local settings govern dates, times,
and stay policies hotel-wide.

FR-ADM-2 — User accounts and roles. The owner can create accounts for
owner, manager, and front-desk staff with matching access.
Given a new user with a name, sign-in identity, and one of the
three roles; when the owner saves the account; then the user can
sign in and can reach exactly the functions its role permits:
front-desk staff operate the desk, the manager additionally controls
rates, rooms, and reports, and the owner additionally controls users
and hotel setup.

FR-ADM-3 — Room and room-type setup. The owner can define the
property's rooms, types, and capacity.
Given rooms with numbers, room types, floors, and capacity entered
by the owner; when saved; then the rooms appear in the inventory,
availability, and calendar with the defined capacity and type.

FR-ADM-4 — Rate-plan and policy setup. The manager can enter rate
plans, check-in and check-out times, and stay policies.
Given rate plans, standard check-in and check-out times, and stay
policies entered by the manager; when saved; then new reservations
price from those rate plans and arrivals and departures lists use
those standard times.

FR-ADM-5 — Data export and backup. The owner can export hotel data
and keep restorable on-premise copies.
Given the owner's request; when an export or backup runs; then a
complete copy of the hotel's data (reservations, stays, folios, and
payments, per `NFR-BKP-1`) is written to on-premise storage
and the system reports success or failure of the run to the owner.

### 1.9 Per-hotel workflow customisation (`FR-CUS-*`)

FR-CUS-1 — Customisable required guest fields. The owner can choose
which guest details are mandatory at booking and at check-in.
Given the owner marks a guest field mandatory for booking or for
check-in; when staff confirm a booking or check-in without that
field; then the action is refused and the missing field is named.

FR-CUS-2 — Customisable stay policies. The owner can set the hotel's
check-in and check-out times and cancellation wording.
Given times and cancellation wording saved by the owner; when staff
book, check in, or cancel; then the hotel's own times and wording
are the ones shown and enforced.

FR-CUS-3 — Custom charge items. The manager can define the hotel's
own charge items.
Given a charge item with a name and price defined by the manager;
when staff post charges; then the hotel's item is available to post
to any folio and appears on invoices under its own name.

## 2. Non-functional requirements

NFR-DEP-1 — Single-property on-premise installation. One installation
serves exactly one hotel property: its rooms, reservations, guests,
and folios belong to that property alone.
Given a running installation; when any screen, report, or export is
used; then only that property's data can appear, and data from any
other property never appears. Target: 100% of sampled records in
acceptance testing belong to the installed property.

NFR-BKP-1 — Backup frequency and recovery point. The hotel loses no
more than one operating day of data after a failure the backup story
covers.
Given daily backups run as configured; when the host fails and data
is restored from the latest backup; then every reservation, stay,
folio, and payment recorded at least 24 hours before the failure is
present. Targets: recovery point objective (RPO) at most 24 hours;
a scheduled backup completes successfully at least 6 days out of 7.

NFR-BKP-2 — Restore time and verifiability. A failed installation can
be brought back on equivalent on-premise hardware within half a
working day, and the owner can tell a backup worked without
technical help.
Given a restorable copy and equivalent hardware; when restore is
performed; then the system is operable again within 4 hours
(recovery time objective, RTO), and every backup run reports plain
success or failure with its time to the owner or manager. Targets:
RTO at most 4 hours; 100% of backup runs produce a visible
success-or-failure report.

NFR-AUD-1 — Audit trail for reservation, room, and folio changes.
Every creation, change, cancellation, state transition, charge, and
payment records who did it and when, and the trail cannot be edited
through normal use.
Given any change covered above; when the change is saved; then the
record keeps the acting user and timestamp, and no desk, manager, or
owner function alters or deletes that entry. Target: 100% of sampled
changes in acceptance testing carry an unaltered actor and
timestamp. (A dedicated on-screen audit log view is a Later product
capability; this requirement covers recording only.)

NFR-CON-1 — No double-booking under simultaneous bookings. Two staff
booking the last sellable room or bed for overlapping dates cannot
both succeed.
Given one remaining sellable unit for the requested dates; when two
staff submit bookings for overlapping dates at the same time; then
exactly one booking succeeds and the other is refused with the
conflict named. Target: 0 double-bookings across repeated paired
simultaneous attempts in acceptance testing.

NFR-CON-2 — No double room assignment at check-in. Two staff
checking different guests into the same ready room at the same time
cannot both succeed.
Given one ready room; when two check-ins target it simultaneously;
then exactly one check-in takes the room and the other is refused
with the room conflict named. Target: 0 double assignments across
repeated paired simultaneous attempts.

NFR-PERF-1 — Desk response under a full small hotel. With 50 rooms,
a full book of reservations, and 5 staff signed in at once, routine
desk actions stay within fixed bounds.
Given the load above; when staff open the reservation calendar,
availability view, arrivals list, or a folio; then each screen shows
complete results within 2 seconds, and check-in, check-out, charge
posting, and payment recording each complete within 3 seconds.
Targets: 2 seconds for the named views; 3 seconds for the named
actions; measured at the desk on the hotel's own premises.

NFR-PERF-2 — Report response. The standard reports stay usable on a
full small hotel's data.
Given two years of operating data for a 50-room hotel; when the
owner or manager opens any standard report in section 1.7; then it
completes within 5 seconds. Target: 5 seconds per standard report.

NFR-SEC-1 — Role-based access. Every function is reachable only by
the roles the requirements grant it to, and guests have no sign-in.
Given each of the three roles; when a user attempts a function its
role is not granted; then access is refused. Targets: 100% of
out-of-role attempts refused in acceptance testing; 0 guest-facing
sign-ins exist.

NFR-SEC-2 — Authentication. Every user signs in with a unique
identity and a secret, and unattended sessions do not stay open.
Given sign-in and idle-session rules; when a wrong secret is entered
5 times in a row for one identity, the identity locks until the
owner or manager unlocks it; when a session idles 15 minutes, it
signs out. Targets: lockout after 5 consecutive failures; automatic
sign-out after 15 idle minutes.

NFR-RET-1 — Data retention. Closed stays, folios, payments, and
their audit entries stay retrievable for at least 24 months of
operating data in the live system, and records newer than the
hotel's configured retention floor cannot be purged.
Given the retention floor configured for the hotel (a hotel local
setting owned by `FR-ADM-1`); when a purge is attempted; then
records newer than the floor are kept and the purge
refuses them. Targets: 24 months minimum retrievable history; 0
records removed from within the floor. (The legal minimum period, if
longer, is open question OQ-2.)

NFR-TZ-1 — Date and timezone handling. Every timestamped record
carries its UTC offset, and every date shown or reported follows the
hotel's local date.
Given the hotel's configured local timezone; when a reservation,
stay event, charge, payment, or report date is recorded or shown;
then the stored record carries the UTC offset and the displayed
date matches the hotel's local calendar day, including across
daylight-saving changes where applicable. Target: 100% of sampled
records carry an offset and render on the correct local date.

NFR-I18N-1 — Internationalisation readiness. English ships first and
Vietnamese can follow without code changes to behaviour.
Given the running system; when any screen, confirmation, invoice,
receipt, or report is shown; then every user-visible string comes
from a message catalogue (no behaviour logic depends on English
wording), and dates, numbers, and currency follow the active locale
rules. Targets: 100% of user-visible strings sourced from the
catalogue; Vietnamese can be added by catalogue content alone.
(Operating in Vietnamese is not an MVP capability; this requirement
covers readiness only.)

NFR-AVL-1 — On-premise availability. The desk keeps working through
an internet outage.
Given the hotel's internet connection is down; when staff book,
check in, check out, post charges, record payments, and print invoices;
then every one of those actions completes on the on-premise
installation exactly as when connected. Target: 100% of the named
desk actions succeed with no outside connectivity.

## 3. Per-hotel workflow customisation behaviour

### 3.1 Configurable per hotel (no code changes)

| Lifecycle part | What the owner or manager can change | Behaviour |
|---|---|---|
| Required guest fields | Which guest details are mandatory at booking and at check-in (`FR-CUS-1`) | Refusal names the missing field; optional fields stay optional |
| Check-in and check-out times | The hotel's standard times (`FR-CUS-2`, `FR-ADM-4`) | Arrivals, departures, and early/late recording use the hotel's times |
| Cancellation reasons | The hotel's own list of cancellation reasons (`FR-RES-3`) | Cancelling requires picking one of the hotel's reasons |
| No-show rules | Whether a no-show keeps any charge and which reason list applies (`FR-RES-6`) | Marking no-show follows the hotel's rule and keeps the reason |
| Open-balance check-out | Whether check-out with an open balance needs an approval, and which role may approve (`FR-BIL-7`) | Unapproved open-balance check-out is refused; approvals are recorded |
| Charge items | The hotel's own charge items with names and prices (`FR-CUS-3`) | Only defined items can be posted; invoices show the hotel's names |
| Taxes and fees | The hotel's tax and fee rules (`FR-BIL-5`) | Folio lines derive tax and fee amounts from the hotel's rules |
| Stay restrictions | Minimum stay and closed-to-arrival days per date range (`FR-RTE-4`) | Violating reservations are refused with the restriction named |
| Discounts and special rates | Named discounts the manager may apply (`FR-RTE-3`) | Applied discounts are kept by name on the reservation and folio |
| Cancellation wording | The hotel's cancellation wording shown to guests (`FR-CUS-2`) | Confirmations carry the hotel's wording |

### 3.2 Fixed in the MVP (not configurable per hotel)

- The lifecycle order itself: reservation precedes check-in, check-in
  precedes an in-house stay, and check-out closes the stay; no hotel
  can skip, reorder, or rename these states.
- One folio per stay and one property per installation: folios cannot
  be split across payers and data cannot be shared across properties
  in the MVP.
- The three roles (owner, manager, front-desk staff) and what each
  may reach; custom roles beyond the defaults are Later.
- No event-driven automation: no automatic status changes, reminders,
  or messages fire from lifecycle events; automated workflow rules
  are Later.
- Cash and card are the only payment methods; further methods are an
  open product decision (OQ-1).

### 3.3 How the owner configures without code

Given the owner or manager opens the hotel's settings; when they
change any item in section 3.1 and save; then the desk immediately
works with the new setup — new bookings, check-ins, charges, and
prints follow the changed configuration with no restart, no file
editing, and no technical assistance. Each change records who made
it and when under `NFR-AUD-1`.

## 4. Traceability

Each row maps one MVP product-scope capability to its FR id(s). Test
spec ownership transfers to `qa-lead`: each handoff note states what
the future guard must observe. Later and out-of-scope items from the
product scope have no FR and are listed in section 6.

| Product-scope capability | FR id(s) | Test-spec handoff note for `qa-lead` |
|---|---|---|
| Create direct reservation | FR-RES-1, FR-RTE-5 | Guard books each room type across a season boundary and checks quoted price and reference |
| Modify and cancel reservation | FR-RES-2, FR-RES-3 | Guard changes dates/type/guest, checks repricing, then cancels and checks the reason and released availability |
| Walk-in booking | FR-RES-4 | Guard creates a same-day booking and checks arrival-state readiness and arrivals-list entry |
| Reservation calendar | FR-RES-5 | Guard seeds multi-date, multi-type bookings and checks placement and detail drill-down |
| No-show handling | FR-RES-6 | Guard marks a past-arrival booking no-show and checks state, released room, and history |
| Check-in | FR-FDK-1 | Guard checks in against a ready room and checks stay link and occupied state |
| Check-out | FR-FDK-2, FR-BIL-7 | Guard checks out a settled stay and checks closure, final invoice, and vacant-dirty state; guard attempts open-balance check-out and checks refusal unless an authorised approval is recorded |
| Room moves | FR-FDK-3 | Guard moves an in-house guest and checks both room states and kept history |
| Early check-in and late check-out | FR-FDK-4 | Guard records off-hours arrival/departure and checks kept times and list visibility |
| Arrivals and departures list | FR-FDK-5 | Guard seeds all three groups and checks exactly-once listing with names and states |
| Room inventory with live status | FR-RMS-1 | Guard sets every state and checks each room appears once with the right state |
| Housekeeping status updates | FR-RMS-2 | Guard walks dirty to inspected and checks check-in offer and change record |
| Out-of-order and maintenance blocks | FR-RMS-3 | Guard blocks a range and checks display plus refused booking and check-in on blocked dates |
| Room setup and attributes | FR-RMS-4 | Guard defines floor/bed/features and checks inventory and assignment visibility |
| Rate plans per room type | FR-RTE-1 | Guard sets seasonal/day prices and checks new quotes follow them |
| Availability overview | FR-RTE-2 | Guard seeds occupancy, blocks, and bookings and checks per-type per-date counts |
| Manual discounts and special rates | FR-RTE-3 | Guard applies a named discount and checks kept name and folio effect |
| Stay restrictions | FR-RTE-4 | Guard sets each restriction type and checks refusal names the restriction |
| Guest profiles with stay history | FR-GST-1 | Guard links past and upcoming stays and checks profile completeness |
| Guest preferences and notes | FR-GST-2 | Guard saves notes and checks they surface before booking confirmation |
| Repeat-guest recognition | FR-GST-3 | Guard books for a past guest and checks the returning flag and stay count |
| Booking confirmation record | FR-GST-4 | Guard produces a confirmation and checks hotel, guest, dates, type, and price |
| Guest folio | FR-BIL-1 | Guard opens a stay folio and checks single folio with running balance |
| Room and extra charges | FR-BIL-2 | Guard posts room and extra lines and checks lines plus balance movement |
| Payment recording | FR-BIL-3 | Guard records cash and card payments and checks method, time, and balance movement |
| Invoice and receipt | FR-BIL-4 | Guard prints the invoice and receipts and checks exact match to folio and payments |
| Configurable taxes and fees | FR-BIL-5 | Guard sets rules, posts a charge, and checks derived amounts and balance |
| Day-close totals | FR-BIL-6 | Guard posts a day of activity, closes, and checks per-method totals agree with folios |
| Occupancy report | FR-RPT-1 | Guard compares per-date counts against seeded bookings |
| Revenue summary | FR-RPT-2 | Guard compares room/extra totals against seeded folios |
| Front-desk daily sheet | FR-RPT-3 | Guard compares all four groups against underlying records |
| Housekeeping status report | FR-RPT-4 | Guard checks only rooms needing work appear |
| Hotel profile setup | FR-ADM-1 | Guard saves identity and local settings and checks prints and date behaviour |
| User accounts and roles | FR-ADM-2 | Guard creates each role and checks sign-in plus exact function reach |
| Room and room-type setup | FR-ADM-3 | Guard defines rooms and checks inventory, availability, and calendar uptake |
| Rate-plan and policy setup | FR-ADM-4 | Guard saves plans, times, and policies and checks pricing and list behaviour |
| Data export and backup | FR-ADM-5 | Guard runs export/backup and checks completeness plus success/failure report |
| Customisable required guest fields | FR-CUS-1 | Guard marks fields mandatory and checks refusal names the field |
| Customisable stay policies | FR-CUS-2 | Guard saves times and wording and checks desk enforcement and display |
| Custom charge items | FR-CUS-3 | Guard defines an item and checks posting availability and invoice naming |

Coverage: 40 MVP capabilities mapped, 0 unmapped.

## 5. Open questions (owned by `business-analyst`)

- OQ-1 — Which payment methods beyond cash and card must payment
  recording support on day one (for example bank transfer or hotel
  credit)? Until decided, `FR-BIL-3` covers cash and card only.
- OQ-2 — Which guest fields, if any, must the system refuse to delete
  for record-keeping, and what is the legal minimum retention period?
  Until decided, `NFR-RET-1` holds 24 months retrievable with a
  hotel-configured floor.
- OQ-3 — What does day-close mean for a hotel that never fully closes:
  which totals must balance and who signs them off? Until decided,
  `FR-BIL-6` produces per-method totals without a sign-off step.
- OQ-4 — Free text, fixed list, or both for reservation change and
  cancellation reasons? Until decided, `FR-RES-2` records the change
  and `FR-RES-3` requires a reason from the hotel's list.
- OQ-5 — What is the minimum backup-and-restore story the hotel can
  actually operate: who triggers a backup and how do they know it
  worked? Until decided, `FR-ADM-5` with `NFR-BKP-1`/`NFR-BKP-2` sets
  daily backups with a visible success-or-failure report as the
  product-level expectation.

## 6. Explicitly not specified here

The following product-scope Later items and out-of-scope exclusions
have no FR in this document and must not be read into one: waitlist,
guest self-service online booking, channel manager and OTA
integration, express and self-service check-in, housekeeping task
assignment, dynamic pricing and yield rules, multi-currency rates,
automated guest messaging, loyalty programme and campaigns, split and
shared folios, integrated payment processing, accounting-system
integration, custom report builder, cross-property and trend
analytics, the on-screen activity and audit log view, customisable
folio layout, custom roles beyond the defaults, automated workflow
rules, multi-property operation of any kind, and multi-language
operation (readiness only is `NFR-I18N-1`).

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-9
