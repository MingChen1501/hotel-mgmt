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
identity is in `docs/operations/runbook.md`, section 6.

The configuration set is stored as versioned files alongside the
release bundle, never edited inside container images. After install
or upgrade, the delivery team opens the desk and confirms the
hotel's own name, times, charge items, and one rate plan are in
effect before handing over.

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
   proxy, each module connected to its own store.
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
   state from inside old containers.
5. Start the database host first, then the module containers, then
   the reverse proxy.
6. Run the health check from section 3 step 5, sign in, and repeat
   the end-to-end reservation check from section 3 step 6.
7. Keep the pre-upgrade backup until the hotel has operated at
   least one full business day on the new version.

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
- The per-hotel configuration set validates against the release
  bundle's configuration schema with no missing required values.
- First secrets are provisioned and handed over per the handover
  step in section 2 (initial secret per role account, changed on
  first sign-in).
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
   rollback outcome in `docs/release/rollback.md` (still a stub —
   the entry is written when the first release ships) and file an
   issue for the failure.

<!-- ao-role: release-manager -->
Role: release-manager · AO session hotel-mgmt-126
