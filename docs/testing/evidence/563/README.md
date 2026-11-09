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
  `side-by-side-shell-nav-vi.png` was refreshed for the `G-SH-1` /
  `G-SH-2` fix (#564) in that PR: the live half now measures the
  design's 60px single row at 1200px, with the compact `VI | EN` pill
  and the closed account disclosure's `Tài khoản` trigger at the end of
  the row (the panel is an overflow layer, so the capture shows the
  bar, not the open menu). That refresh used the built bundle with the
  hotel-config read answered locally (the shell half carries no
  per-screen data), the same technique as the gate image below, and
  keeps the audit's configured hotel name so the pair stays
  comparable.
- `app-signin-gate-vi.png` was refreshed for the `G-SH-3` fix (#571) from the
  built bundle at 1200px in `vi`: the gate frame is signed out and carries no
  backend data, so the boot config call was answered locally instead of
  standing up a lab (Chromium, viewport 1200×1000, locale pill switched to VI
  before load).
- `side-by-side-Book-vi.png` and `side-by-side-Folio-vi.png` were refreshed
  for the `G-BK-2` / `G-FO-2` fix (#565) from an isolated compose lab
  (`hotel-lab-804`, isolated project and volumes, example data seeded through
  the public contract, signed in as `owner` with a lab-only boot secret) and
  the built app bundle at 1200px in `vi` (Chromium, viewport 1200×1016). The
  live halves now show the design money/date shape: the Book quote reads
  `Đêm 08/12/2026: 1.200 đ` / `Tổng cộng: 2.400 đ` instead of raw ISO dates
  and two-decimal figures, and the Folio lines and balance read `12.000 đ` /
  `6.000 đ`. Values are unchanged; the capture data mirrors the pre-fix image
  (same guest, dates, and amounts) so only the presentation differs.
- `side-by-side-Book-vi.png` was refreshed for the `G-BK-1` fix (#566) from
  an isolated compose lab (`hotel-lab-813`, isolated project and volumes, boot
  seed plus a lab-only rate plan, signed in as `owner` with a lab-only boot
  secret) and the built app bundle at 1200px in `vi` (Chromium, viewport
  1200×1016). The arrival/departure fields are now text fields bound to the
  desk form: the live half shows `08/12/2026` / `10/12/2026` — the design's
  `dd/mm/yyyy` shape (`docs/design/Book.dc.html:3` draws `29/10/2026` /
  `31/10/2026`) — instead of the native picker's `12/08/2026` (mm/dd/yyyy)
  and clock icons. The capture data mirrors the pre-#565 image (same guest,
  dates, and amounts) so only the field shape differs; the submitted payload
  stays the canonical ISO date.
- `side-by-side-Stay-vi.png` was refreshed for the `G-ST-1` fix (#567) from
  the built app bundle at 1200px in `vi` (Chromium, viewport 1200×1016) and
  the design board at the same width. The reviewer field is a panel control,
  so the live half needed no flow state: the Stay panel reads were answered
  locally with the board's example arrival/departure rows instead of standing
  up a lab. The live half now shows the reviewer as a role select whose
  options carry the catalogue labels (`Quản lý` / `Chủ` / `Lễ tân`) instead
  of a free-text input. The board half draws `Người duyệt` as a prefilled
  text input (`Quản lý ca`, `docs/design/Stay.dc.html:3`), so the select is a
  deliberate divergence requested by #567 and recorded in the audit record.
  The pair also shows the current shell (the #564 account disclosure), so the
  pre-fix image's older shell is superseded too.
- `side-by-side-Folio-vi.png` was refreshed for the open-folio context fix
  (#568) from the built app bundle at 1200px in `vi` (Chromium, viewport
  1200×1016) and the design board at the same width. The Folio screen opens
  through a stay-ID read, so the live half's reads were answered locally with
  the board's example folio (guest `Lê Minh`, room `201`, `Tiền phòng 2 đêm`
  `1.800.000 đ`, `Nước uống` `60.000 đ`, `Tiền mặt` `900.000 đ`, balance
  `960.000 đ`) instead of standing up a lab — the same technique as the Stay
  pair. The live half now titles the charges card `Khoản phí · Lê Minh ·
  P.201` like the board; before the fix it kept a static `Khoản phí` and
  named the stay only through opaque IDs in the closed reference disclosure.
- `side-by-side-Admin-vi.png` was refreshed for the `G-AD-1` fix (#569) from
  the built app bundle at 1200px in `vi` (Chromium, viewport 1200×1000) and
  the design board at the same width. The Admin screen reads account, config,
  and audit state, so the live half's reads were answered locally with the
  board's example activity rows (`an.nguyen`, `binh.tran`, `hoa.pham`) instead
  of standing up a lab — the same technique as the Stay and Folio pairs. The
  live half now shows catalogue VI summaries and short desk times (`09:12`
  today, `Hôm qua` yesterday, `dd/mm/yyyy` before that) instead of dotted
  event names and ISO timestamps; the raw action, entity, and timestamp stay
  behind the reference disclosure. The pair also shows the current shell (the
  #564 account disclosure), so the pre-fix image's older shell is superseded
  too.

## Images

| Screen | File | Size | Shows |
|---|---|---|---|
| Shell/nav | [side-by-side-shell-nav-vi.png](side-by-side-shell-nav-vi.png) | 2420×111 | 60px board header vs the restored 60px single-row app header; nav labels and order; compact `VI \| EN` pill; `G-SH-1`, `G-SH-2` fixed |
| Sign-in gate | [app-signin-gate-vi.png](app-signin-gate-vi.png) | 1200×1000 | App-only gate state; refreshed for `G-SH-3` (#571) — the locale pill now reads dark ink on the pale gate |
| Main | [side-by-side-Main-vi.png](side-by-side-Main-vi.png) | 2420×3394 | Desk cards and daily-sheet line; `G-MN-1`…`G-MN-4` |
| Stay | [side-by-side-Stay-vi.png](side-by-side-Stay-vi.png) | 2420×1016 | Two-panel check-in/check-out; refreshed for `G-ST-1` (#567) — the reviewer field is now a catalogue-labelled role select (`Quản lý` / `Chủ` / `Lễ tân`) instead of free text; `G-ST-1`, `G-ST-2` |
| Onboarding | [side-by-side-Onboarding-vi.png](side-by-side-Onboarding-vi.png) | 2420×1016 | Setup wizard vs the board's setup panel; `G-OB-1` |
| Rooms | [side-by-side-Rooms-vi.png](side-by-side-Rooms-vi.png) | 2420×1016 | Room map, chips, and unassigned group; `G-RM-1`, `G-RM-2` |
| Book | [side-by-side-Book-vi.png](side-by-side-Book-vi.png) | 2420×1016 | Booking form and quote rows; refreshed for `G-BK-1` (#566) — the arrival/departure fields show the desk `dd/mm/yyyy` form (`08/12/2026` / `10/12/2026`) instead of the browser-locale native picker; quote rows keep the `G-BK-2` `dd/mm/yyyy` dates and VND `đ` amounts; `G-BK-1`, `G-BK-2`, `G-BK-3` |
| Folio | [side-by-side-Folio-vi.png](side-by-side-Folio-vi.png) | 2420×1016 | Folio lines, amounts, balance, and the open folio's guest/room in the charges-card title; refreshed for #568 — the title reads `Khoản phí · Lê Minh · P.201` like the board, while lines and balance keep the `G-FO-2` `đ` shape; `G-FO-1` |
| Admin | [side-by-side-Admin-vi.png](side-by-side-Admin-vi.png) | 2420×1491 | User, config, and audit cards; refreshed for `G-AD-1` (#569) — audit rows read catalogue VI summaries and short desk times (`09:12`, `Hôm qua`, `dd/mm/yyyy`) instead of dotted event names and ISO timestamps, with the raw values behind the reference disclosure; `G-AD-1`, `G-AD-2` |

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
Role: dev · AO session hotel-mgmt-834
