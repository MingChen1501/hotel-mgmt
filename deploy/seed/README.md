# Boot seed (walking skeleton, issue #111)

Minimal boot set for the Admin -> Rooms -> Rates -> Reservations E2E
loop: one hotel profile, one room type, two rooms, one admin
(`owner`) user. Nothing else — no rate plans, no reservations, no
other modules' data.

## Apply

Run after all four module migrations, against the shared engine:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f deploy/seed/boot.sql
```

The seed is idempotent (`INSERT ... ON CONFLICT DO NOTHING`) and
deterministic (fixed UUIDs), so re-running it is safe and the E2E
loop can rely on stable references.

## Verify

```sh
psql "$DATABASE_URL" -c "SELECT count(*) FROM admin.hotel_profile;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM admin.users;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM rooms.room_types;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM rooms.rooms;"
```

Expected: `1`, `1`, `1`, `2`.

## Credentials

The boot owner signs in as `owner` with the dev-only password
`change-me` (stored as a bcrypt hash, never plaintext). Rotate it
through Admin user operations before any real use.
