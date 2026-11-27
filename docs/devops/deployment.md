# Deployment — single-property on-premise installation

Status: active. Deployment targets and procedures for the hotel-mgmt
MVP, owned by `release-manager` (Closes #63). One installation serves
exactly one hotel property (`NFR-DEP-1`); every installation stays on
the hotel's own premises with no cloud and no traffic across
properties. The deployable topology (reverse proxy, eight module
containers, database host or hosts, on-premise backup target, desk
clients on the hotel LAN) is defined in
`docs/architecture/system-architecture.md` (active); this document
adds only the install, upgrade, configuration, pre-flight, and
rollback procedures. The stack direction is decided in accepted
ADR-0001
(`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`):
Ansible plus plain containers installed offline, Nginx entry,
Prometheus plus Grafana on-prem, LAN-only networking with Tailscale,
and the single 2*4*50 host default with a small-cluster variant.
The desk UI is the Vue 3 + Vite single-page app decided in accepted
ADR-0003
(`docs/architecture/decisions/adr-0003-desk-ui-vue-vite.md`,
accepted 2026-10-25): its static build (`app/dist/`, gitignored) is
bind-mounted at `/srv/app-dist` and served under `/app/` by Nginx,
with the legacy static pages redirecting to their `/app/*`
successors.

## 1. Placement variants

The same release bundle installs in two placements. Components and
contracts are identical; only placement differs.

- **Single-host (default).** Everything — reverse proxy, all module
  containers, the database, and the backup staging area — runs on one
  on-premise host. This is the default sale: simplest install, least
  administration.
- **Small-cluster variant.** The same containers and the database
  spread across a few on-premise hosts on the hotel LAN (for
  example, one host for the proxy and modules, one host for the
  database, plus the backup target). Inter-component endpoints use
  configuration/service names per the portability rules in the
  system architecture, so a container moves between hosts without
  code or image changes.

No host-specific paths exist in any component; all persistent state
lives in the database host or hosts and the backup target.

## 2. Per-hotel configuration

Each sale is configured per hotel without code forks: the release
bundle is identical for every property, and the hotel's differences
are carried in a per-hotel configuration set applied at install time
and re-applied at every upgrade. The set covers the hotel identity
and local settings (`FR-ADM-1`), the three role accounts
(`FR-ADM-2`), rooms, room types, and capacity (`FR-ADM-3`, `FR-RMS-4`),
rate plans, standard times, and stay policies (`FR-ADM-4`), the
customisable workflow items (required guest fields, cancellation
reasons and wording, no-show rules, open-balance check-out rules,
charge items, tax and fee rules, stay restrictions, named discounts —
`FR-CUS-1/2/3`, `FR-RES-3/6`, `FR-RTE-3/4`, `FR-BIL-5/7`), and the backup schedule
and retention floor (section 6 and `docs/operations/backup-dr.md`).

First secrets for the three role accounts (`FR-ADM-2`) are
provisioned per sale at handover through this mechanism: at install
time the delivery team generates one unique initial secret per
account (owner, manager, front-desk), unique per sale and never
reused across properties or accounts; the delivery team sets each
initial secret through the installed system's account setup and
confirms sign-in works; each initial secret is handed only to its
matching person in a sealed one-to-one handover (never by plain
email and never as a shared copy) and is never stored in plaintext
inside the configuration set or the release bundle; each holder
changes the initial secret on first sign-in, and the delivery team
confirms all three changes before leaving the site; a lost or
disclosed initial secret is replaced before handover completes and
the replacement is recorded as a fresh handover. `NFR-SEC-2` sets only the
behavioural targets (lockout after 5 failures, sign-out after 15
idle minutes); the owner/manager unlock procedure for a locked
identity is in `docs/operations/runbook.md`, section 7.

The configuration set is stored as versioned files alongside the
release bundle, never edited inside container images. After install
or upgrade, the delivery team opens the desk and confirms the
hotel's own name, times, charge items, and one rate plan are in
effect before handing over.

**Per-sale secrets in the host environment (Refs #638).** From this
bundle the installation carries a third per-sale secret.
`ADMIN_TOKEN_KEY` is the HMAC key that signs and verifies every Admin
session token, and the admin module refuses to boot without it, exactly
as it refuses without `ADMIN_BOOT_SECRET`. All three are
environment inputs for the host — never per-hotel configuration values
(`hotel.json`), never repository content, never image content:

| Secret | Consumed by | Unusable when |
|---|---|---|
| `DB_PASSWORD` | every module's `DATABASE_URL` and `POSTGRES_PASSWORD` (`deploy/compose.yaml`) | unset or still a dev default (`script/preflight.sh`) |
| `ADMIN_BOOT_SECRET` | the `admin` service at boot (`ADMIN_BOOT_IDENTITY` defaults to `owner`) | unset, empty, or exactly one of `change-me`, `change-me-dev-only`, `password`, `hotel`, `hotel-dev-only` |
| `ADMIN_TOKEN_KEY` | the `admin` service at boot: the signing and verification key for every session token | the same test as `ADMIN_BOOT_SECRET` |

The three are generated per sale, unique per property and unique per
secret, handed over under the sealed one-to-one rule above, and recorded
in the handover record like the initial account secrets. A value that a
person can guess, that appears in this repository, or that a previous
sale used is not a per-sale secret.

**Admin refuses to boot without them (Refs #638).** Outside one explicit
dev/test switch the admin module exits non-zero before it builds a
store, connects to the database, applies a migration, seeds the owner
account, or opens its port, as soon as either secret is unusable. The
operator sees one plain line on stderr and nothing else:

```text
admin: refusing to boot: <VARIABLE> is unset, empty, or a published default; provision the per-sale secret or set ADMIN_DEV_MODE=1 for dev/test.
```

`ADMIN_TOKEN_KEY` is checked first and `ADMIN_BOOT_SECRET` second, so a
host missing both names the key on the first boot and the secret on the
next. The exit code is `1`, no secret value is printed, and nothing
happens: no store, no database connection, no migration, no owner
account, and no `/healthz` answer, so a container that cannot boot reads
unhealthy instead of healthy with published credentials. The dev switch
is `ADMIN_DEV_MODE` set to the exact string `1`; it restores the two dev
fallbacks (`dev-only-change-me` for the key, `change-me` for the boot
secret) only where a real value is absent, and the boot logs one warning
naming the switch. It is dev/test only: `NODE_ENV` decides nothing in
either direction, and both production gates (`script/preflight.sh` and
the Ansible pre-check) refuse an install or upgrade that has the switch
set — see section 5.

**What each environment carries (Refs #638).**

| Environment | `ADMIN_TOKEN_KEY` | `ADMIN_BOOT_SECRET` | `ADMIN_DEV_MODE` |
|---|---|---|---|
| A sale — install, upgrade, handover | required, generated per sale | required, generated per sale | never set; the pre-flight and the Ansible pre-check refuse it |
| CI e2e jobs (`e2e-single-host`, `browser-e2e`, `dom-diff`) | required: a throwaway non-default value | required: the same | never set |
| Local dev, env-file path (`../devops/local-dev-setup.md`, section 3) | required unless the switch is used | required unless the switch is used | optional, dev only |
| A throwaway lab that deliberately runs on the dev defaults | optional | optional | the only place it may be set |

Changing `ADMIN_TOKEN_KEY` on a running installation signs every staff
session out: a token minted under the old key no longer verifies, and
each person signs in again once. That is the expected effect of the
first boot with a real key after an upgrade from a bundle that used the
published default (section 4). Rotation as a procedure is not part of
this change and is not performed by re-running the installer; the
per-change note is in `../release/rollback.md`, section 5.7.

**Bundle-level service addresses.** The module-to-module addresses
are part of the bundle, not of the hotel's configuration set, because
they describe the installation's own topology and never differ per
hotel. The reservations module reads two of them at boot: `RATES_BASE_URL`
(`deploy/compose.yaml:46`) and — target state for the next bundle, Refs
#631 — `ROOMS_BASE_URL` (default
`http://rooms:8085`; wiring
`services/reservations/cmd/server/main.go:45-49`). Both calls forward the
caller's session token and fail closed. `ROOMS_BASE_URL` is the ceiling
source for the overbooking guard (Refs #631,
`../architecture/lld.md` section 26): a booking whose capacity read fails
is refused with `UPSTREAM_UNAVAILABLE` (503) instead of being allowed
(`../operations/runbook.md`, section 11). Target state for this bundle
(Refs #646): the stay module reads `RESERVATIONS_BASE_URL` (default
`http://reservations:8081`) and calls the reservations module once
after a check-out commits, so the booking behind the stay is completed
with the same close (`../architecture/lld.md`, section 22). That call
carries a short timeout and is fail-soft, unlike the booking guard: a
close that already committed is never turned into a desk refusal, so an
unreachable reservations module blocks no check-out — it leaves the
booking active and reported as such, and the procedure for that row is
`../operations/runbook.md`, section 8.2. The single-host default and
the small-cluster variant both address the modules by service name, so
the defaults hold unless a module moves to another host — then only that
address value changes, in the bundle's configuration file, never inside
an image. Section 3 step 5, section 4 step 6, and section 5 carry the
matching pre-flight and health-check checks; the health check only fails
on them once the change ships.

**The booking path now reads Rates (Refs #632).** `RATES_BASE_URL` is
unchanged — same address, same `http://rates:8082` default, same
configuration file (`deploy/compose.yaml:46`) — but the reservations
module makes a second read of the rates module on it: every booking
create and every booking modify now calls
`POST {RATES_BASE_URL}/v1/rates/QuotePrice` for the effective room type,
dates, and discount, forwards the caller's session token, caps the call
at five seconds, and freezes the total the quote returns. This read is
fail-closed, like the restriction read that already runs on the same
address and not like the fail-soft stay-to-reservations completion: a
rates module that cannot be read refuses the booking
(`UPSTREAM_UNAVAILABLE`, 503) rather than freezing an unverified price,
so an unreachable rates module stops the desk booking and modifying for
as long as it lasts (`../architecture/lld.md`, section 25; the
desk-facing procedure is `../operations/runbook.md`, section 15).
Reading bookings, cancellations, check-in, and check-out do not call
rates on this path and keep working. No hotel input and no new
configuration value arrive with it; only the reachability requirement
the pre-flight and health check already apply to this address becomes
load-bearing for the booking action, which is why both checks now name
it (section 3 step 5 and section 5). No new container, no restart-order
change, and no monitoring exporter ships with this bundle: until the
first exporter lands, the alert obligation recorded for R9 in
`../release/release-notes.md` section 2.3 is carried by the desk
escalation in `../operations/runbook.md` section 7.
**Billing's stay read (Refs #634).** Target state for this bundle: the
billing module reads `STAY_BASE_URL` (default `http://stay:8084`, the
port the stay module already publishes, `deploy/compose.yaml:81`) and
asks the stay module through `GetStayRef` before every folio write —
charge, payment, open-balance approval — and before it creates a folio
on a balance read (`../architecture/lld.md`, section 27). The call
forwards the caller's session token and carries a 2-second timeout,
inside `NFR-PERF-1`'s three-second action bound. This one is
**fail-closed**, unlike the #646 completion: while the stay module cannot
be read, charge posting, payment recording, open-balance approval, and a
first, folio-less balance read refuse with `UPSTREAM_UNAVAILABLE` (503)
and nothing is recorded, so an unreachable stay module stops new money
from being written instead of writing it unverified. The desk procedure
for that window is `../operations/runbook.md`, section 14. Both
placements address the module by service name, so the default holds
unless the stay module moves to another host — then only that address
value changes, in the bundle's configuration file, never inside an
image. Section 5 carries the matching pre-flight check and section 3 the
health check.

## 3. Install procedure (both variants)

1. Confirm the pre-flight checks in section 5 pass and a blank
   backup target is reachable.
2. Copy the release bundle and the hotel's configuration set onto
   the host (single-host) or the designated hosts (small cluster).
   The desk UI bundle (`app/dist/`, gitignored) must exist before
   the proxy starts: the installer proof builds it (`npm ci` and
   `npm run build` in `app/`) when Node is available, reuses an
   existing build otherwise, and fails closed when neither is
   possible.
3. Apply the per-hotel configuration set (section 2) to the
   bundle's configuration files; do not edit images.
4. Start the database host first, then the module containers, then
   the reverse proxy (restart order is also the start order — see
   `docs/operations/runbook.md`).
5. Run the bundle's health check: proxy reachable from a desk
   client on the hotel LAN, each module answering through the
   proxy, each module connected to its own store, the
   reservations module reaching the rates and rooms modules on the
   hotel LAN (a booking is refused, never guessed, when either is
   unreadable — `../operations/runbook.md`, section 11), the stay
   module reaching the reservations module on the hotel LAN (a
   close still commits when that call fails, but the booking is
   then left active — `../operations/runbook.md`, section 8.2),
   and the reservations module reaching the rates module on the
   hotel LAN (a booking or a booking change is refused when that
   read fails, so the desk cannot book at an unverified price —
   `../operations/runbook.md`, section 15.2).
   and the billing module reaching the stay module on the hotel
   LAN (a folio write refuses while it cannot, so new charges and
   payments are blocked until it answers — section 5,
   `../operations/runbook.md`, section 14), and the admin module
   answering `/healthz` at all — it only listens with both per-sale
   Admin secrets provisioned, and exits at boot when one is missing,
   empty, or a published default (section 2,
   `../operations/runbook.md`, section 16).
6. Sign in as the owner account, verify the hotel profile, rooms,
   rate plans, and charge items from step 3, and record one test
   reservation end to end (book, check in, post a charge, check
   out) before the hotel goes live.
7. Run the first backup immediately after handover and confirm its
   success report (see `docs/operations/backup-dr.md`).

For the small-cluster variant, repeat steps 2–5 per host in the
order database host, module host or hosts, proxy host, and confirm
every inter-host endpoint over the hotel LAN before step 6.

## 4. Upgrade procedure (both variants)

1. Take a full backup immediately before the upgrade and confirm
   its success report; do not start without it.
2. Confirm the pre-flight checks in section 5 pass on the target
   hosts.
3. Stop the proxy, then the module containers, then the database
   (reverse of the start order).
4. Replace the release bundle with the new version. Re-apply the
   hotel's existing configuration set unchanged; carry forward no
   state from inside old containers. Bundle-level module addresses
   come from the new bundle, not from the hotel's configuration set
   (section 2, "Bundle-level service addresses") — new ones, such as
   `ROOMS_BASE_URL` for the reservations module (Refs #631),
   `RESERVATIONS_BASE_URL` for the stay module (Refs #646), and
   `STAY_BASE_URL` for the billing module (Refs #634), are already
   set in it and need no hotel input. The reservations module's
   `RATES_BASE_URL` is unchanged by this bundle (Refs #632) but now
   also carries the booking quote read, so confirm the rates module
   answers on it (section 3 step 5) before the desk resumes: an
   unreachable rates module refuses every booking create and modify
   (`../operations/runbook.md`, section 15.2).
5. Start the database host first, then the module containers, then
   the reverse proxy.
6. Run the health check from section 3 step 5, sign in, and repeat
   the end-to-end reservation check from section 3 step 6.
7. Keep the pre-upgrade backup until the hotel has operated at
   least one full business day on the new version.

**Admin needs its signing key before the bundle lands (upgrade only,
Refs #638).** This bundle stops Admin falling back to published
defaults, so an upgrade that forgets one of the two Admin secrets stops
the sign-in service. Provision both in the host environment **before
step 2** — before the pre-flight, before the old bundle is replaced, and
before any module starts — because Admin applies no fallback and the
desk cannot sign in while it is down:

- `ADMIN_TOKEN_KEY`: generate one per sale. Without it Admin exits `1`
  with `admin: refusing to boot: ADMIN_TOKEN_KEY is unset, empty, or a
  published default; …` and never opens its port.
- `ADMIN_BOOT_SECRET`: confirm the value the sale already uses is not a
  published default (`change-me`, `change-me-dev-only`, `password`,
  `hotel`, `hotel-dev-only`). A host that inherited the compose fallback
  `change-me-dev-only` now refuses to boot where it used to start.
- `ADMIN_DEV_MODE`: confirm it is not set on the target hosts. A bundle
  or host that carries the switch restores the published defaults; the
  pre-flight refuses it (section 5).

The check order is fixed: `ADMIN_TOKEN_KEY` first, then
`ADMIN_BOOT_SECRET`, so a host missing both names the key on the first
attempt and the secret on the second — one restart per variable, never a
silent start. What the desk sees and the operator does is
`../operations/runbook.md`, section 16. Expect one one-time effect: the
first boot with a real key invalidates the session tokens minted under
the old default, so staff sign in again once. Nothing else changes — no
schema migration, no data backfill, no restart-order change, and the
owner account keeps the hash the earlier boot seeded (`ensureBootUser`
never overwrites it). If the installation ever booted with a published
default, that stored owner password is still live: rotate it through
`ChangeSecret` (`../devops/local-dev-setup.md`, section 7) at the
upgrade and record it in the upgrade record.

**Rooms stranded by an older bundle (upgrade only, Refs #647).** An
installation upgraded from a bundle that predates the desk room
reassignment change inherits rooms that read occupied with no stay
behind them: a check-in refused after the desk had already set the
room aside was never handed back. This bundle repairs the desk, not the
data — there is no migration and no backfill. Before resuming desk
work, clear every such room per `../operations/runbook.md` section 9.3
and record the cleared rooms, their times, and the actor in the upgrade
record; the same section 9 procedure is the support step afterwards.

**Booking totals frozen by an older bundle (upgrade only, Refs #632).**
An installation upgraded from a bundle that predates the server-side
price basis inherits bookings frozen at whatever total the caller sent;
nothing at this head compared that total with a rate. This bundle
verifies new bookings and booking changes — it does not rewrite stored
ones: there is no migration, no backfill, and no automatic re-derivation
of an existing booking's total. Do not correct them in bulk and do not
edit a booking at the desk. A booking that staff change is repriced
against the rates in one change that records the actor and the time
(`../operations/runbook.md`, section 15.3), and a total that has to be
corrected without changing the booking goes to support. Record the
booking references found, their stored totals, and the times in the
upgrade record.

For the small-cluster variant, stop and start hosts in the same
relative order and verify inter-host endpoints after step 5.

## 5. Pre-flight checks

Run before every install and every upgrade; stop on any failure:

- Each host meets the published minimum sizing of 2 vCPU / 4 GB
  RAM / 50 GB disk per host (owner notation 2*4*50, accepted
  ADR-0001 answering OQ-A3; see
  `docs/architecture/decisions/adr-0001-monorepo-polyglot.md`).
  This is the R-2 mitigation write-in from
  `docs/project/risk-register.md`.
- Free disk space covers the release bundle plus one full backup
  with margin.
- Every host reaches every other host and the backup target over
  the hotel LAN; desk clients reach the proxy address.
- The reservations module reaches the rates and rooms modules over
  the hotel LAN: a new booking is refused with `UPSTREAM_UNAVAILABLE`
  (503) when either read fails, so an unreachable rooms module blocks
  booking and date changes while check-in, check-out, and existing
  bookings keep working (`../operations/runbook.md`, section 11).
- The stay module reaches the reservations module over the hotel LAN:
  a check-out still commits when that call fails, but the booking
  behind the stay is then left active and has to be completed by hand
  (`../operations/runbook.md`, section 8.2), so an unreachable
  reservations module leaves a booking to repair after every close.
- The reservations module reaches the rates module over the hotel LAN
  and answers its quote read within the five-second cap: a booking
  create or booking modify is refused fail-closed with
  `UPSTREAM_UNAVAILABLE` when that read fails, so an unreachable rates
  module leaves the desk unable to book or change bookings while
  reading, cancelling, checking in, and checking out keep working
  (`../operations/runbook.md`, section 15.2; `../architecture/lld.md`,
  section 25.2).
- The billing module reaches the stay module over the hotel LAN: every
  folio write reads the stay first, so while that address does not
  answer, charge posting, payment recording, open-balance approval, and
  a first, folio-less balance read refuse with `UPSTREAM_UNAVAILABLE`
  (503) and nothing is recorded — the desk takes the items on paper
  (`../operations/runbook.md`, section 14). This is fail-closed by
  design: never work around it by pointing `STAY_BASE_URL` at another
  module or by writing money by hand.
- The per-hotel configuration set validates against the release
  bundle's configuration schema with no missing required values.
- First secrets are provisioned and handed over per the handover
  step in section 2 (initial secret per role account, changed on
  first sign-in).
- All three per-sale secrets are present in the provisioning
  environment and none is empty or a published default
  (`change-me`, `change-me-dev-only`, `password`, `hotel`,
  `hotel-dev-only`): `DB_PASSWORD`, `ADMIN_BOOT_SECRET`, and
  `ADMIN_TOKEN_KEY` (Refs #638). `script/preflight.sh` and the Ansible
  pre-check refuse the install or upgrade when one is missing or on that
  list, so the failure is caught here rather than at the Admin boot.
- `ADMIN_DEV_MODE` is **not** set on any target host (Refs #638): the
  switch restores the published Admin defaults and both gates refuse it.
  `NODE_ENV` is not a substitute in either direction and is never read
  for this decision.
- The database has no running backup or restore job in progress.
- For upgrades only: the pre-upgrade backup from section 4 step 1
  exists and its success report is confirmed.

## 6. Rollback of a failed upgrade

If the upgrade health check (section 4 step 6) fails and cannot be
fixed within the working day, roll back:

1. Stop the proxy, the module containers, and the database.
2. Restore the previous release bundle and re-apply the hotel's
   configuration set.
3. Restore the database from the pre-upgrade backup (restore steps
   in `docs/operations/runbook.md`); the hotel loses no more than
   one operating day of data (`NFR-BKP-1`: RPO at most 24 hours)
   and is operable again within 4 hours on equivalent hardware
   (`NFR-BKP-2`: RTO at most 4 hours).
4. Re-run the health check and the end-to-end reservation check;
   confirm with the hotel manager before resuming desk work.
5. Record the failed version, the failure symptom, and the
   rollback outcome in `../release/rollback.md` (active: the per-change
   note lives there, and section 4 records the outcome of this
   restore-and-redeploy procedure) and file an issue for the failure.

Reverting a bundle that carries the Admin boot secrets (Refs #638)
restores the previous fail-open boot for as long as the reverted build is
installed: sessions are signed with a key published in this repository
and a forgetful host seeds an owner account whose password is
`change-me`. That is a security regression, not a neutral revert — take
it only as an emergency measure while a corrected bundle ships, record
the exposure window, and follow `../release/rollback.md`, section 5.7.
A host that keeps `ADMIN_TOKEN_KEY` in its environment after the revert
is unaffected: the old code ignores the variable.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-1041

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-948

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-963

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-1049

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1057

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-1281
