package com.hotel.billing;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// Billing module entry point (LLD module 6). Skeleton only: the
// service boots and answers /healthz; operation logic lands in later
// slices per docs/architecture/lld.md section 6.
@SpringBootApplication
public class BillingApplication {
  public static void main(String[] args) {
    SpringApplication.run(BillingApplication.class, args);
  }
}
