import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { describe, it } from "node:test";
import { createServiceServer, MAX_BODY_BYTES } from "./server.js";
import { HttpError } from "./errors.js";
import { msg } from "./messages.js";
import { type AdminStoreAPI, AdminStore } from "./store.js";

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== undefined) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function bootStore(): Promise<AdminStore> {
  const store = new AdminStore("test-key");
  await store.ensureBootUser("owner", "owner-secret");
  return store;
}

async function withServer(store: AdminStoreAPI, run: (port: number) => Promise<void>): Promise<void> {
  const server = createServiceServer("admin", store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await run(port);
  } finally {
    server.close();
  }
}

type Envelope = { code: string; message: string; details: Record<string, unknown>; traceId: string };
const ENVELOPE_KEYS = ["code", "details", "message", "traceId"];

// CFG1-CFG4 (#639): the shared `request` helper JSON-stringifies its
// body, so the unauthenticated-malformed cases need a raw form. This
// one sends a raw buffer or string, an optional exact Authorization
// value, and an optional declared content-length.
async function rawPost(
  port: number,
  options: { path?: string; body?: Buffer | string; authorization?: string; declaredLength?: number },
): Promise<{ status: number; body: Envelope }> {
  return await new Promise((resolve, reject) => {
    const headers: Record<string, string | number> = { "Content-Type": "application/json" };
    if (options.authorization !== undefined) {
      headers["Authorization"] = options.authorization;
    }
    if (options.declaredLength !== undefined) {
      headers["Content-Length"] = options.declaredLength;
    }
    const req = httpRequest(
      { host: "127.0.0.1", port, method: "POST", path: options.path ?? "/v1/admin/UpdateHotelConfig", headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(text) as Envelope,
          });
        });
      },
    );
    req.on("error", reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

// paddedBody renders base as a JSON object padded with a filler field
// to exactly size bytes (the #630 helper shape).
function paddedBody(base: Record<string, unknown>, size: number): Buffer {
  const raw = JSON.stringify(base);
  const pad = size - raw.length - 9;
  if (pad < 0) {
    throw new Error(`base body of ${raw.length} bytes leaves no room below ${size}`);
  }
  return Buffer.from(`${raw.slice(0, -1)},"pad":"${"x".repeat(pad)}"}`, "utf8");
}

// countingStore wraps the in-memory store so a guard can prove a
// refused request reached no operation (the #630 pattern).
function countingStore(store: AdminStore): { store: AdminStore; calls: () => number } {
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

async function withCountedServer(
  store: AdminStore,
  run: (port: number, calls: () => number) => Promise<void>,
): Promise<void> {
  const counted = countingStore(store);
  await withServer(counted.store, (port) => run(port, counted.calls));
}

function assertEnvelope(
  status: number,
  raw: unknown,
  want: { status: number; code: string; message: string; details: Record<string, unknown> },
): void {
  const body = raw as Envelope;
  assert.equal(status, want.status);
  assert.deepEqual(Object.keys(body).sort(), ENVELOPE_KEYS);
  assert.equal(body.code, want.code);
  assert.equal(body.message, want.message);
  assert.deepEqual(body.details, want.details);
  assert.equal(typeof body.traceId, "string");
  assert.ok(body.traceId.length > 0, "every refusal carries a trace id");
}

async function ownerToken(port: number): Promise<string> {
  const signin = await request(port, "POST", "/v1/admin/SignIn", {
    signinIdentity: "owner",
    secret: "owner-secret",
  });
  assert.equal(signin.status, 200);
  return (signin.body as { token: string }).token;
}

async function deskToken(port: number): Promise<string> {
  const token = await ownerToken(port);
  await request(
    port,
    "POST",
    "/v1/admin/CreateUser",
    { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
    token,
  );
  const signin = await request(port, "POST", "/v1/admin/SignIn", {
    signinIdentity: "desk-1",
    secret: "desk-secret",
  });
  assert.equal(signin.status, 200);
  return (signin.body as { token: string }).token;
}

function transportSentences(): string[] {
  return [
    msg("error.transport.bad_json", {}),
    msg("error.transport.body_not_object", {}),
    msg("error.transport.body_too_large", {}),
  ];
}

describe("health", () => {
  it("answers /healthz with the service identity", async () => {
    await withServer(await bootStore(), async (port) => {
      const { status, body } = await request(port, "GET", "/healthz");
      assert.equal(status, 200);
      assert.deepEqual(body, { service: "admin", status: "ok" });
    });
  });

  it("refuses unknown paths with the NOT_FOUND envelope", async () => {
    await withServer(await bootStore(), async (port) => {
      const { status, body } = await request(port, "GET", "/v1/admin/CheckIn");
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    });
  });
});

describe("identity and config", () => {
  it("signs in the boot owner and reads the hotel config", async () => {
    await withServer(await bootStore(), async (port) => {
      const signin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      assert.equal(signin.status, 200);
      const token = (signin.body as { token: string }).token;
      assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-f]+$/);
      assert.equal((signin.body as { role: string }).role, "owner");

      const config = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      assert.equal(config.status, 200);
      assert.equal((config.body as { schemaVersion: number }).schemaVersion, 1);
      assert.equal(
        (config.body as { values: { timezone: string } }).values.timezone,
        "UTC",
      );
    });
  });

  it("refuses a wrong secret and locks the identity after five failures (NFR-SEC-2)", async () => {
    const store = await bootStore();
    await withServer(store, async (port) => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const denied = await request(port, "POST", "/v1/admin/SignIn", {
          signinIdentity: "owner",
          secret: "wrong-secret",
        });
        assert.equal(denied.status, 401);
        assert.equal((denied.body as { code: string }).code, "UNAUTHENTICATED");
      }
      const locked = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      assert.equal(locked.status, 401);
      assert.equal((locked.body as { code: string }).code, "IDENTITY_LOCKED");
      assert.match((locked.body as { message: string }).message, /locked/);
    });
  });

  it("refuses config reads without a session token", async () => {
    await withServer(await bootStore(), async (port) => {
      const { status, body } = await request(port, "POST", "/v1/admin/GetHotelConfig", {});
      assert.equal(status, 401);
      assert.equal((body as { code: string }).code, "UNAUTHENTICATED");
    });
  });

  it("saves local settings and enforces role reach (FR-ADM-1, FR-ADM-2)", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      const ownerToken = (ownerSignin.body as { token: string }).token;

      const created = await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk Agent", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      assert.equal(created.status, 200);
      assert.equal((created.body as { role: string }).role, "front-desk");

      const duplicate = await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk Agent Twice", signinIdentity: "desk-1", secret: "other", role: "front-desk" },
        ownerToken,
      );
      assert.equal(duplicate.status, 400);
      assert.equal((duplicate.body as { code: string }).code, "VALIDATION_FAILED");

      const deskSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      const deskToken = (deskSignin.body as { token: string }).token;

      const saved = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        {
          values: { name: "Riverside Hotel", timezone: "Asia/Ho_Chi_Minh", standardCheckinTime: "14:00" },
          updatedBy: "owner",
        },
        ownerToken,
      );
      assert.equal(saved.status, 200);
      assert.equal((saved.body as { values: { name: string } }).values.name, "Riverside Hotel");
      assert.equal((saved.body as { values: { timezone: string } }).values.timezone, "Asia/Ho_Chi_Minh");
      assert.equal(
        (saved.body as { values: { standardCheckinTime: string } }).values.standardCheckinTime,
        "14:00",
      );

      const reread = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, ownerToken);
      assert.equal(reread.status, 200);
      assert.equal((reread.body as { values: { name: string } }).values.name, "Riverside Hotel");

      const blankName = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { name: "  " }, updatedBy: "owner" },
        ownerToken,
      );
      assert.equal(blankName.status, 400);
      assert.equal((blankName.body as { code: string }).code, "VALIDATION_FAILED");

      const refused = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "UTC" }, updatedBy: "desk-1" },
        deskToken,
      );
      assert.equal(refused.status, 403);
      assert.equal((refused.body as { code: string }).code, "FORBIDDEN");
    });
  });

  it("saves stay times and cancellation wording and shows them back (FR-CUS-2)", async () => {
    // FR-CUS-2: the owner sets the hotel's check-in/check-out times
    // and cancellation wording; the desk reads back exactly what was
    // saved (display), and front-desk accounts cannot change the set
    // (config matrix). Format validation of the times lives in
    // script/validate-hotel-config.sh (FR-ADM-4); the API keeps names
    // non-blank and persists every key verbatim.
    await withServer(await bootStore(), async (port) => {
      const ownerSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      const ownerToken = (ownerSignin.body as { token: string }).token;

      const wording = "Free cancellation until 18:00 on the arrival date.";
      const saved = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        {
          values: {
            standardCheckinTime: "15:00",
            standardCheckoutTime: "11:00",
            cancellationWording: wording,
          },
          updatedBy: "owner",
        },
        ownerToken,
      );
      assert.equal(saved.status, 200);
      assert.equal(
        (saved.body as { values: { standardCheckinTime: string } }).values.standardCheckinTime,
        "15:00",
      );
      assert.equal(
        (saved.body as { values: { standardCheckoutTime: string } }).values.standardCheckoutTime,
        "11:00",
      );
      assert.equal(
        (saved.body as { values: { cancellationWording: string } }).values.cancellationWording,
        wording,
      );

      const reread = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, ownerToken);
      assert.equal(reread.status, 200);
      assert.equal(
        (reread.body as { values: { standardCheckinTime: string } }).values.standardCheckinTime,
        "15:00",
      );
      assert.equal(
        (reread.body as { values: { standardCheckoutTime: string } }).values.standardCheckoutTime,
        "11:00",
      );
      assert.equal(
        (reread.body as { values: { cancellationWording: string } }).values.cancellationWording,
        wording,
      );

      const created = await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk Agent", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      assert.equal(created.status, 200);
      const deskSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      const deskToken = (deskSignin.body as { token: string }).token;
      const refused = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { cancellationWording: "Changed at the desk." }, updatedBy: "desk-1" },
        deskToken,
      );
      assert.equal(refused.status, 403);
      assert.equal((refused.body as { code: string }).code, "FORBIDDEN");
    });
  });
});

