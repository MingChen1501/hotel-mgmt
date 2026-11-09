// Unit guards for the in-memory pricing store (Refs #589).
//
// The owner decision on issue #589 keeps the booking refusal for a
// room type with no rate price for the selected dates and treats that
// type as not yet operational. The refusal therefore carries a stable
// `details.reason` the desk switches on (`no_rate_price` for a missing
// night, `no_rate_plan` when no plan prices the type at all), and a
// priced type keeps quoting exactly as before (no regression in the
// quote path).
package store

import "testing"

func storeTypeID() string { return "11111111-1111-4111-8111-111111111111" }

func TestQuoteWithoutRatePriceNamesTheReason(t *testing.T) {
	s := New()
	if plan := s.UpsertRatePlan("RACK", "Rack rate", nil); plan == nil {
		t.Fatal("UpsertRatePlan returned nil")
	}
	if _, oerr := s.UpsertRatePrice("RACK", storeTypeID(), "2026-11-01", 12000); oerr != nil {
		t.Fatalf("UpsertRatePrice refused: %v", oerr)
	}

	// 2026-11-02 has no price row: the quote refuses as NOT_FOUND and
	// names the missing night plus the machine-readable reason.
	quote, oerr := s.Quote(storeTypeID(), "2026-11-01", "2026-11-03", nil, nil)
	if quote != nil {
		t.Fatalf("quote = %+v, want nil", quote)
	}
	if oerr == nil || oerr.Code != "NOT_FOUND" || oerr.Status != 404 {
		t.Fatalf("oerr = %+v, want 404 NOT_FOUND", oerr)
	}
	if got := oerr.Details["reason"]; got != "no_rate_price" {
		t.Fatalf("details.reason = %v, want no_rate_price", got)
	}
	if got := oerr.Details["nightDate"]; got != "2026-11-02" {
		t.Fatalf("details.nightDate = %v, want 2026-11-02", got)
	}
	if got := oerr.Details["roomTypeId"]; got != storeTypeID() {
		t.Fatalf("details.roomTypeId = %v, want %s", got, storeTypeID())
	}
}

func TestQuoteWithoutAnyPlanNamesTheReason(t *testing.T) {
	s := New()
	// A plan exists but prices a different type: no plan prices the
	// requested type, so the type is not yet operational.
	if plan := s.UpsertRatePlan("RACK", "Rack rate", nil); plan == nil {
		t.Fatal("UpsertRatePlan returned nil")
	}
	otherType := "22222222-2222-4222-8222-222222222222"
	if _, oerr := s.UpsertRatePrice("RACK", otherType, "2026-11-01", 12000); oerr != nil {
		t.Fatalf("UpsertRatePrice refused: %v", oerr)
	}

	_, oerr := s.Quote(storeTypeID(), "2026-11-01", "2026-11-02", nil, nil)
	if oerr == nil || oerr.Code != "NOT_FOUND" {
		t.Fatalf("oerr = %+v, want NOT_FOUND", oerr)
	}
	if got := oerr.Details["reason"]; got != "no_rate_plan" {
		t.Fatalf("details.reason = %v, want no_rate_plan", got)
	}
}

func TestQuoteWithRatePricesStillPricesEveryNight(t *testing.T) {
	s := New()
	if plan := s.UpsertRatePlan("RACK", "Rack rate", nil); plan == nil {
		t.Fatal("UpsertRatePlan returned nil")
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if _, oerr := s.UpsertRatePrice("RACK", storeTypeID(), night, 12000); oerr != nil {
			t.Fatalf("UpsertRatePrice %s refused: %v", night, oerr)
		}
	}

	quote, oerr := s.Quote(storeTypeID(), "2026-11-01", "2026-11-03", nil, nil)
	if oerr != nil {
		t.Fatalf("Quote refused: %+v", oerr)
	}
	if len(quote.Nights) != 2 || quote.TotalMinor != 24000 {
		t.Fatalf("quote = %+v, want two nights totalling 24000", quote)
	}
}
