package com.hotel.billing.util;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

// Resolves user-visible strings from the shared message catalogue
// (messages/en.json) for NFR-I18N-1, per api-spec section 1. The
// default-locale copy ships as a classpath resource; setting
// MESSAGE_CATALOGUE_PATH points the loader at a live file instead
// (catalogue updates without a rebuild). Patterns use {name}
// placeholders substituted verbatim. Integer values pass through
// formatNumber so digit grouping follows the active locale. Behaviour
// never branches on resolved wording: callers switch on envelope
// codes, not messages.
public final class Messages {

  private Messages() {
  }

  private record Catalogue(String locale, Map<String, String> messages) {
  }

  private static final AtomicReference<Catalogue> ACTIVE = new AtomicReference<>();

  private static Catalogue loadDefault() {
    try {
      String override = System.getenv("MESSAGE_CATALOGUE_PATH");
      if (override != null && !override.isBlank()) {
        return parse(Files.readString(Path.of(override.strip())));
      }
      try (InputStream in = Messages.class.getResourceAsStream("/messages/en.json")) {
        if (in == null) {
          throw new IOException("classpath resource /messages/en.json is missing");
        }
        return parse(new String(in.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
      }
    } catch (IOException e) {
      throw new IllegalStateException("billing message catalogue is unavailable", e);
    }
  }

  static Catalogue parse(String raw) throws IOException {
    Map<String, Object> file =
        new ObjectMapper().readValue(raw, new TypeReference<Map<String, Object>>() {
        });
    Object locale = file.get("locale");
    Object messages = file.get("messages");
    if (!(locale instanceof String tag) || tag.isBlank() || !(messages instanceof Map)) {
      throw new IOException("catalogue has no locale or no messages");
    }
    @SuppressWarnings("unchecked")
    Map<String, String> entries = (Map<String, String>) messages;
    return new Catalogue(tag, Map.copyOf(entries));
  }

  private static Catalogue active() {
    Catalogue loaded = ACTIVE.get();
    if (loaded == null) {
      loaded = loadDefault();
      ACTIVE.compareAndSet(null, loaded);
      loaded = ACTIVE.get();
    }
    return loaded;
  }

  /** The active catalogue locale tag (for example "en"). */
  public static String locale() {
    return active().locale();
  }

  /**
   * Render one catalogue pattern with the given params. Unknown keys
   * render a visible marker so a missing key can never silently pass
   * as a blank desk message; the coverage script fails the build on
   * unknown keys before they reach production.
   */
  public static String text(String key, Map<String, Object> params) {
    String pattern = active().messages().get(key);
    if (pattern == null) {
      return "message-missing:" + key;
    }
    String rendered = pattern;
    for (Map.Entry<String, Object> entry : params.entrySet()) {
      rendered = rendered.replace("{" + entry.getKey() + "}", String.valueOf(entry.getValue()));
    }
    return rendered;
  }

  /** Active locale override for formatting (MESSAGE_LOCALE),
   * defaulting to the catalogue locale. Message translations are NOT
   * read from here: only the default locale ships; this selects
   * locale data for dates, numbers, and currency. */
  public static Locale activeLocale() {
    String override = System.getenv("MESSAGE_LOCALE");
    if (override != null && !override.isBlank()) {
      return Locale.forLanguageTag(override.strip());
    }
    return Locale.forLanguageTag(locale());
  }

  /** Integer with the active locale's digit grouping ("1,234,567" in en). */
  public static String formatNumber(long n) {
    return formatNumber(n, activeLocale());
  }

  static String formatNumber(long n, Locale locale) {
    return NumberFormat.getIntegerInstance(locale).format(n);
  }

  /**
   * Minor-unit amount with the active locale's grouping and decimal
   * mark plus the currency code, which travels with the value
   * (amounts stay integers in minor units on the wire).
   */
  public static String formatMoney(long minor, String currencyCode) {
    return formatMoney(minor, currencyCode, activeLocale());
  }

  static String formatMoney(long minor, String currencyCode, Locale locale) {
    NumberFormat numbers = NumberFormat.getNumberInstance(locale);
    numbers.setMinimumFractionDigits(2);
    numbers.setMaximumFractionDigits(2);
    String amount = numbers.format(BigDecimal.valueOf(minor, 2));
    if (locale.getLanguage().equalsIgnoreCase("en")) {
      return currencyCode + " " + amount;
    }
    return amount + " " + currencyCode;
  }

  /** Calendar date in the active locale's order ("Oct 24, 2026" in en). */
  public static String formatDate(LocalDate date) {
    return formatDate(date, activeLocale());
  }

  static String formatDate(LocalDate date, Locale locale) {
    return DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(date);
  }
}
