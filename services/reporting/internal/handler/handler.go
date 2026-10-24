// Package handler exposes ReportingService read operations as
// HTTP/JSON routes (POST /v1/reporting/<Operation>) with the shared
// error envelope (LLD section 7, FR-RPT-1..4). Reads never block on
// the event feed: a lagging rebuild shows through the as-of
// timestamp, never by refusing the desk. Skeleton identity check:
// every /v1/* call must carry a Bearer session token; local HMAC
// validation with bounded revalidation lands with the identity
// hardening slice.
package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/store"
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

// NewMux routes the ReportingService read operations onto svc.
func NewMux(svc *service.Service) *http.ServeMux {
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

	mux.HandleFunc("POST /v1/reporting/OccupancyReport", authed(func(w http.ResponseWriter, body map[string]any) {
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
		rows, asOf, oerr := svc.OccupancyReport(from, to)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		nights := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			nights = append(nights, map[string]any{
				"nightDate": row.NightDate, "roomTypeId": row.RoomType,
				"occupied": row.Occupied, "available": row.Available,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"dateFrom": from, "dateTo": to, "nights": nights, "asOf": asOf.UTC().Format("2006-01-02T15:04:05Z07:00")})
	}))

	mux.HandleFunc("POST /v1/reporting/RevenueSummary", authed(func(w http.ResponseWriter, body map[string]any) {
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
		rows, asOf, oerr := svc.RevenueSummary(from, to)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		days := make([]map[string]any, 0, len(rows))
		for _, row := range rows {
			days = append(days, map[string]any{
				"businessDate": row.BusinessDate,
				"roomRevenue":  row.RoomRevenue, "extraRevenue": row.ExtraRevenue,
			})
		}
		writeJSON(w, http.StatusOK, map[string]any{"dateFrom": from, "dateTo": to, "days": days, "asOf": asOf.UTC().Format("2006-01-02T15:04:05Z07:00")})
	}))

	mux.HandleFunc("POST /v1/reporting/DailySheet", authed(func(w http.ResponseWriter, body map[string]any) {
		day, ok := strField(body, "businessDate")
		if !ok {
			writeOpError(w, &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: messages.Text("reporting.validation.business_date_required", nil), Details: map[string]any{"field": "businessDate"}})
			return
		}
		sheet, oerr := svc.DailySheet(day)
		if oerr != nil {
			writeOpError(w, oerr)
			return
		}
		encode := func(entries []store.SheetEntry) []map[string]any {
			out := make([]map[string]any, 0, len(entries))
			for _, entry := range entries {
				out = append(out, map[string]any{"kind": entry.Kind, "ref": entry.Ref})
			}
			return out
		}
		balances := make([]map[string]any, 0, len(sheet.OpenBalances))
		for _, balance := range sheet.OpenBalances {
			balances = append(balances, map[string]any{"folioId": balance.FolioID, "balanceMinor": balance.BalanceMinor})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"businessDate": day,
			"arrivals":     encode(sheet.Arrivals), "inHouse": encode(sheet.InHouse),
			"departures": encode(sheet.Departures), "openBalances": balances,
			"asOf": sheet.AsOf.UTC().Format("2006-01-02T15:04:05Z07:00"),
		})
	}))

	mux.HandleFunc("POST /v1/reporting/HousekeepingReport", authed(func(w http.ResponseWriter, body map[string]any) {
		rooms, asOf := svc.HousekeepingReport()
		listed := make([]map[string]any, 0, len(rooms))
		for _, room := range rooms {
			listed = append(listed, map[string]any{"roomNumber": room.Room, "state": room.State})
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"rooms": listed,
			"asOf":  asOf.UTC().Format("2006-01-02T15:04:05Z07:00"),
		})
	}))

	return mux
}
