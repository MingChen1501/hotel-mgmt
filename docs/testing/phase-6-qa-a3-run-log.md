# Phase 6 QA A3 — exploratory pass per FE screen (run log)

Status: active. QA activity A3 from the scoped independent-QA pass
(`docs/testing/phase-6-qa-plan.md`, section 2, Closes #264; this log
Closes #269), owned by `qa-lead`. One time-boxed exploratory session
per FE screen with a front-desk persona, hunting what the scripted
loop misses: confusing flows, misleading wording (checked against the
message catalogue), missing confirmations, and error paths (refusals
name the cause). Every screen leaves a note (screen + scenario +
outcome) even when it finds nothing — "nothing found on screen X" is
a result. Two defects found, filed as Phase 6 - QA bugs in the plan
section 3 format; everything else is an explicit clean bill.

## 0. Build, environment, and method facts

| Fact | Value |
|---|---|
| QA build (master SHA) | `8b6422b` — the same QA build as the A1/A2 logs. `frontend/` is byte-identical to the QA build: its last touch is `02dc438` (`feat(desk): Printable invoice, receipt, and booking confirmation (#261)`), an ancestor of `8b6422b`. HEAD here (`abd7834`) adds only `docs/testing/` logs |
| Seed / hotel config | not applicable — no live stack was started (see below); no seed data was touched |
| Live stack | NOT available on this host: `docker` refuses with `permission denied` on `/var/run/docker.sock` (no sudo, user not in the `docker` group) and no Go toolchain is installed — the same local-harness constraint recorded in the A2 log. No interactive browser run was possible |
| Method (adapted, recorded) | time-boxed static exploratory sessions per screen: full read of each page's markup and inline script as the front-desk persona, walking every flow against the message catalogue (`frontend/messages/en.json`, 488 keys) and the versioned contract ops, plus executed evidence below. Fix verification of the two filed defects belongs to their fix issues (interactive live confirmation there) |
| Executed evidence | `node --check` passes on all 6 extracted inline scripts (desk, book, stay, folio, print, admin); suspect render paths evaluated in `node` (sections 5–6 quote the outputs); `script/catalogue-coverage-check.sh` PASS on this tree |
| Time boxes (min) | desk 15, book 25, stay 30, folio 20, print 25, admin 20 |

## 1. Desk (`frontend/desk.html`) — clean bill

Scenarios walked: sign-in → dashboard refresh → read arrivals /
in-house / departures → cross-check the daily-sheet line → rooms
needing attention (dirty / clean-uninspected / out-of-order) →
sign-out; session-expiry path (`UNAUTHENTICATED` signs out locally
with `desk.today.session_expired`).

- Wording vs catalogue: all static labels carry `data-msg` keys that
  resolve; dynamic strings (`unknown_guest`, `room_ref`,
  `sheet_line`, `no_entries`) go through `DeskMessages.msg` with
  matching fallbacks.
- Error paths: sign-in and refresh failures surface the server
  message in `role=alert` regions; expired sessions return to
  sign-in instead of failing silently.
- Observation (not filed — known and flagged where built): room
  references render as raw IDs (`Room {roomRef}`) because no read
  maps them to numbers; the page's own header comment records this
  as flagged in its PR. Behaviour matches the reviewed design.

Outcome: nothing found — clean bill for the desk screen.

## 2. Booking (`frontend/book.html`) — clean bill

Scenarios walked: find returning guest by name → register walk-in
(actor recorded as the signed-in user) → quote price → double-click
Confirm (replay safety) → read-back → confirmation copy/print →
new booking reset; refusal wordings for unknown guest, no price
(`NOT_FOUND` → `desk.book.refused_noprice`), sold-out (`CONFLICT`
→ `desk.book.refused_soldout`), and booking-rule restriction
(`STATE_ILLEGAL` with restriction detail).

- Confirm carries a client-generated `idempotencyKey` per quote
  plus an in-flight guard and button disable, so a double-click
  replays one booking instead of creating two.
- Missing-input guards (`guest_need`, `no_quote`,
  `guest_notfound`) fire before any contract call.
- Observation (not filed — matches the contract, no spec
  contradiction): room type, rate plan, and discount are free-text
  ID inputs with no picker; a mistyped ID fails at quote time with
  the `refused_noprice` wording, so the failure is guided.

Outcome: nothing found — clean bill for the booking screen.

## 3. Stay (`frontend/stay.html`) — clean bill

Scenarios walked: two-click check-in (first click loads the booking
and filters ready rooms of the booked type; second click commits
`AssignRoom` → `CheckIn` → `CheckInReservation`) → mid-stay move →
actual-time recording → folio review → open-balance approval →
check-out; refusal wordings for unknown reference, no ready rooms,
room just taken (`CONFLICT` → `refused_taken`), already checked in,
and open-balance checkout (`SETTLEMENT_REQUIRED` → same refusal
wording on review and on commit, stay remains in house).

- The move-room picker is filled only from `vacant-inspected`
  rooms, and check-in candidates are filtered to the booked type —
  the screen cannot offer an unready or wrong-type room.
- Stale-context guards verified present: editing the stay-ID input
  clears `checkoutCtx`, hides the approval section, and disables
  Check out; `pickStay` from any list resets the approval flow.
- The final `CheckOut` re-reads the folio and carries the reviewed
  folio id, balance, and approval — the receipt the reviewer sees
  is the receipt the server enforces.

Outcome: nothing found — clean bill for the stay screen.

## 4. Folio (`frontend/folio.html`) — clean bill

Scenarios walked: open folio by stay ID → post room charge and
extra charge → record cash/card payment → running balance re-read
after every mutation; validation wordings for missing stay ID,
missing item/amount, and non-positive payment; `stayId` query-param
prefill.

- Every mutating click carries an in-flight guard, button disable,
  and a client-generated `idempotencyKey`; the balance line always
  re-reads from `GetFolioBalance`, so the screen agrees with what
  the guest owes.
- Unrecognised charge/payment shapes render a `raw_line` fallback
  instead of dropping the line silently.
- Observation (not filed — consistent pattern, no spec requires
  confirm dialogs): posting a charge or recording a payment is a
  single click with no review step; double-submit is guarded, but a
  mistyped amount posts immediately. Same single-click pattern as
  the other mutating screens.

Outcome: nothing found — clean bill for the folio screen.

## 5. Print (`frontend/print.html`) — one defect filed (#276)

Scenarios walked: open folio → show invoice (built with the same
line helpers as the folio view: tax/fee-inclusive totals,
time-sorted entries, recomputed running balance — verified the same
code shape in both pages) → one receipt per payment including the
no-payment-id fallback row → load confirmation by reference
(`reservationRef` query-param prefill supported) → single-document
print CSS (only the active `.print-document` prints, buttons
hidden) → copy-text fallbacks.

Defect: the page-local `esc()` lookup table is keyed `"&lt;"` /
`"&gt;"` instead of `"<"` / `">"`. Evaluated in `node`:

- `esc('Room <101> & "Deluxe"')` returns
  `'Room undefined101undefined &amp; &quot;Deluxe&quot;'` — the
  lookup misses and `String.replace` inserts the string
  `undefined`, corrupting folio lines, invoice/receipt bodies, and
  confirmation text.
- `esc('<img src=x onerror=alert(1)>')` leaves the angle brackets
  intact into `innerHTML` sinks (`invoice-body`, `receipt-body`,
  `confirmation-body`, folio table) — an HTML-injection vector via
  guest/item names. Every sibling screen uses the correct
  single-character keys (verified by grep across all six pages).

Filed as #276 (`fix`, `risk-medium`, major: visible corruption
plus the injection vector, workaround is avoiding `<>` in names).

