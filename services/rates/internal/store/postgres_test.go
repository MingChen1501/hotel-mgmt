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

// TestPostgresClosedToArrivalRefusal is the FR-RTE-4 closed-to-arrival
// guard against the real schema: arrival inside a closed window
// refuses naming the restriction, arrival outside passes.
func TestPostgresClosedToArrivalRefusal(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	if _, oerr := pg.UpsertRestriction(pgTypeID(), "2026-12-20", "2026-12-31", nil, true); oerr != nil {
		t.Fatalf("restriction refused: %v", oerr)
	}
	oerr := pg.CheckRestrictions(pgTypeID(), "2026-12-24", "2026-12-26")
	if oerr == nil || oerr.Code != "STATE_ILLEGAL" {
		t.Fatalf("violation error = %v, want STATE_ILLEGAL", oerr)
	}
	if oerr.Details["restriction"] != "closed-to-arrival" {
		t.Fatalf("refusal details = %v, want the restriction named", oerr.Details)
	}
	if oerr := pg.CheckRestrictions(pgTypeID(), "2026-11-01", "2026-11-03"); oerr != nil {
		t.Fatalf("outside window refused: %v", oerr)
	}
}

// TestPostgresQuoteDiscounts is the FR-RTE-3 guard against the real
// schema: percent and amount discounts adjust the total by name, and
// an amount larger than the total floors the quote at zero.
func TestPostgresQuoteDiscounts(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	plan := pg.UpsertRatePlan("DISC-RACK", "Discount rack rate", nil)
	if plan.ID == "" {
		t.Fatalf("plan not saved: %+v", plan)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if _, oerr := pg.UpsertRatePrice("DISC-RACK", pgTypeID(), night, 12000); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
	if _, oerr := pg.UpsertDiscount("EarlyBird", "percent", 10); oerr != nil {
		t.Fatalf("discount refused: %v", oerr)
	}
	if _, oerr := pg.UpsertDiscount("Loyalty20", "amount", 2000); oerr != nil {
		t.Fatalf("discount refused: %v", oerr)
	}
	planName := "DISC-RACK"
	percent := "EarlyBird"
	quote, oerr := pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", &planName, &percent)
	if oerr != nil {
		t.Fatalf("quote refused: %v", oerr)
	}
	if quote.TotalMinor != 21600 || quote.Discount == nil || *quote.Discount != "EarlyBird" {
		t.Fatalf("unexpected percent quote: %+v", quote)
	}
	amount := "Loyalty20"
	quote, oerr = pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", &planName, &amount)
	if oerr != nil {
		t.Fatalf("quote refused: %v", oerr)
	}
	if quote.TotalMinor != 22000 || quote.Discount == nil || *quote.Discount != "Loyalty20" {
		t.Fatalf("unexpected amount quote: %+v", quote)
	}
	if _, oerr := pg.UpsertDiscount("Comp", "amount", 999999); oerr != nil {
		t.Fatalf("discount refused: %v", oerr)
	}
	comp := "Comp"
	quote, oerr = pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", &planName, &comp)
	if oerr != nil {
		t.Fatalf("quote refused: %v", oerr)
	}
	if quote.TotalMinor != 0 {
		t.Fatalf("floored quote total = %d, want 0", quote.TotalMinor)
	}
	unknown := "NoSuchDiscount"
	if _, oerr := pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", &planName, &unknown); oerr == nil || oerr.Code != "VALIDATION_FAILED" {
		t.Fatalf("unknown discount error = %v, want VALIDATION_FAILED", oerr)
	}
}

// TestPostgresQuoteBreakdown is the FR-RTE-5 breakdown-rule guard
// against the real schema: one entry per night, entries sum to the
// undiscounted total, and the discounted total follows the kept
// discount name.
func TestPostgresQuoteBreakdown(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	pg.UpsertRatePlan("BRK-RACK", "Breakdown rack rate", nil)
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if _, oerr := pg.UpsertRatePrice("BRK-RACK", pgTypeID(), night, 12000); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
	if _, oerr := pg.UpsertDiscount("EarlyBird", "percent", 10); oerr != nil {
		t.Fatalf("discount refused: %v", oerr)
	}
	planName := "BRK-RACK"
	discount := "EarlyBird"
	quote, oerr := pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", &planName, &discount)
	if oerr != nil {
		t.Fatalf("quote refused: %v", oerr)
	}
	if len(quote.Nights) != 2 {
		t.Fatalf("nights has %d entries, want 2", len(quote.Nights))
	}
	var undiscounted int64
	for _, night := range quote.Nights {
		undiscounted += night.PriceMinor
	}
	if undiscounted != 24000 {
		t.Fatalf("nightly breakdown sums to %d, want 24000", undiscounted)
	}
	if quote.TotalMinor != 21600 {
		t.Fatalf("total = %d, want 21600", quote.TotalMinor)
	}
	if quote.Discount == nil || *quote.Discount != "EarlyBird" {
		t.Fatalf("discount = %v, want EarlyBird kept", quote.Discount)
	}
}
