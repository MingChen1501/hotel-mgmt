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
- A guest who checked out still shows as checked in in the booking
  history or the calendar, or their booking still stops the room type
  from being sold (section 8.2).
- A check-out where the panel reported the guest checked out but also
  said the booking could not be marked completed (section 8.2).

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
reads as checked in and needs support — it is the only stuck case an
upgrade leaves behind.

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
   are the only rows an upgrade leaves behind: no automatic repair
   ships with this release.

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

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-948
