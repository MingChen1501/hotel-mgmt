// Package health exposes the module liveness endpoint used by
// compose/Nginx start ordering and Prometheus scraping.
package health

import (
	"encoding/json"
	"net/http"
)

// Handler answers GET /healthz with the module identity.
func Handler(service string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"service": service,
			"status":  "ok",
		})
	})
}
