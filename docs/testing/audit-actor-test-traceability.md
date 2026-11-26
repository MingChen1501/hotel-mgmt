# Audit actor provenance test traceability (Refs #643)

Status: active. Testing spec for the T2 session-derived audit actor
change ([issue #643](https://github.com/MingChen1501/hotel-mgmt/issues/643),
audit finding C6 — every audited write in Stay, Guests, Rooms,
Reservations, Billing, and Admin's config write records an actor the
caller chose, so each outbox event, change row, and state-history row
attributes the change to a name the caller supplied; the attribution
`NFR-AUD-1` promises is decided by the caller), owned by `qa-lead`. It
maps the change's done-conditions — `AC-SEC-1`..`AC-SEC-5`, owned by
`product-owner` in `docs/product/acceptance-criteria.md`
[section 27](../product/acceptance-criteria.md#27-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643) —
the requirements `FR-SEC-1`..`FR-SEC-4`, owned by `business-analyst` in
`docs/requirements/mvp-requirements.md`
[section 35](../requirements/mvp-requirements.md#35-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643),
and the business rule `BR-65` in `docs/requirements/business-rules.md`
[section 8](../requirements/business-rules.md#8-roles-audit-and-data-protection)
to their guards: the pins that exist on disk at this spec head, the
guard registry `SEC1`-`SEC36`, and the evidence rule `SEC-E1`.

Written before the implementation PR. Every spoofed-actor guard in the
registry is a **named, missing obligation** at this head — no store
reads the session, every store records the body value (Stay
`services/stay/src/store.ts:216`, `:294`, `:335`, `:383`; Guests
`services/guests/src/store.ts:319`; Rooms
`services/rooms/src/store.ts:219`-`:477`; Reservations
`services/reservations/internal/handler/handler.go:176`, `:238`,
`:256`, `:290`, `:323`, `:342`; Billing
`services/billing/src/main/java/com/hotel/billing/web/BillingController.java:39-42`,
and Admin's config write records the body `updatedBy` at
`services/admin/src/store.ts:565`) — so no row here marks a guard
complete before it exists and passes. The slice is not complete until
the implementation PR merges and `qa-lead` re-pins every row at the
merged head (the `#588 -> #599` and `#639` pattern). Section 1 states
the tier and the no-change rules; section 2 cites what is on disk today
and what it proves; section 3 names the guards the implementation PR
must create; section 4 is the traceability map; section 5 is the test
plan it must run; section 6 is the owner verification cases; section 7
the evidence rule; section 8 the slice status and the re-pin rule.

Companion specs: scope decision D-39 in `docs/project/decision-log.md`
[the decision log](../project/decision-log.md) and risk R-20 in
`docs/project/risk-register.md` [the risk register](../project/risk-register.md);
the actor-resolution seam per service, the three per-flow diagrams,
the contract decision, the verification plan, and the residual risks in
`docs/architecture/lld.md`
[section 34](../architecture/lld.md#34-the-audit-actor-comes-from-the-session-never-from-the-request-refs-643);
the planned delta on the six service pages
(`docs/architecture/services/{stay,guests,rooms,reservations,billing,admin}.md`);
the HLD row in `docs/architecture/hld.md`
[section 26](../architecture/hld.md); the provenance convention in
`docs/technical/api-spec.md` [section 1](../technical/api-spec.md); the
no-new-refusal statement in `docs/technical/error-handling.md`
[section 1.6](../technical/error-handling.md); the transport rule and
the C4 completion note in `docs/technical/integration.md`; the
unchanged audit columns in `docs/technical/schema.md`
[section 0](../technical/schema.md); and the audit-coverage note in the
threat model. Sibling tests this slice must not disturb: the
`traceability-matrix.md` MVP rows and sections 9-16 and 18 and 20-26
plus their registries (`S1`-`S12`, `DR1`-`DR13`, `RR1`-`RR13`,
`BM1`-`BM16`, `FW1`-`FW13`, `ERR1`-`ERR9`, `BND1`-`BND28`,
`AMT1`-`AMT20`, `RPT1`-`RPT14`, `GID1`-`GID14`, `CFG1`-`CFG24`). This
spec implements no code, changes no guard, adds no catalogue key, and
moves no MVP row.

## 1. Scope, tier, and no-change statements

- Tier T2, confirmed by `product-owner` (acceptance criteria section
  27), `business-analyst` (requirements section 35), and `architect`
  (LLD section 34): only the recorded actor value moves, with no new
  subsystem, dependency edge, data model, lifecycle state, endpoint,
  reader-visible surface, or error-code token. No ADR: the recorded
  value is a by-product of the session check the transport already
  performs.
- **The recorded actor is the authenticated session, never the
  request.** Every write that persists an actor with its timestamp
  records the session the request authenticated. Admin verifies the
  token into a caller, so its writes — `UpdateHotelConfig` included —
  record that caller's `signinIdentity`. Stay, Guests, Rooms,
  Reservations, and Billing authenticate presence only, so they record
  the session token the request presented, the value after the `Bearer `
  prefix and trimmed, so one session records one identical string in
  every service. No store and no adapter reads `actor` (or Admin's
  `updatedBy`) from the body for the recorded value.
- **The request field is demoted, never refused.** `actor` and
  `updatedBy` keep their contract shape, their required flag, and their
  existing refusals, and their value is never the recorded actor. Where
  the write emits a JSON outbox payload, a request value that differs
  from the session actor is preserved additively as `requestActor`;
  when it equals the session actor, or is absent where the service
  accepts that, no key is added, so an honest caller's payloads stay
  exactly as today. Where the write records only a column — change rows,
  state-history rows, Admin audit rows — the request value is dropped
  and the row shape is unchanged. A disagreement never refuses: every
  desk call the tree makes today keeps its status, its stored effect,
  and its response.
- **No session means no request actor.** Every `/v1/*` write already
  refuses a missing token with the existing HTTP 401 `UNAUTHENTICATED`
  sentence before it writes, so the actor never falls back to the body.
  The one write path with no request session is the Admin boot seed,
  which keeps its server-side `boot` actor. A provider-to-provider call
  carries the caller's own session: Stay's `CheckOut` forwards the desk
  token to `CheckOutReservation`, so both the Stay rows and the
  Reservations rows record the same token and the forwarded `actor` is
  an annotation only.
- **Nothing else moves.** No new error code, catalogue key, desk state,
  control, route, print rule, contract shape, schema, table, migration,
  or backfill, and no reader-visible desk change, so no UI-contract
  section applies. Token verification, HMAC signing, expiry and
  revocation checks, bounded revalidation, role-based authorization,
  the desk UI's actor field, and the open-balance approval provenance
  (`approvedBy`/`role`, already re-derived server-side per `AC-CKO-1`)
  are unchanged and named out of scope (LLD 34.6, 34.8).
- **No per-hotel configuration source.** The provenance rule is a fixed
  code rule (`BR-65`; `docs/requirements/business-rules.md`
  [section 9](../requirements/business-rules.md#9-per-hotel-configurable-vs-fixed-split)),
  carried by no environment variable, `deploy/` file, compose file,
  `docs/devops/`, `docs/operations/`, or per-hotel setting.
- **No MVP row moves:** the 57-row coverage count in
  `traceability-matrix.md` stands unchanged and no MVP `FR-*`/`NFR-*` row
  may cite this slice as its guard; the slice rows live in
  `traceability-matrix.md` section 27, and `FR-SEC-1`..`FR-SEC-4` are
  requirement additions outside the counted MVP capability set.
- Change-level rollback is one revert: the session parameter at each
  server seam, the store and adapter reads, the `requestActor`
  annotation, and the guards fall back to today's body actor together.
  Every request the services accepted before is accepted again; historic
  rows keep the value they recorded and no migration or data repair
  exists in either direction.
- **No transitional red at this spec head.** The branch is docs-only, so
  the code tree is the stacked spec base. The Node, Go, Java, and app
  suites were not re-run in this worktree as part of the spec work; they
  are the unchanged baseline the per-stack CI jobs last ran, and the
  implementation PR runs them.

## 2. Pins on disk at this spec head

Every `file:line` below was read on this spec branch head, whose code
tree is the stacked spec base (the product, requirements, architecture,
and testing spec PRs touch `docs/` plus one contract `description`
string, and no behaviour). They prove today's behaviour: every store
and adapter records the body actor, the token never reaches a recorded
value, Admin's config write alone still trusts `updatedBy`, and no
spoofed-actor guard, `requestActor` annotation, or Stay/Guests no-session
guard exists. The implementation PR extends these in place with a
`#643` note and never deletes an assertion.

| Pin | What it proves today | Note for the implementation PR |
|---|---|---|
| `services/stay/src/auth.ts:3-7`, `:8-15` | The comment promises the token "travels through as the audit actor fallback"; `extractBearer` returns presence and the token only | `SEC1`-`SEC4`: the returned token becomes the recorded actor; the comment is rewritten to state the implemented fallback |
| `services/guests/src/auth.ts:8-15`, `services/rooms/src/auth.ts:8-15` | Byte-identical copies of the helper | `SEC5`, `SEC6`-`SEC12`: same seam, module-local, no cross-service import |
| `services/stay/src/server.ts:159-162` | `extractBearer` answers 401 `UNAUTHENTICATED` before `readBody` | `SEC32`: the Stay no-session guard does not exist today (`grep -n "UNAUTHENTICATED" services/stay/src/server.test.ts` finds nothing); it is created here |
| `services/stay/src/server.ts:166-169`, `:188-199` | `CheckIn`, `MoveRoom`, and `RecordActualTimes` pass the raw body to the store; the token is not passed | `SEC1`, `SEC3`, `SEC4`: the server hands the token to the store beside the body |
| `services/stay/src/server.ts:181-186` | `CheckOut` passes the body and the bearer to `checkOut` — the bearer is used only for the Reservations forward | `SEC2`, `SEC33`: the same token becomes the recorded actor and keeps feeding the forward |
| `services/stay/src/store.ts:216`, `:240` | `CheckIn` requires `input.actor` and writes it into the outbox payload | `SEC1`: records the session; a differing body value moves to `payload.requestActor` |
| `services/stay/src/store.ts:294`, `:318` | `CheckOut` requires `input.actor` and writes it into the outbox payload | `SEC2`: same seam; the forward keeps its own shape |
| `services/stay/src/store.ts:335`, `:370` | `MoveRoom` records the body actor in the outbox payload; the in-memory move record carries no actor column, only `stayId`/`fromRoomId`/`toRoomId`/`movedAt` (`:359-364`) | `SEC3`: the payload `actor` and the Postgres move row's `created_by` move to the session; the in-memory move record keeps its shape |
| `services/stay/src/store.ts:383`, `:401` | `RecordActualTimes` records the body actor in the outbox payload | `SEC4`: same seam |
| `services/stay/src/pgstore.ts:79`, `:112`, `:184`, `:221`, `:247`, `:297-312`, `:341`, `:368-376` | The Postgres twin takes the body actor into the stay row, the move row, and the outbox writer | `SEC1`-`SEC4` parity half: both stores record the same session value |
| `services/guests/src/store.ts:319`, `:337` | `UpsertGuest` requires `input.actor` and writes it into the outbox payload | `SEC5`: the only Guests write; the outbox row is the recorded audit |
| `services/guests/src/pgstore.ts:68`, `:86` | The Postgres twin takes the body actor into the guest row | `SEC5` parity half |
| `services/rooms/src/store.ts:219`, `:233`, `:239`, `:258` | `UpsertRoomType` and `UpsertRoom` record the body actor in the outbox (`:233`, `:258`) | `SEC6`, `SEC7`: outbox-only writes; the value is the session |
| `services/rooms/src/store.ts:268`, `:285`, `:289-290` | `UpdateRoomState` records the body actor in state history and the outbox | `SEC8`: history `createdBy` and outbox `created_by` both move to the session |
| `services/rooms/src/store.ts:375`, `:398-399` | `AssignRoom` records the body actor in history and the outbox | `SEC9`: same seam |
| `services/rooms/src/store.ts:413`, `:428-429` | `ReleaseRoom` records the body actor in history and the outbox | `SEC10`: same seam |
| `services/rooms/src/store.ts:438`, `:458-459` | `BlockRoom` records the body actor on the block row (`createdBy` at `:458`) and in the outbox | `SEC11`: the block row column and the payload both move |
| `services/rooms/src/store.ts:477`, `:496-497` | `ReleaseBlock` records the body actor in the outbox | `SEC12`: same seam |
| `services/rooms/src/store.ts:506-508`, `:510-518` | `recordHistory` and `emit` take `createdBy`/`createdBy` as parameters — the row and payload shapes come from the callers | `SEC8`-`SEC12`: the seam is at the caller; the helpers keep their shape |
| `services/rooms/src/pgstore.ts:56-66`, `:140`, `:196`, `:269`, `:416`, `:504` | The Postgres twin's outbox writer takes `createdBy` as a parameter and every write passes the body actor | `SEC6`-`SEC12` parity half |
| `services/reservations/internal/handler/handler.go:140-158` | The authed wrapper already has the raw `Authorization` value and forwards it only to the pricing and stay-restriction reads | `SEC13`-`SEC18`: the same header value becomes the recorded actor at the write seam |
| `handler.go:176`, `:238`, `:256`, `:290`, `:323`, `:342` | Each write reads `body["actor"]` (`CheckOutReservation` requires it) | `SEC13`-`SEC18`: the body read stays for the annotation only |
| `services/reservations/internal/store/store.go:142-143`, `:245`, `:361`, `:427-451`, `:484-492`, `:528-536` | The in-memory store takes the caller's actor into change rows and outbox payloads | `SEC13`-`SEC18` memory half; the two existing assertions re-pin |
| `services/reservations/internal/store/postgres.go:139`, `:205`, `:253-267`, `:342-384`, `:402-456`, `:569-627`, `:647-720`, `:739-797` | The Postgres store writes `created_by` and the payload `actor` from the caller's string on every write | `SEC13`-`SEC18` Postgres half |
| `services/reservations/internal/store/store_test.go:214`, `:491` | The two existing assertions require the change actor to be the request string `"front-desk"` | `SEC13`-`SEC18`: these **re-pin to the session token** in the implementation PR — an expected value change, not drift |
| `services/billing/src/main/java/com/hotel/billing/web/BillingController.java:39-42` | `actor(body)` maps a non-string to `""` and passes the body value on | `SEC19`-`SEC27`: the helper reads the header token instead; a non-string body value is annotation-only |
| `BillingController.java:117-121` | `requireToken` answers the 401 and returns nothing — the token is dropped at the gate | `SEC32`: the token is the recorded value; no new check is added |
| `BillingController.java:127-129`, `:134-137`, `:142-145`, `:150-152`, `:164-166`, `:171-173`, `:178-180`, `:187-189`, `:195-198` | Nine adapters take the body actor after the token check | `SEC19`-`SEC27`: one guard per adapter |
| `services/billing/src/main/java/com/hotel/billing/service/BillingService.java:110-115` | `actorOf` refuses a blank actor naming `actor` | `SEC31`: the refusal keeps its code, `details.field`, and sentence |
| `services/billing/src/main/java/com/hotel/billing/repo/BillingRepository.java:65-69`, `:100-105`, `:109-111`, `:135-137`, `:143-145`, `:154-160`, `:176-191`, `:237-239`, `:269-286` | Every repository call writes the actor into `created_by`/`updated_by` | `SEC19`-`SEC27`: the stored value is the session token |
| `services/admin/src/server.ts:157-166` | `handleRequest` extracts the token, authenticates it, and passes the resolved caller to every write | `SEC28`: the caller is already in hand; the config write uses it |
| `services/admin/src/store.ts:368`, `:403`, `:425`, `:466` | Account writes already record `caller.signinIdentity` | `SEC28`: parity baseline for the config write; unchanged |
| `services/admin/src/store.ts:565-568` | `updateConfig` reads `input.updatedBy` into the stored `updatedBy` and the derived audit entry (`:503`) | `SEC28`: the recorded actor becomes `caller.signinIdentity`; `requiredString(input.updatedBy)` at `:558` stays |
| `services/admin/src/pgstore.ts:511`, `:524`, `:532` | The Postgres twin reads `requiredString(input.updatedBy)` and writes it into the profile and jsonb rows | `SEC28` parity half; the `updatedBy` refusal stays |
| `services/admin/src/store.ts:262-281` | The boot seed writes the server-side `"boot"` actor with no request | `SEC34`: keeps `boot`; a spoofed request cannot reach it |
| `services/stay/src/reservationsClient.ts:31-44` | The completion client posts `{stayId, actor}` with the caller's bearer | `SEC33`: the forwarded `actor` is annotation-only and the bearer carries the session |
| `contracts/http/CheckIn.json:13`, `UpsertGuest.json:13`, `CheckOutReservation.json:19`, `UpdateHotelConfig.json:13` | `actor`/`updatedBy` are required request fields | `SEC31`, `SEC35`: no contract shape, required list, or error-list change (the `description` prose handled below) |
| `contracts/http/CheckOutReservation.json:22`, `contracts/http/UpdateHotelConfig.json:20` | Two `description` strings claim the body value is recorded: the reservation `actor` sentence (corrected by the architecture PR to say the session is recorded and the body value is an annotation) and the config `updatedBy` sentence, still reading "Actor recorded on the config audit trail." | **Flagged gap, not fixed here.** The architecture PR's contract decision covers only the reservation sentence. The config sentence is equally stale after this change and must be corrected in prose (no type, required-list, error-list, or version move) — by `architect` in a spec follow-up or by the implementation PR under `SEC35`. `SEC35` asserts both descriptions state that the session is recorded and the field is validated but not authoritative, and `script/contract-check.sh` stays green |
| `services/stay/migrations/001_boot.sql:9-16`, `services/billing/src/main/resources/db/migration/V1__boot.sql:9-16` | The outbox tables carry `created_by TEXT` and a `JSONB` payload | `SEC35`, `SEC36`: the token fits the stored form; no migration |
| `services/stay/migrations/002_schema.sql:31-33`, `services/billing/src/main/resources/db/migration/V2__schema.sql:23-25` | The audit columns are `TEXT` | `SEC35`: no column type, width, or constraint change |
| `app/src/views/PrintView.vue:1030`, `:1122`, `:1159` | The desk sends `session.displayName` as `actor` and renders no actor | `SEC35`: the desk payload is unchanged; no reader-visible surface moves |
| `grep -rn "requestActor" services/ app/ contracts/` | No `requestActor` key exists anywhere today | The annotation itself; `SEC29` is the guard that would have caught a spoofed value winning |

## 3. Guard registry SEC1-SEC36 and the evidence rule SEC-E1

Thirty-six obligations — one spoofed-actor guard per audited write
operation per stack, then the cross-cutting annotation, refusal,
no-session, boot-seed, forwarded-call, shape, and gate obligations — plus
one evidence record. `SEC1`-`SEC30` and `SEC33`-`SEC36` are **missing
guards** the implementation PR creates; `SEC31`-`SEC32` are mixed (the
existing refusal guards are re-run, the new no-session guards for Stay
and Guests are created); `SEC-E1` is the evidence record. A spoofed-actor
guard is not complete on the stored value alone: every write guard also
asserts the response and stored business effect match the honest-value
write, so an implementation that refuses the disagreement, or that
records the session but changes the answer, fails.

A guard that asserts only "the actor changed" is insufficient: the
recorded value must equal the exact session value (the token string, or
the caller's `signinIdentity`), and the request string must appear
nowhere as the actor — not in the row, the payload `actor`, the derived
audit entry, or a second write beside the first.

| Guard | Obligation (case) | Lands in |
|---|---|---|
| `SEC1` | **Stay `CheckIn` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: a `CheckIn` with `Authorization: Bearer <token>` and `actor: "someone-else"` commits with today's status and stay row, the outbox `checked-in` payload's `actor` and the stored row's actor equal `<token>` (trimmed, no `Bearer `), the payload carries `requestActor: "someone-else"`, and the body value never appears as `actor`; the Postgres store repeats the value equality | `services/stay/src/server.test.ts` — memory half in the `check-in` describe (`:64`), Postgres half in `stay postgres store` (`:380`) |
| `SEC2` | **Stay `CheckOut` records the session (`AC-SEC-1`, `FR-SEC-1`, `SEC33`, `BR-65`)**: a spoofed-actor close commits with today's status and close effects; the outbox `checked-out` payload `actor` and the row actor equal the token; `requestActor` carries the body value; the forwarded completion keeps receiving the same bearer (`services/stay/src/store.ts:299`, `:323`) | the `check-out` describe (`:130`) and the postgres twin (`:380`) |
| `SEC3` | **Stay `MoveRoom` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: a spoofed-actor move commits with today's status and both room states; the outbox payload `actor` equals the token, the Postgres move row's `created_by` equals the token (the in-memory move record keeps its `fromRoomId`/`toRoomId`/`movedAt` shape), and the annotation carries the body value | the `room moves` describe (`:242`) and the postgres twin (`:380`) |
| `SEC4` | **Stay `RecordActualTimes` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: a spoofed-actor times write commits with today's status and kept times; the outbox payload `actor` equals the token and `requestActor` carries the body value | the `actual times` describe (`:295`) and the postgres twin (`:380`) |
| `SEC5` | **Guests `UpsertGuest` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: a spoofed-actor upsert commits with today's status and profile values; the outbox `guest-upserted` payload `actor` equals the token and `requestActor` carries the body value; the Postgres twin stores the same value (`pgstore.ts:68`, `:86`) | `services/guests/src/server.test.ts` — `guest profiles` (`:67`) and `guests postgres store` (`:947`) |
| `SEC6` | **Rooms `UpsertRoomType` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: a spoofed-actor upsert commits with today's status and room-type row; the outbox `room-upserted` payload `actor` and `created_by` equal the token; `requestActor` carries the body value | `services/rooms/src/server.test.ts` (outbox-only write; the direct-store pattern at `:272-278` and the Postgres twin `services/rooms/src/pgstore.test.ts:21`) |
| `SEC7` | **Rooms `UpsertRoom` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: same obligations on the `room-upserted` write, with the room row unchanged | the same suites |
| `SEC8` | **Rooms `UpdateRoomState` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: a spoofed-actor state change commits with today's status and transition; the state-history `createdBy` (`store.ts:506-508`) and the outbox payload `actor`/`created_by` (`:510-518`) equal the token; `requestActor` carries the body value | `services/rooms/src/server.test.ts` and `pgstore.test.ts` (`:21-56`) |
| `SEC9` | **Rooms `AssignRoom` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: same history-plus-outbox assertions on the assignment write | the same suites |
| `SEC10` | **Rooms `ReleaseRoom` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: same history-plus-outbox assertions on the release write | the same suites |
| `SEC11` | **Rooms `BlockRoom` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the block row's `createdBy` (`store.ts:458`) and the outbox payload `actor`/`created_by` equal the token; the block columns are unchanged; `requestActor` carries the body value | the same suites |
| `SEC12` | **Rooms `ReleaseBlock` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: same assertions on the release-block write | the same suites |
| `SEC13` | **Reservations `CreateReservation` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: a spoofed-actor create commits with today's status and reservation row; the change row's `created_by` (`postgres.go:205`) and the outbox payload `actor` equal the token; `requestActor` carries the body value | `services/reservations/internal/handler/handler_test.go` (the `post` helper `:42-60` with `deskToken` `:15`) and `internal/store/store_test.go` |
| `SEC14` | **Reservations `CheckInReservation` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: same change-row and outbox assertions (`postgres.go:342-384`) | the same suites |
| `SEC15` | **Reservations `CheckOutReservation` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the required-`actor` field keeps its refusal and the recorded actor equals the forwarded token (`postgres.go:402-456`); `requestActor` carries the body value; the handler case uses the Stay-forwarded token so the agreement with `SEC2` is visible | the same suites |
| `SEC16` | **Reservations `ModifyReservation` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: every change row of the modify (dates and price) records the token; the existing `store_test.go:214` assertion re-pins to the token | the same suites |
| `SEC17` | **Reservations `CancelReservation` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the state change row and the `cancelled` outbox payload record the token | the same suites |
| `SEC18` | **Reservations `MarkNoShow` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the state change row and the `no-show` outbox payload record the token; the existing `store_test.go:491` assertion re-pins to the token | the same suites |
| `SEC19` | **Billing `GetFolioBalance` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the lazy folio open writes `created_by`/`updated_by` equal to the header token (`BillingRepository.java:65-69`), not the body `actor`; the response is the same `FolioView` | `services/billing/src/test/java/com/hotel/billing/web/BillingControllerTest.java` (the adapter pattern `:59-70`) and `service/BillingServiceTest.java` |
| `SEC20` | **Billing `PostCharge` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the stored line and the balance update carry the token (`BillingRepository.java:100-105`, `:135-137`); the line view and derivation are unchanged | the same suites |
| `SEC21` | **Billing `RecordPayment` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the payment row carries the token (`:109-111`) | the same suites |
| `SEC22` | **Billing `RecordOpenBalanceApproval` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the approval row's `updated_by` carries the token (`:143-145`) while `approvedBy`/`role` keep their own decided handling (`AC-CKO-1`) — the guard asserts only the actor claim moved | the same suites |
| `SEC23` | **Billing `RunDayClose` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the day-close row carries the token (`:269-286`) | the same suites |
| `SEC24` | **Billing `ProduceInvoice` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the invoice row carries the token and the rendered invoice is unchanged | the same suites |
| `SEC25` | **Billing `ProduceReceipt` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the receipt row carries the token and the rendered receipt is unchanged | the same suites |
| `SEC26` | **Billing `UpsertChargeItem` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the charge-item row's `created_by`/`updated_by` carry the token (`:154-160`) | the same suites |
| `SEC27` | **Billing `UpsertTaxFeeRule` records the session (`AC-SEC-1`, `FR-SEC-1`, `BR-65`)**: the tax-rule row's `created_by`/`updated_by` carry the token (`:176-191`) | the same suites |
| `SEC28` | **Admin `UpdateHotelConfig` records the resolved caller (`AC-SEC-3`, `FR-SEC-3`, `BR-64`, `BR-65`)**: an owner save whose body `updatedBy` names another person commits with today's status and values, and the stored config rows and the derived `config.updated` audit entry record `owner` (the caller's `signinIdentity`), never the body value; the body `updatedBy` stays required (its refusal is `SEC31`); a manager save records the manager; both stores agree (`store.ts:565-568`, `pgstore.ts:511`, `:524`, `:532`) | `services/admin/src/server.test.ts` (`:242-318` shape, `:783-825` audit) and `services/admin/src/pgstore.test.ts` (`:33-58`, `:77-133`, `:166`) |
| `SEC29` | **The annotation appears exactly when it should (`AC-SEC-2`, `FR-SEC-2`, `BR-65`)**: for each JSON-outbox write family, a differing non-blank body value adds `requestActor` with that exact value; a value equal to the session actor adds no key; an absent value (where the service accepts it) adds no key; a blank value adds no key; the payload key set changes only by `requestActor`, and the response is byte-identical to the honest-value write | Stay, Guests, Rooms, and Reservations outbox suites; the Go payload key-set assertion lives beside `SEC13`-`SEC18` |
| `SEC30` | **Column-only writes drop the request value and keep their shape (`AC-SEC-2`, `AC-SEC-5`, `FR-SEC-2`, `FR-SEC-4`, `BR-65`)**: a spoofed value on a change row, a state-history row, an Admin audit row, and a Billing repository column leaves the row's columns and key set unchanged (no `requestActor`) and records the session; the desk still sends its display name and no surface renders an actor | the Go change-row suites, the Rooms history assertions, the Admin audit suite, and the Billing repository assertions |
| `SEC31` | **The existing refusals keep their place (`AC-SEC-2`, `FR-SEC-2`, `BR-65`)**: a missing or blank `actor` in Stay, Guests, Rooms, `CheckOutReservation`, and Billing still answers HTTP 400 `VALIDATION_FAILED` naming `actor` with today's sentence and writes nothing; Admin's missing/blank `updatedBy` still refuses; a missing token still answers 401 before the body on every path; a disagreement adds no refusal of its own | existing cases: `handler_test.go:256-259`, `BillingService.actorOf` (`:110-115`), `services/admin/src/server.test.ts:1319` (`updatedBy` first) — re-run, plus the new spoofed-write cases assert no extra refusal |
| `SEC32` | **No session answers 401 and writes nothing, per service (`AC-SEC-4`, `FR-SEC-4`, `NFR-SEC-2`, `BR-65`)**: a write with no `Authorization` header answers today's HTTP 401 `UNAUTHENTICATED` with the existing sentence and records nothing, on Stay, Guests, Rooms, Reservations, Billing, and Admin — and the actor never falls back to the body, proven by a stored-value read after the refusal | Rooms re-run `services/rooms/src/server.test.ts:60-68`; Reservations re-run `handler_test.go:351-359`; Billing re-run `BillingControllerTest.java:94-95`; Admin re-run `services/admin/src/server.test.ts:234-240`; **Stay and Guests created** — no HTTP-level no-token guard exists today (`services/stay/src/server.ts:159-162`, `services/guests/src/server.ts:130-132` carry the check, the suites carry no case) |
| `SEC33` | **The forwarded completion agrees (`AC-SEC-4`, `FR-SEC-1`, `FR-SEC-4`, `BR-65`)**: a Stay `CheckOut` records the desk token; the completion call carries the same bearer and the body `actor` as an annotation; the Reservations change row for the same close records the same token; the forwarded `actor` never overrides it | `services/stay/src/reservationsClient.test.ts:54-80` (bearer pass-through) plus the completion path in `services/stay/src/server.test.ts:489-556`, `:630-700` |
| `SEC34` | **The Admin boot seed keeps its server-side actor (`AC-SEC-4`, `FR-SEC-3`, `BR-65`)**: the boot seed writes the `"boot"` actor with no request, and no request path can replace it with a body value | `services/admin/src/store.ts:262-281`; guard lands in `services/admin/src/server.test.ts` or `pgstore.test.ts` |
| `SEC35` | **Shapes stay additive and nothing reader-visible moves (`AC-SEC-5`, `FR-SEC-4`, `NFR-AUD-1`)**: the outbox payload key set changes only by `requestActor`; the change/history/audit columns are unchanged; the write contract files keep their type, required flag, error list, and version, while both stale `description` sentences (`CheckOutReservation.json:22`, `UpdateHotelConfig.json:20`) state that the session is recorded and the field is validated but not authoritative; no error code, catalogue key, desk state, control, route, label, or print rule is added; the desk's own payloads still carry `session.displayName`; `script/contract-check.sh`, `script/openapi-route-check.sh`, and `script/catalogue-coverage-check.sh` stay green | contract files, the desk suites (`app/src/views/PrintView.test.ts:78`, `:102`, `:303`, `:339`), and the three gates |
| `SEC36` | **No migration and no configuration source (`AC-SEC-5`, `BR-65`)**: diff inspection records that the provenance rule is a code rule, carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no schema, table, column, migration, backfill, or stored-value rewrite exists; the session value is derived from the header the request already authenticated with | diff inspection recorded in the implementation PR body; `deploy/**`, `docs/devops/**`, `docs/operations/**`, `services/*/migrations/**` |
| `SEC-E1` | **Evidence rule**: the implementation PR reproduces the finding on the pre-fix build and records the before/after pair in `docs/testing/evidence/643/README.md`, and records the slice in `docs/testing/test-report.md` (exit criterion 6 of the `test-strategy.md` [section 3](test-strategy.md#3-exit-criteria-per-slice)). This row stays pending until both records exist | evidence record + `test-report.md` |

## 4. Traceability map

Status is `pending` for every condition/requirement row whose guard does
not exist at this spec head: the implementation PR creates it and
`qa-lead` re-pins the row with `file:line` at the merged head, flipping
it to covered only when the guard passes. The rows whose pins exist and
pass today — the four service suites, the two Go assertions (which
re-pin), the Admin config and audit cases, the desk payload cases, and
the contract/catalogue gates — are covered **by re-run**: they must keep
passing untouched (except the two named re-pins), but the slice as a
whole stays incomplete. The Node, Go, Java, and app suites were not
re-run in this worktree (docs-only branch); they are the unchanged
baselines the per-stack CI jobs last ran, and the implementation PR runs
each one.

| Item | Required guard | Guard |
|---|---|---|
| `AC-SEC-1` — given a valid session, when a write through Stay (4), Guests (1), Rooms (7), Reservations (6), or Billing (9) commits, then every outbox event, change row, and state-history row it writes records the session token the request presented, not the request's `actor`; the Stay close and its forwarded completion record the same token; an operation that persists no audit row is unchanged (traces to `FR-SEC-1`, `NFR-AUD-1`, `NFR-SEC-2`) | L1 acceptance + L2 audit: one spoofed-actor case per write operation per stack, asserting the exact session value in the row and the payload | **Pending** — `SEC1`-`SEC28`, `SEC33`; today's opposite is the body read at `store.ts:216`/`:294`/`:335`/`:383`, `store.ts:319`, `store.ts:219`-`:477`, `handler.go:176`-`:342`, `BillingController.java:39-42`, and `store.ts:565` |
| `AC-SEC-2` — given a valid session, when a write sends an `actor` naming another person, then the answer and stored business effect are exactly those of the honest-value write, the recorded actor is the session token, the supplied value never appears as the actor, and it appears only as `requestActor` in a JSON payload; an equal value adds no key; a column-only write drops it; a body value that breaks its existing rule keeps that refusal and writes nothing; no refusal is added for the disagreement | L1 acceptance: the annotation key-set matrix, the honest-value response equality, and the no-extra-refusal assertion | **Pending** — `SEC29`, `SEC30`, `SEC31` |
| `AC-SEC-3` — given an authenticated `UpdateHotelConfig` by an owner or manager, the `config.updated` audit rows and stored profile rows record the caller's `signinIdentity`, never the body's `updatedBy`, while the field stays required with its existing refusals and every table-valid value is stored, read back, and timed as today; a body `updatedBy` naming another person changes nothing but the dropped annotation; the recorded-actor half of `AC-CFG-4` is superseded | L1 acceptance: the spoofed-`updatedBy` owner and manager saves, both stores, and the audit assertion | **Pending** — `SEC28`; covered by re-run for the honest round trip (`services/admin/src/server.test.ts:242-318`, `pgstore.test.ts:33-58`) |
| `AC-SEC-4` — given no `Authorization` header, any write answers today's HTTP 401 `UNAUTHENTICATED` and nothing is written; the Stay close and its forwarded completion record the same desk token and the forwarded `actor` never overrides it; the Admin boot seed keeps `boot` (traces to `FR-DEP-1`, `FR-DEP-5`, `NFR-SEC-2`) | L1 acceptance: the six per-service no-session cases with a stored-value read, the forwarded agreement pair, and the boot-seed case | **Covered by re-run today for Rooms (`server.test.ts:60-68`), Reservations (`handler_test.go:351-359`), Billing (`BillingControllerTest.java:94-95`), and Admin (`server.test.ts:234-240`); pending the Stay and Guests no-session guards (`SEC32`), the forwarded agreement (`SEC33`), and the boot seed (`SEC34`)** |
| `AC-SEC-5` — outbox payloads and rows keep their existing keys and columns with `requestActor` the only addition; every write contract is unchanged; no error code, catalogue key, desk surface, route, schema, table, migration, or backfill is added; token verification, HMAC, expiry, revocation, and role checks are unchanged; the tree carries one spoofed-actor guard per write per stack, with the existing suites green (evidence condition) | L1 + evidence: the shape/key-set gate, the contract and catalogue gates, the untouched suites, and the record | **Pending** — `SEC1`-`SEC30`, `SEC35`, `SEC36`, `SEC-E1`; the re-run halves are the existing suites named in section 2 |
| `FR-SEC-1` — every audited write records the authenticated session, read from the `Authorization` header the server already authenticates with, never from the body; the forwarded completion records the same token; an operation with no audit row is unchanged (requirements 35.3) | L1 acceptance: `SEC1`-`SEC28` and `SEC33` | **Pending** — `SEC1`-`SEC28`, `SEC33` |
| `FR-SEC-2` — a disagreeing request actor is demoted, never refused and never authoritative: the response and effect match the honest write, the value appears only as `requestActor`, an equal/absent/blank value adds no key, a column-only write drops it, and an existing body-value refusal keeps its code, field, and sentence with nothing written (requirements 35.3) | L1 acceptance: `SEC29`-`SEC31` | **Pending** — `SEC29`-`SEC31` |
| `FR-SEC-3` — the Admin config write records the resolved caller, never the body's `updatedBy`, with the field still required, the front-desk 403 standing, and the boot seed keeping `boot` (requirements 35.3) | L1 acceptance: `SEC28`, `SEC34`; re-run: the front-desk 403 (`server.test.ts:1051-1103`) and the `updatedBy` refusal | **Covered by re-run today for the 403 and the shape table (`server.test.ts:1051-1103`, `:1104-1436`) and pending the spoofed-`updatedBy` and boot-seed cases (`SEC28`, `SEC34`)** |
| `FR-SEC-4` — no session means no request actor; the session is the only actor source and a forwarded call carries the caller's own session; existing payloads, rows, and contracts keep their keys and columns with `requestActor` the only addition; no error code, catalogue key, desk state, route, schema, migration, or backfill is added and token verification and role checks are unchanged (requirements 35.3) | L1 acceptance + diff gate: `SEC32`, `SEC33`, `SEC35`, `SEC36` | **Pending** — `SEC32` (Stay, Guests), `SEC33`, `SEC35`, `SEC36`; covered by re-run for the four existing no-session guards |
| `BR-65` — the actor recorded on every audit trail is the authenticated session, never a request value; the request field keeps its shape, refusals, and demotion; no session, the boot seed, and the forwarded call keep their actor source; shapes stay additive; the rule is fixed code, never per-hotel configuration (business rules section 8) | L1 acceptance + evidence: every spoofed-write guard, the annotation matrix, the no-session set, the shape gate, the diff gate, and the record | **Pending** — `SEC1`-`SEC36`, `SEC-E1` |
| `NFR-AUD-1` (unchanged, now with a decided source) — every creation, change, cancellation, state transition, charge, and payment keeps an unaltered actor and timestamp, 100 %; a refused write records nothing; a committed write records the session and its time | L2 audit sampling: `SEC1`-`SEC28` value assertions plus `SEC29`s payload key set | **Pending** — `SEC1`-`SEC30`; covered by re-run for the horizon-1 commit half (`services/admin/src/server.test.ts:783-825`) |
| `NFR-SEC-1` / `NFR-SEC-2` (unchanged) — no role, reach, session, token-validation, lockout, or idle-sign-out rule changes; a missing, invalid, expired, revoked, signed-out, or orphan session is refused 401 with its existing sentence before any write | L1: `SEC31`, `SEC32`; re-run: the lockout, sign-out, and role-refusal cases | **Covered by re-run today for the role and session cases (`services/admin/src/server.test.ts:213-240`, `services/rooms/src/server.test.ts:60-68`, `handler_test.go:351-359`, `BillingControllerTest.java:94-95`) and pending the Stay and Guests no-session guards (`SEC32`)** |
| Desk payloads and surfaces stay green | Behaviour check: every desk call still sends its `session.displayName` `actor`, no surface renders an actor, and the screens, routes, labels, states, and print rules are unchanged | **Covered by re-run** — `SEC35`; `app/src/views/PrintView.test.ts:78`, `:102`, `:303`, `:339` plus the desk suites; a payload or label edit fails the row |
| Contract and LC | Real delta: no contract token, status mapping, enum entry, operation, request/response field, required flag, or fixture changes (one `description` sentence is the architecture PR's), the outbox payload key set changes only by `requestActor`, and both contract gates stay green | **Covered by re-run today** — `SEC35`; the files are `contracts/http/{CheckIn,UpsertGuest,CheckOutReservation,UpdateHotelConfig}.json`, `contracts/errors/envelope.json`, `script/contract-check.sh`, `script/openapi-route-check.sh`; a token, enum, mapping, or schema change here is a re-tier finding (LLD 34.5, 34.8) |
| No-configuration and no-migration gate | Real delta: the provenance rule is a code rule carried by no environment variable, `deploy/` file, compose file, `docs/devops/`, `docs/operations/`, or per-hotel setting; no migration file is added and no stored row is rewritten; every audit column stays `TEXT` | **Pending diff gate** — `SEC36`; the fixed side is recorded in `docs/requirements/business-rules.md` section 9 (BR-65) and `docs/technical/schema.md` section 0 |
| MVP no-change statement | No new MVP row, story, or FR; no `FR-*` wording moves; `FR-SEC-1`..`FR-SEC-4` are requirement additions outside the counted set and no NFR is added (requirements 35.4) | **Pending gate** — the 57-row MVP coverage count stands unchanged and no MVP row cites this slice as its guard |
| Evidence cross-reference (`SEC-E1`) | The finding is reproduced, the before/after pair is recorded, and the slice is in the test report | **Pending** — `docs/testing/evidence/643/README.md` and the `test-report.md` row are created by the implementation PR |

## 5. Test plan

### Levels and suites

| Level | What runs | Command (authoritative: LLD [section 34.6](../architecture/lld.md#346-verification-plan) and each service design's Operations section) |
|---|---|---|
| L1 + L2 Stay | `SEC1`-`SEC4`, `SEC29`, `SEC31`, `SEC32`, `SEC33` | `cd services/stay && npm ci && npm run build && npm test` |
| L1 + L2 Guests | `SEC5`, `SEC29`, `SEC31`, `SEC32` | `cd services/guests && npm ci && npm run build && npm test` |
| L1 + L2 Rooms | `SEC6`-`SEC12`, `SEC29`, `SEC30`, `SEC31`, `SEC32` | `cd services/rooms && npm ci && npm run build && npm test` |
| L1 + L2 Reservations | `SEC13`-`SEC18`, `SEC29`, `SEC30`, `SEC31`, `SEC32`, `SEC33` | `cd services/reservations && go build ./... && go test ./... && go vet ./...` |
| L1 + L2 Billing | `SEC19`-`SEC27`, `SEC30`, `SEC31`, `SEC32` | `cd services/billing && mvn -B verify` |
| L1 + L2 Admin | `SEC28`, `SEC31`, `SEC32`, `SEC34` | `cd services/admin && npm ci && npm run build && npm test` |
| L1 Postgres parity | the Postgres halves of `SEC1`-`SEC5`, `SEC8`-`SEC12`, `SEC28` | the same Node suites with `TEST_PG_URL` / `DATABASE_URL` set; the `migrate-check` CI job applies the schema |
| L1 Desk client | the desk-payload row of section 4 | `cd app && npm test` (`vitest run`) |
| LC contract | `SEC35`: the manifests and fixtures unchanged, both gates green | `script/contract-check.sh`, `script/openapi-route-check.sh` (CI `contract-check`) |
| Gates | Catalogue parity, links, harness conventions, whitespace | `script/catalogue-coverage-check.sh`, `script/markdown-link-check.sh`, `script/harness-conventions-check.sh`, `git diff --check` |
| Lint | Every stack's lint rules | `npm run lint` in `services/stay`, `services/guests`, `services/rooms`, `services/admin`, and `app` |

CI jobs that must be green on the implementation PR: `node-build` for
`stay`, `guests`, `rooms`, and `admin`; `go-build` (reservations);
`billing-build`; `app-build`; `contract-check`; and `ci` (catalogue,
links, harness conventions). `e2e-single-host` runs on a `services/**`
change and must stay green: it drives the desk loop that sends a
display-name `actor`, so a service that refuses the disagreement fails
that job rather than passing silently — which is the owner-visible proof
that the demotion, not a refusal, shipped. `browser-e2e` also runs on a
`services/**` change and must stay green with unchanged assertions and
snapshots. `dom-diff` runs only on an `app/**` change, which this slice
does not make, so it has nothing new to allowlist. `perf-reporting-variant`
and the timed desk check stay as they are: the token is already in hand
where the request is authenticated, so recording it adds no lookup
(LLD 34.7).

### Execution order

1. The Stay server seam and the four Stay store writes (`SEC1`-`SEC4`) —
   they fail loudly while the store still reads the body, and they carry
   the `requestActor` annotation first, so the demotion rule is proven
   on the largest write family.
2. The Guests write and the two missing no-session guards
   (`SEC5`, `SEC32` Stay and Guests) — a service that answers 401 after
   writing, or that writes with no session, fails here.
3. The Rooms seven writes (`SEC6`-`SEC12`) — the history-plus-outbox
   pairs, including the block row's `createdBy`.
4. The six reservation writes (`SEC13`-`SEC18`), re-pinning
   `store_test.go:214` and `:491`, then the forwarded agreement
   (`SEC33`).
5. The nine Billing adapters (`SEC19`-`SEC27`) with the service-level
   `actorOf` refusal unchanged.
6. The Admin config write and the boot seed (`SEC28`, `SEC34`), both
   stores.
7. The cross-cutting matrix: the annotation key set (`SEC29`), the
   column-only writes (`SEC30`), and the refusal placement (`SEC31`).
8. The shape and gate rows (`SEC32`-`SEC36`), then the isolated-lab
   reproduction and the before/after pair (`SEC-E1`), the
   `test-report.md` row, and the re-pin of section 4 at the merged head.

### Entry criteria

1. The #643 T2 spec set (product section 27, requirements section 35,
   `BR-65`, LLD section 34, the six service-page deltas, the api-spec /
   error-handling / schema / integration / threat-model notes, the one
   contract `description` sentence, and this document) is on disk, and
   the `spec-reviewer` has posted `SPEC-GATE PASS` on #643 or the spec
   stack (#740 -> #741 -> #742 -> this PR).
2. The four spec stack members are merged (or the implementation PR
   branches from the stack tip), so the decided rule, the annotation
   shape, and the guard obligations are the ones on disk.
3. The #588/#600/#601/#627/#630/#631/#634/#635/#640/#641/#646/#647/#648/#639
   slices are merged, so the envelope, bounds, desk, settlement, and
   audit pins this slice re-runs are the real baseline.
4. The build under test is identified by commit and the lab seed matches
   `deploy/config/hotel.example.json` (the #588 capture method,
   `docs/testing/evidence/588/README.md`).
5. Baseline state: every per-stack suite and both contract gates are
   green at the implementation PR's base.

### Exit criteria

1. `SEC1`-`SEC28` pass: every audited write records the exact session
   value in its row and payload, the response and stored effect match
   the honest-value write, and the body value never appears as `actor`.
2. `SEC29` passes: `requestActor` appears exactly when the supplied
   value is non-blank and differs, carries that value, and adds no key
   on an equal, absent, or blank value; the payload key set changes only
   by that key.
3. `SEC30` passes: column-only writes drop the request value with their
   columns unchanged.
4. `SEC31` passes: every existing `actor`/`updatedBy` refusal and every
   no-token 401 keeps its code, field, sentence, and place, and the
   demotion adds no refusal.
5. `SEC32` passes on all six services: no session answers 401 with the
   existing sentence, writes nothing, and never falls back to the body.
6. `SEC33` and `SEC34` pass: the forwarded completion records the same
   token on both sides, and the boot seed keeps `boot`.
7. `SEC35` passes: shapes additive, contracts and fixtures unchanged,
   no catalogue or desk change, and both contract gates plus the
   catalogue gate green.
8. `SEC36` is recorded: no configuration source, no migration, no
   stored-row rewrite.
9. `SEC-E1` is recorded: the `docs/testing/evidence/643/README.md`
   before/after pair and the `docs/testing/test-report.md` row.
10. The 57/57 MVP coverage count stands; `qa-lead` has re-pinned
    section 4 at the merged head and flipped the rows.
11. Open failures are filed as issues with FR/NFR ids; no
    `risk-medium` failure is waived without owner approval.

### Negative controls

A guard that only checks a status, or that asserts the actor "changed",
is insufficient.

- `SEC1`-`SEC28` assert the **exact** session value in the column and in
  the payload `actor`, so an implementation that records a hash, a
  username, an empty string, or the request value fails.
- `SEC1`-`SEC28` assert the request value appears nowhere as the actor
  — not in the row, not in a second row the write also records (for
  example Stay's move row beside its outbox row) — so an implementation
  that fixes one write and leaves a sibling on the body fails.
- `SEC1`-`SEC28` also assert the response and the stored business effect
  match the honest-value write, so an implementation that refuses the
  disagreement (400/403) or that drops the write fails.
- `SEC29` asserts the key-set delta, so an implementation that always
  adds `requestActor` (honest payloads stop being byte-identical) or
  never adds it (the annotation promise is empty) fails.
- `SEC29` sends a blank value and an equal value, so an implementation
  that annotates either fails.
- `SEC30` reads the row key set and the column list, so an implementation
  that adds `requestActor` to a column-only row fails.
- `SEC31` sends a missing `actor` beside a spoofed one, so an
  implementation that reuses the `actor` refusal for the demotion (or
  that loses the refusal) fails.
- `SEC32` asserts a stored-value read after the 401, so an
  implementation that answers 401 after writing fails; the Stay and
  Guests cases are new because no such guard exists today.
- `SEC33` asserts both recorded values, so an implementation that fixes
  Stay but lets the forwarded `actor` win on Reservations fails.
- `SEC34` asserts the seed actor with no request, so an implementation
  that derives the boot actor from a body (there is none) or drops it
  fails.
- `SEC35` and `SEC36` fail on a loosened assertion, a contract key-set
  change, a new migration, or a configuration source — not only on a
  red test.

## 6. Owner verification cases (SEC-1..SEC-10)

Plain-language cases the owner can run on the lab once the change lands,
using the `script/e2e-desk-loop.sh` recipe (a signed-in token, a seeded
store, `api <service> <Operation>` bodies, and `psql` reads where the lab
persists). Steps are the same for each case unless stated: sign in as
`owner`, act as described, then read the reply and the audit rows.

| Case | Setup | Expected |
|---|---|---|
| `SEC-1` | Check a reservation into a ready room with the desk's normal body, then repeat with an `actor` naming another staff member | Both replies are the same success answer and the room is in-house; the audit rows for both record the same signed-in session, and the second row shows the other name only as a request annotation where a payload exists |
| `SEC-2` | Move an in-house guest between rooms with an `actor` naming another person | The move succeeds, both room states change as before, and the move record's actor is the session, not the name sent |
| `SEC-3` | Upsert a guest profile with an `actor` naming another person | The profile saves exactly as before, and the guest audit event's actor is the session |
| `SEC-4` | Update a room's housekeeping state with an `actor` naming another person | The state changes as before, and the state-history row's actor is the session |
| `SEC-5` | Modify, cancel, and mark a booking no-show, each with an `actor` naming another person | Each succeeds as before, and every change row's actor is the signed-in session |
| `SEC-6` | Post a charge and take a payment on an open folio with an `actor` naming another person | Both succeed and the folio balance is unchanged from the honest run; the stored rows record the session |
| `SEC-7` | Change the hotel config with `updatedBy` naming another owner | The change saves as before, the settings screen reads back the new values, and the config-change audit row shows the signed-in owner, not the name sent |
| `SEC-8` | Call one write on each service with no session at all | Each answers the same 401 "Missing session token." as before, and nothing is written on any service |
| `SEC-9` | Check out a booking that completes its reservation, reading both the stay and the booking | The close succeeds, and both the stay's audit rows and the booking's change history record the same desk session; the forwarded name is only an annotation |
| `SEC-10` | Start a fresh lab and inspect the boot owner's audit rows; then run the contract, catalogue, and link checks and look for a new migration | The boot owner's rows record `boot`; all three gates pass; no migration file, environment variable, or per-hotel setting carries the actor rule |

## 7. Evidence rule SEC-E1

The implementation PR records, in `docs/testing/evidence/643/README.md`
(created by that PR, same capture method as the #588, #627, #630, #635,
#640, #641, and #639 records), one before/after pair per finding:

- **C6 — the caller-chosen actor, on the pre-fix build from an isolated
  compose lab.** Send one write per service with a session token and an
  `actor` naming another person (a Stay check-in, a Rooms state change, a
  reservation modify, a Billing charge, and an Admin config change) and
  read the stored rows: before the fix each records the supplied name
  (pins `services/stay/src/store.ts:240`, `services/rooms/src/store.ts:285`,
  `services/reservations/internal/store/postgres.go:253-267`,
  `BillingRepository.java:100-105`, `services/admin/src/store.ts:565-568`).
  After the fix the same requests record the session (the token, or the
  Admin caller's `signinIdentity`) and the supplied name appears only as
  `requestActor` where a JSON payload exists.
- **The honest control.** The same five writes with an honest value
  return the same answer and the same stored business effect, and their
  payloads are byte-identical to the pre-fix payloads (no
  `requestActor`), proving the demotion did not become a refusal or a
  shape change.
- **The no-session control.** One write per service with no
  `Authorization` header answers the existing 401 and records nothing,
  including the two services (Stay, Guests) that had no such guard.
- **The forwarded completion.** One Stay close whose booking completes,
  captured with both the stay rows and the reservation change row, so
  the same session value is visible on both sides and the forwarded
  `actor` is visibly an annotation.
- **The boot seed.** The fresh-lab boot owner's audit rows show `boot`
  with no request.
- **Plus the unchanged controls:** the existing `actor`/`updatedBy`
  refusals, the role 403 on the config write, the desk's payloads, and
  the contract and catalogue gates.
- **Plus the no-configuration and no-migration check:** the diff of
  `deploy/`, `docs/devops/`, `docs/operations/`, and
  `services/*/migrations/` carries no actor rule and no new file
  (`SEC36`).

The slice's results also go to `docs/testing/test-report.md` (exit
criterion 6 of the `test-strategy.md`
[section 3](test-strategy.md#3-exit-criteria-per-slice)).

## 8. Slice status and re-pin rule

At this spec head: 17 rows mapped to `AC-SEC-1`..`AC-SEC-5`,
`FR-SEC-1`..`FR-SEC-4`, `BR-65`, the two unchanged NFR rows, the
desk-payload row, the contract/LC row, the configuration/migration gate,
the MVP no-change gate, and `SEC-E1`. Three rows are covered by re-run
today (the unchanged `NFR-SEC-1`/`NFR-SEC-2` row, the desk-payload row,
and the contract/LC row), plus the re-run halves named inside `AC-SEC-3`,
`AC-SEC-4`, and `FR-SEC-3` — their pins exist and pass and must keep
passing untouched, except the two Go assertions that re-pin by design;
`NFR-AUD-1` stays pending because its actor-source half is the change
itself. The rest are **pending** the implementation PR: the rows whose
guards are the registry `SEC1`-`SEC30`, `SEC33`-`SEC36`, the `BR-65`
evidence row, the MVP no-change gate, and `SEC-E1`. The slice is **not
complete** at this spec head. It completes when the implementation PR
merges with `SEC1`-`SEC36` green, the section 2 pins refreshed where the
implementation moved a line, `SEC-E1` recorded, and `qa-lead` re-pins
every row in section 4 with `file:line` at the merged head. No row in
this document may be flipped to covered while its guard is absent from
the tree or failing: a pending row is honest, a fabricated pin is a
phantom promise.

<!-- ao-role: qa-lead -->
Role: qa-lead · AO session hotel-mgmt-1176
