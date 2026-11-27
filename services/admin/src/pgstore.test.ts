import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { HttpError } from "./errors.js";
import { msg } from "./messages.js";
import { PostgresAdminStore } from "./pgstore.js";
import { DEV_TOKEN_KEY, PUBLISHED_DEFAULTS } from "./bootConfig.js";
import { verifySessionToken } from "./store.js";

// Postgres round-trip for the admin schema (issue #149). Skipped
// without TEST_PG_URL so `npm test` stays green without a database;
// the persistence path is exercised wherever one exists (locally and
// in the e2e lab).
const DATABASE_URL = process.env["TEST_PG_URL"];

async function wipe(pool: Pool): Promise<void> {
  await pool.query("DELETE FROM admin.outbox");
  await pool.query("DELETE FROM admin.sessions");
  await pool.query("DELETE FROM admin.backup_runs");
  await pool.query("DELETE FROM admin.hotel_config_values");
  await pool.query("DELETE FROM admin.users");
  await pool.query(
    `INSERT INTO admin.hotel_profile
       (id, name, address, phone, email, timezone, standard_checkin_time,
        standard_checkout_time, retention_floor_days, created_by, updated_by)
     VALUES ('00000000-0000-0000-0000-000000000001', 'pg-test', 'addr', 'phone',
       'mail', 'UTC', '14:00', '12:00', 365, 'test', 'test')
     ON CONFLICT (id) DO UPDATE SET timezone = 'UTC', standard_checkin_time = '14:00',
       standard_checkout_time = '12:00', retention_floor_days = 365,
       cancellation_reasons = '[]', noshow_rule = '{}', updated_by = 'test', updated_at = now()`,
  );
}

