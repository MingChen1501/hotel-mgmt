package com.hotel.billing.web;

import com.hotel.billing.service.BillingService;
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
      throw ApiException.validation(field, field + " is required.");
    }
    return value.strip();
  }

  private static long amountOf(Map<String, Object> body, String field) {
    Object value = body.get(field);
    if (value instanceof Number number) {
      return number.longValue();
    }
    throw ApiException.validation(field, field + " is required.");
  }

  private void requireToken(String authorization) {
    if (authorization == null || !authorization.startsWith("Bearer ")
        || authorization.substring("Bearer ".length()).isBlank()) {
      throw new ApiException("UNAUTHENTICATED", 401, "Missing session token.", Map.of());
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

  @PostMapping("/UpsertChargeItem")
  public Map<String, Object> upsertChargeItem(@RequestHeader(value = "Authorization", required = false)
  String authorization, @RequestBody Map<String, Object> body) {
    requireToken(authorization);
    return service.upsertChargeItem(required(body, "name"), amountOf(body, "priceMinor"), actor(body));
  }
}
