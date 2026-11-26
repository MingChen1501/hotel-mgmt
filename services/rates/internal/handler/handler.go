// Package handler exposes PricingService operations as HTTP/JSON
// routes (POST /v1/rates/<Operation>) with the shared error
// envelope. Skeleton identity check: every /v1/* call must carry a
// Bearer session token; local HMAC validation with bounded
// revalidation lands with the identity hardening slice.
package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/envelope"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/store"
)

func traceID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	return hex.EncodeToString(buf[:])
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeOpError(w http.ResponseWriter, oerr *store.OpError) {
	writeJSON(w, oerr.Status, map[string]any{
		"code":    oerr.Code,
		"message": oerr.Message,
		"details": oerr.Details,
		"traceId": traceID(),
	})
}

// maxBodyBytes is the one request-body ceiling this service declares
// (LLD section 29.1, NFR-BND-2): a code constant, never configuration.
// It is 18.6 times the largest request schema the contracts hold, so
// every desk payload sits far below it.
const maxBodyBytes = 65536

// writeTooLarge answers an over-ceiling body with the shared envelope
// (LLD section 29.2, AC-BND-1).
func writeTooLarge(w http.ResponseWriter) {
	writeJSON(w, http.StatusBadRequest, map[string]any{
		"code":    "VALIDATION_FAILED",
		"message": messages.Text("error.transport.body_too_large", nil),
		"details": map[string]any{"field": "body"},
		"traceId": traceID(),
	})
}

func decodeBody(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	if r.Body == nil {
		return map[string]any{}, true
	}
	// A declared content-length above the ceiling is refused before the
	// first chunk; the bounded reader refuses byte 65 537 of a body that
	// under-declares it and marks the connection to close (LLD 29.1).
	if r.ContentLength > int64(maxBodyBytes) {
		writeTooLarge(w)
		return nil, false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	var body map[string]any
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	err := decoder.Decode(&body)
	if err == nil {
		// Drain the bounded reader so a body that under-declares its
		// content-length cannot slip its surplus past the decoder.
		_, err = io.Copy(io.Discard, r.Body)
	}
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			writeTooLarge(w)
			return nil, false
		}
		if errors.Is(err, io.EOF) {
			return map[string]any{}, true
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"code":    "VALIDATION_FAILED",
			"message": messages.Text("error.transport.bad_json", nil),
			"details": map[string]any{},
			"traceId": traceID(),
		})
		return nil, false
	}
	if body == nil {
		return map[string]any{}, true
	}
	return body, true
}

func strField(body map[string]any, field string) (string, bool) {
	value, ok := body[field].(string)
	return value, ok && strings.TrimSpace(value) != ""
}

func optStrField(body map[string]any, field string) *string {
	value, ok := body[field].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(value)
	return &trimmed
}

func intField(body map[string]any, field string) (int64, bool) {
	raw, ok := body[field]
	if !ok {
		return 0, false
	}
	switch value := raw.(type) {
	case json.Number:
		parsed, err := value.Int64()
		return parsed, err == nil
	case float64:
		return int64(value), value == float64(int64(value))
	}
	return 0, false
}

// planTextRefusal refuses one rate-plan text field with the catalogue
// sentence carrying its declared bound (FR-RTE-10, BR-68, Refs #633).
func planTextRefusal(field string, max int) *store.OpError {
	return &store.OpError{
		Code:   "VALIDATION_FAILED",
		Status: 400,
		Message: messages.Text("rates.validation.text_length", map[string]string{
			"field": field,
			"max":   messages.Num(int64(max)),
		}),
		Details: map[string]any{"field": field},
	}
}

func planTextLengthRefusal(field string, length, max int) *store.OpError {
	if length <= max {
		return nil
	}
	return planTextRefusal(field, max)
}

