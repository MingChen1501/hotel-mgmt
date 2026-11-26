import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { HttpError } from "./errors.js";
import { formatNumber, msg } from "./messages.js";
import {
  GuestStore,
  mandatoryFieldStatus,
  MAX_GUEST_NOTES_LENGTH,
  MAX_GUEST_PAYLOAD_FIELDS,
  MAX_GUEST_PAYLOAD_KEY_LENGTH,
  MAX_GUEST_PAYLOAD_STRING_LENGTH,
  type GuestRecord,
} from "./store.js";
import { PostgresGuestStore } from "./pgstore.js";

const TOKEN = "skeleton-test-token";

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("health", () => {
  it("answers /healthz with the service identity", async () => {
    const server = createServiceServer("guests");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/healthz");
      assert.equal(status, 200);
      assert.deepEqual(body, { service: "guests", status: "ok" });
    } finally {
      server.close();
    }
  });

  it("refuses unknown paths with the NOT_FOUND envelope", async () => {
    const server = createServiceServer("guests");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/v1/guests/CheckIn");
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    } finally {
      server.close();
    }
  });
});

describe("guest profiles", () => {
  it("upserts a guest and shows preferences before booking", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const upserted = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "E2E Guest",
        preferences: { floor: "high" },
        actor: "front-desk",
      });
      assert.equal(upserted.status, 200);
      const guestId = (upserted.body as { guestId: string }).guestId;
      assert.ok(guestId);

      const identified = await request(port, "POST", "/v1/guests/IdentifyGuest", { guestId });
      assert.equal(identified.status, 200);
      assert.equal((identified.body as { returningFlag: boolean }).returningFlag, false);

      const context = await request(port, "POST", "/v1/guests/GetBookingContext", { guestId });
      assert.equal(context.status, 200);
      assert.deepEqual((context.body as { preferences: unknown }).preferences, { floor: "high" });
    } finally {
      server.close();
    }
  });

  it("looks a guest up by full-name search key with stay links and the returning flag", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const upserted = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "Lookup Guest",
        contact: { phone: "+84-900-000-010" },
        actor: "front-desk",
      });
      assert.equal(upserted.status, 200);
      const guestId = (upserted.body as { guestId: string }).guestId;

      const identified = await request(port, "POST", "/v1/guests/IdentifyGuest", {
        fullName: "Lookup Guest",
      });
      assert.equal(identified.status, 200);
      const profile = identified.body as {
        guestId: string;
        fullName: string;
        returningFlag: boolean;
        pastStayCount: number;
        stayLinks: unknown[];
      };
      assert.equal(profile.guestId, guestId);
      assert.equal(profile.fullName, "Lookup Guest");
      assert.equal(profile.returningFlag, false);
      assert.equal(profile.pastStayCount, 0);
      assert.deepEqual(profile.stayLinks, []);
    } finally {
      server.close();
    }
  });

  it("saves notes and shows them in booking context before confirmation", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const upserted = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "Notes Guest",
        notes: "Prefers a quiet high floor.",
        actor: "front-desk",
      });
      assert.equal(upserted.status, 200);
      const guestId = (upserted.body as { guestId: string }).guestId;

      const context = await request(port, "POST", "/v1/guests/GetBookingContext", { guestId });
      assert.equal(context.status, 200);
      assert.equal((context.body as { notes: string }).notes, "Prefers a quiet high floor.");
    } finally {
      server.close();
    }
  });

  it("refuses lookups for unknown guests and writes missing the mandatory name", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    const unknownId = "00000000-0000-4000-8000-000000000000";
    try {
      const identified = await request(port, "POST", "/v1/guests/IdentifyGuest", { guestId: unknownId });
      assert.equal(identified.status, 404);
      assert.equal((identified.body as { code: string }).code, "NOT_FOUND");

      const context = await request(port, "POST", "/v1/guests/GetBookingContext", { guestId: unknownId });
      assert.equal(context.status, 404);
      assert.equal((context.body as { code: string }).code, "NOT_FOUND");

      const upserted = await request(port, "POST", "/v1/guests/UpsertGuest", {
        contact: { phone: "+84-900-000-011" },
        actor: "front-desk",
      });
      assert.equal(upserted.status, 400);
      assert.equal((upserted.body as { code: string }).code, "VALIDATION_FAILED");
    } finally {
      server.close();
    }
  });

  it("returns the full profile with mandatory-field status by guest link", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const upserted = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "Profile Guest",
        contact: { phone: "+84-900-000-020" },
        preferences: { floor: "high" },
        notes: "Prefers a quiet high floor.",
        actor: "front-desk",
      });
      assert.equal(upserted.status, 200);
      const guestId = (upserted.body as { guestId: string }).guestId;

      const fetched = await request(port, "POST", "/v1/guests/GetGuest", { guestId });
      assert.equal(fetched.status, 200);
      const profile = fetched.body as {
        guestId: string;
        fullName: string;
        contact: unknown;
        preferences: unknown;
        notes: string;
        returningFlag: boolean;
        pastStayCount: number;
        stayLinks: unknown[];
        mandatoryFieldStatus: { complete: boolean; missingFields: string[] };
      };
      assert.equal(profile.guestId, guestId);
      assert.equal(profile.fullName, "Profile Guest");
      assert.deepEqual(profile.contact, { phone: "+84-900-000-020" });
      assert.deepEqual(profile.preferences, { floor: "high" });
      assert.equal(profile.notes, "Prefers a quiet high floor.");
      assert.equal(profile.returningFlag, false);
      assert.equal(profile.pastStayCount, 0);
      assert.deepEqual(profile.stayLinks, []);
      assert.deepEqual(profile.mandatoryFieldStatus, { complete: true, missingFields: [] });
    } finally {
      server.close();
    }
  });

  it("links stays from stay lifecycle events and flags returning guests", async () => {
    const store = new GuestStore();
    const server = createServiceServer("guests", store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const upserted = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "Stay History Guest",
        actor: "front-desk",
      });
      assert.equal(upserted.status, 200);
      const guestId = (upserted.body as { guestId: string }).guestId;
      const firstStay = "11111111-1111-4111-8111-111111111111";
      const secondStay = "22222222-2222-4222-8222-222222222222";

      await store.linkStay({ guestId, stayId: firstStay, actor: "stay-service" });
      // Duplicate StayEvents delivery of the same stay stays idempotent.
      await store.linkStay({ guestId, stayId: firstStay, actor: "stay-service" });
      await store.linkStay({ guestId, stayId: secondStay, actor: "stay-service" });

      const fetched = await request(port, "POST", "/v1/guests/GetGuest", { guestId });
      assert.equal(fetched.status, 200);
      const profile = fetched.body as {
        returningFlag: boolean;
        pastStayCount: number;
        stayLinks: { guestId: string; stayId: string }[];
      };
      assert.equal(profile.returningFlag, true);
      assert.equal(profile.pastStayCount, 2);
      assert.deepEqual(
        profile.stayLinks.map((link) => link.stayId).sort(),
        [firstStay, secondStay],
      );

      const identified = await request(port, "POST", "/v1/guests/IdentifyGuest", { guestId });
      assert.equal(identified.status, 200);
      assert.equal((identified.body as { returningFlag: boolean }).returningFlag, true);
      assert.equal((identified.body as { pastStayCount: number }).pastStayCount, 2);
    } finally {
      server.close();
    }
  });

  it("produces the confirmation record for a known reservation ref", async () => {
    const store = new GuestStore();
    const server = createServiceServer("guests", store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const reservationRef = "33333333-3333-4333-8333-333333333333";
      await store.attachReservation({
        reservationRef,
        hotel: { hotelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hanoi Riverside" },
        guest: { guestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "Confirmation Guest" },
        dates: { checkIn: "2026-11-01", checkOut: "2026-11-03" },
        type: "deluxe",
        price: { amountMinor: 2400000, currency: "VND" },
      });

      const confirmation = await request(port, "POST", "/v1/guests/ProduceConfirmation", { reservationRef });
      assert.equal(confirmation.status, 200);
      assert.deepEqual(confirmation.body, {
        reservationRef,
        hotel: { hotelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hanoi Riverside" },
        guest: { guestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "Confirmation Guest" },
        dates: { checkIn: "2026-11-01", checkOut: "2026-11-03" },
        type: "deluxe",
        price: { amountMinor: 2400000, currency: "VND" },
      });
    } finally {
      server.close();
    }
  });

  it("attaches and produces the confirmation for a human reservation ref (issue #323)", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const reservationRef = "RSV-2HBALL5F";
      const attached = await request(port, "POST", "/v1/guests/AttachReservation", {
        reservationRef,
        hotel: { hotelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hanoi Riverside" },
        guest: { guestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "QA Booker" },
        dates: { checkIn: "2026-11-25", checkOut: "2026-11-27" },
        type: "deluxe",
        price: { amountMinor: 240000, currency: "VND" },
      });
      assert.equal(attached.status, 200);

      const confirmation = await request(port, "POST", "/v1/guests/ProduceConfirmation", { reservationRef });
      assert.equal(confirmation.status, 200);
      assert.deepEqual(confirmation.body, {
        reservationRef,
        hotel: { hotelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hanoi Riverside" },
        guest: { guestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "QA Booker" },
        dates: { checkIn: "2026-11-25", checkOut: "2026-11-27" },
        type: "deluxe",
        price: { amountMinor: 240000, currency: "VND" },
      });
    } finally {
      server.close();
    }
  });

  it("produces the RES-side snapshot without hotel or currency (issue #323)", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const reservationRef = "RSV-FZGZ3EBS";
      const attached = await request(port, "POST", "/v1/guests/AttachReservation", {
        reservationRef,
        guest: { guestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "QA Booker" },
        dates: { checkIn: "2026-11-25", checkOut: "2026-11-27" },
        type: "00000000-0000-0000-0000-000000000101",
        price: { amountMinor: 240000 },
      });
      assert.equal(attached.status, 200);

      const confirmation = await request(port, "POST", "/v1/guests/ProduceConfirmation", { reservationRef });
      assert.equal(confirmation.status, 200);
      assert.deepEqual(confirmation.body, {
        reservationRef,
        guest: { guestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "QA Booker" },
        dates: { checkIn: "2026-11-25", checkOut: "2026-11-27" },
        type: "00000000-0000-0000-0000-000000000101",
        price: { amountMinor: 240000 },
      });
    } finally {
      server.close();
    }
  });

  it("refuses confirmation for an unknown human ref and a blank ref (issue #323)", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const refused = await request(port, "POST", "/v1/guests/ProduceConfirmation", {
        reservationRef: "RSV-UNKNOWN1",
      });
      assert.equal(refused.status, 404);
      assert.equal((refused.body as { code: string }).code, "NOT_FOUND");

      const blank = await request(port, "POST", "/v1/guests/ProduceConfirmation", { reservationRef: "  " });
      assert.equal(blank.status, 400);
      assert.equal((blank.body as { code: string }).code, "VALIDATION_FAILED");

      const attachRefused = await request(port, "POST", "/v1/guests/AttachReservation", {
        guest: { guestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fullName: "QA Booker" },
      });
      assert.equal(attachRefused.status, 400);
      assert.equal((attachRefused.body as { code: string }).code, "VALIDATION_FAILED");
    } finally {
      server.close();
    }
  });

  it("refuses confirmation for an unknown reservation ref with NOT_FOUND", async () => {
    const server = createServiceServer("guests", new GuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const unknownRef = "00000000-0000-4000-8000-000000000000";
      const refused = await request(port, "POST", "/v1/guests/ProduceConfirmation", {
        reservationRef: unknownRef,
      });
      assert.equal(refused.status, 404);
      assert.equal((refused.body as { code: string }).code, "NOT_FOUND");

      const missing = await request(port, "POST", "/v1/guests/ProduceConfirmation", {});
      assert.equal(missing.status, 400);
      assert.equal((missing.body as { code: string }).code, "VALIDATION_FAILED");
    } finally {
      server.close();
    }
  });

  it("refuses profile and stay-link writes for unknown guests", async () => {
    const store = new GuestStore();
    const server = createServiceServer("guests", store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const stayId = "33333333-3333-4333-8333-333333333333";
    try {
      const fetched = await request(port, "POST", "/v1/guests/GetGuest", { guestId: unknownId });
      assert.equal(fetched.status, 404);
      assert.equal((fetched.body as { code: string }).code, "NOT_FOUND");

      await assert.rejects(store.linkStay({ guestId: unknownId, stayId }), /Unknown guest/);
    } finally {
      server.close();
    }
  });

  it("reports profiles missing the hotel-mandatory name", async () => {
    // Restored or legacy rows can predate name enforcement; GetGuest
    // names the missing hotel-mandatory field instead of refusing.
    assert.deepEqual(mandatoryFieldStatus({ fullName: "  " }), {
      complete: false,
      missingFields: ["fullName"],
    });
  });
});