describe("user and role management (FR-ADM-2)", () => {
  async function ownerTokenOn(port: number): Promise<string> {
    const signin = await request(port, "POST", "/v1/admin/SignIn", {
      signinIdentity: "owner",
      secret: "owner-secret",
    });
    assert.equal(signin.status, 200);
    return (signin.body as { token: string }).token;
  }

  it("updates a user role and guards self-change plus the last owner", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      const created = await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Manager", signinIdentity: "mgr-1", secret: "mgr-secret", role: "manager" },
        ownerToken,
      );
      assert.equal(created.status, 200);

      const updated = await request(
        port,
        "POST",
        "/v1/admin/UpdateUserRole",
        { signinIdentity: "mgr-1", role: "front-desk" },
        ownerToken,
      );
      assert.equal(updated.status, 200);
      assert.equal((updated.body as { role: string }).role, "front-desk");

      const unknown = await request(
        port,
        "POST",
        "/v1/admin/UpdateUserRole",
        { signinIdentity: "ghost", role: "manager" },
        ownerToken,
      );
      assert.equal(unknown.status, 400);
      assert.equal((unknown.body as { code: string }).code, "VALIDATION_FAILED");

      const badRole = await request(
        port,
        "POST",
        "/v1/admin/UpdateUserRole",
        { signinIdentity: "mgr-1", role: "superuser" },
        ownerToken,
      );
      assert.equal(badRole.status, 400);
      assert.equal((badRole.body as { code: string }).code, "VALIDATION_FAILED");

      const selfChange = await request(
        port,
        "POST",
        "/v1/admin/UpdateUserRole",
        { signinIdentity: "owner", role: "manager" },
        ownerToken,
      );
      assert.equal(selfChange.status, 400);
      assert.equal((selfChange.body as { code: string }).code, "VALIDATION_FAILED");
    });
  });

  it("refuses to demote the last remaining owner", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Second Owner", signinIdentity: "owner-2", secret: "owner-2-secret", role: "owner" },
        ownerToken,
      );
      const secondSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner-2",
        secret: "owner-2-secret",
      });
      const secondToken = (secondSignin.body as { token: string }).token;

      const demote = await request(
        port,
        "POST",
        "/v1/admin/UpdateUserRole",
        { signinIdentity: "owner-2", role: "manager" },
        ownerToken,
      );
      assert.equal(demote.status, 200);

      const lastOwner = await request(
        port,
        "POST",
        "/v1/admin/UpdateUserRole",
        { signinIdentity: "owner", role: "manager" },
        secondToken,
      );
      assert.equal(lastOwner.status, 400);
      assert.equal((lastOwner.body as { code: string }).code, "VALIDATION_FAILED");
    });
  });

  it("refuses role changes from front-desk accounts (NFR-SEC-1)", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      const deskSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      const deskToken = (deskSignin.body as { token: string }).token;

      const refused = await request(
        port,
        "POST",
        "/v1/admin/UpdateUserRole",
        { signinIdentity: "desk-1", role: "manager" },
        deskToken,
      );
      assert.equal(refused.status, 403);
      assert.equal((refused.body as { code: string }).code, "FORBIDDEN");
    });
  });

  it("unlocks a locked identity so sign-in works again (NFR-SEC-2)", async () => {
    const store = await bootStore();
    await withServer(store, async (port) => {
      const ownerToken = await ownerTokenOn(port);
      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      for (let attempt = 0; attempt < 5; attempt++) {
        await request(port, "POST", "/v1/admin/SignIn", { signinIdentity: "desk-1", secret: "wrong" });
      }
      const locked = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      assert.equal(locked.status, 401);

      const unlocked = await request(
        port,
        "POST",
        "/v1/admin/UnlockIdentity",
        { signinIdentity: "desk-1" },
        ownerToken,
      );
      assert.equal(unlocked.status, 200);
      assert.equal((unlocked.body as { unlocked: boolean }).unlocked, true);

      const retry = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      assert.equal(retry.status, 200);
    });
  });

  it("refuses unlock for unknown or unlocked identities and for front-desk callers", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      const deskSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      const deskToken = (deskSignin.body as { token: string }).token;

      const unknown = await request(
        port,
        "POST",
        "/v1/admin/UnlockIdentity",
        { signinIdentity: "ghost" },
        ownerToken,
      );
      assert.equal(unknown.status, 400);
      assert.equal((unknown.body as { code: string }).code, "VALIDATION_FAILED");

      const notLocked = await request(
        port,
        "POST",
        "/v1/admin/UnlockIdentity",
        { signinIdentity: "desk-1" },
        ownerToken,
      );
      assert.equal(notLocked.status, 400);
      assert.equal((notLocked.body as { code: string }).code, "VALIDATION_FAILED");

      const refused = await request(
        port,
        "POST",
        "/v1/admin/UnlockIdentity",
        { signinIdentity: "desk-1" },
        deskToken,
      );
      assert.equal(refused.status, 403);
      assert.equal((refused.body as { code: string }).code, "FORBIDDEN");
    });
  });

  it("ends the session on sign-out (NFR-SEC-2)", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      const ended = await request(port, "POST", "/v1/admin/SignOut", {}, ownerToken);
      assert.equal(ended.status, 200);
      assert.equal((ended.body as { signedOut: boolean }).signedOut, true);

      const reuse = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, ownerToken);
      assert.equal(reuse.status, 401);
      assert.equal((reuse.body as { code: string }).code, "UNAUTHENTICATED");
    });
  });

  it("lists users with lock state and never leaks secret hashes", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      const listed = await request(port, "POST", "/v1/admin/ListUsers", {}, ownerToken);
      assert.equal(listed.status, 200);
      const users = (listed.body as { users: Record<string, unknown>[] }).users;
      assert.equal(users.length, 2);
      for (const user of users) {
        assert.ok(!("secretHash" in user));
        assert.ok(!("secret_hash" in user));
        assert.equal(typeof user["locked"], "boolean");
      }
      const identities = users.map((user) => user["signinIdentity"]).sort();
      assert.deepEqual(identities, ["desk-1", "owner"]);
    });
  });
});

