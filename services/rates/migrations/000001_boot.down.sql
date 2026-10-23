-- Local-dev only rollback for the boot migration (see
-- docs/technical/schema.md section 9: forward-only in production).

DROP TABLE IF EXISTS rates.outbox;
