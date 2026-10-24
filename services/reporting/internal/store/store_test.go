package store

import (
	"testing"
	"time"
)

func at(day string) time.Time {
	moment, err := time.Parse(time.RFC3339, day+"T10:00:00Z")
	if err != nil {
		panic(err)
	}
	return moment
}

// seedEvents builds the source rows for the paired check as domain
// events: two Deluxe bookings over Nov 1-3 (one cancelled), one
// Standard booking over Nov 2-4 checked in Nov 2 and out Nov 3,
// availability baselines, and folio charges plus a payment.
func seedEvents() []Event {
	return []Event{
		{ID: "evt-rate-1", Subscription: "rate", Type: "rate.availability-set", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomTypeId": "deluxe", "date": "2026-11-01", "sellableUnits": 2}},
		{ID: "evt-rate-2", Subscription: "rate", Type: "rate.availability-set", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomTypeId": "deluxe", "date": "2026-11-02", "sellableUnits": 2}},
		{ID: "evt-rate-3", Subscription: "rate", Type: "rate.availability-set", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomTypeId": "standard", "date": "2026-11-02", "sellableUnits": 1}},
		{ID: "evt-rate-4", Subscription: "rate", Type: "rate.availability-set", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomTypeId": "standard", "date": "2026-11-03", "sellableUnits": 1}},
		{ID: "evt-res-1", Subscription: "reservation", Type: "reservation.created", OccurredAt: at("2026-11-01"), Payload: map[string]any{"reservationRef": "RSV-AAA", "roomTypeId": "deluxe", "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "guestId": "guest-1"}},
		{ID: "evt-res-2", Subscription: "reservation", Type: "reservation.created", OccurredAt: at("2026-11-01"), Payload: map[string]any{"reservationRef": "RSV-BBB", "roomTypeId": "deluxe", "arrivalDate": "2026-11-01", "departureDate": "2026-11-03", "guestId": "guest-2"}},
		{ID: "evt-res-3", Subscription: "reservation", Type: "reservation.cancelled", OccurredAt: at("2026-11-01"), Payload: map[string]any{"reservationRef": "RSV-BBB"}},
		{ID: "evt-res-4", Subscription: "reservation", Type: "reservation.created", OccurredAt: at("2026-11-02"), Payload: map[string]any{"reservationRef": "RSV-CCC", "roomTypeId": "standard", "arrivalDate": "2026-11-02", "departureDate": "2026-11-04", "guestId": "guest-3"}},
		{ID: "evt-stay-1", Subscription: "stay", Type: "stay.checked-in", OccurredAt: at("2026-11-02"), Payload: map[string]any{"stayId": "stay-1", "reservationRef": "RSV-CCC", "roomId": "room-101", "date": "2026-11-02"}},
		{ID: "evt-stay-2", Subscription: "stay", Type: "stay.checked-out", OccurredAt: at("2026-11-03"), Payload: map[string]any{"stayId": "stay-1", "date": "2026-11-03"}},
		{ID: "evt-folio-1", Subscription: "folio", Type: "folio.charge-posted", OccurredAt: at("2026-11-02"), Payload: map[string]any{"folioId": "folio-1", "businessDate": "2026-11-02", "kind": "room", "amountMinor": 18000}},
		{ID: "evt-folio-2", Subscription: "folio", Type: "folio.charge-posted", OccurredAt: at("2026-11-02"), Payload: map[string]any{"folioId": "folio-1", "businessDate": "2026-11-02", "kind": "extra", "amountMinor": 2500}},
		{ID: "evt-folio-3", Subscription: "folio", Type: "folio.charge-posted", OccurredAt: at("2026-11-03"), Payload: map[string]any{"folioId": "folio-2", "businessDate": "2026-11-03", "kind": "room", "amountMinor": 12000}},
		{ID: "evt-folio-4", Subscription: "folio", Type: "folio.payment-recorded", OccurredAt: at("2026-11-03"), Payload: map[string]any{"folioId": "folio-1", "businessDate": "2026-11-03", "amountMinor": 20500}},
	}
}

func night(rows []NightRow, date, roomType string) NightRow {
	for _, row := range rows {
		if row.NightDate == date && row.RoomType == roomType {
			return row
		}
	}
	return NightRow{}
}

func dayTotal(rows []RevenueRow, date string) RevenueRow {
	for _, row := range rows {
		if row.BusinessDate == date {
			return row
		}
	}
	return RevenueRow{}
}

// TestRebuildMatchesSourceRows is the paired verification for
// FR-RPT-1..3: the read model is rebuilt from outbox events, then
// occupancy, revenue, and the daily sheet are compared against the
// source rows the events describe.
func TestRebuildMatchesSourceRows(t *testing.T) {
	st := New()
	if oerr := st.Rebuild(seedEvents()); oerr != nil {
		t.Fatalf("Rebuild: %v", oerr)
	}

	occupancy, asOf, oerr := st.Occupancy("2026-11-01", "2026-11-03")
	if oerr != nil {
		t.Fatalf("Occupancy: %v", oerr)
	}
	if asOf.IsZero() {
		t.Fatal("occupancy report carries no as-of timestamp")
	}
	// RSV-AAA occupies both Deluxe nights; RSV-BBB was cancelled.
	first := night(occupancy, "2026-11-01", "deluxe")
	if first.Occupied != 1 || first.Available != 1 {
		t.Fatalf("Nov 1 deluxe = %+v, want occupied 1 available 1", first)
	}
	second := night(occupancy, "2026-11-02", "deluxe")
	if second.Occupied != 1 || second.Available != 1 {
		t.Fatalf("Nov 2 deluxe = %+v, want occupied 1 available 1", second)
	}
	std := night(occupancy, "2026-11-02", "standard")
	if std.Occupied != 1 || std.Available != 0 {
		t.Fatalf("Nov 2 standard = %+v, want occupied 1 available 0", std)
	}

	revenue, _, oerr := st.Revenue("2026-11-02", "2026-11-03")
	if oerr != nil {
		t.Fatalf("Revenue: %v", oerr)
	}
	nov2 := dayTotal(revenue, "2026-11-02")
	if nov2.RoomRevenue != 18000 || nov2.ExtraRevenue != 2500 {
		t.Fatalf("Nov 2 revenue = %+v, want room 18000 extra 2500", nov2)
	}
	nov3 := dayTotal(revenue, "2026-11-03")
	if nov3.RoomRevenue != 12000 || nov3.ExtraRevenue != 0 {
		t.Fatalf("Nov 3 revenue = %+v, want room 12000 extra 0", nov3)
	}

	sheet, oerr := st.Sheet("2026-11-02")
	if oerr != nil {
		t.Fatalf("Sheet: %v", oerr)
	}
	if len(sheet.Arrivals) != 1 || sheet.Arrivals[0].Ref != "RSV-CCC" {
		t.Fatalf("Nov 2 arrivals = %+v, want RSV-CCC", sheet.Arrivals)
	}
	if len(sheet.InHouse) != 1 || sheet.InHouse[0].Ref != "stay-1" {
		t.Fatalf("Nov 2 in-house = %+v, want stay-1", sheet.InHouse)
	}
	if len(sheet.Departures) != 0 {
		t.Fatalf("Nov 2 departures = %+v, want none", sheet.Departures)
	}
	// folio-1 is settled by the payment; folio-2 still carries its charge.
	if len(sheet.OpenBalances) != 1 || sheet.OpenBalances[0].FolioID != "folio-2" || sheet.OpenBalances[0].BalanceMinor != 12000 {
		t.Fatalf("Nov 2 open balances = %+v, want folio-2 at 12000", sheet.OpenBalances)
	}
	if sheet.AsOf.IsZero() {
		t.Fatal("daily sheet carries no as-of timestamp")
	}

	after, oerr := st.Sheet("2026-11-03")
	if oerr != nil {
		t.Fatalf("Sheet: %v", oerr)
	}
	// RSV-AAA departs without a linked stay, so it appears as a
	// reservation departure next to the stay-1 check-out.
	if len(after.Departures) != 2 || after.Departures[0].Ref != "RSV-AAA" || after.Departures[1].Ref != "stay-1" {
		t.Fatalf("Nov 3 departures = %+v, want RSV-AAA + stay-1", after.Departures)
	}
	if len(after.InHouse) != 0 {
		t.Fatalf("Nov 3 in-house = %+v, want none", after.InHouse)
	}
}

// TestDuplicateDeliveryNeverDoubleCounts replays the whole outbox
// slice a second time: idempotent apply by event id must leave every
// report and every consumer offset exactly where the first pass put
// them.
func TestDuplicateDeliveryNeverDoubleCounts(t *testing.T) {
	st := New()
	events := seedEvents()
	if oerr := st.Rebuild(events); oerr != nil {
		t.Fatalf("Rebuild: %v", oerr)
	}
	before, _, _ := st.Occupancy("2026-11-01", "2026-11-03")
	beforeRevenue, _, _ := st.Revenue("2026-11-02", "2026-11-03")
	beforeSheet, _ := st.Sheet("2026-11-02")
	beforeOffsets := st.Offsets()

	for _, event := range events {
		if oerr := st.Apply(event); oerr != nil {
			t.Fatalf("duplicate Apply %s: %v", event.ID, oerr)
		}
	}

	after, _, _ := st.Occupancy("2026-11-01", "2026-11-03")
	if len(after) != len(before) {
		t.Fatalf("occupancy row count moved %d -> %d on duplicate delivery", len(before), len(after))
	}
	for i := range after {
		if after[i] != before[i] {
			t.Fatalf("occupancy row %d moved %+v -> %+v on duplicate delivery", i, before[i], after[i])
		}
	}
	afterRevenue, _, _ := st.Revenue("2026-11-02", "2026-11-03")
	for i := range afterRevenue {
		if afterRevenue[i] != beforeRevenue[i] {
			t.Fatalf("revenue row %d moved %+v -> %+v on duplicate delivery", i, beforeRevenue[i], afterRevenue[i])
		}
	}
	afterSheet, _ := st.Sheet("2026-11-02")
	if len(afterSheet.Arrivals) != len(beforeSheet.Arrivals) || len(afterSheet.OpenBalances) != len(beforeSheet.OpenBalances) {
		t.Fatalf("daily sheet moved on duplicate delivery: %+v -> %+v", beforeSheet, afterSheet)
	}
	if afterSheet.OpenBalances[0] != beforeSheet.OpenBalances[0] {
		t.Fatalf("open balance moved %+v -> %+v on duplicate delivery", beforeSheet.OpenBalances[0], afterSheet.OpenBalances[0])
	}
	afterOffsets := st.Offsets()
	for subscription, last := range beforeOffsets {
		if afterOffsets[subscription] != last {
			t.Fatalf("offset %s moved %s -> %s on duplicate delivery", subscription, last, afterOffsets[subscription])
		}
	}
}

// TestConsumerOffsetsAdvancePerSubscription checks the resume record:
// after a rebuild each consumed family points at its own last event,
// and a later event on one family moves only that family's offset.
func TestConsumerOffsetsAdvancePerSubscription(t *testing.T) {
	st := New()
	if oerr := st.Rebuild(seedEvents()); oerr != nil {
		t.Fatalf("Rebuild: %v", oerr)
	}
	offsets := st.Offsets()
	want := map[string]string{
		"rate":        "evt-rate-4",
		"reservation": "evt-res-4",
		"stay":        "evt-stay-2",
		"folio":       "evt-folio-4",
	}
	for subscription, last := range want {
		if offsets[subscription] != last {
			t.Fatalf("offset %s = %q, want %q", subscription, offsets[subscription], last)
		}
	}
	next := Event{ID: "evt-folio-5", Subscription: "folio", Type: "folio.payment-recorded", OccurredAt: at("2026-11-04"), Payload: map[string]any{"folioId": "folio-2", "businessDate": "2026-11-04", "amountMinor": 12000}}
	if oerr := st.Apply(next); oerr != nil {
		t.Fatalf("Apply: %v", oerr)
	}
	offsets = st.Offsets()
	if offsets["folio"] != "evt-folio-5" {
		t.Fatalf("folio offset = %q, want evt-folio-5", offsets["folio"])
	}
	if offsets["stay"] != "evt-stay-2" {
		t.Fatalf("stay offset moved to %q, want evt-stay-2", offsets["stay"])
	}
	sheet, _ := st.Sheet("2026-11-04")
	if len(sheet.OpenBalances) != 0 {
		t.Fatalf("open balances = %+v, want none after folio-2 settles", sheet.OpenBalances)
	}
}

// TestMalformedEventsAreRefused checks the rebuild job names the bad
// field instead of projecting garbage rows.
func TestMalformedEventsAreRefused(t *testing.T) {
	st := New()
	bad := []Event{
		{ID: "evt-bad-1", Subscription: "reservation", Type: "reservation.created", Payload: map[string]any{"roomTypeId": "deluxe"}},
		{ID: "evt-bad-2", Subscription: "folio", Type: "folio.charge-posted", OccurredAt: at("2026-11-02"), Payload: map[string]any{"folioId": "folio-9", "businessDate": "2026-11-02", "kind": "room", "amountMinor": -5}},
	}
	for _, event := range bad {
		if oerr := st.Apply(event); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
			t.Fatalf("Apply %+v = %v, want VALIDATION_FAILED", event.Payload, oerr)
		}
	}
	if rows, _, _ := st.Occupancy("2026-11-01", "2026-11-02"); len(rows) != 0 {
		t.Fatalf("refused events projected rows: %+v", rows)
	}
}

// housekeepingEvents builds the FR-RPT-4 source rows as domain
// events: 101 stays dirty, 102 stays clean-but-uninspected, 103 is
// inspected, 104 is blocked out of order, 105 is cleaned then
// inspected, 106 is blocked then released back to dirty, and 107 is
// occupied until its stay checks out.
func housekeepingEvents() []Event {
	return []Event{
		{ID: "evt-hk-1", Subscription: "room", Type: "room.room-upserted", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomNumber": "101", "roomTypeId": "standard", "state": "vacant-dirty", "actor": "setup"}},
		{ID: "evt-hk-2", Subscription: "room", Type: "room.room-upserted", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomNumber": "102", "roomTypeId": "standard", "state": "vacant-clean", "actor": "setup"}},
		{ID: "evt-hk-3", Subscription: "room", Type: "room.room-upserted", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomNumber": "103", "roomTypeId": "standard", "state": "vacant-inspected", "actor": "setup"}},
		{ID: "evt-hk-4", Subscription: "room", Type: "room.room-upserted", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomNumber": "104", "roomTypeId": "standard", "state": "vacant-dirty", "actor": "setup"}},
		{ID: "evt-hk-5", Subscription: "room", Type: "room.blocked", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomNumber": "104", "dateFrom": "2026-11-01", "dateTo": "2026-11-05", "reason": "renovation", "actor": "manager"}},
		{ID: "evt-hk-6", Subscription: "room", Type: "room.room-upserted", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomNumber": "105", "roomTypeId": "standard", "state": "vacant-clean", "actor": "setup"}},
		{ID: "evt-hk-7", Subscription: "room", Type: "room.state-changed", OccurredAt: at("2026-11-02"), Payload: map[string]any{"roomNumber": "105", "oldState": "vacant-clean", "newState": "vacant-inspected", "actor": "housekeeping"}},
		{ID: "evt-hk-8", Subscription: "room", Type: "room.room-upserted", OccurredAt: at("2026-11-01"), Payload: map[string]any{"roomNumber": "106", "roomTypeId": "standard", "state": "vacant-dirty", "actor": "setup"}},
		{ID: "evt-hk-9", Subscription: "room", Type: "room.blocked", OccurredAt: at("2026-11-02"), Payload: map[string]any{"roomNumber": "106", "dateFrom": "2026-11-02", "dateTo": "2026-11-03", "reason": "plumbing", "actor": "manager"}},
		{ID: "evt-hk-10", Subscription: "room", Type: "room.block-released", OccurredAt: at("2026-11-03"), Payload: map[string]any{"roomNumber": "106", "dateFrom": "2026-11-02", "dateTo": "2026-11-03", "reason": "plumbing fixed", "actor": "manager"}},
		{ID: "evt-hk-11", Subscription: "room", Type: "room.room-upserted", OccurredAt: at("2026-11-02"), Payload: map[string]any{"roomNumber": "107", "roomTypeId": "standard", "state": "occupied", "actor": "front-desk"}},
		{ID: "evt-hk-12", Subscription: "stay", Type: "stay.checked-in", OccurredAt: at("2026-11-02"), Payload: map[string]any{"stayId": "stay-hk-1", "reservationRef": "RSV-HK", "roomId": "107", "date": "2026-11-02"}},
		{ID: "evt-hk-13", Subscription: "stay", Type: "stay.checked-out", OccurredAt: at("2026-11-03"), Payload: map[string]any{"stayId": "stay-hk-1", "date": "2026-11-03"}},
	}
}

// TestRebuildTracksRoomsNeedingWork is the FR-RPT-4 paired guard:
// the read model is rebuilt from room and stay events, then the
// housekeeping report holds exactly the rooms needing work — dirty
// and clean-but-uninspected rooms appear, while inspected,
// out-of-order, and occupied rooms do not. Replaying the slice
// leaves the report unchanged (idempotent apply).
func TestRebuildTracksRoomsNeedingWork(t *testing.T) {
	st := New()
	events := housekeepingEvents()
	if oerr := st.Rebuild(events); oerr != nil {
		t.Fatalf("Rebuild: %v", oerr)
	}

	rooms, asOf := st.Housekeeping()
	if asOf.IsZero() {
		t.Fatal("housekeeping report carries no as-of timestamp")
	}
	// 101 dirty, 102 clean-but-uninspected, 106 released back to
	// dirty, 107 dirtied by check-out; 103 and 105 are inspected,
	// 104 is out of order.
	want := map[string]string{"101": "vacant-dirty", "102": "vacant-clean", "106": "vacant-dirty", "107": "vacant-dirty"}
	if len(rooms) != len(want) {
		t.Fatalf("housekeeping rooms = %+v, want %d rooms", rooms, len(want))
	}
	for _, room := range rooms {
		state, found := want[room.Room]
		if !found {
			t.Fatalf("unexpected room on the report: %+v", room)
		}
		if room.State != state {
			t.Fatalf("room %s state = %q, want %q", room.Room, room.State, state)
		}
	}

	// Duplicate delivery never double-counts: replaying the slice
	// leaves the report and the room offset exactly as rebuilt.
	for _, event := range events {
		if oerr := st.Apply(event); oerr != nil {
			t.Fatalf("duplicate Apply %s: %v", event.ID, oerr)
		}
	}
	again, _ := st.Housekeeping()
	if len(again) != len(want) {
		t.Fatalf("housekeeping rooms moved %d -> %d on duplicate delivery", len(want), len(again))
	}
	for i := range again {
		if again[i] != rooms[i] {
			t.Fatalf("housekeeping room %d moved %+v -> %+v on duplicate delivery", i, rooms[i], again[i])
		}
	}
	if offsets := st.Offsets(); offsets["room"] != "evt-hk-11" {
		t.Fatalf("room offset = %q, want evt-hk-11", offsets["room"])
	}
}
