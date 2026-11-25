// Command server boots the reporting module with the
// ReportingService read operations (LLD section 7, FR-RPT-1..4) plus
// the health endpoint.
//
// Row storage is in-memory and rebuilt from owning-module outbox
// events; Postgres persistence of the read model hardens in a later
// slice with identical rebuild semantics.
package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/envelope"
	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/handler"
	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/health"
	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}
	st := store.New()
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("reporting"))
	reads := handler.NewMux(service.New(st))
	mux.Handle("POST /v1/reporting/", reads)
	addr := ":" + port
	log.Printf("reporting listening on %s", addr)
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
