// Fail-closed input guards for the Rates operations (Refs #633,
// AC-RTE-6..AC-RTE-10, FR-RTE-6..FR-RTE-10, BR-68). Every refusal is
// asserted on the shared envelope (code, details.field, plain message,
// fresh traceId) and on its stored effect: the following read still
// answers as it did, so a 4xx followed by a stored row fails the case.
package handler

import (
	"net/http"
	"strings"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

const overflowPrice = int64(9223372036854775807) // math.MaxInt64

// seedPricedPlan creates one plan and prices roomTypeID for two nights.
func seedPricedPlan(t *testing.T, mux http.Handler, planName, roomTypeID string, defaultUnits *int) {
	t.Helper()
	body := map[string]any{"name": planName, "description": "Failure-path plan"}
	if defaultUnits != nil {
		body["defaultUnits"] = *defaultUnits
	}
	if code, resp := post(t, mux, "/v1/rates/UpsertRatePlan", body, deskToken); code != http.StatusOK {
		t.Fatalf("UpsertRatePlan = %d %v", code, resp)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if code, resp := post(t, mux, "/v1/rates/UpsertRatePrice", map[string]any{"ratePlanName": planName, "roomTypeId": roomTypeID, "nightDate": night, "priceMinor": 12000}, deskToken); code != http.StatusOK {
			t.Fatalf("UpsertRatePrice = %d %v", code, resp)
		}
	}
}

func assertRefusal(t *testing.T, code int, body map[string]any, wantStatus int, wantCode string, wantDetails map[string]any, wantMessage string) string {
	t.Helper()
	if code != wantStatus {
		t.Fatalf("status = %d, want %d (%v)", code, wantStatus, body)
	}
	if body["code"] != wantCode {
		t.Fatalf("code = %v, want %s (%v)", body["code"], wantCode, body)
	}
	details, _ := body["details"].(map[string]any)
	for key, want := range wantDetails {
		if details[key] != want {
			t.Fatalf("details.%s = %v, want %v (%v)", key, details[key], want, body)
		}
	}
	message, _ := body["message"].(string)
	if wantMessage != "" && message != wantMessage {
		t.Fatalf("message = %q, want %q", message, wantMessage)
	}
	if message == "" || strings.Contains(message, wantCode) || strings.Contains(message, "VALIDATION_FAILED") || strings.Contains(message, "NOT_FOUND") || strings.Contains(message, "STATE_ILLEGAL") {
		t.Fatalf("message %q renders an envelope code or is empty", message)
	}
	trace, _ := body["traceId"].(string)
	if trace == "" {
		t.Fatalf("refusal carries no traceId: %v", body)
	}
	return trace
}

// RTE1 — a present closedToArrival must be a JSON boolean. Each
// non-boolean is refused naming the field and nothing is stored.
func TestRestrictionRefusesNonBooleanClosedToArrival(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "11111111-1111-4111-8111-111111111111"
	seedPricedPlan(t, mux, "BOOL-RACK", roomTypeID, nil)

	seen := map[string]bool{}
	for _, tc := range []struct {
		name string
		raw  any
	}{
		{"string true", "true"},
		{"number one", 1},
		{"yes", "yes"},
		{"null", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			code, body := post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{
				"roomTypeId": roomTypeID, "dateFrom": "2026-12-20", "dateTo": "2026-12-31",
				"closedToArrival": tc.raw,
			}, deskToken)
			trace := assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "closedToArrival"},
				messages.Text("error.validation.must_be_boolean", map[string]string{"field": "closedToArrival"}))
			if seen[trace] {
				t.Fatalf("traceId %q reused across refusals", trace)
			}
			seen[trace] = true
		})
	}

	// Nothing was stored: an arrival inside the window still allows.
	if code, allowed := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{
		"roomTypeId": roomTypeID, "arrivalDate": "2026-12-24", "departureDate": "2026-12-26",
	}, deskToken); code != http.StatusOK || allowed["allowed"] != true {
		t.Fatalf("refused write stored a window: %d %v", code, allowed)
	}
}

