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

  it("defines rooms as owner and shows them in inventory and availability", async () => {
    // FR-ADM-3: the owner defines the property's rooms, types, and
    // capacity; the rooms appear in the inventory, in availability,
    // and (via the e2e desk loop, which books a defined type and
    // reads it back on the calendar) in calendar uptake. The owner
    // actor is what distinguishes this guard from the FR-RMS-4
    // manager-side setup coverage.
    await withServer(async (port) => {
      const typeRes = await request(port, "POST", "/v1/rooms/UpsertRoomType", {
        name: "Family",
        capacity: 4,
        bedType: "queen",
        features: { extraBed: true },
        actor: "owner",
      });
      assert.equal(typeRes.status, 200);
      assert.equal((typeRes.body as { capacity: number }).capacity, 4);
      const typeId = (typeRes.body as { id: string }).id;
      assert.ok(typeId);

      const roomRes = await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "301",
        roomType: "Family",
        floor: "3",
        actor: "owner",
      });
      assert.equal(roomRes.status, 200);
      assert.equal((roomRes.body as { state: string }).state, "vacant-inspected");
      const roomId = (roomRes.body as { id: string }).id;
      assert.match(roomId, /^[0-9a-f-]{36}$/i);

      const inventory = await request(port, "POST", "/v1/rooms/ListRoomsByState", {
        state: "vacant-inspected",
      });
      assert.equal(inventory.status, 200);
      const rooms = (inventory.body as { rooms: { roomId: string; number: string; roomTypeId: string }[] }).rooms;
      assert.ok(rooms.some((room) => room.number === "301" && room.roomTypeId === typeId && room.roomId === roomId));

      const sell = await request(port, "POST", "/v1/rooms/CheckRoomTypeSellability", {
        roomType: "Family",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
      });
      assert.equal(sell.status, 200);
      assert.deepEqual(sell.body, {
        roomTypeId: typeId,
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
        totalCount: 1,
        sellableCount: 1,
        blockedRooms: [],
      });
    });
  });

  it("emits the stable room UUID in inventory rows and the assignment echo", async () => {
    // Issue #256: the desk UI assembles CheckIn.roomId and
    // MoveRoom.toRoomId from these fields, so both responses carry
    // the same UUID the UpsertRoom call created.
    await withServer(async (port) => {
      await request(port, "POST", "/v1/rooms/UpsertRoomType", { name: "Deluxe", actor: "manager" });
      const roomRes = await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "101",
        roomType: "Deluxe",
        actor: "manager",
      });
      const roomId = (roomRes.body as { id: string }).id;
      assert.match(roomId, /^[0-9a-f-]{36}$/i);

      const inventory = await request(port, "POST", "/v1/rooms/ListRoomsByState", {
        state: "vacant-inspected",
      });
      assert.equal(inventory.status, 200);
      const rows = (inventory.body as { rooms: { roomId: string; number: string }[] }).rooms;
      assert.ok(rows.some((row) => row.number === "101" && row.roomId === roomId));

      const assigned = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        actor: "front-desk",
      });
      assert.equal(assigned.status, 200);
      assert.deepEqual(assigned.body, {
        roomId,
        roomNumber: "101",
        stayLink: "stay-1",
        state: "occupied",
      });
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

  it("blocks a range, releases it, and returns the room to sale", async () => {
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

      const refused = await request(port, "POST", "/v1/rooms/CheckRoomTypeSellability", {
        roomType: "Deluxe",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
      });
      assert.equal(refused.status, 200);
      assert.deepEqual((refused.body as { blockedRooms: string[] }).blockedRooms, ["101"]);
      assert.equal((refused.body as { sellableCount: number }).sellableCount, 0);

      const released = await request(port, "POST", "/v1/rooms/ReleaseBlock", {
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        actor: "manager",
      });
      assert.equal(released.status, 200);
      assert.deepEqual(released.body, {
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        reason: "Plumbing repair",
      });

      const sell = await request(port, "POST", "/v1/rooms/CheckRoomTypeSellability", {
        roomType: "Deluxe",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
      });
      assert.equal(sell.status, 200);
      assert.equal((sell.body as { sellableCount: number }).sellableCount, 1);
      assert.deepEqual((sell.body as { blockedRooms: string[] }).blockedRooms, []);
    }, store);
  });

  it("refuses to release a range with no covering block", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" });
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" });
    await withServer(async (port) => {
      const release = await request(port, "POST", "/v1/rooms/ReleaseBlock", {
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        actor: "manager",
      });
      assert.equal(release.status, 422);
      assert.equal((release.body as { code: string }).code, "STATE_ILLEGAL");

      const unknown = await request(port, "POST", "/v1/rooms/ReleaseBlock", {
        roomNumber: "999",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        actor: "manager",
      });
      assert.equal(unknown.status, 404);
      assert.equal((unknown.body as { code: string }).code, "NOT_FOUND");
    }, store);
  });

  it("coordinates a room move end to end on the rooms side (FR-FDK-3)", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" });
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" });
    await store.upsertRoom({ number: "102", roomType: "Deluxe", actor: "manager" });
    await withServer(async (port) => {
      const firstStay = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        actor: "front-desk",
      });
      assert.equal(firstStay.status, 200);

      // The desk assigns the new room, then releases the old one
      // around the stay-side MoveRoom call.
      const newRoom = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "102",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        actor: "front-desk",
      });
      assert.equal(newRoom.status, 200);
      const released = await request(port, "POST", "/v1/rooms/ReleaseRoom", {
        roomNumber: "101",
        actor: "front-desk",
      });
      assert.equal(released.status, 200);
      assert.deepEqual(released.body, {
        roomNumber: "101",
        oldState: "occupied",
        newState: "vacant-dirty",
      });

      // Housekeeping walks the old room back to inspected, and the
      // room is offered for check-in assignment again.
      assert.equal(
        (await request(port, "POST", "/v1/rooms/UpdateRoomState", {
          roomNumber: "101",
          newState: "vacant-clean",
          actor: "housekeeping",
        })).status,
        200,
      );
      assert.equal(
        (await request(port, "POST", "/v1/rooms/UpdateRoomState", {
          roomNumber: "101",
          newState: "vacant-inspected",
          actor: "housekeeping",
        })).status,
        200,
      );
      const ready = await request(port, "POST", "/v1/rooms/ListRoomsByState", {
        state: "vacant-inspected",
      });
      assert.equal(ready.status, 200);
      assert.ok(
        ((ready.body as { rooms: { number: string }[] }).rooms ?? []).some((room) => room.number === "101"),
      );
      const nextStay = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-02",
        stayLink: "stay-2",
        actor: "front-desk",
      });
      assert.equal(nextStay.status, 200);
    }, store);
  });
});
