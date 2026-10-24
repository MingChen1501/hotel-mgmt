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
const ROOM2_ID = "55555555-5555-4555-8555-555555555555";
const FOLIO_ID = "44444444-4444-4444-8444-444444444444";

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

const DATABASE_URL = process.env["TEST_PG_URL"];

async function checkInStay(
  port: number,
  overrides: Record<string, unknown> = {},
): Promise<{ stayId: string }> {
  const checked = await request(port, "POST", "/v1/stay/CheckIn", {
    reservationId: RESERVATION_ID,
    guestId: GUEST_ID,
    roomId: ROOM_ID,
    actor: "front-desk",
    ...overrides,
  });
  assert.equal(checked.status, 200);
  return { stayId: (checked.body as { stayId: string }).stayId };
}

async function withStayServer(
  fn: (port: number) => Promise<void>,
  store?: StayStore,
): Promise<void> {
  const server = createServiceServer("stay", store ?? new StayStore());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

describe("check-out", () => {
  it("closes a settled stay and presents the folio as the final invoice", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      assert.equal((checked.body as { state: string }).state, "closed");
      assert.equal((checked.body as { invoiceRef: string }).invoiceRef, FOLIO_ID);

      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "closed");
    });
  });

  it("refuses an open balance without an approval and keeps the stay in house", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      assert.equal((refused.body as { code: string }).code, "SETTLEMENT_REQUIRED");

      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "in-house");
    });
  });

  it("closes an approved open balance", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        openBalanceApproval: { approvedBy: "manager", role: "manager" },
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      assert.equal((checked.body as { state: string }).state, "closed");
    });
  });

  it("replays the original close on the same idempotency key and refuses a second close", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const first = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        idempotencyKey: "checkout-1",
        actor: "front-desk",
      });
      assert.equal(first.status, 200);
      const replay = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        idempotencyKey: "checkout-1",
        actor: "front-desk",
      });
      assert.equal(replay.status, 200);
      assert.equal((replay.body as { state: string }).state, "closed");

      const second = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        idempotencyKey: "checkout-2",
        actor: "front-desk",
      });
      assert.equal(second.status, 422);
      assert.equal((second.body as { code: string }).code, "STATE_ILLEGAL");
    });
  });

  it("grants exactly one winner for paired simultaneous check-outs (NFR-CON-2)", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const attempts = await Promise.all([
        request(port, "POST", "/v1/stay/CheckOut", {
          stayId,
          folioId: FOLIO_ID,
          folioBalanceMinor: 0,
          idempotencyKey: "checkout-a",
          actor: "front-desk",
        }),
        request(port, "POST", "/v1/stay/CheckOut", {
          stayId,
          folioId: FOLIO_ID,
          folioBalanceMinor: 0,
          idempotencyKey: "checkout-b",
          actor: "front-desk",
        }),
      ]);
      const winners = attempts.filter((attempt) => attempt.status === 200);
      const losers = attempts.filter((attempt) => attempt.status === 422);
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.equal((losers[0]?.body as { code: string }).code, "STATE_ILLEGAL");
    });
  });
});

describe("room moves", () => {
  it("moves an in-house guest and keeps both rooms and the time in history", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const moved = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId,
        toRoomId: ROOM2_ID,
        actor: "front-desk",
      });
      assert.equal(moved.status, 200);
      assert.equal((moved.body as { roomId: string }).roomId, ROOM2_ID);
      assert.equal((moved.body as { state: string }).state, "in-house");
      const move = (moved.body as { move: { fromRoomId: string; toRoomId: string; movedAt: string } }).move;
      assert.equal(move.fromRoomId, ROOM_ID);
      assert.equal(move.toRoomId, ROOM2_ID);
      assert.ok(move.movedAt);
    });
  });

  it("refuses moves of unknown, closed, or same-room stays", async () => {
    await withStayServer(async (port) => {
      const unknown = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId: "66666666-6666-4666-8666-666666666666",
        toRoomId: ROOM2_ID,
        actor: "front-desk",
      });
      assert.equal(unknown.status, 404);

      const { stayId } = await checkInStay(port);
      const same = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId,
        toRoomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(same.status, 400);

      await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      const closed = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId,
        toRoomId: ROOM2_ID,
        actor: "front-desk",
      });
      assert.equal(closed.status, 422);
      assert.equal((closed.body as { code: string }).code, "STATE_ILLEGAL");
    });
  });
});

