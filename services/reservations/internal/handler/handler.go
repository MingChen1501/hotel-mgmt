// Package handler exposes ReservationService operations as
// HTTP/JSON routes (POST /v1/reservations/<Operation>) with the
// shared error envelope. Skeleton identity check: every /v1/* call
// must carry a Bearer session token; local HMAC validation with
// bounded revalidation lands with the identity hardening slice.
package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
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

func decodeBody(w http.ResponseWriter, r *http.Request) (map[string]any, bool) {
	var body map[string]any
	if r.Body == nil {
		return map[string]any{}, true
	}
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	if err := decoder.Decode(&body); err != nil {
		if err.Error() == "EOF" {
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

func optStr(body map[string]any, field string) *string {
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

// NewMux routes the ReservationService operations onto svc.
func NewMux(svc *service.Service, st store.Repository) *http.ServeMux {
	mux := http.NewServeMux()
	authed := func(handle func(http.ResponseWriter, map[string]any)) http.HandlerFunc {
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
			handle(w, body)
		}
	}

	mux.HandleFunc("POST /v1/reservations/CreateReservation", authed(func(w http.ResponseWriter, body map[string]any) {
		roomTypeID, _ := strField(body, "roomTypeId")
		arrival, _ := strField(body, "arrivalDate")
		departure, _ := strField(body, "departureDate")
		guest, _ := body["guest"].(map[string]any)
		if guest == nil {
			guest = map[string]any{}
		}
		sellable, hasSellable := intField(body, "sellableUnits")
		price, hasPrice := nestedPrice(body)
		discount := nestedDiscount(body)
		key, _ := strField(body, "idempotencyKey")
		actor, _ := strField(body, "actor")
		if key == "" {
			if raw, ok := body["idempotencyKey"].(string); ok {
				key = raw
			}
		}
		record, oerr := svc.Create(service.CreateRequest{
			RoomTypeID:     roomTypeID,
			ArrivalDate:    arrival,
			DepartureDate:  departure,
			Guest:          guest,
			SellableUnits:  sellUnits(sellable, hasSellable),
			TotalMinor:     price,
			HasTotal:       hasPrice,
			DiscountName:   discount,
			IdempotencyKey: key,
			Actor:          actor,
		})
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"reservationId": record.ID, "reservationRef": record.Ref, "state": record.State, "quotedTotal": record.TotalMinor,
		})
	}))

	mux.HandleFunc("POST /v1/reservations/GetReservation", authed(func(w http.ResponseWriter, body map[string]any) {
		ref, ok := strField(body, "reservationRef")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.reservation_ref_required", nil), Details: map[string]any{"field": "reservationRef"}})
			return
		}
		record, oerr := st.Get(ref)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"reservationId": record.ID, "reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
			"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
			"guest":        record.Guest,
			"priceBasis":   map[string]any{"totalMinor": record.TotalMinor, "discountName": record.DiscountName},
			"state":        record.State,
			"cancelReason": strOrNull(record.CancelReason),
			"noShowReason": strOrNull(record.NoShowReason),
			"stayId":       stayOrNull(record.StayID),
		})
	}))

	mux.HandleFunc("POST /v1/reservations/CheckInReservation", authed(func(w http.ResponseWriter, body map[string]any) {
		ref, ok := strField(body, "reservationRef")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.reservation_ref_required", nil), Details: map[string]any{"field": "reservationRef"}})
			return
		}
		stayID, _ := strField(body, "stayId")
		if stayID == "" {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.stay_id_required", nil), Details: map[string]any{"field": "stayId"}})
			return
		}
		actor, _ := strField(body, "actor")
		record, oerr := st.CheckIn(ref, stayID, actor)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"reservationId": record.ID, "reservationRef": record.Ref,
			"state": record.State, "stayId": record.StayID,
		})
	}))

	mux.HandleFunc("POST /v1/reservations/ModifyReservation", authed(func(w http.ResponseWriter, body map[string]any) {
		ref, ok := strField(body, "reservationRef")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.reservation_ref_required", nil), Details: map[string]any{"field": "reservationRef"}})
			return
		}
		arrival, _ := body["arrivalDate"].(string)
		departure, _ := body["departureDate"].(string)
		roomTypeID, _ := strField(body, "roomTypeId")
		guest, hasGuest := body["guest"].(map[string]any)
		sellable, hasSellable := intField(body, "sellableUnits")
		price, hasPrice := nestedPrice(body)
		discount := nestedDiscount(body)
		key, _ := strField(body, "idempotencyKey")
		actor, _ := strField(body, "actor")
		record, oerr := svc.Modify(service.ModifyRequest{
			Ref:            ref,
			ArrivalDate:    strings.TrimSpace(arrival),
			DepartureDate:  strings.TrimSpace(departure),
			RoomTypeID:     roomTypeID,
			Guest:          guest,
			HasGuest:       hasGuest,
			SellableUnits:  sellUnits(sellable, hasSellable),
			TotalMinor:     price,
			HasTotal:       hasPrice,
			DiscountName:   discount,
			IdempotencyKey: key,
			Actor:          actor,
		})
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"reservationId": record.ID, "reservationRef": record.Ref, "state": record.State, "recalculatedTotal": record.TotalMinor,
		})
	}))

	mux.HandleFunc("POST /v1/reservations/CancelReservation", authed(func(w http.ResponseWriter, body map[string]any) {
		ref, ok := strField(body, "reservationRef")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.reservation_ref_required", nil), Details: map[string]any{"field": "reservationRef"}})
			return
		}
		reason, _ := strField(body, "reason")
		key, _ := strField(body, "idempotencyKey")
		actor, _ := strField(body, "actor")
		record, oerr := svc.Cancel(service.CancelRequest{Ref: ref, Reason: reason, Actor: actor, IdempotencyKey: key})
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"reservationId": record.ID, "reservationRef": record.Ref, "state": record.State,
			"cancelReason": strOrNull(record.CancelReason),
		})
	}))

	mux.HandleFunc("POST /v1/reservations/MarkNoShow", authed(func(w http.ResponseWriter, body map[string]any) {
		ref, ok := strField(body, "reservationRef")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.reservation_ref_required", nil), Details: map[string]any{"field": "reservationRef"}})
			return
		}
		reason, _ := strField(body, "reason")
		actor, _ := strField(body, "actor")
		record, oerr := svc.MarkNoShow(service.MarkNoShowRequest{Ref: ref, Reason: reason, Actor: actor})
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"reservationId": record.ID, "reservationRef": record.Ref, "state": record.State,
			"noShowReason": strOrNull(record.NoShowReason),
		})
	}))

	mux.HandleFunc("POST /v1/reservations/QueryCalendar", authed(func(w http.ResponseWriter, body map[string]any) {
		from, ok := strField(body, "dateFrom")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.date_from_required", nil), Details: map[string]any{"field": "dateFrom"}})
			return
		}
		to, ok := strField(body, "dateTo")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.date_to_required", nil), Details: map[string]any{"field": "dateTo"}})
			return
		}
		if _, err := time.Parse("2006-01-02", from); err != nil {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.date_from_format", nil), Details: map[string]any{"field": "dateFrom"}})
			return
		}
		if _, err := time.Parse("2006-01-02", to); err != nil {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.date_to_format", nil), Details: map[string]any{"field": "dateTo"}})
			return
		}
		if to < from {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("error.validation.date_range_order", nil), Details: map[string]any{"field": "dateTo"}})
			return
		}
		roomTypeID, _ := strField(body, "roomTypeId")
		entries := st.Query(from, to, roomTypeID)
		encoded := make([]map[string]any, 0, len(entries))
		for _, entry := range entries {
			encoded = append(encoded, map[string]any{
				"reservationRef": entry.Ref, "roomTypeId": entry.RoomTypeID,
				"arrivalDate": entry.ArrivalDate, "departureDate": entry.DepartureDate, "state": entry.State,
				"stayId": stayOrNull(entry.StayID),
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"dateFrom": from, "dateTo": to, "reservations": encoded})
	}))

	return mux
}

func nestedPrice(body map[string]any) (int64, bool) {
	price, _ := body["priceBasis"].(map[string]any)
	if price == nil {
		return 0, false
	}
	return intField(price, "totalMinor")
}

func nestedDiscount(body map[string]any) *string {
	price, _ := body["priceBasis"].(map[string]any)
	if price == nil {
		return optStr(body, "discountName")
	}
	if name, ok := price["discountName"].(string); ok && strings.TrimSpace(name) != "" {
		trimmed := strings.TrimSpace(name)
		return &trimmed
	}
	return optStr(body, "discountName")
}

func sellUnits(value int64, ok bool) int {
	if !ok {
		return 0
	}
	return int(value)
}

// strOrNull renders a nil kept reason as JSON null so callers can
// tell "no reason kept" apart from a recorded reason.
func strOrNull(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

// stayOrNull renders an empty stay link as JSON null so callers can
// tell "no stay yet" apart from a linked stay id.
func stayOrNull(stayID string) any {
	if stayID == "" {
		return nil
	}
	return stayID
}
