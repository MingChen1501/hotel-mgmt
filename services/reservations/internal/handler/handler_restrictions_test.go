package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/pricing"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

// stubRatesRefusal answers CheckRestrictions with one canned envelope so
// the booking path below runs against the real rates contract shape.
func stubRatesRefusal(t *testing.T, status int, envelope map[string]any, seenAuth *string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/rates/CheckRestrictions" {
			t.Errorf("rates path = %s, want /v1/rates/CheckRestrictions", r.URL.Path)
		}
		*seenAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(envelope)
	}))
}

// TestBookPathRefusesRestrictedStayEndToEnd wires the production
// hook (pricing client over HTTP) into the real booking route: a
// closed-to-arrival violation is refused with the restriction named
// in the envelope, and nothing is stored.
func TestBookPathRefusesRestrictedStayEndToEnd(t *testing.T) {
	var seenAuth string
	rates := stubRatesRefusal(t, http.StatusUnprocessableEntity, map[string]any{
		"code": "STATE_ILLEGAL", "message": "Closed to arrival.", "traceId": "rates-stub",
		"details": map[string]any{"roomTypeId": "deluxe-type", "restriction": "closed-to-arrival"},
	}, &seenAuth)
	defer rates.Close()

	st := store.New()
	svc := service.New(st)
	svc.CheckRestrictionsHook = pricing.NewClient(rates.URL).Check
	mux := NewMux(svc, st)

	code, body := post(t, mux, "/v1/reservations/CreateReservation", loopBody("restriction-e2e"), deskToken)
	if code != 422 || body["code"] != "STATE_ILLEGAL" {
		t.Fatalf("CreateReservation = %d %v, want 422 STATE_ILLEGAL", code, body)
	}
	details, _ := body["details"].(map[string]any)
	if details["restriction"] != "closed-to-arrival" {
		t.Fatalf("details = %v, want the restriction named", body["details"])
	}
	if seenAuth != deskToken {
		t.Fatalf("rates Authorization = %q, want the caller Bearer token forwarded", seenAuth)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}

// TestBookPathFailsClosedWhenRatesDown proves the fail-closed side:
// with rates unreachable the same booking is refused 503 instead of
// being silently allowed.
func TestBookPathFailsClosedWhenRatesDown(t *testing.T) {
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	unreachable := dead.URL
	dead.Close()

	st := store.New()
	svc := service.New(st)
	svc.CheckRestrictionsHook = pricing.NewClient(unreachable).Check
	mux := NewMux(svc, st)

	code, body := post(t, mux, "/v1/reservations/CreateReservation", loopBody("restriction-down"), deskToken)
	if code != http.StatusServiceUnavailable || body["code"] != "UPSTREAM_UNAVAILABLE" {
		t.Fatalf("CreateReservation = %d %v, want 503 UPSTREAM_UNAVAILABLE", code, body)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}
