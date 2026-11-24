// Command server boots the reservations module with the
// ReservationService operations (LLD section 1) plus the health
// endpoint.
//
// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the reservations
// schema (issue #149); otherwise the in-memory store serves unit
// tests and local runs with identical guard semantics.
package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/envelope"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/handler"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/health"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/pricing"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	var repo store.Repository = store.New()
	if url := os.Getenv("DATABASE_URL"); url != "" {
		db, err := store.OpenPostgres(url)
		if err != nil {
			log.Fatal(err)
		}
		defer db.Close()
		repo = store.NewPostgres(db)
		log.Print("reservations using Postgres row storage")
	}
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("reservations"))
	svc := service.New(repo)
	ratesBase := strings.TrimSpace(os.Getenv("RATES_BASE_URL"))
	if ratesBase == "" {
		ratesBase = "http://rates:8082"
	}
	svc.CheckRestrictionsHook = pricing.NewClient(ratesBase).Check
	booking := handler.NewMux(svc, repo)
	mux.Handle("POST /v1/reservations/", booking)
	addr := ":" + port
	log.Printf("reservations listening on %s", addr)
	if err := newServer(addr, newHandler(mux)).ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

// newServer builds the HTTP server with the four finite bounds the
// bundle runs with (LLD section 29.3, AC-BND-3): no zero, disabled, or
// unset value remains, and every bound stays above the longest
// legitimate provider wait.
func newServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
}

// newHandler answers every request through the shared envelope: a
// handler panic becomes 500 INTERNAL_ERROR, and a request the mux
// cannot route becomes 404 NOT_FOUND or 405 METHOD_NOT_ALLOWED
// (docs/technical/error-handling.md section 1; Refs #628).
func newHandler(mux *http.ServeMux) http.Handler {
	return envelope.Recover(envelope.Fallback(mux))
}
