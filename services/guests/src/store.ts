import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.js";
import { formatNumber, msg } from "./messages.js";

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

// Reservation refs are the human-readable RES-side keys (RSV-…,
// keyed by ref in the Reservations store), not UUIDs: the desk loop
// reads them back from GetReservation and attaches them here (LLD
// section 5; FR-GST-4). UUID reservation ids stay accepted so older
// attached records keep resolving.
export function requireReservationRef(value: unknown): string {
  return requireString(value, "reservationRef");
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
// module convention (minor units, never float). The hotel block and
// the price currency ride along only when the attaching side knows
// them (Admin hotel-profile/currency reads land in a later slice),
// so both stay optional; the desk views render either shape.
export interface ConfirmationRecord {
  reservationRef: string;
  hotel?: { hotelId: string; name: string };
  guest: { guestId: string; fullName: string };
  dates: { checkIn: string; checkOut: string };
  type: string;
  price: { amountMinor: number; currency?: string };
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
  upsertGuest(input: UpsertGuestInput, sessionActor: string): Promise<GuestRecord>;
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

// Guest payload bounds (BR-63; LLD section 32.3). Four fixed code
// constants shared by both stores, never an environment variable, a
// deployment file, or a per-hotel setting (AC-GID-7).
export const MAX_GUEST_PAYLOAD_FIELDS = 16;
export const MAX_GUEST_PAYLOAD_KEY_LENGTH = 64;
export const MAX_GUEST_PAYLOAD_STRING_LENGTH = 256;
export const MAX_GUEST_NOTES_LENGTH = 2000;

// The declared contact/preferences shape: one plain object with at
// most 16 own fields, keys of 1-64 code units, and values that are a
// string of at most 256 code units, a finite number, or a boolean.
// An absent field stays undefined (today's per-store behaviour); an
// explicit null keeps today's coercion to {} (LLD section 32.3).
export function validGuestPayloadObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return {};
  }
  const refuse = (): never => {
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.contact_shape", { field }), { field });
  };
  if (typeof value !== "object" || Array.isArray(value)) {
    return refuse();
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_GUEST_PAYLOAD_FIELDS) {
    return refuse();
  }
  for (const [key, entry] of entries) {
    if (key.length === 0 || key.length > MAX_GUEST_PAYLOAD_KEY_LENGTH) {
      return refuse();
    }
    if (typeof entry === "string") {
      if (entry.length > MAX_GUEST_PAYLOAD_STRING_LENGTH) {
        return refuse();
      }
    } else if (typeof entry === "number") {
      if (!Number.isFinite(entry)) {
        return refuse();
      }
    } else if (typeof entry !== "boolean") {
      // A nested object, an array entry, or a null entry lands here.
      return refuse();
    }
  }
  return value as Record<string, unknown>;
}

// The declared notes length: at most 2 000 UTF-16 code units. An
// absent field stays undefined so the caller keeps today's behaviour
// (the stored note on update, "" on create); a present non-string,
// including an explicit null, is refused (LLD section 32.3).
export function validGuestNotes(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length > MAX_GUEST_NOTES_LENGTH) {
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.notes_length", {
      field: "notes",
      max: formatNumber(MAX_GUEST_NOTES_LENGTH),
    }), { field: "notes" });
  }
  return value;
}

// One shared ambiguity refusal for both stores (LLD section 32.2), so
// the code, details, and sentence cannot drift between the in-memory
// and Postgres twins.
export function ambiguousGuestName(fullName: string, matches: number): HttpError {
  return new HttpError("VALIDATION_FAILED", msg("guests.validation.ambiguous_name", { fullName }), {
    field: "fullName",
    fullName,
    matches,
  });
}

