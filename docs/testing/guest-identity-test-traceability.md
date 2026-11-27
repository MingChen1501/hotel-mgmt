# Guest identity ambiguity and payload bounds test traceability (Refs #640)

Status: active. Testing spec for the T2 guest-identity hardening
([issue #640](https://github.com/MingChen1501/hotel-mgmt/issues/640),
audit findings G1, G2, G3 — the in-memory `findGuest` returns the first
record whose `fullName` matches and the Postgres twin asks for
`LIMIT 1`, so two guests sharing a name hand the desk another guest's
profile (PII) instead of an ambiguity refusal; `contact`, `preferences`,
and `notes` are stored exactly as sent with no per-field shape, length,
or size bound; and `requireDate` tests the shape of a date, not the
calendar, so `2026-13-45` is accepted where the Go services refuse it),
owned by `qa-lead`. It maps the change's done-conditions —
`AC-GID-1`..`AC-GID-7`, owned by `product-owner` in
`docs/product/acceptance-criteria.md`
[section 25](../product/acceptance-criteria.md#25-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640) —
the requirements `FR-GID-1`..`FR-GID-3`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 33](../requirements/mvp-requirements.md#33-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640),
and the business rule `BR-63` in `docs/requirements/business-rules.md`
[the business rules](../requirements/business-rules.md) to their guards:
the pins that exist on disk at this spec head, the guard registry
`GID1`–`GID14`, and the evidence rule `GID-E1`.

Written before the implementation PR. Every new guard in the registry is
a **named, missing obligation** at this head — `findGuest` serves the
first match in both stores, no `contact`/`preferences`/`notes` validator
or bound constant exists, `requireDate` never checks the calendar, and
the `guests.validation.ambiguous_name`, `guests.validation.contact_shape`,
`guests.validation.notes_length`, and `desk.book.guest_ambiguous` keys are
absent from every catalogue — so no row here marks a guard complete
before it exists and passes, and the slice is not complete until the
implementation PR merges and `qa-lead` re-pins every row at the merged
head (the `#588 -> #599` pattern). Section 1 states the tier and the
no-change rules; section 2 cites what is on disk today and what it
proves; section 3 names the guards the implementation PR must create;
section 4 is the traceability map; section 5 is the test plan it must
run; section 6 is the owner verification cases; section 7 the evidence
rule; section 8 the slice status and the re-pin rule.

Companion specs: scope decision D-37 in
`docs/project/decision-log.md` [the decision log](../project/decision-log.md)
and risk R-18 in `docs/project/risk-register.md`
[the risk register](../project/risk-register.md); the UI contract delta
for the Book screen's guest find in `docs/product/desk-ui-design-rollout.md`
[section 6.22](../product/desk-ui-design-rollout.md#622-ambiguous-guest-name-on-the-book-guest-find-refs-640)
(one new plain sentence in both locales, no layout, component, token,
route, or print change); the ambiguity branch, the four bound constants,
the calendar round-trip, the per-flow diagrams, the contract decision,
and the verification plan in `docs/architecture/lld.md`
[section 32](../architecture/lld.md#32-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640);
the planned delta on the guests service page
(`docs/architecture/services/guests.md`
[section 8](../architecture/services/guests.md#8-delta--guest-identity-ambiguity-and-payload-bounds-refs-640),
with the refusal edges in section 4 and the error row in section 6); the
write-time-bounds note in `docs/technical/schema.md`
[section 5](../technical/schema.md) and the guest-payload convention in
`docs/technical/api-spec.md` [section 1](../technical/api-spec.md); and
the refusal in the taxonomy in `docs/technical/error-handling.md`
[section 1.4](../technical/error-handling.md). Sibling tests this slice
must not disturb: the `traceability-matrix.md` MVP rows and sections
9–16, 18, and 20–24 plus their registries
(`checkout-settlement-test-traceability.md` `S1`-`S12`,
`departure-release-test-traceability.md` `DR1`-`DR13`,
`arrival-reassign-test-traceability.md` `RR1`-`RR13`,
`booking-management-view-test-traceability.md` `BM1`-`BM16`,
`availability-derivation-test-traceability.md` `O1`-`O13`,
`folio-write-verification-test-traceability.md` `FW1`-`FW13`,
`internal-error-envelope-test-traceability.md` `ERR1`-`ERR9`,
`body-bounds-test-traceability.md` `BND1`-`BND28`,
`money-amount-bounds-test-traceability.md` `AMT1`-`AMT20`, and
`report-range-cap-test-traceability.md` `RPT1`-`RPT14`). This spec
implements no code, changes no guard, adds no catalogue key, and moves
no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2 (thin), confirmed by `product-owner` (acceptance criteria
  section 25), `business-analyst` (requirements section 33), and
  `architect` (LLD section 32): caller-visible refusals on one read
  operation (`IdentifyGuest`), one write operation (`UpsertGuest`), and
  one snapshot ingestion (`AttachReservation`), plus one
  reader-visible desk state on the existing Book screen, with no new
  subsystem, dependency edge, data model, lifecycle state, endpoint,
  error-code token, or route. No ADR: ADR-0004 D1 keeps the shared
  envelope and its status mapping byte-identical.
- **One ambiguity refusal.** A name that matches two or more guests
  answers exactly one HTTP 400 shared envelope: `code:
  "VALIDATION_FAILED"`, `details` carrying `field: "fullName"`, the
  searched `fullName`, and the exact `matches` count, a fresh
  `traceId`, and the new `guests.validation.ambiguous_name` sentence
  ("The name {fullName} matches more than one guest; identify the guest
  by id."). No profile, `contact`, `preferences`, `notes`,
  `returningFlag`, `pastStayCount`, or `stayLinks` come back, and the
  count is taken before any profile is assembled — a `LIMIT 1` first
  row is not an answer. `CONFLICT` (409) stays the state-conflict
  answer for a resource just taken and is never used for a lookup key.
- **One declared shape and one declared length, on write only.**
  `contact` and `preferences` take a plain JSON object of at most 16
  own fields, each key non-empty and at most 64 UTF-16 code units, each
  value a string of at most 256 code units, a finite number, or a
  boolean; `notes` takes a string of at most 2 000 code units. Four
  named code constants carry the bounds
  (`MAX_GUEST_PAYLOAD_FIELDS` 16, `MAX_GUEST_PAYLOAD_KEY_LENGTH` 64,
  `MAX_GUEST_PAYLOAD_STRING_LENGTH` 256, `MAX_GUEST_NOTES_LENGTH`
  2 000 — LLD 32.3), never an environment variable, deployment file,
  runbook step, or per-hotel setting.
- **One calendar-valid date check.** `dates.checkIn` and
  `dates.checkOut` in `AttachReservation` must exist on the calendar:
  `2024-02-29` is accepted, `2026-13-45`, `2026-02-31`, and
  `2026-00-10` are refused naming the field with the **existing**
  `guests.validation.date_format` sentence, so no catalogue key is
  added for this half. The date-order rule is unchanged: `checkIn`
  after `checkOut` stays as accepted as it is today.
- **Reads are unchanged.** `GetGuest`, `IdentifyGuest` by `guestId`,
  and `GetBookingContext` answer exactly as today, and a profile
  already holding a longer note or a differently shaped object still
  reads as stored — no re-validation, truncation, migration, backfill,
  or data repair exists, in either direction.
- **Every refusal writes nothing.** Each refusal is raised before the
  record, its stay links, and its `guest-upserted` outbox event are
  written (in-memory store) or before the row and link are written
  (Postgres store), so a refused upsert leaves the stored profile
  untouched, and a refused `AttachReservation` stores no confirmation
  (a later `ProduceConfirmation` still answers `NOT_FOUND`).
- **No new token, no contract-shape change.** `VALIDATION_FAILED` is
  already enumerated for `IdentifyGuest`
  (`contracts/http/IdentifyGuest.json:35`) and `UpsertGuest`
  (`contracts/http/UpsertGuest.json:38`); the `IdentifyGuest` error
  line gains prose only (the architect's clause, LLD 32.6), and the
  `UpsertGuest` request manifest keeps its bytes — `contact`,
  `preferences`, and `notes` stay unconstrained there because no
  validator runs on the request schema (LLD 32.6). The
  `contracts/openapi.yaml` desk loop carries no Guests operation, so
  `script/openapi-route-check.sh` and `script/contract-check.sh` stay
  green without an edit.
- **No schema or configuration delta.** `contact JSONB`,
  `preferences JSONB`, and `notes TEXT` keep their columns, defaults,
  types, and (absent) name index
  (`services/guests/migrations/002_schema.sql:22-34`); no migration
  file is added.
- **One desk surface, one sentence.** On the Book screen's guest find
  an ambiguity reads as `desk.book.guest_ambiguous` in both locales,
  resolves no guest, keeps the entered name and the Find and Register
  controls, and never reads as `desk.book.guest_notfound` or
  `desk.shell.request_failed`; the screen switches on the envelope code
  and `details.field`, never on sentence text. No other screen calls
  `IdentifyGuest`, so no layout, route, token, print rule, or other
  screen moves and no further UI contract section applies.
- **No MVP row moves.** The 57-row coverage count in
  `traceability-matrix.md` stands unchanged and no MVP `FR-*`/`NFR-*`
  row may cite this slice as its guard; the slice rows live in
  `traceability-matrix.md` section 25. `FR-GID-1`..`FR-GID-3` are
  requirement additions outside the counted MVP capability set, and
  section 33.4 states that no NFR is added and no existing NFR changes
  (`NFR-I18N-1` and `NFR-AUD-1` are the evidence conditions, not new
  targets).
- **Out of scope, deliberately unguarded here:** the reservation-snapshot
  trust decision (`attachReservation`'s documented ingestion shape, as
  recorded in the audit) and any uniqueness rule on `UpsertGuest` or
  merge/distinguish flow — the issue's scope says out, so no guard in
  this slice asserts them.
- Change-level rollback is one revert: the counted branch, the four
  constants, the calendar round-trip, the three catalogue sentences, the
  desk sentence, and the guards fall back to today's first-match,
  unbounded, shape-only behaviour, and every request the service
  accepted before is accepted again. No migration or data repair exists
  in either direction.
- **No transitional red at this spec head.** The branch is docs-only, so
  the code tree is the base the stacked spec PRs branched from. The Node
  and Vue suites were not re-run in this worktree as part of the spec
  work; they are the unchanged baseline the `node-build (guests)` and
  `app-build` CI jobs last ran on `master`, and the implementation PR
  runs them.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is identical to the stacked spec PRs' base (the product,
requirements, architecture, and testing spec PRs touch `docs/` only).
They prove today's behaviour: a name lookup serves the first match, the
three guest fields are stored as sent, the confirmation dates are
shape-checked only, and no bound, sentence, constant, or ambiguity
guard exists. The implementation PR extends these in place with a `#640`
note and never deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/guests/src/store.ts:308-326` | `findGuest` returns the first record whose `fullName` equals the trimmed name (the walk and early return at `:316-322`) and answers `NOT_FOUND` with `guests.notfound.guest_by_name` at `:323`; no count is taken | `GID1`, `GID3`: the counted branch replaces the early return here; a store holding both same-named guests must refuse, so a restored `return record` fails the guard |
| `services/guests/src/pgstore.ts:169-194` | The Postgres twin runs `SELECT … FROM guests.guests WHERE full_name = $1 LIMIT 1` (`:183-187`) and refuses an empty result at `:188-190`; no count is taken and no `ORDER BY` exists | `GID2`: the query must return the matching rows (or their count) and the refusal must be built by the same shared constructor; `GID12` keeps the columns unbounded |
| `services/guests/src/store.ts:242-245`, `:253`, `:258`; `services/guests/src/pgstore.ts:87-90`, `:98`, `:103` | `identifyGuest`, `getBookingContext`, and `getGuest` all call the one `findGuest`; only `IdentifyGuest` reaches the name branch (`GetGuest` and `GetBookingContext` pass `guestId` only) | `GID4`, `GID5`: the rule lands once per store, and the two `guestId` reads must keep today's answers for two same-named guests |
| `services/guests/src/store.ts:166-168`; `services/guests/src/pgstore.ts:25-27` | `asObject` returns the value unchanged for any non-null object (arrays included) and `{}` otherwise — no shape, field-count, key, or value check | `GID6`, `GID7`: the validator replaces this silent coercion for a present, non-`null` value; an array must be refused, not stored as an array |
| `services/guests/src/store.ts:220-240` | `upsertGuest` checks `guestId`, `fullName`, and `actor`, then stores `contact: asObject(input.contact)` (`:231`), `preferences: … asObject(input.preferences)` (`:232`), and `notes` as any string with a silent fall-back to the stored note (`:233`); the outbox event is pushed at `:238` | `GID6`, `GID8`, `GID3`: the checks go above this body, before `this.guests.set` (`:237`) and the `guest-upserted` push (`:238`), so a refusal writes no row and no event; declaration order `contact`, `preferences`, `notes` (LLD 32.3) |
| `services/guests/src/pgstore.ts:63-85` | The Postgres upsert coerces both objects through the local `asObject` (`:70-71`) and passes a non-string `notes` as `null` (`:72`), which the `CASE` at `:79` turns into "keep the stored note" | `GID2`, `GID6`, `GID8`: the same validators refuse before `pool.query` at `:73`, so a refused upsert leaves no row and no link |
| `services/guests/src/store.ts:170-175` | `requireDate` refuses only a non-string or a value that fails `^\d{4}-\d{2}-\d{2}$`, and names the field with the existing `guests.validation.date_format` sentence | `GID9`: the calendar round-trip is added after the shape test; the sentence, code, and `details.field` stay byte-identical |
| `services/guests/src/store.ts:207-208`; `:287-291`; `services/guests/src/pgstore.ts:139-143` | `toConfirmationRecord` applies `requireDate` to `dates.checkIn` and `dates.checkOut` (`:208`), and both `attachReservation` implementations call it before storing the snapshot | `GID9`: a refused date is decided before the map write, so the later `produceConfirmation` read still misses; `:293-302` and `:145-154` are the read halves |
| `services/guests/src/errors.ts:16-49` | `HttpError` carries `code`, a status derived from `STATUS_BY_CODE` (`VALIDATION_FAILED` → 400), and `details`; `errorEnvelope` renders `code`, `message`, `details`, and a fresh `traceId` | `GID1`, `GID6`, `GID8`, `GID9`: every refusal assertion reads exactly these four keys, and a second or field-less answer fails |
| `services/guests/src/server.ts:136-137`, `:149-150`, `:182-183` | The three routes reach `UpsertGuest`, `IdentifyGuest`, and `AttachReservation`; the Bearer presence check at `:130-132` answers `UNAUTHENTICATED` before any field is read | `GID1`, `GID6`, `GID9`: refusals are driven over HTTP as well as at store level; an unauthenticated caller never learns a bound |
| `services/guests/src/server.test.ts:60-84` | `upserts a guest and shows preferences before booking`: one `preferences: { floor: "high" }` object stored and read back | `GID7`, `GID14`: stays green unedited (at-bound acceptance already holds for one field) |
| `services/guests/src/server.test.ts:86-118` | `looks a guest up by full-name search key with stay links and the returning flag`: one name, one match, profile + `stayLinks` + `returningFlag`/`pastStayCount` asserted | `GID4`, `GID14`: the unique-name regression must keep passing without an assertion change |
| `services/guests/src/server.test.ts:120-139` | `saves notes and shows them in booking context before confirmation`: the 28-character note `Prefers a quiet high floor.` round-trips through `GetBookingContext` | `GID8`, `GID14`: this is the largest note fixture in the tree; it sits far inside 2 000 and must stay green |
| `services/guests/src/server.test.ts:141-164` | `refuses lookups for unknown guests and writes missing the mandatory name`: unknown `guestId` → 404 `NOT_FOUND` on two operations, missing `fullName` → 400 `VALIDATION_FAILED` | `GID4`: the missing-name half stays green; the new unknown-**name** case asserts the `guests.notfound.guest_by_name` sentence explicitly |
| `services/guests/src/server.test.ts:166-206` | `returns the full profile with mandatory-field status by guest link`: contact, preferences, and the 28-character note read back by `guestId`, plus `mandatoryFieldStatus` | `GID5`, `GID12`, `GID14`: the `guestId` reads and the stored-object reads must stay as they are |
| `services/guests/src/server.test.ts:208-249` | `links stays from stay lifecycle events and flags returning guests`: link ingestion, duplicate delivery, recomputed count | `GID3`: a refused lookup writes nothing, so the link rows and the returning flag are unchanged afterwards |
| `services/guests/src/server.test.ts:251-280`, `:282-311`, `:313-340` | The three confirmation acceptance cases: UUID ref with hotel and currency, human `RSV-` ref, and the RES-side snapshot without hotel or currency — all with `2026-11-01`..`2026-11-03` or `2026-11-25`..`2026-11-27` | `GID9`, `GID14`: all three stay green unedited, which proves the calendar check accepts real dates |
| `services/guests/src/server.test.ts:342-365`, `:367-385` | The confirmation refusal cases: unknown human ref → 404, blank ref → 400, missing `guest` → 400, unknown UUID ref → 404, missing ref → 400 | `GID9`, `GID14`: no existing refusal sentence may move while the calendar check lands |
| `services/guests/src/server.test.ts:387-403`, `:405-418` | Unknown-guest write refusals and the missing-mandatory-name profile report | `GID14`: re-run, no edit |
| `services/guests/src/server.test.ts:420-435`, `:437-476` | The two Postgres round-trips (skipped unless `TEST_PG_URL` is set): profile persist + `guestId` identify, and idempotent link ingestion | `GID2`, `GID12`: the Postgres ambiguity and bound guards follow this skip pattern, so `npm test` stays green without a database |
| `services/guests/src/messages.en.json:196-200` (mirror of `messages/en.json:196-200`) | The five guests sentences that exist today: `guests.validation.date_format` (`:196`), `price_amount` (`:197`), `guests.notfound.guest` (`:198`), `guests.notfound.guest_by_name` (`:199`), `guests.validation.guest_or_name` (`:200`); none of the three new keys exists | `GID10`: the three keys are added in all three files (canonical `messages/en.json`, the byte-identical mirror, and `messages/vi.json`); the five existing sentences stay byte-identical |
| `services/guests/src/messages.test.ts:16-38` | `renders every sampled guests message byte-identical` pins every sampled sentence, including `guests.validation.date_format` (`:28`) and `guests.notfound.guest_by_name` (`:32`); no bound sentence is sampled | `GID10`: add one sample row per new key, with `{max}` rendered through `formatNumber(MAX_GUEST_NOTES_LENGTH)` (`services/guests/src/messages.ts:77`) so the default locale shows `2,000` |
| `services/guests/src/messages.ts:57-95` | `msg` renders a catalogue pattern with params; `formatNumber` applies locale digit grouping; `activeLocale` reads the locale | `GID10`: the length sentence renders the bound as a number, never a pasted literal |
| `app/src/views/BookView.vue:710-746` | `onFindGuest` maps `NOT_FOUND` to `desk.book.guest_notfound` (`:736-742`) and every other failure to `errorMessage()` → `desk.shell.request_failed` (`:744`, helper at `:480-485`); no `VALIDATION_FAILED` branch exists | `GID11`: the ambiguity branch is added before the generic fallback, switching on `errorCode(err) === 'VALIDATION_FAILED'` and `details.field === 'fullName'` |
| `app/src/api/client.ts:186-196` | A non-OK envelope throws an `ApiError` carrying `status`, `code`, and `details` (the class and factory at `:20-41`) | `GID11`: `details.field` is reachable in the view, so the switch needs no client change |
| `app/src/views/BookView.test.ts:331-346`, `:348-375`, `:377-394` | The Book guest cases: a returning guest by name ("Guest found…", `3 past stays`), the not-found sentence for an unknown name, and the walk-in register path | `GID11`, `GID14`: the three existing guest-find/register cases stay green unedited; the ambiguity case is added beside them in EN and VI |
| `app/src/views/desk-edge-guards.test.ts:64`, `:639-654` | The shared `IdentifyGuest` stub and `QA-EDGE-4`: a blank name reads no guest and calls neither guests operation | `GID11`, `GID14`: the blank-name rule is untouched, and the new ambiguity sentence must not leak a code or status (`expectNoRawLeak` at `:41-45`) |
| `messages/en.json:400-403`; `messages/vi.json:400-403` | The Book guest copy: `guest_found` (`:400`), `guest_new` (`:401`), `guest_notfound` (`:402`), `guest_need` (`:403`) — no `guest_ambiguous` key | `GID10`, `GID11`: the new key is added at the same place in both locales with no placeholder; the four existing keys stay byte-identical |
| `script/catalogue-coverage-check.sh:105-123`, `:213-251` | The gate asserts eight runtime mirrors byte-identical to `messages/en.json` (Guests included) and `messages/vi.json` key and placeholder parity | `GID10`, `GID13`: the gate must stay green with the new keys in all files |
| `contracts/http/IdentifyGuest.json:35`, `contracts/http/UpsertGuest.json:38` | `VALIDATION_FAILED` is already published for both operations; the `IdentifyGuest` line reads "Neither guestId nor fullName is given." | `GID13`: no token, status, operation, or enum entry is added; the `IdentifyGuest` prose gains the ambiguity clause (architect, LLD 32.6) |
| `contracts/http/UpsertGuest.json:17-19` | `contact`, `preferences`, and `notes` are declared as a free-form object and a plain string with no `maxProperties`/`maxLength` | `GID13`: the manifest keeps its bytes; the bounds are enforced in code and documented in the taxonomy (LLD 32.6) |
| `services/guests/migrations/002_schema.sql:22-34` | `contact JSONB NOT NULL DEFAULT '{}'`, `preferences JSONB NOT NULL DEFAULT '{}'`, `notes TEXT NOT NULL DEFAULT ''`, and no index on `full_name` | `GID12`: columns, defaults, and types are unchanged; no migration file is added |
| `services/guests/contract-tests/UpsertGuest.json:5-9`, `IdentifyGuest-by-name.json` | The contract fixtures carry one preference field and a by-name lookup with `returningFlag`/`pastStayCount` | `GID13`: fixtures stay byte-identical; `contract-check` stays green |
| `script/e2e-desk-loop.sh:263`; `script/e2e-perf-check.sh:143` | The only callers that send `contact`/`preferences`/`notes` are the e2e and perf seeds, each with one one-field object and a 3-character note | `GID7`, `GID8`: the seeds sit far inside every bound, so they must keep passing; the Book screen's register sends only `fullName` and `actor` (`app/src/views/BookView.vue:756-765`) |
| `grep -rn "ambiguous_name\|contact_shape\|notes_length\|guest_ambiguous\|MAX_GUEST_" services/ app/ messages/ contracts/ script/` | None of the three service sentences, the desk sentence, or any bound constant exists anywhere in the tree at this head | The finding itself; `GID1`-`GID11` are the guards that would have caught it |
| `grep -n 'fullName: "' services/guests/src/server.test.ts` | Every existing case uses a distinct name (`E2E Guest`, `Lookup Guest`, `Notes Guest`, `Profile Guest`, `Stay History Guest`), so no case seeds two guests with one `fullName` today and neither store's first-match behaviour is exercised | `GID1`-`GID3` create the missing two-guest cases |

## 3. Guard registry GID1-GID14 and the evidence rule GID-E1

Fourteen obligations across the two stores, the three routes, the
catalogue, the desk, and the gates, plus the evidence record. `GID1`-
`GID12` are **missing guards** the implementation PR creates;
`GID13`-`GID14` are re-runs and gates the same PR proves; `GID-E1` is
the evidence record. A refusal guard is not complete on the returned
status alone: every refusal case also asserts the exact four-key
envelope, `code`, `details`, the exact catalogue sentence (with the
bound rendered where the sentence carries one), a non-empty `traceId`,
and the absence of any success key — a guard that refuses everything at
400 would pass a status-only check.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `GID1` | **Ambiguity refusal over HTTP, in-memory store (`AC-GID-1`, `FR-GID-1`, `BR-63`)**: upsert two guests (two ids) with the same `fullName` `"Same Name Guest"`, then `POST /v1/guests/IdentifyGuest` with that name and assert HTTP 400, a body with **exactly** the four envelope keys, `code: "VALIDATION_FAILED"`, `details` deep-equal `{"field": "fullName", "fullName": "Same Name Guest", "matches": 2}`, `message === msg("guests.validation.ambiguous_name", { fullName: "Same Name Guest" })`, and a non-empty `traceId`; the body carries no `guestId`, `fullName`, `contact`, `preferences`, `notes`, `returningFlag`, `pastStayCount`, or `stayLinks` key, and no `matches`-only 200 exists | `services/guests/src/server.test.ts` (extend, beside `:86-118`) |
| `GID2` | **Ambiguity refusal, Postgres store (`AC-GID-1`, `FR-GID-1`, `BR-63`)**: the same two-upsert, one-name case through `PostgresGuestStore` (skipped without `TEST_PG_URL`, the `:420-435` pattern), asserting the same 400 envelope, `details.field` `fullName`, `matches: 2`, the sentence, and no profile keys — so the two stores cannot differ | `services/guests/src/server.test.ts` (Postgres describe block, extend) |
| `GID3` | **Counted, not first-match, and the refusal writes nothing (`AC-GID-1`, `AC-GID-2`, `FR-GID-1`)**: the guard holds **both** guests in the store (so a restored early `return record` or a `LIMIT 1` first row fails it) and asserts (a) the refusal, (b) the in-memory store's row count and `outbox` entries unchanged across the refused lookup (the `outbox` read pattern at `services/stay/src/server.test.ts:509`), (c) both profiles still readable by `guestId` afterwards with their own `contact`/`preferences`/`notes` and their own `stayLinks`, and (d) a store-level `identifyGuest` call answering the same `HttpError` (`code`, `status`, `details`, message) | `services/guests/src/server.test.ts` and a same-package store case |
| `GID4` | **Unique name, unknown name, and the existing refusal regressions (`AC-GID-2`, `FR-GID-1`) — extend, no rewrite**: the existing unique-name case (`:86-118`) keeps passing untouched; add an explicit unknown-name case asserting 404 `NOT_FOUND` with `msg("guests.notfound.guest_by_name", { fullName })` and `details` naming `fullName`; and a missing-both case keeps `VALIDATION_FAILED` with `guests.validation.guest_or_name` | `services/guests/src/server.test.ts:86-118` (no edit) plus a new case beside `:141-164` |
| `GID5` | **Every `guestId` read unchanged, including for two same-named guests (`AC-GID-2`, `FR-GID-1`)**: with the two same-named guests seeded, `IdentifyGuest`, `GetGuest`, and `GetBookingContext` are each called with each id and must return that guest's own profile, stay links, and booking context (no ambiguity refusal, no cross-talk); the existing `:166-206` case stays green unedited | `services/guests/src/server.test.ts` (extend) |
| `GID6` | **`contact`/`preferences` shape refusals, one case per refused shape (`AC-GID-3`, `FR-GID-2`, `BR-63`)**: for each of an array, a string, a number, and a boolean in place of the object; 17 fields; an empty key; a 65-character key; a nested object; an array entry; a `null` entry; a 257-character string entry; and a non-finite number (`1e999` or an equivalent that survives JSON parsing), assert exactly one 400 `VALIDATION_FAILED`, `details` deep-equal `{"field": "contact"}` or `{"field": "preferences"}`, the `guests.validation.contact_shape` sentence with that field name, a non-empty `traceId`, and **nothing written**: no new row, no changed row, no stay link, no `guest-upserted` outbox entry (and, where the case updates an existing guest, the stored profile still reads its previous values through `GetGuest`) | `services/guests/src/server.test.ts` (extend) |
| `GID7` | **At-bound shapes accepted, absent and explicit-`null` behaviour unchanged (`AC-GID-3`, `FR-GID-2`, `BR-63`)**: an object at every bound (16 fields, a 64-character key, a 256-character string value, a finite number, a boolean) is stored as sent and read back through `GetGuest`; an absent `contact` still yields `{}` on create; an absent `preferences` keeps the stored object on update; an explicit `null` `contact`/`preferences` keeps today's coercion to `{}`; and one field, one key character, or one string character past a bound is refused (the pair with `GID6`) | `services/guests/src/server.test.ts` (extend) |
| `GID8` | **`notes` length pair, non-string refusal, and the unchanged stored note (`AC-GID-4`, `FR-GID-2`, `BR-63`)**: a note of exactly 2 000 code units is stored as sent and read back through `GetBookingContext`; 2 001 is refused with `details` `{"field": "notes"}` and the `guests.validation.notes_length` sentence carrying the bound rendered from the constant (`2,000` in the default locale); a number and an explicit `null` are refused the same way (today `null` silently kept the stored note, so this is the intended narrowing); an absent `notes` on update keeps the stored note and on create stores `""`; and each refusal leaves a previously stored note intact | `services/guests/src/server.test.ts` (extend, beside `:120-139`) |
| `GID9` | **Calendar-valid confirmation dates (`AC-GID-5`, `FR-GID-3`, `BR-63`)**: `AttachReservation` with `dates.checkIn: "2026-13-45"`, `"2026-02-31"`, and `"2026-00-10"` (and the same for `dates.checkOut`) is refused with 400 `VALIDATION_FAILED`, `details` deep-equal `{"field": "dates.checkIn"}` / `{"field": "dates.checkOut"}`, the **existing** `guests.validation.date_format` sentence and a `traceId`, and no confirmation is stored — `ProduceConfirmation` for that ref still answers 404 `NOT_FOUND`; `2024-02-29` is accepted and produced; a non-string and a shape-invalid date keep today's refusal; and a snapshot whose `checkIn` is after its `checkOut` is still accepted | `services/guests/src/server.test.ts` (extend, beside `:251-365`) |
| `GID10` | **Catalogue sentences (`AC-GID-1`, `AC-GID-3`, `AC-GID-4`, `FR-GID-1`..`FR-GID-3`, `NFR-I18N-1`)**: one sample row per new key in `services/guests/src/messages.test.ts` — `guests.validation.ambiguous_name` with `{fullName}`, `guests.validation.contact_shape` with `{field}`, and `guests.validation.notes_length` with `{field}` and `{max}` rendered through `formatNumber(MAX_GUEST_NOTES_LENGTH)` — plus the key's presence in `messages/en.json`, the byte-identical `services/guests/src/messages.en.json` mirror, and `messages/vi.json` with the same placeholders; the sentences name no code, status, stack trace, SQL, host, or path; `script/catalogue-coverage-check.sh` green | `services/guests/src/messages.test.ts:16-38` (extend), the three catalogue files, and the gate |
| `GID11` | **Book guest find: the ambiguity state and the two unchanged outcomes (`AC-GID-6`, `AC-GID-7`, `FR-GID-1`, `FR-DSP-3`, `NFR-I18N-1`)**: an `IdentifyGuest` envelope `{code: "VALIDATION_FAILED", details: {field: "fullName"}}` renders the `desk.book.guest_ambiguous` sentence in **EN and VI**, resolves no guest (no confirm-with-guest path, the `guest_need` gate still holds), keeps the entered name in `book-guest-name` and the Find/Register controls in place, and never renders the not-found or request-failed sentence; a unique name still reads "Guest found…", an unknown name still reads `desk.book.guest_notfound`, and the blank-name path still calls neither operation (`app/src/views/desk-edge-guards.test.ts:639-654` unchanged); no code, status, or brace leaks (`expectNoRawLeak`) | `app/src/views/BookView.test.ts` (extend, beside `:331-394`) and, for the VI half, the existing locale-switch pattern in the same file |
| `GID12` | **Constants, unbounded reads, and no migration (`AC-GID-7`, `FR-GID-2`, `BR-63`)**: the four constants are declared once in the shared store code and read by both stores (same-package assertions on their values); a profile holding a longer note, a differently shaped object, and a 17-field object still reads exactly as stored through `GetGuest`, `IdentifyGuest`, and `GetBookingContext` (seeded directly, not through `UpsertGuest`, or through a Postgres row staged by SQL); no validator runs on any read path; and the diff adds no file under `services/guests/migrations/` | `services/guests/src/server.test.ts` (extend) plus the diff gate in `GID14` |
| `GID13` | **Contract and catalogue gates (`AC-GID-7`, `FR-GID-1`..`FR-GID-3`) — re-run, no token**: `contracts/http/IdentifyGuest.json` carries only the prose clause on its existing `VALIDATION_FAILED` entry (the architect's edit), `contracts/http/UpsertGuest.json` and every fixture are byte-identical, the envelope keeps its four fields, and `script/contract-check.sh` plus `script/openapi-route-check.sh` stay green — no new code token, operation, response field, request keyword, or event appears | `contracts/**`, `script/contract-check.sh`, `script/openapi-route-check.sh` — no further edit permitted |
| `GID14` | **Regression and gate set (`AC-GID-2`, `AC-GID-6`, `AC-GID-7`) — re-run, no edit**: the existing guests suites stay green with their assertions untouched (`services/guests/src/server.test.ts:60-84`, `:86-118`, `:120-139`, `:141-164`, `:166-206`, `:208-249`, `:251-365`, `:387-476`, `services/guests/src/bodyBound.test.ts:102-153`, `services/guests/src/errors.test.ts`), the Book and desk-edge suites stay green (`app/src/views/BookView.test.ts:331-394`, `app/src/views/desk-edge-guards.test.ts:639-654`), and the change adds no environment variable, deployment file, compose entry, runbook step, or per-hotel setting (diff inspection); `git diff --check` and `script/markdown-link-check.sh` are green at this spec head too | the named suites, `deploy/**`, `docs/devops/**`, `docs/operations/**` — no edit permitted |
| `GID-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build (two guests, one name; an out-of-bounds payload; `2026-13-45`) and records the before/after pair in `docs/testing/evidence/640/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` [section 3](test-strategy.md#3-exit-criteria-per-slice)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping
it to covered only when the guard passes. The existing unique-name,
not-found, full-profile, stay-link, confirmation, and Postgres
round-trip answers, the existing desk guest cases, and the contract gate
are covered **by re-run today** where their pins exist and must keep
passing untouched — but the slice as a whole stays incomplete. The Node
and Vue suites were not re-run in this worktree (docs-only branch); they
are the unchanged baselines the `node-build (guests)` and `app-build` CI
jobs last ran, and the implementation PR runs both.

| Item | Required guard | Guard |
|---|---|---|
| `AC-GID-1` — two guests with one `fullName`, `IdentifyGuest` by that name answers exactly one HTTP 400 shared envelope (`VALIDATION_FAILED`, `details` naming `fullName` with the searched name and the match count, the `guests.validation.ambiguous_name` sentence, a `traceId`), no profile, `contact`, `preferences`, `notes`, or `stayLinks` come back, and both stores refuse identically (traces to `FR-GID-1`, `FR-GST-1`, `FR-GST-3`, `AC-GST-1`) | L1 acceptance: the two-guest refusal at HTTP and store level in both stores, with the four-key envelope and the no-profile assertion | **Pending** — `GID1`, `GID2`, `GID3`, `GID10`; today's opposite is `services/guests/src/store.ts:316-322` (first match returned) and `services/guests/src/pgstore.ts:183-187` (`LIMIT 1`) |
| `AC-GID-2` — a name matching exactly one guest returns the profile and its stay links exactly as today, a name matching none stays `NOT_FOUND` with today's sentence, and every `guestId` read (`IdentifyGuest`, `GetGuest`, `GetBookingContext`) answers exactly as today including for two guests sharing a name (traces to `FR-GID-1`, `FR-GST-1`, `FR-GST-3`, `AC-GST-1`, `AC-GST-3`) | L1 acceptance: the unique-name regression (unedited), the unknown-name sentence, and the per-id reads of two same-named guests | **Covered by re-run today for the unique-name and per-id halves (`services/guests/src/server.test.ts:86-118`, `:166-206`) and pending for the explicit unknown-name and two-same-named-guests cases (`GID4`, `GID5`)** |
| `AC-GID-3` — `UpsertGuest` with a present `contact`/`preferences` that is an array, string, number, or boolean, or holds more than 16 fields, an empty or over-64-character key, a nested object, an array entry, a `null` entry, a 257-character string entry, or a non-finite number is refused with HTTP 400 `VALIDATION_FAILED` naming the field and the shape sentence, writing no record, stay link, or outbox event, with the stored profile unchanged (traces to `FR-GID-2`, `FR-GST-1`, `FR-GST-2`, `AC-GST-2`) | L1 acceptance: one case per refused shape, the at-bound acceptance, and the nothing-written assertion | **Pending** — `GID6`, `GID7`; today's opposite is the silent coercion at `services/guests/src/store.ts:166-168`, `:231-232` and `services/guests/src/pgstore.ts:70-71` |
| `AC-GID-4` — `UpsertGuest` with a present `notes` that is not a string or is longer than 2 000 characters is refused with HTTP 400 `VALIDATION_FAILED` naming `notes` and the length sentence, writing nothing; 2 000 characters is stored as sent and an absent `notes` keeps today's behaviour (traces to `FR-GID-2`, `FR-GST-2`, `AC-GST-2`) | L1 acceptance: the 2 000/2 001 boundary pair, the non-string refusal (number and explicit `null`), and the unchanged stored note | **Pending** — `GID8`; today's opposite is `services/guests/src/store.ts:233` and `services/guests/src/pgstore.ts:72`, `:79` |
| `AC-GID-5` — `AttachReservation` with a calendar-invalid `dates.checkIn`/`dates.checkOut` such as `2026-13-45` or `2026-02-31` is refused with HTTP 400 `VALIDATION_FAILED` naming that field and the existing `guests.validation.date_format` sentence, no confirmation is stored, `2024-02-29` is accepted, and no other operation's date handling changes (traces to `FR-GID-3`, `FR-GST-4`, `AC-GST-4`) | L1 acceptance: the three invalid dates per field, the leap-day acceptance, the shape-only refusal re-run, and the still-`NOT_FOUND` read after a refusal | **Pending** — `GID9`; today's opposite is the regex-only `requireDate` at `services/guests/src/store.ts:170-175` |
| `AC-GID-6` — an ambiguity refusal on the Book screen's guest find reads as `desk.book.guest_ambiguous` in both locales, resolves no guest, keeps the entered name and the Find/Register controls, and never reads as the not-found or request-failed sentence, with layout, component mapping, tokens, route, and print rules unchanged and the catalogue gate green (traces to `FR-GID-1`, `FR-DSP-3`, `NFR-I18N-1`, `AC-DSK-1`, `AC-DSK-2`) | L1 acceptance: the EN and VI ambiguity states, the no-profile and controls-stay assertions, the two unchanged sentences, and the catalogue gate | **Covered by re-run today for the found, not-found, and blank-name states (`app/src/views/BookView.test.ts:331-394`, `app/src/views/desk-edge-guards.test.ts:639-654`) and pending the ambiguity state and its VI copy (`GID11`, `GID10`)** |
| `AC-GID-7` — each bound is a named constant carried by no environment variable, deployment setting, or per-hotel configuration, both stores refuse the same values, the ambiguity, shape, length, and date guards with their at-bound and one-over cases exist beside the unique-name, unknown-name, and `guestId` regression guards, no migration or data repair exists, `contract-check` stays green with no code token added, and no print document or other desk surface changes (traces to `FR-GID-1`..`FR-GID-3`, `NFR-I18N-1`, `NFR-AUD-1`) | L1: the constants and the full guard set; LC: the contract gate; diff gate: no configuration source, no migration, no other desk surface | **Covered by re-run today for the contract gate (`GID13`) and the existing regression set (`GID14`), and pending for the constants and the new guard set (`GID1`-`GID12`)** |
| `FR-GID-1` — a name that matches more than one guest is refused, never resolved by first match; a unique name, an unknown name, and every `guestId` read answer as before; the Book find says the ambiguity plainly and resolves no guest (requirements 33.3) | L1 acceptance: `GID1`-`GID5`, `GID11`, plus the catalogue sentence | **Pending** — `GID1`, `GID2`, `GID3`, `GID4`, `GID5`, `GID10`, `GID11`; today's breach is `services/guests/src/store.ts:316-322` and `services/guests/src/pgstore.ts:183-187` |
| `FR-GID-2` — `contact`/`preferences` carry one declared shape and `notes` one declared length, refused naming the field with nothing written, at-bound values stored as sent, absent and explicit-`null` object fields as today, and stored longer notes or other shapes still read as stored (requirements 33.3) | L1 acceptance: `GID6`-`GID8`, `GID12`, plus the two catalogue sentences | **Pending** — `GID6`, `GID7`, `GID8`, `GID10`, `GID12`; today's breach is `asObject` at `services/guests/src/store.ts:166-168` and the unbounded fields at `:231-233` |
| `FR-GID-3` — the confirmation snapshot's two dates must exist on the calendar, refused naming the field with the existing sentence and no stored confirmation, the leap day accepted, shape-only refusals unchanged, and the date order unchanged (requirements 33.3) | L1 acceptance: `GID9` plus the existing confirmation cases re-run | **Pending** — `GID9`; today's breach is `services/guests/src/store.ts:170-175` |
| `BR-63` — a guest identity lookup answers only when the name is unambiguous, the guest write bounds what it stores, and the confirmation dates must exist; the refusals name the field, the bounds are code constants, reads are never re-validated, and the Book find says the ambiguity plainly (business rules section 7) | L1 acceptance + evidence: every refusal, both boundary pairs, the unchanged reads, the desk state, and the lab record | **Pending** — `GID1`-`GID14`, `GID-E1` |
| `NFR-I18N-1` (unchanged) — the three new service sentences and the one desk sentence resolve through the catalogue in both locales with matching placeholders and no technical code or status in the wording | L1 catalogue: `GID10`, `GID11`; gate: `script/catalogue-coverage-check.sh` | **Covered by re-run today for the existing guests and Book sentences (`GID10`'s existing rows, `services/guests/src/messages.test.ts:16-38`, `messages/en.json:400-403`) and pending the four new sentences** |
| `NFR-AUD-1` (unchanged) — a refused upsert or attach records nothing and emits no event; a committed write keeps its acting staff member | L1: `GID3`, `GID6`, `GID8` (nothing written, no `guest-upserted` entry) and `GID14`'s existing write cases | **Covered by re-run today for the committed-write half (`services/guests/src/server.test.ts:420-435`) and pending the refusal half (`GID3`, `GID6`, `GID8`)** |
| Existing guests and Book suites stay unchanged | Behaviour check: the unique-name, not-found, full-profile, stay-link, confirmation, body-bound, and internal-error cases and the Book found/not-found/register/blank-name cases keep their assertions byte-identical; a rewritten assertion fails the row | **Covered by re-run today** — `GID14`; pins `services/guests/src/server.test.ts:60-476`, `services/guests/src/bodyBound.test.ts:102-153`, `services/guests/src/errors.test.ts`, `app/src/views/BookView.test.ts:331-394`, `app/src/views/desk-edge-guards.test.ts:639-654` |
| Contract and LC | Real delta: no contract operation, response field, request keyword, token, or fixture changes beyond the `IdentifyGuest` error-prose clause; the envelope keeps its four fields; both contract gates and the catalogue gate stay green | **Covered by re-run today** — `GID13`; the files are `contracts/http/IdentifyGuest.json`, `UpsertGuest.json`, `contracts/errors/envelope.json`, `services/guests/contract-tests/*`, `script/contract-check.sh`, `script/openapi-route-check.sh`, `script/catalogue-coverage-check.sh`; a shape or token change here is a re-tier finding (LLD 32.6) |
| No-configuration and no-migration gate | Real delta: the four bounds are code constants, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration file is added and no stored row is rewritten | **Pending diff gate** — `GID12`, `GID14`; the fixed side is recorded in `docs/requirements/business-rules.md` section 9 (BR-63) and LLD 32.3 |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-GID-1`..`FR-GID-3` are requirement additions outside the counted set and no NFR is added (requirements 33.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`GID-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/640/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 32.7](../architecture/lld.md#327-verification-plan) and `docs/architecture/services/guests.md` [section 7](../architecture/services/guests.md#7-operations)) |
|---|---|---|
| L1 Guests store + server | `GID1`-`GID9`, `GID12`, and the `GID14` server half | `cd services/guests && npm test` (after `npm ci` and `npm run build`) |
| L1 Guests Postgres | `GID2` and the `GID12` stored-row half | the Guests suite in the `postgres-parity (guests)` matrix job, which applies the Guests migrations and exports `TEST_PG_URL` (the `:420-476` skip pattern); the `migrate-check` job only checks that the migrations apply |
| L1 Guests catalogue | `GID10` | `cd services/guests && npm test` (the `messages.test.ts` half) |
| L1 Desk Book | `GID11` and the `GID14` desk half | `cd app && npm test` (`vitest run`) |
| LC contract | `GID13`: the manifests and fixtures byte-identical, both gates green | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`) |
| Gates | Catalogue parity, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |
| Lint | Both stacks' lint rules | `cd services/guests && npm run lint`; `cd app && npm run lint` |

CI jobs that must be green on the implementation PR: `node-build
(guests)`, `app-build`, `contract-check`, and `ci` (catalogue, links,
harness conventions). `browser-e2e` and `dom-diff` run on any
`services/**` or `app/**` change, so both must be green with their
assertions and snapshots unchanged; the change moves no desk layout, so
`dom-diff` has nothing new to allowlist. `PERF` stays as it is: the
counted name read is one read of the matching rows on the same table
(there is no `full_name` index today, LLD 32.9), sized for the pilot's
guest table, and no timing target moves (`NFR-PERF-1` holds by
statement).

### Execution order

1. The `contact`/`preferences` shape validator and the four constants
   (`GID12`'s constant assertions, then `GID6`, then `GID7`) and the
   `notes` bound (`GID8`) — the write-path half, which fails loudly if
   the check sits below the store write or the outbox push.
2. The counted name branch and the shared refusal (`GID1`, `GID3`,
   then `GID2` for the Postgres twin) — with the two-guest store in
   place before any wider assertion, so a first-match regression cannot
   pass.
3. The unchanged-outcome guards (`GID4`, `GID5`) — these prove the rule
   did not leak into the `guestId` reads or the unknown-name path.
4. The calendar round-trip in `requireDate` (`GID9`), with the three
   invalid dates and the leap day, and the still-`NOT_FOUND` read.
5. The catalogue keys and their samples (`GID10`), with
   `script/catalogue-coverage-check.sh` re-run straight after.
6. The desk state and its VI copy (`GID11`), then `npm test` in `app`.
7. The re-runs and gates (`GID13`, `GID14`), then the isolated-lab
   reproduction and the before/after pair (`GID-E1`), the
   `test-report.md` row, and the re-pin of section 4 at the merged head.

### Entry criteria

1. The #640 T2 spec set (product section 25 and UI contract section
   6.22, requirements section 33, `BR-63`, LLD section 32, the guests
   service page sections 4/6/8, the api-spec, schema, and
   error-handling deltas, and this document) is on disk, and the
   `spec-reviewer` has posted `SPEC-GATE PASS` on #640 or the spec
   stack (#728 -> #729 -> #730 -> this PR).
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the decided bounds, sentences, and
   enforcement points are the ones on disk.
3. The #588/#600/#601/#627/#630/#631/#634/#635/#641/#646/#647/#648
   slices are merged, so the desk, envelope, body-bound, and money pins
   this slice re-runs are the real baseline.
4. The build under test is identified by commit and the lab seed
   matches `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).
5. Baseline state: the Guests Node suite, the app Vitest suite, and
   both contract gates are green at the implementation PR's base
   (`node-build (guests)`, `app-build`, `contract-check`).

### Exit criteria

1. `GID1`-`GID3` pass in both stores: the two-guest lookup answers the
   one four-key envelope with `details` `{field, fullName, matches}`,
   the sentence, and no profile keys, with the count taken before any
   assembly and nothing written.
2. `GID4` and `GID5` pass: the unique name, the unknown name, and every
   `guestId` read answer exactly as before, including for two
   same-named guests.
3. `GID6`-`GID8` pass: every refused shape and the 2 001-code-unit note
   name the field with the declared sentence, write nothing, and the
   at-bound values (16 fields, 64-character key, 256-character value,
   2 000-code-unit note) are stored as sent.
4. `GID9` passes: the three invalid dates per field refuse with the
   existing sentence and no stored confirmation, and `2024-02-29` is
   accepted.
5. `GID10` and `GID11` pass: the three service sentences and the desk
   sentence exist in both locales with matching placeholders, the
   ambiguity state renders in EN and VI with no profile and no leaked
   code, and the catalogue gate is green.
6. `GID12` passes: the four constants are the only bound source, reads
   stay unbounded, and no migration exists.
7. `GID13` and `GID14` are green with their assertions and fixtures
   untouched — no existing refusal, acceptance, or desk assertion moved,
   no contract manifest or fixture changed beyond the `IdentifyGuest`
   prose clause, and no configuration source carries a bound.
8. `GID-E1` is recorded: the `docs/testing/evidence/640/README.md`
   before/after pair and the `docs/testing/test-report.md` row.
9. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned section
   4 at the merged head and flipped the rows.
10. Open failures are filed as issues with FR/NFR ids; no
    `risk-medium` failure is waived without owner approval.

### Negative controls

A guard that only checks `status === 400` or only sends one refused
value is insufficient.

- `GID1`, `GID2`, `GID6`, `GID8`, and `GID9` each assert `code ===
  "VALIDATION_FAILED"` **and** `details` deep-equal to the declared
  object **and** the exact catalogue sentence, so an answer that reuses
  another 400 refusal (`guests.validation.guest_or_name`,
  `guests.validation.date_format`, or
  `error.validation.field_required`) fails.
- Each refusal case asserts the exact four-key envelope and a non-empty
  `traceId`, so a second, partial, or field-less answer fails.
- `GID1` asserts the absence of the profile keys **and** of a
  `matches`-only 200, so a success that merely advertises the count
  cannot pass as a refusal.
- `GID3` seeds **both** guests and reads the row count and outbox, so an
  early `return record` (in-memory) or a `LIMIT 1` first row
  (Postgres) fails rather than passing on the refusal's status alone.
- `GID5` reads each of the two same-named guests by `guestId`, so a rule
  that also refuses `guestId` reads, or that resolves by name instead,
  fails.
- `GID6` sends a 257-character value and a 16-field-plus-one object, and
  `GID7` sends the matching at-bound values, so a bound that drifts one
  field or one character in either direction fails.
- `GID8` sends 2 000 and 2 001 code units and an explicit `null`, so a
  bound that refuses the legitimate maximum, or that still silently
  keeps the note on `null`, fails.
- `GID9` asserts the leap day is **accepted** as well as the three
  invalid dates refused, so a blanket date regex swap or an
  over-strict parse fails.
- `GID10` asserts the rendered length sentence with `{max}` filled from
  the constant, so a pasted literal that drifts from
  `MAX_GUEST_NOTES_LENGTH` fails.
- `GID11` asserts the ambiguity sentence **and** that the not-found and
  request-failed sentences are not rendered, in both locales, so a desk
  that maps the refusal to the generic fallback fails.
- `GID13` and `GID14` fail on a loosened or rewritten assertion, not
  only on a red test: the existing cases are the "nothing changed"
  proof and may not be edited.

## 6. Owner verification cases (GID-1..GID-8)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
store, `api guests <Operation>` bodies, and `psql` counts where the lab
persists). Steps are the same for each case unless stated: sign in as
`owner`, act as described, then read the reply.

| Case | Setup | Expected |
|---|---|---|
| `GID-1` | Register two guests with the same full name (`UpsertGuest` twice, no `guestId`, name "Lan Nguyen"), then find that name on the Book screen | The Book screen shows "That name matches more than one guest, so no profile was opened. Ask the manager to check the guest records." — no guest name, preference, or note appears, the typed name stays in the field, and Find and Register are still there. Asking the API directly answers one 400 with `details` naming `fullName`, `matches: 2`, and the "The name Lan Nguyen matches more than one guest; identify the guest by id." sentence |
| `GID-2` | Register one guest with a unique name and find it; then find a name nobody has | The unique name still answers "Guest found…" with the past-stay count, and the profile, preferences, and notes read exactly as before. The unknown name still answers "No guest with that name. Check the name or register a new guest." |
| `GID-3` | Open each of the two same-named guests by the `guestId` shown in the register answer (the API's `guestId`, and the booking read paths that carry it), through Identify, profile, and booking-context reads | Each id returns its own profile, preferences, notes, and stay links; neither read refuses because of the shared name |
| `GID-4` | `UpsertGuest` a guest with `contact` sent as `[1,2]`, then as `"phone"`, then with 17 fields, then with a nested object | Each is refused with 400 `VALIDATION_FAILED` naming `contact`, and the guest list shows no new guest and no changed row after the attempts |
| `GID-5` | `UpsertGuest` with `preferences` at the declared shape (16 fields, a 64-character key, a 256-character value, a number, and a boolean) | It is accepted and the profile reads back exactly those values |
| `GID-6` | `UpsertGuest` with `notes` of exactly 2 000 characters, then 2 001, then `notes` sent as a number | 2 000 is stored as sent and reads back through the booking context; 2 001 is refused naming `notes` with "notes must be at most 2,000 characters."; the number is refused the same way and leaves the stored note unchanged |
| `GID-7` | `AttachReservation` with `dates.checkIn: "2026-13-45"`, then with `dates.checkOut: "2026-02-31"`, then again with `2026-02-29` (a real leap day) | The first two are refused with 400 `VALIDATION_FAILED` naming the field and "dates.checkIn must be a YYYY-MM-DD date." / "dates.checkOut must be a YYYY-MM-DD date.", and asking for the confirmation still answers "Unknown reservation …". The leap-day snapshot is accepted and produced |
| `GID-8` | Inspect `deploy/`, the compose file, the runbooks, and a running Guests service's environment; read the two request manifests; run `script/contract-check.sh`, `script/openapi-route-check.sh`, and `script/catalogue-coverage-check.sh`; look for a new migration file | No environment variable, deployment file, runbook step, or per-hotel setting carries a bound; the `UpsertGuest` manifest is byte-identical and `IdentifyGuest` only gained the ambiguity prose; all three gates pass; `services/guests/migrations/` carries no new file |

## 7. Evidence rule GID-E1

The implementation PR records, in `docs/testing/evidence/640/README.md`
(created by that PR, same capture method as the #588, #627, #630, #635,
and #641 records), one before/after pair per finding, because the
issue's scope asks for the tests and the requirements section 33.1 puts
the lab reproduction with the implementation:

- **G1 — the wrong profile, on the pre-fix build from an isolated
  compose lab.** Register two guests with one `fullName`, then
  `IdentifyGuest` by that name: the pre-fix answer is a 200 carrying one
  of the two profiles (record both guests' `contact`/`notes` so the
  capture shows which one came back), with the code pins
  (`services/guests/src/store.ts:316-322`,
  `services/guests/src/pgstore.ts:183-187`). After the fix the same
  request answers the one 400 envelope with `details` `{field:
  "fullName", fullName, matches: 2}`, the `guests.validation.ambiguous_name`
  sentence, and no profile keys, in both stores (run the lab once with
  the in-memory store and once with `DATABASE_URL` set).
- **G2 — the unbounded payload, on the pre-fix build.** `UpsertGuest`
  with a 10 000-character `notes` and a `contact` holding a nested
  object is accepted and read back as sent; after the fix both are
  refused naming the field with the declared sentence, and the stored
  profile is unchanged after the attempt. Add the honest boundary
  control: the at-bound values are accepted and read back as sent.
- **G3 — the impossible date, on the pre-fix build.** `AttachReservation`
  with `dates.checkIn: "2026-13-45"` is accepted and the confirmation is
  produced; after the fix it is refused naming the field with the
  existing sentence and the confirmation read still misses. Add the
  leap-day control (`2024-02-29` accepted).
- **Plus the unchanged controls:** the unique-name lookup, the unknown
  name, each `guestId` read of the two same-named guests, the existing
  confirmation cases, and the Book found/not-found states behave exactly
  as before.
- **Plus the desk capture:** the Book screen's ambiguity state in EN and
  VI with no profile, no leaked code, and the name and controls kept,
  beside the found and no-match states.
- **Plus the no-configuration and no-migration check:** the diff of
  `deploy/`, `docs/devops/`, `docs/operations/`, and
  `services/guests/migrations/` carries no bound source and no new file
  (`GID12`, `GID14`).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md`
[section 3](test-strategy.md#3-exit-criteria-per-slice)).

## 8. Slice status and re-pin rule

At this spec head: 18 rows mapped to `AC-GID-1`..`AC-GID-7`,
`FR-GID-1`..`FR-GID-3`, `BR-63`, the two unchanged NFR rows, the
existing-suite row, the contract/LC row, the configuration/migration
gate, the MVP no-change gate, and `GID-E1`. Seven rows carry re-run
evidence today (the existing guests and Book suites, the contract/LC
gate, the two unchanged NFR rows, and the re-run halves named inside
`AC-GID-2`, `AC-GID-6`, and `AC-GID-7` — their pins exist and pass and
must keep passing untouched), and the rest are
**pending** the implementation PR: the rows whose guards are the
registry `GID1`-`GID12`, the `BR-63` evidence row, the MVP no-change
gate, and `GID-E1`. The slice is **not complete** at this spec head. It
completes when the implementation PR merges with `GID1`-`GID14` green,
the section 2 pins refreshed where the implementation moved a line,
`GID-E1` recorded, and `qa-lead` re-pins every row in section 4 with
`file:line` at the merged head. No row in this document may be flipped
to covered while its guard is absent from the tree or failing: a
pending row is honest, a fabricated pin is a phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1143
