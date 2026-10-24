-- Read-model tables for the reporting schema (issue #149).
-- FR-RPT-1..4; see docs/technical/schema.md section 7.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the reporting schema.
-- Forward-only in production; the down file is local-dev only.
-- Every report row carries as_of (the newest event applied) so each
-- report shows its freshness; rows are rebuilt from domain events and
-- the schema never reads another module's tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE reporting.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_reporting_undispatched_idx
  ON reporting.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- FR-RPT-1: per-date, per-type occupancy counts.
CREATE TABLE IF NOT EXISTS reporting.rpt_occupancy_daily (
  night_date DATE NOT NULL,
  room_type_id UUID NOT NULL,
  occupied INT NOT NULL DEFAULT 0,
  available INT NOT NULL DEFAULT 0,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (night_date, room_type_id)
);

-- FR-RPT-2: per-date room and extra revenue totals.
CREATE TABLE IF NOT EXISTS reporting.rpt_revenue_daily (
  business_date DATE NOT NULL UNIQUE,
  room_revenue BIGINT NOT NULL DEFAULT 0,
  extra_revenue BIGINT NOT NULL DEFAULT 0,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-RPT-3: front-desk daily sheet figures.
CREATE TABLE IF NOT EXISTS reporting.rpt_daily_sheet (
  business_date DATE NOT NULL UNIQUE,
  figures JSONB NOT NULL DEFAULT '{}',
  as_of TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-RPT-4: rooms needing cleaning or inspection right now.
CREATE TABLE IF NOT EXISTS reporting.rpt_housekeeping_current (
  room_id UUID NOT NULL UNIQUE,
  state TEXT NOT NULL,
  needs_work BOOLEAN NOT NULL DEFAULT TRUE,
  as_of TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LLD section 7: consumer offsets for resume after restart.
CREATE TABLE IF NOT EXISTS reporting.consumer_offsets (
  subscription TEXT PRIMARY KEY,
  last_event_id TEXT,
  last_applied_at TIMESTAMPTZ
);
