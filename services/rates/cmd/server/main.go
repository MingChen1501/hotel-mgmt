// Command server boots the rates module with a health endpoint.
// Skeleton only: no business logic and no endpoints beyond /healthz.
// Operation logic lands in later slices per docs/architecture/lld.md section 4.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/health"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("rates"))
	addr := ":" + port
	log.Printf("rates listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
