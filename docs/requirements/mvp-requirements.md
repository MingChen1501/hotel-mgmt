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
and hotel setup. Room and room-type inventory is co-editable:
`FR-ADM-3` (owner) and `FR-RMS-4` (manager) edit the same inventory
with no primary.

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
those standard times. Standard check-in and check-out times are a
single shared setting, co-editable here and under `FR-CUS-2`, not
two separate settings.

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
are the ones shown and enforced. The standard times are the same
single shared setting as `FR-ADM-4`.

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
booking the last sellable room for overlapping dates cannot
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
owner or manager unlocks it, and a sign-in attempt against the
locked identity is refused with code `IDENTITY_LOCKED` (distinct
from `UNAUTHENTICATED` for a wrong secret or an expired session);
when a session idles 15 minutes, it signs out. Targets: lockout after 5 consecutive failures; automatic
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
longer, is open question OQ-4.)

NFR-TZ-1 — Date and timezone handling. Every timestamped record
carries its UTC offset, and every date shown or reported follows the
hotel's local date.
Given the hotel's configured local timezone; when a reservation,
stay event, charge, payment, or report date is recorded or shown;
then the stored record carries the UTC offset and the displayed
date matches the hotel's local calendar day, including across
daylight-saving changes where applicable. Target: 100% of sampled
records carry an offset and render on the correct local date.

