// Package store implements the in-memory ReservationService store
// (LLD section 1). The overbooking guard (NFR-CON-1) counts
// overlapping confirmed and checked-in rows for the type and dates
// and inserts only when capacity remains, all under one mutex —
// the same shape as the transactional guard in the schema
// migration. Checked-in rows cover the in-house share, so the guard
// never reads another store. Postgres persistence of these rows
// hardens in a later slice; the semantics stay the same.
package store

import (
	"crypto/rand"
	"fmt"
	"strings"
	"sync"
	"time"
)

// OpError carries the shared error envelope code for an operation.
type OpError struct {
	Code    string
	Status  int
	Message string
	Details map[string]any
}

func (e *OpError) Error() string { return e.Message }

func validation(field, message string) *OpError {
	return &OpError{Code: "VALIDATION_FAILED", Status: 400, Message: message, Details: map[string]any{"field": field}}
}

func conflict(message string, details map[string]any) *OpError {
	return &OpError{Code: "CONFLICT", Status: 409, Message: message, Details: details}
}

func notFound(message string, details map[string]any) *OpError {
	return &OpError{Code: "NOT_FOUND", Status: 404, Message: message, Details: details}
}

const dateLayout = "2006-01-02"

// Reservation is one booking row.
type Reservation struct {
	ID            string
	Ref           string
	RoomTypeID    string
	ArrivalDate   string
	DepartureDate string
	GuestID       string
	Guest         map[string]any
	TotalMinor    int64
	DiscountName  *string
	State         string
	StayID        string
	CreatedBy     string
	CreatedAt     time.Time
}

// CreateInput carries one booking attempt.
type CreateInput struct {
	RoomTypeID    string
	ArrivalDate   string
	DepartureDate string
	GuestID       string
	Guest         map[string]any
	SellableUnits int
	TotalMinor    int64
	DiscountName  *string
	Actor         string
}

// CalendarEntry is one QueryCalendar row.
type CalendarEntry struct {
	Ref           string
	RoomTypeID    string
	ArrivalDate   string
	DepartureDate string
	State         string
	StayID        string
}

// Repository is the store contract the service and handler program
// against. New returns the in-memory implementation used in unit tests;
// NewPostgres (postgres.go) returns the Postgres-backed implementation
// used when DATABASE_URL is set. Both keep the same guard semantics.
type Repository interface {
	Create(input CreateInput, idempotencyKey string) (*Reservation, *OpError)
	Get(ref string) (*Reservation, *OpError)
	Query(dateFrom, dateTo, roomTypeID string) []*CalendarEntry
	CheckIn(ref, stayID, actor string) (*Reservation, *OpError)
}

// Store holds reservations behind a mutex.
type Store struct {
	mu     sync.Mutex
	byRef  map[string]*Reservation
	idem   map[string]*Reservation
	events []map[string]any
}

// New returns an empty Store.
func New() *Store {
	return &Store{byRef: make(map[string]*Reservation), idem: make(map[string]*Reservation)}
}

func newRef() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	var buf [8]byte
	_, _ = rand.Read(buf[:])
	var out [8]byte
	for i, b := range buf {
		out[i] = alphabet[int(b)%len(alphabet)]
	}
	return "RSV-" + string(out[:])
}

func newID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	const hexdigits = "0123456789abcdef"
	var out [36]byte
	j := 0
	for i, b := range buf {
		if i == 4 || i == 6 || i == 8 || i == 10 {
			out[j] = '-'
			j++
		}
		out[j] = hexdigits[b>>4]
		out[j+1] = hexdigits[b&0x0f]
		j += 2
	}
	return string(out[:])
}

func overlaps(arrival, departure, existingArrival, existingDeparture string) bool {
	return arrival < existingDeparture && departure > existingArrival
}

func activeState(state string) bool {
	return state == "confirmed" || state == "checked-in"
}

