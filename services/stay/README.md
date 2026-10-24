# Stay (Node.js/TypeScript)

Module 2 per `docs/architecture/lld.md` section 2: check-in,
check-out, room moves, early/late times, arrivals/departures.
Implements the desk loop (issues #149, #150): `CheckIn`, `CheckOut`
with the folio gate, `MoveRoom`, `RecordActualTimes`, `GetStay`,
`GetStayRef`, `QueryStays`, and `ListArrivalsDepartures`; the
service boots and answers `/healthz`.

## Build

Run from this directory (`services/stay`). Requires Node.js 22+:

```sh
npm ci
npm run build
```

## Test

```sh
npm test
```

## Lint

```sh
npm run lint
```

## Migrate

node-pg-migrate, SQL-first, forward-only in production:

```sh
npm run migrate -- up
```

`DATABASE_URL` must point at the module database (default
`postgresql://hotel:change-me@db:5432/hotel` in compose).

## Run

Production build:

```sh
npm start
```

Local watch (type-checks, runs, and restarts TypeScript directly):

```sh
npm run dev
```

Configuration is via environment: `PORT` (default `8084`); hotel
values come from `AdminService.GetHotelConfig` with a cached
offline-first fallback (see LLD section 0) and land in later slices.

## Docker

```sh
docker build -t hotel-stay .
```

## Contract tests

`contract-tests/` holds fixtures per provided/consumed operation once
the first slice lands (see `contract-tests/README.md`). Run the repo
gate from the repo root before opening a PR:

```sh
script/contract-check.sh
```
