import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { RoomStore } from "./store.js";
import { PostgresRoomStore } from "./pgstore.js";

const port = Number(process.env["PORT"] ?? "8085");

// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the rooms schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical guard semantics.
const databaseUrl = process.env["DATABASE_URL"];
const store =
  databaseUrl !== undefined && databaseUrl !== ""
    ? new PostgresRoomStore(new Pool({ connectionString: databaseUrl }))
    : new RoomStore();
if (store instanceof PostgresRoomStore) {
  console.log("rooms using Postgres row storage");
}
const server = createServiceServer("rooms", store);
server.listen(port, () => {
  console.log(`rooms listening on :${port}`);
});
