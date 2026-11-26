package service

import (
	"net/http"
	"testing"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

// Guards PA1-PA9 from the #632 test traceability
// (docs/testing/price-authority-test-traceability.md section 3): the
// frozen price basis comes from Rates QuotePrice, not from the request
// body. Every refusal case asserts the no-write set — row, change list,
// events, and idempotency record — because the defect this slice fixes
// is a stored number, and a right status code can still hide a write.

// priceService builds a service whose two non-price hooks pass.
func priceService(st *store.Store) *Service {
	svc := New(st)
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	return svc
}

// assertPriceChanged pins the disagreement envelope shape: 409
// PRICE_CHANGED naming both totals and the stay it was asked for.
func assertPriceChanged(t *testing.T, oerr *store.OpError, requested, quoted int64, arrivalDate, departureDate string) {
	t.Helper()
	if oerr == nil || oerr.Code != "PRICE_CHANGED" || oerr.Status != http.StatusConflict {
		t.Fatalf("error = %v, want 409 PRICE_CHANGED", oerr)
	}
	if oerr.Details["requestedTotalMinor"] != requested || oerr.Details["quotedTotalMinor"] != quoted {
		t.Fatalf("details = %v, want requested %d and quoted %d", oerr.Details, requested, quoted)
	}
	if oerr.Details["roomTypeId"] != "deluxe-type" || oerr.Details["arrivalDate"] != arrivalDate || oerr.Details["departureDate"] != departureDate {
		t.Fatalf("details = %v, want the room type and dates named", oerr.Details)
	}
}

// assertPriceUnavailable pins the fail-closed envelope shape: 503
// UPSTREAM_UNAVAILABLE naming rates/QuotePrice.
func assertPriceUnavailable(t *testing.T, oerr *store.OpError) {
	t.Helper()
	if oerr == nil || oerr.Code != "UPSTREAM_UNAVAILABLE" || oerr.Status != http.StatusServiceUnavailable {
		t.Fatalf("error = %v, want 503 UPSTREAM_UNAVAILABLE", oerr)
	}
	if oerr.Details["upstream"] != "rates" || oerr.Details["operation"] != "QuotePrice" {
		t.Fatalf("details = %v, want rates/QuotePrice named", oerr.Details)
	}
}

// assertSameDetails compares every key the upstream envelope carried, so
// a refusal that drops a `field` detail fails instead of passing on the
// status code alone.
func assertSameDetails(t *testing.T, name string, got, want map[string]any) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: details = %v, want exactly %v", name, got, want)
	}
	for key, wantValue := range want {
		if got[key] != wantValue {
			t.Fatalf("%s: details[%s] = %v, want %v", name, key, got[key], wantValue)
		}
	}
}

// assertNothingWritten is the no-write set every refusal must keep.
func assertNothingWritten(t *testing.T, st *store.Store, idempotencyKey string) {
	t.Helper()
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after the refusal, want 0", got)
	}
	if got := len(st.Changes()); got != 0 {
		t.Fatalf("store wrote %d change row(s) after the refusal, want 0", got)
	}
	if got := len(st.Events()); got != 0 {
		t.Fatalf("store queued %d event(s) after the refusal, want 0", got)
	}
	if idempotencyKey != "" {
		if replay, oerr := st.Replay("CreateReservation", "", idempotencyKey); oerr != nil || replay != nil {
			t.Fatalf("refused attempt recorded idempotency key %q (replay %v, err %v)", idempotencyKey, replay, oerr)
		}
	}
}

