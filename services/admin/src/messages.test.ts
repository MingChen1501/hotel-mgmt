// The catalogue-coverage guard for NFR-I18N-1 on the Node stack:
// every sampled admin envelope string resolves via the catalogue,
// locale number formatting applies to integer params, and the
// default-locale rendering stays byte-identical to the legacy
// literals this catalogue replaces.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogueLocale, formatDate, formatMoney, formatNumber, loadCatalogue, msg } from "./messages.js";
import { join } from "node:path";

describe("message catalogue", () => {
  it("loads the default locale", () => {
    assert.equal(catalogueLocale(), "en");
  });

  it("renders every sampled admin message byte-identical", () => {
    const cases: Array<[string, Record<string, string | number>, string]> = [
      ["error.transport.bad_json", {}, "Request body is not valid JSON."],
      ["error.transport.body_not_object", {}, "Request body must be a JSON object."],
      ["error.transport.body_read_failed", {}, "Failed to read the request body."],
      ["error.transport.unexpected", {}, "Unexpected failure handling the request."],
      ["error.transport.unknown_path", {}, "unknown path"],
      ["error.auth.missing_token", {}, "Missing session token."],
      ["error.validation.field_required", { field: "signinIdentity" }, "signinIdentity is required."],
      ["error.validation.field_required", { field: "secret" }, "secret is required."],
      ["error.auth.locked", { identity: "owner" }, "Identity owner is locked after repeated failures."],
      ["error.auth.bad_credentials", {}, "Unknown identity or wrong secret."],
      ["error.auth.session_invalid", {}, "Invalid or expired session token."],
      ["error.auth.session_revoked", {}, "Session is revoked or signed out."],
      ["error.auth.session_idle", { idleMinutes: formatNumber(15) }, "Session ended after 15 minutes without activity."],
      ["error.auth.session_orphan", {}, "Session user no longer exists."],
      ["error.forbidden.front_desk_operation", { operation: "UpdateUserRole" }, "Front-desk accounts cannot UpdateUserRole."],
      ["error.forbidden.config_change", {}, "Front-desk accounts cannot change hotel config."],
      ["error.forbidden.user_create", {}, "Front-desk accounts cannot create users."],
      ["error.validation.unknown_role", {}, "Unknown role."],
      ["error.validation.identity_taken", { signinIdentity: "bo" }, "Sign-in identity bo is already taken."],
      ["error.validation.unknown_identity", { signinIdentity: "bo" }, "Unknown sign-in identity bo."],
      ["error.validation.own_role", {}, "You cannot change your own role."],
      ["error.validation.last_owner", { signinIdentity: "owner" }, "Cannot demote owner: the last remaining owner."],
      ["error.validation.not_locked", { signinIdentity: "bo" }, "Identity bo is not currently locked."],
      [
        "error.validation.limit_range",
        { min: formatNumber(1), max: formatNumber(200) },
        "limit must be an integer between 1 and 200.",
      ],
      ["error.validation.values_object", {}, "values must be an object."],
      ["error.validation.retention_floor", {}, "retentionFloorDays must be a non-negative integer."],
    ];
    for (const [key, params, want] of cases) {
      assert.equal(msg(key, params), want, key);
    }
  });

  it("marks unknown keys instead of rendering blank", () => {
    assert.match(msg("error.does.not_exist"), /^message-missing:/);
  });

  it("formats numbers, money, and dates per locale", () => {
    assert.equal(formatNumber(1234567, "en"), "1,234,567");
    assert.equal(formatNumber(1234567, "de"), "1.234.567");
    assert.equal(formatNumber(15, "en"), "15");
    assert.equal(formatMoney(123456, "USD", "en"), "USD 1,234.56");
    assert.equal(formatMoney(123456, "USD", "de"), "1.234,56 USD");
    assert.equal(formatDate(new Date(Date.UTC(2026, 9, 24)), "en"), "Oct 24, 2026");
    assert.notEqual(formatDate(new Date(Date.UTC(2026, 9, 24)), "de"), "Oct 24, 2026");
  });

  it("loads an explicit catalogue file", () => {
    const file = loadCatalogue(join(__dirname, "messages.en.json"));
    assert.equal(file.locale, "en");
    assert.equal(file.messages["error.auth.missing_token"], "Missing session token.");
  });
});
