// The catalogue-coverage guard for NFR-I18N-1 on the Go stack: every
// sampled reporting envelope string resolves via the catalogue,
// locale number formatting applies to integer params, and the
// default-locale rendering stays byte-identical to the legacy
// literals this catalogue replaces.
package messages

import (
	"strings"
	"testing"
	"time"
)

func TestDefaultLocaleIsEnglish(t *testing.T) {
	if got := Default().Locale(); got != "en" {
		t.Fatalf("default locale = %q, want en", got)
	}
}

func TestSampledMessagesRenderByteIdentical(t *testing.T) {
	cases := []struct {
		key    string
		params map[string]string
		want   string
	}{
		{"error.transport.bad_json", nil, "Request body is not valid JSON."},
		{"error.auth.missing_token", nil, "Missing session token."},
		{"error.validation.date_from_required", nil, "dateFrom is required."},
		{"error.validation.date_to_required", nil, "dateTo is required."},
		{"reporting.validation.business_date_required", nil, "businessDate is required."},
		{"error.validation.reservation_ref_required", nil, "reservationRef is required."},
		{"error.validation.room_type_required", nil, "roomTypeId is required."},
		{"error.validation.arrival_format", nil, "arrivalDate must be a YYYY-MM-DD date."},
		{"error.validation.stay_id_required", nil, "stayId is required."},
		{"error.validation.date_from_format", nil, "dateFrom must be a YYYY-MM-DD date."},
		{"error.validation.date_to_format", nil, "dateTo must be a YYYY-MM-DD date."},
		{"error.validation.date_range_order", nil, "dateTo is before dateFrom."},
		{"error.validation.business_date", nil, "businessDate must be a YYYY-MM-DD date."},
		{"reporting.validation.event_required", nil, "eventId is required."},
		{"reporting.validation.departure_after_arrival", nil, "departureDate must be a YYYY-MM-DD date after arrivalDate."},
		{"reporting.validation.date_format", map[string]string{"field": "date"}, "date must be a YYYY-MM-DD date."},
		{"reporting.validation.sellable_units", nil, "sellableUnits is required and cannot be negative."},
		{"reporting.validation.folio_required", nil, "folioId is required."},
		{"reporting.validation.kind", nil, "kind must be room or extra."},
		{"reporting.validation.amount", nil, "amountMinor is required and cannot be negative."},
		{"reporting.validation.room_required", nil, "roomNumber is required."},
		{"reporting.validation.state_required", nil, "state is required."},
		{"reporting.validation.new_state_required", nil, "newState is required."},
		{"reporting.validation.date_to_order", nil, "dateTo must be a YYYY-MM-DD date on or after dateFrom."},
	}
	for _, tc := range cases {
		if got := Default().Text(tc.key, tc.params); got != tc.want {
			t.Errorf("Text(%q) = %q, want %q", tc.key, got, tc.want)
		}
	}
}

func TestUnknownKeyRendersMarker(t *testing.T) {
	got := Default().Text("reporting.does.not_exist", nil)
	if !strings.HasPrefix(got, "message-missing:") {
		t.Fatalf("unknown key rendered %q, want message-missing marker", got)
	}
}

func TestFormatNumberFollowsLocale(t *testing.T) {
	if got := FormatNumber("en", 1234567); got != "1,234,567" {
		t.Errorf("en FormatNumber = %q, want 1,234,567", got)
	}
	if got := FormatNumber("de", 1234567); got != "1.234.567" {
		t.Errorf("de FormatNumber = %q, want 1.234.567", got)
	}
	if got := FormatNumber("vi", 1234567); got != "1.234.567" {
		t.Errorf("vi FormatNumber = %q, want 1.234.567", got)
	}
	if got := FormatNumber("xx", 1234567); got != "1,234,567" {
		t.Errorf("unknown locale FormatNumber = %q, want en fallback 1,234,567", got)
	}
	if got := FormatNumber("en", 15); got != "15" {
		t.Errorf("small FormatNumber = %q, want 15", got)
	}
}

func TestFormatMoneyFollowsLocale(t *testing.T) {
	if got := FormatMoney("en", 123456, "USD"); got != "USD 1,234.56" {
		t.Errorf("en FormatMoney = %q, want USD 1,234.56", got)
	}
	if got := FormatMoney("de", 123456, "USD"); got != "1.234,56 USD" {
		t.Errorf("de FormatMoney = %q, want 1.234,56 USD", got)
	}
}

func TestFormatDateFollowsLocale(t *testing.T) {
	day := time.Date(2026, time.October, 24, 0, 0, 0, 0, time.UTC)
	if got := FormatDate("en", day); got != "Oct 24, 2026" {
		t.Errorf("en FormatDate = %q, want Oct 24, 2026", got)
	}
	if got := FormatDate("de", day); got != "24.10.2026" {
		t.Errorf("de FormatDate = %q, want 24.10.2026", got)
	}
	if got := FormatDate("xx", day); got != "Oct 24, 2026" {
		t.Errorf("unknown locale FormatDate = %q, want en fallback", got)
	}
}

func TestLoadRejectsBadFiles(t *testing.T) {
	if _, err := Load("/nonexistent/messages.json"); err == nil {
		t.Error("Load of a missing file must fail")
	}
}
