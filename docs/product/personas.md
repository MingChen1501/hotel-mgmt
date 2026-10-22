# Personas — small-hotel property management system

Status: active. User archetypes the hotel-mgmt small-hotel PMS
serves, owned by `product-owner`. The three personas below are the
staff operators defined in the MVP product scope
(`docs/product/mvp-scope.md`, section 3) and summarised in the PRD
(`docs/product/prd.md`, section 4). Guests are not system users:
staff book rooms on behalf of guests. Every fact here derives from
the scope, the PRD, or the MVP requirements
(`docs/requirements/mvp-requirements.md`); no anecdotes, names, or
background stories are invented.

## P1 — Hotel owner

Who they are: owns the property, often on site; accountable for the
hotel's state and how the system is set up.

Goals:

- See tonight's occupancy and this month's revenue without asking
  around.
- Keep one trustworthy record of reservations, rooms, guests, and
  money for the property.
- Configure the hotel (rooms, users, extras, policies) without
  technical help, before go-live and as the hotel changes.

Pains:

- Today the chain from reservation to check-in to room state to
  folio to receipt lives in separate places (paper ledgers,
  spreadsheets, generic booking tools), so the hotel state is
  only visible by asking staff.
- No central administrator sets the hotel up; the owner or
  manager must do it themselves.
- One installation serves one property, so anything
  cross-property has no system support.

Jobs to be done:

- Open the occupancy report, the revenue summary, and the daily
  sheet and trust that all three agree with the bookings.
- Set up the hotel profile, rooms and room types, user accounts
  for the three roles, and required guest fields and stay
  policies.
- Export hotel data and keep restorable on-premise copies, and
  know whether each backup run succeeded or failed.

What the owner needs from the MVP: status oversight at a glance
(occupancy, revenue, arrivals) and configuration of rooms, rates,
users, and per-hotel workflows — all without code changes, with
the desk working with the new setup immediately.

## P2 — Front-desk staff

Who they are: receives guests and operates the desk day to day;
books rooms on behalf of guests.

Goals:

- Book, check in, move, and check out guests without double
  entry, with the room state always visible.
- Serve returning guests well by recognising them and seeing
  their history and preferences before confirming a booking.
- Close every stay with a correct invoice and receipt.

Pains:

- Double entry across disconnected tools slows the desk and
  introduces errors at busy moments.
- Rooms sit empty while the housekeeping status is unknown, so
  assigning a ready room is guesswork.
- Two staff acting at once (last room bookings, same-room
  check-ins) must never produce a double-booking or a double
  assignment.

Jobs to be done:

- Record direct and walk-in reservations, modify or cancel them
  with a recorded reason, handle no-shows, and read the
  reservation calendar and arrivals and departures lists.
- Check guests into ready rooms, move them mid-stay with the
  history kept, record early and late arrivals and departures,
  and check them out against a settled folio.
- Post room and extra charges, record cash and card payments,
  and produce matching invoices and receipts.
- Look up guests, see stay history, preferences, and notes at
  booking time, and share a booking confirmation record.

What front-desk staff need from the MVP: fast booking, check-in
and check-out, room-state visibility, guest lookup, and folio
charges and payment recording — on the hotel's own premises,
working through an internet outage.

## P3 — Manager

Who they are: runs daily operations and commercial settings; may
be the owner in the smallest hotels.

Goals:

- Keep rates, availability, rooms, and the daily sheet under
  direct control.
- Adapt the hotel's commercial setup (seasons, discounts,
  restrictions) without technical help.
- Close each business day with totals that agree with the
  folios.

Pains:

- Seasonal prices, discounts, and stay rules change often and
  must apply to new quotes immediately, without rework.
- Rooms taken out of sale for maintenance must never be sold
  or assigned for their blocked dates.
- The smallest hotels have no separate manager, so the
  commercial setup must be simple enough for the owner to run.

Jobs to be done:

- Define rate plans per room type, season, and day; set stay
  restrictions and named discounts; enter rate plans, standard
  times, and stay policies.
- Define room setup and attributes; block rooms out of order
  with reason and date range; oversee housekeeping status.
- Open the front-desk daily sheet and run day-close totals per
  payment method.
- Define the hotel's own billable extras for folio posting.

What the manager needs from the MVP: rate and availability
control, room and housekeeping oversight, and staff-facing
reporting — configurable without code changes.

## Persona-to-requirements note

Persona reach is governed by the requirements, not this
document: role limits live in `FR-ADM-2` and `NFR-SEC-1`, and
the fixed MVP roles (owner, manager, front-desk staff; custom
roles are Later) are stated in the requirements, section 3.2.
The user stories in `docs/product/user-stories.md` name the
operating persona per story.

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-38
