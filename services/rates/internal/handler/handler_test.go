package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

const deskToken = "Bearer skeleton-test-token"

func post(t *testing.T, mux http.Handler, path string, body map[string]any, token string) (int, map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var decoded map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	return rec.Code, decoded
}

func seedLoop(t *testing.T, mux http.Handler, roomTypeID string) {
	t.Helper()
	if code, _ := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": "Standard", "description": "Year-round", "defaultUnits": 1}, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertRatePlan status = %d", code)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		code, _ := post(t, mux, "/v1/rates/UpsertRatePrice", map[string]any{"ratePlanName": "Standard", "roomTypeId": roomTypeID, "nightDate": night, "priceMinor": 12000}, deskToken)
		if code != http.StatusOK {
			t.Fatalf("UpsertRatePrice status = %d", code)
		}
	}
}

func TestDeskLoopSetRateSearchQuote(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "11111111-1111-4111-8111-111111111111"
	seedLoop(t, mux, roomTypeID)

	code, quoted := post(t, mux, "/v1/rates/QuotePrice", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QuotePrice status = %d", code)
	}
	if quoted["totalMinor"] != float64(24000) {
		t.Fatalf("totalMinor = %v, want 24000", quoted["totalMinor"])
	}

	code, counts := post(t, mux, "/v1/rates/CheckSellableCount", map[string]any{"roomTypeId": roomTypeID, "dateFrom": "2026-11-01", "dateTo": "2026-11-03", "totalUnits": 1}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("CheckSellableCount status = %d", code)
	}
	entries, _ := counts["counts"].([]any)
	if len(entries) != 3 {
		t.Fatalf("counts has %d entries, want 3", len(entries))
	}

	code, allowed := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03"}, deskToken)
	if code != http.StatusOK || allowed["allowed"] != true {
		t.Fatalf("CheckRestrictions = %d %v, want 200 allowed", code, allowed)
	}
}

func TestQuoteAppliesNamedDiscount(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "22222222-2222-4222-8222-222222222222"
	seedLoop(t, mux, roomTypeID)
	if code, _ := post(t, mux, "/v1/rates/UpsertDiscount", map[string]any{"name": "EarlyBird", "kind": "percent", "valueMinor": 10}, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertDiscount status = %d", code)
	}
	code, quoted := post(t, mux, "/v1/rates/QuotePrice", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "discountName": "EarlyBird"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QuotePrice status = %d", code)
	}
	if quoted["totalMinor"] != float64(21600) {
		t.Fatalf("totalMinor = %v, want 21600", quoted["totalMinor"])
	}
	if quoted["discountName"] != "EarlyBird" {
		t.Fatalf("discountName = %v, want EarlyBird", quoted["discountName"])
	}

	code, denied := post(t, mux, "/v1/rates/QuotePrice", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "discountName": "NoSuchDiscount"}, deskToken)
	if code != http.StatusBadRequest || denied["code"] != "VALIDATION_FAILED" {
		t.Fatalf("unknown discount = %d %v, want 400 VALIDATION_FAILED", code, denied)
	}
}

func TestRestrictionRefusalNamesRestriction(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "33333333-3333-4333-8333-333333333333"
	seedLoop(t, mux, roomTypeID)
	if code, _ := post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{"roomTypeId": roomTypeID, "dateFrom": "2026-12-20", "dateTo": "2026-12-31", "minStay": 2}, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertRestriction status = %d", code)
	}
	code, denied := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-12-24", "departureDate": "2026-12-25"}, deskToken)
	if code != 422 || denied["code"] != "STATE_ILLEGAL" {
		t.Fatalf("violated restriction = %d %v, want 422 STATE_ILLEGAL", code, denied)
	}
	details, _ := denied["details"].(map[string]any)
	if details["restriction"] != "min-stay" {
		t.Fatalf("details = %v, want min-stay named", details)
	}
}

