# MVP product scope — small-hotel property management system

Status: active. Product scope for the hotel-mgmt MVP, owned by
`product-owner`. This document sets scope in and out, the deployment
model, personas, the market-parity feature map, success criteria, and
open questions. It contains no requirements wording, no
non-functional targets, no architecture, and no stack choice — those
belong to their owning roles once the stack is decided.

## 1. Problem statement and targeting

Independent hotels with under 50 rooms run their property on paper
ledgers, spreadsheets, or generic booking tools that do not understand
hotel work: a reservation is not just a calendar entry, it becomes a
check-in, a room state, a folio of charges, and a receipt. When that
chain lives in separate places, front-desk staff double-enter data,
rooms sit empty while housekeeping status is unknown, and the owner
cannot see tonight's occupancy or this month's revenue without asking
around.

A light property-management system (PMS) fits this segment because a
small hotel's operation is narrow and personal: one building, a handful
of room types, staff who know returning guests by name, and an owner
who is often on site. Such a hotel does not need the enterprise
machinery of a large chain — channel management, revenue optimisation,
multi-property consolidation — it needs one shared, trustworthy record
of reservations, rooms, guests, and money, operable by a small team
with minimal training. The MVP therefore covers the daily front-desk
loop end to end and leaves enterprise depth for later.

Target segment: independent hotels with under 50 rooms, owner-operated
or with a small employed team, serving leisure and business travellers
through direct bookings (phone, walk-in, hotel website or message).

## 2. Deployment model

For the MVP, each hotel runs one on-premise instance of the system for
its own property. One instance serves one property: its rooms,
reservations, guests, and folios belong to that hotel alone, and the
system works on the hotel's own premises without depending on a
central service. The desk keeps working through an internet outage:
daily operation needs no internet connectivity.

Chain-ready direction (explicitly not MVP): the product is expected to
grow toward multi-property operation later — for example hotel groups
or chains that want a per-property view plus shared oversight. Nothing
in the MVP delivers that: no cross-property reporting, no shared guest
database across hotels, no central administration of several
properties. Those capabilities are tagged Later wherever they appear
below, and any per-hotel customisation in the MVP should be recorded
so a future multi-property design can reuse it.

## 3. Personas

| Persona | Who they are | What they need from the MVP |
|---|---|---|
| Hotel owner | Owns the property, often on site; accountable for the hotel state and how the system is set up | Status oversight at a glance (occupancy, revenue, arrivals), configuration of rooms, rates, users, and per-hotel workflows |
| Front-desk staff | Receives guests and operates the desk day to day; books rooms on behalf of guests | Fast booking, check-in and check-out, room-state visibility, guest lookup, folio charges and payment recording |
| Manager | Runs daily operations and commercial settings; may be the owner in the smallest hotels | Rate and availability control, room and housekeeping oversight, staff-facing reporting |

Guests are not MVP users of the system: staff book rooms for guests,
and guest self-service (such as online booking) is a Later item. Where
a feature ultimately serves guests, the persona column names the staff
persona that operates it.

## 4. Market-parity feature map

Each row carries an explicit scope tag: MVP (in this scope) or Later
(out of this scope, tracked for the roadmap). Persona names the primary
operator among the three personas above.

### 4.1 Reservations and booking

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Create direct reservation | Record a reservation with dates, room type, guest, and price basis | MVP | Front-desk staff |
| Modify and cancel reservation | Change dates, room type, or guest; cancel with a recorded reason | MVP | Front-desk staff |
| Walk-in booking | Create a same-day reservation for a guest at the desk | MVP | Front-desk staff |
| Reservation calendar | See reservations across dates and room types on one screen | MVP | Front-desk staff |
| No-show handling | Mark a reservation as no-show and release the held room | MVP | Front-desk staff |
| Waitlist | Keep unplaced demand on a list and convert it into reservations | Later | Front-desk staff |
| Guest self-service online booking | Let guests book their own rooms through the hotel's website | Later | Manager |
| Channel manager and OTA integration | Sync inventory and reservations with online travel agencies | Later | Manager |

