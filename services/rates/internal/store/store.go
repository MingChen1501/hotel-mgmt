// Package store implements the in-memory PricingService store
// (LLD section 4). Guard shapes mirror the rates schema migration:
// nightly prices in minor currency units, stay restrictions per type
// and range, named discounts kept by name. Postgres persistence of
// these rows hardens in a later slice; the semantics stay the same.
package store

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sort"
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

func notFound(message string, details map[string]any) *OpError {
	return &OpError{Code: "NOT_FOUND", Status: 404, Message: message, Details: details}
}

func stateIllegal(message string, details map[string]any) *OpError {
	return &OpError{Code: "STATE_ILLEGAL", Status: 422, Message: message, Details: details}
}

const dateLayout = "2006-01-02"

func newID() string {
	var buf [16]byte
	_, _ = rand.Read(buf[:])
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	hexed := hex.EncodeToString(buf[:])
	return fmt.Sprintf("%s-%s-%s-%s-%s", hexed[0:8], hexed[8:12], hexed[12:16], hexed[16:20], hexed[20:32])
}

func parseDate(value, field string) (time.Time, *OpError) {
	parsed, err := time.Parse(dateLayout, value)
	if err != nil {
		return time.Time{}, validation(field, field+" must be a YYYY-MM-DD date.")
	}
	return parsed, nil
}

func nightsBetween(arrival, departure time.Time) []time.Time {
	var nights []time.Time
	for day := arrival; day.Before(departure); day = day.AddDate(0, 0, 1) {
		nights = append(nights, day)
	}
	return nights
}

// RatePlan is a named price container (FR-RTE-1).
type RatePlan struct {
	ID           string
	Name         string
	Description  string
	DefaultUnits *int
}

// RatePrice is one nightly price in minor currency units (never float).
type RatePrice struct {
	RatePlanName string
	RoomTypeID   string
	NightDate    string
	PriceMinor   int64
}

// StayRestriction is one manager-set window (FR-RTE-4, BR-10).
type StayRestriction struct {
	ID              string
	RoomTypeID      string
	DateFrom        string
	DateTo          string
	MinStay         *int
	ClosedToArrival bool
}

// Discount is a named manager-defined reduction kept by name (BR-15).
type Discount struct {
	ID         string
	Name       string
	Kind       string
	ValueMinor int64
}

// NightQuote is one priced night of a quote.
type NightQuote struct {
	NightDate  string
	PriceMinor int64
}

// Quote is a priced stay: frozen later as the reservation price basis.
type Quote struct {
	RoomTypeID  string
	ArrivalDate string
	Departure   string
	Nights      []NightQuote
	TotalMinor  int64
	Discount    *string
}

// DayCount is the sellable count for one date.
type DayCount struct {
	Date          string
	SellableCount int
}

// Store holds pricing rows behind a mutex.
type Store struct {
	mu           sync.Mutex
	plans        map[string]*RatePlan
	prices       map[string]*RatePrice
	restrictions []*StayRestriction
	discounts    map[string]*Discount
	events       []map[string]any
}

// New returns an empty Store.
func New() *Store {
	return &Store{
		plans:     make(map[string]*RatePlan),
		prices:    make(map[string]*RatePrice),
		discounts: make(map[string]*Discount),
	}
}

func priceKey(plan, roomTypeID, night string) string {
	return plan + "|" + roomTypeID + "|" + night
}

// UpsertRatePlan creates or updates a named plan.
func (s *Store) UpsertRatePlan(name, description string, defaultUnits *int) *RatePlan {
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.plans[name]; ok {
		existing.Description = description
		if defaultUnits != nil {
			existing.DefaultUnits = defaultUnits
		}
		return existing
	}
	plan := &RatePlan{ID: newID(), Name: name, Description: description, DefaultUnits: defaultUnits}
	s.plans[name] = plan
	s.emit("rate-plan", "rate-plan-changed", map[string]any{"ratePlanName": name})
	return plan
}

// UpsertRatePrice sets one nightly price.
func (s *Store) UpsertRatePrice(planName, roomTypeID, night string, priceMinor int64) (*RatePrice, *OpError) {
	if priceMinor < 0 {
		return nil, validation("priceMinor", "priceMinor cannot be negative.")
	}
	if _, err := parseDate(night, "nightDate"); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.plans[planName]; !ok {
		return nil, notFound(fmt.Sprintf("Unknown rate plan %s.", planName), map[string]any{"ratePlanName": planName})
	}
	record := &RatePrice{RatePlanName: planName, RoomTypeID: roomTypeID, NightDate: night, PriceMinor: priceMinor}
	s.prices[priceKey(planName, roomTypeID, night)] = record
	s.emit("rate-plan", "rate-plan-changed", map[string]any{"ratePlanName": planName})
	return record, nil
}