// GID1-GID12 (AC-GID-1..AC-GID-7, FR-GID-1..FR-GID-3, BR-63, Refs #640):
// the counted ambiguity refusal, the declared contact/preferences shape
// and notes length, and the calendar-valid confirmation dates, with the
// unchanged unique-name, unknown-name, and guestId reads beside them.
type RefusalEnvelope = {
  code: string;
  message: string;
  details: Record<string, unknown>;
  traceId: string;
};

function assertRefusalEnvelope(
  body: unknown,
  message: string,
  details: Record<string, unknown>,
): void {
  const envelope = body as RefusalEnvelope;
  assert.deepEqual(Object.keys(envelope).sort(), ["code", "details", "message", "traceId"]);
  assert.equal(envelope.code, "VALIDATION_FAILED");
  assert.deepEqual(envelope.details, details);
  assert.equal(envelope.message, message);
  assert.equal(typeof envelope.traceId, "string");
  assert.ok(envelope.traceId.length > 0);
}

async function withGuestServer(
  store: GuestStore,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server = createServiceServer("guests", store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await run(port);
  } finally {
    server.close();
  }
}

function memoryState(store: GuestStore): { rowCount: number; outbox: number } {
  const internals = store as unknown as { guests: Map<string, GuestRecord>; outbox: unknown[] };
  return { rowCount: internals.guests.size, outbox: internals.outbox.length };
}

