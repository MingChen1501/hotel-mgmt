package service

// NFR-PERF-2 timing record: two years of 50-room operating data are
// generated as domain events, folded through the real Rebuild path,
// then each standard report is timed over the full window. CI runs
// are variants (test-strategy L2): this test asserts completion and
// scale-correctness, never the 5 s single-host bound. The bound
// assertion engages only with REFERENCE_HOST=1 on the 2*4*50
// reference host.
// Housekeeping is timed in this same harness now that its read op
// has landed (#191): room states are seeded alongside the stay feed
// so the report scans a realistic 50-room floor.

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store"
)

const (
	perfRooms    = 50
	perfRoomType = "standard"
	perfUnits    = 50
)

// perfFacts describes the machine the timings were measured on. CI
// runners are labelled ci-e2e-variant and never compared against
// single-host bounds.
func perfFacts() string {
	label := os.Getenv("PERF_ENV_LABEL")
	if label == "" {
		label = "ci-e2e-variant"
	}
	mem := "unknown"
	if raw, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.Split(string(raw), "\n") {
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					mem = fields[1] + fields[2]
				}
				break
			}
		}
	}
	disk := "unknown"
	var fs syscall.Statfs_t
	if err := syscall.Statfs("/tmp", &fs); err == nil {
		disk = fmt.Sprintf("%dMiB-avail", fs.Bavail*uint64(fs.Bsize)>>20)
	}
	return fmt.Sprintf("label=%s go=%s cpus=%d mem=%s disk=%s", label, runtime.Version(), runtime.NumCPU(), mem, disk)
}

func perfDay(base time.Time, index int) string {
	return base.AddDate(0, 0, index).Format("2006-01-02")
}

// perfBooked reports whether room r is occupied on day index i. Two
// of every three room-nights are booked, deterministically.
func perfBooked(i, r int) bool {
	return (i+r)%3 != 0
}

func perfExtra(i, r int) bool {
	return (i+r)%7 == 0
}

// perfRoomState assigns each perf room a deterministic starting
// housekeeping state covering the FR-RPT-4 state machine: dirty,
// clean, inspected, out of order, and occupied rooms. Seeded via
// room.room-upserted events so the report scans a realistic 50-room
// floor instead of an empty projection.
func perfRoomState(r int) string {
	switch r % 5 {
	case 0:
		return "vacant-dirty"
	case 1:
		return "vacant-clean"
	case 2:
		return "vacant-inspected"
	case 3:
		return "out-of-order"
	default:
		return "occupied"
	}
}

