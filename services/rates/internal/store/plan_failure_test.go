// Guards for the failed rate-plan write (Refs #767, AC-PLN-1..AC-PLN-4,
// FR-PLN-1..FR-PLN-5, BR-71). A driver failure on the plan upsert must
// be refused with storeFailure(), never answered as the request-shaped
// plan: nothing is stored and no rate-plan-changed row is emitted.
//
// The hermetic halves force the driver failure on a closed pool and on a
// stubbed database/sql driver, so they run with TEST_PG_URL unset and
// never skip. The Postgres halves count stored rows and outbox events on
// a scratch database and skip without TEST_PG_URL; no key claim rests on
// a skipped half alone.
package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
)

// stubPlanDriver is a minimal database/sql driver for the plan write.
// QueryContext answers the plan upsert; ExecContext records the outbox
// write. fail makes every plan query fail, failFirst makes only the
// first one fail so the retry half can reuse one handle.
type stubPlanDriver struct {
	mu        sync.Mutex
	queries   []string
	execs     []string
	planCalls int
	fail      bool
	failFirst bool
}

type stubPlanConn struct {
	driver *stubPlanDriver
}

func (d *stubPlanDriver) Open(string) (driver.Conn, error) {
	return &stubPlanConn{driver: d}, nil
}

func (c *stubPlanConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("stub plan driver: Prepare is not supported")
}

func (c *stubPlanConn) Close() error { return nil }

func (c *stubPlanConn) Begin() (driver.Tx, error) {
	return nil, errors.New("stub plan driver: Begin is not supported")
}

func (c *stubPlanConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	d := c.driver
	d.mu.Lock()
	d.queries = append(d.queries, query)
	d.planCalls++
	call := d.planCalls
	d.mu.Unlock()

	if d.fail || (d.failFirst && call == 1) {
		return nil, errors.New("stub plan driver: plan write failed")
	}
	return &stubPlanRows{
		columns: []string{"id", "default_units"},
		values:  [][]driver.Value{{"11111111-1111-4111-8111-111111111111", nil}},
	}, nil
}

func (c *stubPlanConn) ExecContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Result, error) {
	c.driver.mu.Lock()
	c.driver.execs = append(c.driver.execs, query)
	c.driver.mu.Unlock()
	return driver.RowsAffected(1), nil
}

type stubPlanRows struct {
	columns []string
	values  [][]driver.Value
	index   int
}

func (r *stubPlanRows) Columns() []string { return r.columns }

func (r *stubPlanRows) Close() error { return nil }

func (r *stubPlanRows) Next(dest []driver.Value) error {
	if r.index >= len(r.values) {
		return io.EOF
	}
	copy(dest, r.values[r.index])
	r.index++
	return nil
}

var stubPlanDriverSeq atomic.Int64

