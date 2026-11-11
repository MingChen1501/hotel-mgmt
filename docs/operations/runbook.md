# Runbook — daily operations for the hotel owner and manager

Status: active. Step-by-step operating procedures for the hotel-mgmt
MVP, owned by `release-manager` (Closes #63). Written for a
non-technical hotel owner or manager: no command lines, no
jargon — if a step needs technical help, it says so. The backup
schedule, retention, and verification rules behind this runbook are
in `docs/operations/backup-dr.md`; install and upgrade detail is in
`docs/devops/deployment.md`.

## 1. Daily check: did the backup run?

Once a day (for example, at opening), open the backup report on the
desk screen and confirm all three:

1. Last night's backup shows **success** with yesterday's date and
   time — 100% of backup runs produce a visible success-or-failure
   report (`NFR-BKP-2`).
2. The success is recent (within the last 24 hours — RPO at most
   24 hours, `NFR-BKP-1`).
3. No failure message is showing.

If the report shows **failure**, or shows nothing recent, do not
wait: note the message word for word and call support (section 7).
A backup without a success report counts as failed.

## 2. Reading the success/failure report

The report always shows one of two outcomes in plain words:

- **Success, with date and time** (for example, "Backup succeeded
  at 02:14 on 22 Oct"): the hotel's reservations, stays, folios,
  and payments are safely copied. Nothing further to do.
- **Failure, with date, time, and a reason** (for example,
  "Backup failed at 02:14 — storage not reachable"): the copy did
  not happen. Desk work continues normally, but the hotel has no
  fresh restore point. Call support the same day (section 7) —
  the backup target is to succeed at least 6 days out of 7
  (`NFR-BKP-1`).

## 3. Restart order (after a power cut or a freeze)

If the system is down or frozen, restart in this order and wait for
each step to finish before the next:

1. The database host (the box holding the hotel's data).
2. The module containers (the boxes or the same box running the
   desk functions).
3. The reverse proxy (the entry point the desk screens connect
   to).

For the single-host default all three live on one box, so this
means: switch the box on, wait until the desk sign-in screen
appears, and sign in. For the small-cluster variant, switch the
hosts on in the order above. If the sign-in screen does not appear
within a reasonable wait, call support (section 7) — do not
repeatedly switch boxes on and off.

## 4. Desk-offline behaviour (internet outage)

The desk keeps working through an internet outage (`NFR-AVL-1`):
booking, check-in, check-out, charge posting, payment recording,
and invoice printing all complete on the on-premise installation
exactly as when connected, because everything runs on the hotel's
own equipment. Staff should simply keep working. What does not
work during an outage is anything outside the property — and the
MVP has no such functions (no online booking, no OTA, no payment
provider sync). If a desk action fails while the internet is down,
treat it as a system fault, not as an internet problem, and call
support (section 7).

## 5. Restore from backup (RTO 4 hours)

When the installation has failed and support confirms a restore is
needed, the target is: the system is operable again within 4 hours
on equivalent on-premise hardware (`NFR-BKP-2`). The owner or
manager does the following with support on the phone:

1. Confirm which backup to restore from: the newest backup with a
   verified success report (see `docs/operations/backup-dr.md`,
   section 4).
2. Confirm equivalent hardware is ready (the same box repaired, or
   a replacement box on the hotel LAN).
3. Let support reinstall the release bundle, re-apply the hotel's
   configuration set, and load the backup.
4. Sign in as the owner, check today's arrivals list, one
   in-house stay, and today's day-close totals against the paper
   or printed records, and confirm the hotel's own name, rooms,
   and prices are showing.
5. Only then resume desk work, starting with any bookings taken on
   paper while the system was down.

The hotel loses no more than one operating day of data (`NFR-BKP-1`):
every reservation, stay, folio, and payment recorded at least 24
hours before the failure is present after the restore.

## 6. Booking refused: the room type has no rate price

When the desk tries to price a stay for a room type that has no rate
price for the selected dates, the booking is refused. This is
deliberate: a room type without prices is **not open for booking
yet**, so the hotel never sells an unpriced stay.

What the desk sees:

- The Book screen says the room type has no rate price for the
  selected dates, so it is not open for booking yet, and the room
  type is marked **not open for booking** in the type list and on the
  stay card.
- No confirm action appears, so no booking can be created for that
  room type and those dates.

What to do:

1. Do not promise the room at a guessed price. If the guest insists,
   take the booking on paper and price it once the rates are set.
2. Ask the manager to set the room type's rates: one rate plan plus
   one nightly price for every night sold. The rates setup screen is
   not part of this release yet (issue #590); until it ships, support
   applies the prices through the API (below).
3. If the room type already has prices for those dates and the desk
   still sees the refusal, treat it as a system fault and call
   support (section 7).

Interim workaround for support and QA (API, until the rates setup
screen ships, issue #590): sign in as an owner, then call
`POST /v1/rates/UpsertRatePlan` once for the property's rate plan and
`POST /v1/rates/UpsertRatePrice` once per night per room type. The
payloads are the ones the desk-loop script already uses
(`script/e2e-desk-loop.sh`, the rates step). Setting prices never
changes an existing booking: a confirmed booking keeps the price it
was booked at.

A refusal that says the price could not be read is a different case:
the rate is set and the pricing part of the system did not answer. That
is section 10.2, and the desk keeps the quote it showed while it
retries.

## 7. When to call support (escalation contacts)

Call support the same day when any of these happen:

- A backup failure report (or no recent success report).
- The system does not come back after the restart order in
  section 3.
- A desk action fails during an internet outage.
- A failed upgrade that the delivery team cannot fix within the
  working day (rollback is in `docs/devops/deployment.md`,
  section 6).
- A sign-in that says an identity is locked after 5 wrong secrets
  (`NFR-SEC-2`): do not keep retrying. The owner or the manager
  unlocks the locked identity, then the locked person signs in
  again with the correct secret. If no owner or manager sign-in is
  available, call support with the locked identity name and the
  time of the last successful sign-in.
- Anything that looks like wrong money figures (folio, invoice,
  or day-close totals that do not match).
- A booking or booking change refused because the price could not be
  read, after one retry also refused (section 10.2) — the pricing part
  of the system is not answering and the desk cannot book until it does.
- A booking whose saved total does not match the hotel's rates,
  including one saved before this release (section 10.3).
- A guest who checked out still shows as checked in in the booking
  history or the calendar, or their booking still stops the room type
  from being sold (section 8.2).
- A check-out where the panel reported the guest checked out but also
  said the booking could not be marked completed (section 8.2).
- A room that reads **Occupied** with **Unknown guest** and no guest in
  it — the room-side stuck case an interrupted check-in or room move
  leaves behind (section 9).
- A panel sentence that names a room still reading occupied after a
  refused check-in or a room move (section 9).

Escalation contacts (placeholders — fill in per sale before
handover):

- Level 1, hotel's delivery/support contact: _[name, phone,
  email]_ — first call for all of the above.
- Level 2, product support: _[name, phone, email]_ — if Level 1
  does not respond within _[response time]_.
- Level 3, on-site visit: _[arrangement]_ — if the fault needs
  hands on the hotel's equipment (target: operable again within
  4 hours, `NFR-BKP-2`).

When calling, have ready: the hotel name, what happened and when,
the exact words of any failure message, and the date and time of
the last successful backup.

## 8. Same-day reuse of a departed room

After a guest leaves, the room is turned over through housekeeping and
can be sold again the same day. Section 8.1 is that normal path.
Section 8.2 is the case where a booking from before the upgrade still
reads as checked in and needs support. Section 9 is the room-side
counterpart of 8.2: a room that reads occupied while nobody is in it.

### 8.1 Selling a room again the same day

1. Check the guest out as usual (the check-out review, then confirm).
   On a committed check-out the panel says the guest is checked out,
   and the room is released as **dirty**.
2. On the Rooms screen, press **Mark cleaned** on that room once
   housekeeping has cleaned it. The room then reads as waiting for
   inspection.
3. Press **Mark inspected** on the same room once it has been
   inspected. Only now is the room ready to be given to a guest: a
   dirty room, or one that is only cleaned, is never offered for
   check-in.
4. Take the new guest's booking for the same room type with arrival
   today. It is accepted: the guest who left no longer counts as an
   active booking for these dates, even when their booking was
   recorded with a later departure date (an early departure).
5. On the Stay screen, pick the new booking, choose the ready room,
   and check the guest in.

Notes:

- Nothing has to be edited behind the screens and no room state has to
  be set by hand. The steps above are the whole turnover.
- Do not skip the inspection step. Moving a guest into a dirty or
  only-cleaned room is refused, deliberately, because the room is not
  ready.
- The departed guest's booking stays in history as a **completed**
  booking, and the calendar shows it as completed, not as an active or
  checked-in booking.

### 8.2 A guest who left still shows as checked in

What you see: the guest checked out (the stay is closed and the room
was released), but the booking behind that stay still shows as
checked in — in the booking history and in the calendar — and it still
counts as an active booking, so the room type can read as sold out for
dates the departed guest no longer occupies.

When this can happen:

- A booking whose stay was checked out **before** this release. From
  this release onward a check-out completes the booking itself, so a
  normal check-out no longer leaves this behind.
- A check-out where the panel said the guest was checked out but also
  said the booking could not be marked completed. The panel says that
  in plain words and never claims the booking is completed.

What to do:

1. Do not try to check the booking in, modify it, cancel it, or mark
   it no-show. The desk has no control to reopen or edit a departed
   booking, and the system refuses those actions; trying only adds
   noise to the history.
2. If the room type must be sold today and this booking is the only
   reason it is being refused, take the new booking on paper with the
   guest's name, room type, dates, and rate, and tell the guest the
   confirmation follows. Do not invent availability and do not edit
   the stuck booking to free the room.
3. Call support the same day (section 7) with the guest's name, the
   booking reference, the dates, the room, and the time of the
   check-out. Support completes the stuck booking with the same step a
   normal check-out performs; the paper booking is then entered
   normally.
4. Keep a list of the affected bookings until they are repaired. They
   are the only booking rows an upgrade leaves behind: no automatic
   repair ships with this release. Rooms an older bundle stranded are
   the room-side rows of the same upgrade, and section 9 is their
   procedure.

Delivery team note (at an upgrade): before handing the desk back,
read the reservation calendar for the upgrade date and the next
business day and check every booking that still reads as active while
its stay is already closed, using the support steps below. Repair
those rows before the hotel opens, then tell the front desk which
bookings were repaired.

Support note (technical): never edit the database by hand for this.
The repair is the shipped completion call, and it is safe because it
records the same change a normal check-out records:

1. `POST /v1/reservations/GetReservation` with `{reservationRef}`.
   Read `stayId` (null means the booking never checked in, so it is
   not this case) and `state` (`checked-in` is the stuck state;
   `closed` needs nothing).
2. `POST /v1/stay/GetStay` with `{stayId}`. The stay **must** read
   `closed`: that proves the guest actually left. If it reads
   `in-house`, stop — the guest is still in house and completing the
   booking would wrongly release the room and the availability unit.
3. `POST /v1/reservations/CheckOutReservation` with
   `{stayId, actor}`, using the owner account as `actor`. `200` with
   `state: "closed"` completes the booking; a second call returns the
   same body with no second change; `STATE_ILLEGAL` means the booking
   is not `checked-in` and nothing was written; `NOT_FOUND` means the
   `stayId` does not match a booking.
4. Re-read the booking (`GetReservation`) and confirm `closed`, then
   confirm the room type sells for the dates in a test read.

Record the booking reference, the stay, and the actor in the ticket.
The completion only runs on a close from this release onward; finding
these rows without a support call is the D6 reconciliation follow-up
(`docs/architecture/lld.md`, section 22.7), not a silent data
correction.

## 9. A room that still reads occupied with nobody in it

A room reads **Occupied**, no guest is in it, and the main board's
in-house list names no guest for it. The desk cannot give the room to the next
guest, and the Rooms screen and the main board's room map keep showing
it as taken. This is the room-side counterpart of section 8.2: a
check-in or a room move set the room aside for a guest, the last step
never finished, and nothing ever gave the room back.

### 9.1 What you see

- The **Occupied** chip with **Unknown guest** under it and no checkout
  date, on the Rooms screen and on the main board's room map.
- No guest in that room on the main board's in-house list (the guests
  in house today).
- The room is never offered in the check-in panel's room list, so an
  arriving guest cannot be checked into it.
- At the moment it happened the panel may have said so in plain words,
  for example "The check-in was refused, but room 101 still reads
  occupied. Reload the desk, and tell the manager if it still shows
  occupied.", or after a room move "The guest is now in room 102, but
  room 101 still reads occupied. ...".

When this can happen:

- A check-in or room move that was refused or interrupted **before this
  release**, after the desk had already set the guest's room aside.
  Nothing repaired those rooms, so they keep reading occupied.
- A check-in or room move from this release onward whose last step could
  not be finished — the desk was closed, the connection dropped, or the
  panel named the room that still reads occupied.

### 9.2 What to do at the desk

1. Do not move a guest into that room, and do not look for a button
   that clears it: an occupied card carries no housekeeping button at all
   (**Mark cleaned** appears only on a dirty room, **Mark inspected**
   only on a cleaned one), and the desk has no action that frees an
   occupied room. Do not edit room state by hand either — doing so loses
   the record of what happened. None of those steps gives back a room
   that was set aside for a guest who never arrived.
2. Confirm nobody is in the room: check the main board's in-house list
   and, if there is any doubt, look at the room. If a guest *is* in it,
   the room is correct, nothing is wrong, and nothing needs clearing.
3. If nobody is in it, write down the room number, the time of the
   refused or interrupted action, and the exact words the panel showed,
   then call support the same day (section 7).
4. Until support clears the room, treat it as unavailable: give the
   arriving guest another ready room of the same type. If that would
   lose the booking, take it on paper with the guest's name, room type,
   dates, and rate, and tell the guest the confirmation follows (the
   same rule as section 8.2 step 2).

Support frees the room in the state that matches what actually
happened:

- **Nobody ever entered it** (a check-in that did not land): back to
  **Ready (inspected)**, the state it held before it was set aside, so
  the room is still sellable today.
- **A guest stayed in it and was then moved out of it**: to the
  housekeeping state **Dirty**, then **Mark cleaned** and **Mark
  inspected** on the Rooms screen (section 8.1 steps 2-3).
- Never the other way round: sending an unused room to housekeeping
  loses a ready room and misstates the history, and leaving a used room
  reading ready would offer it to the next guest.

### 9.3 Delivery team note (at an upgrade)

Before handing the desk back, clear the rooms an older bundle stranded:

1. On the Rooms screen, list every room reading **Occupied** with
   **Unknown guest**, and compare it with the main board's in-house
   list.
2. For each one, confirm with the front desk that nobody is in the room,
   then clear it with the support step below in the state 9.2 names
   (ready if nobody ever used it, dirty if a guest slept there and was
   moved out).
3. Record the room number, the time, and the actor in the upgrade
   record, then tell the front desk which rooms were cleared.

No automatic repair ships with this release: this pass clears the rooms
already in the database, and the released desk stops creating new ones
except in the desk-closed or unreadable case 9.4's last paragraph names.
The booking-side counterpart of this note is section 8.2's delivery
team note.

### 9.4 Support note (technical)

The desk's own comparison is the one at
`app/src/views/RoomsView.vue:384-393` and
`app/src/views/DeskView.vue:904-914`: an occupied room that no in-house
stay names renders **Unknown guest** (`messages/en.json:365`,
`messages/vi.json:365`).

1. `POST /v1/rooms/ListRoomsByState` with `{state: "occupied"}`. Each
   room carries `roomId`, `number`, and `state`; the list does not
   expose the room's `stayLink`.
2. `POST /v1/stay/ListArrivalsDepartures` with
   `{businessDate: <today>}`. The `inHouse` rows carry the room as
   `roomId` (`app/src/views/StayView.vue:980-996` reads it that way). A
   room from step 1 that no `inHouse` row names is the stranded room. If
   an in-house row names it, a guest is in it: stop, and never free a
   room a live stay names.
3. Ask the desk whether the guest ever entered the room; that answer
   decides the release target (see 9.2): `vacant-inspected` for a room
   nobody used, `vacant-dirty` for a room a guest slept in and then
   left.
4. `POST /v1/rooms/ReleaseRoom` with
   `{roomNumber, toState: "<target>", actor: "<owner account>"}`. `200`
   returns `oldState` and `newState`; `STATE_ILLEGAL` means the room no
   longer reads occupied (already cleared, nothing written); `NOT_FOUND`
   means no room carries that number.
5. Re-read `ListRoomsByState` for the target state and confirm the room
   is there and no longer in `occupied`. Record the room number, the
   previous state, the target state, the actor, and the time in the
   ticket.

Why this call and not another: `ReleaseRoom` is the only operation that
takes a room from `occupied` to `vacant-inspected`, and it accepts the
explicit `toState` (`services/rooms/src/store.ts:407-436`; the allowed
transitions let `UpdateRoomState` move `occupied` only to
`vacant-dirty`, `:32-40`). The release writes the state-history row and
the state-changed event the audit trail needs. Never edit the database
by hand, and never free a room a live stay names.

The one case the released desk can still leave behind is LLD section
23.9's R12 — the desk closed or the reply unreadable between setting a
room aside and finishing the action. The steps above clear it, which is
why no data backfill or migration is needed.

## 10. Booking refused: the price could not be confirmed

This release checks the price of a stay against the hotel's own rates at
the moment the booking is saved, and freezes the price it finds. The
normal case changes nothing on the desk: the Book screen already quotes
the stay before the clerk confirms, so the saved total is the total the
clerk saw. Two refusals are new, and both of them save nothing — no
booking, no room held, no guest charged.

### 10.1 "The rate changed while you were booking"

**What you see.** The clerk confirms a booking and the screen says, in
those plain words, that the rate changed while you were booking, shows
the new total, and asks for a second confirmation. Nothing was booked
yet, and no room is held.

**What to do:**

1. Read the new total to the guest. It is the price in force for those
   dates, taken from the hotel's rates.
2. Press the confirm button once more. Only that second confirmation
   books, and it books at the total the screen shows. Pressing twice by
   accident still books once.
3. If the guest does not accept the new total, do nothing further:
   nothing is booked, nothing is held, and the guest owes nothing.
4. If the second confirmation shows the same sentence with another new
   total, or the total keeps moving while the guest waits, stop and
   call support (section 7). Do not book at an older total.
5. If the screen instead says the price could not be re-read and
   nothing was booked — or shows the no-rate-price sentence from
   section 6 — the desk could not fetch the price after the change.
   Book nothing further, follow section 10.2 steps 3 to 5 for the guest,
   and call support (section 7).

The total on the booking, on the printed confirmation, and in the
booking history is always the total the screen confirmed: the desk never
books a price it has not shown.

### 10.2 The booking is refused: the price could not be read

**What you see.** The booking is refused with the panel's plain error
sentence, the screen keeps the quote it was showing, and nothing was
booked and no room is held. A booking change can be refused the same
way.

**What to do:**

1. Wait a minute and confirm again. Sending the same booking again is
   safe: a repeat never books twice, and it costs nothing to retry.
2. If it keeps refusing, the pricing part of the system (the rates
   module) is not answering. Do not price the stay from memory, from an
   old printout, or from a total written on paper: a booking saved at a
   guessed price is exactly what this release prevents.
3. If the guest insists on booking now, take the booking on paper and
   price it once the system answers — the same rule as section 6, step
   1 — and tell the guest the confirmation follows.
4. Call support (section 7). While this lasts the desk can look up
   bookings, cancel, check guests in, and check guests out; it cannot
   book or change bookings. Do not restart boxes over and over: the
   restart order in section 3 applies, and support decides whether a
   restart is the right step.
5. Write down the exact sentence from the screen, the room type, the
   dates, and the time, for the support call.

### 10.3 A booking saved before this release looks the wrong price

Bookings saved **before** this release were not checked against the
rates. They keep the total they were saved with, and this release does
not rewrite them: there is no automatic correction, no bulk correction,
and no repair pass at the upgrade.

**What to do:**

1. If a booking's total looks wrong, tell the manager and call support
   (section 7). Do not edit the booking at the desk and never change a
   figure in the database.
2. When staff next change that booking — dates, room type, guest, or
   discount — the change re-prices it against the rates and the booking
   history records the new total with who made the change and when.
3. Record the booking reference, the total found, and the time in the
   upgrade record, so the correction is traceable.

### 10.4 Support note (technical)

The two refusals are the error envelope's `PRICE_CHANGED` (`409`,
`details` with `roomTypeId`, `arrivalDate`, `departureDate`,
`requestedTotalMinor`, `quotedTotalMinor`) and `UPSTREAM_UNAVAILABLE`
(`503`, `details.upstream: "rates"`, `details.operation: "QuotePrice"`).
Both are raised before the store step, so nothing is written — no
reservation row, no availability consumed, no change-history row, no
idempotency record — and the same `idempotencyKey` may be reused for the
re-quoted attempt.

`PRICE_CHANGED` is the normal race, not a fault: a rate or discount was
edited between the desk's quote and the confirm. The fix is the desk
re-quote, which re-reads the price for the same room type, dates, and
discount; the clerk confirms the new total. Diagnose it by comparing the
rate rows for that type and those nights with the totals the refusal
returned: a quote that disagrees with a live re-quote of the same inputs
is a fault, and a quote that keeps moving points at an edit loop or a
second desk session.

`UPSTREAM_UNAVAILABLE` on the booking path means the reservations module
could not read the rates module: transport failure, the five-second
timeout, a 5xx, a reply that is not an error envelope, or an unwired
client. Check the rates module's health through the proxy and the
pre-flight reachability from
`docs/devops/deployment.md` section 5; the booking action refuses on
purpose rather than freezing an unverified price, and reading,
cancelling, checking in, and checking out do not use this read. A
definitive rates answer instead keeps its own terms and is not this
case: `NOT_FOUND` with `reason: "no_rate_price"` or
`reason: "no_rate_plan"` is the section 6 refusal (rates not set), and
`VALIDATION_FAILED` naming `discountName` or `ratePlanName` is an
unknown discount or an ambiguous plan set that the desk resolves, not an
outage.

No retry worker, no cached total, and no backfill exist by design: a
total is either read from rates in the booking request or the booking is
refused. Growth in the `UPSTREAM_UNAVAILABLE` rate is the availability
signal R8 records (`docs/release/release-notes.md` section 2.3); until a
monitoring exporter lands it is read from these desk reports, so log
every occurrence in the support ticket with its time.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-948

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-963

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-993
