// Package store implements the ReportingService read model (LLD
// section 7, FR-RPT-1..4). The rebuild job replays domain events
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

	"github.com/MingChen1501/hotel-mgmt/services/reporting/internal/messages"
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

// maxReportRangeNights bounds the span of a report window (BR-62,
// NFR-RPT-1): dateTo may be at most 730 nights after dateFrom, which
// is 731 inclusive dates — the two-year window NFR-PERF-2 documents
// and the same bound Rates applies to a stay range. The cap is one
// code constant, never an environment variable or per-hotel setting
// (LLD section 31.1, D-36).
const maxReportRangeNights = 730

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

// housekeepingProjection is one room's current housekeeping state
// (FR-RPT-4), folded from RoomStateEvents. Room is the room number
// as carried by those events.
type housekeepingProjection struct {
	Room  string
	State string
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

// HousekeepingRoom is one room needing cleaning or inspection right
// now (FR-RPT-4).
type HousekeepingRoom struct {
	Room  string
	State string
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

// snapshot is one complete read-model set: the seen-id record, the
// per-subscription consumer offsets, the as-of stamp, and the six
// projections. A Store publishes exactly one snapshot at a time and
// every read renders the current one under the store mutex, so a report
// always answers one complete set with its own stamp (BR-66, issue
// #642).
type snapshot struct {
	seen         map[string]bool
	offsets      map[string]string
	asOf         time.Time
	reservations map[string]*reservationProjection
	stays        map[string]*stayProjection
	sellable     map[string]int
	revenue      map[string]*revenueTotal
	folios       map[string]int64
	housekeeping map[string]*housekeepingProjection
}

// newSnapshot returns an empty set, the shape every rebuild candidate
// and the initial published set carry.
func newSnapshot() *snapshot {
	return &snapshot{
		seen:         make(map[string]bool),
		offsets:      make(map[string]string),
		reservations: make(map[string]*reservationProjection),
		stays:        make(map[string]*stayProjection),
		sellable:     make(map[string]int),
		revenue:      make(map[string]*revenueTotal),
		folios:       make(map[string]int64),
		housekeeping: make(map[string]*housekeepingProjection),
	}
}

// Store holds the published reporting read model behind a mutex. The
// current set is replaceable as a whole: a rebuild fills a private
// candidate and installs it in one swap, so a read never observes a
// half-built or emptied set (LLD section 35.1).
type Store struct {
	mu      sync.Mutex
	current *snapshot
}

// New returns an empty Store.
func New() *Store {
	return &Store{current: newSnapshot()}
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

// Apply folds one event into the published set. Replays of an already
// applied event id are no-ops: the projections and the consumer
// offset do not move, so duplicate delivery never double-counts.
// Unknown future event types are recorded as seen (with their offset
// and as-of advance) and otherwise ignored, keeping the consumer
// forward-compatible with owning-module contracts that land later.
func (s *Store) Apply(event Event) *OpError {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current.fold(event)
}

// fold applies one event to the set: a refused event changes nothing, a
// duplicate id is a no-op, and a projected event advances the seen
// record, its subscription offset, and the as-of stamp (LLD section
// 35.4, edge D-C). It is the one per-event fold both the live ingest
// path and a rebuild drive, so a rebuilt row is the row the live path
// produces.
func (set *snapshot) fold(event Event) *OpError {
	if strings.TrimSpace(event.ID) == "" {
		return validation("eventId", messages.Text("reporting.validation.event_required", nil))
	}
	if set.seen[event.ID] {
		return nil
	}
	if err := set.project(event); err != nil {
		return err
	}
	set.seen[event.ID] = true
	if strings.TrimSpace(event.Subscription) != "" {
		set.offsets[event.Subscription] = event.ID
	}
	if event.OccurredAt.After(set.asOf) {
		set.asOf = event.OccurredAt
	}
	return nil
}

// Rebuild replays a full outbox slice into a private candidate set and
// publishes it in one swap (BR-66, issue #642). The replay holds no
// lock and the candidate is unreachable from every read, so a read
// issued while the rebuild runs still answers the previously published
// set; the candidate becomes the published set in one critical section
// only after every event projects. On the first refused event the
// candidate is discarded, nothing is published, and the refusal is
// returned unchanged, so the served projections, the consumer-offset
// record, and the as-of stamp keep their pre-rebuild values and a retry
// replays from the same record. Reports queried after a successful
// rebuild match the source rows the events describe, byte-identical to
// a clear-and-replay of the same slice.
func (s *Store) Rebuild(events []Event) *OpError {
	candidate := newSnapshot()
	for _, event := range events {
		if oerr := candidate.fold(event); oerr != nil {
			return oerr
		}
	}
	s.mu.Lock()
	s.current = candidate
	s.mu.Unlock()
	return nil
}

func (set *snapshot) project(event Event) *OpError {
	payload := event.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	switch event.Type {
	case "reservation.created":
		ref, ok := strPayload(payload, "reservationRef")
		if !ok {
			return validation("reservationRef", messages.Text("error.validation.reservation_ref_required", nil))
		}
		roomType, ok := strPayload(payload, "roomTypeId")
		if !ok {
			return validation("roomTypeId", messages.Text("error.validation.room_type_required", nil))
		}
		arrival, ok := strPayload(payload, "arrivalDate")
		if !ok || !validDate(arrival) {
			return validation("arrivalDate", messages.Text("error.validation.arrival_format", nil))
		}
		departure, ok := strPayload(payload, "departureDate")
		if !ok || !validDate(departure) || departure <= arrival {
			return validation("departureDate", messages.Text("reporting.validation.departure_after_arrival", nil))
		}
		set.reservations[ref] = &reservationProjection{
			Ref: ref, RoomTypeID: roomType, Arrival: arrival, Departure: departure, Active: true,
		}
		stayID, _ := strPayload(payload, "stayId")
		if stayID != "" {
			set.reservations[ref].StayID = stayID
		}
	case "reservation.cancelled", "reservation.no-show":
		ref, ok := strPayload(payload, "reservationRef")
		if !ok {
			return validation("reservationRef", messages.Text("error.validation.reservation_ref_required", nil))
		}
		if record, found := set.reservations[ref]; found {
			record.Active = false
		}
	case "stay.checked-in":
		stayID, ok := strPayload(payload, "stayId")
		if !ok {
			return validation("stayId", messages.Text("error.validation.stay_id_required", nil))
		}
		day, ok := strPayload(payload, "date")
		if !ok || !validDate(day) {
			return validation("date", messages.Text("reporting.validation.date_format", map[string]string{"field": "date"}))
		}
		stay := set.stays[stayID]
		if stay == nil {
			stay = &stayProjection{ID: stayID}
			set.stays[stayID] = stay
		}
		stay.CheckIn = day
		if ref, ok := strPayload(payload, "reservationRef"); ok {
			stay.ReservationRef = ref
			if record, found := set.reservations[ref]; found {
				record.StayID = stayID
			}
		}
		if room, ok := strPayload(payload, "roomId"); ok {
			stay.RoomID = room
		}
	case "stay.checked-out":
		stayID, ok := strPayload(payload, "stayId")
		if !ok {
			return validation("stayId", messages.Text("error.validation.stay_id_required", nil))
		}
		day, ok := strPayload(payload, "date")
		if !ok || !validDate(day) {
			return validation("date", messages.Text("reporting.validation.date_format", map[string]string{"field": "date"}))
		}
		stay := set.stays[stayID]
		if stay == nil {
			stay = &stayProjection{ID: stayID}
			set.stays[stayID] = stay
		}
		stay.CheckOut = day
		if stay.ReservationRef != "" {
			if record, found := set.reservations[stay.ReservationRef]; found {
				record.CheckedOut = true
				record.CheckoutDay = day
			}
		}
		if stay.RoomID != "" {
			if row := set.housekeeping[stay.RoomID]; row != nil && row.State == "occupied" {
				// Check-out turns an occupied room vacant and dirty
				// (state-machine section 2). The rooms module's own
				// state-changed event stays the source of truth and
				// overwrites this when it arrives; this only keeps
				// the report current while that feed lags, and never
				// creates rows for unknown rooms.
				row.State = "vacant-dirty"
			}
		}
	case "rate.availability-set":
		roomType, ok := strPayload(payload, "roomTypeId")
		if !ok {
			return validation("roomTypeId", messages.Text("error.validation.room_type_required", nil))
		}
		date, ok := strPayload(payload, "date")
		if !ok || !validDate(date) {
			return validation("date", messages.Text("reporting.validation.date_format", map[string]string{"field": "date"}))
		}
		units, ok := intPayload(payload, "sellableUnits")
		if !ok || units < 0 {
			return validation("sellableUnits", messages.Text("reporting.validation.sellable_units", nil))
		}
		set.sellable[occKey(date, roomType)] = int(units)
	case "folio.charge-posted":
		folio, ok := strPayload(payload, "folioId")
		if !ok {
			return validation("folioId", messages.Text("reporting.validation.folio_required", nil))
		}
		day, ok := strPayload(payload, "businessDate")
		if !ok || !validDate(day) {
			return validation("businessDate", messages.Text("error.validation.business_date", nil))
		}
		kind, ok := strPayload(payload, "kind")
		if !ok || (kind != "room" && kind != "extra") {
			return validation("kind", messages.Text("reporting.validation.kind", nil))
		}
		amount, ok := intPayload(payload, "amountMinor")
		if !ok || amount < 0 {
			return validation("amountMinor", messages.Text("reporting.validation.amount", nil))
		}
		total := set.revenue[day]
		if total == nil {
			total = &revenueTotal{}
			set.revenue[day] = total
		}
		if kind == "room" {
			total.Room += amount
		} else {
			total.Extra += amount
		}
		set.folios[folio] += amount
	case "folio.payment-recorded":
		folio, ok := strPayload(payload, "folioId")
		if !ok {
			return validation("folioId", messages.Text("reporting.validation.folio_required", nil))
		}
		amount, ok := intPayload(payload, "amountMinor")
		if !ok || amount < 0 {
			return validation("amountMinor", messages.Text("reporting.validation.amount", nil))
		}
		set.folios[folio] -= amount
	case "config.changed":
		// Hotel identity and wording printed on reports are served
		// from Admin at read time (per-hotel config delivery, issue
		// #158); the rebuild only tracks freshness for these events.
	case "room.room-upserted":
		room, ok := strPayload(payload, "roomNumber")
		if !ok {
			return validation("roomNumber", messages.Text("reporting.validation.room_required", nil))
		}
		state, ok := strPayload(payload, "state")
		if !ok {
			return validation("state", messages.Text("reporting.validation.state_required", nil))
		}
		set.housekeeping[room] = &housekeepingProjection{Room: room, State: state}
	case "room.state-changed":
		room, ok := strPayload(payload, "roomNumber")
		if !ok {
			return validation("roomNumber", messages.Text("reporting.validation.room_required", nil))
		}
		state, ok := strPayload(payload, "newState")
		if !ok {
			return validation("newState", messages.Text("reporting.validation.new_state_required", nil))
		}
		if row := set.housekeeping[room]; row != nil {
			row.State = state
		} else {
			set.housekeeping[room] = &housekeepingProjection{Room: room, State: state}
		}
	case "room.blocked":
		room, ok := strPayload(payload, "roomNumber")
		if !ok {
			return validation("roomNumber", messages.Text("reporting.validation.room_required", nil))
		}
		from, ok := strPayload(payload, "dateFrom")
		if !ok || !validDate(from) {
			return validation("dateFrom", messages.Text("error.validation.date_from_format", nil))
		}
		to, ok := strPayload(payload, "dateTo")
		if !ok || !validDate(to) || to < from {
			return validation("dateTo", messages.Text("reporting.validation.date_to_order", nil))
		}
		set.housekeeping[room] = &housekeepingProjection{Room: room, State: "out-of-order"}
	case "room.block-released":
		room, ok := strPayload(payload, "roomNumber")
		if !ok {
			return validation("roomNumber", messages.Text("reporting.validation.room_required", nil))
		}
		// Out-of-order rooms re-enter through dirty (rooms LLD
		// section 3); a later state-changed event refines this.
		set.housekeeping[room] = &housekeepingProjection{Room: room, State: "vacant-dirty"}
	default:
		// Forward-compatible ignore: recorded as seen with offset
		// and as-of advance by Apply.
	}
	return nil
}

func parseRange(dateFrom, dateTo string) (time.Time, time.Time, *OpError) {
	from, err := time.Parse(dateLayout, dateFrom)
	if err != nil {
		return time.Time{}, time.Time{}, validation("dateFrom", messages.Text("error.validation.date_from_format", nil))
	}
	to, err := time.Parse(dateLayout, dateTo)
	if err != nil {
		return time.Time{}, time.Time{}, validation("dateTo", messages.Text("error.validation.date_to_format", nil))
	}
	if to.Before(from) {
		return time.Time{}, time.Time{}, validation("dateTo", messages.Text("error.validation.date_range_order", nil))
	}
	// The span cap is the last window check (BR-62): it runs after the
	// format and order refusals and before every caller takes the store
	// lock, so a refused window walks no date and holds no mutex.
	if to.After(from.AddDate(0, 0, maxReportRangeNights)) {
		return time.Time{}, time.Time{}, validation("dateTo", messages.Text("reporting.validation.date_range_span", map[string]string{"max": messages.Num(maxReportRangeNights)}))
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
	set := s.current
	types := map[string]bool{}
	for _, record := range set.reservations {
		if record.Active {
			types[record.RoomTypeID] = true
		}
	}
	for key := range set.sellable {
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
			for _, record := range set.reservations {
				if !record.Active || record.RoomTypeID != roomType {
					continue
				}
				if record.Arrival <= name && name < record.Departure {
					occupied++
				}
			}
			units, seeded := set.sellable[occKey(name, roomType)]
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
	return rows, set.asOf, nil
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
	set := s.current
	var rows []RevenueRow
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		name := day.Format(dateLayout)
		total := set.revenue[name]
		row := RevenueRow{BusinessDate: name}
		if total != nil {
			row.RoomRevenue = total.Room
			row.ExtraRevenue = total.Extra
		}
		rows = append(rows, row)
	}
	return rows, set.asOf, nil
}

// Sheet returns the one-page daily view for businessDate (FR-RPT-3):
// arrivals (active reservations starting that day, plus walk-in
// check-ins without a reservation link), in-house stays (checked in
// on or before the day and not checked out before the day ends),
// departures (check-outs that day, plus reservation departures with
// no linked stay check-out), and folios carrying an open balance.
func (s *Store) Sheet(businessDate string) (*DailySheet, *OpError) {
	if !validDate(businessDate) {
		return nil, validation("businessDate", messages.Text("error.validation.business_date", nil))
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	set := s.current
	sheet := &DailySheet{BusinessDate: businessDate, AsOf: set.asOf}
	departed := map[string]bool{}
	for _, stay := range set.stays {
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
	for _, record := range set.reservations {
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
	for _, stay := range set.stays {
		if stay.CheckIn == businessDate && stay.ReservationRef == "" {
			sheet.Arrivals = append(sheet.Arrivals, SheetEntry{Kind: "stay", Ref: stay.ID})
		}
	}
	for folio, balance := range set.folios {
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

// needsHousekeepingWork reports whether a room state belongs on the
// housekeeping report (FR-RPT-4): dirty rooms need cleaning,
// clean-but-uninspected rooms need inspection. Inspected,
// out-of-order, and occupied rooms never appear. Unknown future
// states fail visible so staff notice them, matching the
// needs_work column default.
func needsHousekeepingWork(state string) bool {
	switch state {
	case "vacant-dirty", "vacant-clean":
		return true
	case "vacant-inspected", "out-of-order", "occupied":
		return false
	default:
		return true
	}
}

// Housekeeping returns every room needing cleaning or inspection
// right now, sorted by room, with the read-model as-of timestamp. A
// lagging feed shows through the as-of timestamp, never by blocking
// the read.
func (s *Store) Housekeeping() ([]HousekeepingRoom, time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	set := s.current
	var rooms []HousekeepingRoom
	for _, row := range set.housekeeping {
		if !needsHousekeepingWork(row.State) {
			continue
		}
		rooms = append(rooms, HousekeepingRoom{Room: row.Room, State: row.State})
	}
	sort.Slice(rooms, func(i, j int) bool { return rooms[i].Room < rooms[j].Room })
	return rooms, set.asOf
}

// Offsets returns the consumer-offset record per subscription: the
// last first-applied event id for resume after restart (LLD
// section 7). Duplicates never move an offset backwards.
func (s *Store) Offsets() map[string]string {
	s.mu.Lock()
	defer s.mu.Unlock()
	set := s.current
	out := make(map[string]string, len(set.offsets))
	for subscription, last := range set.offsets {
		out[subscription] = last
	}
	return out
}

// AsOf returns the newest applied event time across all
// subscriptions; every report carries it as its freshness stamp.
func (s *Store) AsOf() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	set := s.current
	return set.asOf
}
