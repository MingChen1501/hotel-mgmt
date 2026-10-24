import { Pool } from "pg";
import { createServiceServer, bootStoreFromEnvironment, bootStoreWithRetry } from "./server.js";
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
  const server = createServiceServer("admin", store);
  // Listen before seeding: the install flow applies the admin
  // schema after the containers answer health checks (deployment.md
  // section 3 steps 4-5), so blocking on the seed here would exit
  // the process before the reverse proxy can resolve this module.
  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      console.log(`admin listening on :${port}`);
      resolve();
    });
  });
  if (store instanceof PostgresAdminStore) {
    await bootStoreWithRetry(store);
  } else {
    await bootStoreFromEnvironment(store);
  }
}

void main();
