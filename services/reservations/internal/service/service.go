// Package service implements the CreateReservation step order
// (LLD section 1): validate token and role at the handler, then
// load hotel values, consult the rates stay-restriction check,
// check mandatory guest fields, and run the atomic overbooking
// guard in the store.
//
// The restriction check is a server-side call to Pricing
// CheckRestrictions (FR-RTE-4), the capacity read is a server-side
// call to Rooms CheckRoomTypeSellability (ADR-0006, issue #631), and
// the frozen price basis is a server-side Rates QuotePrice read
// (ADR-0007, issue #632): the three hooks below are wired at boot, all
// forward the caller Bearer token, and all fail closed when their
// upstream is unreachable. The desk still sends the sellableUnits and
// priceBasis search outputs, but both are advisory: sellableUnits never
// decides the ceiling and priceBasis.totalMinor is compared with the
// quote, never stored.
package service

import (
	"net/http"
	"strings"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/messages"
	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

const dateLayout = "2006-01-02"

// RestrictionCheck refuses a stay that violates a manager-set window.
// It returns nil when the stay passes. The pricing-backed
// implementation calls rates CheckRestrictions with the caller
// Bearer token and fails closed when rates is unreachable.
type RestrictionCheck func(roomTypeID, arrivalDate, departureDate, bearerToken string) *store.OpError

// AvailabilityCheck derives the sellable ceiling of one booking
// attempt from the module that owns the room inventory (Rooms,
// ADR-0006). It returns the ceiling the store guard counts against;
// an unreadable source returns UPSTREAM_UNAVAILABLE so the booking is
// refused fail-closed. The request's advisory sellableUnits never
// reaches it.
type AvailabilityCheck func(roomTypeID, arrivalDate, departureDate, bearerToken string) (int, *store.OpError)

// PriceQuote re-derives what the stay costs from the module that owns
// prices (Rates QuotePrice, ADR-0007). It returns the quoted total and
// the discount name Pricing applied — the two values a booking freezes
// — for the effective room type, dates, and discount, with the caller
// Bearer token forwarded. A definitive Rates refusal is returned
// unchanged; an unreadable source returns UPSTREAM_UNAVAILABLE so the
// booking is refused rather than frozen at an unverified total. The
// request's priceBasis.totalMinor never reaches it as an input.
type PriceQuote func(roomTypeID, arrivalDate, departureDate string, discountName *string, bearerToken string) (int64, *string, *store.OpError)

// Service validates booking attempts and runs the store guard.
// CheckRestrictionsHook must be wired at boot (main.go wires the
// pricing client). It is never optional: a nil hook fails closed
// with UPSTREAM_UNAVAILABLE so unwired construction can never
// silently allow a restricted stay.
type Service struct {
	store                 store.Repository
	RequiredGuestFields   []string
	CheckRestrictionsHook RestrictionCheck
	// AvailabilityHook must be wired at boot beside
	// CheckRestrictionsHook. It is never optional: a nil hook fails
	// closed with UPSTREAM_UNAVAILABLE so unwired construction can
	// never silently fall back to the request's number.
	AvailabilityHook AvailabilityCheck
	// QuotePriceHook must be wired at boot beside the other two hooks.
	// It is never optional: a nil hook fails closed with
	// UPSTREAM_UNAVAILABLE so an unwired service can never freeze a
	// caller-supplied total (ADR-0007 D4).
	QuotePriceHook PriceQuote
}

// New returns a Service over store.
func New(st store.Repository) *Service {
	return &Service{store: st, RequiredGuestFields: []string{"fullName"}}
}

// CreateRequest is one validated booking attempt. BearerToken is the
// full caller "Bearer ..." Authorization header value, forwarded to
// the stay-restriction, capacity, and quote reads. SellableUnits is the
// request's optional, advisory number (ADR-0006 D3): it is shape
// validated only and never decides the booking — the ceiling comes
// from AvailabilityHook. TotalMinor is the request's asserted total,
// also advisory (ADR-0007 D3): it is shape validated, compared with the
// QuotePrice read, and never stored; the quote's total is what the
// booking freezes.
type CreateRequest struct {
	RoomTypeID     string
	ArrivalDate    string
	DepartureDate  string
	Guest          map[string]any
	SellableUnits  *int
	TotalMinor     int64
	HasTotal       bool
	DiscountName   *string
	IdempotencyKey string
	// Actor is the recorded session actor; RequestActor is the body
	// actor as supplied, annotation only (BR-65, #643).
	Actor        string
	RequestActor string
	BearerToken  string
}

func validation(field, message string, details map[string]any) *store.OpError {
	if details == nil {
		details = map[string]any{"field": field}
	}
	return &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: message, Details: details}
}

