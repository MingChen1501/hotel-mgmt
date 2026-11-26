import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { HttpError } from "./errors.js";
import { msg } from "./messages.js";
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

// #643 / BR-65: the recorded audit actor is the authenticated session,
// never the request's actor; a disagreeing value is preserved only as
// the additive requestActor annotation on a JSON outbox payload.
type OutboxEntry = { eventType: string; payload: Record<string, unknown> };

function outboxOf(store: StayStore): OutboxEntry[] {
  return (store as unknown as { outbox: OutboxEntry[] }).outbox;
}

function eventOf(store: StayStore, eventType: string): OutboxEntry {
  const event = outboxOf(store).find((entry) => entry.eventType === eventType);
  assert.ok(event, `missing ${eventType} outbox event`);
  return event;
}

describe("session-derived audit actor (#643)", () => {
  it("records the session token on CheckIn and demotes the body actor (SEC1)", async () => {
    const store = new StayStore();
    await withStayServer(async (port) => {
      const spoofed = await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "mallory",
      });
      assert.equal(spoofed.status, 200);
      assert.equal((spoofed.body as { state: string }).state, "in-house");
      const event = eventOf(store, "checked-in");
      assert.equal(event.payload["actor"], TOKEN);
      assert.equal(event.payload["requestActor"], "mallory");
      assert.notEqual(event.payload["actor"], "mallory");
    }, store);
  });

  it("keeps an honest payload byte-identical with no requestActor key (SEC29)", async () => {
    const store = new StayStore();
    await withStayServer(async (port) => {
      const honest = await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: TOKEN,
      });
      assert.equal(honest.status, 200);
      const event = eventOf(store, "checked-in");
      assert.equal(event.payload["actor"], TOKEN);
      assert.deepEqual(Object.keys(event.payload).sort(), [
        "actor",
        "reservationId",
        "roomId",
        "stayId",
      ]);
    }, store);
  });

  it("records the session token on CheckOut and forwards the body actor as an annotation (SEC2, SEC33)", async () => {
    const calls: { stayId: string; actor: string; bearerToken: string }[] = [];
    const store = new StayStore({
      async complete(input) {
        calls.push(input);
        return { state: "completed" as const, reservationRef: "RSV-SEC2" };
      },
    });
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "mallory",
      });
      assert.equal(checked.status, 200);
      assert.equal((checked.body as { state: string }).state, "closed");
      const event = eventOf(store, "checked-out");
      assert.equal(event.payload["actor"], TOKEN);
      assert.equal(event.payload["requestActor"], "mallory");
      assert.deepEqual(calls, [{ stayId, actor: "mallory", bearerToken: TOKEN }]);
    }, store);
  });

  it("records the session token on MoveRoom (SEC3)", async () => {
    const store = new StayStore();
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const moved = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId,
        toRoomId: ROOM2_ID,
        actor: "mallory",
      });
      assert.equal(moved.status, 200);
      assert.equal((moved.body as { roomId: string }).roomId, ROOM2_ID);
      const event = eventOf(store, "moved");
      assert.equal(event.payload["actor"], TOKEN);
      assert.equal(event.payload["requestActor"], "mallory");
    }, store);
  });

  it("records the session token on RecordActualTimes (SEC4)", async () => {
    const store = new StayStore();
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port, { actualArrival: "2026-10-24T05:30:00.000Z" });
      const kept = await request(port, "POST", "/v1/stay/RecordActualTimes", {
        stayId,
        actualDeparture: "2026-10-26T15:30:00.000Z",
        actor: "mallory",
      });
      assert.equal(kept.status, 200);
      const event = eventOf(store, "actual-times-recorded");
      assert.equal(event.payload["actor"], TOKEN);
      assert.equal(event.payload["requestActor"], "mallory");
    }, store);
  });

  it("refuses a write with no session before it writes (SEC32)", async () => {
    const store = new StayStore();
    await withStayServer(async (port) => {
      const refused = await request(
        port,
        "POST",
        "/v1/stay/CheckIn",
        { reservationId: RESERVATION_ID, guestId: GUEST_ID, roomId: ROOM_ID, actor: "mallory" },
        null,
      );
      assert.equal(refused.status, 401);
      assert.equal((refused.body as { code: string }).code, "UNAUTHENTICATED");
      assert.equal(outboxOf(store).length, 0);
    }, store);
  });

  it("keeps the missing-actor refusal and adds no disagreement refusal (SEC31)", async () => {
    await withStayServer(async (port) => {
      const missing = await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
      });
      assert.equal(missing.status, 400);
      assert.equal((missing.body as { code: string }).code, "VALIDATION_FAILED");
      assert.equal((missing.body as { details: { field: string } }).details.field, "actor");
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
      const stay = await store.checkIn(
        {
          reservationId: RESERVATION_ID,
          guestId: GUEST_ID,
          roomId: ROOM_ID,
          actor: "front-desk",
        },
        TOKEN,
      );
      assert.equal(stay.state, "in-house");
      const inHouse = await store.queryStays({ state: "in-house" });
      assert.equal(inHouse.length, 1);
      assert.equal(inHouse[0]?.id, stay.id);
      await assert.rejects(
        store.checkIn({ reservationId: RESERVATION_ID, guestId: GUEST_ID, roomId: ROOM_ID, actor: "front-desk" }, TOKEN),
        /already checked in/,
      );
    } finally {
      await pool.end();
    }
  });

  it("records the session token and demotes the body actor on every write (#643, SEC1-SEC4)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM stay.outbox");
      await pool.query("DELETE FROM stay.stay_moves");
      await pool.query("DELETE FROM stay.idempotency_keys");
      await pool.query("DELETE FROM stay.stays");
      const store = new PostgresStayStore(pool);
      const stay = await store.checkIn(
        {
          reservationId: RESERVATION_ID,
          guestId: GUEST_ID,
          roomId: ROOM_ID,
          actor: "mallory",
        },
        TOKEN,
      );
      await store.moveRoom({ stayId: stay.id, toRoomId: ROOM2_ID, actor: "mallory" }, TOKEN);
      await store.recordActualTimes({ stayId: stay.id, actor: "mallory" }, TOKEN);
      await store.checkOut(
        { stayId: stay.id, folioId: FOLIO_ID, folioBalanceMinor: 0, actor: "mallory" },
        TOKEN,
      );
      const row = await pool.query(
        `SELECT created_by, updated_by FROM stay.stays WHERE id = $1`,
        [stay.id],
      );
      assert.equal(row.rows[0]?.created_by, TOKEN);
      assert.equal(row.rows[0]?.updated_by, TOKEN);
      const move = await pool.query(`SELECT created_by FROM stay.stay_moves WHERE stay_id = $1`, [stay.id]);
      assert.equal(move.rows[0]?.created_by, TOKEN);
      const events = await pool.query(
        `SELECT event_type, payload, created_by FROM stay.outbox ORDER BY occurred_at`,
      );
      assert.equal(events.rows.length, 4);
      for (const event of events.rows as { event_type: string; payload: Record<string, unknown>; created_by: string }[]) {
        assert.equal(event.created_by, TOKEN, event.event_type);
        assert.equal(event.payload["actor"], TOKEN, event.event_type);
        assert.equal(event.payload["requestActor"], "mallory", event.event_type);
        assert.notEqual(event.payload["actor"], "mallory", event.event_type);
      }
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
      // Both actual times are pinned so the fixture never depends on the host
      // clock: without an explicit arrival the row is stamped with `now()`,
      // which eventually overtakes the fixed departure and trips the
      // departure-order validation.
      const actualArrival = "2026-10-24T10:00:00.000Z";
      const actualDeparture = "2026-10-26T15:30:00.000Z";
      const stay = await store.checkIn(
        {
          reservationId: RESERVATION_ID,
          guestId: GUEST_ID,
          roomId: ROOM_ID,
          actualArrival,
          actor: "front-desk",
        },
        TOKEN,
      );
      assert.equal(stay.actualArrival, actualArrival);
      const moved = await store.moveRoom({ stayId: stay.id, toRoomId: ROOM2_ID, actor: "front-desk" }, TOKEN);
      assert.equal(moved.stay.currentRoomId, ROOM2_ID);
      assert.equal(moved.move.fromRoomId, ROOM_ID);
      const timed = await store.recordActualTimes(
        {
          stayId: stay.id,
          actualDeparture,
          actor: "front-desk",
        },
        TOKEN,
      );
      assert.equal(timed.actualArrival, actualArrival);
      assert.equal(timed.actualDeparture, actualDeparture);
      await assert.rejects(
        store.checkOut({ stayId: stay.id, folioId: FOLIO_ID, folioBalanceMinor: 6000, actor: "front-desk" }, TOKEN),
        /open balance/,
      );
      const closed = await store.checkOut(
        {
          stayId: stay.id,
          folioId: FOLIO_ID,
          folioBalanceMinor: 6000,
          openBalanceApproval: { approvedBy: "manager" },
          idempotencyKey: "pg-checkout-1",
          actor: "front-desk",
        },
        TOKEN,
      );
      assert.equal(closed.stay.state, "closed");
      assert.equal(closed.invoiceRef, FOLIO_ID);
      const replayed = await store.checkOut(
        {
          stayId: stay.id,
          folioId: FOLIO_ID,
          folioBalanceMinor: 6000,
          openBalanceApproval: { approvedBy: "manager" },
          idempotencyKey: "pg-checkout-1",
          actor: "front-desk",
        },
        TOKEN,
      );
      assert.equal(replayed.stay.state, "closed");
      await assert.rejects(
        store.checkOut({ stayId: stay.id, folioId: FOLIO_ID, folioBalanceMinor: 0, actor: "front-desk" }, TOKEN),
        /not in house/,
      );
    } finally {
      await pool.end();
    }
  });
});

