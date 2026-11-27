import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { msg } from "./messages.js";
import { PostgresRoomStore } from "./pgstore.js";
import { HttpError } from "./errors.js";
import { RoomStore } from "./store.js";

// Postgres round-trip for the rooms schema (issue #149). Skipped
// without TEST_PG_URL so `npm test` stays green without a database;
// the persistence path is exercised wherever one exists (locally and
// in the e2e lab).
const DATABASE_URL = process.env["TEST_PG_URL"];
const TOKEN = "skeleton-test-token";

async function wipe(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM rooms.outbox");
  await pool.query("DELETE FROM rooms.room_status_history");
  await pool.query("DELETE FROM rooms.room_blocks");
  await pool.query("DELETE FROM rooms.rooms");
  await pool.query("DELETE FROM rooms.room_types");
}

describe("rooms postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("persists the desk-loop room rows", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      const type = await store.upsertRoomType({ name: "Deluxe", capacity: 2, bedType: "king", actor: "manager" }, TOKEN);
      assert.ok(type.id);
      const room = await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
      assert.equal(room.state, "vacant-inspected");
      const sell = await store.checkSellability({ roomType: "Deluxe", dateFrom: "2026-11-01", dateTo: "2026-11-03" });
      assert.equal(sell.sellableCount, 1);
      const types = await store.listRoomTypes();
      assert.deepEqual(
        types.map((type) => type.name),
        ["Deluxe"],
      );

      const receipt = await store.assignRoom({
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        actor: "front-desk",
      }, TOKEN);
      assert.equal(receipt.state, "occupied");
      assert.equal(receipt.roomId, room.id);
      const listed = await store.listRoomsByState("occupied");
      assert.equal(listed.length, 1);

      const history = await store.historyForRoomId(room.id);
      assert.ok(history.some((entry) => entry.oldState === "vacant-inspected" && entry.newState === "occupied"));
      const outbox = await pool.query("SELECT count(*)::int AS n FROM rooms.outbox");
      assert.ok((outbox.rows[0] as { n: number }).n >= 3);
    } finally {
      await pool.end();
    }
  });

  it("releases a block and returns the room to sale", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
      await store.blockRoom({
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        reason: "Plumbing repair",
        actor: "manager",
      }, TOKEN);
      const blocked = await store.checkSellability({
        roomType: "Deluxe",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
      });
      assert.equal(blocked.sellableCount, 0);

      const released = await store.releaseBlock({
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        actor: "manager",
      }, TOKEN);
      assert.equal(released.reason, "Plumbing repair");
      const sell = await store.checkSellability({
        roomType: "Deluxe",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
      });
      assert.equal(sell.sellableCount, 1);

      await assert.rejects(
        () =>
          store.releaseBlock({
            roomNumber: "101",
            dateFrom: "2026-11-01",
            dateTo: "2026-11-05",
            actor: "manager",
          }, TOKEN),
        (err: unknown) => (err as { code?: string }).code === "STATE_ILLEGAL",
      );
      const outbox = await pool.query(
        "SELECT count(*)::int AS n FROM rooms.outbox WHERE event_type = 'block-released'",
      );
      assert.equal((outbox.rows[0] as { n: number }).n, 1);
    } finally {
      await pool.end();
    }
  });

  it("grants exactly one winner for paired simultaneous assignments", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
      const attempts = await Promise.allSettled([
        store.assignRoom({ roomNumber: "101", businessDate: "2026-11-01", stayLink: "stay-1", actor: "front-desk" }, TOKEN),
        store.assignRoom({ roomNumber: "101", businessDate: "2026-11-01", stayLink: "stay-2", actor: "front-desk" }, TOKEN),
      ]);
      const winners = attempts.filter((result) => result.status === "fulfilled");
      const losers = attempts.filter((result) => result.status === "rejected");
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.match((losers[0] as PromiseRejectedResult).reason?.code ?? "", /CONFLICT/);
    } finally {
      await pool.end();
    }
  });

  it("scopes an assignment key per room so a reused key checks the second room", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "102", roomType: "Deluxe", actor: "manager" }, TOKEN);
      const first = await store.assignRoom({
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      }, TOKEN);
      assert.equal(first.roomNumber, "101");
      const second = await store.assignRoom({
        roomNumber: "102",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      }, TOKEN);
      assert.equal(second.roomNumber, "102");
      const replay = await store.assignRoom({
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        idempotencyKey: "checkin-1",
        actor: "front-desk",
      }, TOKEN);
      assert.deepEqual(replay, first);
      const occupied = await store.listRoomsByState("occupied");
      assert.deepEqual(
        occupied.map((room) => room.number).sort(),
        ["101", "102"],
      );
    } finally {
      await pool.end();
    }
  });

  it("records the session token and demotes the body actor on every write (#643, SEC6-SEC12)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", actor: "mallory" }, TOKEN);
      await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "mallory" }, TOKEN);
      await store.updateRoomState({ roomNumber: "101", newState: "occupied", actor: "mallory" }, TOKEN);
      await store.releaseRoom({ roomNumber: "101", toState: "vacant-inspected", actor: "mallory" }, TOKEN);
      // Blocking requires a vacant room, so the block pair runs before
      // the assign that occupies 101 again (#773: this ordering is what
      // the event/history counts below already assume).
      await store.blockRoom(
        { roomNumber: "101", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "mallory" },
        TOKEN,
      );
      // The block row is gone after releaseBlock, so its actor is read here.
      const block = await pool.query(`SELECT created_by FROM rooms.room_blocks`);
      assert.equal(block.rows[0]?.created_by, TOKEN);
      await store.releaseBlock(
        { roomNumber: "101", dateFrom: "2026-11-01", dateTo: "2026-11-05", actor: "mallory" },
        TOKEN,
      );
      await store.assignRoom(
        { roomNumber: "101", businessDate: "2026-11-01", stayLink: "stay-1", actor: "mallory" },
        TOKEN,
      );

      const type = await pool.query(`SELECT created_by, updated_by FROM rooms.room_types WHERE name = 'Deluxe'`);
      assert.equal(type.rows[0].created_by, TOKEN);
      assert.equal(type.rows[0].updated_by, TOKEN);
      const room = await pool.query(`SELECT created_by, updated_by FROM rooms.rooms WHERE number = '101'`);
      assert.equal(room.rows[0].created_by, TOKEN);
      assert.equal(room.rows[0].updated_by, TOKEN);
      const history = await pool.query(`SELECT created_by FROM rooms.room_status_history`);
      assert.equal(history.rows.length, 3);
      for (const entry of history.rows as { created_by: string }[]) {
        assert.equal(entry.created_by, TOKEN);
      }
      const events = await pool.query(`SELECT event_type, payload, created_by FROM rooms.outbox`);
      assert.equal(events.rows.length, 7);
      for (const event of events.rows as { event_type: string; payload: Record<string, unknown>; created_by: string }[]) {
        assert.equal(event.created_by, TOKEN, event.event_type);
        assert.equal(event.payload["requestActor"], "mallory", event.event_type);
        assert.notEqual(event.payload["actor"], "mallory", event.event_type);
      }
    } finally {
      await pool.end();
    }
  });

  // Postgres half of SL5. The in-memory twin of this shared fixture lives
  // in server.test.ts so `npm test` exercises it without TEST_PG_URL; both
  // halves assert the same 5/2/["103"] triple and the same single-room
  // answer, so a drift in either store fails a CI-run case.
  it("counts the recorded-state fixture as 5 sellable 2 with 103 blocked (SL5, Postgres half)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", capacity: 2, actor: "manager" }, TOKEN);
      for (const number of ["101", "102", "103", "104", "105"]) {
        await store.upsertRoom({ number, roomType: "Deluxe", actor: "manager" }, TOKEN);
      }
      // 101 out-of-order; 102 occupied through the public assign path;
      // 103 out-of-order and block-covered; 104/105 remain vacant-inspected.
      await store.updateRoomState({ roomNumber: "101", newState: "out-of-order", actor: "manager" }, TOKEN);
      await store.assignRoom(
        { roomNumber: "102", businessDate: "2026-11-01", stayLink: "stay-1", actor: "front-desk" },
        TOKEN,
      );
      await store.updateRoomState({ roomNumber: "103", newState: "out-of-order", actor: "manager" }, TOKEN);
      await store.blockRoom(
        { roomNumber: "103", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "manager" },
        TOKEN,
      );
      const range = { roomType: "Deluxe", dateFrom: "2026-11-01", dateTo: "2026-11-03" };
      const sell = await store.checkSellability(range);
      assert.equal(sell.totalCount, 5);
      assert.equal(sell.sellableCount, 2);
      assert.deepEqual(sell.blockedRooms, ["103"]);

      const single = await store.checkSellability({ ...range, roomNumber: "101" });
      assert.equal(single.totalCount, 1);
      assert.equal(single.sellableCount, 0);
      assert.deepEqual(single.blockedRooms, []);
    } finally {
      await pool.end();
    }
  });

  it("refuses a block-covered out-of-order room before the state answer (SL7)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" }, TOKEN);
      await store.updateRoomState({ roomNumber: "101", newState: "out-of-order", actor: "manager" }, TOKEN);
      await store.blockRoom(
        { roomNumber: "101", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "manager" },
        TOKEN,
      );
      await assert.rejects(
        () =>
          store.checkSellability({
            roomType: "Deluxe",
            dateFrom: "2026-11-01",
            dateTo: "2026-11-03",
            roomNumber: "101",
          }),
        (err: unknown) => {
          const refusal = err as { code?: string; details?: unknown };
          assert.equal(refusal.code, "STATE_ILLEGAL");
          assert.deepEqual(refusal.details, {
            roomNumber: "101",
            dateFrom: "2026-11-01",
            dateTo: "2026-11-05",
            reason: "Plumbing repair",
          });
          return true;
        },
      );
    } finally {
      await pool.end();
    }
  });
});