// NewMux routes the PricingService operations onto store.
func NewMux(st store.Repository) *http.ServeMux {
	mux := http.NewServeMux()
	authed := func(operation string, handle func(http.ResponseWriter, map[string]any)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			header := strings.TrimSpace(r.Header.Get("Authorization"))
			if !strings.HasPrefix(header, "Bearer ") || strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")) == "" {
				writeJSON(w, http.StatusUnauthorized, map[string]any{
					"code":    "UNAUTHENTICATED",
					"message": messages.Text("error.auth.missing_token", nil),
					"details": map[string]any{},
					"traceId": traceID(),
				})
				return
			}
			body, ok := decodeBody(w, r)
			if !ok {
				return
			}
			_ = operation
			handle(w, body)
		}
	}

	mux.HandleFunc("POST /v1/rates/UpsertRatePlan", authed("UpsertRatePlan", func(w http.ResponseWriter, body map[string]any) {
		rawName, present := body["name"]
		if !present {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "name"}), Details: map[string]any{"field": "name"}})
			return
		}
		name, ok := rawName.(string)
		if !ok {
			// A present non-string name is refused the same way as an
			// over-bound one, not with the required-field sentence
			// (AC-RTE-10, LLD 37.1).
			writeOpError(w, planTextRefusal("name", store.MaxPlanNameRunes))
			return
		}
		if strings.TrimSpace(name) == "" {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "name"}), Details: map[string]any{"field": "name"}})
			return
		}
		if oerr := planTextLengthRefusal("name", len([]rune(name)), store.MaxPlanNameRunes); oerr != nil {
			writeOpError(w, oerr)
			return
		}
		description := ""
		if raw, present := body["description"]; present {
			value, ok := raw.(string)
			if !ok {
				// A present non-string description used to become the
				// empty string; it is refused instead (FR-RTE-10).
				writeOpError(w, planTextRefusal("description", store.MaxPlanDescriptionRunes))
				return
			}
			description = value
		}
		if oerr := planTextLengthRefusal("description", len([]rune(description)), store.MaxPlanDescriptionRunes); oerr != nil {
			writeOpError(w, oerr)
			return
		}
		var defaultUnits *int
		if raw, present := body["defaultUnits"]; present {
			parsed, ok := intField(body, "defaultUnits")
			if !ok || parsed < 0 {
				writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("rates.validation.default_units", nil), Details: map[string]any{"field": "defaultUnits"}})
				return
			}
			_ = raw
			value := int(parsed)
			defaultUnits = &value
		}
		plan, oerr := st.UpsertRatePlan(name, description, defaultUnits)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": plan.ID, "name": plan.Name, "description": plan.Description})
	}))

	mux.HandleFunc("POST /v1/rates/UpsertRatePrice", authed("UpsertRatePrice", func(w http.ResponseWriter, body map[string]any) {
		planName, ok := strField(body, "ratePlanName")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "ratePlanName"}), Details: map[string]any{"field": "ratePlanName"}})
			return
		}
		roomTypeID, ok := strField(body, "roomTypeId")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "roomTypeId"}), Details: map[string]any{"field": "roomTypeId"}})
			return
		}
		night, ok := strField(body, "nightDate")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "nightDate"}), Details: map[string]any{"field": "nightDate"}})
			return
		}
		price, ok := intField(body, "priceMinor")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "priceMinor"}), Details: map[string]any{"field": "priceMinor"}})
			return
		}
		record, oerr := st.UpsertRatePrice(planName, roomTypeID, night, price)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ratePlanName": record.RatePlanName, "roomTypeId": record.RoomTypeID, "nightDate": record.NightDate, "priceMinor": record.PriceMinor})
	}))

	mux.HandleFunc("POST /v1/rates/UpsertRestriction", authed("UpsertRestriction", func(w http.ResponseWriter, body map[string]any) {
		roomTypeID, ok := strField(body, "roomTypeId")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "roomTypeId"}), Details: map[string]any{"field": "roomTypeId"}})
			return
		}
		from, ok := strField(body, "dateFrom")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "dateFrom"}), Details: map[string]any{"field": "dateFrom"}})
			return
		}
		to, ok := strField(body, "dateTo")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "dateTo"}), Details: map[string]any{"field": "dateTo"}})
			return
		}
		var minStay *int
		if _, present := body["minStay"]; present {
			parsed, ok := intField(body, "minStay")
			if !ok || parsed < 1 {
				writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("rates.validation.min_stay", nil), Details: map[string]any{"field": "minStay"}})
				return
			}
			value := int(parsed)
			minStay = &value
		}
		closed := false
		if raw, present := body["closedToArrival"]; present {
			// A present flag must be a JSON boolean: "true", 1, "yes",
			// and null are refused, never coerced to false (FR-RTE-6).
			value, ok := raw.(bool)
			if !ok {
				writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.must_be_boolean", map[string]string{"field": "closedToArrival"}), Details: map[string]any{"field": "closedToArrival"}})
				return
			}
			closed = value
		}
		record, oerr := st.UpsertRestriction(roomTypeID, from, to, minStay, closed)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": record.ID, "roomTypeId": record.RoomTypeID, "dateFrom": record.DateFrom, "dateTo": record.DateTo, "minStay": record.MinStay, "closedToArrival": record.ClosedToArrival})
	}))

	mux.HandleFunc("POST /v1/rates/UpsertDiscount", authed("UpsertDiscount", func(w http.ResponseWriter, body map[string]any) {
		name, ok := strField(body, "name")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "name"}), Details: map[string]any{"field": "name"}})
			return
		}
		kind, ok := strField(body, "kind")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "kind"}), Details: map[string]any{"field": "kind"}})
			return
		}
		value, ok := intField(body, "valueMinor")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "valueMinor"}), Details: map[string]any{"field": "valueMinor"}})
			return
		}
		record, oerr := st.UpsertDiscount(name, kind, value)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": record.ID, "name": record.Name, "kind": record.Kind, "valueMinor": record.ValueMinor})
	}))

	mux.HandleFunc("POST /v1/rates/QuotePrice", authed("QuotePrice", func(w http.ResponseWriter, body map[string]any) {
		roomTypeID, ok := strField(body, "roomTypeId")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "roomTypeId"}), Details: map[string]any{"field": "roomTypeId"}})
			return
		}
		arrival, ok := strField(body, "arrivalDate")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "arrivalDate"}), Details: map[string]any{"field": "arrivalDate"}})
			return
		}
		departure, ok := strField(body, "departureDate")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "departureDate"}), Details: map[string]any{"field": "departureDate"}})
			return
		}
		quote, oerr := st.Quote(roomTypeID, arrival, departure, optStrField(body, "ratePlanName"), optStrField(body, "discountName"))
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		nights := make([]map[string]any, 0, len(quote.Nights))
		for _, night := range quote.Nights {
			nights = append(nights, map[string]any{"nightDate": night.NightDate, "priceMinor": night.PriceMinor})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"roomTypeId": quote.RoomTypeID, "arrivalDate": quote.ArrivalDate, "departureDate": quote.Departure,
			"nights": nights, "discountName": quote.Discount, "totalMinor": quote.TotalMinor,
		})
	}))

	mux.HandleFunc("POST /v1/rates/CheckSellableCount", authed("CheckSellableCount", func(w http.ResponseWriter, body map[string]any) {
		roomTypeID, ok := strField(body, "roomTypeId")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "roomTypeId"}), Details: map[string]any{"field": "roomTypeId"}})
			return
		}
		from, ok := strField(body, "dateFrom")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "dateFrom"}), Details: map[string]any{"field": "dateFrom"}})
			return
		}
		to, ok := strField(body, "dateTo")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "dateTo"}), Details: map[string]any{"field": "dateTo"}})
			return
		}
		if _, present := body["totalUnits"]; present {
			// The field stays accepted and shape-checked for contract
			// compatibility, but it never sets the count (FR-RTE-8).
			parsed, ok := intField(body, "totalUnits")
			if !ok || parsed < 0 {
				writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("rates.validation.total_units", nil), Details: map[string]any{"field": "totalUnits"}})
				return
			}
		}
		counts, oerr := st.CheckSellableCount(roomTypeID, from, to)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		encoded := make([]map[string]any, 0, len(counts))
		for _, count := range counts {
			encoded = append(encoded, map[string]any{"date": count.Date, "sellableCount": count.SellableCount})
		}
		writeJSON(w, http.StatusOK, map[string]any{"roomTypeId": roomTypeID, "counts": encoded})
	}))

	mux.HandleFunc("POST /v1/rates/CheckRestrictions", authed("CheckRestrictions", func(w http.ResponseWriter, body map[string]any) {
		roomTypeID, ok := strField(body, "roomTypeId")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "roomTypeId"}), Details: map[string]any{"field": "roomTypeId"}})
			return
		}
		arrival, ok := strField(body, "arrivalDate")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "arrivalDate"}), Details: map[string]any{"field": "arrivalDate"}})
			return
		}
		departure, ok := strField(body, "departureDate")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.field_required", map[string]string{"field": "departureDate"}), Details: map[string]any{"field": "departureDate"}})
			return
		}
		if oerr := st.CheckRestrictions(roomTypeID, arrival, departure); oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"roomTypeId": roomTypeID, "allowed": true})
	}))

	// An unknown operation under the mounted prefix answers the shared
	// envelope instead of the mux's plain-text 404 (Refs #628).
	mux.Handle("/", envelope.NotFound())

	return mux
}
