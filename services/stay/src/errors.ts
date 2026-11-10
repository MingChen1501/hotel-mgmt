import { randomUUID } from "node:crypto";

// Shared error envelope (docs/technical/error-handling.md section 1).
export type ErrorCode =
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "STATE_ILLEGAL"
  | "SETTLEMENT_REQUIRED"
  | "UNAUTHENTICATED"
  | "UPSTREAM_UNAVAILABLE";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STATE_ILLEGAL: 422,
  SETTLEMENT_REQUIRED: 409,
  UPSTREAM_UNAVAILABLE: 503,
};

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  // status carries a surfaced provider status when a module-to-module
  // read refuses with its own envelope (integration C7); otherwise the
  // code's registered status applies.
  constructor(
    code: ErrorCode,
    message: string,
    details: Record<string, unknown> = {},
    status: number = STATUS_BY_CODE[code],
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorEnvelope(err: HttpError): Record<string, unknown> {
  return {
    code: err.code,
    message: err.message,
    details: err.details,
    traceId: randomUUID(),
  };
}
