import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import { msg } from "./messages.js";

// In-memory RoomInventoryService store (LLD section 3). The guard
// shapes mirror the SQL transactions from the schema migration: the
// AssignRoom check-and-set is atomic (single synchronous section, no
// await between the read and the write), and every state change
// appends a history row plus an outbox event.
//
// Postgres persistence hardens in PostgresRoomStore (pgstore.ts),
// selected when DATABASE_URL is set (issue #149); both implement
// RoomStoreAPI with identical semantics. The AssignRoom idempotency
// receipts stay in memory by design: the schema carries no receipt
// table (schema.md section 3), and the NFR-CON-2 exactly-once guard
// itself is the conditional atomic write, which is fully persisted.
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
export const ALLOWED_TRANSITIONS: Record<RoomState, RoomState[]> = {
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

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new HttpError("VALIDATION_FAILED", msg("rooms.validation.date_format", { field }), { field });
  }
  return value;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field }), { field });
  }
  return value.trim();
}

export function rangesOverlap(fromA: string, toA: string, fromB: string, toB: string): boolean {
  return fromA <= toB && toA >= fromB;
}

export interface UpsertRoomTypeInput {
  name?: unknown;
  capacity?: unknown;
  bedType?: unknown;
  features?: unknown;
  actor?: unknown;
}

export interface UpsertRoomInput {
  number?: unknown;
  roomType?: unknown;
  floor?: unknown;
  bedType?: unknown;
  capacity?: unknown;
  features?: unknown;
  actor?: unknown;
}

export interface UpdateRoomStateInput {
  roomNumber?: unknown;
  newState?: unknown;
  actor?: unknown;
}

export interface CheckSellabilityInput {
  roomType?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  roomNumber?: unknown;
}

export interface AssignRoomInput {
  roomNumber?: unknown;
  businessDate?: unknown;
  stayLink?: unknown;
  idempotencyKey?: unknown;
  actor?: unknown;
}

export interface ReleaseRoomInput {
  roomNumber?: unknown;
  toState?: unknown;
  actor?: unknown;
}

export interface BlockRoomInput {
  roomNumber?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  reason?: unknown;
  actor?: unknown;
}

export interface ReleaseBlockInput {
  roomNumber?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  actor?: unknown;
}

// RoomStoreAPI is the contract both the in-memory store and the
// Postgres store implement (issue #149).
export interface RoomStoreAPI {
  resolveRoomType(ref: unknown): Promise<RoomTypeRecord>;
  findRoom(number: unknown): Promise<RoomRecord>;
  upsertRoomType(input: UpsertRoomTypeInput): Promise<RoomTypeRecord>;
  upsertRoom(input: UpsertRoomInput): Promise<RoomRecord>;
  updateRoomState(input: UpdateRoomStateInput): Promise<{ roomNumber: string; oldState: RoomState; newState: RoomState }>;
  listRoomsByState(state: unknown): Promise<RoomRecord[]>;
  listRoomTypes(): Promise<RoomTypeRecord[]>;
  checkSellability(input: CheckSellabilityInput): Promise<{
    roomTypeId: string;
    dateFrom: string;
    dateTo: string;
    totalCount: number;
    sellableCount: number;
    blockedRooms: string[];
  }>;
  assignRoom(input: AssignRoomInput): Promise<{ roomId: string; roomNumber: string; stayLink: string; state: RoomState }>;
  releaseRoom(input: ReleaseRoomInput): Promise<{ roomNumber: string; oldState: RoomState; newState: RoomState }>;
  blockRoom(input: BlockRoomInput): Promise<{ roomNumber: string; dateFrom: string; dateTo: string; reason: string }>;
  releaseBlock(input: ReleaseBlockInput): Promise<{ roomNumber: string; dateFrom: string; dateTo: string; reason: string }>;
  historyForRoomId(roomId: string): Promise<StateHistoryEntry[]>;
}

export class RoomStore implements RoomStoreAPI {
  private readonly roomTypes = new Map<string, RoomTypeRecord>();
  private readonly roomTypesByName = new Map<string, RoomTypeRecord>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly blocks: RoomBlockRecord[] = [];
  private readonly history: StateHistoryEntry[] = [];
  private readonly outbox: OutboxEvent[] = [];
  private readonly idempotency = new Map<string, { roomId: string; roomNumber: string; stayLink: string; state: RoomState }>();