### 4.2 Front-desk check-in and check-out

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Check-in | Register arriving guests and assign a ready room | MVP | Front-desk staff |
| Check-out | Close the stay, present the folio, and release the room | MVP | Front-desk staff |
| Room moves | Move a guest to another room mid-stay with the history kept | MVP | Front-desk staff |
| Early check-in and late check-out | Record early arrivals and late departures against the stay | MVP | Front-desk staff |
| Arrivals and departures list | Daily lists of who is expected, in house, and leaving | MVP | Front-desk staff |
| Express and self-service check-in | Kiosk or code-based arrival without desk interaction | Later | Front-desk staff |

### 4.3 Rooms and housekeeping

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Room inventory with live status | Every room listed with its current state (occupied, vacant, dirty, clean, inspected, out of order) | MVP | Front-desk staff |
| Housekeeping status updates | Mark rooms dirty, clean, or inspected as work completes | MVP | Front-desk staff |
| Out-of-order and maintenance blocks | Take rooms out of sale with a recorded reason and date range | MVP | Manager |
| Room setup and attributes | Define floors, bed types, and features per room and room type | MVP | Manager |
| Housekeeping task assignment | Assign cleaning rounds to people and track completion | Later | Manager |

### 4.4 Rates and availability

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Rate plans per room type | Define sellable prices per room type, season, and day | MVP | Manager |
| Availability overview | See sellable rooms by room type and date at a glance | MVP | Front-desk staff |
| Manual discounts and special rates | Apply a named discount or special price to a reservation | MVP | Manager |
| Stay restrictions | Set minimum stay or closed-to-arrival days per date range | MVP | Manager |
| Dynamic pricing and yield rules | Automatic price adjustments driven by occupancy or demand | Later | Manager |
| Multi-currency rates | Price and quote in more than the hotel's home currency | Later | Manager |

### 4.5 Guests and CRM

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Guest profiles with stay history | One record per guest with past and upcoming stays | MVP | Front-desk staff |
| Guest preferences and notes | Store preferences and remarks visible at booking time | MVP | Front-desk staff |
| Repeat-guest recognition | Flag returning guests so staff can greet and serve them well | MVP | Front-desk staff |
| Booking confirmation record | A confirmation the hotel can share with the guest (print or message) | MVP | Front-desk staff |
| Automated guest messaging | Scheduled pre-arrival and post-stay messages | Later | Manager |
| Loyalty programme and campaigns | Points, tiers, and marketing outreach to past guests | Later | Manager |

### 4.6 Billing and folio

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Guest folio | One running folio per stay collecting room charges and extras | MVP | Front-desk staff |
| Room and extra charges | Post nightly room charges and extra items to the folio | MVP | Front-desk staff |
| Payment recording | Record cash and card payments against the folio | MVP | Front-desk staff |
| Invoice and receipt | A printable invoice and payment receipt for the guest | MVP | Front-desk staff |
| Configurable taxes and fees | Hotel-set tax and fee rules applied to folio lines | MVP | Manager |
| Day-close totals | End-of-day totals of charges and payments taken | MVP | Manager |
| Split and shared folios | Divide one stay's charges across several payers | Later | Front-desk staff |
| Integrated payment processing | In-system card charging and reconciliation with providers | Later | Manager |
| Accounting-system integration | Export or sync of financial data to external accounting | Later | Manager |

### 4.7 Reporting

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Occupancy report | Occupied and available rooms over a chosen period | MVP | Owner |
| Revenue summary | Room and extra revenue totals over a chosen period | MVP | Owner |
| Front-desk daily sheet | One-page arrivals, in-house guests, departures, and open balances | MVP | Manager |
| Housekeeping status report | Rooms needing cleaning or inspection right now | MVP | Front-desk staff |
| Custom report builder | Owner-defined reports beyond the standard set | Later | Manager |
| Cross-property and trend analytics | Year-over-year and multi-property comparisons | Later | Owner |

### 4.8 Configuration and administration

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Hotel profile setup | Hotel identity, contact details, and local settings | MVP | Owner |
| User accounts and roles | Accounts for owner, manager, and front-desk staff with matching access | MVP | Owner |
| Room and room-type setup | Define the property's rooms, types, and capacity | MVP | Owner |
| Rate-plan and policy setup | Enter rate plans, check-in and check-out times, and stay policies | MVP | Manager |
| Data export and backup | Export hotel data and keep restorable copies on-premise | MVP | Owner |
| Activity and audit log | Who changed what and when across reservations and folios | Later | Owner |

