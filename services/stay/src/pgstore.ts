import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import {
  STAY_STATES,
  optionalTimestamp,
  requireString,
  requireUuid,
  type CheckInInput,
  type GetStayInput,
  type QueryStaysInput,
  type StayRecord,
  type StayState,
  type StayStoreAPI,
} from "./store.js";

// Postgres-backed StayService store (issue #149). Implements
// StayStoreAPI against the stay schema (docs/technical/schema.md
// section 2) with identical semantics to the in-memory store. The
// UNIQUE(reservation_id) row is the one-stay-per-reservation rule:
// a repeat check-in is refused with CONFLICT.
export class PostgresStayStore implements StayStoreAPI {
  constructor(private readonly pool: Pool) {}

  private static toStay(row: {
    id: string;
    reservation_id: string;
    guest_id: string;
    current_room_id: string;
    state: StayState;
    actual_arrival: string | null;
    actual_departure: string | null;
  }): StayRecord {
    return {
      id: row.id,
      reservationId: row.reservation_id,
      guestId: row.guest_id,
      currentRoomId: row.current_room_id,
      state: row.state,
      actualArrival: row.actual_arrival === null ? null : new Date(row.actual_arrival).toISOString(),
      actualDeparture: row.actual_departure === null ? null : new Date(row.actual_departure).toISOString(),
    };
  }

  async checkIn(input: CheckInInput): Promise<StayRecord> {
    const id =
      input.stayId === undefined || input.stayId === null || input.stayId === ""
        ? randomUUID()
        : requireUuid(input.stayId, "stayId");
    const reservationId = requireUuid(input.reservationId, "reservationId");
    const guestId = requireUuid(input.guestId, "guestId");
    const currentRoomId = requireUuid(input.roomId, "roomId");
    const actualArrival = optionalTimestamp(input.actualArrival, "actualArrival");
    const actor = requireString(input.actor, "actor");
    const existing = await this.pool.query(
      `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
       FROM stay.stays WHERE reservation_id = $1`,
      [reservationId],
    );
    if (existing.rows.length > 0) {
      const record = PostgresStayStore.toStay(existing.rows[0]);
      throw new HttpError("CONFLICT", "Reservation is already checked in.", {
        reservationId,
        stayId: record.id,
      });
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query(
        `INSERT INTO stay.stays
           (id, reservation_id, guest_id, current_room_id, state, actual_arrival, created_by, updated_by)
         VALUES ($1, $2, $3, $4, 'in-house', COALESCE($5::timestamptz, now()), $6, $6)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure`,
        [id, reservationId, guestId, currentRoomId, actualArrival, actor],
      );
      if (created.rows.length === 0) {
        const replay = await client.query(
          `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
           FROM stay.stays WHERE id = $1`,
          [id],
        );
        await client.query("ROLLBACK");
        return PostgresStayStore.toStay(replay.rows[0]);
      }
      await this.outbox(client, "stay", "checked-in", { stayId: id, reservationId, roomId: currentRoomId, actor }, actor);
      await client.query("COMMIT");
      return PostgresStayStore.toStay(created.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getStay(input: GetStayInput): Promise<StayRecord> {
    if (typeof input.stayId === "string" && input.stayId !== "") {
      const found = await this.pool.query(
        `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
         FROM stay.stays WHERE id = $1`,
        [requireUuid(input.stayId, "stayId")],
      );
      if (found.rows.length === 0) {
        throw new HttpError("NOT_FOUND", `Unknown stay ${input.stayId}.`, { stayId: input.stayId });
      }
      return PostgresStayStore.toStay(found.rows[0]);
    }
    if (typeof input.reservationId === "string" && input.reservationId !== "") {
      const found = await this.pool.query(
        `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
         FROM stay.stays WHERE reservation_id = $1`,
        [requireUuid(input.reservationId, "reservationId")],
      );
      if (found.rows.length === 0) {
        throw new HttpError("NOT_FOUND", `No stay for reservation ${input.reservationId}.`, {
          reservationId: input.reservationId,
        });
      }
      return PostgresStayStore.toStay(found.rows[0]);
    }
    throw new HttpError("VALIDATION_FAILED", "stayId or reservationId is required.", { field: "stayId" });
  }

  async queryStays(input: QueryStaysInput): Promise<StayRecord[]> {
    if (input.state !== undefined) {
      if (typeof input.state !== "string" || !STAY_STATES.includes(input.state as StayState)) {
        throw new HttpError("VALIDATION_FAILED", "Unknown stay state.", { state: input.state });
      }
      const { rows } = await this.pool.query(
        `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
         FROM stay.stays WHERE state = $1 ORDER BY actual_arrival`,
        [input.state],
      );
      return rows.map(PostgresStayStore.toStay);
    }
    const { rows } = await this.pool.query(
      `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
       FROM stay.stays ORDER BY actual_arrival`,
    );
    return rows.map(PostgresStayStore.toStay);
  }

  private async outbox(
    client: PoolClient,
    aggregate: string,
    eventType: string,
    payload: Record<string, unknown>,
    createdBy: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO stay.outbox (aggregate, event_type, payload, occurred_at, created_by)
       VALUES ($1, $2, $3::jsonb, now(), $4)`,
      [aggregate, eventType, JSON.stringify(payload), createdBy],
    );
  }
}
