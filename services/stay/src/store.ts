import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import { msg } from "./messages.js";

// In-memory StayService store (LLD section 2). Check-in records one
// in-house occupation after the desk loop assigns the room through
// the Rooms-schema atomic write (LLD section 3); the stay row is
// inserted only after the assignment receipt returns (NFR-CON-2).
// Check-out closes the stay only from the in-house state through a
// conditional transition guarded by the folio gate (BR-17, FR-BIL-7):
// the desk passes the reviewed folio balance plus any recorded
// approval in the request (the same desk-orchestration shape as
// Reservations.CreateReservation carrying its sellableUnits input),
// and Stay refuses with SETTLEMENT_REQUIRED unless the folio is
// settled or approved. Room moves keep the stay in-house with a
// history row; actual times are kept on the stay row.
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
    throw new HttpError("VALIDATION_FAILED", msg("error.validation.must_be_uuid", { field }), { field });
  }
  return value;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field }), { field });
  }
  return value.trim();
}

export function optionalTimestamp(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new HttpError("VALIDATION_FAILED", msg("stay.validation.timestamp_format", { field }), { field });
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

export interface CheckOutInput {
  stayId?: unknown;
  folioId?: unknown;
  folioBalanceMinor?: unknown;
  openBalanceApproval?: unknown;
  actualDeparture?: unknown;
  idempotencyKey?: unknown;
  actor?: unknown;
}

export interface MoveRoomInput {
  stayId?: unknown;
  toRoomId?: unknown;
  idempotencyKey?: unknown;
  actor?: unknown;
}

export interface RecordActualTimesInput {
  stayId?: unknown;
  actualArrival?: unknown;
  actualDeparture?: unknown;
  actor?: unknown;
}

export interface GetStayRefInput {
  stayId?: unknown;
}

export interface ListArrivalsDeparturesInput {
  businessDate?: unknown;
}

export interface MoveRecord {
  stayId: string;
  fromRoomId: string;
  toRoomId: string;
  movedAt: string;
}

export interface StayRef {
  stayId: string;
  guestId: string;
  roomId: string;
  state: StayState;
}

// StayStoreAPI is the contract both the in-memory store and the
// Postgres store implement (issue #149, extended by issue #150).
export interface StayStoreAPI {
  checkIn(input: CheckInInput): Promise<StayRecord>;
  getStay(input: GetStayInput): Promise<StayRecord>;
  queryStays(input: QueryStaysInput): Promise<StayRecord[]>;
  checkOut(input: CheckOutInput): Promise<{ stay: StayRecord; invoiceRef: string }>;
  moveRoom(input: MoveRoomInput): Promise<{ stay: StayRecord; move: MoveRecord }>;
  recordActualTimes(input: RecordActualTimesInput): Promise<StayRecord>;
  getStayRef(input: GetStayRefInput): Promise<StayRef>;
  listArrivalsDepartures(input: ListArrivalsDeparturesInput): Promise<{
    arrivals: StayRecord[];
    inHouse: StayRecord[];
    departures: StayRecord[];
  }>;
}

// The folio gate behind CheckOut (BR-17, FR-BIL-7): a settled folio
// (zero balance) passes; otherwise a recorded open-balance approval
// must travel with the request. Anything else is refused with
// SETTLEMENT_REQUIRED and the stay remains in house.
export function checkFolioGate(folioBalanceMinor: unknown, openBalanceApproval: unknown): void {
  if (!Number.isInteger(folioBalanceMinor)) {
    throw new HttpError("VALIDATION_FAILED", msg("stay.validation.folio_balance", {}), {
      field: "folioBalanceMinor",
    });
  }
  if (folioBalanceMinor !== 0 && (openBalanceApproval === undefined || openBalanceApproval === null)) {
    throw new HttpError("SETTLEMENT_REQUIRED", msg("stay.settlement.open_balance", {}), {
      folioBalanceMinor,
    });
  }
  if (
    openBalanceApproval !== undefined &&
    openBalanceApproval !== null &&
    (typeof openBalanceApproval !== "object" || Array.isArray(openBalanceApproval))
  ) {
    throw new HttpError("VALIDATION_FAILED", msg("stay.validation.approval_object", {}), {
      field: "openBalanceApproval",
    });
  }
}

export function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpError("VALIDATION_FAILED", msg("stay.validation.date_format", { field }), { field });
  }
  return value;
}

function dayOf(iso: string | null): string | null {
  return iso === null ? null : iso.slice(0, 10);
}

