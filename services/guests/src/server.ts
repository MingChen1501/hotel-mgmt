import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { extractBearer } from "./auth.js";
import { HttpError, errorEnvelope } from "./errors.js";
import { type GuestStoreAPI, GuestStore } from "./store.js";

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

// createServiceServer answers GET /healthz with the module identity,
// routes POST /v1/guests/<Operation> per contracts/http, and refuses
// every other path with the shared error envelope.
export function createServiceServer(service: string, store: GuestStoreAPI = new GuestStore()): Server {
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

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  service: string,
  store: GuestStoreAPI,
): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") {
    writeJson(res, 200, { service, status: "ok" });
    return;
  }
  const route = /^POST \/v1\/guests\/([A-Za-z]+)$/.exec(`${req.method} ${req.url?.split("?")[0] ?? ""}`);
  if (!route?.[1]) {
    writeJson(
      res,
      404,
      { code: "NOT_FOUND", message: "unknown path", details: {}, traceId: randomUUID() },
    );
    return;
  }
  if (!extractBearer(req)) {
    throw new HttpError("UNAUTHENTICATED", "Missing session token.", {});
  }
  const body = await readBody(req);
  const operation = route[1];
  switch (operation) {
    case "UpsertGuest": {
      const guest = await store.upsertGuest(body);
      writeJson(res, 200, {
        guestId: guest.id,
        fullName: guest.fullName,
        contact: guest.contact,
        preferences: guest.preferences,
        notes: guest.notes,
        returningFlag: guest.returningFlag,
        pastStayCount: guest.pastStayCount,
      });
      return;
    }
    case "IdentifyGuest": {
      const guest = await store.identifyGuest(body);
      writeJson(res, 200, {
        guestId: guest.id,
        fullName: guest.fullName,
        contact: guest.contact,
        preferences: guest.preferences,
        notes: guest.notes,
        returningFlag: guest.returningFlag,
        pastStayCount: guest.pastStayCount,
        stayLinks: guest.stayLinks,
      });
      return;
    }
    case "GetBookingContext": {
      writeJson(res, 200, await store.getBookingContext(body));
      return;
    }
    case "GetGuest": {
      const profile = await store.getGuest(body);
      writeJson(res, 200, {
        guestId: profile.id,
        fullName: profile.fullName,
        contact: profile.contact,
        preferences: profile.preferences,
        notes: profile.notes,
        returningFlag: profile.returningFlag,
        pastStayCount: profile.pastStayCount,
        stayLinks: profile.stayLinks,
        mandatoryFieldStatus: profile.mandatoryFieldStatus,
      });
      return;
    }
    case "ProduceConfirmation": {
      writeJson(res, 200, await store.produceConfirmation(body));
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
