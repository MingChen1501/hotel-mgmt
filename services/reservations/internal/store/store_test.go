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
