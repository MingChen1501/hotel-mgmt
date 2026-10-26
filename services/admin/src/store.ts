import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";
import { formatNumber, msg } from "./messages.js";

// In-memory AdminService identity and config store (LLD section 8).
// Tokens are opaque HMAC-signed session tokens: the payload carries
// the session id and the signature binds it to the Admin-held key.
// Sessions expire after 15 idle minutes; identities lock after 5
// consecutive wrong secrets (NFR-SEC-2).
//
// Postgres persistence hardens in PostgresAdminStore (pgstore.ts),
// selected when DATABASE_URL is set (issue #149); both implement
// AdminStoreAPI with identical semantics. Failure counters stay in
// memory by design (the schema carries locked_until, which is
// persisted, but no per-attempt table); a restart clears the counter
// while a persisted lockout keeps holding.
export type Role = "owner" | "manager" | "front-desk";

export const ROLES: Role[] = ["owner", "manager", "front-desk"];

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const MAX_FAILURES = 5;

export interface PublicUser {
  userId: string;
  displayName: string;
  signinIdentity: string;
  role: Role;
}

export interface ListedUser extends PublicUser {
  locked: boolean;
}

export type AuditAction = "user.created" | "user.updated" | "config.updated" | "profile.updated" | "backup.reported";

export interface AuditEntry {
  at: string;
  actor: string;
  action: AuditAction;
  entity: string;
  detail?: string;
}

interface UserRecord extends PublicUser {
  secretHash: string;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
}

interface ConfigRecord {
  value: unknown;
  // Null until the first API write: seeded defaults are code
  // fallbacks, not persisted rows, so they never appear in the
  // audit view (issue #163 keeps the Later recording scope).
  updatedBy: string | null;
  updatedAt: number | null;
}

export interface SessionRecord {
  tokenId: string;
  userId: string;
  issuedAt: number;
  lastActivityAt: number;
  revoked: boolean;
}

export interface AuthenticatedUser extends PublicUser {
  tokenId: string;
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function signSessionToken(key: string, tokenId: string): string {
  const payload = Buffer.from(JSON.stringify({ tid: tokenId }), "utf8").toString("base64url");
  const signature = createHmac("sha256", key).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifySessionToken(key: string, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  const expected = createHmac("sha256", key).update(parts[0]).digest("hex");
  if (parts[1].length !== expected.length || !timingSafeEqual(Buffer.from(parts[1]), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { tid?: unknown };
    return typeof payload.tid === "string" ? payload.tid : null;
  } catch {
    return null;
  }
}

export function toPublic(user: PublicUser): PublicUser {
  return { userId: user.userId, displayName: user.displayName, signinIdentity: user.signinIdentity, role: user.role };
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field }), { field });
  }
  return value.trim();
}

// AdminStoreAPI is the contract both the in-memory store and the
// Postgres store implement (issue #149).
export interface AdminStoreAPI {
  ensureBootUser(signinIdentity: string, secret: string, displayName?: string): Promise<PublicUser>;
  signIn(signinIdentity: unknown, secret: unknown): Promise<{ token: string; user: PublicUser }>;
  authenticate(token: string): Promise<AuthenticatedUser>;
  createUser(
    caller: AuthenticatedUser,
    input: { displayName?: unknown; signinIdentity?: unknown; secret?: unknown; role?: unknown },
  ): Promise<PublicUser>;
  updateUserRole(
    caller: AuthenticatedUser,
    input: { signinIdentity?: unknown; role?: unknown },
  ): Promise<PublicUser>;
  unlockIdentity(
    caller: AuthenticatedUser,
    input: { signinIdentity?: unknown },
  ): Promise<{ signinIdentity: string; unlocked: true }>;
  signOut(caller: AuthenticatedUser): Promise<{ signedOut: true }>;
  changeSecret(
    caller: AuthenticatedUser,
    input: { currentSecret?: unknown; newSecret?: unknown },
  ): Promise<PublicUser>;
  listUsers(caller: AuthenticatedUser): Promise<{ users: ListedUser[] }>;
  queryAuditLog(
    caller: AuthenticatedUser,
    input: { limit?: unknown },
  ): Promise<{ entries: AuditEntry[] }>;
  getConfig(): Promise<{ schemaVersion: number; values: Record<string, unknown> }>;
  updateConfig(
    caller: AuthenticatedUser,
    input: { values?: unknown; updatedBy?: unknown },
  ): Promise<{ schemaVersion: number; values: Record<string, unknown> }>;
  failureCount(signinIdentity: string): Promise<number>;
}