// RTE2 — the accepted booleans keep today's behaviour, and an omitted
// field stores the contract default false.
func TestRestrictionAcceptsRealBooleans(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "22222222-2222-4222-8222-222222222222"
	seedPricedPlan(t, mux, "FALSE-RACK", roomTypeID, nil)

	code, stored := post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{
		"roomTypeId": roomTypeID, "dateFrom": "2026-12-20", "dateTo": "2026-12-31", "closedToArrival": false,
	}, deskToken)
	if code != http.StatusOK || stored["closedToArrival"] != false {
		t.Fatalf("false window = %d %v, want 200 with closedToArrival false", code, stored)
	}
	if code, allowed := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{
		"roomTypeId": roomTypeID, "arrivalDate": "2026-12-24", "departureDate": "2026-12-26",
	}, deskToken); code != http.StatusOK || allowed["allowed"] != true {
		t.Fatalf("false window refused an arrival: %d %v", code, allowed)
	}

	code, omitted := post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{
		"roomTypeId": roomTypeID, "dateFrom": "2027-01-10", "dateTo": "2027-01-20",
	}, deskToken)
	if code != http.StatusOK || omitted["closedToArrival"] != false {
		t.Fatalf("omitted field = %d %v, want 200 with the default false", code, omitted)
	}
}

// RTE3 — a malformed roomTypeId is refused in the in-memory store with
// the answer the Postgres store already gives through 22P02.
func TestRestrictionRefusesMalformedRoomTypeID(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "33333333-3333-4333-8333-333333333333"
	seedPricedPlan(t, mux, "SHAPE-RACK", roomTypeID, nil)

	code, body := post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{
		"roomTypeId": "not-a-uuid", "dateFrom": "2026-12-20", "dateTo": "2026-12-31",
	}, deskToken)
	assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "roomTypeId"},
		messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))

	if code, allowed := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{
		"roomTypeId": roomTypeID, "arrivalDate": "2026-12-24", "departureDate": "2026-12-26",
	}, deskToken); code != http.StatusOK || allowed["allowed"] != true {
		t.Fatalf("refused write stored a window: %d %v", code, allowed)
	}
}

// RTE4 — a well-formed UUID no rate price row names is refused, and a
// plan defaultUnits is not a price.
func TestRestrictionRefusesUnpricedRoomType(t *testing.T) {
	mux := NewMux(store.New())
	pricedType := "44444444-4444-4444-8444-444444444444"
	seedPricedPlan(t, mux, "PRICED-RACK", pricedType, nil)

	unknownType := "99999999-9999-4999-8999-999999999999"
	code, body := post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{
		"roomTypeId": unknownType, "dateFrom": "2026-12-20", "dateTo": "2026-12-31",
	}, deskToken)
	assertRefusal(t, code, body, http.StatusNotFound, "NOT_FOUND", map[string]any{"roomTypeId": unknownType},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": unknownType}))

	// A plan that carries defaultUnits but prices neither type is not
	// a price: the write is refused as unpriced.
	if code, resp := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{
		"name": "DEFAULT-ONLY", "description": "inventory default only", "defaultUnits": 4,
	}, deskToken); code != http.StatusOK {
		t.Fatalf("plan = %d %v", code, resp)
	}
	defaultOnlyType := "88888888-8888-4888-8888-888888888888"
	code, body = post(t, mux, "/v1/rates/UpsertRestriction", map[string]any{
		"roomTypeId": defaultOnlyType, "dateFrom": "2026-12-20", "dateTo": "2026-12-31",
	}, deskToken)
	assertRefusal(t, code, body, http.StatusNotFound, "NOT_FOUND", map[string]any{"roomTypeId": defaultOnlyType},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": defaultOnlyType}))

	if code, allowed := post(t, mux, "/v1/rates/CheckRestrictions", map[string]any{
		"roomTypeId": defaultOnlyType, "arrivalDate": "2026-12-24", "departureDate": "2026-12-26",
	}, deskToken); code != http.StatusOK || allowed["allowed"] != true {
		t.Fatalf("refused write stored a window: %d %v", code, allowed)
	}
}