NFR-I18N-1 — Internationalisation with Vietnamese primary.
The desk operates in Vietnamese as the primary target language
with English as the development and fallback language; both ship
from the message catalogue with no behaviour change between
locales.
Given the running system in either locale; when any screen,
confirmation, invoice, receipt, or report is shown; then every
user-visible string comes from the message catalogue (no
behaviour logic depends on either language's wording), a missing
Vietnamese string falls back to its English source, and dates,
numbers, and currency follow the active locale
rules. Targets: 100% of user-visible strings sourced from the
catalogue in both locales; the Vietnamese key set stays at
parity with the English set (every placeholder intact).

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
each guard must observe. Later and out-of-scope items from the
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

## 5. Open questions (decided by `product-owner`, impact worded by `business-analyst`)

- OQ-1 — Which payment methods beyond cash and card must payment
  recording support on day one (for example bank transfer or hotel
  credit)? Until decided, `FR-BIL-3` covers cash and card only.
- OQ-2 — Free text, fixed list, or both for reservation change and
  cancellation reasons? Until decided, `FR-RES-2` records the change
  and `FR-RES-3` requires a reason from the hotel's list.
- OQ-3 — What does day-close mean for a hotel that never fully closes:
  which totals must balance and who signs them off? Until decided,
  `FR-BIL-6` produces per-method totals without a sign-off step.
- OQ-4 — Which guest fields, if any, must the system refuse to delete
  for record-keeping, and what is the legal minimum retention period?
  Until decided, `NFR-RET-1` holds 24 months retrievable with a
  hotel-configured floor.
- OQ-5 — What is the minimum backup-and-restore story the hotel can
  actually operate: who triggers a backup and how do they know it
  worked? Until decided, `FR-ADM-5` with `NFR-BKP-1`/`NFR-BKP-2` sets
  daily backups with a visible success-or-failure report as the
  product-level expectation.

OQ-6 and OQ-7 (PRD section 10) are product-owned with no
requirements wording at stake; see `business-rules.md` [section 10](business-rules.md).

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
rules, multi-property operation of any kind, and further languages
beyond English and Vietnamese (`NFR-I18N-1` covers the two
operating locales).

## 7. Desk UI migration shell slice (Refs #291)

Scaffold slice of ADR-0003 (accepted 2026-10-25): the placeholder
Vue 3 + Vite shell served under `/app/` from which the screen
migrations started. Design
lives in `docs/architecture/hld.md` [section 11](../architecture/hld.md) and
`docs/architecture/lld.md` [section 11](../architecture/lld.md); acceptance criteria live in the
issue body (the `docs/product/acceptance-criteria.md` slice is
separate `product-owner` work under gate gap 4). This section
records only the requirements delta the T3 spec gate requires.

Supersession note (second re-review, Refs #381): the screen
migrations have since landed as real routes — catalogue (#305),
desk (#306), book (#307), stay (#308), folio (#309), print
(#310), admin (#311) — with the placeholder kept as the
unknown-path fallback, and the legacy static pages are
decommissioned with 301 redirects to the `/app/` routes (#313).
Placeholder-only items below are marked SUPERSEDED where the
landed screens replace them; the standing shell behaviours
(shared client and session store, `/app/` fallback, offline
banner, CI job, OpenAPI mirror) hold as written.

### 7.1 Explicit no-change statements

- Every MVP requirement in sections 1 and 2 is unchanged by this
  slice: all `FR-RES-*`, `FR-FDK-*`, `FR-RMS-*`, `FR-RTE-*`,
  `FR-GST-*`, `FR-BIL-*`, `FR-RPT-*`, `FR-ADM-*`, and `FR-CUS-*`
  keep their wording, and every NFR keeps its target. During the
  parallel run staff work continues on the untouched legacy pages,
  so all desk flows behave exactly as specified.
- No data-dictionary entries: the shell introduces no data
  entities or fields (`data-dictionary.md` unchanged).
- No business rules: the shell introduces no domain policy
  (`business-rules.md` unchanged).
- The section 4 traceability table and its coverage count are
  unchanged: the shell adds no MVP capability, so the 40 mapped
  capabilities stand. The shell handoff table below is separate
  and does not alter that count.

### 7.2 Shell-scoped functional requirements

Ids use the `SHL` (migration shell) namespace. These are
temporary scaffold requirements: they constrain the placeholder
shell only and are superseded per screen as follow-up issues
land real routes.

FR-SHL-1 — Placeholder route renders under `/app/`. Staff can
open the migration shell and see the placeholder view; no app
routes exist beyond it. (SUPERSEDED: real routes landed for
desk #306, book #307, stay #308, folio #309, print #310, and
admin #311 — the placeholder now serves as the unknown-path
fallback only; the single-placeholder assertion held for the
scaffold slice.)
Given staff load any `/app/*` path (including a history-mode deep
link or reload); when the shell boots; then exactly one
placeholder route renders, and no other app route exists.

FR-SHL-2 — Shared Bearer API client plus session store used by
the placeholder. The placeholder authenticates through the one
shared client and the one session store, with a single
401-to-sign-out path.
Given a signed-in session in the shell; when any API call
through the shared client receives a `401` / `UNAUTHENTICATED`
response; then the session store token is cleared and the shell
routes to sign-in. The token persists in `sessionStorage`
(survives reload, dies with the tab).

FR-SHL-3 — Print routes reserved, none implemented. Print URLs
are reserved to live under `/app/print/`, but this slice
implements no print route. (SUPERSEDED: print screens landed
under `/app/print/` per #310; the namespace reservation held
for the scaffold slice only.)
Given staff load any `/app/print/...` path; when the shell
routes it; then no print document is rendered by this slice
(reservation of the namespace only; the print route lands in a
follow-up issue).

FR-SHL-4 — Legacy pages and `/docs` mirror intact. The old
static pages and the Swagger mirror keep serving exactly as
before. (PARTLY SUPERSEDED: the mirror half stands; the
served-legacy half is superseded by #313 — legacy pages are
decommissioned and 301 redirect to the `/app/` routes.)
Given the shell is deployed; when staff load any legacy page at
`/` or the `/docs` Swagger mirror; then each serves exactly its
pre-slice content, and the byte-identical OpenAPI mirror
(`contracts/openapi.yaml` vs `frontend/docs/openapi.yaml`) stays
green.

### 7.3 Shell-scoped non-functional requirements

NFR-SHL-1 — CI build job green. The Vite + Vue 3 + Router +
Pinia + TypeScript app builds and tests in CI.
Given a commit touching the shell; when the new CI job (Node 22
+ `npm ci` + build + test, matching the existing Node matrix)
runs; then build and test both pass. Target: 100% of shell
commits green before merge.

NFR-SHL-2 — Nginx fallback correctness. Every `/app/*` path
that matches no static asset falls back inside the block to
`/app/index.html` (NOT `/index.html`).
Given any `/app/*` path with no matching static file; when
Nginx serves it; then the response is `/app/index.html` with a
200 status. Target: 100% of sampled non-asset `/app/*` paths
(deep link, reload, unknown path) return the shell entry.

NFR-SHL-3 — Offline banner with manual retry, no write
queueing. A LAN disconnect in the shell is clearly signalled and
never silently queued.
Given the shell loses connectivity; when an API call fails or
the browser fires `offline`; then a banner names the disconnect
and offers a safe manual retry, and no desk write is queued for
later replay. Target: 100% of disconnect drills show the banner
and queue 0 writes.

### 7.4 Traceability handoff for `qa-lead`

Guards for the standing shell behaviours live on disk (created
by the #291 implementation PR and extended per screen since);
the superseded placeholder-only assertions above held for the
scaffold slice. Each handoff note names the guard that covers
the standing behaviour.

| Shell item | Guard (on disk; follow-up screens extended it) | Handoff note for `qa-lead` |
|---|---|---|
| FR-SHL-1 | Placeholder render: `app/src/router.test.ts` (migration shell router suite); per-screen render suites (`DeskView.test.ts`, `BookView.test.ts`, `StayView.test.ts`, `FolioView.test.ts`, `PrintView.test.ts`, `AdminView.test.ts`) | Superseded as an assertion (real routes landed); the suites now cover the six routes with the placeholder as unknown-path fallback |
| FR-SHL-2 | Shared-client 401 test: `app/src/api/client.test.ts` (token clears, routes to sign-in); session store: `app/src/stores/session.test.ts` | Standing: 401 still clears the store token and routes to sign-in |
| FR-SHL-3 | Namespace-reservation check (scaffold slice only) | Superseded: print screens landed under `/app/print/` per #310; covered by the print screen suite |
| FR-SHL-4 | Mirror check: `script/openapi-route-check.sh` (byte-identical mirror); legacy-page assertions | Mirror half standing (check stays green); legacy half superseded by #313 (301 redirects) |
| NFR-SHL-1 | CI build job (Node 22 + `npm ci` + build + test over the shell) | Standing: the job itself is the guard; red blocks the PR |
| NFR-SHL-2 | Fallback assertion over sampled non-asset `/app/*` paths | Standing: every response is `/app/index.html` with status 200 |
| NFR-SHL-3 | Disconnect drill (offline banner, manual retry, zero queued writes) | Standing: banner hooks (`offline-banner`, `offline-text`, `offline-retry`) in `app/src/App.test.ts` |

### 7.5 Explicitly not specified here

Real screen routes (desk, book, stay, folio, print, admin),
the catalogue layer, and decommission of the old pages have no
FR or NFR in this slice and must not be read into one; each
lands with its own spec-gated follow-up issue. No backend or
contract change is specified anywhere in this slice.

## 8. Desk UI styling pass (Refs #338)

Presentation-only slice of the approved Phase 1 UI contract
(the `product-owner` contract comment on #338): the Vue desk
under `/app/` becomes MVP-usable for a non-technical stand-in
with no behaviour change. Design (tokens, PrimeVue component
mapping) lives with `architect` (HLD/LLD); acceptance criteria
live with `product-owner` (issue body plus
`docs/product/acceptance-criteria.md`, a separate
`product-owner` slice); test strategy and the run record live
with `qa-lead`. This section records only the requirements
delta the T2 spec gate requires.

### 8.1 Explicit no-change statements

- Every MVP requirement in sections 1 and 2 is unchanged by
  this slice: all `FR-RES-*`, `FR-FDK-*`, `FR-RMS-*`,
  `FR-RTE-*`, `FR-GST-*`, `FR-BIL-*`, `FR-RPT-*`, `FR-ADM-*`,
  and `FR-CUS-*` keep their wording, and every NFR keeps its
  target. The desk loop (book, check-in, charge, pay,
  check-out, print) behaves exactly as specified; only
  presentation changes.
- Refusal semantics are unchanged: `FR-RTE-4`, `FR-CUS-1`,
  and `FR-BIL-7` refusals still fire on exactly the same
  conditions — only their on-screen wording becomes
  stand-in-readable plain sentences (see `FR-DSP-3`).
- Money and dates render exactly as today: hotel locale
  settings govern (`FR-ADM-1`, `NFR-TZ-1` hold); the
  contract changes presentation, never values.
- No data-dictionary entries: the slice introduces no data
  entities or fields (`data-dictionary.md` unchanged).
- No business rules: the slice introduces no domain policy
  (`business-rules.md` unchanged).
- The section 4 traceability table and its coverage count are
  unchanged: the slice adds no MVP capability, so the mapped
  capabilities stand. The handoff table below (section 8.4) is
  separate and does not alter that count.

### 8.2 Presentation-scoped functional requirements

Ids use the `DSP` (desk presentation) namespace. These
constrain presentation only: routes, APIs, refusal
conditions, print output, and tests stay intact, and no new
screen or flow is specified here.

FR-DSP-1 — Global shell navigation. Staff always see where
they are and can reach every screen.
Given staff are signed in on any `/app/` screen; when they
look at the top shell; then the six destinations Desk,
Book, Stay, Folio, Print, and Admin appear in that order,
followed by the signed-in user name and Sign out, and the
active route is highlighted (bold label plus underline) so
the stand-in always knows the current screen. Each item
routes to its existing path (`/app/`, `/app/book`,
`/app/stay`, `/app/folio`, `/app/print`, `/app/admin`):
no route is added, removed, or renamed.

FR-DSP-2 — Single shell-owned sign-in gate. A signed-out
visitor meets exactly one sign-in form.
Given a signed-out visitor on any `/app/*` path; when the
shell renders; then only the sign-in form is shown
(per-screen sign-in copies are removed), and a failed
sign-in reads as one plain sentence naming that the sign-in
did not work and to try again. Sign-out returns to the
sign-in form and clears the session token as today
(`NFR-SEC-2` hold).

FR-DSP-3 — Plain-words state coverage on every screen.
Loading, empty, error, and refusal states read as
non-technical sentences.
Given any desk screen awaiting data, holding no rows,
hitting a failure, or refusing a business action; when the
state renders; then the screen states what is happening and
the next step in plain words: loading names the affected
region while the rest stays visible and disables
repeat-write buttons until the call returns; every empty
list names what is empty and the next step; errors never
surface technical codes; every refusal is one plain
sentence naming the cause (for example, an open-balance
check-out refusal names the balance and the payment-or-
approval next step). Refusal conditions are unchanged —
only the wording becomes stand-in readable.

FR-DSP-4 — Print output unchanged. Receipts, invoices, and
confirmations print exactly as today.
Given a folio with charges and payments; when staff print
the receipt, invoice, or confirmation; then the printed
document matches the folio lines and balance exactly
(`FR-BIL-4` holds byte-for-byte in behaviour), the existing
print stylesheet is preserved, and screen styling does not
leak into print.

### 8.3 Presentation-scoped non-functional requirements

NFR-DSP-1 — Stand-in demo readability. A non-technical
stand-in completes the desk loop on the UI alone.
Given a signed-in stand-in with no guidance beyond the
screens; when they work book, check-in, charge, pay,
check-out, then print receipt/invoice; then every step
completes guided only by what the screens say, and every
refusal met along the way reads as a plain sentence.
Target: 1/1 unassisted passes on the demo script
(`product-owner` acceptance; `qa-lead` owns the run
record).

NFR-DSP-2 — Keyboard focus visibility. Keyboard users
always see where focus is.
Given any interactive element on any `/app/` screen; when
it receives keyboard focus; then a visible focus indicator
shows (2px desk-blue outline per the contract section 1 tokens).
Target: 100% of interactive elements on the six routes
show the indicator on focus.

User-visible strings stay in the catalogue: `NFR-I18N-1`
holds — every new plain-words sentence ships in
`messages/en.json` and stays covered by
`script/catalogue-coverage-check.sh`.

### 8.4 Traceability handoff for `qa-lead`

Existing guards cover current markup; the Phase 2
implementation PR extends them where markup changes,
updates characterization tests where markup changed, and
deletes no test without replacement. New items name the
missing guard explicitly instead of citing one.

| Pres item | Guard (existing on disk; implementation PR extends) | Handoff note for `qa-lead` |
|---|---|---|
| FR-DSP-1 | Six-route shape: `app/src/router.test.ts:16` (migration shell router suite); per-screen render: `app/src/views/DeskView.test.ts:126`, `BookView.test.ts:202`, `StayView.test.ts`, `FolioView.test.ts`, `PrintView.test.ts`, `AdminView.test.ts` | Extend with shell-nav render plus active-highlight assertions on each of the six routes; keep the existing `data-testid` hooks (`*-view`, `offline-banner`) so characterization tests survive |
| FR-DSP-2 | Sign-in round trips: `app/src/views/DeskView.test.ts:134` (signed-out form), `:143` (sign-in shows dashboard), `:288` (failure surfaces without signing in), `:341` (sign-out back to form); session store: `app/src/stores/session.test.ts:8` (sessionStorage-only persistence, reload restore, sign-out clears); 401 path: `app/src/api/client.test.ts:55` (token clears, routes to sign-in) | Collapse per-screen sign-in copies into the one shell gate; move the per-view sign-in tests to the gate without deleting coverage |
| FR-DSP-3 | Empty-state wording: `app/src/views/DeskView.test.ts:247` (empty catalogue string when every list is empty); failure wording: `DeskView.test.ts:199` (unknown-guest catalogue string on GetGuest failure), `:302` (locked wording), `:320` (session-expired string on 401); offline wording: `app/src/App.test.ts:17` (banner hooks `offline-banner`, `offline-text`, `offline-retry`) | Add per-screen loading/empty/error/refusal wording assertions; refusal-condition tests stay untouched (semantics unchanged, wording only) |
| FR-DSP-4 | Exact-match backend guards for `FR-BIL-4` (unchanged) plus `app/src/views/PrintView.test.ts` (print screen incl. `print-view`, `print-signin` hooks) | Add a served-print assertion that printed output still matches the folio exactly and no screen style leaks into print; print CSS stays preserved |
| NFR-DSP-1 | Missing — Phase 2 must create the stand-in demo run record (scripted book to print pass, unassisted, plain-sentence refusals) | `qa-lead` owns the run record; 1/1 unassisted passes is the exit signal |
| NFR-DSP-2 | Missing — Phase 2 must create the focus-visibility check (e.g. keyboard-focus assertion over the six routes) | Guard tabs through every interactive element on each route and checks the visible indicator; 100% show it |

### 8.5 Explicitly not specified here

No new screens or flows; the six existing routes are the
complete set. No backend, API, contract, schema, or
error-code change. No Figma mockups and no marketing-grade
visuals. The PrimeVue component mapping (forms, tables,
dialogs, messages per pattern) is design, not
requirements: it lives with `architect` (HLD/LLD) and must
not be read as an FR here. The
`docs/product/acceptance-criteria.md` slice for this
change is separate `product-owner` work under the gate;
this section traces to the issue-body acceptance only.

## 9. Desk UI client gaps follow-up (Refs #375)

Requirements delta closing the UI client FR/NFR gaps filed while
the #338 styling implementation is in flight: responsive/mobile
viewport behaviour, touch target sizes, print multi-page rules,
and i18n layout robustness, with stand-in story and traceability
inputs. Presentation-constraining only: routes, APIs, refusal
conditions, values, and tests stay intact. Design (tokens,
breakpoints, component mapping) lives with `architect`;
acceptance criteria live with `product-owner` (issue body plus
`docs/product/acceptance-criteria.md`, a separate
`product-owner` slice); test strategy and guards live with
`qa-lead`. This section records only the requirements delta.

### 9.1 Explicit no-change statements

- Every MVP requirement in sections 1 and 2 is unchanged, and
  every item in sections 7 and 8 keeps its wording and target.
  The desk loop behaves exactly as specified; only the
  presentation guarantees below are added.
- Refusal semantics are unchanged: `FR-RTE-4`, `FR-CUS-1`, and
  `FR-BIL-7` refusals still fire on exactly the same
  conditions — the items below constrain how the screens and
  prints carrying them lay out, never when they fire.
- Money, dates, and numbers render exactly as today
  (`FR-ADM-1`, `NFR-TZ-1` hold); the catalogue stays the
  source of truth for every user-visible string (`NFR-I18N-1`
  holds).
- No data-dictionary entries: this section introduces no data
  entities or fields (`data-dictionary.md` unchanged).
- No business rules: this section introduces no domain policy
  (`business-rules.md` unchanged).
- The section 4 traceability table and its coverage count are
  unchanged: this section adds no MVP capability, so the
  mapped capabilities stand. The handoff table below (section 9.5)
  is separate and does not alter that count.

### 9.2 Presentation-scoped functional requirements

Ids continue the `DSP` (desk presentation) namespace from section 8.

FR-DSP-5 — Supported viewports and responsive reflow. Staff
can work every desk screen on a desktop display, and the
shell reflows without loss on narrower screens.
Given staff open any of the six desk routes (Desk, Book,
Stay, Folio, Print, Admin) at a viewport width of 1024 CSS
px or wider; when the screen renders; then the full shell
shows with no horizontal page scroll and every desk action
is reachable.
Given any of the six routes at a viewport width from 360 up
to 1023 CSS px; when the screen renders; then the shell
stacks to a single column, the nav wraps with no overlap,
data tables scroll horizontally inside their own region
(never the page), and every desk action stays reachable —
nothing is hidden, overlapped, or cut off. Viewports below
360 CSS px are not targeted. (Whether the full desk loop
must be phone-operable or readably reflowed only is a
`product-owner` scope call — see section 9.6 decision D1, which
must be answered before any dev implementation PR opens;
the widths above assume reflow-usable.)

FR-DSP-6 — Print multi-page rules. Long invoices, receipts,
and confirmations print readably across pages.
Given a folio document (invoice, receipt, or confirmation)
longer than one printed page; when staff print it; then
every printed page carries the table header row, no line row
splits across a page break, and the totals-and-balance block
never splits across pages: it stays on the same page as the
final lines it totals, or — when they cannot fit together —
opens a new page whole with the repeated header row above
it. Printed values still match the folio exactly (`FR-BIL-4`
and `FR-DSP-4` hold), and every printed string still comes
from the catalogue (`NFR-I18N-1` holds).

### 9.3 Presentation-scoped non-functional requirements

NFR-DSP-3 — Minimum touch target sizes for desk touch use.
Staff on a touch display hit every control first time.
Given any of the six desk routes; when staff use touch; then
every interactive element (nav items, buttons, links, form
inputs, table row actions) presents a hit target of at least
44 by 44 CSS px, and adjacent targets are separated so one
tap lands on exactly one control. Targets: 100% of
interactive elements on the six routes meet 44 by 44; 0
adjacent-target overlaps. (Size follows the 44px desk-touch
convention; it is a layout guarantee, not a behaviour
change.)

NFR-DSP-4 — i18n layout robustness. Translated and
hotel-named strings never break the desk layout.
Given catalogue strings up to 40% longer than the English
source, or containing long unbroken words, and given the
hotel's own long names (charge items, policies, reasons);
when any of the six routes or any of the three print
documents renders; then every string wraps inside its region
(long words break), no catalogue or hotel-named string is
cut off by a fixed width, an ellipsis, or a no-wrap rule,
and no region overflows horizontally. Layout never depends
on the length or wording of any single language
(`NFR-I18N-1` holds). Targets: 0 truncated catalogue or
hotel-named strings and 0 horizontal overflows on the six
routes and the three print documents under the stress
render; 100% of user-visible strings still sourced from the
catalogue.

### 9.4 Story inputs for `product-owner` (proposed `US-DSP-*` companions)

Inputs only: story wording and placement belong to
`product-owner` in `docs/product/user-stories.md`. Each
input states its `Traces to` line against the new ids. The
stories stay persona-neutral pending decision D2.

- US-DSP-1 — As a non-technical stand-in working the desk
  away from the counter PC, I want every screen to reflow
  readably on the narrower display so that I can serve
  guests without anything hidden or overlapped. Acceptance:
  given any of the six routes at 360–1023 CSS px, every desk
  action stays reachable with no overlap and no page-level
  sideways scroll. Traces to: FR-DSP-5.
- US-DSP-2 — As a non-technical stand-in using the touch
  display, I want every button and field big enough to tap
  first time so that I never mis-tap a charge or payment.
  Acceptance: given any of the six routes, every control
  meets the 44-by-44 minimum with no overlapping neighbour.
  Traces to: NFR-DSP-3.
- US-DSP-3 — As front-desk staff, I want long invoices to
  print with the header on every page and the totals kept
  whole so that the guest's paper copy is readable and
  matches the folio. Acceptance: given a multi-page invoice,
  each page carries the header row and the totals block
  prints whole beside its final lines (or whole on a fresh
  headed page). Traces to: FR-DSP-6, FR-BIL-4.
- US-DSP-4 — As a non-technical stand-in, I want screens and
  prints to stay readable when hotel wording is long so that
  our own charge names and policies never break the layout.
  Acceptance: given long hotel-named strings, nothing is cut
  off and no region scrolls sideways. Traces to: NFR-DSP-4.
- US-DSP-5 — As a non-technical stand-in with no guidance
  beyond the screens, I want to complete the whole loop
  (book, check-in, charge, pay, check-out, print) on the
  styled UI so that the demo proves the desk is operable
  without training. Acceptance: given the demo script, every
  step completes guided only by what the screens say, meeting
  any of the new guarantees along the way as plain readable
  output. Traces to: NFR-DSP-1, FR-DSP-5, NFR-DSP-3,
  FR-DSP-6, NFR-DSP-4.

### 9.5 Traceability handoff for `qa-lead`

No guard exists yet for any new item below: the dev
follow-up implementation PR must create them. Each handoff
note names the missing guard explicitly instead of citing
one. Existing baselines are named so extensions land on top.

| Item | Guard (existing baseline on disk; follow-up extends or creates) | Handoff note for `qa-lead` |
|---|---|---|
| FR-DSP-5 | Missing — viewport reflow assertions (new; e.g. served-shell or component render at 360, 768, and 1280 CSS px asserting single-column stack, in-region table scroll, no overlap, no page scroll). Baseline: viewport meta `app/index.html:5`, wrapping nav + 1100px column (`App.vue`), per-screen render suites (section 8.4) | Guard renders each of the six routes at the three widths and checks stack, scroll containment, reachability, and no overlap |
| NFR-DSP-3 | Missing — touch-target audit (new; e.g. computed-size assertion over every interactive element on the six routes). No existing guard | Guard measures every control on each route and checks 44 by 44 with 0 overlaps; 100% meet it |
| FR-DSP-6 | Missing — multi-page print CSS pins (new; e.g. header-repeat, row break-avoid, totals keep-whole assertions at print source). Baseline: `PrintView.test.ts:250,275,303,476,544` (exact match + isolation) plus unchanged `FR-BIL-4` backend guards | Guard prints a multi-page folio and checks repeated headers, unsplit rows, and the whole totals block; exact-match guards stay green |
| NFR-DSP-4 | Missing — expansion stress render (new; e.g. pseudo-locale at +40% length plus long-word catalogue render over the six routes and three print documents, asserting wrap and zero overflow). Baseline: `script/catalogue-coverage-check.sh` (string sourcing only, not layout) | Guard renders the stress catalogue and checks 0 truncated strings and 0 horizontal overflows; catalogue job stays green |
| US-DSP-1..5 | Inputs for `product-owner` (section 9.4); guards ride the four rows above plus the M7 stand-in demo record (`desk-styling-test-traceability.md` [section 4](../testing/desk-styling-test-traceability.md) — `qa-lead` extends the script so the loop meets a narrow-viewport, touch, long-print, and long-wording moment) | No story invents an FR; every story traces to an item above |

### 9.6 Explicitly not specified here (plus open scope calls)

- No new screens or flows; the six existing routes are the
  complete set. No backend, API, contract, schema, or
  error-code change. No new tokens, breakpoints, or component
  choices (design lives with `architect`).
- The UI contract section these items will need at
  implementation time (spec-gate T2 shape) is not written
  here: it belongs to the dev follow-up's spec set, owned by
  `product-owner` with `architect` input. This docs-only
  change is T0 and needs no contract to land.
- D1 (for `product-owner`, standing open scope call): is the full desk loop
  phone-operable, or is readable reflow to 360 px enough?
  `FR-DSP-5` assumes reflow-usable; the styling implementation
  shipped on that assumption, and the call stays open for a
  follow-up.
- D2 (for `product-owner`, standing open scope call): stand-in persona — new P4 in
  `personas.md`, or stand-ins run in a P2 context? Stories in
  section 9.4 stay persona-neutral pending the call.

## 10. Desk UI design rollout (Refs #419)

Requirements delta for the owner-supplied six-screen Claude desk UI
design rollout: Main desk board (#420), Book (#421), Stay
check-in/out (#422), Folio (#423), Rooms visual map (#424), and the
4-step Onboarding setup wizard (#425). The T2 UI contract for this
change lives with `product-owner` in
`docs/product/desk-ui-design-rollout.md` sections 3–4, the
done-conditions live with `product-owner` as AC-DSK-1..8 in
`docs/product/acceptance-criteria.md` section 11, flow diagrams and
the two-new-screen placement note live with `architect`, and guard
mapping lives with `qa-lead`. This section records only the
requirements delta the T2 spec gate requires.

### 10.1 Explicit no-change statements

- Every MVP requirement in sections 1 and 2 is unchanged by this
  rollout: all `FR-RES-*`, `FR-FDK-*`, `FR-RMS-*`, `FR-RTE-*`,
  `FR-GST-*`, `FR-BIL-*`, `FR-RPT-*`, `FR-ADM-*`, and `FR-CUS-*`
  keep their wording, and every NFR keeps its target. The four
  restyles (Main board restyle part of #420, Book #421, Stay
  restyle part of #422, Folio #423) are presentation-only: the
  booking, check-in/out, charge, pay, and print flows behave
  exactly as specified, except for the narrow screen-scoped
  items in section 10.2.
- Refusal semantics are unchanged: `FR-RTE-4`, `FR-CUS-1`, and
  `FR-BIL-7` refusals still fire on exactly the same
  conditions — only their on-screen wording becomes
  stand-in-readable plain sentences (the `FR-DSP-3` rule
  holds), and checkout still requires a settled folio or a
  recorded approval.
- Data-model impact: none. The rollout introduces no data
  entities or fields (`data-dictionary.md` unchanged): the
  Rooms map visualises existing room state, and the wizard
  persists through the existing hotel-configuration surface
  (`FR-ADM-1`).
- No business rules: the rollout introduces no domain policy
  (`business-rules.md` unchanged). Wizard launch gating in
  `FR-DSK-7` is a navigation rule over existing configuration,
  not a hotel-domain policy; check-in and checkout gating in
  `FR-DSK-4` restate `FR-FDK-1` and `FR-BIL-7`.
- Money, dates, and numbers render exactly as today:
  hotel locale settings govern (`FR-ADM-1`, `NFR-TZ-1` hold);
  the catalogue stays the source of truth for every
  user-visible string (`NFR-I18N-1` holds).
- The section 4 traceability table and its coverage count are
  unchanged: the rollout adds no MVP capability, so the mapped
  capabilities stand. The handoff table below (section 10.4) is
  separate and does not alter that count.
- Sections 8 and 9 stand: `FR-DSP-3` plain-words states,
  `FR-DSP-4` print preservation, and `NFR-DSP-3` 44px targets
  hold and are extended by section 10.3, not replaced.

### 10.2 Presentation-scoped functional requirements

Ids use the `DSK` (desk rollout) namespace, tracing one-to-one to
`AC-DSK-1..8`. They constrain presentation and narrowly-scoped
screen behaviour only: APIs, refusal conditions, print output,
and values stay intact, and no new screen or flow beyond the six
is specified here.

FR-DSK-1 — Shared shell across the six screens. Staff always
know which screen they are on and can switch locale anywhere.
Given staff are signed in on any of the six screens; when they
look at the shell; then the teal header shows the configured
hotel name, the nav tabs appear in canvas-manifest order (Main,
Stay, Onboarding, Rooms, Book, Folio) with the active screen
highlighted, and the locale toggle switches the whole screen
between EN and VI with no mixed-locale copy. The sign-in gate
behaves exactly as today (`FR-DSP-2` holds). Within this
rollout's scope, the tab set and order above supersede the
`FR-DSP-1` six-destination list, which named a different screen
set; print and admin destinations stay reachable as today.

FR-DSK-2 — Main desk board per the design. Staff see the whole
desk state on one board and act on housekeeping without leaving
it.
Given today has arrivals, in-house stays, rooms needing
cleaning, and an out-of-service room; when staff open the Main
board; then arrivals-today, in-house, departures (or its
explicit empty state), need-cleaning with the two housekeeping
action buttons, and out-of-service with reason and date each
render per the design grouping; when staff use the two
housekeeping buttons; then the room state advances through the
existing dirty-to-clean-to-inspected transitions (`FR-RMS-2`
holds) with who did it and when recorded (`NFR-AUD-1` holds),
and the board counts refresh to match. No backend or transition
change: the buttons drive the existing state machine only.

FR-DSK-3 — Book screen two-column layout. Staff book exactly as
today in the new layout.
Given a guest and sellable dates; when staff work the Book
screen; then guest search, guest registration, get-quote, and
confirm-booking complete exactly as specified (`FR-RES-1`,
`FR-GST-3` hold) in the new two-column layout (guest card above
quote card on the left; dates/room/discount card on the right).

FR-DSK-4 — Stay explicit empty room placeholder with hint.
Staff never check a guest into an unchosen room.
Given a booking with no room selection bound; when staff open
Stay check-in; then the room select shows the explicit empty
placeholder with the pick-a-ready-room hint, and check-in stays
blocked with the plain-words next step until a ready room of
the booked type is chosen; given exactly one ready candidate,
the existing single-room auto-select (Refs #411) binds it and
the placeholder does not show, since a selection is bound.
Checkout still requires a settled folio or a recorded approval
(`FR-FDK-2`, `FR-BIL-7` hold).

FR-DSK-5 — Folio screen charges/payments layout. Staff settle
folios exactly as today in the new layout.
Given an in-house stay with charges and payments; when staff
work the Folio screen; then posting a charge and recording a
payment update the running balance exactly as specified
(`FR-BIL-1`, `FR-BIL-2`, `FR-BIL-3` hold) in the new
charges/payments two-card layout with locale-correct amount
formatting.

FR-DSK-6 — Rooms visual map over existing room state. Staff see
every room at a glance with counts they can trust.
Given rooms across floors in a mix of the five statuses; when
staff open the Rooms map; then the floor-grouped map shows the
summary counts and the rendered room cards with the counts
always matching the cards; each card shows its status chip
(the one chip vocabulary shared with the Main board), room
type, and the live note (occupant plus checkout date,
out-of-service reason plus date, or upcoming arrival). The map
is read-only over existing room state (`FR-RMS-1`, `FR-RMS-2`,
`FR-RMS-3` hold); per-card actions are not specified here —
action placement needs a `product-owner` decision before
building, and no actions are invented.

FR-DSK-7 — Onboarding wizard gated to first run. First-run
setup completes through the wizard; a seeded desk never sees
it.
Given an empty database; when the app loads; then the
Onboarding wizard launches and walks staff through setup with
progress and back/continue navigation; step 1 persists the
hotel name through the existing hotel-configuration surface
(`FR-ADM-1` holds), which then appears in the shell header and
on printed documents; given a seeded database; then the wizard
never launches. Wizard steps 2–4 need a `product-owner` spec
(and owner decision where the design is silent) before
building beyond step 1; step 1 does not ship on assumed
later-step content.

### 10.3 Presentation-scoped non-functional requirements

NFR-DSK-1 — VI-primary catalogue coverage across all six
screens. The pilot desk reads fully in Vietnamese with English
parity and no hardcoded copy.
Given any of the six screens in either locale; when staff read
the screen; then every user-visible string resolves through
the catalogue (`NFR-I18N-1` holds): new or changed copy ships
in both `messages/en.json` and `messages/vi.json` with
placeholders intact, `script/catalogue-coverage-check.sh` is
green on every screen PR, and the hotel name shown is the
configured value — never the design's example content
hardcoded. Targets: 100% of user-visible strings sourced from
the catalogue in both locales; coverage check green on every
screen PR; 0 hardcoded hotel-name occurrences. New keys land
through the normal catalogue process: `desk.rooms.*` (map
summary chips and card notes), `desk.onboarding.*` (wizard
steps, placeholders, helper text),
`stay.checkin.room_placeholder` plus hint, and `desk.empty.*`
per-list empty states where the design needs one with no key
yet.

NFR-DSK-2 — Print isolation preserved. Screen styling never
leaks into print.
Given a folio with charges and payments; when staff print the
receipt, invoice, or confirmation from any of the six screens;
then the printed document matches the folio lines and balance
exactly (`FR-BIL-4` and `FR-DSP-4` hold byte-for-byte in
behaviour), the existing print stylesheet is preserved, and
the configured hotel name appears on every printed document.
Target: 0 print-output differences attributable to the
rollout; printed values still match the folio exactly.

NFR-DSK-3 — 44px minimum targets on all six screens. Touch and
keyboard users hit every control first time, including on the
two new screens.
Given any of the six screens; when staff use touch or
keyboard; then every interactive element (nav items, buttons,
links, form inputs, per-card actions, wizard navigation)
presents a hit target of at least 44 by 44 CSS px, and
adjacent targets are separated so one tap lands on exactly one
control (`NFR-DSP-3` holds, extended from the restyle routes
to the full rollout set including the Rooms map and the
wizard). Targets: 100% of interactive elements on the six
screens meet 44 by 44; 0 adjacent-target overlaps.

### 10.4 Traceability handoff for `qa-lead`

No new MVP capability is added, so each row traces to its
`AC-DSK-n` condition and its underlying MVP FRs. Existing
guards are named `file:line`; where no guard exists, the row
names the missing guard explicitly and the screen
implementation PR must create it.

| Item | Guard (existing on disk; follow-up extends or creates) | Handoff note for `qa-lead` |
|---|---|---|
| FR-DSK-1 | Baseline: shell suites `app/src/App.test.ts` (banner hooks) and `app/src/router.test.ts` (migration shell router suite); per-screen render suites (`DeskView.test.ts`, `BookView.test.ts`, `StayView.test.ts`, `FolioView.test.ts`) | Extend with six-screen shell render: configured hotel name in teal header, canvas-manifest tab order with active highlight, whole-screen EN/VI toggle with no mixed-locale copy |
| FR-DSK-2 | Baseline lanes: `app/src/views/DeskView.vue:140` (dirty list with clean buttons), `:161` (uninspected list with inspect buttons), `:189` (out-of-service list with reason plus date), `:208` (board lanes); suite `app/src/views/DeskView.test.ts`. Buttons: present on the need-cleaning card — clean advances dirty-to-clean, inspect advances clean-to-inspected via `UpdateRoomState` | Guard renders the five design cards (incl. departures empty state and out-of-service reason plus date), drives both housekeeping buttons, and checks state advance plus refreshed board counts |
| FR-DSK-3 | Characterization suite `app/src/views/BookView.test.ts` (quote-before-book flow, refusals code-switched) | Extend with two-column layout assertions only; flow and refusal tests stay untouched (semantics unchanged) |
| FR-DSK-4 | Placeholder: `app/src/views/StayView.vue:177` (explicit empty option) with hint text; guards `app/src/views/StayView.test.ts:296` (placeholder-first options incl. empty value), `:349` (need_room guard, no AssignRoom call), `:381` (single-candidate auto-select, Refs #411) | Extend with hint-wording assertion; refusal-condition and auto-select tests stay untouched (only wording is new) |
| FR-DSK-5 | Characterization suite `app/src/views/FolioView.test.ts` (folio open, postings, payments, plain-words refusals) | Extend with two-card layout plus locale-amount assertions; posting and balance tests stay untouched |
| FR-DSK-6 | Missing — no Rooms map view or route exists (`app/src/router.ts` has no map route; the design is the only source) | Guard renders seeded floors/statuses and checks the summary-counts-match-cards invariant plus per-card chip, type, and live note; refusal/transition tests ride the existing room-state guards |
| FR-DSK-7 | Missing — no wizard view or route exists (empty-database path has no screen) | Guard checks wizard launch on empty database, step-1 hotel-name persistence surfacing in header and prints, and no launch on a seeded database; steps 2–4 ride the future product-owner spec |
| NFR-DSK-1 | `script/catalogue-coverage-check.sh` plus `messages/en.json` and `messages/vi.json` (both exist) | Coverage job stays green on every screen PR; new `desk.rooms.*`, `desk.onboarding.*`, `stay.checkin.*`, `desk.empty.*` keys land through the normal catalogue process |
| NFR-DSK-2 | `app/src/views/PrintView.test.ts` (print screen incl. exact-match and isolation pins) plus unchanged `FR-BIL-4` backend guards | Add a served-print assertion that no rollout styling leaks into print and the configured hotel name appears on every printed document |
| NFR-DSK-3 | Missing automated audit (section 9.5 names the same gap for the restyle routes; no touch-target guard exists) | Guard measures every interactive element on all six screens incl. the map and wizard and checks 44 by 44 with 0 overlaps |

### 10.5 Explicitly not specified here

- The T2 UI contract section (token set, shell, component
  mapping, plain-word states, print rules) is not written here:
  it lives with `product-owner` in
  `docs/product/desk-ui-design-rollout.md` sections 3–4, which
  satisfies the T2 UI-contract minimum, so requirements here do
  not reword absent UI expectations.
- No new screens or flows beyond the six; print, admin, and
  gate/sign-in screens are out of this design batch and keep
  their current presentation.
- No backend, API, contract, schema, or error-code change. No
  new design tokens, breakpoints, or component choices (design
  lives with `architect`).
- The `docs/product/acceptance-criteria.md` slice (`AC-DSK-1`
  through `AC-DSK-8`) is separate `product-owner` work under
  the gate; the test strategy and run records are separate
  `qa-lead` work. This section traces to the issue-body
  acceptance only through the `AC-DSK-n` ids above.
- Open owner calls carried from the rollout spec (recorded on
  the affected sub-issue with the owner decision per its
  section 6, never assumed): Rooms-map action placement
  (#424) and wizard steps 2–4 content (#425).

## 11. Onboarding wizard steps 2–4 (Refs #438)

Requirements delta for the deferred wizard steps: step 2 (hotel
config details), step 3 (rooms/room-types seed), and step 4 (first
owner account), built on the wizard shell and step 1 shipped in
PR #437. Scope and done-conditions live with `product-owner`
(`docs/product/desk-ui-design-rollout.md` [section 10](../product/desk-ui-design-rollout.md),
`AC-DSK-9` through `AC-DSK-11`); the four-step flow with per-step
validation, back edges, and failure/rollback edges lives with
`architect` (J0 in `docs/product/ux-flows-wireframes.md`); guard
mapping lives with `qa-lead` (handoff table in section 11.4
below). This section records only the requirements delta the T2
spec gate requires: the exact wizard fields plus validation per
step (section 11.2), and the NFR delta (section 11.3: none —
existing NFRs hold, stated explicitly).

### 11.1 Explicit no-change statements

- Every MVP requirement in sections 1 and 2 is unchanged by
  this change: `FR-ADM-1`, `FR-ADM-2`, `FR-ADM-3`,
  `FR-RMS-4`, `FR-CUS-1`, `FR-CUS-2`, and every NFR keep
  their wording and targets. Steps 2–4 add no MVP
  capability: each step is first-run entry of an existing
  admin capability through its existing persistence path,
  and the referenced FR acceptance criteria govern field
  meaning and persistence.
- No new FR ids are added in the `ADM`, `RMS`, or `CUS`
  namespaces. The wizard-scoped `FR-DSK-8` through
  `FR-DSK-10` below (continuing the section 10 namespace)
  constrain first-run entry only and must not be read as
  new capabilities.
- The section 4 traceability table and its coverage count
  are unchanged: the 40 mapped capabilities stand. The
  handoff table below (section 11.4) is separate and does
  not alter that count.
- No data-dictionary entries: this section introduces no
  data entities or fields. Every wizard field is covered
  by an existing entry — hotel identity, contact details,
  and local settings by section 12 (Hotel, owning FRs
  `FR-ADM-1`, `FR-CUS-1`, `FR-CUS-2`); room numbers, room
  types, floors, and capacity by the room/room-type entries
  (owning FRs `FR-ADM-3`, `FR-RMS-4`); the owner account by
  the user entry (owning FR `FR-ADM-2`)
  (`data-dictionary.md` unchanged).
- No business rules: this section introduces no domain
  policy (`business-rules.md` unchanged). Wizard launch
  gating stays a navigation rule over existing
  configuration (section 10.1), and validation failures
  below refuse entry, never business outcomes.
- Sections 7, 8, 9, and 10 stand with their wording and
  targets unchanged.

### 11.2 Wizard-scoped functional requirements

Ids continue the `DSK` (desk rollout) namespace from section
10. Each item states the exact wizard fields, the validation
that keeps staff on the failing step, and the existing
persistence path with its server-enforced rules named so no
validation is invented: blank-vs-valid and uniqueness rules
below restate what `UpdateHotelConfig`, `UpsertRoomType` /
`UpsertRoom`, and `CreateUser` already enforce (guards in
section 11.4).

FR-DSK-8 — Wizard step 2: remaining hotel profile. Staff
complete the `FR-ADM-1` profile started in step 1 (hotel
name already saved) through the existing
hotel-configuration path.
Given the wizard at step 2; when staff enter contact
details (address, phone, email — each optional, stored
verbatim when entered and left unset when blank), the
local timezone (required: blank is refused naming the
timezone field), and the retention floor in days
(optional: blank keeps the 365-day default; a entered
value must be an integer of 0 or more, else refused
naming the retention-floor field), then continue
persists the values through `UpdateHotelConfig` with
actor and timestamp recorded (`NFR-AUD-1` holds). The
saved details appear on confirmations, invoices, and
receipts, and the local settings govern dates, times,
and stay policies hotel-wide (`FR-ADM-1` holds).
Back returns to step 1 with entered values kept; a
validation failure keeps staff on step 2, names the
missing or invalid field in plain words, and persists
nothing for the step. Standard check-in/out times,
rate plans, cancellation wording and reason lists, and
charge and tax rules are not wizard fields: the manager
enters them in Admin after the wizard as today
(`FR-ADM-4`, `FR-CUS-1`, `FR-CUS-2`, `FR-BIL-5` hold).

FR-DSK-9 — Wizard step 3: rooms and room-types seed.
Staff define the `FR-ADM-3` property inventory through
the existing seed path.
Given the wizard at step 3; when staff enter room types
(name required: blank is refused naming the room-type
name; capacity and bed type per `FR-RMS-4`) and rooms
(number required: blank is refused naming the room
number; each number unique within the hotel — a
duplicate is refused naming the number; each room
linked to a room type saved in this step; floor
optional), then continue persists them through
`UpsertRoomType` / `UpsertRoom` with actor and
timestamp recorded (`NFR-AUD-1` holds). The saved
rooms appear in the inventory, availability, and
calendar with the defined capacity and type
(`FR-ADM-3` holds). Back returns to step 2 with
entered values kept; a validation failure keeps staff
on step 3, names the missing, duplicate, or unlinked
field in plain words, and persists nothing for the
step.

FR-DSK-10 — Wizard step 4: first owner account. Staff
create the `FR-ADM-2` owner sign-in through the
existing admin user path, completing setup with a
working owner sign-in.
Given the wizard at step 4; when staff enter the
display name (required: blank is refused naming the
name field), the sign-in identity (required: blank is
refused naming the identity field; an identity already
in use is refused naming the identity), and a secret
(required: empty is refused naming the secret field;
`NFR-SEC-2` holds), with the role fixed to owner,
then finishing persists the account through
`CreateUser` with the creator recorded, and the wizard
completes to the desk — the owner signs in and reaches
exactly the owner-permitted functions. Manager and
front-desk accounts are created in Admin afterwards
(`FR-ADM-2` holds). Back returns to step 3 with
entered values kept; a validation failure keeps staff
on step 4, names the missing or taken field in plain
words, and persists nothing. The wizard never shows
again on the now-seeded database (`FR-DSK-7` holds).

### 11.3 Non-functional requirements delta: no-change statement

No new NFR is added by this change. The existing NFRs
cover steps 2–4 as stated:

- Catalogue coverage (`NFR-DSK-1`, `NFR-I18N-1` hold):
  every new step-2–4 string ships in
  `desk.onboarding.*` in both `messages/en.json` and
  `messages/vi.json` with placeholders intact, and
  `script/catalogue-coverage-check.sh` stays green; the
  configured values shown are never hardcoded example
  content.
- Role enforcement (`NFR-SEC-1` holds): setup stays
  owner-or-manager pathing with server-side enforcement
  unchanged — a front-desk `UpdateHotelConfig` or
  `CreateUser` attempt is refused `FORBIDDEN`, and the
  wizard surfaces the existing owner/manager sentence.
- Authentication (`NFR-SEC-2` holds): the step-4 secret
  is required and stored hashed; lockout and idle
  sign-out behave exactly as specified.
- Audit (`NFR-AUD-1` holds): every step persist records
  the acting user and timestamp.
- Timezone rendering (`NFR-TZ-1` holds): the step-2
  timezone governs the hotel's local date exactly as
  specified.
- Touch targets (`NFR-DSK-3` holds, extended to the
  wizard): every step-2–4 control meets 44 by 44 CSS
  px with 0 adjacent-target overlaps.

### 11.4 Traceability handoff for `qa-lead`

No new MVP capability is added, so each row traces to
its `AC-DSK-n` condition and its underlying MVP FRs.
Existing guards are named `file:line`; where no guard
exists, the row names the missing guard explicitly and
the steps 2–4 implementation PR must create it.

| Item | Guard (existing on disk; follow-up extends or creates) | Handoff note for `qa-lead` |
|---|---|---|
| FR-DSK-8 | `UpdateHotelConfig` guards: `services/admin/src/server.test.ts:148` (persist), `:170` (values round trip), `:180` (front-desk `FORBIDDEN`), `:207` (actor recorded); `services/admin/src/pgstore.test.ts:103` (timezone write) | Extend with step-2 view assertions: contact fields optional and stored verbatim, blank timezone refused naming the field, non-integer or negative retention floor refused naming the field, back-to-step-1 keeps values, nothing persisted on failure |
| FR-DSK-9 | Seed-path guards: `services/rooms/src/server.test.ts:70` (type upsert), `:79` (room upsert), `:109` (second type), `:139` (duplicate-number refusal), `:209`–`:246` (room lifecycle over seeded rooms); `script/e2e-desk-loop.sh` rooms step (type + two rooms, sellability check) | Create step-3 view assertions: per-field blank/duplicate/unlinked refusals naming the field, inventory/availability/calendar uptake, back-to-step-2 keeps values, nothing persisted on failure |
| FR-DSK-10 | `CreateUser` guards: `services/admin/src/server.test.ts:122` (create), `:132` (duplicate identity refused), `:250` (role validation), `:289` (front-desk `FORBIDDEN`), `:343` (secret required), `:380` (lockout path), `:409` (unlock), `:446` (role change), `:507` (last-owner guard), `:620` (sign-in round trip) | Create step-4 view assertions: blank/taken/empty-secret refusals naming the field, fixed-owner role, completion routes to the desk with a working owner sign-in, back-to-step-3 keeps values, wizard never shows again on the seeded database |
| Navigation + gate (FR-DSK-7 holds) | `app/src/views/OnboardingView.test.ts:61` (step 1 on empty database), `:90` (seeded redirect), `:104` (blank stays), `:126` (persist + complete), `:161` (forbidden sentence), `:190` (plain retry), `:224` (VI render) | Extend with steps 2–4 navigation: 25/50/75/100 progress, back/continue on every step with values kept, per-step validation naming the field |
| Catalogue (NFR-DSK-1) | `script/catalogue-coverage-check.sh` plus `messages/en.json` / `messages/vi.json` (both exist) | Coverage job stays green on the steps 2–4 PR; new `desk.onboarding.*` keys land en + vi through the normal catalogue process |
| NFR-DSK-3 on wizard | Missing automated audit (sections 9.5 and 10.4 name the same gap for the other routes; no touch-target guard exists) | Guard measures every step-2–4 control and checks 44 by 44 with 0 overlaps |

### 11.5 Explicitly not specified here

- The T2 UI contract section for steps 2–4 is not
  written here: it lives with `product-owner` in
  `docs/product/desk-ui-design-rollout.md` section 10.5,
  which satisfies the T2 UI-contract minimum, so
  requirements here do not reword absent UI
  expectations (per the UI contract gap rule, the
  contract exists and is referenced, not missing).
- No new screens or flows beyond the four wizard steps;
  rate-plan and stay-policy setup stays in Admin
  post-wizard (`FR-ADM-4`); print, admin, and
  gate/sign-in screens keep their current presentation.
- No backend, API, contract, schema, or error-code
  change: `UpdateHotelConfig`, `UpsertRoomType` /
  `UpsertRoom`, and `CreateUser` behave exactly as
  specified, with the server-side rules above restated,
  not extended.
- The `docs/product/acceptance-criteria.md` slice
  (`AC-DSK-9` through `AC-DSK-11`) is separate
  `product-owner` work already on the #438 stack
  (PR #441); the test strategy and run records are
  separate `qa-lead` work. This section traces to the
  issue-body acceptance only through the `AC-DSK-n`
  ids above.

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-578
