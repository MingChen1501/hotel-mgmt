package envelope

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/messages"
)

// serviceMux mirrors the server wiring: one exact GET route plus the
// operation subtree, whose own fallback answers an unknown operation.
func serviceMux() *http.ServeMux {
	operations := http.NewServeMux()
	operations.HandleFunc("POST /v1/reservations/CreateReservation", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	operations.Handle("/", NotFound())

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"service":"reservations","status":"ok"}`))
	})
	mux.Handle("POST /v1/reservations/", operations)
	return mux
}

func serve(t *testing.T, h http.Handler, method, path string) (int, http.Header, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("%s %s response is not JSON: %v (body %q)", method, path, err, rec.Body.String())
	}
	return rec.Code, rec.Header(), body
}

// assertEnvelope pins the shared four-field envelope and the
// catalogue sentence the code carries.
func assertEnvelope(t *testing.T, status int, header http.Header, body map[string]any, wantStatus int, wantCode, wantKey string) {
	t.Helper()
	if status != wantStatus {
		t.Fatalf("status = %d, want %d (%v)", status, wantStatus, body)
	}
	if got := header.Get("Content-Type"); got != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", got)
	}
	if body["code"] != wantCode {
		t.Fatalf("code = %v, want %s", body["code"], wantCode)
	}
	wantMessage := messages.Text(wantKey, nil)
	if strings.HasPrefix(wantMessage, "message-missing:") {
		t.Fatalf("catalogue key %s is missing", wantKey)
	}
	if got := body["message"]; got != wantMessage {
		t.Fatalf("message = %v, want catalogue %q", got, wantMessage)
	}
	details, ok := body["details"].(map[string]any)
	if !ok || len(details) != 0 {
		t.Fatalf("details = %v, want an empty object", body["details"])
	}
	if trace, ok := body["traceId"].(string); !ok || trace == "" {
		t.Fatalf("traceId = %v, want a non-empty id", body["traceId"])
	}
}

func TestFallbackAnswersUnknownPathWithEnvelope(t *testing.T) {
	status, header, body := serve(t, Fallback(serviceMux()), http.MethodGet, "/nope")
	assertEnvelope(t, status, header, body, http.StatusNotFound, CodeNotFound, "error.transport.unknown_path")
}

func TestFallbackAnswersWrongMethodWithEnvelope(t *testing.T) {
	cases := []struct {
		name, method, path, allow string
	}{
		{"exact route", http.MethodPost, "/healthz", "GET, HEAD"},
		{"operation subtree", http.MethodGet, "/v1/reservations/CreateReservation", "POST"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			status, header, body := serve(t, Fallback(serviceMux()), tc.method, tc.path)
			assertEnvelope(t, status, header, body, http.StatusMethodNotAllowed, CodeMethodNotAllowed, "error.transport.method_not_allowed")
			if got := header.Get("Allow"); !strings.Contains(got, tc.allow) {
				t.Fatalf("Allow = %q, want %q", got, tc.allow)
			}
		})
	}
}

func TestMountedMuxAnswersUnknownOperationWithEnvelope(t *testing.T) {
	status, header, body := serve(t, Fallback(serviceMux()), http.MethodPost, "/v1/reservations/NoSuchOperation")
	assertEnvelope(t, status, header, body, http.StatusNotFound, CodeNotFound, "error.transport.unknown_path")
}

func TestRecoverAnswersPanicWithEnvelope(t *testing.T) {
	mux := serviceMux()
	mux.HandleFunc("GET /boom", func(http.ResponseWriter, *http.Request) { panic("boom") })
	handler := Recover(Fallback(mux))

	status, header, body := serve(t, handler, http.MethodGet, "/boom")
	assertEnvelope(t, status, header, body, http.StatusInternalServerError, CodeInternalError, "error.transport.unexpected")

	// The service answers its next request normally: one fault never
	// leaves the module unable to serve.
	status, _, body = serve(t, handler, http.MethodGet, "/healthz")
	if status != http.StatusOK || body["status"] != "ok" {
		t.Fatalf("next request = %d %v, want 200 health", status, body)
	}
}

func TestMatchedRoutesPassThroughUnchanged(t *testing.T) {
	handler := Recover(Fallback(serviceMux()))

	status, _, body := serve(t, handler, http.MethodGet, "/healthz")
	if status != http.StatusOK || body["service"] != "reservations" || body["status"] != "ok" {
		t.Fatalf("GET /healthz = %d %v, want 200 health", status, body)
	}
	status, _, body = serve(t, handler, http.MethodPost, "/v1/reservations/CreateReservation")
	if status != http.StatusOK || body["ok"] != true {
		t.Fatalf("POST /v1/reservations/CreateReservation = %d %v, want 200 operation payload", status, body)
	}
}
