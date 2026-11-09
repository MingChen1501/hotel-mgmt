# #588 Stay check-out release and unpaid-close gate — evidence

Before/after side-by-side renders plus the lab reproduction record for
[issue #588](https://github.com/MingChen1501/hotel-mgmt/issues/588)
(`AC-DSK-18`, `FR-CKO-1`..`FR-CKO-5`, `BR-17`, `BR-18`). Left half of
every image is the pre-fix build (session root `b6ed638`, master), right
half is this change.

## What each pair shows

| Pair | Before | After |
|---|---|---|
| `stay-checkout-board-*` (symptom 1) | After a successful close the Main board still lists the departed room in the occupied lane (`Đang có khách (1)`, EN `Occupied (1)`) and the Rooms map chip still reads occupied. No surface can repair it: the room record itself is still `occupied` and no screen calls `ReleaseRoom`. | The departed room leaves the occupied lane and appears in the dirty lane with a plain room-released line on the panel; the Rooms map chip reads `Phòng bẩn` / `Dirty`. Both read the corrected state on their own load — no manual desk reload. |
| `stay-unpaid-close-*` (symptom 2, stale state) | The review-time gate is the only gate: the folio read `0.00` at review, a charge lands, the close still opens the confirm dialog, and the close request goes to Stay (which refuses `SETTLEMENT_REQUIRED`). The stale `The balance is zero. Check-out is clear.` line stays on screen next to the refusal, and the approver-role field is free text. | The confirm re-reads the folio and refuses locally: no `CheckOut` is sent, the stale clear line is gone, the approver role is a fixed select, and the refusal names the approval next step with the approval form open. |
| `stay-unpaid-approval-*` (symptom 2, bypassed) | An open balance (`1200.00`) closes through an approval recorded with the free-text role `night-auditor`; the panel only says `Approval recorded.`, so the exception is silent and any role string stands in for an authorised approver. | The approver role is the fixed hotel-role select and the recorded exception is visible: `Approved by manager (Owner) at 02:40.` / `Người duyệt manager (Chủ) lúc 02:40.` |

Both locales are captured: `*-en.png` and `*-vi.png`.

## Capture method

- Isolated compose lab `-p hotel-lab-875` (isolated project and
  volumes, proxy published on host port 8750 so the owner's live lab
  keeps port 80), hotel set applied from
  `deploy/config/hotel.example.json` with a lab-only property code,
  signed in as `owner` with a lab-only boot secret. Data is seeded per
  run through the public contract (`UpsertGuest`, `UpsertRoomType`,
  `UpsertRoom`, `UpsertRatePlan`/`UpsertRatePrice`, `CreateReservation`,
  `PostCharge`).
- The fixed half is this branch's `app/dist` served by the lab proxy.
  The pre-fix half is the master build of `app/dist` served from a
  loopback static server on port 8751 that proxies `/v1/*` to the same
  lab, so both halves read one backend (same technique as the #586
  evidence `stay-checkin-*` pair).
- The lab database is reset (fresh isolated volumes, migrations, boot
  seed, hotel set) before every captured state and locale, so each
  board carries only that run's data.
- Chromium (Playwright 1.64.1), 1280px viewport, element screenshots of
  the Main board (`desk-board`) and the check-out card
  (`stay-checkout-card`), paired across a 20px gutter with a label bar.
  Each image is board/card left = before, right = after; the same
  seeded guest name and room number appear in both halves.

## Reproduction record (before the fix)

Symptom 1 — the room still reads occupied after a successful check-out.

- Screen: `/app/stay` check-out panel, then `/app/` and `/app/rooms`.
- Steps: pick the arrival, check in, pick the departing stay, post one
  `nightly-room-charge` of `120000` through Billing (the desk panel has
  no charge action), Review folio, record an approval, Check out,
  confirm the dialog.
- Observed: `POST /v1/stay/CheckOut` with
  `{"folioBalanceMinor":120000,"openBalanceApproval":{"approvedBy":"manager","role":"night-auditor","reason":"","approvedAt":"2026-11-09T19:39:23Z"}}`
  → `200`; **no** `POST /v1/rooms/ReleaseRoom` anywhere in the run. The
  Main board occupied lane still lists the departed room, the Rooms map
  chip reads `Occupied` / `Đang có khách`, and a manual reload changes
  nothing because the room record itself is `occupied`.
- Classification: **missing** — the screen never performs the release
  obligation the API desk loop performs explicitly
  (`script/e2e-desk-loop.sh:422-423`). Not staleness and not a bypass.

Symptom 2 — check-out succeeds without payment.

- (a) **Bypassed.** Screen `/app/stay`. Steps: review an open balance,
  type `night-auditor` into the free-text approver-role field, Record
  approval, Check out. Observed: `RecordOpenBalanceApproval` accepts the
  arbitrary role, the panel only says `Approval recorded.`, and the
  close succeeds. `BR-17` defines an approval as the recorded identity,
  the role the approver holds, and when; the desk let any text stand in
  for it and never showed the record.
- (b) **Stale state.** Steps: review a folio at `0.00`, then post a
  `120000` charge through Billing, then Check out and confirm. Observed:
  the button stayed enabled from the review-time state, the dialog
  confirm was not gated, and `POST /v1/stay/CheckOut` carried the fresh
  `folioBalanceMinor: 120000` with no approval; Stay refused
  `SETTLEMENT_REQUIRED`, so that particular close did not commit, but
  the screen kept the stale `The balance is zero. Check-out is clear.`
  line beside the refusal and the desk itself enforced nothing.
- (c) **Missing (charge posting).** Steps: check in, review the folio
  (`0.00`), Check out. Observed: the close commits with nothing paid for
  the room, in both builds. `BR-17` lets a zero balance pass, and the
  desk flow never posts a room charge, so this half is a charge-posting
  obligation outside the desk UI — recorded here and filed as a
  follow-up, not changed by this fix.
- (d) **Server trust.** Stay's gate trusts the client-supplied balance
  and any approval object. Defence-in-depth only; out of scope under the
  owner's UI-first constraint and filed as a follow-up.
- Classification for this change: **bypassed** (closed by decision 5:
  fixed role select, provenance check, visible approver) plus **stale
  state** (closed by decision 4: fresh read at confirm, review-time
  fallback removed, confirm gated). `missing` and `server trust` are
  follow-ups.

## After the fix (lab re-check)

- Symptom 1: `POST /v1/rooms/ReleaseRoom`
  `{"roomNumber":"QA-588-boardafter-…","toState":"vacant-dirty","actor":"Owner"}`
  follows the close, the panel shows `Room … is now vacant and dirty.` /
  `Phòng … đã chuyển sang trống, cần dọn.`, the board occupied count drops
  to 0 with the room in the dirty lane, and the Rooms chip reads
  `Dirty` / `Phòng bẩn`.
- Symptom 1, desk lists: the reload the close performs drops the guest
  from the in-house list while the departing list keeps today's checkout,
  so the panel no longer shows the guest in house without a manual
  reload. The browser case reads both lists back after the close
  (`ListArrivalsDepartures`, `app/e2e/stay.spec.ts:121-135`) and the
  component guard pins the refreshed departing rows
  (`app/src/views/StayView.test.ts:1122-1139`).
- Symptom 2: the stale close now refuses on the desk's own fresh read
  with no `CheckOut` sent; the approval route records and shows
  `approvedBy`, the hotel role, and the recorded time.

## Gate notes

- No design fact changes: the approval block, the confirm dialog and the
  check-out status/release rows are flow state outside the fact schema,
  and `app/e2e/design-facts.spec.ts` stays green with no fact edit.
- The panel's resting render is unchanged, so the #563 living record
  (`docs/testing/evidence/563/README.md`) needs no refreshed pair.
- These PNGs are flow-state evidence only; no screenshot, snapshot, or
  video API enters the DOM-vs-design gate.
