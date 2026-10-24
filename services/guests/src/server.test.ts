import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { GuestStore } from "./store.js";
import { PostgresGuestStore } from "./pgstore.js";

const TOKEN = "skeleton-test-token";

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("health", () => {
  it("answers /healthz with the service identity", async () => {
    const server = createServiceServer("guests");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/healthz");
      assert.equal(status, 200);
      assert.deepEqual(body, { service: "guests", status: "ok" });
    } finally {
      server.close();
    }
  });

  it("refuses unknown paths with the NOT_FOUND envelope", async () => {
    const server = createServiceServer("guests");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/v1/guests/CheckIn");
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    } finally {
      server.close();
    }
  });
});

describe("guest profiles", () => {
  it("upserts a guest and shows preferences before booking", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const upserted = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "E2E Guest",
        preferences: { floor: "high" },
        actor: "front-desk",
      });
      assert.equal(upserted.status, 200);
      const guestId = (upserted.body as { guestId: string }).guestId;
      assert.ok(guestId);

      const identified = await request(port, "POST", "/v1/guests/IdentifyGuest", { guestId });
      assert.equal(identified.status, 200);
      assert.equal((identified.body as { returningFlag: boolean }).returningFlag, false);

      const context = await request(port, "POST", "/v1/guests/GetBookingContext", { guestId });
      assert.equal(context.status, 200);
      assert.deepEqual((context.body as { preferences: unknown }).preferences, { floor: "high" });
    } finally {
      server.close();
    }
  });
});

// Postgres round-trip for the guests schema (issue #149). Skipped
// without TEST_PG_URL so `npm test` stays green without a database.
const DATABASE_URL = process.env["TEST_PG_URL"];

describe("guests postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("persists the guest profile row", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM guests.outbox");
      await pool.query("DELETE FROM guests.guest_stay_links");
      await pool.query("DELETE FROM guests.guests");
      const store = new PostgresGuestStore(pool);
      const guest = await store.upsertGuest({ fullName: "E2E Guest", preferences: { floor: "high" }, actor: "front-desk" });
      assert.ok(guest.id);
      const identified = await store.identifyGuest({ guestId: guest.id });
      assert.equal(identified.fullName, "E2E Guest");
      assert.deepEqual(identified.stayLinks, []);
    } finally {
      await pool.end();
    }
  });
});
