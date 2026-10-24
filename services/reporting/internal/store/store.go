// Package store implements the ReportingService read model (LLD
// section 7, FR-RPT-1..3). The rebuild job replays domain events
// into pre-aggregated projections: every apply is idempotent by
// event id and advances the per-subscription consumer offset in the
// same critical section, so replays and restarts converge without
// double-counting. Reads serve only these projections, never other
// modules' stores. Postgres persistence of this read model hardens
// in a later slice; the semantics stay the same.
package store

import (
	"sort"
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

const dateLayout = "2006-01-02"

// Event is one normalized domain event fed to the rebuild job. The
// dispatcher relays owning-module outbox rows in per-aggregate
// order; Type names the originating contract event (for example
// "reservation.created" from ReservationEvents v1.0, "stay.checked-out"
// from StayEvents v1.0), Subscription names the consumed family used
// for the consumer-offset record, and Payload carries the event
// fields. Folio and config families follow the same shape; their
// owning contracts land in later slices (billing folio events,
// admin config delivery).
type Event struct {
	ID           string
	Subscription string
	Type         string
	OccurredAt   time.Time
	Payload      map[string]any
}

type reservationProjection struct {
	Ref         string
	RoomTypeID  string
	Arrival     string
	Departure   string
	Active      bool
	StayID      string
	CheckedOut  bool
	CheckoutDay string
}

type stayProjection struct {
	ID             string
	ReservationRef string
	RoomID         string
	CheckIn        string
	CheckOut       string
}

type revenueTotal struct {
	Room  int64
	Extra int64
}

// NightRow is one per-date, per-type occupancy row (FR-RPT-1).
type NightRow struct {
	NightDate string
	RoomType  string
	Occupied  int
	Available int
}

// RevenueRow is one per-date revenue total (FR-RPT-2).
type RevenueRow struct {
	BusinessDate string
	RoomRevenue  int64
	ExtraRevenue int64
}

// SheetEntry is one daily-sheet line (FR-RPT-3).
type SheetEntry struct {
	Kind string
	Ref  string
}

// BalanceEntry is one open folio balance on the daily sheet.
type BalanceEntry struct {
	FolioID      string
	BalanceMinor int64
}

// DailySheet is the front-desk one-page view (FR-RPT-3).
type DailySheet struct {
	BusinessDate string
	Arrivals     []SheetEntry
	InHouse      []SheetEntry
	Departures   []SheetEntry
	OpenBalances []BalanceEntry
	AsOf         time.Time
}

// Store holds the reporting read model behind a mutex.
type Store struct {
	mu           sync.Mutex
	seen         map[string]bool
	offsets      map[string]string
	asOf         time.Time
	reservations map[string]*reservationProjection
	stays        map[string]*stayProjection
	sellable     map[string]int
	revenue      map[string]*revenueTotal
	folios       map[string]int64
}

// New returns an empty Store.
func New() *Store {
	return &Store{
		seen:         make(map[string]bool),
		offsets:      make(map[string]string),
		reservations: make(map[string]*reservationProjection),
		stays:        make(map[string]*stayProjection),
		sellable:     make(map[string]int),
		revenue:      make(map[string]*revenueTotal),
		folios:       make(map[string]int64),
	}
}

func occKey(date, roomType string) string { return date + "\x00" + roomType }

func strPayload(payload map[string]any, field string) (string, bool) {
	value, ok := payload[field].(string)
	return value, ok && strings.TrimSpace(value) != ""
}

func intPayload(payload map[string]any, field string) (int64, bool) {
	raw, ok := payload[field]
	if !ok {
		return 0, false
	}
	switch value := raw.(type) {
	case int:
		return int64(value), true
	case int64:
		return value, true
	case float64:
		return int64(value), value == float64(int64(value))
	}
	return 0, false
}

func validDate(value string) bool {
	_, err := time.Parse(dateLayout, value)
	return err == nil
}

// Apply folds one event into the read model. Replays of an already
// applied event id are no-ops: the projections and the consumer
// offset do not move, so duplicate delivery never double-counts.
// Unknown future event types are recorded as seen (with their offset
// and as-of advance) and otherwise ignored, keeping the consumer
// forward-compatible with owning-module contracts that land later.
func (s *Store) Apply(event Event) *OpError {
	s.mu.Lock()
	defer s.mu.Unlock()
	if strings.TrimSpace(event.ID) == "" {
		return validation("eventId", "eventId is required.")
	}
	if s.seen[event.ID] {
		return nil
	}
	if err := s.project(event); err != nil {
		return err
	}
	s.seen[event.ID] = true
	if strings.TrimSpace(event.Subscription) != "" {
		s.offsets[event.Subscription] = event.ID
	}
	if event.OccurredAt.After(s.asOf) {
		s.asOf = event.OccurredAt
	}
	return nil
}

// Rebuild replays a full outbox slice from scratch: it clears every
// projection, offset, and seen id, then applies the events in the
// given per-aggregate order. Reports queried afterwards match the
// source rows the events describe.
func (s *Store) Rebuild(events []Event) *OpError {
	s.mu.Lock()
	s.seen = make(map[string]bool)
	s.offsets = make(map[string]string)
	s.asOf = time.Time{}
	s.reservations = make(map[string]*reservationProjection)
	s.stays = make(map[string]*stayProjection)
	s.sellable = make(map[string]int)
	s.revenue = make(map[string]*revenueTotal)
	s.folios = make(map[string]int64)
	s.mu.Unlock()
	for _, event := range events {
		if oerr := s.Apply(event); oerr != nil {
			return oerr
		}
	}
	return nil
}

func (s *Store) project(event Event) *OpError {
	payload := event.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	switch event.Type {
	case "reservation.created":
		ref, ok := strPayload(payload, "reservationRef")
		if !ok {
			return validation("reservationRef", "reservationRef is required.")
		}
		roomType, ok := strPayload(payload, "roomTypeId")
		if !ok {
			return validation("roomTypeId", "roomTypeId is required.")
		}
		arrival, ok := strPayload(payload, "arrivalDate")
		if !ok || !validDate(arrival) {
			return validation("arrivalDate", "arrivalDate must be a YYYY-MM-DD date.")
		}
		departure, ok := strPayload(payload, "departureDate")
		if !ok || !validDate(departure) || departure <= arrival {
			return validation("departureDate", "departureDate must be a YYYY-MM-DD date after arrivalDate.")
		}
		s.reservations[ref] = &reservationProjection{
			Ref: ref, RoomTypeID: roomType, Arrival: arrival, Departure: departure, Active: true,
		}
		stayID, _ := strPayload(payload, "stayId")
		if stayID != "" {
			s.reservations[ref].StayID = stayID
		}
	case "reservation.cancelled", "reservation.no-show":
		ref, ok := strPayload(payload, "reservationRef")
		if !ok {
			return validation("reservationRef", "reservationRef is required.")
		}
		if record, found := s.reservations[ref]; found {
			record.Active = false
		}
	case "stay.checked-in":
		stayID, ok := strPayload(payload, "stayId")
		if !ok {
			return validation("stayId", "stayId is required.")
		}
		day, ok := strPayload(payload, "date")
		if !ok || !validDate(day) {
			return validation("date", "date must be a YYYY-MM-DD date.")
		}
		stay := s.stays[stayID]
		if stay == nil {
			stay = &stayProjection{ID: stayID}
			s.stays[stayID] = stay
		}
		stay.CheckIn = day
		if ref, ok := strPayload(payload, "reservationRef"); ok {
			stay.ReservationRef = ref
			if record, found := s.reservations[ref]; found {
				record.StayID = stayID
			}
		}
		if room, ok := strPayload(payload, "roomId"); ok {
			stay.RoomID = room
		}
	case "stay.checked-out":
		stayID, ok := strPayload(payload, "stayId")
		if !ok {
			return validation("stayId", "stayId is required.")
		}
		day, ok := strPayload(payload, "date")
		if !ok || !validDate(day) {
			return validation("date", "date must be a YYYY-MM-DD date.")
		}
		stay := s.stays[stayID]
		if stay == nil {
			stay = &stayProjection{ID: stayID}
			s.stays[stayID] = stay
		}
		stay.CheckOut = day
		if stay.ReservationRef != "" {
			if record, found := s.reservations[stay.ReservationRef]; found {
				record.CheckedOut = true
				record.CheckoutDay = day
			}
		}
	case "rate.availability-set":
		roomType, ok := strPayload(payload, "roomTypeId")
		if !ok {
			return validation("roomTypeId", "roomTypeId is required.")
		}
		date, ok := strPayload(payload, "date")
		if !ok || !validDate(date) {
			return validation("date", "date must be a YYYY-MM-DD date.")
		}
		units, ok := intPayload(payload, "sellableUnits")
		if !ok || units < 0 {
			return validation("sellableUnits", "sellableUnits is required and cannot be negative.")
		}
		s.sellable[occKey(date, roomType)] = int(units)
	case "folio.charge-posted":
		folio, ok := strPayload(payload, "folioId")
		if !ok {
			return validation("folioId", "folioId is required.")
		}
		day, ok := strPayload(payload, "businessDate")
		if !ok || !validDate(day) {
			return validation("businessDate", "businessDate must be a YYYY-MM-DD date.")
		}
		kind, ok := strPayload(payload, "kind")
		if !ok || (kind != "room" && kind != "extra") {
			return validation("kind", "kind must be room or extra.")
		}
		amount, ok := intPayload(payload, "amountMinor")
		if !ok || amount < 0 {
			return validation("amountMinor", "amountMinor is required and cannot be negative.")
		}
		total := s.revenue[day]
		if total == nil {
			total = &revenueTotal{}
			s.revenue[day] = total
		}
		if kind == "room" {
			total.Room += amount
		} else {
			total.Extra += amount
		}
		s.folios[folio] += amount
	case "folio.payment-recorded":
		folio, ok := strPayload(payload, "folioId")
		if !ok {
			return validation("folioId", "folioId is required.")
		}
		amount, ok := intPayload(payload, "amountMinor")
		if !ok || amount < 0 {
			return validation("amountMinor", "amountMinor is required and cannot be negative.")
		}
		s.folios[folio] -= amount
	case "config.changed":
		// Hotel identity and wording printed on reports are served
		// from Admin at read time (per-hotel config delivery, issue
		// #158); the rebuild only tracks freshness for these events.
	default:
		// Forward-compatible ignore: recorded as seen with offset
		// and as-of advance by Apply.
	}
	return nil
}

func parseRange(dateFrom, dateTo string) (time.Time, time.Time, *OpError) {
	from, err := time.Parse(dateLayout, dateFrom)
	if err != nil {
		return time.Time{}, time.Time{}, validation("dateFrom", "dateFrom must be a YYYY-MM-DD date.")
	}
	to, err := time.Parse(dateLayout, dateTo)
	if err != nil {
		return time.Time{}, time.Time{}, validation("dateTo", "dateTo must be a YYYY-MM-DD date.")
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, validation("dateTo", "dateTo is before dateFrom.")
	}
	return from, to, nil
}

// Occupancy returns per-night, per-type counts over [dateFrom,
// dateTo): occupied nights come from active reservations overlapping
// the night, available nights from the seeded availability baseline
// minus occupied (floored at zero). A lagging feed shows through the
// as-of timestamp, never by blocking the read.
func (s *Store) Occupancy(dateFrom, dateTo string) ([]NightRow, time.Time, *OpError) {
	from, to, oerr := parseRange(dateFrom, dateTo)
	if oerr != nil {
		return nil, time.Time{}, oerr
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	types := map[string]bool{}
	for _, record := range s.reservations {
		if record.Active {
			types[record.RoomTypeID] = true
		}
	}
	for key := range s.sellable {
		parts := strings.SplitN(key, "\x00", 2)
		if len(parts) == 2 {
			types[parts[1]] = true
		}
	}
	var rows []NightRow
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		name := day.Format(dateLayout)
		for roomType := range types {
			var occupied int
			for _, record := range s.reservations {
				if !record.Active || record.RoomTypeID != roomType {
					continue
				}
				if record.Arrival <= name && name < record.Departure {
					occupied++
				}
			}
			units, seeded := s.sellable[occKey(name, roomType)]
			if occupied == 0 && !seeded {
				continue
			}
			available := units - occupied
			if available < 0 {
				available = 0
			}
			rows = append(rows, NightRow{NightDate: name, RoomType: roomType, Occupied: occupied, Available: available})
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].NightDate != rows[j].NightDate {
			return rows[i].NightDate < rows[j].NightDate
		}
		return rows[i].RoomType < rows[j].RoomType
	})
	return rows, s.asOf, nil
}

