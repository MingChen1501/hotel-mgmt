// CFG20 (#639, AC-CFG-5, FR-CFG-3, audit finding A5): the module-local
// `src/auth.ts` helper replaces the service's own Bearer regex and
// changes no answer. This guard drives the same header forms through
// the helper and through a session-guarded operation, so a "simplified"
// rule that accepts `bearer tok` or rejects surrounding whitespace
// fails here; it also proves the parse exists once and imports nothing
// across a service boundary.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { describe, it } from "node:test";
import { extractBearer } from "./auth.js";
import { createServiceServer } from "./server.js";
import { msg } from "./messages.js";
import { AdminStore } from "./store.js";

function fakeRequest(authorization?: string): IncomingMessage {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) {
    headers["authorization"] = authorization;
  }
  return { headers } as unknown as IncomingMessage;
}

async function post(
  port: number,
  path: string,
  authorization: string | undefined,
  body: unknown,
): Promise<{ status: number; body: { code?: string; message?: string; token?: string } }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authorization !== undefined) {
    headers["Authorization"] = authorization;
  }
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as { code?: string; message?: string; token?: string } };
}

describe("module-local bearer helper (#639)", () => {
  it("accepts and refuses exactly the header forms the service did before (CFG20)", async () => {
    const store = new AdminStore("test-key");
    await store.ensureBootUser("owner", "owner-secret");
    const server = createServiceServer("admin", store);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const signin = await post(port, "/v1/admin/SignIn", undefined, {
        signinIdentity: "owner",
        secret: "owner-secret",
      });
      assert.equal(signin.status, 200);
      const token = signin.body.token as string;

      // The helper's own answer per form, and the same form through a
      // session-guarded operation: an accepted form resolves the
      // session (200) and a refused one answers today's missing-token
      // 401.
      const cases: Array<{ form: string | undefined; token: string | null; status: number }> = [
        { form: `Bearer ${token}`, token, status: 200 },
        { form: `Bearer  ${token} `, token, status: 200 },
        { form: `bearer ${token}`, token: null, status: 401 },
        { form: "Bearer ", token: null, status: 401 },
        { form: undefined, token: null, status: 401 },
        { form: `Basic ${token}`, token: null, status: 401 },
      ];
      for (const { form, token: want, status } of cases) {
        assert.equal(extractBearer(fakeRequest(form)), want, `helper answer for ${JSON.stringify(form)}`);
        const answer = await post(port, "/v1/admin/GetHotelConfig", form, {});
        assert.equal(answer.status, status, `server answer for ${JSON.stringify(form)}`);
        if (status === 401) {
          assert.equal(answer.body.code, "UNAUTHENTICATED");
          assert.equal(answer.body.message, msg("error.auth.missing_token", {}));
        }
      }
    } finally {
      server.close();
    }
  });

  it("carries the helper once, module-locally, with no cross-service import (CFG20)", () => {
    const src = join(__dirname, "..", "src");
    const serverSource = readFileSync(join(src, "server.ts"), "utf8");
    const authSource = readFileSync(join(src, "auth.ts"), "utf8");
    assert.match(serverSource, /from "\.\/auth\.js"/);
    assert.ok(!/authorization"\];\s*\n\s*if \(typeof header !== "string"\)/.test(serverSource), "the inline Bearer parse is gone");
    assert.match(authSource, /export function extractBearer/);
    for (const source of [serverSource, authSource]) {
      assert.ok(!/from "\.\.\/\.\.\//.test(source), "no import leaves the admin module");
      assert.ok(!/services\/(guests|stay|rooms)\//.test(source), "no import crosses a service boundary");
    }
  });
});
