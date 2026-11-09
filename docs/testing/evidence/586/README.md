# #586 Stay arrival-pick preload — evidence

Before/after side-by-side renders for the Stay check-in flow change
([issue #586](https://github.com/MingChen1501/hotel-mgmt/issues/586),
`AC-DSK-17`): the arrival pick loads the booked-type ready rooms, a
valid room selection clears the room guard, and the commit stays on
the Check in button.

## What each pair shows

Both pairs run the same seeded booking through the pre-fix build
(master `79cef5a`, the "before" half) and the implementation build
(the "after" half) against one isolated lab, so only the flow timing
differs.

| Pair | Before | After |
|---|---|---|
| `stay-checkin-load-*` | The guest pick leaves the room select empty (`Chọn phòng...` / `Choose a room...`) with the amber hint: the candidates only load on the first Check in click. | The guest pick alone populates the picker; with exactly one ready room of the booked type it binds immediately (`EV…` in the select) with no hint and no error. |
| `stay-checkin-error-*` | After the click-load and a valid room pick the stale red `Hãy chọn một phòng sẵn sàng trước.` / `Pick a ready room first.` message stays on screen. | After a valid room pick the guard clears immediately and a valid selection renders no error. |

Both locales are captured: `*-vi.png` and `*-en.png`.

## Capture method

- Chromium (Playwright 1.64.1) at a 1200px viewport for the live
  half and the same 1200px for the design board, paired across a 20px
  gutter (2420px wide images: board 1200 + gutter 20 + app 1200, app
  half cropped to the 1200×1000 capture).
- The left half is the Stay board (`docs/design/Stay.dc.html`, board 2
  in `docs/design/manifest.json`) rendered at 1200px, unchanged from
  the #563 evidence set — the change is flow state only.
- The live halves come from an isolated compose lab
  (`-p hotel-lab-864`, isolated volumes, proxy published on host port
  8640 because the owner lab owns 80) with the hotel set from
  `deploy/config/hotel.json`, signed in as `owner` with a lab-only
  boot secret. Data is seeded per run through the public contract:
  one guest, one room type with exactly one ready room (load pair) and
  one room type with two ready rooms (error pair), a rate plan pricing
  both nights, and one booking arriving today per pair.
- The "before" half serves the master build of `app/dist` from a
  loopback static server that proxies `/v1/*` to the same isolated
  lab, so both halves read the same backend.
- No screenshot snapshot or binary artifact enters the DOM-vs-design
  gate (`app/e2e/design-facts.spec.ts`); these files are flow-state
  evidence for the implementation PR only.
