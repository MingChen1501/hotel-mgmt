import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";

// In-memory RoomInventoryService store (LLD section 3). The guard
// shapes mirror the SQL transactions from the schema migration: the
// AssignRoom check-and-set is atomic (single synchronous section, no
// await between the read and the write), and every state change
// appends a history row plus an outbox event. Postgres persistence
// of these rows hardens in a later slice; the semantics stay the same.
export type RoomState =
  | "occupied"
  | "vacant-dirty"
  | "vacant-clean"
  | "vacant-inspected"
  | "out-of-order";

export const ROOM_STATES: RoomState[] = [
  "occupied",
  "vacant-dirty",
  "vacant-clean",
  "vacant-inspected",
  "out-of-order",
];

// Housekeeping order (BR-28): dirty -> clean -> inspected. Occupied
// rooms only release to dirty; out-of-order rooms re-enter via dirty.
const ALLOWED_TRANSITIONS: Record<RoomState, RoomState[]> = {
  "vacant-dirty": ["vacant-clean", "out-of-order"],
  "vacant-clean": ["vacant-inspected", "vacant-dirty", "out-of-order"],
  "vacant-inspected": ["occupied", "vacant-dirty", "out-of-order"],
  occupied: ["vacant-dirty"],
  "out-of-order": ["vacant-dirty"],
};

export interface RoomTypeRecord {
  id: string;
  name: string;
  capacity: number | null;
  bedType: string | null;
  features: Record<string, unknown>;
}

export interface RoomRecord {
  id: string;
  number: string;
  roomTypeId: string;
  floor: string | null;
  bedType: string | null;
  capacity: number | null;
  features: Record<string, unknown>;
  state: RoomState;
}

export interface RoomBlockRecord {
  roomId: string;
  dateFrom: string;
  dateTo: string;
  reason: string;
  createdBy: string;
}

export interface StateHistoryEntry {
  roomId: string;
  oldState: RoomState;
  newState: RoomState;
  createdBy: string;
  createdAt: string;
}

export interface OutboxEvent {
  aggregate: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdBy: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new HttpError("VALIDATION_FAILED", `${field} must be a YYYY-MM-DD date.`, { field });
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", `${field} is required.`, { field });
  }
  return value.trim();
}

function rangesOverlap(fromA: string, toA: string, fromB: string, toB: string): boolean {
  return fromA <= toB && toA >= fromB;
}

export class RoomStore {
  private readonly roomTypes = new Map<string, RoomTypeRecord>();
  private readonly roomTypesByName = new Map<string, RoomTypeRecord>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly blocks: RoomBlockRecord[] = [];
  private readonly history: StateHistoryEntry[] = [];
  private readonly outbox: OutboxEvent[] = [];
  private readonly idempotency = new Map<string, { roomNumber: string; stayLink: string; state: RoomState }>();

  resolveRoomType(ref: unknown): RoomTypeRecord {
    const key = requireString(ref, "roomType");
    const found = this.roomTypes.get(key) ?? this.roomTypesByName.get(key);
    if (!found) {
      throw new HttpError("NOT_FOUND", `Unknown room type ${key}.`, { roomType: key });
    }
    return found;
  }

  findRoom(number: unknown): RoomRecord {
    const key = requireString(number, "roomNumber");
    const room = this.rooms.get(key);
    if (!room) {
      throw new HttpError("NOT_FOUND", `Unknown room ${key}.`, { roomNumber: key });
    }
    return room;
  }

  upsertRoomType(input: {
    name?: unknown;
    capacity?: unknown;
    bedType?: unknown;
    features?: unknown;
    actor?: unknown;
  }): RoomTypeRecord {
    const name = requireString(input.name, "name");
    const actor = requireString(input.actor, "actor");
    const existing = this.roomTypesByName.get(name);
    const record: RoomTypeRecord = {
      id: existing?.id ?? randomUUID(),
      name,
      capacity: typeof input.capacity === "number" ? input.capacity : (existing?.capacity ?? null),
      bedType: typeof input.bedType === "string" ? input.bedType : (existing?.bedType ?? null),
      features:
        typeof input.features === "object" && input.features !== null
          ? (input.features as Record<string, unknown>)
          : (existing?.features ?? {}),
    };
    this.roomTypes.set(record.id, record);
    this.roomTypesByName.set(name, record);
    this.emit("room-type", "room-upserted", { roomTypeId: record.id, name, actor }, actor);
    return record;
  }

