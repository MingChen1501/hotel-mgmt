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
	store                 *store.Store
	RequiredGuestFields   []string
	CheckRestrictionsHook RestrictionCheck
}

// New returns a Service over store.
func New(st *store.Store) *Service {
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
