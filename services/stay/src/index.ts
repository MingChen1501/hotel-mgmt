import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { StayStore } from "./store.js";
import { PostgresStayStore } from "./pgstore.js";
import { createReservationsClient } from "./reservationsClient.js";

const port = Number(process.env["PORT"] ?? "8084");

// The committed check-out completes the booking behind the stay
// through Reservations (FR-DEP-1, #646). RESERVATIONS_BASE_URL is
// wired in deploy/compose.yaml; without it the close still stands and
// reports the split instead of claiming a completion (FR-DEP-5).
const reservationsBaseURL = process.env["RESERVATIONS_BASE_URL"];
const completion =
  reservationsBaseURL !== undefined && reservationsBaseURL.trim() !== ""
    ? createReservationsClient(reservationsBaseURL)
    : undefined;

// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the stay schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical check-in semantics.
const databaseUrl = process.env["DATABASE_URL"];
const store =
  databaseUrl !== undefined && databaseUrl !== ""
    ? new PostgresStayStore(new Pool({ connectionString: databaseUrl }), completion)
    : new StayStore(completion);
if (store instanceof PostgresStayStore) {
  console.log("stay using Postgres row storage");
}
const server = createServiceServer("stay", store);
server.listen(port, () => {
  console.log(`stay listening on :${port}`);
});
