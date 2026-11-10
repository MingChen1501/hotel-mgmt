import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Pool } from "pg";
import { type FolioReader, type FolioRecord, folioUnavailable } from "./billing.js";
import { HttpError } from "./errors.js";
import { createServiceServer } from "./server.js";
import { StayStore } from "./store.js";
import { PostgresStayStore } from "./pgstore.js";

const TOKEN = "skeleton-test-token";
const RESERVATION_ID = "11111111-1111-4111-8111-111111111111";
const GUEST_ID = "33333333-3333-4333-8333-333333333333";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const ROOM2_ID = "55555555-5555-4555-8555-555555555555";
const FOLIO_ID = "44444444-4444-4444-8444-444444444444";

async function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("health", () => {
  it("answers /healthz with the service identity", async () => {
    const server = createServiceServer("stay");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/healthz");
      assert.equal(status, 200);
      assert.deepEqual(body, { service: "stay", status: "ok" });
    } finally {
      server.close();
    }
  });

  it("refuses unknown paths with the NOT_FOUND envelope", async () => {
    const server = createServiceServer("stay");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await request(port, "GET", "/v1/stay/CheckIn");
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    } finally {
      server.close();
    }
  });
});

describe("check-in", () => {
  it("checks in a reservation into an in-house stay", async () => {
    const server = createServiceServer("stay", new StayStore());
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const checked = await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      const stay = checked.body as { stayId: string; state: string };
      assert.ok(stay.stayId);
      assert.equal(stay.state, "in-house");

      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId: stay.stayId });
      assert.equal(fetched.status, 200);
      assert.equal((fetched.body as { state: string }).state, "in-house");

      const repeat = await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(repeat.status, 409);
      assert.equal((repeat.body as { code: string }).code, "CONFLICT");
    } finally {
      server.close();
    }
  });
});

const DATABASE_URL = process.env["TEST_PG_URL"];

// The #588 lab record's symptom 2(d) payload, as a named recorded
// approval: the approver identity, the recorded time, and a hotel role.
const APPROVAL = {
  approvedBy: "Manager Nam",
  role: "manager",
  reason: "Guest pays next visit",
  approvedAt: "2026-11-09T19:39:23Z",
};

interface FolioCall {
  stayId: string;
  actor: string;
  bearerToken: string;
}

type StubFolios = FolioReader & { calls: FolioCall[] };

// Stands in for Billing GetFolioBalance: the record it returns is the
// only thing the gate may decide on. A function form lets a case change
// the folio between two closes (the replay guard).
function stubFolios(record: FolioRecord | (() => Promise<FolioRecord>)): StubFolios {
  const calls: FolioCall[] = [];
  return {
    calls,
    async readFolio(stayId, actor, bearerToken) {
      calls.push({ stayId, actor, bearerToken });
      return typeof record === "function" ? await record() : record;
    },
  };
}

function settledFolio(overrides: Partial<FolioRecord> = {}): FolioRecord {
  return { folioId: FOLIO_ID, balanceMinor: 0, openBalanceApproval: null, ...overrides };
}

function checkedOutEvents(store: StayStore): unknown[] {
  return store.outboxRows().filter((row) => row.eventType === "checked-out");
}

async function checkInStay(
  port: number,
  overrides: Record<string, unknown> = {},
): Promise<{ stayId: string }> {
  const checked = await request(port, "POST", "/v1/stay/CheckIn", {
    reservationId: RESERVATION_ID,
    guestId: GUEST_ID,
    roomId: ROOM_ID,
    actor: "front-desk",
    ...overrides,
  });
  assert.equal(checked.status, 200);
  return { stayId: (checked.body as { stayId: string }).stayId };
}

async function withServer(
  store: StayStore,
  fn: (port: number, store: StayStore) => Promise<void>,
): Promise<void> {
  const server = createServiceServer("stay", store);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await fn(port, store);
  } finally {
    server.close();
  }
}

// Every case that only needs the non-gate behaviour closes a settled
// folio; the gate cases build their own reader.
async function withStayServer(fn: (port: number) => Promise<void>): Promise<void> {
  await withServer(new StayStore(stubFolios(settledFolio())), (port) => fn(port));
}

