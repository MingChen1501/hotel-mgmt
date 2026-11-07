# FE Design Reference (Owner-Supplied, Authoritative)

Status: active. Owner: `product-owner`.

The seven `.dc.html` files in this directory plus `manifest.json` are the
owner-supplied authoritative FE designs for the hotel desk UI (bundle
07-11, v2 — supersedes all previous `.dc.html` boards per owner
directive 2026-11-07, Closes #538). Every frontend implementation must
follow these designs; where a spec and one of these files disagree, the
file here wins unless the owner decides otherwise.

## Files

| File | Board (from `manifest.json`) |
|---|---|
| `Main.dc.html` | Desk board |
| `Stay.dc.html` | Check-in / check-out |
| `Onboarding.dc.html` | First-time setup |
| `Rooms.dc.html` | Room map |
| `Book.dc.html` | Booking |
| `Folio.dc.html` | Invoice |
| `Admin.dc.html` | Admin (Quản trị) |
| `manifest.json` | Canvas manifest: board layout map for the seven files above |

The board map (positions and titles) in `manifest.json` is the source of
truth for how the seven boards relate to each other.

## Rendering note

Each `.dc.html` board is a standalone decoded bundle: it renders
client-side with React 18 loaded from CDN at view time, so the boards
need network access to display and no longer load a local `./support.js`
runtime. The previous six-board set and its `support.js` note were
superseded by this bundle (see above); do not vendor a local runtime
copy here without an owner-supplied revision (see Rules below).

## Rules

- Do not edit the `.dc.html` files or `manifest.json` to "fix"
  implementation drift — change the implementation instead, or ask the
  owner for a new design revision.
- New screens or revisions arrive as owner-supplied files through the
  same docs-only flow (Closes #538).
