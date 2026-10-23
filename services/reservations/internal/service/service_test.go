package service

import (
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

func TestCreateHappyPath(t *testing.T) {
	svc := New(store.New())
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
	svc.CheckRestrictionsHook = func(roomTypeID, arrivalDate, departureDate string) *store.OpError {
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

func TestGuardRefusesSecondBookingForLastUnit(t *testing.T) {
	svc := New(store.New())
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
