package com.hotel.billing.web;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

// Renders every ApiException with the shared error envelope.
@RestControllerAdvice
public class ApiExceptionHandler {

  @ExceptionHandler(ApiException.class)
  public ResponseEntity<Map<String, Object>> handle(ApiException err) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("code", err.code());
    body.put("message", err.getMessage());
    body.put("details", err.details());
    body.put("traceId", UUID.randomUUID().toString());
    return ResponseEntity.status(err.status()).body(body);
  }
}
