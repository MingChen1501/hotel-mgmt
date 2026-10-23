// Command server boots the reservations module with the
// ReservationService operations (LLD section 1) plus the health
// endpoint.
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
	st := store.New()
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("reservations"))
	booking := handler.NewMux(service.New(st), st)
	mux.Handle("POST /v1/reservations/", booking)
	addr := ":" + port
	log.Printf("reservations listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
