// Client-level half of DR8 (#646): the completion client is what turns
// a Reservations reply into the reason the desk reports, so each
// failure mode the traceability row enumerates is driven here against a
// stubbed fetch — non-200 envelope code, 5xx without a usable envelope,
// aborted fetch, the 2-second timeout, and a 200 with no
// `reservationRef`. Without these cases a regression that returned
// `completed` for a 404, or blanked the reason on a timeout, would keep
// the store-level DR8 cases green.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createReservationsClient, UPSTREAM_UNAVAILABLE } from "./reservationsClient.js";

const STAY_ID = "11111111-1111-4111-8111-111111111111";
const TARGET = "http://reservations:8081/v1/reservations/CheckOutReservation";

interface FetchCall {
  url: string;
  init: RequestInit;
}

function stubFetch(
  impl: (url: string, init: RequestInit) => Promise<Response>,
): { calls: FetchCall[]; restore: () => void } {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} };
    calls.push(call);
    return impl(call.url, call.init);
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function input(overrides: { stayId?: string; actor?: string; bearerToken?: string } = {}) {
  return {
    stayId: overrides.stayId ?? STAY_ID,
    actor: overrides.actor ?? "front-desk",
    bearerToken: overrides.bearerToken ?? "desk-token",
  };
}

describe("reservations completion client", () => {
  it("posts the stay link with the caller bearer and reports the completed booking", async () => {
    const stub = stubFetch(async () => jsonResponse(200, { reservationRef: "RSV-1" }));
    try {
      const completion = await createReservationsClient("http://reservations:8081/").complete(input());
      assert.deepEqual(completion, { state: "completed", reservationRef: "RSV-1" });
      assert.equal(stub.calls.length, 1);
      assert.equal(stub.calls[0]?.url, TARGET);
      assert.equal(stub.calls[0]?.init.method, "POST");
      assert.deepEqual(JSON.parse(String(stub.calls[0]?.init.body)), { stayId: STAY_ID, actor: "front-desk" });
      const headers = stub.calls[0]?.init.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer desk-token");
      assert.equal(headers["Content-Type"], "application/json");
    } finally {
      stub.restore();
    }
  });

  it("omits the Authorization header when the caller token is blank", async () => {
    const stub = stubFetch(async () => jsonResponse(200, { reservationRef: "RSV-1" }));
    try {
      await createReservationsClient("http://reservations:8081").complete(input({ bearerToken: "  " }));
      const headers = stub.calls[0]?.init.headers as Record<string, string>;
      assert.equal(headers["Authorization"], undefined);
    } finally {
      stub.restore();
    }
  });

  it("passes a provider envelope code through as the observed reason", async () => {
    for (const [status, code] of [
      [404, "NOT_FOUND"],
      [422, "STATE_ILLEGAL"],
      [500, "STORE_UNAVAILABLE"],
    ] as const) {
      const stub = stubFetch(async () => jsonResponse(status, { code, message: "provider refusal" }));
      try {
        const completion = await createReservationsClient("http://reservations:8081").complete(input());
        assert.deepEqual(completion, { state: "not-recorded", reason: code }, `status ${status}`);
      } finally {
        stub.restore();
      }
    }
  });

  it("reports an unreadable provider body as upstream unavailable", async () => {
    const responses: Array<() => Response> = [
      () => jsonResponse(500, {}),
      () => jsonResponse(500, { code: "" }),
      () => jsonResponse(503, { code: 17 }),
      () => new Response("<html>bad gateway</html>", { status: 502, headers: { "Content-Type": "text/html" } }),
    ];
    for (const response of responses) {
      const stub = stubFetch(async () => response());
      try {
        const completion = await createReservationsClient("http://reservations:8081").complete(input());
        assert.deepEqual(completion, { state: "not-recorded", reason: UPSTREAM_UNAVAILABLE });
      } finally {
        stub.restore();
      }
    }
  });

  it("reports a 200 without a usable reservationRef as upstream unavailable", async () => {
    const bodies = [{}, { reservationRef: "" }, { reservationRef: 7 }, { reservationRef: "   " }];
    for (const body of bodies) {
      const stub = stubFetch(async () => jsonResponse(200, body));
      try {
        const completion = await createReservationsClient("http://reservations:8081").complete(input());
        assert.deepEqual(completion, { state: "not-recorded", reason: UPSTREAM_UNAVAILABLE }, JSON.stringify(body));
      } finally {
        stub.restore();
      }
    }
  });

  it("reports a transport error as upstream unavailable", async () => {
    const stub = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    try {
      const completion = await createReservationsClient("http://reservations:8081").complete(input());
      assert.deepEqual(completion, { state: "not-recorded", reason: UPSTREAM_UNAVAILABLE });
    } finally {
      stub.restore();
    }
  });

  it("aborts at the bounded wait and reports upstream unavailable", async () => {
    let aborted = false;
    const stub = stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    try {
      const started = Date.now();
      const completion = await createReservationsClient("http://reservations:8081", 20).complete(input());
      assert.equal(aborted, true);
      assert.deepEqual(completion, { state: "not-recorded", reason: UPSTREAM_UNAVAILABLE });
      assert.ok(Date.now() - started < 2000, "the call must not wait for the fetch to settle on its own");
    } finally {
      stub.restore();
    }
  });
});
