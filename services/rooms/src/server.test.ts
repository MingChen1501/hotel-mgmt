import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServiceServer } from "./server.js";
import { type RoomStoreAPI, RoomStore } from "./store.js";

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

async function withServer(
  run: (port: number) => Promise<void>,
  store?: RoomStoreAPI,
): Promise<void> {
  const server = createServiceServer("rooms", store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await run(port);
  } finally {
    server.close();
  }
}

describe("health", () => {
  it("answers /healthz with the service identity", async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, "GET", "/healthz");
      assert.equal(status, 200);
      assert.deepEqual(body, { service: "rooms", status: "ok" });
    });
  });

  it("refuses unknown paths with the NOT_FOUND envelope", async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, "GET", "/v1/rooms/CheckIn");
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    });
  });
});

describe("desk loop", () => {
  it("refuses /v1 calls without a session token", async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, "POST", "/v1/rooms/ListRoomsByState", { state: "occupied" }, null);
      assert.equal(status, 401);
      assert.equal((body as { code: string }).code, "UNAUTHENTICATED");
    });
  });

  it("creates a room type and room, then reports sellability", async () => {
    await withServer(async (port) => {
      const typeRes = await request(port, "POST", "/v1/rooms/UpsertRoomType", {
        name: "Deluxe",
        capacity: 2,
        bedType: "king",
        features: {},
        actor: "manager",
      });
      assert.equal(typeRes.status, 200);

      const roomRes = await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "101",
        roomType: "Deluxe",
        floor: "1",
        actor: "manager",
      });
      assert.equal(roomRes.status, 200);
      assert.equal((roomRes.body as { state: string }).state, "vacant-inspected");

      const sell = await request(port, "POST", "/v1/rooms/CheckRoomTypeSellability", {
        roomType: "Deluxe",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
      });
      assert.equal(sell.status, 200);
      assert.deepEqual(sell.body, {
        roomTypeId: (typeRes.body as { id: string }).id,
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
        totalCount: 1,
        sellableCount: 1,
        blockedRooms: [],
      });
    });
  });

  it("refuses an unknown room type with NOT_FOUND", async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "999",
        roomType: "NoSuchType",
        actor: "manager",
      });
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    });
  });

  it("walks dirty to inspected and refuses dirty straight to inspected", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Standard", actor: "owner" });
    const created = await store.upsertRoom({ number: "201", roomType: "Standard", actor: "owner" });
    await store.updateRoomState({ roomNumber: created.number, newState: "occupied", actor: "front-desk" });
    await store.releaseRoom({ roomNumber: created.number, actor: "front-desk" });
    await withServer(async (port) => {
      const illegal = await request(port, "POST", "/v1/rooms/UpdateRoomState", {
        roomNumber: "201",
        newState: "vacant-inspected",
        actor: "housekeeping",
      });
      assert.equal(illegal.status, 422);
      assert.equal((illegal.body as { code: string }).code, "STATE_ILLEGAL");

      const clean = await request(port, "POST", "/v1/rooms/UpdateRoomState", {
        roomNumber: "201",
        newState: "vacant-clean",
        actor: "housekeeping",
      });
      assert.equal(clean.status, 200);
      const inspected = await request(port, "POST", "/v1/rooms/UpdateRoomState", {
        roomNumber: "201",
        newState: "vacant-inspected",
        actor: "housekeeping",
      });
      assert.equal(inspected.status, 200);
      assert.equal((inspected.body as { newState: string }).newState, "vacant-inspected");
    }, store);
  });

  it("names the block when a blocked room is checked", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" });
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" });
    await withServer(async (port) => {
      const blocked = await request(port, "POST", "/v1/rooms/BlockRoom", {
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        reason: "Plumbing repair",
        actor: "manager",
      });
      assert.equal(blocked.status, 200);

      const sell = await request(port, "POST", "/v1/rooms/CheckRoomTypeSellability", {
        roomType: "Deluxe",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
        roomNumber: "101",
      });
      assert.equal(sell.status, 422);
      assert.equal((sell.body as { code: string }).code, "STATE_ILLEGAL");
      assert.equal((sell.body as { details: { reason: string } }).details.reason, "Plumbing repair");
    }, store);
  });

  it("grants exactly one winner for paired simultaneous assignments (NFR-CON-2)", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" });
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" });
    await withServer(async (port) => {
      const attempts = await Promise.all([
        request(port, "POST", "/v1/rooms/AssignRoom", {
          roomNumber: "101",
          businessDate: "2026-11-01",
          stayLink: "stay-1",
          actor: "front-desk",
        }),
        request(port, "POST", "/v1/rooms/AssignRoom", {
          roomNumber: "101",
          businessDate: "2026-11-01",
          stayLink: "stay-2",
          actor: "front-desk",
        }),
      ]);
      const winners = attempts.filter((attempt) => attempt.status === 200);
      const losers = attempts.filter((attempt) => attempt.status === 409);
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.equal((losers[0]?.body as { code: string }).code, "CONFLICT");
    }, store);
  });

  it("replays an idempotent assignment receipt instead of double-booking", async () => {
    await withServer(async (port) => {
      await request(port, "POST", "/v1/rooms/UpsertRoomType", { name: "Deluxe", actor: "manager" });
      await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "101",
        roomType: "Deluxe",
        actor: "manager",
      });
      const first = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      });
      const replay = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      });
      assert.equal(first.status, 200);
      assert.deepEqual(replay.body, first.body);
    });
  });
});
