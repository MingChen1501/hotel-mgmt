// Fail-closed input guards at the in-memory store (Refs #633,
// FR-RTE-6..FR-RTE-10, BR-68). Every refusal is asserted on the
// OpError and on its stored effect: the restriction slice and the
// event list are unchanged, so a refused write leaves nothing behind.
package store

import (
	"strings"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
)

func seedPriced(t *testing.T, s *Store, planName, roomTypeID string, defaultUnits *int, nights ...string) {
	t.Helper()
	if _, oerr := s.UpsertRatePlan(planName, "guard plan", defaultUnits); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	if len(nights) == 0 {
		nights = []string{"2026-11-01", "2026-11-02"}
	}
	for _, night := range nights {
		if _, oerr := s.UpsertRatePrice(planName, roomTypeID, night, 12000); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
}

func assertStoreRefusal(t *testing.T, oerr *OpError, wantCode string, wantStatus int, wantDetails map[string]any, wantMessage string) {
	t.Helper()
	if oerr == nil || oerr.Code != wantCode || oerr.Status != wantStatus {
		t.Fatalf("oerr = %+v, want %s %d", oerr, wantCode, wantStatus)
	}
	for key, want := range wantDetails {
		if oerr.Details[key] != want {
			t.Fatalf("details.%s = %v, want %v (%v)", key, oerr.Details[key], want, oerr.Details)
		}
	}
	if wantMessage != "" && oerr.Message != wantMessage {
		t.Fatalf("message = %q, want %q", oerr.Message, wantMessage)
	}
}

// RTE3/RTE4 — a malformed id and an unpriced type are refused before
// the append, with no restriction row and no event (FR-RTE-7).
func TestUpsertRestrictionRefusedStoresNothing(t *testing.T) {
	s := New()
	pricedType := storeTypeID()
	seedPriced(t, s, "RACK", pricedType, nil)
	restrictionsBefore, eventsBefore := len(s.restrictions), len(s.events)

	_, oerr := s.UpsertRestriction("not-a-uuid", "2026-12-20", "2026-12-31", nil, true)
	assertStoreRefusal(t, oerr, "VALIDATION_FAILED", 400, map[string]any{"field": "roomTypeId"},
		messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))

	unknownType := "99999999-9999-4999-8999-999999999999"
	_, oerr = s.UpsertRestriction(unknownType, "2026-12-20", "2026-12-31", nil, true)
	assertStoreRefusal(t, oerr, "NOT_FOUND", 404, map[string]any{"roomTypeId": unknownType},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": unknownType}))

	// A plan defaultUnits is not a price (BR-44).
	defaultOnly := "88888888-8888-4888-8888-888888888888"
	units := 4
	if _, oerr := s.UpsertRatePlan("DEFAULT-ONLY", "inventory default only", &units); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	eventsBefore++
	_, oerr = s.UpsertRestriction(defaultOnly, "2026-12-20", "2026-12-31", nil, true)
	assertStoreRefusal(t, oerr, "NOT_FOUND", 404, map[string]any{"roomTypeId": defaultOnly},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": defaultOnly}))

	if len(s.restrictions) != restrictionsBefore {
		t.Fatalf("restrictions = %d, want %d (no row stored)", len(s.restrictions), restrictionsBefore)
	}
	if len(s.events) != eventsBefore {
		t.Fatalf("events = %d, want %d (no restriction-changed event)", len(s.events), eventsBefore)
	}
	if oerr := s.CheckRestrictions(pricedType, "2026-12-24", "2026-12-26"); oerr != nil {
		t.Fatalf("refused write changed the stored set: %v", oerr)
	}
}

// RTE5 — a priced type is still accepted regardless of defaultUnits.
func TestUpsertRestrictionPricedTypeAccepted(t *testing.T) {
	s := New()
	roomTypeID := storeTypeID()
	seedPriced(t, s, "RACK", roomTypeID, nil)
	if _, oerr := s.UpsertRestriction(roomTypeID, "2026-12-20", "2026-12-31", nil, true); oerr != nil {
		t.Fatalf("priced write refused: %v", oerr)
	}
	if len(s.restrictions) != 1 {
		t.Fatalf("restrictions = %d, want 1", len(s.restrictions))
	}
	oerr := s.CheckRestrictions(roomTypeID, "2026-12-24", "2026-12-26")
	if oerr == nil || oerr.Code != "STATE_ILLEGAL" || oerr.Details["restriction"] != "closed-to-arrival" {
		t.Fatalf("stored window not applied: %+v", oerr)
	}
}

// RTE9 — an overflowing nightly sum refuses with no quote value.
func TestQuoteSumOverflowRefused(t *testing.T) {
	s := New()
	roomTypeID := storeTypeID()
	if _, oerr := s.UpsertRatePlan("OVER", "overflow plan", nil); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	for _, seed := range []struct {
		night string
		price int64
	}{
		{"2026-11-01", 9223372036854775807},
		{"2026-11-02", 1},
	} {
		if _, oerr := s.UpsertRatePrice("OVER", roomTypeID, seed.night, seed.price); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
	quote, oerr := s.Quote(roomTypeID, "2026-11-01", "2026-11-03", nil, nil)
	if quote != nil {
		t.Fatalf("overflow quote = %+v, want nil", quote)
	}
	assertStoreRefusal(t, oerr, "STATE_ILLEGAL", 422,
		map[string]any{"field": "roomTypeId", "reason": "total_overflow"},
		messages.Text("rates.state.total_overflow", nil))
}

// RTE10 — the percent multiplication is guarded too.
func TestQuotePercentOverflowRefused(t *testing.T) {
	s := New()
	roomTypeID := storeTypeID()
	if _, oerr := s.UpsertRatePlan("OVER-PCT", "overflow percent plan", nil); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if _, oerr := s.UpsertRatePrice("OVER-PCT", roomTypeID, night, 100000000000000000); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
	if _, oerr := s.UpsertDiscount("TEN", "percent", 10); oerr != nil {
		t.Fatalf("discount refused: %v", oerr)
	}
	discount := "TEN"
	quote, oerr := s.Quote(roomTypeID, "2026-11-01", "2026-11-03", nil, &discount)
	if quote != nil {
		t.Fatalf("overflow quote = %+v, want nil", quote)
	}
	assertStoreRefusal(t, oerr, "STATE_ILLEGAL", 422,
		map[string]any{"field": "roomTypeId", "reason": "total_overflow"},
		messages.Text("rates.state.total_overflow", nil))
}

// RTE12/RTE13 — the two plan text bounds, the refused update that
// leaves the stored row intact, and the pre-bound row that still
// quotes (no read-time re-validation).
func TestUpsertRatePlanTextBounds(t *testing.T) {
	s := New()

	name64 := strings.Repeat("ế", 64)
	if _, oerr := s.UpsertRatePlan(name64, "", nil); oerr != nil {
		t.Fatalf("64-code-point name refused: %v", oerr)
	}
	eventsBefore := len(s.events)
	_, oerr := s.UpsertRatePlan(strings.Repeat("ế", 65), "", nil)
	assertStoreRefusal(t, oerr, "VALIDATION_FAILED", 400, map[string]any{"field": "name"},
		messages.Text("rates.validation.text_length", map[string]string{"field": "name", "max": messages.Num(64)}))
	if len(s.events) != eventsBefore {
		t.Fatalf("a refused plan write emitted an event")
	}

	description2000 := strings.Repeat("ế", 2000)
	if _, oerr := s.UpsertRatePlan("DESC-OK", description2000, nil); oerr != nil {
		t.Fatalf("2000-code-point description refused: %v", oerr)
	}
	_, oerr = s.UpsertRatePlan("DESC-OK", strings.Repeat("ế", 2001), nil)
	assertStoreRefusal(t, oerr, "VALIDATION_FAILED", 400, map[string]any{"field": "description"},
		messages.Text("rates.validation.text_length", map[string]string{"field": "description", "max": messages.Num(2000)}))
	if got := s.plans["DESC-OK"].Description; got != description2000 {
		t.Fatalf("refused update overwrote the stored description (length %d)", len([]rune(got)))
	}

	// A plan written before the bound (seeded directly) still quotes:
	// the bound is a write rule, never a read-time re-validation.
	legacyName := strings.Repeat("x", 70)
	s.plans[legacyName] = &RatePlan{ID: newID(), Name: legacyName, Description: strings.Repeat("y", 2100)}
	s.prices[priceKey(legacyName, storeTypeID(), "2026-11-01")] = &RatePrice{RatePlanName: legacyName, RoomTypeID: storeTypeID(), NightDate: "2026-11-01", PriceMinor: 12000}
	plan := legacyName
	quote, oerr := s.Quote(storeTypeID(), "2026-11-01", "2026-11-02", &plan, nil)
	if oerr != nil || quote.TotalMinor != 12000 {
		t.Fatalf("pre-bound plan quote = %+v, %v; want 12000", quote, oerr)
	}
}

// RTE6/RTE8 — the store answer is the plan default (else 0) and an
// unknown type refuses NOT_FOUND.
func TestCheckSellableCountPlanDefaultAndUnknownType(t *testing.T) {
	s := New()
	roomTypeID := storeTypeID()
	units := 4
	seedPriced(t, s, "RACK-4", roomTypeID, &units)

	counts, oerr := s.CheckSellableCount(roomTypeID, "2026-11-01", "2026-11-03")
	if oerr != nil || len(counts) != 3 {
		t.Fatalf("counts = %+v, %v; want three dates", counts, oerr)
	}
	for _, count := range counts {
		if count.SellableCount != 4 {
			t.Fatalf("sellableCount = %d, want the plan default 4", count.SellableCount)
		}
	}

	noDefaultType := "22222222-2222-4222-8222-222222222222"
	if _, oerr := s.UpsertRatePlan("RACK-NONE", "no default", nil); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	if _, oerr := s.UpsertRatePrice("RACK-NONE", noDefaultType, "2026-11-01", 12000); oerr != nil {
		t.Fatalf("price refused: %v", oerr)
	}
	counts, oerr = s.CheckSellableCount(noDefaultType, "2026-11-01", "2026-11-02")
	if oerr != nil || len(counts) != 2 || counts[0].SellableCount != 0 {
		t.Fatalf("no-default counts = %+v, %v; want 0", counts, oerr)
	}

	unknownType := "99999999-9999-4999-8999-999999999999"
	_, oerr = s.CheckSellableCount(unknownType, "2026-11-01", "2026-11-02")
	assertStoreRefusal(t, oerr, "NOT_FOUND", 404, map[string]any{"roomTypeId": unknownType},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": unknownType}))
}
