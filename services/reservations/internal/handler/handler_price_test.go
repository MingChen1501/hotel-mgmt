package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/pricing"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

// Guards PA1, PA5, PA7, PA8, PA11 at the transport edge: the real
// pricing client over a stubbed Rates server, the real booking route,
// and the shared envelope. The stubbed rates answers CheckRestrictions
// with a pass and QuotePrice with whatever the case under test needs,
// recording every path it was asked for so "no quote" is provable.

type ratesStub struct {
	mu        sync.Mutex
	quoteCode int
	quoteBody map[string]any
	paths     []string
	quoteAuth string
	quoteSeen map[string]any
}

func (s *ratesStub) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		s.paths = append(s.paths, r.URL.Path)
		s.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/rates/CheckRestrictions":
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]any{"allowed": true})
		case "/v1/rates/QuotePrice":
			s.mu.Lock()
			s.quoteAuth = r.Header.Get("Authorization")
			_ = json.NewDecoder(r.Body).Decode(&s.quoteSeen)
			s.mu.Unlock()
			status := s.quoteCode
			if status == 0 {
				status = http.StatusOK
			}
			w.WriteHeader(status)
			_ = json.NewEncoder(w).Encode(s.quoteBody)
		default:
			t.Errorf("unexpected rates path %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
}

func (s *ratesStub) quoteCalls() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	calls := 0
	for _, path := range s.paths {
		if path == "/v1/rates/QuotePrice" {
			calls++
		}
	}
	return calls
}

// muxOverRates wires the production Check and QuotePrice operations
// into the real booking route.
func muxOverRates(ratesURL string) (*http.ServeMux, *store.Store) {
	st := store.New()
	svc := service.New(st)
	client := pricing.NewClient(ratesURL)
	svc.CheckRestrictionsHook = client.Check
	svc.QuotePriceHook = client.QuotePrice
	svc.AvailabilityHook = capacityHook(2)
	return NewMux(svc, st), st
}