// #588 symptom 2(d) "server trust", closed by #601 (BR-46, FR-CKO-4,
// FR-CKO-5, ADR-0005): the close decides on the folio Billing holds
// and re-validates the recorded approval's provenance, so a caller
// that bypasses the desk cannot close on what it asserts. Guards
// S1-S10 of docs/testing/checkout-settlement-test-traceability.md.
describe("check-out", () => {
  it("closes a settled stay and presents the folio as the final invoice", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      assert.equal((checked.body as { state: string }).state, "closed");
      assert.equal((checked.body as { invoiceRef: string }).invoiceRef, FOLIO_ID);

      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "closed");
    });
  });

  it("refuses an open balance without a recorded approval and keeps the stay in house", async () => {
    const folios = stubFolios(settledFolio({ balanceMinor: 6000 }));
    await withServer(new StayStore(folios), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      const body = refused.body as { code: string; details: Record<string, unknown> };
      assert.equal(body.code, "SETTLEMENT_REQUIRED");
      assert.equal(body.details["reason"], "no_approval");
      assert.equal(body.details["folioId"], FOLIO_ID);

      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "in-house");
      assert.equal(checkedOutEvents(store).length, 0);
      // The read is the stay's folio, made as the caller, with the
      // caller's own Bearer token (integration C7).
      assert.deepEqual(folios.calls[0], { stayId, actor: "front-desk", bearerToken: TOKEN });
    });
  });

  it("closes a provenanced open balance for every fixed approver role", async () => {
    for (const role of ["owner", "manager", "front-desk"]) {
      const approval = { ...APPROVAL, role };
      await withServer(new StayStore(stubFolios(settledFolio({ balanceMinor: 6000, openBalanceApproval: approval }))), async (port, store) => {
        const { stayId } = await checkInStay(port);
        const checked = await request(port, "POST", "/v1/stay/CheckOut", {
          stayId,
          folioId: FOLIO_ID,
          actor: "front-desk",
        });
        assert.equal(checked.status, 200, role);
        assert.equal((checked.body as { state: string }).state, "closed");
        assert.equal((checked.body as { invoiceRef: string }).invoiceRef, FOLIO_ID);
        assert.equal(checkedOutEvents(store).length, 1);
      });
    }
  });

  it("replays the original close on the same idempotency key and refuses a second close", async () => {
    let balance = 0;
    const folios = stubFolios(async () => settledFolio({ balanceMinor: balance }));
    await withServer(new StayStore(folios), async (port) => {
      const { stayId } = await checkInStay(port);
      const first = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        idempotencyKey: "checkout-1",
        actor: "front-desk",
      });
      assert.equal(first.status, 200);
      const replay = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        idempotencyKey: "checkout-1",
        actor: "front-desk",
      });
      assert.equal(replay.status, 200);
      assert.equal((replay.body as { state: string }).state, "closed");

      const second = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        idempotencyKey: "checkout-2",
        actor: "front-desk",
      });
      assert.equal(second.status, 422);
      assert.equal((second.body as { code: string }).code, "STATE_ILLEGAL");
      balance = 6000;
    });
  });

  it("gates a replay before returning the stored close (S10)", async () => {
    let open = false;
    const folios = stubFolios(async () => settledFolio(open ? { balanceMinor: 6000 } : {}));
    await withServer(new StayStore(folios), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const first = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        idempotencyKey: "checkout-gated",
        actor: "front-desk",
      });
      assert.equal(first.status, 200);
      // A charge lands after the close: the replay re-reads the folio
      // and refuses instead of returning the stored close.
      open = true;
      const replay = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        idempotencyKey: "checkout-gated",
        actor: "front-desk",
      });
      assert.equal(replay.status, 409);
      assert.equal((replay.body as { code: string }).code, "SETTLEMENT_REQUIRED");
      assert.equal(replay.body && (replay.body as { details: { reason: string } }).details.reason, "no_approval");
      assert.equal(checkedOutEvents(store).length, 1);
    });
  });

  it("grants exactly one winner for paired simultaneous check-outs (NFR-CON-2)", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const attempts = await Promise.all([
        request(port, "POST", "/v1/stay/CheckOut", {
          stayId,
          folioId: FOLIO_ID,
          folioBalanceMinor: 0,
          idempotencyKey: "checkout-a",
          actor: "front-desk",
        }),
        request(port, "POST", "/v1/stay/CheckOut", {
          stayId,
          folioId: FOLIO_ID,
          folioBalanceMinor: 0,
          idempotencyKey: "checkout-b",
          actor: "front-desk",
        }),
      ]);
      const winners = attempts.filter((attempt) => attempt.status === 200);
      const losers = attempts.filter((attempt) => attempt.status === 422);
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.equal((losers[0]?.body as { code: string }).code, "STATE_ILLEGAL");
    });
  });

  it("ignores a forged zero balance while the folio still owes money (S1)", async () => {
    const folios = stubFolios(settledFolio({ balanceMinor: 6000 }));
    await withServer(new StayStore(folios), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      assert.equal((refused.body as { code: string }).code, "SETTLEMENT_REQUIRED");
      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "in-house");
      assert.equal(checkedOutEvents(store).length, 0);
    });
  });

  it("ignores a forged open balance when the folio is settled (S2)", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      assert.equal((checked.body as { state: string }).state, "closed");
      assert.equal((checked.body as { invoiceRef: string }).invoiceRef, FOLIO_ID);
    });
  });

  it("ignores an approval the folio does not hold (S3)", async () => {
    const folios = stubFolios(settledFolio({ balanceMinor: 6000 }));
    await withServer(new StayStore(folios), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        openBalanceApproval: APPROVAL,
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      const body = refused.body as { code: string; details: Record<string, unknown> };
      assert.equal(body.code, "SETTLEMENT_REQUIRED");
      assert.equal(body.details["reason"], "no_approval");
      assert.equal(checkedOutEvents(store).length, 0);
    });
  });

  it("refuses a recorded approval missing identity, role, or recorded time (S4)", async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["no identity", { role: "manager", approvedAt: APPROVAL.approvedAt }],
      ["blank identity", { approvedBy: "  ", role: "manager", approvedAt: APPROVAL.approvedAt }],
      ["no role", { approvedBy: APPROVAL.approvedBy, approvedAt: APPROVAL.approvedAt }],
      ["no recorded time", { approvedBy: APPROVAL.approvedBy, role: "manager" }],
      ["unparseable recorded time", { approvedBy: APPROVAL.approvedBy, role: "manager", approvedAt: "yesterday" }],
    ];
    for (const [label, approval] of cases) {
      const folios = stubFolios(settledFolio({ balanceMinor: 6000, openBalanceApproval: approval }));
      await withServer(new StayStore(folios), async (port, store) => {
        const { stayId } = await checkInStay(port);
        const refused = await request(port, "POST", "/v1/stay/CheckOut", {
          stayId,
          folioId: FOLIO_ID,
          actor: "front-desk",
        });
        assert.equal(refused.status, 409, label);
        const body = refused.body as { code: string; details: Record<string, unknown> };
        assert.equal(body.code, "SETTLEMENT_REQUIRED", label);
        assert.equal(body.details["reason"], "approval_incomplete", label);
        assert.equal(checkedOutEvents(store).length, 0, label);
      });
    }
  });

  it("refuses a recorded approval naming a role outside the fixed three (S5)", async () => {
    // The #588 evidence payload: `night-auditor` was recorded and the
    // close succeeded before #601.
    const folios = stubFolios(
      settledFolio({ balanceMinor: 120000, openBalanceApproval: { ...APPROVAL, role: "night-auditor" } }),
    );
    await withServer(new StayStore(folios), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 120000,
        openBalanceApproval: { ...APPROVAL, role: "night-auditor" },
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      const body = refused.body as { code: string; details: Record<string, unknown> };
      assert.equal(body.code, "SETTLEMENT_REQUIRED");
      assert.equal(body.details["reason"], "approval_incomplete");
      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "in-house");
      assert.equal(checkedOutEvents(store).length, 0);
    });
  });

  it("refuses a free-form recorded approval and ignores free-form request shapes (S6)", async () => {
    const folios = stubFolios(settledFolio({ balanceMinor: 6000, openBalanceApproval: "manager said yes" }));
    await withServer(new StayStore(folios), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      const body = refused.body as { code: string; details: Record<string, unknown> };
      assert.equal(body.code, "SETTLEMENT_REQUIRED");
      assert.equal(body.details["reason"], "approval_incomplete");
      assert.equal(checkedOutEvents(store).length, 0);
    });

    // A free-form request approval and a non-integer request balance
    // are ignored, not refused as bad input: the folio decides.
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const checked = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: "zero",
        openBalanceApproval: "manager said yes",
        actor: "front-desk",
      });
      assert.equal(checked.status, 200);
      assert.equal((checked.body as { state: string }).state, "closed");
    });
  });

  it("refuses a close against a folio that is not the stay's folio (S8)", async () => {
    const otherFolio = "88888888-8888-4888-8888-888888888888";
    const folios = stubFolios(settledFolio({ folioId: otherFolio }));
    await withServer(new StayStore(folios), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        actor: "front-desk",
      });
      assert.equal(refused.status, 409);
      const body = refused.body as { code: string; details: Record<string, unknown> };
      assert.equal(body.code, "CONFLICT");
      assert.equal(body.details["folioId"], FOLIO_ID);
      assert.equal(body.details["actualFolioId"], otherFolio);
      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "in-house");
      assert.equal(checkedOutEvents(store).length, 0);
    });
  });

  it("refuses fail-closed when the folio cannot be read (S9)", async () => {
    const unreadable = stubFolios(async () => {
      throw folioUnavailable();
    });
    await withServer(new StayStore(unreadable), async (port, store) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      assert.equal(refused.status, 503);
      const body = refused.body as { code: string; details: Record<string, unknown> };
      assert.equal(body.code, "UPSTREAM_UNAVAILABLE");
      assert.equal(body.details["upstream"], "billing");
      assert.equal(body.details["operation"], "GetFolioBalance");
      const fetched = await request(port, "POST", "/v1/stay/GetStay", { stayId });
      assert.equal((fetched.body as { state: string }).state, "in-house");
      assert.equal(checkedOutEvents(store).length, 0);
    });

    // Unwired client: a store built without a Billing reader refuses.
    await withServer(new StayStore(), async (port) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      assert.equal(refused.status, 503);
      assert.equal((refused.body as { code: string }).code, "UPSTREAM_UNAVAILABLE");
    });

    // A 4xx provider envelope is surfaced unchanged: a rejected
    // session stays UNAUTHENTICATED.
    const rejected = stubFolios(async () => {
      throw new HttpError("UNAUTHENTICATED", "Invalid or expired session token.", {}, 401);
    });
    await withServer(new StayStore(rejected), async (port) => {
      const { stayId } = await checkInStay(port);
      const refused = await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        actor: "front-desk",
      });
      assert.equal(refused.status, 401);
      assert.equal((refused.body as { code: string }).code, "UNAUTHENTICATED");
    });
  });
});

