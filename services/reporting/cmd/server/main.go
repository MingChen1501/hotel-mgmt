// Command server boots the reporting module with a health endpoint.
// Skeleton only: no business logic and no endpoints beyond /healthz.
// Operation logic lands in later slices per docs/architecture/lld.md section 7.
package main

import (
	"log"
	"net/http"
	"os"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/health"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}
	mux := http.NewServeMux()
	mux.Handle("GET /healthz", health.Handler("reporting"))
	addr := ":" + port
	log.Printf("reporting listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