  async resolveRoomType(ref: unknown): Promise<RoomTypeRecord> {
    const key = requireString(ref, "roomType");
    const found = this.roomTypes.get(key) ?? this.roomTypesByName.get(key);
    if (!found) {
      throw new HttpError("NOT_FOUND", msg("rooms.notfound.room_type", { roomType: key }), { roomType: key });
    }
    return found;
  }

  async findRoom(number: unknown): Promise<RoomRecord> {
    const key = requireString(number, "roomNumber");
    const room = this.rooms.get(key);
    if (!room) {
      throw new HttpError("NOT_FOUND", msg("rooms.notfound.room", { roomNumber: key }), { roomNumber: key });
    }
    return room;
  }

  async upsertRoomType(input: UpsertRoomTypeInput): Promise<RoomTypeRecord> {
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

  async upsertRoom(input: UpsertRoomInput): Promise<RoomRecord> {
    const number = requireString(input.number, "number");
    const actor = requireString(input.actor, "actor");
    const roomType = await this.resolveRoomType(input.roomType);
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

  async updateRoomState(input: UpdateRoomStateInput): Promise<{
    roomNumber: string;
    oldState: RoomState;
    newState: RoomState;
  }> {
    const room = await this.findRoom(input.roomNumber);
    const actor = requireString(input.actor, "actor");
    if (typeof input.newState !== "string" || !ROOM_STATES.includes(input.newState as RoomState)) {
      throw new HttpError("VALIDATION_FAILED", msg("rooms.validation.unknown_state", {}), { newState: input.newState });
    }
    const newState = input.newState as RoomState;
    if (room.state === newState) {
      return { roomNumber: room.number, oldState: room.state, newState };
    }
    if (!ALLOWED_TRANSITIONS[room.state].includes(newState)) {
      throw new HttpError(
        "STATE_ILLEGAL",
        msg("rooms.state.illegal_transition", { roomNumber: room.number, oldState: room.state, newState }),
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

  async listRoomsByState(state: unknown): Promise<RoomRecord[]> {
    if (typeof state !== "string" || !ROOM_STATES.includes(state as RoomState)) {
      throw new HttpError("VALIDATION_FAILED", msg("rooms.validation.unknown_state", {}), { state });
    }
    return [...this.rooms.values()].filter((room) => room.state === state);
  }

  async listRoomTypes(): Promise<RoomTypeRecord[]> {
    // Name order keeps the desk picker stable (issue #372).
    return [...this.roomTypes.values()].sort((a, b) => a.name.localeCompare(b.name));
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
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.date_range_order", {}), { dateFrom, dateTo });
    }
    if (input.roomNumber !== undefined) {
      const room = await this.findRoom(input.roomNumber);
      const block = this.blocks.find(
        (entry) => entry.roomId === room.id && rangesOverlap(entry.dateFrom, entry.dateTo, dateFrom, dateTo),
      );
      if (block) {
        throw new HttpError("STATE_ILLEGAL", msg("rooms.state.room_blocked", { roomNumber: room.number }), {
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
  async assignRoom(input: AssignRoomInput): Promise<{ roomId: string; roomNumber: string; stayLink: string; state: RoomState }> {
    if (typeof input.idempotencyKey === "string" && input.idempotencyKey !== "") {
      const replay = this.idempotency.get(input.idempotencyKey);
      if (replay) {
        return replay;
      }
    }
    const room = await this.findRoom(input.roomNumber);
    const businessDate = requireDate(input.businessDate, "businessDate");
    const stayLink = requireString(input.stayLink, "stayLink");
    const actor = requireString(input.actor, "actor");
    const block = this.blocks.find(
      (entry) =>
        entry.roomId === room.id && entry.dateFrom <= businessDate && entry.dateTo >= businessDate,
    );
    if (block) {
      throw new HttpError("STATE_ILLEGAL", msg("rooms.state.room_blocked_on", { roomNumber: room.number, businessDate }), {
        roomNumber: room.number,
        dateFrom: block.dateFrom,
        dateTo: block.dateTo,
        reason: block.reason,
      });
    }
    if (room.state === "occupied") {
      throw new HttpError("CONFLICT", msg("rooms.conflict.room_taken", { roomNumber: room.number }), { roomNumber: room.number });
    }
    if (room.state !== "vacant-inspected") {
      throw new HttpError("STATE_ILLEGAL", msg("rooms.state.room_not_ready", { roomNumber: room.number, state: room.state }), {
        roomNumber: room.number,
        state: room.state,
      });
    }
    room.state = "occupied";
    this.recordHistory(room.id, "vacant-inspected", "occupied", actor);
    this.emit("room", "state-changed", { roomNumber: room.number, stayLink, actor }, actor);
    const receipt = { roomId: room.id, roomNumber: room.number, stayLink, state: room.state };
    if (typeof input.idempotencyKey === "string" && input.idempotencyKey !== "") {
      this.idempotency.set(input.idempotencyKey, receipt);
    }
    return receipt;
  }

  async releaseRoom(input: ReleaseRoomInput): Promise<{
    roomNumber: string;
    oldState: RoomState;
    newState: RoomState;
  }> {
    const room = await this.findRoom(input.roomNumber);
    const actor = requireString(input.actor, "actor");
    if (room.state !== "occupied") {
      throw new HttpError("STATE_ILLEGAL", msg("rooms.state.room_not_occupied", { roomNumber: room.number, state: room.state }), {
        roomNumber: room.number,
        state: room.state,
      });
    }
    const toState: RoomState =
      typeof input.toState === "string" && ROOM_STATES.includes(input.toState as RoomState)
        ? (input.toState as RoomState)
        : "vacant-dirty";
    if (toState === "occupied") {
      throw new HttpError("VALIDATION_FAILED", msg("rooms.validation.release_occupied", {}), { toState });
    }
    room.state = toState;
    this.recordHistory(room.id, "occupied", toState, actor);
    this.emit("room", "state-changed", { roomNumber: room.number, newState: toState, actor }, actor);
    return { roomNumber: room.number, oldState: "occupied", newState: toState };
  }

  async blockRoom(input: BlockRoomInput): Promise<{ roomNumber: string; dateFrom: string; dateTo: string; reason: string }> {
    const room = await this.findRoom(input.roomNumber);
    const dateFrom = requireDate(input.dateFrom, "dateFrom");
    const dateTo = requireDate(input.dateTo, "dateTo");
    const reason = requireString(input.reason, "reason");
    const actor = requireString(input.actor, "actor");
    if (dateTo < dateFrom) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.date_range_order", {}), { dateFrom, dateTo });
    }
    if (room.state === "occupied") {
      throw new HttpError("STATE_ILLEGAL", msg("rooms.state.room_occupied", { roomNumber: room.number }), {
        roomNumber: room.number,
      });
    }
    const duplicate = this.blocks.some(
      (entry) =>
        entry.roomId === room.id && entry.dateFrom === dateFrom && entry.dateTo === dateTo && entry.reason === reason,
    );
    if (duplicate) {
      throw new HttpError("VALIDATION_FAILED", msg("rooms.validation.duplicate_block", {}), {
        roomNumber: room.number,
        dateFrom,
        dateTo,
      });
    }
    this.blocks.push({ roomId: room.id, dateFrom, dateTo, reason, createdBy: actor });
    this.emit("room", "blocked", { roomNumber: room.number, dateFrom, dateTo, reason, actor }, actor);
    return { roomNumber: room.number, dateFrom, dateTo, reason };
  }

  // ReleaseBlock lifts the block covering exactly the requested
  // range (FR-RMS-3, BR-29). The match is exact so a partial release
  // never silently lifts a wider block; releasing part of a range is
  // release-then-re-block of the remainder. Releasing a range with
  // no covering block is refused without changing anything.
  async releaseBlock(input: ReleaseBlockInput): Promise<{
    roomNumber: string;
    dateFrom: string;
    dateTo: string;
    reason: string;
  }> {
    const room = await this.findRoom(input.roomNumber);
    const dateFrom = requireDate(input.dateFrom, "dateFrom");
    const dateTo = requireDate(input.dateTo, "dateTo");
    const actor = requireString(input.actor, "actor");
    if (dateTo < dateFrom) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.date_range_order", {}), { dateFrom, dateTo });
    }
    const index = this.blocks.findIndex(
      (entry) => entry.roomId === room.id && entry.dateFrom === dateFrom && entry.dateTo === dateTo,
    );
    if (index === -1) {
      throw new HttpError(
        "STATE_ILLEGAL",
        msg("rooms.state.no_covering_block", { roomNumber: room.number, dateFrom, dateTo }),
        { roomNumber: room.number, dateFrom, dateTo },
      );
    }
    const [released] = this.blocks.splice(index, 1);
    const reason = released?.reason ?? "";
    this.emit(
      "room",
      "block-released",
      { roomNumber: room.number, dateFrom, dateTo, reason, actor },
      actor,
    );
    return { roomNumber: room.number, dateFrom, dateTo, reason };
  }

  async historyForRoomId(roomId: string): Promise<StateHistoryEntry[]> {
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