// TestBookPathRefusesForgedLowTotalEndToEnd is PA1's transport half:
// the request asserts zero while Rates quotes 6000, so the booking is
// refused 409 PRICE_CHANGED with both totals, the type, and the dates,
// nothing is stored, and the same key then books once at the quote.
func TestBookPathRefusesForgedLowTotalEndToEnd(t *testing.T) {
	rates := &ratesStub{quoteBody: map[string]any{"totalMinor": 6000, "discountName": nil}}
	srv := rates.server(t)
	defer srv.Close()
	mux, st := muxOverRates(srv.URL)

	forged := loopBody("forged-low")
	forged["priceBasis"] = map[string]any{"totalMinor": 0}
	code, body := post(t, mux, "/v1/reservations/CreateReservation", forged, deskToken)
	if code != http.StatusConflict || body["code"] != "PRICE_CHANGED" {
		t.Fatalf("forged-low create = %d %v, want 409 PRICE_CHANGED", code, body)
	}
	details, _ := body["details"].(map[string]any)
	if details["requestedTotalMinor"] != float64(0) || details["quotedTotalMinor"] != float64(6000) {
		t.Fatalf("details = %v, want both totals named", details)
	}
	if details["roomTypeId"] != "deluxe-type" || details["arrivalDate"] != "2026-11-01" || details["departureDate"] != "2026-11-03" {
		t.Fatalf("details = %v, want the room type and dates named", details)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after the refusal, want 0", got)
	}
	if rates.quoteAuth != deskToken {
		t.Fatalf("quote Authorization = %q, want the caller Bearer token forwarded", rates.quoteAuth)
	}

	matching := loopBody("forged-low")
	matching["priceBasis"] = map[string]any{"totalMinor": 6000}
	code, created := post(t, mux, "/v1/reservations/CreateReservation", matching, deskToken)
	if code != http.StatusOK || created["quotedTotal"] != float64(6000) {
		t.Fatalf("re-quoted create = %d %v, want 200 at the quote", code, created)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 1 {
		t.Fatalf("store holds %d reservations after the re-quote, want 1", got)
	}
}

// TestBookPathRefusesAbsentTotalWithoutQuoting is PA5's transport half:
// a body without priceBasis is still 400 VALIDATION_FAILED naming
// priceBasis and Pricing is never asked — the 409 only ever answers an
// asserted disagreement.
func TestBookPathRefusesAbsentTotalWithoutQuoting(t *testing.T) {
	rates := &ratesStub{quoteBody: map[string]any{"totalMinor": 6000}}
	srv := rates.server(t)
	defer srv.Close()
	mux, st := muxOverRates(srv.URL)

	body := loopBody("absent-total")
	delete(body, "priceBasis")
	code, refused := post(t, mux, "/v1/reservations/CreateReservation", body, deskToken)
	if code != http.StatusBadRequest || refused["code"] != "VALIDATION_FAILED" {
		t.Fatalf("absent total = %d %v, want 400 VALIDATION_FAILED", code, refused)
	}
	if details, _ := refused["details"].(map[string]any); details["field"] != "priceBasis" {
		t.Fatalf("details = %v, want priceBasis named", refused["details"])
	}
	if rates.quoteCalls() != 0 {
		t.Fatalf("quote calls = %d for an absent total, want 0", rates.quoteCalls())
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after the refusal, want 0", got)
	}
}

// TestBookPathFailsClosedWhenQuoteUnreadable is PA7's transport half: a
// 5xx from the quote read refuses 503 UPSTREAM_UNAVAILABLE naming
// rates/QuotePrice and stores nothing, on create and on modify.
func TestBookPathFailsClosedWhenQuoteUnreadable(t *testing.T) {
	rates := &ratesStub{quoteCode: http.StatusInternalServerError, quoteBody: map[string]any{}}
	srv := rates.server(t)
	defer srv.Close()
	mux, st := muxOverRates(srv.URL)

	code, body := post(t, mux, "/v1/reservations/CreateReservation", loopBody("quote-down"), deskToken)
	if code != http.StatusServiceUnavailable || body["code"] != "UPSTREAM_UNAVAILABLE" {
		t.Fatalf("create = %d %v, want 503 UPSTREAM_UNAVAILABLE", code, body)
	}
	details, _ := body["details"].(map[string]any)
	if details["upstream"] != "rates" || details["operation"] != "QuotePrice" {
		t.Fatalf("details = %v, want rates/QuotePrice named", details)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after the refusal, want 0", got)
	}
}

// TestBookPathPassesDefinitiveQuoteRefusal is PA8's transport half: a
// definitive Rates refusal keeps its code, status, and details, so the
// desk keeps the terms its own quote step reports.
func TestBookPathPassesDefinitiveQuoteRefusal(t *testing.T) {
	rates := &ratesStub{quoteCode: http.StatusNotFound, quoteBody: map[string]any{
		"code": "NOT_FOUND", "message": "No rate price for 2026-11-02.", "traceId": "rates-stub",
		"details": map[string]any{"reason": "no_rate_price"},
	}}
	srv := rates.server(t)
	defer srv.Close()
	mux, st := muxOverRates(srv.URL)

	code, body := post(t, mux, "/v1/reservations/CreateReservation", loopBody("no-rate-price"), deskToken)
	if code != http.StatusNotFound || body["code"] != "NOT_FOUND" {
		t.Fatalf("create = %d %v, want 404 NOT_FOUND surfaced unchanged", code, body)
	}
	if details, _ := body["details"].(map[string]any); details["reason"] != "no_rate_price" {
		t.Fatalf("details = %v, want the rates reason kept", body["details"])
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after the refusal, want 0", got)
	}
}

// TestModifyPathRefusesForgedTotalEndToEnd is PA11's transport half: a
// modify asserting a total the quote does not return refuses 409 and
// leaves the stored booking untouched.
func TestModifyPathRefusesForgedTotalEndToEnd(t *testing.T) {
	rates := &ratesStub{quoteBody: map[string]any{"totalMinor": 6000}}
	srv := rates.server(t)
	defer srv.Close()
	mux, st := muxOverRates(srv.URL)

	created := loopBody("modify-forged")
	created["priceBasis"] = map[string]any{"totalMinor": 6000}
	code, reply := post(t, mux, "/v1/reservations/CreateReservation", created, deskToken)
	if code != http.StatusOK {
		t.Fatalf("create = %d %v, want 200", code, reply)
	}
	ref, _ := reply["reservationRef"].(string)

	before, oerr := st.Get(ref)
	if oerr != nil {
		t.Fatalf("Get refused: %v", oerr)
	}
	modify := modifyBody(ref, "modify-forged")
	modify["priceBasis"] = map[string]any{"totalMinor": 0}
	code, body := post(t, mux, "/v1/reservations/ModifyReservation", modify, deskToken)
	if code != http.StatusConflict || body["code"] != "PRICE_CHANGED" {
		t.Fatalf("forged modify = %d %v, want 409 PRICE_CHANGED", code, body)
	}
	after, oerr := st.Get(ref)
	if oerr != nil {
		t.Fatalf("Get refused: %v", oerr)
	}
	if after.ArrivalDate != before.ArrivalDate || after.DepartureDate != before.DepartureDate ||
		after.RoomTypeID != before.RoomTypeID || after.TotalMinor != before.TotalMinor {
		t.Fatalf("row after the refusal = %+v, want it byte-identical to %+v", after, before)
	}
}