// Contract guards for the #637 capacity rule on the Postgres store
// (BR-69, AC-CAP-1..AC-CAP-3). Skipped without TEST_PG_URL like the
// rest of this suite; the in-memory twins are in server.test.ts.
const CAPACITY_MESSAGE = msg("rooms.validation.capacity", { field: "capacity" });

function assertCapacityRefusal(err: unknown): boolean {
  const refusal = err as { code?: string; message?: string; details?: { field?: string } };
  assert.equal(refusal.code, "VALIDATION_FAILED");
  assert.equal(refusal.message, CAPACITY_MESSAGE);
  assert.deepEqual(refusal.details, { field: "capacity" });
  return true;
}

const REFUSED_CAPACITIES: unknown[] = [
  -1,
  0,
  -2147483648,
  2.5,
  0.5,
  1e-1,
  "2",
  null,
  true,
  [2],
  {},
  Infinity,
  -Infinity,
  NaN,
];

describe("rooms postgres capacity validation (#637, CAP1-CAP5)", {
  skip: DATABASE_URL === undefined || DATABASE_URL === "",
}, () => {
  it("stores accepted capacities verbatim, above the form bound too, and keeps omitted values (CAP1, CAP2)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      for (const capacity of [1, 21]) {
        const type = await store.upsertRoomType({ name: `Type${capacity}`, capacity, actor: "manager" }, TOKEN);
        assert.equal(type.capacity, capacity);
      }
      const decimal = await store.upsertRoomType({ name: "Decimal", capacity: 2.0, actor: "manager" }, TOKEN);
      assert.equal(decimal.capacity, 2);

      const listed = await store.listRoomTypes();
      assert.equal(listed.find((type) => type.name === "Type1")?.capacity, 1);
      assert.equal(listed.find((type) => type.name === "Type21")?.capacity, 21);

      const created = await store.upsertRoomType({ name: "Sparse", actor: "manager" }, TOKEN);
      assert.equal(created.capacity, null);
      await store.upsertRoomType({ name: "Sparse", capacity: 3, actor: "manager" }, TOKEN);
      const kept = await store.upsertRoomType({ name: "Sparse", actor: "manager" }, TOKEN);
      assert.equal(kept.capacity, 3);

      await store.upsertRoom({ number: "101", roomType: "Type1", capacity: 1, actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "102", roomType: "Type21", capacity: 21, actor: "manager" }, TOKEN);
      const rows = await pool.query(
        `SELECT number, capacity FROM rooms.rooms WHERE number IN ('101', '102') ORDER BY number`,
      );
      assert.deepEqual(rows.rows, [
        { number: "101", capacity: 1 },
        { number: "102", capacity: 21 },
      ]);
      await store.upsertRoom({ number: "103", roomType: "Type1", actor: "manager" }, TOKEN);
      const omitted = await pool.query(`SELECT capacity FROM rooms.rooms WHERE number = '103'`);
      assert.equal((omitted.rows[0] as { capacity: number | null }).capacity, null);
      await store.upsertRoom({ number: "103", roomType: "Type1", capacity: 4, actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "103", roomType: "Type1", actor: "manager" }, TOKEN);
      const stillFour = await pool.query(`SELECT capacity FROM rooms.rooms WHERE number = '103'`);
      assert.equal((stillFour.rows[0] as { capacity: number }).capacity, 4);
    } finally {
      await pool.end();
    }
  });

  it("refuses every unusable capacity on both operations and never reaches the INT cast (CAP3, AC-CAP-2)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", capacity: 2, actor: "manager" }, TOKEN);
      for (const capacity of REFUSED_CAPACITIES) {
        await assert.rejects(
          () => store.upsertRoomType({ name: "Deluxe", capacity, actor: "manager" }, TOKEN),
          assertCapacityRefusal,
        );
        await assert.rejects(
          () => store.upsertRoom({ number: "101", roomType: "Deluxe", capacity, actor: "manager" }, TOKEN),
          assertCapacityRefusal,
        );
      }
      const stored = await store.listRoomTypes();
      assert.equal(stored.find((type) => type.name === "Deluxe")?.capacity, 2);
    } finally {
      await pool.end();
    }
  });

  it("writes nothing and emits no room-upserted event on a refusal (CAP4, AC-CAP-2)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", capacity: 2, bedType: "king", actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "101", roomType: "Deluxe", capacity: 2, floor: "1", actor: "manager" }, TOKEN);
      const typeBefore = await pool.query(
        `SELECT id, name, capacity, bed_type, features FROM rooms.room_types WHERE name = 'Deluxe'`,
      );
      const roomBefore = await pool.query(
        `SELECT id, number, room_type_id, floor, bed_type, capacity, features, state FROM rooms.rooms WHERE number = '101'`,
      );
      const eventsBefore = await pool.query(`SELECT count(*)::int AS n FROM rooms.outbox`);

      for (const capacity of REFUSED_CAPACITIES) {
        await assert.rejects(
          () => store.upsertRoomType({ name: "Deluxe", capacity, actor: "manager" }, TOKEN),
          assertCapacityRefusal,
        );
        await assert.rejects(
          () => store.upsertRoom({ number: "101", roomType: "Deluxe", capacity, actor: "manager" }, TOKEN),
          assertCapacityRefusal,
        );
      }
      await assert.rejects(
        () => store.upsertRoomType({ name: "Rejected", capacity: 0, actor: "manager" }, TOKEN),
        assertCapacityRefusal,
      );

      const typeAfter = await pool.query(
        `SELECT id, name, capacity, bed_type, features FROM rooms.room_types WHERE name = 'Deluxe'`,
      );
      const roomAfter = await pool.query(
        `SELECT id, number, room_type_id, floor, bed_type, capacity, features, state FROM rooms.rooms WHERE number = '101'`,
      );
      assert.deepEqual(typeAfter.rows, typeBefore.rows);
      assert.deepEqual(roomAfter.rows, roomBefore.rows);
      const eventsAfter = await pool.query(`SELECT count(*)::int AS n FROM rooms.outbox`);
      assert.equal((eventsAfter.rows[0] as { n: number }).n, (eventsBefore.rows[0] as { n: number }).n);
      const rejected = await pool.query(`SELECT 1 FROM rooms.room_types WHERE name = 'Rejected'`);
      assert.equal(rejected.rows.length, 0);
    } finally {
      await pool.end();
    }
  });

  it("never re-validates a capacity stored before the change (CAP5, AC-CAP-3)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await pool.query(
        `INSERT INTO rooms.room_types (id, name, capacity, bed_type, features, created_by, updated_by)
         VALUES ('00000000-0000-4000-8000-000000000637', 'Legacy', 0, NULL, '{}'::jsonb, 'legacy', 'legacy')`,
      );
      const legacy = await store.resolveRoomType("Legacy");
      assert.equal(legacy.capacity, 0);
      assert.equal((await store.listRoomTypes()).find((type) => type.name === "Legacy")?.capacity, 0);
    } finally {
      await pool.end();
    }
  });
});

