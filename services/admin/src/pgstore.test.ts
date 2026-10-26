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

  it("manages roles, unlock, sign-out, list, and audit over persisted rows (FR-ADM-2, NFR-SEC-1/2, NFR-AUD-1)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      const ownerSession = await store.signIn("owner", "owner-secret");
      const owner = await store.authenticate(ownerSession.token);

      const desk = await store.createUser(owner, {
        displayName: "Desk",
        signinIdentity: "desk-1",
        secret: "desk-secret",
        role: "front-desk",
      });
      assert.equal(desk.role, "front-desk");

      const promoted = await store.updateUserRole(owner, { signinIdentity: "desk-1", role: "manager" });
      assert.equal(promoted.role, "manager");
      await assert.rejects(
        store.updateUserRole(owner, { signinIdentity: "owner", role: "manager" }),
        /last remaining owner/,
      );

      const listed = await store.listUsers(owner);
      assert.equal(listed.users.length, 2);
      assert.ok(listed.users.every((user) => !("secretHash" in user)));

      await store.updateConfig(owner, { values: { timezone: "Asia/Ho_Chi_Minh" }, updatedBy: "owner" });
      const log = await store.queryAuditLog(owner, { limit: 50 });
      const actions = log.entries.map((entry) => entry.action);
      assert.ok(actions.includes("user.created"));
      assert.ok(actions.includes("user.updated"));
      assert.ok(actions.includes("config.updated"));
      const created = log.entries.find((entry) => entry.action === "user.created" && entry.entity === "desk-1");
      assert.equal(created?.actor, "owner");

      for (let attempt = 0; attempt < 5; attempt++) {
        await assert.rejects(store.signIn("desk-1", "wrong"), /Unknown identity or wrong secret/);
      }
      await assert.rejects(store.signIn("desk-1", "desk-secret"), /locked/);
      const lockedList = await store.listUsers(owner);
      assert.equal(
        lockedList.users.find((user) => user.signinIdentity === "desk-1")?.locked,
        true,
      );
      const unlocked = await store.unlockIdentity(owner, { signinIdentity: "desk-1" });
      assert.equal(unlocked.unlocked, true);
      await store.signIn("desk-1", "desk-secret");

      const ended = await store.signOut(owner);
      assert.equal(ended.signedOut, true);
      await assert.rejects(store.authenticate(ownerSession.token), /revoked or signed out/);
    } finally {
      await pool.end();
    }
  });

  it("rotates the persisted secret hash: old stops, new signs in (issue #284)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      const ownerSession = await store.signIn("owner", "owner-secret");
      const owner = await store.authenticate(ownerSession.token);

      const rotated = await store.changeSecret(owner, {
        currentSecret: "owner-secret",
        newSecret: "owner-secret-rotated",
      });
      assert.equal(rotated.signinIdentity, "owner");
      await assert.rejects(store.signIn("owner", "owner-secret"), /Unknown identity or wrong secret/);
      await store.signIn("owner", "owner-secret-rotated");

      await assert.rejects(
        store.changeSecret(owner, { currentSecret: "not-the-secret", newSecret: "x" }),
        /Unknown identity or wrong secret/,
      );
    } finally {
      await pool.end();
    }
  });
});
