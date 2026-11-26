package com.hotel.billing.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.hotel.billing.web.ApiException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

// Stay client guards (ADR-0008 D3/D4, LLD section 27.8, Refs #634):
// the answer classification is pinned against a JDK HttpServer stub,
// so the suite stays database-free and needs no Stay build.
class StayClientTest {

  private static final UUID STAY = UUID.fromString("11111111-1111-4111-8111-111111111111");
  private static final UUID OTHER = UUID.fromString("22222222-2222-4222-8222-222222222222");

  private HttpServer server;
  private final AtomicReference<String> authorization = new AtomicReference<>();
  private final AtomicReference<String> requestBody = new AtomicReference<>();

  @BeforeEach
  void start() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
  }

  @AfterEach
  void stop() {
    if (server != null) {
      server.stop(0);
    }
  }

  private StayClient client(Duration timeout) {
    return new StayClient("http://127.0.0.1:" + server.getAddress().getPort(), timeout);
  }

  private void respond(int status, String body, long delayMillis) {
    server.createContext("/v1/stay/GetStayRef", (HttpExchange exchange) -> {
      authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
      requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
      if (delayMillis > 0) {
        try {
          Thread.sleep(delayMillis);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
      }
      byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(status, bytes.length);
      try (OutputStream out = exchange.getResponseBody()) {
        out.write(bytes);
      }
    });
    server.start();
  }

  private static ApiException thrown(Runnable call) {
    return assertThrows(ApiException.class, call::run);
  }

  @Test
  void fw501InHouseStayPassesWithTheCallerTokenForwarded() {
    respond(200, "{\"stayId\":\"" + STAY + "\",\"guestId\":\"" + UUID.randomUUID()
        + "\",\"roomId\":\"" + UUID.randomUUID() + "\",\"state\":\"in-house\"}", 0);
    client(Duration.ofSeconds(2)).verify(STAY, "session-token");
    assertEquals("Bearer session-token", authorization.get());
    assertTrue(requestBody.get().contains(STAY.toString()));
  }

  @Test
  void fw501UnknownStayNamingTheRequestedIdIsNotFound() {
    respond(404, "{\"code\":\"NOT_FOUND\",\"message\":\"Unknown stay.\",\"details\":{\"stayId\":\"" + STAY
        + "\"},\"traceId\":\"t\"}", 0);
    ApiException err = thrown(() -> client(Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("NOT_FOUND", err.code());
    assertEquals(404, err.status());
    assertEquals("stay", err.details().get("upstream"));
    assertEquals(STAY.toString(), err.details().get("stayId"));
  }

  @Test
  void fw502NotFoundNamingAnotherStayIsAUnavailableWiringFault() {
    respond(404, "{\"code\":\"NOT_FOUND\",\"message\":\"Unknown stay.\",\"details\":{\"stayId\":\"" + OTHER
        + "\"},\"traceId\":\"t\"}", 0);
    ApiException err = thrown(() -> client(Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
    assertEquals(503, err.status());
    assertEquals("GetStayRef", err.details().get("operation"));
  }

  @Test
  void fw503NotFoundWithNoStayIdIsAlsoUnavailable() {
    respond(404, "{\"code\":\"NOT_FOUND\",\"message\":\"unknown path\",\"details\":{},\"traceId\":\"t\"}", 0);
    ApiException err = thrown(() -> client(Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
  }

  @Test
  void fw504ClosedStayIsStateIllegalNamingTheState() {
    respond(422, "{\"code\":\"STATE_ILLEGAL\",\"message\":\"Stay is closed.\",\"details\":{\"stayId\":\"" + STAY
        + "\",\"state\":\"closed\"},\"traceId\":\"t\"}", 0);
    ApiException err = thrown(() -> client(Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("STATE_ILLEGAL", err.code());
    assertEquals(422, err.status());
    assertEquals("closed", err.details().get("state"));
    assertEquals("stay", err.details().get("upstream"));
  }

  @Test
  void fw505ARejectedSessionIsSurfacedUnchangedNotAsAnOutage() {
    respond(401, "{\"code\":\"UNAUTHENTICATED\",\"message\":\"Missing session token.\",\"details\":{},\"traceId\":\"t\"}",
        0);
    ApiException err = thrown(() -> client(Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("UNAUTHENTICATED", err.code());
    assertEquals(401, err.status());
  }

  @Test
  void fw506ServerErrorFailsClosed() {
    respond(500, "{\"code\":\"INTERNAL_ERROR\",\"message\":\"Unexpected failure.\",\"details\":{},\"traceId\":\"t\"}",
        0);
    ApiException err = thrown(() -> client(Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
    assertEquals(503, err.status());
  }

  @Test
  void fw507MalformedSuccessBodyFailsClosed() {
    respond(200, "not-json", 0);
    ApiException err = thrown(() -> client(Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
  }

  @Test
  void fw508TimeoutFailsClosed() {
    respond(200, "{\"stayId\":\"" + STAY + "\",\"guestId\":\"" + UUID.randomUUID()
        + "\",\"roomId\":\"" + UUID.randomUUID() + "\",\"state\":\"in-house\"}", 400);
    ApiException err = thrown(() -> client(Duration.ofMillis(120)).verify(STAY, "session-token"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
  }

  @Test
  void fw509AnUnwiredClientFailsClosedWithoutACall() {
    ApiException err = thrown(() -> new StayClient("", Duration.ofSeconds(2)).verify(STAY, "session-token"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
    assertEquals("GetStayRef", err.details().get("operation"));
  }

  @Test
  void fw510ConnectionRefusedFailsClosed() throws IOException {
    int closedPort;
    try (ServerSocket socket = new ServerSocket(0)) {
      closedPort = socket.getLocalPort();
    }
    ApiException err = thrown(
        () -> new StayClient("http://127.0.0.1:" + closedPort, Duration.ofMillis(300)).verify(STAY, "session-token"));
    assertEquals("UPSTREAM_UNAVAILABLE", err.code());
  }
}
