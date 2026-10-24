import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { StayStore } from "./store.js";
import { PostgresStayStore } from "./pgstore.js";

const TOKEN = "skeleton-test-token";
const RESERVATION_ID = "11111111-1111-4111-8111-111111111111";
const GUEST_ID = "33333333-3333-4333-8333-333333333333";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";

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
    const server = createServiceServer("stay");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/healthz");
      assert.equal(status, 200);
      assert.deepEqual(body, { service: "stay", status: "ok" });
    } finally {
      server.close();
    }
  });

  it("refuses unknown paths with the NOT_FOUND envelope", async () => {
    const server = createServiceServer("stay");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/v1/stay/CheckIn");
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    } finally {
      server.close();
    }
  });
});

describe("check-in", () => {
  it("checks in a reservation into an in-house stay", async () => {
    const server = createServiceServer("stay", new StayStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const checked = await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      const stay = checked.body as { stayId: string; state: string };
      assert.ok(stay.stayId);
      assert.equal(stay.state, "in-house");

      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId: stay.stayId });
      assert.equal(fetched.status, 200);
      assert.equal((fetched.body as { state: string }).state, "in-house");

      const repeat = await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(repeat.status, 409);
      assert.equal((repeat.body as { code: string }).code, "CONFLICT");
    } finally {
      server.close();
    }
  });
});

// Postgres round-trip for the stay schema (issue #149). Skipped
// without TEST_PG_URL so `npm test` stays green without a database.
const DATABASE_URL = process.env["TEST_PG_URL"];

describe("stay postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("persists the in-house stay row", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM stay.outbox");
      await pool.query("DELETE FROM stay.stay_moves");
      await pool.query("DELETE FROM stay.stays");
      const store = new PostgresStayStore(pool);
      const stay = await store.checkIn({
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(stay.state, "in-house");
      const inHouse = await store.queryStays({ state: "in-house" });
      assert.equal(inHouse.length, 1);
      assert.equal(inHouse[0]?.id, stay.id);
      await assert.rejects(
        store.checkIn({ reservationId: RESERVATION_ID, guestId: GUEST_ID, roomId: ROOM_ID, actor: "front-desk" }),
        /already checked in/,
      );
    } finally {
      await pool.end();
    }
  });
});
