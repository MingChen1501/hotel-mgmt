# Admin (Node.js/TypeScript)

Module 8 per `docs/architecture/lld.md` section 8: hotel profile, users/roles, room/rate setup entry,
per-hotel customisation values, export/backup assembly.
Skeleton only: the service boots and answers `/healthz`; operation
logic lands in later slices.

## Build

Run from this directory (`services/admin`). Requires Node.js 22+:

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
npm run migrate up
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
docker build -t hotel-admin .
```

## Contract tests

`contract-tests/` holds fixtures per provided/consumed operation once
the first slice lands (see `contract-tests/README.md`). Run the repo
gate from the repo root before opening a PR:

```sh
script/contract-check.sh
```
