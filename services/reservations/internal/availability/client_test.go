package availability

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// #631 guards (O6, O7, AC-OVB-2/AC-OVB-3, FR-OVB-3, BR-48): the
// capacity read derives the ceiling from the recorded inventory, fails
// closed on everything unreadable, and surfaces a provider 4xx
// unchanged.

func stubRooms(t *testing.T, status int, payload any, seenAuth *string, seenBody *map[string]any) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/rooms/CheckRoomTypeSellability" {
			t.Errorf("rooms path = %s, want /v1/rooms/CheckRoomTypeSellability", r.URL.Path)
		}
		*seenAuth = r.Header.Get("Authorization")
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Errorf("rooms stub got a non-JSON body: %v", err)
		}
		*seenBody = body
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(payload)
	}))
}

func assertUpstreamUnavailable(t *testing.T, ceiling int, oerrCode string, oerrStatus int, oerrDetails map[string]any) {
	t.Helper()
	if oerrCode != "UPSTREAM_UNAVAILABLE" || oerrStatus != http.StatusServiceUnavailable {
		t.Fatalf("error = %s/%d, want 503 UPSTREAM_UNAVAILABLE", oerrCode, oerrStatus)
	}
	if oerrDetails["upstream"] != "rooms" || oerrDetails["operation"] != "CheckRoomTypeSellability" {
		t.Fatalf("details = %v, want rooms/CheckRoomTypeSellability named", oerrDetails)
	}
	if ceiling != 0 {
		t.Fatalf("ceiling = %d alongside a refusal, want 0", ceiling)
	}
}

func TestCeilingDerivesFromRecordedInventory(t *testing.T) {
	var seenAuth string
	var seenBody map[string]any
	srv := stubRooms(t, http.StatusOK, map[string]any{
		"roomTypeId": "deluxe-type", "dateFrom": "2026-11-01", "dateTo": "2026-11-03",
		"totalCount": 3, "sellableCount": 2, "blockedRooms": []string{"101"},
	}, &seenAuth, &seenBody)
	defer srv.Close()

	ceiling, oerr := NewClient(srv.URL).Ceiling("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
	if oerr != nil {
		t.Fatalf("Ceiling refused: %v", oerr)
	}
	if ceiling != 2 {
		t.Fatalf("ceiling = %d, want totalCount 3 minus 1 blocked room = 2", ceiling)
	}
	if seenAuth != "Bearer caller-token" {
		t.Fatalf("Authorization = %q, want the caller Bearer token forwarded", seenAuth)
	}
	if seenBody["roomType"] != "deluxe-type" || seenBody["dateFrom"] != "2026-11-01" || seenBody["dateTo"] != "2026-11-03" {
		t.Fatalf("rooms request body = %v, want type+dates", seenBody)
	}
}

func TestCeilingFailsClosedWhenRoomsUnreachable(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	unreachable := srv.URL
	srv.Close()
	ceiling, oerr := NewClient(unreachable).Ceiling("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
	if oerr == nil {
		t.Fatal("unreachable rooms allowed a ceiling")
	}
	assertUpstreamUnavailable(t, ceiling, oerr.Code, oerr.Status, oerr.Details)
}

func TestCeilingFailsClosedOnTimeout(t *testing.T) {
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
		_ = json.NewEncoder(w).Encode(map[string]any{"totalCount": 3, "blockedRooms": []string{}})
	}))
	defer slow.Close()
	client := NewClient(slow.URL)
	client.http = &http.Client{Timeout: 20 * time.Millisecond}

	ceiling, oerr := client.Ceiling("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
	if oerr == nil {
		t.Fatal("timed-out rooms allowed a ceiling")
	}
	assertUpstreamUnavailable(t, ceiling, oerr.Code, oerr.Status, oerr.Details)
}

func TestCeilingFailsClosedOnServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("boom"))
	}))
	defer srv.Close()
	ceiling, oerr := NewClient(srv.URL).Ceiling("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
	if oerr == nil {
		t.Fatal("a 5xx rooms reply allowed a ceiling")
	}
	assertUpstreamUnavailable(t, ceiling, oerr.Code, oerr.Status, oerr.Details)
}

func TestCeilingFailsClosedOnUnreadableReply(t *testing.T) {
	cases := map[string]string{
		"not-json":                    `not-json`,
		"empty-object":                `{}`,
		"missing-blocked-rooms":       `{"totalCount": 2}`,
		"null-blocked-rooms":          `{"totalCount": 2, "blockedRooms": null}`,
		"string-total-count":          `{"totalCount": "2", "blockedRooms": []}`,
		"fractional-total-count":      `{"totalCount": 1.5, "blockedRooms": []}`,
		"negative-total-count":        `{"totalCount": -1, "blockedRooms": []}`,
		"non-string-blocked-room":     `{"totalCount": 1, "blockedRooms": [101]}`,
		"blocked-exceeds-total-count": `{"totalCount": 1, "blockedRooms": ["101", "102"]}`,
	}
	for name, reply := range cases {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(reply))
			}))
			defer srv.Close()
			ceiling, oerr := NewClient(srv.URL).Ceiling("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
			if oerr == nil {
				t.Fatalf("reply %s allowed ceiling %d", reply, ceiling)
			}
			assertUpstreamUnavailable(t, ceiling, oerr.Code, oerr.Status, oerr.Details)
		})
	}
}

func TestCeilingSurfacesProviderRefusalUnchanged(t *testing.T) {
	for _, tc := range []struct {
		name   string
		status int
		code   string
	}{
		{"unknown-room-type", http.StatusNotFound, "NOT_FOUND"},
		{"rejected-session", http.StatusUnauthorized, "UNAUTHENTICATED"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			srv := stubRooms(t, tc.status, map[string]any{
				"code": tc.code, "message": "refused by rooms", "traceId": "rooms-stub",
				"details": map[string]any{"roomType": "deluxe-type"},
			}, new(string), new(map[string]any))
			defer srv.Close()
			_, oerr := NewClient(srv.URL).Ceiling("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
			if oerr == nil || oerr.Code != tc.code || oerr.Status != tc.status {
				t.Fatalf("error = %v, want the %s/%d envelope unchanged", oerr, tc.code, tc.status)
			}
			if oerr.Details["roomType"] != "deluxe-type" {
				t.Fatalf("details = %v, want the provider details kept", oerr.Details)
			}
		})
	}
}

func TestCeilingFailsClosedOnUnparseableRefusal(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte("not-json"))
	}))
	defer srv.Close()
	ceiling, oerr := NewClient(srv.URL).Ceiling("deluxe-type", "2026-11-01", "2026-11-03", "Bearer caller-token")
	if oerr == nil {
		t.Fatal("an unparseable 4xx allowed a ceiling")
	}
	assertUpstreamUnavailable(t, ceiling, oerr.Code, oerr.Status, oerr.Details)
}
