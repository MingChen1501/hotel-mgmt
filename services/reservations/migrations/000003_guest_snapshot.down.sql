-- Local-dev only rollback for the guest-snapshot migration
-- (see docs/technical/schema.md section 9: forward-only in production).

ALTER TABLE reservations.reservations DROP COLUMN IF EXISTS guest_snapshot;