const sameName = "Same Name Guest";
const guestAId = "aaaaaaaa-1111-4111-8111-111111111111";
const guestBId = "bbbbbbbb-2222-4222-8222-222222222222";
const stayAId = "cccccccc-3333-4333-8333-333333333333";
const stayBId = "dddddddd-4444-4444-8444-444444444444";

function assertHttpRefusal(
  err: unknown,
  message: string,
  details: Record<string, unknown>,
): boolean {
  return (
    err instanceof HttpError &&
    err.code === "VALIDATION_FAILED" &&
    err.status === 400 &&
    err.message === message &&
    JSON.stringify(err.details) === JSON.stringify(details)
  );
}

const SHAPE_REFUSALS: Array<[string, unknown]> = [
  ["an array", [1, 2]],
  ["a string", "high floor"],
  ["a number", 7],
  ["a boolean", true],
  ["17 fields", Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`field_${i}`, "v"]))],
  ["an empty key", { "": "v" }],
  ["a 65-character key", { ["k".repeat(65)]: "v" }],
  ["a nested object", { nested: { floor: "high" } }],
  ["an array entry", { tags: ["a"] }],
  ["a null entry", { floor: null }],
  ["a 257-character string entry", { note: "v".repeat(257) }],
];

describe("guest identity ambiguity and payload bounds (#640)", () => {
  it("refuses two guests with one name, counts both, and writes nothing (GID1, GID3, AC-GID-1)", async () => {
    const store = new GuestStore();
    await withGuestServer(store, async (port) => {
      const first = await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId: guestAId,
        fullName: sameName,
        contact: { phone: "+84-900-000-101" },
        notes: "Guest A note.",
        actor: "front-desk",
      });
      assert.equal(first.status, 200);
      const second = await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId: guestBId,
        fullName: sameName,
        preferences: { floor: "low" },
        notes: "Guest B note.",
        actor: "front-desk",
      });
      assert.equal(second.status, 200);
      await store.linkStay({ guestId: guestAId, stayId: stayAId, actor: "stay-service" });
      await store.linkStay({ guestId: guestBId, stayId: stayBId, actor: "stay-service" });
      const before = memoryState(store);

      const refused = await request(port, "POST", "/v1/guests/IdentifyGuest", {
        fullName: `  ${sameName}  `,
      });
      assert.equal(refused.status, 400);
      assertRefusalEnvelope(
        refused.body,
        msg("guests.validation.ambiguous_name", { fullName: sameName }),
        { field: "fullName", fullName: sameName, matches: 2 },
      );
      for (const key of [
        "guestId",
        "fullName",
        "contact",
        "preferences",
        "notes",
        "returningFlag",
        "pastStayCount",
        "stayLinks",
      ]) {
        assert.equal(Object.hasOwn(refused.body as object, key), false, key);
      }
      assert.deepEqual(memoryState(store), before, "the refused lookup writes nothing");

      // The same refusal at store level, built by the shared constructor.
      await assert.rejects(
        store.identifyGuest({ fullName: sameName }),
        (err) =>
          assertHttpRefusal(err, msg("guests.validation.ambiguous_name", { fullName: sameName }), {
            field: "fullName",
            fullName: sameName,
            matches: 2,
          }),
      );
    });
  });

  it("answers every guestId read with its own profile for two same-named guests (GID5, AC-GID-2)", async () => {
    const store = new GuestStore();
    await withGuestServer(store, async (port) => {
      await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId: guestAId,
        fullName: sameName,
        contact: { phone: "+84-900-000-101" },
        notes: "Guest A note.",
        actor: "front-desk",
      });
      await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId: guestBId,
        fullName: sameName,
        preferences: { floor: "low" },
        notes: "Guest B note.",
        actor: "front-desk",
      });
      await store.linkStay({ guestId: guestAId, stayId: stayAId, actor: "stay-service" });

      const own = [
        { guestId: guestAId, contact: { phone: "+84-900-000-101" }, notes: "Guest A note.", stays: [stayAId] },
        { guestId: guestBId, contact: {}, notes: "Guest B note.", stays: [] as string[] },
      ];
      for (const expected of own) {
        const identified = await request(port, "POST", "/v1/guests/IdentifyGuest", {
          guestId: expected.guestId,
        });
        assert.equal(identified.status, 200);
        const profile = identified.body as {
          guestId: string;
          notes: string;
          contact: unknown;
          stayLinks: { stayId: string }[];
        };
        assert.equal(profile.guestId, expected.guestId);
        assert.equal(profile.notes, expected.notes);
        assert.deepEqual(profile.contact, expected.contact);
        assert.deepEqual(
          profile.stayLinks.map((link) => link.stayId),
          expected.stays,
        );

        const context = await request(port, "POST", "/v1/guests/GetBookingContext", {
          guestId: expected.guestId,
        });
        assert.equal(context.status, 200);
        assert.equal((context.body as { guestId: string }).guestId, expected.guestId);
        assert.equal((context.body as { notes: string }).notes, expected.notes);

        const fetched = await request(port, "POST", "/v1/guests/GetGuest", {
          guestId: expected.guestId,
        });
        assert.equal(fetched.status, 200);
        assert.equal((fetched.body as { guestId: string }).guestId, expected.guestId);
        assert.equal((fetched.body as { notes: string }).notes, expected.notes);
      }
    });
  });

  it("keeps the unknown-name and missing-identifier refusals as today (GID4, AC-GID-2)", async () => {
    const store = new GuestStore();
    await withGuestServer(store, async (port) => {
      const unknown = await request(port, "POST", "/v1/guests/IdentifyGuest", {
        fullName: "Nobody Here",
      });
      assert.equal(unknown.status, 404);
      const envelope = unknown.body as { code: string; message: string; details: unknown };
      assert.equal(envelope.code, "NOT_FOUND");
      assert.equal(envelope.message, msg("guests.notfound.guest_by_name", { fullName: "Nobody Here" }));
      assert.deepEqual(envelope.details, { fullName: "Nobody Here" });

      const neither = await request(port, "POST", "/v1/guests/IdentifyGuest", {});
      assert.equal(neither.status, 400);
      assert.equal((neither.body as { code: string }).code, "VALIDATION_FAILED");
      assert.deepEqual((neither.body as { details: unknown }).details, { field: "guestId" });
      assert.equal(
        (neither.body as { message: string }).message,
        msg("guests.validation.guest_or_name", {}),
      );
    });
  });

  it("refuses every out-of-shape contact/preferences value naming the field (GID6, AC-GID-3)", async () => {
    const store = new GuestStore();
    await withGuestServer(store, async (port) => {
      for (const field of ["contact", "preferences"] as const) {
        for (const [label, value] of SHAPE_REFUSALS) {
          const refused = await request(port, "POST", "/v1/guests/UpsertGuest", {
            fullName: `Shape Guest ${label}`,
            [field]: value,
            actor: "front-desk",
          });
          assert.equal(refused.status, 400, `${field}: ${label}`);
          assertRefusalEnvelope(refused.body, msg("guests.validation.contact_shape", { field }), {
            field,
          });
        }
        // A non-finite number must survive JSON parsing, so send the
        // literal 1e999 on the wire instead of JSON.stringify (which
        // would turn Infinity into null).
        const res = await fetch(`http://127.0.0.1:${port}/v1/guests/UpsertGuest`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
          body: `{"fullName":"Infinity Guest","actor":"front-desk","${field}":{"score":1e999}}`,
        });
        assert.equal(res.status, 400, `${field}: a non-finite number`);
        assertRefusalEnvelope(await res.json(), msg("guests.validation.contact_shape", { field }), {
          field,
        });
      }
      assert.deepEqual(memoryState(store), { rowCount: 0, outbox: 0 }, "nothing was written");
    });
  });

  it("stores the at-bound shapes and keeps absent/null behaviour (GID7, AC-GID-3)", async () => {
    const store = new GuestStore();
    await withGuestServer(store, async (port) => {
      const atBound: Record<string, unknown> = {};
      for (let i = 0; i < 13; i += 1) {
        atBound[`field_${i}`] = "v";
      }
      atBound["k".repeat(MAX_GUEST_PAYLOAD_KEY_LENGTH)] = "x".repeat(
        MAX_GUEST_PAYLOAD_STRING_LENGTH,
      );
      atBound.score = 42;
      atBound.active = true;
      assert.equal(Object.keys(atBound).length, MAX_GUEST_PAYLOAD_FIELDS);

      const created = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "At Bound Guest",
        contact: atBound,
        preferences: atBound,
        actor: "front-desk",
      });
      assert.equal(created.status, 200);
      const guestId = (created.body as { guestId: string }).guestId;
      const fetched = await request(port, "POST", "/v1/guests/GetGuest", { guestId });
      assert.deepEqual((fetched.body as { contact: unknown }).contact, atBound);
      assert.deepEqual((fetched.body as { preferences: unknown }).preferences, atBound);

      // Absent contact is {} on create; absent preferences keeps the
      // stored object on update; an explicit null keeps today's {}.
      const sparse = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "Sparse Guest",
        actor: "front-desk",
      });
      assert.equal(sparse.status, 200);
      const sparseId = (sparse.body as { guestId: string }).guestId;
      const sparseFetched = await request(port, "POST", "/v1/guests/GetGuest", { guestId: sparseId });
      assert.deepEqual((sparseFetched.body as { contact: unknown }).contact, {});
      assert.deepEqual((sparseFetched.body as { preferences: unknown }).preferences, {});

      const updated = await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId: sparseId,
        fullName: "Sparse Guest",
        preferences: { floor: "high" },
        actor: "front-desk",
      });
      assert.equal(updated.status, 200);
      const kept = await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId: sparseId,
        fullName: "Sparse Guest",
        actor: "front-desk",
      });
      assert.equal(kept.status, 200);
      assert.deepEqual((kept.body as { preferences: unknown }).preferences, { floor: "high" });

      const nulled = await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId: sparseId,
        fullName: "Sparse Guest",
        contact: null,
        preferences: null,
        actor: "front-desk",
      });
      assert.equal(nulled.status, 200);
      assert.deepEqual((nulled.body as { contact: unknown }).contact, {});
      assert.deepEqual((nulled.body as { preferences: unknown }).preferences, {});

      // One field, one key character, or one value character past
      // the bound is refused (the pair with GID6).
      for (const [label, value] of [
        ["17 fields", Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`field_${i}`, "v"]))],
        ["a 65-character key", { ["k".repeat(65)]: "v" }],
        ["a 257-character value", { note: "v".repeat(257) }],
      ] as Array<[string, unknown]>) {
        const refused = await request(port, "POST", "/v1/guests/UpsertGuest", {
          guestId: sparseId,
          fullName: "Sparse Guest",
          contact: value,
          actor: "front-desk",
        });
        assert.equal(refused.status, 400, label);
        assertRefusalEnvelope(refused.body, msg("guests.validation.contact_shape", { field: "contact" }), {
          field: "contact",
        });
      }
    });
  });

  it("bounds notes at 2 000 code units and refuses a present non-string (GID8, AC-GID-4)", async () => {
    const store = new GuestStore();
    await withGuestServer(store, async (port) => {
      const atBound = "n".repeat(MAX_GUEST_NOTES_LENGTH);
      const created = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "Notes Bound Guest",
        notes: atBound,
        actor: "front-desk",
      });
      assert.equal(created.status, 200);
      const guestId = (created.body as { guestId: string }).guestId;
      const stored = await request(port, "POST", "/v1/guests/GetBookingContext", { guestId });
      assert.equal((stored.body as { notes: string }).notes, atBound);
      assert.equal((stored.body as { notes: string }).notes.length, 2000);

      const lengthMessage = msg("guests.validation.notes_length", {
        field: "notes",
        max: formatNumber(MAX_GUEST_NOTES_LENGTH),
      });
      const overByOne = await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId,
        fullName: "Notes Bound Guest",
        notes: `${atBound}n`,
        actor: "front-desk",
      });
      assert.equal(overByOne.status, 400);
      assertRefusalEnvelope(overByOne.body, lengthMessage, { field: "notes" });

      for (const [label, value] of [
        ["a number", 7],
        ["an explicit null", null],
      ] as Array<[string, unknown]>) {
        const refused = await request(port, "POST", "/v1/guests/UpsertGuest", {
          guestId,
          fullName: "Notes Bound Guest",
          notes: value,
          actor: "front-desk",
        });
        assert.equal(refused.status, 400, label);
        assertRefusalEnvelope(refused.body, lengthMessage, { field: "notes" });
      }

      const intact = await request(port, "POST", "/v1/guests/GetBookingContext", { guestId });
      assert.equal((intact.body as { notes: string }).notes, atBound, "the stored note is intact");

      const absentUpdate = await request(port, "POST", "/v1/guests/UpsertGuest", {
        guestId,
        fullName: "Notes Bound Guest",
        actor: "front-desk",
      });
      assert.equal(absentUpdate.status, 200);
      assert.equal((absentUpdate.body as { notes: string }).notes, atBound);

      const noNotes = await request(port, "POST", "/v1/guests/UpsertGuest", {
        fullName: "No Notes Guest",
        actor: "front-desk",
      });
      assert.equal(noNotes.status, 200);
      assert.equal((noNotes.body as { notes: string }).notes, "");
    });
  });

  it("refuses calendar-invalid confirmation dates and accepts the real leap day (GID9, AC-GID-5)", async () => {
    const store = new GuestStore();
    await withGuestServer(store, async (port) => {
      const base = {
        hotel: { hotelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Hanoi Riverside" },
        guest: { guestId: guestAId, fullName: "Confirmation Guest" },
        type: "deluxe",
        price: { amountMinor: 240000, currency: "VND" },
      };
      const invalidDates = ["2026-13-45", "2026-02-31", "2026-00-10"];
      let seq = 0;
      for (const field of ["checkIn", "checkOut"] as const) {
        for (const bad of invalidDates) {
          seq += 1;
          const reservationRef = `RSV-BADDATE${seq}`;
          const dates =
            field === "checkIn"
              ? { checkIn: bad, checkOut: "2026-11-05" }
              : { checkIn: "2026-11-01", checkOut: bad };
          const refused = await request(port, "POST", "/v1/guests/AttachReservation", {
            reservationRef,
            ...base,
            dates,
          });
          assert.equal(refused.status, 400, `${field}: ${bad}`);
          assertRefusalEnvelope(
            refused.body,
            msg("guests.validation.date_format", { field: `dates.${field}` }),
            { field: `dates.${field}` },
          );
          const read = await request(port, "POST", "/v1/guests/ProduceConfirmation", {
            reservationRef,
          });
          assert.equal(read.status, 404, `${field}: ${bad} stores no confirmation`);
          assert.equal((read.body as { code: string }).code, "NOT_FOUND");
        }
      }

      // Shape-only refusals keep today's sentence.
      for (const bad of [20260229, "2026-1-1", "not-a-date"] as unknown[]) {
        const refused = await request(port, "POST", "/v1/guests/AttachReservation", {
          reservationRef: "RSV-SHAPEONLY",
          ...base,
          dates: { checkIn: bad, checkOut: "2026-11-05" },
        });
        assert.equal(refused.status, 400);
        assertRefusalEnvelope(
          refused.body,
          msg("guests.validation.date_format", { field: "dates.checkIn" }),
          { field: "dates.checkIn" },
        );
      }

      // The real leap day is accepted and produced.
      const leapRef = "RSV-LEAPDAY";
      const leap = await request(port, "POST", "/v1/guests/AttachReservation", {
        reservationRef: leapRef,
        ...base,
        dates: { checkIn: "2024-02-29", checkOut: "2024-03-01" },
      });
      assert.equal(leap.status, 200);
      const produced = await request(port, "POST", "/v1/guests/ProduceConfirmation", {
        reservationRef: leapRef,
      });
      assert.equal(produced.status, 200);
      assert.deepEqual((produced.body as { dates: unknown }).dates, {
        checkIn: "2024-02-29",
        checkOut: "2024-03-01",
      });

      // The date-order rule is unchanged: checkIn after checkOut stays
      // as accepted as it is today.
      const reversed = await request(port, "POST", "/v1/guests/AttachReservation", {
        reservationRef: "RSV-REVERSED",
        ...base,
        dates: { checkIn: "2026-11-05", checkOut: "2026-11-01" },
      });
      assert.equal(reversed.status, 200);
    });
  });

  it("declares the four bounds and never re-validates a stored profile (GID12, AC-GID-7)", async () => {
    assert.equal(MAX_GUEST_PAYLOAD_FIELDS, 16);
    assert.equal(MAX_GUEST_PAYLOAD_KEY_LENGTH, 64);
    assert.equal(MAX_GUEST_PAYLOAD_STRING_LENGTH, 256);
    assert.equal(MAX_GUEST_NOTES_LENGTH, 2000);

    const store = new GuestStore();
    const legacyId = "eeeeeeee-5555-4555-8555-555555555555";
    const legacy: GuestRecord = {
      id: legacyId,
      fullName: "Legacy Guest",
      contact: { nested: { floor: "high" }, note: "x".repeat(300) },
      preferences: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`field_${i}`, "v"])),
      notes: "n".repeat(2500),
      returningFlag: false,
      pastStayCount: 0,
    };
    (store as unknown as { guests: Map<string, GuestRecord> }).guests.set(legacyId, legacy);
    await withGuestServer(store, async (port) => {
      const fetched = await request(port, "POST", "/v1/guests/GetGuest", { guestId: legacyId });
      assert.equal(fetched.status, 200);
      assert.deepEqual((fetched.body as { contact: unknown }).contact, legacy.contact);
      assert.deepEqual((fetched.body as { preferences: unknown }).preferences, legacy.preferences);
      assert.equal((fetched.body as { notes: string }).notes, legacy.notes);

      const identified = await request(port, "POST", "/v1/guests/IdentifyGuest", {
        guestId: legacyId,
      });
      assert.equal(identified.status, 200);
      assert.equal((identified.body as { notes: string }).notes, legacy.notes);

      const context = await request(port, "POST", "/v1/guests/GetBookingContext", {
        guestId: legacyId,
      });
      assert.equal(context.status, 200);
      assert.equal((context.body as { notes: string }).notes, legacy.notes);
    });
  });
});

