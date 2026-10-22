# System architecture — single-property on-premise deployment

Status: active (proposed architecture; ADR-0001 still awaits owner
acceptance). Owned by `architect`. The deployable topology for one
MVP installation. Module responsibilities live in
`docs/architecture/hld.md`; this document adds the runtime shape only.

## 1. Deployable topology (one property, one server)

One installation serves exactly one hotel property (`NFR-DEP-1`) and
runs on a single on-premise physical server on that property. The
reverse proxy, all eight module containers, the database host (one
logical store per module), and the on-premise backup target all run
on that one host. All components keep working without internet
(`NFR-AVL-1`):

- Reverse proxy: the single entry point for desk clients on the
  hotel LAN; routes to the module containers on the same host; no
  external exposure.
- Module containers: one container per HLD module (Reservations,
  Stay, Rooms, Rates & Availability, Guests, Billing, Reporting,
  Admin & Config) on the same host, each embedding its own
  (proposed) runtime.
- Database server: the database engine on the same host, holding one
  logical store per module; modules connect only to their own store.
- Backup target: on-premise storage on the same host receiving exports
  and backups
  (`FR-ADM-5`); every run reports success or failure with its time
  (`NFR-BKP-1`, `NFR-BKP-2`: RPO at most 24 hours, RTO at most
  4 hours on equivalent hardware).
- Desk clients: staff browsers or terminals on the hotel LAN only;
  guests have no sign-in (`NFR-SEC-1`).

Conceptual layout (all server-side boxes on the single host):

```text
desk clients (hotel LAN) --> reverse proxy --> module containers (8)
                                                      |
                                          each module --> its own logical store
                                                              (same host)
module containers --> on-premise backup target (same host: exports/backups)
```

No component calls outside the property in the MVP; there are no
external integrations (no OTA, no payment provider, no accounting
sync — product scope, out of scope).

## 2. Sizing and performance frame

The topology must hold a 50-room hotel with 5 staff signed in at once
(`NFR-PERF-1`: named views within 2 seconds, named actions within
3 seconds) and two years of operating data for standard reports
(`NFR-PERF-2`: within 5 seconds). Open question OQ-A3 in ADR-0001
(`docs/architecture/decisions/adr-0001-monorepo-polyglot.md`) now
reads: single host confirmed; CPU/RAM/disk still open — the whole
installation above must fit on that one host.

## 3. Chain-ready direction (explicitly non-MVP)

Multi-property operation — per-property views plus shared oversight,
shared guest records, central administration — is a later direction,
not MVP. Nothing in this topology delivers it: there is no
cross-property reporting, no shared guest database, no central
service. When chain work starts, it extends or adds modules per the
then-accepted ADR; MVP boundaries must not be bent toward it early.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-46
