package service

import (
	"net/http"
	"testing"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

func intPtr(value int) *int { return &value }

func loopRequest() CreateRequest {
	return CreateRequest{
		RoomTypeID:    "deluxe-type",
		ArrivalDate:   "2026-11-01",
		DepartureDate: "2026-11-03",
		Guest:         map[string]any{"guestId": "guest-1", "fullName": "An Nguyen"},
		SellableUnits: intPtr(2),
		TotalMinor:    24000,
		HasTotal:      true,
		Actor:         "front-desk",
	}
}

// allowCapacity answers the capacity read with one fixed derived
// ceiling so the paths below can book without a rooms stub. A nil hook
// fails closed (see TestCreateNilAvailabilityFailsClosed), so every
// test that expects a booking wires this explicitly.
func allowCapacity(units int) AvailabilityCheck {
	return func(roomTypeID, arrivalDate, departureDate, bearerToken string) (int, *store.OpError) {
		return units, nil
	}
}

// allowHook passes every stay so the non-restriction paths below can
// book without the pricing client. A nil hook fails closed (see
// TestCreateNilHookFailsClosed), so tests that expect success must
// wire this explicitly.
func allowHook() RestrictionCheck {
	return func(roomTypeID, arrivalDate, departureDate, bearerToken string) *store.OpError {
		return nil
	}
}

// quoteRead records one QuotePrice call so a guard can assert the
// effective values and how often Pricing was asked.
type quoteRead struct {
	total         int64
	discount      *string
	err           *store.OpError
	calls         int
	roomTypeID    string
	arrivalDate   string
	departureDate string
	discountName  *string
	bearerToken   string
}

// hook adapts the recorded read to the service seam.
func (q *quoteRead) hook() PriceQuote {
	return func(roomTypeID, arrivalDate, departureDate string, discountName *string, bearerToken string) (int64, *string, *store.OpError) {
		q.calls++
		q.roomTypeID, q.arrivalDate, q.departureDate = roomTypeID, arrivalDate, departureDate
		q.discountName, q.bearerToken = discountName, bearerToken
		return q.total, q.discount, q.err
	}
}

// allowQuote answers every quote read with one fixed total and no
// applied discount, so a test that is not about the money path can
// book.
func allowQuote(total int64) PriceQuote {
	return (&quoteRead{total: total}).hook()
}

// forbidQuote fails a test whose path must never ask Pricing — a
// restriction refusal, for example, means re-quoting cannot help.
func forbidQuote(t *testing.T) PriceQuote {
	t.Helper()
	return func(roomTypeID, arrivalDate, departureDate string, discountName *string, bearerToken string) (int64, *string, *store.OpError) {
		t.Fatalf("QuotePrice was called for %s %s..%s, want no quote read", roomTypeID, arrivalDate, departureDate)
		return 0, nil, nil
	}
}

// unreadableQuote sews the fail-closed upstream answer the client
// returns when Pricing cannot be read.
func unreadableQuote() *store.OpError {
	return &store.OpError{
		Code: "UPSTREAM_UNAVAILABLE", Status: http.StatusServiceUnavailable,
		Message: "pricing unavailable",
		Details: map[string]any{"upstream": "rates", "operation": "QuotePrice"},
	}
}

func TestCreateHappyPath(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	record, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	if record.State != "confirmed" || record.TotalMinor != 24000 {
		t.Fatalf("record = %+v, want confirmed with quoted total", record)
	}
	if record.Ref == "" {
		t.Fatal("record has no reference")
	}
}

func TestMissingMandatoryGuestFieldNamesField(t *testing.T) {
	svc := New(store.New())
	req := loopRequest()
	req.Guest = map[string]any{"guestId": "guest-3"}
	_, oerr := svc.Create(req)
	if oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("error = %v, want VALIDATION_FAILED", oerr)
	}
	if oerr.Details["field"] != "fullName" {
		t.Fatalf("details = %v, want the missing field named", oerr.Details)
	}
}

func TestRestrictionViolationRefusesWithCause(t *testing.T) {
	st := store.New()
	svc := New(st)
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = forbidQuote(t)
	svc.CheckRestrictionsHook = func(roomTypeID, arrivalDate, departureDate, bearerToken string) *store.OpError {
		return &store.OpError{Code: "STATE_ILLEGAL", Status: 422, Message: "Minimum stay of 2 nights applies.", Details: map[string]any{"roomTypeId": roomTypeID, "restriction": "min-stay"}}
	}
	_, oerr := svc.Create(loopRequest())
	if oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("error = %v, want STATE_ILLEGAL", oerr)
	}
	if oerr.Details["restriction"] != "min-stay" {
		t.Fatalf("details = %v, want the restriction named", oerr.Details)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}