// restrictionsUnavailable refuses the booking when the
// stay-restriction check itself cannot be trusted — including an
// unwired (nil) CheckRestrictionsHook — instead of silently
// allowing a restricted stay.
func restrictionsUnavailable() *store.OpError {
	return &store.OpError{
		Code:    "UPSTREAM_UNAVAILABLE",
		Status:  http.StatusServiceUnavailable,
		Message: messages.Text("error.upstream.restrictions_unavailable", nil),
		Details: map[string]any{"upstream": "rates", "operation": "CheckRestrictions"},
	}
}

// availabilityUnavailable refuses the booking when the capacity read
// itself cannot be trusted — including an unwired (nil)
// AvailabilityHook — instead of silently falling back to the request's
// number. Nothing is written because the read precedes the store call.
func availabilityUnavailable() *store.OpError {
	return &store.OpError{
		Code:    "UPSTREAM_UNAVAILABLE",
		Status:  http.StatusServiceUnavailable,
		Message: messages.Text("error.upstream.availability_unavailable", nil),
		Details: map[string]any{"upstream": "rooms", "operation": "CheckRoomTypeSellability"},
	}
}

// capacity reads the ceiling the guard compares against, failing
// closed when no hook is wired.
func (s *Service) capacity(roomTypeID, arrivalDate, departureDate, bearerToken string) (int, *store.OpError) {
	if s.AvailabilityHook == nil {
		return 0, availabilityUnavailable()
	}
	return s.AvailabilityHook(roomTypeID, arrivalDate, departureDate, bearerToken)
}

// priceUnavailable refuses a booking when the price itself cannot be
// trusted — including an unwired (nil) QuotePriceHook — instead of
// freezing an unverified total (ADR-0007 D4). Nothing is written
// because the read precedes the store call.
func priceUnavailable() *store.OpError {
	return &store.OpError{
		Code:    "UPSTREAM_UNAVAILABLE",
		Status:  http.StatusServiceUnavailable,
		Message: messages.Text("error.upstream.price_unavailable", nil),
		Details: map[string]any{"upstream": "rates", "operation": "QuotePrice"},
	}
}

// priceChanged refuses a booking whose asserted total disagrees with
// the quote (ADR-0007 D3). Both totals, the room type, and the dates
// travel in details so the caller can re-quote; nothing is stored.
func priceChanged(roomTypeID, arrivalDate, departureDate string, requestedTotalMinor, quotedTotalMinor int64) *store.OpError {
	return &store.OpError{
		Code:    "PRICE_CHANGED",
		Status:  http.StatusConflict,
		Message: messages.Text("error.price.changed", nil),
		Details: map[string]any{
			"roomTypeId":          roomTypeID,
			"arrivalDate":         arrivalDate,
			"departureDate":       departureDate,
			"requestedTotalMinor": requestedTotalMinor,
			"quotedTotalMinor":    quotedTotalMinor,
		},
	}
}

// quote reads the effective stay price from Pricing, failing closed
// when no hook is wired.
func (s *Service) quote(roomTypeID, arrivalDate, departureDate string, discountName *string, bearerToken string) (int64, *string, *store.OpError) {
	if s.QuotePriceHook == nil {
		return 0, nil, priceUnavailable()
	}
	return s.QuotePriceHook(roomTypeID, arrivalDate, departureDate, discountName, bearerToken)
}