Otherwise the print flows, refusal surfacing, and the
invoice-matches-folio construction are sound — no further finding.

## 6. Admin console (`frontend/admin.html`) — one defect filed (#275)

Scenarios walked: sign-in → users/roles table (role select,
Save role, Unlock for locked identities) → create account →
role-save / unlock round-trips → read-only audit view (newest
first, 50-entry cap) → refresh → sign-out. Raw server messages
surface in `role=alert` regions, consistent with the other
screens.

Defect: the users-table row template swallows the two intended
catalogue calls inside one single-quoted string, so the buttons
render raw JavaScript source as their labels. Evaluated in `node`
with a locked user, the row contains literally:

- `<button ... class="role-save">" + DeskMessages.msg("desk.admin.save_role", {}, "Save role") + "</button>`
- `<button ... class="unlock">" + DeskMessages.msg("desk.admin.unlock", {}, "Unlock") + "</button>`

instead of `Save role` / `Unlock`. The catalogue keys exist
(`desk.admin.save_role`, `desk.admin.unlock`) but are never called
for these buttons. The buttons still function (handlers key off
CSS classes), so this is a wording defect, not a dead control.

Filed as #275 (`fix`, `risk-low`, minor).

Otherwise the console flows and the audit read-only note are
accurate — no further finding.

## 7. Defects

Two deviations found, each filed as one issue under the
`Phase 6 - QA` milestone in the plan section 3 format (no fix lands
here — plan section 4 routes fixes to their phase milestones):

- #275 `[fix] Render the Save role and Unlock labels on the admin console` (`fix`, `risk-low`, minor): users-table buttons show JS source text instead of `Save role` / `Unlock`.
- #276 `[fix] Escape angle brackets in the print view escaper` (`fix`, `risk-medium`, major): `<>` renders as `undefined` and unescaped markup reaches `innerHTML`.

## 8. Acceptance mapping (issue #269)

| Screen | Notes | Bugs filed or clean bill |
|---|---|---|
| desk | section 1 | clean bill (raw room-ID display is known/flagged, not filed) |
| book | section 2 | clean bill |
| stay | section 3 | clean bill |
| folio | section 4 | clean bill (single-click posting noted, not filed) |
| print | section 5 | #276 |
| admin console | section 6 | #275 |

Evidence cited: QA build SHA + frontend-tree equivalence and the
executed `node`/gate outputs in section 0; evaluated render
outputs in sections 5–6; bug issues #275/#276 for the two
findings. Reviewer APPROVE is the remaining gate.

## 9. Gate observation (not filed — hardening suggestion for the owning roles)

`script/catalogue-coverage-check.sh` passes on this tree, yet
neither defect above trips it: the admin literal hides inside a
valid string (the gate checks referenced keys, not that dynamic
labels resolve through the catalogue), and the escaper typo is a
runtime key-shape bug no catalogue gate asserts. A future
`dev`-side guard (e.g. render the users table and the escaper
against fixed fixtures in CI) would close this hole. Left as a
suggestion, not a bug — the gate behaves as specified.

## 10. Exit linkage

This log plus the cited evidence (build SHA, tree-equivalence
proof, executed outputs, per-screen notes) is the A3 record for
QA-plan exit criterion 1 (per-screen exploratory notes) and feeds
criterion 2 (bugs #275/#276 filed in the section 3 format).
A1/A2/A4 batches are separate issues and are out of scope here.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-350
