-- Local-dev only rollback for the reporting read-model migration
-- (see docs/technical/schema.md section 9: forward-only in production).

DROP TABLE IF EXISTS reporting.rpt_occupancy_daily;
DROP TABLE IF EXISTS reporting.rpt_revenue_daily;
DROP TABLE IF EXISTS reporting.rpt_daily_sheet;
DROP TABLE IF EXISTS reporting.rpt_housekeeping_current;
DROP TABLE IF EXISTS reporting.consumer_offsets;
DROP INDEX IF EXISTS reporting.outbox_reporting_undispatched_idx;
ALTER TABLE reporting.outbox DROP COLUMN IF EXISTS dispatched_at;
