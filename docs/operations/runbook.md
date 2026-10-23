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
wait: note the message word for word and call support (section 6).
A backup without a success report counts as failed.

## 2. Reading the success/failure report

The report always shows one of two outcomes in plain words:

- **Success, with date and time** (for example, "Backup succeeded
  at 02:14 on 22 Oct"): the hotel's reservations, stays, folios,
  and payments are safely copied. Nothing further to do.
- **Failure, with date, time, and a reason** (for example,
  "Backup failed at 02:14 — storage not reachable"): the copy did
  not happen. Desk work continues normally, but the hotel has no
  fresh restore point. Call support the same day (section 6) —
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
within a reasonable wait, call support (section 6) — do not
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
support (section 6).

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

## 6. When to call support (escalation contacts)

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

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-79
