// The catalogue-coverage guard for NFR-I18N-1 on the Go stack: every
// sampled rates envelope string resolves via the catalogue,
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
		{"error.validation.field_required", map[string]string{"field": "ratePlanName"}, "ratePlanName is required."},
		{"rates.validation.date_format", map[string]string{"field": "nightDate"}, "nightDate must be a YYYY-MM-DD date."},
		{"error.validation.price_negative", nil, "priceMinor cannot be negative."},
		{"rates.notfound.rate_plan", map[string]string{"ratePlanName": "E2E-RACK"}, "Unknown rate plan E2E-RACK."},
		{"rates.validation.discount_kind", nil, "kind must be percent or amount."},
		{"rates.validation.value_negative", nil, "valueMinor cannot be negative."},
		{"rates.validation.percent_cap", nil, "percent discounts cannot exceed 100."},
		{"rates.validation.quote_range", nil, "Quote ranges longer than 730 nights are not supported in the skeleton."},
		{"rates.notfound.priced_night", map[string]string{"nightDate": "2026-11-01"}, "No priced night for the type on 2026-11-01."},
		{"rates.validation.unknown_discount", map[string]string{"discountName": "E2E-10"}, "Unknown discount E2E-10."},
		{"rates.state.closed_to_arrival", map[string]string{"arrivalDate": "2026-11-01"}, "Room type is closed to arrival on 2026-11-01."},
		{"rates.state.min_stay", map[string]string{"minStay": Num(3)}, "Minimum stay of 3 nights applies for the requested dates."},
		{"rates.notfound.room_type", map[string]string{"roomTypeId": "STD"}, "Unknown room type STD."},
		{"rates.validation.no_inventory", nil, "No inventory input for the room type."},
		{"rates.notfound.priced_nights", nil, "No priced nights for the room type and dates."},
		{"rates.validation.ambiguous_plan", nil, "Several plans price the type; name the rate plan."},
		{"rates.validation.default_units", nil, "defaultUnits must be a non-negative integer."},
		{"rates.validation.min_stay", nil, "minStay must be a positive integer."},
		{"rates.validation.total_units", nil, "totalUnits must be a non-negative integer."},
		{"error.validation.date_range_order", nil, "dateTo is before dateFrom."},
		{"error.validation.departure_order", nil, "departureDate must be after arrivalDate."},
		{"rates.store.unavailable", nil, "Pricing store unavailable."},
	}
	for _, tc := range cases {
		if got := Default().Text(tc.key, tc.params); got != tc.want {
			t.Errorf("Text(%q) = %q, want %q", tc.key, got, tc.want)
		}
	}
}

func TestUnknownKeyRendersMarker(t *testing.T) {
	got := Default().Text("rates.does.not_exist", nil)
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