// PA1 — forged-low on create: a body asserting 0 while the quote
// returns 6000 is refused 409 with both totals, writes nothing, and the
// same key still books once at the quote afterwards, which proves the
// refused attempt recorded no key.
func TestCreateForgedLowTotalRefused(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	quote := &quoteRead{total: 6000}
	svc.QuotePriceHook = quote.hook()

	req := loopRequest()
	req.TotalMinor = 0
	req.IdempotencyKey = "forged-low"
	_, oerr := svc.Create(req)
	assertPriceChanged(t, oerr, 0, 6000, "2026-11-01", "2026-11-03")
	assertNothingWritten(t, st, "forged-low")

	req.TotalMinor = 6000
	booked, oerr := svc.Create(req)
	if oerr != nil {
		t.Fatalf("the re-quoted attempt refused: %v", oerr)
	}
	if booked.TotalMinor != 6000 {
		t.Fatalf("booked total = %d, want the quote's 6000", booked.TotalMinor)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 1 {
		t.Fatalf("store holds %d reservations, want the one re-quoted booking", got)
	}
}

// PA2 — forged-high and zero-for-a-priced-stay both refuse the same
// way, and neither substitutes the quote into the response as booked.
func TestCreateForgedHighAndZeroForPricedStayRefused(t *testing.T) {
	for _, requested := range []int64{99000, 0} {
		st := store.New()
		svc := priceService(st)
		svc.QuotePriceHook = allowQuote(6000)
		req := loopRequest()
		req.TotalMinor = requested
		req.IdempotencyKey = "forged"
		record, oerr := svc.Create(req)
		assertPriceChanged(t, oerr, requested, 6000, "2026-11-01", "2026-11-03")
		if record != nil {
			t.Fatalf("refused attempt returned a booking: %+v", record)
		}
		assertNothingWritten(t, st, "forged")
	}
}

// PA3 — a matching create stores the quote's total and the quote's
// discount name, not the request's. The stub's applied name differs
// from the body's, so a stored request value would fail here.
func TestCreateStoresQuotedTotalAndDiscountName(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	applied := "EarlyBird"
	svc.QuotePriceHook = (&quoteRead{total: 24000, discount: &applied}).hook()
	requested := "BodyDiscount"
	req := loopRequest()
	req.DiscountName = &requested

	record, oerr := svc.Create(req)
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	if record.TotalMinor != 24000 {
		t.Fatalf("stored total = %d, want the quote's 24000", record.TotalMinor)
	}
	if record.DiscountName == nil || *record.DiscountName != "EarlyBird" {
		t.Fatalf("stored discount = %v, want the quote's EarlyBird", record.DiscountName)
	}
	read, oerr := st.Get(record.Ref)
	if oerr != nil {
		t.Fatalf("Get refused: %v", oerr)
	}
	if read.TotalMinor != 24000 || read.DiscountName == nil || *read.DiscountName != "EarlyBird" {
		t.Fatalf("read-back = %+v, want the quote's frozen values", read)
	}
}

// PA4 — a legitimate zero from a complimentary discount is booked at
// zero: zero is a quote value, not a missing one. PA1's zero refusal is
// about disagreement, not about zero.
func TestCreateLegitimateZeroQuoteBooked(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	comp := "Comp"
	svc.QuotePriceHook = (&quoteRead{total: 0, discount: &comp}).hook()
	req := loopRequest()
	req.TotalMinor = 0

	record, oerr := svc.Create(req)
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	if record.TotalMinor != 0 || record.DiscountName == nil || *record.DiscountName != "Comp" {
		t.Fatalf("record = %+v, want a zero booking with the comp discount", record)
	}
}

// PA5 — the shape gate is unchanged: an absent or negative total still
// refuses VALIDATION_FAILED naming priceBasis on both routes, never a
// 409, and Pricing is not asked.
func TestPriceBasisShapeGateUnchanged(t *testing.T) {
	for _, total := range []struct {
		name     string
		total    int64
		hasTotal bool
	}{
		{"absent", 0, false},
		{"negative", -1, true},
	} {
		st := store.New()
		svc := priceService(st)
		svc.QuotePriceHook = forbidQuote(t)
		req := loopRequest()
		req.TotalMinor = total.total
		req.HasTotal = total.hasTotal
		_, oerr := svc.Create(req)
		if oerr == nil || oerr.Code != "VALIDATION_FAILED" || oerr.Details["field"] != "priceBasis" {
			t.Fatalf("%s create error = %v, want 400 naming priceBasis", total.name, oerr)
		}
		assertNothingWritten(t, st, "")
	}
}

// PA5 (modify half) — the same shape gate on Modify.
func TestModifyPriceBasisShapeGateUnchanged(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	svc.QuotePriceHook = forbidQuote(t)
	for _, total := range []struct {
		name     string
		total    int64
		hasTotal bool
	}{
		{"absent", 0, false},
		{"negative", -1, true},
	} {
		req := loopModify(created.Ref)
		req.TotalMinor = total.total
		req.HasTotal = total.hasTotal
		if _, oerr := svc.Modify(req); oerr == nil || oerr.Code != "VALIDATION_FAILED" || oerr.Details["field"] != "priceBasis" {
			t.Fatalf("%s modify error = %v, want 400 naming priceBasis", total.name, oerr)
		}
	}
}

// PA6 — a repeated idempotency key returns the stored booking at its
// stored total and Pricing is not asked again, even when the quote
// would now return a different number.
func TestCreateReplayReturnsStoredTotalWithoutSecondQuote(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	quote := &quoteRead{total: 24000}
	svc.QuotePriceHook = quote.hook()
	req := loopRequest()
	req.IdempotencyKey = "replay-key"

	first, oerr := svc.Create(req)
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	if quote.calls != 1 {
		t.Fatalf("quote calls = %d after one booking, want 1", quote.calls)
	}

	quote.total = 31000
	second, oerr := svc.Create(req)
	if oerr != nil {
		t.Fatalf("replay refused: %v", oerr)
	}
	if second.Ref != first.Ref || second.TotalMinor != 24000 {
		t.Fatalf("replay = %+v, want the stored booking at 24000", second)
	}
	if quote.calls != 1 {
		t.Fatalf("quote calls = %d after a replay, want the stored booking returned without a quote", quote.calls)
	}
}

// PA7 — unreadable Pricing fails closed on create and modify with the
// upstream and operation named, storing nothing; the same fixture with
// a readable quote books, so "always 503" cannot hide the path.
func TestUnreadableQuoteFailsClosed(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	svc.QuotePriceHook = func(_, _, _ string, _ *string, _ string) (int64, *string, *store.OpError) {
		return 0, nil, unreadableQuote()
	}
	req := loopRequest()
	req.IdempotencyKey = "unreadable"
	_, oerr := svc.Create(req)
	assertPriceUnavailable(t, oerr)
	assertNothingWritten(t, st, "unreadable")
}

// PA7 (unwired) — an unwired quote hook refuses 503 instead of booking
// an unverified total.
func TestCreateNilQuoteHookFailsClosed(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	req := loopRequest()
	req.IdempotencyKey = "nil-hook"
	_, oerr := svc.Create(req)
	assertPriceUnavailable(t, oerr)
	assertNothingWritten(t, st, "nil-hook")
}

// PA7 (modify) — an unreadable quote on Modify leaves the stored row
// and the change history untouched.
func TestModifyUnreadableQuoteChangesNothing(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	svc.QuotePriceHook = func(_, _, _ string, _ *string, _ string) (int64, *string, *store.OpError) {
		return 0, nil, unreadableQuote()
	}
	_, oerr = svc.Modify(loopModify(created.Ref))
	assertPriceUnavailable(t, oerr)
	kept, oerr := st.Get(created.Ref)
	if oerr != nil {
		t.Fatalf("Get refused: %v", oerr)
	}
	if kept.TotalMinor != 24000 || kept.ArrivalDate != "2026-11-01" || kept.DepartureDate != "2026-11-03" {
		t.Fatalf("record = %+v, want the stored row unchanged", kept)
	}
	if got := len(st.Changes()); got != 0 {
		t.Fatalf("change rows = %d after a refused modify, want none", got)
	}
}

// PA8 — definitive Rates refusals pass through unchanged and store
// nothing: no rate price, no rate plan, unknown discount, ambiguous
// plan set. Every key of the Rates envelope survives, so a dropped
// `field: discountName` / `field: ratePlanName` detail fails here.
func TestDefinitiveQuoteRefusalsPassThrough(t *testing.T) {
	cases := []struct {
		name   string
		oerr   *store.OpError
		status int
	}{
		{
			name:   "no_rate_price",
			oerr:   &store.OpError{Code: "NOT_FOUND", Status: 404, Message: "No rate price for 2026-11-02.", Details: map[string]any{"reason": "no_rate_price"}},
			status: 404,
		},
		{
			name:   "no_rate_plan",
			oerr:   &store.OpError{Code: "NOT_FOUND", Status: 404, Message: "No rate plan prices this type.", Details: map[string]any{"reason": "no_rate_plan"}},
			status: 404,
		},
		{
			name:   "unknown_discount",
			oerr:   &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: "Unknown discount.", Details: map[string]any{"field": "discountName"}},
			status: 400,
		},
		{
			name:   "ambiguous_plan",
			oerr:   &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: "Name a rate plan.", Details: map[string]any{"field": "ratePlanName"}},
			status: 400,
		},
	}
	for _, tc := range cases {
		st := store.New()
		svc := priceService(st)
		svc.QuotePriceHook = func(_, _, _ string, _ *string, _ string) (int64, *string, *store.OpError) {
			return 0, nil, tc.oerr
		}
		_, oerr := svc.Create(loopRequest())
		if oerr == nil || oerr.Code != tc.oerr.Code || oerr.Status != tc.status || oerr.Message != tc.oerr.Message {
			t.Fatalf("%s error = %v, want %s %d %q surfaced unchanged", tc.name, oerr, tc.oerr.Code, tc.status, tc.oerr.Message)
		}
		assertSameDetails(t, tc.name, oerr.Details, tc.oerr.Details)
		assertNothingWritten(t, st, "")
	}
}

