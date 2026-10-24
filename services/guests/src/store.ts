import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import { msg } from "./messages.js";

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

// Hotel-mandatory guest fields (FR-CUS-1 baseline enforced in
// module logic): the full name is always required; which contact
// channels are mandatory is hotel config delivered by a later slice
// (sibling #158), so the status check covers the name baseline.
const MANDATORY_GUEST_FIELDS = ["fullName"] as const;

export interface MandatoryFieldStatus {
  complete: boolean;
  missingFields: string[];
}

export function mandatoryFieldStatus(record: { fullName: string }): MandatoryFieldStatus {
  const missingFields = record.fullName.trim() === "" ? [...MANDATORY_GUEST_FIELDS] : [];
  return { complete: missingFields.length === 0, missingFields };
}

export interface GuestStayLink {
  guestId: string;
  stayId: string;
  linkedAt: string;
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

export interface GetGuestInput {
  guestId?: unknown;
}

export interface LinkStayInput {
  guestId?: unknown;
  stayId?: unknown;
  actor?: unknown;
}

// Confirmation record (LLD section 5; FR-GST-4): the booking
// confirmation the hotel shares with the guest. Money follows the
// module convention (minor units, never float).
export interface ConfirmationRecord {
  reservationRef: string;
  hotel: { hotelId: string; name: string };
  guest: { guestId: string; fullName: string };
  dates: { checkIn: string; checkOut: string };
  type: string;
  price: { amountMinor: number; currency: string };
}

// Reservation snapshot attached from reservation reads/events (LLD
// section 5 "data fetched via RES read"). The local copy mirrors the
// linkStay StayEvents-ingestion pattern: the op itself stays
// read-only and the service gains no outbound RES reader.
export interface AttachReservationInput {
  reservationRef?: unknown;
  hotel?: unknown;
  guest?: unknown;
  dates?: unknown;
  type?: unknown;
  price?: unknown;
}

export interface ProduceConfirmationInput {
  reservationRef?: unknown;
}

export interface GuestProfile extends GuestRecord {
  stayLinks: GuestStayLink[];
  mandatoryFieldStatus: MandatoryFieldStatus;
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
  getGuest(input: GetGuestInput): Promise<GuestProfile>;
  // Stay-link ingestion: appends a link-only stay reference consumed
  // from StayEvents (LLD section 5; FR-GST-1). Duplicate delivery of
  // the same stay is idempotent — the link row is UNIQUE per
  // (guest, stay) — and the returning flag with the past-stay count
  // (FR-GST-3) derives from the linked stays.
  linkStay(input: LinkStayInput): Promise<GuestRecord & { stayLinks: GuestStayLink[] }>;
  // Reservation-snapshot ingestion: caches the reservation + hotel
  // data a confirmation is produced from (LLD section 5; FR-GST-4).
  // Re-delivery of the same ref overwrites, so replay stays
  // idempotent. The produced confirmation itself is never a stored
  // row (schema.md section 5) — it is formatted at request time.
  attachReservation(input: AttachReservationInput): Promise<ConfirmationRecord>;
  // Read-only: formats the confirmation record for a known
  // reservationRef; unknown refs refuse NOT_FOUND. No state change,
  // no outbox event.
  produceConfirmation(input: ProduceConfirmationInput): Promise<ConfirmationRecord>;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.date_format", { field }), { field });
  }
  return value.trim();
}

function requirePriceMinor(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.price_amount", {}), {
      field: "price",
    });
  }
  return value;
}

// Validates one attached reservation snapshot into the confirmation
// record shape (LLD section 5; FR-GST-4).
export function toConfirmationRecord(input: AttachReservationInput): ConfirmationRecord {
  const reservationRef = requireUuid(input.reservationRef, "reservationRef");
  const hotel = asObject(input.hotel);
  const guest = asObject(input.guest);
  const dates = asObject(input.dates);
  const price = asObject(input.price);
  return {
    reservationRef,
    hotel: { hotelId: requireUuid(hotel.hotelId, "hotel.hotelId"), name: requireString(hotel.name, "hotel.name") },
    guest: { guestId: requireUuid(guest.guestId, "guest.guestId"), fullName: requireString(guest.fullName, "guest.fullName") },
    dates: { checkIn: requireDate(dates.checkIn, "dates.checkIn"), checkOut: requireDate(dates.checkOut, "dates.checkOut") },
    type: requireString(input.type, "type"),
    price: { amountMinor: requirePriceMinor(price.amountMinor), currency: requireString(price.currency, "price.currency") },
  };
}

export class GuestStore implements GuestStoreAPI {
  private readonly guests = new Map<string, GuestRecord>();
  private readonly links: GuestStayLink[] = [];
  private readonly confirmations = new Map<string, ConfirmationRecord>();
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

  async getGuest(input: GetGuestInput): Promise<GuestProfile> {
    const record = this.findGuest({ guestId: input.guestId });
    return {
      ...record,
      stayLinks: this.linksFor(record.id),
      mandatoryFieldStatus: mandatoryFieldStatus(record),
    };
  }

  async linkStay(input: LinkStayInput): Promise<GuestRecord & { stayLinks: GuestStayLink[] }> {
    const guestId = requireUuid(input.guestId, "guestId");
    const stayId = requireUuid(input.stayId, "stayId");
    const record = this.guests.get(guestId);
    if (!record) {
      throw new HttpError("NOT_FOUND", msg("guests.notfound.guest", { guestId }), { guestId });
    }
    if (!this.links.some((link) => link.guestId === guestId && link.stayId === stayId)) {
      this.links.push({ guestId, stayId, linkedAt: new Date().toISOString() });
    }
    const stayCount = this.linksFor(guestId).length;
    record.pastStayCount = stayCount;
    record.returningFlag = stayCount > 0;
    this.outbox.push({
      aggregate: "guest",
      eventType: "stay-linked",
      payload: { guestId, stayId, pastStayCount: stayCount },
    });
    return { ...record, stayLinks: this.linksFor(guestId) };
  }

  async attachReservation(input: AttachReservationInput): Promise<ConfirmationRecord> {
    const record = toConfirmationRecord(input);
    this.confirmations.set(record.reservationRef, record);
    return record;
  }

  async produceConfirmation(input: ProduceConfirmationInput): Promise<ConfirmationRecord> {
    const reservationRef = requireUuid(input.reservationRef, "reservationRef");
    const record = this.confirmations.get(reservationRef);
    if (!record) {
      throw new HttpError("NOT_FOUND", msg("error.notfound.reservation", { ref: reservationRef }), {
        reservationRef,
      });
    }
    return record;
  }

  private linksFor(guestId: string): GuestStayLink[] {
    return this.links.filter((link) => link.guestId === guestId);
  }

  private findGuest(input: { guestId?: unknown; fullName?: unknown }): GuestRecord {
    if (typeof input.guestId === "string" && input.guestId !== "") {
      const record = this.guests.get(requireUuid(input.guestId, "guestId"));
      if (!record) {
        throw new HttpError("NOT_FOUND", msg("guests.notfound.guest", { guestId: input.guestId }), { guestId: input.guestId });
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
      throw new HttpError("NOT_FOUND", msg("guests.notfound.guest_by_name", { fullName: wanted }), { fullName: wanted });
    }
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.guest_or_name", {}), { field: "guestId" });
  }
}