describe("secret rotation (issue #284)", () => {
  async function ownerTokenOn(port: number): Promise<string> {
    const signin = await request(port, "POST", "/v1/admin/SignIn", {
      signinIdentity: "owner",
      secret: "owner-secret",
    });
    assert.equal(signin.status, 200);
    return (signin.body as { token: string }).token;
  }

  it("rotates the caller's own secret: old stops, new signs in", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      const rotated = await request(
        port,
        "POST",
        "/v1/admin/ChangeSecret",
        { currentSecret: "owner-secret", newSecret: "owner-secret-rotated" },
        ownerToken,
      );
      assert.equal(rotated.status, 200);
      assert.equal((rotated.body as { signinIdentity: string }).signinIdentity, "owner");
      assert.equal((rotated.body as { role: string }).role, "owner");
      assert.ok(!("secretHash" in (rotated.body as Record<string, unknown>)));

      const oldSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      assert.equal(oldSignin.status, 401);
      assert.equal((oldSignin.body as { code: string }).code, "UNAUTHENTICATED");

      const newSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret-rotated",
      });
      assert.equal(newSignin.status, 200);
    });
  });

  it("refuses a wrong current secret without lockout side effects", async () => {
    const store = await bootStore();
    await withServer(store, async (port) => {
      const ownerToken = await ownerTokenOn(port);
      const refused = await request(
        port,
        "POST",
        "/v1/admin/ChangeSecret",
        { currentSecret: "not-the-secret", newSecret: "owner-secret-rotated" },
        ownerToken,
      );
      assert.equal(refused.status, 401);
      assert.equal((refused.body as { code: string }).code, "UNAUTHENTICATED");

      // The rotation did not happen and the failure counters are
      // untouched: the real secret still signs in immediately.
      const retry = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      assert.equal(retry.status, 200);
      assert.equal(await store.failureCount("owner"), 0);
    });
  });

  it("refuses rotation without a session token or a new secret", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);

      const anonymous = await request(port, "POST", "/v1/admin/ChangeSecret", {
        currentSecret: "owner-secret",
        newSecret: "owner-secret-rotated",
      });
      assert.equal(anonymous.status, 401);
      assert.equal((anonymous.body as { code: string }).code, "UNAUTHENTICATED");

      const blank = await request(
        port,
        "POST",
        "/v1/admin/ChangeSecret",
        { currentSecret: "owner-secret", newSecret: "" },
        ownerToken,
      );
      assert.equal(blank.status, 400);
      assert.equal((blank.body as { code: string }).code, "VALIDATION_FAILED");
    });
  });

  it("lets any role rotate its own secret and records the change in the audit log", async () => {
    await withServer(await bootStore(), async (port) => {
      const ownerToken = await ownerTokenOn(port);
      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      const deskSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      const deskToken = (deskSignin.body as { token: string }).token;

      const rotated = await request(
        port,
        "POST",
        "/v1/admin/ChangeSecret",
        { currentSecret: "desk-secret", newSecret: "desk-secret-rotated" },
        deskToken,
      );
      assert.equal(rotated.status, 200);

      const log = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 50 }, ownerToken);
      assert.equal(log.status, 200);
      const entries = (log.body as { entries: Record<string, unknown>[] }).entries;
      const rotation = entries.find(
        (entry) => entry["action"] === "user.updated" && entry["entity"] === "desk-1",
      );
      assert.ok(rotation);
      assert.equal(rotation?.["actor"], "desk-1");
    });
  });
});

