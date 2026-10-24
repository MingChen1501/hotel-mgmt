package store

import (
	"sync"
	"testing"
)

func loopInput(roomTypeID string) CreateInput {
	return CreateInput{
		RoomTypeID:    roomTypeID,
		ArrivalDate:   "2026-11-01",
		DepartureDate: "2026-11-03",
		GuestID:       "guest-1",
		Guest:         map[string]any{"guestId": "guest-1", "fullName": "An Nguyen"},
		SellableUnits: 1,
		TotalMinor:    24000,
		Actor:         "front-desk",
	}
}

type attemptResult struct {
	record *Reservation
	oerr   *OpError
}

// TestPairedBookingExactlyOneWins is the NFR-CON-1 guard: two
// simultaneous CreateReservation calls for the last sellable unit of
// a type and dates run against the real store; exactly one succeeds
// and the other is refused with CONFLICT naming type+dates.
func TestPairedBookingExactlyOneWins(t *testing.T) {
	st := New()
	roomTypeID := "deluxe-type"
	results := make([]attemptResult, 2)
	var wg sync.WaitGroup
	start := make(chan struct{})
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			record, oerr := st.Create(loopInput(roomTypeID), "")
			results[index] = attemptResult{record: record, oerr: oerr}
		}(i)
	}
	close(start)
	wg.Wait()

	var winners int
	var refusal *OpError
	for _, result := range results {
		if result.oerr == nil {
			winners++
		} else {
			refusal = result.oerr
		}
	}
	if winners != 1 {
		t.Fatalf("paired attempts produced %d winners, want exactly 1", winners)
	}
	if refusal == nil || refusal.Code != "CONFLICT" {
		t.Fatalf("loser error = %v, want CONFLICT", refusal)
	}
	if refusal.Details["roomTypeId"] != roomTypeID {
		t.Fatalf("CONFLICT details = %v, want type+dates named", refusal.Details)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", roomTypeID)); got != 1 {
		t.Fatalf("store holds %d overlapping reservations, want 1", got)
	}
}

func TestNonOverlappingBookingsBothSucceed(t *testing.T) {
	st := New()
	first := loopInput("deluxe-type")
	if _, oerr := st.Create(first, ""); oerr != nil {
		t.Fatalf("first booking refused: %v", oerr)
	}
	second := loopInput("deluxe-type")
	second.ArrivalDate = "2026-11-03"
	second.DepartureDate = "2026-11-05"
	if _, oerr := st.Create(second, ""); oerr != nil {
		t.Fatalf("non-overlapping booking refused: %v", oerr)
	}
}

