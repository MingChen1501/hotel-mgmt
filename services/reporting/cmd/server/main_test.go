package main

import (
	"net/http"
	"testing"
	"time"
)

// BND15 covers AC-BND-3 and NFR-BND-3 for Reporting (Refs #630): the server
// this package starts declares all four finite bounds, with no zero,
// disabled, or unset value left for a stalled peer to sit on.
func TestNewServerDeclaresFiniteBounds(t *testing.T) {
	srv := newServer(":0", http.NewServeMux())
	cases := []struct {
		name string
		got  time.Duration
		want time.Duration
	}{
		{"ReadHeaderTimeout", srv.ReadHeaderTimeout, 5 * time.Second},
		{"ReadTimeout", srv.ReadTimeout, 10 * time.Second},
		{"WriteTimeout", srv.WriteTimeout, 15 * time.Second},
		{"IdleTimeout", srv.IdleTimeout, 60 * time.Second},
	}
	for _, tc := range cases {
		if tc.got != tc.want {
			t.Errorf("%s = %v, want %v", tc.name, tc.got, tc.want)
		}
		if tc.got <= 0 {
			t.Errorf("%s = %v, want a finite positive bound", tc.name, tc.got)
		}
	}
	if srv.Addr != ":0" {
		t.Errorf("Addr = %q, want :0", srv.Addr)
	}
}