// #643 / BR-65: the Admin config write records the resolved caller's
// signinIdentity, never the body's updatedBy; the field keeps its
// existing refusal and the request value is dropped (no JSON payload).
describe("session-derived config actor (#643)", () => {
  it("records the caller's signinIdentity when updatedBy names another person (SEC28, SEC30)", async () => {
    const store = await bootStore();
    await withServer(store, async (port) => {
      const signin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      const ownerToken = (signin.body as { token: string }).token;

      const saved = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "Asia/Ho_Chi_Minh" }, updatedBy: "mallory" },
        ownerToken,
      );
      assert.equal(saved.status, 200);
      assert.equal((saved.body as { values: { timezone: string } }).values.timezone, "Asia/Ho_Chi_Minh");

      const caller = await store.authenticate(ownerToken);
      assert.equal(caller.signinIdentity, "owner");
      const record = (store as unknown as { config: Map<string, { updatedBy: string }> }).config.get("timezone");
      assert.equal(record?.updatedBy, "owner");

      const log = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 50 }, ownerToken);
      assert.equal(log.status, 200);
      const entries = (log.body as { entries: Record<string, unknown>[] }).entries;
      const configEntries = entries.filter((entry) => entry["action"] === "config.updated");
      assert.ok(configEntries.length >= 1);
      for (const entry of configEntries) {
        assert.equal(entry["actor"], "owner");
        assert.notEqual(entry["actor"], "mallory");
        assert.deepEqual(Object.keys(entry).sort(), ["action", "actor", "at", "entity"]);
      }
    });
  });

  it("keeps the updatedBy refusal and the front-desk 403 (SEC31)", async () => {
    await withServer(await bootStore(), async (port) => {
      const signin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      const ownerToken = (signin.body as { token: string }).token;
      const missing = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "UTC" } },
        ownerToken,
      );
      assert.equal(missing.status, 400);
      assert.equal((missing.body as { code: string }).code, "VALIDATION_FAILED");
      assert.equal((missing.body as { details: { field: string } }).details.field, "updatedBy");
    });
  });

  it("keeps the server-side boot actor with no request (SEC34)", async () => {
    const store = await bootStore();
    const boot = await store.signIn("owner", "owner-secret");
    const caller = await store.authenticate(boot.token);
    const log = await store.queryAuditLog(caller, { limit: 50 });
    const created = log.entries.filter((entry) => entry.action === "user.created");
    assert.ok(created.length >= 1);
    assert.equal(created[0]?.actor, "boot");
  });
});

