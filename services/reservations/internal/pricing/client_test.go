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

// TestQuotePriceForwardsStayAndToken proves the quote read asks Rates
// for the effective type, dates, and discount with the caller Bearer
// token forwarded, and parses the applied total and discount name.
func TestQuotePriceForwardsStayAndToken(t *testing.T) {
	var seenAuth string
	var seenBody map[string]any
	discount := "EarlyBird"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/rates/QuotePrice" {
			t.Errorf("rates path = %s, want /v1/rates/QuotePrice", r.URL.Path)
		}
		seenAuth = r.Header.Get("Authorization")
		if err := json.NewDecoder(r.Body).Decode(&seenBody); err != nil {
			t.Errorf("rates stub got a non-JSON body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"roomTypeId": "deluxe-type", "arrivalDate": "2026-11-01", "departureDate": "2026-11-03",
			"nights":       []map[string]any{{"nightDate": "2026-11-01", "priceMinor": 12000}, {"nightDate": "2026-11-02", "priceMinor": 12000}},
			"discountName": "EarlyBird", "totalMinor": 24000,
		})
	}))
	defer srv.Close()

	total, applied, oerr := NewClient(srv.URL).QuotePrice("deluxe-type", "2026-11-01", "2026-11-03", &discount, "Bearer caller-token")
	if oerr != nil {
		t.Fatalf("QuotePrice refused: %v", oerr)
	}
	if total != 24000 || applied == nil || *applied != "EarlyBird" {
		t.Fatalf("quote = %d %v, want 24000 EarlyBird", total, applied)
	}
	if seenAuth != "Bearer caller-token" {
		t.Fatalf("Authorization = %q, want the caller Bearer token forwarded", seenAuth)
	}
	if seenBody["roomTypeId"] != "deluxe-type" || seenBody["arrivalDate"] != "2026-11-01" || seenBody["departureDate"] != "2026-11-03" || seenBody["discountName"] != "EarlyBird" {
		t.Fatalf("rates request body = %v, want type+dates+discount", seenBody)
	}
	if _, named := seenBody["ratePlanName"]; named {
		t.Fatalf("rates request body = %v, want no ratePlanName (the desk's quote sends none)", seenBody)
	}
}

// TestQuotePriceParsesNullDiscountAndLegitZero covers the
// complimentary case: a zero total with a null discount is a valid
// quote, not a missing one.
func TestQuotePriceParsesNullDiscountAndLegitZero(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"totalMinor":0,"discountName":null,"nights":[]}`))
	}))
	defer srv.Close()
	total, applied, oerr := NewClient(srv.URL).QuotePrice("deluxe-type", "2026-11-01", "2026-11-03", nil, "Bearer caller-token")
	if oerr != nil {
		t.Fatalf("QuotePrice refused a legitimate zero: %v", oerr)
	}
	if total != 0 || applied != nil {
		t.Fatalf("quote = %d %v, want a zero total with no discount", total, applied)
	}
}

// TestQuotePricePropagatesDefinitiveRefusal keeps the definitive Rates
// 4xx envelope unchanged so the booking is refused in the desk's own
// terms.
func TestQuotePricePropagatesDefinitiveRefusal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": "NOT_FOUND", "message": "No rate price for 2026-11-02.", "traceId": "rates-stub",
			"details": map[string]any{"reason": "no_rate_price"},
		})
	}))
	defer srv.Close()
	_, _, oerr := NewClient(srv.URL).QuotePrice("deluxe-type", "2026-11-01", "2026-11-03", nil, "Bearer caller-token")
	if oerr == nil || oerr.Code != "NOT_FOUND" || oerr.Status != http.StatusNotFound {
		t.Fatalf("error = %v, want 404 NOT_FOUND surfaced unchanged", oerr)
	}
	if oerr.Details["reason"] != "no_rate_price" {
		t.Fatalf("details = %v, want the rates reason kept", oerr.Details)
	}
}

// TestQuotePriceFailsClosed covers the unreadable shapes: transport
// failure, 5xx, a non-envelope refusal, and a 200 reply without the
// consumed total each map to 503 UPSTREAM_UNAVAILABLE naming
// rates/QuotePrice.
func TestQuotePriceFailsClosed(t *testing.T) {
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	unreachable := dead.URL
	dead.Close()

	cases := map[string]*httptest.Server{}
	fiveHundred := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("not-json"))
	}))
	defer fiveHundred.Close()
	cases["transport failure"] = nil
	cases["5xx"] = fiveHundred

	nonEnvelope := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("nope"))
	}))
	defer nonEnvelope.Close()
	cases["non-envelope refusal"] = nonEnvelope

	missingTotal := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"discountName":null,"nights":[]}`))
	}))
	defer missingTotal.Close()
	cases["reply without totalMinor"] = missingTotal

	for name, srv := range cases {
		url := unreachable
		if srv != nil {
			url = srv.URL
		}
		_, _, oerr := NewClient(url).QuotePrice("deluxe-type", "2026-11-01", "2026-11-03", nil, "Bearer caller-token")
		if oerr == nil || oerr.Code != "UPSTREAM_UNAVAILABLE" || oerr.Status != http.StatusServiceUnavailable {
			t.Fatalf("%s: error = %v, want 503 UPSTREAM_UNAVAILABLE", name, oerr)
		}
		if oerr.Details["upstream"] != "rates" || oerr.Details["operation"] != "QuotePrice" {
			t.Fatalf("%s: details = %v, want rates/QuotePrice named", name, oerr.Details)
		}
	}
}
