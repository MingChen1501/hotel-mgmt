// Postgres parity for the two handler-side fail-closed rules that no
// store method can receive (Refs #633): a present closedToArrival must
// be a JSON boolean (RTE1), and the request totalUnits never sets the
// availability answer (RTE6). Both halves answer the same payloads as
// the in-memory store.
package store_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/handler"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

const pgDeskToken = "Bearer skeleton-test-token"

func pgHTTPDB(t *testing.T) *sql.DB {
	t.Helper()
	url := os.Getenv("TEST_PG_URL")
	if url == "" {
		t.Skip("TEST_PG_URL unset; skipping Postgres round-trip.")
	}
	db, err := store.OpenPostgres(url)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, q := range []string{
		`DELETE FROM rates.outbox`,
		`DELETE FROM rates.rate_prices`,
		`DELETE FROM rates.stay_restrictions`,
		`DELETE FROM rates.discounts`,
		`DELETE FROM rates.rate_plans`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("wipe: %v", err)
		}
	}
	return db
}

func pgPost(t *testing.T, mux http.Handler, path string, body map[string]any) (int, map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	req.Header.Set("Authorization", pgDeskToken)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var decoded map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	return rec.Code, decoded
}

func pgAssertRefusal(t *testing.T, code int, body map[string]any, wantStatus int, wantCode string, wantDetails map[string]any, wantMessage string) {
	t.Helper()
	if code != wantStatus || body["code"] != wantCode {
		t.Fatalf("refusal = %d %v, want %d %s", code, body, wantStatus, wantCode)
	}
	details, _ := body["details"].(map[string]any)
	for key, want := range wantDetails {
		if details[key] != want {
			t.Fatalf("details.%s = %v, want %v (%v)", key, details[key], want, body)
		}
	}
	if wantMessage != "" && body["message"] != wantMessage {
		t.Fatalf("message = %v, want %q", body["message"], wantMessage)
	}
	if trace, _ := body["traceId"].(string); trace == "" {
		t.Fatalf("refusal carries no traceId: %v", body)
	}
}

func pgSeedPricedPlan(t *testing.T, mux http.Handler, planName, roomTypeID string, defaultUnits *int) {
	t.Helper()
	plan := map[string]any{"name": planName, "description": "parity plan"}
	if defaultUnits != nil {
		plan["defaultUnits"] = *defaultUnits
	}
	if code, resp := pgPost(t, mux, "/v1/rates/UpsertRatePlan", plan); code != http.StatusOK {
		t.Fatalf("plan = %d %v", code, resp)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if code, resp := pgPost(t, mux, "/v1/rates/UpsertRatePrice", map[string]any{
			"ratePlanName": planName, "roomTypeId": roomTypeID, "nightDate": night, "priceMinor": 12000,
		}); code != http.StatusOK {
			t.Fatalf("price = %d %v", code, resp)
		}
	}
}

// RTE1 — the Postgres-backed handler refuses a non-boolean flag and
// stores nothing.
func TestPostgresHTTPRestrictionRefusesNonBoolean(t *testing.T) {
	db := pgHTTPDB(t)
	mux := handler.NewMux(store.NewPostgres(db))
	roomTypeID := "11111111-1111-4111-8111-111111111111"
	pgSeedPricedPlan(t, mux, "PG-BOOL", roomTypeID, nil)

	for _, raw := range []any{"true", 1} {
		code, body := pgPost(t, mux, "/v1/rates/UpsertRestriction", map[string]any{
			"roomTypeId": roomTypeID, "dateFrom": "2026-12-20", "dateTo": "2026-12-31", "closedToArrival": raw,
		})
		pgAssertRefusal(t, code, body, http.StatusBadRequest, "VALIDATION_FAILED",
			map[string]any{"field": "closedToArrival"},
			messages.Text("error.validation.must_be_boolean", map[string]string{"field": "closedToArrival"}))
	}

	var rows, events int
	if err := db.QueryRow(`SELECT count(*) FROM rates.stay_restrictions`).Scan(&rows); err != nil {
		t.Fatalf("count restrictions: %v", err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM rates.outbox WHERE aggregate = 'restriction'`).Scan(&events); err != nil {
		t.Fatalf("count restriction events: %v", err)
	}
	if rows != 0 || events != 0 {
		t.Fatalf("stay_restrictions = %d, events = %d; want 0 and 0", rows, events)
	}
	if code, allowed := pgPost(t, mux, "/v1/rates/CheckRestrictions", map[string]any{
		"roomTypeId": roomTypeID, "arrivalDate": "2026-12-24", "departureDate": "2026-12-26",
	}); code != http.StatusOK || allowed["allowed"] != true {
		t.Fatalf("refused write stored a window: %d %v", code, allowed)
	}
}

// RTE6/RTE8 — the Postgres-backed handler answers the plan default
// whatever totalUnits carries, and refuses an unknown type equally with
// or without the field.
func TestPostgresHTTPCheckSellableCountIgnoresTotalUnits(t *testing.T) {
	db := pgHTTPDB(t)
	mux := handler.NewMux(store.NewPostgres(db))
	withDefault := "55555555-5555-4555-8555-555555555555"
	four := 4
	pgSeedPricedPlan(t, mux, "PG-RACK-4", withDefault, &four)
	noDefault := "66666666-6666-4666-8666-666666666666"
	pgSeedPricedPlan(t, mux, "PG-RACK-NONE", noDefault, nil)

	countsFor := func(t *testing.T, roomTypeID string, totalUnits any, present bool) []map[string]any {
		t.Helper()
		body := map[string]any{"roomTypeId": roomTypeID, "dateFrom": "2026-11-01", "dateTo": "2026-11-03"}
		if present {
			body["totalUnits"] = totalUnits
		}
		code, resp := pgPost(t, mux, "/v1/rates/CheckSellableCount", body)
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

	for _, raw := range []any{1, int64(9223372036854775807)} {
		for _, day := range countsFor(t, withDefault, raw, true) {
			if day["sellableCount"] != float64(4) {
				t.Fatalf("totalUnits %v: sellableCount = %v, want 4", raw, day["sellableCount"])
			}
		}
	}
	for _, day := range countsFor(t, withDefault, nil, false) {
		if day["sellableCount"] != float64(4) {
			t.Fatalf("absent: sellableCount = %v, want 4", day["sellableCount"])
		}
	}
	for _, day := range countsFor(t, noDefault, 9, true) {
		if day["sellableCount"] != float64(0) {
			t.Fatalf("no default: sellableCount = %v, want 0", day["sellableCount"])
		}
	}

	unknownType := "99999999-9999-4999-8999-999999999999"
	for _, present := range []bool{true, false} {
		body := map[string]any{"roomTypeId": unknownType, "dateFrom": "2026-11-01", "dateTo": "2026-11-03"}
		if present {
			body["totalUnits"] = 5
		}
		code, resp := pgPost(t, mux, "/v1/rates/CheckSellableCount", body)
		pgAssertRefusal(t, code, resp, http.StatusNotFound, "NOT_FOUND",
			map[string]any{"roomTypeId": unknownType},
			messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": unknownType}))
	}
}
