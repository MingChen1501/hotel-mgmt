# #635 money amount bounds — evidence

Before/after reproduction record for
[issue #635](https://github.com/MingChen1501/hotel-mgmt/issues/635)
(audit finding B2; `AC-AMT-1`..`AC-AMT-5`, `NFR-AMT-1`..`NFR-AMT-4`,
`BR-61`, LLD [section 30](../../../architecture/lld.md#30-money-amount-bounds-on-the-billing-folio-write-adapter-refs-635),
guards `AMT1`–`AMT20` and evidence rule `AMT-E1` in
[the test traceability](../../money-amount-bounds-test-traceability.md)).
The left column is the pre-change build; the right column is this
change. Every answer below was captured from a running service process,
not from a test assertion.

## Finding

`amountOf` accepted any `Number` and returned `number.longValue()`, so a
fractional amount was truncated and no magnitude was bounded. Before this
change, `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:47-53`
(the conversion at `:50`). The same helper serves
`PostCharge.amountMinor`, `RecordPayment.amountMinor`, and
`UpsertChargeItem.priceMinor`.

## Capture method

- Pre-change build: `git archive b4cc954 services/billing`, the master
  commit this branch is based on (its code tree is the pre-change tree;
  the spec PRs touched `docs/` only), packaged with
  `mvn -DskipTests package` in the `maven:3.9-eclipse-temurin-21` image.
- Post-change build: this branch at `174b57f`, packaged the same way.
- Each jar ran as its own container on a dedicated loopback port
  (`18891` pre, `18892` post) against a throwaway PostgreSQL 16 container
  (`--label ao.session=hotel-mgmt-1126`, port `55440`, two own databases,
  removed after the capture; `script/compose-lab-guard.sh` rules
  respected — no shared `hotel-mgmt` compose command ran and no lab
  volume was touched).
- Requests: `POST /v1/billing/<Operation>` with
  `Content-Type: application/json` and a lab-only
  `Authorization: Bearer lab-token` (the skeleton token check is presence
  only). `psql` read the folio rows, balances, and idempotency keys.
- Pre-change database `hotel_pre`; post-change database `hotel_post`.
  Stay `11111111-…` carries the money probes, stay `22222222-…` the
  unchanged control.

## Before/after — the adapter refusals

| Step | Pre-change build | This change |
|---|---|---|
| `PostCharge amountMinor: 12.99` | `200 {"amountMinor":12,…}` — the value was truncated and a line was written | `400 {"code":"VALIDATION_FAILED","message":"amountMinor must be a whole number of minor units.","details":{"field":"amountMinor"},"traceId":"…"}` |
| `PostCharge amountMinor: 1000000000001` | `200 {"amountMinor":1000000000001,…}` — accepted and stored | `400 {"code":"VALIDATION_FAILED","message":"amountMinor must be at most 1,000,000,000,000 minor units.","details":{"field":"amountMinor"},"traceId":"…"}` |
| `PostCharge amountMinor: "12"` (present string) | `400 {"message":"amountMinor is required.",…}` — the missing-field sentence for a field the caller sent | `400 {"message":"amountMinor must be a number.","details":{"field":"amountMinor"},…}` |
| Folio lines and balance after the three calls | `folio_charge_lines` = `12` and `1000000000001`; `folios.balance_minor` = `1000000000013` | `folio_charge_lines` count `0`, no folio balance — nothing was written |

## Honest boundary control (this change)

| Step | Answer |
|---|---|
| `amountMinor: 1000000000000` | `200`, line stored with `amountMinor: 1000000000000` |
| `amountMinor: 1000000000001` | `400`, `amountMinor must be at most 1,000,000,000,000 minor units.` |
| `amountMinor: 12.0` (whole value written with a decimal point) | `200`, line stored with `amountMinor: 12` |
| Repeat of the ceiling request with the same `idempotencyKey` | `200`, the original line (`71f1c473-…`) — no second write |

## Unchanged control (this change)

A tax rule `percent: 8.5` was stored, then one ordinary room charge,
one cash payment, one charge item, and the sign refusals were sent:

| Step | Answer |
|---|---|
| `UpsertTaxFeeRule percent: 8.5` | `200`, rule stored |
| `PostCharge amountMinor: 100000` | `200`, `taxMinor: 8500`, `feeMinor: 0` |
| `RecordPayment method: cash, amountMinor: 6000` | `200`, `balanceMinor: 102500` |
| `UpsertChargeItem priceMinor: 2500` | `200`, item stored |
| `PostCharge amountMinor: -1` | `400`, `amountMinor cannot be negative.` |
| `RecordPayment amountMinor: 0` | `400`, `amountMinor must be positive.` |
| `UpsertChargeItem priceMinor: -1` | `400`, `priceMinor cannot be negative.` |
| `UpsertTaxFeeRule percent: "eight"` | `400`, `percent must be a number.`; pre-change answered `percent is required.` |
| `UpsertTaxFeeRule percent: 101` | `400`, `percent must be between 0 and 100.` (unchanged) |
| `UpsertTaxFeeRule` without `percent` | `400`, `percent is required.` (unchanged) |

A fractional request that carried `idempotencyKey: refused-635` was
refused, the key count stayed at `2`, and the corrected `12` with the
same key was served as a first attempt and raised it to `3`: a refused
request consumes no idempotency key.

## No-configuration check (AMT19)

The diff of `deploy/`, `docs/devops/`, and `docs/operations/` carries no
money ceiling, and `MONEY_CEILING_MINOR` in
`services/billing/src/main/java/com/hotel/billing/web/BillingController.java:33`
is the only source of the value. `Messages.formatNumber` is the only
renderer of the `{max}` placeholder.

## Gates

- `mvn verify` in `services/billing`: 65 tests, 0 failures (guard set
  `AMT1`–`AMT20`, with `AMT12`, `AMT16`–`AMT18` re-run unedited).
- `script/contract-check.sh`, `script/openapi-route-check.sh`, and
  `script/catalogue-coverage-check.sh`: PASS.
- Slice record: `docs/testing/test-report.md` section 8.1.