// Postgres half of the #773 release-target guards (BR-72; REL-5-REL-8).
// Every case runs against TEST_PG_URL on a fresh wiped schema, exactly
// like the existing release guards above; the in-memory halves live in
// server.test.ts.
const REFUSED_RELEASE_TARGETS: unknown[] = [
  "vacant-clean",
  "out-of-order",
  "occupied",
  "Vacant-Dirty",
  "clean",
  42,
  true,
  ["vacant-dirty"],
  { state: "vacant-dirty" },
  null,
];

const RELEASE_TARGET_MESSAGE = "Release target must be vacant-dirty or vacant-inspected.";

type ReleaseAnswer =
  | { ok: true; receipt: { roomNumber: string; oldState: string; newState: string } }
  | { ok: false; status: number; code: string; message: string; details: Record<string, unknown> };

async function captureRelease(run: () => Promise<{ roomNumber: string; oldState: string; newState: string }>): Promise<ReleaseAnswer> {
  try {
    return { ok: true, receipt: await run() };
  } catch (err) {
    const http = err as HttpError;
    assert.ok(http instanceof HttpError, String(err));
    return {
      ok: false,
      status: http.status,
      code: http.code,
      message: http.message,
      details: http.details,
    };
  }
}

async function seedReleaseRooms(
  store: PostgresRoomStore | RoomStore,
  numbers: string[],
): Promise<void> {
  await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
  for (const number of numbers) {
    await store.upsertRoom({ number, roomType: "Deluxe", actor: "manager" }, TOKEN);
  }
  for (const number of numbers) {
    await store.assignRoom(
      { roomNumber: number, businessDate: "2026-11-01", stayLink: `stay-${number}`, actor: "front-desk" },
      TOKEN,
    );
  }
}