describe("admin postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("signs in the boot owner and reads the hotel config", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      const boot = await store.ensureBootUser("owner", "owner-secret");
      assert.equal(boot.role, "owner");
      const { token, user } = await store.signIn("owner", "owner-secret");
      assert.match(token, /^[A-Za-z0-9_-]+\.[0-9a-f]+$/);
      const caller = await store.authenticate(token);
      assert.equal(caller.userId, user.userId);

      const config = await store.getConfig();
      assert.equal(config.schemaVersion, 1);
      assert.equal(config.values["timezone"], "UTC");
      const updated = await store.updateConfig(caller, {
        values: { timezone: "Asia/Ho_Chi_Minh" },
        updatedBy: "owner",
      });
      assert.equal(updated.values["timezone"], "Asia/Ho_Chi_Minh");
      const reread = await store.getConfig();
      assert.equal(reread.values["timezone"], "Asia/Ho_Chi_Minh");
    } finally {
      await pool.end();
    }
  });

  it("records the caller's signinIdentity on the config rows when updatedBy spoofs (#643, SEC28)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      const { token } = await store.signIn("owner", "owner-secret");
      const caller = await store.authenticate(token);
      await store.updateConfig(caller, {
        values: { timezone: "Asia/Ho_Chi_Minh", cancellationWording: "Please cancel early" },
        updatedBy: "mallory",
      });
      const profile = await pool.query(`SELECT updated_by FROM admin.hotel_profile LIMIT 1`);
      assert.equal(profile.rows[0]?.updated_by, "owner");
      const stored = await pool.query(
        `SELECT updated_by FROM admin.hotel_config_values WHERE config_key = 'cancellationWording'`,
      );
      assert.equal(stored.rows[0]?.updated_by, "owner");
      await assert.rejects(
        store.updateConfig(caller, { values: { timezone: "UTC" } }),
        (err: unknown) => (err as { code?: string }).code === "VALIDATION_FAILED",
      );
    } finally {
      await pool.end();
    }
  });

  it("locks the identity after five failures", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      for (let attempt = 0; attempt < 5; attempt++) {
        await assert.rejects(store.signIn("owner", "wrong-secret"), /Unknown identity or wrong secret/);
      }
      await assert.rejects(store.signIn("owner", "owner-secret"), /locked/);
      const locked = await pool.query("SELECT locked_until FROM admin.users WHERE signin_identity = 'owner'");
      assert.ok((locked.rows[0] as { locked_until: string }).locked_until !== null);
    } finally {
      await pool.end();
    }
  });

  it("manages roles, unlock, sign-out, list, and audit over persisted rows (FR-ADM-2, NFR-SEC-1/2, NFR-AUD-1)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      const ownerSession = await store.signIn("owner", "owner-secret");
      const owner = await store.authenticate(ownerSession.token);

      const desk = await store.createUser(owner, {
        displayName: "Desk",
        signinIdentity: "desk-1",
        secret: "desk-secret",
        role: "front-desk",
      });
      assert.equal(desk.role, "front-desk");

      const promoted = await store.updateUserRole(owner, { signinIdentity: "desk-1", role: "manager" });
      assert.equal(promoted.role, "manager");

      // The own-role guard answers first when the caller is the target,
      // so the last-owner path needs a second owner as the caller
      // (mirroring the in-memory guard in server.test.ts).
      await store.createUser(owner, {
        displayName: "Second Owner",
        signinIdentity: "owner-2",
        secret: "owner-2-secret",
        role: "owner",
      });
      const secondSession = await store.signIn("owner-2", "owner-2-secret");
      const secondOwner = await store.authenticate(secondSession.token);
      await store.updateUserRole(owner, { signinIdentity: "owner-2", role: "manager" });
      await assert.rejects(
        store.updateUserRole(secondOwner, { signinIdentity: "owner", role: "manager" }),
        /last remaining owner/,
      );

      const listed = await store.listUsers(owner);
      assert.equal(listed.users.length, 3);
      assert.ok(listed.users.every((user) => !("secretHash" in user)));

      await store.updateConfig(owner, { values: { timezone: "Asia/Ho_Chi_Minh" }, updatedBy: "owner" });
      const log = await store.queryAuditLog(owner, { limit: 50 });
      const actions = log.entries.map((entry) => entry.action);
      assert.ok(actions.includes("user.created"));
      assert.ok(actions.includes("user.updated"));
      assert.ok(actions.includes("config.updated"));
      assert.ok(!actions.includes("profile.updated"), "a profile-column write is a config.updated entry");
      const created = log.entries.find((entry) => entry.action === "user.created" && entry.entity === "desk-1");
      assert.equal(created?.actor, "owner");
      // Both stores agree on the action and actor of a profile-column
      // config write; the profile row has one audit stamp, so the
      // Postgres entry names the profile aggregate as its entity.
      const configEntry = log.entries.find((entry) => entry.action === "config.updated");
      assert.equal(configEntry?.actor, "owner");
      assert.equal(configEntry?.entity, "hotel_profile");

      for (let attempt = 0; attempt < 5; attempt++) {
        await assert.rejects(store.signIn("desk-1", "wrong"), /Unknown identity or wrong secret/);
      }
      await assert.rejects(store.signIn("desk-1", "desk-secret"), /locked/);
      const lockedList = await store.listUsers(owner);
      assert.equal(
        lockedList.users.find((user) => user.signinIdentity === "desk-1")?.locked,
        true,
      );
      const unlocked = await store.unlockIdentity(owner, { signinIdentity: "desk-1" });
      assert.equal(unlocked.unlocked, true);
      await store.signIn("desk-1", "desk-secret");

      const ended = await store.signOut(owner);
      assert.equal(ended.signedOut, true);
      await assert.rejects(store.authenticate(ownerSession.token), /revoked or signed out/);
    } finally {
      await pool.end();
    }
  });

  it("rotates the persisted secret hash: old stops, new signs in (issue #284)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      const ownerSession = await store.signIn("owner", "owner-secret");
      const owner = await store.authenticate(ownerSession.token);

      const rotated = await store.changeSecret(owner, {
        currentSecret: "owner-secret",
        newSecret: "owner-secret-rotated",
      });
      assert.equal(rotated.signinIdentity, "owner");
      await assert.rejects(store.signIn("owner", "owner-secret"), /Unknown identity or wrong secret/);
      await store.signIn("owner", "owner-secret-rotated");

      await assert.rejects(
        store.changeSecret(owner, { currentSecret: "not-the-secret", newSecret: "x" }),
        /Unknown identity or wrong secret/,
      );
    } finally {
      await pool.end();
    }
  });

  // CFG11/CFG14/CFG16/CFG18 (#639): the shared BR-64 per-key table
  // gives both stores the same refusals, so the Postgres retention
  // rule stops being the odd one out. The text-number narrowing
  // ("365") is the deliberate one; the whole write is refused before
  // withTx opens, so no row and no config.updated entry appears.
  it("refuses the same config shapes and stores the same accepted boundary (CFG18)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await wipe(pool);
      const store = new PostgresAdminStore(pool, "test-key");
      await store.ensureBootUser("owner", "owner-secret");
      const session = await store.signIn("owner", "owner-secret");
      const owner = await store.authenticate(session.token);

      const refusals: Array<{ values: Record<string, unknown>; key: string; sentence: string }> = [
        { values: { timezone: "  " }, key: "timezone", sentence: "error.validation.config_text" },
        { values: { standardCheckinTime: "24:00" }, key: "standardCheckinTime", sentence: "error.validation.config_time" },
        {
          values: { requiredGuestFields: "fullName" },
          key: "requiredGuestFields",
          sentence: "error.validation.config_required_fields",
        },
        { values: { cancellationReasons: [""] }, key: "cancellationReasons", sentence: "error.validation.config_list" },
        { values: { retentionFloorDays: "365" }, key: "retentionFloorDays", sentence: "error.validation.retention_floor" },
        { values: { address: 7 }, key: "address", sentence: "error.validation.config_optional_text" },
      ];
      for (const { values, key, sentence } of refusals) {
        await assert.rejects(
          store.updateConfig(owner, { values, updatedBy: "owner" }),
          (err: unknown) => {
            assert.ok(err instanceof HttpError, `${key} answers an HttpError`);
            assert.equal(err.code, "VALIDATION_FAILED");
            assert.deepEqual(err.details, { field: key });
            assert.equal(err.message, msg(sentence, { field: key }));
            return true;
          },
          key,
        );
      }

      // The whole write is refused: the valid sibling is not stored
      // and the audit trail keeps no config.updated entry.
      const before = await store.getConfig();
      const auditBefore = await store.queryAuditLog(owner, { limit: 50 });
      await assert.rejects(
        store.updateConfig(owner, {
          values: { timezone: "Europe/Paris", requiredGuestFields: "fullName" },
          updatedBy: "owner",
        }),
        /must list at least one guest field/,
      );
      assert.deepEqual(await store.getConfig(), before, "no key of the refused request is stored");
      assert.deepEqual(await store.queryAuditLog(owner, { limit: 50 }), auditBefore, "no config.updated entry appears");

      // The accepted boundary is stored and read back as sent.
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
      const saved = await store.updateConfig(owner, { values: boundary, updatedBy: "owner" });
      for (const [key, value] of Object.entries(boundary)) {
        assert.deepEqual(saved.values[key], value, `${key} is stored as sent`);
      }
      const reread = await store.getConfig();
      for (const [key, value] of Object.entries(boundary)) {
        assert.deepEqual(reread.values[key], value, `${key} reads back unchanged`);
      }
    } finally {
      await pool.end();
    }
  });
});

