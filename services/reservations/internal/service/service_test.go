package service

import (
	"net/http"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

func loopRequest() CreateRequest {
	return CreateRequest{
		RoomTypeID:    "deluxe-type",
		ArrivalDate:   "2026-11-01",
		DepartureDate: "2026-11-03",
		Guest:         map[string]any{"guestId": "guest-1", "fullName": "An Nguyen"},
		SellableUnits: 2,
		TotalMinor:    24000,
		HasTotal:      true,
		Actor:         "front-desk",
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

func TestCreateHappyPath(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
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

func TestGuardRefusesSecondBookingForLastUnit(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	req := loopRequest()
	req.SellableUnits = 1
	if _, oerr := svc.Create(req); oerr != nil {
		t.Fatalf("first booking refused: %v", oerr)
	}
	second := loopRequest()
	second.SellableUnits = 1
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
		SellableUnits: 2,
		TotalMinor:    26000,
		HasTotal:      true,
		Actor:         "front-desk",
	}
}

func TestModifyHappyPathReprices(t *testing.T) {
	svc := New(store.New())
	svc.CheckRestrictionsHook = allowHook()
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
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
	created, oerr := svc.Create(loopRequest())
	if oerr != nil {
		t.Fatalf("Create refused: %v", oerr)
	}
	if _, oerr := svc.MarkNoShow(MarkNoShowRequest{Ref: created.Ref, Reason: "no-arrival", Actor: "night-audit"}); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("error = %v, want STATE_ILLEGAL", oerr)
	}
}
