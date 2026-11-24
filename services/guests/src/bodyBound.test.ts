// BND2/BND10 guards (AC-BND-1..AC-BND-5, NFR-BND-1..3, Refs #630):
// the declared 65 536-byte ceiling refuses an over-limit body with the
// shared envelope before any store call, the 65 536/65 537 boundary
// pair holds, and the returned server carries the four finite bounds.
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { describe, it } from "node:test";
import { createServiceServer, MAX_BODY_BYTES } from "./server.js";
import { msg } from "./messages.js";
import { GuestStore } from "./store.js";

const TOKEN = "skeleton-test-token";
const PATH = "/v1/guests/UpsertGuest";
const BOUNDARY_BODY = { fullName: "BND Guest", actor: "front-desk" };
const TOO_LARGE = msg("error.transport.body_too_large", {});

type Envelope = { code: string; message: string; details: Record<string, unknown>; traceId: string };

// paddedBody renders base as a JSON object padded with a filler field
// to exactly size bytes.
function paddedBody(base: Record<string, unknown>, size: number): Buffer {
  const raw = JSON.stringify(base);
  const pad = size - raw.length - 9;
  if (pad < 0) {
    throw new Error(`base body of ${raw.length} bytes leaves no room below ${size}`);
  }
  return Buffer.from(`${raw.slice(0, -1)},"pad":"${"x".repeat(pad)}"}`, "utf8");
}

// countingStore wraps the in-memory store so a guard can prove the
// refused request reached no operation (the stub call count).
function countingStore(store: GuestStore): { store: GuestStore; calls: () => number } {
  let calls = 0;
  const proxied = new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]) => {
        calls += 1;
        return (value as (...params: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { store: proxied, calls: () => calls };
}

// rawPost drives a raw body so a guard can declare a content-length of
// its own or omit it (chunked) and watch the streamed ceiling.
async function rawPost(
  port: number,
  options: { body?: Buffer; declaredLength?: number },
): Promise<{ status: number; body: Envelope }> {
  return await new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    };
    if (options.declaredLength !== undefined) {
      headers["Content-Length"] = options.declaredLength;
    }
    const req = httpRequest({ host: "127.0.0.1", port, method: "POST", path: PATH, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Envelope });
      });
    });
    req.on("error", reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

async function withServer(
  store: GuestStore,
  run: (port: number, calls: () => number) => Promise<void>,
): Promise<void> {
  const counted = countingStore(store);
  const server = createServiceServer("guests", counted.store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await run(port, counted.calls);
  } finally {
    server.close();
  }
}

function assertTooLargeEnvelope(body: Envelope): void {
  assert.deepEqual(Object.keys(body).sort(), ["code", "details", "message", "traceId"]);
  assert.equal(body.code, "VALIDATION_FAILED");
  assert.deepEqual(body.details, { field: "body" });
  assert.equal(body.message, TOO_LARGE);
  assert.equal(typeof body.traceId, "string");
  assert.ok(body.traceId.length > 0);
}

describe("request body ceiling", () => {
  it("declares the one 65 536-byte constant", () => {
    assert.equal(MAX_BODY_BYTES, 65536);
  });

  it("refuses an over-limit body before any operation runs", async () => {
    await withServer(new GuestStore(), async (port, calls) => {
      const { status, body } = await rawPost(port, { body: paddedBody(BOUNDARY_BODY, MAX_BODY_BYTES + 1) });
      assert.equal(status, 400);
      assertTooLargeEnvelope(body);
      assert.equal(calls(), 0, "the refused request must reach no store operation");

      const after = await rawPost(port, { body: paddedBody(BOUNDARY_BODY, MAX_BODY_BYTES) });
      assert.equal(after.status, 200, "a later in-ceiling request on the same server answers normally");
      assert.equal(calls(), 1);
    });
  });

  it("serves a body at the ceiling and refuses one byte more", async () => {
    await withServer(new GuestStore(), async (port, calls) => {
      const at = await rawPost(port, { body: paddedBody(BOUNDARY_BODY, MAX_BODY_BYTES) });
      assert.equal(at.status, 200);
      assert.equal(calls(), 1);
      const over = await rawPost(port, { body: paddedBody(BOUNDARY_BODY, MAX_BODY_BYTES + 1) });
      assert.equal(over.status, 400);
      assertTooLargeEnvelope(over.body);
      assert.equal(calls(), 1);
    });
  });

  it("refuses a declared content-length above the ceiling without reading the stream", async () => {
    await withServer(new GuestStore(), async (port, calls) => {
      const { status, body } = await rawPost(port, { declaredLength: 70000 });
      assert.equal(status, 400);
      assertTooLargeEnvelope(body);
      assert.equal(calls(), 0);
    });
  });
});

describe("server timeouts", () => {
  it("declares the four finite bounds before listen", () => {
    const server = createServiceServer("guests", new GuestStore());
    try {
      assert.equal(server.headersTimeout, 5000);
      assert.equal(server.requestTimeout, 10000);
      assert.equal(server.timeout, 15000);
      assert.equal(server.keepAliveTimeout, 10000);
    } finally {
      server.close();
    }
  });
});
