# Conceptual data model (ERD)

Status: active (proposed architecture; ADR-0001 still awaits owner
acceptance). Owned by `architect`. Conceptual entities and their
relationships only — no tables, no columns detail, no vendor SQL. (A
note on enforcement technology is allowed by issue #11; the note
below names no vendor.)

## 1. Entities

- Room type: a sellable category of rooms (capacity, features).
- Room: a physical room belonging to exactly one room type and one
  property; carries floor, bed type, features, and its live state
  (see `docs/architecture/state-machine.md`).
- Guest: one record per guest with details, preferences, and notes.
- Reservation: a guest's booking of a room type for a date range with
  a quoted price basis; later linked to a stay.
- Stay: an in-house occupation created at check-in from a
  reservation, linked to exactly one room at a time, with move
  history.
- Folio: exactly one running folio per stay, collecting folio lines
  (room charges, extras, taxes/fees) and payments with a running
  balance.
- Rate plan: nightly prices per room type and date; restrictions
  (minimum stay, closed-to-arrival) and named discounts.
- Hotel config: the property profile, users/roles, custom fields,
  policies, charge items, and tax/fee rules.

## 2. Relationships (conceptual)

```text
RoomType 1---* Room
Guest 1---* Reservation (each reservation books one RoomType)
Reservation 1---0..1 Stay (a stay comes from at most one reservation)
Stay 1---1 Folio (exactly one folio per stay, MVP fixed)
Room 1---* Stay over time (one stay links one room at a time)
RatePlan *---* RoomType (prices per room type and date)
HotelConfig 1---* (rooms, users, policies of the single property)
```

## 3. Overbooking constraint (conceptual)

For any room type and any date, confirmed reservations plus in-house
stays must not exceed sellable rooms (total rooms of the type minus
out-of-order blocks). Enforcement note (no vendor detail): the
reservation-creating write in the reservation store checks this count
atomically, so two simultaneous bookings for the last unit cannot both
succeed (`NFR-CON-1`); room assignment at check-in is guarded by an
atomic write in the stay store (`NFR-CON-2`). A refused booking names
the conflict
(`docs/technical/error-handling.md`).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
