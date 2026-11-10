// Billing read seam behind the check-out gate (integration C7,
// ADR-0005 D2/D4, LLD section 21.2 steps 2-3): the transport keeps the
// provider's 4xx refusal and fails every unreadable folio closed, so a
// close can never run on an unverified balance. Guard S9's transport
// half.
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describe, it } from "node:test";
import { BillingClient } from "./billing.js";
import { HttpError } from "./errors.js";

const STAY_ID = "11111111-1111-4111-8111-111111111111";
const FOLIO_ID = "44444444-4444-4444-8444-444444444444";
const TOKEN = "session-token";

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

interface BillingRequest {
  url: string;
  authorization: string;
  body: Record<string, unknown>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function withBillingStub(
  handler: Handler,
  fn: (baseURL: string, requests: BillingRequest[]) => Promise<void>,
): Promise<void> {
  const requests: BillingRequest[] = [];
  const server = createServer((req, res) => {
    void readBody(req).then((body) => {
      requests.push({
        url: req.url ?? "",
        authorization: req.headers["authorization"] ?? "",
        body: JSON.parse(body) as Record<string, unknown>,
      });
      handler(req, body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}`, requests);
  } finally {
    server.close();
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function assertUnavailable(err: unknown): boolean {
  assert.ok(err instanceof HttpError, "an HttpError is raised");
  assert.equal(err.code, "UPSTREAM_UNAVAILABLE");
  assert.equal(err.status, 503);
  assert.deepEqual(err.details, { upstream: "billing", operation: "GetFolioBalance" });
  return true;
}

describe("billing client", () => {
  it("reads the stay's folio with the caller's Bearer token forwarded", async () => {
    await withBillingStub(
      (_req, _body, res) =>
        json(res, 200, {
          folioId: FOLIO_ID,
          stayId: STAY_ID,
          balanceMinor: 6000,
          openBalanceApproval: { approvedBy: "Manager Nam", role: "manager", approvedAt: "2026-11-09T19:39:23Z" },
          charges: [],
          payments: [],
        }),
      async (baseURL, requests) => {
        const folio = await new BillingClient(baseURL).readFolio(STAY_ID, "front-desk", TOKEN);
        assert.equal(folio.folioId, FOLIO_ID);
        assert.equal(folio.balanceMinor, 6000);
        assert.equal(requests[0]?.url, "/v1/billing/GetFolioBalance");
        assert.equal(requests[0]?.authorization, `Bearer ${TOKEN}`);
        assert.deepEqual(requests[0]?.body, { stayId: STAY_ID, actor: "front-desk" });
      },
    );
  });

  it("leaves a folio with no recorded approval null", async () => {
    await withBillingStub(
      (_req, _body, res) => json(res, 200, { folioId: FOLIO_ID, stayId: STAY_ID, balanceMinor: 0, charges: [], payments: [] }),
      async (baseURL) => {
        const folio = await new BillingClient(baseURL).readFolio(STAY_ID, "front-desk", TOKEN);
        assert.equal(folio.openBalanceApproval, null);
      },
    );
  });

  it("surfaces a 4xx provider envelope unchanged", async () => {
    await withBillingStub(
      (_req, _body, res) =>
        json(res, 401, {
          code: "UNAUTHENTICATED",
          message: "Invalid or expired session token.",
          details: {},
          traceId: "trace-1",
        }),
      async (baseURL) => {
        await assert.rejects(new BillingClient(baseURL).readFolio(STAY_ID, "front-desk", TOKEN), (err: unknown) => {
          assert.ok(err instanceof HttpError);
          assert.equal(err.code, "UNAUTHENTICATED");
          assert.equal(err.status, 401);
          assert.equal(err.message, "Invalid or expired session token.");
          return true;
        });
      },
    );
  });

  it("fails closed on a 5xx, an unknown code, and a malformed body", async () => {
    const handlers: Handler[] = [
      (_req, _body, res) => json(res, 503, { code: "UPSTREAM_UNAVAILABLE", message: "down", details: {} }),
      (_req, _body, res) => json(res, 400, { code: "SOMETHING_NEW", message: "?", details: {} }),
      (_req, _body, res) => json(res, 200, { folioId: FOLIO_ID, balanceMinor: "6000" }),
      (_req, _body, res) => json(res, 200, ["not", "an", "object"]),
    ];
    for (const handler of handlers) {
      await withBillingStub(handler, async (baseURL) => {
        await assert.rejects(
          new BillingClient(baseURL).readFolio(STAY_ID, "front-desk", TOKEN),
          assertUnavailable,
        );
      });
    }
  });

  it("fails closed on a timeout and an unreachable service", async () => {
    // A service that accepts the call and never answers.
    const silent = createServer(() => undefined);
    await new Promise<void>((resolve) => silent.listen(0, resolve));
    const port = (silent.address() as { port: number }).port;
    try {
      await assert.rejects(
        new BillingClient(`http://127.0.0.1:${port}`, 50).readFolio(STAY_ID, "front-desk", TOKEN),
        assertUnavailable,
      );
    } finally {
      silent.closeAllConnections();
      silent.close();
    }

    // Nothing listens on the port at all.
    const closed = createServer(() => undefined);
    await new Promise<void>((resolve) => closed.listen(0, resolve));
    const closedPort = (closed.address() as { port: number }).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    await assert.rejects(
      new BillingClient(`http://127.0.0.1:${closedPort}`).readFolio(STAY_ID, "front-desk", TOKEN),
      assertUnavailable,
    );
  });

  it("fails closed when the client is unwired", async () => {
    await assert.rejects(new BillingClient("").readFolio(STAY_ID, "front-desk", TOKEN), assertUnavailable);
  });
});
