// The catalogue-coverage guard for NFR-I18N-1 on the Node stack:
// every sampled guests envelope string resolves via the catalogue,
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

  it("renders every sampled guests message byte-identical", () => {
    const cases: Array<[string, Record<string, string | number>, string]> = [
      ["error.transport.bad_json", {}, "Request body is not valid JSON."],
      ["error.transport.body_not_object", {}, "Request body must be a JSON object."],
      ["error.transport.body_read_failed", {}, "Failed to read the request body."],
      ["error.transport.unexpected", {}, "Unexpected failure handling the request."],
      ["error.transport.unknown_path", {}, "unknown path"],
      ["error.auth.missing_token", {}, "Missing session token."],
      ["error.validation.field_required", { field: "guestId" }, "guestId is required."],
      ["error.validation.must_be_uuid", { field: "guestId" }, "guestId must be a UUID."],
      ["guests.validation.date_format", { field: "dates.checkIn" }, "dates.checkIn must be a YYYY-MM-DD date."],
      ["guests.validation.price_amount", {}, "price.amountMinor must be a non-negative integer."],
      ["guests.notfound.guest", { guestId: "g-1" }, "Unknown guest g-1."],
      ["error.notfound.reservation", { ref: "RSV-1" }, "Unknown reservation RSV-1."],
      ["guests.notfound.guest_by_name", { fullName: "E2E Guest" }, "Unknown guest E2E Guest."],
      ["guests.validation.guest_or_name", {}, "guestId or fullName is required."],
    ];
    for (const [key, params, want] of cases) {
      assert.equal(msg(key, params), want, key);
    }
  });

  it("marks unknown keys instead of rendering blank", () => {
    assert.match(msg("guests.does.not_exist"), /^message-missing:/);
  });

  it("formats numbers, money, and dates per locale", () => {
    assert.equal(formatNumber(1234567, "en"), "1,234,567");
    assert.equal(formatNumber(1234567, "de"), "1.234.567");
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
