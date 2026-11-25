package store

import (
	"database/sql"
	"os"
	"testing"
)

// pgTestDB opens the shared scratch engine when TEST_PG_URL is set
// and skips otherwise, so `go test ./...` stays green without a
// database while the persistence path is exercised wherever one
// exists (locally and in the e2e lab).
func pgTestDB(t *testing.T) *sql.DB {
	t.Helper()
	url := os.Getenv("TEST_PG_URL")
	if url == "" {
		t.Skip("TEST_PG_URL unset; skipping Postgres round-trip.")
	}
	db, err := OpenPostgres(url)
	if err != nil {
		t.Fatalf("open test database: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func pgWipe(t *testing.T, db *sql.DB) {
	t.Helper()
	for _, q := range []string{
		`DELETE FROM reservations.outbox`,
		`DELETE FROM reservations.reservation_changes`,
		`DELETE FROM reservations.idempotency_keys`,
		`DELETE FROM reservations.reservations`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("wipe: %v", err)
		}
	}
}

func pgLoopInput() CreateInput {
	input := loopInput("22222222-2222-4222-8222-222222222222")
	input.RoomTypeID = "11111111-1111-4111-8111-111111111111"
	input.GuestID = "33333333-3333-4333-8333-333333333333"
	input.Guest = map[string]any{"guestId": input.GuestID, "fullName": "An Nguyen"}
	return input
}

func TestPostgresCreateGetQueryCheckIn(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	created, oerr := pg.Create(pgLoopInput(), "desk-loop-1")
	if oerr != nil {
		t.Fatalf("create refused: %v", oerr)
	}
	if created.State != "confirmed" || created.Ref == "" || created.ID == "" {
		t.Fatalf("unexpected record: %+v", created)
	}

	replay, oerr := pg.Create(pgLoopInput(), "desk-loop-1")
	if oerr != nil {
		t.Fatalf("replay refused: %v", oerr)
	}
	if replay.Ref != created.Ref {
		t.Fatalf("replay ref = %s, want original %s", replay.Ref, created.Ref)
	}

	got, oerr := pg.Get(created.Ref)
	if oerr != nil {
		t.Fatalf("get refused: %v", oerr)
	}
	if got.Guest["fullName"] != "An Nguyen" || got.TotalMinor != 24000 {
		t.Fatalf("snapshot mismatch: %+v", got)
	}

	entries := pg.Query("2026-11-01", "2026-11-03", "11111111-1111-4111-8111-111111111111")
	if len(entries) != 1 || entries[0].StayID != "" {
		t.Fatalf("query entries = %+v, want one unlinked row", entries)
	}

	checked, oerr := pg.CheckIn(created.Ref, "11111111-1111-4111-8111-111111111111", "front-desk")
	if oerr != nil {
		t.Fatalf("check-in refused: %v", oerr)
	}
	if checked.State != "checked-in" || checked.StayID == "" {
		t.Fatalf("unexpected checked-in record: %+v", checked)
	}
	if _, oerr := pg.CheckIn(created.Ref, "22222222-2222-4222-8222-222222222222", "front-desk"); oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("re-check-in error = %v, want STATE_ILLEGAL", oerr)
	}

	var changes, events, keys int
	if err := db.QueryRow(`SELECT count(*) FROM reservations.reservation_changes`).Scan(&changes); err != nil || changes != 2 {
		t.Fatalf("reservation_changes = %d, %v; want 2", changes, err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM reservations.outbox`).Scan(&events); err != nil || events != 2 {
		t.Fatalf("outbox = %d, %v; want 2", events, err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM reservations.idempotency_keys`).Scan(&keys); err != nil || keys != 1 {
		t.Fatalf("idempotency_keys = %d, %v; want 1", keys, err)
	}
}

func TestPostgresPairedBookingExactlyOneWins(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	done := make(chan *OpError, 2)
	for i := 0; i < 2; i++ {
		go func() {
			_, oerr := pg.Create(pgLoopInput(), "")
			done <- oerr
		}()
	}
	var winners int
	var refusal *OpError
	for i := 0; i < 2; i++ {
		if oerr := <-done; oerr == nil {
			winners++
		} else {
			refusal = oerr
		}
	}
	if winners != 1 {
		t.Fatalf("paired attempts produced %d winners, want exactly 1", winners)
	}
	if refusal == nil || refusal.Code != "CONFLICT" {
		t.Fatalf("loser error = %v, want CONFLICT", refusal)
	}
}

// TestPostgresLifecycleModifyCancelNoShow proves the lifecycle writes
// persist with history and outbox rows: modify reprices, cancel keeps
// the reason and releases the dates, and a past-arrival booking can
// be marked no-show.
func TestPostgresLifecycleModifyCancelNoShow(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	created, oerr := pg.Create(pgLoopInput(), "pg-lifecycle-1")
	if oerr != nil {
		t.Fatalf("create refused: %v", oerr)
	}
	modified, oerr := pg.Modify(ModifyInput{
		Ref: created.Ref, ArrivalDate: "2026-11-02", DepartureDate: "2026-11-04",
		Ceiling: 2, TotalMinor: 26000, Actor: "front-desk",
	}, "pg-modify-1")
	if oerr != nil {
		t.Fatalf("modify refused: %v", oerr)
	}
	if modified.TotalMinor != 26000 || modified.ArrivalDate != "2026-11-02" {
		t.Fatalf("modified = %+v, want repriced total and new dates", modified)
	}
	cancelled, oerr := pg.Cancel(created.Ref, "guest-request", "front-desk", "pg-cancel-1")
	if oerr != nil {
		t.Fatalf("cancel refused: %v", oerr)
	}
	if cancelled.State != "cancelled" || cancelled.CancelReason == nil || *cancelled.CancelReason != "guest-request" {
		t.Fatalf("cancelled = %+v, want cancelled with kept reason", cancelled)
	}
	if _, oerr := pg.Create(pgLoopInput(), "pg-lifecycle-2"); oerr != nil {
		t.Fatalf("rebooking released dates refused: %v", oerr)
	}
	past := pgLoopInput()
	past.ArrivalDate = "2020-01-01"
	past.DepartureDate = "2020-01-03"
	pastCreated, oerr := pg.Create(past, "pg-lifecycle-3")
	if oerr != nil {
		t.Fatalf("past create refused: %v", oerr)
	}
	marked, oerr := pg.MarkNoShow(pastCreated.Ref, "no-arrival", "night-audit")
	if oerr != nil {
		t.Fatalf("mark no-show refused: %v", oerr)
	}
	if marked.State != "no-show" || marked.NoShowReason == nil {
		t.Fatalf("marked = %+v, want no-show with kept reason", marked)
	}

	var changes int
	if err := db.QueryRow(`SELECT count(*) FROM reservations.reservation_changes`).Scan(&changes); err != nil || changes < 6 {
		t.Fatalf("reservation_changes = %d, %v; want at least 6", changes, err)
	}
	for _, eventType := range []string{"created", "modified", "cancelled", "no-show"} {
		var count int
		if err := db.QueryRow(`SELECT count(*) FROM reservations.outbox WHERE event_type = $1`, eventType).Scan(&count); err != nil || count < 1 {
			t.Fatalf("outbox %s = %d, %v; want at least 1", eventType, count, err)
		}
	}
}

// TestPostgresCheckOutReservationParity is the DR11 guard for the
// completion: the conditional write records one state change with the
// actor and writes no event, a replay completes nothing new, and the
// availability pair (a closed booking releases the unit, a checked-in
// booking still consumes it) behaves the same over Postgres.
func TestPostgresCheckOutReservationParity(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	created, oerr := pg.Create(pgLoopInput(), "")
	if oerr != nil {
		t.Fatalf("create refused: %v", oerr)
	}
	stayID := "44444444-4444-4444-8444-444444444444"
	checked, oerr := pg.CheckIn(created.Ref, stayID, "front-desk")
	if oerr != nil {
		t.Fatalf("check-in refused: %v", oerr)
	}
	if _, oerr := pg.Create(pgLoopInput(), ""); oerr == nil || oerr.Code != "CONFLICT" {
		t.Fatalf("same-type booking beside the in-house guest = %v, want CONFLICT", oerr)
	}

	completed, oerr := pg.CheckOutReservation(stayID, "front-desk")
	if oerr != nil {
		t.Fatalf("completion refused: %v", oerr)
	}
	if completed.State != "closed" || completed.StayID != stayID || completed.ArrivalDate != checked.ArrivalDate {
		t.Fatalf("unexpected completed record: %+v", completed)
	}
	if _, oerr := pg.CheckOutReservation(stayID, "front-desk"); oerr != nil {
		t.Fatalf("replayed completion refused: %v", oerr)
	}

	var changes, completions, events int
	if err := db.QueryRow(`SELECT count(*) FROM reservations.reservation_changes WHERE changed_field = 'state'`).Scan(&changes); err != nil || changes != 3 {
		t.Fatalf("state changes = %d, %v; want 3 (created + checked-in + completed)", changes, err)
	}
	// DR1's change row: the completion records exactly one state
	// change from checked-in to closed, with the actor, whether it ran
	// in memory or over Postgres.
	if err := db.QueryRow(
		`SELECT count(*) FROM reservations.reservation_changes
		  WHERE changed_field = 'state' AND old_value = '"checked-in"'
		    AND new_value = '"closed"' AND created_by = 'front-desk'`,
	).Scan(&completions); err != nil || completions != 1 {
		t.Fatalf("completion change rows = %d, %v; want 1 (checked-in -> closed by front-desk)", completions, err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM reservations.outbox`).Scan(&events); err != nil || events != 2 {
		t.Fatalf("outbox = %d, %v; want 2 (created + checked-in only)", events, err)
	}

	if _, oerr := pg.Create(pgLoopInput(), ""); oerr != nil {
		t.Fatalf("same-day booking refused after the close: %v", oerr)
	}

	entries := pg.Query("2026-11-01", "2026-11-03", "11111111-1111-4111-8111-111111111111")
	var closedRows int
	for _, entry := range entries {
		if entry.State == "closed" && entry.Ref == created.Ref {
			closedRows++
		}
	}
	if closedRows != 1 {
		t.Fatalf("calendar entries = %+v, want the closed booking kept in history", entries)
	}
	if _, oerr := pg.CheckOutReservation("55555555-5555-4555-8555-555555555555", "front-desk"); oerr == nil || oerr.Code != "NOT_FOUND" {
		t.Fatalf("unknown stay completion = %v, want NOT_FOUND", oerr)
	}
}

// TestPostgresIdempotencyKeyScopedPerOperationAndResource is the R4
// parity guard: a create key still cancels its own reservation, and the
// same cancel key on a second reservation cancels that one instead of
// replaying the first (issue #644).
func TestPostgresIdempotencyKeyScopedPerOperationAndResource(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	shared := "pg-scoped-key"
	created, oerr := pg.Create(pgLoopInput(), shared)
	if oerr != nil {
		t.Fatalf("create refused: %v", oerr)
	}
	cancelled, oerr := pg.Cancel(created.Ref, "guest-request", "front-desk", shared)
	if oerr != nil {
		t.Fatalf("cancel with a create key refused: %v", oerr)
	}
	if cancelled.State != "cancelled" {
		t.Fatalf("cancelled state = %s, want cancelled (not the create replay)", cancelled.State)
	}

	second := pgLoopInput()
	second.ArrivalDate = "2026-11-05"
	second.DepartureDate = "2026-11-07"
	other, oerr := pg.Create(second, "")
	if oerr != nil {
		t.Fatalf("second create refused: %v", oerr)
	}
	otherCancelled, oerr := pg.Cancel(other.Ref, "guest-request", "front-desk", shared)
	if oerr != nil {
		t.Fatalf("second cancel with the reused key refused: %v", oerr)
	}
	if otherCancelled.Ref != other.Ref || otherCancelled.State != "cancelled" {
		t.Fatalf("second cancel = %s/%s, want %s cancelled", otherCancelled.Ref, otherCancelled.State, other.Ref)
	}

	replay, oerr := pg.Cancel(other.Ref, "guest-request", "front-desk", shared)
	if oerr != nil {
		t.Fatalf("replayed cancel refused: %v", oerr)
	}
	if replay.Ref != other.Ref || replay.State != "cancelled" {
		t.Fatalf("replayed cancel = %s/%s, want the same cancelled reservation", replay.Ref, replay.State)
	}
}

// pgCounts returns the four row counts a refusal must leave untouched.
func pgCounts(t *testing.T, db *sql.DB) (reservations, changes, events, keys int) {
	t.Helper()
	for _, query := range []struct {
		sql string
		to  *int
	}{
		{`SELECT count(*) FROM reservations.reservations`, &reservations},
		{`SELECT count(*) FROM reservations.reservation_changes`, &changes},
		{`SELECT count(*) FROM reservations.outbox`, &events},
		{`SELECT count(*) FROM reservations.idempotency_keys`, &keys},
	} {
		if err := db.QueryRow(query.sql).Scan(query.to); err != nil {
			t.Fatalf("count %q: %v", query.sql, err)
		}
	}
	return reservations, changes, events, keys
}

func assertPGCounts(t *testing.T, db *sql.DB, wantReservations, wantChanges, wantEvents, wantKeys int) {
	t.Helper()
	reservations, changes, events, keys := pgCounts(t, db)
	if reservations != wantReservations || changes != wantChanges || events != wantEvents || keys != wantKeys {
		t.Fatalf("counts = reservations %d changes %d events %d keys %d, want %d/%d/%d/%d",
			reservations, changes, events, keys, wantReservations, wantChanges, wantEvents, wantKeys)
	}
}

// TestPostgresDerivedCeilingParity is `O11`: the derived-ceiling guards
// behave over Postgres exactly as in memory — the inflated create and
// modify are CONFLICT with nothing written, the replay returns the
// original and consumes no second unit, and the paired last-unit create
// keeps one winner.
func TestPostgresDerivedCeilingParity(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	holder, oerr := pg.Create(pgLoopInput(), "pg-derived-holder")
	if oerr != nil {
		t.Fatalf("holder create refused: %v", oerr)
	}
	assertPGCounts(t, db, 1, 1, 1, 1)

	inflated := pgLoopInput()
	inflated.GuestID = "44444444-4444-4444-8444-444444444444"
	inflated.Guest = map[string]any{"guestId": inflated.GuestID, "fullName": "Binh Tran"}
	if _, oerr := pg.Create(inflated, "pg-derived-inflated"); oerr == nil || oerr.Code != "CONFLICT" {
		t.Fatalf("inflated create = %v, want CONFLICT", oerr)
	}
	assertPGCounts(t, db, 1, 1, 1, 1)

	replay, oerr := pg.Create(pgLoopInput(), "pg-derived-holder")
	if oerr != nil {
		t.Fatalf("replay refused: %v", oerr)
	}
	if replay.Ref != holder.Ref {
		t.Fatalf("replay ref = %s, want original %s", replay.Ref, holder.Ref)
	}
	assertPGCounts(t, db, 1, 1, 1, 1)

	moving := pgLoopInput()
	moving.RoomTypeID = "99999999-9999-4999-8999-999999999999"
	moving.GuestID = "55555555-5555-4555-8555-555555555555"
	moving.Guest = map[string]any{"guestId": moving.GuestID, "fullName": "Chi Le"}
	moved, oerr := pg.Create(moving, "pg-derived-moving")
	if oerr != nil {
		t.Fatalf("moving create refused: %v", oerr)
	}
	assertPGCounts(t, db, 2, 2, 2, 2)

	for name, input := range map[string]ModifyInput{
		"held-dates": {
			Ref: moved.Ref, RoomTypeID: pgLoopInput().RoomTypeID,
			ArrivalDate: "2026-11-01", DepartureDate: "2026-11-03",
			Ceiling: 1, TotalMinor: 26000, Actor: "front-desk",
		},
		"sold-out-type": {
			Ref: moved.Ref, RoomTypeID: "88888888-8888-4888-8888-888888888888",
			Ceiling: 0, TotalMinor: 26000, Actor: "front-desk",
		},
	} {
		if _, oerr := pg.Modify(input, "pg-derived-modify-"+name); oerr == nil || oerr.Code != "CONFLICT" {
			t.Fatalf("%s modify = %v, want CONFLICT", name, oerr)
		}
		kept, oerr := pg.Get(moved.Ref)
		if oerr != nil {
			t.Fatalf("Get refused: %v", oerr)
		}
		if kept.RoomTypeID != moving.RoomTypeID || kept.ArrivalDate != "2026-11-01" || kept.TotalMinor != 24000 {
			t.Fatalf("%s refusal changed the reservation: %+v", name, kept)
		}
	}
	assertPGCounts(t, db, 2, 2, 2, 2)

	done := make(chan *OpError, 2)
	for i := 0; i < 2; i++ {
		go func(index int) {
			paired := pgLoopInput()
			paired.RoomTypeID = "77777777-7777-4777-8777-777777777777"
			paired.GuestID = "66666666-6666-4666-8666-666666666666"
			paired.Guest = map[string]any{"guestId": paired.GuestID, "fullName": "Dung Pham"}
			_, oerr := pg.Create(paired, "")
			done <- oerr
		}(i)
	}
	var winners int
	for i := 0; i < 2; i++ {
		if oerr := <-done; oerr == nil {
			winners++
		}
	}
	if winners != 1 {
		t.Fatalf("paired last-unit creates produced %d winners, want exactly 1", winners)
	}
	reservations, changes, events, keys := pgCounts(t, db)
	if reservations != 3 || changes != 3 || events != 3 || keys != 2 {
		t.Fatalf("counts after the pair = reservations %d changes %d events %d keys %d, want 3/3/3/2",
			reservations, changes, events, keys)
	}
}