// Revenue returns per-date room and extra revenue totals over
// [dateFrom, dateTo] in minor units (FR-RPT-2). Dates without posted
// charges report zeros so the range shape is stable.
func (s *Store) Revenue(dateFrom, dateTo string) ([]RevenueRow, time.Time, *OpError) {
	from, to, oerr := parseRange(dateFrom, dateTo)
	if oerr != nil {
		return nil, time.Time{}, oerr
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	var rows []RevenueRow
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		name := day.Format(dateLayout)
		total := s.revenue[name]
		row := RevenueRow{BusinessDate: name}
		if total != nil {
			row.RoomRevenue = total.Room
			row.ExtraRevenue = total.Extra
		}
		rows = append(rows, row)
	}
	return rows, s.asOf, nil
}

// Sheet returns the one-page daily view for businessDate (FR-RPT-3):
// arrivals (active reservations starting that day, plus walk-in
// check-ins without a reservation link), in-house stays (checked in
// on or before the day and not checked out before the day ends),
// departures (check-outs that day, plus reservation departures with
// no linked stay check-out), and folios carrying an open balance.
func (s *Store) Sheet(businessDate string) (*DailySheet, *OpError) {
	if !validDate(businessDate) {
		return nil, validation("businessDate", "businessDate must be a YYYY-MM-DD date.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	sheet := &DailySheet{BusinessDate: businessDate, AsOf: s.asOf}
	departed := map[string]bool{}
	for _, stay := range s.stays {
		if stay.CheckIn != "" && stay.CheckIn <= businessDate && (stay.CheckOut == "" || stay.CheckOut > businessDate) {
			sheet.InHouse = append(sheet.InHouse, SheetEntry{Kind: "stay", Ref: stay.ID})
		}
		if stay.CheckOut == businessDate {
			sheet.Departures = append(sheet.Departures, SheetEntry{Kind: "stay", Ref: stay.ID})
			if stay.ReservationRef != "" {
				departed[stay.ReservationRef] = true
			}
		}
	}
	for _, record := range s.reservations {
		if !record.Active {
			continue
		}
		if record.Arrival == businessDate {
			sheet.Arrivals = append(sheet.Arrivals, SheetEntry{Kind: "reservation", Ref: record.Ref})
		}
		if record.Departure == businessDate && !departed[record.Ref] {
			sheet.Departures = append(sheet.Departures, SheetEntry{Kind: "reservation", Ref: record.Ref})
		}
	}
	for _, stay := range s.stays {
		if stay.CheckIn == businessDate && stay.ReservationRef == "" {
			sheet.Arrivals = append(sheet.Arrivals, SheetEntry{Kind: "stay", Ref: stay.ID})
		}
	}
	for folio, balance := range s.folios {
		if balance != 0 {
			sheet.OpenBalances = append(sheet.OpenBalances, BalanceEntry{FolioID: folio, BalanceMinor: balance})
		}
	}
	byRef := func(entries []SheetEntry) {
		sort.Slice(entries, func(i, j int) bool {
			if entries[i].Kind != entries[j].Kind {
				return entries[i].Kind < entries[j].Kind
			}
			return entries[i].Ref < entries[j].Ref
		})
	}
	byRef(sheet.Arrivals)
	byRef(sheet.InHouse)
	byRef(sheet.Departures)
	sort.Slice(sheet.OpenBalances, func(i, j int) bool { return sheet.OpenBalances[i].FolioID < sheet.OpenBalances[j].FolioID })
	return sheet, nil
}

// Offsets returns the consumer-offset record per subscription: the
// last first-applied event id for resume after restart (LLD
// section 7). Duplicates never move an offset backwards.
func (s *Store) Offsets() map[string]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make(map[string]string, len(s.offsets))
	for subscription, last := range s.offsets {
		out[subscription] = last
	}
	return out
}

// AsOf returns the newest applied event time across all
// subscriptions; every report carries it as its freshness stamp.
func (s *Store) AsOf() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.asOf
}