// Postgres round-trip for the guests schema (issue #149). Skipped
// without TEST_PG_URL so `npm test` stays green without a database.
const DATABASE_URL = process.env["TEST_PG_URL"];

describe("guests postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("persists the guest profile row", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM guests.outbox");
      await pool.query("DELETE FROM guests.guest_stay_links");
      await pool.query("DELETE FROM guests.guests");
      const store = new PostgresGuestStore(pool);
      const guest = await store.upsertGuest({ fullName: "E2E Guest", preferences: { floor: "high" }, actor: "front-desk" });
      assert.ok(guest.id);
      const identified = await store.identifyGuest({ guestId: guest.id });
      assert.equal(identified.fullName, "E2E Guest");
      assert.deepEqual(identified.stayLinks, []);
    } finally {
      await pool.end();
    }
  });

  it("links stays idempotently and reports the profile with field status", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM guests.outbox");
      await pool.query("DELETE FROM guests.guest_stay_links");
      await pool.query("DELETE FROM guests.guests");
      const store = new PostgresGuestStore(pool);
      const guest = await store.upsertGuest({ fullName: "E2E Guest", actor: "front-desk" });
      const stayId = "44444444-4444-4444-8444-444444444444";
      await store.linkStay({ guestId: guest.id, stayId });
      await store.linkStay({ guestId: guest.id, stayId });
      const profile = await store.getGuest({ guestId: guest.id });
      assert.equal(profile.pastStayCount, 1);
      assert.equal(profile.returningFlag, true);
      assert.equal(profile.stayLinks.length, 1);
      assert.deepEqual(profile.mandatoryFieldStatus, { complete: true, missingFields: [] });
    } finally {
      await pool.end();
    }
  });

  it("refuses an ambiguous name and out-of-bound payloads (GID2, GID12, Refs #640)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM guests.outbox");
      await pool.query("DELETE FROM guests.guest_stay_links");
      await pool.query("DELETE FROM guests.guests");
      const store = new PostgresGuestStore(pool);
      await store.upsertGuest({ fullName: sameName, actor: "front-desk" });
      await store.upsertGuest({ fullName: sameName, actor: "front-desk" });
      await store.upsertGuest({ fullName: "Unique Guest", actor: "front-desk" });

      await assert.rejects(
        store.identifyGuest({ fullName: sameName }),
        (err) =>
          err instanceof HttpError &&
          err.code === "VALIDATION_FAILED" &&
          err.details.field === "fullName" &&
          err.details.matches === 2 &&
          err.message === msg("guests.validation.ambiguous_name", { fullName: sameName }),
      );
      // A unique name still answers with its profile.
      const unique = await store.identifyGuest({ fullName: "Unique Guest" });
      assert.equal(unique.fullName, "Unique Guest");

      await assert.rejects(
        store.upsertGuest({ fullName: "Bounds Guest", contact: [1, 2], actor: "front-desk" }),
        (err) => err instanceof HttpError && err.code === "VALIDATION_FAILED" && err.details.field === "contact",
      );
      await assert.rejects(
        store.upsertGuest({
          fullName: "Bounds Guest",
          preferences: { note: "v".repeat(257) },
          actor: "front-desk",
        }),
        (err) =>
          err instanceof HttpError && err.code === "VALIDATION_FAILED" && err.details.field === "preferences",
      );
      await assert.rejects(
        store.upsertGuest({
          fullName: "Bounds Guest",
          notes: "n".repeat(MAX_GUEST_NOTES_LENGTH + 1),
          actor: "front-desk",
        }),
        (err) => err instanceof HttpError && err.code === "VALIDATION_FAILED" && err.details.field === "notes",
      );

      const { rows } = await pool.query(`SELECT count(*)::int AS count FROM guests.guests`);
      assert.equal(rows[0].count, 3, "a refused upsert writes no row");
    } finally {
      await pool.end();
    }
  });

  it("reads a previously stored out-of-bound profile exactly as stored (GID12, Refs #640)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM guests.outbox");
      await pool.query("DELETE FROM guests.guest_stay_links");
      await pool.query("DELETE FROM guests.guests");
      const legacyId = "ffffffff-6666-4666-8666-666666666666";
      const notes = "n".repeat(2500);
      await pool.query(
        `INSERT INTO guests.guests (id, full_name, contact, preferences, notes, created_by, updated_by)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, 'front-desk', 'front-desk')`,
        [
          legacyId,
          "Legacy Guest",
          JSON.stringify({ nested: { floor: "high" }, note: "x".repeat(300) }),
          JSON.stringify(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`field_${i}`, "v"]))),
          notes,
        ],
      );
      const store = new PostgresGuestStore(pool);
      const fetched = await store.getGuest({ guestId: legacyId });
      assert.equal(fetched.notes, notes);
      assert.deepEqual(fetched.contact, { nested: { floor: "high" }, note: "x".repeat(300) });
      assert.equal(Object.keys(fetched.preferences).length, 17);
      const identified = await store.identifyGuest({ guestId: legacyId });
      assert.equal(identified.notes, notes);
      const context = await store.getBookingContext({ guestId: legacyId });
      assert.equal(context.notes, notes);
    } finally {
      await pool.end();
    }
  });
});

