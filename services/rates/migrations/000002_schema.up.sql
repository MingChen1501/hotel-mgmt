-- Schema tables for the rates schema (issue #111).
-- FR-RTE-1..5; see docs/technical/schema.md section 4.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the rates schema.
-- Forward-only in production; down files are local-dev only.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE rates.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_rates_undispatched_idx
  ON rates.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- FR-RTE-1: named rate plans.
CREATE TABLE IF NOT EXISTS rates.rate_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-RTE-1: nightly prices in minor currency units, never floating
-- point (LLD section 0). room_type_id is a logical reference to the
-- rooms schema: enforced by contract, never by a cross-schema FK.
CREATE TABLE IF NOT EXISTS rates.rate_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_plan_id UUID NOT NULL REFERENCES rates.rate_plans (id),
  room_type_id UUID NOT NULL,
  night_date DATE NOT NULL,
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rate_plan_id, room_type_id, night_date)
);
CREATE INDEX IF NOT EXISTS rate_prices_type_night_idx
  ON rates.rate_prices (room_type_id, night_date);

-- FR-RTE-4: stay restrictions per room type and date range.
CREATE TABLE IF NOT EXISTS rates.stay_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id UUID NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL CHECK (date_to >= date_from),
  min_stay INT NULL,
  closed_to_arrival BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stay_restrictions_type_dates_idx
  ON rates.stay_restrictions (room_type_id, date_from, date_to);

-- FR-RTE-3: named discounts and special prices.
CREATE TABLE IF NOT EXISTS rates.discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'amount')),
  value_minor BIGINT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