// Create atomically guards and inserts one reservation. When
// idempotencyKey is non-empty, a repeated key returns the original
// reservation instead of booking again.
func (s *Store) Create(input CreateInput, idempotencyKey string) (*Reservation, *OpError) {
	if input.SellableUnits < 1 {
		return nil, validation("sellableUnits", "sellableUnits must be at least 1.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if idempotencyKey != "" {
		if replay, ok := s.idem[idempotencyKey]; ok {
			return replay, nil
		}
	}
	var booked int
	for _, existing := range s.byRef {
		if existing.RoomTypeID != input.RoomTypeID || !activeState(existing.State) {
			continue
		}
		if overlaps(input.ArrivalDate, input.DepartureDate, existing.ArrivalDate, existing.DepartureDate) {
			booked++
		}
	}
	if booked >= input.SellableUnits {
		return nil, conflict(
			fmt.Sprintf("No sellable unit left for the room type for %s to %s.", input.ArrivalDate, input.DepartureDate),
			map[string]any{"roomTypeId": input.RoomTypeID, "arrivalDate": input.ArrivalDate, "departureDate": input.DepartureDate},
		)
	}
	record := &Reservation{
		ID:            newID(),
		Ref:           newRef(),
		RoomTypeID:    input.RoomTypeID,
		ArrivalDate:   input.ArrivalDate,
		DepartureDate: input.DepartureDate,
		GuestID:       input.GuestID,
		Guest:         input.Guest,
		TotalMinor:    input.TotalMinor,
		DiscountName:  input.DiscountName,
		State:         "confirmed",
		CreatedBy:     input.Actor,
		CreatedAt:     time.Now().UTC(),
	}
	for {
		if _, taken := s.byRef[record.Ref]; !taken {
			break
		}
		record.Ref = newRef()
	}
	s.byRef[record.Ref] = record
	if idempotencyKey != "" {
		s.idem[idempotencyKey] = record
	}
	s.events = append(s.events, map[string]any{
		"aggregate": "reservation", "eventType": "created",
		"payload": map[string]any{
			"reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
			"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
			"guestId": record.GuestID, "priceBasisTotal": record.TotalMinor,
		},
	})
	return record, nil
}

// Get returns one reservation by reference.
func (s *Store) Get(ref string) (*Reservation, *OpError) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.byRef[strings.TrimSpace(ref)]
	if !ok {
		return nil, notFound(fmt.Sprintf("Unknown reservation %s.", ref), map[string]any{"reservationRef": ref})
	}
	return record, nil
}

// Query lists reservations overlapping the range, optionally filtered.
func (s *Store) Query(dateFrom, dateTo, roomTypeID string) []*CalendarEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	var entries []*CalendarEntry
	for _, record := range s.byRef {
		if roomTypeID != "" && record.RoomTypeID != roomTypeID {
			continue
		}
		if !overlaps(dateFrom, dateTo, record.ArrivalDate, record.DepartureDate) {
			continue
		}
		entries = append(entries, &CalendarEntry{
			Ref: record.Ref, RoomTypeID: record.RoomTypeID,
			ArrivalDate: record.ArrivalDate, DepartureDate: record.DepartureDate, State: record.State,
			StayID: record.StayID,
		})
	}
	return entries
}

// CheckIn flips a confirmed reservation to checked-in and links the
// stay created by the Stay module (the desk loop calls Stay CheckIn
// first and passes its stay id here). Re-check-in is refused.
func (s *Store) CheckIn(ref, stayID string, actor string) (*Reservation, *OpError) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.byRef[strings.TrimSpace(ref)]
	if !ok {
		return nil, notFound(fmt.Sprintf("Unknown reservation %s.", ref), map[string]any{"reservationRef": ref})
	}
	if record.State != "confirmed" {
		return nil, &OpError{
			Code: "STATE_ILLEGAL", Status: 422,
			Message: fmt.Sprintf("Reservation %s is %s, not confirmed for check-in.", ref, record.State),
			Details: map[string]any{"reservationRef": ref, "state": record.State},
		}
	}
	record.State = "checked-in"
	record.StayID = stayID
	s.events = append(s.events, map[string]any{
		"aggregate": "reservation", "eventType": "checked-in",
		"payload": map[string]any{"reservationRef": record.Ref, "stayId": stayID},
	})
	return record, nil
}
