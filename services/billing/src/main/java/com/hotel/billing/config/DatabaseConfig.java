package com.hotel.billing.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

// Builds the shared-engine DataSource from the DATABASE_URL the
// compose stack wires into every module (issue #149). The URL travels
// in driver-neutral form (postgresql://user:secret@host:port/db),
// which the Go and Node modules consume as-is; JDBC needs the
// jdbc: prefix, translated here. DB_USER/DB_PASSWORD override the
// URL-embedded credentials when set.
//
// The bean is conditional on DATABASE_URL so unit tests and
// DB-less runs boot without a database; Spring Boot's own
// DataSource and Flyway auto-configuration back off once this
// primary bean exists, and Flyway applies the billing chain
// (V1__boot.sql, V2__schema.sql) at startup in compose.
@Configuration
public class DatabaseConfig {

  @Bean
  @ConditionalOnProperty(name = "DATABASE_URL")
  public DataSource dataSource(Environment env) {
    String raw = env.getProperty("DATABASE_URL", "");
    URI uri = URI.create(raw);
    if (!"postgresql".equals(uri.getScheme()) || uri.getHost() == null) {
      throw new IllegalStateException("DATABASE_URL must be a postgresql:// URL.");
    }
    String userInfo = uri.getUserInfo();
    String user = env.getProperty("DB_USER", "");
    String password = env.getProperty("DB_PASSWORD", "");
    if (userInfo != null && userInfo.contains(":")) {
      String[] parts = userInfo.split(":", 2);
      if (user.isEmpty()) {
        user = parts[0];
      }
      if (password.isEmpty()) {
        password = parts[1];
      }
    }
    if (user.isEmpty() || password.isEmpty()) {
      throw new IllegalStateException("Billing database credentials are missing (DATABASE_URL or DB_USER/DB_PASSWORD).");
    }
    int port = uri.getPort() < 0 ? 5432 : uri.getPort();
    String jdbcUrl = "jdbc:postgresql://" + uri.getHost() + ":" + port + uri.getPath();
    HikariDataSource pool = new HikariDataSource();
    pool.setJdbcUrl(jdbcUrl);
    pool.setUsername(user);
    pool.setPassword(password);
    pool.setMaximumPoolSize(10);
    return pool;
  }
}
