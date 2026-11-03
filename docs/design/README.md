# FE Design Reference (Owner-Supplied, Authoritative)

Status: active. Owner: `product-owner`.

The six `.dc.html` files in this directory plus `manifest.json` are the
owner-supplied authoritative FE designs for the hotel desk UI. Every
frontend implementation must follow these designs; where a spec and one
of these files disagree, the file here wins unless the owner decides
otherwise.

## Files

| File | Board (from `manifest.json`) |
|---|---|
| `Main.dc.html` | Desk board |
| `Stay.dc.html` | Check-in / check-out |
| `Onboarding.dc.html` | First-time setup |
| `Rooms.dc.html` | Room map |
| `Book.dc.html` | Booking |
| `Folio.dc.html` | Invoice |
| `manifest.json` | Canvas manifest: board layout map for the six files above |

The board map (positions and titles) in `manifest.json` is the source of
truth for how the six boards relate to each other.

## Rules

- Do not edit the `.dc.html` files or `manifest.json` to "fix"
  implementation drift — change the implementation instead, or ask the
  owner for a new design revision.
- New screens or revisions arrive as owner-supplied files through the
  same docs-only flow (Closes #462).
