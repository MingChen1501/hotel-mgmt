// Characterization for issue #326: the shared envelope schema and the
// admin error mapping agree that a locked identity is refused with
// IDENTITY_LOCKED over HTTP 401. Contract-check only validates JSON
// parse plus fixture operation names, so this test pins the mapping
// against future drift.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError, type ErrorCode } from "./errors.js";

const envelope = JSON.parse(
  readFileSync(join(__dirname, "..", "..", "..", "contracts", "errors", "envelope.json"), "utf8"),
) as {
  schema: { properties: { code: { enum: string[] } } };
  statusMapping: Record<string, number>;
};

describe("locked-identity error mapping (#326)", () => {
  it("registers IDENTITY_LOCKED in the shared envelope schema as 401", () => {
    assert.ok(envelope.schema.properties.code.enum.includes("IDENTITY_LOCKED"));
    assert.equal(envelope.statusMapping["IDENTITY_LOCKED"], 401);
  });

  it("maps every envelope status entry to the same HTTP status in code", () => {
    for (const [code, status] of Object.entries(envelope.statusMapping)) {
      assert.equal(new HttpError(code as ErrorCode, "refused").status, status, code);
    }
  });
});