// PA9 — a restriction refusal keeps its place and its terms, and the
// quote is never asked for a stay the restrictions already refuse.
func TestRestrictionRefusalNeverQuotes(t *testing.T) {
	svc := priceService(store.New())
	svc.QuotePriceHook = forbidQuote(t)
	svc.CheckRestrictionsHook = func(_, _, _, _ string) *store.OpError {
		return &store.OpError{Code: "STATE_ILLEGAL", Status: 422, Message: "Closed to arrival.", Details: map[string]any{"restriction": "closed-to-arrival"}}
	}
	if _, oerr := svc.Create(loopRequest()); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("error = %v, want 422 STATE_ILLEGAL", oerr)
	}
}

// PA9 — the quote read sits outside the guarded store step: the hook
// takes the store mutex itself (a read), which would deadlock if the
// quote ran inside the guarded write. A short timeout keeps a
// regression a named failure instead of a hung suite.
func TestQuoteReadRunsOutsideTheStoreLock(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	svc.QuotePriceHook = func(_, _, _ string, _ *string, _ string) (int64, *string, *store.OpError) {
		_ = st.Changes()
		return 24000, nil, nil
	}
	done := make(chan *store.OpError, 1)
	go func() {
		_, oerr := svc.Create(loopRequest())
		done <- oerr
	}()
	select {
	case oerr := <-done:
		if oerr != nil {
			t.Fatalf("Create refused: %v", oerr)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the quote read appears to run while the store mutex is held")
	}
}

// PA10 — a Modify reprices from the new window, stores the quote's
// total and discount name, reports the same number, and writes exactly
// one priceBasis change row carrying the actor beside the dates row. A
// change that leaves the total equal writes no price-basis row.
func TestModifyRepricesFromQuoteAndRecordsActor(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}

	early := "EarlyBird"
	svc.QuotePriceHook = (&quoteRead{total: 26000, discount: &early}).hook()
	modified, oerr := svc.Modify(loopModify(created.Ref))
	if oerr != nil {
		t.Fatalf("Modify refused: %v", oerr)
	}
	if modified.TotalMinor != 26000 || modified.DiscountName == nil || *modified.DiscountName != "EarlyBird" {
		t.Fatalf("modified = %+v, want the quote's total and discount name", modified)
	}
	var priceRows, dateRows int
	for _, change := range st.Changes() {
		switch change.Field {
		case "priceBasis":
			priceRows++
			if change.Actor != "front-desk" || change.OldValue != int64(24000) || change.NewValue != int64(26000) || change.CreatedAt.IsZero() {
				t.Fatalf("priceBasis change = %+v, want actor and recorded time with both totals", change)
			}
		case "dates":
			dateRows++
		}
	}
	if priceRows != 1 || dateRows != 1 {
		t.Fatalf("change rows = priceBasis %d, dates %d, want exactly one of each", priceRows, dateRows)
	}

	// A second change that lands on the same quoted total writes no
	// second price-basis row.
	svc.QuotePriceHook = allowQuote(26000)
	before := len(st.Changes())
	equal := loopModify(created.Ref)
	equal.ArrivalDate = "2026-11-05"
	equal.DepartureDate = "2026-11-07"
	if _, oerr := svc.Modify(equal); oerr != nil {
		t.Fatalf("equal-total Modify refused: %v", oerr)
	}
	for _, change := range st.Changes()[before:] {
		if change.Field == "priceBasis" {
			t.Fatalf("an unchanged total wrote a priceBasis row: %+v", change)
		}
	}
}

