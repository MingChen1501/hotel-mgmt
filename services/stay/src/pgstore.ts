import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import {
  STAY_STATES,
  checkFolioGate,
  optionalTimestamp,
  requireDate,
  requireString,
  requireUuid,
  type CheckInInput,
  type CheckOutInput,
  type GetStayInput,
  type GetStayRefInput,
  type ListArrivalsDeparturesInput,
  type MoveRecord,
  type MoveRoomInput,
  type QueryStaysInput,
  type RecordActualTimesInput,
  type StayRecord,
  type StayRef,
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

  // CheckOut closes the stay through a conditional in-house
  // transition in one transaction (issue #150): the guarded UPDATE
  // resolves exactly one winner for paired simultaneous check-outs
  // (NFR-CON-2) and a replayed idempotencyKey returns the original
  // close. The folio gate runs first; a refusal leaves the stay in
  // house (BR-17).
  async checkOut(input: CheckOutInput): Promise<{ stay: StayRecord; invoiceRef: string }> {
    const id = requireUuid(input.stayId, "stayId");
    const invoiceRef = requireUuid(input.folioId, "folioId");
    checkFolioGate(input.folioBalanceMinor, input.openBalanceApproval);
    const actor = requireString(input.actor, "actor");
    const departure = optionalTimestamp(input.actualDeparture, "actualDeparture");
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (key !== "") {
        const replayed = await this.claimOrFind(client, `CheckOut:${key}`, id);
        if (replayed !== null) {
          await client.query("ROLLBACK");
          return { stay: replayed, invoiceRef };
        }
      }
      const closed = await client.query(
        `UPDATE stay.stays SET state = 'closed', actual_departure = COALESCE($2::timestamptz, now()),
          updated_by = $3, updated_at = now()
          WHERE id = $1 AND state = 'in-house'
          RETURNING id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure`,
        [id, departure, actor],
      );
      if (closed.rows.length === 0) {
        await client.query("ROLLBACK");
        const current = await this.pool.query(
          `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
            FROM stay.stays WHERE id = $1`,
          [id],
        );
        if (current.rows.length === 0) {
          throw new HttpError("NOT_FOUND", `Unknown stay ${id}.`, { stayId: id });
        }
        const record = PostgresStayStore.toStay(current.rows[0]);
        throw new HttpError("STATE_ILLEGAL", `Stay ${id} is ${record.state}, not in house.`, {
          stayId: id,
          state: record.state,
        });
      }
      await this.outbox(client, "stay", "checked-out", { stayId: id, folioId: invoiceRef, actor }, actor);
      await client.query("COMMIT");
      const stay = PostgresStayStore.toStay(closed.rows[0]);
      if (key !== "") {
        await this.pool.query(
          `UPDATE stay.idempotency_keys SET result_ref = $2 WHERE key = $1`,
          [`CheckOut:${key}`, id],
        );
      }
      return { stay, invoiceRef };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // MoveRoom keeps the in-house stay on the new room with a history
  // row (FR-FDK-3). The room-side AssignRoom/ReleaseRoom calls are
  // desk-orchestrated around this write; the stay-side UPDATE is
  // conditional on the in-house state for the paired-move race.
  async moveRoom(input: MoveRoomInput): Promise<{ stay: StayRecord; move: MoveRecord }> {
    const id = requireUuid(input.stayId, "stayId");
    const toRoomId = requireUuid(input.toRoomId, "toRoomId");
    const actor = requireString(input.actor, "actor");
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (key !== "") {
        const replayed = await this.claimOrFind(client, `MoveRoom:${key}`, id);
        if (replayed !== null) {
          const prior = await client.query(
            `SELECT stay_id, from_room_id, to_room_id, moved_at
              FROM stay.stay_moves WHERE stay_id = $1 AND to_room_id = $2 ORDER BY moved_at DESC LIMIT 1`,
            [id, replayed.currentRoomId],
          );
          await client.query("ROLLBACK");
          if (prior.rows.length > 0) {
            return {
              stay: replayed,
              move: {
                stayId: prior.rows[0].stay_id as string,
                fromRoomId: prior.rows[0].from_room_id as string,
                toRoomId: prior.rows[0].to_room_id as string,
                movedAt: new Date(prior.rows[0].moved_at as string).toISOString(),
              },
            };
          }
          throw new HttpError("STATE_ILLEGAL", `Stay ${id} already moved under this key.`, { stayId: id });
        }
      }
      const current = await client.query(
        `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
          FROM stay.stays WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (current.rows.length === 0) {
        throw new HttpError("NOT_FOUND", `Unknown stay ${id}.`, { stayId: id });
      }
      const record = PostgresStayStore.toStay(current.rows[0]);
      if (record.state !== "in-house") {
        throw new HttpError("STATE_ILLEGAL", `Stay ${id} is ${record.state}, not in house.`, {
          stayId: id,
          state: record.state,
        });
      }
      if (record.currentRoomId === toRoomId) {
        throw new HttpError("VALIDATION_FAILED", "The guest is already in that room.", { toRoomId });
      }
      const moved = await client.query(
        `UPDATE stay.stays SET current_room_id = $2, updated_by = $3, updated_at = now()
          WHERE id = $1 AND state = 'in-house'
          RETURNING id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure`,
        [id, toRoomId, actor],
      );
      if (moved.rows.length === 0) {
        throw new HttpError("STATE_ILLEGAL", `Stay ${id} left the in-house state mid-move.`, { stayId: id });
      }
      const history = await client.query(
        `INSERT INTO stay.stay_moves (stay_id, from_room_id, to_room_id, created_by)
          VALUES ($1, $2, $3, $4) RETURNING stay_id, from_room_id, to_room_id, moved_at`,
        [id, record.currentRoomId, toRoomId, actor],
      );
      await this.outbox(
        client,
        "stay",
        "moved",
        { stayId: id, fromRoomId: record.currentRoomId, toRoomId, actor },
        actor,
      );
      await client.query("COMMIT");
      const move: MoveRecord = {
        stayId: history.rows[0].stay_id as string,
        fromRoomId: history.rows[0].from_room_id as string,
        toRoomId: history.rows[0].to_room_id as string,
        movedAt: new Date(history.rows[0].moved_at as string).toISOString(),
      };
      const stay = PostgresStayStore.toStay(moved.rows[0]);
      if (key !== "") {
        await this.pool.query(`UPDATE stay.idempotency_keys SET result_ref = $2 WHERE key = $1`, [
          `MoveRoom:${key}`,
          id,
        ]);
      }
      return { stay, move };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // RecordActualTimes keeps off-hours times on the stay row with the
  // outbox event in one transaction (FR-FDK-4).
  async recordActualTimes(input: RecordActualTimesInput): Promise<StayRecord> {
    const id = requireUuid(input.stayId, "stayId");
    const actor = requireString(input.actor, "actor");
    const arrival = optionalTimestamp(input.actualArrival, "actualArrival");
    const departure = optionalTimestamp(input.actualDeparture, "actualDeparture");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const current = await client.query(
        `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
          FROM stay.stays WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (current.rows.length === 0) {
        throw new HttpError("NOT_FOUND", `Unknown stay ${id}.`, { stayId: id });
      }
      const record = PostgresStayStore.toStay(current.rows[0]);
      const actualArrival = arrival ?? record.actualArrival;
      const actualDeparture = departure ?? record.actualDeparture;
      if (actualArrival !== null && actualDeparture !== null && actualDeparture < actualArrival) {
        throw new HttpError("VALIDATION_FAILED", "actualDeparture cannot be before actualArrival.", {
          actualArrival,
          actualDeparture,
        });
      }
      const updated = await client.query(
        `UPDATE stay.stays SET actual_arrival = $2::timestamptz, actual_departure = $3::timestamptz,
          updated_by = $4, updated_at = now() WHERE id = $1
          RETURNING id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure`,
        [id, actualArrival, actualDeparture, actor],
      );
      await this.outbox(
        client,
        "stay",
        "actual-times-recorded",
        { stayId: id, actualArrival, actualDeparture, actor },
        actor,
      );
      await client.query("COMMIT");
      return PostgresStayStore.toStay(updated.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // GetStayRef is the BIL -> STAY read (integration.md C8): closed
  // stays are refused so no folio line posts against a closed stay.
  async getStayRef(input: GetStayRefInput): Promise<StayRef> {
    const id = requireUuid(input.stayId, "stayId");
    const found = await this.pool.query(
      `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
        FROM stay.stays WHERE id = $1`,
      [id],
    );
    if (found.rows.length === 0) {
      throw new HttpError("NOT_FOUND", `Unknown stay ${id}.`, { stayId: id });
    }
    const record = PostgresStayStore.toStay(found.rows[0]);
    if (record.state !== "in-house") {
      throw new HttpError("STATE_ILLEGAL", `Stay ${id} is ${record.state}, not in house.`, {
        stayId: id,
        state: record.state,
      });
    }
    return { stayId: record.id, guestId: record.guestId, roomId: record.currentRoomId, state: record.state };
  }

  // ListArrivalsDepartures serves the daily desk lists (FR-FDK-5);
  // day boundaries compare on the UTC calendar day like the billing
  // day-close aggregates.
  async listArrivalsDepartures(input: ListArrivalsDeparturesInput): Promise<{
    arrivals: StayRecord[];
    inHouse: StayRecord[];
    departures: StayRecord[];
  }> {
    const businessDate = requireDate(input.businessDate, "businessDate");
    const columns = `id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
      FROM stay.stays`;
    const arrivals = await this.pool.query(
      `SELECT ${columns} WHERE (actual_arrival AT TIME ZONE 'UTC')::date = $1 ORDER BY actual_arrival`,
      [businessDate],
    );
    const inHouse = await this.pool.query(`SELECT ${columns} WHERE state = 'in-house' ORDER BY actual_arrival`);
    const departures = await this.pool.query(
      `SELECT ${columns} WHERE state = 'closed'
        AND (actual_departure AT TIME ZONE 'UTC')::date = $1 ORDER BY actual_departure`,
      [businessDate],
    );
    return {
      arrivals: arrivals.rows.map(PostgresStayStore.toStay),
      inHouse: inHouse.rows.map(PostgresStayStore.toStay),
      departures: departures.rows.map(PostgresStayStore.toStay),
    };
  }

  // claimOrFind persists a caller-supplied idempotency key before the
  // guarded write (node-module conventions): a replayed key returns
  // the original stay without writing a duplicate; otherwise the key
  // is claimed with a placeholder the writer fills with the stay id
  // after commit. Must run inside the caller's transaction.
  private async claimOrFind(client: PoolClient, key: string, fallbackRef: string): Promise<StayRecord | null> {
    const existing = await client.query(`SELECT result_ref FROM stay.idempotency_keys WHERE key = $1 FOR UPDATE`, [
      key,
    ]);
    if (existing.rows.length > 0) {
      const ref = existing.rows[0].result_ref as string;
      const original = await client.query(
        `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
          FROM stay.stays WHERE id = $1`,
        [ref],
      );
      return original.rows.length === 0 ? null : PostgresStayStore.toStay(original.rows[0]);
    }
    try {
      await client.query(
        `INSERT INTO stay.idempotency_keys (key, operation, result_ref) VALUES ($1, $2, $3)`,
        [key, key.split(":")[0] ?? "CheckOut", fallbackRef],
      );
    } catch (err) {
      if ((err as { code?: string }).code !== "23505") {
        throw err;
      }
      const winner = await client.query(
        `SELECT result_ref FROM stay.idempotency_keys WHERE key = $1 FOR UPDATE`,
        [key],
      );
      if (winner.rows.length === 0) {
        return null;
      }
      const original = await client.query(
        `SELECT id, reservation_id, guest_id, current_room_id, state, actual_arrival, actual_departure
          FROM stay.stays WHERE id = $1`,
        [winner.rows[0].result_ref as string],
      );
      return original.rows.length === 0 ? null : PostgresStayStore.toStay(original.rows[0]);
    }
    return null;
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
