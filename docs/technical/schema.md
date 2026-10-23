# Data schemas — shared engine, eight dedicated schemas

Status: active (Closes #97). Owned by `architect`. Physical tables
for the eight HLD modules on the one shared database engine
(accepted default PostgreSQL; MySQL stays the named fallback —
ADR-0001, accepted 2026-10-23). Every table traces to FRs and to a
`docs/requirements/data-dictionary.md` entry (§n below); lifecycle
states follow `docs/architecture/state-machine.md`; audit columns
satisfy `NFR-AUD-1` (recording only). Modules never share tables and
never read another schema: cross-module needs travel only through the
contracts in `docs/technical/integration.md`.

Conventions (all schemas):

- Engine types are PostgreSQL: `timestamptz` for every timestamp
  (carries the UTC offset, `NFR-TZ-1`), `BIGINT` for money in minor
  currency units, `TEXT` + `CHECK` for state/method enums (readable
  on the MySQL fallback without engine enums), `UUID` primary keys
  generated at creation (locally generatable, no coordination).
- Audit columns on every business table: `created_by`,
  `created_at`, `updated_by`, `updated_at` (all `NOT NULL`);
  history tables additionally keep the superseded values. No desk,
  manager, or owner operation updates or deletes audit entries.
- Idempotency: provider operations that take an `idempotencyKey`
  (LLD §1, §2, §6) persist it with a UNIQUE constraint and return
  the original result on repeat.
- Outbox: each of the seven emitting schemas holds an `outbox`
  table (`id UUID PK`, `aggregate TEXT`, `event_type TEXT`,
  `payload JSONB`, `occurred_at TIMESTAMPTZ`, `dispatched_at
  TIMESTAMPTZ NULL`); rows are written in the same transaction as
  the business change and relayed by the dispatcher (LLD §0).
- Retention: rows newer than the hotel's configured retention floor
  cannot be purged (`NFR-RET-1`); purge mechanics belong to a later
  operations slice, not to this schema.

## 1. `reservations` schema (FR-RES-1..6; dictionary §1 Reservation)

`reservations` — one row per reservation.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `reference` | TEXT | UNIQUE NOT NULL (human ref, FR-RES-1) |
| `arrival_date`, `departure_date` | DATE | NOT NULL, `CHECK (departure_date > arrival_date)` |
| `room_type_id` | UUID | NOT NULL (logical ref to rooms schema; no cross-schema FK — enforced by contract, not by the engine) |
| `guest_id` | UUID | NOT NULL (logical ref to guests schema, same rule) |
| `price_basis` | JSONB | NOT NULL (plan ref, nightly breakdown, quoted total, discount name; FR-RTE-5) |
| `state` | TEXT | NOT NULL, `CHECK (state IN ('confirmed','checked-in','closed','cancelled','no-show'))` |
| `cancel_reason`, `noshow_reason` | TEXT | NULL (reason from hotel list when applicable, FR-RES-3/6) |
| `stay_id` | UUID | NULL, UNIQUE (link once checked in) |
| audit columns | — | NOT NULL |

`reservation_changes` — append-only change history (BR-2; NFR-AUD-1):
`id` PK, `reservation_id` FK -> reservations, `changed_field`,
`old_value`, `new_value` (JSONB), actor + timestamp, NOT NULL.

`idempotency_keys` — `key` TEXT PK, `operation`, `result_ref`,
`created_at` (UNIQUE key enforces exactly-once effects).

Overbooking guard: the create/modify transaction counts overlapping
`confirmed` and `checked-in` reservation rows for the type/dates
(`checked-in` covers the in-house share, so no cross-schema read)
and inserts only if capacity remains (`NFR-CON-1`; mechanism in LLD
§1). No engine-level
exclusion constraint is assumed across the logical room-type
reference; the atomic transaction is the guard.

## 2. `stay` schema (FR-FDK-1..5; dictionary §2 Stay)

`stays` — one row per in-house occupation.

| Column | Type | Constraints |
|---|---|---|
| `id` | UUID | PK |
| `reservation_id` | UUID | NOT NULL, UNIQUE (at most one stay per reservation) |
| `guest_id` | UUID | NOT NULL (logical ref) |
| `current_room_id` | UUID | NOT NULL (logical ref to rooms schema) |
| `state` | TEXT | NOT NULL, `CHECK (state IN ('in-house','closed'))` |
| `actual_arrival`, `actual_departure` | TIMESTAMPTZ | NULL (early/late kept, FR-FDK-4) |
| audit columns | — | NOT NULL |

`stay_moves` — move history (FR-FDK-3): `id` PK, `stay_id` FK,
`from_room_id`, `to_room_id`, `moved_at`, actor, NOT NULL.

`stay_room_assignment` guard: check-in/move assigns through the
Rooms-schema atomic write (LLD §3); the stay row is inserted only
after the assignment receipt returns (`NFR-CON-2`).

## 3. `rooms` schema (FR-RMS-1..4, FR-ADM-3; dictionary §§8–9)

`room_types` — `id` UUID PK, `name` UNIQUE NOT NULL, `capacity`,
`bed_type`, `features` (JSONB), audit columns. Co-edited by owner
and manager through the same operations (LLD §0).

`rooms` — `id` UUID PK, `number` UNIQUE NOT NULL, `room_type_id` FK
-> room_types, `floor`, `bed_type`, `capacity`, `features` (JSONB),
`state` TEXT NOT NULL `CHECK (state IN
('occupied','vacant-dirty','vacant-clean','vacant-inspected','out-of-order'))`,
audit columns.

`room_status_history` — append-only (FR-RMS-2; NFR-AUD-1): `id` PK,
`room_id` FK, `old_state`, `new_state`, actor + timestamp, NOT NULL.
Transition legality (dirty -> clean -> inspected; out-of-order only
from/to vacant) is enforced in module logic (LLD §3), recorded here.

`room_blocks` — out-of-order ranges (FR-RMS-3): `id` PK, `room_id`
FK, `date_from`, `date_to` (DATE, NOT NULL, `CHECK (date_to >=
date_from)`), `reason` NOT NULL, actor + timestamp. UNIQUE guard
against fully overlapping duplicate ranges per room is enforced in
module logic at block time.

## 4. `rates` schema (FR-RTE-1..5; dictionary §§9, 11)

`rate_plans` — `id` UUID PK, `name` UNIQUE NOT NULL, `description`,
audit columns.

`rate_prices` — nightly prices (FR-RTE-1): `id` PK,
`rate_plan_id` FK, `room_type_id` UUID NOT NULL (logical ref),
`night_date` DATE NOT NULL, `price_minor` BIGINT NOT NULL `CHECK
(>= 0)`; UNIQUE (`rate_plan_id`, `room_type_id`, `night_date`).

`stay_restrictions` — (FR-RTE-4): `id` PK, `room_type_id` UUID NOT
NULL, `date_from`, `date_to`, `min_stay INT NULL`, `closed_to_arrival
BOOLEAN NOT NULL DEFAULT FALSE`, audit columns.

`discounts` — named discounts/special prices (FR-RTE-3): `id` PK,
`name` UNIQUE NOT NULL, `kind` TEXT CHECK (`'percent'`/`'amount'`),
`value_minor` BIGINT NOT NULL, audit columns.

## 5. `guests` schema (FR-GST-1..4; dictionary §10)

`guests` — one row per guest: `id` UUID PK, identifying details
(`full_name` NOT NULL + contact columns; which are mandatory is
hotel config, FR-CUS-1, enforced in logic), `preferences` and
`notes` TEXT/JSONB (visible at booking, FR-GST-2), `returning_flag`
BOOLEAN, `past_stay_count` INT NOT NULL DEFAULT 0 (FR-GST-3),
audit columns.

`guest_stay_links` — stay history (FR-GST-1): `id` PK, `guest_id`
FK, `stay_id` UUID NOT NULL (logical ref), `linked_at`,
UNIQUE (`guest_id`, `stay_id`).

Confirmations (FR-GST-4) are produced from reservation + hotel data
at request time and are not stored rows.

## 6. `billing` schema (FR-BIL-1..7; dictionary §§3–7)

`folios` — exactly one per stay (BR-21): `id` UUID PK, `stay_id`
UUID NOT NULL UNIQUE (logical ref), `balance_minor` BIGINT NOT NULL
DEFAULT 0, `open_balance_approval` JSONB NULL (approver, role, time;
FR-BIL-7), audit columns.

`folio_charge_lines` — (FR-BIL-2/5): `id` PK, `folio_id` FK,
`item_kind` TEXT CHECK (`'nightly-room-charge'`/`'charge-item'`),
`item_name`, `amount_minor` BIGINT NOT NULL, `tax_minor`,
`fee_minor` BIGINT NOT NULL DEFAULT 0 (derived from hotel rules),
`posted_at` TIMESTAMPTZ NOT NULL.

`folio_payment_lines` — (FR-BIL-3): `id` PK, `folio_id` FK,
`method` TEXT CHECK (`'cash'`,`'card'`) NOT NULL (fixed until OQ-1),
`amount_minor` BIGINT NOT NULL `CHECK (> 0)`, `paid_at` NOT NULL.

`charge_items` — hotel-defined sellables (FR-CUS-3): `id` PK,
`name` UNIQUE NOT NULL, `price_minor` BIGINT NOT NULL `CHECK (>=
0)`, defining manager + time (audit columns).

`tax_fee_rules` — (FR-BIL-5): `id` PK, `name` UNIQUE NOT NULL,
`rule` JSONB NOT NULL (rate/threshold definition), audit columns.

`day_close_runs` — (FR-BIL-6): `id` PK, `business_date` DATE UNIQUE
NOT NULL, `charges_total_minor`, `payments_by_method` JSONB NOT
NULL, `run_at`, actor. Totals must agree with folio lines of the
date (BR-26); no sign-off columns until OQ-3 is decided.

`idempotency_keys` — as in §1 (charge/payment exactly-once).

Invoices/receipts (FR-BIL-4) are presentations of folio/payment
rows, not stored rows.

## 7. `reporting` schema (FR-RPT-1..4; read model, rebuilt from events)

Pre-aggregated tables served by the read API; all rows carry
`as_of` TIMESTAMPTZ (the newest event applied) so every report
shows its freshness (OQ-C1 answer).

- `rpt_occupancy_daily` — (`night_date`, `room_type_id`) PK-ish
  UNIQUE, `occupied`, `available` INTs (FR-RPT-1).
- `rpt_revenue_daily` — (`business_date`) UNIQUE, `room_revenue`,
  `extra_revenue` BIGINT (FR-RPT-2).
- `rpt_daily_sheet` — (`business_date`) UNIQUE, arrivals/in-house/
  departures/open-balance figures as JSONB + generated columns
  (FR-RPT-3).
- `rpt_housekeeping_current` — (`room_id`) UNIQUE, current state +
  needs-work flag (FR-RPT-4; inspected and out-of-order excluded
  from the work list in the serving query).
- `consumer_offsets` — (`subscription` TEXT PK, `last_event_id`,
  `last_applied_at`) for resume after restart (LLD §7).

No FKs point outside this schema; the read model never reads other
schemas directly (HLD §3).

## 8. `admin` schema (FR-ADM-1..5, FR-CUS-1..3; dictionary §§12–13)

`hotel_profile` — single row: `id` PK (fixed singleton guard in
logic), identity, contact, local settings (timezone, standard
times, retention floor), cancellation wording + reason lists,
no-show rule, approval rule (FR-ADM-1; requirements §3.1).

`users` — `id` UUID PK, `display_name`, `signin_identity` UNIQUE
NOT NULL, `secret_hash` NOT NULL (never plaintext), `role` TEXT
CHECK (`'owner'`,`'manager'`,`'front-desk'`) NOT NULL (FR-ADM-2;
requirements §3.2 fixes the three roles), `locked_until`
TIMESTAMPTZ NULL (5-strike lockout, NFR-SEC-2), audit columns.

`sessions` — `token_id` UUID PK, `user_id` FK, `issued_at`,
`last_activity_at`, `expires_at`, `revoked` BOOLEAN (15-minute
idle + revocation for LLD §0 token mechanics).

`hotel_config_values` — the §3.1 set as versioned rows:
(`config_key` TEXT PK, `value` JSONB, `schema_version`, updated by
+ at). Fixed §3.2 items never appear here.

`backup_runs` — (FR-ADM-5; NFR-BKP-2): `id` PK, `started_at`,
`finished_at`, `cut_timestamp`, `manifest` JSONB (per-module slice
times), `result` TEXT CHECK (`'success'`,`'failure'`), reported to
owner/manager with time.

## 9. Migration strategy (one chain per schema, tool per stack)

- One migration chain per schema, stored with its owning module
  (`services/<module>/migrations/`); a migration touches exactly
  one schema. Chains are independent and apply in dependency-free
  order (no cross-schema FKs exist to order around).
- Tools per stack: Go modules (Reservations, Rates, Reporting) use
  golang-migrate (SQL files, `up`/`down` pairs, versioned
  integers); Node.js modules (Stay, Rooms, Guests, Admin) use
  node-pg-migrate (SQL-first migrations, same integer versioning);
  Billing (Spring Boot) uses Flyway (versioned `V<n>__` SQL).
  Three tools is the accepted cost of the polyglot mapping, not a
  new decision.
- Rules: forward-only in production (down migrations for local
  development only); additive changes first, removals only after a
  deprecation window (expand-then-contract, mirroring the contract
  versioning in `docs/technical/integration.md`); every migration
  header names its FR trace; seed data is limited to the fixed
  role set and empty-table defaults — hotel values enter through
  Admin config operations, never through seeds.

Traceability: every dictionary entry (§§1–13) has its tables
above; every FR's stored data has a row home; the fixed §3.2 items
(shape of the lifecycle, one folio per stay, three roles, cash/card)
appear as CHECK constraints and singletons, never as editable
config.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-137
