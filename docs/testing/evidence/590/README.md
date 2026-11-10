# Rooms and rates management screen — visual evidence (Refs #590)

Capture record for the management-screen implementation PR. The
approved design source is `docs/design/RoomsRates.dc.md` (sections 4–7:
screen shell, room types, rooms and floors, nightly prices, and the
no-price empty state at 7.4); these images are the live-app half of the
`MR-1` board evidence (one PR, four sections, VI and EN).

| Image | Shows |
|---|---|
| `before-manage-vi.png` | The desk before this change: seven design tabs (no `Quản lý`), and `/app/manage` falling through to the shell placeholder. Built from `master` at `5002bb3`. |
| `after-manage-vi.png` | The changed screen in Vietnamese: the `Quản lý` tab after `Sơ đồ phòng`, the three stacked card groups (room types, rooms and floors, nightly prices), the floor-grouped room list, and the five-night grid with stored prices plus a `chưa có giá` gap. |
| `after-manage-en.png` | The same screen in English (whole-screen locale switch, no mixed copy). The typed rate-plan name `Giá chuẩn` stays as stored data, not UI copy. |

## Capture method

- Isolated compose lab only (`-p hotel-lab-891`, proxy published on
  `8091` so the owner's shared `hotel-mgmt` lab on port `80` is
  untouched), torn down after the capture.
- Both images come from the served `/app/` build under Chromium
  (1280px wide, full page), signed in through the desk gate as the
  owner, never assembled or edited.
- Seed for the live half: three room types (`Standard`, `Deluxe`,
  `Suite`), rooms `101`/`102` on floor 1, `201` on floor 2, `301`
  without a floor, and rate plan `Giá chuẩn` priced for 01–03/12/2026
  plus 05/12/2026, so the grid shows both a stored price and the
  no-price gap.
- The before image uses the same lab and gate against a build of the
  pre-change tree; only `app/dist` differs between the two runs.

Operator note: the screen writes through the existing rooms and rates
operations, so nothing in this capture created a new operation,
contract, schema, or token.
