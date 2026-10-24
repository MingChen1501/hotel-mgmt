// Postgres-backed ReservationService store (issue #149).
//
// Implements Repository against the reservations schema
// (docs/technical/schema.md section 1). The overbooking guard
// (NFR-CON-1) runs in one transaction: count overlapping confirmed
// and checked-in rows for the type/dates, insert only when capacity
// remains, and persist the idempotency key, change history, and
// outbox event in the same commit. Checked-in rows cover the
// in-house share, so the guard never reads another schema.
package store

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"

	"github.com/MingChen1501/hotel-mgmt/services/reservations/internal/messages"
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

func marshalJSON(value any) string {
	raw, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func priceBasisJSON(total int64, discount *string) string {
	doc := map[string]any{"totalMinor": total}
	if discount != nil {
		doc["discountName"] = *discount
	} else {
		doc["discountName"] = nil
	}
	return marshalJSON(doc)
}

func parsePriceBasis(raw string, record *Reservation) {
	var doc struct {
		TotalMinor   int64   `json:"totalMinor"`
		DiscountName *string `json:"discountName"`
	}
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return
	}
	record.TotalMinor = doc.TotalMinor
	record.DiscountName = doc.DiscountName
}

func parseGuestSnapshot(raw string) map[string]any {
	guest := map[string]any{}
	if raw == "" {
		return guest
	}
	_ = json.Unmarshal([]byte(raw), &guest)
	if guest == nil {
		return map[string]any{}
	}
	return guest
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanReservationRows(row rowScanner) (*Reservation, error) {
	record := &Reservation{}
	var arrival, departure string
	var guestSnapshot, priceBasis string
	var stayID sql.NullString
	var cancelReason, noShowReason sql.NullString
	var createdAt time.Time
	if err := row.Scan(
		&record.ID, &record.Ref, &arrival, &departure,
		&record.RoomTypeID, &record.GuestID, &guestSnapshot, &priceBasis,
		&record.State, &cancelReason, &noShowReason, &stayID, &record.CreatedBy, &createdAt,
	); err != nil {
		return nil, err
	}
	record.ArrivalDate = arrival
	record.DepartureDate = departure
	record.Guest = parseGuestSnapshot(guestSnapshot)
	parsePriceBasis(priceBasis, record)
	if stayID.Valid {
		record.StayID = stayID.String
	}
	if cancelReason.Valid {
		value := cancelReason.String
		record.CancelReason = &value
	}
	if noShowReason.Valid {
		value := noShowReason.String
		record.NoShowReason = &value
	}
	record.CreatedAt = createdAt.UTC()
	return record, nil
}

const reservationColumns = `id, reference, arrival_date::text, departure_date::text,
	room_type_id, guest_id, guest_snapshot, price_basis,
	state, cancel_reason, noshow_reason, stay_id, created_by, created_at`

// Create atomically guards and inserts one reservation. When
// idempotencyKey is non-empty, a repeated key returns the original
// reservation instead of booking again (the idempotency_keys UNIQUE
// row wins and the loser's insert rolls back with its transaction).
func (p *Postgres) Create(input CreateInput, idempotencyKey string) (*Reservation, *OpError) {
	if input.SellableUnits < 1 {
		return nil, validation("sellableUnits", "sellableUnits must be at least 1.")
	}
	tx, err := p.db.Begin()
	if err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if idempotencyKey != "" {
		var existingRef string
		err := tx.QueryRow(`SELECT result_ref FROM reservations.idempotency_keys WHERE key = $1`, idempotencyKey).Scan(&existingRef)
		if err == nil && existingRef != "" {
			record, oerr := p.getInTx(tx, existingRef)
			if oerr != nil {
				return nil, oerr
			}
			if err := tx.Commit(); err != nil {
				return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
			}
			committed = true
			return record, nil
		}
	}
	var booked int
	if err := tx.QueryRow(
		`SELECT count(*) FROM reservations.reservations
		  WHERE room_type_id = $1 AND state IN ('confirmed','checked-in')
		    AND arrival_date < $3 AND departure_date > $2`,
		input.RoomTypeID, input.ArrivalDate, input.DepartureDate,
	).Scan(&booked); err != nil {
		return nil, mapDBError(err, "roomTypeId")
	}
	if booked >= input.SellableUnits {
		return nil, conflict(
			messages.Text("error.conflict.no_availability", map[string]string{"arrivalDate": input.ArrivalDate, "departureDate": input.DepartureDate}),
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
	inserted := false
	for attempt := 0; attempt < 5 && !inserted; attempt++ {
		_, err := tx.Exec(
			`INSERT INTO reservations.reservations
			  (id, reference, arrival_date, departure_date, room_type_id, guest_id,
			   guest_snapshot, price_basis, state, created_by, updated_by)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'confirmed',$9,$9)`,
			record.ID, record.Ref, record.ArrivalDate, record.DepartureDate,
			record.RoomTypeID, record.GuestID,
			marshalJSON(input.Guest), priceBasisJSON(input.TotalMinor, input.DiscountName),
			input.Actor,
		)
		if err == nil {
			inserted = true
			break
		}
		if !isUniqueViolation(err) {
			return nil, mapDBError(err, "guest.guestId")
		}
		record.Ref = newRef()
	}
	if !inserted {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	if idempotencyKey != "" {
		var winner string
		err := tx.QueryRow(
			`INSERT INTO reservations.idempotency_keys (key, operation, result_ref)
			 VALUES ($1,'CreateReservation',$2)
			 ON CONFLICT (key) DO NOTHING RETURNING result_ref`,
			idempotencyKey, record.Ref,
		).Scan(&winner)
		if err != nil {
			// Another attempt won the key first: roll back this
			// insert and return the original reservation instead.
			var originalRef string
			if qerr := tx.QueryRow(`SELECT result_ref FROM reservations.idempotency_keys WHERE key = $1`, idempotencyKey).Scan(&originalRef); qerr != nil || originalRef == "" {
				return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
			}
			original, oerr := p.getInTx(tx, originalRef)
			if oerr != nil {
				return nil, oerr
			}
			if err := tx.Commit(); err != nil {
				return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
			}
			committed = true
			return original, nil
		}
		_ = winner
	}
	if _, err := tx.Exec(
		`INSERT INTO reservations.reservation_changes
		  (reservation_id, changed_field, old_value, new_value, created_by)
		 VALUES ($1,'state','null',$2,$3)`,
		record.ID, `"confirmed"`, input.Actor,
	); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	payload := marshalJSON(map[string]any{
		"reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
		"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
		"guestId": record.GuestID, "priceBasisTotal": record.TotalMinor,
	})
	if _, err := tx.Exec(
		`INSERT INTO reservations.outbox (aggregate, event_type, payload, occurred_at, created_by)
		 VALUES ('reservation','created',$1::jsonb,now(),$2)`,
		payload, input.Actor,
	); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	if err := tx.Commit(); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	committed = true
	return record, nil
}

func (p *Postgres) getInTx(tx *sql.Tx, ref string) (*Reservation, *OpError) {
	record, err := scanReservationRows(tx.QueryRow(
		`SELECT `+reservationColumns+` FROM reservations.reservations WHERE reference = $1`,
		strings.TrimSpace(ref),
	))
	if err == sql.ErrNoRows {
		return nil, notFound(messages.Text("error.notfound.reservation", map[string]string{"ref": ref}), map[string]any{"reservationRef": ref})
	}
	if err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	return record, nil
}

// Get returns one reservation by reference.
func (p *Postgres) Get(ref string) (*Reservation, *OpError) {
	record, err := scanReservationRows(p.db.QueryRow(
		`SELECT `+reservationColumns+` FROM reservations.reservations WHERE reference = $1`,
		strings.TrimSpace(ref),
	))
	if err == sql.ErrNoRows {
		return nil, notFound(messages.Text("error.notfound.reservation", map[string]string{"ref": ref}), map[string]any{"reservationRef": ref})
	}
	if err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	return record, nil
}

// Query lists reservations overlapping the range, optionally filtered.
func (p *Postgres) Query(dateFrom, dateTo, roomTypeID string) []*CalendarEntry {
	query := `SELECT reference, room_type_id, arrival_date::text, departure_date::text, state, stay_id
	  FROM reservations.reservations
	  WHERE arrival_date < $2 AND departure_date > $1`
	args := []any{dateFrom, dateTo}
	if roomTypeID != "" {
		query += ` AND room_type_id = $3`
		args = append(args, roomTypeID)
	}
	rows, err := p.db.Query(query, args...)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var entries []*CalendarEntry
	for rows.Next() {
		var entry CalendarEntry
		var arrival, departure string
		var stayID sql.NullString
		if err := rows.Scan(&entry.Ref, &entry.RoomTypeID, &arrival, &departure, &entry.State, &stayID); err != nil {
			return entries
		}
		entry.ArrivalDate = arrival
		entry.DepartureDate = departure
		if stayID.Valid {
			entry.StayID = stayID.String
		}
		entries = append(entries, &entry)
	}
	return entries
}

// CheckIn flips a confirmed reservation to checked-in and links the
// stay created by the Stay module. Re-check-in is refused.
func (p *Postgres) CheckIn(ref, stayID, actor string) (*Reservation, *OpError) {
	tx, err := p.db.Begin()
	if err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	record, oerr := p.getInTx(tx, ref)
	if oerr != nil {
		return nil, oerr
	}
	if record.State != "confirmed" {
		return nil, &OpError{
			Code: "STATE_ILLEGAL", Status: 422,
			Message: messages.Text("error.state.not_confirmed_checkin", map[string]string{"ref": ref, "state": record.State}),
			Details: map[string]any{"reservationRef": ref, "state": record.State},
		}
	}
	if _, err := tx.Exec(
		`UPDATE reservations.reservations
		  SET state = 'checked-in', stay_id = $2, updated_by = $3, updated_at = now()
		  WHERE reference = $1`,
		strings.TrimSpace(ref), stayID, actor,
	); err != nil {
		return nil, mapDBError(err, "stayId")
	}
	if _, err := tx.Exec(
		`INSERT INTO reservations.reservation_changes
		  (reservation_id, changed_field, old_value, new_value, created_by)
		 VALUES ($1,'state','"confirmed"','"checked-in"',$2)`,
		record.ID, actor,
	); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	payload := marshalJSON(map[string]any{"reservationRef": record.Ref, "stayId": stayID})
	if _, err := tx.Exec(
		`INSERT INTO reservations.outbox (aggregate, event_type, payload, occurred_at, created_by)
		 VALUES ('reservation','checked-in',$1::jsonb,now(),$2)`,
		payload, actor,
	); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	if err := tx.Commit(); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
	}
	committed = true
	record.State = "checked-in"
	record.StayID = stayID
	return record, nil
}

// storeUnavailable is the envelope error for unexpected driver
// failures the handler reports without leaking internals.
func storeUnavailable() *OpError {
	return &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
}

// Modify reprices and changes a confirmed reservation (FR-RES-2,
// BR-2). The row is locked, the overbooking guard re-runs for the new
// dates and type excluding the reservation itself, and the update,
// change history, idempotency key, and modified outbox event commit
// together (NFR-CON-1, NFR-AUD-1).
func (p *Postgres) Modify(input ModifyInput, idempotencyKey string) (*Reservation, *OpError) {
	if input.SellableUnits < 1 {
		return nil, validation("sellableUnits", "sellableUnits must be at least 1.")
	}
	tx, err := p.db.Begin()
	if err != nil {
		return nil, storeUnavailable()
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if idempotencyKey != "" {
		var existingRef string
		if err := tx.QueryRow(`SELECT result_ref FROM reservations.idempotency_keys WHERE key = $1`, idempotencyKey).Scan(&existingRef); err == nil && existingRef != "" {
			record, oerr := p.getInTx(tx, existingRef)
			if oerr != nil {
				return nil, oerr
			}
			if err := tx.Commit(); err != nil {
				return nil, storeUnavailable()
			}
			committed = true
			return record, nil
		}
	}
	var record Reservation
	var arrival, departure string
	var guestSnapshot, priceBasis string
	var stayID, cancelReason, noShowReason sql.NullString
	if err := tx.QueryRow(
		`SELECT `+reservationColumns+` FROM reservations.reservations WHERE reference = $1 FOR UPDATE`,
		strings.TrimSpace(input.Ref),
	).Scan(&record.ID, &record.Ref, &arrival, &departure,
		&record.RoomTypeID, &record.GuestID, &guestSnapshot, &priceBasis,
		&record.State, &cancelReason, &noShowReason, &stayID, &record.CreatedBy, &record.CreatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, notFound(messages.Text("error.notfound.reservation", map[string]string{"ref": input.Ref}), map[string]any{"reservationRef": input.Ref})
		}
		return nil, storeUnavailable()
	}
	record.ArrivalDate = arrival
	record.DepartureDate = departure
	record.Guest = parseGuestSnapshot(guestSnapshot)
	parsePriceBasis(priceBasis, &record)
	if stayID.Valid {
		record.StayID = stayID.String
	}
	if record.State != "confirmed" {
		return nil, &OpError{
			Code: "STATE_ILLEGAL", Status: 422,
			Message: messages.Text("error.state.lifecycle_refusal", map[string]string{"ref": input.Ref, "state": record.State, "operation": "modified"}),
			Details: map[string]any{"reservationRef": input.Ref, "state": record.State},
		}
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
	if err := tx.QueryRow(
		`SELECT count(*) FROM reservations.reservations
		  WHERE room_type_id = $1 AND state IN ('confirmed','checked-in')
		    AND arrival_date < $3 AND departure_date > $2 AND reference <> $4`,
		newRoomType, newArrival, newDeparture, strings.TrimSpace(input.Ref),
	).Scan(&booked); err != nil {
		return nil, mapDBError(err, "roomTypeId")
	}
	if booked >= input.SellableUnits {
		return nil, conflict(
			messages.Text("error.conflict.no_availability", map[string]string{"arrivalDate": newArrival, "departureDate": newDeparture}),
			map[string]any{"roomTypeId": newRoomType, "arrivalDate": newArrival, "departureDate": newDeparture},
		)
	}
	newGuestID := record.GuestID
	newGuestSnapshot := guestSnapshot
	if strings.TrimSpace(input.GuestID) != "" && input.GuestID != record.GuestID {
		newGuestID = strings.TrimSpace(input.GuestID)
		newGuestSnapshot = marshalJSON(input.Guest)
	}
	recordChange := func(field, oldValue, newValue string) *OpError {
		if _, err := tx.Exec(
			`INSERT INTO reservations.reservation_changes
			  (reservation_id, changed_field, old_value, new_value, created_by)
			 VALUES ($1,$2,$3::jsonb,$4::jsonb,$5)`,
			record.ID, field, oldValue, newValue, input.Actor,
		); err != nil {
			return storeUnavailable()
		}
		return nil
	}
	if newArrival != record.ArrivalDate || newDeparture != record.DepartureDate {
		if oerr := recordChange("dates",
			marshalJSON(map[string]any{"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate}),
			marshalJSON(map[string]any{"arrivalDate": newArrival, "departureDate": newDeparture})); oerr != nil {
			return nil, oerr
		}
	}
	if newRoomType != record.RoomTypeID {
		if oerr := recordChange("roomTypeId", marshalJSON(record.RoomTypeID), marshalJSON(newRoomType)); oerr != nil {
			return nil, oerr
		}
	}
	if newGuestID != record.GuestID {
		if oerr := recordChange("guestId", marshalJSON(record.GuestID), marshalJSON(newGuestID)); oerr != nil {
			return nil, oerr
		}
	}
	if input.TotalMinor != record.TotalMinor {
		if oerr := recordChange("priceBasis", marshalJSON(record.TotalMinor), marshalJSON(input.TotalMinor)); oerr != nil {
			return nil, oerr
		}
	}
	if _, err := tx.Exec(
		`UPDATE reservations.reservations
		  SET arrival_date = $2, departure_date = $3, room_type_id = $4,
		      guest_id = $5, guest_snapshot = $6, price_basis = $7,
		      updated_by = $8, updated_at = now()
		  WHERE reference = $1`,
		strings.TrimSpace(input.Ref), newArrival, newDeparture, newRoomType,
		newGuestID, newGuestSnapshot, priceBasisJSON(input.TotalMinor, input.DiscountName), input.Actor,
	); err != nil {
		return nil, mapDBError(err, "roomTypeId")
	}
	if idempotencyKey != "" {
		if _, err := tx.Exec(
			`INSERT INTO reservations.idempotency_keys (key, operation, result_ref)
			 VALUES ($1,'ModifyReservation',$2) ON CONFLICT (key) DO NOTHING`,
			idempotencyKey, strings.TrimSpace(input.Ref),
		); err != nil {
			return nil, storeUnavailable()
		}
	}
	payload := marshalJSON(map[string]any{
		"reservationRef": record.Ref, "roomTypeId": newRoomType,
		"arrivalDate": newArrival, "departureDate": newDeparture,
		"guestId": newGuestID, "priceBasisTotal": input.TotalMinor, "actor": input.Actor,
	})
	if _, err := tx.Exec(
		`INSERT INTO reservations.outbox (aggregate, event_type, payload, occurred_at, created_by)
		 VALUES ('reservation','modified',$1::jsonb,now(),$2)`,
		payload, input.Actor,
	); err != nil {
		return nil, storeUnavailable()
	}
	if err := tx.Commit(); err != nil {
		return nil, storeUnavailable()
	}
	committed = true
	updated, oerr := p.Get(input.Ref)
	if oerr != nil {
		return nil, oerr
	}
	return updated, nil
}

// Cancel moves a confirmed reservation to cancelled with the kept
// hotel reason (FR-RES-3, BR-3) in one transaction with its change
// history, idempotency key, and cancelled outbox event. Availability
// releases automatically: the guard counts only confirmed and
// checked-in rows.
func (p *Postgres) Cancel(ref, reason, actor, idempotencyKey string) (*Reservation, *OpError) {
	tx, err := p.db.Begin()
	if err != nil {
		return nil, storeUnavailable()
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if idempotencyKey != "" {
		var existingRef string
		if err := tx.QueryRow(`SELECT result_ref FROM reservations.idempotency_keys WHERE key = $1`, idempotencyKey).Scan(&existingRef); err == nil && existingRef != "" {
			record, oerr := p.getInTx(tx, existingRef)
			if oerr != nil {
				return nil, oerr
			}
			if err := tx.Commit(); err != nil {
				return nil, storeUnavailable()
			}
			committed = true
			return record, nil
		}
	}
	record, oerr := p.getInTx(tx, ref)
	if oerr != nil {
		return nil, oerr
	}
	if strings.TrimSpace(reason) == "" {
		return nil, validation("reason", "A cancellation reason from the hotel list is required.")
	}
	if record.State != "confirmed" {
		return nil, &OpError{
			Code: "STATE_ILLEGAL", Status: 422,
			Message: messages.Text("error.state.lifecycle_refusal", map[string]string{"ref": ref, "state": record.State, "operation": "cancelled"}),
			Details: map[string]any{"reservationRef": ref, "state": record.State},
		}
	}
	kept := strings.TrimSpace(reason)
	if _, err := tx.Exec(
		`UPDATE reservations.reservations
		  SET state = 'cancelled', cancel_reason = $2, updated_by = $3, updated_at = now()
		  WHERE reference = $1`,
		strings.TrimSpace(ref), kept, actor,
	); err != nil {
		return nil, mapDBError(err, "reason")
	}
	if _, err := tx.Exec(
		`INSERT INTO reservations.reservation_changes
		  (reservation_id, changed_field, old_value, new_value, created_by)
		 VALUES ($1,'state','"confirmed"','"cancelled"',$2)`,
		record.ID, actor,
	); err != nil {
		return nil, storeUnavailable()
	}
	if idempotencyKey != "" {
		if _, err := tx.Exec(
			`INSERT INTO reservations.idempotency_keys (key, operation, result_ref)
			 VALUES ($1,'CancelReservation',$2) ON CONFLICT (key) DO NOTHING`,
			idempotencyKey, strings.TrimSpace(ref),
		); err != nil {
			return nil, storeUnavailable()
		}
	}
	payload := marshalJSON(map[string]any{
		"reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
		"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
		"guestId": record.GuestID, "reason": kept, "actor": actor,
	})
	if _, err := tx.Exec(
		`INSERT INTO reservations.outbox (aggregate, event_type, payload, occurred_at, created_by)
		 VALUES ('reservation','cancelled',$1::jsonb,now(),$2)`,
		payload, actor,
	); err != nil {
		return nil, storeUnavailable()
	}
	if err := tx.Commit(); err != nil {
		return nil, storeUnavailable()
	}
	committed = true
	updated, oerr := p.Get(ref)
	if oerr != nil {
		return nil, oerr
	}
	return updated, nil
}

// MarkNoShow moves a confirmed reservation whose arrival date has
// passed without check-in to no-show (FR-RES-6, BR-5) with its change
// history and no-show outbox event in one transaction. No folio
// charge is posted: the no-show charge decision is deferred per LLD D1.
func (p *Postgres) MarkNoShow(ref, reason, actor string) (*Reservation, *OpError) {
	tx, err := p.db.Begin()
	if err != nil {
		return nil, storeUnavailable()
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	record, oerr := p.getInTx(tx, ref)
	if oerr != nil {
		return nil, oerr
	}
	if strings.TrimSpace(reason) == "" {
		return nil, validation("reason", "A no-show reason from the hotel list is required.")
	}
	if record.State != "confirmed" {
		return nil, &OpError{
			Code: "STATE_ILLEGAL", Status: 422,
			Message: messages.Text("error.state.lifecycle_refusal", map[string]string{"ref": ref, "state": record.State, "operation": "marked no-show"}),
			Details: map[string]any{"reservationRef": ref, "state": record.State},
		}
	}
	today := time.Now().UTC().Format(dateLayout)
	if record.ArrivalDate >= today {
		return nil, &OpError{
			Code: "STATE_ILLEGAL", Status: 422,
			Message: messages.Text("error.state.arrival_not_passed", map[string]string{"ref": ref, "arrivalDate": record.ArrivalDate}),
			Details: map[string]any{"reservationRef": ref, "arrivalDate": record.ArrivalDate},
		}
	}
	kept := strings.TrimSpace(reason)
	if _, err := tx.Exec(
		`UPDATE reservations.reservations
		  SET state = 'no-show', noshow_reason = $2, updated_by = $3, updated_at = now()
		  WHERE reference = $1`,
		strings.TrimSpace(ref), kept, actor,
	); err != nil {
		return nil, mapDBError(err, "reason")
	}
	if _, err := tx.Exec(
		`INSERT INTO reservations.reservation_changes
		  (reservation_id, changed_field, old_value, new_value, created_by)
		 VALUES ($1,'state','"confirmed"','"no-show"',$2)`,
		record.ID, actor,
	); err != nil {
		return nil, storeUnavailable()
	}
	payload := marshalJSON(map[string]any{
		"reservationRef": record.Ref, "roomTypeId": record.RoomTypeID,
		"arrivalDate": record.ArrivalDate, "departureDate": record.DepartureDate,
		"guestId": record.GuestID, "reason": kept, "actor": actor,
	})
	if _, err := tx.Exec(
		`INSERT INTO reservations.outbox (aggregate, event_type, payload, occurred_at, created_by)
		 VALUES ('reservation','no-show',$1::jsonb,now(),$2)`,
		payload, actor,
	); err != nil {
		return nil, storeUnavailable()
	}
	if err := tx.Commit(); err != nil {
		return nil, storeUnavailable()
	}
	committed = true
	updated, oerr := p.Get(ref)
	if oerr != nil {
		return nil, oerr
	}
	return updated, nil
}

func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "23505")
}

func isInvalidText(err error) bool {
	return err != nil && strings.Contains(err.Error(), "22P02")
}

// mapDBError turns driver errors into envelope errors: bad UUID text
// becomes a field validation failure, everything else a store
// failure the handler reports without leaking internals.
func mapDBError(err error, field string) *OpError {
	if isInvalidText(err) {
		return validation(field, field+" must be a UUID.")
	}
	return &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: messages.Text("error.store.unavailable", nil), Details: map[string]any{}}
}
