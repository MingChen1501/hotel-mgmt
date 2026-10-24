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
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
