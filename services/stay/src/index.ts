import { Pool } from "pg";
import { BillingClient } from "./billing.js";
import { createServiceServer } from "./server.js";
import { StayStore } from "./store.js";
import { PostgresStayStore } from "./pgstore.js";

const port = Number(process.env["PORT"] ?? "8084");

// The check-out settlement gate re-reads the stay's folio through
// Billing (integration C7, ADR-0005 D2): one POST GetFolioBalance with
// the caller's Bearer token forwarded and a 5-second timeout. The
// compose service is billing:8087, wired the way Reservations wires
// RATES_BASE_URL; an unset or blank value builds an unwired client,
// which refuses every close fail-closed (503) instead of trusting the
// request.
const billingBaseUrl = process.env["BILLING_BASE_URL"] ?? "http://billing:8087";
const folios = new BillingClient(billingBaseUrl);

// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the stay schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical check-in semantics.
const databaseUrl = process.env["DATABASE_URL"];
const store =
  databaseUrl !== undefined && databaseUrl !== ""
    ? new PostgresStayStore(new Pool({ connectionString: databaseUrl }), folios)
    : new StayStore(folios);
if (store instanceof PostgresStayStore) {
  console.log("stay using Postgres row storage");
}
const server = createServiceServer("stay", store);
server.listen(port, () => {
  console.log(`stay listening on :${port}`);
});
