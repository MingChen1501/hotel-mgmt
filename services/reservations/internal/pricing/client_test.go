package pricing

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// stubRates mimics the rates CheckRestrictions route: it records the
// caller request and answers with the canned status/envelope.
func stubRates(t *testing.T, status int, envelope map[string]any, seenAuth *string, seenBody *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*seenAuth = r.Header.Get("Authorization")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("rates stub got a non-JSON body: %v", err)
		}
		*seenBody = body
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(envelope)
	}))
}

func TestCheckAllowsWhenRatesPasses(t *testing.T) {
	var seenAuth string
	var body map[string]any
	srv := stubRates(t, http.StatusOK, map[string]any{"roomTypeId": "deluxe-type", "allowed": true}, &seenAuth, &body)
	defer srv.Close()
	if oerr := NewClient(srv.URL).Check("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token"); oerr != nil {
		t.Fatalf("Check refused: %v", oerr)
	}
	if seenAuth != "Bearer caller-token" {
		t.Fatalf("Authorization = %q, want caller Bearer token forwarded", seenAuth)
	}
	if body["roomTypeId"] != "deluxe-type" || body["arrivalDate"] != "2026-11-01" || body["departureDate"] != "2026-11-03" {
		t.Fatalf("rates request body = %v, want type+dates", body)
	}
}

func TestCheckPropagatesNamedRestriction(t *testing.T) {
	var seenAuth string
	var body map[string]any
	envelope := map[string]any{
		"code": "STATE_ILLEGAL", "message": "Closed to arrival.", "traceId": "rates-stub",
		"details": map[string]any{"roomTypeId": "deluxe-type", "restriction": "closed-to-arrival"},
	}
	srv := stubRates(t, http.StatusUnprocessableEntity, envelope, &seenAuth, &body)
	defer srv.Close()
	oerr := NewClient(srv.URL).Check("deluxe-type", "2026-12-24", "2026-12-26", "Bearer caller-token")
	if oerr == nil || oerr.Code != "STATE_ILLEGAL" || oerr.Status != 422 {
		t.Fatalf("error = %v, want 422 STATE_ILLEGAL", oerr)
	}
	if oerr.Details["restriction"] != "closed-to-arrival" {
		t.Fatalf("details = %v, want the restriction named", oerr.Details)
	}
}

func TestCheckFailsClosedWhenRatesUnreachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	unreachable := srv.URL
	srv.Close()
	oerr := NewClient(unreachable).Check("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
	if oerr == nil || oerr.Code != "UPSTREAM_UNAVAILABLE" || oerr.Status != http.StatusServiceUnavailable {
		t.Fatalf("error = %v, want 503 UPSTREAM_UNAVAILABLE", oerr)
	}
	if oerr.Details["upstream"] != "rates" {
		t.Fatalf("details = %v, want the upstream named", oerr.Details)
	}
}

func TestCheckFailsClosedOnUnparseableRefusal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("not-json"))
	}))
	defer srv.Close()
	oerr := NewClient(srv.URL).Check("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
	if oerr == nil || oerr.Code != "UPSTREAM_UNAVAILABLE" || oerr.Status != http.StatusServiceUnavailable {
		t.Fatalf("error = %v, want 503 UPSTREAM_UNAVAILABLE", oerr)
	}
}