// RTE6 — totalUnits never sets the count, in both directions.
func TestCheckSellableCountIgnoresTotalUnits(t *testing.T) {
	mux := NewMux(store.New())
	withDefault := "55555555-5555-4555-8555-555555555555"
	four := 4
	seedPricedPlan(t, mux, "RACK-4", withDefault, &four)
	noDefault := "66666666-6666-4666-8666-666666666666"
	seedPricedPlan(t, mux, "RACK-NONE", noDefault, nil)

	countsFor := func(t *testing.T, roomTypeID string, totalUnits any, present bool) []map[string]any {
		t.Helper()
		body := map[string]any{"roomTypeId": roomTypeID, "dateFrom": "2026-11-01", "dateTo": "2026-11-03"}
		if present {
			body["totalUnits"] = totalUnits
		}
		code, resp := post(t, mux, "/v1/rates/CheckSellableCount", body, deskToken)
		if code != http.StatusOK {
			t.Fatalf("CheckSellableCount = %d %v", code, resp)
		}
		raw, _ := resp["counts"].([]any)
		out := make([]map[string]any, 0, len(raw))
		for _, entry := range raw {
			day, _ := entry.(map[string]any)
			out = append(out, day)
		}
		return out
	}

	for _, tc := range []struct {
		name string
		raw  any
	}{
		{"small value", 1},
		{"zero", 0},
		{"huge value", int64(9223372036854775807)},
	} {
		for _, day := range countsFor(t, withDefault, tc.raw, true) {
			if day["sellableCount"] != float64(4) {
				t.Fatalf("%s: sellableCount = %v, want the plan default 4", tc.name, day["sellableCount"])
			}
		}
	}
	for _, day := range countsFor(t, withDefault, nil, false) {
		if day["sellableCount"] != float64(4) {
			t.Fatalf("absent: sellableCount = %v, want the plan default 4", day["sellableCount"])
		}
	}

	for _, day := range countsFor(t, noDefault, 9, true) {
		if day["sellableCount"] != float64(0) {
			t.Fatalf("no plan default: sellableCount = %v, want 0", day["sellableCount"])
		}
	}
	for _, day := range countsFor(t, noDefault, nil, false) {
		if day["sellableCount"] != float64(0) {
			t.Fatalf("no plan default absent: sellableCount = %v, want 0", day["sellableCount"])
		}
	}
}

// RTE7 — the totalUnits shape check is unchanged and fires first.
func TestCheckSellableCountRefusesBadTotalUnitsShape(t *testing.T) {
	mux := NewMux(store.New())
	roomTypeID := "77777777-7777-4777-8777-777777777777"
	seedPricedPlan(t, mux, "SHAPE-COUNT", roomTypeID, nil)

	for _, raw := range []any{-1, "1"} {
		code, body := post(t, mux, "/v1/rates/CheckSellableCount", map[string]any{
			"roomTypeId": roomTypeID, "dateFrom": "2026-11-01", "dateTo": "2026-11-03", "totalUnits": raw,
		}, deskToken)
		assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "totalUnits"},
			messages.Text("rates.validation.total_units", nil))
	}
}

