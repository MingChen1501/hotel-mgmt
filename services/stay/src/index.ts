import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { StayStore } from "./store.js";
import { PostgresStayStore } from "./pgstore.js";

const port = Number(process.env["PORT"] ?? "8084");

// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the stay schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical check-in semantics.
const databaseUrl = process.env["DATABASE_URL"];
const store =
  databaseUrl !== undefined && databaseUrl !== ""
    ? new PostgresStayStore(new Pool({ connectionString: databaseUrl }))
    : new StayStore();
if (store instanceof PostgresStayStore) {
  console.log("stay using Postgres row storage");
}
const server = createServiceServer("stay", store);
server.listen(port, () => {
  console.log(`stay listening on :${port}`);
});
