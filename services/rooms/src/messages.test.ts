// The catalogue-coverage guard for NFR-I18N-1 on the Node stack:
// every sampled rooms envelope string resolves via the catalogue,
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

  it("renders every sampled rooms message byte-identical", () => {
    const cases: Array<[string, Record<string, string | number>, string]> = [
      ["error.transport.bad_json", {}, "Request body is not valid JSON."],
      ["error.transport.body_not_object", {}, "Request body must be a JSON object."],
      ["error.transport.body_read_failed", {}, "Failed to read the request body."],
      ["error.transport.unexpected", {}, "Unexpected failure handling the request."],
      ["error.transport.unknown_path", {}, "unknown path"],
      ["error.auth.missing_token", {}, "Missing session token."],
      ["error.validation.field_required", { field: "roomType" }, "roomType is required."],
      ["rooms.validation.date_format", { field: "dateFrom" }, "dateFrom must be a YYYY-MM-DD date."],
      ["rooms.notfound.room_type", { roomType: "Deluxe" }, "Unknown room type Deluxe."],
      ["rooms.notfound.room", { roomNumber: "101" }, "Unknown room 101."],
      ["rooms.validation.unknown_state", {}, "Unknown state value."],
      ["error.validation.date_range_order", {}, "dateTo is before dateFrom."],
      ["rooms.state.room_blocked", { roomNumber: "101" }, "Room 101 is blocked for the requested dates."],
      ["rooms.state.room_blocked_on", { roomNumber: "101", businessDate: "2026-11-01" }, "Room 101 is blocked on 2026-11-01."],
      ["rooms.conflict.room_taken", { roomNumber: "101" }, "Room 101 was just taken."],
      ["rooms.state.room_not_ready", { roomNumber: "101", state: "dirty" }, "Room 101 is dirty, not ready."],
      ["rooms.state.room_not_occupied", { roomNumber: "101", state: "vacant-clean" }, "Room 101 is vacant-clean, not occupied."],
      ["rooms.validation.release_occupied", {}, "Release target cannot be occupied."],
      ["rooms.state.room_occupied", { roomNumber: "101" }, "Room 101 is occupied and cannot be blocked."],
      ["rooms.validation.duplicate_block", {}, "Identical block already exists."],
      ["rooms.state.illegal_transition", { roomNumber: "101", oldState: "vacant-clean", newState: "occupied" }, "Cannot move room 101 from vacant-clean to occupied."],
      ["rooms.state.no_covering_block", { roomNumber: "101", dateFrom: "2026-11-01", dateTo: "2026-11-03" }, "Room 101 has no block covering 2026-11-01 to 2026-11-03."],
    ];
    for (const [key, params, want] of cases) {
      assert.equal(msg(key, params), want, key);
    }
  });

  it("marks unknown keys instead of rendering blank", () => {
    assert.match(msg("rooms.does.not_exist"), /^message-missing:/);
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
