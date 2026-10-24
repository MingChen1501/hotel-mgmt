# POC demo checklist — desk-loop demonstration and owner sign-off

Status: active. Owner-runnable pass/fail checklist for the POC
demonstration (issue #185), owned by `release-manager`. The
demonstration runs one command and walks the full desk loop end to
end — book, check in, post charges, check out, print the receipt,
export (backup), and restore drill — on a machine the owner can
observe. Normative procedures stay in `docs/operations/runbook.md`,
`docs/operations/backup-dr.md`, and `docs/devops/deployment.md`;
this page is the per-demo record that each step was watched,
judged, and signed off.

## 1. Prerequisites

Before the demo, the delivery team confirms all of these:

1. A hotel-like host with docker and the compose plugin installed.
2. The hotel's own configuration set at `deploy/config/hotel.json`
   (copied from `deploy/config/hotel.example.json` with the hotel's
   own values; never the EXAMPLE-001 placeholder, never real hotel
   data committed).
3. Two per-sale secrets ready, neither left on a dev default: the
   database secret (`DB_PASSWORD`) and the owner boot secret
   (`ADMIN_BOOT_SECRET`). The owner types or pastes them; they are
   never shown on screen or written down.
4. An empty (or existing) writable backup staging area
   (default `./backup-staging`).
5. The owner (or manager) present to observe and sign off.

## 2. The exact command

From the repo root, one command only:

```sh
DB_PASSWORD=<per-sale secret> ADMIN_BOOT_SECRET=<per-sale secret> \
  script/demo-poc.sh
```

The script is a thin narrator over the existing deployment-path
gates — `script/preflight.sh`, then `script/e2e-desk-loop.sh` with
the stack left up — plus artefact collection. It takes about as
long as the installer proof (tens of minutes on first build). There
are no variants: any flags beyond `--config`, `--staging-dir`,
`--base-url`, and `--log-file` are refused.

## 3. Per-step pass/fail table

Watch the output and judge each step as it runs. Every step prints
`PASS` or `FAIL` with a named cause; a `FAIL` stops the demo
(fail closed) and the named cause is the record — do not continue
to the next step.

| Step | What to watch for | PASS looks like | FAIL looks like (stop, record the cause) |
|---|---|---|---|
| 1. Pre-flight | Secrets, config, host, tooling, backup target | `demo-poc: PASS: pre-flight (fail-closed entry gate).` | `demo-poc: FAIL: pre-flight refused …` plus the named cause in `preflight:` lines (which secret, which config value, host minimum, or backup target) |
| 2. Desk loop | Book → check-in → charges → check-out → backup → restore drill → re-verify, each with `e2e: PASS:` lines | `demo-poc: PASS: desk loop (book -> … -> re-verify).` and finally `demo-poc: RESULT: PASS …` | `demo-poc: FAIL: desk loop failed …`; the first `e2e: FAIL:` line in the log names the cause |
| 3. Artefacts | Backup report, drill report, invoice id | `demo-poc: PASS: artefacts located.` followed by the PASS/FAIL summary with file paths | `demo-poc: FAIL: artefact collection …` naming which artefact is missing |

A non-developer judges pass the same way throughout: the word
`PASS` appears for the step and no `FAIL` appears anywhere above
it. When in doubt, search the log file for `FAIL`.

## 4. Artefact check

After `demo-poc: SUCCEEDED.`, open each artefact from the summary
and confirm:

1. **Full log** (`demo-poc: full log:` path): contains the
   `e2e: EVIDENCE:` line with the reservation ref, stay id, invoice
   (folio) id, day-close date, charges total, and folio balance.
2. **Backup report** (`demo-poc: backup report:` path): open the
   file; `outcome` is `success` with a fresh date and time.
3. **Drill report** (`demo-poc: drill report:` path): open the
   file; `outcome` is `success` and `withinBudget` is `true`
   (restore inside the 4-hour RTO).
4. **Invoice and receipt**: the delivery team prints both from the
   desk using the invoice (folio) id in the EVIDENCE line — the
   invoice totals match the folio, the receipt matches the cash
   payment — and hands the printouts to the owner.

## 5. Sign-off

| Item | Record |
|---|---|
| Demo date | _[date]_ |
| Full log path | _[path]_ |
| Reservation ref / stay id / invoice id | _[from the EVIDENCE line]_ |
| Backup report outcome + time | _[success + time]_ |
| Drill report outcome + withinBudget | _[success + true]_ |
| Invoice/receipt printouts handed over | _[yes/no]_ |
| CI run for the demo change | _[link]_ |

Owner sign-off:

- Hotel owner/manager: _[name, date, signature]_
- Delivery team: _[name, date]_

The sign-off is recorded back in issue #185. Open follow-ups are
filed as issues — never silently fixed.


<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-269
