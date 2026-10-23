import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.js";

// In-memory AdminService identity and config store (LLD section 8).
// Tokens are opaque HMAC-signed session tokens: the payload carries
// the session id and the signature binds it to the Admin-held key.
// Sessions expire after 15 idle minutes; identities lock after 5
// consecutive wrong secrets (NFR-SEC-2). Postgres persistence of
// users, sessions, and config values hardens in a later slice.
export type Role = "owner" | "manager" | "front-desk";

export const ROLES: Role[] = ["owner", "manager", "front-desk"];

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export interface PublicUser {
  userId: string;
  displayName: string;
  signinIdentity: string;
  role: Role;
}

interface UserRecord extends PublicUser {
  secretHash: string;
}

interface SessionRecord {
  tokenId: string;
  userId: string;
  issuedAt: number;
  lastActivityAt: number;
  revoked: boolean;
}

export interface AuthenticatedUser extends PublicUser {
  tokenId: string;
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export class AdminStore {
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByIdentity = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly failures = new Map<string, { count: number; lockedUntil: number | null }>();
  private readonly config = new Map<string, unknown>();
  private readonly key: string;
  readonly schemaVersion = 1;

  constructor(tokenKey?: string) {
    this.key = tokenKey ?? process.env["ADMIN_TOKEN_KEY"] ?? "dev-only-change-me";
    this.config.set("timezone", "UTC");
    this.config.set("standardCheckinTime", "14:00");
    this.config.set("standardCheckoutTime", "12:00");
    this.config.set("retentionFloorDays", 365);
    this.config.set("requiredGuestFields", ["fullName"]);
    this.config.set("cancellationReasons", []);
    this.config.set("noshowRule", {});
    this.config.set("approvalRule", { required: false });
  }

  // Bootstraps the single owner identity the desk loop signs in with.
  // Secrets are stored as hashes only, never plaintext.
  ensureBootUser(signinIdentity: string, secret: string, displayName = "Owner"): PublicUser {
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
    };
    this.users.set(user.userId, user);
    this.usersByIdentity.set(signinIdentity, user);
    return toPublic(user);
  }

  signIn(signinIdentity: unknown, secret: unknown): { token: string; user: PublicUser } {
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
    const user = this.usersByIdentity.get(identity);
    const candidate = user ? hashSecret(secret) : randomBytes(32).toString("hex");
    const expected = user?.secretHash ?? randomBytes(32).toString("hex");
    const matches =
      user !== undefined &&
      candidate.length === expected.length &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
    if (!matches || !user) {
      this.recordFailure(identity);
      throw new HttpError("UNAUTHENTICATED", "Unknown identity or wrong secret.", { signinIdentity: identity });
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

  authenticate(token: string): AuthenticatedUser {
    const tokenId = this.verifyToken(token);
    if (!tokenId) {
      throw new HttpError("UNAUTHENTICATED", "Invalid or expired session token.", {});
    }
    const session = this.sessions.get(tokenId);
    if (!session || session.revoked) {
      throw new HttpError("UNAUTHENTICATED", "Session is revoked or signed out.", {});
    }
    if (Date.now() - session.lastActivityAt > IDLE_TIMEOUT_MS) {
      this.sessions.delete(tokenId);
      throw new HttpError("UNAUTHENTICATED", "Session ended after 15 minutes without activity.", {});
    }
    session.lastActivityAt = Date.now();
    const user = this.users.get(session.userId);
    if (!user) {
      throw new HttpError("UNAUTHENTICATED", "Session user no longer exists.", {});
    }
    return { ...toPublic(user), tokenId };
  }

  createUser(
    caller: AuthenticatedUser,
    input: { displayName?: unknown; signinIdentity?: unknown; secret?: unknown; role?: unknown },
  ): PublicUser {
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
    if (this.usersByIdentity.has(signinIdentity)) {
      throw new HttpError("VALIDATION_FAILED", `Sign-in identity ${signinIdentity} is already taken.`, {
        signinIdentity,
      });
    }
    const user: UserRecord = {
      userId: randomUUID(),
      displayName,
      signinIdentity,
      role: input.role as Role,
      secretHash: hashSecret(input.secret),
    };
    this.users.set(user.userId, user);
    this.usersByIdentity.set(signinIdentity, user);
    return toPublic(user);
  }

  getConfig(): { schemaVersion: number; values: Record<string, unknown> } {
    return { schemaVersion: this.schemaVersion, values: Object.fromEntries(this.config) };
  }

  updateConfig(
    caller: AuthenticatedUser,
    input: { values?: unknown; updatedBy?: unknown },
  ): { schemaVersion: number; values: Record<string, unknown> } {
    if (caller.role === "front-desk") {
      throw new HttpError("FORBIDDEN", "Front-desk accounts cannot change hotel config.", { role: caller.role });
    }
    if (typeof input.values !== "object" || input.values === null || Array.isArray(input.values)) {
      throw new HttpError("VALIDATION_FAILED", "values must be an object.", { field: "values" });
    }
    requiredString(input.updatedBy, "updatedBy");
    for (const [key, value] of Object.entries(input.values as Record<string, unknown>)) {
      this.config.set(key, value);
    }
    return this.getConfig();
  }

  failureCount(signinIdentity: string): number {
    return this.failures.get(signinIdentity)?.count ?? 0;
  }

  private recordFailure(identity: string): void {
    const state = this.failures.get(identity) ?? { count: 0, lockedUntil: null as number | null };
    state.count += 1;
    if (state.count >= MAX_FAILURES) {
      state.lockedUntil = Date.now() + LOCKOUT_MS;
    }
    this.failures.set(identity, state);
  }

  private signToken(tokenId: string): string {
    const payload = Buffer.from(JSON.stringify({ tid: tokenId }), "utf8").toString("base64url");
    const signature = createHmac("sha256", this.key).update(payload).digest("hex");
    return `${payload}.${signature}`;
  }

  private verifyToken(token: string): string | null {
    const parts = token.split(".");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }
    const expected = createHmac("sha256", this.key).update(parts[0]).digest("hex");
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
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError("VALIDATION_FAILED", `${field} is required.`, { field });
  }
  return value.trim();
}

function toPublic(user: UserRecord): PublicUser {
  return { userId: user.userId, displayName: user.displayName, signinIdentity: user.signinIdentity, role: user.role };
}