// ERR2 (issue #627): the same fault contract as Stay — an unexpected
// exception answers INTERNAL_ERROR, not VALIDATION_FAILED.
const FAULT_GUEST_ID = "99999999-9999-4999-8999-999999999999";

class FaultGuestStore extends GuestStore {
  override async getGuest(): Promise<never> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432 guests.guests");
  }
}

class RefusingGuestStore extends GuestStore {
  override async getGuest(): Promise<never> {
    throw new HttpError("NOT_FOUND", msg("guests.notfound.guest", { guestId: FAULT_GUEST_ID }), {
      guestId: FAULT_GUEST_ID,
    });
  }
}

describe("internal error envelope (#627)", () => {
  it("answers an unexpected exception with INTERNAL_ERROR and keeps serving", async () => {
    const server = createServiceServer("guests", new FaultGuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "POST", "/v1/guests/GetGuest", { guestId: FAULT_GUEST_ID });
      assert.equal(status, 500);
      assert.deepEqual(Object.keys(body as Record<string, unknown>).sort(), [
        "code",
        "details",
        "message",
        "traceId",
      ]);
      const envelope = body as { code: string; message: string; details: unknown; traceId: string };
      assert.equal(envelope.code, "INTERNAL_ERROR");
      assert.notEqual(envelope.code, "VALIDATION_FAILED");
      assert.equal(envelope.message, msg("error.transport.unexpected", {}));
      assert.deepEqual(envelope.details, {});
      assert.equal(typeof envelope.traceId, "string");
      assert.ok(envelope.traceId.length > 0);

      const next = await request(port, "GET", "/healthz");
      assert.equal(next.status, 200);
    } finally {
      server.close();
    }
  });

  it("keeps an HttpError refusal on the same route on its own code and status", async () => {
    const server = createServiceServer("guests", new RefusingGuestStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "POST", "/v1/guests/GetGuest", { guestId: FAULT_GUEST_ID });
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
      assert.deepEqual((body as { details: unknown }).details, { guestId: FAULT_GUEST_ID });
    } finally {
      server.close();
    }
  });
});
