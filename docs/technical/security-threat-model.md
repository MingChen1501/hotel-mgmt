# Security threat model — single-property on-premise PMS

Status: active (Closes #97). Owned by `architect`. Threats,
mitigations, and trust boundaries for the MVP: one on-premise
installation per property, hotel-LAN clients, Tailscale for remote
access, no inbound internet, no cloud, no external integrations.
Every control below traces to an FR/NFR (`FR-ADM-2`, `FR-ADM-5`,
`NFR-SEC-1`, `NFR-SEC-2`, `NFR-AUD-1`, `NFR-AVL-1`, `NFR-BKP-1/2`,
`NFR-DEP-1`); behaviour wording stays with `product-owner` /
`business-analyst`. Enforcement mechanics it assumes (tokens,
outbox, config distribution) are defined in
`docs/architecture/lld.md` §0 and bound per pair in
`docs/technical/integration.md`.

## 1. Assets and actors

Assets: guest PII (profiles, stay history), folio/payment records,
credentials and sessions, hotel configuration, reports, backups and
exports, audit entries, the running containers and database engine.

Actors: owner, manager, front-desk staff (the three fixed roles;
guests have no sign-in, `NFR-SEC-1`). Threat actors considered:
curious or malicious insider misusing a signed-in session; a
departed employee reusing a stale session; a device left unattended
at the desk; a compromised LAN device sniffing or injecting
traffic; a lost/stolen backup medium; a remote attacker reaching
for an internet-exposed surface (there is none by design);
vendor-support access over Tailscale.

Out of scope for the MVP model (recorded, not ignored): chain-scale
central services (explicitly non-MVP), guest self-service surfaces
(no guest sign-in exists), payment-processor integration (cash/card
recording only, no online processing), malware on staff devices
beyond session hygiene.

## 2. Trust boundaries

```text
[desk browsers / terminals] --(B1: hotel LAN)--> [Nginx] --> [module containers (8)]
                                                        |--> [shared DB engine: 8 schemas]
[owner/vendor remote] --(B2: Tailscale)--> [Nginx] (same entry, no other path)
[modules] --(B3: schema boundary)--> [own schema only; never another schema]
[system] --(B4: backup medium)--> [on-premise backup target / NAS]
```

- B1 — Desk clients on the hotel LAN. Assumption: the LAN is a
  closed, hotel-operated network (wired desk terminals and a staff
  WPA segment); it is trusted for availability but NOT for
  confidentiality against passive sniffing. Planned control (not
  implemented as of master — `deploy/nginx/nginx.conf` serves
  plain `:80`; `deploy/README.md` lists TLS/LAN hardening as
  future): all browser-to-Nginx traffic uses TLS with a
  hotel-local certificate installed at provisioning (§5), and
  session tokens never travel in URLs.
- B2 — Remote access over Tailscale only. No inbound internet
  exposure: Nginx binds the LAN interface; no port-forwarding, no
  callbacks, no external push targets. Vendor/owner remote sessions
  enter through the tailnet to Nginx with the same authentication
  and RBAC as desk sessions. Known limitation, stated openly:
  Tailscale coordination needs internet at session-establishment
  time, so remote access degrades during outages while the desk
  keeps working locally (`NFR-AVL-1`); remote unavailability is
  never a desk blocker and never a backup path.
- B3 — Schema boundary inside the shared engine. Each module's
  database credential grants exactly one schema; the engine accepts
  no cross-schema grants. A compromised module container therefore
  sees its own store only; anything else requires the named
  contracts with the victim's role checks.
- B4 — Backup/export media. The backup target is on-premise (disk
  partition or hotel NAS); media never leaves the property.
  Backups are encrypted at rest with a hotel-held key recorded in
  the provisioning log (§5); a lost medium without the key exposes
  nothing readable.

## 3. RBAC enforcement points and matrix

Every contract call carries the session token; every provider
enforces role checks before any business logic (LLD §0; C10).
There is no anonymous path and no guest sign-in (`NFR-SEC-1`).

| Capability | front-desk | manager | owner |
|---|---|---|---|
| Book / modify / cancel / walk-in / no-show; calendar | yes | yes | yes |
| Check-in / check-out / moves / times; arrivals lists | yes | yes | yes |
| Post charges / record payments / print invoice+receipt | yes | yes | yes |
| Housekeeping states; room inventory view | yes | yes | yes |
| Room/room-type setup; out-of-order blocks | no | yes | yes |
| Rate plans / restrictions / discounts; day-close | no | yes | yes |
| Reports (occupancy, revenue, daily sheet, housekeeping) | daily sheet + housekeeping only | yes | yes |
| Users/roles; hotel setup; export/backup | no | backup view only | yes |

Out-of-role attempts are refused with `FORBIDDEN` at the provider
(never hidden client-side only); refusals are audit-recorded with
actor and timestamp. Co-edited inventory (owner + manager) shares
one operation set with no primary editor (LLD §0).

## 4. Session and authentication controls (`NFR-SEC-2`)

- Unique identity + secret per user; secrets stored as hashes,
  never plaintext (`admin.users.secret_hash`).
- 5 consecutive wrong secrets lock the identity until the owner
  or manager unlocks it; lockouts are audit-recorded.
- 15-minute idle sign-out enforced server-side
  (`last_activity_at`) and client-side; absolute session lifetime
  is bounded by revalidation (LLD §0: revocation re-checked at
  least every 5 minutes, always on sensitive operations).
- Locked, revoked, or expired sessions are refused with
  `UNAUTHENTICATED`; a signed-out token cannot be replayed into a
  new session.
- `/app/` shell delta (Refs #291, ADR-0003 Consequences): the Vue
  3 + Vite shell keeps the single session token in the shared
  Pinia session store persisted to `sessionStorage` — it survives
  a tab reload and dies with the tab. No meaningful XSS
  regression in the LAN-only / no-guest-sign-in posture per
  `NFR-SEC-1`: script injected into the shell reads an in-memory
  token exactly as easily as a `sessionStorage` one, and the
  token still never travels in URLs (B1). Server-side controls
  above (idle sign-out, 5-minute revalidation, lockout) apply
  unchanged to shell sessions.

## 5. Secrets and first-provisioning flow

At install time (offline media, Ansible playbooks owned by
`release-manager`), the provisioner generates per-installation
secrets and records their existence (not their values) in a
provisioning log kept with the hotel (planned as a written
handover artefact — no log format exists in `deploy/` as of
master):

1. Database engine credentials: one random password per module
   schema plus an admin credential sealed for break-glass use.
2. Session-signing key (HMAC) held by Admin; TLS key/certificate
   for the LAN Nginx entry, installed on desk clients (planned —
   see B1; no TLS objects exist in `deploy/` as of master).
3. Backup-encryption key, hotel-held; a copy sealed with the
   break-glass credentials.
4. Bootstrap owner account: created with a one-time secret that
   must be changed at first sign-in; the one-time secret expires
   after first use. No default passwords survive provisioning.
5. Tailscale tailnet enrolment for the host (owner-approved
   devices only); enrolment tokens are single-use and expire.

Rotation: on staff departure the owner disables the account and
revokes its sessions (immediate effect via revalidation bound);
signing/DB keys rotate through a re-provisioning procedure, not
through desk functions. Secrets never appear in logs, exports,
reports, or error messages (CI secret-scan stays green).

## 6. Audit coverage (`NFR-AUD-1`, recording only)

Every owning module persists actor + timestamp on each creation,
change, state transition, charge, payment, config change, sign-in
outcome, lockout, approval, and backup run — in its own store
(`created_by/created_at/updated_by/updated_at` plus history
tables; schemas in `docs/technical/schema.md`). Audit entries are
immutable through desk/manager/owner functions (no update or
delete path exists). There is deliberately no on-screen audit log
view in the MVP (Later capability); coverage here means complete
recording with 24-month retrievability (`NFR-RET-1`), not display.

## 7. No-internet assumptions (stated, with consequences)

- The desk works fully offline (`NFR-AVL-1`): no operation calls
  outside the property; no OCSP, external auth, or cloud push in
  any flow. Time comes from the hotel-local clock (NTP from the
  LAN where present, manual discipline otherwise); every stored
  timestamp carries its UTC offset so later corrections stay
  unambiguous (`NFR-TZ-1`).
- Updates arrive on local media and are verified before apply
  (packaging owned by `release-manager`); the system never pulls
  updates itself.
- Remote access, monitoring push, and any off-property copy are
  unavailable during outages by design; the daily on-premise
  backup (`NFR-BKP-1/2`) is the continuity story, with RPO at most
  24 h and RTO at most 4 h on equivalent hardware, and every run
  reports success/failure with its time to the owner/manager.

## 8. Residual risks (accepted, monitored)

- R1 — LAN sniffing by a compromised device: reduced by LAN TLS,
  not eliminated on an unmanaged switch; revisit if the hotel
  adds guest-accessible network segments (they must never share
  the desk segment).
- R2 — Stale cached config/sessions during an Admin outage:
  bounded by the 5-minute revalidation and offline-first rule
  (LLD §0); prolonged Admin loss raises a monitoring alert.
- R3 — Backup media theft: reduced by at-rest encryption (§5);
  key custody is the owner's responsibility, rehearsed at
  handover.
- R4 — Single-host loss beyond the backup window: bounded by RPO
  24 h; restore drills (runbook) keep RTO 4 h honest.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-137