describe("room moves", () => {
  it("moves an in-house guest and keeps both rooms and the time in history", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const moved = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId,
        toRoomId: ROOM2_ID,
        actor: "front-desk",
      });
      assert.equal(moved.status, 200);
      assert.equal((moved.body as { roomId: string }).roomId, ROOM2_ID);
      assert.equal((moved.body as { state: string }).state, "in-house");
      const move = (moved.body as { move: { fromRoomId: string; toRoomId: string; movedAt: string } }).move;
      assert.equal(move.fromRoomId, ROOM_ID);
      assert.equal(move.toRoomId, ROOM2_ID);
      assert.ok(move.movedAt);
    });
  });

  it("refuses moves of unknown, closed, or same-room stays", async () => {
    await withStayServer(async (port) => {
      const unknown = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId: "66666666-6666-4666-8666-666666666666",
        toRoomId: ROOM2_ID,
        actor: "front-desk",
      });
      assert.equal(unknown.status, 404);

      const { stayId } = await checkInStay(port);
      const same = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId,
        toRoomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(same.status, 400);

      await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      const closed = await request(port, "POST", "/v1/stay/MoveRoom", {
        stayId,
        toRoomId: ROOM2_ID,
        actor: "front-desk",
      });
      assert.equal(closed.status, 422);
      assert.equal((closed.body as { code: string }).code, "STATE_ILLEGAL");
    });
  });
});

