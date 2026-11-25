package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

// BND6 covers AC-BND-1, AC-BND-4, NFR-BND-1, and NFR-BND-2 for Rates
// (Refs #630): the ceiling is the declared code constant, an over-limit
// body is refused with the shared envelope before any store write, and
// the 65 536/65 537 boundary pair holds.

// paddedJSON renders base as a JSON object padded with a filler field
// to exactly size bytes.
func paddedJSON(t *testing.T, base map[string]any, size int) []byte {
	t.Helper()
	raw, err := json.Marshal(base)
	if err != nil {
		t.Fatalf("marshal base body: %v", err)
	}
	// The suffix replaces the closing brace with `,"pad":"…"}`: net
	// nine bytes plus the filler run.
	pad := size - len(raw) - 9
	if pad < 0 {
		t.Fatalf("base body of %d bytes leaves no room below %d", len(raw), size)
	}
	out := append([]byte{}, raw[:len(raw)-1]...)
	out = append(out, `,"pad":"`...)
	out = append(out, bytes.Repeat([]byte("x"), pad)...)
	out = append(out, '"', '}')
	if len(out) != size {
		t.Fatalf("padded body is %d bytes, want %d", len(out), size)
	}
	return out
}

func postRaw(t *testing.T, mux http.Handler, path string, raw []byte, declared int64) (int, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	if declared >= 0 {
		req.ContentLength = declared
	}
	req.Header.Set("Authorization", deskToken)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var decoded map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	return rec.Code, decoded
}

func assertTooLargeEnvelope(t *testing.T, code int, body map[string]any) {
	t.Helper()
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", code)
	}
	if len(body) != 4 {
		t.Fatalf("envelope keys = %v, want exactly code, message, details, traceId", body)
	}
	if body["code"] != "VALIDATION_FAILED" {
		t.Fatalf("code = %v, want VALIDATION_FAILED", body["code"])
	}
	details, ok := body["details"].(map[string]any)
	if !ok || len(details) != 1 || details["field"] != "body" {
		t.Fatalf("details = %v, want exactly {\"field\": \"body\"}", body["details"])
	}
	if got := body["message"]; got != "Request body is too large." {
		t.Fatalf("message = %v, want the plain too-large sentence", got)
	}
	if trace, ok := body["traceId"].(string); !ok || strings.TrimSpace(trace) == "" {
		t.Fatalf("traceId = %v, want a non-empty id", body["traceId"])
	}
}

func TestBodyCeilingRefusesOversizedBody(t *testing.T) {
	if maxBodyBytes != 65536 {
		t.Fatalf("maxBodyBytes = %d, want 65536", maxBodyBytes)
	}
	mux := NewMux(store.New())

	over := map[string]any{"name": "BND-Over", "description": "too large", "defaultUnits": 1}
	code, body := postRaw(t, mux, "/v1/rates/UpsertRatePlan", paddedJSON(t, over, maxBodyBytes+1), -1)
	assertTooLargeEnvelope(t, code, body)
	// The refused request wrote no rate plan: a quote naming it still
	// answers "Unknown rate plan".
	if code, body := postRaw(t, mux, "/v1/rates/QuotePrice", []byte(`{"roomTypeId":"deluxe","arrivalDate":"2026-11-01","departureDate":"2026-11-03","ratePlanName":"BND-Over"}`), -1); code != http.StatusNotFound || body["message"] != "Unknown rate plan BND-Over." {
		t.Fatalf("quote for the refused plan = %d (%v), want 404 Unknown rate plan", code, body)
	}

	under := map[string]any{"name": "BND-Under", "description": "at the ceiling", "defaultUnits": 1}
	if code, body := postRaw(t, mux, "/v1/rates/UpsertRatePlan", paddedJSON(t, under, maxBodyBytes), -1); code != http.StatusOK || body["name"] != "BND-Under" {
		t.Fatalf("65 536-byte body = %d (%v), want 200 BND-Under", code, body)
	}
}

func TestBodyCeilingRefusesUnderDeclaredBody(t *testing.T) {
	if maxBodyBytes != 65536 {
		t.Fatalf("maxBodyBytes = %d, want 65536", maxBodyBytes)
	}
	mux := NewMux(store.New())
	lying := map[string]any{"name": "BND-Lying", "description": "under-declared", "defaultUnits": 1}
	code, body := postRaw(t, mux, "/v1/rates/UpsertRatePlan", paddedJSON(t, lying, maxBodyBytes+4096), 128)
	assertTooLargeEnvelope(t, code, body)
}

// countingReader proves the declared content-length above the ceiling
// is refused before the first read.
type countingReader struct {
	reads int
}

func (c *countingReader) Read([]byte) (int, error) {
	c.reads++
	return 0, io.EOF
}

func TestBodyCeilingRefusesDeclaredLengthBeforeReading(t *testing.T) {
	mux := NewMux(store.New())
	reader := &countingReader{}
	req := httptest.NewRequest(http.MethodPost, "/v1/rates/UpsertRatePlan", reader)
	req.ContentLength = maxBodyBytes + 1
	req.Header.Set("Authorization", deskToken)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	assertTooLargeEnvelope(t, rec.Code, body)
	if reader.reads != 0 {
		t.Fatalf("body reader was read %d times, want 0", reader.reads)
	}
}
