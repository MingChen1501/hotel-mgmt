import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { createServiceServer } from "./server.js";
import { GuestStore, mandatoryFieldStatus } from "./store.js";
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
});
