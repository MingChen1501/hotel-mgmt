// Guards ERR5/ERR6 (issue #627): the served error map follows the one
// contract enum, so a backend fault answers INTERNAL_ERROR and a
// service cannot emit a code the contract does not list. The contract
// enum and statusMapping move first; this map must follow in the same
// change, which is what these assertions enforce.
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

// IDENTITY_LOCKED is the one code only Admin serves (AC-ERR-2); the
// three identity-less services keep it out of their maps.
const ADMIN_ONLY_CODES = ["IDENTITY_LOCKED"];

describe("contract error mapping (#627)", () => {
  it("maps the internal-error, upstream, and wrong-method tokens at the contract statuses", () => {
    assert.equal(new HttpError("INTERNAL_ERROR", "refused").status, 500);
    assert.equal(new HttpError("UPSTREAM_UNAVAILABLE", "refused").status, 503);
    assert.equal(new HttpError("METHOD_NOT_ALLOWED", "refused").status, 405);
  });

  it("maps every contract status entry it claims to the same HTTP status", () => {
    for (const [code, status] of Object.entries(envelope.statusMapping)) {
      if (ADMIN_ONLY_CODES.includes(code)) {
        assert.equal(STATUS_BY_CODE[code as ErrorCode], undefined, code);
        continue;
      }
      assert.equal(new HttpError(code as ErrorCode, "refused").status, status, code);
    }
  });

  it("matches the contract enum in both directions, minus the admin-only code", () => {
    const contractCodes = envelope.schema.properties.code.enum.filter(
      (code) => !ADMIN_ONLY_CODES.includes(code),
    );
    assert.deepEqual([...Object.keys(STATUS_BY_CODE)].sort(), [...contractCodes].sort());
  });

  it("resolves no status for a token the contract does not list", () => {
    const status = new HttpError("NOT_A_CONTRACT_CODE" as ErrorCode, "x").status;
    assert.equal(status, undefined);
  });
});
