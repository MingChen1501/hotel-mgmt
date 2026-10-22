# Product requirements document — small-hotel property management system

Status: active. Product picture for the hotel-mgmt small-hotel PMS,
owned by `product-owner`. This PRD states the problem, the target
segment, the value proposition, the personas in summary, the
capability map (MVP vs later), the two core user journeys, product
success metrics, non-goals, assumptions, and open questions. It
derives entirely from the MVP product scope
(`docs/product/mvp-scope.md`, active) and introduces no new
capabilities: anything the scope does not cover is recorded as an
open question, not decided here.

This document contains no numbered requirements wording (owned by
`business-analyst` in `docs/requirements/`), no architecture or ADR
content, no stack choice, no pricing numbers, and no market research
evidence.

## 1. Problem statement

Independent hotels with under 50 rooms run their property on paper
ledgers, spreadsheets, or generic booking tools that do not
understand hotel work. A reservation is not just a calendar entry: it
becomes a check-in, a room state, a folio of charges, and a receipt.
When that chain lives in separate places, front-desk staff
double-enter data, rooms sit empty while the housekeeping status is
unknown, and the owner cannot see tonight's occupancy or this
month's revenue without asking around.

The problem this product solves is the absence of one shared,
trustworthy record of reservations, rooms, guests, and money that a
small team can operate with minimal training.

## 2. Target segment

Independent hotels with under 50 rooms, owner-operated or run with a
small employed team, serving leisure and business travellers through
direct bookings (phone, walk-in, hotel website message, or messaging
apps). One building, a handful of room types, staff who know
returning guests by name, and an owner who is often on site.

Excluded from the target segment for the MVP: chains,
multi-property groups, franchises, and properties whose main volume
comes through online travel agencies (see Non-goals, section 8).

## 3. Value proposition

One trustworthy daily record for the whole hotel: every reservation,
room state, guest, and charge lives in one place, operable by the
existing front-desk team with minimal training.

- For front-desk staff: book, check in, move, and check out guests
  without double entry, with the room state always visible.
- For the manager: rates, availability, rooms, and the daily sheet
  under direct control, configurable without technical help.
- For the owner: tonight's occupancy and this month's revenue at a
  glance, plus a hotel setup (rooms, users, extras, policies) the
  hotel itself can change.

What the product deliberately does not promise in the MVP: more
direct bookings, higher rates, or marketing reach. Commercial growth
tooling (online booking, channel management, loyalty, dynamic
pricing) is Later (see the capability map, section 5).

## 4. Personas (summary)

Three staff personas operate the MVP. Guests are not system users:
staff book rooms on behalf of guests, and guest self-service is a
Later capability.

| Persona | One-line summary | Primary needs from the product |
|---|---|---|
| Hotel owner | Owns the property, often on site; accountable for the hotel's state and setup | Occupancy and revenue oversight at a glance; configuration of rooms, rates, users, and per-hotel workflows |
| Front-desk staff | Receives guests and operates the desk day to day; books rooms on behalf of guests | Fast booking, check-in and check-out, room-state visibility, guest lookup, folio charges and payment recording |
| Manager | Runs daily operations and commercial settings; may be the owner in the smallest hotels | Rate and availability control, room and housekeeping oversight, staff-facing reporting |

