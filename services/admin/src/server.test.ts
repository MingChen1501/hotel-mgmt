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
});