describe("actual times", () => {
  it("keeps off-hours arrival and departure times on the stay", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port, { actualArrival: "2026-10-24T05:30:00.000Z" });
      const kept = await request(port, "POST", "/v1/stay/RecordActualTimes", {
        stayId,
        actualDeparture: "2026-10-26T15:30:00.000Z",
        actor: "front-desk",
      });
      assert.equal(kept.status, 200);
      assert.equal((kept.body as { actualArrival: string }).actualArrival, "2026-10-24T05:30:00.000Z");
      assert.equal((kept.body as { actualDeparture: string }).actualDeparture, "2026-10-26T15:30:00.000Z");
    });
  });

  it("refuses implausible times", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port, { actualArrival: "2026-10-24T10:00:00.000Z" });
      const backwards = await request(port, "POST", "/v1/stay/RecordActualTimes", {
        stayId,
        actualDeparture: "2026-10-24T09:00:00.000Z",
        actor: "front-desk",
      });
      assert.equal(backwards.status, 400);
      assert.equal((backwards.body as { code: string }).code, "VALIDATION_FAILED");

      const malformed = await request(port, "POST", "/v1/stay/RecordActualTimes", {
        stayId,
        actualArrival: "not-a-time",
        actor: "front-desk",
      });
      assert.equal(malformed.status, 400);
    });
  });
});