func TestIdempotentReplayReturnsOriginal(t *testing.T) {
	st := New()
	first, oerr := st.Create(loopInput("deluxe-type"), "desk-loop-1")
	if oerr != nil {
		t.Fatalf("first booking refused: %v", oerr)
	}
	replay, oerr := st.Create(loopInput("deluxe-type"), "desk-loop-1")
	if oerr != nil {
		t.Fatalf("replay refused: %v", oerr)
	}
	if replay.Ref != first.Ref {
		t.Fatalf("replay ref = %s, want original %s", replay.Ref, first.Ref)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 1 {
		t.Fatalf("store holds %d overlapping reservations, want 1", got)
	}
}

// TestModifyRepricesAndRecordsChange is the FR-RES-2 guard: changing
// dates and type before check-in recalculates the quoted total from
// the rate plan in force and records who made the change and when.
func TestModifyRepricesAndRecordsChange(t *testing.T) {
	st := New()
	created, oerr := st.Create(loopInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	modified, oerr := st.Modify(ModifyInput{
		Ref: created.Ref, ArrivalDate: "2026-11-02", DepartureDate: "2026-11-04",
		RoomTypeID: "suite-type", SellableUnits: 2, TotalMinor: 26000, Actor: "front-desk",
	}, "modify-1")
	if oerr != nil {
		t.Fatalf("modify refused: %v", oerr)
	}
	if modified.State != "confirmed" {
		t.Fatalf("modified state = %s, want confirmed", modified.State)
	}
	if modified.TotalMinor != 26000 {
		t.Fatalf("modified total = %d, want repriced 26000", modified.TotalMinor)
	}
	if modified.ArrivalDate != "2026-11-02" || modified.RoomTypeID != "suite-type" {
		t.Fatalf("modified = %+v, want new dates and type", modified)
	}
	var sawDates, sawPrice bool
	for _, change := range st.Changes() {
		if change.Ref != created.Ref {
			t.Fatalf("change recorded against %s, want %s", change.Ref, created.Ref)
		}
		if change.Actor != "front-desk" || change.CreatedAt.IsZero() {
			t.Fatalf("change = %+v, want actor and timestamp", change)
		}
		switch change.Field {
		case "dates":
			sawDates = true
		case "priceBasis":
			sawPrice = true
		}
	}
	if !sawDates || !sawPrice {
		t.Fatalf("changes = %+v, want dates and priceBasis entries", st.Changes())
	}
}

// TestModifyCheckedInRefused is the BR-2 guard: a reservation that
// already left the confirmed state cannot be modified.
func TestModifyCheckedInRefused(t *testing.T) {
	st := New()
	created, oerr := st.Create(loopInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	if _, oerr := st.CheckIn(created.Ref, "stay-1", "front-desk"); oerr != nil {
		t.Fatalf("check-in refused: %v", oerr)
	}
	_, oerr = st.Modify(ModifyInput{
		Ref: created.Ref, ArrivalDate: "2026-11-02", DepartureDate: "2026-11-04",
		SellableUnits: 2, TotalMinor: 26000, Actor: "front-desk",
	}, "")
	if oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("modify checked-in = %v, want STATE_ILLEGAL", oerr)
	}
}

// TestPairedModifyExactlyOneWins extends the NFR-CON-1 guard to the
// modify path: two simultaneous moves onto the last sellable unit
// for overlapping dates yield exactly one winner and one CONFLICT
// naming type+dates, with 0 double-bookings.
func TestPairedModifyExactlyOneWins(t *testing.T) {
	st := New()
	firstInput := loopInput("deluxe-type")
	firstInput.SellableUnits = 2
	first, oerr := st.Create(firstInput, "")
	if oerr != nil {
		t.Fatalf("first booking refused: %v", oerr)
	}
	secondInput := loopInput("suite-type")
	secondInput.SellableUnits = 2
	second, oerr := st.Create(secondInput, "")
	if oerr != nil {
		t.Fatalf("second booking refused: %v", oerr)
	}
	// One more confirmed deluxe booking holds the second deluxe unit,
	// so exactly one of the two paired moves onto deluxe can win.
	holder := loopInput("deluxe-type")
	holder.SellableUnits = 2
	if _, oerr := st.Create(holder, ""); oerr != nil {
		t.Fatalf("holder booking refused: %v", oerr)
	}
	results := make([]attemptResult, 2)
	var wg sync.WaitGroup
	start := make(chan struct{})
	refs := []string{first.Ref, second.Ref}
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			modified, modifyErr := st.Modify(ModifyInput{
				Ref: refs[index], RoomTypeID: "deluxe-type",
				ArrivalDate: "2026-11-01", DepartureDate: "2026-11-03",
				SellableUnits: 2, TotalMinor: 24000, Actor: "front-desk",
			}, "")
			results[index] = attemptResult{record: modified, oerr: modifyErr}
		}(i)
	}
	close(start)
	wg.Wait()

	var winners int
	var refusal *OpError
	for _, result := range results {
		if result.oerr == nil {
			winners++
		} else {
			refusal = result.oerr
		}
	}
	if winners != 1 {
		t.Fatalf("paired modifies produced %d winners, want exactly 1", winners)
	}
	if refusal == nil || refusal.Code != "CONFLICT" {
		t.Fatalf("loser error = %v, want CONFLICT", refusal)
	}
	if refusal.Details["roomTypeId"] != "deluxe-type" {
		t.Fatalf("CONFLICT details = %v, want type+dates named", refusal.Details)
	}
}

