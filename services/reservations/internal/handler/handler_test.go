package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/service"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

const deskToken = "Bearer skeleton-test-token"

func newMux() *http.ServeMux {
	st := store.New()
	svc := service.New(st)
	// The shared desk-loop paths below book without a stubbed rates
	// server, so wire the pass-through explicitly: a nil hook fails
	// closed and would refuse every booking here.
	svc.CheckRestrictionsHook = func(_, _, _, _ string) *store.OpError { return nil }
	return NewMux(svc, st)
}

func post(t *testing.T, mux http.Handler, path string, body map[string]any, token string) (int, map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	var decoded map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	return rec.Code, decoded
}

func loopBody(key string) map[string]any {
	return map[string]any{
		"roomTypeId":     "deluxe-type",
		"arrivalDate":    "2026-11-01",
		"departureDate":  "2026-11-03",
		"guest":          map[string]any{"guestId": "guest-1", "fullName": "An Nguyen"},
		"sellableUnits":  1,
		"priceBasis":     map[string]any{"totalMinor": 24000},
		"idempotencyKey": key,
		"actor":          "front-desk",
	}
}

func TestDeskLoopBookThenOverbookingRefused(t *testing.T) {
	mux := newMux()
	code, created := post(t, mux, "/v1/reservations/CreateReservation", loopBody("desk-loop-1"), deskToken)
	if code != http.StatusOK {
		t.Fatalf("CreateReservation status = %d (%v)", code, created)
	}
	if created["state"] != "confirmed" || created["quotedTotal"] != float64(24000) {
		t.Fatalf("created = %v, want confirmed with quoted total", created)
	}
	ref, _ := created["reservationRef"].(string)
	if ref == "" {
		t.Fatal("created reservation has no reference")
	}

	code, conflict := post(t, mux, "/v1/reservations/CreateReservation", loopBody("desk-loop-2"), deskToken)
	if code != http.StatusConflict || conflict["code"] != "CONFLICT" {
		t.Fatalf("overbooking = %d %v, want 409 CONFLICT", code, conflict)
	}

	code, fetched := post(t, mux, "/v1/reservations/GetReservation", map[string]any{"reservationRef": ref}, deskToken)
	if code != http.StatusOK || fetched["state"] != "confirmed" {
		t.Fatalf("GetReservation = %d %v, want the confirmed booking", code, fetched)
	}

	code, calendar := post(t, mux, "/v1/reservations/QueryCalendar", map[string]any{"dateFrom": "2026-11-01", "dateTo": "2026-11-03", "roomTypeId": "deluxe-type"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QueryCalendar status = %d", code)
	}
	entries, _ := calendar["reservations"].([]any)
	if len(entries) != 1 {
		t.Fatalf("calendar holds %d entries, want 1", len(entries))
	}
}

func TestRequiresSessionToken(t *testing.T) {
	mux := newMux()
	code, body := post(t, mux, "/v1/reservations/CreateReservation", loopBody("desk-loop-1"), "")
	if code != http.StatusUnauthorized || body["code"] != "UNAUTHENTICATED" {
		t.Fatalf("missing token = %d %v, want 401 UNAUTHENTICATED", code, body)
	}
}

// TestWalkInSameDayBookingConfirmedAndOnArrivals covers FR-RES-4: a
// guest arriving without a reservation is booked with today as the
// arrival date, lands in the confirmed state ready for immediate
// check-in, and appears on today's arrivals list (QueryCalendar over
// the business date). Dates derive from the clock, never fixtures.
func TestWalkInSameDayBookingConfirmedAndOnArrivals(t *testing.T) {
	mux := newMux()
	today := time.Now().UTC().Format("2006-01-02")
	tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	departure := time.Now().UTC().AddDate(0, 0, 2).Format("2006-01-02")

	body := loopBody("walk-in-1")
	body["arrivalDate"] = today
	body["departureDate"] = departure
	code, created := post(t, mux, "/v1/reservations/CreateReservation", body, deskToken)
	if code != http.StatusOK {
		t.Fatalf("walk-in CreateReservation status = %d (%v)", code, created)
	}
	if created["state"] != "confirmed" {
		t.Fatalf("walk-in = %v, want confirmed state", created)
	}
	ref, _ := created["reservationRef"].(string)
	if ref == "" {
		t.Fatal("walk-in reservation has no reference")
	}

	code, fetched := post(t, mux, "/v1/reservations/GetReservation", map[string]any{"reservationRef": ref}, deskToken)
	if code != http.StatusOK || fetched["arrivalDate"] != today {
		t.Fatalf("walk-in GetReservation = %d %v, want arrival today", code, fetched)
	}

	code, checked := post(t, mux, "/v1/reservations/CheckInReservation", map[string]any{"reservationRef": ref, "stayId": "stay-walk-in-1", "actor": "front-desk"}, deskToken)
	if code != http.StatusOK || checked["state"] != "checked-in" {
		t.Fatalf("walk-in CheckInReservation = %d %v, want checked-in", code, checked)
	}

	code, calendar := post(t, mux, "/v1/reservations/QueryCalendar", map[string]any{"dateFrom": today, "dateTo": tomorrow}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QueryCalendar status = %d", code)
	}
	entries, _ := calendar["reservations"].([]any)
	found := false
	for _, raw := range entries {
		if entry, _ := raw.(map[string]any); entry["reservationRef"] == ref {
			found = true
		}
	}
	if !found {
		t.Fatalf("today's arrivals hold %d entries, want the walk-in %s", len(entries), ref)
	}
}

func modifyBody(ref string, key string) map[string]any {
	return map[string]any{
		"reservationRef": ref,
		"arrivalDate":    "2026-11-02",
		"departureDate":  "2026-11-04",
		"roomTypeId":     "deluxe-type",
		"sellableUnits":  2,
		"priceBasis":     map[string]any{"totalMinor": 26000},
		"idempotencyKey": key,
		"actor":          "front-desk",
	}
}

// TestDeskLifecycleModifyCancelNoShowCalendar walks the full
// desk-usable lifecycle on one host: book, modify with reprice,
// cancel with reason and rebook the released dates, mark a
// past-arrival booking no-show, and read the seeded calendar with a
// GetReservation drill-down for reference, guest, and price.
func TestDeskLifecycleModifyCancelNoShowCalendar(t *testing.T) {
	mux := newMux()

	code, created := post(t, mux, "/v1/reservations/CreateReservation", loopBody("lifecycle-1"), deskToken)
	if code != http.StatusOK {
		t.Fatalf("CreateReservation status = %d (%v)", code, created)
	}
	ref, _ := created["reservationRef"].(string)

	code, modified := post(t, mux, "/v1/reservations/ModifyReservation", modifyBody(ref, "lifecycle-modify-1"), deskToken)
	if code != http.StatusOK || modified["recalculatedTotal"] != float64(26000) {
		t.Fatalf("ModifyReservation = %d %v, want repriced 26000", code, modified)
	}

	code, missing := post(t, mux, "/v1/reservations/CancelReservation", map[string]any{"reservationRef": ref}, deskToken)
	if code != http.StatusBadRequest || missing["code"] != "VALIDATION_FAILED" {
		t.Fatalf("CancelReservation without reason = %d %v, want 400 VALIDATION_FAILED", code, missing)
	}

	code, cancelled := post(t, mux, "/v1/reservations/CancelReservation", map[string]any{"reservationRef": ref, "reason": "guest-request", "actor": "front-desk", "idempotencyKey": "lifecycle-cancel-1"}, deskToken)
	if code != http.StatusOK || cancelled["state"] != "cancelled" || cancelled["cancelReason"] != "guest-request" {
		t.Fatalf("CancelReservation = %d %v, want cancelled with kept reason", code, cancelled)
	}

	code, repeat := post(t, mux, "/v1/reservations/ModifyReservation", modifyBody(ref, "lifecycle-modify-2"), deskToken)
	if code != 422 || repeat["code"] != "STATE_ILLEGAL" {
		t.Fatalf("ModifyReservation cancelled = %d %v, want 422 STATE_ILLEGAL", code, repeat)
	}

	rebook := loopBody("lifecycle-2")
	// The too-early refusal below depends on the wall clock: rebook
	// a future stay so the arrival still reads as not started. Dates
	// derive from the clock, never fixtures.
	rebook["arrivalDate"] = time.Now().UTC().AddDate(0, 0, 1).Format("2006-01-02")
	rebook["departureDate"] = time.Now().UTC().AddDate(0, 0, 3).Format("2006-01-02")
	code, rebooked := post(t, mux, "/v1/reservations/CreateReservation", rebook, deskToken)
	if code != http.StatusOK {
		t.Fatalf("rebooking released dates = %d (%v), want 200", code, rebooked)
	}

	past := loopBody("lifecycle-3")
	past["arrivalDate"] = "2020-01-01"
	past["departureDate"] = "2020-01-03"
	code, pastCreated := post(t, mux, "/v1/reservations/CreateReservation", past, deskToken)
	if code != http.StatusOK {
		t.Fatalf("past CreateReservation status = %d (%v)", code, pastCreated)
	}
	pastRef, _ := pastCreated["reservationRef"].(string)

	rebookedRef, _ := rebooked["reservationRef"].(string)
	code, tooEarly := post(t, mux, "/v1/reservations/MarkNoShow", map[string]any{"reservationRef": rebookedRef, "reason": "no-arrival"}, deskToken)
	if code != 422 || tooEarly["code"] != "STATE_ILLEGAL" {
		t.Fatalf("MarkNoShow arrival-not-passed = %d %v, want 422 STATE_ILLEGAL", code, tooEarly)
	}

	code, marked := post(t, mux, "/v1/reservations/MarkNoShow", map[string]any{"reservationRef": pastRef, "reason": "no-arrival", "actor": "night-audit"}, deskToken)
	if code != http.StatusOK || marked["state"] != "no-show" || marked["noShowReason"] != "no-arrival" {
		t.Fatalf("MarkNoShow = %d %v, want no-show with kept reason", code, marked)
	}

	code, calendar := post(t, mux, "/v1/reservations/QueryCalendar", map[string]any{"dateFrom": "2020-01-01", "dateTo": time.Now().UTC().AddDate(0, 0, 4).Format("2006-01-02")}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QueryCalendar status = %d", code)
	}
	entries, _ := calendar["reservations"].([]any)
	if len(entries) != 3 {
		t.Fatalf("calendar holds %d entries, want 3 (cancelled + rebooked + no-show)", len(entries))
	}
	seen := map[string]bool{}
	for _, raw := range entries {
		entry, _ := raw.(map[string]any)
		state, _ := entry["state"].(string)
		seen[state] = true
		entryRef, _ := entry["reservationRef"].(string)
		code, detail := post(t, mux, "/v1/reservations/GetReservation", map[string]any{"reservationRef": entryRef}, deskToken)
		if code != http.StatusOK {
			t.Fatalf("GetReservation %s status = %d", entryRef, code)
		}
		if detail["reservationRef"] != entryRef || detail["guest"] == nil || detail["priceBasis"] == nil {
			t.Fatalf("GetReservation %s = %v, want reference, guest, and price", entryRef, detail)
		}
	}
	for _, want := range []string{"cancelled", "confirmed", "no-show"} {
		if !seen[want] {
			t.Fatalf("calendar states = %v, want cancelled, confirmed, and no-show", seen)
		}
	}
}

// TestDeskCheckOutReservationCompletesBooking is the handler half of
// DR1/DR2/DR3/DR4/DR10 (#646): the close completion endpoint flips the
// linked booking to closed once, keeps it in history, releases the
// sellable unit for a same-day rebooking, and refuses wrong states,
// unknown stays, blank fields, and a missing session token without
// writing anything.
func TestDeskCheckOutReservationCompletesBooking(t *testing.T) {
	mux := newMux()
	code, created := post(t, mux, "/v1/reservations/CreateReservation", loopBody("complete-1"), deskToken)
	if code != http.StatusOK {
		t.Fatalf("CreateReservation status = %d (%v)", code, created)
	}
	ref, _ := created["reservationRef"].(string)
	code, checked := post(t, mux, "/v1/reservations/CheckInReservation", map[string]any{"reservationRef": ref, "stayId": "stay-1", "actor": "front-desk"}, deskToken)
	if code != http.StatusOK || checked["state"] != "checked-in" {
		t.Fatalf("CheckInReservation = %d %v, want checked-in", code, checked)
	}

	// The in-house booking still consumes the unit: the negative
	// control that proves the release comes from the state flip.
	code, blocked := post(t, mux, "/v1/reservations/CreateReservation", loopBody("complete-2"), deskToken)
	if code != http.StatusConflict || blocked["code"] != "CONFLICT" {
		t.Fatalf("same-day booking beside the in-house guest = %d %v, want 409 CONFLICT", code, blocked)
	}

	code, completed := post(t, mux, "/v1/reservations/CheckOutReservation", map[string]any{"stayId": "stay-1", "actor": "front-desk"}, deskToken)
	if code != http.StatusOK || completed["state"] != "closed" || completed["reservationRef"] != ref || completed["stayId"] != "stay-1" {
		t.Fatalf("CheckOutReservation = %d %v, want closed with the stay link kept", code, completed)
	}
	code, replay := post(t, mux, "/v1/reservations/CheckOutReservation", map[string]any{"stayId": "stay-1", "actor": "front-desk"}, deskToken)
	if code != http.StatusOK || replay["state"] != "closed" {
		t.Fatalf("replayed completion = %d %v, want the same closed booking", code, replay)
	}

	code, fetched := post(t, mux, "/v1/reservations/GetReservation", map[string]any{"reservationRef": ref}, deskToken)
	if code != http.StatusOK || fetched["state"] != "closed" {
		t.Fatalf("GetReservation = %d %v, want closed", code, fetched)
	}
	code, calendar := post(t, mux, "/v1/reservations/QueryCalendar", map[string]any{"dateFrom": "2026-11-01", "dateTo": "2026-11-03", "roomTypeId": "deluxe-type"}, deskToken)
	if code != http.StatusOK {
		t.Fatalf("QueryCalendar status = %d", code)
	}
	entries, _ := calendar["reservations"].([]any)
	if len(entries) != 1 {
		t.Fatalf("calendar holds %d entries, want the completed booking kept in history", len(entries))
	}
	entry, _ := entries[0].(map[string]any)
	if entry["state"] != "closed" || entry["reservationRef"] != ref {
		t.Fatalf("calendar row = %v, want the closed booking", entry)
	}

	code, rebooked := post(t, mux, "/v1/reservations/CreateReservation", loopBody("complete-3"), deskToken)
	if code != http.StatusOK || rebooked["state"] != "confirmed" {
		t.Fatalf("same-day rebooking after the close = %d %v, want confirmed", code, rebooked)
	}

	for name, body := range map[string]map[string]any{
		"check-in": {"reservationRef": ref, "stayId": "stay-2"},
		"modify":   {"reservationRef": ref, "arrivalDate": "2026-11-02", "departureDate": "2026-11-04", "sellableUnits": 2, "priceBasis": map[string]any{"totalMinor": 26000}},
		"cancel":   {"reservationRef": ref, "reason": "guest-request"},
		"no-show":  {"reservationRef": ref, "reason": "no-arrival"},
	} {
		path := map[string]string{
			"check-in": "/v1/reservations/CheckInReservation",
			"modify":   "/v1/reservations/ModifyReservation",
			"cancel":   "/v1/reservations/CancelReservation",
			"no-show":  "/v1/reservations/MarkNoShow",
		}[name]
		code, refused := post(t, mux, path, body, deskToken)
		if code != 422 || refused["code"] != "STATE_ILLEGAL" {
			t.Fatalf("%s on a completed booking = %d %v, want 422 STATE_ILLEGAL", name, code, refused)
		}
	}

	code, unknown := post(t, mux, "/v1/reservations/CheckOutReservation", map[string]any{"stayId": "stay-unknown", "actor": "front-desk"}, deskToken)
	if code != http.StatusNotFound || unknown["code"] != "NOT_FOUND" {
		t.Fatalf("unknown stay completion = %d %v, want 404 NOT_FOUND", code, unknown)
	}
	for _, field := range []string{"stayId", "actor"} {
		body := map[string]any{"stayId": "stay-1", "actor": "front-desk"}
		delete(body, field)
		code, blank := post(t, mux, "/v1/reservations/CheckOutReservation", body, deskToken)
		if code != http.StatusBadRequest || blank["code"] != "VALIDATION_FAILED" || blank["details"].(map[string]any)["field"] != field {
			t.Fatalf("completion without %s = %d %v, want 400 naming the field", field, code, blank)
		}
	}
	code, unauth := post(t, mux, "/v1/reservations/CheckOutReservation", map[string]any{"stayId": "stay-1", "actor": "front-desk"}, "")
	if code != http.StatusUnauthorized || unauth["code"] != "UNAUTHENTICATED" {
		t.Fatalf("completion without token = %d %v, want 401 UNAUTHENTICATED", code, unauth)
	}
}

// TestEarlyDepartureUnblocksSameDayBooking is the handler half of
// DR6 (#646): a same-day booking already on file is refused while the
// early-departing guest is in house and accepted after the completion.
func TestEarlyDepartureUnblocksSameDayBooking(t *testing.T) {
	mux := newMux()
	early := loopBody("early-1")
	early["arrivalDate"] = "2026-11-01"
	early["departureDate"] = "2026-11-05"
	code, created := post(t, mux, "/v1/reservations/CreateReservation", early, deskToken)
	if code != http.StatusOK {
		t.Fatalf("CreateReservation status = %d (%v)", code, created)
	}
	ref, _ := created["reservationRef"].(string)
	if code, _ := post(t, mux, "/v1/reservations/CheckInReservation", map[string]any{"reservationRef": ref, "stayId": "stay-early", "actor": "front-desk"}, deskToken); code != http.StatusOK {
		t.Fatalf("CheckInReservation status = %d", code)
	}
	next := loopBody("early-2")
	next["arrivalDate"] = "2026-11-03"
	next["departureDate"] = "2026-11-06"
	code, blocked := post(t, mux, "/v1/reservations/CreateReservation", next, deskToken)
	if code != http.StatusConflict {
		t.Fatalf("same-type booking beside the in-house guest = %d (%v), want 409", code, blocked)
	}
	if code, completed := post(t, mux, "/v1/reservations/CheckOutReservation", map[string]any{"stayId": "stay-early", "actor": "front-desk"}, deskToken); code != http.StatusOK || completed["state"] != "closed" {
		t.Fatalf("early completion = %d %v, want closed", code, completed)
	}
	code, rebooked := post(t, mux, "/v1/reservations/CreateReservation", next, deskToken)
	if code != http.StatusOK {
		t.Fatalf("early departure still blocks the same-day booking = %d (%v)", code, rebooked)
	}
}
