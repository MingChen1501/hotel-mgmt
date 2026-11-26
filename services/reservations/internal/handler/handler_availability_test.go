package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/availability"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

// #631 request-level guards (O2..O5): these run the real availability
// client against a stubbed rooms server, so the whole seam — request
// body, HTTP call, derived ceiling, guard — is exercised.

// stubRoomsInventory answers CheckRoomTypeSellability per requested
// room type and records the caller token and body.
func stubRoomsInventory(t *testing.T, inventory map[string]map[string]any, seenAuth *string, seenBody *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/rooms/CheckRoomTypeSellability" {
			t.Errorf("rooms path = %s, want /v1/rooms/CheckRoomTypeSellability", r.URL.Path)
		}
		*seenAuth = r.Header.Get("Authorization")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("rooms stub got a non-JSON body: %v", err)
		}
		*seenBody = body
		roomType, _ := body["roomType"].(string)
		reply, ok := inventory[roomType]
		w.Header().Set("Content-Type", "application/json")
		if !ok {
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": "NOT_FOUND", "message": "Unknown room type.", "traceId": "rooms-stub",
				"details": map[string]any{"roomType": roomType},
			})
			return
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(reply)
	}))
}

// sellableReply renders the contract's reply for totalCount with the
// given blocked room numbers.
func sellableReply(roomType string, totalCount int, blocked ...string) map[string]any {
	if blocked == nil {
		blocked = []string{}
	}
	return map[string]any{
		"roomTypeId":    roomType,
		"dateFrom":      "2026-11-01",
		"dateTo":        "2026-11-03",
		"totalCount":    totalCount,
		"sellableCount": totalCount - len(blocked),
		"blockedRooms":  blocked,
	}
}

// muxOverRooms wires the real availability client for the stub's URL.
func muxOverRooms(roomsURL string) (*http.ServeMux, *store.Store) {
	return newMuxWithAvailability(availability.NewClient(roomsURL).Ceiling)
}

