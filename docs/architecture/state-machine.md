# State machines — booking and room

Status: active (proposed architecture; ADR-0001 still awaits owner
acceptance). Owned by `architect`. Lifecycle states only; the fixed
lifecycle order is not configurable per hotel (requirements
section 3.2). All transitions record actor and timestamp
(`NFR-AUD-1`).

## 1. Booking (reservation/stay) states

```text
confirmed --> checked-in (in-house) --> closed (checked-out)
    |                |
    +--> cancelled    +--> (room moves keep the stay in-house)
    +--> no-show
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

```text
vacant-clean --> vacant-inspected --> occupied --> vacant-dirty --> vacant-clean
      ^                                                        |
      +----------- out-of-order (date-ranged block) -----------+
```

- Live states: occupied, vacant, dirty, clean, inspected,
  out of order (`FR-RMS-1`).
- Housekeeping walks dirty -> clean -> inspected; only inspected
  vacant rooms are offered for check-in assignment (`FR-RMS-2`).
- Out-of-order is a date-ranged block with a recorded reason; no new
  reservation or check-in may take the room for a blocked date
  (`FR-RMS-3`).
- Check-out sets the room to vacant and dirty; a room move sets the
  old room to vacant and dirty (`FR-FDK-2`, `FR-FDK-3`).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-29
