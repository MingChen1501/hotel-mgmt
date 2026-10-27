# Pilot exit checklist — single-hotel readiness handover

Status: active. Handover record for the hotel-mgmt MVP pilot
(issue #153). The delivery team completes one copy per sale with
the hotel's non-technical owner or manager: part A walks through
the runbook, part B checks every pilot exit signal from
`docs/project/plan.md` (milestone 3c plus the Pilot milestone),
and part C records open follow-ups as issues — never silently
fixed. Normative procedures stay in `docs/operations/runbook.md`,
`docs/operations/backup-dr.md`, and `docs/devops/deployment.md`;
this document is the per-sale record that they were walked,
proven, and signed off.

## A. Runbook walkthrough with a non-technical stand-in

Walk each runbook section with the owner or manager in plain
words (no command lines); the stand-in confirms understanding by
doing the step, not by watching. Fill the evidence cell per sale.

| Runbook section | Walkthrough step | Evidence (date + initials) |
|---|---|---|
| 1. Daily check | Stand-in opens the desk backup report and confirms success with yesterday's date, recency within 24 h, and no failure message | |
| 2. Report reading | Stand-in states in own words what a success line and a failure line each mean and what to do on failure | |
| 3. Restart order | Stand-in restarts the single-host box (or the small-cluster hosts in database → modules → proxy order) and signs in | |
| 4. Desk-offline behaviour | Stand-in confirms desk work continues during an outage and names what does not work (nothing in the MVP leaves the property) | |
| 5. Restore from backup | Stand-in performs the owner steps with support on the phone: newest verified restore point, equivalent hardware, reinstall + config + load, owner checks (arrivals list, one in-house stay, day-close totals, hotel name/rooms/prices), then resumes desk work | |
| 6. When to call support | Stand-in names the same-day call triggers and reads back the filled escalation contacts below | |

Escalation contacts (filled per sale before handover; runbook.md
section 6 placeholders must not survive handover):

- Level 1, delivery/support contact: _[name, phone, email]_
- Level 2, product support: _[name, phone, email, response time]_
- Level 3, on-site visit arrangement: _[arrangement]_

First-secret handover (deployment.md [section 2](../devops/deployment.md)): one unique
initial secret per role account (owner, manager, front-desk),
each handed only to its matching person, each changed on first
sign-in, all three changes confirmed before leaving the site.

- Owner secret handed and changed: _[date + initials]_
- Manager secret handed and changed: _[date + initials]_
- Front-desk secret handed and changed: _[date + initials]_

## B. Pilot exit checklist (plan milestones 3c + Pilot)

Every item must be satisfied; the evidence cell points at the
record, never at memory.

| # | Exit signal | Evidence |
|---|---|---|
| 1 | Installer runs end to end on hotel-like hardware and a working single-hotel deployment results (issue #153, criterion 1) | `script/install.sh` run log: pre-flight passed, desk-loop proof passed, first backup report written; deployment up at the desk entry with the hotel's own set applied |
| 2 | Pre-flight fails closed on an invalid configuration (criterion 2) | `script/test-preflight-fail-closed.sh` output (default secrets, missing/malformed/placeholder set all refused) |
| 3 | Runbook handover completes with a non-technical stand-in (criterion 3) | Part A above fully filled and signed |
| 4 | Backup + restore drill recovers inside RTO 4 h with a success report (criterion 4; NFR-BKP-2) | Drill report `hotel-*-restore-drill.report.json` (`outcome: success`, `withinBudget: true`) plus the desk-state verification (arrivals, in-house stay, day-close totals, hotel name/rooms/prices, audit entries) |
| 5 | 3c exit: the desk loop runs on hotel LAN hardware with a verified backup (plan milestone 3c) | Items 1 + 4 on the hotel LAN host |
| 6 | Pilot exit: one full operating day — arrivals, in-house stays, departures, day-close totals, printed invoices — with the runbook in the manager's hands (plan milestone 5) | Day-close totals, printed invoice copies, manager sign-off below |
| 7 | Pilot exit: open risk items for go-live are closed or accepted by the owner (plan milestone 5) | `docs/project/risk-register.md` review entry per sale |
| 8 | Open follow-ups are filed as issues, not silently fixed | Part C below |
| 9 | CI is green on the slice (criterion 6) | CI run for the slice PR |

Pilot sign-off:

- Hotel owner/manager: _[name, date, signature]_
- Delivery team: _[name, date]_

## C. Open follow-ups (filed as issues)

| Issue | Summary | Owner |
|---|---|---|
| _[e.g. #nnn]_ | _[one line]_ | _[name]_ |

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-244
