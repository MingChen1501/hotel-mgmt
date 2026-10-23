// Command server boots the rates module with the PricingService
// operations (LLD section 4) plus the health endpoint.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/handler"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/health"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("rates"))
	pricing := handler.NewMux(store.New())
	mux.Handle("POST /v1/rates/", pricing)
	addr := ":" + port
	log.Printf("rates listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
