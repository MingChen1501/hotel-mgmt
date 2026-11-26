import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { PostgresRoomStore } from "./pgstore.js";

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
      await store.assignRoom(
        { roomNumber: "101", businessDate: "2026-11-01", stayLink: "stay-1", actor: "mallory" },
        TOKEN,
      );
      await store.blockRoom(
        { roomNumber: "101", dateFrom: "2026-11-01", dateTo: "2026-11-05", reason: "Plumbing repair", actor: "mallory" },
        TOKEN,
      );
      await store.releaseBlock(
        { roomNumber: "101", dateFrom: "2026-11-01", dateTo: "2026-11-05", actor: "mallory" },
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
      const block = await pool.query(`SELECT created_by FROM rooms.room_blocks`);
      assert.equal(block.rows[0]?.created_by, TOKEN);
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
});
