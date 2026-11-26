import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServiceServer } from "./server.js";
import { HttpError } from "./errors.js";
import { msg } from "./messages.js";
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

// #643 / BR-65: the recorded audit actor is the authenticated session,
// never the request's actor; a disagreeing value survives only as the
// additive requestActor annotation on a JSON outbox payload.
type RoomOutboxEntry = { eventType: string; payload: Record<string, unknown>; createdBy: string };
type RoomHistoryEntry = { createdBy: string; oldState: string; newState: string };

function roomsInternals(store: RoomStore): {
  outbox: RoomOutboxEntry[];
  history: RoomHistoryEntry[];
  blocks: { createdBy: string }[];
} {
  return store as unknown as {
    outbox: RoomOutboxEntry[];
    history: RoomHistoryEntry[];
    blocks: { createdBy: string }[];
  };
}

async function seedVacantRoom(store: RoomStore): Promise<void> {
  await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
  await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
}

describe("session-derived audit actor (#643)", () => {
  it("records the session token on UpsertRoomType (SEC6)", async () => {
    const store = new RoomStore();
    await withServer(async (port) => {
      const created = await request(port, "POST", "/v1/rooms/UpsertRoomType", {
        name: "Deluxe",
        actor: "mallory",
      });
      assert.equal(created.status, 200);
      const event = roomsInternals(store).outbox.find((entry) => entry.eventType === "room-upserted");
      assert.ok(event);
      assert.equal(event.payload["actor"], TOKEN);
      assert.equal(event.payload["requestActor"], "mallory");
      assert.equal(event.createdBy, TOKEN);
    }, store);
  });

  it("records the session token on UpsertRoom (SEC7)", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await withServer(async (port) => {
      const created = await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "101",
        roomType: "Deluxe",
        actor: "mallory",
      });
      assert.equal(created.status, 200);
      const event = roomsInternals(store).outbox.at(-1);
      assert.ok(event);
      assert.equal(event.eventType, "room-upserted");
      assert.deepEqual(Object.keys(event.payload).sort(), ["requestActor", "roomNumber", "roomTypeId"]);
      assert.equal(event.payload["requestActor"], "mallory");
      assert.equal(event.createdBy, TOKEN);
    }, store);
  });

  it("records the session token in state history and the outbox on UpdateRoomState (SEC8, SEC30)", async () => {
    const store = new RoomStore();
    await seedVacantRoom(store);
    await withServer(async (port) => {
      const changed = await request(port, "POST", "/v1/rooms/UpdateRoomState", {
        roomNumber: "101",
        newState: "occupied",
        actor: "mallory",
      });
      assert.equal(changed.status, 200);
      const state = roomsInternals(store);
      const history = state.history.at(-1);
      assert.ok(history);
      assert.equal(history.createdBy, TOKEN);
      assert.deepEqual(Object.keys(history).sort(), ["createdAt", "createdBy", "newState", "oldState", "roomId"]);
      const event = state.outbox.at(-1);
      assert.ok(event);
      assert.equal(event.payload["actor"], TOKEN);
      assert.equal(event.payload["requestActor"], "mallory");
      assert.equal(event.createdBy, TOKEN);
    }, store);
  });

  it("records the session token on AssignRoom (SEC9)", async () => {
    const store = new RoomStore();
    await seedVacantRoom(store);
    await withServer(async (port) => {
      const assigned = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        actor: "mallory",
      });
      assert.equal(assigned.status, 200);
      const state = roomsInternals(store);
      assert.equal(state.history.at(-1)?.createdBy, TOKEN);
      assert.equal(state.outbox.at(-1)?.payload["actor"], TOKEN);
      assert.equal(state.outbox.at(-1)?.payload["requestActor"], "mallory");
    }, store);
  });

  it("records the session token on ReleaseRoom (SEC10)", async () => {
    const store = new RoomStore();
    await seedVacantRoom(store);
    await store.assignRoom(
      { roomNumber: "101", businessDate: "2026-11-01", stayLink: "stay-1", actor: "front-desk" },
      TOKEN,
    );
    await withServer(async (port) => {
      const released = await request(port, "POST", "/v1/rooms/ReleaseRoom", {
        roomNumber: "101",
        actor: "mallory",
      });
      assert.equal(released.status, 200);
      const state = roomsInternals(store);
      assert.equal(state.history.at(-1)?.createdBy, TOKEN);
      assert.equal(state.outbox.at(-1)?.payload["actor"], TOKEN);
      assert.equal(state.outbox.at(-1)?.payload["requestActor"], "mallory");
    }, store);
  });

  it("records the session token on the block row and outbox on BlockRoom (SEC11)", async () => {
    const store = new RoomStore();
    await seedVacantRoom(store);
    await withServer(async (port) => {
      const blocked = await request(port, "POST", "/v1/rooms/BlockRoom", {
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        reason: "Plumbing repair",
        actor: "mallory",
      });
      assert.equal(blocked.status, 200);
      const state = roomsInternals(store);
      assert.equal(state.blocks[0]?.createdBy, TOKEN);
      assert.equal(state.outbox.at(-1)?.payload["actor"], TOKEN);
      assert.equal(state.outbox.at(-1)?.payload["requestActor"], "mallory");
    }, store);
  });

  it("records the session token on ReleaseBlock (SEC12)", async () => {
    const store = new RoomStore();
    await seedVacantRoom(store);
    await store.blockRoom(
      { roomNumber: "101", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "manager" },
      TOKEN,
    );
    await withServer(async (port) => {
      const released = await request(port, "POST", "/v1/rooms/ReleaseBlock", {
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        actor: "mallory",
      });
      assert.equal(released.status, 200);
      const event = roomsInternals(store).outbox.at(-1);
      assert.ok(event);
      assert.equal(event.payload["actor"], TOKEN);
      assert.equal(event.payload["requestActor"], "mallory");
    }, store);
  });

  it("keeps an honest payload byte-identical with no requestActor key (SEC29)", async () => {
    const store = new RoomStore();
    await withServer(async (port) => {
      const created = await request(port, "POST", "/v1/rooms/UpsertRoomType", {
        name: "Deluxe",
        actor: TOKEN,
      });
      assert.equal(created.status, 200);
      const event = roomsInternals(store).outbox.at(-1);
      assert.ok(event);
      assert.deepEqual(Object.keys(event.payload).sort(), ["actor", "name", "roomTypeId"]);
      // UpsertRoom's own payload never carries an `actor` key: the
      // session lives on the outbox `created_by`, so both twins keep
      // the same key set (AC-SEC-2/AC-SEC-5, B2).
      const room = await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "101",
        roomType: "Deluxe",
        actor: TOKEN,
      });
      assert.equal(room.status, 200);
      const roomEvent = roomsInternals(store).outbox.at(-1);
      assert.ok(roomEvent);
      assert.deepEqual(Object.keys(roomEvent.payload).sort(), ["roomNumber", "roomTypeId"]);
      assert.equal(roomEvent.createdBy, TOKEN);
    }, store);
  });

  it("keeps the missing-actor refusal and adds no disagreement refusal (SEC31)", async () => {
    await withServer(async (port) => {
      const missing = await request(port, "POST", "/v1/rooms/UpsertRoomType", { name: "Deluxe" });
      assert.equal(missing.status, 400);
      assert.equal((missing.body as { code: string }).code, "VALIDATION_FAILED");
      assert.equal((missing.body as { details: { field: string } }).details.field, "actor");
    }, new RoomStore());
  });
});

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

  it("lists room types with names for the desk picker", async () => {
    await withServer(async (port) => {
      // Name order keeps the desk picker stable (issue #372).
      for (const name of ["Standard", "Deluxe"]) {
        const created = await request(port, "POST", "/v1/rooms/UpsertRoomType", {
          name,
          capacity: 2,
          actor: "manager",
        });
        assert.equal(created.status, 200);
      }
      const { status, body } = await request(port, "POST", "/v1/rooms/ListRoomTypes", {});
      assert.equal(status, 200);
      const types = (body as { roomTypes: Array<{ id: string; name: string }> }).roomTypes;
      assert.deepEqual(
        types.map((type) => type.name),
        ["Deluxe", "Standard"],
      );
      for (const type of types) {
        assert.match(type.id, /^[0-9a-f-]{36}$/);
      }
    });
  });

  it("lists no room types for a property with none defined", async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, "POST", "/v1/rooms/ListRoomTypes", {});
      assert.equal(status, 200);
      assert.deepEqual((body as { roomTypes: unknown[] }).roomTypes, []);
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

  it("includes the stored floor in inventory rows when set", async () => {
    // Issue #436: the floor is an additive optional field — rooms with
    // a stored floor carry it, rooms without one omit it so existing
    // consumers keep working unchanged.
    await withServer(async (port) => {
      await request(port, "POST", "/v1/rooms/UpsertRoomType", { name: "Deluxe", actor: "manager" });
      await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "201",
        roomType: "Deluxe",
        floor: "2",
        actor: "manager",
      });
      await request(port, "POST", "/v1/rooms/UpsertRoom", {
        number: "202",
        roomType: "Deluxe",
        actor: "manager",
      });

      const inventory = await request(port, "POST", "/v1/rooms/ListRoomsByState", {
        state: "vacant-inspected",
      });
      assert.equal(inventory.status, 200);
      const rooms = (inventory.body as { rooms: Record<string, unknown>[] }).rooms;
      const floored = rooms.find((room) => room["number"] === "201");
      const unfloored = rooms.find((room) => room["number"] === "202");
      assert.equal(floored?.["floor"], "2");
      assert.ok(unfloored && !("floor" in unfloored));
    });
  });

  it("walks dirty to inspected and refuses dirty straight to inspected", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Standard", actor: "owner" }, TOKEN);
    const created = await store.upsertRoom({ number: "201", roomType: "Standard", actor: "owner" }, TOKEN);
    await store.updateRoomState({ roomNumber: created.number, newState: "occupied", actor: "front-desk" }, TOKEN);
    await store.releaseRoom({ roomNumber: created.number, actor: "front-desk" }, TOKEN);
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
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
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
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
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

  it("scopes an assignment key per room so the same key assigns another room", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "102", roomType: "Deluxe", actor: "manager" }, TOKEN);
    await withServer(async (port) => {
      const first = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      });
      const second = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "102",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal((first.body as { roomNumber: string }).roomNumber, "101");
      assert.equal((second.body as { roomNumber: string }).roomNumber, "102");
      const replay = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      });
      assert.deepEqual(replay.body, first.body);
    }, store);
  });

  it("runs the target room's check for an assignment key reused from another room", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "102", roomType: "Deluxe", actor: "manager" }, TOKEN);
    await store.updateRoomState({ roomNumber: "102", newState: "vacant-dirty", actor: "housekeeping" }, TOKEN);
    await withServer(async (port) => {
      const first = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      });
      assert.equal(first.status, 200);
      const otherRoom = await request(port, "POST", "/v1/rooms/AssignRoom", {
        roomNumber: "102",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      });
      assert.equal(otherRoom.status, 422);
      assert.equal((otherRoom.body as { code: string }).code, "STATE_ILLEGAL");
      assert.equal((otherRoom.body as { details: { roomNumber: string } }).details.roomNumber, "102");
    }, store);
  });

  it("blocks a range, releases it, and returns the room to sale", async () => {
    const store = new RoomStore();
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
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
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
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
    await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
    await store.upsertRoom({ number: "102", roomType: "Deluxe", actor: "manager" }, TOKEN);
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

// ERR3 (issue #627): the same fault contract as Stay — an unexpected
// exception answers INTERNAL_ERROR, not VALIDATION_FAILED.
const FAULT_ROOM_NUMBER = "999";

class FaultRoomStore extends RoomStore {
  override async releaseRoom(): Promise<never> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432 rooms.rooms");
  }
}

class RefusingRoomStore extends RoomStore {
  override async releaseRoom(): Promise<never> {
    throw new HttpError("NOT_FOUND", msg("rooms.notfound.room", { roomNumber: FAULT_ROOM_NUMBER }), {
      roomNumber: FAULT_ROOM_NUMBER,
    });
  }
}

describe("room state counts in sellability (#636)", () => {
  const SELL_RANGE = { dateFrom: "2026-11-01", dateTo: "2026-11-03" };

  async function seedType(store: RoomStore, name = "Deluxe"): Promise<void> {
    await store.upsertRoomType({ name, actor: "manager" }, TOKEN);
  }

  async function addRoom(store: RoomStore, number: string, roomType = "Deluxe"): Promise<void> {
    await store.upsertRoom({ number, roomType, actor: "manager" }, TOKEN);
  }

  async function sell(port: number, roomType = "Deluxe", roomNumber?: string) {
    return request(port, "POST", "/v1/rooms/CheckRoomTypeSellability", {
      roomType,
      ...SELL_RANGE,
      ...(roomNumber === undefined ? {} : { roomNumber }),
    });
  }

  it("does not count an out-of-order room as sellable (SL1)", async () => {
    const store = new RoomStore();
    await seedType(store);
    for (const number of ["101", "102", "103"]) {
      await addRoom(store, number);
    }
    await store.updateRoomState({ roomNumber: "103", newState: "out-of-order", actor: "manager" }, TOKEN);
    await withServer(async (port) => {
      const before = await sell(port);
      assert.equal(before.status, 200);
      assert.equal((before.body as { totalCount: number }).totalCount, 3);
      assert.equal((before.body as { sellableCount: number }).sellableCount, 2);
      assert.deepEqual((before.body as { blockedRooms: string[] }).blockedRooms, []);

      await store.updateRoomState({ roomNumber: "103", newState: "vacant-dirty", actor: "housekeeping" }, TOKEN);
      const after = await sell(port);
      assert.equal((after.body as { sellableCount: number }).sellableCount, 3);
    }, store);
  });

  it("does not count an occupied room as sellable (SL2)", async () => {
    const store = new RoomStore();
    await seedType(store);
    await addRoom(store, "101");
    await addRoom(store, "102");
    const assigned = await store.assignRoom(
      { roomNumber: "102", businessDate: "2026-11-01", stayLink: "stay-1", actor: "front-desk" },
      TOKEN,
    );
    assert.equal(assigned.state, "occupied");
    await withServer(async (port) => {
      const before = await sell(port);
      assert.equal(before.status, 200);
      assert.equal((before.body as { totalCount: number }).totalCount, 2);
      assert.equal((before.body as { sellableCount: number }).sellableCount, 1);
      assert.deepEqual((before.body as { blockedRooms: string[] }).blockedRooms, []);

      await store.releaseRoom({ roomNumber: "102", actor: "front-desk" }, TOKEN);
      const after = await sell(port);
      assert.equal((after.body as { sellableCount: number }).sellableCount, 2);
    }, store);
  });

  it("subtracts a block-covered non-sellable room once, never below zero (SL3)", async () => {
    const store = new RoomStore();
    await seedType(store);
    for (const number of ["201", "202", "203"]) {
      await addRoom(store, number);
    }
    await store.updateRoomState({ roomNumber: "201", newState: "out-of-order", actor: "manager" }, TOKEN);
    await store.blockRoom(
      { roomNumber: "201", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "manager" },
      TOKEN,
    );
    await withServer(async (port) => {
      const covered = await sell(port);
      assert.equal(covered.status, 200);
      assert.equal((covered.body as { totalCount: number }).totalCount, 3);
      assert.equal((covered.body as { sellableCount: number }).sellableCount, 2);
      assert.deepEqual((covered.body as { blockedRooms: string[] }).blockedRooms, ["201"]);
    }, store);

    const allNonSellable = new RoomStore();
    await seedType(allNonSellable);
    for (const number of ["301", "302"]) {
      await addRoom(allNonSellable, number);
      await allNonSellable.updateRoomState({ roomNumber: number, newState: "out-of-order", actor: "manager" }, TOKEN);
    }
    await withServer(async (port) => {
      const none = await sell(port);
      assert.equal((none.body as { totalCount: number }).totalCount, 2);
      assert.equal((none.body as { sellableCount: number }).sellableCount, 0);
    }, allNonSellable);
  });

  it("keeps every vacant state sellable and an empty type at zero (SL4)", async () => {
    const store = new RoomStore();
    await seedType(store);
    await addRoom(store, "401");
    await addRoom(store, "402");
    await store.updateRoomState({ roomNumber: "402", newState: "vacant-dirty", actor: "housekeeping" }, TOKEN);
    await addRoom(store, "403");
    await store.updateRoomState({ roomNumber: "403", newState: "vacant-dirty", actor: "housekeeping" }, TOKEN);
    await store.updateRoomState({ roomNumber: "403", newState: "vacant-clean", actor: "housekeeping" }, TOKEN);
    await seedType(store, "Suite");
    await withServer(async (port) => {
      const all = await sell(port);
      assert.equal((all.body as { totalCount: number }).totalCount, 3);
      assert.equal((all.body as { sellableCount: number }).sellableCount, 3);
      for (const number of ["401", "402", "403"]) {
        const one = await sell(port, "Deluxe", number);
        assert.equal(one.status, 200);
        assert.equal((one.body as { sellableCount: number }).sellableCount, 1);
      }

      const empty = await sell(port, "Suite");
      assert.equal(empty.status, 200);
      assert.equal((empty.body as { totalCount: number }).totalCount, 0);
      assert.equal((empty.body as { sellableCount: number }).sellableCount, 0);
    }, store);
  });

  // In-memory half of SL5: the same recorded-state fixture the Postgres half
  // seeds in pgstore.test.ts, asserted to the same exact triple. This half
  // runs in CI without TEST_PG_URL; the two halves still pin the stores to
  // one set of numbers, so a drift in either fails.
  it("counts the recorded-state fixture as 5 sellable 2 with 103 blocked (SL5)", async () => {
    const store = new RoomStore();
    await seedType(store);
    for (const number of ["101", "102", "103", "104", "105"]) {
      await addRoom(store, number);
    }
    // 101 out-of-order; 102 occupied through the public assign path;
    // 103 out-of-order and block-covered; 104/105 remain vacant-inspected.
    await store.updateRoomState({ roomNumber: "101", newState: "out-of-order", actor: "manager" }, TOKEN);
    const assigned = await store.assignRoom(
      { roomNumber: "102", businessDate: "2026-11-01", stayLink: "stay-1", actor: "front-desk" },
      TOKEN,
    );
    assert.equal(assigned.state, "occupied");
    await store.updateRoomState({ roomNumber: "103", newState: "out-of-order", actor: "manager" }, TOKEN);
    await store.blockRoom(
      { roomNumber: "103", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "manager" },
      TOKEN,
    );
    const aggregate = await store.checkSellability({ roomType: "Deluxe", ...SELL_RANGE });
    assert.equal(aggregate.totalCount, 5);
    assert.equal(aggregate.sellableCount, 2);
    assert.deepEqual(aggregate.blockedRooms, ["103"]);

    const roomTypeId = (await store.resolveRoomType("Deluxe")).id;
    const single = await store.checkSellability({ roomType: "Deluxe", ...SELL_RANGE, roomNumber: "101" });
    assert.deepEqual(single, {
      roomTypeId,
      ...SELL_RANGE,
      totalCount: 1,
      sellableCount: 0,
      blockedRooms: [],
    });
  });

  it("reports sellableCount 0 for a block-free non-sellable single room (SL6)", async () => {
    const store = new RoomStore();
    await seedType(store);
    await addRoom(store, "501");
    await addRoom(store, "502");
    await store.updateRoomState({ roomNumber: "502", newState: "out-of-order", actor: "manager" }, TOKEN);
    const roomTypeId = (await store.resolveRoomType("Deluxe")).id;
    await withServer(async (port) => {
      const outOfOrder = await sell(port, "Deluxe", "502");
      assert.equal(outOfOrder.status, 200);
      assert.deepEqual(outOfOrder.body, {
        roomTypeId,
        ...SELL_RANGE,
        totalCount: 1,
        sellableCount: 0,
        blockedRooms: [],
      });

      await store.assignRoom(
        { roomNumber: "501", businessDate: "2026-11-01", stayLink: "stay-1", actor: "front-desk" },
        TOKEN,
      );
      const occupied = await sell(port, "Deluxe", "501");
      assert.equal(occupied.status, 200);
      assert.deepEqual(occupied.body, {
        roomTypeId,
        ...SELL_RANGE,
        totalCount: 1,
        sellableCount: 0,
        blockedRooms: [],
      });

      await store.releaseRoom({ roomNumber: "501", actor: "front-desk" }, TOKEN);
      const vacant = await sell(port, "Deluxe", "501");
      assert.equal((vacant.body as { sellableCount: number }).sellableCount, 1);
    }, store);
  });

  it("keeps the block refusal ahead of the state answer (SL7)", async () => {
    const store = new RoomStore();
    await seedType(store);
    await addRoom(store, "601");
    await store.updateRoomState({ roomNumber: "601", newState: "out-of-order", actor: "manager" }, TOKEN);
    await store.blockRoom(
      { roomNumber: "601", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "manager" },
      TOKEN,
    );
    await withServer(async (port) => {
      const refused = await sell(port, "Deluxe", "601");
      assert.equal(refused.status, 422);
      assert.equal((refused.body as { code: string }).code, "STATE_ILLEGAL");
      assert.deepEqual((refused.body as { details: unknown }).details, {
        roomNumber: "601",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        reason: "Plumbing repair",
      });
    }, store);
  });

  it("returns a released room to sale only when its state is sellable (SL8)", async () => {
    const store = new RoomStore();
    await seedType(store);
    await addRoom(store, "701");
    await store.updateRoomState({ roomNumber: "701", newState: "out-of-order", actor: "manager" }, TOKEN);
    await store.blockRoom(
      { roomNumber: "701", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "manager" },
      TOKEN,
    );
    await withServer(async (port) => {
      const blocked = await sell(port);
      assert.deepEqual((blocked.body as { blockedRooms: string[] }).blockedRooms, ["701"]);
      assert.equal((blocked.body as { sellableCount: number }).sellableCount, 0);

      const released = await request(port, "POST", "/v1/rooms/ReleaseBlock", {
        roomNumber: "701",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        actor: "manager",
      });
      assert.equal(released.status, 200);
      const afterRelease = await sell(port);
      assert.deepEqual((afterRelease.body as { blockedRooms: string[] }).blockedRooms, []);
      assert.equal((afterRelease.body as { sellableCount: number }).sellableCount, 0);

      await store.updateRoomState({ roomNumber: "701", newState: "vacant-dirty", actor: "housekeeping" }, TOKEN);
      const sellable = await sell(port);
      assert.equal((sellable.body as { sellableCount: number }).sellableCount, 1);
    }, store);
  });
});

describe("internal error envelope (#627)", () => {
  it("answers an unexpected exception with INTERNAL_ERROR and keeps serving", async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, "POST", "/v1/rooms/ReleaseRoom", {
        roomNumber: FAULT_ROOM_NUMBER,
        toState: "vacant-dirty",
        actor: "housekeeping",
      });
      assert.equal(status, 500);
      assert.deepEqual(Object.keys(body as Record<string, unknown>).sort(), [
        "code",
        "details",
        "message",
        "traceId",
      ]);
      const envelope = body as { code: string; message: string; details: unknown; traceId: string };
      assert.equal(envelope.code, "INTERNAL_ERROR");
      assert.notEqual(envelope.code, "VALIDATION_FAILED");
      assert.equal(envelope.message, msg("error.transport.unexpected", {}));
      assert.deepEqual(envelope.details, {});
      assert.equal(typeof envelope.traceId, "string");
      assert.ok(envelope.traceId.length > 0);

      const next = await request(port, "GET", "/healthz");
      assert.equal(next.status, 200);
    }, new FaultRoomStore());
  });

  it("keeps an HttpError refusal on the same route on its own code and status", async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, "POST", "/v1/rooms/ReleaseRoom", {
        roomNumber: FAULT_ROOM_NUMBER,
        toState: "vacant-dirty",
        actor: "housekeeping",
      });
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
      assert.deepEqual((body as { details: unknown }).details, { roomNumber: FAULT_ROOM_NUMBER });
    }, new RefusingRoomStore());
  });
});