// BOOT1/BOOT2 Postgres half (#638, BR-70): the same real entry point,
// with DATABASE_URL on a scratch database. Dropping the admin schema
// before each refused boot makes the absence proof exact: a refusal
// that ran a migration or seeded an owner would leave that schema
// behind. The control proves the provisioned pair still migrates,
// seeds, answers /healthz, and signs in.
describe("fail-closed boot on Postgres (BOOT1, BOOT2)", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  const TIMEOUT_MS = 20000;

  async function freePort(): Promise<number> {
    const server = createNetServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return port;
  }

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
      timer.unref();
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  function startBoot(env: NodeJS.ProcessEnv): {
    child: ChildProcess;
    stdout: () => string;
    stderr: () => string;
    exited: Promise<number | null>;
  } {
    const child = spawn(process.execPath, [join(__dirname, "index.js")], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      err += chunk.toString("utf8");
    });
    const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
    return { child, stdout: () => out, stderr: () => err, exited };
  }

  async function waitForHealth(port: number): Promise<void> {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/healthz`);
        if (res.ok) {
          return;
        }
      } catch {
        // not listening yet
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`/healthz never answered on port ${port}`);
  }

  async function dropAdminSchema(pool: Pool): Promise<void> {
    await pool.query("DROP SCHEMA IF EXISTS admin CASCADE");
  }

  async function adminSchemaExists(pool: Pool): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = 'admin'`,
    );
    return rows.length > 0;
  }

  async function expectRefused(env: NodeJS.ProcessEnv, reason: string): Promise<void> {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await dropAdminSchema(pool);
      const port = await freePort();
      const proc = startBoot({ ...env, PORT: String(port) });
      const code = await withTimeout(proc.exited, TIMEOUT_MS);
      assert.equal(code, 1);
      assert.equal(proc.stderr().trimEnd(), `admin: refusing to boot: ${reason}`);
      assert.equal(await adminSchemaExists(pool), false, "a refused boot applies no migration");
    } finally {
      await pool.end();
    }
  }

  it("refuses a boot without ADMIN_TOKEN_KEY and leaves no admin schema behind (BOOT1)", async () => {
    await expectRefused(
      { DATABASE_URL, ADMIN_BOOT_SECRET: "pg-boot-secret-7q2x" },
      "ADMIN_TOKEN_KEY is unset, empty, or a published default; provision the per-sale secret or set ADMIN_DEV_MODE=1 for dev/test.",
    );
  });

  it("refuses a boot without a usable ADMIN_BOOT_SECRET and seeds no owner (BOOT2)", async () => {
    const tokenKey = "pg-signing-key-3f8v";
    await expectRefused(
      { DATABASE_URL, ADMIN_TOKEN_KEY: tokenKey },
      "ADMIN_BOOT_SECRET is unset, empty, or a published default; provision the per-sale secret or set ADMIN_DEV_MODE=1 for dev/test.",
    );
    for (const value of PUBLISHED_DEFAULTS) {
      await expectRefused(
        { DATABASE_URL, ADMIN_TOKEN_KEY: tokenKey, ADMIN_BOOT_SECRET: value },
        "ADMIN_BOOT_SECRET is unset, empty, or a published default; provision the per-sale secret or set ADMIN_DEV_MODE=1 for dev/test.",
      );
    }
  });

  it("migrates, seeds, serves /healthz, and signs with the provisioned key (control)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await dropAdminSchema(pool);
      const port = await freePort();
      const tokenKey = "pg-control-signing-key";
      const bootSecret = "pg-control-boot-secret";
      const proc = startBoot({
        DATABASE_URL,
        PORT: String(port),
        ADMIN_TOKEN_KEY: tokenKey,
        ADMIN_BOOT_SECRET: bootSecret,
      });
      try {
        await waitForHealth(port);
        const { rows } = await pool.query(`SELECT signin_identity AS "signinIdentity", role FROM admin.users`);
        assert.deepEqual(rows, [{ signinIdentity: "owner", role: "owner" }]);
        const res = await fetch(`http://127.0.0.1:${port}/v1/admin/SignIn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signinIdentity: "owner", secret: bootSecret }),
        });
        assert.equal(res.status, 200);
        const body = (await res.json()) as { token: string };
        assert.notEqual(verifySessionToken(tokenKey, body.token), null);
        assert.equal(verifySessionToken(DEV_TOKEN_KEY, body.token), null);
      } finally {
        proc.child.kill("SIGTERM");
        await withTimeout(proc.exited, TIMEOUT_MS);
      }
    } finally {
      await pool.end();
    }
  });
});
