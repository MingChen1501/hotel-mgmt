# Integration contract needs — requirements-side input to module contracts

Status: active. Requirements-side derivation of what the eight
HLD module-to-module contracts must carry, owned by
`business-analyst`. This document adds no new behaviour: every
operation, payload field, and error case below traces to an FR/NFR in
`docs/requirements/mvp-requirements.md`, a dictionary entry in
`docs/requirements/data-dictionary.md`, a flow step in
`docs/requirements/sequence-diagrams.md` (Seq-n) or
`docs/requirements/use-cases.md` (UC-n), or a rule in
`docs/requirements/business-rules.md` (BR-n). Technical encoding of
these needs — LLD, schemas, transports, endpoint shapes — belongs to
the `architect` (follow-up issue) and is deliberately absent here.

Sources: `docs/architecture/hld.md` (active) defines the 8 modules
and their ownership; the HLD contract names (`ReservationService`,
`StayService`, `RoomInventoryService`, `PricingService`,
`GuestService`, `BillingService`, `ReportingService`,
`AdminService`, plus the domain events each module emits) are used
below as the endpoints these needs attach to.

Module short codes used below: RES (Reservations), STAY (Stay /
front desk), ROOM (Rooms), RATE (Rates & Availability), GST
(Guests), BIL (Billing), RPT (Reporting), ADM (Admin & Config).

Conventions:

- A "directed pair" `A -> B` means module A needs an operation from
  module B's contract (A is consumer, B is provider).
- Payload fields cite the dictionary entry that defines them and the
  FR ids that require them.
