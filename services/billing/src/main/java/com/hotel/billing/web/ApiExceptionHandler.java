package com.hotel.billing.web;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import com.hotel.billing.util.Messages;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

// Renders every failure with the shared error envelope
// {code, message, details, traceId} (contracts/errors/envelope.json;
// docs/technical/error-handling.md section 1). An ApiException keeps
// its own code and status; an unreadable body, an unknown path, a
// wrong method, and any unexpected failure used to reach Spring's
// default /error body and now answer the same envelope (Refs #629).
@RestControllerAdvice
public class ApiExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  private static Map<String, Object> envelope(String code, String message, Map<String, Object> details) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("code", code);
    body.put("message", message);
    body.put("details", details == null ? Map.of() : details);
    body.put("traceId", UUID.randomUUID().toString());
    return body;
  }

  private static ResponseEntity<Map<String, Object>> refusal(String code, int status, String key) {
    return ResponseEntity.status(status).body(envelope(code, Messages.text(key, Map.of()), Map.of()));
  }

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handle(ApiException err) {
    return ResponseEntity.status(err.status()).body(envelope(err.code(), err.getMessage(), err.details()));
  }

  // A body Spring cannot read: malformed JSON, a JSON value that is
  // not an object, a missing body, or an unreadable stream. Every one
  // is the caller's input (VALIDATION_FAILED, 400), never a fault.
  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<Map<String, Object>> handleUnreadableBody(HttpMessageNotReadableException err) {
    Throwable cause = err.getCause();
    String key;
    if (cause instanceof MismatchedInputException) {
      key = "error.transport.body_not_object";
    } else if (cause instanceof JsonProcessingException) {
      key = "error.transport.bad_json";
    } else {
      key = "error.transport.body_read_failed";
    }
    return refusal("VALIDATION_FAILED", 400, key);
  }

  // A path no route claims: 404 NOT_FOUND in the envelope instead of
  // Spring's default error body.
  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<Map<String, Object>> handleUnknownPath(NoResourceFoundException err) {
    return refusal("NOT_FOUND", 404, "error.transport.unknown_path");
  }

  // A known route reached with the wrong method: a caller-conformance
  // answer (405 METHOD_NOT_ALLOWED), carrying the allowed methods in
  // the Allow header as Spring would.
  @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
  public ResponseEntity<Map<String, Object>> handleWrongMethod(HttpRequestMethodNotSupportedException err) {
    HttpHeaders headers = new HttpHeaders();
    if (err.getSupportedHttpMethods() != null) {
      headers.setAllow(err.getSupportedHttpMethods());
    }
    return ResponseEntity.status(405).headers(headers)
        .body(envelope("METHOD_NOT_ALLOWED", Messages.text("error.transport.method_not_allowed", Map.of()), Map.of()));
  }

  // Anything else is an unexpected fault: a 500 envelope with the
  // plain unexpected-failure sentence and empty details, never a
  // driver, SQL, host, path, or stack-trace text. The failure itself
  // stays server-side in the log, keyed by the traceId on the answer.
  @ExceptionHandler(Exception.class)
  public ResponseEntity<Map<String, Object>> handleUnexpected(Exception err) {
    Map<String, Object> body = envelope("INTERNAL_ERROR", Messages.text("error.transport.unexpected", Map.of()),
        Map.of());
    log.error("unexpected failure handling a billing request (traceId {})", body.get("traceId"), err);
    return ResponseEntity.status(500).body(body);
  }
}