func TestCreateNilHookFailsClosed(t *testing.T) {
	st := store.New()
	svc := New(st)
	_, oerr := svc.Create(loopRequest())
	if oerr == nil || oerr.Code != "UPSTREAM_UNAVAILABLE" || oerr.Status != http.StatusServiceUnavailable {
		t.Fatalf("error = %v, want 503 UPSTREAM_UNAVAILABLE", oerr)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}

// TestGuardRefusesSecondBookingForLastUnit is `O8` at the service
// level: the ceiling is read on every attempt and two overlapping
// bookings for the last derived unit yield one winner and one
// CONFLICT (AC-OVB-3, FR-OVB-4, BR-49).
func TestGuardRefusesSecondBookingForLastUnit(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(1)
	svc.QuotePriceHook = allowQuote(24000)
	req := loopRequest()
	req.SellableUnits = intPtr(1)
	if _, oerr := svc.Create(req); oerr != nil {
		t.Fatalf("first booking refused: %v", oerr)
	}
	second := loopRequest()
	second.SellableUnits = intPtr(1)
	second.IdempotencyKey = "desk-loop-2"
	_, oerr := svc.Create(second)
	if oerr == nil || oerr.Code != "CONFLICT" {
		t.Fatalf("error = %v, want CONFLICT", oerr)
	}
}

func loopModify(ref string) ModifyRequest {
	return ModifyRequest{
		Ref:           ref,
		ArrivalDate:   "2026-11-02",
		DepartureDate: "2026-11-04",
		SellableUnits: intPtr(2),
		TotalMinor:    26000,
		HasTotal:      true,
		Actor:         "front-desk",
	}
}

func TestModifyHappyPathReprices(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	svc.QuotePriceHook = allowQuote(26000)
	modified, oerr := svc.Modify(loopModify(created.Ref))
	if oerr != nil {
		t.Fatalf("Modify refused: %v", oerr)
	}
	if modified.TotalMinor != 26000 || modified.ArrivalDate != "2026-11-02" {
		t.Fatalf("modified = %+v, want repriced total and new dates", modified)
	}
}

func TestModifyRequiresRepricedTotal(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	req := loopModify(created.Ref)
	req.HasTotal = false
	if _, oerr := svc.Modify(req); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("error = %v, want VALIDATION_FAILED for missing total", oerr)
	}
}

func TestModifyRestrictionRefusesWithCause(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	svc.CheckRestrictionsHook = func(roomTypeID, arrivalDate, departureDate, bearerToken string) *store.OpError {
		return &store.OpError{Code: "STATE_ILLEGAL", Status: 422, Message: "Closed to arrival.", Details: map[string]any{"restriction": "closed-to-arrival"}}
	}
	if _, oerr := svc.Modify(loopModify(created.Ref)); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("error = %v, want STATE_ILLEGAL", oerr)
	}
}

func TestModifyNilHookFailsClosed(t *testing.T) {
	st := store.New()
	svc := New(st)
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	svc.CheckRestrictionsHook = nil
	if _, oerr := svc.Modify(loopModify(created.Ref)); oerr == nil || oerr.Code != "UPSTREAM_UNAVAILABLE" || oerr.Status != http.StatusServiceUnavailable {
		t.Fatalf("error = %v, want 503 UPSTREAM_UNAVAILABLE", oerr)
	}
	kept, oerr := st.Get(created.Ref)
	if oerr != nil {
		t.Fatalf("Get refused: %v", oerr)
	}
	if kept.ArrivalDate != "2026-11-01" || kept.DepartureDate != "2026-11-03" {
		t.Fatalf("record = %+v, want the original dates kept", kept)
	}
}

func TestModifyUnknownRefIsNotFound(t *testing.T) {
	svc := New(store.New())
	req := loopModify("RSV-UNKNOWN")
	if _, oerr := svc.Modify(req); oerr == nil || oerr.Code != "NOT_FOUND" {
		t.Fatalf("error = %v, want NOT_FOUND", oerr)
	}
}

func TestCancelHappyPath(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	cancelled, oerr := svc.Cancel(CancelRequest{Ref: created.Ref, Reason: "guest-request", Actor: "front-desk"})
	if oerr != nil {
		t.Fatalf("Cancel refused: %v", oerr)
	}
	if cancelled.State != "cancelled" || cancelled.CancelReason == nil || *cancelled.CancelReason != "guest-request" {
		t.Fatalf("cancelled = %+v, want cancelled with kept reason", cancelled)
	}
}