// The check-out completion (#646, FR-DEP-1/FR-DEP-5) is driven by a
// client the store takes at boot. These stubs pin the call shape, the
// split outcomes, and the replay repair without a live Reservations.
function completedStub(reservationRef = "RSV-COMPLETED") {
  const calls: { stayId: string; actor: string; bearerToken: string }[] = [];
  return {
    calls,
    client: {
      async complete(input: { stayId: string; actor: string; bearerToken: string }) {
        calls.push(input);
        return { state: "completed" as const, reservationRef };
      },
    },
  };
}

describe("check-out completion", () => {
  it("completes the booking with the caller token forwarded (DR7)", async () => {
    const stub = completedStub();
    const store = new StayStore(stub.client);
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      const body = checked.body as {
        state: string;
        bookingCompletion: { state: string; reservationRef?: string };
      };
      assert.equal(body.state, "closed");
      assert.deepEqual(body.bookingCompletion, { state: "completed", reservationRef: "RSV-COMPLETED" });
      assert.deepEqual(stub.calls, [{ stayId, actor: "front-desk", bearerToken: TOKEN }]);
      const outbox = (store as unknown as { outbox: { eventType: string }[] }).outbox;
      assert.equal(outbox.filter((entry) => entry.eventType === "checked-out").length, 1);
    }, store);
  });

  it("reports a split instead of failing the committed close (DR8)", async () => {
    const modes: { name: string; complete: () => Promise<never> | Promise<{ state: "not-recorded"; reason: string }>; reason: string }[] = [
      {
        name: "transport error",
        complete: async () => {
          throw new Error("connection refused");
        },
        reason: "UPSTREAM_UNAVAILABLE",
      },
      {
        name: "provider NOT_FOUND",
        complete: async () => ({ state: "not-recorded" as const, reason: "NOT_FOUND" }),
        reason: "NOT_FOUND",
      },
      {
        name: "provider STATE_ILLEGAL",
        complete: async () => ({ state: "not-recorded" as const, reason: "STATE_ILLEGAL" }),
        reason: "STATE_ILLEGAL",
      },
    ];
    for (const mode of modes) {
      const store = new StayStore({ complete: mode.complete });
      await withStayServer(async (port) => {
        const { stayId } = await checkInStay(port);
        const checked = await request(port, "POST", "/v1/stay/CheckOut", {
          stayId,
          folioId: FOLIO_ID,
          folioBalanceMinor: 0,
          actor: "front-desk",
        });
        assert.equal(checked.status, 200, mode.name);
        const body = checked.body as {
          state: string;
          bookingCompletion: { state: string; reason?: string };
        };
        assert.equal(body.state, "closed", mode.name);
        assert.equal(body.bookingCompletion.state, "not-recorded", mode.name);
        assert.equal(body.bookingCompletion.reason, mode.reason, mode.name);
        const outbox = (store as unknown as { outbox: { eventType: string }[] }).outbox;
        assert.equal(outbox.filter((entry) => entry.eventType === "checked-out").length, 1, mode.name);
      }, store);
    }
  });

  it("reports an unwired completion client without inventing a refusal", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      const body = checked.body as { bookingCompletion: { state: string; reason?: string } };
      assert.deepEqual(body.bookingCompletion, { state: "not-recorded", reason: "UPSTREAM_UNAVAILABLE" });
    });
  });

  it("re-attempts the completion on a replayed close (DR9)", async () => {
    let attempts = 0;
    const calls: string[] = [];
    const store = new StayStore({
      async complete(input) {
        attempts += 1;
        calls.push(input.stayId);
        if (attempts === 1) {
          return { state: "not-recorded" as const, reason: "UPSTREAM_UNAVAILABLE" };
        }
        return { state: "completed" as const, reservationRef: "RSV-REPLAYED" };
      },
    });
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const first = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        idempotencyKey: "checkout-split",
        actor: "front-desk",
      });
      assert.equal((first.body as { bookingCompletion: { state: string } }).bookingCompletion.state, "not-recorded");
      const replay = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        idempotencyKey: "checkout-split",
        actor: "front-desk",
      });
      assert.equal(replay.status, 200);
      assert.deepEqual((replay.body as { bookingCompletion: unknown }).bookingCompletion, {
        state: "completed",
        reservationRef: "RSV-REPLAYED",
      });
      assert.equal(calls.length, 2);
      assert.deepEqual(calls, [stayId, stayId]);
    }, store);
  });

  it("sends no completion call for a refused close", async () => {
    const stub = completedStub();
    const store = new StayStore(stub.client);
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      assert.equal(stub.calls.length, 0);
    }, store);
  });
});

