# #563 desk UI audit — evidence index

Side-by-side renders for the desk-UI-vs-owner-design audit of
[issue #563](https://github.com/MingChen1501/hotel-mgmt/issues/563).
The authoritative audit record, including the board `sha256` table, is the
[audit comment](https://github.com/MingChen1501/hotel-mgmt/issues/563#issuecomment-6722330389);
this file only indexes the images and how they were captured, so the two
do not drift.

## Capture method

- Chromium, `vi` locale, 1200px content width. Each side-by-side pairs the
  design board at 1200px on the left with the live app at 1200px on the
  right across a 20px gutter, so every side-by-side is 2420px wide.
- The live half comes from an isolated compose lab (isolated project and
  volumes, example data seeded through the public contract), signed in as
  `owner` with a lab-only boot secret; the gate image keeps the form empty,
  so no lab secret is in the picture.
- Audited commit `121ffdd` (master). `side-by-side-Main-vi.png` was
  refreshed at `c02553e` after the `G-MN-4` zero-`asOf` fix.
- `app-signin-gate-vi.png` was refreshed for the `G-SH-3` fix (#571) from the
  built bundle at 1200px in `vi`: the gate frame is signed out and carries no
  backend data, so the boot config call was answered locally instead of
  standing up a lab (Chromium, viewport 1200×1000, locale pill switched to VI
  before load).

## Images

| Screen | File | Size | Shows |
|---|---|---|---|
| Shell/nav | [side-by-side-shell-nav-vi.png](side-by-side-shell-nav-vi.png) | 2420×111 | 60px board header vs the wrapped 111px app header; nav labels and order; `G-SH-1`, `G-SH-2` |
| Sign-in gate | [app-signin-gate-vi.png](app-signin-gate-vi.png) | 1200×1000 | App-only gate state; refreshed for `G-SH-3` (#571) — the locale pill now reads dark ink on the pale gate |
| Main | [side-by-side-Main-vi.png](side-by-side-Main-vi.png) | 2420×3394 | Desk cards and daily-sheet line; `G-MN-1`…`G-MN-4` |
| Stay | [side-by-side-Stay-vi.png](side-by-side-Stay-vi.png) | 2420×1016 | Check-in form and in-house lists; `G-ST-1`, `G-ST-2` |
| Onboarding | [side-by-side-Onboarding-vi.png](side-by-side-Onboarding-vi.png) | 2420×1016 | Setup wizard vs the board's setup panel; `G-OB-1` |
| Rooms | [side-by-side-Rooms-vi.png](side-by-side-Rooms-vi.png) | 2420×1016 | Room map, chips, and unassigned group; `G-RM-1`, `G-RM-2` |
| Book | [side-by-side-Book-vi.png](side-by-side-Book-vi.png) | 2420×1016 | Booking form and quote rows; `G-BK-1`…`G-BK-3` |
| Folio | [side-by-side-Folio-vi.png](side-by-side-Folio-vi.png) | 2420×1016 | Folio lines, amounts, and balance; `G-FO-1`, `G-FO-2` |
| Admin | [side-by-side-Admin-vi.png](side-by-side-Admin-vi.png) | 2420×1491 | User, config, and audit cards; `G-AD-1`, `G-AD-2` |

## Living record

- The audit comment stays the authoritative UI-vs-design record: when a desk
  screen changes, refresh its image here and append a dated line to the
  record's change log in the same change.
- `docs/design/*.dc.html` is owner-supplied and read-only; deliberate
  divergences are recorded in the audit comment with their decision link.

## Recorded scope exception

`G-MN-4` is the one finding whose fix ships in the audit PR itself
(#570) instead of a split PR: the DailySheet zero-`asOf` defect was found by
this audit's own evidence. The orchestrator recorded that as a single-case
relaxation of the "audit issues carry no product code" rule in a
[comment on #563](https://github.com/MingChen1501/hotel-mgmt/issues/563#issuecomment-6723063195);
the audit comment's change log carries the matching dated row.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-792
