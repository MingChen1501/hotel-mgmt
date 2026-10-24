-- Schema tables for the stay schema (issue #149).
-- FR-FDK-1..5; see docs/technical/schema.md section 2.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the stay schema.
-- Forward-only in production; local-dev rollback is a fresh database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE stay.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_stay_undispatched_idx
  ON stay.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- FR-FDK-1: one row per in-house occupation. reservation_id and
-- guest_id are logical references to the reservations and guests
-- schemas; current_room_id is a logical reference to the rooms
-- schema: enforced by contract, never by cross-schema FKs. The room
-- is assigned through the Rooms-schema atomic write first (LLD
-- section 3); the stay row is inserted only after the assignment
-- receipt returns (NFR-CON-2).
CREATE TABLE IF NOT EXISTS stay.stays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL UNIQUE,
  guest_id UUID NOT NULL,
  current_room_id UUID NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('in-house', 'closed')),
  actual_arrival TIMESTAMPTZ NULL,
  actual_departure TIMESTAMPTZ NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stays_state_idx
  ON stay.stays (state);

-- FR-FDK-3: move history (early/late times in FR-FDK-4 stay on the
-- stay row; NFR-AUD-1).
CREATE TABLE IF NOT EXISTS stay.stay_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id UUID NOT NULL REFERENCES stay.stays (id),
  from_room_id UUID NOT NULL,
  to_room_id UUID NOT NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stay_moves_stay_idx
  ON stay.stay_moves (stay_id, moved_at);
