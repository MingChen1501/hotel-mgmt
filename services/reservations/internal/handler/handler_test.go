package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

const deskToken = "Bearer skeleton-test-token"

func newMux() *http.ServeMux {
	st := store.New()
	return NewMux(service.New(st), st)
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

func loopBody(key string) map[string]any {
	return map[string]any{
		"roomTypeId":     "deluxe-type",
		"arrivalDate":    "2026-11-01",
		"departureDate":  "2026-11-03",
		"guest":          map[string]any{"guestId": "guest-1", "fullName": "An Nguyen"},
		"sellableUnits":  1,
		"priceBasis":     map[string]any{"totalMinor": 24000},
		"idempotencyKey": key,
		"actor":          "front-desk",
	}
}

func TestDeskLoopBookThenOverbookingRefused(t *testing.T) {
	mux := newMux()
	code, created := post(t, mux, "/v1/reservations/CreateReservation", loopBody("desk-loop-1"), deskToken)
	if code != http.StatusOK {
		t.Fatalf("CreateReservation status = %d (%v)", code, created)
	}
	if created["state"] != "confirmed" || created["quotedTotal"] != float64(24000) {
		t.Fatalf("created = %v, want confirmed with quoted total", created)
	}
	ref, _ := created["reservationRef"].(string)
	if ref == "" {
		t.Fatal("created reservation has no reference")
	}

	code, conflict := post(t, mux, "/v1/reservations/CreateReservation", loopBody("desk-loop-2"), deskToken)
	if code != http.StatusConflict || conflict["code"] != "CONFLICT" {
		t.Fatalf("overbooking = %d %v, want 409 CONFLICT", code, conflict)
	}

	code, fetched := post(t, mux, "/v1/reservations/GetReservation", map[string]any{"reservationRef": ref}, deskToken)
	if code != http.StatusOK || fetched["state"] != "confirmed" {
		t.Fatalf("GetReservation = %d %v, want the confirmed booking", code, fetched)
	}

	code, calendar := post(t, mux, "/v1/reservations/QueryCalendar", map[string]any{"dateFrom": "2026-11-01", "dateTo": "2026-11-03", "roomTypeId": "deluxe-type"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QueryCalendar status = %d", code)
	}
	entries, _ := calendar["reservations"].([]any)
	if len(entries) != 1 {
		t.Fatalf("calendar holds %d entries, want 1", len(entries))
	}
}

func TestRequiresSessionToken(t *testing.T) {
	mux := newMux()
	code, body := post(t, mux, "/v1/reservations/CreateReservation", loopBody("desk-loop-1"), "")
	if code != http.StatusUnauthorized || body["code"] != "UNAUTHENTICATED" {
		t.Fatalf("missing token = %d %v, want 401 UNAUTHENTICATED", code, body)
	}
}
