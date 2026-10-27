import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { extractBearer } from "./auth.js";
import { HttpError, errorEnvelope } from "./errors.js";
import { type RoomStoreAPI, RoomStore } from "./store.js";
import { msg } from "./messages.js";

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
// every other path with the shared error envelope.
export function createServiceServer(service: string, store: RoomStoreAPI = new RoomStore()): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, service, store).catch((err: unknown) => {
      if (err instanceof HttpError) {
        writeJson(res, err.status, errorEnvelope(err));
      } else {
        writeJson(res, 500, {
          code: "VALIDATION_FAILED",
          message: msg("error.transport.unexpected", {}),
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
  if (!extractBearer(req)) {
    throw new HttpError("UNAUTHENTICATED", msg("error.auth.missing_token", {}), {});
  }
  const body = await readBody(req);
  const operation = route[1];
  switch (operation) {
    case "UpsertRoomType": {
      const record = await store.upsertRoomType(body);
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
      const record = await store.upsertRoom(body);
      writeJson(res, 200, {
        id: record.id,
        number: record.number,
        roomTypeId: record.roomTypeId,
        state: record.state,
      });
      return;
    }
    case "UpdateRoomState": {
      writeJson(res, 200, await store.updateRoomState(body));
      return;
    }
    case "ListRoomsByState": {
      const rooms = await store.listRoomsByState(body["state"]);
      writeJson(res, 200, {
        state: body["state"],
        rooms: rooms.map((room) => ({
          roomId: room.id,
          number: room.number,
          roomTypeId: room.roomTypeId,
          state: room.state,
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
      writeJson(res, 200, await store.assignRoom(body));
      return;
    }
    case "ReleaseRoom": {
      writeJson(res, 200, await store.releaseRoom(body));
      return;
    }
    case "BlockRoom": {
      writeJson(res, 200, await store.blockRoom(body));
      return;
    }
    case "ReleaseBlock": {
      writeJson(res, 200, await store.releaseBlock(body));
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
