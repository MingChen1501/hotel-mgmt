// Postgres-backed PricingService store (issue #149).
//
// Implements Repository against the rates schema
// (docs/technical/schema.md section 4): nightly prices in minor
// currency units, stay restrictions per type and range, named
// discounts kept by name. Guard shapes mirror the in-memory store:
// restriction checks name the violated restriction (FR-RTE-4), the
// quoted basis is frozen at booking (BR-13), and every change writes
// an outbox row.
package store

import (
	"database/sql"
	"encoding/json"
	"sort"
	"strings"

	"github.com/MingChen1501/hotel-mgmt/services/rates/internal/messages"
	_ "github.com/lib/pq"
)

// Postgres is a Repository over a live *sql.DB.
type Postgres struct {
	db *sql.DB
}

// OpenPostgres opens and pings the shared engine. The caller passes
// DATABASE_URL (postgresql://...), already wired in
// deploy/compose.yaml. lib/pq negotiates SSL by default
// (sslmode=require) but the on-premise engine ships no certificates,
// so a URL without an explicit sslmode dials plaintext on the hotel
// LAN — the same link the Node and Java modules use.
func OpenPostgres(url string) (*sql.DB, error) {
	if !strings.Contains(url, "sslmode=") {
		separator := "?"
		if strings.Contains(url, "?") {
			separator = "&"
		}
		url += separator + "sslmode=disable"
	}
	db, err := sql.Open("postgres", url)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

// NewPostgres returns a Repository over db.
func NewPostgres(db *sql.DB) *Postgres {
	return &Postgres{db: db}
}

func storeFailure() *OpError {
	return &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("rates.store.unavailable", nil), Details: map[string]any{}}
}

func pgMarshal(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func (p *Postgres) outbox(aggregate, eventType string, payload map[string]any, actor string) {
	if actor == "" {
		actor = "system"
	}
	_, _ = p.db.Exec(
		`INSERT INTO rates.outbox (aggregate, event_type, payload, occurred_at, created_by)
		 VALUES ($1,$2,$3::jsonb,now(),$4)`,
		aggregate, eventType, pgMarshal(payload), actor,
	)
}

// UpsertRatePlan creates or updates a named plan. An update without
// defaultUnits keeps the stored value, matching the in-memory store.
func (p *Postgres) UpsertRatePlan(name, description string, defaultUnits *int) *RatePlan {
	plan := &RatePlan{Name: name, Description: description, DefaultUnits: defaultUnits}
	var units sql.NullInt64
	if defaultUnits != nil {
		units = sql.NullInt64{Int64: int64(*defaultUnits), Valid: true}
	}
	var id string
	var stored sql.NullInt64
	err := p.db.QueryRow(
		`INSERT INTO rates.rate_plans (name, description, default_units, created_by, updated_by)
		 VALUES ($1,$2,$3,'system','system')
		 ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description,
		   default_units = COALESCE(EXCLUDED.default_units, rates.rate_plans.default_units),
		   updated_at = now()
		 RETURNING id, default_units`,
		name, description, units,
	).Scan(&id, &stored)
	if err != nil {
		return plan
	}
	plan.ID = id
	if stored.Valid {
		value := int(stored.Int64)
		plan.DefaultUnits = &value
	} else {
		plan.DefaultUnits = nil
	}
	p.outbox("rate-plan", "rate-plan-changed", map[string]any{"ratePlanName": name}, "system")
	return plan
}

// UpsertRatePrice sets one nightly price.
func (p *Postgres) UpsertRatePrice(planName, roomTypeID, night string, priceMinor int64) (*RatePrice, *OpError) {
	if priceMinor < 0 {
		return nil, validation("priceMinor", messages.Text("error.validation.price_negative", nil))
	}
	if _, err := parseDate(night, "nightDate"); err != nil {
		return nil, err
	}
	var planID string
	if err := p.db.QueryRow(`SELECT id FROM rates.rate_plans WHERE name = $1`, planName).Scan(&planID); err != nil {
		if err == sql.ErrNoRows {
			return nil, notFound(messages.Text("rates.notfound.rate_plan", map[string]string{"ratePlanName": planName}), map[string]any{"ratePlanName": planName})
		}
		return nil, storeFailure()
	}
	var id string
	if err := p.db.QueryRow(
		`INSERT INTO rates.rate_prices
		  (rate_plan_id, room_type_id, night_date, price_minor, created_by, updated_by)
		 VALUES ($1,$2,$3,$4,'system','system')
		 ON CONFLICT (rate_plan_id, room_type_id, night_date)
		 DO UPDATE SET price_minor = EXCLUDED.price_minor, updated_at = now()
		 RETURNING id`,
		planID, roomTypeID, night, priceMinor,
	).Scan(&id); err != nil {
		if strings.Contains(err.Error(), "22P02") {
			return nil, validation("roomTypeId", messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))
		}
		return nil, storeFailure()
	}
	p.outbox("rate-plan", "rate-plan-changed", map[string]any{"ratePlanName": planName}, "system")
	return &RatePrice{RatePlanName: planName, RoomTypeID: roomTypeID, NightDate: night, PriceMinor: priceMinor}, nil
}

