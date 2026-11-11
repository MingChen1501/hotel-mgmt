package store

import (
	"sync"
	"testing"
	"time"
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

// futureInput builds a booking whose arrival has not passed yet, so
// the BR-5 too-early refusal can be exercised without depending on
// fixed fixture dates. Dates derive from the clock, never fixtures.
func futureInput(roomTypeID string) CreateInput {
	input := loopInput(roomTypeID)
	input.ArrivalDate = time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	input.DepartureDate = time.Now().UTC().AddDate(0, 0, 3).Format("2006-01-02")
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
	future, oerr := st.Create(futureInput("deluxe-type"), "")
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

// checkedInForStay books one reservation and links it to a stay,
// returning the record the completion guards run against.
func checkedInForStay(t *testing.T, st *Store, roomTypeID, stayID string) *Reservation {
	t.Helper()
	created, oerr := st.Create(loopInput(roomTypeID), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	checked, oerr := st.CheckIn(created.Ref, stayID, "front-desk")
	if oerr != nil {
		t.Fatalf("check-in refused: %v", oerr)
	}
	return checked
}

// TestCheckOutReservationCompletesBooking is the DR1 guard: the close
// completion flips the linked checked-in booking to the terminal
// closed state, keeps its link, dates, type, and price basis, and
// records one state change with the actor and time. No reservation
// event is written (LLD D5).
func TestCheckOutReservationCompletesBooking(t *testing.T) {
	st := New()
	record := checkedInForStay(t, st, "deluxe-type", "stay-1")
	eventsBefore := len(st.events)

	completed, oerr := st.CheckOutReservation("stay-1", "front-desk")
	if oerr != nil {
		t.Fatalf("completion refused: %v", oerr)
	}
	if completed.State != "closed" {
		t.Fatalf("completed state = %s, want closed", completed.State)
	}
	if completed.StayID != "stay-1" || completed.ArrivalDate != record.ArrivalDate ||
		completed.DepartureDate != record.DepartureDate || completed.RoomTypeID != record.RoomTypeID ||
		completed.TotalMinor != record.TotalMinor {
		t.Fatalf("completion rewrote the booking: %+v", completed)
	}
	got, oerr := st.Get(completed.Ref)
	if oerr != nil || got.State != "closed" {
		t.Fatalf("read-back = %+v, %v; want closed", got, oerr)
	}
	if len(st.events) != eventsBefore {
		t.Fatalf("completion wrote %d event(s), want none", len(st.events)-eventsBefore)
	}
	var stateChanges int
	var actor string
	for _, change := range st.Changes() {
		if change.Ref == record.Ref && change.Field == "state" && change.NewValue == "closed" {
			stateChanges++
			actor = change.Actor
		}
	}
	if stateChanges != 1 || actor != "front-desk" {
		t.Fatalf("state changes = %d (actor %q), want one front-desk completion", stateChanges, actor)
	}
}

// TestCheckOutReservationIsIdempotent is the DR2 guard: a second
// completion for the same stay returns the closed booking without a
// second change row or a second event.
func TestCheckOutReservationIsIdempotent(t *testing.T) {
	st := New()
	record := checkedInForStay(t, st, "deluxe-type", "stay-1")
	if _, oerr := st.CheckOutReservation("stay-1", "front-desk"); oerr != nil {
		t.Fatalf("first completion refused: %v", oerr)
	}
	eventsAfterFirst := len(st.events)
	changesAfterFirst := len(st.Changes())

	again, oerr := st.CheckOutReservation("stay-1", "front-desk")
	if oerr != nil || again.State != "closed" {
		t.Fatalf("replay = %+v, %v; want closed", again, oerr)
	}
	if len(st.events) != eventsAfterFirst || len(st.Changes()) != changesAfterFirst {
		t.Fatalf("replay wrote another change or event")
	}
	if again.Ref != record.Ref {
		t.Fatalf("replay ref = %s, want %s", again.Ref, record.Ref)
	}
}

// TestCheckOutReservationRefusals is the DR3 guard: a booking in
// another state is refused STATE_ILLEGAL naming the state and writes
// nothing, and an unknown stay link is NOT_FOUND naming the stay.
func TestCheckOutReservationRefusals(t *testing.T) {
	st := New()
	created, oerr := st.Create(loopInput("deluxe-type"), "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	created.StayID = "stay-pending"
	changesBefore := len(st.Changes())
	if _, refusal := st.CheckOutReservation("stay-pending", "front-desk"); refusal == nil || refusal.Code != "STATE_ILLEGAL" {
		t.Fatalf("confirmed completion = %v, want STATE_ILLEGAL", refusal)
	} else if refusal.Details["state"] != "confirmed" || refusal.Details["reservationRef"] != created.Ref {
		t.Fatalf("STATE_ILLEGAL details = %v, want state and ref named", refusal.Details)
	}
	if len(st.Changes()) != changesBefore || created.State != "confirmed" {
		t.Fatal("refused completion changed the booking")
	}
	if _, oerr := st.CheckOutReservation("stay-unknown", "front-desk"); oerr == nil || oerr.Code != "NOT_FOUND" {
		t.Fatalf("unknown stay = %v, want NOT_FOUND", oerr)
	}
}

// TestCompletedBookingReleasesAvailability is the DR4 guard: a closed
// booking overlapping a same-type, same-date booking consumes no
// sellable unit, so the same-day booking is accepted by the create
// and modify guards.
func TestCompletedBookingReleasesAvailability(t *testing.T) {
	st := New()
	first := checkedInForStay(t, st, "deluxe-type", "stay-a")
	if _, oerr := st.CheckOutReservation("stay-a", "front-desk"); oerr != nil {
		t.Fatalf("completion refused: %v", oerr)
	}
	sameDay := loopInput("deluxe-type")
	if _, oerr := st.Create(sameDay, ""); oerr != nil {
		t.Fatalf("same-day booking refused after the close: %v", oerr)
	}
	// The modify guard counts the same active set: a booking moved
	// onto the departed dates is accepted too.
	other := loopInput("suite-type")
	other.SellableUnits = 2
	moved, oerr := st.Create(other, "")
	if oerr != nil {
		t.Fatalf("second booking refused: %v", oerr)
	}
	if _, oerr := st.Modify(ModifyInput{
		Ref: moved.Ref, RoomTypeID: "deluxe-type",
		ArrivalDate: first.ArrivalDate, DepartureDate: first.DepartureDate,
		SellableUnits: 2, TotalMinor: 24000, Actor: "front-desk",
	}, ""); oerr != nil {
		t.Fatalf("modify onto departed dates refused: %v", oerr)
	}
}

// TestCheckedInBookingStillConsumesAvailability is the DR5 negative
// control: the same request is refused while the booking is still
// checked in, so the release comes from the state and not a wider
// availability rule.
func TestCheckedInBookingStillConsumesAvailability(t *testing.T) {
	st := New()
	checkedInForStay(t, st, "deluxe-type", "stay-a")
	if _, oerr := st.Create(loopInput("deluxe-type"), ""); oerr == nil || oerr.Code != "CONFLICT" {
		t.Fatalf("same-day booking beside an in-house guest = %v, want CONFLICT", oerr)
	}
}

// TestEarlyDepartureReleasesBookedNights is the DR6 guard: a booking
// whose recorded departure is later than the close stops blocking a
// same-day arrival already on file, with no date rewrite on either
// booking.
func TestEarlyDepartureReleasesBookedNights(t *testing.T) {
	st := New()
	early := loopInput("deluxe-type")
	early.ArrivalDate = "2026-11-01"
	early.DepartureDate = "2026-11-05"
	first, oerr := st.Create(early, "")
	if oerr != nil {
		t.Fatalf("booking refused: %v", oerr)
	}
	if _, oerr := st.CheckIn(first.Ref, "stay-a", "front-desk"); oerr != nil {
		t.Fatalf("check-in refused: %v", oerr)
	}
	next := loopInput("deluxe-type")
	next.ArrivalDate = "2026-11-03"
	next.DepartureDate = "2026-11-06"
	if _, oerr := st.Create(next, ""); oerr == nil || oerr.Code != "CONFLICT" {
		t.Fatalf("same-type booking beside the in-house guest = %v, want CONFLICT", oerr)
	}
	completed, oerr := st.CheckOutReservation("stay-a", "front-desk")
	if oerr != nil {
		t.Fatalf("completion refused: %v", oerr)
	}
	if completed.ArrivalDate != "2026-11-01" || completed.DepartureDate != "2026-11-05" {
		t.Fatalf("completion rewrote the dates: %+v", completed)
	}
	if _, oerr := st.Create(next, ""); oerr != nil {
		t.Fatalf("early departure still blocks the same-day arrival: %v", oerr)
	}
}

// TestCompletedBookingReadsTerminal is the DR10 guard: the calendar
// row keeps the closed booking in history, and check-in, modify,
// cancel, and no-show on it are refused with the module's state
// refusal and change nothing.
func TestCompletedBookingReadsTerminal(t *testing.T) {
	st := New()
	record := checkedInForStay(t, st, "deluxe-type", "stay-a")
	if _, oerr := st.CheckOutReservation("stay-a", "front-desk"); oerr != nil {
		t.Fatalf("completion refused: %v", oerr)
	}
	entries := st.Query(record.ArrivalDate, record.DepartureDate, "deluxe-type")
	if len(entries) != 1 || entries[0].State != "closed" {
		t.Fatalf("calendar entries = %+v, want the closed booking in history", entries)
	}
	if _, oerr := st.CheckIn(record.Ref, "stay-b", "front-desk"); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("check-in completed = %v, want STATE_ILLEGAL", oerr)
	}
	if _, oerr := st.Modify(ModifyInput{Ref: record.Ref, ArrivalDate: "2026-11-02", DepartureDate: "2026-11-04", SellableUnits: 2, TotalMinor: 24000, Actor: "front-desk"}, ""); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("modify completed = %v, want STATE_ILLEGAL", oerr)
	}
	if _, oerr := st.Cancel(record.Ref, "guest-request", "front-desk", ""); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("cancel completed = %v, want STATE_ILLEGAL", oerr)
	}
	if _, oerr := st.MarkNoShow(record.Ref, "no-arrival", "night-audit"); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("no-show completed = %v, want STATE_ILLEGAL", oerr)
	}
	if record.State != "closed" {
		t.Fatalf("booking state = %s after refused attempts, want closed", record.State)
	}
}
