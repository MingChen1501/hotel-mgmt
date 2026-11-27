import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { extractBearer } from "./auth.js";
import { HttpError, errorEnvelope } from "./errors.js";
import { type AdminStoreAPI, type AuthenticatedUser } from "./store.js";
import { msg } from "./messages.js";

type Body = Record<string, unknown>;

// MAX_BODY_BYTES is the one request-body ceiling this service declares
// (LLD section 29.1, NFR-BND-2): a code constant, never configuration.
// It is 18.6 times the largest request schema the contracts hold, so
// every desk payload sits far below it.
export const MAX_BODY_BYTES = 65536;

function bodyTooLarge(): HttpError {
  return new HttpError("VALIDATION_FAILED", msg("error.transport.body_too_large", {}), { field: "body" });
}

// readBody reads the request body under the declared ceiling: it
// refuses a declared content-length above it before the first chunk,
// stops accumulating at byte 65 537, and tells the connection to close
// after the answer so the unread surplus is never buffered whole
// (LLD section 29.1, AC-BND-1).
function readBody(req: IncomingMessage, res: ServerResponse): Promise<Body> {
  return new Promise((resolve, reject) => {
    const refused = (err: HttpError): void => {
      res.setHeader("Connection", "close");
      reject(err);
    };
    const declared = req.headers["content-length"];
    if (declared !== undefined && !Number.isNaN(Number(declared)) && Number(declared) > MAX_BODY_BYTES) {
      refused(bodyTooLarge());
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let overLimit = false;
    req.on("data", (chunk: Buffer) => {
      if (overLimit) {
        return;
      }
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        overLimit = true;
        chunks.length = 0;
        req.pause();
        refused(bodyTooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (overLimit) {
        return;
      }
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.trim() === "") {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) {
          reject(new HttpError("VALIDATION_FAILED", msg("error.transport.body_not_object", {}), {}));
          return;
        }
        resolve(parsed as Body);
      } catch {
        reject(new HttpError("VALIDATION_FAILED", msg("error.transport.bad_json", {}), {}));
      }
    });
    req.on("error", () => {
      reject(new HttpError("VALIDATION_FAILED", msg("error.transport.body_read_failed", {}), {}));
    });
  });
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

// closeWithoutBody tells the connection to close when the answer is
// decided before the request body is read (LLD section 33.1, BR-64):
// the payload is never buffered whole, never measured, and the socket
// is not reused with an unread body pending.
function closeWithoutBody(res: ServerResponse): void {
  res.setHeader("Connection", "close");
}

// createServiceServer answers GET /healthz with the module identity,
// routes POST /v1/admin/<Operation> per contracts/http, and refuses
// every other path with the shared error envelope. It also declares
// the four finite server bounds the bundle runs with (LLD section
// 29.3, AC-BND-3), before any caller can listen on it.
export function createServiceServer(service: string, store: AdminStoreAPI): Server {
  const server = createServer((req, res) => {
    void handleRequest(req, res, service, store).catch((err: unknown) => {
      if (err instanceof HttpError) {
        writeJson(res, err.status, errorEnvelope(err));
      } else {
        writeJson(res, 500, {
          code: "INTERNAL_ERROR",
          message: msg("error.transport.unexpected", {}),
          details: {},
          traceId: randomUUID(),
        });
      }
    });
  });
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.timeout = 15000;
  server.keepAliveTimeout = 10000;
  return server;
}

export async function bootStoreFromEnvironment(
  store: AdminStoreAPI,
  identity: string,
  secret: string,
): Promise<void> {
  await store.ensureBootUser(identity, secret);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  service: string,
  store: AdminStoreAPI,
): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") {
    writeJson(res, 200, { service, status: "ok" });
    return;
  }
  const route = /^POST \/v1\/admin\/([A-Za-z]+)$/.exec(`${req.method} ${req.url?.split("?")[0] ?? ""}`);
  if (!route?.[1]) {
    writeJson(
      res,
      404,
      { code: "NOT_FOUND", message: msg("error.transport.unknown_path", {}), details: {}, traceId: randomUUID() },
    );
    return;
  }
  const operation = route[1];
  if (operation === "SignIn") {
    // SignIn is the one operation with no session to check, so it
    // keeps its own body read and its 400-first order (BR-64).
    const body = await readBody(req, res);
    const { token, user } = await store.signIn(body["signinIdentity"], body["secret"]);
    writeJson(res, 200, { token, ...user });
    return;
  }
  // Every other operation resolves the session before the body is
  // read (BR-64): an unauthenticated request is answered 401 and its
  // payload is never read or parsed, so its size, shape, and fields
  // stay unobservable. The order is 401, then 400, then 403.
  const token = extractBearer(req);
  if (!token) {
    closeWithoutBody(res);
    throw new HttpError("UNAUTHENTICATED", msg("error.auth.missing_token", {}), {});
  }
  let caller: AuthenticatedUser;
  try {
    caller = await store.authenticate(token);
  } catch (err: unknown) {
    closeWithoutBody(res);
    throw err;
  }
  const body = await readBody(req, res);
  switch (operation) {
    case "GetHotelConfig": {
      writeJson(res, 200, await store.getConfig());
      return;
    }
    case "UpdateHotelConfig": {
      writeJson(res, 200, await store.updateConfig(caller, body));
      return;
    }
    case "CreateUser": {
      writeJson(res, 200, await store.createUser(caller, body));
      return;
    }
    case "UpdateUserRole": {
      writeJson(res, 200, await store.updateUserRole(caller, body));
      return;
    }
    case "UnlockIdentity": {
      writeJson(res, 200, await store.unlockIdentity(caller, body));
      return;
    }
    case "SignOut": {
      writeJson(res, 200, await store.signOut(caller));
      return;
    }
    case "ChangeSecret": {
      writeJson(res, 200, await store.changeSecret(caller, body));
      return;
    }
    case "ListUsers": {
      writeJson(res, 200, await store.listUsers(caller));
      return;
    }
    case "QueryAuditLog": {
      writeJson(res, 200, await store.queryAuditLog(caller, body));
      return;
    }
    default: {
      writeJson(
        res,
        404,
        { code: "NOT_FOUND", message: msg("error.transport.unknown_path", {}), details: {}, traceId: randomUUID() },
      );
    }
  }
}
