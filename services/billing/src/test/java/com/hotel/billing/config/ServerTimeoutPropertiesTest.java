package com.hotel.billing.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.util.List;
import java.util.Properties;
import org.junit.jupiter.api.Test;

// BND16 covers AC-BND-3 and NFR-BND-3 for the Billing server
// (Refs #630): the packaged application.properties carries the three
// fixed Tomcat bounds, and none of them is zero, empty, a placeholder,
// or an environment override.
class ServerTimeoutPropertiesTest {

  private static Properties packaged() throws Exception {
    Properties properties = new Properties();
    try (InputStream in = ServerTimeoutPropertiesTest.class.getClassLoader()
        .getResourceAsStream("application.properties")) {
      assertNotNull(in, "application.properties must be on the classpath");
      properties.load(in);
    }
    return properties;
  }

  @Test
  void packagedPropertiesCarryTheThreeFiniteBounds() throws Exception {
    Properties properties = packaged();
    assertEquals("5s", properties.getProperty("server.tomcat.connection-timeout"));
    assertEquals("10s", properties.getProperty("server.tomcat.keep-alive-timeout"));
    assertEquals("65536", properties.getProperty("server.tomcat.max-swallow-size"));
  }

  @Test
  void noBoundIsZeroEmptyAPlaceholderOrAnEnvironmentOverride() throws Exception {
    Properties properties = packaged();
    List<String> keys = List.of("server.tomcat.connection-timeout", "server.tomcat.keep-alive-timeout",
        "server.tomcat.max-swallow-size");
    for (String key : keys) {
      String value = properties.getProperty(key);
      assertNotNull(value, key + " must be declared");
      String trimmed = value.strip();
      assertFalse(trimmed.isEmpty(), key + " must not be empty");
      assertFalse(trimmed.equals("0") || trimmed.equals("-1"), key + " must be a finite bound");
      assertFalse(trimmed.startsWith("${"), key + " must be a packaged constant, not a placeholder");
    }
    assertTrue(properties.getProperty("server.tomcat.connection-timeout").endsWith("s"),
        "connection-timeout is a duration value");
    assertTrue(properties.getProperty("server.tomcat.keep-alive-timeout").endsWith("s"),
        "keep-alive-timeout is a duration value");
  }
}