// PA11 — every Modify refusal leaves the stored row, the change
// history, and the outbox byte-identical to before the attempt.
func TestModifyRefusalsChangeNothing(t *testing.T) {
	cases := []struct {
		name  string
		total int64
		quote PriceQuote
		check func(*testing.T, *store.OpError)
	}{
		{
			name:  "forged",
			total: 1000,
			quote: allowQuote(26000),
			check: func(t *testing.T, oerr *store.OpError) {
				assertPriceChanged(t, oerr, 1000, 26000, "2026-11-02", "2026-11-04")
			},
		},
		{
			name:  "unreadable",
			total: 26000,
			quote: func(_, _, _ string, _ *string, _ string) (int64, *string, *store.OpError) {
				return 0, nil, unreadableQuote()
			},
			check: assertPriceUnavailable,
		},
		{
			name:  "definitive refusal",
			total: 26000,
			quote: func(_, _, _ string, _ *string, _ string) (int64, *string, *store.OpError) {
				return 0, nil, &store.OpError{
					Code: "VALIDATION_FAILED", Status: http.StatusBadRequest, Message: "Unknown discount.",
					Details: map[string]any{"field": "discountName"},
				}
			},
			check: func(t *testing.T, oerr *store.OpError) {
				t.Helper()
				if oerr == nil || oerr.Code != "VALIDATION_FAILED" || oerr.Status != http.StatusBadRequest {
					t.Fatalf("error = %v, want the 400 VALIDATION_FAILED surfaced unchanged", oerr)
				}
				assertSameDetails(t, "modify definitive refusal", oerr.Details, map[string]any{"field": "discountName"})
			},
		},
	}
	for _, tc := range cases {
		st := store.New()
		svc := priceService(st)
		svc.QuotePriceHook = allowQuote(24000)
		created, oerr := svc.Create(loopRequest())
		if oerr != nil {
			t.Fatalf("%s: Create refused: %v", tc.name, oerr)
		}
		changesBefore := len(st.Changes())
		eventsBefore := len(st.Events())

		svc.QuotePriceHook = tc.quote
		req := loopModify(created.Ref)
		req.TotalMinor = tc.total
		req.IdempotencyKey = "modify-refusal"
		_, oerr = svc.Modify(req)
		tc.check(t, oerr)

		kept, oerr := st.Get(created.Ref)
		if oerr != nil {
			t.Fatalf("%s: Get refused: %v", tc.name, oerr)
		}
		if kept.TotalMinor != 24000 || kept.ArrivalDate != "2026-11-01" || kept.DepartureDate != "2026-11-03" ||
			kept.RoomTypeID != "deluxe-type" || kept.GuestID != "guest-1" {
			t.Fatalf("%s: stored row = %+v, want it unchanged", tc.name, kept)
		}
		if len(st.Changes()) != changesBefore || len(st.Events()) != eventsBefore {
			t.Fatalf("%s: refusal wrote %d change row(s) and %d event(s)",
				tc.name, len(st.Changes())-changesBefore, len(st.Events())-eventsBefore)
		}
		if replay, oerr := st.Replay("ModifyReservation", created.Ref, "modify-refusal"); oerr != nil || replay != nil {
			t.Fatalf("%s: refusal recorded the modify key (replay %v, err %v)", tc.name, replay, oerr)
		}
	}
}

