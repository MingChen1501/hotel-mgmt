# State machines — booking and room

Status: active (accepted direction per ADR-0001, accepted
2026-10-23). Owned by `architect`. Lifecycle states only; the fixed
lifecycle order is not configurable per hotel (requirements
section 3.2). All transitions record actor and timestamp
(`NFR-AUD-1`).

## 1. Booking (reservation/stay) states

```mermaid
stateDiagram-v2
    [*] --> confirmed : book (FR-RES-1, FR-RES-4)
    confirmed --> checked_in : check in, ready room (FR-FDK-1)
    confirmed --> cancelled : cancel with reason (FR-RES-3)
    confirmed --> no_show : arrival date passed (FR-RES-6)
    checked_in --> closed : check out, folio settled or approved (FR-FDK-2, FR-BIL-7)
    state checked_in as "checked-in (in-house)"
    state no_show as "no-show"
    note right of checked_in : room moves keep this state, history kept (FR-FDK-3)
```

- `confirmed`: reservation recorded with dates, room type, guest,
  price basis (`FR-RES-1`, `FR-RES-4`).
- `checked-in`: arrival registered against a ready room; the stay is
  in house (`FR-FDK-1`). Room moves keep this state with history
  (`FR-FDK-3`).
- `closed`: stay checked out with settled folio or recorded approval
  (`FR-FDK-2`, `FR-BIL-7`); the room becomes vacant and dirty.
- `cancelled`: before check-in only, with a reason from the hotel's
  list; held availability released (`FR-RES-3`).
- `no-show`: arrival date passed without check-in; held room released
  and history kept (`FR-RES-6`).

Allowed transitions: confirmed -> checked-in, confirmed ->
cancelled, confirmed -> no-show, checked-in -> closed. No other
transitions exist in the MVP; states are never skipped, reordered, or
renamed per hotel.

## 2. Room states

```mermaid
stateDiagram-v2
    [*] --> vacant_clean : ready room
    vacant_clean --> vacant_inspected : housekeeping clean
    vacant_inspected --> occupied : check-in assignment, inspected only (FR-RMS-2)
    occupied --> vacant_dirty : check-out or room move (FR-FDK-2, FR-FDK-3)
    vacant_dirty --> vacant_clean : housekeeping
    vacant_clean --> out_of_order : date-ranged block (FR-RMS-3)
    vacant_inspected --> out_of_order : date-ranged block (FR-RMS-3)
    out_of_order --> vacant_clean : block ends
    out_of_order --> vacant_inspected : block ends
    state vacant_clean as "vacant-clean"
    state vacant_inspected as "vacant-inspected"
    state vacant_dirty as "vacant-dirty"
    state out_of_order as "out-of-order"
```

- Live states: occupied, vacant, dirty, clean, inspected,
  out of order (`FR-RMS-1`).
- Housekeeping walks dirty -> clean -> inspected; only inspected
  vacant rooms are offered for check-in assignment (`FR-RMS-2`).
- Out-of-order is a date-ranged block with a recorded reason, entered
  only from a vacant state (never from occupied); when the block ends
  the room returns to a vacant state. No new reservation or check-in
  may take the room for a blocked date (`FR-RMS-3`).
- Check-out sets the room to vacant and dirty; a room move sets the
  old room to vacant and dirty (`FR-FDK-2`, `FR-FDK-3`).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
