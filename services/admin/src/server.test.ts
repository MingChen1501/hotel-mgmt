import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServiceServer } from "./server.js";
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
