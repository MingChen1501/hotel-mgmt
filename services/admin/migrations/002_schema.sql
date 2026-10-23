-- Schema tables for the admin schema (issue #111).
-- FR-ADM-1..5, FR-CUS-1..3; see docs/technical/schema.md section 8.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the admin schema.
-- Forward-only in production; local-dev rollback is a fresh database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE admin.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_admin_undispatched_idx
  ON admin.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- FR-ADM-1: single hotel profile row (the singleton guard lives in
-- module logic; schema.md section 8).
CREATE TABLE IF NOT EXISTS admin.hotel_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  timezone TEXT NOT NULL,
  standard_checkin_time TEXT NOT NULL DEFAULT '14:00',
  standard_checkout_time TEXT NOT NULL DEFAULT '12:00',
  retention_floor_days INT NOT NULL DEFAULT 365,
  cancellation_wording TEXT,
  cancellation_reasons JSONB NOT NULL DEFAULT '[]',
  noshow_rule JSONB NOT NULL DEFAULT '{}',
  approval_rule JSONB NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-ADM-2: users with the three fixed roles (requirements section
-- 3.2); secrets are hashes only, never plaintext.
CREATE TABLE IF NOT EXISTS admin.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  signin_identity TEXT UNIQUE NOT NULL,
  secret_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'front-desk')),
  locked_until TIMESTAMPTZ NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- LLD section 0/8: sessions for the opaque token mechanics
-- (15-minute idle expiry, revocation).
CREATE TABLE IF NOT EXISTS admin.sessions (
  token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin.users (id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_admin_user_idx ON admin.sessions (user_id);

-- FR-ADM-1/4, FR-CUS-1..3: versioned per-hotel config values
-- (the section 3.1 set; fixed section 3.2 items never appear here).
CREATE TABLE IF NOT EXISTS admin.hotel_config_values (
  config_key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  schema_version INT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-ADM-5: backup runs reported to owner/manager with time.
CREATE TABLE IF NOT EXISTS admin.backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  cut_timestamp TIMESTAMPTZ NULL,
  manifest JSONB NOT NULL DEFAULT '{}',
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