// RTE8 — an unknown type answers the same NOT_FOUND whether or not the
// request carries totalUnits.
func TestCheckSellableCountUnknownTypeAnswer(t *testing.T) {
	mux := NewMux(store.New())
	unknownType := "abcdefab-1234-4abc-8abc-abcdefabcdef"
	for _, present := range []bool{true, false} {
		body := map[string]any{"roomTypeId": unknownType, "dateFrom": "2026-11-01", "dateTo": "2026-11-03"}
		if present {
			body["totalUnits"] = 5
		}
		code, resp := post(t, mux, "/v1/rates/CheckSellableCount", body, deskToken)
		assertRefusal(t, code, resp, http.StatusNotFound, "NOT_FOUND", map[string]any{"roomTypeId": unknownType},
			messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": unknownType}))
		if _, ok := resp["counts"]; ok {
			t.Fatalf("unknown type served a count list: %v", resp)
		}
	}
}

// RTE9/RTE10 — an overflowing sum or percent multiplication refuses
// with no total and no nights in the body.
func TestQuoteRefusesOverflow(t *testing.T) {
	mux := NewMux(store.New())
	sumType := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	if code, resp := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": "SUM-OVER", "description": "overflow sum"}, deskToken); code != http.StatusOK {
		t.Fatalf("plan = %d %v", code, resp)
	}
	for _, seed := range []struct {
		night string
		price int64
	}{
		{"2026-11-01", overflowPrice},
		{"2026-11-02", 1},
	} {
		if code, resp := post(t, mux, "/v1/rates/UpsertRatePrice", map[string]any{
			"ratePlanName": "SUM-OVER", "roomTypeId": sumType, "nightDate": seed.night, "priceMinor": seed.price,
		}, deskToken); code != http.StatusOK {
			t.Fatalf("price = %d %v", code, resp)
		}
	}

	assertOverflow := func(t *testing.T, body map[string]any, code int) {
		t.Helper()
		assertRefusal(t, code, body, http.StatusUnprocessableEntity, "STATE_ILLEGAL",
			map[string]any{"field": "roomTypeId", "reason": "total_overflow"},
			messages.Text("rates.state.total_overflow", nil))
		if _, ok := body["totalMinor"]; ok {
			t.Fatalf("overflow refusal served a total: %v", body)
		}
		if _, ok := body["nights"]; ok {
			t.Fatalf("overflow refusal served a night list: %v", body)
		}
	}

	code, body := post(t, mux, "/v1/rates/QuotePrice", map[string]any{
		"roomTypeId": sumType, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03",
	}, deskToken)
	assertOverflow(t, body, code)

	// Percent multiplication: the sum survives the add but exceeds
	// MaxInt64/100, so the multiply step is the one that overflows.
	mulType := "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	if code, resp := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": "MUL-OVER", "description": "overflow percent"}, deskToken); code != http.StatusOK {
		t.Fatalf("plan = %d %v", code, resp)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if code, resp := post(t, mux, "/v1/rates/UpsertRatePrice", map[string]any{
			"ratePlanName": "MUL-OVER", "roomTypeId": mulType, "nightDate": night, "priceMinor": int64(100000000000000000),
		}, deskToken); code != http.StatusOK {
			t.Fatalf("price = %d %v", code, resp)
		}
	}
	if code, resp := post(t, mux, "/v1/rates/UpsertDiscount", map[string]any{"name": "TEN", "kind": "percent", "valueMinor": 10}, deskToken); code != http.StatusOK {
		t.Fatalf("discount = %d %v", code, resp)
	}
	code, body = post(t, mux, "/v1/rates/QuotePrice", map[string]any{
		"roomTypeId": mulType, "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "discountName": "TEN",
	}, deskToken)
	assertOverflow(t, body, code)
}

// RTE12/RTE13 — plan text bounds are counted in code points and a
// present non-string field is refused instead of stored.
func TestRatePlanTextBounds(t *testing.T) {
	mux := NewMux(store.New())

	name64 := strings.Repeat("ế", 64)
	code, stored := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": name64, "description": "boundary"}, deskToken)
	if code != http.StatusOK || stored["name"] != name64 {
		t.Fatalf("64-code-point name = %d %v, want 200 stored as sent", code, stored)
	}

	name65 := strings.Repeat("ế", 65)
	code, body := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": name65}, deskToken)
	assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "name"},
		messages.Text("rates.validation.text_length", map[string]string{"field": "name", "max": messages.Num(64)}))

	description2000 := strings.Repeat("ế", 2000)
	if code, resp := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": "DESC-OK", "description": description2000}, deskToken); code != http.StatusOK || resp["description"] != description2000 {
		t.Fatalf("2000-code-point description = %d %v, want 200 stored as sent", code, resp)
	}

	description2001 := strings.Repeat("ế", 2001)
	code, body = post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": "DESC-OVER", "description": description2001}, deskToken)
	assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "description"},
		messages.Text("rates.validation.text_length", map[string]string{"field": "description", "max": messages.Num(2000)}))

	for _, raw := range []any{5, map[string]any{"nested": true}} {
		code, body = post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": "DESC-TYPE", "description": raw}, deskToken)
		assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "description"}, "")
	}
	code, body = post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"name": 5}, deskToken)
	assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "name"},
		messages.Text("rates.validation.text_length", map[string]string{"field": "name", "max": messages.Num(64)}))

	code, body = post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"description": "no name"}, deskToken)
	assertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED", map[string]any{"field": "name"},
		messages.Text("error.validation.field_required", map[string]string{"field": "name"}))
}
