# Reporting (Go)

Module 7 per `docs/architecture/lld.md` section 7: occupancy,
revenue, daily sheet, and housekeeping reports over its own
read model.
Skeleton only: the service boots and answers `/healthz`; operation
logic lands in later slices.

## Build

Run from this directory (`services/reporting`):

```sh
go build ./...
```

## Test

```sh
go test ./...
```

## Vet and format

```sh
go vet ./...
gofmt -l .
```

`gofmt -l .` must print nothing.

## Migrate

golang-migrate, forward-only in production (`down` files are
local-dev only):

```sh
migrate -path migrations -database "$DATABASE_URL" up
```

## Run

```sh
go run ./cmd/server
```

Configuration is via environment: `PORT` (default `8083`); hotel
values come from `AdminService.GetHotelConfig` with a cached
offline-first fallback (see LLD section 0) and land in later slices.

## Docker

```sh
docker build -t hotel-reporting .
```

## Contract tests

`contract-tests/` holds fixtures per provided/consumed operation once
the first slice lands (see `contract-tests/README.md`). Run the repo
gate from the repo root before opening a PR:

```sh
script/contract-check.sh
```
