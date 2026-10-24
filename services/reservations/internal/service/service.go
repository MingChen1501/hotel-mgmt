// Package service implements the CreateReservation step order
// (LLD section 1): validate token and role at the handler, then
// load hotel values, enforce stay restrictions, check mandatory
// guest fields, and run the atomic overbooking guard in the store.
//
// Server-side outbound calls to Pricing CheckRestrictions and Rooms
// CheckRoomTypeSellability are the next slice: the restriction hook
// below is the seam they plug into, and the desk loop supplies the
// sellableUnits and priceBasis search outputs in the request until
// then.
package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/store"
)

const dateLayout = "2006-01-02"

// RestrictionCheck refuses a stay that violates a manager-set window.
// It returns nil when the stay passes. The pricing-backed
// implementation lands with the outbound-call slice.
type RestrictionCheck func(roomTypeID, arrivalDate, departureDate string) *store.OpError

// Service validates booking attempts and runs the store guard.
type Service struct {
	store                 store.Repository
	RequiredGuestFields   []string
	CheckRestrictionsHook RestrictionCheck
}

// New returns a Service over store.
func New(st store.Repository) *Service {
	return &Service{store: st, RequiredGuestFields: []string{"fullName"}}
}

// CreateRequest is one validated booking attempt.
type CreateRequest struct {
	RoomTypeID     string
	ArrivalDate    string
	DepartureDate  string
	Guest          map[string]any
	SellableUnits  int
	TotalMinor     int64
	HasTotal       bool
	DiscountName   *string
	IdempotencyKey string
	Actor          string
}

func validation(field, message string, details map[string]any) *store.OpError {
	if details == nil {
		details = map[string]any{"field": field}
	}
	return &store.OpError{Code: "VALIDATION_FAILED", Status: 400, Message: message, Details: details}
}

// Create runs one booking attempt through validation and the guard.
func (s *Service) Create(req CreateRequest) (*store.Reservation, *store.OpError) {
	if strings.TrimSpace(req.RoomTypeID) == "" {
		return nil, validation("roomTypeId", "roomTypeId is required.", nil)
	}
	arrival, err := time.Parse(dateLayout, req.ArrivalDate)
	if err != nil {
		return nil, validation("arrivalDate", "arrivalDate must be a YYYY-MM-DD date.", nil)
	}
	departure, err := time.Parse(dateLayout, req.DepartureDate)
	if err != nil {
		return nil, validation("departureDate", "departureDate must be a YYYY-MM-DD date.", nil)
	}
	if !departure.After(arrival) {
		return nil, validation("departureDate", "departureDate must be after arrivalDate.", nil)
	}
	if !req.HasTotal || req.TotalMinor < 0 {
		return nil, validation("priceBasis", "priceBasis.totalMinor is required and cannot be negative.", nil)
	}
	guestID, _ := req.Guest["guestId"].(string)
	if strings.TrimSpace(guestID) == "" {
		return nil, validation("guest.guestId", "guest.guestId is required.", map[string]any{"field": "guest.guestId"})
	}
	for _, field := range s.RequiredGuestFields {
		value, _ := req.Guest[field].(string)
		if strings.TrimSpace(value) == "" {
			return nil, validation("guest."+field, fmt.Sprintf("Missing hotel-mandatory guest field %s.", field), map[string]any{"field": field})
		}
	}
	if s.CheckRestrictionsHook != nil {
		if oerr := s.CheckRestrictionsHook(req.RoomTypeID, req.ArrivalDate, req.DepartureDate); oerr != nil {
			return nil, oerr
		}
	}
	return s.store.Create(store.CreateInput{
		RoomTypeID:    strings.TrimSpace(req.RoomTypeID),
		ArrivalDate:   req.ArrivalDate,
		DepartureDate: req.DepartureDate,
		GuestID:       strings.TrimSpace(guestID),
		Guest:         req.Guest,
		SellableUnits: req.SellableUnits,
		TotalMinor:    req.TotalMinor,
		DiscountName:  req.DiscountName,
		Actor:         req.Actor,
	}, req.IdempotencyKey)
}

// ModifyRequest is one repriced change to a confirmed reservation.
// Only the fields the desk changed are set; TotalMinor carries the
// fresh QuotePrice total for the new dates, type, and discount, so a
// missing total is a desk-step error, not a silent keep of the old price.
type ModifyRequest struct {
	Ref            string
	ArrivalDate    string
	DepartureDate  string
	RoomTypeID     string
	Guest          map[string]any
	HasGuest       bool
	SellableUnits  int
	TotalMinor     int64
	HasTotal       bool
	DiscountName   *string
	IdempotencyKey string
	Actor          string
}