func TestCancelMissingReasonRefused(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	if _, oerr := svc.Cancel(CancelRequest{Ref: created.Ref}); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("error = %v, want VALIDATION_FAILED", oerr)
	}
}

func TestMarkNoShowHappyPath(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	req := loopRequest()
	req.ArrivalDate = "2020-01-01"
	req.DepartureDate = "2020-01-03"
	created, oerr := svc.Create(req)
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	marked, oerr := svc.MarkNoShow(MarkNoShowRequest{Ref: created.Ref, Reason: "no-arrival", Actor: "night-audit"})
	if oerr != nil {
		t.Fatalf("MarkNoShow refused: %v", oerr)
	}
	if marked.State != "no-show" || marked.NoShowReason == nil || *marked.NoShowReason != "no-arrival" {
		t.Fatalf("marked = %+v, want no-show with kept reason", marked)
	}
}

func TestMarkNoShowTooEarlyRefused(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	req := loopRequest()
	// The refusal depends on the wall clock: arrive in the future so
	// the stay still reads as not started. Dates derive from the
	// clock, never fixtures.
	req.ArrivalDate = time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	req.DepartureDate = time.Now().UTC().AddDate(0, 0, 3).Format("2006-01-02")
	created, oerr := svc.Create(req)
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	if _, oerr := svc.MarkNoShow(MarkNoShowRequest{Ref: created.Ref, Reason: "no-arrival", Actor: "night-audit"}); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("error = %v, want STATE_ILLEGAL", oerr)
	}
}

// #631 guards (AC-OVB-1..AC-OVB-3, FR-OVB-1..FR-OVB-4, BR-47..BR-49,
// ADR-0006): the ceiling comes from the capacity hook and the request's
// sellableUnits is advisory.

// TestAdvisoryUnitsCannotRefuseABookableStay is `O3` at the service
// level: a low value and an absent value both book when the derived
// ceiling leaves room, so "ignored" never hides an always-refuse guard.
func TestAdvisoryUnitsCannotRefuseABookableStay(t *testing.T) {
	for _, advisory := range []*int{nil, intPtr(1)} {
		svc := New(store.New())
		svc.CheckRestrictionsHook = allowHook()
		svc.AvailabilityHook = allowCapacity(3)
		svc.QuotePriceHook = allowQuote(24000)
		req := loopRequest()
		req.SellableUnits = advisory
		record, oerr := svc.Create(req)
		if oerr != nil {
			t.Fatalf("advisory %v refused a bookable stay: %v", advisory, oerr)
		}
		if record.State != "confirmed" {
			t.Fatalf("advisory %v booked state %q, want confirmed", advisory, record.State)
		}
	}
}

// TestNegativeAdvisoryUnitsRefused is the shape half of `O3`: a
// malformed value still fails loudly naming the field instead of
// deciding the booking.
func TestNegativeAdvisoryUnitsRefused(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(3)
	svc.QuotePriceHook = allowQuote(24000)
	req := loopRequest()
	req.SellableUnits = intPtr(-1)
	_, oerr := svc.Create(req)
	if oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("error = %v, want VALIDATION_FAILED", oerr)
	}
	if oerr.Details["field"] != "sellableUnits" {
		t.Fatalf("details = %v, want sellableUnits named", oerr.Details)
	}
	modify := loopModify("RSV-ANY")
	modify.SellableUnits = intPtr(-1)
	if _, oerr := svc.Modify(modify); oerr == nil || oerr.Code != "VALIDATION_FAILED" || oerr.Details["field"] != "sellableUnits" {
		t.Fatalf("modify error = %v, want VALIDATION_FAILED naming sellableUnits", oerr)
	}
}

