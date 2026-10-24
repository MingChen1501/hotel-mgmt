// The catalogue-coverage guard for NFR-I18N-1 on the Node stack:
// every sampled stay envelope string resolves via the catalogue,
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

  it("renders every sampled stay message byte-identical", () => {
    const cases: Array<[string, Record<string, string | number>, string]> = [
      ["error.transport.bad_json", {}, "Request body is not valid JSON."],
      ["error.transport.body_not_object", {}, "Request body must be a JSON object."],
      ["error.transport.body_read_failed", {}, "Failed to read the request body."],
      ["error.transport.unexpected", {}, "Unexpected failure handling the request."],
      ["error.transport.unknown_path", {}, "unknown path"],
      ["error.auth.missing_token", {}, "Missing session token."],
      ["error.validation.field_required", { field: "stayId" }, "stayId is required."],
      ["error.validation.must_be_uuid", { field: "stayId" }, "stayId must be a UUID."],
      ["stay.validation.timestamp_format", { field: "actualArrival" }, "actualArrival must be an ISO-8601 timestamp."],
      ["stay.validation.date_format", { field: "businessDate" }, "businessDate must be a YYYY-MM-DD date."],
      ["stay.validation.folio_balance", {}, "folioBalanceMinor is required and must be an integer."],
      ["stay.settlement.open_balance", {}, "The folio has an open balance and no approval is recorded."],
      ["stay.validation.approval_object", {}, "openBalanceApproval must be the recorded approval object."],
      ["stay.conflict.already_checked_in", {}, "Reservation is already checked in."],
      ["stay.notfound.stay", { stayId: "stay-1" }, "Unknown stay stay-1."],
      ["stay.notfound.stay_for_reservation", { reservationId: "RSV-1" }, "No stay for reservation RSV-1."],
      ["stay.validation.stay_or_reservation", {}, "stayId or reservationId is required."],
      ["stay.validation.unknown_state", {}, "Unknown stay state."],
      ["stay.state.not_in_house", { stayId: "stay-1", state: "closed" }, "Stay stay-1 is closed, not in house."],
      ["stay.validation.guest_in_room", {}, "The guest is already in that room."],
      ["stay.validation.departure_order", {}, "actualDeparture cannot be before actualArrival."],
      ["stay.conflict.already_moved", { stayId: "stay-1" }, "Stay stay-1 already moved under this key."],
      ["stay.state.left_in_house", { stayId: "stay-1" }, "Stay stay-1 left the in-house state mid-move."],
    ];
    for (const [key, params, want] of cases) {
      assert.equal(msg(key, params), want, key);
    }
  });

  it("marks unknown keys instead of rendering blank", () => {
    assert.match(msg("stay.does.not_exist"), /^message-missing:/);
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
