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
	"fmt"
	"strings"
	"time"

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
	var createdAt time.Time
	if err := row.Scan(
		&record.ID, &record.Ref, &arrival, &departure,
		&record.RoomTypeID, &record.GuestID, &guestSnapshot, &priceBasis,
		&record.State, &stayID, &record.CreatedBy, &createdAt,
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
	record.CreatedAt = createdAt.UTC()
	return record, nil
}

const reservationColumns = `id, reference, arrival_date::text, departure_date::text,
	room_type_id, guest_id, guest_snapshot, price_basis,
	state, stay_id, created_by, created_at`

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
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
				return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
				return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
			}
			original, oerr := p.getInTx(tx, originalRef)
			if oerr != nil {
				return nil, oerr
			}
			if err := tx.Commit(); err != nil {
				return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
	}
	if err := tx.Commit(); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
		return nil, notFound(fmt.Sprintf("Unknown reservation %s.", ref), map[string]any{"reservationRef": ref})
	}
	if err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
		return nil, notFound(fmt.Sprintf("Unknown reservation %s.", ref), map[string]any{"reservationRef": ref})
	}
	if err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
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
			Message: fmt.Sprintf("Reservation %s is %s, not confirmed for check-in.", ref, record.State),
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
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
	}
	payload := marshalJSON(map[string]any{"reservationRef": record.Ref, "stayId": stayID})
	if _, err := tx.Exec(
		`INSERT INTO reservations.outbox (aggregate, event_type, payload, occurred_at, created_by)
		 VALUES ('reservation','checked-in',$1::jsonb,now(),$2)`,
		payload, actor,
	); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
	}
	if err := tx.Commit(); err != nil {
		return nil, &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
	}
	committed = true
	record.State = "checked-in"
	record.StayID = stayID
	return record, nil
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
	return &OpError{Code: "VALIDATION_FAILED", Status: 500, Message: "Reservation store unavailable.", Details: map[string]any{}}
}