func TestClosedToArrivalRefusalNamesRestriction(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "44444444-4444-4444-8444-444444444444"
	seedLoop(t, mux, roomTypeID)
	if code, _ := post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{"roomTypeId": roomTypeID, "dateFrom": "2026-12-20", "dateTo": "2026-12-31", "closedToArrival": true}, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertRestriction status = %d", code)
	}
	code, denied := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-12-24", "departureDate": "2026-12-26"}, deskToken)
	if code != 422 || denied["code"] != "STATE_ILLEGAL" {
		t.Fatalf("violated restriction = %d %v, want 422 STATE_ILLEGAL", code, denied)
	}
	details, _ := denied["details"].(map[string]any)
	if details["restriction"] != "closed-to-arrival" {
		t.Fatalf("details = %v, want closed-to-arrival named", details)
	}
	// Arrival outside the closed window still passes.
	code, allowed := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03"}, deskToken)
	if code != http.StatusOK || allowed["allowed"] != true {
		t.Fatalf("outside window = %d %v, want 200 allowed", code, allowed)
	}
}

func TestQuoteAppliesAmountDiscount(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "55555555-5555-4555-8555-555555555555"
	seedLoop(t, mux, roomTypeID)
	if code, _ := post(t, mux, "/v1/rates/UpsertDiscount", map[string]any{"name": "Loyalty20", "kind": "amount", "valueMinor": 2000}, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertDiscount status = %d", code)
	}
	code, quoted := post(t, mux, "/v1/rates/QuotePrice", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "discountName": "Loyalty20"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QuotePrice status = %d", code)
	}
	if quoted["totalMinor"] != float64(22000) {
		t.Fatalf("totalMinor = %v, want 22000", quoted["totalMinor"])
	}
	if quoted["discountName"] != "Loyalty20" {
		t.Fatalf("discountName = %v, want Loyalty20", quoted["discountName"])
	}
	// An amount larger than the total floors the quote at zero.
	if code, _ := post(t, mux, "/v1/rates/UpsertDiscount", map[string]any{"name": "Comp", "kind": "amount", "valueMinor": 999999}, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertDiscount status = %d", code)
	}
	code, floored := post(t, mux, "/v1/rates/QuotePrice", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "discountName": "Comp"}, deskToken)
	if code != http.StatusOK || floored["totalMinor"] != float64(0) {
		t.Fatalf("floored quote = %d %v, want 200 with totalMinor 0", code, floored)
	}
}

func TestQuoteBreakdownSumsToTotal(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "66666666-6666-4666-8666-666666666666"
	seedLoop(t, mux, roomTypeID)
	if code, _ := post(t, mux, "/v1/rates/UpsertDiscount", map[string]any{"name": "EarlyBird", "kind": "percent", "valueMinor": 10}, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertDiscount status = %d", code)
	}
	code, quoted := post(t, mux, "/v1/rates/QuotePrice", map[string]any{"roomTypeId": roomTypeID, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "discountName": "EarlyBird"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QuotePrice status = %d", code)
	}
	nights, _ := quoted["nights"].([]any)
	if len(nights) != 2 {
		t.Fatalf("nights has %d entries, want 2", len(nights))
	}
	var undiscounted float64
	for _, entry := range nights {
		night, _ := entry.(map[string]any)
		undiscounted += night["priceMinor"].(float64)
	}
	if undiscounted != 24000 {
		t.Fatalf("nightly breakdown sums to %v, want 24000", undiscounted)
	}
	if quoted["totalMinor"] != float64(21600) {
		t.Fatalf("totalMinor = %v, want 21600", quoted["totalMinor"])
	}
	if quoted["discountName"] != "EarlyBird" {
		t.Fatalf("discountName = %v, want EarlyBird", quoted["discountName"])
	}
}

func TestRequiresSessionToken(t *testing.T) {
	mux := NewMux(store.New())
	code, body := post(t, mux, "/v1/rates/QuotePrice", map[string]any{"roomTypeId": "x", "arrivalDate": "2026-11-01", "departureDate": "2026-11-02"}, "")
	if code != http.StatusUnauthorized || body["code"] != "UNAUTHENTICATED" {
		t.Fatalf("missing token = %d %v, want 401 UNAUTHENTICATED", code, body)
	}
}
