import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { applyAdminMigrations } from "./migrate.js";
import { PostgresAdminStore } from "./pgstore.js";

// Startup migrations for the admin schema (issue #149). The
// orchestration check runs everywhere with a stub pool; the
// round-trip needs a database, so it is skipped without TEST_PG_URL
// like the pgstore suite.
const DATABASE_URL = process.env["TEST_PG_URL"];

describe("admin startup migrations", () => {
  it("applies the schema chain in file order", async () => {
    const seen: string[] = [];
    const pool = {
      async query(sql: string) {
        seen.push(sql);
        return { rows: [] };
      },
    } as unknown as Pool;
    const applied = await applyAdminMigrations(pool);
    assert.deepEqual(applied, ["001_boot.sql", "002_schema.sql"]);
    assert.equal(seen.length, 2);
    assert.match(seen[0] as string, /CREATE SCHEMA IF NOT EXISTS admin/);
    for (const sql of seen) {
      assert.ok((sql as string).trim().length > 0);
    }
  });

  it("is idempotent and leaves a working boot seed", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      const first = await applyAdminMigrations(pool);
      assert.deepEqual(first, ["001_boot.sql", "002_schema.sql"]);
      // The E2E loop re-applies the same files after startup.
      await applyAdminMigrations(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      const boot = await store.ensureBootUser("owner", "owner-secret");
      assert.equal(boot.role, "owner");
      const { token } = await store.signIn("owner", "owner-secret");
      assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-f]+$/);
    } finally {
      await pool.end();
    }
  });
});