export class AdminStore implements AdminStoreAPI {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByIdentity = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly failures = new Map<string, { count: number; lockedUntil: number | null }>();
  private readonly config = new Map<string, ConfigRecord>();
  private readonly key: string;
  readonly schemaVersion = 1;

  constructor(tokenKey?: string) {
    this.key = tokenKey ?? process.env["ADMIN_TOKEN_KEY"] ?? "dev-only-change-me";
    const seed: Record<string, unknown> = {
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
    for (const [key, value] of Object.entries(seed)) {
      this.config.set(key, { value, updatedBy: null, updatedAt: null });
    }
  }

  // User/role writes stay with owner and manager (BR-35): the owner
  // additionally controls users and hotel setup, the manager controls
  // rates, rooms, and reports, and front-desk staff operate the desk.
  private requireUserManager(caller: AuthenticatedUser, operation: string): void {
    if (caller.role === "front-desk") {
      throw new HttpError("FORBIDDEN", msg("error.forbidden.front_desk_operation", { operation }), { role: caller.role });
    }
  }

  // Bootstraps the single owner identity the desk loop signs in with.
  // Secrets are stored as hashes only, never plaintext.
  async ensureBootUser(signinIdentity: string, secret: string, displayName = "Owner"): Promise<PublicUser> {
    const existing = this.usersByIdentity.get(signinIdentity);
    if (existing) {
      return toPublic(existing);
    }
    const user: UserRecord = {
      userId: randomUUID(),
      displayName,
      signinIdentity,
      role: "owner",
      secretHash: hashSecret(secret),
      createdBy: "boot",
      createdAt: Date.now(),
      updatedBy: "boot",
      updatedAt: Date.now(),
    };
    this.users.set(user.userId, user);
    this.usersByIdentity.set(signinIdentity, user);
    return toPublic(user);
  }

  async signIn(signinIdentity: unknown, secret: unknown): Promise<{ token: string; user: PublicUser }> {
    if (typeof signinIdentity !== "string" || signinIdentity.trim() === "") {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field: "signinIdentity" }), { field: "signinIdentity" });
    }
    if (typeof secret !== "string" || secret === "") {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field: "secret" }), { field: "secret" });
    }
    const identity = signinIdentity.trim();
    const state = this.failures.get(identity);
    if (state?.lockedUntil !== null && state?.lockedUntil !== undefined && state.lockedUntil > Date.now()) {
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.locked", { identity }), {
        signinIdentity: identity,
      });
    }
    const user = this.usersByIdentity.get(identity);
    const candidate = user ? hashSecret(secret) : randomBytes(32).toString("hex");
    const expected = user?.secretHash ?? randomBytes(32).toString("hex");
    const matches =
      user !== undefined &&
      candidate.length === expected.length &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    if (!matches || !user) {
      this.recordFailure(identity);
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.bad_credentials", {}), { signinIdentity: identity });
    }
    this.failures.delete(identity);
    const tokenId = randomUUID();
    this.sessions.set(tokenId, {
      tokenId,
      userId: user.userId,
      issuedAt: Date.now(),
      lastActivityAt: Date.now(),
      revoked: false,
    });
    return { token: this.signToken(tokenId), user: toPublic(user) };
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    const tokenId = verifySessionToken(this.key, token);
    if (!tokenId) {
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.session_invalid", {}), {});
    }
    const session = this.sessions.get(tokenId);
    if (!session || session.revoked) {
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.session_revoked", {}), {});
    }
    if (Date.now() - session.lastActivityAt > IDLE_TIMEOUT_MS) {
      this.sessions.delete(tokenId);
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.session_idle", { idleMinutes: formatNumber(15) }), {});
    }
    session.lastActivityAt = Date.now();
    const user = this.users.get(session.userId);
    if (!user) {
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.session_orphan", {}), {});
    }
    return { ...toPublic(user), tokenId };
  }

  async createUser(
    caller: AuthenticatedUser,
    input: { displayName?: unknown; signinIdentity?: unknown; secret?: unknown; role?: unknown },
  ): Promise<PublicUser> {
    this.requireUserManager(caller, "create users");
    const displayName = requiredString(input.displayName, "displayName");
    const signinIdentity = requiredString(input.signinIdentity, "signinIdentity");
    if (typeof input.secret !== "string" || input.secret === "") {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field: "secret" }), { field: "secret" });
    }
    if (typeof input.role !== "string" || !ROLES.includes(input.role as Role)) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.unknown_role", {}), { role: input.role });
    }
    if (this.usersByIdentity.has(signinIdentity)) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.identity_taken", { signinIdentity }), {
        signinIdentity,
      });
    }
    const now = Date.now();
    const user: UserRecord = {
      userId: randomUUID(),
      displayName,
      signinIdentity,
      role: input.role as Role,
      secretHash: hashSecret(input.secret),
      createdBy: caller.signinIdentity,
      createdAt: now,
      updatedBy: caller.signinIdentity,
      updatedAt: now,
    };
    this.users.set(user.userId, user);
    this.usersByIdentity.set(signinIdentity, user);
    return toPublic(user);
  }

  // Owner/manager role change (FR-ADM-2). Guards: the caller can
  // never change its own role, and the last remaining owner can
  // never be demoted, so the hotel cannot lock itself out of user
  // management.
  async updateUserRole(
    caller: AuthenticatedUser,
    input: { signinIdentity?: unknown; role?: unknown },
  ): Promise<PublicUser> {
    this.requireUserManager(caller, "change user roles");
    const signinIdentity = requiredString(input.signinIdentity, "signinIdentity");
    if (typeof input.role !== "string" || !ROLES.includes(input.role as Role)) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.unknown_role", {}), { role: input.role });
    }
    const user = this.usersByIdentity.get(signinIdentity);
    if (!user) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.unknown_identity", { signinIdentity }), { signinIdentity });
    }
    if (user.userId === caller.userId) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.own_role", {}), { signinIdentity });
    }
    const nextRole = input.role as Role;
    if (user.role === "owner" && nextRole !== "owner" && !this.hasOtherOwner(user.userId)) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.last_owner", { signinIdentity }), {
        signinIdentity,
      });
    }
    user.role = nextRole;
    user.updatedBy = caller.signinIdentity;
    user.updatedAt = Date.now();
    return toPublic(user);
  }

  // Owner/manager unlock after a 5-strike lockout (NFR-SEC-2, BR-42).
  async unlockIdentity(
    caller: AuthenticatedUser,
    input: { signinIdentity?: unknown },
  ): Promise<{ signinIdentity: string; unlocked: true }> {
    this.requireUserManager(caller, "unlock identities");
    const signinIdentity = requiredString(input.signinIdentity, "signinIdentity");
    const user = this.usersByIdentity.get(signinIdentity);
    if (!user) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.unknown_identity", { signinIdentity }), { signinIdentity });
    }
    if (!this.isLocked(user)) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.not_locked", { signinIdentity }), {
        signinIdentity,
      });
    }
    this.failures.delete(signinIdentity);
    user.updatedBy = caller.signinIdentity;
    user.updatedAt = Date.now();
    return { signinIdentity, unlocked: true as const };
  }

  async signOut(caller: AuthenticatedUser): Promise<{ signedOut: true }> {
    const session = this.sessions.get(caller.tokenId);
    if (session) {
      session.revoked = true;
    }
    return { signedOut: true as const };
  }

  // Self-service secret rotation (issue #284): the caller changes
  // their own secret only, proving possession of the current one.
  // A wrong current secret is refused without touching the sign-in
  // failure counters (lockout policy unchanged); rotation changes
  // the secret, not active sessions (session handling unchanged).
  async changeSecret(
    caller: AuthenticatedUser,
    input: { currentSecret?: unknown; newSecret?: unknown },
  ): Promise<PublicUser> {
    if (typeof input.currentSecret !== "string" || input.currentSecret === "") {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field: "currentSecret" }), { field: "currentSecret" });
    }
    if (typeof input.newSecret !== "string" || input.newSecret === "") {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.field_required", { field: "newSecret" }), { field: "newSecret" });
    }
    const user = this.users.get(caller.userId);
    if (!user) {
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.session_orphan", {}), {});
    }
    const candidate = hashSecret(input.currentSecret);
    const expected = user.secretHash;
    const matches =
      candidate.length === expected.length &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    if (!matches) {
      throw new HttpError("UNAUTHENTICATED", msg("error.auth.bad_credentials", {}), { signinIdentity: user.signinIdentity });
    }
    user.secretHash = hashSecret(input.newSecret);
    user.updatedBy = caller.signinIdentity;
    user.updatedAt = Date.now();
    return toPublic(user);
  }

  async listUsers(caller: AuthenticatedUser): Promise<{ users: ListedUser[] }> {
    this.requireUserManager(caller, "list users");
    const users = [...this.users.values()]
      .map((user) => ({ ...toPublic(user), locked: this.isLocked(user) }))
      .sort((a, b) => (a.signinIdentity < b.signinIdentity ? -1 : 1));
    return { users };
  }

  // Read-only audit view over already-persisted rows (issue #163):
  // account creations/updates, config writes, nothing else. No new
  // recording semantics; the Later recording scope stays unchanged.
  async queryAuditLog(
    caller: AuthenticatedUser,
    input: { limit?: unknown },
  ): Promise<{ entries: AuditEntry[] }> {
    this.requireUserManager(caller, "read the audit log");
    const limit = input.limit === undefined ? 50 : input.limit;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.limit_range", { min: formatNumber(1), max: formatNumber(200) }), { field: "limit" });
    }
    const entries: AuditEntry[] = [];
    for (const user of this.users.values()) {
      entries.push({
        at: new Date(user.createdAt).toISOString(),
        actor: user.createdBy,
        action: "user.created",
        entity: user.signinIdentity,
        detail: `${user.displayName} (${user.role})`,
      });
      if (user.updatedAt > user.createdAt) {
        entries.push({
          at: new Date(user.updatedAt).toISOString(),
          actor: user.updatedBy,
          action: "user.updated",
          entity: user.signinIdentity,
          detail: `now ${user.role}`,
        });
      }
    }
    for (const [key, record] of this.config) {
      if (record.updatedBy !== null && record.updatedAt !== null) {
        entries.push({
          at: new Date(record.updatedAt).toISOString(),
          actor: record.updatedBy,
          action: "config.updated",
          entity: key,
        });
      }
    }
    entries.sort((a, b) => (a.at < b.at ? 1 : -1));
    return { entries: entries.slice(0, limit) };
  }

  private isLocked(user: UserRecord): boolean {
    const state = this.failures.get(user.signinIdentity);
    return state?.lockedUntil !== null && state?.lockedUntil !== undefined && state.lockedUntil > Date.now();
  }

  private hasOtherOwner(exceptUserId: string): boolean {
    for (const user of this.users.values()) {
      if (user.userId !== exceptUserId && user.role === "owner") {
        return true;
      }
    }
    return false;
  }

  async getConfig(): Promise<{ schemaVersion: number; values: Record<string, unknown> }> {
    const values: Record<string, unknown> = {};
    for (const [key, record] of this.config) {
      values[key] = record.value;
    }
    return { schemaVersion: this.schemaVersion, values };
  }

  async updateConfig(
    caller: AuthenticatedUser,
    input: { values?: unknown; updatedBy?: unknown },
  ): Promise<{ schemaVersion: number; values: Record<string, unknown> }> {
    if (caller.role === "front-desk") {
      throw new HttpError("FORBIDDEN", msg("error.forbidden.config_change", {}), { role: caller.role });
    }
    if (typeof input.values !== "object" || input.values === null || Array.isArray(input.values)) {
      throw new HttpError("VALIDATION_FAILED", msg("error.validation.values_object", {}), { field: "values" });
    }
    requiredString(input.updatedBy, "updatedBy");
    const entries = Object.entries(input.values as Record<string, unknown>);
    if ("name" in (input.values as Record<string, unknown>)) {
      // The hotel's own name arrives via the deployment set
      // (issue #158); never blank it through the API.
      requiredString((input.values as Record<string, unknown>)["name"], "name");
    }
    const now = Date.now();
    const actor = input.updatedBy as string;
    for (const [key, value] of entries) {
      this.config.set(key, { value, updatedBy: actor, updatedAt: now });
    }
    return this.getConfig();
  }

  async failureCount(signinIdentity: string): Promise<number> {
    return this.failures.get(signinIdentity)?.count ?? 0;
  }

  protected recordFailure(identity: string): void {
    const state = this.failures.get(identity) ?? { count: 0, lockedUntil: null as number | null };
    state.count += 1;
    if (state.count >= MAX_FAILURES) {
      state.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    this.failures.set(identity, state);
  }

  protected signToken(tokenId: string): string {
    return signSessionToken(this.key, tokenId);
  }
}