- Error cases use the envelope and codes of
  `docs/technical/error-handling.md` (`VALIDATION_FAILED`,
  `NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `STATE_ILLEGAL`,
  `SETTLEMENT_REQUIRED`); this document names which code applies to
  which refusal and what the `details` must name, but defines no new
  codes.
- Per-hotel config values are the requirements section 3.1 items that must
  be visible wherever the pair's operations enforce them; storage and
  distribution mechanics are for the `architect`.
- Sync/async is a requirements-side recommendation (immediacy the
  desk flow needs) with its reason; transport choice is for the
  `architect`.

## 1. Desk-booking path (RES -> RATE, RES -> ROOM, RES -> GST)

Booking, modification, walk-in, and no-show marking (Seq-2..Seq-6,
UC-1..UC-5; BR-1..BR-10) need answers before the reservation record
can be created or changed.

### 1a. RES -> RATE (`PricingService`)

Operations needed:

- `CheckSellableCount` — sellable units for a room type and date
  range. Payload: room type, arrival and departure dates
  (Reservation: FR-RES-1; Room type: FR-RTE-2).
- `CheckRestrictions` — minimum-stay / closed-to-arrival days for
  the dates. Payload: room type, date range (Room type: FR-RTE-4).
- `QuotePrice` — nightly breakdown and rate plan in force for the
  room type and dates, with an optional named discount or special
  price. Payload: room type, date range, discount name where
  applicable (Price basis: FR-RTE-5, FR-RTE-1, FR-RTE-3).

Sync recommendation: synchronous request/response. Reason: the desk
flow refuses immediately with the cause named (Seq-2 restriction and
conflict branches; UC-1 extensions 3b/3c), and routine desk actions
complete within 3 seconds (NFR-PERF-1); an asynchronous round-trip
cannot deliver the refusal inside the booking step.

Error cases:

- Restriction violated: `STATE_ILLEGAL` naming the violated
  restriction (FR-RTE-4; BR-10).
- No sellable unit left, or a simultaneous booking won the last unit
  first: `CONFLICT` naming the room type and dates (NFR-CON-1;
  BR-8).
- Unknown room type or rate plan: `NOT_FOUND`.

Per-hotel config travelling with these calls: stay restrictions per
date range (FR-RTE-4); named discounts (FR-RTE-3); hotel
cancellation wording shown at booking (FR-CUS-2).

### 1b. RES -> ROOM (`RoomInventoryService`)

Operations needed:

- `CheckRoomTypeSellability` — whether the room type has a sellable
  unit for the dates, excluding occupied, blocked, and
  already-reserved rooms. Payload: room type, date range
  (Room: FR-RTE-2, FR-RMS-3; BR-9).

Sync recommendation: synchronous. Reason: same as 1a — the
refusal-with-conflict branch is part of the booking step (Seq-2,
Seq-3, Seq-6; NFR-CON-1), and the paired-booking guard resolves
exactly one winner (BR-8).

Error cases:

- No sellable unit left: `CONFLICT` naming room type and dates
  (NFR-CON-1).
- Blocked dates: refusal naming the block (FR-RMS-3; BR-12).

Per-hotel config: out-of-order reason lists are recorded per block
(FR-RMS-3); no hotel-wide values travel here beyond the block
records themselves.

### 1c. RES -> GST (`GuestService`)

Operations needed:

- `IdentifyGuest` — guest lookup returning the profile with stay
  history, returning flag, and past-stay count. Payload: guest
  identity/search keys (Guest: FR-GST-1, FR-GST-3).
- `GetBookingContext` — saved preferences and notes to show before
  confirmation. Payload: guest link (Guest: FR-GST-2).

Sync recommendation: synchronous. Reason: preferences and notes must
be shown before the booking is confirmed (FR-GST-2; Seq-2), and the
returning flag is visible at booking time (FR-GST-3); the booking
step waits for them.

Error cases: unknown guest: `NOT_FOUND`; missing hotel-mandatory
guest field at confirm time: `VALIDATION_FAILED` naming the missing
field (FR-CUS-1; BR-33) — enforced by RES, with the mandatory-field
set supplied as config (see section 6).

Per-hotel config: which guest details are mandatory at booking
(FR-CUS-1).

## 2. Check-in / stay path (STAY -> RES, STAY -> ROOM, STAY -> GST)

Check-in, room moves, arrivals/departures lists (Seq-7, Seq-8, UC-6,
UC-7; BR-16, BR-19, BR-20).

### 2a. STAY -> RES (`ReservationService`)

Operations needed:

- `GetDueReservation` — the confirmed reservation due for arrival,
  with dates, room type, guest link, and price basis. Payload:
  reservation reference (Reservation: FR-RES-1, FR-RTE-5; FR-FDK-5).

Sync recommendation: synchronous. Reason: check-in opens the
arrivals list and acts on the reservation in the same desk step
(Seq-7; NFR-PERF-1 3-second action bound).

Error cases: reservation not found or already checked-in/cancelled:
`NOT_FOUND` / `STATE_ILLEGAL` (BR-1 lifecycle order).

Per-hotel config: standard check-in/check-out times shown on the
lists (FR-CUS-2, FR-ADM-4).

### 2b. STAY -> ROOM (`RoomInventoryService`)

Operations needed:

- `FindReadyRoom` — a vacant, clean, inspected room of the booked
  type, with floor, bed type, capacity, and features for assignment.
  Payload: room type (Room, Room type: FR-FDK-1, FR-RMS-2,
  FR-RMS-4; BR-16, BR-30).
- `AssignRoom` — atomic assignment of the chosen room to the stay;
  exactly one of two simultaneous check-ins into the same room
  succeeds. Payload: room number, stay link (NFR-CON-2; BR-11).
- `ReleaseRoom` — old room becomes vacant and dirty on move or
  check-out. Payload: room number, new state, actor and timestamp
  (Stay: FR-FDK-2, FR-FDK-3; NFR-AUD-1).
- `RecordActualTimes` — early arrival / late departure kept on the
  stay. Payload: stay link, actual times (Stay: FR-FDK-4; BR-20).

Sync recommendation: synchronous, with `AssignRoom` atomic at the
provider. Reason: the double-assignment guard resolves exactly one
winner inside the check-in step (Seq-7; NFR-CON-2; BR-11); eventual
consistency cannot satisfy "exactly one check-in takes the room".

Error cases:

- Room just taken by a simultaneous check-in: `CONFLICT` naming the
  room (NFR-CON-2).
- Room not vacant/clean/inspected: `STATE_ILLEGAL` naming the room
  and its state (FR-FDK-1; BR-16, BR-28).
- Room blocked for the date: refusal naming the block (FR-RMS-3).

Per-hotel config: standard times (FR-CUS-2); room attributes used at
assignment are inventory data, not config (FR-RMS-4).

### 2c. STAY -> GST (`GuestService`)

Operations needed:

- `GetGuest` — profile and mandatory-field set for check-in
  enforcement. Payload: guest link (Guest: FR-GST-1; FR-CUS-1).

Sync recommendation: synchronous. Reason: missing-field refusal
blocks check-in inside the step (UC-6 extension 3a; FR-CUS-1).

Error cases: missing hotel-mandatory check-in field:
`VALIDATION_FAILED` naming the field (FR-CUS-1; BR-33).

Per-hotel config: which guest details are mandatory at check-in
(FR-CUS-1).

## 3. Check-out and folio path (STAY -> BIL, BIL -> STAY)

Folio review, settlement gate, invoice presentation (Seq-9, Seq-11,
UC-8; BR-17, BR-18, BR-21..BR-25).

### 3a. STAY -> BIL (`BillingService`)

Operations needed:

- `GetFolioBalance` — the stay's single folio with every charge and
  payment line and the running balance. Payload: stay link (Folio:
  FR-BIL-1).
- `RequestCheckoutGate` — whether the folio is settled (zero
  balance) or carries an authorised open-balance approval.
  Payload: stay link, folio balance, approval record where present
  (Folio: FR-BIL-7; BR-17).

Sync recommendation: synchronous. Reason: check-out is refused until
the folio is settled or approved (Seq-9; FR-BIL-7); the gate decision
is part of the check-out step.

Error cases:

- Open balance with neither payment nor authorised approval:
  `SETTLEMENT_REQUIRED` (FR-BIL-7; BR-17).
- No folio for the stay (must not happen — one folio per stay):
  `NOT_FOUND` (FR-BIL-1; BR-21).

Per-hotel config: whether approval is needed and which role may
approve (FR-BIL-7; requirements section 3.1).

### 3b. BIL -> STAY (`StayService`)

Operations needed:

- `GetStayRef` — the stay link a folio belongs to (guest, room,
  in-house state) so charges, payments, and the presented invoice
  attach to the right stay. Payload: stay reference (Stay, Folio:
  FR-BIL-2, FR-BIL-3, FR-BIL-4).

Sync recommendation: synchronous read. Reason: every folio line and
receipt matches its stay exactly (FR-BIL-4; BR-24); the folio cannot
be posted or presented against a stale stay reference.

Error cases: stay not in house or already closed: `STATE_ILLEGAL`
(BR-1; BR-18).

Per-hotel config: none beyond the stay record itself.

## 4. Charge, payment, and day-close operations (BIL owns; STAY consumes)

Charge posting, payment recording, receipts, day-close (Seq-10,
Seq-11, UC-9, UC-11 step 6; BR-22..BR-26).

Operations needed (all provided by `BillingService`, consumed at the
desk through the stay flow):

- `PostCharge` — nightly room charge or hotel-defined charge item;
  the line shows item, amount, posting time, with tax and fee amounts
  derived from the hotel's rules. Payload: stay link, item
  (nightly room charge or charge item), amount
  (Charge, Charge item: FR-BIL-2, FR-BIL-5, FR-CUS-3).
- `RecordPayment` — cash or card payment; balance decreases by the
  paid amount. Payload: folio link, method (cash or card), amount
  (Receipt: FR-BIL-3; BR-23).
- `ProduceInvoice` / `ProduceReceipt` — printed invoice matching the
  folio lines and balance exactly; each receipt matching one recorded
  payment. Payload: folio link, payment reference (Invoice, Receipt:
  FR-BIL-4; BR-24).
- `RunDayClose` — totals of charges and of payments per method for
  the business date, agreeing with the folios posted that day.
  Payload: business date (FR-BIL-6; BR-26).

Sync recommendation: synchronous. Reason: the desk posts, records,
and prints inside the folio step with immediate balance feedback
(Seq-10, Seq-11; NFR-PERF-1 3-second bound for charge posting and
payment recording); day-close totals must agree with the folios at
run time (FR-BIL-6).

Error cases:

- Item not defined by the hotel: refusal naming the item; folio
  unchanged (FR-BIL-2, FR-CUS-3; BR-22). Requirements-side code
  suggestion: `VALIDATION_FAILED`; final code choice belongs to the
  `architect` against `docs/technical/error-handling.md`.
- Payment method other than cash or card: refusal (FR-BIL-3;
  requirements section 3.2; BR-23) pending OQ-1.
- Day-close sign-off and balancing rules: undecided (OQ-3); until
  decided, totals without a sign-off step (BR-26).

Per-hotel config travelling with these calls: the hotel's charge
items with names and prices (FR-CUS-3); tax and fee rules
(FR-BIL-5); hotel identity and local settings printed on invoices
and receipts (FR-ADM-1).

## 5. Housekeeping loop (ROOM owns; STAY and RPT consume)

Cleaning progression and front-desk handoff (Seq-12, Seq-13, UC-10;
BR-28, BR-29).

Operations needed (provided by `RoomInventoryService`):

- `UpdateRoomState` — dirty to clean to inspected, each change with
  actor and timestamp. Payload: room number, new state, actor and
  timestamp (Room: FR-RMS-2; NFR-AUD-1).
- `ListRoomsByState` — live status of every room exactly once;
  rooms needing cleaning or inspection for the housekeeping report
  (inspected and out-of-order rooms excluded from the work list).
  Payload: state filter (Room: FR-RMS-1, FR-RPT-4).
- `BlockRoom` / `ReleaseBlock` — out-of-order block for a date range
  with recorded reason; release when the range ends. Payload: room
  number, date range, reason (Room: FR-RMS-3; NFR-AUD-1).

Sync recommendation: synchronous. Reason: check-out and room moves
release rooms as vacant-dirty inside their steps (Seq-12 first
arrow), and check-in assignment is offered only inspected vacant
rooms (FR-RMS-2; BR-28) — the handoff in both directions is part of
live desk steps.

Error cases:

- Illegal state transition (for example dirty straight to
  inspected): `STATE_ILLEGAL` (BR-28).
- Reservation or check-in attempted on a blocked date: refusal
  naming the block (FR-RMS-3; BR-12).
- Block of an occupied room: `STATE_ILLEGAL` (Seq-13
  precondition — the room is not occupied on the blocked dates).

Per-hotel config: block reason recorded per block (FR-RMS-3); the
dirty-to-clean-to-inspected order itself is fixed, never
configurable (Seq-14; BR-28).

## 6. Configuration and identity (ADM -> all consumers)

Hotel setup, users/roles, per-hotel customisation, export/backup
(Seq-14, UC-11, UC-12; BR-33..BR-42; requirements section 3.1–section 3.3).

### 6a. Config distribution (`AdminService` -> RES, STAY, RATE, BIL, GST, ROOM)

Operations needed:

- `GetHotelConfig` — the hotel's settings snapshot at module
  startup: identity and contact details; local settings (timezone,
  standard times, retention floor); required guest-field choices;
  cancellation wording and reason lists; no-show rule; open-balance
  approval rule; tax and fee rules. Payload fields per the Hotel
  entry (Hotel: FR-ADM-1, FR-CUS-1, FR-CUS-2, FR-BIL-5, FR-BIL-7).
- `ConfigChangedEvents` — async notification of any section 3.1 change so
  the desk works with the new setup at once with no restart and no
  technical assistance (requirements section 3.3).

Sync/async recommendation: synchronous read at startup plus
asynchronous change events afterwards. Reason: owning modules must
enforce current config inside live desk steps (refusals name the
missing field, restriction, or wording — FR-CUS-1, FR-RTE-4), so
they need the values locally; but owner/manager edits apply at once
(requirements section 3.3), so changes must propagate without restart.

Per-hotel config travelling here (the full section 3.1 set): required
guest fields (FR-CUS-1); standard times (FR-CUS-2, FR-ADM-4);
cancellation reasons and wording (FR-RES-3, FR-CUS-2); no-show rule
(FR-RES-6); open-balance approval rule (FR-BIL-7); charge items
(FR-CUS-3); taxes and fees (FR-BIL-5); restrictions (FR-RTE-4);
discounts (FR-RTE-3); retention floor (NFR-RET-1, FR-ADM-1).

Fixed items that must NOT travel as configurable (requirements
section 3.2): lifecycle order; one folio per stay; one property per
installation; the three roles; no event-driven automation; cash and
card only.

### 6b. Identity and RBAC (`AdminService` -> all modules)

Operations needed:

- `ValidateSession` / `CheckRole` — every call carries the acting
  user; each module enforces role checks; guests have no sign-in.
  (FR-ADM-2; NFR-SEC-1, NFR-SEC-2; BR-35, BR-42.)

Sync recommendation: synchronous enforcement on each call. Reason:
out-of-role attempts are refused at the point of use (UC-12
extension 3a; NFR-SEC-1); lockout after 5 consecutive wrong secrets
and 15-minute idle sign-out are session-liveness decisions
(NFR-SEC-2).

Error cases: out-of-role attempt: `FORBIDDEN` (NFR-SEC-1); locked or
signed-out session: authentication refusal (NFR-SEC-2) — exact code
belongs to the `architect`.

### 6c. Export and backup (ADM fans out to RES, STAY, BIL, GST, ROOM, RATE)

Operations needed:

- `CollectExportSlice` — each owning module contributes its
  complete records (reservations, stays, folios, payments, guest
  links, room and rate setup) for the on-premise export/backup copy;
  ADM assembles and reports success or failure with its time.
  Payload: property identity; record sets per the Property entry
  (Property: FR-ADM-5; NFR-BKP-1, NFR-BKP-2; BR-38).

Sync/async recommendation: asynchronous job with a visible
success-or-failure report. Reason: a full-property copy is not a
3-second desk action, but the owner must be able to tell a backup
worked without technical help (NFR-BKP-2).

Error cases: incomplete slice from any module: reported failure with
the missing scope named (FR-ADM-5; NFR-BKP-2).

## 7. Reporting feeds (all owning modules -> RPT)

Occupancy, revenue, daily sheet, housekeeping reports (Seq-1,
Seq-12, UC-10 steps 2/4, UC-12 step 6; BR-9; FR-RPT-1..FR-RPT-4).

Operations needed (RPT consumes; owning modules emit):

- `ReservationEvents` (RES) — created / modified / cancelled /
  no-show with dates, room type, guest link (FR-RPT-1, FR-RPT-3).
- `StayEvents` (STAY) — checked-in / moved / closed with room links
  and actual times (FR-RPT-1, FR-RPT-3).
- `RoomStateEvents` (ROOM) — state changes and blocks
  (FR-RPT-1, FR-RPT-4).
- `RateEvents` (RATE) — availability counts inputs per type and
  date (FR-RPT-1).
- `GuestEvents` (GST) — stay links for history and returning counts
  (FR-RPT-3 daily-sheet guest figures trace to stay links;
  FR-GST-1).
- `FolioEvents` (BIL) — posted charges and payments with methods
  (FR-RPT-2, FR-RPT-3).
- `ConfigChangedEvents` (ADM) — hotel identity, times, and wording
  printed on reports (FR-ADM-1).

Sync/async recommendation: asynchronous domain events into RPT's
own read model; RPT exposes a synchronous read API. Reason: the HLD
requires RPT to keep its own read model and never read other
modules' stores directly (hld.md [section 3](../architecture/hld.md)); reports complete within 5
seconds over two years of data (NFR-PERF-2), which tolerates a bounded
event lag but not cross-module fan-out reads at report time.

Error cases: none refuse at the desk — a lagging feed degrades
freshness, never blocks booking, check-in, or check-out. Staleness
handling is for the `architect` (see OQ-C1).

Per-hotel config: hotel identity and local settings for report
headers and local dates (FR-ADM-1; NFR-TZ-1 — every record carries
its UTC offset, every date renders on the hotel-local day).

## 8. Sync/async summary

| Directed pair(s) | Recommendation | Reason (requirements-side) |
|---|---|---|
| RES -> RATE; RES -> ROOM | Sync | Immediate refuse-with-reason inside the booking step (Seq-2/3/6); NFR-PERF-1 3 s; NFR-CON-1 exactly-one-winner |
| RES -> GST | Sync | Preferences/notes shown before confirm (FR-GST-2); returning flag at booking time (FR-GST-3) |
| STAY -> RES; STAY -> GST | Sync | Check-in acts on the reservation and guest record in one step (Seq-7; FR-CUS-1 refusal) |
| STAY -> ROOM (`AssignRoom`) | Sync, atomic at provider | NFR-CON-2 exactly-one-winner inside check-in; no eventual consistency |
| STAY -> BIL (gate) | Sync | Check-out refused until settled or approved (FR-BIL-7) |
| BIL -> STAY (stay ref) | Sync read | Folio lines and receipts match their stay exactly (FR-BIL-4) |
| BIL charge/payment/day-close | Sync | Immediate balance feedback in the folio step (Seq-10/11); NFR-PERF-1 3 s |
| ROOM state/list/block | Sync | Vacant-dirty release and inspected-only assignment are live desk handoffs (Seq-12; BR-28) |
| ADM -> all (config read) | Sync at startup | Refusals inside desk steps need current values locally (FR-CUS-1, FR-RTE-4) |
| ADM -> all (`ConfigChangedEvents`) | Async events | section 3.1 edits apply at once, no restart (requirements section 3.3) |
| ADM -> all (identity) | Sync per call | Refuse out-of-role at point of use (NFR-SEC-1) |
| All -> ADM (export slices) | Async job + visible report | Full copy is not a desk-speed action; owner-visible success/failure (NFR-BKP-2) |
| All -> RPT (domain events) | Async events; RPT read API sync | Own read model, never cross-reads (HLD [section 3](../architecture/hld.md)); 5 s report target tolerates bounded lag (NFR-PERF-2) |

## 9. Error cases named (index)

All codes are those of `docs/technical/error-handling.md`; the
`details` content each refusal must name is the requirements-side
need.

| Refusal | Code | `details` names | Trace |
|---|---|---|---|
| Missing hotel-mandatory guest field | `VALIDATION_FAILED` | the missing field | FR-CUS-1; BR-33 |
| Stay-restriction violation | `STATE_ILLEGAL` | the violated restriction | FR-RTE-4; BR-10 |
| No sellable unit / simultaneous booking won | `CONFLICT` | room type and dates | NFR-CON-1; BR-8 |
| Simultaneous check-in won the room | `CONFLICT` | the room | NFR-CON-2; BR-11 |
| Room not ready for assignment | `STATE_ILLEGAL` | room and its state | FR-FDK-1; BR-16 |
| Blocked-date reservation / check-in | refusal naming the block | the block | FR-RMS-3; BR-12 |
| Open balance, no payment or approval | `SETTLEMENT_REQUIRED` | — | FR-BIL-7; BR-17 |
| Out-of-role attempt | `FORBIDDEN` | — | NFR-SEC-1; BR-35 |
| Unknown entity (room type, reservation, guest, folio) | `NOT_FOUND` | the reference | guard completeness |
| Undefined charge item | (architect assigns; suggested `VALIDATION_FAILED`) | the item | FR-BIL-2, FR-CUS-3; BR-22 |
| Locked / signed-out session | (architect assigns) | — | NFR-SEC-2; BR-42 |

## 10. Open questions (where the FRs do not decide)

Product-numbered questions (requirements section 5) that touch these
needs:

- OQ-1 (payment methods beyond cash/card): decides the `RecordPayment`
  method enum and any new BIL validation branches. Until decided,
  cash and card only (BR-23, BR-27).
- OQ-2 (reason free text vs fixed list): decides the shape of the
  reason field travelling on cancel/modify calls. Until decided,
  cancellation requires a reason from the hotel's list (BR-7).
- OQ-3 (day-close balancing and sign-off): decides whether
  `RunDayClose` gains sign-off payload and balancing refusals.
  Until decided, totals without sign-off (BR-26).
- OQ-4 (undeletable guest fields, legal retention): decides purge
  rules on GST slices and export contents. Until decided, 24-month
  floor with hotel-configured retention (BR-34, BR-39).
- OQ-5 (operable backup story): decides who triggers export/backup
  and the report surface. Until decided, daily backups with visible
  success/failure (BR-38).

Contract-shape questions for the `architect` (no FR decides them;
listed, not answered, here):

- OQ-C1 — What is the maximum acceptable lag of RPT's event-built
  read model behind the owning stores (for example, may the daily
  sheet ever show yesterday's check-out as in house), and what does
  the desk do if a feed stalls?
- OQ-C2 — What delivery guarantee do `ConfigChangedEvents` carry
  (at-least-once with idempotent apply? ordering?), given section 3.3
  requires immediate effect with no restart?
- OQ-C3 — By what mechanism is the exactly-once assignment behind
  `AssignRoom` and the paired-booking guard achieved
  (NFR-CON-1/NFR-CON-2), given modules never share a store?
- OQ-C4 — Is identity enforced by validating every call against ADM
  or by a cached token with a bounded lifetime, given NFR-SEC-2 idle
  sign-out must take effect?
- OQ-C5 — What consistency snapshot do export slices represent when
  the desk keeps working during the run (FR-ADM-5 "complete copy")?
- OQ-C6 — If the hotel's no-show rule keeps a charge (FR-RES-6,
  requirements section 3.1), does marking no-show post to the folio — i.e.
  is there a conditional RES -> BIL operation — and against which
  folio, since no stay exists?

## 11. Coverage statement

Every HLD module boundary has its inbound and outbound needs listed:
RES (section 1, section 2a inbound), STAY (section 2, section 3), ROOM (section 1b, section 2b, section 5),
RATE (section 1a), GST (section 1c, section 2c), BIL (section 3, section 4), RPT (section 7), ADM (section 6).
All 43 FRs and the behaviour-constraining NFRs (NFR-CON-1,
NFR-CON-2, NFR-PERF-1, NFR-PERF-2, NFR-SEC-1, NFR-SEC-2, NFR-AUD-1,
NFR-AVL-1, NFR-DEP-1, NFR-BKP-1, NFR-BKP-2, NFR-RET-1, NFR-TZ-1)
that cross a module boundary are traced above; in-module behaviour
(room setup co-editing FR-ADM-3/FR-RMS-4, confirmation production
FR-GST-4, folio presentation FR-BIL-4) needs no contract beyond the
reads already listed. No operation, field, or error case introduces
behaviour beyond the mapped FRs. Later capabilities from
requirements section 6 carry no contract need here.

Counts: 8/8 HLD modules covered (7 consumer-facing pairs plus
config/identity/reporting/export fans); 6 contract open questions
(OQ-C1..OQ-C6) plus 5 product open questions (OQ-1..OQ-5) restated
where they touch the contracts.
