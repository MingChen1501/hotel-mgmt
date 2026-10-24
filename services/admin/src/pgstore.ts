import type { Pool, PoolClient } from "pg";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";
import {
  IDLE_TIMEOUT_MS,
  LOCKOUT_MS,
  MAX_FAILURES,
  ROLES,
  hashSecret,
  requiredString,
  signSessionToken,
  toPublic,
  verifySessionToken,
  type AdminStoreAPI,
  type AuditEntry,
  type AuthenticatedUser,
  type ListedUser,
  type PublicUser,
  type Role,
} from "./store.js";

// User/role writes stay with owner and manager (BR-35): the owner
// additionally controls users and hotel setup, the manager controls
// rates, rooms, and reports, and front-desk staff operate the desk.
function requireUserManager(caller: AuthenticatedUser, operation: string): void {
  if (caller.role === "front-desk") {
    throw new HttpError("FORBIDDEN", `Front-desk accounts cannot ${operation}.`, { role: caller.role });
  }
}

// Profile-backed config keys: single-homed in admin.hotel_profile,
// everything else lives in admin.hotel_config_values (schema.md §8).
const PROFILE_COLUMNS: Record<string, string> = {
  name: "name",
  timezone: "timezone",
  standardCheckinTime: "standard_checkin_time",
  standardCheckoutTime: "standard_checkout_time",
  retentionFloorDays: "retention_floor_days",
  cancellationReasons: "cancellation_reasons",
  noshowRule: "noshow_rule",
};

const CONFIG_DEFAULTS: Record<string, unknown> = {
  name: "Skeleton Hotel",
  timezone: "UTC",
  standardCheckinTime: "14:00",
  standardCheckoutTime: "12:00",
  retentionFloorDays: 365,
  requiredGuestFields: ["fullName"],
  cancellationReasons: [],
  noshowRule: {},
  approvalRule: { required: false },
};

// Postgres-backed AdminService identity and config store (issue
// #149). Implements AdminStoreAPI against the admin schema
// (docs/technical/schema.md section 8) with identical semantics to
// the in-memory store: HMAC-signed opaque tokens, 15-minute idle
// expiry, 5-strike lockout with a persisted locked_until, role
// checks, and versioned config values.
export class PostgresAdminStore implements AdminStoreAPI {
  private readonly failures = new Map<string, { count: number; lockedUntil: number | null }>();
  private readonly key: string;
  readonly schemaVersion = 1;

  constructor(
    private readonly pool: Pool,
    tokenKey?: string,
  ) {
    this.key = tokenKey ?? process.env["ADMIN_TOKEN_KEY"] ?? "dev-only-change-me";
  }

  private async withTx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async ensureBootUser(signinIdentity: string, secret: string, displayName = "Owner"): Promise<PublicUser> {
    return this.withTx(async (client) => {
      await client.query(
        `INSERT INTO admin.users (id, display_name, signin_identity, secret_hash, role, created_by, updated_by)
         VALUES ($1, $2, $3, $4, 'owner', 'boot', 'boot')
         ON CONFLICT (signin_identity) DO NOTHING`,
        [randomUUID(), displayName, signinIdentity, hashSecret(secret)],
      );
      const { rows } = await client.query(
        `SELECT id AS "userId", display_name AS "displayName",
           signin_identity AS "signinIdentity", role
         FROM admin.users WHERE signin_identity = $1`,
        [signinIdentity],
      );
      const user = rows[0] as PublicUser;
      return { userId: user.userId, displayName: user.displayName, signinIdentity: user.signinIdentity, role: user.role };
    });
  }