// TestCancelKeepsReasonAndReleases is the FR-RES-3 guard: cancelling
// with a hotel reason moves the reservation to cancelled with the
// reason kept, and the held dates release so a new booking for the
// same type and dates succeeds.
func TestCancelKeepsReasonAndReleases(t *testing.T) {
	st := New()
	created, oerr := st.Create(loopInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	cancelled, oerr := st.Cancel(created.Ref, "guest-request", "front-desk", "cancel-1")
	if oerr != nil {
		t.Fatalf("cancel refused: %v", oerr)
	}
	if cancelled.State != "cancelled" {
		t.Fatalf("cancelled state = %s, want cancelled", cancelled.State)
	}
	if cancelled.CancelReason == nil || *cancelled.CancelReason != "guest-request" {
		t.Fatalf("cancel reason = %v, want guest-request kept", cancelled.CancelReason)
	}
	if _, oerr := st.Create(loopInput("deluxe-type"), ""); oerr != nil {
		t.Fatalf("rebooking released dates refused: %v", oerr)
	}
	if got := len(st.Query("2026-11-01", "2026-11-03", "deluxe-type")); got != 2 {
		t.Fatalf("calendar holds %d entries, want cancelled + rebooked", got)
	}
}

// TestCancelRefusals covers the BR-3 refusal branches: a missing
// reason is VALIDATION_FAILED and cancelling a checked-in
// reservation is STATE_ILLEGAL.
func TestCancelRefusals(t *testing.T) {
	st := New()
	created, oerr := st.Create(loopInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	if _, oerr := st.Cancel(created.Ref, "", "front-desk", ""); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("cancel without reason = %v, want VALIDATION_FAILED", oerr)
	}
	if _, oerr := st.CheckIn(created.Ref, "stay-1", "front-desk"); oerr != nil {
		t.Fatalf("check-in refused: %v", oerr)
	}
	if _, oerr := st.Cancel(created.Ref, "guest-request", "front-desk", ""); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("cancel checked-in = %v, want STATE_ILLEGAL", oerr)
	}
}

// pastInput builds a booking whose arrival already passed, so the
// no-show path can be exercised without clock control.
func pastInput(roomTypeID string) CreateInput {
	input := loopInput(roomTypeID)
	input.ArrivalDate = "2020-01-01"
	input.DepartureDate = "2020-01-03"
	return input
}

// TestMarkNoShowReleasesAndKeepsHistory is the FR-RES-6 guard: marking
// a past-arrival unarrived reservation no-show releases the held room
// and keeps the no-show in the reservation history with its reason.
func TestMarkNoShowReleasesAndKeepsHistory(t *testing.T) {
	st := New()
	created, oerr := st.Create(pastInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	marked, oerr := st.MarkNoShow(created.Ref, "no-arrival", "night-audit")
	if oerr != nil {
		t.Fatalf("mark no-show refused: %v", oerr)
	}
	if marked.State != "no-show" {
		t.Fatalf("marked state = %s, want no-show", marked.State)
	}
	if marked.NoShowReason == nil || *marked.NoShowReason != "no-arrival" {
		t.Fatalf("no-show reason = %v, want no-arrival kept", marked.NoShowReason)
	}
	var sawState bool
	for _, change := range st.Changes() {
		if change.Ref == created.Ref && change.Field == "state" {
			sawState = true
		}
	}
	if !sawState {
		t.Fatalf("changes = %+v, want the no-show state entry kept", st.Changes())
	}
	rebook := pastInput("deluxe-type")
	if _, oerr := st.Create(rebook, ""); oerr != nil {
		t.Fatalf("rebooking released room refused: %v", oerr)
	}
}

// TestMarkNoShowRefusals covers the BR-5 refusal branches: an
// arrival that has not passed yet and an in-house reservation are
// both STATE_ILLEGAL, and a missing reason is VALIDATION_FAILED.
func TestMarkNoShowRefusals(t *testing.T) {
	st := New()
	future, oerr := st.Create(loopInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	if _, oerr := st.MarkNoShow(future.Ref, "no-arrival", "night-audit"); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("mark no-show too early = %v, want STATE_ILLEGAL", oerr)
	}
	if _, oerr := st.MarkNoShow(future.Ref, "", "night-audit"); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("mark no-show without reason = %v, want VALIDATION_FAILED", oerr)
	}
	past, oerr := st.Create(pastInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("past booking refused: %v", oerr)
	}
	if _, oerr := st.CheckIn(past.Ref, "stay-9", "front-desk"); oerr != nil {
		t.Fatalf("check-in refused: %v", oerr)
	}
	if _, oerr := st.MarkNoShow(past.Ref, "no-arrival", "night-audit"); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("mark no-show in-house = %v, want STATE_ILLEGAL", oerr)
	}
}