describe("read-only audit log (NFR-AUD-1)", () => {
  it("shows account and config changes with actor and time, newest first", async () => {
    await withServer(await bootStore(), async (port) => {
      const signin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      const ownerToken = (signin.body as { token: string }).token;

      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "Asia/Ho_Chi_Minh" }, updatedBy: "owner" },
        ownerToken,
      );

      const log = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 50 }, ownerToken);
      assert.equal(log.status, 200);
      const entries = (log.body as { entries: Record<string, unknown>[] }).entries;
      assert.ok(entries.length >= 2);
      const actions = entries.map((entry) => entry["action"]);
      assert.ok(actions.includes("user.created"));
      assert.ok(actions.includes("config.updated"));
      for (const entry of entries) {
        assert.match(String(entry["at"]), /^\d{4}-\d{2}-\d{2}T/);
        assert.ok(String(entry["actor"]).length > 0);
        assert.ok(String(entry["entity"]).length > 0);
      }
      const times = entries.map((entry) => String(entry["at"]));
      assert.deepEqual([...times].sort().reverse(), times);

      const created = entries.find((entry) => entry["action"] === "user.created" && entry["entity"] === "desk-1");
      assert.equal(created?.["actor"], "owner");
    });
  });

  it("refuses the audit log for front-desk accounts and bad limits", async () => {
    await withServer(await bootStore(), async (port) => {
      const signin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      const ownerToken = (signin.body as { token: string }).token;
      await request(
        port,
        "POST",
        "/v1/admin/CreateUser",
        { displayName: "Desk", signinIdentity: "desk-1", secret: "desk-secret", role: "front-desk" },
        ownerToken,
      );
      const deskSignin = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "desk-1",
        secret: "desk-secret",
      });
      const deskToken = (deskSignin.body as { token: string }).token;

      const refused = await request(port, "POST", "/v1/admin/QueryAuditLog", {}, deskToken);
      assert.equal(refused.status, 403);
      assert.equal((refused.body as { code: string }).code, "FORBIDDEN");

      const badLimit = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 500 }, ownerToken);
      assert.equal(badLimit.status, 400);
      assert.equal((badLimit.body as { code: string }).code, "VALIDATION_FAILED");
    });
  });
});

// ERR4 (issue #627): the same fault contract as the other three Node
// services — an unexpected exception answers INTERNAL_ERROR, not
// VALIDATION_FAILED, and the session that was valid still works.
class FaultAdminStore extends AdminStore {
  override async getConfig(): Promise<never> {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432 admin.hotel_config");
  }
}

class RefusingAdminStore extends AdminStore {
  override async getConfig(): Promise<never> {
    throw new HttpError("FORBIDDEN", msg("error.forbidden.config_change", {}), { role: "front-desk" });
  }
}

async function signInOwner(port: number): Promise<string> {
  const signin = await request(port, "POST", "/v1/admin/SignIn", {
    signinIdentity: "owner",
    secret: "owner-secret",
  });
  return (signin.body as { token: string }).token;
}

describe("internal error envelope (#627)", () => {
  it("answers an unexpected exception with INTERNAL_ERROR and keeps serving", async () => {
    const faulty = new FaultAdminStore("test-key");
    await faulty.ensureBootUser("owner", "owner-secret");
    await withServer(faulty, async (port) => {
      const token = await signInOwner(port);
      const { status, body } = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
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
    });
  });

  it("keeps an HttpError refusal on the same route on its own code and status", async () => {
    const refusing = new RefusingAdminStore("test-key");
    await refusing.ensureBootUser("owner", "owner-secret");
    await withServer(refusing, async (port) => {
      const token = await signInOwner(port);
      const { status, body } = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      assert.equal(status, 403);
      assert.equal((body as { code: string }).code, "FORBIDDEN");
      assert.deepEqual((body as { details: unknown }).details, { role: "front-desk" });
    });
  });
});