// UpsertRestriction records one stay-restriction window.
func (p *Postgres) UpsertRestriction(roomTypeID, from, to string, minStay *int, closedToArrival bool) (*StayRestriction, *OpError) {
	if _, err := parseDate(from, "dateFrom"); err != nil {
		return nil, err
	}
	if _, err := parseDate(to, "dateTo"); err != nil {
		return nil, err
	}
	if to < from {
		return nil, validation("dateTo", "dateTo is before dateFrom.")
	}
	var minStayValue sql.NullInt64
	if minStay != nil {
		minStayValue = sql.NullInt64{Int64: int64(*minStay), Valid: true}
	}
	var id string
	if err := p.db.QueryRow(
		`INSERT INTO rates.stay_restrictions
		  (room_type_id, date_from, date_to, min_stay, closed_to_arrival, created_by, updated_by)
		 VALUES ($1,$2,$3,$4,$5,'system','system') RETURNING id`,
		roomTypeID, from, to, minStayValue, closedToArrival,
	).Scan(&id); err != nil {
		if strings.Contains(err.Error(), "22P02") {
			return nil, validation("roomTypeId", messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))
		}
		return nil, storeFailure()
	}
	p.outbox("restriction", "restriction-changed", map[string]any{"roomTypeId": roomTypeID, "dateFrom": from, "dateTo": to}, "system")
	return &StayRestriction{ID: id, RoomTypeID: roomTypeID, DateFrom: from, DateTo: to, MinStay: minStay, ClosedToArrival: closedToArrival}, nil
}

// UpsertDiscount records one named discount.
func (p *Postgres) UpsertDiscount(name, kind string, valueMinor int64) (*Discount, *OpError) {
	if kind != "percent" && kind != "amount" {
		return nil, validation("kind", messages.Text("rates.validation.discount_kind", nil))
	}
	if valueMinor < 0 {
		return nil, validation("valueMinor", messages.Text("rates.validation.value_negative", nil))
	}
	if kind == "percent" && valueMinor > 100 {
		return nil, validation("valueMinor", messages.Text("rates.validation.percent_cap", nil))
	}
	var id string
	if err := p.db.QueryRow(
		`INSERT INTO rates.discounts (name, kind, value_minor, created_by, updated_by)
		 VALUES ($1,$2,$3,'system','system')
		 ON CONFLICT (name) DO UPDATE SET kind = EXCLUDED.kind,
		   value_minor = EXCLUDED.value_minor, updated_at = now()
		 RETURNING id`,
		name, kind, valueMinor,
	).Scan(&id); err != nil {
		return nil, storeFailure()
	}
	p.outbox("discount", "discount-changed", map[string]any{"discountName": name}, "system")
	return &Discount{ID: id, Name: name, Kind: kind, ValueMinor: valueMinor}, nil
}

