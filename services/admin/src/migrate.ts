import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

// Applies the admin schema chain at startup (issue #149). The
// install flow starts the containers before the schema exists, and
// the boot seed needs these tables before the module can serve
// sign-in traffic, so the module applies its own chain first — the
// same startup-migration pattern billing uses with Flyway. Files run
// in name order; every statement is IF NOT EXISTS / ON CONFLICT DO
// NOTHING, so the E2E loop can re-apply the same files later without
// effect. Returns the applied file names.
export async function applyAdminMigrations(pool: Pool): Promise<string[]> {
  // Compiled layout keeps migrations next to the service root
  // (dist/../migrations in the image, src/../migrations in dev).
  const dir = join(__dirname, "..", "migrations");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(dir, file), "utf8");
    await pool.query(sql);
  }
  return files;
}
