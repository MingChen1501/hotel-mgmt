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

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/handler"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/health"
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
	booking := handler.NewMux(service.New(repo), repo)
	mux.Handle("POST /v1/reservations/", booking)
	addr := ":" + port
	log.Printf("reservations listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