func openStubPlanDB(t *testing.T, d *stubPlanDriver) *sql.DB {
	t.Helper()
	name := fmt.Sprintf("rates-plan-stub-%d", stubPlanDriverSeq.Add(1))
	sql.Register(name, d)
	db, err := sql.Open(name, "")
	if err != nil {
		t.Fatalf("open stub driver: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

// closedPostgresPool opens a valid DSN and closes the pool before any
// query, so the next plan write sees a driver error with no database.
func closedPostgresPool(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("postgres", "postgres://hotel:hotel@127.0.0.1:1/rates?sslmode=disable")
	if err != nil {
		t.Fatalf("open closed pool: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close pool: %v", err)
	}
	return db
}

func assertStoreFailureAnswer(t *testing.T, plan *RatePlan, oerr *OpError) {
	t.Helper()
	if plan != nil {
		t.Fatalf("failed plan write returned a plan: %+v", plan)
	}
	if oerr == nil {
		t.Fatalf("failed plan write returned no error (the driver error was swallowed)")
	}
	want := storeFailure()
	if oerr.Code != want.Code || oerr.Status != want.Status || oerr.Message != want.Message {
		t.Fatalf("oerr = %+v, want storeFailure() %+v", oerr, want)
	}
	if oerr.Details == nil || len(oerr.Details) != 0 {
		t.Fatalf("oerr.Details = %v, want an empty non-nil map", oerr.Details)
	}
}

func looksUUID(id string) bool {
	if len(id) != 36 {
		return false
	}
	return id[8] == '-' && id[13] == '-' && id[18] == '-' && id[23] == '-'
}

// PLN-1 — a forced driver failure is refused with the sibling write's
// answer, on a closed pool and on a stubbed failing driver. This guard
// fails if the error is swallowed again.
func TestPlanWriteDriverFailureRefused(t *testing.T) {
	t.Run("closed pool", func(t *testing.T) {
		pg := NewPostgres(closedPostgresPool(t))
		units := 2
		plan, oerr := pg.UpsertRatePlan("PHANTOM-CLOSED", "Rack rate", &units)
		assertStoreFailureAnswer(t, plan, oerr)
	})

	t.Run("stubbed driver", func(t *testing.T) {
		stub := &stubPlanDriver{fail: true}
		pg := NewPostgres(openStubPlanDB(t, stub))
		units := 2
		plan, oerr := pg.UpsertRatePlan("PHANTOM-STUB", "Rack rate", &units)
		assertStoreFailureAnswer(t, plan, oerr)
	})
}

// PLN-2 (hermetic half) — the plan statement is attempted and the
// outbox write is never reached: no INSERT INTO rates.outbox runs.
func TestPlanWriteFailureRecordsNoOutbox(t *testing.T) {
	stub := &stubPlanDriver{fail: true}
	pg := NewPostgres(openStubPlanDB(t, stub))

	plan, oerr := pg.UpsertRatePlan("PHANTOM-OUTBOX", "Rack rate", nil)
	assertStoreFailureAnswer(t, plan, oerr)

	stub.mu.Lock()
	defer stub.mu.Unlock()
	if len(stub.queries) == 0 {
		t.Fatalf("the plan statement was never attempted")
	}
	for _, query := range stub.execs {
		if strings.Contains(query, "rates.outbox") {
			t.Fatalf("a failed plan write reached the outbox helper: %s", query)
		}
	}
	if len(stub.execs) != 0 {
		t.Fatalf("a failed plan write executed %d statements, want 0", len(stub.execs))
	}
}

// PLN-2 (scratch-database half) — the failed write stores no plan, emits
// no event, and leaves no plan readable or priceable.
func TestPostgresPlanWriteFailureStoresNothing(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	healthy := NewPostgres(db)

	failedPool, err := OpenPostgres(os.Getenv("TEST_PG_URL"))
	if err != nil {
		t.Fatalf("open failing pool: %v", err)
	}
	if err := failedPool.Close(); err != nil {
		t.Fatalf("close failing pool: %v", err)
	}

	plansBefore := pgCount(t, db, `SELECT count(*) FROM rates.rate_plans`)
	eventsBefore := pgCount(t, db, `SELECT count(*) FROM rates.outbox WHERE event_type = 'rate-plan-changed'`)

	plan, oerr := NewPostgres(failedPool).UpsertRatePlan("PHANTOM-PG", "Rack rate", nil)
	assertStoreFailureAnswer(t, plan, oerr)

	if got := pgCount(t, db, `SELECT count(*) FROM rates.rate_plans`); got != plansBefore {
		t.Fatalf("rate_plans = %d, want unchanged %d", got, plansBefore)
	}
	if got := pgCount(t, db, `SELECT count(*) FROM rates.outbox WHERE event_type = 'rate-plan-changed'`); got != eventsBefore {
		t.Fatalf("rate-plan-changed rows = %d, want unchanged %d", got, eventsBefore)
	}
	if _, exists := pgPlanExists(t, db, "PHANTOM-PG"); exists {
		t.Fatalf("the failed plan write stored a plan")
	}

	_, priceErr := healthy.UpsertRatePrice("PHANTOM-PG", pgTypeID(), "2026-11-01", 12000)
	assertStoreRefusal(t, priceErr, "NOT_FOUND", 404, map[string]any{"ratePlanName": "PHANTOM-PG"},
		messages.Text("rates.notfound.rate_plan", map[string]string{"ratePlanName": "PHANTOM-PG"}))

	phantom := "PHANTOM-PG"
	_, quoteErr := healthy.Quote(pgTypeID(), "2026-11-01", "2026-11-02", &phantom, nil)
	assertStoreRefusal(t, quoteErr, "NOT_FOUND", 404, map[string]any{"ratePlanName": "PHANTOM-PG"},
		messages.Text("rates.notfound.rate_plan", map[string]string{"ratePlanName": "PHANTOM-PG"}))
}

// PLN-4 (hermetic half) — the same request repeated after the driver
// recovers creates the plan and writes the healthy event.
func TestPlanWriteRetryAfterFailure(t *testing.T) {
	stub := &stubPlanDriver{failFirst: true}
	pg := NewPostgres(openStubPlanDB(t, stub))

	plan, oerr := pg.UpsertRatePlan("RETRY-STUB", "Rack rate", nil)
	assertStoreFailureAnswer(t, plan, oerr)

	plan, oerr = pg.UpsertRatePlan("RETRY-STUB", "Rack rate", nil)
	if oerr != nil || plan == nil {
		t.Fatalf("retry = %+v, %v; want a stored plan", plan, oerr)
	}
	if !looksUUID(plan.ID) || plan.Name != "RETRY-STUB" {
		t.Fatalf("retry plan = %+v, want a UUID id and the sent name", plan)
	}

	stub.mu.Lock()
	defer stub.mu.Unlock()
	outboxWrites := 0
	for _, query := range stub.execs {
		if strings.Contains(query, "INSERT INTO rates.outbox") {
			outboxWrites++
		}
	}
	if outboxWrites != 1 {
		t.Fatalf("outbox writes = %d, want exactly the one healthy event", outboxWrites)
	}
}

// PLN-4 (scratch-database half) — the failure leaves no residue and the
// retry creates the plan; a second identical request is an update.
func TestPostgresPlanWriteRetryAfterFailure(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	healthy := NewPostgres(db)

	failedPool, err := OpenPostgres(os.Getenv("TEST_PG_URL"))
	if err != nil {
		t.Fatalf("open failing pool: %v", err)
	}
	if err := failedPool.Close(); err != nil {
		t.Fatalf("close failing pool: %v", err)
	}

	plan, oerr := NewPostgres(failedPool).UpsertRatePlan("RETRY-PG", "Rack rate", nil)
	assertStoreFailureAnswer(t, plan, oerr)

	plan, oerr = healthy.UpsertRatePlan("RETRY-PG", "Rack rate", nil)
	if oerr != nil || plan == nil || !looksUUID(plan.ID) {
		t.Fatalf("retry = %+v, %v; want a stored UUID plan", plan, oerr)
	}
	storedID, exists := pgPlanExists(t, db, "RETRY-PG")
	if !exists || storedID != plan.ID {
		t.Fatalf("stored plan id = %q (exists %v), want %q", storedID, exists, plan.ID)
	}
	if got := pgCount(t, db, `SELECT count(*) FROM rates.rate_plans`); got != 1 {
		t.Fatalf("rate_plans = %d, want 1 after the retry", got)
	}
	if got := pgCount(t, db, `SELECT count(*) FROM rates.outbox WHERE event_type = 'rate-plan-changed'`); got != 1 {
		t.Fatalf("rate-plan-changed rows = %d, want exactly the retry's 1", got)
	}

	second, oerr := healthy.UpsertRatePlan("RETRY-PG", "Rack rate", nil)
	if oerr != nil || second == nil || second.ID != plan.ID {
		t.Fatalf("second write = %+v, %v; want the same row", second, oerr)
	}
	if got := pgCount(t, db, `SELECT count(*) FROM rates.rate_plans`); got != 1 {
		t.Fatalf("rate_plans = %d after the second write, want 1", got)
	}
}

// PLN-5 (memory half) — the in-memory create emits once and an update
// emits none; both keep their stored values.
func TestMemoryPlanWriteUnchanged(t *testing.T) {
	s := New()
	units := 3
	plan, oerr := s.UpsertRatePlan("MEM-RACK", "Rack rate", &units)
	if oerr != nil || plan == nil || plan.ID == "" {
		t.Fatalf("create = %+v, %v", plan, oerr)
	}
	if len(s.events) != 1 {
		t.Fatalf("events after create = %d, want 1", len(s.events))
	}

	updated, oerr := s.UpsertRatePlan("MEM-RACK", "Rack rate v2", nil)
	if oerr != nil || updated == nil || updated.ID != plan.ID {
		t.Fatalf("update = %+v, %v; want the same row", updated, oerr)
	}
	if updated.Description != "Rack rate v2" {
		t.Fatalf("description = %q, want the update", updated.Description)
	}
	if updated.DefaultUnits == nil || *updated.DefaultUnits != units {
		t.Fatalf("defaultUnits = %v, want the stored %d", updated.DefaultUnits, units)
	}
	if len(s.events) != 1 {
		t.Fatalf("events after update = %d, want no extra event", len(s.events))
	}
}

// PLN-5 (scratch-database half) — a healthy create and an update that
// omits defaultUnits keep the stored values and one event per write.
func TestPostgresPlanWriteHealthyUnchanged(t *testing.T) {
	db := pgTestDB(t)
	pgWipe(t, db)
	pg := NewPostgres(db)

	units := 2
	plan, oerr := pg.UpsertRatePlan("HEALTHY-PG", "Rack rate", &units)
	if oerr != nil || plan == nil || !looksUUID(plan.ID) {
		t.Fatalf("create = %+v, %v; want a stored UUID plan", plan, oerr)
	}
	if plan.Name != "HEALTHY-PG" || plan.Description != "Rack rate" || plan.DefaultUnits == nil || *plan.DefaultUnits != 2 {
		t.Fatalf("created plan = %+v, want the sent values", plan)
	}
	if got := pgCount(t, db, `SELECT count(*) FROM rates.outbox WHERE event_type = 'rate-plan-changed'`); got != 1 {
		t.Fatalf("rate-plan-changed rows = %d after create, want 1", got)
	}

	updated, oerr := pg.UpsertRatePlan("HEALTHY-PG", "Rack rate v2", nil)
	if oerr != nil || updated == nil || updated.ID != plan.ID {
		t.Fatalf("update = %+v, %v; want the same row", updated, oerr)
	}
	if updated.Description != "Rack rate v2" {
		t.Fatalf("description = %q, want the update", updated.Description)
	}
	if updated.DefaultUnits == nil || *updated.DefaultUnits != 2 {
		t.Fatalf("defaultUnits = %v, want the stored 2", updated.DefaultUnits)
	}
	if got := pgCount(t, db, `SELECT count(*) FROM rates.rate_plans`); got != 1 {
		t.Fatalf("rate_plans = %d, want 1", got)
	}
	if got := pgCount(t, db, `SELECT count(*) FROM rates.outbox WHERE event_type = 'rate-plan-changed'`); got != 2 {
		t.Fatalf("rate-plan-changed rows = %d after update, want 2", got)
	}
}

func pgCount(t *testing.T, db *sql.DB, query string) int {
	t.Helper()
	var count int
	if err := db.QueryRow(query).Scan(&count); err != nil {
		t.Fatalf("count query failed: %v", err)
	}
	return count
}
