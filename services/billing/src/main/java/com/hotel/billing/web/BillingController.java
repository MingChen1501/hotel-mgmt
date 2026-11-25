package com.hotel.billing.web;

import com.hotel.billing.service.BillingService;
import com.hotel.billing.util.Messages;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// BillingService HTTP adapters (LLD section 6, issue #149):
// POST /v1/billing/<Operation> with the shared error envelope.
// Skeleton identity check: every /v1/* call must carry a Bearer
// session token; local HMAC validation with bounded revalidation
// lands with the identity hardening slice.
@RestController
@RequestMapping(path = "/v1/billing", produces = MediaType.APPLICATION_JSON_VALUE)
public class BillingController {

  private final BillingService service;

  // BR-61 (Refs #635): one declared ceiling for every money field, in
  // minor units. A code constant, never configuration (D-35). It sits
  // below 2^53 so every accepted amount round-trips exactly through
  // JSON and the stored long, and it keeps more than 15 times of
  // headroom over the largest legitimate single charge (65 700 000 000
  // minor units: 730 nights at the standard rate). Package visibility
  // lets the guard read the declaration instead of repeating the
  // literal.
  static final long MONEY_CEILING_MINOR = 1_000_000_000_000L;

  public BillingController(BillingService service) {
    this.service = service;
  }

  private static String actor(Map<String, Object> body) {
    Object actor = body.get("actor");
    return actor instanceof String text ? text : "";
  }

  private static String optional(Map<String, Object> body, String field) {
    Object value = body.get(field);
    return value instanceof String text ? text : null;
  }

  private static String required(Map<String, Object> body, String field) {
    String value = optional(body, field);
    if (value == null || value.isBlank()) {
      throw ApiException.validation(field, Messages.text("error.validation.field_required", Map.of("field", field)));
    }
    return value.strip();
  }

  // Money is a whole number of minor units bounded by one declared
  // ceiling (BR-61, Refs #635). Presence, type, whole-ness, and bound
  // stay in this one helper, the single place every money field passes
  // through before its service call, so the rule has no second copy to
  // drift from. A refusal is raised here, so no service, store, or
  // folio call runs and nothing is written.
  private static long amountOf(Map<String, Object> body, String field) {
    Object value = body.get(field);
    if (value == null) {
      throw ApiException.validation(field, Messages.text("error.validation.field_required", Map.of("field", field)));
    }
    if (!(value instanceof Number number)) {
      throw ApiException.validation(field, Messages.text("error.validation.field_number", Map.of("field", field)));
    }
    // Whole-ness is read from the decimal spelling (the conversion
    // percentOf already uses), so 12.0 is the whole amount 12 and is
    // accepted exactly as 12 is, while 12.99 is refused instead of
    // truncated. A value that cannot be read as a decimal number (NaN,
    // Infinity) is not a whole number of minor units either.
    BigDecimal amount;
    try {
      amount = new BigDecimal(number.toString());
    } catch (NumberFormatException e) {
      throw ApiException.validation(field,
          Messages.text("error.validation.amount_not_integer", Map.of("field", field)));
    }
    BigDecimal whole = amount.stripTrailingZeros();
    if (whole.scale() > 0) {
      throw ApiException.validation(field,
          Messages.text("error.validation.amount_not_integer", Map.of("field", field)));
    }
    // The bound is on the magnitude, so a huge negative refuses here
    // while an in-range negative passes and keeps the service's sign
    // refusal (BillingService, owner of that rule).
    if (whole.abs().compareTo(BigDecimal.valueOf(MONEY_CEILING_MINOR)) > 0) {
      throw ApiException.validation(field, Messages.text("error.validation.amount_above_ceiling",
          Map.of("field", field, "max", Messages.formatNumber(MONEY_CEILING_MINOR))));
    }
    return whole.longValueExact();
  }

  // The tax-rule percent is bounded as a number, not as money: a
  // fractional rate such as 8.5 stays accepted and the 0-100 range
  // stays the service's. A present value that is not a number names the
  // field with field_number instead of the missing-field sentence.
  private static BigDecimal percentOf(Map<String, Object> body, String field) {
    Object value = body.get(field);
    if (value == null) {
      throw ApiException.validation(field, Messages.text("error.validation.field_required", Map.of("field", field)));
    }
    if (!(value instanceof Number number)) {
      throw ApiException.validation(field, Messages.text("error.validation.field_number", Map.of("field", field)));
    }
    try {
      return new BigDecimal(number.toString());
    } catch (NumberFormatException e) {
      throw ApiException.validation(field, Messages.text("error.validation.field_number", Map.of("field", field)));
    }
  }

  private void requireToken(String authorization) {
    if (authorization == null || !authorization.startsWith("Bearer ")
        || authorization.substring("Bearer ".length()).isBlank()) {
      throw new ApiException("UNAUTHENTICATED", 401, Messages.text("error.auth.missing_token", Map.of()), Map.of());
    }
  }

  @PostMapping("/GetFolioBalance")
  public BillingService.FolioView getFolioBalance(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.getFolioBalance(required(body, "stayId"), actor(body));
  }

  @PostMapping("/PostCharge")
  public BillingService.LineView postCharge(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.postCharge(required(body, "stayId"), required(body, "itemKind"), required(body, "itemName"),
        amountOf(body, "amountMinor"), optional(body, "idempotencyKey"), actor(body));
  }

  @PostMapping("/RecordPayment")
  public BillingService.PaymentView recordPayment(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.recordPayment(required(body, "stayId"), required(body, "method"), amountOf(body, "amountMinor"),
        optional(body, "idempotencyKey"), actor(body));
  }

  @PostMapping("/RunDayClose")
  public BillingService.DayCloseView runDayClose(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.runDayClose(required(body, "businessDate"), actor(body));
  }

  @PostMapping("/GetDayClose")
  public BillingService.DayCloseView getDayClose(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.getDayClose(required(body, "businessDate"));
  }

  @PostMapping("/ProduceInvoice")
  public BillingService.InvoiceView produceInvoice(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.produceInvoice(required(body, "folioId"), actor(body));
  }

  @PostMapping("/ProduceReceipt")
  public BillingService.ReceiptView produceReceipt(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.produceReceipt(required(body, "paymentId"), actor(body));
  }

  @PostMapping("/UpsertChargeItem")
  public Map<String, Object> upsertChargeItem(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.upsertChargeItem(required(body, "name"), amountOf(body, "priceMinor"), actor(body));
  }

  // Stores one hotel tax rule driving the PostCharge derivation
  // (FR-BIL-5, issue #190); mirrors UpsertChargeItem.
  @PostMapping("/UpsertTaxFeeRule")
  public Map<String, Object> upsertTaxFeeRule(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.upsertTaxFeeRule(required(body, "name"), percentOf(body, "percent"), actor(body));
  }

  @PostMapping("/RecordOpenBalanceApproval")
  public BillingService.ApprovalView recordOpenBalanceApproval(
      @RequestHeader(value = "Authorization", required = false)
      String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.recordOpenBalanceApproval(required(body, "stayId"), required(body, "approvedBy"),
        required(body, "role"), optional(body, "reason"), optional(body, "idempotencyKey"), actor(body));
  }
}
