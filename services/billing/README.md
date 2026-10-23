# Billing (Java 21 Spring Boot)

Module 6 per `docs/architecture/lld.md` section 6: folios, charges,
payments, taxes/fees, day-close, settlement gate. The one
Spring-context service in the budget. Skeleton only: the service
boots and answers `/healthz`; operation logic lands in later slices.

## Package

Run from this directory (`services/billing`). Requires Java 21 and
Maven 3.9+ (or use the `maven:3.9-eclipse-temurin-21` image):

```sh
mvn package
```

## Test

```sh
mvn test
```

Tests are unit-only (no Spring context, no database), so they run
without PostgreSQL.

## Full verify

```sh
mvn verify
```

## Migrate

Flyway runs versioned `V<n>__` SQL from
`src/main/resources/db/migration` automatically at startup
(forward-only in production). Ad-hoc runs against a scratch database
only:

```sh
mvn flyway:migrate
```

`DATABASE_URL`, `DB_USER`, and `DB_PASSWORD` point at the module
database (defaults match `deploy/compose.yaml`).

## Run

Local:

```sh
mvn spring-boot:run
```

Packaged:

```sh
java -jar target/billing-*.jar
```

Configuration is via environment: `PORT` (default `8087`);
`DATABASE_URL`/`DB_USER`/`DB_PASSWORD`; hotel values come from
`AdminService.GetHotelConfig` with a cached offline-first fallback
(see LLD section 0) and land in later slices. Money is exact
(`BigDecimal` in memory, BIGINT minor units persisted) from the
first charge slice on.

## Docker

```sh
docker build -t hotel-billing .
```

## Contract tests

`contract-tests/` holds fixtures per provided/consumed operation once
the first slice lands (see `contract-tests/README.md`). Run the repo
gate from the repo root before opening a PR:

```sh
script/contract-check.sh
```
