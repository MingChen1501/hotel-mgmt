-- Boot migration for the admin schema (skeleton, issue #99).
-- Creates the schema, the transactional outbox table, and the fixed
-- role set. This is the minimal boot seed: the three roles are fixed
-- by the requirements (section 3.2) and hotel values enter through
-- Admin config operations, never through seeds
-- (see docs/technical/schema.md section 9).

CREATE SCHEMA IF NOT EXISTS admin;

CREATE TABLE IF NOT EXISTS admin.outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin.roles (
  role_key TEXT PRIMARY KEY,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin.roles (role_key) VALUES
  ('owner'),
  ('manager'),
  ('front-desk')
ON CONFLICT (role_key) DO NOTHING;
