// Package pricing consults the rates service from the desk-loop
// booking path. Reservations wires Client.Check into
// Service.CheckRestrictionsHook and Client.QuotePrice into
// Service.QuotePriceHook at boot, so every Create/Modify attempt is
// refused server-side when a manager-set window (closed-to-arrival,
// min-stay) covers the stay, and the frozen price basis is the Rates
// QuotePrice total rather than the caller's assertion (ADR-0007,
// #632). Both calls forward the caller Bearer token and fail closed:
// when rates is unreachable or answers outside the envelope, the
// booking is refused with UPSTREAM_UNAVAILABLE instead of risking a
// violation or freezing an unverified price.
package pricing

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

// maxQuoteReplyBytes bounds the quote reply this client reads. The
// contract's reply is one night list plus two scalars, so one mebibyte
// is generous and keeps a misbehaving upstream from streaming without
// end.
const maxQuoteReplyBytes = 1 << 20

// QuotePrice re-derives what the stay costs from the module that owns
// prices (ADR-0007, #632): POST /v1/rates/QuotePrice for the effective
// room type, dates, and discount, with the caller Bearer token
// forwarded. It returns the quoted total and the discount name Pricing
// applied, which are the values a booking freezes. A definitive Rates
// 4xx refusal is returned unchanged (no rate price, no rate plan,
// unknown discount, ambiguous plan set), so the booking keeps the terms
// the desk's own quote step reports; anything else — transport failure,
// timeout, 5xx, an unparseable body, or a reply missing the consumed
// fields — fails closed with UPSTREAM_UNAVAILABLE naming the upstream
// and the operation. bearerToken is the full caller "Bearer ..."
// Authorization header value.
func (c *Client) QuotePrice(roomTypeID, arrivalDate, departureDate string, discountName *string, bearerToken string) (int64, *string, *store.OpError) {
	payload := map[string]any{
		"roomTypeId":    roomTypeID,
		"arrivalDate":   arrivalDate,
		"departureDate": departureDate,
	}
	if discountName != nil {
		payload["discountName"] = *discountName
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return 0, nil, quoteUnavailable()
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/v1/rates/QuotePrice", bytes.NewReader(body))
	if err != nil {
		return 0, nil, quoteUnavailable()
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(bearerToken) != "" {
		req.Header.Set("Authorization", bearerToken)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return 0, nil, quoteUnavailable()
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return parseQuote(resp.Body)
	}
	if resp.StatusCode >= 400 && resp.StatusCode < 500 {
		return 0, nil, quoteRefusal(resp)
	}
	return 0, nil, quoteUnavailable()
}

// quoteReply names only the two consumed fields as raw tokens so a
// quoted number, a null, or an absent total is refused instead of
// coerced. The discount may legitimately be null (no discount
// applied), so only the total carries a presence check.
type quoteReply struct {
	TotalMinor   *json.RawMessage `json:"totalMinor"`
	DiscountName *string          `json:"discountName"`
}

// parseQuote validates the consumed fields: totalMinor must be a JSON
// integer and at least zero. A reply without them is unreadable, never
// a zero-total booking.
func parseQuote(body io.Reader) (int64, *string, *store.OpError) {
	decoder := json.NewDecoder(io.LimitReader(body, maxQuoteReplyBytes))
	var reply quoteReply
	if err := decoder.Decode(&reply); err != nil {
		return 0, nil, quoteUnavailable()
	}
	if reply.TotalMinor == nil {
		return 0, nil, quoteUnavailable()
	}
	total, err := strconv.ParseInt(strings.TrimSpace(string(*reply.TotalMinor)), 10, 64)
	if err != nil || total < 0 {
		return 0, nil, quoteUnavailable()
	}
	discount := reply.DiscountName
	if discount != nil {
		trimmed := strings.TrimSpace(*discount)
		if trimmed == "" {
			discount = nil
		} else {
			discount = &trimmed
		}
	}
	return total, discount, nil
}

// quoteRefusal surfaces a Rates 4xx envelope unchanged. An unparseable
// or codeless refusal is unreadable and fails closed.
func quoteRefusal(resp *http.Response) *store.OpError {
	var envelope struct {
		Code    string         `json:"code"`
		Message string         `json:"message"`
		Details map[string]any `json:"details"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxQuoteReplyBytes)).Decode(&envelope); err != nil || strings.TrimSpace(envelope.Code) == "" {
		return quoteUnavailable()
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

// quoteUnavailable fails a booking closed when the price itself cannot
// be trusted.
func quoteUnavailable() *store.OpError {
	return &store.OpError{
		Code:    "UPSTREAM_UNAVAILABLE",
		Status:  http.StatusServiceUnavailable,
		Message: messages.Text("error.upstream.price_unavailable", nil),
		Details: map[string]any{"upstream": "rates", "operation": "QuotePrice"},
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
