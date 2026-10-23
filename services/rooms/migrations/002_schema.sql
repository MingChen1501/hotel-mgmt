-- Schema tables for the rooms schema (issue #111).
-- FR-RMS-1..4, FR-ADM-3; see docs/technical/schema.md section 3.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the rooms schema.
-- Forward-only in production; local-dev rollback is a fresh database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE rooms.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_rooms_undispatched_idx
  ON rooms.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- Room types co-edited by owner and manager (LLD section 0).
CREATE TABLE IF NOT EXISTS rooms.room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  capacity INT,
  bed_type TEXT,
  features JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-RMS-1/4: rooms with the fixed housekeeping state set
-- (the dirty -> clean -> inspected order is enforced in module
-- logic per LLD section 3, recorded in room_status_history).
CREATE TABLE IF NOT EXISTS rooms.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT UNIQUE NOT NULL,
  room_type_id UUID NOT NULL REFERENCES rooms.room_types (id),
  floor TEXT,
  bed_type TEXT,
  capacity INT,
  features JSONB NOT NULL DEFAULT '{}',
  state TEXT NOT NULL CHECK (state IN
    ('occupied', 'vacant-dirty', 'vacant-clean', 'vacant-inspected', 'out-of-order')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rooms_type_state_idx
  ON rooms.rooms (room_type_id, state);

-- FR-RMS-2: append-only state history (NFR-AUD-1).
CREATE TABLE IF NOT EXISTS rooms.room_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms.rooms (id),
  old_state TEXT NOT NULL,
  new_state TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_status_history_room_idx
  ON rooms.room_status_history (room_id, created_at);

-- FR-RMS-3: out-of-order ranges; the no-fully-overlapping-duplicate
-- guard is enforced in module logic at block time.
CREATE TABLE IF NOT EXISTS rooms.room_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms.rooms (id),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL CHECK (date_to >= date_from),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_blocks_room_dates_idx
  ON rooms.room_blocks (room_id, date_from, date_to);