// validateAdvisoryUnits shape-checks the optional, advisory
// sellableUnits field (ADR-0006 D3). A malformed value still fails
// loudly naming the field; a valid value changes no decision.
func validateAdvisoryUnits(units *int) *store.OpError {
	if units == nil || *units >= 0 {
		return nil
	}
	return validation("sellableUnits", messages.Text("error.validation.sellable_units", nil), map[string]any{"field": "sellableUnits"})
}

// Create runs one booking attempt through validation, the
// stay-restriction check, the capacity read, and the guard.
func (s *Service) Create(req CreateRequest) (*store.Reservation, *store.OpError) {
	if err := validateAdvisoryUnits(req.SellableUnits); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.RoomTypeID) == "" {
		return nil, validation("roomTypeId", messages.Text("error.validation.room_type_required", nil), nil)
	}
	arrival, err := time.Parse(dateLayout, req.ArrivalDate)
	if err != nil {
		return nil, validation("arrivalDate", messages.Text("error.validation.arrival_format", nil), nil)
	}
	departure, err := time.Parse(dateLayout, req.DepartureDate)
	if err != nil {
		return nil, validation("departureDate", messages.Text("error.validation.departure_format", nil), nil)
	}
	if !departure.After(arrival) {
		return nil, validation("departureDate", messages.Text("error.validation.departure_order", nil), nil)
	}
	if !req.HasTotal || req.TotalMinor < 0 {
		return nil, validation("priceBasis", messages.Text("error.validation.price_basis", nil), nil)
	}
	guestID, _ := req.Guest["guestId"].(string)
	if strings.TrimSpace(guestID) == "" {
		return nil, validation("guest.guestId", messages.Text("error.validation.guest_id_required", nil), map[string]any{"field": "guest.guestId"})
	}
	for _, field := range s.RequiredGuestFields {
		value, _ := req.Guest[field].(string)
		if strings.TrimSpace(value) == "" {
			return nil, validation("guest."+field, messages.Text("error.validation.guest_field_missing", map[string]string{"field": field}), map[string]any{"field": field})
		}
	}
	if s.CheckRestrictionsHook == nil {
		return nil, restrictionsUnavailable()
	}
	if oerr := s.CheckRestrictionsHook(req.RoomTypeID, req.ArrivalDate, req.DepartureDate, req.BearerToken); oerr != nil {
		return nil, oerr
	}
	roomTypeID := strings.TrimSpace(req.RoomTypeID)
	// A booking that already exists is returned at the total it was
	// stored with: the replay pre-read only decides whether Pricing is
	// asked (ADR-0007 D5). The store's own replay check inside the
	// guarded step still makes a concurrent double submit book once.
	if replay, oerr := s.store.Replay("CreateReservation", "", req.IdempotencyKey); oerr != nil {
		return nil, oerr
	} else if replay != nil {
		return replay, nil
	}
	ceiling, oerr := s.capacity(roomTypeID, req.ArrivalDate, req.DepartureDate, req.BearerToken)
	if oerr != nil {
		return nil, oerr
	}
	// The quote is read outside the guarded store step: a 5-second
	// Rates outage must never hold the booking mutex (ADR-0007 D2).
	quotedTotal, quotedDiscount, oerr := s.quote(roomTypeID, req.ArrivalDate, req.DepartureDate, req.DiscountName, req.BearerToken)
	if oerr != nil {
		return nil, oerr
	}
	if quotedTotal != req.TotalMinor {
		return nil, priceChanged(roomTypeID, req.ArrivalDate, req.DepartureDate, req.TotalMinor, quotedTotal)
	}
	return s.store.Create(store.CreateInput{
		RoomTypeID:    roomTypeID,
		ArrivalDate:   req.ArrivalDate,
		DepartureDate: req.DepartureDate,
		GuestID:       strings.TrimSpace(guestID),
		Guest:         req.Guest,
		Ceiling:       ceiling,
		TotalMinor:    quotedTotal,
		DiscountName:  quotedDiscount,
		Actor:         req.Actor,
		RequestActor:  req.RequestActor,
	}, req.IdempotencyKey)
}

