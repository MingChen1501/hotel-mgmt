-- Boot migration for the guests schema (skeleton, issue #99).
-- Creates the schema and the transactional outbox table only; business
-- tables land in later slices. Seed data is limited to empty-table
-- defaults: hotel values enter through Admin config operations, never
-- through seeds (see docs/technical/schema.md section 9).

CREATE SCHEMA IF NOT EXISTS guests;

CREATE TABLE IF NOT EXISTS guests.outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