  async signIn(signinIdentity: unknown, secret: unknown): Promise<{ token: string; user: PublicUser }> {
    if (typeof signinIdentity !== "string" || signinIdentity.trim() === "") {
      throw new HttpError("VALIDATION_FAILED", "signinIdentity is required.", { field: "signinIdentity" });
    }
    if (typeof secret !== "string" || secret === "") {
      throw new HttpError("VALIDATION_FAILED", "secret is required.", { field: "secret" });
    }
    const identity = signinIdentity.trim();
    const state = this.failures.get(identity);
    if (state?.lockedUntil !== null && state?.lockedUntil !== undefined && state.lockedUntil > Date.now()) {
      throw new HttpError("UNAUTHENTICATED", `Identity ${identity} is locked after repeated failures.`, {
        signinIdentity: identity,
      });
    }
    const { rows } = await this.pool.query(
      `SELECT id AS "userId", display_name AS "displayName",
         signin_identity AS "signinIdentity", role, secret_hash AS "secretHash",
         locked_until AS "lockedUntil"
       FROM admin.users WHERE signin_identity = $1`,
      [identity],
    );
    const user = rows[0] as (PublicUser & { secretHash: string; lockedUntil: string | null }) | undefined;
    if (user?.lockedUntil !== null && user?.lockedUntil !== undefined) {
      const lockedUntil = new Date(user.lockedUntil).getTime();
      if (lockedUntil > Date.now()) {
        throw new HttpError("UNAUTHENTICATED", `Identity ${identity} is locked after repeated failures.`, {
          signinIdentity: identity,
        });
      }
    }
    const candidate = user ? hashSecret(secret) : randomBytes(32).toString("hex");
    const expected = user?.secretHash ?? randomBytes(32).toString("hex");
    const matches =
      user !== undefined &&
      candidate.length === expected.length &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    if (!matches || !user) {
      await this.recordFailure(identity);
      throw new HttpError("UNAUTHENTICATED", "Unknown identity or wrong secret.", { signinIdentity: identity });
    }
    this.failures.delete(identity);
    const tokenId = randomUUID();
    await this.pool.query(
      `INSERT INTO admin.sessions
         (token_id, user_id, issued_at, last_activity_at, expires_at, revoked, created_by, updated_by)
       VALUES ($1, $2, now(), now(), now() + make_interval(mins => 15), FALSE, 'system', 'system')`,
      [tokenId, user.userId],
    );
    await this.pool.query(`UPDATE admin.users SET locked_until = NULL, updated_at = now() WHERE id = $1`, [
      user.userId,
    ]);
    return { token: signSessionToken(this.key, tokenId), user: toPublic(user) };
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const tokenId = verifySessionToken(this.key, token);
    if (!tokenId) {
      throw new HttpError("UNAUTHENTICATED", "Invalid or expired session token.", {});
    }
    const { rows } = await this.pool.query(
      `SELECT token_id AS "tokenId", user_id AS "userId",
         last_activity_at AS "lastActivityAt", revoked
       FROM admin.sessions WHERE token_id = $1`,
      [tokenId],
    );
    const session = rows[0] as { tokenId: string; userId: string; lastActivityAt: string; revoked: boolean } | undefined;
    if (!session || session.revoked) {
      throw new HttpError("UNAUTHENTICATED", "Session is revoked or signed out.", {});
    }
    if (Date.now() - new Date(session.lastActivityAt).getTime() > IDLE_TIMEOUT_MS) {
      await this.pool.query(`DELETE FROM admin.sessions WHERE token_id = $1`, [tokenId]);
      throw new HttpError("UNAUTHENTICATED", "Session ended after 15 minutes without activity.", {});
    }
    await this.pool.query(
      `UPDATE admin.sessions
       SET last_activity_at = now(), expires_at = now() + make_interval(mins => 15), updated_at = now()
       WHERE token_id = $1`,
      [tokenId],
    );
    const users = await this.pool.query(
      `SELECT id AS "userId", display_name AS "displayName",
         signin_identity AS "signinIdentity", role
       FROM admin.users WHERE id = $1`,
      [session.userId],
    );
    const user = users.rows[0] as PublicUser | undefined;
    if (!user) {
      throw new HttpError("UNAUTHENTICATED", "Session user no longer exists.", {});
    }
    return { ...toPublic(user), tokenId };
  }

  async createUser(
    caller: AuthenticatedUser,
    input: { displayName?: unknown; signinIdentity?: unknown; secret?: unknown; role?: unknown },
  ): Promise<PublicUser> {
    if (caller.role === "front-desk") {
      throw new HttpError("FORBIDDEN", "Front-desk accounts cannot create users.", { role: caller.role });
    }
    const displayName = requiredString(input.displayName, "displayName");
    const signinIdentity = requiredString(input.signinIdentity, "signinIdentity");
    if (typeof input.secret !== "string" || input.secret === "") {
      throw new HttpError("VALIDATION_FAILED", "secret is required.", { field: "secret" });
    }
    if (typeof input.role !== "string" || !ROLES.includes(input.role as Role)) {
      throw new HttpError("VALIDATION_FAILED", "Unknown role.", { role: input.role });
    }
    const created = await this.pool.query(
      `INSERT INTO admin.users (id, display_name, signin_identity, secret_hash, role, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (signin_identity) DO NOTHING
       RETURNING id AS "userId", display_name AS "displayName",
         signin_identity AS "signinIdentity", role`,
      [randomUUID(), displayName, signinIdentity, hashSecret(input.secret), input.role, caller.signinIdentity],
    );
    if (created.rows.length === 0) {
      throw new HttpError("VALIDATION_FAILED", `Sign-in identity ${signinIdentity} is already taken.`, {
        signinIdentity,
      });
    }
    const user = created.rows[0] as PublicUser;
    return { userId: user.userId, displayName: user.displayName, signinIdentity: user.signinIdentity, role: user.role };
  }

