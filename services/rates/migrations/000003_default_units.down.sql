-- Local-dev only rollback for the default-units migration
-- (see docs/technical/schema.md section 9: forward-only in production).

ALTER TABLE rates.rate_plans DROP COLUMN IF EXISTS default_units;
