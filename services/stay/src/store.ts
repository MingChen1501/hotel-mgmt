import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";

// In-memory StayService store (LLD section 2). Check-in records one
// in-house occupation after the desk loop assigns the room through
// the Rooms-schema atomic write (LLD section 3); the stay row is
// inserted only after the assignment receipt returns (NFR-CON-2).
// Reservation, guest, and room links are logical references: modules
// never read another schema (schema.md).
//
// Postgres persistence hardens in PostgresStayStore (pgstore.ts),
// selected when DATABASE_URL is set (issue #149); both implement
// StayStoreAPI with identical semantics.
export type StayState = "in-house" | "closed";

export const STAY_STATES: StayState[] = ["in-house", "closed"];

export interface StayRecord {
  id: string;
  reservationId: string;
  guestId: string;
  currentRoomId: string;
  state: StayState;
  actualArrival: string | null;
  actualDeparture: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new HttpError("VALIDATION_FAILED", `${field} must be a UUID.`, { field });
  }
  return value;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", `${field} is required.`, { field });
  }
  return value.trim();
}

export function optionalTimestamp(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new HttpError("VALIDATION_FAILED", `${field} must be an ISO-8601 timestamp.`, { field });
  }
  return new Date(value).toISOString();
}

export interface CheckInInput {
  stayId?: unknown;
  reservationId?: unknown;
  guestId?: unknown;
  roomId?: unknown;
  actualArrival?: unknown;
  actor?: unknown;
}

export interface GetStayInput {
  stayId?: unknown;
  reservationId?: unknown;
}

export interface QueryStaysInput {
  state?: unknown;
}

// StayStoreAPI is the contract both the in-memory store and the
// Postgres store implement (issue #149).
export interface StayStoreAPI {
  checkIn(input: CheckInInput): Promise<StayRecord>;
  getStay(input: GetStayInput): Promise<StayRecord>;
  queryStays(input: QueryStaysInput): Promise<StayRecord[]>;
}

export class StayStore implements StayStoreAPI {
  private readonly stays = new Map<string, StayRecord>();
  private readonly staysByReservation = new Map<string, StayRecord>();
  private readonly outbox: { aggregate: string; eventType: string; payload: Record<string, unknown> }[] = [];

  async checkIn(input: CheckInInput): Promise<StayRecord> {
    const id = input.stayId === undefined || input.stayId === null || input.stayId === "" ? randomUUID() : requireUuid(input.stayId, "stayId");
    const reservationId = requireUuid(input.reservationId, "reservationId");
    const guestId = requireUuid(input.guestId, "guestId");
    const currentRoomId = requireUuid(input.roomId, "roomId");
    const actualArrival = optionalTimestamp(input.actualArrival, "actualArrival") ?? new Date().toISOString();
    const actor = requireString(input.actor, "actor");
    if (this.staysByReservation.has(reservationId)) {
      throw new HttpError("CONFLICT", "Reservation is already checked in.", {
        reservationId,
        stayId: (this.staysByReservation.get(reservationId) as StayRecord).id,
      });
    }
    if (this.stays.has(id)) {
      return this.stays.get(id) as StayRecord;
    }
    const record: StayRecord = {
      id,
      reservationId,
      guestId,
      currentRoomId,
      state: "in-house",
      actualArrival,
      actualDeparture: null,
    };
    this.stays.set(id, record);
    this.staysByReservation.set(reservationId, record);
    this.outbox.push({
      aggregate: "stay",
      eventType: "checked-in",
      payload: { stayId: id, reservationId, roomId: currentRoomId, actor },
    });
    return record;
  }

  async getStay(input: GetStayInput): Promise<StayRecord> {
    if (typeof input.stayId === "string" && input.stayId !== "") {
      const record = this.stays.get(requireUuid(input.stayId, "stayId"));
      if (!record) {
        throw new HttpError("NOT_FOUND", `Unknown stay ${input.stayId}.`, { stayId: input.stayId });
      }
      return record;
    }
    if (typeof input.reservationId === "string" && input.reservationId !== "") {
      const record = this.staysByReservation.get(requireUuid(input.reservationId, "reservationId"));
      if (!record) {
        throw new HttpError("NOT_FOUND", `No stay for reservation ${input.reservationId}.`, {
          reservationId: input.reservationId,
        });
      }
      return record;
    }
    throw new HttpError("VALIDATION_FAILED", "stayId or reservationId is required.", { field: "stayId" });
  }

  async queryStays(input: QueryStaysInput): Promise<StayRecord[]> {
    if (input.state !== undefined) {
      if (typeof input.state !== "string" || !STAY_STATES.includes(input.state as StayState)) {
        throw new HttpError("VALIDATION_FAILED", "Unknown stay state.", { state: input.state });
      }
      return [...this.stays.values()].filter((stay) => stay.state === input.state);
    }
    return [...this.stays.values()];
  }
}
