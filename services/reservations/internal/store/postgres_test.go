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
