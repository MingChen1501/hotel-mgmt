import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { extractBearer } from "./auth.js";
import { HttpError, errorEnvelope } from "./errors.js";
import { type RoomStoreAPI, RoomStore } from "./store.js";
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

// createServiceServer answers GET /healthz with the module identity,
// routes POST /v1/rooms/<Operation> per contracts/http, and refuses
// every other path with the shared error envelope. It also declares
// the four finite server bounds the bundle runs with (LLD section
// 29.3, AC-BND-3), before any caller can listen on it.
export function createServiceServer(service: string, store: RoomStoreAPI = new RoomStore()): Server {
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

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  service: string,
  store: RoomStoreAPI,
): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") {
    writeJson(res, 200, { service, status: "ok" });
    return;
  }
  const route = /^POST \/v1\/rooms\/([A-Za-z]+)$/.exec(`${req.method} ${req.url?.split("?")[0] ?? ""}`);
  if (!route?.[1]) {
    writeJson(
      res,
      404,
      { code: "NOT_FOUND", message: msg("error.transport.unknown_path", {}), details: {}, traceId: randomUUID() },
    );
    return;
  }
  // The authenticated session is the audit actor on every write
  // (BR-65, #643); the extracted token is kept beside the body.
  const sessionActor = extractBearer(req);
  if (sessionActor === null) {
    throw new HttpError("UNAUTHENTICATED", msg("error.auth.missing_token", {}), {});
  }
  const body = await readBody(req, res);
  const operation = route[1];
  switch (operation) {
    case "UpsertRoomType": {
      const record = await store.upsertRoomType(body, sessionActor);
      writeJson(res, 200, {
        id: record.id,
        name: record.name,
        capacity: record.capacity,
        bedType: record.bedType,
        features: record.features,
      });
      return;
    }
    case "UpsertRoom": {
      const record = await store.upsertRoom(body, sessionActor);
      writeJson(res, 200, {
        id: record.id,
        number: record.number,
        roomTypeId: record.roomTypeId,
        state: record.state,
      });
      return;
    }
    case "UpdateRoomState": {
      writeJson(res, 200, await store.updateRoomState(body, sessionActor));
      return;
    }
    case "ListRoomsByState": {
      const rooms = await store.listRoomsByState(body["state"]);
      writeJson(res, 200, {
        state: body["state"],
        // Issue #436: expose the stored room floor as an additive
        // optional field. Rows without a floor omit it so existing
        // consumers see byte-identical payloads.
        rooms: rooms.map((room) => ({
          roomId: room.id,
          number: room.number,
          roomTypeId: room.roomTypeId,
          state: room.state,
          ...(typeof room.floor === "string" && room.floor !== "" ? { floor: room.floor } : {}),
        })),
      });
      return;
    }
    case "ListRoomTypes": {
      const types = await store.listRoomTypes();
      writeJson(res, 200, {
        roomTypes: types.map((type) => ({
          id: type.id,
          name: type.name,
          capacity: type.capacity,
          bedType: type.bedType,
        })),
      });
      return;
    }
    case "CheckRoomTypeSellability": {
      writeJson(res, 200, await store.checkSellability(body));
      return;
    }
    case "AssignRoom": {
      writeJson(res, 200, await store.assignRoom(body, sessionActor));
      return;
    }
    case "ReleaseRoom": {
      writeJson(res, 200, await store.releaseRoom(body, sessionActor));
      return;
    }
    case "BlockRoom": {
      writeJson(res, 200, await store.blockRoom(body, sessionActor));
      return;
    }
    case "ReleaseBlock": {
      writeJson(res, 200, await store.releaseBlock(body, sessionActor));
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