function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.date_format", { field }), { field });
  }
  const trimmed = value.trim();
  // Shape first, then the calendar: the three components must
  // round-trip through a UTC date, so 2024-02-29 passes while
  // 2026-13-45, 2026-02-31, and 2026-00-10 fail (LLD section 32.4).
  const [year, month, day] = trimmed.split("-").map((part) => Number(part));
  const calendar = new Date(0);
  calendar.setUTCHours(0, 0, 0, 0);
  calendar.setUTCFullYear(year, month - 1, day);
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.date_format", { field }), { field });
  }
  return trimmed;
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
// record shape (LLD section 5; FR-GST-4). The ref is the RES-side
// human key (RSV-…); the hotel block and the price currency are
// optional until the Admin-backed hotel values slice lands, but when
// present they validate strictly.
export function toConfirmationRecord(input: AttachReservationInput): ConfirmationRecord {
  const reservationRef = requireReservationRef(input.reservationRef);
  const hotel = asObject(input.hotel);
  const hasHotel = input.hotel !== undefined && input.hotel !== null;
  const guest = asObject(input.guest);
  const dates = asObject(input.dates);
  const price = asObject(input.price);
  const priceCurrency =
    price.currency === undefined || price.currency === null
      ? undefined
      : requireString(price.currency, "price.currency");
  return {
    reservationRef,
    ...(hasHotel
      ? { hotel: { hotelId: requireUuid(hotel.hotelId, "hotel.hotelId"), name: requireString(hotel.name, "hotel.name") } }
      : {}),
    guest: { guestId: requireUuid(guest.guestId, "guest.guestId"), fullName: requireString(guest.fullName, "guest.fullName") },
    dates: { checkIn: requireDate(dates.checkIn, "dates.checkIn"), checkOut: requireDate(dates.checkOut, "dates.checkOut") },
    type: requireString(input.type, "type"),
    price: { amountMinor: requirePriceMinor(price.amountMinor), ...(priceCurrency === undefined ? {} : { currency: priceCurrency }) },
  };
}

// requestActorAnnotation returns the additive requestActor value for a
// JSON outbox payload (BR-65, #643): the request's actor is preserved
// only when it is a present, non-blank string that differs exactly from
// the recorded session actor. An equal or absent value adds no key.
export function requestActorAnnotation(sessionActor: string, requestActor: unknown): string | null {
  if (typeof requestActor !== "string" || requestActor.trim() === "" || requestActor === sessionActor) {
    return null;
  }
  return requestActor;
}

export class GuestStore implements GuestStoreAPI {
  private readonly guests = new Map<string, GuestRecord>();
  private readonly links: GuestStayLink[] = [];
  private readonly confirmations = new Map<string, ConfirmationRecord>();
  private readonly outbox: { aggregate: string; eventType: string; payload: Record<string, unknown> }[] = [];

  async upsertGuest(input: UpsertGuestInput, sessionActor: string): Promise<GuestRecord> {
    const id =
      input.guestId === undefined || input.guestId === null || input.guestId === ""
        ? randomUUID()
        : requireUuid(input.guestId, "guestId");
    const fullName = requireString(input.fullName, "fullName");
    requireString(input.actor, "actor");
    const actor = sessionActor;
    const requestActor = requestActorAnnotation(sessionActor, input.actor);
    // The declared payload bounds run after the identifier checks and
    // before the first store access, so a refusal writes no row and
    // (below) no guest-upserted event (LLD sections 32.1 and 32.3).
    const contact = validGuestPayloadObject(input.contact, "contact");
    const preferences = validGuestPayloadObject(input.preferences, "preferences");
    const notes = validGuestNotes(input.notes);
    const existing = this.guests.get(id);
    const record: GuestRecord = {
      id,
      fullName,
      contact: contact ?? {},
      preferences: preferences ?? (existing?.preferences ?? {}),
      notes: notes ?? (existing?.notes ?? ""),
      returningFlag: existing?.returningFlag ?? false,
      pastStayCount: existing?.pastStayCount ?? 0,
    };
    this.guests.set(id, record);
    this.outbox.push({
      aggregate: "guest",
      eventType: "guest-upserted",
      payload: { guestId: id, fullName, actor, ...(requestActor === null ? {} : { requestActor }) },
    });
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
    const reservationRef = requireReservationRef(input.reservationRef);
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
      // Count every match before answering: the first matching row is
      // never served, because two guests sharing a name would hand the
      // desk one guest's profile (PII) instead of an ambiguity
      // refusal (BR-63; FR-GID-1).
      let matches = 0;
      let first: GuestRecord | undefined;
      for (const record of this.guests.values()) {
        if (record.fullName === wanted) {
          matches += 1;
          first = first ?? record;
        }
      }
      if (matches === 0) {
        throw new HttpError("NOT_FOUND", msg("guests.notfound.guest_by_name", { fullName: wanted }), { fullName: wanted });
      }
      if (matches > 1 || first === undefined) {
        throw ambiguousGuestName(wanted, matches);
      }
      return first;
    }
    throw new HttpError("VALIDATION_FAILED", msg("guests.validation.guest_or_name", {}), { field: "guestId" });
  }
}
