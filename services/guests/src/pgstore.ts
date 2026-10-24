import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import {
  requireString,
  requireUuid,
  type GetBookingContextInput,
  type GuestRecord,
  type GuestStayLink,
  type GuestStoreAPI,
  type IdentifyGuestInput,
  type UpsertGuestInput,
} from "./store.js";

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

// Postgres-backed GuestService store (issue #149). Implements
// GuestStoreAPI against the guests schema
// (docs/technical/schema.md section 5) with identical semantics to
// the in-memory store. Stay history links live in
// guest_stay_links; the returning flag and past-stay count derive
// from the linked stays.
export class PostgresGuestStore implements GuestStoreAPI {
  constructor(private readonly pool: Pool) {}

  private static toGuest(row: {
    id: string;
    full_name: string;
    contact: Record<string, unknown>;
    preferences: Record<string, unknown>;
    notes: string;
    returning_flag: boolean;
    past_stay_count: number;
  }): GuestRecord {
    return {
      id: row.id,
      fullName: row.full_name,
      contact: row.contact ?? {},
      preferences: row.preferences ?? {},
      notes: row.notes ?? "",
      returningFlag: row.returning_flag,
      pastStayCount: row.past_stay_count,
    };
  }

  async upsertGuest(input: UpsertGuestInput): Promise<GuestRecord> {
    const id =
      input.guestId === undefined || input.guestId === null || input.guestId === ""
        ? randomUUID()
        : requireUuid(input.guestId, "guestId");
    const fullName = requireString(input.fullName, "fullName");
    const actor = requireString(input.actor, "actor");
    const contact = input.contact === undefined ? null : JSON.stringify(asObject(input.contact));
    const preferences = input.preferences === undefined ? null : JSON.stringify(asObject(input.preferences));
    const notes = typeof input.notes === "string" ? input.notes : null;
    const { rows } = await this.pool.query(
      `INSERT INTO guests.guests (id, full_name, contact, preferences, notes, created_by, updated_by)
       VALUES ($1, $2, COALESCE($3::jsonb, '{}'), COALESCE($4::jsonb, '{}'), COALESCE($5, ''), $6, $6)
       ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name,
         contact = CASE WHEN $3 IS NULL THEN guests.guests.contact ELSE EXCLUDED.contact END,
         preferences = CASE WHEN $4 IS NULL THEN guests.guests.preferences ELSE EXCLUDED.preferences END,
         notes = CASE WHEN $5 IS NULL THEN guests.guests.notes ELSE EXCLUDED.notes END,
         updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING id, full_name, contact, preferences, notes, returning_flag, past_stay_count`,
      [id, fullName, contact, preferences, notes, actor],
    );
    return PostgresGuestStore.toGuest(rows[0]);
  }

  async identifyGuest(input: IdentifyGuestInput): Promise<GuestRecord & { stayLinks: GuestStayLink[] }> {
    const record = await this.findGuest(input);
    const links = await this.pool.query(
      `SELECT guest_id AS "guestId", stay_id AS "stayId", linked_at AS "linkedAt"
       FROM guests.guest_stay_links WHERE guest_id = $1 ORDER BY linked_at`,
      [record.id],
    );
    return {
      ...record,
      stayLinks: (links.rows as GuestStayLink[]).map((link) => ({
        guestId: link.guestId,
        stayId: link.stayId,
        linkedAt: new Date(link.linkedAt).toISOString(),
      })),
    };
  }

  async getBookingContext(input: GetBookingContextInput): Promise<{
    guestId: string;
    fullName: string;
    preferences: Record<string, unknown>;
    notes: string;
  }> {
    const record = await this.findGuest({ guestId: input.guestId });
    return { guestId: record.id, fullName: record.fullName, preferences: record.preferences, notes: record.notes };
  }

  private async findGuest(input: { guestId?: unknown; fullName?: unknown }): Promise<GuestRecord> {
    if (typeof input.guestId === "string" && input.guestId !== "") {
      const found = await this.pool.query(
        `SELECT id, full_name, contact, preferences, notes, returning_flag, past_stay_count
         FROM guests.guests WHERE id = $1`,
        [requireUuid(input.guestId, "guestId")],
      );
      if (found.rows.length === 0) {
        throw new HttpError("NOT_FOUND", `Unknown guest ${input.guestId}.`, { guestId: input.guestId });
      }
      return PostgresGuestStore.toGuest(found.rows[0]);
    }
    if (typeof input.fullName === "string" && input.fullName.trim() !== "") {
      const wanted = input.fullName.trim();
      const found = await this.pool.query(
        `SELECT id, full_name, contact, preferences, notes, returning_flag, past_stay_count
         FROM guests.guests WHERE full_name = $1 LIMIT 1`,
        [wanted],
      );
      if (found.rows.length === 0) {
        throw new HttpError("NOT_FOUND", `Unknown guest ${wanted}.`, { fullName: wanted });
      }
      return PostgresGuestStore.toGuest(found.rows[0]);
    }
    throw new HttpError("VALIDATION_FAILED", "guestId or fullName is required.", { field: "guestId" });
  }
}