Full persona detail (backgrounds, goals, frustrations, day-in-the-life)
lives in `docs/product/personas.md` (issue #30) and is not duplicated
here. Where a capability ultimately serves guests, the capability map
below names the staff persona that operates it, consistent with the
MVP product scope.

## 5. Capability map (MVP vs later)

Derived from the MVP product scope (`docs/product/mvp-scope.md`,
section 4). No capability is added or removed here; the Scope column
repeats the scope document's verdict. Per-hotel workflow
customisation notes mark where the hotel's own configuration changes
the capability.

### 5.1 Reservations and booking

| Capability | Scope | Persona |
|---|---|---|
| Create direct reservation (dates, room type, guest, price basis) | MVP | Front-desk staff |
| Modify and cancel reservation with a recorded reason | MVP | Front-desk staff |
| Walk-in booking (same-day reservation at the desk) | MVP | Front-desk staff |
| Reservation calendar across dates and room types | MVP | Front-desk staff |
| No-show handling (mark no-show, release the held room) | MVP | Front-desk staff |
| Waitlist | Later | Front-desk staff |
| Guest self-service online booking | Later | Manager |
| Channel manager and OTA integration | Later | Manager |

### 5.2 Front-desk check-in and check-out

| Capability | Scope | Persona |
|---|---|---|
| Check-in (register arrivals, assign a ready room) | MVP | Front-desk staff |
| Check-out (close the stay, present the folio, release the room) | MVP | Front-desk staff |
| Room moves mid-stay with history kept | MVP | Front-desk staff |
| Early check-in and late check-out recording | MVP | Front-desk staff |
| Arrivals and departures lists | MVP | Front-desk staff |
| Express and self-service check-in | Later | Front-desk staff |

### 5.3 Rooms and housekeeping

| Capability | Scope | Persona |
|---|---|---|
| Room inventory with live status | MVP | Front-desk staff |
| Housekeeping status updates (dirty, clean, inspected) | MVP | Front-desk staff |
| Out-of-order and maintenance blocks with reason and date range | MVP | Manager |
| Room setup and attributes (floors, bed types, features) | MVP | Manager |
| Housekeeping task assignment to people | Later | Manager |

### 5.4 Rates and availability

| Capability | Scope | Persona |
|---|---|---|
| Rate plans per room type, season, and day | MVP | Manager |
| Availability overview by room type and date | MVP | Front-desk staff |
| Manual discounts and special rates | MVP | Manager |
| Stay restrictions (minimum stay, closed to arrival) | MVP | Manager |
| Dynamic pricing and yield rules | Later | Manager |
| Multi-currency rates | Later | Manager |

### 5.5 Guests and CRM

| Capability | Scope | Persona |
|---|---|---|
| Guest profiles with stay history | MVP | Front-desk staff |
| Guest preferences and notes visible at booking time | MVP | Front-desk staff |
| Repeat-guest recognition | MVP | Front-desk staff |
| Booking confirmation record (printable or sendable) | MVP | Front-desk staff |
| Automated guest messaging | Later | Manager |
| Loyalty programme and campaigns | Later | Manager |

### 5.6 Billing and folio

| Capability | Scope | Persona |
|---|---|---|
| Guest folio (one running bill per stay) | MVP | Front-desk staff |
| Room and extra charges posting | MVP | Front-desk staff |
| Payment recording (cash and card) | MVP | Front-desk staff |
| Invoice and receipt printing | MVP | Front-desk staff |
| Configurable taxes and fees | MVP | Manager |
| Day-close totals | MVP | Manager |
| Split and shared folios | Later | Front-desk staff |
| Integrated payment processing | Later | Manager |
| Accounting-system integration | Later | Manager |

### 5.7 Reporting

| Capability | Scope | Persona |
|---|---|---|
| Occupancy report | MVP | Owner |
| Revenue summary | MVP | Owner |
| Front-desk daily sheet | MVP | Manager |
| Housekeeping status report | MVP | Front-desk staff |
| Custom report builder | Later | Manager |
| Cross-property and trend analytics | Later | Owner |

### 5.8 Configuration and administration

| Capability | Scope | Persona |
|---|---|---|
| Hotel profile setup | MVP | Owner |
| User accounts and roles (owner, manager, front-desk staff) | MVP | Owner |
| Room and room-type setup | MVP | Owner |
| Rate-plan and policy setup | MVP | Manager |
| Data export and backup on premise | MVP | Owner |
| Activity and audit log view | Later | Owner |

### 5.9 Per-hotel workflow customisation

| Capability | Scope | Persona |
|---|---|---|
| Customisable required guest fields | MVP | Owner |
| Customisable stay policies (times, cancellation wording) | MVP | Owner |
| Custom charge items (hotel-defined extras) | MVP | Manager |
| Customisable folio layout | Later | Owner |
| Custom roles beyond the defaults | Later | Owner |
| Automated workflow rules | Later | Manager |

## 6. User journeys

Two core journeys cover the daily front-desk loop. Steps name the
persona and the capability used; customisation notes mark where the
hotel's own configuration changes the journey.

### Journey A — Staff book a room for a guest

1. The guest calls, messages, or walks in. Front-desk staff open the
   availability overview and propose a room type and dates. If the
   guest is returning, staff look the guest up: the profile shows
   stay history, preferences, and notes before anything is
   confirmed.
2. Staff create the direct reservation with dates, room type, guest,
   and price basis; the reservation quotes from the rate plan in
   force and appears on the reservation calendar.
3. If the hotel runs a seasonal rate or a stay restriction for those
   dates, the quote and the acceptance follow them automatically;
   a named discount may be applied instead.
4. Staff produce the booking confirmation record and share it with
   the guest (print or message).
5. If plans change before arrival, staff modify the reservation
   (dates, room type, or guest) or cancel it with a recorded
   reason; a guest who never arrives is marked no-show and the held
   room is released.

Customisation touchpoints: the hotel chooses which guest fields are
mandatory at booking (a missing field refuses the booking and names
the field); the hotel's own cancellation reasons and cancellation
wording apply; the confirmation carries the hotel's identity and
wording.

### Journey B — Front-desk check-in, stay, and check-out

1. On the arrival day, staff open the arrivals list, confirm the
   reservation, and check the guest into a ready room of the booked
   type; the room state becomes occupied. Early arrivals are
   recorded against the stay.
2. During the stay, room charges and hotel-defined extras are posted
   to the single guest folio; taxes and fees derive from the
   hotel's own rules. If the guest changes rooms, staff move the
   stay and both room states update, with the move kept in the
   history. Housekeeping marks rooms dirty, clean, and inspected,
   and the front-desk view reflects every change.
3. At departure, staff present the folio, record the final payment,
   and check the guest out; the room is released as vacant and
   dirty. Late departures are recorded against the stay.
4. The manager runs day-close and reviews the totals of charges and
   payments; the owner reviews occupancy, revenue, and the daily
   sheet, all agreeing with the underlying bookings.

Customisation touchpoints: check-in and check-out times are the
hotel's own; which guest fields are mandatory at check-in varies by
hotel; the hotel's tax and fee rules shape every folio; out-of-order
rooms with a recorded reason cannot be assigned.

## 7. Success metrics (KPIs)

Product-level metrics, each with how it is observed. No numeric
targets are set in this PRD: baselines and targets are established
during trial operation in a real hotel and recorded by
`product-owner` before the first demo milestone.

| Metric | What it tells us | How it is measured |
|---|---|---|
| Occupancy visibility | The owner can answer "how full are we tonight and this month" without asking staff | Owner walkthrough: open the occupancy report and daily sheet on the demo hotel and compare against the bookings |
| Booking time | A routine direct booking is fast enough for desk use | Timed task walkthrough: staff record a direct reservation and a walk-in during the demo; durations are recorded, not yet targeted |
| Double-booking incidence | Two overlapping bookings never take the same sellable room | Count of double-booked rooms over the trial period, taken from system records; direction is zero, target set after trial |
| Owner daily use | The product earns a daily habit with the owner | During trial operation: how often the owner opens the daily sheet and revenue summary, by interview and trial log |
| Setup independence | The hotel configures itself without technical help | Walkthrough: the owner adds a room type, a user, a charge item, and a policy change with no code changes and the desk works with the new setup immediately |

## 8. Non-goals for the MVP

The following are explicitly not MVP goals. Some are Later roadmap
candidates from the capability map; the rest are excluded from MVP
planning unless a later scope decision brings them back.

- A public website, guest self-service booking, check-in kiosks, or
  guest mobile apps.
- Integrated payment processing and payment-provider contracts;
  payment recording in the MVP means recording cash and card
  payments against the folio.
- Channel manager and online-travel-agency connectivity.
- Multi-property, chain, or franchise management of any kind,
  including cross-property reporting and a shared guest database.
- Housekeeping depth beyond status updates: no task assignment,
  rounds, or staff scheduling.
- Dynamic pricing, revenue optimisation, and demand forecasting.
- Accounting, payroll, HR, marketing automation, and loyalty
  programmes.
- Multi-currency and multi-language operation.
- Operating the system as a hosted service for many hotels from one
  installation (the MVP is one on-premise instance per property).

## 9. Assumptions

Product-level assumptions held while the MVP is built. If any proves
false, `product-owner` revisits the affected scope.

- The hotel has one building with under 50 rooms and a handful of
  room types; the product does not need to scale beyond that.
- Front-desk staff operate the system on the hotel's own premises;
  the desk keeps working without internet connectivity.
- The owner or manager is available to configure the hotel (rooms,
  rates, users, extras, policies) before go-live; no central
  administrator does this for them.
- Direct bookings (phone, walk-in, website message) carry the
  hotel's volume; online-travel-agency volume, if any, is managed
  outside the system for the MVP.
- Cash and card cover the hotel's payments on day one; further
  payment methods are open question OQ-1 below.
- Each hotel runs one on-premise instance for its own property;
  per-hotel customisation is recorded so a future multi-property
  design can reuse it.

## 10. Open questions (owned by `product-owner`)

Genuinely open product decisions. None blocks starting the MVP;
each carries the milestone before which it must be decided.

- OQ-1 — Which payment methods beyond cash and card must payment
  recording support on day one, such as bank transfer or hotel
  credit? (Decide before the billing slice.)
- OQ-2 — How should the hotel record the reason for reservation
  changes and cancellations — free text, a fixed list, or both?
  (Decide before the reservations slice.)
- OQ-3 — What does day-close mean for a hotel that never fully
  closes — which totals must balance and who signs them off?
  (Decide before the billing slice.)
- OQ-4 — Which guest fields, if any, must the system refuse to
  delete for record-keeping, and for how long are past stays kept?
  (Decide before the guests slice.)
- OQ-5 — What is the minimum backup-and-restore story an on-premise
  hotel can actually operate — who triggers it and how do they know
  it worked? (Decide before the administration slice.)
- OQ-6 — Which per-hotel variations observed in early hotels should
  become standard options versus staying one-off customisation?
  (Decide before the customisation slice.)
- OQ-7 — What evidence is enough to declare an MVP domain complete
  — owner walkthrough, trial operation in a real hotel, or both?
  (Decide before the first demo.)

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-33
