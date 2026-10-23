// Command server boots the reservations module with a health endpoint.
// Skeleton only: no business logic and no endpoints beyond /healthz.
// Operation logic lands in later slices per docs/architecture/lld.md section 1.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/health"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("reservations"))
	addr := ":" + port
	log.Printf("reservations listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
