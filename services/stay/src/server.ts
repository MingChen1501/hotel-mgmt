import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { extractBearer } from "./auth.js";
import { HttpError, errorEnvelope } from "./errors.js";
import { type StayStoreAPI, StayStore } from "./store.js";

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

function stayPayload(stay: {
  id: string;
  reservationId: string;
  guestId: string;
  currentRoomId: string;
  state: string;
  actualArrival: string | null;
  actualDeparture: string | null;
}): Record<string, unknown> {
  return {
    stayId: stay.id,
    reservationId: stay.reservationId,
    guestId: stay.guestId,
    roomId: stay.currentRoomId,
    state: stay.state,
    actualArrival: stay.actualArrival,
    actualDeparture: stay.actualDeparture,
  };
}

function stayRefPayload(ref: { stayId: string; guestId: string; roomId: string; state: string }): Record<string, unknown> {
  return {
    stayId: ref.stayId,
    guestId: ref.guestId,
    roomId: ref.roomId,
    state: ref.state,
  };
}

// createServiceServer answers GET /healthz with the module identity,
// routes POST /v1/stay/<Operation> per contracts/http, and refuses
// every other path with the shared error envelope.
export function createServiceServer(service: string, store: StayStoreAPI = new StayStore()): Server {
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
  store: StayStoreAPI,
): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") {
    writeJson(res, 200, { service, status: "ok" });
    return;
  }
  const route = /^POST \/v1\/stay\/([A-Za-z]+)$/.exec(`${req.method} ${req.url?.split("?")[0] ?? ""}`);
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
    case "CheckIn": {
      const stay = await store.checkIn(body);
      writeJson(res, 200, stayPayload(stay));
      return;
    }
    case "GetStay": {
      const stay = await store.getStay(body);
      writeJson(res, 200, stayPayload(stay));
      return;
    }
    case "QueryStays": {
      const stays = await store.queryStays(body);
      writeJson(res, 200, { state: body["state"] ?? null, stays: stays.map(stayPayload) });
      return;
    }
    case "CheckOut": {
      const { stay, invoiceRef } = await store.checkOut(body);
      writeJson(res, 200, { ...stayPayload(stay), invoiceRef });
      return;
    }
    case "MoveRoom": {
      const { stay, move } = await store.moveRoom(body);
      writeJson(res, 200, {
        ...stayPayload(stay),
        move: { fromRoomId: move.fromRoomId, toRoomId: move.toRoomId, movedAt: move.movedAt },
      });
      return;
    }
    case "RecordActualTimes": {
      const stay = await store.recordActualTimes(body);
      writeJson(res, 200, stayPayload(stay));
      return;
    }
    case "GetStayRef": {
      const ref = await store.getStayRef(body);
      writeJson(res, 200, stayRefPayload(ref));
      return;
    }
    case "ListArrivalsDepartures": {
      const lists = await store.listArrivalsDepartures(body);
      writeJson(res, 200, {
        businessDate: body["businessDate"] ?? null,
        arrivals: lists.arrivals.map(stayPayload),
        inHouse: lists.inHouse.map(stayPayload),
        departures: lists.departures.map(stayPayload),
      });
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