// ModifyRequest is one repriced change to a confirmed reservation.
// Only the fields the desk changed are set; TotalMinor carries the
// fresh QuotePrice total for the new dates, type, and discount, so a
// missing total is a desk-step error, not a silent keep of the old price.
// BearerToken is the full caller "Bearer ..." Authorization header
// value, forwarded to the stay-restriction and capacity checks.
// SellableUnits is the request's optional, advisory number (ADR-0006
// D3): shape validated only, never a decision input.
type ModifyRequest struct {
	Ref            string
	ArrivalDate    string
	DepartureDate  string
	RoomTypeID     string
	Guest          map[string]any
	HasGuest       bool
	SellableUnits  *int
	TotalMinor     int64
	HasTotal       bool
	DiscountName   *string
	IdempotencyKey string
	Actor          string
	RequestActor   string
	BearerToken    string
}

// Modify validates one repriced change and runs the guarded store step.
func (s *Service) Modify(req ModifyRequest) (*store.Reservation, *store.OpError) {
	if err := validateAdvisoryUnits(req.SellableUnits); err != nil {
		return nil, err
	}
	if strings.TrimSpace(req.Ref) == "" {
		return nil, validation("reservationRef", messages.Text("error.validation.reservation_ref_required", nil), nil)
	}
	arrival := ""
	if strings.TrimSpace(req.ArrivalDate) != "" {
		if _, err := time.Parse(dateLayout, req.ArrivalDate); err != nil {
			return nil, validation("arrivalDate", messages.Text("error.validation.arrival_format", nil), nil)
		}
		arrival = req.ArrivalDate
	}
	departure := ""
	if strings.TrimSpace(req.DepartureDate) != "" {
		if _, err := time.Parse(dateLayout, req.DepartureDate); err != nil {
			return nil, validation("departureDate", messages.Text("error.validation.departure_format", nil), nil)
		}
		departure = req.DepartureDate
	}
	if arrival != "" && departure != "" {
		parsedArrival, _ := time.Parse(dateLayout, arrival)
		parsedDeparture, _ := time.Parse(dateLayout, departure)
		if !parsedDeparture.After(parsedArrival) {
			return nil, validation("departureDate", messages.Text("error.validation.departure_order", nil), nil)
		}
	}
	if !req.HasTotal || req.TotalMinor < 0 {
		return nil, validation("priceBasis", messages.Text("error.validation.price_basis", nil), nil)
	}
	guestID := ""
	var guest map[string]any
	if req.HasGuest {
		if req.Guest == nil {
			return nil, validation("guest", messages.Text("error.validation.guest_change_required", nil), nil)
		}
		guest = req.Guest
		value, ok := guest["guestId"].(string)
		if !ok || strings.TrimSpace(value) == "" {
			return nil, validation("guest.guestId", messages.Text("error.validation.guest_id_required", nil), map[string]any{"field": "guest.guestId"})
		}
		guestID = value
		for _, field := range s.RequiredGuestFields {
			fieldValue, _ := guest[field].(string)
			if strings.TrimSpace(fieldValue) == "" {
				return nil, validation("guest."+field, messages.Text("error.validation.guest_field_missing", map[string]string{"field": field}), map[string]any{"field": field})
			}
		}
	}
	current, oerr := s.store.Get(req.Ref)
	if oerr != nil {
		return nil, oerr
	}
	effectiveRoomType := strings.TrimSpace(req.RoomTypeID)
	if effectiveRoomType == "" {
		effectiveRoomType = current.RoomTypeID
	}
	effectiveArrival := arrival
	if effectiveArrival == "" {
		effectiveArrival = current.ArrivalDate
	}
	effectiveDeparture := departure
	if effectiveDeparture == "" {
		effectiveDeparture = current.DepartureDate
	}
	if s.CheckRestrictionsHook == nil {
		return nil, restrictionsUnavailable()
	}
	if oerr := s.CheckRestrictionsHook(effectiveRoomType, effectiveArrival, effectiveDeparture, req.BearerToken); oerr != nil {
		return nil, oerr
	}
	// A repeated change for a booking already stored returns the stored
	// row instead of being re-quoted (ADR-0007 D5).
	if replay, oerr := s.store.Replay("ModifyReservation", req.Ref, req.IdempotencyKey); oerr != nil {
		return nil, oerr
	} else if replay != nil {
		return replay, nil
	}
	ceiling, oerr := s.capacity(effectiveRoomType, effectiveArrival, effectiveDeparture, req.BearerToken)
	if oerr != nil {
		return nil, oerr
	}
	// The price basis asserts the whole new quote: an omitted or null
	// discountName means the new quote carries none (ADR-0007 D2).
	quotedTotal, quotedDiscount, oerr := s.quote(effectiveRoomType, effectiveArrival, effectiveDeparture, req.DiscountName, req.BearerToken)
	if oerr != nil {
		return nil, oerr
	}
	if quotedTotal != req.TotalMinor {
		return nil, priceChanged(effectiveRoomType, effectiveArrival, effectiveDeparture, req.TotalMinor, quotedTotal)
	}
	return s.store.Modify(store.ModifyInput{
		Ref:           strings.TrimSpace(req.Ref),
		ArrivalDate:   arrival,
		DepartureDate: departure,
		RoomTypeID:    strings.TrimSpace(req.RoomTypeID),
		GuestID:       strings.TrimSpace(guestID),
		Guest:         guest,
		Ceiling:       ceiling,
		TotalMinor:    quotedTotal,
		DiscountName:  quotedDiscount,
		Actor:         req.Actor,
		RequestActor:  req.RequestActor,
	}, req.IdempotencyKey)
}

