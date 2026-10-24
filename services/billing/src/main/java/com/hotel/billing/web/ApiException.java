package com.hotel.billing.web;

import java.util.Map;

// Envelope error (docs/technical/error-handling.md section 1) carried
// as a runtime exception from controllers and services; the advice
// below renders the shared code/message/details/traceId body.
public class ApiException extends RuntimeException {

  private final String code;
  private final int status;
  private final Map<String, Object> details;

  public ApiException(String code, int status, String message, Map<String, Object> details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }

  public String code() {
    return code;
  }

  public int status() {
    return status;
  }

  public Map<String, Object> details() {
    return details;
  }

  public static ApiException validation(String field, String message) {
    return new ApiException("VALIDATION_FAILED", 400, message, Map.of("field", field));
  }

  public static ApiException notFound(String message, Map<String, Object> details) {
    return new ApiException("NOT_FOUND", 404, message, details);
  }

  public static ApiException settlementRequired(String message) {
    return new ApiException("SETTLEMENT_REQUIRED", 409, message, Map.of());
  }
}