func (p *Postgres) loadPlans() ([]*RatePlan, error) {
	rows, err := p.db.Query(`SELECT id, name, description, default_units FROM rates.rate_plans`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var plans []*RatePlan
	for rows.Next() {
		var plan RatePlan
		var description sql.NullString
		var units sql.NullInt64
		if err := rows.Scan(&plan.ID, &plan.Name, &description, &units); err != nil {
			return nil, err
		}
		if description.Valid {
			plan.Description = description.String
		}
		if units.Valid {
			value := int(units.Int64)
			plan.DefaultUnits = &value
		}
		plans = append(plans, &plan)
	}
	return plans, rows.Err()
}

func (p *Postgres) planPricesType(planName, roomTypeID string) bool {
	var count int
	if err := p.db.QueryRow(
		`SELECT count(*) FROM rates.rate_prices rp
		  JOIN rates.rate_plans plan ON plan.id = rp.rate_plan_id
		  WHERE plan.name = $1 AND rp.room_type_id = $2`,
		planName, roomTypeID,
	).Scan(&count); err != nil {
		return false
	}
	return count > 0
}

// Quote prices a stay from the plan prices in force (FR-RTE-5, BR-13).
func (p *Postgres) Quote(roomTypeID, arrival, departure string, planName, discountName *string) (*Quote, *OpError) {
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
	plans, loadErr := p.loadPlans()
	if loadErr != nil {
		return nil, storeFailure()
	}
	sort.Slice(plans, func(i, j int) bool { return plans[i].Name < plans[j].Name })
	plan, oerr := p.quotePlan(roomTypeID, planName, plans)
	if oerr != nil {
		return nil, oerr
	}
	quoted := &Quote{RoomTypeID: roomTypeID, ArrivalDate: arrival, Departure: departure}
	for _, night := range nights {
		var priceMinor int64
		qerr := p.db.QueryRow(
			`SELECT rp.price_minor FROM rates.rate_prices rp
			  JOIN rates.rate_plans plan ON plan.id = rp.rate_plan_id
			  WHERE plan.name = $1 AND rp.room_type_id = $2 AND rp.night_date = $3`,
			plan.Name, roomTypeID, night.Format(dateLayout),
		).Scan(&priceMinor)
		if qerr != nil {
			if qerr == sql.ErrNoRows {
				return nil, notFound(messages.Text("rates.notfound.priced_night", map[string]string{"nightDate": night.Format(dateLayout)}), map[string]any{"roomTypeId": roomTypeID, "nightDate": night.Format(dateLayout)})
			}
			return nil, storeFailure()
		}
		quoted.Nights = append(quoted.Nights, NightQuote{NightDate: night.Format(dateLayout), PriceMinor: priceMinor})
		quoted.TotalMinor += priceMinor
	}
	if discountName != nil && *discountName != "" {
		var kind string
		var valueMinor int64
		if qerr := p.db.QueryRow(`SELECT kind, value_minor FROM rates.discounts WHERE name = $1`, *discountName).Scan(&kind, &valueMinor); qerr != nil {
			if qerr == sql.ErrNoRows {
				return nil, validation("discountName", messages.Text("rates.validation.unknown_discount", map[string]string{"discountName": *discountName}))
			}
			return nil, storeFailure()
		}
		quoted.Discount = discountName
		switch kind {
		case "percent":
			quoted.TotalMinor = quoted.TotalMinor * (100 - valueMinor) / 100
		case "amount":
			quoted.TotalMinor -= valueMinor
			if quoted.TotalMinor < 0 {
				quoted.TotalMinor = 0
			}
		}
	}
	return quoted, nil
}

// CheckRestrictions passes when no window is violated, otherwise it
// refuses naming the restriction (FR-RTE-4).
func (p *Postgres) CheckRestrictions(roomTypeID, arrival, departure string) *OpError {
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
	rows, qerr := p.db.Query(
		`SELECT date_from::text, date_to::text, min_stay, closed_to_arrival
		  FROM rates.stay_restrictions WHERE room_type_id = $1`,
		roomTypeID,
	)
	if qerr != nil {
		if strings.Contains(qerr.Error(), "22P02") {
			return validation("roomTypeId", messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))
		}
		return storeFailure()
	}
	defer rows.Close()
	for rows.Next() {
		var from, to string
		var minStay sql.NullInt64
		var closed bool
		if err := rows.Scan(&from, &to, &minStay, &closed); err != nil {
			return storeFailure()
		}
		if from > lastNight || to < arrival {
			continue
		}
		if closed && from <= arrival && arrival <= to {
			return stateIllegal(messages.Text("rates.state.closed_to_arrival", map[string]string{"arrivalDate": arrival}), map[string]any{"roomTypeId": roomTypeID, "restriction": "closed-to-arrival", "dateFrom": from, "dateTo": to})
		}
		if minStay.Valid && nights < int(minStay.Int64) {
			return stateIllegal(messages.Text("rates.state.min_stay", map[string]string{"minStay": messages.Num(minStay.Int64)}), map[string]any{"roomTypeId": roomTypeID, "restriction": "min-stay", "minStay": minStay.Int64, "dateFrom": from, "dateTo": to})
		}
	}
	if err := rows.Err(); err != nil {
		return storeFailure()
	}
	return nil
}

