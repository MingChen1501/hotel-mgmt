# Conceptual data model (ERD)

Status: active (accepted direction per ADR-0001, accepted
2026-10-23). Owned by `architect`. Conceptual entities and their
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

```mermaid
erDiagram
    ROOM_TYPE["Room type"] ||--|{ ROOM["Room"] : contains
    GUEST ||--|{ RESERVATION["Reservation"] : books
    RESERVATION ||--o| STAY["Stay"] : "becomes, at most one"
    STAY ||--|| FOLIO["Folio"] : "exactly one per stay"
    ROOM ||--|{ STAY : "hosts over time, one at a time"
    RATE_PLAN["Rate plan"]}|--|{ROOM_TYPE : "prices per date"
    HOTEL_CONFIG["Hotel config"] ||--|{ ROOM : "single-property scope"
    %% HotelConfig also covers users/roles, policies, charge items, and
    %% tax/fee rules (erd §1) — those are config sections, not entities,
    %% so no further nodes are drawn. Cross-checked against service
    %% migrations (services/*/migrations/, billing V1/V2); migrations win
    %% on any mismatch — none found in this pass.
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
