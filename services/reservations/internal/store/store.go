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
	CancelReason  *string
	NoShowReason  *string
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

// ModifyInput carries one repriced change to a confirmed reservation.
// Empty ArrivalDate/DepartureDate/RoomTypeID keep the current values;
// Guest nil keeps the current guest snapshot. TotalMinor is the new
// quoted total recalculated from the rate plan in force (BR-2); the
// desk loop supplies the fresh QuotePrice output until the
// Pricing-backed reprice call lands.
type ModifyInput struct {
	Ref           string
	ArrivalDate   string
	DepartureDate string
	RoomTypeID    string
	GuestID       string
	Guest         map[string]any
	SellableUnits int
	TotalMinor    int64
	DiscountName  *string
	Actor         string
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
	Modify(input ModifyInput, idempotencyKey string) (*Reservation, *OpError)
	Cancel(ref, reason, actor, idempotencyKey string) (*Reservation, *OpError)
	MarkNoShow(ref, reason, actor string) (*Reservation, *OpError)
}

// ChangeEntry is one in-memory change-history row (BR-2, NFR-AUD-1):
// who changed which field from what to what and when. The Postgres
// implementation persists these rows in reservation_changes; the
// in-memory store keeps them for the same assertions in unit tests.
type ChangeEntry struct {
	Ref       string
	Field     string
	OldValue  any
	NewValue  any
	Actor     string
	CreatedAt time.Time
}

func changeEntry(ref, field string, oldValue, newValue any, actor string) ChangeEntry {
	return ChangeEntry{Ref: ref, Field: field, OldValue: oldValue, NewValue: newValue, Actor: actor, CreatedAt: time.Now().UTC()}
}

// Store holds reservations behind a mutex.
type Store struct {
	mu      sync.Mutex
	byRef   map[string]*Reservation
	idem    map[string]*Reservation
	events  []map[string]any
	changes []ChangeEntry
}

// Changes returns the recorded change history in insertion order.
func (s *Store) Changes() []ChangeEntry {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]ChangeEntry, len(s.changes))
	copy(out, s.changes)
	return out
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

// stateRefusal rejects a lifecycle step on a reservation that already
// left the confirmed state, naming the current state.
func stateRefusal(ref, state, operation string) *OpError {
	return &OpError{
		Code: "STATE_ILLEGAL", Status: 422,
		Message: fmt.Sprintf("Reservation %s is %s and cannot be %s.", ref, state, operation),
		Details: map[string]any{"reservationRef": ref, "state": state},
	}
}

