import type { IncomingMessage } from "node:http";

// Skeleton identity check: every /v1/* call must carry a Bearer
// session token issued by Admin SignIn. Full local HMAC validation
// with bounded revalidation (LLD section 0) lands with the identity
// hardening slice; until then presence is enforced and the token
// travels through as the audit actor fallback.
export function extractBearer(req: IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string") {
    return null;
  }
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match?.[1]?.trim() ? match[1].trim() : null;
}
