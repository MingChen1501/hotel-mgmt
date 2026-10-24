import { Pool } from "pg";
import { createServiceServer, bootStoreFromEnvironment } from "./server.js";
import { type AdminStoreAPI, AdminStore } from "./store.js";
import { PostgresAdminStore } from "./pgstore.js";
import { applyAdminMigrations } from "./migrate.js";

const port = Number(process.env["PORT"] ?? "8088");

// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the admin schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical identity and config semantics.
const databaseUrl = process.env["DATABASE_URL"];
const usePostgres = databaseUrl !== undefined && databaseUrl !== "";

async function main(): Promise<void> {
  let store: AdminStoreAPI = new AdminStore();
  if (usePostgres) {
    console.log("admin using Postgres row storage");
    const pool = new Pool({ connectionString: databaseUrl });
    // The install flow starts the containers before the schema
    // exists, and the boot seed needs these tables before sign-in
    // can work, so the module applies its own chain first — the same
    // startup-migration pattern billing uses with Flyway. Every
    // statement is idempotent, so the later E2E re-apply of the same
    // files has no effect.
    const applied = await applyAdminMigrations(pool);
    console.log(`admin applied migrations: ${applied.join(", ")}`);
    store = new PostgresAdminStore(pool);
  }
  await bootStoreFromEnvironment(store);
  const server = createServiceServer("admin", store);
  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`admin listening on :${port}`);
      resolve();
    });
  });
}

void main();
