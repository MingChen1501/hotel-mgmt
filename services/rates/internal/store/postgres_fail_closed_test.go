// Fail-closed input guards against the real schema (Refs #633,
// FR-RTE-6..FR-RTE-10, BR-68). The Postgres half refuses the same
// requests as the in-memory store and leaves no row and no event.
package store

import (
	"database/sql"
	"strings"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
)

func pgCountRestrictionRows(t *testing.T, pg *Postgres) (rows, events int) {
	t.Helper()
	if err := pg.db.QueryRow(`SELECT count(*) FROM rates.stay_restrictions`).Scan(&rows); err != nil {
		t.Fatalf("count stay_restrictions: %v", err)
	}
	if err := pg.db.QueryRow(`SELECT count(*) FROM rates.outbox WHERE aggregate = 'restriction'`).Scan(&events); err != nil {
		t.Fatalf("count restriction events: %v", err)
	}
	return rows, events
}

// RTE3/RTE4 — the malformed id, the unpriced UUID, and the
// defaultUnits-only plan are all refused with nothing stored.
func TestPostgresRestrictionRefusalsStoreNothing(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)
	pgSeedPrice(t, pg)

	_, oerr := pg.UpsertRestriction("not-a-uuid", "2026-12-20", "2026-12-31", nil, true)
	assertStoreRefusal(t, oerr, "VALIDATION_FAILED", 400, map[string]any{"field": "roomTypeId"},
		messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))

	unknownType := "99999999-9999-4999-8999-999999999999"
	_, oerr = pg.UpsertRestriction(unknownType, "2026-12-20", "2026-12-31", nil, true)
	assertStoreRefusal(t, oerr, "NOT_FOUND", 404, map[string]any{"roomTypeId": unknownType},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": unknownType}))

	defaultOnly := "88888888-8888-4888-8888-888888888888"
	units := 4
	if _, oerr := pg.UpsertRatePlan("PG-DEFAULT-ONLY", "inventory default only", &units); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	_, oerr = pg.UpsertRestriction(defaultOnly, "2026-12-20", "2026-12-31", nil, true)
	assertStoreRefusal(t, oerr, "NOT_FOUND", 404, map[string]any{"roomTypeId": defaultOnly},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": defaultOnly}))

	rows, events := pgCountRestrictionRows(t, pg)
	if rows != 0 || events != 0 {
		t.Fatalf("stay_restrictions = %d, restriction events = %d; want 0 and 0", rows, events)
	}
}

// RTE9 — an overflowing nightly sum refuses with no quote value.
func TestPostgresQuoteSumOverflowRefused(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	if _, oerr := pg.UpsertRatePlan("PG-SUM-OVER", "overflow sum", nil); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	for _, seed := range []struct {
		night string
		price int64
	}{
		{"2026-11-01", 9223372036854775807},
		{"2026-11-02", 1},
	} {
		if _, oerr := pg.UpsertRatePrice("PG-SUM-OVER", pgTypeID(), seed.night, seed.price); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
	quote, oerr := pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", nil, nil)
	if quote != nil {
		t.Fatalf("overflow quote = %+v, want nil", quote)
	}
	assertStoreRefusal(t, oerr, "STATE_ILLEGAL", 422,
		map[string]any{"field": "roomTypeId", "reason": "total_overflow"},
		messages.Text("rates.state.total_overflow", nil))
}

// RTE10 — the percent multiplication is guarded too.
func TestPostgresQuotePercentOverflowRefused(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	if _, oerr := pg.UpsertRatePlan("PG-PCT-OVER", "overflow percent", nil); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	for _, night := range []string{"2026-11-01", "2026-11-02"} {
		if _, oerr := pg.UpsertRatePrice("PG-PCT-OVER", pgTypeID(), night, 100000000000000000); oerr != nil {
			t.Fatalf("price refused: %v", oerr)
		}
	}
	if _, oerr := pg.UpsertDiscount("PG-TEN", "percent", 10); oerr != nil {
		t.Fatalf("discount refused: %v", oerr)
	}
	discount := "PG-TEN"
	quote, oerr := pg.Quote(pgTypeID(), "2026-11-01", "2026-11-03", nil, &discount)
	if quote != nil {
		t.Fatalf("overflow quote = %+v, want nil", quote)
	}
	assertStoreRefusal(t, oerr, "STATE_ILLEGAL", 422,
		map[string]any{"field": "roomTypeId", "reason": "total_overflow"},
		messages.Text("rates.state.total_overflow", nil))
}

// RTE12/RTE13 — the two text bounds, the refused update that leaves the
// row intact, and the pre-bound row that still quotes.
func TestPostgresRatePlanTextBounds(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	name64 := strings.Repeat("ế", 64)
	if _, oerr := pg.UpsertRatePlan(name64, "", nil); oerr != nil {
		t.Fatalf("64-code-point name refused: %v", oerr)
	}
	_, oerr := pg.UpsertRatePlan(strings.Repeat("ế", 65), "", nil)
	assertStoreRefusal(t, oerr, "VALIDATION_FAILED", 400, map[string]any{"field": "name"},
		messages.Text("rates.validation.text_length", map[string]string{"field": "name", "max": messages.Num(64)}))
	if _, exists := pgPlanExists(t, db, strings.Repeat("ế", 65)); exists {
		t.Fatalf("the over-bound name was stored")
	}

	description2000 := strings.Repeat("ế", 2000)
	if _, oerr := pg.UpsertRatePlan("PG-DESC-OK", description2000, nil); oerr != nil {
		t.Fatalf("2000-code-point description refused: %v", oerr)
	}
	_, oerr = pg.UpsertRatePlan("PG-DESC-OK", strings.Repeat("ế", 2001), nil)
	assertStoreRefusal(t, oerr, "VALIDATION_FAILED", 400, map[string]any{"field": "description"},
		messages.Text("rates.validation.text_length", map[string]string{"field": "description", "max": messages.Num(2000)}))
	var stored string
	if err := db.QueryRow(`SELECT description FROM rates.rate_plans WHERE name = 'PG-DESC-OK'`).Scan(&stored); err != nil {
		t.Fatalf("read stored description: %v", err)
	}
	if stored != description2000 {
		t.Fatalf("refused update overwrote the stored description (length %d)", len([]rune(stored)))
	}

	// A row written before the bound (seeded directly) still quotes.
	legacyName := strings.Repeat("x", 70)
	if _, err := db.Exec(`INSERT INTO rates.rate_plans (name, description, created_by, updated_by) VALUES ($1, $2, 'system', 'system')`, legacyName, strings.Repeat("y", 2100)); err != nil {
		t.Fatalf("seed pre-bound plan: %v", err)
	}
	if _, oerr := pg.UpsertRatePrice(legacyName, pgTypeID(), "2026-11-01", 12000); oerr != nil {
		t.Fatalf("price refused: %v", oerr)
	}
	plan := legacyName
	quote, oerr := pg.Quote(pgTypeID(), "2026-11-01", "2026-11-02", &plan, nil)
	if oerr != nil || quote.TotalMinor != 12000 {
		t.Fatalf("pre-bound plan quote = %+v, %v; want 12000", quote, oerr)
	}
}

func pgPlanExists(t *testing.T, db *sql.DB, name string) (string, bool) {
	t.Helper()
	var id string
	err := db.QueryRow(`SELECT id FROM rates.rate_plans WHERE name = $1`, name).Scan(&id)
	if err != nil {
		return "", false
	}
	return id, true
}

// RTE6/RTE8 — the Postgres answer is the plan default (else 0) and an
// unknown type refuses NOT_FOUND.
func TestPostgresCheckSellableCountPlanDefault(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	units := 4
	if _, oerr := pg.UpsertRatePlan("PG-RACK-4", "plan default", &units); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	if _, oerr := pg.UpsertRatePrice("PG-RACK-4", pgTypeID(), "2026-11-01", 12000); oerr != nil {
		t.Fatalf("price refused: %v", oerr)
	}
	counts, oerr := pg.CheckSellableCount(pgTypeID(), "2026-11-01", "2026-11-03")
	if oerr != nil || len(counts) != 3 {
		t.Fatalf("counts = %+v, %v; want three dates", counts, oerr)
	}
	for _, count := range counts {
		if count.SellableCount != 4 {
			t.Fatalf("sellableCount = %d, want the plan default 4", count.SellableCount)
		}
	}

	noDefaultType := "22222222-2222-4222-8222-222222222222"
	if _, oerr := pg.UpsertRatePlan("PG-RACK-NONE", "no default", nil); oerr != nil {
		t.Fatalf("plan refused: %v", oerr)
	}
	if _, oerr := pg.UpsertRatePrice("PG-RACK-NONE", noDefaultType, "2026-11-01", 12000); oerr != nil {
		t.Fatalf("price refused: %v", oerr)
	}
	counts, oerr = pg.CheckSellableCount(noDefaultType, "2026-11-01", "2026-11-02")
	if oerr != nil || len(counts) != 2 || counts[0].SellableCount != 0 {
		t.Fatalf("no-default counts = %+v, %v; want 0", counts, oerr)
	}

	unknownType := "99999999-9999-4999-8999-999999999999"
	_, oerr = pg.CheckSellableCount(unknownType, "2026-11-01", "2026-11-02")
	assertStoreRefusal(t, oerr, "NOT_FOUND", 404, map[string]any{"roomTypeId": unknownType},
		messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": unknownType}))
}
