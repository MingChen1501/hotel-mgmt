import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";

// In-memory GuestService store (LLD section 5). One record per
// guest with stay history links, preferences visible at booking time,
// and the returning flag with the past-stay count (FR-GST-1..3).
// Stay links are populated from StayEvents; the hotel-mandatory
// field set is enforced from cached Admin config (FR-CUS-1).
//
// Postgres persistence hardens in PostgresGuestStore (pgstore.ts),
// selected when DATABASE_URL is set (issue #149); both implement
// GuestStoreAPI with identical semantics.
export interface GuestRecord {
  id: string;
  fullName: string;
  contact: Record<string, unknown>;
  preferences: Record<string, unknown>;
  notes: string;
  returningFlag: boolean;
  pastStayCount: number;
}

export interface GuestStayLink {
  guestId: string;
  stayId: string;
  linkedAt: string;
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

export interface UpsertGuestInput {
  guestId?: unknown;
  fullName?: unknown;
  contact?: unknown;
  preferences?: unknown;
  notes?: unknown;
  actor?: unknown;
}

export interface IdentifyGuestInput {
  guestId?: unknown;
  fullName?: unknown;
}

export interface GetBookingContextInput {
  guestId?: unknown;
}

// GuestStoreAPI is the contract both the in-memory store and the
// Postgres store implement (issue #149).
export interface GuestStoreAPI {
  upsertGuest(input: UpsertGuestInput): Promise<GuestRecord>;
  identifyGuest(input: IdentifyGuestInput): Promise<GuestRecord & { stayLinks: GuestStayLink[] }>;
  getBookingContext(input: GetBookingContextInput): Promise<{
    guestId: string;
    fullName: string;
    preferences: Record<string, unknown>;
    notes: string;
  }>;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

export class GuestStore implements GuestStoreAPI {
  private readonly guests = new Map<string, GuestRecord>();
  private readonly links: GuestStayLink[] = [];
  private readonly outbox: { aggregate: string; eventType: string; payload: Record<string, unknown> }[] = [];

  async upsertGuest(input: UpsertGuestInput): Promise<GuestRecord> {
    const id =
      input.guestId === undefined || input.guestId === null || input.guestId === ""
        ? randomUUID()
        : requireUuid(input.guestId, "guestId");
    const fullName = requireString(input.fullName, "fullName");
    const actor = requireString(input.actor, "actor");
    const existing = this.guests.get(id);
    const record: GuestRecord = {
      id,
      fullName,
      contact: asObject(input.contact),
      preferences: input.preferences === undefined ? (existing?.preferences ?? {}) : asObject(input.preferences),
      notes: typeof input.notes === "string" ? input.notes : (existing?.notes ?? ""),
      returningFlag: existing?.returningFlag ?? false,
      pastStayCount: existing?.pastStayCount ?? 0,
    };
    this.guests.set(id, record);
    this.outbox.push({ aggregate: "guest", eventType: "guest-upserted", payload: { guestId: id, fullName, actor } });
    return record;
  }

  async identifyGuest(input: IdentifyGuestInput): Promise<GuestRecord & { stayLinks: GuestStayLink[] }> {
    const record = this.findGuest(input);
    return { ...record, stayLinks: this.links.filter((link) => link.guestId === record.id) };
  }

  async getBookingContext(input: GetBookingContextInput): Promise<{
    guestId: string;
    fullName: string;
    preferences: Record<string, unknown>;
    notes: string;
  }> {
    const record = this.findGuest({ guestId: input.guestId });
    return { guestId: record.id, fullName: record.fullName, preferences: record.preferences, notes: record.notes };
  }

  private findGuest(input: { guestId?: unknown; fullName?: unknown }): GuestRecord {
    if (typeof input.guestId === "string" && input.guestId !== "") {
      const record = this.guests.get(requireUuid(input.guestId, "guestId"));
      if (!record) {
        throw new HttpError("NOT_FOUND", `Unknown guest ${input.guestId}.`, { guestId: input.guestId });
      }
      return record;
    }
    if (typeof input.fullName === "string" && input.fullName.trim() !== "") {
      const wanted = input.fullName.trim();
      for (const record of this.guests.values()) {
        if (record.fullName === wanted) {
          return record;
        }
      }
      throw new HttpError("NOT_FOUND", `Unknown guest ${wanted}.`, { fullName: wanted });
    }
    throw new HttpError("VALIDATION_FAILED", "guestId or fullName is required.", { field: "guestId" });
  }
}