// Modify reprices and changes a confirmed reservation (FR-RES-2,
// BR-2). The overbooking guard re-runs for the new dates and type in
// the same critical section, excluding the reservation itself, so a
// simultaneous last-unit race still yields exactly one winner
// (NFR-CON-1). Every changed field is recorded in the change history
// with actor and timestamp (NFR-AUD-1) and a modified event is queued.
func (s *Store) Modify(input ModifyInput, idempotencyKey string) (*Reservation, *OpError) {
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
	record, ok := s.byRef[strings.TrimSpace(input.Ref)]
	if !ok {
		return nil, notFound(fmt.Sprintf("Unknown reservation %s.", input.Ref), map[string]any{"reservationRef": input.Ref})
	}
	if record.State != "confirmed" {
		return nil, stateRefusal(input.Ref, record.State, "modified")
	}
	newArrival := record.ArrivalDate
	if strings.TrimSpace(input.ArrivalDate) != "" {
		newArrival = input.ArrivalDate
	}
	newDeparture := record.DepartureDate
	if strings.TrimSpace(input.DepartureDate) != "" {
		newDeparture = input.DepartureDate
	}
	newRoomType := record.RoomTypeID
	if strings.TrimSpace(input.RoomTypeID) != "" {
		newRoomType = strings.TrimSpace(input.RoomTypeID)
	}
	var booked int
	for _, existing := range s.byRef {
		if existing.Ref == record.Ref || existing.RoomTypeID != newRoomType || !activeState(existing.State) {
			continue
		}
		if overlaps(newArrival, newDeparture, existing.ArrivalDate, existing.DepartureDate) {
			booked++
		}
	}
	if booked >= input.SellableUnits {
		return nil, conflict(
			fmt.Sprintf("No sellable unit left for the room type for %s to %s.", newArrival, newDeparture),
			map[string]any{"roomTypeId": newRoomType, "arrivalDate": newArrival, "departureDate": newDeparture},
		)
	}
	if newArrival != record.ArrivalDate || newDeparture != record.DepartureDate {
		s.changes = append(s.changes, changeEntry(record.Ref, "dates",
			map[string]any{"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate},
			map[string]any{"arrivalDate": newArrival, "departureDate": newDeparture}, input.Actor))
		record.ArrivalDate = newArrival
		record.DepartureDate = newDeparture
	}
	if newRoomType != record.RoomTypeID {
		s.changes = append(s.changes, changeEntry(record.Ref, "roomTypeId", record.RoomTypeID, newRoomType, input.Actor))
		record.RoomTypeID = newRoomType
	}
	if strings.TrimSpace(input.GuestID) != "" && input.GuestID != record.GuestID {
		s.changes = append(s.changes, changeEntry(record.Ref, "guestId", record.GuestID, input.GuestID, input.Actor))
		record.GuestID = strings.TrimSpace(input.GuestID)
		record.Guest = input.Guest
	}
	if input.TotalMinor != record.TotalMinor {
		s.changes = append(s.changes, changeEntry(record.Ref, "priceBasis", record.TotalMinor, input.TotalMinor, input.Actor))
		record.TotalMinor = input.TotalMinor
		record.DiscountName = input.DiscountName
	}
	s.events = append(s.events, map[string]any{
		"aggregate": "reservation", "eventType": "modified",
		"payload": map[string]any{
			"reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
			"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
			"guestId": record.GuestID, "priceBasisTotal": record.TotalMinor,
			"actor": input.Actor,
		},
	})
	if idempotencyKey != "" {
		s.idem[idempotencyKey] = record
	}
	return record, nil
}

// Cancel moves a confirmed reservation to cancelled with the kept
// hotel reason (FR-RES-3, BR-3). The held availability releases
// automatically: the overbooking guard counts only confirmed and
// checked-in rows, so the cancelled row no longer blocks the freed
// dates. A cancelled event is queued for the read model.
func (s *Store) Cancel(ref, reason, actor, idempotencyKey string) (*Reservation, *OpError) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if idempotencyKey != "" {
		if replay, ok := s.idem[idempotencyKey]; ok {
			return replay, nil
		}
	}
	record, ok := s.byRef[strings.TrimSpace(ref)]
	if !ok {
		return nil, notFound(fmt.Sprintf("Unknown reservation %s.", ref), map[string]any{"reservationRef": ref})
	}
	if strings.TrimSpace(reason) == "" {
		return nil, validation("reason", "A cancellation reason from the hotel list is required.")
	}
	if record.State != "confirmed" {
		return nil, stateRefusal(ref, record.State, "cancelled")
	}
	kept := strings.TrimSpace(reason)
	s.changes = append(s.changes, changeEntry(record.Ref, "state", record.State, "cancelled", actor))
	record.State = "cancelled"
	record.CancelReason = &kept
	s.events = append(s.events, map[string]any{
		"aggregate": "reservation", "eventType": "cancelled",
		"payload": map[string]any{
			"reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
			"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
			"guestId": record.GuestID, "reason": kept, "actor": actor,
		},
	})
	if idempotencyKey != "" {
		s.idem[idempotencyKey] = record
	}
	return record, nil
}

// MarkNoShow moves a confirmed reservation whose arrival date has
// passed without check-in to no-show (FR-RES-6, BR-5). The held room
// releases the same way a cancellation releases it, and the no-show
// stays in the reservation history with its reason. No folio charge
// is posted here: the no-show charge decision is deferred per LLD D1.
func (s *Store) MarkNoShow(ref, reason, actor string) (*Reservation, *OpError) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.byRef[strings.TrimSpace(ref)]
	if !ok {
		return nil, notFound(fmt.Sprintf("Unknown reservation %s.", ref), map[string]any{"reservationRef": ref})
	}
	if strings.TrimSpace(reason) == "" {
		return nil, validation("reason", "A no-show reason from the hotel list is required.")
	}
	if record.State != "confirmed" {
		return nil, stateRefusal(ref, record.State, "marked no-show")
	}
	today := time.Now().UTC().Format(dateLayout)
	if record.ArrivalDate >= today {
		return nil, &OpError{
			Code: "STATE_ILLEGAL", Status: 422,
			Message: fmt.Sprintf("Reservation %s arrives on %s, which has not passed.", ref, record.ArrivalDate),
			Details: map[string]any{"reservationRef": ref, "arrivalDate": record.ArrivalDate},
		}
	}
	kept := strings.TrimSpace(reason)
	s.changes = append(s.changes, changeEntry(record.Ref, "state", record.State, "no-show", actor))
	record.State = "no-show"
	record.NoShowReason = &kept
	s.events = append(s.events, map[string]any{
		"aggregate": "reservation", "eventType": "no-show",
		"payload": map[string]any{
			"reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
			"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
			"guestId": record.GuestID, "reason": kept, "actor": actor,
		},
	})
	return record, nil
}