### 4.9 Per-hotel workflow customisation

 Per-hotel differences are the norm in this segment, so the MVP makes
 the common variations configurable without code changes, and leaves
 deeper workflow automation for later.

| Capability | Description | Scope | Persona |
|---|---|---|---|
| Customisable required guest fields | Each hotel chooses which guest details are mandatory at booking and check-in | MVP | Owner |
| Customisable stay policies | Each hotel sets its own check-in and check-out times and cancellation wording | MVP | Owner |
| Custom charge items | Each hotel defines its own charge items (for example parking, breakfast, minibar) | MVP | Manager |
| Customisable folio layout | Each hotel chooses what appears on its printed invoice and receipt | Later | Owner |
| Custom roles beyond the defaults | Access setups beyond owner, manager, and front-desk staff | Later | Owner |
| Automated workflow rules | Event-driven steps such as automatic status changes or reminders | Later | Manager |

## 5. Out of scope for the MVP

The following are explicitly not in the MVP. Items marked Later above
remain roadmap candidates; items below are excluded from MVP planning
entirely unless a later scope decision brings them back:

- Online travel agency (OTA) connectivity and channel management.
- Guest self-service booking, check-in kiosks, and guest mobile apps.
- Multi-property, chain, and franchise management of any kind.
- Centralised multi-hotel guest database or loyalty programme.
- Integrated payment processing and payment-provider contracts.
- External accounting, payroll, and inventory-purchasing integrations.
- Dynamic pricing, revenue optimisation, and demand forecasting.
- Staff scheduling, payroll, and human-resources functions.
- Food-and-beverage point of sale beyond simple folio extras.
- Marketing automation and campaign management.
- Multi-currency and multi-language operation.
- Operation of the system as a hosted service for many hotels from one
  installation (the MVP is one on-premise instance per property).

## 6. Success criteria for the MVP

Each criterion is observable at demo time on a single on-premise
instance holding a small fictional hotel (under 50 rooms):

- A staff member books a future reservation and a same-day walk-in,
  and both appear on the reservation calendar with correct dates and
  room types.
- The same staff member checks a guest in, moves them to another room
  mid-stay, and checks them out, with the room states correct after
  each step.
- Housekeeping marks rooms dirty, clean, and inspected, and the
  front-desk view reflects every change; an out-of-order room cannot be
  sold for its blocked dates.
- The manager sets a seasonal rate plan and a stay restriction, and a
  new reservation prices and constrains itself accordingly.
- A repeat guest is recognised at booking time with visible stay
  history and preferences.
- A guest folio collects room charges and a hotel-defined charge item,
  records a part-payment and a final payment, and prints a matching
  invoice and receipt.
- The owner opens the occupancy report, the revenue summary, and the
  daily sheet, and all three agree with the demo hotel's bookings.
- The owner configures a new room type, a new user, a new charge item,
  and a change to check-in time and required guest fields, all without
  code changes, and the desk immediately works with the new setup.
- The owner runs a data export and backup, and every run shows a
  visible success-or-failure report with a restorable on-premise copy
  kept.
- A second hotel's data never appears in the demo instance: the
  instance holds exactly one property's data.

## 7. Open questions

Genuinely open product decisions, recorded here rather than answered.
None blocks the MVP: each is owned by `product-owner` and carries the
slice before which it must be decided.

- How should the hotel record the reason for reservation changes and
  cancellations — free text, a fixed list, or both? (Decide before the
  reservations slice.)
- Which payment methods beyond cash and card must payment recording
  support on day one, such as bank transfer or hotel credit? (Decide
  before the billing slice.)
- What does day-close mean for a hotel that never fully closes —
  which totals must balance and who signs them off? (Decide before the
  billing slice.)
- Which guest fields, if any, must the system refuse to delete for
  record-keeping, and for how long are past stays kept? (Decide before
  the guests slice.)
- What is the minimum backup-and-restore story an on-premise hotel
  can actually operate — who triggers it and how do they know it
  worked? (Decide before the administration slice.)
- Which per-hotel variations observed in early hotels should become
  standard options versus staying one-off customisation? (Decide
  before the customisation slice.)
- What evidence of market parity is enough to declare an MVP domain
  complete — owner walkthrough, trial operation in a real hotel, or
  both? (Decide before the first demo.)

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-8