async function rowCounts(pool: Pool): Promise<{ rooms: number; history: number; outbox: number }> {
  const counts = await pool.query(
    `SELECT (SELECT count(*)::int FROM rooms.rooms) AS rooms,
            (SELECT count(*)::int FROM rooms.room_status_history) AS history,
            (SELECT count(*)::int FROM rooms.outbox) AS outbox`,
  );
  return counts.rows[0] as { rooms: number; history: number; outbox: number };
}

describe("rooms postgres release targets (#773, REL-5-REL-8)", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("accepts exactly the two targets and keeps the absent default (REL-5)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await seedReleaseRooms(store, ["101", "102", "103"]);

      assert.deepEqual(
        await store.releaseRoom({ roomNumber: "101", toState: "vacant-dirty", actor: "front-desk" }, TOKEN),
        { roomNumber: "101", oldState: "occupied", newState: "vacant-dirty" },
      );
      assert.deepEqual(
        await store.releaseRoom({ roomNumber: "102", toState: "vacant-inspected", actor: "front-desk" }, TOKEN),
        { roomNumber: "102", oldState: "occupied", newState: "vacant-inspected" },
      );
      assert.deepEqual(
        await store.releaseRoom({ roomNumber: "103", actor: "front-desk" }, TOKEN),
        { roomNumber: "103", oldState: "occupied", newState: "vacant-dirty" },
      );

      const rooms = await pool.query(`SELECT number, state FROM rooms.rooms ORDER BY number`);
      assert.deepEqual(rooms.rows, [
        { number: "101", state: "vacant-dirty" },
        { number: "102", state: "vacant-inspected" },
        { number: "103", state: "vacant-dirty" },
      ]);

      // One assign row plus one release row per room, and the matching
      // state-changed event carries the accepted target.
      for (const [number, target] of [["101", "vacant-dirty"], ["102", "vacant-inspected"], ["103", "vacant-dirty"]] as const) {
        const history = await pool.query(
          `SELECT h.old_state, h.new_state, h.created_by
             FROM rooms.room_status_history h
             JOIN rooms.rooms r ON r.id = h.room_id
            WHERE r.number = $1
            ORDER BY h.created_at, h.id`,
          [number],
        );
        assert.equal(history.rows.length, 2, number);
        assert.deepEqual(history.rows[1], { old_state: "occupied", new_state: target, created_by: TOKEN });

        const events = await pool.query(
          `SELECT payload->>'newState' AS new_state, created_by
             FROM rooms.outbox
            WHERE event_type = 'state-changed' AND payload->>'roomNumber' = $1
            ORDER BY id`,
          [number],
        );
        assert.equal(events.rows.length, 2, number);
        assert.deepEqual(events.rows[1], { new_state: target, created_by: TOKEN }, number);
      }
    } finally {
      await pool.end();
    }
  });

  it("refuses every present target outside the pair and writes nothing (REL-6)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await seedReleaseRooms(store, ["101"]);
      const before = await rowCounts(pool);
      const roomBefore = await pool.query(`SELECT id, number, state FROM rooms.rooms WHERE number = '101'`);

      for (const target of REFUSED_RELEASE_TARGETS) {
        await assert.rejects(
          () => store.releaseRoom({ roomNumber: "101", toState: target, actor: "front-desk" }, TOKEN),
          (err: unknown) => {
            const http = err as HttpError;
            const label = `toState=${JSON.stringify(target)}`;
            assert.equal(http.code, "VALIDATION_FAILED", label);
            assert.equal(http.status, 400, label);
            assert.equal(http.message, RELEASE_TARGET_MESSAGE, label);
            assert.deepEqual(http.details, { toState: target }, label);
            return true;
          },
        );
      }

      assert.deepEqual(await rowCounts(pool), before);
      assert.deepEqual(
        (await pool.query(`SELECT id, number, state FROM rooms.rooms WHERE number = '101'`)).rows,
        roomBefore.rows,
      );
    } finally {
      await pool.end();
    }
  });

  it("keeps the room's own answers ahead of the target check (REL-7)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresRoomStore(pool);
      await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
      await store.upsertRoom({ number: "102", roomType: "Deluxe", actor: "manager" }, TOKEN);
      const before = await rowCounts(pool);

      for (const target of ["vacant-clean", "out-of-order", "occupied", null] as unknown[]) {
        const free = await captureRelease(() =>
          store.releaseRoom({ roomNumber: "102", toState: target, actor: "front-desk" }, TOKEN),
        );
        assert.equal(free.ok, false, `free room toState=${JSON.stringify(target)}`);
        if (!free.ok) {
          assert.equal(free.status, 422);
          assert.equal(free.code, "STATE_ILLEGAL");
          assert.deepEqual(free.details, { roomNumber: "102", state: "vacant-inspected" });
        }

        const unknown = await captureRelease(() =>
          store.releaseRoom({ roomNumber: "999", toState: target, actor: "front-desk" }, TOKEN),
        );
        assert.equal(unknown.ok, false, `unknown room toState=${JSON.stringify(target)}`);
        if (!unknown.ok) {
          assert.equal(unknown.status, 404);
          assert.equal(unknown.code, "NOT_FOUND");
          assert.deepEqual(unknown.details, { roomNumber: "999" });
        }
      }

      const unknownAccepted = await captureRelease(() =>
        store.releaseRoom({ roomNumber: "999", toState: "vacant-dirty", actor: "front-desk" }, TOKEN),
      );
      assert.equal(unknownAccepted.ok, false);
      if (!unknownAccepted.ok) {
        assert.equal(unknownAccepted.status, 404);
        assert.equal(unknownAccepted.code, "NOT_FOUND");
      }

      assert.deepEqual(await rowCounts(pool), before);
      assert.equal((await store.findRoom("102")).state, "vacant-inspected");
    } finally {
      await pool.end();
    }
  });

  it("answers the same request the same way as the in-memory store (REL-8)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const pg = new PostgresRoomStore(pool);
      const memory = new RoomStore();
      // 201/203/204 are occupied, 202 is free, 999 does not exist.
      for (const store of [pg, memory] as const) {
        await store.upsertRoomType({ name: "Deluxe", actor: "manager" }, TOKEN);
        await store.upsertRoom({ number: "202", roomType: "Deluxe", actor: "manager" }, TOKEN);
        await seedReleaseRooms(store, ["201", "203", "204"]);
      }

      const parity: Array<[string, () => Promise<ReleaseAnswer>, () => Promise<ReleaseAnswer>]> = [];
      for (const target of REFUSED_RELEASE_TARGETS) {
        parity.push([
          `occupied 201 toState=${JSON.stringify(target)}`,
          () => captureRelease(() => memory.releaseRoom({ roomNumber: "201", toState: target, actor: "front-desk" }, TOKEN)),
          () => captureRelease(() => pg.releaseRoom({ roomNumber: "201", toState: target, actor: "front-desk" }, TOKEN)),
        ]);
      }
      parity.push(
        [
          "accepted vacant-dirty",
          () => captureRelease(() => memory.releaseRoom({ roomNumber: "201", toState: "vacant-dirty", actor: "front-desk" }, TOKEN)),
          () => captureRelease(() => pg.releaseRoom({ roomNumber: "201", toState: "vacant-dirty", actor: "front-desk" }, TOKEN)),
        ],
        [
          "accepted vacant-inspected",
          () => captureRelease(() => memory.releaseRoom({ roomNumber: "203", toState: "vacant-inspected", actor: "front-desk" }, TOKEN)),
          () => captureRelease(() => pg.releaseRoom({ roomNumber: "203", toState: "vacant-inspected", actor: "front-desk" }, TOKEN)),
        ],
        [
          "accepted absent default",
          () => captureRelease(() => memory.releaseRoom({ roomNumber: "204", actor: "front-desk" }, TOKEN)),
          () => captureRelease(() => pg.releaseRoom({ roomNumber: "204", actor: "front-desk" }, TOKEN)),
        ],
      );
      for (const target of ["vacant-clean", "out-of-order", "occupied", null] as unknown[]) {
        parity.push(
          [
            `free room 202 toState=${JSON.stringify(target)}`,
            () => captureRelease(() => memory.releaseRoom({ roomNumber: "202", toState: target, actor: "front-desk" }, TOKEN)),
            () => captureRelease(() => pg.releaseRoom({ roomNumber: "202", toState: target, actor: "front-desk" }, TOKEN)),
          ],
          [
            `unknown room 999 toState=${JSON.stringify(target)}`,
            () => captureRelease(() => memory.releaseRoom({ roomNumber: "999", toState: target, actor: "front-desk" }, TOKEN)),
            () => captureRelease(() => pg.releaseRoom({ roomNumber: "999", toState: target, actor: "front-desk" }, TOKEN)),
          ],
        );
      }

      for (const [label, memoryRun, pgRun] of parity) {
        assert.deepEqual(await pgRun(), await memoryRun(), label);
      }
    } finally {
      await pool.end();
    }
  });
});