// PA12 — the quote is read for the effective post-change type and
// dates (the request's values where supplied, the stored row's
// otherwise), an omitted or null discount means no discount, and a
// booking that left confirmed still refuses as today.
func TestModifyQuotesEffectiveValues(t *testing.T) {
	st := store.New()
	svc := priceService(st)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}

	quote := &quoteRead{total: 26000}
	svc.QuotePriceHook = quote.hook()
	req := ModifyRequest{Ref: created.Ref, ArrivalDate: "2026-11-02", RoomTypeID: "suite-type", TotalMinor: 26000, HasTotal: true, Actor: "front-desk", BearerToken: "Bearer caller"}
	if _, oerr := svc.Modify(req); oerr != nil {
		t.Fatalf("Modify refused: %v", oerr)
	}
	if quote.roomTypeID != "suite-type" || quote.arrivalDate != "2026-11-02" || quote.departureDate != "2026-11-03" {
		t.Fatalf("quote read for %s %s..%s, want the effective type and dates", quote.roomTypeID, quote.arrivalDate, quote.departureDate)
	}
	if quote.discountName != nil {
		t.Fatalf("quote discount = %v, want none for an omitted discount", quote.discountName)
	}
	if quote.bearerToken != "Bearer caller" {
		t.Fatalf("quote token = %q, want the caller token forwarded", quote.bearerToken)
	}
	kept, oerr := st.Get(created.Ref)
	if oerr != nil {
		t.Fatalf("Get refused: %v", oerr)
	}
	if kept.TotalMinor != 26000 || kept.RoomTypeID != "suite-type" {
		t.Fatalf("record = %+v, want the reprice stored", kept)
	}
}