describe("stay postgres completion", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("calls the completion after the committed close and reports a split (DR11)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM stay.outbox");
      await pool.query("DELETE FROM stay.stay_moves");
      await pool.query("DELETE FROM stay.idempotency_keys");
      await pool.query("DELETE FROM stay.stays");
      const calls: { stayId: string; actor: string; bearerToken: string }[] = [];
      const store = new PostgresStayStore(pool, {
        async complete(input) {
          calls.push(input);
          return { state: "completed" as const, reservationRef: "RSV-PG" };
        },
      });
      const stay = await store.checkIn(
        {
          reservationId: RESERVATION_ID,
          guestId: GUEST_ID,
          roomId: ROOM_ID,
          actor: "front-desk",
        },
        TOKEN,
      );
      const closed = await store.checkOut(
        {
          stayId: stay.id,
          folioId: FOLIO_ID,
          folioBalanceMinor: 0,
          idempotencyKey: "pg-completion-1",
          actor: "front-desk",
        },
        TOKEN,
      );
      assert.equal(closed.stay.state, "closed");
      assert.deepEqual(closed.bookingCompletion, { state: "completed", reservationRef: "RSV-PG" });
      assert.deepEqual(calls, [{ stayId: stay.id, actor: "front-desk", bearerToken: TOKEN }]);
      const events = await pool.query(`SELECT count(*)::int AS count FROM stay.outbox WHERE event_type = 'checked-out'`);
      assert.equal(events.rows[0]?.count, 1);

      const splitPool = new Pool({ connectionString: DATABASE_URL });
      try {
        await splitPool.query("DELETE FROM stay.outbox");
        await splitPool.query("DELETE FROM stay.stay_moves");
        await splitPool.query("DELETE FROM stay.idempotency_keys");
        await splitPool.query("DELETE FROM stay.stays");
        const splitStore = new PostgresStayStore(splitPool, {
          async complete() {
            throw new Error("reservations unreachable");
          },
        });
        const splitStay = await splitStore.checkIn(
          {
            reservationId: RESERVATION_ID,
            guestId: GUEST_ID,
            roomId: ROOM_ID,
            actor: "front-desk",
          },
          TOKEN,
        );
        const split = await splitStore.checkOut(
          { stayId: splitStay.id, folioId: FOLIO_ID, folioBalanceMinor: 0, actor: "front-desk" },
          TOKEN,
        );
        assert.equal(split.stay.state, "closed");
        assert.deepEqual(split.bookingCompletion, { state: "not-recorded", reason: "UPSTREAM_UNAVAILABLE" });
      } finally {
        await splitPool.end();
      }
    } finally {
      await pool.end();
    }
  });
});

