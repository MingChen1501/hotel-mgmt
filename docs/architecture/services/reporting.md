# Reporting — as-built design

Status: active. Source page for the reporting module (single source of truth; `services/reporting/README.md` is a thin stub pointing here). Owned by `architect` (Closes #181).

## 1. Purpose

Occupancy, revenue, daily-sheet, and housekeeping reads over its own rebuilt read model (FR-RPT-1..4).

Links: `docs/architecture/lld.md` [section 7](../lld.md); `docs/requirements/sequence-diagrams.md` [section 9](../../requirements/sequence-diagrams.md) (check-out feeds revenue) and section 12 (housekeeping loop, future); FR-RPT-1..3.

## 2. Pattern and layers as-built

Go `handler / service / store`, where the service is a thin validation-and-delegate step and the store owns the event-sourced projections, wired in `services/reporting/cmd/server/main.go`.

| Layer | Files | Responsibility |
|---|---|---|
| Transport + auth + body decoding | `internal/handler/handler.go` | `NewMux(svc)` routes `POST /v1/reporting/<Operation>`; Bearer presence check; date-window required-field checks before delegating |
| Read step order | `internal/service/service.go` | validates nothing itself beyond delegating: `OccupancyReport` (:31), `RevenueSummary` (:37), `DailySheet` (:43), `HousekeepingReport` (:49) straight to the store; never reads other modules' stores |
| Projections + storage | `internal/store/store.go` (`Store`, the in-memory read model) | `Apply` ingests one domain event (:199), `Rebuild` replays the log (:225), `project` routes by event type (:245); `Occupancy` (:474), `Revenue` (:529), `Sheet` (:556), `Housekeeping` (:632) serve reads with an as-of timestamp. The migrated read-model tables (`services/reporting/migrations/000002_schema.up.sql`) are not yet read or written by the process — persistence hardens in a later slice (section 9) |
| Health | `internal/health/` | `GET /healthz` with the module identity (`cmd/server/main.go:30`) |
| Boot | `cmd/server/main.go` | store wiring exposed for the rebuild job (`service.Store()`), mounts health + read routes (:28-32) |

The routing table (`internal/handler/handler.go`): `OccupancyReport` (:136), `RevenueSummary` (:162), `DailySheet` (:188), `HousekeepingReport` (:218). Every report carries `asOf` so staleness is visible.

## 3. Happy-path flowchart

OccupancyReport (`POST /v1/reporting/OccupancyReport`):

```mermaid
flowchart TD
    A[Bearer token present] --> B[Decode JSON body]
    B --> C[dateFrom + dateTo present]
    C --> D[Store serves projection]
    D --> E[200 nights + asOf]
```

Edge trace (every edge cites code):

- A–B: Bearer presence + JSON decode (`internal/handler/handler.go:114-133`).
- C: `dateFrom`/`dateTo` required (:136-139); the store validates the window shape and span (`internal/store/store.go:448`).
- D: per-night, per-type occupied/available counts served from the rebuilt projection — the service never touches another module's rows (`internal/service/service.go:31-35`) — and the set served is one complete set, the one the last successful rebuild installed (section 9), never a partially built candidate.
- E: `nights` plus the read-model `asOf` timestamp returned so freshness is explicit (`internal/handler/handler.go:147-160`).

## 4. Failure/rollback flowchart

Bad windows and event application — the rebuild side:

```mermaid
flowchart TD
    W[Missing, malformed, or out-of-order window] --> R400[400 VALIDATION_FAILED, no read]
    C[Window wider than 730 nights] --> R400B[400 VALIDATION_FAILED, details field dateTo, no lock taken, no date walked]
    V[Unknown businessDate] --> R404[404 NOT_FOUND via Sheet]
    J[Apply refuses an event] --> R422[refused, published projection untouched]
    K[Rebuild projects the slice into a private candidate] --> M{Every event projects?}
    M -->|yes| L[One swap installs the complete candidate]
    M -->|no, mid-stream| N[candidate discarded; refusal returned; published rows, offsets, and asOf keep their pre-rebuild values]
```

Edge trace:

- W: missing `dateFrom`/`dateTo`/`businessDate` → `VALIDATION_FAILED` before any store call (`internal/handler/handler.go:136-229`); malformed or over-wide windows refused in `Occupancy`/`Revenue`/`Sheet`/`Housekeeping` (`internal/store/store.go:474-632`).
- C (from #641): a window whose `dateTo` is more than 730 nights after `dateFrom` is refused in `parseRange` (`internal/store/store.go:448-467`) before `Occupancy` takes the lock (`:479`) and before either loop runs (`:494`, `:537`), so the refused read holds no mutex and walks no date; details: [section 8](#8-delta--report-date-ranges-carry-a-declared-span-cap-refs-641) and `docs/architecture/lld.md` [section 31](../lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641).
- V: `Sheet` on an unknown business date surfaces `NOT_FOUND` (`internal/store/store.go:556`).
- J–K–M–L/N: `Apply` ingests one event at a time and `project` routes known types only — `reservation.created` (:251), `reservation.cancelled`/`no-show` (:275), `stay.checked-in` (:283), `stay.checked-out` (:307), `rate.availability-set` (:339), `folio.charge-posted` (:353), `folio.payment-recorded` (:381), `config.changed` (:391), and the four room events (:395, :405, :419, :433). `Rebuild` projects the whole slice into a candidate set built aside (`:225-243` as it stands) and publishes it in one swap after the last event projects; an event it cannot project discards the candidate and returns today's refusal, so the published rows, offsets, and `asOf` keep their pre-rebuild values (section 9).

Rollback: none needed for a read — reads never mutate; a failed rebuild replaces nothing and publishes nothing, and the whole change reverts with the single implementation PR (section 9).

## 5. Outbound dependencies

None — by design the service never reads other modules' stores (`internal/service/service.go:13-51`). Its only input is the domain-event log via `Apply`/`Rebuild`. Hotel values come from `AdminService.GetHotelConfig` with a cached offline-first fallback (LLD [section 0](../lld.md)).

See also: [deployment](../system-architecture.md) (section 1), [C4 containers](../c4-containers.md), and [event flow](../event-flow.md) (this service's event consumption and rebuild).

## 6. Error mapping

Envelope `{code, message, details, traceId}` (same shape as reservations) to `docs/technical/error-handling.md` [section 1](../../technical/error-handling.md). Constructor (`internal/store/store.go:28`):

| Code | Status | Raised when |
|---|---|---|
| `VALIDATION_FAILED` | 400 | missing/malformed date window or business date (`internal/handler/handler.go:136-229`; `internal/store/store.go:474-632`); from #641 a window wider than 730 nights, naming `dateTo` (`internal/store/store.go:448-467`, section 8) |
| `UNAUTHENTICATED` | 401 | missing session token (`internal/handler/handler.go:118-128`) |
| `NOT_FOUND` | 404 | unknown business date for the daily sheet (`internal/store/store.go:556`) |

A failed rebuild answers its caller — the rebuild job wiring, not a read
route — with the same `VALIDATION_FAILED` refusal it returns today (same
code, status, message, and `details.field` naming the offending field);
no read route and no response field reports rebuild state (section 9).

## 7. Operations

Run from `services/reporting`. Build and test:

```sh
go build ./...
go test ./...
```

Vet and format (`gofmt -l .` must print nothing):

```sh
go vet ./...
gofmt -l .
```

Migrate (golang-migrate, forward-only in production; `down` files are local-dev only):

```sh
migrate -path migrations -database "$DATABASE_URL" up
```

Run:

```sh
go run ./cmd/server
```

Configuration via environment: `PORT` (default `8083`); hotel values come from `AdminService.GetHotelConfig` with a cached offline-first fallback (see LLD [section 0](../lld.md)) and land in later slices.

Docker:

```sh
docker build -t hotel-reporting .
```

Contract tests: `contract-tests/` holds fixtures per provided/consumed operation once the first slice lands (see `contract-tests/README.md`). Run the repo gate from the repo root before opening a PR:

```sh
script/contract-check.sh
```

Ingress bounds (Refs #630): `internal/handler` caps a request body at
65 536 bytes (`maxBodyBytes`) through `http.MaxBytesReader` and refuses an
oversized body with the shared envelope (`VALIDATION_FAILED`, `details`
naming `body`) before parsing; `cmd/server/main.go` runs an `http.Server`
with `ReadHeaderTimeout` 5 s, `ReadTimeout` 10 s, `WriteTimeout` 15 s, and
`IdleTimeout` 60 s. No environment variable overrides either value.
Details: LLD
[section 29](../lld.md#29-bounded-request-bodies-and-finite-server-timeouts-refs-630).

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-249

## 8. Delta — report date ranges carry a declared span cap (Refs #641)

Before this change `parseRange` checked a window's shape and order only:
both ends parsed, a malformed one refused naming the field, and
`dateTo` before `dateFrom` refused naming `dateTo`
(`internal/store/store.go:440-453`). Nothing compared the distance
between the ends, and both range reads then walk every date in the
window inclusively under the store mutex — `Occupancy` locks at `:465`
and loops at `:480`, `Revenue` locks at `:520` and loops at `:523` — so
a `0001-01-01`..`9999-12-31` window runs millions of iterations holding
a lock every other report read needs.

As specified by #641 (the implementation PR lands the guard and then
refreshes these line pins per maintain-with-code):

- **One span cap for both range reports: 730 nights** between `dateFrom`
  and `dateTo`, 731 inclusive dates — the two-year window `NFR-PERF-2`
  documents and the perf guard already drives, and the same bound Rates
  applies to a stay range (`services/rates/internal/store/store.go:254-256`).
  It is one named store constant, not configuration.
- **The refusal is `VALIDATION_FAILED` (400)** with `details` naming
  `dateTo`, a fresh `traceId`, and the new
  `reporting.validation.date_range_span` sentence ("dateTo must be at
  most {max} nights after dateFrom.") with `{max}` rendered from the
  constant through `messages.Num`, raised in `parseRange` as its last
  check — after the format and order refusals, after the handler's
  session and presence checks, and before `s.mu.Lock()` at `:479`/`:534`.
  A refused window therefore takes no lock, walks no date, and reads no
  projection.
- **Nothing inside the cap changes**, and nothing moves for
  `DailySheet` (`:556`) or `HousekeepingReport` (`:632`): same rows, row
  order, zero-filled dates, and `asOf`; same missing, malformed, and
  out-of-order sentences; the catalogue gains one key and no code token,
  operation, request or response field, event, or contract file changes
  (the contract decision is LLD
  [section 31.5](../lld.md#315-contract-decision-no-token-no-schema-no-fixture-no-version-change)).

Design: `docs/architecture/lld.md`
[section 31](../lld.md#31-reporting-date-ranges-carry-a-declared-span-cap-refs-641);
product conditions `AC-RPT-5`..`AC-RPT-7` in
`docs/product/acceptance-criteria.md` section 24; NFR `NFR-RPT-1` in
`docs/requirements/mvp-requirements.md` section 32; business rule BR-62;
the refusal in the taxonomy: `docs/technical/error-handling.md`
section 1.3. Rollback: revert the single implementation PR — the
constant, the comparison, and the sentence go together, and every window
the service accepted before is accepted again; no migration or data
repair exists in either direction.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1130

## 9. Delta — a failed rebuild keeps the last good read model (Refs #642)

Before this change `Rebuild` emptied the published read model before it
replayed anything: it took the mutex, replaced `seen`, `offsets`, `asOf`,
and all six projection maps with empty values
(`internal/store/store.go:225-235`), released the mutex (`:236`), and
only then fed the slice through `Apply` (`:237-241`), returning the first
refused event unchanged (`:239`). Reads take the same mutex per call and
never refuse (`internal/handler/handler.go:1-8`; `Occupancy` locks at
`internal/store/store.go:479`, `Revenue` at `:534`, `Sheet` at `:560`,
`Housekeeping` at `:633`), so a read issued between two replay steps saw
the half-built model, and a rebuild that aborted part-way left the desk
reading an empty or partial set whose `asOf` was the newest event that
did apply (`:215-217`) — occupancy and revenue reading as zero or short
behind a plausible freshness stamp.

As specified by #642 (the implementation PR lands the seam and then
refreshes these line pins per maintain-with-code):

- **One publication seam.** The seen record, the per-subscription
  offsets, the as-of stamp, and the six projection maps become one
  replaceable set behind the store mutex (`internal/store/store.go:138-149`,
  the shape `New` builds at `:152-163`). `Rebuild` fills a private
  candidate — no lock held, unreachable from any read — and installs it
  in one critical-section assignment after the last event projects. The
  slice is folded by the same per-event `project` (`:245-446`) `Apply`
  drives today (`:208-210`), so a rebuilt row is the row it produced
  before.
- **An aborted rebuild publishes nothing.** On the first refused event
  the candidate is dropped and the refusal is returned unchanged — same
  `VALIDATION_FAILED`, status 400, message, and `details.field`, through
  `validation(field, message)` (`:28-32`) — while the published
  projections, seen record, offsets, and `asOf` keep their pre-rebuild
  values. A retry replays from the same record because `Offsets()`
  (`:649-658`) reads the untouched published set. There is one store in
  this module today (the in-memory `Store`); the migrated read-model
  tables (`services/reporting/migrations/000002_schema.up.sql:19-56`) are
  not yet read or written by the process, and the persisted store must
  meet the same rule by staging the candidate rows and committing them in
  one transaction (LLD
  [section 35.2](../../architecture/lld.md#352-what-publishes-nothing-means-per-store)).
- **Reads never refuse and never report a rebuild.** The four reads keep
  their 200 responses and their set's `asOf` (`internal/handler/handler.go:160`,
  `:185`, `:210-214`, `:228-231`); no response field, route, status field,
  catalogue key, contract file, schema, or migration is added, and
  `docs/technical/error-handling.md` and `docs/technical/api-spec.md` are
  untouched because no token or operation moves. The operator sees the
  failure through the rebuild call's returned error and the unchanged
  last-good `asOf`.
- **A successful rebuild stays byte-identical.** The candidate is filled
  by the same `project` code in the same slice order, and row order comes
  from the reads' own sorts (`Occupancy` `:517-523`, `Sheet` `:597-609`,
  `Housekeeping` `:642`) with `Revenue` walking the requested dates in
  order (`:534-547`), so rows, row order, zero-filled dates, revenue
  totals, daily-sheet groups, housekeeping list, `asOf`, and the
  per-subscription offsets are today's clear-and-replay output; duplicate
  ids stay no-ops (`:205-207`).

Design: `docs/architecture/lld.md`
[section 35](../../architecture/lld.md#35-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642)
and HLD [section 27](../../architecture/hld.md#27-a-failed-reporting-rebuild-keeps-the-last-good-read-model-refs-642);
product conditions `AC-RPT-8`..`AC-RPT-10` in
`docs/product/acceptance-criteria.md` section 28; FR `FR-RPT-5`..`FR-RPT-7`
in `docs/requirements/mvp-requirements.md` section 36; business rule
BR-66; guard traceability `docs/testing/traceability-matrix.md`
section 28. Risk R-21 records both the serving-stale and the wrong-swap
direction. Rollback: revert the single implementation PR — the candidate
build, the swap, and the guards disappear together and the
clear-and-replay path returns; no migration, backfill, or data repair
exists in either direction, because the read model is rebuilt from the
event log.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-1207