// TestPerfTwoYearReportsRecordTimings generates two years of 50-room
// operating data, rebuilds the read model, and times the occupancy,
// revenue, daily-sheet, and housekeeping reads over the full window.
func TestPerfTwoYearReportsRecordTimings(t *testing.T) {
	base := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
	const windowDays = 731 // 2024-01-01..2025-12-31: two years of operating data
	windowFrom := perfDay(base, 0)
	windowTo := perfDay(base, windowDays-1)

	var events []store.Event
	emit := func(id, subscription, typ string, day time.Time, payload map[string]any) {
		events = append(events, store.Event{ID: id, Subscription: subscription, Type: typ, OccurredAt: day, Payload: payload})
	}
	for r := 0; r < perfRooms; r++ {
		emit(fmt.Sprintf("perf-hkstate-%d", r), "room", "room.room-upserted", base,
			map[string]any{"roomNumber": fmt.Sprintf("room-p-%d", r), "roomTypeId": perfRoomType, "state": perfRoomState(r), "actor": "perf-seed"})
	}
	for i := 0; i < windowDays; i++ {
		day := base.AddDate(0, 0, i)
		name := perfDay(base, i)
		emit(fmt.Sprintf("perf-rate-%d", i), "rate", "rate.availability-set", day,
			map[string]any{"roomTypeId": perfRoomType, "date": name, "sellableUnits": perfUnits})
		for r := 0; r < perfRooms; r++ {
			if !perfBooked(i, r) {
				continue
			}
			next := perfDay(base, i+1)
			ref := fmt.Sprintf("RSV-P-%d-%d", i, r)
			stay := fmt.Sprintf("ST-P-%d-%d", i, r)
			folio := fmt.Sprintf("FOL-P-%d-%d", i, r)
			roomAmount := int64(100000 + r)
			emit(fmt.Sprintf("perf-res-%d-%d", i, r), "reservation", "reservation.created", day,
				map[string]any{"reservationRef": ref, "roomTypeId": perfRoomType, "arrivalDate": name, "departureDate": next, "guestId": fmt.Sprintf("guest-p-%d", r)})
			emit(fmt.Sprintf("perf-in-%d-%d", i, r), "stay", "stay.checked-in", day,
				map[string]any{"stayId": stay, "reservationRef": ref, "roomId": fmt.Sprintf("room-p-%d", r), "date": name})
			emit(fmt.Sprintf("perf-out-%d-%d", i, r), "stay", "stay.checked-out", day,
				map[string]any{"stayId": stay, "reservationRef": ref, "date": next})
			emit(fmt.Sprintf("perf-room-%d-%d", i, r), "folio", "folio.charge-posted", day,
				map[string]any{"folioId": folio, "businessDate": name, "kind": "room", "amountMinor": roomAmount})
			if perfExtra(i, r) {
				emit(fmt.Sprintf("perf-extra-%d-%d", i, r), "folio", "folio.charge-posted", day,
					map[string]any{"folioId": folio, "businessDate": name, "kind": "extra", "amountMinor": int64(20000)})
			}
			emit(fmt.Sprintf("perf-pay-%d-%d", i, r), "folio", "folio.payment-recorded", day,
				map[string]any{"folioId": folio, "businessDate": name, "amountMinor": roomAmount})
		}
	}
	t.Logf("perf seed: %d events over %d days for %d rooms", len(events), windowDays, perfRooms)

	st := store.New()
	rebuildStart := time.Now()
	if oerr := st.Rebuild(events); oerr != nil {
		t.Fatalf("Rebuild: %v", oerr)
	}
	fmt.Printf("PERF name=rebuild elapsedMs=%d env=%s events=%d\n",
		time.Since(rebuildStart).Milliseconds(), perfFacts(), len(events))

	svc := New(st)
	timed := func(name string, run func() *store.OpError) time.Duration {
		t.Helper()
		start := time.Now()
		if oerr := run(); oerr != nil {
			t.Fatalf("%s: %v", name, oerr)
		}
		elapsed := time.Since(start)
		fmt.Printf("PERF name=%s elapsedMs=%d env=%s\n", name, elapsed.Milliseconds(), perfFacts())
		return elapsed
	}

	var occupancy []store.NightRow
	occElapsed := timed("OccupancyReport", func() *store.OpError {
		rows, _, oerr := svc.OccupancyReport(windowFrom, windowTo)
		occupancy = rows
		return oerr
	})
	if len(occupancy) != windowDays {
		t.Fatalf("occupancy rows = %d, want one per day over %d days", len(occupancy), windowDays)
	}
	spot := 400
	var wantOccupied int
	for r := 0; r < perfRooms; r++ {
		if perfBooked(spot, r) {
			wantOccupied++
		}
	}
	spotName := perfDay(base, spot)
	found := false
	for _, row := range occupancy {
		if row.NightDate == spotName && row.RoomType == perfRoomType {
			found = true
			if row.Occupied != wantOccupied || row.Available != perfUnits-wantOccupied {
				t.Fatalf("spot row = %+v, want occupied %d available %d", row, wantOccupied, perfUnits-wantOccupied)
			}
		}
	}
	if !found {
		t.Fatalf("no occupancy row for %s %s", spotName, perfRoomType)
	}

	var revenue []store.RevenueRow
	revElapsed := timed("RevenueSummary", func() *store.OpError {
		rows, _, oerr := svc.RevenueSummary(windowFrom, windowTo)
		revenue = rows
		return oerr
	})
	if len(revenue) != windowDays {
		t.Fatalf("revenue rows = %d, want one per day over %d days", len(revenue), windowDays)
	}
	var wantRoom, wantExtra int64
	var wantNights, wantExtras int
	for i := 0; i < windowDays; i++ {
		for r := 0; r < perfRooms; r++ {
			if !perfBooked(i, r) {
				continue
			}
			wantNights++
			wantRoom += int64(100000 + r)
			if perfExtra(i, r) {
				wantExtras++
				wantExtra += 20000
			}
		}
	}
	var gotRoom, gotExtra int64
	for _, row := range revenue {
		gotRoom += row.RoomRevenue
		gotExtra += row.ExtraRevenue
	}
	if gotRoom != wantRoom || gotExtra != wantExtra {
		t.Fatalf("revenue totals = room %d extra %d, want room %d extra %d over %d nights (%d with extras)",
			gotRoom, gotExtra, wantRoom, wantExtra, wantNights, wantExtras)
	}

	mid := perfDay(base, spot)
	var sheet *store.DailySheet
	sheetElapsed := timed("DailySheet", func() *store.OpError {
		got, oerr := svc.DailySheet(mid)
		sheet = got
		return oerr
	})
	var wantDepartures int
	for r := 0; r < perfRooms; r++ {
		if perfBooked(spot-1, r) {
			wantDepartures++
		}
	}
	var wantOpen int
	for i := 0; i < windowDays; i++ {
		for r := 0; r < perfRooms; r++ {
			if perfBooked(i, r) && perfExtra(i, r) {
				wantOpen++
			}
		}
	}
	if len(sheet.Arrivals) != wantOccupied || len(sheet.InHouse) != wantOccupied {
		t.Fatalf("sheet arrivals = %d in-house = %d, want %d each on %s",
			len(sheet.Arrivals), len(sheet.InHouse), wantOccupied, mid)
	}
	if len(sheet.Departures) != wantDepartures {
		t.Fatalf("sheet departures = %d, want %d on %s", len(sheet.Departures), wantDepartures, mid)
	}
	if len(sheet.OpenBalances) != wantOpen {
		t.Fatalf("sheet open balances = %d, want %d unpaid extras across the window", len(sheet.OpenBalances), wantOpen)
	}
	for _, entry := range sheet.OpenBalances {
		if entry.BalanceMinor != 20000 {
			t.Fatalf("open balance = %+v, want the unpaid 20000 extra", entry)
		}
	}

	var housekeeping []store.HousekeepingRoom
	var hkAsOf time.Time
	hkElapsed := timed("HousekeepingReport", func() *store.OpError {
		rooms, asOf := svc.HousekeepingReport()
		housekeeping = rooms
		hkAsOf = asOf
		return nil
	})
	if hkAsOf.IsZero() {
		t.Fatal("housekeeping report carries no as-of timestamp")
	}
	wantHousekeeping := map[string]string{}
	for r := 0; r < perfRooms; r++ {
		state := perfRoomState(r)
		if state == "occupied" {
			// Every perf room is booked on ~2 of every 3 days, so
			// its first stay check-out flips it to vacant-dirty
			// (only the rooms module's own state-changed event
			// could overwrite that, and the seed emits none).
			state = "vacant-dirty"
		}
		if state == "vacant-dirty" || state == "vacant-clean" {
			wantHousekeeping[fmt.Sprintf("room-p-%d", r)] = state
		}
	}
	if len(housekeeping) != len(wantHousekeeping) {
		t.Fatalf("housekeeping rooms = %d, want %d over %d rooms", len(housekeeping), len(wantHousekeeping), perfRooms)
	}
	for _, room := range housekeeping {
		want, found := wantHousekeeping[room.Room]
		if !found {
			t.Fatalf("unexpected room on the housekeeping report: %+v", room)
		}
		if room.State != want {
			t.Fatalf("room %s state = %q, want %q", room.Room, room.State, want)
		}
	}

	if os.Getenv("REFERENCE_HOST") == "1" {
		for name, elapsed := range map[string]time.Duration{
			"OccupancyReport": occElapsed, "RevenueSummary": revElapsed, "DailySheet": sheetElapsed,
			"HousekeepingReport": hkElapsed,
		} {
			if elapsed > 5*time.Second {
				t.Fatalf("%s took %v on the reference host, want within 5 s", name, elapsed)
			}
		}
	}
}
