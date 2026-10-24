import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { HttpError, errorEnvelope } from "./errors.js";
import { type AdminStoreAPI, AdminStore } from "./store.js";

type Body = Record<string, unknown>;

function readBody(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.trim() === "") {
        resolve({});
        return;
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) {
          reject(new HttpError("VALIDATION_FAILED", "Request body must be a JSON object.", {}));
          return;
        }
        resolve(parsed as Body);
      } catch {
        reject(new HttpError("VALIDATION_FAILED", "Request body is not valid JSON.", {}));
      }
    });
    req.on("error", () => {
      reject(new HttpError("VALIDATION_FAILED", "Failed to read the request body.", {}));
    });
  });
}

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers["authorization"];
  if (typeof header !== "string") {
    return null;
  }
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match?.[1]?.trim() ? match[1].trim() : null;
}

// createServiceServer answers GET /healthz with the module identity,
// routes POST /v1/admin/<Operation> per contracts/http, and refuses
// every other path with the shared error envelope.
export function createServiceServer(service: string, store: AdminStoreAPI = new AdminStore()): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, service, store).catch((err: unknown) => {
      if (err instanceof HttpError) {
        writeJson(res, err.status, errorEnvelope(err));
      } else {
        writeJson(res, 500, {
          code: "VALIDATION_FAILED",
          message: "Unexpected failure handling the request.",
          details: {},
          traceId: randomUUID(),
        });
      }
    });
  });
}

export async function bootStoreFromEnvironment(store: AdminStoreAPI): Promise<void> {
  const identity = process.env["ADMIN_BOOT_IDENTITY"] ?? "owner";
  const secret = process.env["ADMIN_BOOT_SECRET"] ?? "change-me";
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
      { code: "NOT_FOUND", message: "unknown path", details: {}, traceId: randomUUID() },
    );
    return;
  }
  const body = await readBody(req);
  const operation = route[1];
  if (operation === "SignIn") {
    const { token, user } = await store.signIn(body["signinIdentity"], body["secret"]);
    writeJson(res, 200, { token, ...user });
    return;
  }
  const token = bearerToken(req);
  if (!token) {
    throw new HttpError("UNAUTHENTICATED", "Missing session token.", {});
  }
  const caller = await store.authenticate(token);
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
    default: {
      writeJson(
        res,
        404,
        { code: "NOT_FOUND", message: "unknown path", details: {}, traceId: randomUUID() },
      );
    }
  }
}
