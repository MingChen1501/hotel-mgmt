package service

import (
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store"
)

func seededService() *Service {
	st := store.New()
	_ = st.Apply(store.Event{ID: "evt-rate-1", Subscription: "rate", Type: "rate.availability-set", Payload: map[string]any{"roomTypeId": "deluxe", "date": "2026-11-01", "sellableUnits": 2}})
	_ = st.Apply(store.Event{ID: "evt-res-1", Subscription: "reservation", Type: "reservation.created", Payload: map[string]any{"reservationRef": "RSV-AAA", "roomTypeId": "deluxe", "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "guestId": "guest-1"}})
	return New(st)
}

func TestOccupancyReportServesRebuiltRows(t *testing.T) {
	svc := seededService()
	rows, asOf, oerr := svc.OccupancyReport("2026-11-01", "2026-11-02")
	if oerr != nil {
		t.Fatalf("OccupancyReport: %v", oerr)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %+v, want 2 nights", rows)
	}
	if rows[0].Occupied != 1 || rows[0].Available != 1 {
		t.Fatalf("row = %+v, want occupied 1 available 1", rows[0])
	}
	_ = asOf
}

func TestReportWindowsAreValidated(t *testing.T) {
	svc := seededService()
	if _, _, oerr := svc.OccupancyReport("not-a-date", "2026-11-02"); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("bad dateFrom = %v, want VALIDATION_FAILED", oerr)
	}
	if _, _, oerr := svc.RevenueSummary("2026-11-03", "2026-11-01"); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("reversed window = %v, want VALIDATION_FAILED", oerr)
	}
	if _, oerr := svc.DailySheet("11/02/2026"); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("bad businessDate = %v, want VALIDATION_FAILED", oerr)
	}
}

func TestRevenueSummaryAndDailySheetServeRebuiltRows(t *testing.T) {
	svc := seededService()
	rows, _, oerr := svc.RevenueSummary("2026-11-01", "2026-11-02")
	if oerr != nil {
		t.Fatalf("RevenueSummary: %v", oerr)
	}
	if len(rows) != 2 {
		t.Fatalf("rows = %+v, want one row per date in the window", rows)
	}
	sheet, oerr := svc.DailySheet("2026-11-01")
	if oerr != nil {
		t.Fatalf("DailySheet: %v", oerr)
	}
	if len(sheet.Arrivals) != 1 || sheet.Arrivals[0].Ref != "RSV-AAA" {
		t.Fatalf("arrivals = %+v, want RSV-AAA", sheet.Arrivals)
	}
}
