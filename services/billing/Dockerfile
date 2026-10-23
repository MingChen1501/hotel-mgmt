# syntax=docker/dockerfile:1

# Build stage: packaged Spring Boot jar (tests run in CI, skipped here).
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY pom.xml ./
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B -DskipTests package

# Runtime stage: JRE only, runs as a non-root user.
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/target/billing-*.jar /app/billing.jar
RUN useradd --system --no-create-home --user-group hotel && chown hotel:hotel /app/billing.jar
USER hotel
EXPOSE 8087
ENV PORT=8087
ENTRYPOINT ["java", "-jar", "/app/billing.jar"]