describe("actual times", () => {
  it("keeps off-hours arrival and departure times on the stay", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port, { actualArrival: "2026-10-24T05:30:00.000Z" });
      const kept = await request(port, "POST", "/v1/stay/RecordActualTimes", {
        stayId,
        actualDeparture: "2026-10-26T15:30:00.000Z",
        actor: "front-desk",
      });
      assert.equal(kept.status, 200);
      assert.equal((kept.body as { actualArrival: string }).actualArrival, "2026-10-24T05:30:00.000Z");
      assert.equal((kept.body as { actualDeparture: string }).actualDeparture, "2026-10-26T15:30:00.000Z");
    });
  });

  it("refuses implausible times", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port, { actualArrival: "2026-10-24T10:00:00.000Z" });
      const backwards = await request(port, "POST", "/v1/stay/RecordActualTimes", {
        stayId,
        actualDeparture: "2026-10-24T09:00:00.000Z",
        actor: "front-desk",
      });
      assert.equal(backwards.status, 400);
      assert.equal((backwards.body as { code: string }).code, "VALIDATION_FAILED");

      const malformed = await request(port, "POST", "/v1/stay/RecordActualTimes", {
        stayId,
        actualArrival: "not-a-time",
        actor: "front-desk",
      });
      assert.equal(malformed.status, 400);
    });
  });
});

describe("stay reference and daily lists", () => {
  it("reads the in-house stay link and refuses closed stays", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const ref = await request(port, "POST", "/v1/stay/GetStayRef", { stayId });
      assert.equal(ref.status, 200);
      assert.equal((ref.body as { roomId: string }).roomId, ROOM_ID);
      assert.equal((ref.body as { state: string }).state, "in-house");

      await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      const closed = await request(port, "POST", "/v1/stay/GetStayRef", { stayId });
      assert.equal(closed.status, 422);
      assert.equal((closed.body as { code: string }).code, "STATE_ILLEGAL");
    });
  });

  it("lists arrivals, in-house stays, and departures exactly once", async () => {
    await withStayServer(async (port) => {
      const first = await checkInStay(port, { actualArrival: "2026-10-24T08:00:00.000Z" });
      await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: "77777777-7777-4777-8777-777777777777",
        guestId: GUEST_ID,
        roomId: ROOM2_ID,
        actualArrival: "2026-10-24T09:00:00.000Z",
        actor: "front-desk",
      });
      await request(port, "POST", "/v1/stay/CheckOut", {
        stayId: first.stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actualDeparture: "2026-10-24T11:00:00.000Z",
        actor: "front-desk",
      });
      const lists = await request(port, "POST", "/v1/stay/ListArrivalsDepartures", {
        businessDate: "2026-10-24",
      });
      assert.equal(lists.status, 200);
      assert.equal(((lists.body as { arrivals: unknown[] }).arrivals).length, 2);
      assert.equal(((lists.body as { inHouse: unknown[] }).inHouse).length, 1);
      assert.equal(((lists.body as { departures: unknown[] }).departures).length, 1);
    });
  });
});

describe("stay postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("persists the in-house stay row", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM stay.outbox");
      await pool.query("DELETE FROM stay.stay_moves");
      await pool.query("DELETE FROM stay.idempotency_keys");
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

  it("closes, moves, and times the stay row", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM stay.outbox");
      await pool.query("DELETE FROM stay.stay_moves");
      await pool.query("DELETE FROM stay.idempotency_keys");
      await pool.query("DELETE FROM stay.stays");
      const store = new PostgresStayStore(pool);
      const stay = await store.checkIn({
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "front-desk",
      });
      const moved = await store.moveRoom({ stayId: stay.id, toRoomId: ROOM2_ID, actor: "front-desk" });
      assert.equal(moved.stay.currentRoomId, ROOM2_ID);
      assert.equal(moved.move.fromRoomId, ROOM_ID);
      const timed = await store.recordActualTimes({
        stayId: stay.id,
        actualDeparture: "2026-10-26T15:30:00.000Z",
        actor: "front-desk",
      });
      assert.equal(timed.actualDeparture, "2026-10-26T15:30:00.000Z");
      await assert.rejects(
        store.checkOut({ stayId: stay.id, folioId: FOLIO_ID, folioBalanceMinor: 6000, actor: "front-desk" }),
        /open balance/,
      );
      const closed = await store.checkOut({
        stayId: stay.id,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        openBalanceApproval: { approvedBy: "manager" },
        idempotencyKey: "pg-checkout-1",
        actor: "front-desk",
      });
      assert.equal(closed.stay.state, "closed");
      assert.equal(closed.invoiceRef, FOLIO_ID);
      const replayed = await store.checkOut({
        stayId: stay.id,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        openBalanceApproval: { approvedBy: "manager" },
        idempotencyKey: "pg-checkout-1",
        actor: "front-desk",
      });
      assert.equal(replayed.stay.state, "closed");
      await assert.rejects(
        store.checkOut({ stayId: stay.id, folioId: FOLIO_ID, folioBalanceMinor: 0, actor: "front-desk" }),
        /not in house/,
      );
    } finally {
      await pool.end();
    }
  });
});
