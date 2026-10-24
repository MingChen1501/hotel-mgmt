-- Guest snapshot on the reservation row (issue #149).
-- FR-RES-1, FR-GST-4; see docs/technical/schema.md section 1.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the reservations
-- schema. Forward-only in production; the down file is local-dev only.
--
-- The booking confirmation (FR-GST-4) and GetReservation show the
-- guest details captured at booking time. Modules never read another
-- schema, so the reservation keeps the guest object it accepted as an
-- immutable snapshot next to the guest_id logical reference; later
-- profile edits do not rewrite history.

ALTER TABLE reservations.reservations
  ADD COLUMN IF NOT EXISTS guest_snapshot JSONB NOT NULL DEFAULT '{}';