// Modify validates one repriced change and runs the guarded store step.
func (s *Service) Modify(req ModifyRequest) (*store.Reservation, *store.OpError) {
	if strings.TrimSpace(req.Ref) == "" {
		return nil, validation("reservationRef", "reservationRef is required.", nil)
	}
	arrival := ""
	if strings.TrimSpace(req.ArrivalDate) != "" {
		if _, err := time.Parse(dateLayout, req.ArrivalDate); err != nil {
			return nil, validation("arrivalDate", "arrivalDate must be a YYYY-MM-DD date.", nil)
		}
		arrival = req.ArrivalDate
	}
	departure := ""
	if strings.TrimSpace(req.DepartureDate) != "" {
		if _, err := time.Parse(dateLayout, req.DepartureDate); err != nil {
			return nil, validation("departureDate", "departureDate must be a YYYY-MM-DD date.", nil)
		}
		departure = req.DepartureDate
	}
	if arrival != "" && departure != "" {
		parsedArrival, _ := time.Parse(dateLayout, arrival)
		parsedDeparture, _ := time.Parse(dateLayout, departure)
		if !parsedDeparture.After(parsedArrival) {
			return nil, validation("departureDate", "departureDate must be after arrivalDate.", nil)
		}
	}
	if !req.HasTotal || req.TotalMinor < 0 {
		return nil, validation("priceBasis", "priceBasis.totalMinor is required and cannot be negative.", nil)
	}
	guestID := ""
	var guest map[string]any
	if req.HasGuest {
		if req.Guest == nil {
			return nil, validation("guest", "guest is required when changing the guest.", nil)
		}
		guest = req.Guest
		value, ok := guest["guestId"].(string)
		if !ok || strings.TrimSpace(value) == "" {
			return nil, validation("guest.guestId", "guest.guestId is required.", map[string]any{"field": "guest.guestId"})
		}
		guestID = value
		for _, field := range s.RequiredGuestFields {
			fieldValue, _ := guest[field].(string)
			if strings.TrimSpace(fieldValue) == "" {
				return nil, validation("guest."+field, fmt.Sprintf("Missing hotel-mandatory guest field %s.", field), map[string]any{"field": field})
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
	if s.CheckRestrictionsHook != nil {
		if oerr := s.CheckRestrictionsHook(effectiveRoomType, effectiveArrival, effectiveDeparture); oerr != nil {
			return nil, oerr
		}
	}
	return s.store.Modify(store.ModifyInput{
		Ref:           strings.TrimSpace(req.Ref),
		ArrivalDate:   arrival,
		DepartureDate: departure,
		RoomTypeID:    strings.TrimSpace(req.RoomTypeID),
		GuestID:       strings.TrimSpace(guestID),
		Guest:         guest,
		SellableUnits: req.SellableUnits,
		TotalMinor:    req.TotalMinor,
		DiscountName:  req.DiscountName,
		Actor:         req.Actor,
	}, req.IdempotencyKey)
}

// CancelRequest cancels a confirmed reservation with the hotel kept reason.
type CancelRequest struct {
	Ref            string
	Reason         string
	Actor          string
	IdempotencyKey string
}

// Cancel validates the reason and runs the guarded store step. Reason
// membership in the hotel own list is enforced wherever the hotel
// config list is available; until that slice, a non-empty reason is
// required and kept verbatim (BR-7 baseline).
func (s *Service) Cancel(req CancelRequest) (*store.Reservation, *store.OpError) {
	if strings.TrimSpace(req.Ref) == "" {
		return nil, validation("reservationRef", "reservationRef is required.", nil)
	}
	if strings.TrimSpace(req.Reason) == "" {
		return nil, validation("reason", "A cancellation reason from the hotel list is required.", map[string]any{"field": "reason"})
	}
	return s.store.Cancel(strings.TrimSpace(req.Ref), strings.TrimSpace(req.Reason), req.Actor, req.IdempotencyKey)
}

// MarkNoShowRequest marks an unarrived past-arrival reservation no-show.
type MarkNoShowRequest struct {
	Ref    string
	Reason string
	Actor  string
}

// MarkNoShow validates the reason and runs the guarded store step,
// which additionally refuses arrivals that have not passed yet.
func (s *Service) MarkNoShow(req MarkNoShowRequest) (*store.Reservation, *store.OpError) {
	if strings.TrimSpace(req.Ref) == "" {
		return nil, validation("reservationRef", "reservationRef is required.", nil)
	}
	if strings.TrimSpace(req.Reason) == "" {
		return nil, validation("reason", "A no-show reason from the hotel list is required.", map[string]any{"field": "reason"})
	}
	return s.store.MarkNoShow(strings.TrimSpace(req.Ref), strings.TrimSpace(req.Reason), req.Actor)
}
