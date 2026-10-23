import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServiceServer } from "./server.js";

async function getJSON(port: number, path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: res.status, body: await res.json() };
}

describe("health", () => {
  it("answers /healthz with the service identity", async () => {
    const server = createServiceServer("stay");
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const { status, body } = await getJSON(port, "/healthz");
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
      const { status, body } = await getJSON(port, "/v1/stay/CheckIn");
      assert.equal(status, 404);
      assert.equal((body as { code: string }).code, "NOT_FOUND");
    } finally {
      server.close();
    }
  });
});