  // Owner/manager role change (FR-ADM-2). Guards: the caller can
  // never change its own role, and the last remaining owner can
  // never be demoted, so the hotel cannot lock itself out of user
  // management.
  async updateUserRole(
    caller: AuthenticatedUser,
    input: { signinIdentity?: unknown; role?: unknown },
  ): Promise<PublicUser> {
    requireUserManager(caller, "change user roles");
    const signinIdentity = requiredString(input.signinIdentity, "signinIdentity");
    if (typeof input.role !== "string" || !ROLES.includes(input.role as Role)) {
      throw new HttpError("VALIDATION_FAILED", "Unknown role.", { role: input.role });
    }
    const nextRole = input.role as Role;
    return this.withTx(async (client) => {
      const found = await client.query(
        `SELECT id AS "userId", display_name AS "displayName",
          signin_identity AS "signinIdentity", role
        FROM admin.users WHERE signin_identity = $1`,
        [signinIdentity],
      );
      const user = found.rows[0] as PublicUser | undefined;
      if (!user) {
        throw new HttpError("VALIDATION_FAILED", `Unknown sign-in identity ${signinIdentity}.`, { signinIdentity });
      }
      if (user.userId === caller.userId) {
        throw new HttpError("VALIDATION_FAILED", "You cannot change your own role.", { signinIdentity });
      }
      if (user.role === "owner" && nextRole !== "owner") {
        const others = await client.query(`SELECT COUNT(*) AS count FROM admin.users WHERE role = 'owner' AND id <> $1`, [
          user.userId,
        ]);
        if (Number(others.rows[0].count) === 0) {
          throw new HttpError("VALIDATION_FAILED", `Cannot demote ${signinIdentity}: the last remaining owner.`, {
            signinIdentity,
          });
        }
      }
      const updated = await client.query(
        `UPDATE admin.users SET role = $1, updated_by = $2, updated_at = now()
         WHERE id = $3
         RETURNING id AS "userId", display_name AS "displayName",
           signin_identity AS "signinIdentity", role`,
        [nextRole, caller.signinIdentity, user.userId],
      );
      const row = updated.rows[0] as PublicUser;
      return { userId: row.userId, displayName: row.displayName, signinIdentity: row.signinIdentity, role: row.role };
    });
  }

  // Owner/manager unlock after a 5-strike lockout (NFR-SEC-2, BR-42).
  async unlockIdentity(
    caller: AuthenticatedUser,
    input: { signinIdentity?: unknown },
  ): Promise<{ signinIdentity: string; unlocked: true }> {
    requireUserManager(caller, "unlock identities");
    const signinIdentity = requiredString(input.signinIdentity, "signinIdentity");
    return this.withTx(async (client) => {
      const found = await client.query(`SELECT id FROM admin.users WHERE signin_identity = $1`, [signinIdentity]);
      if (found.rows.length === 0) {
        throw new HttpError("VALIDATION_FAILED", `Unknown sign-in identity ${signinIdentity}.`, { signinIdentity });
      }
      const locked = await client.query(
        `SELECT locked_until AS "lockedUntil" FROM admin.users WHERE signin_identity = $1`,
        [signinIdentity],
      );
      const lockedUntil = (locked.rows[0] as { lockedUntil: string | null }).lockedUntil;
      const memoryLocked = this.isMemoryLocked(signinIdentity);
      const columnLocked = lockedUntil !== null && lockedUntil !== undefined && new Date(lockedUntil).getTime() > Date.now();
      if (!memoryLocked && !columnLocked) {
        throw new HttpError("VALIDATION_FAILED", `Identity ${signinIdentity} is not currently locked.`, {
          signinIdentity,
        });
      }
      this.failures.delete(signinIdentity);
      await client.query(
        `UPDATE admin.users SET locked_until = NULL, updated_by = $1, updated_at = now()
         WHERE signin_identity = $2`,
        [caller.signinIdentity, signinIdentity],
      );
      return { signinIdentity, unlocked: true as const };
    });
  }