describe("stay reference and daily lists", () => {
  it("reads the in-house stay link and refuses closed stays", async () => {
    await withStayServer(async (port) => {
      const { stayId } = await checkInStay(port);
      const ref = await request(port, "POST", "/v1/stay/GetStayRef", { stayId });
      assert.equal(ref.status, 200);
      assert.equal((ref.body as { roomId: string }).roomId, ROOM_ID);
      assert.equal((ref.body as { state: string }).state, "in-house");

      await request(port, "POST", "/v1/stay/CheckOut", {
        stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actor: "front-desk",
      });
      const closed = await request(port, "POST", "/v1/stay/GetStayRef", { stayId });
      assert.equal(closed.status, 422);
      assert.equal((closed.body as { code: string }).code, "STATE_ILLEGAL");
    });
  });

  it("lists arrivals, in-house stays, and departures exactly once", async () => {
    await withStayServer(async (port) => {
      const first = await checkInStay(port, { actualArrival: "2026-10-24T08:00:00.000Z" });
      await request(port, "POST", "/v1/stay/CheckIn", {
        reservationId: "77777777-7777-4777-8777-777777777777",
        guestId: GUEST_ID,
        roomId: ROOM2_ID,
        actualArrival: "2026-10-24T09:00:00.000Z",
        actor: "front-desk",
      });
      await request(port, "POST", "/v1/stay/CheckOut", {
        stayId: first.stayId,
        folioId: FOLIO_ID,
        folioBalanceMinor: 0,
        actualDeparture: "2026-10-24T11:00:00.000Z",
        actor: "front-desk",
      });
      const lists = await request(port, "POST", "/v1/stay/ListArrivalsDepartures", {
        businessDate: "2026-10-24",
      });
      assert.equal(lists.status, 200);
      assert.equal(((lists.body as { arrivals: unknown[] }).arrivals).length, 2);
      assert.equal(((lists.body as { inHouse: unknown[] }).inHouse).length, 1);
      assert.equal(((lists.body as { departures: unknown[] }).departures).length, 1);
    });
  });
});

