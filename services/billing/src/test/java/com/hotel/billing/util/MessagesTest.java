package com.hotel.billing.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.Test;

// The catalogue-coverage guard for NFR-I18N-1 on the Spring stack:
// every sampled billing envelope string resolves via the catalogue,
// locale number formatting applies to integer params, and the
// default-locale rendering stays byte-identical to the legacy
// literals this catalogue replaces.
class MessagesTest {

  @Test
  void defaultLocaleIsEnglish() {
    assertEquals("en", Messages.locale());
  }

  @Test
  void sampledBillingMessagesRenderByteIdentical() {
    assertEquals("stayId must be a UUID.",
        Messages.text("error.validation.must_be_uuid", Map.of("field", "stayId")));
    assertEquals("folioId must be a UUID.",
        Messages.text("error.validation.must_be_uuid", Map.of("field", "folioId")));
    assertEquals("paymentId must be a UUID.",
        Messages.text("error.validation.must_be_uuid", Map.of("field", "paymentId")));
    assertEquals("actor is required.",
        Messages.text("error.validation.field_required", Map.of("field", "actor")));
    assertEquals("itemKind must be nightly-room-charge or charge-item.",
        Messages.text("error.validation.item_kind", Map.of()));
    assertEquals("itemName is required.",
        Messages.text("error.validation.field_required", Map.of("field", "itemName")));
    assertEquals("amountMinor cannot be negative.",
        Messages.text("error.validation.amount_negative", Map.of()));
    assertEquals("Charge item minibar is not defined.",
        Messages.text("error.validation.item_undefined", Map.of("itemName", "minibar")));
    assertEquals("method must be cash or card.",
        Messages.text("error.validation.method", Map.of()));
    assertEquals("amountMinor must be positive.",
        Messages.text("error.validation.amount_positive", Map.of()));
    assertEquals("No day-close run for 2026-10-26.",
        Messages.text("error.notfound.day_close", Map.of("businessDate", "2026-10-26")));
    assertEquals("No folio for f-1.",
        Messages.text("error.notfound.folio", Map.of("folioId", "f-1")));
    assertEquals("No payment for p-1.",
        Messages.text("error.notfound.payment", Map.of("paymentId", "p-1")));
    assertEquals("No folio for payment p-1.",
        Messages.text("error.notfound.folio_payment", Map.of("paymentId", "p-1")));
    assertEquals("approvedBy is required.",
        Messages.text("error.validation.field_required", Map.of("field", "approvedBy")));
    assertEquals("role is required.",
        Messages.text("error.validation.field_required", Map.of("field", "role")));
    assertEquals("name is required.",
        Messages.text("error.validation.field_required", Map.of("field", "name")));
    assertEquals("priceMinor cannot be negative.",
        Messages.text("error.validation.price_negative", Map.of()));
    assertEquals("percent must be between 0 and 100.",
        Messages.text("error.validation.percent_range",
            Map.of("min", Messages.formatNumber(0), "max", Messages.formatNumber(100))));
    assertEquals("businessDate must be a YYYY-MM-DD date.",
        Messages.text("error.validation.business_date", Map.of()));
    assertEquals("Missing session token.",
        Messages.text("error.auth.missing_token", Map.of()));
    assertEquals("stayId is required.",
        Messages.text("error.validation.field_required", Map.of("field", "stayId")));
    assertEquals("amountMinor must be a number.",
        Messages.text("error.validation.field_number", Map.of("field", "amountMinor")));
  }

  @Test
  void unknownKeysRenderAMarker() {
    assertTrue(Messages.text("error.does.not_exist", Map.of()).startsWith("message-missing:"));
  }

  @Test
  void formattersFollowTheActiveLocale() {
    assertEquals("1,234,567", Messages.formatNumber(1234567, Locale.forLanguageTag("en")));
    assertEquals("1.234.567", Messages.formatNumber(1234567, Locale.forLanguageTag("de")));
    assertEquals("0", Messages.formatNumber(0, Locale.forLanguageTag("en")));
    assertEquals("100", Messages.formatNumber(100, Locale.forLanguageTag("en")));
    assertEquals("USD 1,234.56",
        Messages.formatMoney(123456, "USD", Locale.forLanguageTag("en")));
    assertEquals("1.234,56 USD",
        Messages.formatMoney(123456, "USD", Locale.forLanguageTag("de")));
    assertEquals("Oct 24, 2026",
        Messages.formatDate(LocalDate.of(2026, 10, 24), Locale.forLanguageTag("en")));
  }
}
