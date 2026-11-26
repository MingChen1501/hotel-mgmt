# #632 server-side reservation price basis — evidence

Lab reproduction record for
[issue #632](https://github.com/MingChen1501/hotel-mgmt/issues/632)
(`AC-PRC-1`..`AC-PRC-5`, `FR-PRC-1`..`FR-PRC-5`, `PA-E1`). Audit
finding R2 (the #625 class): the reservation's frozen price basis was
supplied by the caller and never checked against the module that owns
prices. This record captures the defect and the fix through the public
`ReservationService` contract.

## Capture method

- Module-level process reproduction, no compose lab: the Reservations
  service binary was built twice — pre-fix from the parent commit
  `5ecc9be` (`git archive 5ecc9be | tar -x -C /tmp/pre632`), fixed from
  this PR's branch — and each was run with the in-memory store
  (`DATABASE_URL` unset, ports `18081`/`18084`).
- A stub upstream answered the three routes the booking path calls, on
  one port: `POST /v1/rates/CheckRestrictions` → `200 {"allowed":true}`,
  `POST /v1/rates/QuotePrice` → `200 {"totalMinor":6000,
  "discountName":null}` (or `500` with a non-envelope body in the
  unreadable run), and `POST /v1/rooms/CheckRoomTypeSellability` →
  `200 {"totalCount":2,"blockedRooms":[]}`.
- Requests were the public contract calls, with
  `Authorization: Bearer evidence-token`: `CreateReservation` for
  `deluxe-type`, `2026-11-01`..`2026-11-03`, guest `guest-1`, and
  `priceBasis.totalMinor` set per case, then `GetReservation` and
  `QueryCalendar` to read back what was stored.
- The owner's shared `hotel-mgmt` lab was not touched; no compose
  project was created or torn down.

## Before (pre-fix build `5ecc9be`): a caller freezes any total

Asserting `priceBasis.totalMinor: 0` for a stay Rates quotes at 6000 is
stored verbatim, read back, and would be posted by the #600 room charge:

```json
{
  "request": { "priceBasis": { "totalMinor": 0, "discountName": null } },
  "response": { "status": 200, "quotedTotal": 0, "state": "confirmed" },
  "readBack": {
    "reservationRef": "RSV-J7ASVUGX",
    "priceBasis": { "totalMinor": 0, "discountName": null },
    "state": "confirmed"
  }
}
```

The same forged-low call against the pre-fix build with the Pricing
quote endpoint answering `500` still books at zero — the quote read does
not exist on the booking path, so an unreadable price changes nothing:

```json
{
  "request": { "priceBasis": { "totalMinor": 0 } },
  "response": { "status": 200, "quotedTotal": 0, "reservationRef": "RSV-EBA9TWMM" }
}
```

## After (fixed build): the quote is the total

The forged-low call is refused `PRICE_CHANGED` naming both totals, the
type, and the dates, and the calendar holds nothing afterwards:

```json
{
  "response": {
    "status": 409,
    "code": "PRICE_CHANGED",
    "details": {
      "roomTypeId": "deluxe-type",
      "arrivalDate": "2026-11-01",
      "departureDate": "2026-11-03",
      "requestedTotalMinor": 0,
      "quotedTotalMinor": 6000
    }
  },
  "calendar": { "reservations": [] }
}
```

The same stay asserting the quote's 6000 books at 6000:

```json
{
  "request": { "priceBasis": { "totalMinor": 6000 } },
  "response": { "status": 200, "quotedTotal": 6000, "reservationRef": "RSV-5N7WGE6Q" }
}
```

With the Pricing quote endpoint unreadable (`500`), the same call is
refused fail-closed instead of freezing a number:

```json
{
  "response": {
    "status": 503,
    "code": "UPSTREAM_UNAVAILABLE",
    "details": { "upstream": "rates", "operation": "QuotePrice" }
  }
}
```

## Honest control

The matching call books on both builds (pre-fix at the asserted total,
fixed at the same quoted total), so the change refuses assertions, not
bookings. The desk's normal quote-then-confirm path has always sent the
quoted total back, which is why the happy path needs no desk change.

## Guard suite

`cd services/reservations && go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"`

- `ok` for all eight packages; the new guards are
  `internal/service/service_price_test.go` (`PA1`–`PA12`),
  `internal/pricing/client_test.go` (`PA7`/`PA8` quote shapes),
  `internal/handler/handler_price_test.go` (`PA1`/`PA5`/`PA7`/`PA8`/`PA11`
  at the transport edge), `internal/store/store_test.go` and
  `internal/store/postgres_test.go` (`PA6` replay, Postgres parity),
  and `app/src/views/BookView.test.ts` (`PA13`).
- Contract and copy (`PA14`): `script/contract-check.sh` PASSED,
  `script/openapi-route-check.sh` PASSED,
  `app/src/views/BookView.test.ts` and the four service error-map
  suites are green.

## Operator notes

- Bookings frozen at a caller-supplied total before this change keep
  that total: nothing is backfilled, re-derived, or rewritten.
- The Modify path reprices such a booking the next time staff change it:
  the new total is the quote's and the change history records the actor
  and the time.
- A Rates outage refuses new bookings and modifications while it lasts;
  stored bookings stay readable, cancellable, and checkable-in.