// TestInflatedSellableUnitsCannotOverbook is `O2` (AC-OVB-1,
// FR-OVB-1): the body's number buys no unit. Rooms records one unit and
// one confirmed hold exists, so the second create is refused CONFLICT
// naming type+dates even though it carries sellableUnits 999, and
// nothing is written.
func TestInflatedSellableUnitsCannotOverbook(t *testing.T) {
	var seenAuth string
	var seenBody map[string]any
	rooms := stubRoomsInventory(t, map[string]map[string]any{
		"deluxe-type": sellableReply("deluxe-type", 1),
	}, &seenAuth, &seenBody)
	defer rooms.Close()
	mux, st := muxOverRooms(rooms.URL)

	first := loopBody("inflated-1")
	first["sellableUnits"] = 999
	code, created := post(t, mux, "/v1/reservations/CreateReservation", first, deskToken)
	if code != http.StatusOK {
		t.Fatalf("first inflated create = %d (%v), want 200", code, created)
	}

	second := loopBody("inflated-2")
	second["sellableUnits"] = 999
	code, conflict := post(t, mux, "/v1/reservations/CreateReservation", second, deskToken)
	if code != http.StatusConflict || conflict["code"] != "CONFLICT" {
		t.Fatalf("second inflated create = %d %v, want 409 CONFLICT", code, conflict)
	}
	details, _ := conflict["details"].(map[string]any)
	if details["roomTypeId"] != "deluxe-type" || details["arrivalDate"] != "2026-11-01" || details["departureDate"] != "2026-11-03" {
		t.Fatalf("conflict details = %v, want type+dates named", conflict["details"])
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 1 {
		t.Fatalf("store holds %d reservations, want the original 1", got)
	}
	if seenAuth != deskToken {
		t.Fatalf("rooms Authorization = %q, want the caller Bearer token forwarded", seenAuth)
	}
	if seenBody["roomType"] != "deluxe-type" || seenBody["dateFrom"] != "2026-11-01" || seenBody["dateTo"] != "2026-11-03" {
		t.Fatalf("rooms request body = %v, want type+dates", seenBody)
	}
}

// TestAdvisorySellableUnitsCannotRefuseOrMalform is `O3` at request
// level: a low value and an absent value book, and a malformed value is
// VALIDATION_FAILED naming the field (never a decision).
func TestAdvisorySellableUnitsCannotRefuseOrMalform(t *testing.T) {
	mux, _ := newMuxWithAvailability(capacityHook(3))

	low := loopBody("advisory-low")
	low["sellableUnits"] = 1
	if code, body := post(t, mux, "/v1/reservations/CreateReservation", low, deskToken); code != http.StatusOK {
		t.Fatalf("low advisory create = %d (%v), want 200", code, body)
	}

	absent := loopBody("advisory-absent")
	delete(absent, "sellableUnits")
	if code, body := post(t, mux, "/v1/reservations/CreateReservation", absent, deskToken); code != http.StatusOK {
		t.Fatalf("absent advisory create = %d (%v), want 200", code, body)
	}

	for name, value := range map[string]any{"negative": -1, "string": "many", "fraction": 1.5} {
		body := loopBody("advisory-" + name)
		body["sellableUnits"] = value
		code, envelope := post(t, mux, "/v1/reservations/CreateReservation", body, deskToken)
		if code != http.StatusBadRequest || envelope["code"] != "VALIDATION_FAILED" {
			t.Fatalf("%s advisory create = %d %v, want 400 VALIDATION_FAILED", name, code, envelope)
		}
		details, _ := envelope["details"].(map[string]any)
		if details["field"] != "sellableUnits" {
			t.Fatalf("%s details = %v, want sellableUnits named", name, envelope["details"])
		}
	}
}

// TestInflatedModifyRefusedKeepsReservation is `O4` (FR-OVB-2): a
// modification into held dates or a sold-out type with sellableUnits
// 999 is refused CONFLICT and the reservation keeps its dates, type,
// guest, and price with no change-history entry.
func TestInflatedModifyRefusedKeepsReservation(t *testing.T) {
	var seenAuth string
	var seenBody map[string]any
	rooms := stubRoomsInventory(t, map[string]map[string]any{
		"deluxe-type":  sellableReply("deluxe-type", 1),
		"suite-type":   sellableReply("suite-type", 1),
		"soldout-type": sellableReply("soldout-type", 0),
	}, &seenAuth, &seenBody)
	defer rooms.Close()
	mux, st := muxOverRooms(rooms.URL)

	// The deluxe unit is held, and the moving booking sits on suite.
	holder := loopBody("modify-holder")
	if code, body := post(t, mux, "/v1/reservations/CreateReservation", holder, deskToken); code != http.StatusOK {
		t.Fatalf("holder create = %d (%v), want 200", code, body)
	}
	moving := loopBody("modify-moving")
	moving["roomTypeId"] = "suite-type"
	code, created := post(t, mux, "/v1/reservations/CreateReservation", moving, deskToken)
	if code != http.StatusOK {
		t.Fatalf("moving create = %d (%v), want 200", code, created)
	}
	ref, _ := created["reservationRef"].(string)
	changesBefore := len(st.Changes())

	for name, target := range map[string]map[string]any{
		"held-dates": {
			"reservationRef": ref, "roomTypeId": "deluxe-type",
			"arrivalDate": "2026-11-01", "departureDate": "2026-11-03",
			// The price basis is advisory and agrees with the quote the
			// fixture hook answers, so this guard stays about the
			// capacity refusal (ADR-0007 D3).
			"sellableUnits": 999, "priceBasis": map[string]any{"totalMinor": 24000},
		},
		"sold-out-type": {
			"reservationRef": ref, "roomTypeId": "soldout-type",
			"sellableUnits": 999, "priceBasis": map[string]any{"totalMinor": 24000},
		},
	} {
		code, conflict := post(t, mux, "/v1/reservations/ModifyReservation", target, deskToken)
		if code != http.StatusConflict || conflict["code"] != "CONFLICT" {
			t.Fatalf("%s modify = %d %v, want 409 CONFLICT", name, code, conflict)
		}
		code, kept := post(t, mux, "/v1/reservations/GetReservation", map[string]any{"reservationRef": ref}, deskToken)
		if code != http.StatusOK {
			t.Fatalf("GetReservation after %s refusal = %d", name, code)
		}
		if kept["roomTypeId"] != "suite-type" || kept["arrivalDate"] != "2026-11-01" || kept["departureDate"] != "2026-11-03" {
			t.Fatalf("%s refusal changed the reservation: %v", name, kept)
		}
	}
	if len(st.Changes()) != changesBefore {
		t.Fatalf("refused modifications wrote %d change row(s)", len(st.Changes())-changesBefore)
	}
}

// TestZeroCapacityIsSoldOutNotAnOutage is `O5` at request level: Rooms
// answers totalCount 2 with both rooms blocked, which is a sold-out
// CONFLICT naming type+dates, never a 503.
func TestZeroCapacityIsSoldOutNotAnOutage(t *testing.T) {
	var seenAuth string
	var seenBody map[string]any
	rooms := stubRoomsInventory(t, map[string]map[string]any{
		"blk-type": sellableReply("blk-type", 2, "101", "102"),
	}, &seenAuth, &seenBody)
	defer rooms.Close()
	mux, st := muxOverRooms(rooms.URL)

	body := loopBody("blocked-1")
	body["roomTypeId"] = "blk-type"
	code, conflict := post(t, mux, "/v1/reservations/CreateReservation", body, deskToken)
	if code != http.StatusConflict || conflict["code"] != "CONFLICT" {
		t.Fatalf("blocked create = %d %v, want 409 CONFLICT", code, conflict)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "blk-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}

// TestUnwiredCapacityRefusesBooking is the request-level half of `O6`:
// an unwired availability client refuses 503 naming rooms and the
// operation instead of allowing the booking.
func TestUnwiredCapacityRefusesBooking(t *testing.T) {
	mux, st := newMuxWithAvailability(nil)
	code, body := post(t, mux, "/v1/reservations/CreateReservation", loopBody("unwired-capacity"), deskToken)
	if code != http.StatusServiceUnavailable || body["code"] != "UPSTREAM_UNAVAILABLE" {
		t.Fatalf("unwired create = %d %v, want 503 UPSTREAM_UNAVAILABLE", code, body)
	}
	details, _ := body["details"].(map[string]any)
	if details["upstream"] != "rooms" || details["operation"] != "CheckRoomTypeSellability" {
		t.Fatalf("details = %v, want rooms/CheckRoomTypeSellability named", body["details"])
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}

// TestUnknownRoomTypeSurfacesNotFound pins the contract's `NOT_FOUND`
// 404 on both booking writes (ADR-0006 D4): Rooms refuses an unknown room
// type inside CheckRoomTypeSellability, the client surfaces that
// envelope unchanged, and nothing is written.
func TestUnknownRoomTypeSurfacesNotFound(t *testing.T) {
	var seenAuth string
	var seenBody map[string]any
	rooms := stubRoomsInventory(t, map[string]map[string]any{
		"deluxe-type": sellableReply("deluxe-type", 2),
	}, &seenAuth, &seenBody)
	defer rooms.Close()
	mux, st := muxOverRooms(rooms.URL)

	create := loopBody("unknown-type-create")
	create["roomTypeId"] = "ghost-type"
	code, body := post(t, mux, "/v1/reservations/CreateReservation", create, deskToken)
	if code != http.StatusNotFound || body["code"] != "NOT_FOUND" {
		t.Fatalf("unknown-type create = %d %v, want 404 NOT_FOUND", code, body)
	}
	details, _ := body["details"].(map[string]any)
	if details["roomType"] != "ghost-type" {
		t.Fatalf("create details = %v, want the unknown room type named", body["details"])
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "ghost-type")); got != 0 {
		t.Fatalf("store holds %d reservations after the refusal, want 0", got)
	}

	// Modify takes the same pass-through; the booking itself exists.
	code, created := post(t, mux, "/v1/reservations/CreateReservation", loopBody("unknown-type-holder"), deskToken)
	if code != http.StatusOK {
		t.Fatalf("holder create = %d (%v), want 200", code, created)
	}
	ref, _ := created["reservationRef"].(string)
	code, body = post(t, mux, "/v1/reservations/ModifyReservation", map[string]any{
		"reservationRef": ref,
		"roomTypeId":     "ghost-type",
		"priceBasis":     map[string]any{"totalMinor": 24000},
		"actor":          "front-desk",
	}, deskToken)
	if code != http.StatusNotFound || body["code"] != "NOT_FOUND" {
		t.Fatalf("unknown-type modify = %d %v, want 404 NOT_FOUND", code, body)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 1 {
		t.Fatalf("store holds %d reservations after the refused modify, want the original 1", got)
	}
}
