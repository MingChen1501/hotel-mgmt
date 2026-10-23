-- Schema tables for the reservations schema (issue #111).
-- FR-RES-1..6; see docs/technical/schema.md section 1.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the reservations
-- schema. No cross-schema FKs exist to order around.
-- Forward-only in production; down files are local-dev only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE reservations.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_reservations_undispatched_idx
  ON reservations.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- FR-RES-1: one row per reservation. room_type_id and guest_id are
-- logical references to the rooms and guests schemas: enforced by
-- contract, never by cross-schema FKs. The overbooking guard
-- (NFR-CON-1) lives in the create/modify transaction (LLD section 1).
CREATE TABLE IF NOT EXISTS reservations.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  arrival_date DATE NOT NULL,
  departure_date DATE NOT NULL CHECK (departure_date > arrival_date),
  room_type_id UUID NOT NULL,
  guest_id UUID NOT NULL,
  price_basis JSONB NOT NULL,
  state TEXT NOT NULL CHECK (state IN
    ('confirmed', 'checked-in', 'closed', 'cancelled', 'no-show')),
  cancel_reason TEXT NULL,
  noshow_reason TEXT NULL,
  stay_id UUID NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservations_type_dates_idx
  ON reservations.reservations (room_type_id, arrival_date, departure_date);

-- Append-only change history (BR-2; NFR-AUD-1).
CREATE TABLE IF NOT EXISTS reservations.reservation_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations.reservations (id),
  changed_field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_changes_reservation_idx
  ON reservations.reservation_changes (reservation_id, created_at);

-- Exactly-once effects for operations taking an idempotencyKey
-- (LLD sections 1, 2, 6); the key UNIQUE constraint returns the
-- original result on repeat.
CREATE TABLE IF NOT EXISTS reservations.idempotency_keys (
  key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  result_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
