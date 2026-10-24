# Backup and disaster recovery — on-premise backup story

Status: active. Backup, restore, and disaster-recovery plan for the
hotel-mgmt MVP, owned by `release-manager` (Closes #63). This is the
normative backup story behind `FR-ADM-5` (data export and backup),
`NFR-BKP-1` (backup frequency and recovery point), and `NFR-BKP-2`
(restore time and verifiability). Day-to-day operation of this story
by a non-technical owner is described in
`docs/operations/runbook.md`; install and upgrade handling is in
`docs/devops/deployment.md`.

## 1. Schedule (RPO 24 hours)

- Target schedule: one full backup every day (`NFR-BKP-1`:
  recovery point objective at most 24 hours — after a failure the
  hotel loses no more than one operating day of data).
- The daily trigger is not wired yet: nothing executes the backup
  `schedule` value in the per-hotel configuration set (no
  cron/systemd entry, no scheduler), so backup runs are manual
  `script/backup.sh` invocations and the script header scopes the
  skeleton as mechanism-only. Wiring the trigger (ansible timer +
  config `schedule` enforcement) is still outstanding:
  `docs/project/plan.md` marks milestone 3c closed per #224 (with
  hotel-LAN-hardware verification continuing under the Pilot
  milestone) and records no schedule-trigger remainder — until that
  slice lands, the daily schedule above is the target, not the
  mechanism.
- Target success rate: a scheduled backup completes successfully at
  least 6 days out of 7 (`NFR-BKP-1`).
- The daily run keeps the desk usable while it executes; staff do
  not need to sign out.
- The owner may additionally trigger a manual backup or export at
  any time (`FR-ADM-5`); upgrades always take a backup first
  (`docs/devops/deployment.md`, section 4).

## 2. What is backed up

Every backup is a complete copy of the hotel's data:

- Reservations, stays, folios, and payments (`FR-ADM-5`,
  `NFR-BKP-1`), including the hotel's rate plans, room and
  room-type setup, charge items, tax and fee rules, and user
  accounts — everything needed to bring the desk back.
- The per-hotel configuration set
  (`docs/devops/deployment.md`, section 2), so a restore brings
  back the hotel's own setup, not defaults.
- Every record's audit entries (who did it and when,
  `NFR-AUD-1`) are part of the backed-up data.

Backups are written to the on-premise backup target (the hotel's
own storage, reachable from the installation over the hotel LAN).
No backup leaves the premises.

## 3. Retention

- Keep the most recent 30 daily backups on the backup target, so
  roughly one month of restore points is always available. This
  sits alongside the live system's retention: closed stays,
  folios, payments, and their audit entries stay retrievable for
  at least 24 months in the live system (`NFR-RET-1`).
- Never delete the newest verified backup: retention cleanup
  removes the oldest copies first and always leaves the latest
  successful backup and its verification record in place.
- The hotel's configured retention floor (a hotel local setting,
  `FR-ADM-1`) governs purging inside the live system; backups are
  not a way around it — records newer than the floor cannot be
  purged from the live system (`NFR-RET-1`).
- If the backup target fills up, the oldest copies beyond the 30
  newest are removed first; if space is still short, the system
  reports failure rather than silently skipping a backup, and the
  owner calls support (see `docs/operations/runbook.md`).

## 4. Restore verification

- Every backup run reports plain success or failure with its time
  to the owner or manager — 100% of runs produce a visible report
  (`NFR-BKP-2`). A backup without a success report counts as
  failed.
- After each successful daily backup, the system verifies the copy
  can be read back (completeness check); a copy that fails the
  check is reported as a failure and the previous verified backup
  stays the restore point.
- At least once per quarter-neutral operating period (no invented
  dates: tie it to the hotel's own routine, for example the
  monthly close), the delivery team or support restores the latest
  backup to a spare location and confirms the desk signs in with
  the hotel's data — a restore that has never been tried does not
  count as a plan.
- Restore target: the system is operable again within 4 hours on
  equivalent on-premise hardware (recovery time objective at most
  4 hours, `NFR-BKP-2`). The step-by-step restore procedure is in
  `docs/operations/runbook.md`, section 5.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-79
