import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import {
  ALLOWED_TRANSITIONS,
  ROOM_STATES,
  requireDate,
  requireString,
  type AssignRoomInput,
  type BlockRoomInput,
  type CheckSellabilityInput,
  type ReleaseRoomInput,
  type RoomRecord,
  type RoomState,
  type RoomStoreAPI,
  type RoomTypeRecord,
  type StateHistoryEntry,
  type UpdateRoomStateInput,
  type UpsertRoomInput,
  type UpsertRoomTypeInput,
} from "./store.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Postgres-backed RoomInventoryService store (issue #149).
//
// Implements RoomStoreAPI against the rooms schema
// (docs/technical/schema.md section 3) with identical semantics to
// the in-memory store. The NFR-CON-2 exactly-once guard is the
// conditional UPDATE in assignRoom: the room flips to occupied only
// when it is currently vacant-inspected with no covering block, so
// two simultaneous assignments cannot both succeed. AssignRoom
// idempotency receipts stay in memory (see store.ts).
export class PostgresRoomStore implements RoomStoreAPI {
  private readonly idempotency = new Map<string, { roomNumber: string; stayLink: string; state: RoomState }>();

  constructor(private readonly pool: Pool) {}

  private async withTx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  private async outbox(
    client: Pool | PoolClient,
    aggregate: string,
    eventType: string,
    payload: Record<string, unknown>,
    createdBy: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO rooms.outbox (aggregate, event_type, payload, occurred_at, created_by)
       VALUES ($1, $2, $3::jsonb, now(), $4)`,
      [aggregate, eventType, JSON.stringify(payload), createdBy],
    );
  }

  private static toRoomType(row: {
    id: string;
    name: string;
    capacity: number | null;
    bed_type: string | null;
    features: Record<string, unknown>;
  }): RoomTypeRecord {
    return {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      bedType: row.bed_type,
      features: row.features ?? {},
    };
  }

  private static toRoom(row: {
    id: string;
    number: string;
    room_type_id: string;
    floor: string | null;
    bed_type: string | null;
    capacity: number | null;
    features: Record<string, unknown>;
    state: RoomState;
  }): RoomRecord {
    return {
      id: row.id,
      number: row.number,
      roomTypeId: row.room_type_id,
      floor: row.floor,
      bedType: row.bed_type,
      capacity: row.capacity,
      features: row.features ?? {},
      state: row.state,
    };
  }

  async resolveRoomType(ref: unknown): Promise<RoomTypeRecord> {
    const key = requireString(ref, "roomType");
    const byId = UUID_PATTERN.test(key);
    const { rows } = await this.pool.query(
      byId
        ? `SELECT id, name, capacity, bed_type, features FROM rooms.room_types WHERE id = $1`
        : `SELECT id, name, capacity, bed_type, features FROM rooms.room_types WHERE name = $1`,
      [key],
    );
    if (rows.length === 0) {
      throw new HttpError("NOT_FOUND", `Unknown room type ${key}.`, { roomType: key });
    }
    return PostgresRoomStore.toRoomType(
      rows[0] as { id: string; name: string; capacity: number | null; bed_type: string | null; features: Record<string, unknown> },
    );
  }

  async findRoom(number: unknown): Promise<RoomRecord> {
    const key = requireString(number, "roomNumber");
    const { rows } = await this.pool.query(
      `SELECT id, number, room_type_id, floor, bed_type, capacity, features, state
       FROM rooms.rooms WHERE number = $1`,
      [key],
    );
    if (rows.length === 0) {
      throw new HttpError("NOT_FOUND", `Unknown room ${key}.`, { roomNumber: key });
    }
    return PostgresRoomStore.toRoom(rows[0]);
  }

  async upsertRoomType(input: UpsertRoomTypeInput): Promise<RoomTypeRecord> {
    const name = requireString(input.name, "name");
    const actor = requireString(input.actor, "actor");
    const capacity = typeof input.capacity === "number" ? input.capacity : null;
    const bedType = typeof input.bedType === "string" ? input.bedType : null;
    const features =
      typeof input.features === "object" && input.features !== null
        ? (input.features as Record<string, unknown>)
        : null;
    const result = await this.withTx(async (client) => {
      const existing = await client.query(
        `SELECT id, name, capacity, bed_type, features FROM rooms.room_types WHERE name = $1`,
        [name],
      );
      if (existing.rows.length > 0) {
        const current = PostgresRoomStore.toRoomType(existing.rows[0]);
        const merged = {
          capacity: capacity ?? current.capacity,
          bedType: bedType ?? current.bedType,
          features: features ?? current.features,
        };
        const updated = await client.query(
          `UPDATE rooms.room_types SET capacity = $2, bed_type = $3, features = $4::jsonb,
             updated_by = $5, updated_at = now()
           WHERE name = $1
           RETURNING id, name, capacity, bed_type, features`,
          [name, merged.capacity, merged.bedType, JSON.stringify(merged.features), actor],
        );
        await this.outbox(
          client,
          "room-type",
          "room-upserted",
          { roomTypeId: updated.rows[0].id as string, name, actor },
          actor,
        );
        return PostgresRoomStore.toRoomType(updated.rows[0]);
      }
      const id = randomUUID();
      const created = await client.query(
        `INSERT INTO rooms.room_types (id, name, capacity, bed_type, features, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $6)
         RETURNING id, name, capacity, bed_type, features`,
        [id, name, capacity, bedType, JSON.stringify(features ?? {}), actor],
      );
      await this.outbox(
        client,
        "room-type",
        "room-upserted",
        { roomTypeId: created.rows[0].id as string, name, actor },
        actor,
      );
      return PostgresRoomStore.toRoomType(created.rows[0]);
    });
    return result;
  }

  async upsertRoom(input: UpsertRoomInput): Promise<RoomRecord> {
    const number = requireString(input.number, "number");
    const actor = requireString(input.actor, "actor");
    const roomType = await this.resolveRoomType(input.roomType);
    const floor = typeof input.floor === "string" ? input.floor : null;
    const bedType = typeof input.bedType === "string" ? input.bedType : null;
    const capacity = typeof input.capacity === "number" ? input.capacity : null;
    const features =
      typeof input.features === "object" && input.features !== null
        ? (input.features as Record<string, unknown>)
        : null;
    return this.withTx(async (client) => {
      const existing = await client.query(
        `SELECT id, number, room_type_id, floor, bed_type, capacity, features, state
         FROM rooms.rooms WHERE number = $1`,
        [number],
      );
      if (existing.rows.length > 0) {
        const updated = await client.query(
          `UPDATE rooms.rooms SET room_type_id = $2, floor = COALESCE($3, floor),
             bed_type = COALESCE($4, bed_type), capacity = COALESCE($5, capacity),
             features = COALESCE($6::jsonb, features), updated_by = $7, updated_at = now()
           WHERE number = $1
           RETURNING id, number, room_type_id, floor, bed_type, capacity, features, state`,
          [
            number,
            roomType.id,
            floor,
            bedType,
            capacity,
            features === null ? null : JSON.stringify(features),
            actor,
          ],
        );
        await this.outbox(
          client,
          "room",
          "room-upserted",
          { roomNumber: number, roomTypeId: roomType.id },
          actor,
        );
        return PostgresRoomStore.toRoom(updated.rows[0]);
      }
      const created = await client.query(
        `INSERT INTO rooms.rooms
           (id, number, room_type_id, floor, bed_type, capacity, features, state, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'vacant-inspected', $8, $8)
         RETURNING id, number, room_type_id, floor, bed_type, capacity, features, state`,
        [
          randomUUID(),
          number,
          roomType.id,
          floor,
          bedType,
          capacity,
          JSON.stringify(features ?? {}),
          actor,
        ],
      );
      await this.outbox(
        client,
        "room",
        "room-upserted",
        { roomNumber: number, roomTypeId: roomType.id },
        actor,
      );
      return PostgresRoomStore.toRoom(created.rows[0]);
    });
  }

  async updateRoomState(input: UpdateRoomStateInput): Promise<{
    roomNumber: string;
    oldState: RoomState;
    newState: RoomState;
  }> {
    const actor = requireString(input.actor, "actor");
    if (typeof input.newState !== "string" || !ROOM_STATES.includes(input.newState as RoomState)) {
      throw new HttpError("VALIDATION_FAILED", "Unknown state value.", { newState: input.newState });
    }
    const newState = input.newState as RoomState;
    return this.withTx(async (client) => {
      const found = await client.query(
        `SELECT id, number, state FROM rooms.rooms WHERE number = $1`,
        [requireString(input.roomNumber, "roomNumber")],
      );
      if (found.rows.length === 0) {
        const key = requireString(input.roomNumber, "roomNumber");
        throw new HttpError("NOT_FOUND", `Unknown room ${key}.`, { roomNumber: key });
      }
      const room = found.rows[0] as { id: string; number: string; state: RoomState };
      if (room.state === newState) {
        return { roomNumber: room.number, oldState: room.state, newState };
      }
      if (!ALLOWED_TRANSITIONS[room.state].includes(newState)) {
        throw new HttpError(
          "STATE_ILLEGAL",
          `Cannot move room ${room.number} from ${room.state} to ${newState}.`,
          { roomNumber: room.number, oldState: room.state, newState },
        );
      }
      await client.query(`UPDATE rooms.rooms SET state = $2, updated_by = $3, updated_at = now() WHERE id = $1`, [
        room.id,
        newState,
        actor,
      ]);
      await client.query(
        `INSERT INTO rooms.room_status_history (id, room_id, old_state, new_state, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), room.id, room.state, newState, actor],
      );
      await this.outbox(
        client,
        "room",
        "state-changed",
        { roomNumber: room.number, oldState: room.state, newState, actor },
        actor,
      );
      return { roomNumber: room.number, oldState: room.state, newState };
    });
  }

  async listRoomsByState(state: unknown): Promise<RoomRecord[]> {
    if (typeof state !== "string" || !ROOM_STATES.includes(state as RoomState)) {
      throw new HttpError("VALIDATION_FAILED", "Unknown state value.", { state });
    }
    const { rows } = await this.pool.query(
      `SELECT id, number, room_type_id, floor, bed_type, capacity, features, state
       FROM rooms.rooms WHERE state = $1 ORDER BY number`,
      [state],
    );
    return rows.map(PostgresRoomStore.toRoom);
  }

  async checkSellability(input: CheckSellabilityInput): Promise<{
    roomTypeId: string;
    dateFrom: string;
    dateTo: string;
    totalCount: number;
    sellableCount: number;
    blockedRooms: string[];
  }> {
    const roomType = await this.resolveRoomType(input.roomType);
    const dateFrom = requireDate(input.dateFrom, "dateFrom");
    const dateTo = requireDate(input.dateTo, "dateTo");
    if (dateTo < dateFrom) {
      throw new HttpError("VALIDATION_FAILED", "dateTo is before dateFrom.", { dateFrom, dateTo });
    }
    if (input.roomNumber !== undefined) {
      const room = await this.findRoom(input.roomNumber);
      const blocked = await this.pool.query(
        `SELECT date_from::text AS "dateFrom", date_to::text AS "dateTo", reason
         FROM rooms.room_blocks
         WHERE room_id = $1 AND date_from <= $3 AND date_to >= $2
         LIMIT 1`,
        [room.id, dateFrom, dateTo],
      );
      if (blocked.rows.length > 0) {
        const entry = blocked.rows[0] as { dateFrom: string; dateTo: string; reason: string };
        throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is blocked for the requested dates.`, {
          roomNumber: room.number,
          dateFrom: entry.dateFrom,
          dateTo: entry.dateTo,
          reason: entry.reason,
        });
      }
      return {
        roomTypeId: roomType.id,
        dateFrom,
        dateTo,
        totalCount: 1,
        sellableCount: 1,
        blockedRooms: [],
      };
    }
    const counted = await this.pool.query(
      `SELECT count(*)::int AS total,
         count(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1 FROM rooms.room_blocks b
             WHERE b.room_id = r.id AND b.date_from <= $3 AND b.date_to >= $2
           )
         )::int AS sellable
       FROM rooms.rooms r WHERE r.room_type_id = $1`,
      [roomType.id, dateFrom, dateTo],
    );
    const blocked = await this.pool.query(
      `SELECT r.number FROM rooms.rooms r
       WHERE r.room_type_id = $1
         AND EXISTS (
           SELECT 1 FROM rooms.room_blocks b
           WHERE b.room_id = r.id AND b.date_from <= $3 AND b.date_to >= $2
         )
       ORDER BY r.number`,
      [roomType.id, dateFrom, dateTo],
    );
    return {
      roomTypeId: roomType.id,
      dateFrom,
      dateTo,
      totalCount: (counted.rows[0] as { total: number }).total,
      sellableCount: (counted.rows[0] as { sellable: number }).sellable,
      blockedRooms: (blocked.rows as { number: string }[]).map((row) => row.number),
    };
  }

  async assignRoom(input: AssignRoomInput): Promise<{ roomNumber: string; stayLink: string; state: RoomState }> {
    if (typeof input.idempotencyKey === "string" && input.idempotencyKey !== "") {
      const replay = this.idempotency.get(input.idempotencyKey);
      if (replay) {
        return replay;
      }
    }
    const roomNumber = requireString(input.roomNumber, "roomNumber");
    const businessDate = requireDate(input.businessDate, "businessDate");
    const stayLink = requireString(input.stayLink, "stayLink");
    const actor = requireString(input.actor, "actor");
    const receipt = await this.withTx(async (client) => {
      const updated = await client.query(
        `UPDATE rooms.rooms SET state = 'occupied', updated_by = $3, updated_at = now()
         WHERE number = $1 AND state = 'vacant-inspected'
           AND NOT EXISTS (
             SELECT 1 FROM rooms.room_blocks b
               JOIN rooms.rooms r ON r.id = b.room_id
              WHERE r.number = $1 AND b.date_from <= $2 AND b.date_to >= $2
           )
         RETURNING id, number, state`,
        [roomNumber, businessDate, actor],
      );
      if (updated.rows.length === 0) {
        // Nothing was written, so throwing here only rolls back an
        // empty transaction; the diagnosis reads explain why.
        throw await this.diagnoseAssign(client, roomNumber, businessDate);
      }
      const room = updated.rows[0] as { id: string; number: string; state: RoomState };
      await client.query(
        `INSERT INTO rooms.room_status_history (id, room_id, old_state, new_state, created_by)
         VALUES ($1, $2, 'vacant-inspected', 'occupied', $3)`,
        [randomUUID(), room.id, actor],
      );
      await this.outbox(
        client,
        "room",
        "state-changed",
        { roomNumber: room.number, stayLink, actor },
        actor,
      );
      return { roomNumber: room.number, stayLink, state: room.state };
    });
    if (typeof input.idempotencyKey === "string" && input.idempotencyKey !== "") {
      this.idempotency.set(input.idempotencyKey, receipt);
    }
    return receipt;
  }

  // diagnoseAssign explains a failed conditional write with the same
  // errors as the in-memory store: blocked dates, just taken, or not
  // ready (including unknown rooms). It only reads, so it can run
  // inside the rolled-back assignment transaction.
  private async diagnoseAssign(
    client: PoolClient,
    roomNumber: string,
    businessDate: string,
  ): Promise<HttpError> {
    const found = await client.query(`SELECT id, number, state FROM rooms.rooms WHERE number = $1`, [roomNumber]);
    if (found.rows.length === 0) {
      return new HttpError("NOT_FOUND", `Unknown room ${roomNumber}.`, { roomNumber });
    }
    const room = found.rows[0] as { id: string; number: string; state: RoomState };
    const blocked = await client.query(
      `SELECT date_from::text AS "dateFrom", date_to::text AS "dateTo", reason
       FROM rooms.room_blocks
       WHERE room_id = $1 AND date_from <= $2 AND date_to >= $2
       LIMIT 1`,
      [room.id, businessDate],
    );
    if (blocked.rows.length > 0) {
      const entry = blocked.rows[0] as { dateFrom: string; dateTo: string; reason: string };
      return new HttpError("STATE_ILLEGAL", `Room ${room.number} is blocked on ${businessDate}.`, {
        roomNumber: room.number,
        dateFrom: entry.dateFrom,
        dateTo: entry.dateTo,
        reason: entry.reason,
      });
    }
    if (room.state === "occupied") {
      return new HttpError("CONFLICT", `Room ${room.number} was just taken.`, { roomNumber: room.number });
    }
    if (room.state !== "vacant-inspected") {
      return new HttpError("STATE_ILLEGAL", `Room ${room.number} is ${room.state}, not ready.`, {
        roomNumber: room.number,
        state: room.state,
      });
    }
    // The room reads ready here but the write lost: a simultaneous
    // assignment won the race between the check and the write.
    return new HttpError("CONFLICT", `Room ${room.number} was just taken.`, { roomNumber: room.number });
  }

  async releaseRoom(input: ReleaseRoomInput): Promise<{
    roomNumber: string;
    oldState: RoomState;
    newState: RoomState;
  }> {
    const actor = requireString(input.actor, "actor");
    const toState: RoomState =
      typeof input.toState === "string" && ROOM_STATES.includes(input.toState as RoomState)
        ? (input.toState as RoomState)
        : "vacant-dirty";
    if (toState === "occupied") {
      throw new HttpError("VALIDATION_FAILED", "Release target cannot be occupied.", { toState });
    }
    return this.withTx(async (client) => {
      const found = await client.query(`SELECT id, number, state FROM rooms.rooms WHERE number = $1`, [
        requireString(input.roomNumber, "roomNumber"),
      ]);
      if (found.rows.length === 0) {
        const key = requireString(input.roomNumber, "roomNumber");
        throw new HttpError("NOT_FOUND", `Unknown room ${key}.`, { roomNumber: key });
      }
      const room = found.rows[0] as { id: string; number: string; state: RoomState };
      if (room.state !== "occupied") {
        throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is ${room.state}, not occupied.`, {
          roomNumber: room.number,
          state: room.state,
        });
      }
      await client.query(`UPDATE rooms.rooms SET state = $2, updated_by = $3, updated_at = now() WHERE id = $1`, [
        room.id,
        toState,
        actor,
      ]);
      await client.query(
        `INSERT INTO rooms.room_status_history (id, room_id, old_state, new_state, created_by)
         VALUES ($1, $2, 'occupied', $3, $4)`,
        [randomUUID(), room.id, toState, actor],
      );
      await this.outbox(
        client,
        "room",
        "state-changed",
        { roomNumber: room.number, newState: toState, actor },
        actor,
      );
      return { roomNumber: room.number, oldState: "occupied" as RoomState, newState: toState };
    });
  }

  async blockRoom(input: BlockRoomInput): Promise<{
    roomNumber: string;
    dateFrom: string;
    dateTo: string;
    reason: string;
  }> {
    const dateFrom = requireDate(input.dateFrom, "dateFrom");
    const dateTo = requireDate(input.dateTo, "dateTo");
    const reason = requireString(input.reason, "reason");
    const actor = requireString(input.actor, "actor");
    if (dateTo < dateFrom) {
      throw new HttpError("VALIDATION_FAILED", "dateTo is before dateFrom.", { dateFrom, dateTo });
    }
    return this.withTx(async (client) => {
      const found = await client.query(`SELECT id, number, state FROM rooms.rooms WHERE number = $1`, [
        requireString(input.roomNumber, "roomNumber"),
      ]);
      if (found.rows.length === 0) {
        const key = requireString(input.roomNumber, "roomNumber");
        throw new HttpError("NOT_FOUND", `Unknown room ${key}.`, { roomNumber: key });
      }
      const room = found.rows[0] as { id: string; number: string; state: RoomState };
      if (room.state === "occupied") {
        throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is occupied and cannot be blocked.`, {
          roomNumber: room.number,
        });
      }
      const duplicate = await client.query(
        `SELECT 1 FROM rooms.room_blocks
         WHERE room_id = $1 AND date_from = $2 AND date_to = $3 AND reason = $4`,
        [room.id, dateFrom, dateTo, reason],
      );
      if (duplicate.rows.length > 0) {
        throw new HttpError("VALIDATION_FAILED", "Identical block already exists.", {
          roomNumber: room.number,
          dateFrom,
          dateTo,
        });
      }
      await client.query(
        `INSERT INTO rooms.room_blocks (id, room_id, date_from, date_to, reason, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [randomUUID(), room.id, dateFrom, dateTo, reason, actor],
      );
      await this.outbox(
        client,
        "room",
        "blocked",
        { roomNumber: room.number, dateFrom, dateTo, reason, actor },
        actor,
      );
      return { roomNumber: room.number, dateFrom, dateTo, reason };
    });
  }

  async historyForRoomId(roomId: string): Promise<StateHistoryEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT room_id AS "roomId", old_state AS "oldState", new_state AS "newState",
         created_by AS "createdBy", created_at AS "createdAt"
       FROM rooms.room_status_history WHERE room_id = $1 ORDER BY created_at`,
      [roomId],
    );
    return (rows as StateHistoryEntry[]).map((entry) => ({
      roomId: entry.roomId,
      oldState: entry.oldState,
      newState: entry.newState,
      createdBy: entry.createdBy,
      createdAt: new Date(entry.createdAt).toISOString(),
    }));
  }
}