// CancelRequest cancels a confirmed reservation with the hotel kept reason.
type CancelRequest struct {
	Ref            string
	Reason         string
	Actor          string
	RequestActor   string
	IdempotencyKey string
}

// Cancel validates the reason and runs the guarded store step. Reason
// membership in the hotel own list is enforced wherever the hotel
// config list is available; until that slice, a non-empty reason is
// required and kept verbatim (BR-7 baseline).
func (s *Service) Cancel(req CancelRequest) (*store.Reservation, *store.OpError) {
	if strings.TrimSpace(req.Ref) == "" {
		return nil, validation("reservationRef", messages.Text("error.validation.reservation_ref_required", nil), nil)
	}
	if strings.TrimSpace(req.Reason) == "" {
		return nil, validation("reason", messages.Text("error.validation.cancel_reason_required", nil), map[string]any{"field": "reason"})
	}
	return s.store.Cancel(strings.TrimSpace(req.Ref), strings.TrimSpace(req.Reason), req.Actor, req.RequestActor, req.IdempotencyKey)
}

// MarkNoShowRequest marks an unarrived past-arrival reservation no-show.
type MarkNoShowRequest struct {
	Ref          string
	Reason       string
	Actor        string
	RequestActor string
}

// MarkNoShow validates the reason and runs the guarded store step,
// which additionally refuses arrivals that have not passed yet.
func (s *Service) MarkNoShow(req MarkNoShowRequest) (*store.Reservation, *store.OpError) {
	if strings.TrimSpace(req.Ref) == "" {
		return nil, validation("reservationRef", messages.Text("error.validation.reservation_ref_required", nil), nil)
	}
	if strings.TrimSpace(req.Reason) == "" {
		return nil, validation("reason", messages.Text("error.validation.noshow_reason_required", nil), map[string]any{"field": "reason"})
	}
	return s.store.MarkNoShow(strings.TrimSpace(req.Ref), strings.TrimSpace(req.Reason), req.Actor, req.RequestActor)
}
