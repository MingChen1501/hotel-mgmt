// Package envelope answers the requests a service refuses before any
// operation handler runs: an unmatched path (404 NOT_FOUND), a wrong
// method on a known route (405 METHOD_NOT_ALLOWED), and a handler
// panic (500 INTERNAL_ERROR). Every answer carries the shared envelope
// from contracts/errors/envelope.json, so a caller can branch on a
// code instead of parsing a plain-text reply
// (docs/technical/error-handling.md section 1; Refs #628).
package envelope

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
)

// The envelope codes these answers carry, from the contract enum.
const (
	CodeNotFound         = "NOT_FOUND"
	CodeMethodNotAllowed = "METHOD_NOT_ALLOWED"
	CodeInternalError    = "INTERNAL_ERROR"
)

// probeMethods are the methods a route lookup tries when the caller's
// own method does not match: a pattern registered for any of them
// proves the path is known and only the method is wrong.
var probeMethods = []string{
	http.MethodGet, http.MethodHead, http.MethodPost,
	http.MethodPut, http.MethodPatch, http.MethodDelete,
	http.MethodOptions,
}

func traceID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	return hex.EncodeToString(buf[:])
}

// Write answers one request with the shared error envelope. A nil
// details map is written as an empty object, so the four fields are
// always present.
func Write(w http.ResponseWriter, status int, code, message string, details map[string]any) {
	if details == nil {
		details = map[string]any{}
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code":    code,
		"message": message,
		"details": details,
		"traceId": traceID(),
	})
}

// NotFound answers an unmatched path with 404 NOT_FOUND. Mount it as
// the "/" pattern of a mux served behind a prefix, whose own built-in
// answer would otherwise be a plain-text 404.
func NotFound() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		Write(w, http.StatusNotFound, CodeNotFound, messages.Text("error.transport.unknown_path", nil), nil)
	})
}

// Fallback answers a request the mux would refuse with its built-in
// plain-text 404 or 405 with the shared envelope instead: a path no
// registered pattern claims is 404 NOT_FOUND, and a path a pattern
// claims for another method is 405 METHOD_NOT_ALLOWED with the Allow
// header naming that method. A matched request is served by the mux
// unchanged.
func Fallback(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pattern := mux.Handler(r); pattern != "" {
			mux.ServeHTTP(w, r)
			return
		}
		if allowed := otherMethods(mux, r); len(allowed) > 0 {
			w.Header().Set("Allow", strings.Join(allowed, ", "))
			Write(w, http.StatusMethodNotAllowed, CodeMethodNotAllowed, messages.Text("error.transport.method_not_allowed", nil), nil)
			return
		}
		Write(w, http.StatusNotFound, CodeNotFound, messages.Text("error.transport.unknown_path", nil), nil)
	})
}

// otherMethods reports the methods the mux routes for the request's
// path. It only asks the mux which handler it would pick; no handler
// runs for a probe.
func otherMethods(mux *http.ServeMux, r *http.Request) []string {
	var allowed []string
	for _, method := range probeMethods {
		if method == r.Method {
			continue
		}
		probe := r.Clone(context.Background())
		probe.Method = method
		if _, pattern := mux.Handler(probe); pattern != "" {
			allowed = append(allowed, method)
		}
	}
	return allowed
}

// Recover answers a handler panic with the 500 INTERNAL_ERROR envelope
// instead of letting net/http close the connection with an empty body.
// The panic is logged without its stack reaching the caller. A panic
// after the handler started writing cannot be rewritten, so the
// partial reply stands and the log records the failure.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		state := &writeState{ResponseWriter: w}
		defer func() {
			recovered := recover()
			if recovered == nil {
				return
			}
			log.Printf("%s %s panicked: %v", r.Method, r.URL.Path, recovered)
			if state.wroteHeader {
				return
			}
			Write(w, http.StatusInternalServerError, CodeInternalError, messages.Text("error.transport.unexpected", nil), nil)
		}()
		next.ServeHTTP(state, r)
	})
}

// writeState records whether the wrapped handler already committed a
// status line, so a recovered panic never tries to rewrite one.
type writeState struct {
	http.ResponseWriter
	wroteHeader bool
}

func (w *writeState) WriteHeader(status int) {
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *writeState) Write(p []byte) (int, error) {
	w.wroteHeader = true
	return w.ResponseWriter.Write(p)
}