  upsertRoom(input: {
    number?: unknown;
    roomType?: unknown;
    floor?: unknown;
    bedType?: unknown;
    capacity?: unknown;
    features?: unknown;
    actor?: unknown;
  }): RoomRecord {
    const number = requireString(input.number, "number");
    const actor = requireString(input.actor, "actor");
    const roomType = this.resolveRoomType(input.roomType);
    const existing = this.rooms.get(number);
    const record: RoomRecord = {
      id: existing?.id ?? randomUUID(),
      number,
      roomTypeId: roomType.id,
      floor: typeof input.floor === "string" ? input.floor : (existing?.floor ?? null),
      bedType: typeof input.bedType === "string" ? input.bedType : (existing?.bedType ?? null),
      capacity: typeof input.capacity === "number" ? input.capacity : (existing?.capacity ?? null),
      features:
        typeof input.features === "object" && input.features !== null
          ? (input.features as Record<string, unknown>)
          : (existing?.features ?? {}),
      // New rooms start vacant-inspected so the desk loop can book
      // and assign them without a prior housekeeping pass.
      state: existing?.state ?? "vacant-inspected",
    };
    this.rooms.set(number, record);
    this.emit("room", "room-upserted", { roomNumber: number, roomTypeId: roomType.id }, actor);
    return record;
  }

  updateRoomState(input: { roomNumber?: unknown; newState?: unknown; actor?: unknown }): {
    roomNumber: string;
    oldState: RoomState;
    newState: RoomState;
  } {
    const room = this.findRoom(input.roomNumber);
    const actor = requireString(input.actor, "actor");
    if (typeof input.newState !== "string" || !ROOM_STATES.includes(input.newState as RoomState)) {
      throw new HttpError("VALIDATION_FAILED", "Unknown state value.", { newState: input.newState });
    }
    const newState = input.newState as RoomState;
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
    const oldState = room.state;
    room.state = newState;
    this.recordHistory(room.id, oldState, newState, actor);
    this.emit(
      "room",
      "state-changed",
      { roomNumber: room.number, oldState, newState, actor },
      actor,
    );
    return { roomNumber: room.number, oldState, newState };
  }

  listRoomsByState(state: unknown): RoomRecord[] {
    if (typeof state !== "string" || !ROOM_STATES.includes(state as RoomState)) {
      throw new HttpError("VALIDATION_FAILED", "Unknown state value.", { state });
    }
    return [...this.rooms.values()].filter((room) => room.state === state);
  }

