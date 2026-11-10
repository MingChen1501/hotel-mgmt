# Release notes — per-release change entries

Status: active. Per-release change entries for the hotel-mgmt MVP,
owned by `release-manager` (row flipped from stub on the first entry,
Refs #631). One entry per change that ships in the release bundle,
written for the delivery team and the hotel owner, newest first. The
install and upgrade procedures an entry refers to are in
`../devops/deployment.md`; the matching rollback note is in
`rollback.md`; the owner-facing steps the desk follows are in
`../operations/runbook.md`. Entries describe behaviour only — a pipeline
or workflow change is never made from here.

## 1. What an entry carries

Every entry states, in this order:

1. **Change and trace.** What changed, the issue it closes, the decision
   it implements, and the risk label the issue carries.
2. **What staff see.** The desk-visible effect in plain words, including
   any new refusal the front desk can meet.
3. **Install/upgrade delta.** Anything the delivery team must carry
   beyond the procedures already in `../devops/deployment.md`
   (configuration values, service addresses, restart order), or
   "nothing beyond the standard upgrade".
4. **Rollback pointer.** The matching note in `rollback.md` and what the
   revert restores.
5. **Evidence state.** Which verification the change carries at merge:
   the guards, the stack gates, and the live checks that still have to
   pass before the release is handed over.

An entry never promises behaviour the code does not keep: a claim that
matters for operations cites the implementation or the spec by
`file:line`. Entries are English; the owner-facing sentences quote the
plain words used in `../operations/runbook.md`.

## 2. Unreleased

Nothing has shipped as a versioned release yet; the entries below are
queued for the next bundle.

### 2.1 Server-side reservation availability (Refs #631, ADR-0006)

**Change and trace.** Audit finding R1 (the #625 class): a
`CreateReservation` / `ModifyReservation` request decided the overbooking
outcome with its own `sellableUnits` field, so a caller that sent a large
number overbooked without ever seeing `CONFLICT`. The booking guard now
derives its ceiling server-side from the recorded room inventory: Rooms
answers `POST /v1/rooms/CheckRoomTypeSellability` for the effective room
type and stay dates, and the ceiling is `totalCount - len(blockedRooms)`.
The request's `sellableUnits` stays in the contract as an advisory field:
it is shape-checked when present and never reaches the guard. Design:
`../architecture/lld.md` section 22; decision
`../architecture/decisions/adr-0006-server-side-availability-derivation.md`;
product conditions `AC-OVB-1`..`AC-OVB-3`
(`../product/acceptance-criteria.md` section 15). Risk label:
`risk-high` — booking-path integrity on the money/occupancy line, so it
needs explicit owner approval and the owner merges manually.

**What staff see.**

- A sold-out room type refuses a booking exactly as before: one refusal
  naming the room type and the dates, and no booking is created
  (`CONFLICT`, 409). The desk's own availability pre-check and the
  sold-out wording are unchanged.
- A room type that still has sellable units accepts the booking even when
  the number the desk sends is small, absent, or stale — the desk cannot
  refuse a bookable stay by sending a low number, and cannot overbook by
  sending a high one.
- When the recorded room inventory cannot be read at all, the booking (or
  the date/room-type change on an existing booking) is refused with
  `UPSTREAM_UNAVAILABLE` (503) instead of being guessed through. Nothing
  is written. This is a fault, not a sold-out answer, and the runbook
  splits the two for the front desk: `../operations/runbook.md`,
  section 6.2. Check-in, check-out, charge posting, payments, printing,
  and every existing booking keep working during such a fault.
- The desk continues to send `sellableUnits` in the request. It is now
  advisory, so a desk build that predates this change keeps working
  against the new server and vice versa.

**Install/upgrade delta.** The reservations module gains one bundle-level
variable, `ROOMS_BASE_URL` (bundle default `http://rooms:8085`, wired
beside `RATES_BASE_URL` in `deploy/compose.yaml:46`; boot wiring
`services/reservations/cmd/server/main.go:42-47`). It is a bundle default,
not a per-hotel value: the standard upgrade carries it automatically, and
only the small-cluster placement changes it when the Rooms module moves
hosts (`../devops/deployment.md`, section 2). Restart order, pre-flight
checks, and the health-check step are updated in the same change
(`../devops/deployment.md`, sections 3 and 5) because a booking now needs
the Rooms module reachable on the hotel LAN. No database schema,
migration, seed, or event-payload change exists in either direction.

**Rollback pointer.** Revert the single implementation PR; the previous
guard behaviour returns with the request's number and no data has to be
undone. Full note and the post-rollback checks: `rollback.md`,
section 5.1. Because the revert re-opens audit finding R1, it is an
owner-approved action, not a routine one.

**Evidence state.** Guards the implementing PR must carry (and the
`qa-lead` traceability must cite at the merged head): inflated
`sellableUnits` on create and on modify still answer `CONFLICT` with
nothing written; a low or absent number refuses nothing; a zero-capacity
room type answers `CONFLICT`, never 503; an unreadable, timing-out, 5xx,
malformed, or unwired capacity source answers `UPSTREAM_UNAVAILABLE`
with `{upstream: "rooms", operation: "CheckRoomTypeSellability"}`;
Rooms 4xx envelopes pass through unchanged; two simultaneous last-unit
attempts yield exactly one 200 and one `CONFLICT`; an idempotent replay
consumes no second unit. Stack gates: `services/reservations` build, test,
vet, `gofmt`; `services/rooms` build, test, lint;
`script/contract-check.sh`; `script/markdown-link-check.sh`. Live gate:
the desk-loop booking step and the browser end-to-end booking spec stay
green, and the end-to-end reservation check in the upgrade procedure
(`../devops/deployment.md`, section 4 step 6) proves the capacity read
works on the deployed bundle.

**Follow-ups (not carried by this change).** No alerting signal exists
yet for a rising `UPSTREAM_UNAVAILABLE` rate on bookings: the monitoring
and alerting spec stays a stub until the first exporter lands (see the
DevOps table in `../README.md`), so the fault is detected by the desk and
triaged with `../operations/runbook.md`, section 6.2. A capacity-specific
desk sentence and a per-night ceiling are separate changes (residual
risks R-OVB-1 and R-OVB-2, `../architecture/lld.md` section 22.7);
neither is promised here.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-936
