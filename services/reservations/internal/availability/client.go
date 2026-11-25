// Package availability derives the overbooking guard's sellable
// ceiling from the room inventory Rooms records (ADR-0006, issue
// #631). Reservations wires Client.Ceiling into
// Service.AvailabilityHook at boot and reads it once per booking
// attempt, so the request's advisory sellableUnits can neither raise
// nor lower the ceiling. The call forwards the caller Bearer token and
// fails closed: when the inventory cannot be read, the booking is
// refused with UPSTREAM_UNAVAILABLE instead of risking an overbook
// against a capacity nobody verified.
package availability

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

// maxReplyBytes bounds the reply this client reads. The contract's
// reply is a handful of fields, so one mebibyte is generous and keeps
// a misbehaving upstream from streaming without end.
const maxReplyBytes = 1 << 20

// Client calls the rooms service over HTTP/JSON POST.
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient returns a Client for baseURL (for example
// "http://rooms:8085" inside the compose network).
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		http:    &http.Client{Timeout: 5 * time.Second},
	}
}

// Ceiling reads Rooms CheckRoomTypeSellability for the room type and
// date range and returns totalCount - len(blockedRooms): the units no
// date-ranged block holds (ADR-0006 D2). The derived sellableCount is
// not consumed. A provider 4xx envelope is returned unchanged so the
// caller acts on the same refusal (a rejected session stays
// UNAUTHENTICATED, an unknown type stays NOT_FOUND); anything else
// that leaves the ceiling unverified — transport failure, timeout,
// 5xx, unparseable body, a reply missing the two consumed fields as
// integers, or a reply that blocks more rooms than the type holds —
// fails closed with UPSTREAM_UNAVAILABLE. bearerToken is the full
// caller "Bearer ..." Authorization header value.
func (c *Client) Ceiling(roomTypeID, arrivalDate, departureDate, bearerToken string) (int, *store.OpError) {
	payload, err := json.Marshal(map[string]any{
		"roomType": roomTypeID,
		"dateFrom": arrivalDate,
		"dateTo":   departureDate,
	})
	if err != nil {
		return 0, unavailable()
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/v1/rooms/CheckRoomTypeSellability", bytes.NewReader(payload))
	if err != nil {
		return 0, unavailable()
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(bearerToken) != "" {
		req.Header.Set("Authorization", bearerToken)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, unavailable()
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusOK:
		return parseCeiling(resp.Body)
	case resp.StatusCode >= 400 && resp.StatusCode < 500:
		return 0, providerRefusal(resp)
	default:
		return 0, unavailable()
	}
}

// sellabilityReply names only the two consumed fields as raw tokens so
// a quoted number or a null is refused instead of coerced. Pointers
// keep "absent" apart from "zero".
type sellabilityReply struct {
	TotalCount   *json.RawMessage `json:"totalCount"`
	BlockedRooms *json.RawMessage `json:"blockedRooms"`
}

// parseCeiling validates the consumed fields and derives the ceiling.
// totalCount must be a JSON integer (a quoted number is not one) and
// blockedRooms a JSON array of room-number strings.
func parseCeiling(body io.Reader) (int, *store.OpError) {
	decoder := json.NewDecoder(io.LimitReader(body, maxReplyBytes))
	var reply sellabilityReply
	if err := decoder.Decode(&reply); err != nil {
		return 0, unavailable()
	}
	if reply.TotalCount == nil || reply.BlockedRooms == nil {
		return 0, unavailable()
	}
	total, err := strconv.ParseInt(strings.TrimSpace(string(*reply.TotalCount)), 10, 64)
	if err != nil || total < 0 {
		return 0, unavailable()
	}
	rawBlocked := strings.TrimSpace(string(*reply.BlockedRooms))
	if rawBlocked == "null" {
		return 0, unavailable()
	}
	var blocked []string
	if err := json.Unmarshal([]byte(rawBlocked), &blocked); err != nil {
		return 0, unavailable()
	}
	ceiling := total - int64(len(blocked))
	if ceiling < 0 {
		// A reply that blocks more rooms than the type holds is not a
		// readable inventory: refuse the booking instead of trusting a
		// negative capacity.
		return 0, unavailable()
	}
	return int(ceiling), nil
}

// providerRefusal surfaces a Rooms 4xx envelope unchanged. An
// unparseable or codeless refusal is unreadable and fails closed.
func providerRefusal(resp *http.Response) *store.OpError {
	var envelope struct {
		Code    string         `json:"code"`
		Message string         `json:"message"`
		Details map[string]any `json:"details"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxReplyBytes)).Decode(&envelope); err != nil || strings.TrimSpace(envelope.Code) == "" {
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

// unavailable fails a booking closed when the capacity read itself
// cannot be trusted.
func unavailable() *store.OpError {
	return &store.OpError{
		Code:    "UPSTREAM_UNAVAILABLE",
		Status:  http.StatusServiceUnavailable,
		Message: messages.Text("error.upstream.availability_unavailable", nil),
		Details: map[string]any{"upstream": "rooms", "operation": "CheckRoomTypeSellability"},
	}
}