// CFG1-CFG4 (#639, AC-CFG-1, FR-CFG-1, BR-64): a session-guarded
// operation resolves the session before it reads the body, so an
// unauthenticated malformed or oversized body answers the one 401
// UNAUTHENTICATED envelope and never a transport parse refusal. The
// counting store proves the refused request reached no operation.
describe("authenticate before parsing (#639)", () => {
  const MISSING_TOKEN = msg("error.auth.missing_token", {});

  function assertUnauthenticated(status: number, body: Envelope, sentence: string): void {
    assertEnvelope(status, body, {
      status: 401,
      code: "UNAUTHENTICATED",
      message: sentence,
      details: {},
    });
    for (const transport of transportSentences()) {
      assert.notEqual(body.message, transport);
    }
  }

  it("answers 401 for an unauthenticated invalid-JSON body, never a parse error (CFG1)", async () => {
    await withCountedServer(new AdminStore("test-key"), async (port, calls) => {
      const { status, body } = await rawPost(port, { body: '{"values": ' });
      assertUnauthenticated(status, body, MISSING_TOKEN);
      assert.equal(calls(), 0, "the refused request must reach no store operation");

      // A later in-ceiling request on the same server still answers:
      // the refusal did not leak a closed connection.
      const after = await request(port, "POST", "/v1/admin/SignIn", {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      assert.equal(after.status, 401, "the boot owner does not exist on this store, so sign-in refuses normally");
    });
  });

  it("answers 401 for an unauthenticated non-object body (CFG2)", async () => {
    const store = await bootStore();
    await withCountedServer(store, async (port, calls) => {
      for (const raw of ["[1,2,3]", '"text"']) {
        const { status, body } = await rawPost(port, { body: raw });
        assertUnauthenticated(status, body, MISSING_TOKEN);
        assert.notEqual(body.message, msg("error.transport.body_not_object", {}));
      }
      assert.equal(calls(), 0);
    });
  });

  it("answers 401 for an unauthenticated over-limit body (CFG3)", async () => {
    const store = await bootStore();
    await withCountedServer(store, async (port, calls) => {
      const streamed = await rawPost(port, { body: paddedBody({}, MAX_BODY_BYTES + 1) });
      assertUnauthenticated(streamed.status, streamed.body, MISSING_TOKEN);
      const declared = await rawPost(port, { declaredLength: 70_000 });
      assertUnauthenticated(declared.status, declared.body, MISSING_TOKEN);
      assert.equal(calls(), 0, "the ceiling is not reached ahead of the session check");
    });
  });

  it("answers each refused session form with its existing sentence (CFG4)", async () => {
    // Invalid token against the real store; a revoked session by
    // signing out first; idle and orphan sessions through a store
    // double, because both depend on clock or store state the guard
    // cannot reach over HTTP.
    const store = await bootStore();
    await withServer(store, async (port) => {
      const invalid = await rawPost(port, { body: '{"values": ', authorization: "Bearer not-a-session" });
      assertUnauthenticated(invalid.status, invalid.body, msg("error.auth.session_invalid", {}));

      const token = await ownerToken(port);
      await request(port, "POST", "/v1/admin/SignOut", {}, token);
      const revoked = await rawPost(port, { body: '{"values": ', authorization: `Bearer ${token}` });
      assertUnauthenticated(revoked.status, revoked.body, msg("error.auth.session_revoked", {}));
    });

    class RefusingSessionStore extends AdminStore {
      override async authenticate(): Promise<never> {
        throw this.refusal();
      }
      constructor(private readonly refusal: () => HttpError) {
        super("test-key");
      }
    }

    const idleStore = new RefusingSessionStore(
      () => new HttpError("UNAUTHENTICATED", msg("error.auth.session_idle", { idleMinutes: 15 }), {}),
    );
    await withServer(idleStore, async (port) => {
      const idle = await rawPost(port, { body: '{"values": ', authorization: "Bearer idle-session" });
      assertUnauthenticated(idle.status, idle.body, msg("error.auth.session_idle", { idleMinutes: 15 }));
    });

    const orphanStore = new RefusingSessionStore(
      () => new HttpError("UNAUTHENTICATED", msg("error.auth.session_orphan", {}), {}),
    );
    await withServer(orphanStore, async (port) => {
      const orphan = await rawPost(port, { body: '{"values": ', authorization: "Bearer orphan-session" });
      assertUnauthenticated(orphan.status, orphan.body, msg("error.auth.session_orphan", {}));
    });
  });

  it("keeps today's 400 for an authenticated malformed body (CFG5)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      const before = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);

      const badJson = await rawPost(port, { body: '{"values": ', authorization: `Bearer ${token}` });
      assertEnvelope(badJson.status, badJson.body, {
        status: 400,
        code: "VALIDATION_FAILED",
        message: msg("error.transport.bad_json", {}),
        details: {},
      });

      const notObject = await rawPost(port, { body: '"text"', authorization: `Bearer ${token}` });
      assertEnvelope(notObject.status, notObject.body, {
        status: 400,
        code: "VALIDATION_FAILED",
        message: msg("error.transport.body_not_object", {}),
        details: {},
      });

      const after = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      assert.deepEqual(after.body, before.body, "a refused parse writes nothing");

      const log = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 50 }, token);
      const entries = (log.body as { entries: Record<string, unknown>[] }).entries;
      assert.equal(entries.filter((entry) => entry["action"] === "config.updated").length, 0);
    });
  });

  it("answers 401, then 400, then 403, and keeps SignIn's 400-first order (CFG6)", async () => {
    await withServer(await bootStore(), async (port) => {
      const desk = await deskToken(port);

      // (a) front-desk caller without a token and with a malformed body → 401.
      const anonymous = await rawPost(port, { body: '{"values": ' });
      assertUnauthenticated(anonymous.status, anonymous.body, MISSING_TOKEN);

      // (b) the same caller with a valid token and a malformed body → 400.
      const malformed = await rawPost(port, { body: '{"values": ', authorization: `Bearer ${desk}` });
      assert.equal(malformed.status, 400);
      assert.equal(malformed.body.code, "VALIDATION_FAILED");
      assert.equal(malformed.body.message, msg("error.transport.bad_json", {}));

      // (c) the same caller with a valid token and a well-formed body → 403.
      const forbidden = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "UTC" }, updatedBy: "desk-1" },
        desk,
      );
      assert.equal(forbidden.status, 403);
      assert.equal((forbidden.body as { code: string }).code, "FORBIDDEN");

      // (d) an unauthenticated SignIn with a malformed body still answers 400.
      const signinMalformed = await rawPost(port, { path: "/v1/admin/SignIn", body: '{"signinIdentity": ' });
      assert.equal(signinMalformed.status, 400);
      assert.equal(signinMalformed.body.code, "VALIDATION_FAILED");
      assert.equal(signinMalformed.body.message, msg("error.transport.bad_json", {}));
      const signinOverLimit = await rawPost(port, {
        path: "/v1/admin/SignIn",
        body: paddedBody({ signinIdentity: "nobody", secret: "wrong" }, MAX_BODY_BYTES + 1),
      });
      assert.equal(signinOverLimit.status, 400);
      assert.equal(signinOverLimit.body.message, msg("error.transport.body_too_large", {}));

      // (e) a well-formed body with no token on UpdateHotelConfig keeps today's 401.
      const wellFormedAnonymous = await request(port, "POST", "/v1/admin/UpdateHotelConfig", {
        values: { timezone: "UTC" },
        updatedBy: "owner",
      });
      assert.equal(wellFormedAnonymous.status, 401);
      assert.equal((wellFormedAnonymous.body as { code: string }).code, "UNAUTHENTICATED");
      assert.equal((wellFormedAnonymous.body as { message: string }).message, MISSING_TOKEN);
    });
  });
});

