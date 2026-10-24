import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { PostgresRoomStore } from "./pgstore.js";

// Postgres round-trip for the rooms schema (issue #149). Skipped
// without TEST_PG_URL so `npm test` stays green without a database;
// the persistence path is exercised wherever one exists (locally and
// in the e2e lab).
const DATABASE_URL = process.env["TEST_PG_URL"];

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
      const type = await store.upsertRoomType({ name: "Deluxe", capacity: 2, bedType: "king", actor: "manager" });
      assert.ok(type.id);
      const room = await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" });
      assert.equal(room.state, "vacant-inspected");
      const sell = await store.checkSellability({ roomType: "Deluxe", dateFrom: "2026-11-01", dateTo: "2026-11-03" });
      assert.equal(sell.sellableCount, 1);

      const receipt = await store.assignRoom({
        roomNumber: "101",
        businessDate: "2026-11-01",
        stayLink: "stay-1",
        actor: "front-desk",
      });
      assert.equal(receipt.state, "occupied");
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
      await store.upsertRoomType({ name: "Deluxe", actor: "manager" });
      await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" });
      await store.blockRoom({
        roomNumber: "101",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-05",
        reason: "Plumbing repair",
        actor: "manager",
      });
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
      });
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
          }),
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
      await store.upsertRoomType({ name: "Deluxe", actor: "manager" });
      await store.upsertRoom({ number: "101", roomType: "Deluxe", actor: "manager" });
      const attempts = await Promise.allSettled([
        store.assignRoom({ roomNumber: "101", businessDate: "2026-11-01", stayLink: "stay-1", actor: "front-desk" }),
        store.assignRoom({ roomNumber: "101", businessDate: "2026-11-01", stayLink: "stay-2", actor: "front-desk" }),
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
});
