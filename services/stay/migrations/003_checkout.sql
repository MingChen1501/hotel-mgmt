-- Desk-loop writes for the stay schema (issue #150).
-- FR-FDK-2/3/4; see docs/technical/schema.md section 2.
-- One migration chain per schema, stored with its owning module
-- (schema.md section 9); this file touches only the stay schema.
-- Forward-only in production; local-dev rollback is a fresh database.

-- Idempotency keys for the guarded desk writes (node-module
-- conventions): CheckOut and MoveRoom persist the caller-supplied
-- key UNIQUE so a replay returns the original result instead of a
-- duplicate transition (NFR-CON-2). result_ref carries the stay id.
CREATE TABLE IF NOT EXISTS stay.idempotency_keys (
  key TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  result_ref UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
