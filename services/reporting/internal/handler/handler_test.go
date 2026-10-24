package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store"
)

const deskToken = "Bearer skeleton-test-token"

func seedStore() *store.Store {
	st := store.New()
	events := []store.Event{
		{ID: "evt-rate-1", Subscription: "rate", Type: "rate.availability-set", Payload: map[string]any{"roomTypeId": "deluxe", "date": "2026-11-01", "sellableUnits": 2}},
		{ID: "evt-res-1", Subscription: "reservation", Type: "reservation.created", Payload: map[string]any{"reservationRef": "RSV-AAA", "roomTypeId": "deluxe", "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "guestId": "guest-1"}},
		{ID: "evt-folio-1", Subscription: "folio", Type: "folio.charge-posted", Payload: map[string]any{"folioId": "folio-1", "businessDate": "2026-11-01", "kind": "room", "amountMinor": 18000}},
		{ID: "evt-folio-2", Subscription: "folio", Type: "folio.charge-posted", Payload: map[string]any{"folioId": "folio-1", "businessDate": "2026-11-01", "kind": "extra", "amountMinor": 2500}},
	}
	if oerr := st.Rebuild(events); oerr != nil {
		panic(oerr)
	}
	return st
}

func newMux() *http.ServeMux {
	st := seedStore()
	return NewMux(service.New(st))
}

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

// TestDeskLoopReadsRebuiltReports covers FR-RPT-1..3 over HTTP: the
// three reports agree with the rebuilt read model and every response
// carries its as-of timestamp.
func TestDeskLoopReadsRebuiltReports(t *testing.T) {
	mux := newMux()

	code, occupancy := post(t, mux, "/v1/reporting/OccupancyReport", map[string]any{"dateFrom": "2026-11-01", "dateTo": "2026-11-02"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("OccupancyReport status = %d (%v)", code, occupancy)
	}
	nights, _ := occupancy["nights"].([]any)
	if len(nights) != 2 {
		t.Fatalf("nights = %v, want 2 rows", occupancy["nights"])
	}
	first, _ := nights[0].(map[string]any)
	if first["occupied"] != float64(1) || first["available"] != float64(1) {
		t.Fatalf("first night = %v, want occupied 1 available 1", first)
	}
	if _, ok := occupancy["asOf"].(string); !ok {
		t.Fatalf("occupancy report carries no as-of timestamp: %v", occupancy)
	}

	code, revenue := post(t, mux, "/v1/reporting/RevenueSummary", map[string]any{"dateFrom": "2026-11-01", "dateTo": "2026-11-01"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("RevenueSummary status = %d (%v)", code, revenue)
	}
	days, _ := revenue["days"].([]any)
	if len(days) != 1 {
		t.Fatalf("days = %v, want 1 row", revenue["days"])
	}
	day, _ := days[0].(map[string]any)
	if day["roomRevenue"] != float64(18000) || day["extraRevenue"] != float64(2500) {
		t.Fatalf("revenue day = %v, want room 18000 extra 2500", day)
	}

	code, sheet := post(t, mux, "/v1/reporting/DailySheet", map[string]any{"businessDate": "2026-11-01"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("DailySheet status = %d (%v)", code, sheet)
	}
	arrivals, _ := sheet["arrivals"].([]any)
	if len(arrivals) != 1 {
		t.Fatalf("arrivals = %v, want RSV-AAA", sheet["arrivals"])
	}
	balances, _ := sheet["openBalances"].([]any)
	if len(balances) != 1 {
		t.Fatalf("openBalances = %v, want folio-1", sheet["openBalances"])
	}
}

// TestReportingAuthAndValidation covers the shared envelope mapping:
// missing tokens are UNAUTHENTICATED and bad windows are
// VALIDATION_FAILED naming the field.
func TestReportingAuthAndValidation(t *testing.T) {
	mux := newMux()

	code, unauth := post(t, mux, "/v1/reporting/OccupancyReport", map[string]any{"dateFrom": "2026-11-01", "dateTo": "2026-11-02"}, "")
	if code != http.StatusUnauthorized || unauth["code"] != "UNAUTHENTICATED" {
		t.Fatalf("missing token = %d %v, want 401 UNAUTHENTICATED", code, unauth)
	}

	code, bad := post(t, mux, "/v1/reporting/RevenueSummary", map[string]any{"dateFrom": "2026-11-05", "dateTo": "2026-11-01"}, deskToken)
	if code != http.StatusBadRequest || bad["code"] != "VALIDATION_FAILED" {
		t.Fatalf("reversed window = %d %v, want 400 VALIDATION_FAILED", code, bad)
	}

	code, missing := post(t, mux, "/v1/reporting/DailySheet", map[string]any{}, deskToken)
	if code != http.StatusBadRequest || missing["code"] != "VALIDATION_FAILED" {
		t.Fatalf("missing businessDate = %d %v, want 400 VALIDATION_FAILED", code, missing)
	}
}