// CFG7-CFG17 (#639, AC-CFG-3, AC-CFG-4, FR-CFG-2, FR-CFG-3, BR-64):
// the per-key config write table. Every refusal names the key, carries
// that key's own sentence, and writes nothing; every admitted boundary
// value is stored and read back exactly as sent.
describe("config write shapes (#639)", () => {
  async function expectRefusal(
    port: number,
    token: string,
    values: Record<string, unknown>,
    key: string,
    sentence: string,
  ): Promise<void> {
    const { status, body } = await request(
      port,
      "POST",
      "/v1/admin/UpdateHotelConfig",
      { values, updatedBy: "owner" },
      token,
    );
    assertEnvelope(status, body, {
      status: 400,
      code: "VALIDATION_FAILED",
      message: msg(sentence, { field: key }),
      details: { field: key },
    });
  }

  it("refuses a blank name with today's sentence (CFG7)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      await expectRefusal(port, token, { name: "  ", timezone: "UTC" }, "name", "error.validation.field_required");
    });
  });

  it("refuses a blank timezone naming the key (CFG7)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      for (const timezone of ["", "   ", 42, true, null]) {
        await expectRefusal(
          port,
          token,
          { timezone, name: "Riverside Hotel" },
          "timezone",
          "error.validation.config_text",
        );
      }
      // The accepted value stored beside the refused one proves the
      // rule refuses the shape, not every write.
      const saved = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "Asia/Ho_Chi_Minh" }, updatedBy: "owner" },
        token,
      );
      assert.equal(saved.status, 200);
      assert.equal((saved.body as { values: { timezone: string } }).values.timezone, "Asia/Ho_Chi_Minh");
    });
  });

  it("refuses a check-in or check-out time that is not 24-hour HH:MM (CFG8)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      const refused = ["24:00", "8:00", "0800", "14:60", "14:00:00", 1400, true, null];
      for (const value of refused) {
        await expectRefusal(
          port,
          token,
          { standardCheckinTime: value, standardCheckoutTime: "11:00" },
          "standardCheckinTime",
          "error.validation.config_time",
        );
      }
      // The two fields are checked independently.
      await expectRefusal(
        port,
        token,
        { standardCheckinTime: "14:00", standardCheckoutTime: "24:00" },
        "standardCheckoutTime",
        "error.validation.config_time",
      );
    });
  });

  it("refuses a malformed requiredGuestFields list, the audit's A3 case first (CFG9)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      const before = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      const refused: unknown[] = [
        "fullName", // audit finding A3: a string in place of the array
        [],
        [""],
        ["  "],
        [42],
        ["fullName", " fullName "],
        null,
      ];
      for (const value of refused) {
        await expectRefusal(
          port,
          token,
          { requiredGuestFields: value, timezone: "Asia/Ho_Chi_Minh" },
          "requiredGuestFields",
          "error.validation.config_required_fields",
        );
      }
      const after = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      assert.deepEqual(
        (after.body as { values: { requiredGuestFields: unknown } }).values.requiredGuestFields,
        ["fullName"],
        "the seeded list still serves after every refusal",
      );
      assert.deepEqual(after.body, before.body, "no value of a refused request was stored");
    });
  });

  it("refuses a malformed cancellationReasons list and accepts the empty one (CFG10)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      for (const value of [{ reason: "late" }, "late arrival", [42], [""], ["  "], null]) {
        await expectRefusal(
          port,
          token,
          { cancellationReasons: value, timezone: "UTC" },
          "cancellationReasons",
          "error.validation.config_list",
        );
      }
    });
  });

  it("refuses a retentionFloorDays that is not a whole number at or above 0 (CFG11)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      for (const value of [365.5, -1, "365", true, null]) {
        await expectRefusal(
          port,
          token,
          { retentionFloorDays: value, timezone: "UTC" },
          "retentionFloorDays",
          "error.validation.retention_floor",
        );
      }
    });
  });

  it("refuses non-text profile text and accepts the empty string (CFG12)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      for (const key of ["cancellationWording", "address", "phone", "email"]) {
        for (const value of [7, true, { text: "x" }, ["x"], null]) {
          await expectRefusal(port, token, { [key]: value, timezone: "UTC" }, key, "error.validation.config_optional_text");
        }
      }
    });
  });

  it("reports the first offending key in the request's own order (CFG13)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      const { status, body } = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "", requiredGuestFields: "fullName" }, updatedBy: "owner" },
        token,
      );
      assertEnvelope(status, body, {
        status: 400,
        code: "VALIDATION_FAILED",
        message: msg("error.validation.config_text", { field: "timezone" }),
        details: { field: "timezone" },
      });
    });
  });

  it("refuses the whole write and records no config.updated entry (CFG14)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      // One committed write first, so the audit trail has an entry to
      // preserve across the refused request.
      await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: { timezone: "Asia/Ho_Chi_Minh" }, updatedBy: "owner" },
        token,
      );
      const configBefore = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      const auditBefore = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 50 }, token);

      const refused = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        {
          values: { timezone: "Europe/Paris", requiredGuestFields: "fullName", address: "New address" },
          updatedBy: "owner",
        },
        token,
      );
      assertEnvelope(refused.status, refused.body, {
        status: 400,
        code: "VALIDATION_FAILED",
        message: msg("error.validation.config_required_fields", { field: "requiredGuestFields" }),
        details: { field: "requiredGuestFields" },
      });

      const configAfter = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      assert.deepEqual(
        configAfter.body,
        configBefore.body,
        "no key of the refused request is stored, the valid sibling included",
      );
      const auditAfter = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 50 }, token);
      assert.deepEqual(auditAfter.body, auditBefore.body, "no config.updated entry appears for the refusal");
    });
  });

  it("keeps the values and updatedBy refusals ahead of the per-key checks (CFG15)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      for (const values of ["a string", [1, 2, 3], null]) {
        const { status, body } = await request(
          port,
          "POST",
          "/v1/admin/UpdateHotelConfig",
          { values, updatedBy: "owner" },
          token,
        );
        assertEnvelope(status, body, {
          status: 400,
          code: "VALIDATION_FAILED",
          message: msg("error.validation.values_object", {}),
          details: { field: "values" },
        });
      }
      for (const updatedBy of [undefined, "  ", 42]) {
        const { status, body } = await request(
          port,
          "POST",
          "/v1/admin/UpdateHotelConfig",
          { values: { requiredGuestFields: "fullName" }, updatedBy },
          token,
        );
        assertEnvelope(status, body, {
          status: 400,
          code: "VALIDATION_FAILED",
          message: msg("error.validation.field_required", { field: "updatedBy" }),
          details: { field: "updatedBy" },
        });
      }
    });
  });

  it("stores and reads back the admitted boundary values verbatim (CFG16)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      const boundary = {
        requiredGuestFields: ["fullName"],
        standardCheckinTime: "00:00",
        standardCheckoutTime: "23:59",
        retentionFloorDays: 0,
        cancellationReasons: [],
        cancellationWording: "",
        address: "",
        phone: "",
        email: "",
      };
      const saved = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: boundary, updatedBy: "owner" },
        token,
      );
      assert.equal(saved.status, 200);
      const savedValues = (saved.body as { values: Record<string, unknown> }).values;
      for (const [key, value] of Object.entries(boundary)) {
        assert.deepEqual(savedValues[key], value, `${key} is stored as sent`);
      }

      const reread = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      const readValues = (reread.body as { values: Record<string, unknown> }).values;
      for (const [key, value] of Object.entries(boundary)) {
        assert.deepEqual(readValues[key], value, `${key} reads back unchanged`);
      }

      const log = await request(port, "POST", "/v1/admin/QueryAuditLog", { limit: 50 }, token);
      const entries = (log.body as { entries: Record<string, unknown>[] }).entries.filter(
        (entry) => entry["action"] === "config.updated",
      );
      assert.equal(entries.length, Object.keys(boundary).length);
      for (const entry of entries) {
        assert.equal(entry["actor"], "owner");
        assert.match(String(entry["at"]), /^\d{4}-\d{2}-\d{2}T/);
      }
    });
  });

  it("writes a key outside the table as sent and leaves an absent key untouched (CFG17)", async () => {
    await withServer(await bootStore(), async (port) => {
      const token = await ownerToken(port);
      const outside = {
        propertyCode: "EXAMPLE-001",
        currency: "USD",
        chargeItems: [{ name: "Breakfast", amountMinor: 1200 }],
        taxAndFeeRules: { taxPercent: 8 },
        restrictions: [],
        discounts: [],
        ratePlans: [],
        roomTypes: [],
        noshowRule: { chargeFirstNight: true },
        openBalanceCheckoutRule: { approvalRequired: true },
      };
      const saved = await request(
        port,
        "POST",
        "/v1/admin/UpdateHotelConfig",
        { values: outside, updatedBy: "owner" },
        token,
      );
      assert.equal(saved.status, 200);
      const savedValues = (saved.body as { values: Record<string, unknown> }).values;
      for (const [key, value] of Object.entries(outside)) {
        assert.deepEqual(savedValues[key], value, `${key} is written as sent`);
      }

      const reread = await request(port, "POST", "/v1/admin/GetHotelConfig", {}, token);
      assert.equal(
        (reread.body as { values: { timezone: string } }).values.timezone,
        "UTC",
        "a request that omits timezone leaves it unchanged",
      );
    });
  });
});
