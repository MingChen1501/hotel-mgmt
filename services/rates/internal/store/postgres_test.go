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
		`DELETE FROM rates.outbox`,
		`DELETE FROM rates.rate_prices`,
		`DELETE FROM rates.stay_restrictions`,
		`DELETE FROM rates.discounts`,
		`DELETE FROM rates.rate_plans`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatalf("wipe: %v", err)
		}
	}
}

func pgTypeID() string { return "11111111-1111-4111-8111-111111111111" }

// TestPostgresDeskLoop mirrors the desk-loop pricing path against the
// real schema: plan, nightly prices, restriction check, and quote.
func TestPostgresDeskLoop(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	units := 2
	plan := pg.UpsertRatePlan("E2E-RACK", "E2E rack rate", &units)
	if plan.ID == "" || plan.Name != "E2E-RACK" {
		t.Fatalf("unexpected plan: %+v", plan)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if _, oerr := pg.UpsertRatePrice("E2E-RACK", pgTypeID(), night, 12000); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
	if oerr := pg.CheckRestrictions(pgTypeID(), "2026-11-01", "2026-11-03"); oerr != nil {
		t.Fatalf("restriction check refused: %v", oerr)
	}
	planName := "E2E-RACK"
	quote, oerr := pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", &planName, nil)
	if oerr != nil {
		t.Fatalf("quote refused: %v", oerr)
	}
	if quote.TotalMinor != 24000 || len(quote.Nights) != 2 {
		t.Fatalf("unexpected quote: %+v", quote)
	}
	counts, oerr := pg.CheckSellableCount(pgTypeID(), "2026-11-01", "2026-11-03", &units)
	if oerr != nil {
		t.Fatalf("count refused: %v", oerr)
	}
	if len(counts) == 0 || counts[0].SellableCount != 2 {
		t.Fatalf("unexpected counts: %+v", counts)
	}
	var prices, restrictions int
	if err := db.QueryRow(`SELECT count(*) FROM rates.rate_prices`).Scan(&prices); err != nil || prices != 2 {
		t.Fatalf("rate_prices = %d, %v; want 2", prices, err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM rates.stay_restrictions`).Scan(&restrictions); err != nil || restrictions != 0 {
		t.Fatalf("stay_restrictions = %d, %v; want 0", restrictions, err)
	}
}

// TestPostgresRestrictionRefusalNamesRestriction is the FR-RTE-4
// guard against the real schema: a min-stay violation refuses naming
// the restriction.
func TestPostgresRestrictionRefusalNamesRestriction(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	minStay := 3
	if _, oerr := pg.UpsertRestriction(pgTypeID(), "2026-11-01", "2026-11-10", &minStay, false); oerr != nil {
		t.Fatalf("restriction refused: %v", oerr)
	}
	oerr := pg.CheckRestrictions(pgTypeID(), "2026-11-01", "2026-11-03")
	if oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("violation error = %v, want STATE_ILLEGAL", oerr)
	}
	if oerr.Details["restriction"] != "min-stay" {
		t.Fatalf("refusal details = %v, want the restriction named", oerr.Details)
	}
}
