-- Schema tables for the guests schema (issue #149).
-- FR-GST-1..3; see docs/technical/schema.md section 5.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the guests schema.
-- Forward-only in production; local-dev rollback is a fresh database.
-- Confirmations (FR-GST-4) are produced from reservation + hotel data
-- at request time and are not stored rows.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE guests.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_guests_undispatched_idx
  ON guests.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- FR-GST-1..3: one row per guest. Which identifying details are
-- mandatory is hotel config (FR-CUS-1), enforced in module logic;
-- contact details travel as one JSONB object so per-hotel field sets
-- need no schema change.
CREATE TABLE IF NOT EXISTS guests.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  contact JSONB NOT NULL DEFAULT '{}',
  preferences JSONB NOT NULL DEFAULT '{}',
  notes TEXT NOT NULL DEFAULT '',
  returning_flag BOOLEAN NOT NULL DEFAULT FALSE,
  past_stay_count INT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-GST-1: stay history links (stay_id is a logical reference to the
-- stay schema; populated from StayEvents, never by cross-schema reads).
CREATE TABLE IF NOT EXISTS guests.guest_stay_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID NOT NULL REFERENCES guests.guests (id),
  stay_id UUID NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guest_id, stay_id)
);
CREATE INDEX IF NOT EXISTS guest_stay_links_guest_idx
  ON guests.guest_stay_links (guest_id, linked_at);
