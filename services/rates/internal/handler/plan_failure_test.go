// Guard for the failed plan-write handler answer (Refs #767, AC-PLN-2,
// FR-PLN-3, BR-71). A repository whose plan write fails must be answered
// with the existing store-failure envelope at 500, never with a success
// envelope carrying an empty id. The stub half runs without a database;
// the closed-pool half drives the real Postgres store.
package handler

import (
	"database/sql"
	"net/http"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

// failingPlanRepository answers every plan write with the store-failure
// answer. The embedded nil Repository is never reached by this guard.
type failingPlanRepository struct {
	store.Repository
	failure *store.OpError
}

func (r *failingPlanRepository) UpsertRatePlan(string, string, *int) (*store.RatePlan, *store.OpError) {
	return nil, r.failure
}

// storeFailureOpError mirrors the unexported storeFailure() contract
// (code, status, sentence, empty details). Keep it in lockstep with
// services/rates/internal/store/postgres.go: if that answer moves, this
// stub must move with it.
func storeFailureOpError() *store.OpError {
	return &store.OpError{
		Code:    "VALIDATION_FAILED",
		Status:  500,
		Message: messages.Text("rates.store.unavailable", nil),
		Details: map[string]any{},
	}
}

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

func assertStoreFailureEnvelope(t *testing.T, status int, body map[string]any) string {
	t.Helper()
	if status != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500 (%v)", status, body)
	}
	if body["code"] != "VALIDATION_FAILED" {
		t.Fatalf("code = %v, want VALIDATION_FAILED (%v)", body["code"], body)
	}
	if body["message"] != messages.Text("rates.store.unavailable", nil) {
		t.Fatalf("message = %v, want the plain store-unavailable sentence (%v)", body["message"], body)
	}
	details, ok := body["details"].(map[string]any)
	if !ok || len(details) != 0 {
		t.Fatalf("details = %v, want an empty object (%v)", body["details"], body)
	}
	trace, _ := body["traceId"].(string)
	if trace == "" {
		t.Fatalf("refusal carries no traceId: %v", body)
	}
	for _, key := range []string{"id", "name", "description"} {
		if _, present := body[key]; present {
			t.Fatalf("failure body carries success field %q: %v", key, body)
		}
	}
	return trace
}

// PLN-3 — both a stub repository and a closed-pool Postgres answer the
// store-failure envelope at 500, never a success body.
func TestPlanWriteFailureAnswersStoreFailureEnvelope(t *testing.T) {
	requests := []struct {
		name string
		mux  http.Handler
	}{
		{"stub repository", NewMux(&failingPlanRepository{failure: storeFailureOpError()})},
		{"closed pool", NewMux(store.NewPostgres(closedPostgresPool(t)))},
	}
	for _, request := range requests {
		t.Run(request.name, func(t *testing.T) {
			firstTrace := ""
			for attempt := 0; attempt < 2; attempt++ {
				code, body := post(t, request.mux, "/v1/rates/UpsertRatePlan",
					map[string]any{"name": "RACK", "description": "Rack rate"}, deskToken)
				trace := assertStoreFailureEnvelope(t, code, body)
				if attempt == 0 {
					firstTrace = trace
					continue
				}
				if trace == firstTrace {
					t.Fatalf("traceId %q repeated across calls, want a fresh one", trace)
				}
			}
		})
	}
}

// PLN-3 — the handler's existing field refusals keep precedence over a
// store that would also fail.
func TestPlanWriteFieldRefusalPrecedesStoreFailure(t *testing.T) {
	mux := NewMux(&failingPlanRepository{failure: storeFailureOpError()})

	code, body := post(t, mux, "/v1/rates/UpsertRatePlan", map[string]any{"description": "no name"}, deskToken)
	if code != http.StatusBadRequest || body["code"] != "VALIDATION_FAILED" {
		t.Fatalf("missing name = %d %v, want 400 VALIDATION_FAILED", code, body)
	}
	details, _ := body["details"].(map[string]any)
	if details["field"] != "name" {
		t.Fatalf("details.field = %v, want name (%v)", details["field"], body)
	}
}
