package com.hotel.billing.web;

import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// Liveness endpoint used by compose/Nginx start ordering. Skeleton
// only: operation routes (POST /v1/billing/<Operation>) land in later
// slices per docs/architecture/lld.md section 6.
@RestController
public class HealthController {
  @GetMapping("/healthz")
  public Map<String, String> health() {
    return Map.of("service", "billing", "status", "ok");
  }
}
