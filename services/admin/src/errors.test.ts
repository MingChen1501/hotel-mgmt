// Characterization for issue #326: the shared envelope schema and the
// admin error mapping agree that a locked identity is refused with
// IDENTITY_LOCKED over HTTP 401. Contract-check only validates JSON
// parse plus fixture operation names, so this test pins the mapping
// against future drift.
//
// Guards ERR5/ERR6 (issue #627): Admin's map is the one that carries
// every contract code (IDENTITY_LOCKED included), so this walk is the
// contract-sync guard — the enum and the map move together or the test
// is red.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HttpError, STATUS_BY_CODE, type ErrorCode } from "./errors.js";

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

describe("contract error mapping (#627)", () => {
  it("maps the internal-error, upstream, and wrong-method tokens at the contract statuses", () => {
    assert.equal(new HttpError("INTERNAL_ERROR", "refused").status, 500);
    assert.equal(new HttpError("UPSTREAM_UNAVAILABLE", "refused").status, 503);
    assert.equal(new HttpError("METHOD_NOT_ALLOWED", "refused").status, 405);
  });

  it("matches the contract enum in both directions", () => {
    assert.deepEqual(
      [...Object.keys(STATUS_BY_CODE)].sort(),
      [...envelope.schema.properties.code.enum].sort(),
    );
  });

  it("resolves no status for a token the contract does not list", () => {
    const status = new HttpError("NOT_A_CONTRACT_CODE" as ErrorCode, "x").status;
    assert.equal(status, undefined);
  });
});
