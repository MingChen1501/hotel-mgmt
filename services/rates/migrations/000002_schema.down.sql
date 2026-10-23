-- Local-dev only rollback for the rates schema migration
-- (see docs/technical/schema.md section 9: forward-only in production).

DROP TABLE IF EXISTS rates.rate_prices;
DROP TABLE IF EXISTS rates.stay_restrictions;
DROP TABLE IF EXISTS rates.discounts;
DROP TABLE IF EXISTS rates.rate_plans;
DROP INDEX IF EXISTS rates.outbox_rates_undispatched_idx;
ALTER TABLE rates.outbox DROP COLUMN IF EXISTS dispatched_at;
