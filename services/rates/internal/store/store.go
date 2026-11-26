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
	"math"
	"sort"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
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

// Rate-plan text bounds (FR-RTE-10, BR-68, Refs #633). One declared
// bound per field, counted in Unicode code points on the value as
// stored; code constants, never configuration, applied on write only.
// Exported so the handler refuses at the read site with the same two
// numbers the stores re-check.
const (
	MaxPlanNameRunes        = 64
	MaxPlanDescriptionRunes = 2000
)

// uuidShape accepts the canonical 8-4-4-4-12 hexadecimal form the
// Postgres column takes. The Postgres store surfaces the driver's
// 22P02 answer for anything else; the in-memory store must refuse the
// same requests instead of appending a row that matches nothing
// (FR-RTE-7).
func uuidShape(value string) bool {
	if len(value) != 36 {
		return false
	}
	for i := 0; i < len(value); i++ {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if value[i] != '-' {
				return false
			}
			continue
		}
		c := value[i]
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}

// planTextBound refuses one rate-plan text field above its bound
// (FR-RTE-10). The sentence carries the bound through {max}.
func planTextBound(field, value string, max int) *OpError {
	if utf8.RuneCountInString(value) <= max {
		return nil
	}
	return validation(field, messages.Text("rates.validation.text_length", map[string]string{
		"field": field,
		"max":   messages.Num(int64(max)),
	}))
}

// planText applies both declared bounds to one plan write.
func planText(name, description string) *OpError {
	if oerr := planTextBound("name", name, MaxPlanNameRunes); oerr != nil {
		return oerr
	}
	return planTextBound("description", description, MaxPlanDescriptionRunes)
}

// totalOverflow is the unrepresentable-quote refusal (FR-RTE-9): the
// request is well formed, so the answer is a state refusal naming the
// type and the reason the desk already reads (#589 slot), and no total
// or partial night list is returned.
func totalOverflow(roomTypeID string) *OpError {
	return stateIllegal(messages.Text("rates.state.total_overflow", nil), map[string]any{
		"field":      "roomTypeId",
		"roomTypeId": roomTypeID,
		"reason":     "total_overflow",
	})
}

// checkedAdd reports whether a+b stays inside the int64 range.
func checkedAdd(a, b int64) (int64, bool) {
	sum := a + b
	if (b > 0 && sum < a) || (b < 0 && sum > a) {
		return 0, false
	}
	return sum, true
}

// checkedMul reports whether a*b stays inside the int64 range. Both
// quote operands are non-negative by construction (stored prices and
// the 0..100 percent factor), but the guard covers the whole range so
// a later sign change cannot reopen the hole (LLD section 37.3).
func checkedMul(a, b int64) (int64, bool) {
	if a == 0 || b == 0 {
		return 0, true
	}
	if (a == math.MinInt64 && b == -1) || (b == math.MinInt64 && a == -1) {
		return 0, false
	}
	product := a * b
	if product/b != a {
		return 0, false
	}
	return product, true
}

// checkedSub reports whether a-b stays inside the int64 range.
func checkedSub(a, b int64) (int64, bool) {
	diff := a - b
	if (b < 0 && diff < a) || (b > 0 && diff > a) {
		return 0, false
	}
	return diff, true
}

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
		return time.Time{}, validation(field, messages.Text("rates.validation.date_format", map[string]string{"field": field}))
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