// PA12 — a booking that left confirmed (checked in, cancelled, or
// no-show) still refuses a Modify with STATE_ILLEGAL, and the row keeps
// the state and total it had. The state check lives in the guarded
// store step, so this pins the refusal terms rather than an ordering
// claim.
func TestModifyRefusesBookingsThatLeftConfirmed(t *testing.T) {
	cases := []struct {
		name    string
		advance func(*testing.T, *Service, *store.Store, string)
		state   string
	}{
		{
			name: "checked-in",
			advance: func(t *testing.T, _ *Service, st *store.Store, ref string) {
				t.Helper()
				if _, oerr := st.CheckIn(ref, "stay-1", "front-desk", "front-desk"); oerr != nil {
					t.Fatalf("CheckIn refused: %v", oerr)
				}
			},
			state: "checked-in",
		},
		{
			name: "cancelled",
			advance: func(t *testing.T, svc *Service, _ *store.Store, ref string) {
				t.Helper()
				if _, oerr := svc.Cancel(CancelRequest{Ref: ref, Reason: "guest-request", Actor: "front-desk"}); oerr != nil {
					t.Fatalf("Cancel refused: %v", oerr)
				}
			},
			state: "cancelled",
		},
		{
			name: "no-show",
			advance: func(t *testing.T, svc *Service, _ *store.Store, ref string) {
				t.Helper()
				if _, oerr := svc.MarkNoShow(MarkNoShowRequest{Ref: ref, Reason: "no-arrival", Actor: "front-desk"}); oerr != nil {
					t.Fatalf("MarkNoShow refused: %v", oerr)
				}
			},
			state: "no-show",
		},
	}
	for _, tc := range cases {
		st := store.New()
		svc := priceService(st)
		svc.QuotePriceHook = allowQuote(24000)
		created, oerr := svc.Create(loopRequest())
		if oerr != nil {
			t.Fatalf("%s: Create refused: %v", tc.name, oerr)
		}
		tc.advance(t, svc, st, created.Ref)

		svc.QuotePriceHook = allowQuote(26000)
		if _, oerr := svc.Modify(loopModify(created.Ref)); oerr == nil || oerr.Code != "STATE_ILLEGAL" || oerr.Status != http.StatusUnprocessableEntity {
			t.Fatalf("%s: error = %v, want 422 STATE_ILLEGAL", tc.name, oerr)
		}
		kept, oerr := st.Get(created.Ref)
		if oerr != nil {
			t.Fatalf("%s: Get refused: %v", tc.name, oerr)
		}
		if kept.State != tc.state || kept.TotalMinor != 24000 || kept.ArrivalDate != "2026-11-01" || kept.DepartureDate != "2026-11-03" {
			t.Fatalf("%s: record = %+v, want the %s booking unchanged", tc.name, kept, tc.state)
		}
	}
}
