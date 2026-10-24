-- Cached inventory default on the rate plan row (issue #149).
-- FR-RTE-2; see docs/technical/schema.md section 4.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the rates schema.
-- Forward-only in production; the down file is local-dev only.
--
-- The PricingService keeps a per-plan default unit count as the
-- cached inventory input when the caller supplies no totalUnits
-- (contracts/http/UpsertRatePlan.json, CheckSellableCount fallback);
-- persisting the in-memory plan rows requires the column.

ALTER TABLE rates.rate_plans
  ADD COLUMN IF NOT EXISTS default_units INT NULL;
