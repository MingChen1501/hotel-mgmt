# Slice 1 product scope — room inventory and booking

Status: active. First product slice for hotel-mgmt: room inventory plus
booking, operated through a staff-only admin UI for a single hotel
property. This document states the problem, the personas, what is in and
out of slice 1, what a user can do, and what success looks like. FR/NFR
wording, architecture, and test specs are follow-ups owned by other
roles and are not part of this document.

## Problem statement

A small hotel still runs its inventory and reservations on paper or
spreadsheets: room types and individual rooms are listed by hand,
availability for a date range is checked by memory, and bookings are
taken without a reliable guard against double-booking the same room for
overlapping dates. The result is overbookings, lost guest details, and
no single view of which rooms are free, occupied, or out of service.
Slice 1 replaces that manual process with one admin UI where staff keep
the room inventory and take, change, and cancel bookings, with the
system refusing any booking that would double-book a room.

## Personas

- **Front-desk agent.** Takes reservations (walk-in, phone), checks
  which rooms are free for a guest's dates, creates and edits bookings,
  and cancels bookings when guests change plans. Needs a fast
  availability search and a booking form that prevents mistakes.
- **Hotel manager.** Owns the inventory: defines room types and rates,
  adds or retires individual rooms, marks rooms out of service (e.g.
  for maintenance), and reviews the room and booking lists to keep the
  property sellable. Needs a trustworthy list/filter view of rooms and
  bookings.

## Goals

- Staff can define and maintain the property's room types and rooms in
  one place.
- Staff can answer "what is free for these dates?" in seconds from an
  availability search over a date range.
- Staff can create, edit, and cancel bookings with guest and stay
  details recorded.
- The system never allows two bookings to hold the same room for
  overlapping dates (overbooking prevention).
- Staff can list and filter rooms and bookings to run the day-to-day.
- The admin UI is restricted to authenticated staff of the single
  property.

## Non-goals

- No public guest-facing website or self-service booking in slice 1.
- No revenue features: no online payments, no invoicing, no tax
  computation.
- No operational extensions: no housekeeping, no reporting/analytics,
  no notifications.
- No scale-out concerns: no multi-property support, no channel
  manager/OTA integration, no i18n.

## In scope

- **Room types.** Create, edit, and deactivate room types with name,
  guest capacity, base nightly rate, and description.
- **Individual rooms.** Create, edit, and retire rooms with room
  number, assigned room type, and status (`active` or
  `out-of-service`). Out-of-service rooms are excluded from
  availability and cannot receive new bookings.
- **Availability search.** Search free rooms for a check-in/check-out
  date range, optionally narrowed by room type and guest count; only
  active rooms with no overlapping booking are returned.
- **Booking management.** Create, edit, and cancel bookings with guest
  name, guest contact, assigned room, check-in/check-out dates, and
  guest count. Editing a booking re-checks availability for the new
  dates or room. Cancelling releases the room for the cancelled dates.
- **Overbooking prevention.** The system rejects any new or edited
  booking that would place two bookings on the same room for
  overlapping dates, and explains the conflict to the staff member.
- **Admin list and filter.** Staff can list and filter rooms (by type,
  status) and bookings (by date range, room, guest name).
- **Admin authentication.** The admin UI requires staff sign-in. Slice
  1 covers a single hotel property with a single staff account type
  (no roles or per-user permissions).

## Out of scope

- Online payments of any kind.
- Channel manager / OTA integration.
- Public guest-facing website or guest self-service booking.
- Housekeeping workflows and room-cleaning status.
- Invoicing, bills, and folios.
- Multi-property support.
- Reporting and analytics.
- Email / SMS notifications to guests or staff.
- Internationalisation (i18n) — English only in slice 1.

## What a user can do (capability list)

Each item below is checkable by using the admin UI:

1. A manager can add a room type with a name, capacity, base rate, and
   description, and see it in the room-type list.
2. A manager can edit a room type's details and deactivate a room type
   that is no longer sold.
3. A manager can add a room with a unique room number, an assigned room
   type, and an `active` status.
4. A manager can mark a room `out-of-service` and back to `active`;
   out-of-service rooms never appear as available.
5. A staff member can search availability by entering check-in and
   check-out dates and get the list of bookable rooms for exactly that
   range.
6. A staff member can narrow the availability search by room type and
   by guest count.
7. A staff member can create a booking with guest name, contact, room,
   check-in/check-out dates, and guest count.
8. A staff member can open a booking, change its dates, room, guest
   details, or guest count, and save the change when the new
   selection is free.
9. A staff member can cancel a booking, after which the room shows as
   available for the cancelled dates.
10. When a booking would overlap an existing booking on the same room,
    the system refuses it and tells the staff member which room and
    dates conflict — for both new and edited bookings.
11. A staff member can list rooms and filter them by type and status.
12. A staff member can list bookings and filter them by date range,
    room, and guest name.
13. Only signed-in staff can reach any of the above; signed-out
    visitors cannot.

## Success criteria

- Every capability above is usable end to end in the admin UI by the
  two personas.
- No sequence of create/edit actions through the UI can leave two
  bookings on the same room with overlapping dates.
- Out-of-service rooms are never offered as available and never accept
  new bookings.
- Room and booking data survives an application restart (persistent
  storage, no in-memory-only state).
- Nothing listed under "Out of scope" is shipped or half-shipped in
  slice 1.

## Open questions (decide before slice 2)

These are recorded so implementation does not invent around them; none
blocks slice 1.

- **Cancellation policy** (fees, deadlines, no-show handling) — decide
  before slice 2.
- **Tax handling** (whether and how taxes apply to the base rate) —
  decide before slice 2.
- **Pricing beyond the base rate** (seasonal rates, discounts,
  minimum stay) — decide before slice 2.
- **Guest-count enforcement** (over-capacity warning vs hard refusal)
  — decide before slice 2.
- **Staff account management** (multiple accounts, password reset,
  roles) — decide before slice 2.

## Dependencies

- Admin UI only: slice 1 ships no public site, so all capabilities
  are staff-operated behind admin authentication.
- Data must survive restart: rooms, room types, bookings, and staff
  credentials live in persistent storage from day one; nothing
  slice-1 may rely on in-memory-only state.