// UpsertRestriction records one stay-restriction window.
func (s *Store) UpsertRestriction(roomTypeID, from, to string, minStay *int, closedToArrival bool) (*StayRestriction, *OpError) {
	if _, err := parseDate(from, "dateFrom"); err != nil {
		return nil, err
	}
	if _, err := parseDate(to, "dateTo"); err != nil {
		return nil, err
	}
	if to < from {
		return nil, validation("dateTo", "dateTo is before dateFrom.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	record := &StayRestriction{ID: newID(), RoomTypeID: roomTypeID, DateFrom: from, DateTo: to, MinStay: minStay, ClosedToArrival: closedToArrival}
	s.restrictions = append(s.restrictions, record)
	s.emit("restriction", "restriction-changed", map[string]any{"roomTypeId": roomTypeID, "dateFrom": from, "dateTo": to})
	return record, nil
}

// UpsertDiscount records one named discount.
func (s *Store) UpsertDiscount(name, kind string, valueMinor int64) (*Discount, *OpError) {
	if kind != "percent" && kind != "amount" {
		return nil, validation("kind", "kind must be percent or amount.")
	}
	if valueMinor < 0 {
		return nil, validation("valueMinor", "valueMinor cannot be negative.")
	}
	if kind == "percent" && valueMinor > 100 {
		return nil, validation("valueMinor", "percent discounts cannot exceed 100.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.discounts[name]; ok {
		existing.Kind = kind
		existing.ValueMinor = valueMinor
		return existing, nil
	}
	record := &Discount{ID: newID(), Name: name, Kind: kind, ValueMinor: valueMinor}
	s.discounts[name] = record
	s.emit("discount", "discount-changed", map[string]any{"discountName": name})
	return record, nil
}

// Quote prices a stay from the plan prices in force (FR-RTE-5, BR-13).
func (s *Store) Quote(roomTypeID, arrival, departure string, planName, discountName *string) (*Quote, *OpError) {
	arrivalDay, err := parseDate(arrival, "arrivalDate")
	if err != nil {
		return nil, err
	}
	departureDay, err := parseDate(departure, "departureDate")
	if err != nil {
		return nil, err
	}
	nights := nightsBetween(arrivalDay, departureDay)
	if len(nights) == 0 {
		return nil, validation("departureDate", "departureDate must be after arrivalDate.")
	}
	if len(nights) > 730 {
		return nil, validation("departureDate", "Quote ranges longer than 730 nights are not supported in the skeleton.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	plan, oerr := s.quotePlan(roomTypeID, planName)
	if oerr != nil {
		return nil, oerr
	}
	quoted := &Quote{RoomTypeID: roomTypeID, ArrivalDate: arrival, Departure: departure}
	for _, night := range nights {
		key := priceKey(plan.Name, roomTypeID, night.Format(dateLayout))
		price, ok := s.prices[key]
		if !ok {
			return nil, notFound(fmt.Sprintf("No priced night for the type on %s.", night.Format(dateLayout)), map[string]any{"roomTypeId": roomTypeID, "nightDate": night.Format(dateLayout)})
		}
		quoted.Nights = append(quoted.Nights, NightQuote{NightDate: price.NightDate, PriceMinor: price.PriceMinor})
		quoted.TotalMinor += price.PriceMinor
	}
	if discountName != nil && *discountName != "" {
		discount, ok := s.discounts[*discountName]
		if !ok {
			return nil, validation("discountName", fmt.Sprintf("Unknown discount %s.", *discountName))
		}
		quoted.Discount = discountName
		switch discount.Kind {
		case "percent":
			quoted.TotalMinor = quoted.TotalMinor * (100 - discount.ValueMinor) / 100
		case "amount":
			quoted.TotalMinor -= discount.ValueMinor
			if quoted.TotalMinor < 0 {
				quoted.TotalMinor = 0
			}
		}
	}
	return quoted, nil
}

// CheckRestrictions passes when no window is violated, otherwise it
// refuses naming the restriction (FR-RTE-4).
func (s *Store) CheckRestrictions(roomTypeID, arrival, departure string) *OpError {
	arrivalDay, err := parseDate(arrival, "arrivalDate")
	if err != nil {
		return err
	}
	departureDay, err := parseDate(departure, "departureDate")
	if err != nil {
		return err
	}
	if !departureDay.After(arrivalDay) {
		return validation("departureDate", "departureDate must be after arrivalDate.")
	}
	nights := len(nightsBetween(arrivalDay, departureDay))
	lastNight := departureDay.AddDate(0, 0, -1).Format(dateLayout)
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, restriction := range s.restrictions {
		if restriction.RoomTypeID != roomTypeID {
			continue
		}
		if restriction.DateFrom > lastNight || restriction.DateTo < arrival {
			continue
		}
		if restriction.ClosedToArrival && restriction.DateFrom <= arrival && arrival <= restriction.DateTo {
			return stateIllegal(fmt.Sprintf("Room type is closed to arrival on %s.", arrival), map[string]any{"roomTypeId": roomTypeID, "restriction": "closed-to-arrival", "dateFrom": restriction.DateFrom, "dateTo": restriction.DateTo})
		}
		if restriction.MinStay != nil && nights < *restriction.MinStay {
			return stateIllegal(fmt.Sprintf("Minimum stay of %d nights applies for the requested dates.", *restriction.MinStay), map[string]any{"roomTypeId": roomTypeID, "restriction": "min-stay", "minStay": *restriction.MinStay, "dateFrom": restriction.DateFrom, "dateTo": restriction.DateTo})
		}
	}
	return nil
}

// CheckSellableCount returns the per-date inventory input for the
// type. The authoritative booking guard stays in the Reservations
// store transaction; this call reports the cached input (FR-RTE-2).
func (s *Store) CheckSellableCount(roomTypeID, from, to string, totalUnits *int) ([]DayCount, *OpError) {
	fromDay, err := parseDate(from, "dateFrom")
	if err != nil {
		return nil, err
	}
	toDay, err := parseDate(to, "dateTo")
	if err != nil {
		return nil, err
	}
	if toDay.Before(fromDay) {
		return nil, validation("dateTo", "dateTo is before dateFrom.")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	units := totalUnits
	if units == nil {
		for _, plan := range s.sortedPlans() {
			if plan.DefaultUnits != nil && s.planPricesType(plan.Name, roomTypeID) {
				units = plan.DefaultUnits
				break
			}
		}
	}
	if units == nil {
		known := false
		for _, price := range s.prices {
			if price.RoomTypeID == roomTypeID {
				known = true
				break
			}
		}
		if !known && totalUnits == nil {
			return nil, notFound(fmt.Sprintf("Unknown room type %s.", roomTypeID), map[string]any{"roomTypeId": roomTypeID})
		}
		if !known {
			return nil, validation("totalUnits", "No inventory input for the room type.")
		}
		fallback := 0
		units = &fallback
	}
	var counts []DayCount
	for day := fromDay; !day.After(toDay); day = day.AddDate(0, 0, 1) {
		counts = append(counts, DayCount{Date: day.Format(dateLayout), SellableCount: *units})
	}
	return counts, nil
}

func (s *Store) quotePlan(roomTypeID string, planName *string) (*RatePlan, *OpError) {
	if planName != nil && *planName != "" {
		plan, ok := s.plans[*planName]
		if !ok {
			return nil, notFound(fmt.Sprintf("Unknown rate plan %s.", *planName), map[string]any{"ratePlanName": *planName})
		}
		return plan, nil
	}
	var candidates []*RatePlan
	for _, plan := range s.sortedPlans() {
		if s.planPricesType(plan.Name, roomTypeID) {
			candidates = append(candidates, plan)
		}
	}
	if len(candidates) == 1 {
		return candidates[0], nil
	}
	if len(candidates) == 0 {
		return nil, notFound("No priced nights for the room type and dates.", map[string]any{"roomTypeId": roomTypeID})
	}
	return nil, validation("ratePlanName", "Several plans price the type; name the rate plan.")
}

func (s *Store) planPricesType(planName, roomTypeID string) bool {
	for _, price := range s.prices {
		if price.RatePlanName == planName && price.RoomTypeID == roomTypeID {
			return true
		}
	}
	return false
}

func (s *Store) sortedPlans() []*RatePlan {
	plans := make([]*RatePlan, 0, len(s.plans))
	for _, plan := range s.plans {
		plans = append(plans, plan)
	}
	sort.Slice(plans, func(i, j int) bool { return plans[i].Name < plans[j].Name })
	return plans
}

func (s *Store) emit(aggregate, eventType string, payload map[string]any) {
	s.events = append(s.events, map[string]any{"aggregate": aggregate, "eventType": eventType, "payload": payload})
}
