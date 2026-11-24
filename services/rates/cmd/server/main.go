// Command server boots the rates module with the PricingService
// operations (LLD section 4) plus the health endpoint.
//
// Row storage is selected at boot: when DATABASE_URL is set the
// Postgres-backed store persists every row in the rates schema
// (issue #149); otherwise the in-memory store serves unit tests and
// local runs with identical pricing semantics.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/envelope"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/handler"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/health"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}
	var repo store.Repository = store.New()
	if url := os.Getenv("DATABASE_URL"); url != "" {
		db, err := store.OpenPostgres(url)
		if err != nil {
			log.Fatal(err)
		}
		defer db.Close()
		repo = store.NewPostgres(db)
		log.Print("rates using Postgres row storage")
	}
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("rates"))
	pricing := handler.NewMux(repo)
	mux.Handle("POST /v1/rates/", pricing)
	addr := ":" + port
	log.Printf("rates listening on %s", addr)
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