describe("stay postgres store", { skip: DATABASE_URL === undefined || DATABASE_URL === "" }, () => {
  it("persists the in-house stay row", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM stay.outbox");
      await pool.query("DELETE FROM stay.stay_moves");
      await pool.query("DELETE FROM stay.idempotency_keys");
      await pool.query("DELETE FROM stay.stays");
      const store = new PostgresStayStore(pool);
      const stay = await store.checkIn({
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        actor: "front-desk",
      });
      assert.equal(stay.state, "in-house");
      const inHouse = await store.queryStays({ state: "in-house" });
      assert.equal(inHouse.length, 1);
      assert.equal(inHouse[0]?.id, stay.id);
      await assert.rejects(
        store.checkIn({ reservationId: RESERVATION_ID, guestId: GUEST_ID, roomId: ROOM_ID, actor: "front-desk" }),
        /already checked in/,
      );
    } finally {
      await pool.end();
    }
  });

  it("closes, moves, and times the stay row through the gated transaction (S12)", async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    try {
      await pool.query("DELETE FROM stay.outbox");
      await pool.query("DELETE FROM stay.stay_moves");
      await pool.query("DELETE FROM stay.idempotency_keys");
      await pool.query("DELETE FROM stay.stays");
      // The stored folio is the decision; the request is advisory. A
      // mutable record lets one test walk open -> settled -> open.
      let folio: FolioRecord = settledFolio({ balanceMinor: 6000 });
      const store = new PostgresStayStore(pool, stubFolios(async () => folio));
      const stay = await store.checkIn({
        reservationId: RESERVATION_ID,
        guestId: GUEST_ID,
        roomId: ROOM_ID,
        // A fixed arrival keeps the later departure plausible whatever
        // day the suite runs (the parity block is date-sensitive).
        actualArrival: "2026-10-24T10:00:00.000Z",
        actor: "front-desk",
      });
      const moved = await store.moveRoom({ stayId: stay.id, toRoomId: ROOM2_ID, actor: "front-desk" });
      assert.equal(moved.stay.currentRoomId, ROOM2_ID);
      assert.equal(moved.move.fromRoomId, ROOM_ID);
      const timed = await store.recordActualTimes({
        stayId: stay.id,
        actualDeparture: "2026-10-26T15:30:00.000Z",
        actor: "front-desk",
      });
      assert.equal(timed.actualDeparture, "2026-10-26T15:30:00.000Z");

      const checkedOutRows = async (): Promise<number> => {
        const rows = await pool.query(
          "SELECT count(*)::int AS n FROM stay.outbox WHERE event_type = 'checked-out'",
        );
        return (rows.rows[0] as { n: number }).n;
      };

      // S1 forged balance low: the folio owes 6000, the request says 0.
      await assert.rejects(
        store.checkOut({ stayId: stay.id, folioId: FOLIO_ID, folioBalanceMinor: 0, actor: "front-desk" }),
        /no approval is recorded/,
      );
      assert.equal(await checkedOutRows(), 0);
      // S3 forged approval: a well-formed request approval the folio
      // does not hold decides nothing.
      await assert.rejects(
        store.checkOut({
          stayId: stay.id,
          folioId: FOLIO_ID,
          openBalanceApproval: APPROVAL,
          actor: "front-desk",
        }),
        /no approval is recorded/,
      );
      assert.equal(await checkedOutRows(), 0);
      // S4 incomplete record: an approval without a hotel role.
      folio = settledFolio({ balanceMinor: 6000, openBalanceApproval: { approvedBy: "manager" } });
      await assert.rejects(
        store.checkOut({ stayId: stay.id, folioId: FOLIO_ID, actor: "front-desk" }),
        /no hotel role/,
      );
      assert.equal(await checkedOutRows(), 0);
      const inHouse = await store.getStay({ stayId: stay.id });
      assert.equal(inHouse.state, "in-house");

      // S2 forged balance high: the folio is settled, the request
      // asserts 6000; the close commits on the read.
      folio = settledFolio();
      const closed = await store.checkOut({
        stayId: stay.id,
        folioId: FOLIO_ID,
        folioBalanceMinor: 6000,
        idempotencyKey: "pg-checkout-1",
        actor: "front-desk",
      });
      assert.equal(closed.stay.state, "closed");
      assert.equal(closed.invoiceRef, FOLIO_ID);
      assert.equal(await checkedOutRows(), 1);
      const replayed = await store.checkOut({
        stayId: stay.id,
        folioId: FOLIO_ID,
        idempotencyKey: "pg-checkout-1",
        actor: "front-desk",
      });
      assert.equal(replayed.stay.state, "closed");
      // The gate runs before the replay: a folio that went open after
      // the first close refuses the replay instead of returning it.
      folio = settledFolio({ balanceMinor: 6000 });
      await assert.rejects(
        store.checkOut({
          stayId: stay.id,
          folioId: FOLIO_ID,
          idempotencyKey: "pg-checkout-1",
          actor: "front-desk",
        }),
        /no approval is recorded/,
      );
      assert.equal(await checkedOutRows(), 1);

      folio = settledFolio();
      await assert.rejects(
        store.checkOut({ stayId: stay.id, folioId: FOLIO_ID, actor: "front-desk" }),
        /not in house/,
      );
    } finally {
      await pool.end();
    }
  });
});