export class StayStore implements StayStoreAPI {
  private readonly stays = new Map<string, StayRecord>();
  private readonly staysByReservation = new Map<string, StayRecord>();
  private readonly moves: MoveRecord[] = [];
  private readonly idempotency = new Map<string, StayRecord>();
  private readonly outbox: { aggregate: string; eventType: string; payload: Record<string, unknown> }[] = [];

  async checkIn(input: CheckInInput): Promise<StayRecord> {
    const id = input.stayId === undefined || input.stayId === null || input.stayId === "" ? randomUUID() : requireUuid(input.stayId, "stayId");
    const reservationId = requireUuid(input.reservationId, "reservationId");
    const guestId = requireUuid(input.guestId, "guestId");
    const currentRoomId = requireUuid(input.roomId, "roomId");
    const actualArrival = optionalTimestamp(input.actualArrival, "actualArrival") ?? new Date().toISOString();
    const actor = requireString(input.actor, "actor");
    if (this.staysByReservation.has(reservationId)) {
      throw new HttpError("CONFLICT", msg("stay.conflict.already_checked_in", {}), {
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
        throw new HttpError("NOT_FOUND", msg("stay.notfound.stay", { stayId: input.stayId }), { stayId: input.stayId });
      }
      return record;
    }
    if (typeof input.reservationId === "string" && input.reservationId !== "") {
      const record = this.staysByReservation.get(requireUuid(input.reservationId, "reservationId"));
      if (!record) {
        throw new HttpError("NOT_FOUND", msg("stay.notfound.stay_for_reservation", { reservationId: input.reservationId }), {
          reservationId: input.reservationId,
        });
      }
      return record;
    }
    throw new HttpError("VALIDATION_FAILED", msg("stay.validation.stay_or_reservation", {}), { field: "stayId" });
  }

  async queryStays(input: QueryStaysInput): Promise<StayRecord[]> {
    if (input.state !== undefined) {
      if (typeof input.state !== "string" || !STAY_STATES.includes(input.state as StayState)) {
        throw new HttpError("VALIDATION_FAILED", msg("stay.validation.unknown_state", {}), { state: input.state });
      }
      return [...this.stays.values()].filter((stay) => stay.state === input.state);
    }
    return [...this.stays.values()];
  }

  // CheckOut closes an in-house stay after the folio gate (FR-FDK-2,
  // FR-BIL-7, BR-17/18). The transition is conditional on the
  // in-house state: paired simultaneous check-outs resolve exactly
  // one winner and the loser is refused with STATE_ILLEGAL, while a
  // replayed idempotencyKey returns the original close (NFR-CON-2).
  // The folio is presented as the final invoice, so the invoice
  // reference is the reviewed folio id (FR-BIL-4 presentation only).
  async checkOut(input: CheckOutInput): Promise<{ stay: StayRecord; invoiceRef: string }> {
    const id = requireUuid(input.stayId, "stayId");
    const invoiceRef = requireUuid(input.folioId, "folioId");
    checkFolioGate(input.folioBalanceMinor, input.openBalanceApproval);
    const actor = requireString(input.actor, "actor");
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (key !== "") {
      const replay = this.idempotency.get(`CheckOut:${key}`);
      if (replay !== undefined) {
        return { stay: replay, invoiceRef };
      }
    }
    const record = this.stays.get(id);
    if (!record) {
      throw new HttpError("NOT_FOUND", msg("stay.notfound.stay", { stayId: id }), { stayId: id });
    }
    if (record.state !== "in-house") {
      throw new HttpError("STATE_ILLEGAL", msg("stay.state.not_in_house", { stayId: id, state: record.state }), {
        stayId: id,
        state: record.state,
      });
    }
    record.state = "closed";
    record.actualDeparture = optionalTimestamp(input.actualDeparture, "actualDeparture") ?? new Date().toISOString();
    this.outbox.push({
      aggregate: "stay",
      eventType: "checked-out",
      payload: { stayId: id, folioId: invoiceRef, actor },
    });
    if (key !== "") {
      this.idempotency.set(`CheckOut:${key}`, record);
    }
    return { stay: record, invoiceRef };
  }

  // MoveRoom keeps the stay in-house on the new room and keeps the
  // move with both rooms and its time in the stay history (FR-FDK-3,
  // BR-19). The desk assigns the new room through AssignRoom and
  // releases the old room through ReleaseRoom around this call; the
  // stay-side write is conditional on the in-house state.
  async moveRoom(input: MoveRoomInput): Promise<{ stay: StayRecord; move: MoveRecord }> {
    const id = requireUuid(input.stayId, "stayId");
    const toRoomId = requireUuid(input.toRoomId, "toRoomId");
    const actor = requireString(input.actor, "actor");
    const key = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (key !== "") {
      const replay = this.idempotency.get(`MoveRoom:${key}`);
      if (replay !== undefined) {
        const move = this.moves.find((entry) => entry.stayId === id && entry.toRoomId === replay.currentRoomId);
        if (move !== undefined) {
          return { stay: replay, move };
        }
      }
    }
    const record = this.stays.get(id);
    if (!record) {
      throw new HttpError("NOT_FOUND", msg("stay.notfound.stay", { stayId: id }), { stayId: id });
    }
    if (record.state !== "in-house") {
      throw new HttpError("STATE_ILLEGAL", msg("stay.state.not_in_house", { stayId: id, state: record.state }), {
        stayId: id,
        state: record.state,
      });
    }
    if (record.currentRoomId === toRoomId) {
      throw new HttpError("VALIDATION_FAILED", msg("stay.validation.guest_in_room", {}), { toRoomId });
    }
    const move: MoveRecord = {
      stayId: id,
      fromRoomId: record.currentRoomId,
      toRoomId,
      movedAt: new Date().toISOString(),
    };
    record.currentRoomId = toRoomId;
    this.moves.push(move);
    this.outbox.push({
      aggregate: "stay",
      eventType: "moved",
      payload: { stayId: id, fromRoomId: move.fromRoomId, toRoomId, actor },
    });
    if (key !== "") {
      this.idempotency.set(`MoveRoom:${key}`, record);
    }
    return { stay: record, move };
  }

  // RecordActualTimes keeps off-hours arrival/departure times on the
  // stay (FR-FDK-4, BR-20). Implausible values — unparseable
  // timestamps or a departure before the arrival — are refused.
  async recordActualTimes(input: RecordActualTimesInput): Promise<StayRecord> {
    const id = requireUuid(input.stayId, "stayId");
    const actor = requireString(input.actor, "actor");
    const record = this.stays.get(id);
    if (!record) {
      throw new HttpError("NOT_FOUND", msg("stay.notfound.stay", { stayId: id }), { stayId: id });
    }
    const actualArrival = optionalTimestamp(input.actualArrival, "actualArrival") ?? record.actualArrival;
    const actualDeparture = optionalTimestamp(input.actualDeparture, "actualDeparture") ?? record.actualDeparture;
    if (actualArrival !== null && actualDeparture !== null && actualDeparture < actualArrival) {
      throw new HttpError("VALIDATION_FAILED", msg("stay.validation.departure_order", {}), {
        actualArrival,
        actualDeparture,
      });
    }
    record.actualArrival = actualArrival;
    record.actualDeparture = actualDeparture;
    this.outbox.push({
      aggregate: "stay",
      eventType: "actual-times-recorded",
      payload: { stayId: id, actualArrival, actualDeparture, actor },
    });
    return record;
  }

  // GetStayRef is the BIL -> STAY synchronous read (integration.md
  // C8): the stay link a folio belongs to, so charges, payments, and
  // the presented invoice attach to the right stay. Closed stays are
  // refused — no folio line may post against a closed stay (BR-18).
  async getStayRef(input: GetStayRefInput): Promise<StayRef> {
    const id = requireUuid(input.stayId, "stayId");
    const record = this.stays.get(id);
    if (!record) {
      throw new HttpError("NOT_FOUND", msg("stay.notfound.stay", { stayId: id }), { stayId: id });
    }
    if (record.state !== "in-house") {
      throw new HttpError("STATE_ILLEGAL", msg("stay.state.not_in_house", { stayId: id, state: record.state }), {
        stayId: id,
        state: record.state,
      });
    }
    return { stayId: record.id, guestId: record.guestId, roomId: record.currentRoomId, state: record.state };
  }

  // ListArrivalsDepartures serves the daily desk lists (FR-FDK-5):
  // arrivals are stays that arrived on the date, in-house stays are
  // listed once each, and departures are stays closed on the date.
  // Day boundaries compare on the UTC calendar day; the hotel-local
  // rendering rides on the config fan-out like the billing day-close.
  async listArrivalsDepartures(input: ListArrivalsDeparturesInput): Promise<{
    arrivals: StayRecord[];
    inHouse: StayRecord[];
    departures: StayRecord[];
  }> {
    const businessDate = requireDate(input.businessDate, "businessDate");
    const stays = [...this.stays.values()];
    return {
      arrivals: stays.filter((stay) => dayOf(stay.actualArrival) === businessDate),
      inHouse: stays.filter((stay) => stay.state === "in-house"),
      departures: stays.filter((stay) => stay.state === "closed" && dayOf(stay.actualDeparture) === businessDate),
    };
  }
}
