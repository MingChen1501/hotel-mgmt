-- Minimal boot seed for the walking skeleton E2E loop (issue #111).
--
-- Exactly the minimal boot set, nothing more: one hotel profile, one
-- room type, two rooms, one admin user. Hotel values beyond this row
-- enter through Admin config operations, never through seeds
-- (docs/technical/schema.md section 9).
--
-- Apply after all four module migrations, against the shared engine:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/seed/boot.sql
--
-- Idempotent (INSERT ... ON CONFLICT DO NOTHING) and deterministic
-- (fixed UUIDs) so the E2E loop can rely on stable references.
-- The owner secret below is a development-only boot credential:
-- rotate it through Admin user operations before any real use.

-- One hotel (admin.hotel_profile holds a single row; the singleton
-- guard lives in module logic, schema.md section 8).
INSERT INTO admin.hotel_profile
  (id, name, address, phone, email, timezone,
   standard_checkin_time, standard_checkout_time, retention_floor_days,
   created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Skeleton Hotel',
   '1 Demo Street', '+00 000 000 000', 'desk@skeleton.example',
   'UTC', '14:00', '12:00', 365, 'seed', 'seed')
ON CONFLICT (id) DO NOTHING;

-- One admin user (role owner; secret is a bcrypt hash of the
-- dev-only password 'change-me', generated with pgcrypto crypt()).
INSERT INTO admin.users
  (id, display_name, signin_identity, secret_hash, role, created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000000002', 'Boot Owner', 'owner',
   crypt('change-me', gen_salt('bf')), 'owner', 'seed', 'seed')
ON CONFLICT (signin_identity) DO NOTHING;

-- One room type.
INSERT INTO rooms.room_types
  (id, name, capacity, bed_type, features, created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'Standard Double',
   2, 'double', '{"beds": 1}', 'seed', 'seed')
ON CONFLICT (id) DO NOTHING;

-- Two rooms of that type, inspected and ready for the E2E loop.
INSERT INTO rooms.rooms
  (id, number, room_type_id, floor, bed_type, capacity, state, created_by, updated_by)
VALUES
  ('00000000-0000-0000-0000-000000000201', '101',
   '00000000-0000-0000-0000-000000000101', '1', 'double', 2,
   'vacant-inspected', 'seed', 'seed'),
  ('00000000-0000-0000-0000-000000000202', '102',
   '00000000-0000-0000-0000-000000000101', '1', 'double', 2,
   'vacant-inspected', 'seed', 'seed')
ON CONFLICT (id) DO NOTHING;
