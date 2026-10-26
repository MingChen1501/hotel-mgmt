// Package pricing consults the rates service stay-restriction check
// (FR-RTE-4) from the desk-loop booking path. Reservations wires
// Client.Check into Service.CheckRestrictionsHook at boot, so every
// Create/Modify attempt is refused server-side when a manager-set
// window (closed-to-arrival, min-stay) covers the stay. The call
// forwards the caller Bearer token and fails closed: when rates is
// unreachable or answers outside the envelope, the booking is
// refused with UPSTREAM_UNAVAILABLE instead of risking a violation.
package pricing

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

// Client calls the rates service over HTTP/JSON POST.
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient returns a Client for baseURL (for example
// "http://rates:8082" inside the compose network).
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		http:    &http.Client{Timeout: 5 * time.Second},
	}
}

// Check asks rates CheckRestrictions whether the stay passes and
// returns nil when it does. A rates refusal is returned unchanged so
// the violated restriction stays named in the envelope; anything
// else (unreachable rates, unexpected status, unparseable envelope)
// fails closed with UPSTREAM_UNAVAILABLE. bearerToken is the full
// caller "Bearer ..." Authorization header value.
func (c *Client) Check(roomTypeID, arrivalDate, departureDate, bearerToken string) *store.OpError {
	payload, err := json.Marshal(map[string]any{
		"roomTypeId":    roomTypeID,
		"arrivalDate":   arrivalDate,
		"departureDate": departureDate,
	})
	if err != nil {
		return unavailable()
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/v1/rates/CheckRestrictions", bytes.NewReader(payload))
	if err != nil {
		return unavailable()
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(bearerToken) != "" {
		req.Header.Set("Authorization", bearerToken)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return unavailable()
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return nil
	}
	var envelope struct {
		Code    string         `json:"code"`
		Message string         `json:"message"`
		Details map[string]any `json:"details"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil || strings.TrimSpace(envelope.Code) == "" {
		return unavailable()
	}
	if envelope.Details == nil {
		envelope.Details = map[string]any{}
	}
	return &store.OpError{
		Code:    envelope.Code,
		Status:  resp.StatusCode,
		Message: envelope.Message,
		Details: envelope.Details,
	}
}

// unavailable fails a booking closed when the restriction check
// itself cannot be trusted.
func unavailable() *store.OpError {
	return &store.OpError{
		Code:    "UPSTREAM_UNAVAILABLE",
		Status:  http.StatusServiceUnavailable,
		Message: messages.Text("error.upstream.restrictions_unavailable", nil),
		Details: map[string]any{"upstream": "rates", "operation": "CheckRestrictions"},
	}
}
