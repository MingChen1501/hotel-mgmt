import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { PostgresAdminStore } from "./pgstore.js";

// Postgres round-trip for the admin schema (issue #149). Skipped
// without TEST_PG_URL so `npm test` stays green without a database;
// the persistence path is exercised wherever one exists (locally and
// in the e2e lab).
const DATABASE_URL = process.env["TEST_PG_URL"];

async function wipe(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM admin.outbox");
  await pool.query("DELETE FROM admin.sessions");
  await pool.query("DELETE FROM admin.backup_runs");
  await pool.query("DELETE FROM admin.hotel_config_values");
  await pool.query("DELETE FROM admin.users");
  await pool.query(
    `INSERT INTO admin.hotel_profile
       (id, name, address, phone, email, timezone, standard_checkin_time,
        standard_checkout_time, retention_floor_days, created_by, updated_by)
     VALUES ('00000000-0000-0000-0000-000000000001', 'pg-test', 'addr', 'phone',
       'mail', 'UTC', '14:00', '12:00', 365, 'test', 'test')
     ON CONFLICT (id) DO UPDATE SET timezone = 'UTC', standard_checkin_time = '14:00',
       standard_checkout_time = '12:00', retention_floor_days = 365,
       cancellation_reasons = '[]', noshow_rule = '{}', updated_by = 'test', updated_at = now()`,
  );
}

describe("admin postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("signs in the boot owner and reads the hotel config", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      const boot = await store.ensureBootUser("owner", "owner-secret");
      assert.equal(boot.role, "owner");
      const { token, user } = await store.signIn("owner", "owner-secret");
      assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-f]+$/);
      const caller = await store.authenticate(token);
      assert.equal(caller.userId, user.userId);

      const config = await store.getConfig();
      assert.equal(config.schemaVersion, 1);
      assert.equal(config.values["timezone"], "UTC");
      const updated = await store.updateConfig(caller, {
        values: { timezone: "Asia/Ho_Chi_Minh" },
        updatedBy: "owner",
      });
      assert.equal(updated.values["timezone"], "Asia/Ho_Chi_Minh");
      const reread = await store.getConfig();
      assert.equal(reread.values["timezone"], "Asia/Ho_Chi_Minh");
    } finally {
      await pool.end();
    }
  });

  it("locks the identity after five failures", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      for (let attempt = 0; attempt < 5; attempt++) {
        await assert.rejects(store.signIn("owner", "wrong-secret"), /Unknown identity or wrong secret/);
      }
      await assert.rejects(store.signIn("owner", "owner-secret"), /locked/);
      const locked = await pool.query("SELECT locked_until FROM admin.users WHERE signin_identity = 'owner'");
      assert.ok((locked.rows[0] as { locked_until: string }).locked_until !== null);
    } finally {
      await pool.end();
    }
  });
});