// Repository is the store contract the handler programs against.
// New returns the in-memory implementation used in unit tests;
// NewPostgres (postgres.go) returns the Postgres-backed implementation
// used when DATABASE_URL is set. Both keep the same pricing semantics.
type Repository interface {
	UpsertRatePlan(name, description string, defaultUnits *int) (*RatePlan, *OpError)
	UpsertRatePrice(planName, roomTypeID, night string, priceMinor int64) (*RatePrice, *OpError)
	UpsertRestriction(roomTypeID, from, to string, minStay *int, closedToArrival bool) (*StayRestriction, *OpError)
	UpsertDiscount(name, kind string, valueMinor int64) (*Discount, *OpError)
	Quote(roomTypeID, arrival, departure string, planName, discountName *string) (*Quote, *OpError)
	CheckRestrictions(roomTypeID, arrival, departure string) *OpError
	// CheckSellableCount takes no caller unit count: the answer is the
	// server's plan default, else 0 (FR-RTE-8, BR-68, Refs #633).
	CheckSellableCount(roomTypeID, from, to string) ([]DayCount, *OpError)
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

// UpsertRatePlan creates or updates a named plan. Both text fields are
// bounded on write (FR-RTE-10, Refs #633); a refused write stores
// nothing and emits no event.
func (s *Store) UpsertRatePlan(name, description string, defaultUnits *int) (*RatePlan, *OpError) {
	if oerr := planText(name, description); oerr != nil {
		return nil, oerr
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if existing, ok := s.plans[name]; ok {
		existing.Description = description
		if defaultUnits != nil {
			existing.DefaultUnits = defaultUnits
		}
		return existing, nil
	}
	plan := &RatePlan{ID: newID(), Name: name, Description: description, DefaultUnits: defaultUnits}
	s.plans[name] = plan
	s.emit("rate-plan", "rate-plan-changed", map[string]any{"ratePlanName": name})
	return plan, nil
}

// UpsertRatePrice sets one nightly price.
func (s *Store) UpsertRatePrice(planName, roomTypeID, night string, priceMinor int64) (*RatePrice, *OpError) {
	if priceMinor < 0 {
		return nil, validation("priceMinor", messages.Text("error.validation.price_negative", nil))
	}
	if _, err := parseDate(night, "nightDate"); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.plans[planName]; !ok {
		return nil, notFound(messages.Text("rates.notfound.rate_plan", map[string]string{"ratePlanName": planName}), map[string]any{"ratePlanName": planName})
	}
	record := &RatePrice{RatePlanName: planName, RoomTypeID: roomTypeID, NightDate: night, PriceMinor: priceMinor}
	s.prices[priceKey(planName, roomTypeID, night)] = record
	s.emit("rate-plan", "rate-plan-changed", map[string]any{"ratePlanName": planName})
	return record, nil
}

// UpsertRestriction records one stay-restriction window. A typo'd or
// unpriced room type is refused before the append, so no window can
// exist that matches nothing (FR-RTE-7, Refs #633).
func (s *Store) UpsertRestriction(roomTypeID, from, to string, minStay *int, closedToArrival bool) (*StayRestriction, *OpError) {
	if _, err := parseDate(from, "dateFrom"); err != nil {
		return nil, err
	}
	if _, err := parseDate(to, "dateTo"); err != nil {
		return nil, err
	}
	if to < from {
		return nil, validation("dateTo", messages.Text("error.validation.date_range_order", nil))
	}
	if !uuidShape(roomTypeID) {
		return nil, validation("roomTypeId", messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.pricedType(roomTypeID) {
		return nil, notFound(messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": roomTypeID}), map[string]any{"roomTypeId": roomTypeID})
	}
	record := &StayRestriction{ID: newID(), RoomTypeID: roomTypeID, DateFrom: from, DateTo: to, MinStay: minStay, ClosedToArrival: closedToArrival}
	s.restrictions = append(s.restrictions, record)
	s.emit("restriction", "restriction-changed", map[string]any{"roomTypeId": roomTypeID, "dateFrom": from, "dateTo": to})
	return record, nil
}

// pricedType reports whether any plan carries a rate price row for the
// type. A plan defaultUnits is not a price (BR-44).
func (s *Store) pricedType(roomTypeID string) bool {
	for _, price := range s.prices {
		if price.RoomTypeID == roomTypeID {
			return true
		}
	}
	return false
}

// UpsertDiscount records one named discount.
func (s *Store) UpsertDiscount(name, kind string, valueMinor int64) (*Discount, *OpError) {
	if kind != "percent" && kind != "amount" {
		return nil, validation("kind", messages.Text("rates.validation.discount_kind", nil))
	}
	if valueMinor < 0 {
		return nil, validation("valueMinor", messages.Text("rates.validation.value_negative", nil))
	}
	if kind == "percent" && valueMinor > 100 {
		return nil, validation("valueMinor", messages.Text("rates.validation.percent_cap", nil))
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
		return nil, validation("departureDate", messages.Text("error.validation.departure_order", nil))
	}
	if len(nights) > 730 {
		return nil, validation("departureDate", messages.Text("rates.validation.quote_range", nil))
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
			// Refs #589: details.reason lets the desk mark the type
			// not-yet-operational (no rate price for the window)
			// instead of showing a generic failure.
			return nil, notFound(messages.Text("rates.notfound.priced_night", map[string]string{"nightDate": night.Format(dateLayout)}), map[string]any{"roomTypeId": roomTypeID, "nightDate": night.Format(dateLayout), "reason": "no_rate_price"})
		}
		total, ok := checkedAdd(quoted.TotalMinor, price.PriceMinor)
		if !ok {
			return nil, totalOverflow(roomTypeID)
		}
		quoted.Nights = append(quoted.Nights, NightQuote{NightDate: price.NightDate, PriceMinor: price.PriceMinor})
		quoted.TotalMinor = total
	}
	if discountName != nil && *discountName != "" {
		discount, ok := s.discounts[*discountName]
		if !ok {
			return nil, validation("discountName", messages.Text("rates.validation.unknown_discount", map[string]string{"discountName": *discountName}))
		}
		quoted.Discount = discountName
		switch discount.Kind {
		case "percent":
			product, ok := checkedMul(quoted.TotalMinor, 100-discount.ValueMinor)
			if !ok {
				return nil, totalOverflow(roomTypeID)
			}
			quoted.TotalMinor = product / 100
		case "amount":
			diff, ok := checkedSub(quoted.TotalMinor, discount.ValueMinor)
			if !ok {
				return nil, totalOverflow(roomTypeID)
			}
			quoted.TotalMinor = diff
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
		return validation("departureDate", messages.Text("error.validation.departure_order", nil))
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
			return stateIllegal(messages.Text("rates.state.closed_to_arrival", map[string]string{"arrivalDate": arrival}), map[string]any{"roomTypeId": roomTypeID, "restriction": "closed-to-arrival", "dateFrom": restriction.DateFrom, "dateTo": restriction.DateTo})
		}
		if restriction.MinStay != nil && nights < *restriction.MinStay {
			return stateIllegal(messages.Text("rates.state.min_stay", map[string]string{"minStay": messages.Num(int64(*restriction.MinStay))}), map[string]any{"roomTypeId": roomTypeID, "restriction": "min-stay", "minStay": *restriction.MinStay, "dateFrom": restriction.DateFrom, "dateTo": restriction.DateTo})
		}
	}
	return nil
}

// CheckSellableCount returns the per-date inventory input for the
// type. The answer is the first plan in name order that prices the
// type and carries a defaultUnits, else 0; the caller's totalUnits is
// never consulted (FR-RTE-8, BR-68, Refs #633). The authoritative
// booking guard stays in the Reservations store transaction.
func (s *Store) CheckSellableCount(roomTypeID, from, to string) ([]DayCount, *OpError) {
	fromDay, err := parseDate(from, "dateFrom")
	if err != nil {
		return nil, err
	}
	toDay, err := parseDate(to, "dateTo")
	if err != nil {
		return nil, err
	}
	if toDay.Before(fromDay) {
		return nil, validation("dateTo", messages.Text("error.validation.date_range_order", nil))
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.pricedType(roomTypeID) {
		return nil, notFound(messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": roomTypeID}), map[string]any{"roomTypeId": roomTypeID})
	}
	units := 0
	for _, plan := range s.sortedPlans() {
		if plan.DefaultUnits != nil && s.planPricesType(plan.Name, roomTypeID) {
			units = *plan.DefaultUnits
			break
		}
	}
	var counts []DayCount
	for day := fromDay; !day.After(toDay); day = day.AddDate(0, 0, 1) {
		counts = append(counts, DayCount{Date: day.Format(dateLayout), SellableCount: units})
	}
	return counts, nil
}

func (s *Store) quotePlan(roomTypeID string, planName *string) (*RatePlan, *OpError) {
	if planName != nil && *planName != "" {
		plan, ok := s.plans[*planName]
		if !ok {
			return nil, notFound(messages.Text("rates.notfound.rate_plan", map[string]string{"ratePlanName": *planName}), map[string]any{"ratePlanName": *planName})
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
		// Refs #589: no plan prices the type at all, so the type is
		// not yet operational; details.reason carries that cause.
		return nil, notFound(messages.Text("rates.notfound.priced_nights", nil), map[string]any{"roomTypeId": roomTypeID, "reason": "no_rate_plan"})
	}
	return nil, validation("ratePlanName", messages.Text("rates.validation.ambiguous_plan", nil))
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
