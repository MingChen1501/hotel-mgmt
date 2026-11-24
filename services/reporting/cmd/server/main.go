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
	if err := http.ListenAndServe(addr, newHandler(mux)); err != nil {
		log.Fatal(err)
	}
}

// newHandler answers every request through the shared envelope: a
// handler panic becomes 500 INTERNAL_ERROR, and a request the mux
// cannot route becomes 404 NOT_FOUND or 405 METHOD_NOT_ALLOWED
// (docs/technical/error-handling.md section 1; Refs #628).
func newHandler(mux *http.ServeMux) http.Handler {
	return envelope.Recover(envelope.Fallback(mux))
}
