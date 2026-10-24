-- Schema tables for the billing schema (issue #149).
-- FR-BIL-1..7; see docs/technical/schema.md section 6.
-- Flyway chain at the framework default (schema.md section 9);
-- this migration touches only the billing schema.
-- Invoices/receipts (FR-BIL-4) are presentations of folio/payment
-- rows, not stored rows.

-- Transactional outbox relay column (integration.md section 0):
-- the boot migration created the table; the dispatcher polls
-- undispatched rows via dispatched_at.
ALTER TABLE billing.outbox ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS outbox_billing_undispatched_idx
  ON billing.outbox (occurred_at) WHERE dispatched_at IS NULL;

-- FR-BIL-1: exactly one folio per stay (stay_id is a logical
-- reference to the stay schema; the UNIQUE guard is the one-folio
-- rule, BR-21).
CREATE TABLE IF NOT EXISTS billing.folios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id UUID NOT NULL UNIQUE,
  balance_minor BIGINT NOT NULL DEFAULT 0,
  open_balance_approval JSONB NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-BIL-2/5: charge lines with derived tax and fee amounts.
CREATE TABLE IF NOT EXISTS billing.folio_charge_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID NOT NULL REFERENCES billing.folios (id),
  item_kind TEXT NOT NULL CHECK (item_kind IN ('nightly-room-charge', 'charge-item')),
  item_name TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  tax_minor BIGINT NOT NULL DEFAULT 0,
  fee_minor BIGINT NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folio_charge_lines_folio_idx
  ON billing.folio_charge_lines (folio_id, posted_at);

-- FR-BIL-3: payment lines, cash or card only until OQ-1 is decided.
CREATE TABLE IF NOT EXISTS billing.folio_payment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_id UUID NOT NULL REFERENCES billing.folios (id),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folio_payment_lines_folio_idx
  ON billing.folio_payment_lines (folio_id, paid_at);

-- FR-CUS-3: hotel-defined sellables.
CREATE TABLE IF NOT EXISTS billing.charge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-BIL-5: hotel tax and fee rules as JSON documents.
CREATE TABLE IF NOT EXISTS billing.tax_fee_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  rule JSONB NOT NULL,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FR-BIL-6: day-close runs; totals must agree with the folio lines of
-- the date (BR-26). No sign-off columns until OQ-3 is decided.
CREATE TABLE IF NOT EXISTS billing.day_close_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_date DATE UNIQUE NOT NULL,
  charges_total_minor BIGINT NOT NULL,
  payments_by_method JSONB NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly-once effects for charge/payment operations taking an
-- idempotencyKey (LLD section 6); the key UNIQUE constraint returns
-- the original result on repeat.
CREATE TABLE IF NOT EXISTS billing.idempotency_keys (
  key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  result_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
