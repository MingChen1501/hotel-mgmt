package com.hotel.billing.web;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

// Unit test only: no Spring context and no database, so `mvn test`
// stays green without a running PostgreSQL.
class HealthControllerTest {
  @Test
  void healthAnswersWithServiceIdentity() {
    var body = new HealthController().health();
    assertEquals("billing", body.get("service"));
    assertEquals("ok", body.get("status"));
  }
}
