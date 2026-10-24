// Package messages resolves user-visible strings from the shared
// message catalogue (messages/en.json) for NFR-I18N-1, per api-spec
// section 1. The catalogue file is embedded at compile time so the
// service binary carries its strings; setting MESSAGE_CATALOGUE_PATH
// points the loader at a live file instead (catalogue updates without
// a rebuild). Patterns use {name} placeholders substituted verbatim.
// Numeric values pass through FormatNumber so digit grouping follows
// the active locale. Behaviour never branches on resolved wording:
// callers switch on envelope codes, not messages.
package messages

import (
	"embed"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"sync"
	"time"
)

//go:embed en.json
var embedded embed.FS

type fileCatalogue struct {
	Locale   string            `json:"locale"`
	Messages map[string]string `json:"messages"`
}

// Catalogue is one loaded locale of the message catalogue.
type Catalogue struct {
	locale  string
	entries map[string]string
}

var (
	defaultOnce sync.Once
	defaultCat  *Catalogue
)

// errEmpty rejects catalogue files without a locale or messages.
var errEmpty = errors.New("messages: catalogue has no locale or no messages")

// Load reads one catalogue file and returns it. The file must match
// messages/schema.json: a locale tag plus a key-to-pattern map.
func Load(path string) (*Catalogue, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return parse(raw)
}

func parse(raw []byte) (*Catalogue, error) {
	var file fileCatalogue
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	if err := decoder.Decode(&file); err != nil {
		return nil, err
	}
	if file.Locale == "" || len(file.Messages) == 0 {
		return nil, errEmpty
	}
	return &Catalogue{locale: file.Locale, entries: file.Messages}, nil
}

// mustEmbedded loads the compiled-in default-locale catalogue. The
// file is checked in and verified byte-identical to messages/en.json
// by the coverage script, so a parse failure here is a programming
// error, not a runtime condition.
func mustEmbedded() *Catalogue {
	raw, err := embedded.ReadFile("en.json")
	if err != nil {
		panic(err)
	}
	cat, err := parse(raw)
	if err != nil {
		panic(err)
	}
	return cat
}

// Default returns the active catalogue: the MESSAGE_CATALOGUE_PATH
// file when set, otherwise the embedded default-locale copy.
func Default() *Catalogue {
	defaultOnce.Do(func() {
		defaultCat = mustEmbedded()
		if path := strings.TrimSpace(os.Getenv("MESSAGE_CATALOGUE_PATH")); path != "" {
			if loaded, err := Load(path); err == nil {
				defaultCat = loaded
			}
		}
	})
	return defaultCat
}

// Locale reports the catalogue locale tag (for example "en").
func (c *Catalogue) Locale() string { return c.locale }

// Text renders one catalogue pattern with the given params. Unknown
// keys render a visible marker so a missing key can never silently
// pass as a blank desk message; the coverage script fails the build
// on unknown keys before they reach production.
func (c *Catalogue) Text(key string, params map[string]string) string {
	pattern, ok := c.entries[key]
	if !ok {
		return "message-missing:" + key
	}
	if len(params) == 0 {
		return pattern
	}
	replacer := make([]string, 0, len(params)*2)
	for name, value := range params {
		replacer = append(replacer, "{"+name+"}", value)
	}
	return strings.NewReplacer(replacer...).Replace(pattern)
}

// Text renders one pattern from the active catalogue.
func Text(key string, params map[string]string) string {
	return Default().Text(key, params)
}

// Num formats an integer in the catalogue locale for pattern params.
func (c *Catalogue) Num(n int64) string {
	return FormatNumber(c.locale, n)
}

// Num formats an integer in the active catalogue locale.
func Num(n int64) string {
	return Default().Num(n)
}

type separators struct {
	thousands string
	decimal   string
}

// groupSeparators is locale formatting data (digit grouping only, not
// translations): how each supported locale groups digits. Unknown
// locales fall back to the default locale.
var groupSeparators = map[string]separators{
	"en": {thousands: ",", decimal: "."},
	"de": {thousands: ".", decimal: ","},
	"vi": {thousands: ".", decimal: ","},
}

func separatorsFor(locale string) separators {
	if sep, ok := groupSeparators[strings.ToLower(locale)]; ok {
		return sep
	}
	return groupSeparators["en"]
}

func groupDigits(digits, sep string) string {
	negative := strings.HasPrefix(digits, "-")
	trimmed := strings.TrimPrefix(digits, "-")
	if len(trimmed) <= 3 {
		return digits
	}
	var out []byte
	lead := len(trimmed) % 3
	if lead > 0 {
		out = append(out, trimmed[:lead]...)
	}
	for i := lead; i < len(trimmed); i += 3 {
		if len(out) > 0 {
			out = append(out, sep...)
		}
		out = append(out, trimmed[i:i+3]...)
	}
	if negative {
		return "-" + string(out)
	}
	return string(out)
}

// FormatNumber renders an integer with the active locale's digit
// grouping (for example 1234567 as "1,234,567" in en).
func FormatNumber(locale string, n int64) string {
	digits := itoa(n)
	return groupDigits(digits, separatorsFor(locale).thousands)
}

func itoa(n int64) string {
	negative := n < 0
	if negative {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	if n == 0 {
		i--
		buf[i] = '0'
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if negative {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// FormatMoney renders a minor-unit amount with the active locale's
// grouping and decimal mark plus the currency code, which travels
// with the value (amounts stay integers in minor units on the wire).
func FormatMoney(locale string, minor int64, currencyCode string) string {
	sep := separatorsFor(locale)
	negative := minor < 0
	if negative {
		minor = -minor
	}
	major := itoa(minor / 100)
	cents := itoa(minor % 100)
	if len(cents) == 1 {
		cents = "0" + cents
	}
	amount := groupDigits(major, sep.thousands) + sep.decimal + cents
	if negative {
		amount = "-" + amount
	}
	if strings.ToLower(locale) == "en" {
		return currencyCode + " " + amount
	}
	return amount + " " + currencyCode
}

// dateLayouts is locale formatting data (presentation order only, not
// translations) for calendar dates.
var dateLayouts = map[string]string{
	"en": "Jan 2, 2006",
	"de": "2.1.2006",
	"vi": "02/01/2006",
}

func dateLayoutFor(locale string) string {
	if layout, ok := dateLayouts[strings.ToLower(locale)]; ok {
		return layout
	}
	return dateLayouts["en"]
}

// FormatDate renders a calendar date in the active locale's order.
func FormatDate(locale string, t time.Time) string {
	return t.Format(dateLayoutFor(locale))
}
