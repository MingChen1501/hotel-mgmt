# Server-side reservation price basis test traceability (Refs #632)

Status: active. Testing spec for the T3 server-side reservation price
authority change
([issue #632](https://github.com/MingChen1501/hotel-mgmt/issues/632),
audit finding R2 of the #625 class), owned by `qa-lead`. It maps the
done-conditions of the change — `AC-PRC-1`..`AC-PRC-5` and the desk
condition `AC-DSK-20`, owned by `product-owner` in
`docs/product/acceptance-criteria.md` [section 17](../product/acceptance-criteria.md)
and [section 11](../product/acceptance-criteria.md) — and the
behaviour-scoped requirements `FR-PRC-1`..`FR-PRC-5`, owned by
`business-analyst` in
`docs/requirements/mvp-requirements.md` [section 25](../requirements/mvp-requirements.md),
to their guards: the pins that exist on disk at this spec head, the
guard registry `PA1`–`PA14`, and the evidence rule `PA-E1`.

Written before the implementation PR. Every guard in the registry is a
**named, missing obligation** at this head: no row here marks a guard
complete before it exists and passes, and the slice is not complete
until the implementation PR merges and `qa-lead` re-pins every row at
the merged head (the `#588 -> #599` pattern). Section 2 cites what is
on disk today and what it proves; its note column says which pins the
implementation PR **rewires** (a pin that today asserts the
caller-supplied total) and which it extends without deletion, and
section 5 says which cases it must create.

Companion specs: the authority boundary, the contract delta, and the
four per-flow diagrams in `docs/architecture/lld.md`
[section 24](../architecture/lld.md) (24.1 ownership, 24.2 the write
algorithm, 24.3–24.6 the Create and Modify happy/refusal diagrams,
24.7 the contract delta, 24.8 the verification plan this plan aligns
with, 24.9 residual risks and rollback); ADR-0006
(`docs/architecture/decisions/adr-0006-server-side-reservation-price-authority.md`,
status `proposed` — the owner accepts it before the implementation PR
merges); the planned as-built delta in
`docs/architecture/services/reservations.md`
[section 9](../architecture/services/reservations.md); the error
registration in `docs/technical/error-handling.md`
[section 5](../technical/error-handling.md); the advisory-field
convention in `docs/technical/api-spec.md` and C1 in
`docs/technical/integration.md`; the desk delta and T2 UI contract in
`docs/product/desk-ui-design-rollout.md`
[section 6.18](../product/desk-ui-design-rollout.md); `BR-47` in
`docs/requirements/business-rules.md`; D-28 in
`docs/project/decision-log.md`; R-12 in
`docs/project/risk-register.md`; and the sibling tests this slice must
not disturb: `checkout-settlement-test-traceability.md` (#601),
`departure-release-test-traceability.md` (#646),
`arrival-reassign-test-traceability.md` (#647), plus the
#586/#588/#600/#601/#646/#647 rows in `traceability-matrix.md`
sections 9–15. This spec implements no code, changes no guard, adds no
catalogue key, and moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T3, confirmed by `architect` (ADR-0006; HLD
  [section 18](../architecture/hld.md), LLD
  [section 24](../architecture/lld.md)): Pricing becomes the authority
  for a stored money fact and Reservations gains its first synchronous
  read of Rates' pricing side. The contract change is additive only
  (`PRICE_CHANGED` 409, `UPSTREAM_UNAVAILABLE` 503, advisory
  `priceBasis` wording); no schema, table, column, migration, backfill,
  event, lifecycle state, or stored-shape change.
- No MVP row moves. `FR-RES-1`, `FR-RES-2`, and `FR-RTE-5` keep their
  wording and their existing guards and gain only the amendment
  pointer; the 57-row MVP coverage count in `traceability-matrix.md`
  stands unchanged and no MVP row may cite this slice as its guard. The
  slice rows live in `traceability-matrix.md` section 16.
- No new NFR. Requirements section 25.4 is a no-change statement:
  performance (`NFR-PERF-1` — one bounded read inside a request the
  operator already made, the existing 5-second client timeout),
  availability (`NFR-AVL-1` — every module on the same installation;
  the offline-first rule does not extend to a money fact),
  concurrency (`NFR-CON-1`, `NFR-CON-2` — the quote sits outside the
  guarded store step), audit (`NFR-AUD-1`, `BR-2`), catalogue and
  locale (`NFR-I18N-1`, `NFR-DSK-1`), roles (`NFR-SEC-1`,
  `NFR-SEC-2`), retention and time all hold with the existing guards,
  and `PA9`, `PA10`, `PA13`, and `PA14` are their slice half.
- Two behaviours are deliberately **not** refused or repaired and must
  stay that way, because a guard that "fixes" them would break the
  accepted decision: a booking that already exists is returned at its
  stored total instead of being re-quoted (`PA6`), and a booking frozen
  at a caller-supplied total before this change keeps that total —
  nothing is re-derived, backfilled, or rewritten (`PA-E1` records the
  operational note).
- Guards are rewired or extended, never deleted. The two service pins
  that today assert the caller-supplied total
  (`services/reservations/internal/service/service_test.go:34-47` and
  `:121-135`) keep their place and their happy-path shape and switch
  their expectation to the quote's total; every other pin in section 2
  keeps its assertions. A deleted assertion is a failing review
  finding, not a simplification.
- Copy: `desk.book.refused_price_changed` (rollout section 6.18) and
  the service message `error.price.changed` do not exist at this head.
  The implementation PR adds the desk key in both locales with its
  `{total}` placeholder intact, and the recovery-failed case reuses the
  existing `desk.book.refused_noprice` (`messages/en.json:425`);
  `PA14` fails an invented string rather than accepting one.
- Contract and LC: this slice **has** a contract delta (LLD 24.7), so
  the LC stage is not a bare re-run — the two new codes, the advisory
  `priceBasis` wording, the version bumps, the OpenAPI mirror, and the
  new fixtures are the implementation PR's to land (`PA14`). A shape
  that removes, renames, or retypes a field re-tiers the change.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head (the stack's
requirements commit `15c1320`; the service tree is the `master` tree at
`8cb42ca`, since the sibling spec PRs touch only `docs/`). They prove
today's behaviour: the frozen total is whatever the caller sent and
nothing on the booking path quotes. "Rewired" means the pin exists,
must keep its coverage, and its expectation moves to the quote's
values; "stays green" means it must pass untouched.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/reservations/internal/service/service.go:101-103` (Create) | The only check on the frozen total: present and `>= 0`, otherwise `VALIDATION_FAILED` naming `priceBasis` | Rewired: `PA5` keeps the 400 for absent/negative; the new quote compare sits after the read and `PA1`/`PA2` add the 409 |
| `services/reservations/internal/service/service.go:114-118`, `:117` | An unwired restriction hook refuses 503 and `CheckRestrictions` runs before anything is written | Stays green: `PA9` keeps the refusal and the ordering, and asserts the quote is asked only after the restriction check passes |
| `services/reservations/internal/service/service.go:127` | The validated request total is handed to the store verbatim | Rewired: the same hand-off carries the quote's total and discount name; `PA1`, `PA3`, `PA4` |
| `services/reservations/internal/service/service.go:181-183` (Modify) | Modify refuses only an absent/negative total | Rewired: `PA5` keeps the 400; `PA11` adds the 409/503 refusals with the stored row untouched |
| `services/reservations/internal/service/service.go:219-223`, `:233` | Modify re-checks restrictions on the effective values, then stores the supplied total | Rewired: `PA10`–`PA12` assert the post-change quote total, the quote's discount name, and the effective values the quote was read with |
| `services/reservations/internal/store/store.go:236-237` | The store persists the total and discount name it is handed, unvalidated | Unchanged. `PA3` proves the handed values are the quote's; `PA7`/`PA8` prove a refusal never reaches this line |
| `services/reservations/internal/store/store.go:437-441` | A changed total writes one `priceBasis` change row with the actor | Unchanged. `PA10` asserts exactly one row with actor and recorded time; `PA11` asserts no row on any refusal and none when the total is unchanged |
| `services/reservations/internal/store/store.go:208-210`, `:249-250` | `Create` replays a stored `idempotencyKey` and records the key only after the write | Unchanged. `PA6` asserts a replay returns the stored total with no second quote; `PA1`/`PA2`/`PA7`/`PA8` assert a refusal records no key |
| `services/reservations/internal/store/store.go:252-254` | The `created` outbox event | Unchanged. `PA1`/`PA2`/`PA7`/`PA8` assert no event on a refusal |
| `services/reservations/internal/store/store.go:46-58` | The stored row carries `TotalMinor` and `DiscountName` only — no plan reference, no nightly breakdown | Unchanged (the stored shape is frozen by the issue's Out list). `PA3` reads exactly these two fields; a widened shape is a re-tier finding |
| `services/reservations/internal/store/store.go:206-207` | The store mutex around the whole booking write — the guarded step that makes paired bookings produce one winner | Unchanged. `PA9` keeps the one-winner pin green and asserts the quote is read outside this step (no network call under the lock) |
| `services/reservations/internal/store/store_test.go:32-71` (`TestPairedBookingExactlyOneWins`) | Paired simultaneous bookings for the last unit: exactly one winner, the loser `CONFLICT` naming type and dates | Stays green; `PA9` keeps it and adds the "no quote inside the guarded step" assertion |
| `services/reservations/internal/store/store_test.go:87-103` (`TestIdempotentReplayReturnsOriginal`) | A repeated key returns the original reference and stores one booking | Stays green; `PA6` adds the service-seam half (the quote hook is not called again) |
| `services/reservations/internal/store/store_test.go:108-148` (`TestModifyRepricesAndRecordsChange`) | The `FR-RES-2` reprice pin: a `priceBasis` change row carrying actor and timestamp, beside the dates row | Stays green; `PA10` adds the quote provenance and the discount name |
| `services/reservations/internal/store/store_test.go:152-172` (`TestModifyCheckedInRefused`) | A booking that left `confirmed` cannot be modified (`STATE_ILLEGAL`) | Stays green; `PA12` keeps the refusal for checked-in, cancelled, and no-show |
| `services/reservations/internal/service/service_test.go:34-47` (`TestCreateHappyPath`) | Create books the supplied `24000` — the trust this change replaces | **Rewired at the same place**: the quote stub returns the same total so the happy path still proves a booking, and `PA3` adds the "the stored value came from the quote" assertion (a stub whose quote differs must set `PA1`/`PA2` red) |
| `services/reservations/internal/service/service_test.go:62-78` (`TestRestrictionViolationRefusesWithCause`) | A restriction refusal is `STATE_ILLEGAL` with the cause named and stores nothing | Stays green; `PA9` adds that the quote hook was never called |
| `services/reservations/internal/service/service_test.go:80-90` (`TestCreateNilHookFailsClosed`) | An unwired restriction hook refuses 503 `UPSTREAM_UNAVAILABLE` and stores nothing | Stays green; `PA7` adds the unwired **quote** hook as a separate case |
| `services/reservations/internal/service/service_test.go:92-107` (`TestGuardRefusesSecondBookingForLastUnit`) | The last sellable unit refuses `CONFLICT` on the second booking | Stays green; `PA9` |
| `services/reservations/internal/service/service_test.go:121-135` (`TestModifyHappyPathReprices`) | Modify stores the supplied `26000` — the Modify half of the hole | **Rewired**: the quote stub returns `26000` for the new type and dates; `PA10` asserts the total and discount provenance |
| `services/reservations/internal/service/service_test.go:137-149` (`TestModifyRequiresRepricedTotal`) | A missing total on Modify is `VALIDATION_FAILED` | Stays green as `PA5`'s Modify half |
| `services/reservations/internal/service/service_test.go:166-185` (`TestModifyNilHookFailsClosed`) | An unwired restriction hook on Modify refuses 503 and keeps the stored dates | Stays green; `PA11` adds the quote-hook half and extends "kept" to the stored total and discount |
| `services/reservations/internal/handler/handler.go:130`, `:145-146` | The Create handler reads `priceBasis` from the body and passes it through | Shape unchanged; `PA5` keeps the absent/negative 400 at the transport edge |
| `services/reservations/internal/handler/handler.go:157` | The Create response reports `quotedTotal` from the stored record | Rewired: `PA3` asserts `quotedTotal` equals the quote |
| `services/reservations/internal/handler/handler.go:240`, `:252-253`, `:264` | The Modify handler reads `priceBasis` and reports `recalculatedTotal` from the stored record | Rewired: `PA10` asserts `recalculatedTotal` equals the post-change quote |
| `services/reservations/internal/handler/handler_test.go:46-57` (`loopBody`) | The Create fixture body carries `priceBasis.totalMinor` | Shape unchanged; `PA5` keeps the 400 for an absent total and `PA1`/`PA2` build the forged bodies on it |
| `services/reservations/internal/handler/handler_test.go:59-91`, `:171-265` | The desk loop books with `quotedTotal` `24000` and the lifecycle modifies with `recalculatedTotal` `26000` | Rewired so the stub quote returns those totals; `PA3`/`PA10` assert the reported numbers equal the quote |
| `services/reservations/internal/handler/handler_restrictions_test.go:33-63` | A restricted stay refuses end to end with the cause named and the caller Bearer token forwarded | Stays green; `PA7` asserts the quote read also forwards the caller token |
| `services/reservations/internal/handler/handler_restrictions_test.go:65-85`, `:87-99` | An unreachable Rates and an unwired hook each refuse 503 end to end and store nothing | Stays green; `PA7` adds the quote-specific end-to-end pair and the `details.operation` assertion |
| `services/reservations/internal/pricing/client.go:43-87` (`Check`) | The refusal-unchanged / fail-closed shape the new `QuotePrice` call must copy: 5-second timeout, caller Bearer forwarded, a parsed envelope returned unchanged, everything else 503 | Extended with a sibling `QuotePrice` operation in the same shape; `PA7`/`PA8` pin the copy |
| `services/reservations/internal/pricing/client_test.go:61-72`, `:74-84` | Unreachable Rates and an unparseable 5xx both map to 503 `UPSTREAM_UNAVAILABLE` with the upstream named | Stays green; the new call is pinned the same way, with the timeout and non-envelope cases added (`PA7`) |
| `services/reservations/internal/messages/en.json:51` | `error.validation.price_basis` exists | Unchanged; `PA14` adds `error.price.changed` |
| `app/src/views/BookView.vue:788-801` | The Book screen quotes with the type, dates, and typed discount and mints one key per quote | Unchanged on the happy path; `PA13` pins the recovery's re-read with the same held values and a fresh key per fresh quote |
| `app/src/views/BookView.vue:930-937` | The confirm sends `priceBasis` from the active quote plus its key | Unchanged; `PA3`/`PA13` assert the sent total is the displayed quote |
| `app/src/views/BookView.test.ts:506-554` | The quote request body carries the quoted type and both ISO dates | Stays green |
| `app/src/views/BookView.test.ts:556-602` | The confirm sends the frozen price basis, the searched sellable count, and one idempotency key | Stays green; `PA13` adds the price-changed branch beside it |
| `app/src/views/BookView.test.ts:1060-1157` | The no-price, sold-out, and restriction refusals map to their catalogue sentences | Stays green; `PA13` follows the same mapping pattern for the new sentence |
| `app/src/views/BookView.test.ts:1158-1267` | A double-clicked confirm books once on one quote key | Stays green; `PA13` asserts the same for the second confirm after a re-quote |
| `messages/en.json:425`, `messages/vi.json:425` (`desk.book.refused_noprice`) | The no-price sentence exists in both locales | Unchanged; reused by the recovery-failed case, and `PA14` adds `desk.book.refused_price_changed` beside it |
| `app/src/views/StayView.test.ts:1308`, `:1391`, `:1458`, `:1528`, `:1582` | The #600 room charge posts `priceBasis.totalMinor` on the check-out review and gates the close on it | Stays green: this is the downstream money the change protects; `PA3` reads the same field |
| `app/src/views/StayView.test.ts:1750`, `:1949`, `:2040` | The #601 settlement gate: a provenanced approval, an unpaid close refused, `SETTLEMENT_REQUIRED` mapped plainly | Stays green unchanged |
| `app/src/stay-restyle.test.ts`, `app/e2e/stay.spec.ts`, `app/e2e/design-facts.spec.ts` | The #647 desk pins that landed with #673 | Stay green; this slice touches none of the desk stay surfaces |
| `contracts/http/CreateReservation.json`, `ModifyReservation.json`, `contracts/errors/envelope.json` | `priceBasis` is required and unconditional; the envelope enum has no `PRICE_CHANGED` and no `UPSTREAM_UNAVAILABLE` (no occurrence under `contracts/`) | Changed by the implementation PR per LLD 24.7; `PA14` is the guard, and `contracts/openapi.yaml` plus the `frontend/docs/openapi.yaml` mirror must move byte-identically |
| `services/reservations/contract-tests/` (`CreateReservation.json`, `CreateReservation-restricted.json`, `CreateReservation-missing-guest-field.json`, `ModifyReservation.json`, …) | The passenger fixtures that replay today's shapes and refusals | Extended with the two new refusals; `PA14` names the fixtures the implementation PR adds |

## 3. Guard registry PA1–PA14 and the evidence rule PA-E1

All fourteen guards are **missing at this spec head** and created by
the implementation PR: `PA1`–`PA9` at the Reservations service seam
(`services/reservations/internal/service/service_test.go`, with the
end-to-end halves in `internal/handler/handler_test.go` and
`internal/handler/handler_restrictions_test.go`), `PA10`–`PA12` at the
same seam plus the store parity block
(`internal/store/store_test.go`, `internal/store/postgres_test.go`),
`PA13` in `app/src/views/BookView.test.ts`, and `PA14` across
`contracts/`, `services/reservations/contract-tests/`,
`services/reservations/internal/messages/en.json`,
`messages/en.json`, and `messages/vi.json`.

A money-path guard is not complete on a status code alone. Every
refusal case also asserts **what was not written** — the reservation
count for the type and dates, the change list, the outbox events, and
the idempotency record — because the defect this slice fixes is a
stored number, and a 409 can be right while a row was still written.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `PA1` | **Forged low on create**: a body asserting `priceBasis.totalMinor: 0` while the quote returns `6000` is refused `PRICE_CHANGED` (409) with `requestedTotalMinor: 0`, `quotedTotalMinor: 6000`, the room type, and both dates; no reservation row, no consumed availability, no `created` event, no change row, no idempotency record (a follow-up create with the same key books once at the quote, proving the refused attempt recorded nothing) | `services/reservations/internal/service/service_test.go` |
| `PA2` | **Forged high on create**: a body asserting a total above the quote, and a body asserting `0` for a priced stay, each produce the same 409 with the two totals named; a second quote is never substituted into the response as if booked | same file |
| `PA3` | **Matching create stores the quote**: the stored `priceBasis.totalMinor` and `discountName` are the quote's values, `quotedTotal` and `GetReservation` report the same number, and the #600 charge path reads that field; the request's own number is never the source (a quote stub returning a different total flips this case red rather than passing silently) | same file + `internal/handler/handler_test.go` |
| `PA4` | **Legitimate zero**: a complimentary discount quotes `0`, the booking is stored at `0`, and the stored value is the quote's — proving zero is a quote value, not a missing one, and that `PA1`'s zero refusal is about disagreement, not about zero | `services/reservations/internal/service/service_test.go` |
| `PA5` | **Shape gate unchanged**: an absent and a negative `priceBasis` still refuse `VALIDATION_FAILED` (400) naming `priceBasis`, on create and on modify, and never a 409 — the price-changed refusal only ever answers an asserted disagreement | same file + `internal/handler/handler_test.go` |
| `PA6` | **Replay before re-quote**: a repeated `idempotencyKey` returns the stored booking at its stored total, the quote hook's call count does not move, and no `PRICE_CHANGED` is raised for a booking that exists; the store's own replay check remains the exactly-once guard | same file |
| `PA7` | **Unreadable Pricing fails closed**: a transport failure, a timeout, a 5xx, a non-envelope reply, and an unwired client each refuse 503 `UPSTREAM_UNAVAILABLE` with `details.upstream: rates` and `details.operation: QuotePrice`, storing nothing, on create and on modify; the same fixture with a readable quote books, so "always 503" cannot hide an unreadable path | `internal/pricing/client_test.go`, `internal/service/service_test.go`, `internal/handler/handler_restrictions_test.go` |
| `PA8` | **Definitive Rates refusals pass through unchanged**: `NOT_FOUND` with `reason: no_rate_price`, `NOT_FOUND` with `reason: no_rate_plan`, `VALIDATION_FAILED` naming `discountName` for an unknown discount, and `VALIDATION_FAILED` naming `ratePlanName` for an ambiguous plan set keep their code, status, and details and store nothing | same files as `PA7` |
| `PA9` | **Order and bounds**: a restriction refusal still answers `STATE_ILLEGAL` with its cause and the quote hook is never called; the quote read sits outside the guarded store step, so paired simultaneous bookings for the last unit still produce exactly one winner and one `CONFLICT`; the replay pre-read only decides whether Pricing is asked | `internal/service/service_test.go`, `internal/store/store_test.go` |
| `PA10` | **Modify reprices and records it**: a date or type change stores the post-change quote total and the quote's `discountName`, reports the same number as `recalculatedTotal`, and writes exactly one `priceBasis` change row carrying the actor and the recorded time beside the other changed fields; a change that leaves the total equal writes no price-basis row | `internal/service/service_test.go`, `internal/store/store_test.go`, `internal/handler/handler_test.go` |
| `PA11` | **Modify refusals change nothing**: a forged total refuses 409, an unreadable Pricing refuses 503, and each definitive refusal is surfaced unchanged — in every case the stored dates, type, guest, total, discount, and change history are byte-identical to before the attempt | same files as `PA10` |
| `PA12` | **Modify effective values**: an omitted field keeps its stored value, an omitted or null `discountName` means the new quote carries none, the quote is read for the post-change type and dates (asserted on the stub's received arguments), and a booking that left `confirmed` (checked in, cancelled, no-show) still refuses as today | same files as `PA10` + `internal/store/store_test.go` |
| `PA13` | **Desk price-changed recovery (`AC-DSK-20`)**: on `PRICE_CHANGED` the Book screen re-reads `QuotePrice` for the type, dates, and discount it already holds, shows the new total in `desk.book.refused_price_changed`, and only a second `Confirm` books — at the new total, never reporting the earlier one as booked, with one key per quote so a double click books once; a failed re-read says the price could not be re-read and books nothing, reusing `desk.book.refused_noprice` when the type lost its price; a `UPSTREAM_UNAVAILABLE` refusal keeps the displayed quote and the plain panel error with no re-quote; a matching total leaves the screen unchanged | `app/src/views/BookView.test.ts` |
| `PA14` | **Contract, fixtures, and copy**: `PRICE_CHANGED` (409) and `UPSTREAM_UNAVAILABLE` (503) are in `contracts/errors/envelope.json`'s enum and `statusMapping`; `CreateReservation.json` and `ModifyReservation.json` carry the advisory `priceBasis` wording, both error codes, and their version bump; `contracts/openapi.yaml` and the `frontend/docs/openapi.yaml` mirror are byte-identical; `services/reservations/contract-tests/` gains a price-changed and an unreadable-Pricing fixture that replay; `error.price.changed` exists in the service messages; `desk.book.refused_price_changed` exists in `messages/en.json` and `messages/vi.json` with `{total}` intact and the pair matching rollout section 6.18; no invented key stands in for a table key | `contracts/`, `services/reservations/contract-tests/`, `services/reservations/internal/messages/en.json`, `messages/en.json`, `messages/vi.json` |
| `PA-E1` | **Evidence rule**: the implementation PR records, in `docs/testing/evidence/632/README.md` (same capture method as the #588/#647 records), the forged-low and unreadable-Pricing reproduction — before, against the pre-fix build: a caller-supplied total is stored verbatim and read back by the booking read and the check-out charge; after, against the fixed build: the same attempts refuse 409 and 503 with nothing stored — plus the guard-suite run and the slice row in `docs/testing/test-report.md` (exit criterion 6 of `test-strategy.md` [section 3](test-strategy.md)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every row except the vendor/desk-green row,
which is covered today by pins that exist and pass and must keep
passing. For a pending row the guard does not exist at this spec head:
the implementation PR creates it, and `qa-lead` re-pins the row with
`file:line` at the merged head and flips it to covered only when the
guard passes.

| Item | Required guard | Guard |
|---|---|---|
| `AC-PRC-1` — the frozen total and the stored discount name are the values `QuotePrice` returns for the effective room type, dates, and discount read in the same request; the request's total never sets a stored value; a matching request books at that total and the stored value is what the reservation read, the calendar, and the check-out room charge read; a repeated `idempotencyKey` returns the stored booking, never a second quote | L1 acceptance + downstream read | **Pending** — `PA3`, `PA4`, `PA6`; today's opposite is pinned at `services/reservations/internal/service/service.go:101-103`, `:127`, `services/reservations/internal/store/store.go:236`, and the rewired pins at `internal/service/service_test.go:34-47`, `internal/handler/handler_test.go:59-91` |
| `AC-PRC-2` — a disagreeing total (lower, higher, or zero for a priced stay) is refused `PRICE_CHANGED` (409) naming both totals plus the type and dates; nothing is booked, no availability is consumed, and a disagreeing total is never stored, rounded, or repaired in place; a legitimate zero is booked only when the quote says zero | L1 acceptance: all three disagreement shapes + the no-write set | **Pending** — `PA1`, `PA2`, `PA4`; today's opposite is the single `>= 0` check at `service.go:101-103` |
| `AC-PRC-3` — unreadable Pricing refuses `UPSTREAM_UNAVAILABLE` (503) naming `rates`/`QuotePrice` with nothing stored, and a definitive Rates refusal is surfaced unchanged (`NOT_FOUND` `no_rate_price`/`no_rate_plan`, `VALIDATION_FAILED` for an unknown discount, `VALIDATION_FAILED` naming `ratePlanName` for an ambiguous plan set) | L1 acceptance: five unreadable shapes + four definitive shapes | **Pending** — `PA7`, `PA8`; the copied shape is pinned today at `internal/pricing/client.go:43-87`, `internal/pricing/client_test.go:61-84`, `internal/handler/handler_restrictions_test.go:65-99` |
| `AC-PRC-4` — a Modify recomputes from the effective post-change type, dates, and discount, refuses a disagreement and an unreadable Pricing, surfaces a definitive refusal unchanged, keeps the stored row in every refusal, and records the price-basis change with the actor and time when the total moves; a booking that left `confirmed` still refuses | L1 acceptance + audit row | **Pending** — `PA10`, `PA11`, `PA12`; the change-row half exists today at `internal/store/store.go:437-441` / `internal/store/store_test.go:108-148` and stays green |
| `AC-PRC-5` — the guards cover the forged-low, forged-high, matching (including a legitimate zero), unreadable, and definitive callers plus the Modify reprice with its history row and actor; the #600 room charge still posts the frozen total and the `AC-RES-1`, `AC-RES-2`, `AC-DSK-13`, `AC-DSK-19`, and `AC-CKO-1`/`AC-CKO-2` guards keep passing | L1 + audit + downstream + re-run | **Pending** — `PA1`–`PA12`, with the green half on the downstream-green row and the desk half in `PA13` |
| `FR-PRC-1` — the total a new reservation freezes is the Pricing quote, read for the effective type, dates, and discount with the caller's session forwarded; the stored discount name is the quote's applied name; the request value is compared and nothing more; an absent or negative basis still refuses `VALIDATION_FAILED` | L1 acceptance | **Pending** — `PA3`, `PA4`, `PA5`; today's trust is pinned at `internal/service/service_test.go:34-47` and the desk pairing at `app/src/views/BookView.test.ts:556-602` |
| `FR-PRC-2` — a request total that disagrees is refused with `PRICE_CHANGED` naming both totals, type, and dates, and nothing is written (no row, availability, change entry, idempotency record, or event) | L1 acceptance: the disagreement set + the no-write set | **Pending** — `PA1`, `PA2`; the absent-total 400 that must survive as a different refusal is `PA5` |
| `FR-PRC-3` — an unreadable Pricing refuses `UPSTREAM_UNAVAILABLE` (503) naming `rates`/`QuotePrice`; a definitive refusal is surfaced unchanged; no stay is ever frozen at an unverified, invented, or assumed-zero total | L1 acceptance: the two families kept apart | **Pending** — `PA7`, `PA8`; the fail-closed shape to copy is `internal/pricing/client.go:43-87` |
| `FR-PRC-4` — Modify reprices on the same terms, records the price-basis change with actor and time, and keeps the stored row in every refusal; an omitted field keeps the stored value and an omitted/null discount name means no discount on the new quote | L1 acceptance + audit row | **Pending** — `PA10`, `PA11`, `PA12`; the reprice pin `internal/store/store_test.go:108-148` stays green |
| `FR-PRC-5` — a stored booking is returned rather than re-quoted, the quote sits outside the guarded store step so the concurrency guards keep their bounds, the restriction check keeps its place and `STATE_ILLEGAL` terms, and every refusal writes nothing | L1 acceptance + L3 pair | **Pending** — `PA6`, `PA9`; the pair `internal/store/store_test.go:32-71` and the replay `:87-103` stay green |
| `AC-DSK-20` (desk half) — a price-changed refusal is recovered by re-reading the quote, showing the new total, and asking for a second confirmation; a failed re-read books nothing and says so; an unreadable Pricing keeps the displayed quote and the plain error; a matching total changes nothing | L1 desk acceptance + catalogue | **Pending** — `PA13`, `PA14` (the new key); the quote flow it builds on is pinned at `app/src/views/BookView.test.ts:506-554`, `:556-602`, `:1158-1267` |
| Downstream and desk stays green (`AC-RES-1`, `AC-RES-2`, `AC-DSK-13`, `AC-DSK-19`, `AC-CKO-1`/`AC-CKO-2`, and the #600 room charge) | Behaviour check: the booking read, the modify read, the quote display, the check-out room charge, the settlement gate keep their words and calls, and the charge posts the frozen total | **Covered by re-run at this spec head** — `app/src/views/BookView.test.ts:396`, `:506-554`, `:556-602`, `:1060-1157`, `:1158-1267`, `app/src/views/StayView.test.ts:1308`, `:1391`, `:1458`, `:1528`, `:1582`, `:1750`, `:1949`, `:2040`, `app/src/views/desk-edge-guards.test.ts`, `app/e2e/stay.spec.ts`, `app/e2e/design-facts.spec.ts`; these must pass unchanged after the implementation PR — a behaviour edit in one of them fails the row |
| Contract and LC | A real delta, not a re-run: two new codes in the envelope, advisory `priceBasis` wording with version bumps in both operation manifests, the byte-identical OpenAPI mirror, and the two new fixtures | **Pending gate** — `contracts/errors/envelope.json`, `contracts/http/CreateReservation.json`, `ModifyReservation.json`, `contracts/openapi.yaml`, `frontend/docs/openapi.yaml`, `services/reservations/contract-tests/`, `script/contract-check.sh`, `script/openapi-route-check.sh`; `PA14` is the guard, and an unregistered code or a drifted mirror is a re-tier finding |
| MVP no-change statement | No new MVP row, story, or FR id; `FR-RES-1`, `FR-RES-2`, and `FR-RTE-5` gain only the amendment pointer | **Pending gate** — the 57-row MVP coverage count stands unchanged in `traceability-matrix.md` and no MVP row cites this slice as its guard |
| Evidence cross-reference (`PA-E1`) | The forged-low and unreadable-Pricing reproductions are recorded from a lab, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/632/README.md` and the `test-report.md` row are created by the implementation PR; the reproduction is also recorded in that PR's body or an issue comment |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 24.8](../architecture/lld.md)) |
|---|---|---|
| L1 + L3 service, Reservations | `PA1`–`PA12`, plus every section 2 pin: the create/modify/handler/store suites and the Postgres parity block | `cd services/reservations && go build ./... && go vet ./... && go test ./... && test -z "$(gofmt -l .)"` (CI `go-build`) |
| LC contract | The two new fixtures replay, the operation manifests parse, and the OpenAPI mirror is byte-identical | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`) |
| Desk unit | `PA13` plus the Book pins of section 2 unchanged | `cd app && npm ci && npm run build && npm run lint && npm test` (CI `app-build`) |
| Desk browser | The served SPA books, refuses, and recovers on the Book screen | CI `browser-e2e` |
| Live desk loop | A forged-low attempt, a healthy booking, and a Modify reprice through the API loop and the desk | `script/e2e-desk-loop.sh` (CI `e2e-single-host`) |
| Gates | Catalogue, links, harness conventions, pre-flight | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `script/test-preflight-fail-closed.sh`, `git diff --check` |

CI jobs that must be green on the implementation PR: `go-build`
(reservations), `app-build`, `contract-check`, `e2e-single-host`,
`browser-e2e`, `dom-diff`, and `ci` (catalogue coverage, links,
harness conventions).

### Execution order

1. Service suite first — the store pins and the Postgres parity block
   must be green before the new cases are read, because `PA10`'s change
   row and `PA9`'s one-winner pair depend on them.
2. Contract and route checks — `PA14`'s code registration and mirror
   move before any desk case is meaningful.
3. Desk unit suite (`PA13`). A red `PA*` case stops the run.
4. Browser and live desk loop.
5. `PA-E1`: the lab reproduction record and the before/after pair.
6. Catalogue, link, and harness gates, then the test-report row.

### Entry criteria

1. The #632 T3 spec set (`docs/product/acceptance-criteria.md`
   section 17, `docs/product/desk-ui-design-rollout.md` section 6.18,
   `docs/requirements/mvp-requirements.md` section 25, ADR-0006, HLD
   section 18, LLD section 24, and this document) carries a
   `SPEC-GATE PASS` on #632.
2. The owner has accepted ADR-0006 (`proposed -> accepted`); a T3
   change does not merge on a proposed decision record.
3. The #600 room charge, the #601 settlement gate, the #646 departure
   release, and the #647 reassignment are merged (all on `master` at
   this spec head), so the downstream pins in section 2 are the real
   baseline.
4. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json`, with at least one room
   type that has a nightly price, one discount, and one type with no
   price for a given night (the definitive-refusal fixtures).

### Exit criteria

1. `PA1`–`PA14` exist and pass; every refusal case also asserts the
   no-write set (reservation count, change list, events, idempotency
   record).
2. Every "stays green" pin in section 2 passes unchanged; the two
   rewired pins keep their happy-path coverage and assert the quote's
   values.
3. The contract stage is green **with** the delta: both codes
   registered, the mirror byte-identical, both fixtures replaying.
4. `PA-E1` is recorded: the two reproductions, the before/after pair in
   `docs/testing/evidence/632/README.md`, and the slice row in
   `docs/testing/test-report.md`.
5. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
   section 4 at the merged head and flipped the rows.
6. Open failures are filed as issues with FR/NFR ids; no `risk-high`
   failure is waived without owner approval.

### Negative controls

A guard that only checks a status code is insufficient.

- `PA1`, `PA2`, `PA7`, `PA8`, and `PA11` each assert the no-write set,
  so a 409 or a 503 can never pass while a row, an event, or an
  idempotency record was still written.
- `PA3` fails on a quote stub that returns the request's number, so
  "the stored total matches" cannot pass by the stub agreeing with the
  caller.
- `PA4` is the pair that keeps `PA1` honest: a zero total is refused
  only because it disagrees with a priced quote, not because zero is
  refused as a value.
- `PA7` says "or an unwired client" on purpose: a client that silently
  skips the quote must fail closed, so an unreadable path can never
  become an unverified booking.
- `PA8` keeps the definitive and unreadable families apart: turning a
  `no_rate_price` refusal into a 503 would misreport the desk's quote
  step, and turning a transport failure into a 404 would book nothing
  but say the wrong thing.
- `PA9` carries its own control: a restriction refusal must prove the
  quote was never called, otherwise a booking could be quoted for a
  stay the restrictions already refuse.
- `PA13` fails a screen that books on the first `Confirm` after the
  refusal and a screen that reports the old total as booked; the
  double-click case proves the second confirm still books once.

## 6. Owner verification cases (PA-1..PA-8)

Plain-language cases the owner can run on the lab once the change
lands, using the `script/e2e-desk-loop.sh` recipe (sign-in token,
seeded room type with a nightly price, `api reservations
CreateReservation` body) plus the desk. Steps are the same for each
case unless stated: sign in, seed a guest, then act as described and
read the reply, `GetReservation`, the calendar, and the desk screen.

| Case | Setup | Expected |
|---|---|---|
| `PA-1` | Call `CreateReservation` directly with `priceBasis.totalMinor: 0` for a type that quotes `6000` | Refused `PRICE_CHANGED` naming both totals, the type, and the dates; no booking on the calendar, no row, no charge later |
| `PA-2` | The same call with a total far above the quote | The same refusal with the two totals swapped in the message; nothing stored |
| `PA-3` | Book at the desk through the normal quote-then-confirm path | Booked at the quoted total; `GetReservation` and the confirmation show the same number; the check-out review posts exactly that room charge |
| `PA-4` | Stop the Rates service, then book at the desk; start Rates and repeat the same booking | Refused `UPSTREAM_UNAVAILABLE` with nothing booked and no half row; after Rates returns, the same booking succeeds at the quote |
| `PA-5` | Book a type whose night has no price, then one whose type no plan prices, then one with an unknown discount name | Each refuses in the desk's own quote terms (no price, no plan, unknown discount); nothing is stored in any of the three |
| `PA-6` | Modify a booking to cheaper dates, then to more expensive ones | Each change stores the new quoted total, the desk shows it as the recalculated total, and the change history names the actor and the time |
| `PA-7` | Quote a stay, change the nightly price in another tab, then confirm on the first tab | One plain sentence names the new total and asks for a second confirmation; the second confirmation books at the new total; exactly one booking exists and the old total is never reported as booked |
| `PA-8` | A booking created before the change, then a desk pass in both locales | The old booking keeps its frozen total and the charge posts it; the new sentence appears in EN and VI with the total filled in |

## 7. Evidence rule PA-E1

The implementation PR records, in `docs/testing/evidence/632/README.md`
(created by that PR, same capture method as the #588 and #647 records),
one before/after pair plus the guard-suite run:

- **Before**, against the pre-fix build: a direct `CreateReservation`
  call asserting `priceBasis.totalMinor: 0` is stored, read back by
  `GetReservation`, and posted by the check-out room charge — the
  defect in one trace.
- **After**, against the fixed build: the same call refuses
  `PRICE_CHANGED` naming both totals and the calendar, the reservation
  read, and the #600 charge show no booking; the same booking followed
  by a stopped Rates service refuses `UPSTREAM_UNAVAILABLE` instead of
  freezing a number.
- **Plus the honest control:** the desk's normal quote-then-confirm path
  books at the quote on both builds, so the change refuses assertions,
  not bookings.
- **Plus the notes the record must carry for the operator:** bookings
  frozen at a caller-supplied total before this change keep that total
  and are not re-derived; the Modify path reprices them the next time
  staff change them.

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md` [section 3](test-strategy.md)).

## 8. Slice status and re-pin rule

At this spec head: 15 rows mapped, 1 covered by re-run only (the
downstream-and-desk-green row — its pins exist and pass today and must
keep passing), and 14 pending rows whose guards are the registry
`PA1`–`PA14` plus the contract/LC gate, the MVP no-change gate, and
`PA-E1`. The slice is **not complete**. It completes when the
implementation PR merges with `PA1`–`PA14` green, the section 2 pins
unchanged (the two rewired pins carrying the quote's values), `PA-E1`
recorded, and `qa-lead` re-pins every row in section 4 with `file:line`
at the merged head.

No row in this document may be flipped to covered while its guard is
absent from the tree or failing: a pending row is honest, a
fabricated pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-992
