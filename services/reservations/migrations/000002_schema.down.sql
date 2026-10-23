-- Local-dev only rollback for the reservations schema
-- migration (see docs/technical/schema.md section 9: forward-only
-- in production).

DROP TABLE IF EXISTS reservations.reservation_changes;
DROP TABLE IF EXISTS reservations.idempotency_keys;
DROP TABLE IF EXISTS reservations.reservations;
DROP INDEX IF EXISTS reservations.outbox_reservations_undispatched_idx;
ALTER TABLE reservations.outbox DROP COLUMN IF EXISTS dispatched_at;