// TestZeroCapacityIsSoldOutConflict is `O5`: a recorded capacity of
// zero is a legitimate sold-out answer, refused as CONFLICT and never
// as a fail-closed 5xx, with nothing written.
func TestZeroCapacityIsSoldOutConflict(t *testing.T) {
	st := store.New()
	svc := New(st)
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(0)
	svc.QuotePriceHook = allowQuote(24000)
	_, oerr := svc.Create(loopRequest())
	if oerr == nil || oerr.Code != "CONFLICT" || oerr.Status != http.StatusConflict {
		t.Fatalf("error = %v, want 409 CONFLICT for zero capacity", oerr)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}

// TestCreateNilAvailabilityHookFailsClosed is `O6`: an unwired
// capacity client refuses the booking instead of falling back to the
// request's number.
func TestCreateNilAvailabilityHookFailsClosed(t *testing.T) {
	st := store.New()
	svc := New(st)
	svc.CheckRestrictionsHook = allowHook()
	_, oerr := svc.Create(loopRequest())
	assertAvailabilityUnavailable(t, oerr)
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 0 {
		t.Fatalf("store holds %d reservations after refusal, want 0", got)
	}
}

// TestModifyNilAvailabilityHookFailsClosed is the modify half of `O6`.
func TestModifyNilAvailabilityHookFailsClosed(t *testing.T) {
	st := store.New()
	svc := New(st)
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	svc.AvailabilityHook = nil
	_, oerr = svc.Modify(loopModify(created.Ref))
	assertAvailabilityUnavailable(t, oerr)
	kept, oerr := st.Get(created.Ref)
	if oerr != nil {
		t.Fatalf("Get refused: %v", oerr)
	}
	if kept.ArrivalDate != "2026-11-01" || kept.DepartureDate != "2026-11-03" {
		t.Fatalf("record = %+v, want the original dates kept", kept)
	}
}

// TestUnreadableCapacityWritesNothing is `O6` on the create and modify
// paths: a 503 from the capacity read leaves no reservation row, no
// change-history entry, and no stored idempotency key.
func TestUnreadableCapacityWritesNothing(t *testing.T) {
	st := store.New()
	svc := New(st)
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	changesBefore := len(st.Changes())

	svc.AvailabilityHook = func(roomTypeID, arrivalDate, departureDate, bearerToken string) (int, *store.OpError) {
		return 0, &store.OpError{
			Code: "UPSTREAM_UNAVAILABLE", Status: http.StatusServiceUnavailable,
			Message: "inventory unavailable", Details: map[string]any{"upstream": "rooms", "operation": "CheckRoomTypeSellability"},
		}
	}
	refused := loopRequest()
	refused.IdempotencyKey = "unreadable-create"
	_, oerr = svc.Create(refused)
	assertAvailabilityUnavailable(t, oerr)
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 1 {
		t.Fatalf("store holds %d reservations after the refusal, want the original 1", got)
	}
	_, oerr = svc.Modify(loopModify(created.Ref))
	assertAvailabilityUnavailable(t, oerr)
	if len(st.Changes()) != changesBefore {
		t.Fatalf("refused modify wrote %d change row(s)", len(st.Changes())-changesBefore)
	}
}

// TestCapacityReadUsesEffectiveModifyValues is `O6`/ADR-0006 D2: a
// modification reads the ceiling for the room type and dates it will
// apply — the request's value where supplied, otherwise the stored
// row's.
func TestCapacityReadUsesEffectiveModifyValues(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	svc.AvailabilityHook = allowCapacity(2)
	svc.QuotePriceHook = allowQuote(24000)
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	var seenRoomType, seenArrival, seenDeparture string
	svc.AvailabilityHook = func(roomTypeID, arrivalDate, departureDate, bearerToken string) (int, *store.OpError) {
		seenRoomType, seenArrival, seenDeparture = roomTypeID, arrivalDate, departureDate
		return 2, nil
	}
	svc.QuotePriceHook = allowQuote(26000)
	req := ModifyRequest{Ref: created.Ref, TotalMinor: 26000, HasTotal: true, Actor: "front-desk"}
	if _, oerr := svc.Modify(req); oerr != nil {
		t.Fatalf("Modify refused: %v", oerr)
	}
	if seenRoomType != "deluxe-type" || seenArrival != "2026-11-01" || seenDeparture != "2026-11-03" {
		t.Fatalf("capacity read for %s %s..%s, want the stored type and dates", seenRoomType, seenArrival, seenDeparture)
	}
}

// assertAvailabilityUnavailable pins the fail-closed envelope shape:
// 503 UPSTREAM_UNAVAILABLE naming the rooms upstream and the operation.
func assertAvailabilityUnavailable(t *testing.T, oerr *store.OpError) {
	t.Helper()
	if oerr == nil || oerr.Code != "UPSTREAM_UNAVAILABLE" || oerr.Status != http.StatusServiceUnavailable {
		t.Fatalf("error = %v, want 503 UPSTREAM_UNAVAILABLE", oerr)
	}
	if oerr.Details["upstream"] != "rooms" || oerr.Details["operation"] != "CheckRoomTypeSellability" {
		t.Fatalf("details = %v, want rooms/CheckRoomTypeSellability named", oerr.Details)
	}
}
