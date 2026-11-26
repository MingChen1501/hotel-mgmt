package service

import (
	"reflect"
	"testing"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/messages"
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

// seededTwoYearService seeds one sellable unit for every date of the
// documented two-year window so the at-cap pair can assert row shape.
func seededTwoYearService(t *testing.T) *Service {
	t.Helper()
	st := store.New()
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	for i := 0; i <= 730; i++ {
		day := base.AddDate(0, 0, i).Format("2006-01-02")
		event := store.Event{
			ID: "evt-span-" + day, Subscription: "rate", Type: "rate.availability-set",
			Payload: map[string]any{"roomTypeId": "deluxe", "date": day, "sellableUnits": 1},
		}
		if oerr := st.Apply(event); oerr != nil {
			t.Fatalf("seed availability %s: %v", day, oerr)
		}
	}
	return New(st)
}

func spanSentence() string {
	return messages.Text("reporting.validation.date_range_span", map[string]string{"max": messages.Num(730)})
}

func requireSpanRefusal(t *testing.T, oerr *store.OpError) {
	t.Helper()
	if oerr == nil {
		t.Fatal("over-cap window accepted, want VALIDATION_FAILED")
	}
	if oerr.Code != "VALIDATION_FAILED" || oerr.Status != 400 {
		t.Fatalf("refusal = %s %d, want VALIDATION_FAILED 400", oerr.Code, oerr.Status)
	}
	if got := oerr.Details["field"]; got != "dateTo" {
		t.Fatalf("details.field = %v, want dateTo", got)
	}
	if oerr.Message != spanSentence() {
		t.Fatalf("message = %q, want %q", oerr.Message, spanSentence())
	}
}

// TestOverCapWindowsAreRefusedByTheService covers RPT1/RPT2 at the
// service layer, including the finding's own window (RPT4).
func TestOverCapWindowsAreRefusedByTheService(t *testing.T) {
	svc := seededService()
	for _, window := range []struct{ from, to string }{
		{"2024-01-01", "2026-01-01"},
		{"0001-01-01", "9999-12-31"},
	} {
		rows, asOf, oerr := svc.OccupancyReport(window.from, window.to)
		if rows != nil || !asOf.IsZero() {
			t.Fatalf("occupancy %s..%s returned rows or asOf alongside the refusal", window.from, window.to)
		}
		requireSpanRefusal(t, oerr)

		revenue, asOf, oerr := svc.RevenueSummary(window.from, window.to)
		if revenue != nil || !asOf.IsZero() {
			t.Fatalf("revenue %s..%s returned rows or asOf alongside the refusal", window.from, window.to)
		}
		requireSpanRefusal(t, oerr)
	}
}

// TestReportRangeCapBoundaryAtTheService is the at-cap acceptance pair
// (RPT3): 731 inclusive dates are served, one night more is refused.
func TestReportRangeCapBoundaryAtTheService(t *testing.T) {
	svc := seededTwoYearService(t)

	occupancy, _, oerr := svc.OccupancyReport("2024-01-01", "2025-12-31")
	if oerr != nil {
		t.Fatalf("at-cap OccupancyReport refused: %v", oerr)
	}
	if len(occupancy) != 731 || occupancy[0].NightDate != "2024-01-01" || occupancy[730].NightDate != "2025-12-31" {
		t.Fatalf("at-cap occupancy rows = %d (%+v..), want 731 dates 2024-01-01..2025-12-31", len(occupancy), occupancy[0])
	}

	revenue, _, oerr := svc.RevenueSummary("2024-01-01", "2025-12-31")
	if oerr != nil {
		t.Fatalf("at-cap RevenueSummary refused: %v", oerr)
	}
	if len(revenue) != 731 || revenue[0].BusinessDate != "2024-01-01" || revenue[730].BusinessDate != "2025-12-31" {
		t.Fatalf("at-cap revenue rows = %d (%+v..), want 731 dates 2024-01-01..2025-12-31", len(revenue), revenue[0])
	}

	if _, _, oerr := svc.OccupancyReport("2024-01-01", "2026-01-01"); oerr == nil {
		t.Fatal("one night over the cap served by occupancy, want refusal")
	} else {
		requireSpanRefusal(t, oerr)
	}
	if _, _, oerr := svc.RevenueSummary("2024-01-01", "2026-01-01"); oerr == nil {
		t.Fatal("one night over the cap served by revenue, want refusal")
	} else {
		requireSpanRefusal(t, oerr)
	}
}

// TestReversedWindowKeepsTheOrderSentence is the order-first half of
// RPT7: a negative span never borrows the cap sentence.
func TestReversedWindowKeepsTheOrderSentence(t *testing.T) {
	svc := seededService()
	_, _, oerr := svc.OccupancyReport("2026-11-03", "2026-11-01")
	if oerr == nil || oerr.Code != "VALIDATION_FAILED" || oerr.Status != 400 {
		t.Fatalf("reversed window = %v, want VALIDATION_FAILED 400", oerr)
	}
	if got := oerr.Details["field"]; got != "dateTo" {
		t.Fatalf("details.field = %v, want dateTo", got)
	}
	if want := messages.Text("error.validation.date_range_order", nil); oerr.Message != want {
		t.Fatalf("reversed window message = %q, want the order sentence %q", oerr.Message, want)
	}
	if oerr.Message == spanSentence() {
		t.Fatal("reversed window borrowed the span sentence")
	}
}

// TestReportsCarryTheServedSetsAsOf is the service half of RB7
// (AC-RPT-9, FR-RPT-6, FR-RPT-7): every report the desk calls carries
// its set's as-of stamp, and a failed rebuild leaves all four answers
// on the last-good set with the older stamp instead of refusing or
// serving zeros.
func TestReportsCarryTheServedSetsAsOf(t *testing.T) {
	stamp := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	events := []store.Event{
		{ID: "evt-rate-1", Subscription: "rate", Type: "rate.availability-set", OccurredAt: stamp, Payload: map[string]any{"roomTypeId": "deluxe", "date": "2026-11-01", "sellableUnits": 2}},
		{ID: "evt-res-1", Subscription: "reservation", Type: "reservation.created", OccurredAt: stamp, Payload: map[string]any{"reservationRef": "RSV-AAA", "roomTypeId": "deluxe", "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "guestId": "guest-1"}},
	}
	st := store.New()
	if oerr := st.Rebuild(events); oerr != nil {
		t.Fatalf("Rebuild: %v", oerr)
	}
	svc := New(st)

	readAll := func() ([]store.NightRow, []store.RevenueRow, *store.DailySheet, []store.HousekeepingRoom, [4]time.Time) {
		t.Helper()
		occupancy, occupancyAsOf, oerr := svc.OccupancyReport("2026-11-01", "2026-11-02")
		if oerr != nil {
			t.Fatalf("OccupancyReport: %v", oerr)
		}
		revenue, revenueAsOf, oerr := svc.RevenueSummary("2026-11-01", "2026-11-02")
		if oerr != nil {
			t.Fatalf("RevenueSummary: %v", oerr)
		}
		sheet, oerr := svc.DailySheet("2026-11-01")
		if oerr != nil {
			t.Fatalf("DailySheet: %v", oerr)
		}
		rooms, housekeepingAsOf := svc.HousekeepingReport()
		return occupancy, revenue, sheet, rooms, [4]time.Time{occupancyAsOf, revenueAsOf, sheet.AsOf, housekeepingAsOf}
	}
	requireStamp := func(stamps [4]time.Time, label string) {
		t.Helper()
		for i, got := range stamps {
			if got.IsZero() || !got.Equal(stamp) {
				t.Fatalf("%s report %d asOf = %s, want the served set's stamp %s", label, i, got, stamp)
			}
		}
	}

	occupancy, revenue, sheet, rooms, stamps := readAll()
	requireStamp(stamps, "clean")

	bad := store.Event{ID: "evt-bad-mid", Subscription: "reservation", Type: "reservation.created", OccurredAt: stamp, Payload: map[string]any{"roomTypeId": "deluxe"}}
	slice := append([]store.Event{events[0]}, bad)
	slice = append(slice, events[1])
	if oerr := st.Rebuild(slice); oerr == nil {
		t.Fatal("a rebuild over a malformed mid-stream event succeeded")
	}

	againOccupancy, againRevenue, againSheet, againRooms, againStamps := readAll()
	requireStamp(againStamps, "post-abort")
	if !reflect.DeepEqual(againOccupancy, occupancy) {
		t.Fatalf("occupancy rows moved after a failed rebuild: %+v -> %+v", occupancy, againOccupancy)
	}
	if !reflect.DeepEqual(againRevenue, revenue) {
		t.Fatalf("revenue rows moved after a failed rebuild: %+v -> %+v", revenue, againRevenue)
	}
	if !reflect.DeepEqual(againSheet, sheet) {
		t.Fatalf("daily sheet moved after a failed rebuild: %+v -> %+v", sheet, againSheet)
	}
	if !reflect.DeepEqual(againRooms, rooms) {
		t.Fatalf("housekeeping list moved after a failed rebuild: %+v -> %+v", rooms, againRooms)
	}
}
