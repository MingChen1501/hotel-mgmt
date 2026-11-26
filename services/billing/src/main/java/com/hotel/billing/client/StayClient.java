package com.hotel.billing.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.hotel.billing.util.Messages;
import com.hotel.billing.web.ApiException;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

// Billing's C8 client (integration.md section 3): POST
// {STAY_BASE_URL}/v1/stay/GetStayRef with the caller's Bearer token
// forwarded and a 2-second timeout — the established sync pattern
// (services/reservations/internal/pricing/client.go). The answer is
// classified before any folio write:
//
//   200 in-house                     -> continue
//   404 NOT_FOUND naming this stay   -> NOT_FOUND (404)
//   422 STATE_ILLEGAL                -> STATE_ILLEGAL (422)
//   another 4xx envelope             -> surfaced unchanged
//   anything else / unreadable body  -> UPSTREAM_UNAVAILABLE (503)
//
// A 404 that names another stay is a wiring fault (wrong base URL or
// path) and fails closed, never read as "no such stay" on a money
// path (ADR-0008 D4). The timeout keeps a stuck Stay inside the
// NFR-PERF-1 bound for charge posting and payment recording.
@Component
public class StayClient implements StayVerifier {

  private static final String PATH = "/v1/stay/GetStayRef";
  private static final String OPERATION = "GetStayRef";
  private static final ObjectMapper JSON = new ObjectMapper();

  private final String baseUrl;
  private final Duration timeout;
  private final HttpClient http;

  @Autowired
  public StayClient(@Value("${stay.base-url:http://stay:8084}") String baseUrl) {
    this(baseUrl, Duration.ofSeconds(2));
  }

  // Test seam: a shorter timeout and an explicit loopback base URL
  // keep the client guards database-free and fast.
  StayClient(String baseUrl, Duration timeout) {
    this.baseUrl = baseUrl == null ? "" : baseUrl.strip().replaceAll("/+$", "");
    this.timeout = timeout;
    this.http = HttpClient.newBuilder().connectTimeout(timeout).build();
  }

  @Override
  public void verify(UUID stayId, String sessionActor) {
    if (baseUrl.isEmpty()) {
      // An unwired client cannot verify anything: fail closed exactly
      // as an unreachable one does (ADR-0008 D4).
      throw unavailable();
    }
    HttpRequest request;
    try {
      request = HttpRequest.newBuilder(URI.create(baseUrl + PATH))
          .timeout(timeout)
          .header("Content-Type", "application/json")
          .header("Authorization", "Bearer " + sessionActor)
          .POST(HttpRequest.BodyPublishers.ofString("{\"stayId\":\"" + stayId + "\"}"))
          .build();
    } catch (IllegalArgumentException e) {
      throw unavailable();
    }
    HttpResponse<String> response;
    try {
      response = http.send(request, HttpResponse.BodyHandlers.ofString());
    } catch (IOException e) {
      throw unavailable();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw unavailable();
    }
    classify(stayId, response.statusCode(), response.body());
  }

  private void classify(UUID stayId, int status, String body) {
    JsonNode parsed = parse(body);
    String requested = stayId.toString();
    if (status == 200) {
      if (parsed != null && "in-house".equals(parsed.path("state").asText())) {
        return;
      }
      // A 200 outside the contracted shape is not a verified stay.
      throw unavailable();
    }
    String code = text(parsed, "code");
    if (status == 404) {
      JsonNode details = parsed == null ? null : parsed.path("details");
      if ("NOT_FOUND".equals(code) && requested.equals(text(details, "stayId"))) {
        throw ApiException.notFound(Messages.text("error.notfound.stay", Map.of("stayId", requested)),
            ordered("upstream", "stay", "stayId", requested));
      }
      throw unavailable();
    }
    if (status == 422) {
      if ("STATE_ILLEGAL".equals(code)) {
        JsonNode details = parsed == null ? null : parsed.path("details");
        String state = text(details, "state");
        String named = state == null || state.isBlank() ? "unknown" : state;
        Map<String, Object> carried = ordered("upstream", "stay", "stayId", requested, "state", named);
        throw ApiException.stateIllegal(
            Messages.text("error.state.stay_not_in_house", Map.of("stayId", requested, "state", named)), carried);
      }
      throw unavailable();
    }
    if (status >= 400 && status < 500 && code != null && !code.isBlank()) {
      // A rejected session stays UNAUTHENTICATED; it is not an outage.
      throw new ApiException(code, status, messageOf(parsed, code), detailsOf(parsed));
    }
    throw unavailable();
  }

  private static JsonNode parse(String body) {
    if (body == null || body.isBlank()) {
      return null;
    }
    try {
      return JSON.readTree(body);
    } catch (IOException e) {
      return null;
    }
  }

  private static String text(JsonNode node, String field) {
    if (node == null || !node.has(field) || !node.get(field).isTextual()) {
      return null;
    }
    String value = node.get(field).asText();
    return value == null || value.isBlank() ? null : value;
  }

  private static String messageOf(JsonNode envelope, String code) {
    String message = text(envelope, "message");
    return message == null ? Messages.text("error.upstream.stay_unavailable", Map.of()) : message;
  }

  private static Map<String, Object> detailsOf(JsonNode envelope) {
    Map<String, Object> details = new LinkedHashMap<>();
    JsonNode node = envelope == null ? null : envelope.path("details");
    if (node != null && node.isObject()) {
      node.fields().forEachRemaining(entry -> details.put(entry.getKey(), jsonValue(entry.getValue())));
    }
    return details;
  }

  private static Object jsonValue(JsonNode node) {
    if (node == null || node.isNull()) {
      return null;
    }
    if (node.isTextual()) {
      return node.asText();
    }
    if (node.isNumber()) {
      return node.numberValue();
    }
    if (node.isBoolean()) {
      return node.asBoolean();
    }
    return node.toString();
  }

  private static Map<String, Object> ordered(Object... keyValues) {
    Map<String, Object> fields = new LinkedHashMap<>();
    for (int i = 0; i + 1 < keyValues.length; i += 2) {
      fields.put((String) keyValues[i], keyValues[i + 1]);
    }
    return fields;
  }

  private static ApiException unavailable() {
    return ApiException.upstreamUnavailable(Messages.text("error.upstream.stay_unavailable", Map.of()),
        ordered("upstream", "stay", "operation", OPERATION));
  }
}