  checkSellability(input: {
    roomType?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    roomNumber?: unknown;
  }): {
    roomTypeId: string;
    dateFrom: string;
    dateTo: string;
    totalCount: number;
    sellableCount: number;
    blockedRooms: string[];
  } {
    const roomType = this.resolveRoomType(input.roomType);
    const dateFrom = requireDate(input.dateFrom, "dateFrom");
    const dateTo = requireDate(input.dateTo, "dateTo");
    if (dateTo < dateFrom) {
      throw new HttpError("VALIDATION_FAILED", "dateTo is before dateFrom.", { dateFrom, dateTo });
    }
    if (input.roomNumber !== undefined) {
      const room = this.findRoom(input.roomNumber);
      const block = this.blocks.find(
        (entry) => entry.roomId === room.id && rangesOverlap(entry.dateFrom, entry.dateTo, dateFrom, dateTo),
      );
      if (block) {
        throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is blocked for the requested dates.`, {
          roomNumber: room.number,
          dateFrom: block.dateFrom,
          dateTo: block.dateTo,
          reason: block.reason,
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
    const ofType = [...this.rooms.values()].filter((room) => room.roomTypeId === roomType.id);
    const blockedRooms = ofType
      .filter((room) =>
        this.blocks.some(
          (entry) => entry.roomId === room.id && rangesOverlap(entry.dateFrom, entry.dateTo, dateFrom, dateTo),
        ),
      )
      .map((room) => room.number);
    return {
      roomTypeId: roomType.id,
      dateFrom,
      dateTo,
      totalCount: ofType.length,
      sellableCount: ofType.length - blockedRooms.length,
      blockedRooms,
    };
  }

  // Atomic conditional write (NFR-CON-2): the room flips to occupied
  // only when it is currently vacant-inspected with no covering
  // block. The read and the write share one synchronous section, so
  // two simultaneous assignments cannot both succeed.
  assignRoom(input: {
    roomNumber?: unknown;
    businessDate?: unknown;
    stayLink?: unknown;
    idempotencyKey?: unknown;
    actor?: unknown;
  }): { roomNumber: string; stayLink: string; state: RoomState } {
    if (typeof input.idempotencyKey === "string" && input.idempotencyKey !== "") {
      const replay = this.idempotency.get(input.idempotencyKey);
      if (replay) {
        return replay;
      }
    }
    const room = this.findRoom(input.roomNumber);
    const businessDate = requireDate(input.businessDate, "businessDate");
    const stayLink = requireString(input.stayLink, "stayLink");
    const actor = requireString(input.actor, "actor");
    const block = this.blocks.find(
      (entry) =>
        entry.roomId === room.id && entry.dateFrom <= businessDate && entry.dateTo >= businessDate,
    );
    if (block) {
      throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is blocked on ${businessDate}.`, {
        roomNumber: room.number,
        dateFrom: block.dateFrom,
        dateTo: block.dateTo,
        reason: block.reason,
      });
    }
    if (room.state === "occupied") {
      throw new HttpError("CONFLICT", `Room ${room.number} was just taken.`, { roomNumber: room.number });
    }
    if (room.state !== "vacant-inspected") {
      throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is ${room.state}, not ready.`, {
        roomNumber: room.number,
        state: room.state,
      });
    }
    room.state = "occupied";
    this.recordHistory(room.id, "vacant-inspected", "occupied", actor);
    this.emit("room", "state-changed", { roomNumber: room.number, stayLink, actor }, actor);
    const receipt = { roomNumber: room.number, stayLink, state: room.state };
    if (typeof input.idempotencyKey === "string" && input.idempotencyKey !== "") {
      this.idempotency.set(input.idempotencyKey, receipt);
    }
    return receipt;
  }

  releaseRoom(input: { roomNumber?: unknown; toState?: unknown; actor?: unknown }): {
    roomNumber: string;
    oldState: RoomState;
    newState: RoomState;
  } {
    const room = this.findRoom(input.roomNumber);
    const actor = requireString(input.actor, "actor");
    if (room.state !== "occupied") {
      throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is ${room.state}, not occupied.`, {
        roomNumber: room.number,
        state: room.state,
      });
    }
    const toState: RoomState =
      typeof input.toState === "string" && ROOM_STATES.includes(input.toState as RoomState)
        ? (input.toState as RoomState)
        : "vacant-dirty";
    if (toState === "occupied") {
      throw new HttpError("VALIDATION_FAILED", "Release target cannot be occupied.", { toState });
    }
    room.state = toState;
    this.recordHistory(room.id, "occupied", toState, actor);
    this.emit("room", "state-changed", { roomNumber: room.number, newState: toState, actor }, actor);
    return { roomNumber: room.number, oldState: "occupied", newState: toState };
  }

  blockRoom(input: {
    roomNumber?: unknown;
    dateFrom?: unknown;
    dateTo?: unknown;
    reason?: unknown;
    actor?: unknown;
  }): { roomNumber: string; dateFrom: string; dateTo: string; reason: string } {
    const room = this.findRoom(input.roomNumber);
    const dateFrom = requireDate(input.dateFrom, "dateFrom");
    const dateTo = requireDate(input.dateTo, "dateTo");
    const reason = requireString(input.reason, "reason");
    const actor = requireString(input.actor, "actor");
    if (dateTo < dateFrom) {
      throw new HttpError("VALIDATION_FAILED", "dateTo is before dateFrom.", { dateFrom, dateTo });
    }
    if (room.state === "occupied") {
      throw new HttpError("STATE_ILLEGAL", `Room ${room.number} is occupied and cannot be blocked.`, {
        roomNumber: room.number,
      });
    }
    const duplicate = this.blocks.some(
      (entry) =>
        entry.roomId === room.id && entry.dateFrom === dateFrom && entry.dateTo === dateTo && entry.reason === reason,
    );
    if (duplicate) {
      throw new HttpError("VALIDATION_FAILED", "Identical block already exists.", {
        roomNumber: room.number,
        dateFrom,
        dateTo,
      });
    }
    this.blocks.push({ roomId: room.id, dateFrom, dateTo, reason, createdBy: actor });
    this.emit("room", "blocked", { roomNumber: room.number, dateFrom, dateTo, reason, actor }, actor);
    return { roomNumber: room.number, dateFrom, dateTo, reason };
  }

  historyForRoomId(roomId: string): StateHistoryEntry[] {
    return this.history.filter((entry) => entry.roomId === roomId);
  }

  private recordHistory(roomId: string, oldState: RoomState, newState: RoomState, createdBy: string): void {
    this.history.push({ roomId, oldState, newState, createdBy, createdAt: new Date().toISOString() });
  }

  private emit(aggregate: string, eventType: string, payload: Record<string, unknown>, createdBy: string): void {
    this.outbox.push({
      aggregate,
      eventType,
      payload,
      occurredAt: new Date().toISOString(),
      createdBy,
    });
  }
}
