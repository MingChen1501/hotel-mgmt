import { HttpError, type ErrorCode } from "./errors.js";
import { msg } from "./messages.js";

// Billing read seam behind CheckOut (integration C7, ADR-0005 D2,
// LLD section 21.2 step 2). Stay re-derives the folio balance and the
// recorded approval from Billing instead of trusting the request, so
// every close carries one synchronous module-to-module read. The call
// mirrors the Reservations -> Rates client
// (services/reservations/internal/pricing/client.go): POST, the
// caller's Bearer token forwarded, a bounded timeout, and a
// fail-closed UPSTREAM_UNAVAILABLE envelope when the read cannot be
// trusted.
export interface FolioRecord {
  folioId: string;
  balanceMinor: number;
  openBalanceApproval: unknown;
}

export interface FolioReader {
  /** Reads the stay's folio through Billing GetFolioBalance. */
  readFolio(stayId: string, actor: string, bearerToken: string): Promise<FolioRecord>;
}

// The 4xx envelope codes this service can surface unchanged; an
// unknown provider code is not a refusal the desk can act on, so the
// read fails closed instead (ADR-0005 D4).
const KNOWN_ERROR_CODES: ErrorCode[] = [
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "STATE_ILLEGAL",
  "SETTLEMENT_REQUIRED",
  "UPSTREAM_UNAVAILABLE",
];

const DEFAULT_TIMEOUT_MS = 5000;

// The unwired default: a store built without a Billing client refuses
// every close fail-closed instead of trusting the request (ADR-0005
// D4; index.ts wires the real client from BILLING_BASE_URL).
export const UNWIRED_FOLIOS: FolioReader = {
  async readFolio(): Promise<never> {
    throw folioUnavailable();
  },
};

/** Fail-closed refusal for an unreadable folio (ADR-0005 D4). */
export function folioUnavailable(): HttpError {
  return new HttpError("UPSTREAM_UNAVAILABLE", msg("error.upstream.folio_unavailable", {}), {
    upstream: "billing",
    operation: "GetFolioBalance",
  });
}

// BillingClient calls Billing over HTTP/JSON POST. An empty base URL is
// an unwired client: it refuses every close fail-closed rather than
// closing on an unverified balance.
export class BillingClient implements FolioReader {
  private readonly baseURL: string;
  private readonly timeoutMs: number;

  constructor(baseURL: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.baseURL = baseURL.trim().replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async readFolio(stayId: string, actor: string, bearerToken: string): Promise<FolioRecord> {
    if (this.baseURL === "") {
      throw folioUnavailable();
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(`${this.baseURL}/v1/billing/GetFolioBalance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ stayId, actor }),
        signal: controller.signal,
      });
    } catch {
      throw folioUnavailable();
    } finally {
      clearTimeout(timer);
    }
    if (response.status !== 200) {
      throw await refusalFrom(response);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await response.json();
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw folioUnavailable();
      }
      body = parsed as Record<string, unknown>;
    } catch (err) {
      if (err instanceof HttpError) {
        throw err;
      }
      throw folioUnavailable();
    }
    const folioId = body["folioId"];
    const balanceMinor = body["balanceMinor"];
    if (typeof folioId !== "string" || folioId === "" || !Number.isInteger(balanceMinor)) {
      throw folioUnavailable();
    }
    return {
      folioId,
      balanceMinor: balanceMinor as number,
      openBalanceApproval: body["openBalanceApproval"] ?? null,
    };
  }
}

// A 4xx provider envelope keeps its code and details so the desk acts
// on the same refusal (a rejected session stays UNAUTHENTICATED); 5xx,
// unknown codes, and unparseable bodies fail closed.
async function refusalFrom(response: Response): Promise<HttpError> {
  if (response.status < 400 || response.status >= 500) {
    return folioUnavailable();
  }
  let envelope: { code?: unknown; message?: unknown; details?: unknown };
  try {
    envelope = (await response.json()) as typeof envelope;
  } catch {
    return folioUnavailable();
  }
  const code = envelope.code;
  if (typeof code !== "string" || !KNOWN_ERROR_CODES.includes(code as ErrorCode)) {
    return folioUnavailable();
  }
  const details =
    typeof envelope.details === "object" && envelope.details !== null && !Array.isArray(envelope.details)
      ? (envelope.details as Record<string, unknown>)
      : {};
  return new HttpError(
    code as ErrorCode,
    typeof envelope.message === "string" && envelope.message !== "" ? envelope.message : msg("error.upstream.folio_unavailable", {}),
    details,
    response.status,
  );
}
