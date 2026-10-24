import { Pool } from "pg";
import { createServiceServer, bootStoreFromEnvironment } from "./server.js";
import { AdminStore } from "./store.js";
import { PostgresAdminStore } from "./pgstore.js";

const port = Number(process.env["PORT"] ?? "8088");

// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the admin schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical identity and config semantics.
const databaseUrl = process.env["DATABASE_URL"];
const store =
  databaseUrl !== undefined && databaseUrl !== ""
    ? new PostgresAdminStore(new Pool({ connectionString: databaseUrl }))
    : new AdminStore();
if (store instanceof PostgresAdminStore) {
  console.log("admin using Postgres row storage");
}

async function main(): Promise<void> {
  await bootStoreFromEnvironment(store);
  const server = createServiceServer("admin", store);
  server.listen(port, () => {
    console.log(`admin listening on :${port}`);
  });
}

void main();