// CheckSellableCount returns the per-date inventory input for the
// type. The authoritative booking guard stays in the Reservations
// store transaction; this call reports the cached input (FR-RTE-2).
func (p *Postgres) CheckSellableCount(roomTypeID, from, to string, totalUnits *int) ([]DayCount, *OpError) {
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
	units := totalUnits
	if units == nil {
		plans, lerr := p.loadPlans()
		if lerr != nil {
			return nil, storeFailure()
		}
		sort.Slice(plans, func(i, j int) bool { return plans[i].Name < plans[j].Name })
		for _, plan := range plans {
			if plan.DefaultUnits != nil && p.planPricesType(plan.Name, roomTypeID) {
				units = plan.DefaultUnits
				break
			}
		}
	}
	if units == nil {
		var known int
		if qerr := p.db.QueryRow(`SELECT count(*) FROM rates.rate_prices WHERE room_type_id = $1`, roomTypeID).Scan(&known); qerr != nil {
			if strings.Contains(qerr.Error(), "22P02") {
				return nil, validation("roomTypeId", messages.Text("error.validation.must_be_uuid", map[string]string{"field": "roomTypeId"}))
			}
			return nil, storeFailure()
		}
		if known == 0 && totalUnits == nil {
			return nil, notFound(messages.Text("rates.notfound.room_type", map[string]string{"roomTypeId": roomTypeID}), map[string]any{"roomTypeId": roomTypeID})
		}
		if known == 0 {
			return nil, validation("totalUnits", messages.Text("rates.validation.no_inventory", nil))
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

func (p *Postgres) quotePlan(roomTypeID string, planName *string, plans []*RatePlan) (*RatePlan, *OpError) {
	if planName != nil && *planName != "" {
		for _, plan := range plans {
			if plan.Name == *planName {
				return plan, nil
			}
		}
		return nil, notFound(messages.Text("rates.notfound.rate_plan", map[string]string{"ratePlanName": *planName}), map[string]any{"ratePlanName": *planName})
	}
	var candidates []*RatePlan
	for _, plan := range plans {
		if p.planPricesType(plan.Name, roomTypeID) {
			candidates = append(candidates, plan)
		}
	}
	if len(candidates) == 1 {
		return candidates[0], nil
	}
	if len(candidates) == 0 {
		return nil, notFound(messages.Text("rates.notfound.priced_nights", nil), map[string]any{"roomTypeId": roomTypeID})
	}
	return nil, validation("ratePlanName", messages.Text("rates.validation.ambiguous_plan", nil))
}