// ERR1 (issue #627): a failure that is not an HttpError answers the
// internal-error code, never VALIDATION_FAILED, and keeps the envelope
// shape the desk already reads. A store fault is an ordinary exception
// (the Postgres store leaves its pool calls unguarded), so it reaches
// the catch-all's else arm.
const FAULT_STAY_ID = "99999999-9999-4999-8999-999999999999";

class FaultStayStore extends StayStore {
  override async getStay(): Promise<never> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432 stay.stays");
  }
}

class RefusingStayStore extends StayStore {
  override async getStay(): Promise<never> {
    throw new HttpError("NOT_FOUND", msg("stay.notfound.stay", { stayId: FAULT_STAY_ID }), {
      stayId: FAULT_STAY_ID,
    });
  }
}

describe("internal error envelope (#627)", () => {
  it("answers an unexpected exception with INTERNAL_ERROR and keeps serving", async () => {
    const server = createServiceServer("stay", new FaultStayStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "POST", "/v1/stay/GetStay", { stayId: FAULT_STAY_ID });
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
    } finally {
      server.close();
    }
  });

  it("keeps an HttpError refusal on the same route on its own code and status", async () => {
    const server = createServiceServer("stay", new RefusingStayStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "POST", "/v1/stay/GetStay", { stayId: FAULT_STAY_ID });
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
      assert.deepEqual((body as { details: unknown }).details, { stayId: FAULT_STAY_ID });
    } finally {
      server.close();
    }
  });
});
