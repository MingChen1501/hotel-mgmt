import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { GuestStore } from "./store.js";
import { PostgresGuestStore } from "./pgstore.js";

const port = Number(process.env["PORT"] ?? "8086");

// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the guests schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical guest semantics.
const databaseUrl = process.env["DATABASE_URL"];
const store =
  databaseUrl !== undefined && databaseUrl !== ""
    ? new PostgresGuestStore(new Pool({ connectionString: databaseUrl }))
    : new GuestStore();
if (store instanceof PostgresGuestStore) {
  console.log("guests using Postgres row storage");
}
const server = createServiceServer("guests", store);
server.listen(port, () => {
  console.log(`guests listening on :${port}`);
});
