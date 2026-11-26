package com.hotel.billing.client;

import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.env.MockPropertySource;

// Context-wiring guard (Refs #634): the client has a test-only second
// constructor, so Spring must pick the configured one explicitly.
// Without this pin a missing @Autowired breaks every Billing boot at
// startup, which the mocked web suite cannot see.
class StayClientWiringTest {

  @Test
  void fw511TheConfiguredConstructorWiresTheClient() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
      context.getEnvironment().getPropertySources()
          .addFirst(new MockPropertySource().withProperty("stay.base-url", "http://stay:8084"));
      context.register(StayClient.class);
      context.refresh();
      assertNotNull(context.getBean(StayVerifier.class));
    }
  }
}