  async signOut(caller: AuthenticatedUser): Promise<{ signedOut: true }> {
    await this.pool.query(`UPDATE admin.sessions SET revoked = TRUE, updated_at = now() WHERE token_id = $1`, [
      caller.tokenId,
    ]);
    return { signedOut: true as const };
  }

  async listUsers(caller: AuthenticatedUser): Promise<{ users: ListedUser[] }> {
    requireUserManager(caller, "list users");
    const { rows } = await this.pool.query(
      `SELECT id AS "userId", display_name AS "displayName",
        signin_identity AS "signinIdentity", role,
        locked_until AS "lockedUntil"
      FROM admin.users ORDER BY signin_identity`,
    );
    const users = (rows as (PublicUser & { lockedUntil: string | null })[]).map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      signinIdentity: row.signinIdentity,
      role: row.role,
      locked:
        (row.lockedUntil !== null &&
          row.lockedUntil !== undefined &&
          new Date(row.lockedUntil).getTime() > Date.now()) ||
        this.isMemoryLocked(row.signinIdentity),
    }));
    return { users };
  }

  // Read-only audit view over already-persisted rows (issue #163):
  // account creations/updates, config/profile writes, and backup run
  // reports, newest first. No new recording semantics; the Later
  // recording scope stays unchanged.
  async queryAuditLog(
    caller: AuthenticatedUser,
    input: { limit?: unknown },
  ): Promise<{ entries: AuditEntry[] }> {
    requireUserManager(caller, "read the audit log");
    const limit = input.limit === undefined ? 50 : input.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new HttpError("VALIDATION_FAILED", "limit must be an integer between 1 and 200.", { field: "limit" });
    }
    const entries: AuditEntry[] = [];
    const users = await this.pool.query(
      `SELECT signin_identity AS "signinIdentity", display_name AS "displayName", role,
        created_by AS "createdBy", created_at AS "createdAt",
        updated_by AS "updatedBy", updated_at AS "updatedAt"
      FROM admin.users`,
    );
    for (const row of users.rows as Record<string, unknown>[]) {
      entries.push({
        at: (row["createdAt"] as Date).toISOString(),
        actor: String(row["createdBy"]),
        action: "user.created",
        entity: String(row["signinIdentity"]),
        detail: `${String(row["displayName"])} (${String(row["role"])})`,
      });
      const createdAt = (row["createdAt"] as Date).getTime();
      const updatedAt = (row["updatedAt"] as Date).getTime();
      if (updatedAt > createdAt) {
        entries.push({
          at: (row["updatedAt"] as Date).toISOString(),
          actor: String(row["updatedBy"]),
          action: "user.updated",
          entity: String(row["signinIdentity"]),
          detail: `now ${String(row["role"])}`,
        });
      }
    }
    const configs = await this.pool.query(
      `SELECT config_key, updated_by AS "updatedBy", updated_at AS "updatedAt"
       FROM admin.hotel_config_values`,
    );
    for (const row of configs.rows as Record<string, unknown>[]) {
      entries.push({
        at: (row["updatedAt"] as Date).toISOString(),
        actor: String(row["updatedBy"]),
        action: "config.updated",
        entity: String(row["config_key"]),
      });
    }
    const profiles = await this.pool.query(
      `SELECT updated_by AS "updatedBy", updated_at AS "updatedAt", created_at AS "createdAt"
       FROM admin.hotel_profile LIMIT 1`,
    );
    for (const row of profiles.rows as Record<string, unknown>[]) {
      if ((row["updatedAt"] as Date).getTime() > (row["createdAt"] as Date).getTime()) {
        entries.push({
          at: (row["updatedAt"] as Date).toISOString(),
          actor: String(row["updatedBy"]),
          action: "profile.updated",
          entity: "hotel_profile",
        });
      }
    }
    const backups = await this.pool.query(
      `SELECT result, created_by AS "createdBy", created_at AS "createdAt",
        finished_at AS "finishedAt"
       FROM admin.backup_runs`,
    );
    for (const row of backups.rows as Record<string, unknown>[]) {
      entries.push({
        at: ((row["finishedAt"] as Date | null) ?? (row["createdAt"] as Date)).toISOString(),
        actor: String(row["createdBy"]),
        action: "backup.reported",
        entity: "backup_runs",
        detail: String(row["result"]),
      });
    }
    entries.sort((a, b) => (a.at < b.at ? 1 : -1));
    return { entries: entries.slice(0, limit) };
  }

  private isMemoryLocked(signinIdentity: string): boolean {
    const state = this.failures.get(signinIdentity);
    return state?.lockedUntil !== null && state?.lockedUntil !== undefined && state.lockedUntil > Date.now();
  }

  async getConfig(): Promise<{ schemaVersion: number; values: Record<string, unknown> }> {
    const values: Record<string, unknown> = { ...CONFIG_DEFAULTS };
    const profiles = await this.pool.query(
      `SELECT name, timezone, standard_checkin_time AS "standardCheckinTime",
         standard_checkout_time AS "standardCheckoutTime",
         retention_floor_days AS "retentionFloorDays",
         cancellation_reasons AS "cancellationReasons", noshow_rule AS "noshowRule"
       FROM admin.hotel_profile LIMIT 1`,
    );
    if (profiles.rows.length > 0) {
      const profile = profiles.rows[0] as Record<string, unknown>;
      for (const [key, value] of Object.entries(profile)) {
        if (value !== null && value !== undefined) {
          values[key] = value;
        }
      }
    }
    const stored = await this.pool.query(`SELECT config_key, value FROM admin.hotel_config_values`);
    for (const row of stored.rows as { config_key: string; value: unknown }[]) {
      values[row.config_key] = row.value;
    }
    return { schemaVersion: this.schemaVersion, values };
  }

  async updateConfig(
    caller: AuthenticatedUser,
    input: { values?: unknown; updatedBy?: unknown },
  ): Promise<{ schemaVersion: number; values: Record<string, unknown> }> {
    if (caller.role === "front-desk") {
      throw new HttpError("FORBIDDEN", "Front-desk accounts cannot change hotel config.", { role: caller.role });
    }
    if (typeof input.values !== "object" || input.values === null || Array.isArray(input.values)) {
      throw new HttpError("VALIDATION_FAILED", "values must be an object.", { field: "values" });
    }
    const updatedBy = requiredString(input.updatedBy, "updatedBy");
    const entries = Object.entries(input.values as Record<string, unknown>);
    await this.withTx(async (client) => {
      for (const [key, value] of entries) {
        const column = PROFILE_COLUMNS[key];
        if (column !== undefined) {
          await client.query(`UPDATE admin.hotel_profile SET ${column} = $1, updated_by = $2, updated_at = now()`, [
            this.profileValue(key, value),
            updatedBy,
          ]);
        } else {
          await client.query(
            `INSERT INTO admin.hotel_config_values (config_key, value, schema_version, updated_by, updated_at)
             VALUES ($1, $2::jsonb, $3, $4, now())
             ON CONFLICT (config_key) DO UPDATE SET value = EXCLUDED.value,
               schema_version = EXCLUDED.schema_version, updated_by = EXCLUDED.updated_by, updated_at = now()`,
            [key, JSON.stringify(value ?? null), this.schemaVersion, updatedBy],
          );
        }
      }
    });
    return this.getConfig();
  }

  async failureCount(signinIdentity: string): Promise<number> {
    return this.failures.get(signinIdentity)?.count ?? 0;
  }

  private profileValue(key: string, value: unknown): unknown {
    switch (key) {
      case "name": {
        // The hotel's own name arrives via the deployment set
        // (issue #158); never blank it through the API.
        return requiredString(value, key);
      }
      case "retentionFloorDays": {
        const days = Number(value);
        if (!Number.isInteger(days) || days < 0) {
          throw new HttpError("VALIDATION_FAILED", "retentionFloorDays must be a non-negative integer.", {
            field: key,
          });
        }
        return days;
      }
      case "cancellationReasons":
      case "noshowRule":
        return JSON.stringify(value ?? null);
      default:
        return String(value);
    }
  }

  private async recordFailure(identity: string): Promise<void> {
    const state = this.failures.get(identity) ?? { count: 0, lockedUntil: null as number | null };
    state.count += 1;
    if (state.count >= MAX_FAILURES) {
      state.lockedUntil = Date.now() + LOCKOUT_MS;
      await this.pool.query(
        `UPDATE admin.users SET locked_until = now() + make_interval(mins => 15), updated_at = now()
         WHERE signin_identity = $1`,
        [identity],
      );
    }
    this.failures.set(identity, state);
  }
}
