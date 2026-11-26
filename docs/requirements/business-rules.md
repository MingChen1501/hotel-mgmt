# Business rules — small-hotel property management system

Status: active. Domain policies for the hotel-mgmt MVP gathered in
one place, owned by `business-analyst`. This document invents no new
policy: every rule traces to an existing FR/NFR, user story, PRD
statement, or sequence-diagram step, cited in the Trace column. Where
the sources leave a decision open, the rule points to an open question
in requirements section 5 (owned by `business-analyst` for requirements wording;
product decisions owned by `product-owner` per the
domain-consistency-audit canonical list). Terminology follows
`docs/requirements/domain-consistency-audit.md` (one term per
concept): **reservation** for the stored record, **room** for the
physical sellable unit, **folio** / **invoice** / **receipt** for the
running account / final printed account / proof of one payment,
**charge item** for a hotel-defined sellable entity and **charge** for
a posted folio line, **price basis** for what a reservation was quoted
from.

Rule ids take the form `BR-<n>`. "Staff" means any signed-in
front-desk staff, manager, or owner account acting within its access
(`FR-ADM-2`, `NFR-SEC-1`).

## 1. Reservation lifecycle

| ID | Rule | Trace |
|---|---|---|
| BR-1 | A reservation exists in exactly one state at a time: confirmed, checked-in, closed, cancelled, or no-show. The order confirmed to checked-in to closed is never skipped or reordered. | FR-RES-1, FR-FDK-1, FR-FDK-2; state-machine.md; requirements section 3.2 |
| BR-2 | A reservation can be modified (dates, room type, or guest) only before check-in. Every modification recalculates the quoted price from the rate plan in force and records who made the change and when. | FR-RES-2; NFR-AUD-1; US-RES-2 |
| BR-3 | A reservation can be cancelled only before check-in. Cancellation requires a reason from the hotel's own reason list; the reason is kept and the held availability is released for the cancelled dates. | FR-RES-3 (reason list, requirements section 3.1); US-RES-3 |
| BR-4 | The hotel's own cancellation wording is the wording shown at booking, cancellation, and on the guest confirmation. | FR-CUS-2; FR-GST-4; PRD Journey A |
| BR-5 | A reservation whose arrival date has passed without check-in can be marked no-show. Marking no-show follows the hotel's no-show rule (whether any charge is kept and which reason list applies), releases the held room for sale, and keeps the no-show in the reservation history. | FR-RES-6; requirements section 3.1; US-RES-6 |
| BR-6 | A same-day walk-in creates a reservation in the confirmed state, ready for immediate check-in, and places it on today's arrivals list. | FR-RES-4; FR-FDK-5; US-RES-4 |
| BR-7 | Whether the reservation reason is free text, a fixed list, or both is undecided. Until decided, a modification records the change and a cancellation requires a reason from the hotel's list. | OQ-2 (requirements section 5); FR-RES-2; FR-RES-3 |

## 2. Overbooking prevention and availability

| ID | Rule | Trace |
|---|---|---|
| BR-8 | Two staff booking the last sellable room for overlapping dates cannot both succeed: exactly one booking succeeds and the other is refused with the conflict named. The sellable unit is the room; beds are attributes of rooms and room types, never separately sellable. The ceiling the rule is decided on is the capacity the hotel records for the room type and dates, never a number a request carries (`BR-47`). | NFR-CON-1; US-RES-1; audit C-5 |
| BR-9 | Sellable availability for a room type and date excludes occupied rooms, out-of-order blocked rooms, and already-reserved rooms. | FR-RTE-2; FR-RMS-3; US-RTE-2 |
| BR-10 | A reservation that violates a minimum-stay or closed-to-arrival restriction on its dates is refused with the violated restriction named. | FR-RTE-4; US-RTE-4 |
| BR-11 | Two staff checking different guests into the same ready room at the same time cannot both succeed: exactly one check-in takes the room and the other is refused with the room conflict named. | NFR-CON-2; FR-FDK-1 |
| BR-12 | A room under an out-of-order or maintenance block for a date range takes no new reservation and no check-in on a blocked date. | FR-RMS-3; US-RMS-3 |
| BR-47 | The overbooking ceiling is the capacity the hotel records for the room type and the stay dates: a reservation is accepted only while the overlapping reservations that hold a unit number below the rooms the inventory records as sellable for those dates — the rooms of the type less the rooms blocked for those dates. The request's `sellableUnits` never raises or lowers that ceiling: a large value buys no extra booking and a low or absent value refuses nothing. When the recorded capacity is reached, the booking is refused with `CONFLICT` naming the room type and dates and nothing is written; a modification into sold-out dates or a sold-out type is refused the same way with the reservation unchanged. Cancelled, no-show, and closed reservations release their hold; a checked-in reservation keeps holding its unit as today. | FR-RES-1; FR-RES-2; FR-RTE-2; FR-OVB-1; FR-OVB-2; NFR-CON-1; BR-8; BR-9; `AC-OVB-1`; Refs #631 |
| BR-48 | The capacity the booking guard decides on is read from the room inventory on every attempt and is never taken from, cached for, or inferred from the request. An unreadable capacity source — transport failure, timeout, 5xx, unparseable reply, or an unwired client — refuses the booking fail-closed with `UPSTREAM_UNAVAILABLE` (503) naming the upstream and the operation, and nothing is written; no earlier read is reused for a later attempt. A provider 4xx envelope is surfaced unchanged. A recorded capacity of zero is a sold-out `CONFLICT`, never a 5xx: a sold-out type is not an outage. | FR-OVB-1..FR-OVB-3; NFR-CON-1; NFR-AVL-1; BR-46; `AC-OVB-2`; Refs #631 |
| BR-49 | The overbooking guard stays atomic: the capacity is read on the attempt and the count-and-insert comparison stays in one critical section, so two simultaneous last-unit requests yield exactly one winner and one `CONFLICT`, and an idempotent replay returns the original reservation without consuming a second unit. | FR-OVB-4; NFR-CON-1; BR-8; `AC-OVB-3`; Refs #631 |
| BR-67 | A room reads as sellable only when no block covers the range and its recorded state is neither `out-of-order` nor `occupied`. The aggregate sellability read counts, for a room type and date range, the rooms that are both block-free and in a sellable state, subtracting a room at most once so the count never goes below zero, while `totalCount` keeps every room of the type and `blockedRooms` keeps exactly the block-covered rooms in their order. The non-sellable state list is exactly those two names in code — every vacant state (`vacant-dirty`, `vacant-clean`, `vacant-inspected`) stays sellable, so a dirty room is still offered for a future stay — and both stores answer the same number. A single-room read on a block-free non-sellable room answers success with `totalCount: 1` and `sellableCount: 0` without claiming availability, while a block-covered room keeps today's `STATE_ILLEGAL` block refusal and its precedence over the state answer. Blocks, the state vocabulary, and every state-machine transition are unchanged: room state never adds a room to `blockedRooms`, and releasing a block returns a room to sale only when its state is sellable. The booking ceiling the #631 guard derives stays `totalCount - len(blockedRooms)` and reads neither the sellable count nor room state (ADR-0006 D2), and the state list is a fixed code rule, never a per-hotel setting. | FR-RTE-2; FR-RMS-1; FR-RMS-3; FR-SEL-1; FR-SEL-2; FR-SEL-3; FR-SEL-4; NFR-CON-1; BR-9; BR-12; BR-47; `AC-SEL-1`..`AC-SEL-4`; Refs #636 |

## 3. Price basis and rates

| ID | Rule | Trace |
|---|---|---|
| BR-13 | Every reservation carries the rate plan and price it was quoted from, with the nightly breakdown. A later rate change does not alter the quoted price unless staff explicitly recalculate it by modifying the reservation. | FR-RTE-5; FR-RES-1; FR-RES-2; US-RTE-5 |
| BR-14 | New reservations quote the nightly price the manager saved for that room type, season, and day. | FR-RTE-1; US-RTE-1 |
| BR-15 | A named discount or special price applied by the manager is kept by name on the reservation, and folio charges follow the adjusted price. | FR-RTE-3; US-RTE-3 |
| BR-44 | A nightly price covers exactly one night. A room type is open for booking on a night only when a price exists for that room type, rate plan, and night; a missing night is never priced by inference from a neighbouring night, a plan or season default, or zero, and the desk states the type as not open for booking for that date until a manager sets the night's price. | FR-RTE-1; FR-RTE-5; FR-RES-1; US-RTE-1; `AC-MANAGE-9`; #589 |
| BR-52 | The total and applied discount name a reservation freezes are the ones Pricing quotes for its effective room type, dates, and named discount when the booking is created or changed — never a total the caller supplies. A request's price basis is advisory input: a total that disagrees with that quote is refused and nothing is stored or repaired in place, and a quote that cannot be read refuses the booking rather than freezing an unverified total. A later rate change still does not alter a frozen total except by an explicit recalculation under `BR-2`/`BR-13`. | FR-RES-1; FR-RES-2; FR-RTE-5; FR-PRC-1..FR-PRC-5; `AC-PRC-1`..`AC-PRC-5`; #632 |
| BR-68 | Rates refuses an input it cannot honour instead of coercing, trusting, or storing it. A present `closedToArrival` must be JSON `true` or `false`; any other value is refused `VALIDATION_FAILED` naming the field, never coerced to `false`, while an omitted field keeps the contract default `false` and a stored `true` window still refuses an arrival inside its dates. A restriction binds only to a room type Pricing can price: a malformed `roomTypeId` is refused `VALIDATION_FAILED`, a well-formed one no rate price row mentions is refused `NOT_FOUND`, and neither stores a row nor emits a `restriction-changed` event, in both stores, because a window that matches nothing is worse than a refusal and a plan `defaultUnits` is not a price. The availability read's `totalUnits` is advisory only: it is shape-checked when present and never sets the count, which is the first plan in name order that prices the type and carries a `defaultUnits`, else `0` for a priced type, while a type no price row mentions refuses `NOT_FOUND` whether or not the field is present — the booking ceiling stays the one `BR-47` derives from the room inventory. A quote whose nightly sum, percent multiplication, or amount subtraction would leave the `int64` range refuses `STATE_ILLEGAL` naming `roomTypeId` with `reason: "total_overflow"` and serves no total and no partial night list, because the served total is the money the guest is charged; every non-overflowing quote stays byte-identical and no stored-price ceiling is added. Rate-plan `name` is bounded at 64 characters and `description` at 2 000 on write, and a present value of either that is not a string is refused naming the field; the bounds are code constants with no migration, backfill, truncation, or read-time re-validation. All five rules are fixed code rules, never per-hotel settings. | FR-RTE-1; FR-RTE-2; FR-RTE-4; FR-RTE-5; FR-RTE-6..FR-RTE-10; NFR-I18N-1; NFR-BND-1; BR-9; BR-10; BR-44; BR-47; BR-52; `AC-RTE-6`..`AC-RTE-10`; Refs #631, #632, #633 |

## 4. Check-in, stay, and check-out

| ID | Rule | Trace |
|---|---|---|
| BR-16 | Check-in requires a vacant, clean, inspected room of the booked type. On check-in the reservation becomes an in-house stay linked to the room, and the room state becomes occupied. | FR-FDK-1; FR-RMS-2; US-FDK-1 |
| BR-17 | Check-out with a non-zero folio balance is refused unless an authorised approval for the open balance is recorded against the folio. An approval counts only as the record of who approved, the role they hold, and when it was recorded, written through the open-balance approval operation; a free-form note standing in for that record is not an approval, and a record missing the identity or the recorded time, or naming a role outside the hotel's fixed three, does not count. The approval covers the open balance as it stands at check-out, and every route to the close re-reads that balance before committing. The balance and the approval the close decides on are the ones stored against the folio, never ones a request carries (`BR-46`). Whether approval is needed and which role may approve follows the hotel's open-balance rule. | FR-BIL-7; FR-FDK-2; requirements section 3.1; requirements section 3.2; US-BIL-7; Refs #588 |
| BR-18 | On check-out the stay is closed, the folio is presented as the final invoice, and the room the stay held becomes vacant and dirty. The close performs the release for that room, resolved from the room the stay held rather than retyped. The release runs only for a close that committed: a refused close, an already-closed stay, or a repeated request releases nothing. If the release cannot be confirmed, the close stands and the room stays owed a release, reported as such — a closed stay is never reopened and a room is never reported vacant before the room record says so. | FR-FDK-2; FR-BIL-4; US-FDK-2; Refs #588 |
| BR-19 | A guest can be moved to another vacant, clean, inspected room mid-stay. The stay links to the new room, the old room becomes vacant and dirty, and the move with both room numbers and its time is kept in the stay history. | FR-FDK-3; US-FDK-3 |
| BR-20 | Actual arrival and departure times falling outside the hotel's standard times are recorded against the stay and stay visible on the arrivals and departures lists. The hotel's own check-in and check-out times are the ones shown and enforced. | FR-FDK-4; FR-CUS-2; FR-ADM-4; US-FDK-4 |

## 5. Folio, settlement, and receipts

| ID | Rule | Trace |
|---|---|---|
| BR-21 | Each stay has exactly one running folio collecting room charges and charge items. Folios cannot be split across payers in the MVP. | FR-BIL-1; requirements section 3.2; US-BIL-1 |
| BR-22 | Only hotel-defined charge items can be posted to a folio. Each posted line shows the item, amount, and posting time, and increases the balance by the line amount. | FR-BIL-2; FR-CUS-3; US-BIL-2 |
| BR-23 | Cash and card are the only payment methods. Each recorded payment shows method and time and decreases the balance by the paid amount. | FR-BIL-3; requirements section 3.2; US-BIL-3 |
| BR-24 | The printed invoice matches the folio lines and balance exactly; each receipt matches one recorded payment. | FR-BIL-4; US-BIL-4 |
| BR-25 | Tax and fee amounts on folio lines derive from the hotel's tax and fee rules, and the balance includes them. | FR-BIL-5; US-BIL-5 |
| BR-26 | Day-close produces the totals of charges and of payments per method for the business date, and the totals agree with the folios posted that day. Which totals must balance and who signs them off is undecided. | FR-BIL-6; OQ-3 (requirements section 5); US-BIL-6 |
| BR-27 | Which payment methods beyond cash and card (for example bank transfer or hotel credit) payment recording must support on day one is undecided. Until decided, payment recording covers cash and card only. | OQ-1 (requirements section 5); FR-BIL-3 |
| BR-45 | A stay's room charge is posted once per stay, at the stay's own frozen quoted total, and never derived again from today's prices. The desk check-out posts it at its review step, before any balance is presented, so no folio closes carrying no room charge; a second room charge is never posted for the same stay, a stay quoted at zero is charged nothing, and a room charge that cannot be posted refuses the check-out instead of closing an uncharged folio. Whether the guest settled or the hotel approved the open balance stays the check-out gate's question, not the charge's. | FR-BIL-2; FR-BIL-7; FR-RTE-5; FR-CKP-1..FR-CKP-5; BR-13; BR-17; `AC-DSK-19`; Refs #600 |
| BR-46 | The check-out gate is decided on the folio the system holds, never on what a request asserts. The balance is the folio's stored balance, re-read when the close is attempted, and an approval counts only as the record stored against that folio — approver identity, a role from the hotel's fixed three, and the recorded time — while a balance or approval object supplied with the request is advisory input that decides nothing. The folio presented as the final invoice must be the folio the balance came from. A folio that cannot be read refuses the close instead of closing on an unverified balance, and every refusal leaves the stay in house with nothing released. Which role may approve, and whether approval is needed, stays the hotel's open-balance rule (`BR-17`). | FR-FDK-2; FR-BIL-7; FR-CKS-1..FR-CKS-5; BR-17; BR-21; requirements section 3.1; requirements section 3.2; `AC-CKO-1`; `AC-CKO-2`; Refs #601 |
| BR-50 | A folio is created, and a charge, a payment, or an open-balance approval recorded, only for a stay the system confirms exists and is in house at that moment. A stay id selects which stay a write is about; it never proves one. The stay's existence and lifecycle state are Stay's facts, read through the registered stay-reference read with the caller's session, before every folio write whether or not the folio already exists, and before a folio is created on a balance read. A stay that already carries a folio stays readable in every stay state, so the departure invoice and its receipts never depend on the stay still being in house. | FR-BIL-1; FR-FWV-1; FR-FWV-5; BR-21; `AC-FWV-4`; Refs #634 |
| BR-51 | A folio write for a stay that cannot be verified is refused and changes nothing: an unknown stay is refused as not found naming it, a stay outside in-house is refused naming it and its state — a charge, a payment, or an approval after departure is refused the same way, and the existing folio keeps every line and its balance — and a stay that cannot be read is refused as an upstream failure naming the upstream and the operation. No such refusal creates a folio row, a line, an approval, a balance movement, an idempotency record, or an outbox event, and a repeated request answers the same. An unreadable stay is never replaced by a cached or assumed state, and an approval recorded for an open balance does not permit a folio write after the stay leaves house. | FR-BIL-2; FR-BIL-3; FR-BIL-7; FR-FWV-1..FR-FWV-4; BR-24; BR-46; `AC-FWV-1`; `AC-FWV-2`; `AC-FWV-3`; Refs #634 |
| BR-61 | A money amount is a whole number of minor units carried as an integer and bounded by one declared ceiling — 1 000 000 000 000 minor units on every Billing money field (`amountMinor` on `PostCharge` and `RecordPayment`, `priceMinor` on `UpsertChargeItem`). A value that is not a whole number, or whose magnitude exceeds the ceiling, is refused with the shared envelope and `VALIDATION_FAILED` (400), `details` naming the field, and one plain catalogue sentence, in the adapter before any service, store, provider, or folio call runs: it is never truncated, nothing is written, and no idempotency record or outbox event is left. A whole amount at or inside the ceiling is served exactly as today, a whole value written with a decimal point (`12.0`) counts as whole, an absent field keeps the existing required-field refusal, and the existing sign rules (`amount_negative`, `amount_positive`, `price_negative`) and the tax-rule percent's 0–100 range stay where they are: the percent is bounded as a number, not as money. The ceiling is one constant in code, never configuration, and sits below 2<sup>53</sup> so every accepted amount round-trips exactly through JSON and the stored integer. | FR-BIL-2; FR-BIL-3; FR-BIL-5; `AC-AMT-1`..`AC-AMT-5`; Refs #635 |

## 6. Rooms and housekeeping

| ID | Rule | Trace |
|---|---|---|
| BR-28 | Room states advance dirty to clean to inspected as work completes; each change records who made it and when. Only a vacant, clean, inspected room is offered for check-in assignment. | FR-RMS-2; NFR-AUD-1; US-RMS-2 |
| BR-29 | A manager-set block takes a room out of sale for a recorded reason and date range; the room shows out of order for that range. | FR-RMS-3; US-RMS-3 |
| BR-30 | Floor, bed type, capacity, and features saved per room and room type appear in the room inventory and are available when assigning rooms at check-in. | FR-RMS-4; FR-ADM-3; US-RMS-4 |

## 7. Guests

| ID | Rule | Trace |
|---|---|---|
| BR-31 | One record per guest carries details with every past and upcoming stay linked to it. Saved preferences and notes are shown before a new booking for that guest is confirmed. | FR-GST-1; FR-GST-2; US-GST-1; US-GST-2 |
| BR-32 | A guest with at least one completed stay is flagged as returning at booking time, with the count of past stays visible. | FR-GST-3; US-GST-3 |
| BR-33 | Which guest details are mandatory at booking and at check-in is set per hotel. Confirming a booking or check-in without a mandatory field is refused and the missing field is named. | FR-CUS-1; requirements section 3.1; US-CUS-1 |
| BR-34 | Which guest fields, if any, the system must refuse to delete, and the legal minimum retention period if longer than the system floor, are undecided. | OQ-4 (requirements section 5); NFR-RET-1 |
| BR-63 | A guest identity lookup answers with a profile only when the name is unambiguous, and the guest write bounds what it stores. A name that matches exactly one guest returns that profile and its stay links; a name that matches no guest stays `NOT_FOUND`; a name that matches two or more guests is refused with the shared envelope and `VALIDATION_FAILED` (400), `details` naming `fullName` with the searched name and the match count and one plain catalogue sentence, before any profile, `contact`, `preferences`, `notes`, or stay link is assembled — the first matching row is never an answer, and every `guestId` read through `IdentifyGuest`, `GetGuest`, and `GetBookingContext` is unchanged. `contact` and `preferences` take one declared shape — a plain object of at most 16 fields, keys of 1–64 characters, values a string of at most 256 characters, a finite number, or a boolean, with no array, nested object, or `null` entry — and `notes` one declared length of 2 000 UTF-16 code units; a present value outside its bound is refused naming the field and the whole upsert writes no row, no stay link, and no outbox event, while an absent field keeps today's behaviour and a profile already holding a longer note or a differently shaped object still reads exactly as today with no re-validation, migration, backfill, or repair. The confirmation snapshot's `dates.checkIn` and `dates.checkOut` must be dates that exist on the calendar — `2024-02-29` accepted, `2026-02-31` and `2026-13-45` refused naming the field — with the date-order behaviour unchanged. Both bounds and the refusal are constants and rules in code, never an environment variable, deployment file, or per-hotel setting. On the Book screen's guest find the ambiguity reads as one plain sentence, resolves no guest, and never reads as the not-found or the generic request-failed sentence. | FR-GID-1; FR-GID-2; FR-GID-3; FR-GST-1; FR-GST-2; FR-GST-4; NFR-I18N-1; `AC-GID-1`..`AC-GID-6`; `AC-GID-7`; Refs #640 |

## 8. Roles, audit, and data protection

| ID | Rule | Trace |
|---|---|---|
| BR-35 | Exactly three roles exist: owner, manager, and front-desk staff. Front-desk staff operate the desk; the manager additionally controls rates, rooms, and reports; the owner additionally controls users and hotel setup. Guests have no sign-in. | FR-ADM-2; NFR-SEC-1; US-ADM-2 |
| BR-36 | Every creation, change, cancellation, state transition, charge, and payment records the acting user and timestamp, and the trail cannot be edited through normal use. Recording only: an on-screen audit log view is Later. | NFR-AUD-1; US-ADM-5 note |
| BR-37 | One installation serves exactly one hotel property: only that property's data can ever appear on any screen, report, or export. | NFR-DEP-1; FR-ADM-1 |
| BR-38 | Daily backups bound data loss to at most one operating day (RPO at most 24 hours); restore on equivalent on-premise hardware completes within half a working day (RTO at most 4 hours); every backup run reports plain success or failure with its time. | NFR-BKP-1; NFR-BKP-2; FR-ADM-5 |
| BR-39 | Closed stays, folios, payments, and their audit entries stay retrievable for at least 24 months in the live system, and records newer than the hotel's configured retention floor cannot be purged. | NFR-RET-1; FR-ADM-1 |
| BR-40 | Every timestamped record carries its UTC offset; every date shown or reported follows the hotel's local calendar day. | NFR-TZ-1; FR-ADM-1 |
| BR-43 | The business date has one canonical form and one display form. Stored, transmitted, validated, and day-close values stay ISO `YYYY-MM-DD`; the desk header renders the locale long-weekday form derived from the canonical value (VI weekday long plus `dd/MM/yyyy`, EN weekday long plus `MM/dd/yyyy`). No consumer parses the displayed string. | FR-DSK-11; FR-BIL-6; NFR-I18N-1; NFR-TZ-1; contracts/http/DailySheet.json |
| BR-41 | The desk keeps working through an internet outage: booking, check-in, check-out, charge posting, payment recording, and invoice printing all complete on the on-premise installation as when connected. | NFR-AVL-1; PRD assumptions |
| BR-42 | A wrong secret entered 5 times in a row locks the identity until the owner or manager unlocks it; a sign-in attempt against the locked identity is refused with `IDENTITY_LOCKED` (distinct from `UNAUTHENTICATED`). A session idle 15 minutes signs out. | NFR-SEC-2 |
| BR-59 | A failure the system did not plan for is reported as an internal fault, never as bad input from the person at the desk. `VALIDATION_FAILED` states that the caller's request or a field of it was wrong and keeps that meaning only; an unexpected exception — a store or driver failure, a wiring fault, or a crash — is answered with `INTERNAL_ERROR` (500) in the shared envelope, so the same meaning always carries the same token in every service that serves the desk. The answer keeps the envelope's four fields, reads as one plain catalogue sentence carrying no driver, SQL, host, path, or stack-trace text, and carries a correlation id, so no internal detail reaches the desk and support can trace the answer. The code vocabulary is the shared contract's single enum: a service answers no code the enum does not list, and every refusal the hotel already decided keeps its own code and status. | FR-ERR-1; FR-ERR-2; FR-ERR-3; `AC-ERR-1`; `AC-ERR-2`; `AC-ERR-3`; NFR-I18N-1; Refs #627 |
| BR-60 | Every backend service reads a request body under one declared ceiling, and every server bounds a stalled peer. A body above 65 536 bytes (64 KiB) is the caller's mistake, not a fault: it is refused with the shared envelope and `VALIDATION_FAILED` (400), `details` naming the field `body`, the plain `error.transport.body_too_large` sentence, and a fresh correlation id, while the body is read — before JSON parsing and before any store, provider, or folio call — so nothing is written, the surplus is never buffered in full, and one complete answer is sent instead of a partial one. The ceiling is one number declared in code in all eight services, never an environment variable, deployment file, or per-hotel setting, and it sits far above the largest request schema the contracts hold; a body at the ceiling is served and one byte more is refused. Every server also declares finite header-read, body-read, response-write, and idle bounds sized above the longest legitimate provider wait, so a peer that stalls cannot hold a worker, and a timeout frees the connection without promising a refusal. | NFR-BND-1; NFR-BND-2; NFR-BND-3; `AC-BND-1`..`AC-BND-5`; Refs #630 |
| BR-62 | A report window over `OccupancyReport` or `RevenueSummary` is bounded by one declared span cap of 730 nights between `dateFrom` and `dateTo` — 731 inclusive dates, the two-year window `NFR-PERF-2` documents and the same bound Rates already applies to a stay range. A window whose `dateTo` is more than 730 nights after `dateFrom` is refused with the shared envelope and `VALIDATION_FAILED` (400), `details` naming `dateTo`, and one plain catalogue sentence naming the bound, raised in `parseRange` before the store lock is taken and before any per-date loop runs, so the refused request walks no date and holds no mutex every other report read needs. A window at the cap returns exactly today's rows, a shorter window is served unchanged, a window with no data in range still returns its zero-filled dates, the cap is a span and not a data window, `DailySheet` (one business date) and `HousekeepingReport` (no range in its read) are untouched, and the cap is one constant in code, never an environment variable, deployment file, or per-hotel setting. | NFR-RPT-1; FR-RPT-1; FR-RPT-2; `AC-RPT-5`..`AC-RPT-7`; Refs #641 |
| BR-64 | A session-guarded Admin request is answered only after the session is checked, and one config write is checked against one per-key shape table. On `POST /v1/admin/<Operation>` other than `SignIn`, a missing token, or an invalid, expired, revoked, or signed-out token, or a session whose user no longer exists, is refused with the shared envelope and `UNAUTHENTICATED` (401) and the existing sentence before the body is read, so a malformed or oversized body never produces a parse error and its size, shape, and fields stay unobservable; a resolved session then reads the body, today's body refusals keep their sentences, and the front-desk `FORBIDDEN` (403) is reached only for a well-formed body, so the order is 401, then 400, then 403. `SignIn` keeps today's order in both directions, together with its lockout. In `UpdateHotelConfig`, a value for a table key must carry the declared shape, and the first offending key refuses the whole write with `VALIDATION_FAILED` (400), `details` naming that key, and one plain catalogue sentence, with nothing written — no key of that request and no `config.updated` entry — while a key outside the table is written as sent, a value at a boundary is stored and read back exactly as today, and both stores refuse the same values. The ordering, the shapes, and the sentences are rules and constants in code, never an owner setting, an environment variable, a deployment file, or a per-hotel entry. | FR-CFG-1; FR-CFG-2; FR-CFG-3; FR-ADM-1; FR-ADM-2; FR-ADM-4; FR-CUS-1; FR-CUS-2; NFR-SEC-2; NFR-BND-1; NFR-AUD-1; `AC-CFG-1`..`AC-CFG-5`; Refs #639 |
| BR-65 | The actor recorded on every audit trail is the authenticated session, never a value the request supplied. Every write that records an actor with its timestamp — Stay's `CheckIn`, `CheckOut`, `MoveRoom`, and `RecordActualTimes`; Guests' `UpsertGuest`; Rooms' `UpsertRoomType`, `UpsertRoom`, `UpdateRoomState`, `AssignRoom`, `ReleaseRoom`, `BlockRoom`, and `ReleaseBlock`; Reservations' `CreateReservation`, `CheckInReservation`, `CheckOutReservation`, `ModifyReservation`, `CancelReservation`, and `MarkNoShow`; Billing's `GetFolioBalance`, `PostCharge`, `RecordPayment`, `RecordOpenBalanceApproval`, `RunDayClose`, `ProduceInvoice`, `ProduceReceipt`, `UpsertChargeItem`, and `UpsertTaxFeeRule`; and Admin's `UpdateHotelConfig` — records the session the request authenticated: the resolved caller's `signinIdentity` where the service resolves a caller (Admin, including its config write), and otherwise the session token the request presented without the `Bearer ` prefix and trimmed, so one session records one identical string and a Stay close and the Reservations completion it forwards agree. The request's `actor` and `updatedBy` keep their contract shape, their required flag, and their existing refusals, and their value is never the recorded actor: where the write emits a JSON outbox payload a value that differs from the session actor is preserved additively as `requestActor`, a value that equals it or is absent where the service accepts its absence adds no key, and where the write records only a column the value is dropped with the row shape unchanged, so a disagreement is demoted rather than refused and every desk call keeps its status, stored effect, and answer. A missing, invalid, expired, revoked, or signed-out session is still refused 401 before any write, so the actor never falls back to the body; the Admin boot seed keeps its server-side `boot` actor; and a provider-to-provider call carries the caller's own session, so the forwarded `actor` is an annotation only. No error code, catalogue key, contract shape, schema, table, migration, backfill, or reader-visible desk change is added, historic rows keep the value they recorded, and token verification, HMAC, expiry, revocation, and role authorization are unchanged and out of scope; the rule is a fixed rule in code, never a per-hotel setting. | FR-SEC-1; FR-SEC-2; FR-SEC-3; FR-SEC-4; FR-ADM-1; FR-ADM-4; FR-DEP-1; FR-DEP-5; NFR-AUD-1; NFR-SEC-2; `AC-SEC-1`..`AC-SEC-5`; Refs #643 |

| BR-66 | A Reporting rebuild publishes only a fully replayed read model, and an aborted rebuild changes nothing the desk can read. A rebuild builds its candidate projection set — its own applied-event record, per-subscription offsets, as-of stamp, and projection maps — apart from the published one and installs it in one swap only after every event in the slice projects, so the published set changes exactly once, from one complete state to another. On the first event it cannot project, the rebuild discards the candidate and returns the same refusal it returns today — `VALIDATION_FAILED` naming the field with today's sentence — while the published projections, offsets, and as-of stamp keep their pre-rebuild values, so every report keeps serving the rows it served and a retry replays from the same offset record. A report read answers one complete set — the pre-rebuild set until the swap, the post-rebuild set after it — with the as-of stamp belonging to that same set, and is never refused for staleness or blocked for longer than the swap; a successful rebuild produces exactly today's rows, row order, zero-filled dates, revenue totals, daily-sheet groups, housekeeping list, and as-of stamp, and re-applying a replayed event stays a no-op. The failure is observable through the rebuild call's returned error, never through a read endpoint or a status field, and the rule is a fixed code rule, never an environment variable, deployment file, or per-hotel setting. | FR-RPT-1; FR-RPT-2; FR-RPT-3; FR-RPT-4; FR-RPT-5; FR-RPT-6; FR-RPT-7; NFR-PERF-1; NFR-PERF-2; NFR-RPT-1; `AC-RPT-8`..`AC-RPT-10`; Refs #642 |

### Config write shapes (BR-64)

The per-key table `UpdateHotelConfig` applies before its first write.
The rules are derived from the keys the Admin service already serves and
the payloads the tree already sends (the onboarding wizard, the
deployment apply after the config schema, and the existing config
tests), so no legitimate hotel setting is refused.

| Key | Declared shape | Refusal sentence |
|---|---|---|
| `name` | Non-empty text after trimming — today's rule, unchanged | `error.validation.field_required` (existing) |
| `timezone` | Non-empty text after trimming | `error.validation.config_text` (new) |
| `standardCheckinTime` | 24-hour `HH:MM` text — hours `00`-`23`, minutes `00`-`59` | `error.validation.config_time` (new) |
| `standardCheckoutTime` | The same 24-hour `HH:MM` rule | `error.validation.config_time` (new) |
| `requiredGuestFields` | An array with at least one entry; every entry is non-blank text after trimming; no two entries are equal after trimming | `error.validation.config_required_fields` (new) |
| `cancellationReasons` | An array whose every entry is non-blank text after trimming; the empty array is allowed because the seed already serves `[]` and a hotel may keep no reason list | `error.validation.config_list` (new) |
| `retentionFloorDays` | A whole number at or above 0 (the rule the Postgres store already applies, now both stores) | `error.validation.retention_floor` (existing) |
| `cancellationWording` | Text; the empty string is allowed | `error.validation.config_optional_text` (new) |
| `address` | Text; the empty string is allowed | `error.validation.config_optional_text` (new) |
| `phone` | Text; the empty string is allowed | `error.validation.config_optional_text` (new) |
| `email` | Text; the empty string is allowed | `error.validation.config_optional_text` (new) |

A key outside this table — for example `propertyCode`, `currency`,
`noshowRule`, `openBalanceCheckoutRule`, `chargeItems`,
`taxAndFeeRules`, `restrictions`, `discounts`, `ratePlans`, or
`roomTypes` — is written as sent exactly as today, because a full
config schema engine is out of scope. A refused write answers one
envelope with `details` `{"field": <key>}`, and the whole request is
refused: a valid key sent beside the offending one is not stored either.

## 9. Per-hotel configurable vs fixed split

Per requirements section 3. Configurable items change through the
hotel's settings with immediate effect and no code changes, each
change recording who made it and when (`NFR-AUD-1`, requirements
section 3.3). Fixed items no hotel may change in the MVP.

| Part | Configurable (control) | Fixed |
|---|---|---|
| Required guest fields | Which details are mandatory at booking and check-in (`BR-33`) | — |
| Standard times | The hotel's check-in and check-out times (`BR-20`) | — |
| Cancellation | Hotel reason list (`BR-3`); hotel wording (`BR-4`) | Cancel only before check-in |
| No-show | Whether any charge is kept; which reason list applies (`BR-5`) | Only past arrival date; history kept |
| Open-balance check-out | Whether approval is needed; which role may approve (`BR-17`) | Lifecycle order confirmed to checked-in to closed; an approval record carries who, the role, and when; the gate is decided on the folio's stored balance and approval, never on a request's claim (`BR-46`) |
| Charge items | The hotel's own items with names and prices (`BR-22`) | Only defined items postable; one folio per stay |
| Taxes and fees | The hotel's tax and fee rules (`BR-25`) | — |
| Stay restrictions | Minimum stay and closed-to-arrival days per date range (`BR-10`) | Violating reservations refused with the restriction named |
| Reservation availability | — (none) | The ceiling is the capacity the hotel records for the room type and dates, never the request's `sellableUnits`; a large or absent value changes nothing, and an unreadable capacity source refuses the booking (`BR-47`, `BR-48`) |
| Sellability state list | — (none) | The non-sellable room states are exactly `out-of-order` and `occupied`; every vacant state stays sellable, the state list is a fixed code rule, and the #631 ceiling reads `totalCount - blockedRooms`, never the sellable count or room state (`BR-67`) |
| Discounts | Named discounts the manager may apply (`BR-15`) | Applied discounts kept by name |
| Rate plans | Sellable prices per room type, season, day (`BR-14`) | Quoted price basis unchanged unless recalculated (`BR-13`); the frozen total is the quote Pricing returns for the type, dates, and discount (`BR-52`) |
| Rates input refusals | — (none) | `closedToArrival` must be a boolean; a restriction binds only to a room type Pricing prices; the availability read's `totalUnits` is advisory and the count is the plan default, else `0`; an overflowing quote refuses `details.reason` `total_overflow`; `name` is bounded at 64 and `description` at 2 000 characters on write (`BR-68`) |
| Out-of-order blocks | Reason and date range per block (`BR-29`) | Blocked dates take no reservation or check-in |
| Payment methods | — (none) | Cash and card only (`BR-23`) |
| Folio structure | — (none) | One folio per stay; no split across payers (`BR-21`) |
| Room-charge posting | — (none) | One room charge per stay, at the stay's frozen quoted total, posted by the desk check-out review (`BR-45`) |
| Report window span | — (none) | 730 nights between `dateFrom` and `dateTo` (731 inclusive dates), refused above it (`BR-62`) |
| Guest payload bounds | — (none) | One declared `contact`/`preferences` shape and one 2 000-code-unit `notes` bound, refused naming the field on write, and one calendar-valid check on the confirmation dates (`BR-63`) |
| Admin request ordering | — (none) | The session check precedes the body read on every operation except `SignIn`; an unauthenticated request is refused 401 before any parse refusal, and the role 403 follows a well-formed body (`BR-64`) |
| Config write shapes | The values of the configurable parts above (`FR-ADM-1`, `FR-ADM-4`, `FR-CUS-1`, `FR-CUS-2`) | One per-key shape table applied before the first write; a value outside its key's shape is refused naming the key with nothing written, and a key outside the table is written as sent (`BR-64`) |
| Audit actor provenance | — (none) | The recorded actor is the authenticated session — the resolved caller's `signinIdentity` where the service resolves one, otherwise the session token without the `Bearer ` prefix; the request's `actor`/`updatedBy` keeps its shape and refusals but is never the recorded value, appearing only as the additive `requestActor` annotation in a JSON outbox payload (`BR-65`) |
| Rebuild publication | — (none) | A Reporting rebuild publishes only a fully replayed read model in one swap; an aborted rebuild leaves the previously served projections, offsets, and as-of stamp intact and reports the failure through the rebuild call, never through a read, while a successful rebuild stays exactly today's output (`BR-66`) |
| Roles and access | — (none) | Three fixed roles with fixed reach (`BR-35`) |
| Automation | — (none) | No automatic status changes, reminders, or messages from lifecycle events |

## 10. Open questions (owned by `business-analyst` for requirements wording)

Canonical PRD numbering per the domain-consistency audit (section 5).
Product decisions owned by `product-owner`; `business-analyst` owns
the requirements-wording impact once decided. OQ-6 (which variations
become standard options) and OQ-7 (evidence of domain completeness)
are product-owned with no requirements wording at stake.

| ID | Question | Touched rules |
|---|---|---|
| OQ-1 | Which payment methods beyond cash and card must payment recording support on day one (e.g. bank transfer, hotel credit)? | BR-23, BR-27 |
| OQ-2 | Free text, fixed list, or both for reservation change and cancellation reasons? | BR-2, BR-3, BR-7 |
| OQ-3 | What does day-close mean for a hotel that never fully closes: which totals must balance and who signs them off? | BR-26 |
| OQ-4 | Which guest fields, if any, must the system refuse to delete, and for how long are past stays kept (including any legal minimum beyond 24 months)? | BR-34, BR-39 |
| OQ-5 | Minimum operable backup-and-restore story: who triggers a backup and how do they know it worked? | BR-38 |

## 11. Coverage statement

Every domain policy stated in `FR-CUS-*`, requirements section 3,
the PRD journeys and assumptions, and the sequence diagrams appears
exactly once above (BR-1..BR-43); BR-43 states the
canonical-vs-display boundary for the #503 business-date decision
(tracing `FR-DSK-11`, requirements section 12) without adding
behaviour beyond the traced FRs/NFRs, and BR-44 states the per-night
price granularity and the no-inference rule the #590 management
screen relies on (tracing `FR-RTE-1`, `FR-RTE-5`, and the #589
booking refusal) without adding behaviour beyond those sources, and
BR-45 states the once-per-stay room-charge obligation and its frozen
quoted total the #600 desk check-out relies on (tracing `FR-BIL-2`,
`FR-RTE-5`, `FR-CKP-1`..`FR-CKP-5`, and `AC-DSK-19`) without adding
behaviour beyond those sources, and BR-46 states where the check-out
gate's facts come from — the folio stored balance and the approval
recorded against it, never a request's claim — tracing `FR-BIL-7`,
`FR-FDK-2`, `FR-CKS-1`..`FR-CKS-5`, and `AC-CKO-1`/`AC-CKO-2`
without adding behaviour beyond those sources, and BR-50 states that a
stay id selects a stay but never proves one — a folio is created and a
folio write records only for a stay verified in house, while a folio
already held stays readable in every stay state — tracing `FR-BIL-1`,
`FR-FWV-1`, `FR-FWV-5`, and `AC-FWV-4`, and BR-51 states that an
unverifiable stay refuses the write and changes nothing, tracing
`FR-BIL-2`, `FR-BIL-3`, `FR-BIL-7`, `FR-FWV-1`..`FR-FWV-4`, and
`AC-FWV-1`..`AC-FWV-3`, neither adding behaviour beyond those sources,
and BR-52 states where the frozen price basis comes from — the Pricing
quote for the effective room type, dates, and discount, never the
request's total — tracing `FR-RES-1`, `FR-RES-2`, `FR-RTE-5`,
`FR-PRC-1`..`FR-PRC-5`, and `AC-PRC-1`..`AC-PRC-5` without adding
behaviour beyond those sources, and BR-59 states that a
failure the system did not plan for is reported as an internal fault and
never as bad input — `VALIDATION_FAILED` keeps meaning the caller's
request was wrong, the answer carries no internal descriptor, and the
shared contract enum stays the single vocabulary every service follows —
tracing `FR-ERR-1`..`FR-ERR-3` and `AC-ERR-1`..`AC-ERR-3`, without
adding behaviour beyond those sources, and BR-60 states the transport
obligation every service owes its caller — one declared 65 536-byte body
ceiling refused as the caller's mistake before parsing or any store,
provider, or folio call, one ceiling constant in code rather than
configuration, and finite header-read, body-read, response-write, and
idle bounds on every server — tracing `NFR-BND-1`..`NFR-BND-3` and
`AC-BND-1`..`AC-BND-5`, without adding behaviour beyond those sources,
and BR-47..BR-49 state the overbooking ceiling's source, its
fail-closed refusal, and its atomic shape (tracing `FR-OVB-1`..
`FR-OVB-4`, `NFR-CON-1`, and `AC-OVB-1`..`AC-OVB-3`), and BR-61 states
the money obligation every Billing money field owes its caller — a whole
number of minor units bounded by one declared 1 000 000 000 000-unit
ceiling, a fractional or over-ceiling value refused naming the field
before any service, store, provider, or folio call, one ceiling constant
in code rather than configuration, and the percent bounded as a number
while the sign rules stay where they are — tracing `FR-BIL-2`,
`FR-BIL-3`, `FR-BIL-5`, and `AC-AMT-1`..`AC-AMT-5`, without adding
behaviour beyond those sources, and BR-62 states the report-window
obligation every range report owes its caller — one declared 730-night
span cap (731 inclusive dates), a wider window refused naming `dateTo`
with the shared envelope and `VALIDATION_FAILED` before the store lock
and before any per-date walk, a window at the cap served exactly as
today, the cap a constant in code rather than configuration, and
`DailySheet` and `HousekeepingReport` untouched — tracing `NFR-RPT-1`,
`FR-RPT-1`, `FR-RPT-2`, and `AC-RPT-5`..`AC-RPT-7`, without adding
behaviour beyond those sources, and BR-63 states the guest-identity
obligation the guest read and the guest write owe their caller — a name
lookup answers only when the name is unambiguous, an ambiguous name
refused naming `fullName` with the shared envelope and
`VALIDATION_FAILED` before any profile is assembled, the
`contact`/`preferences` shape and the `notes` length bounded on write
with a refusal that writes nothing, a read never re-validated or
migrated, and the confirmation snapshot's two dates required to exist
on the calendar — tracing `FR-GID-1`..`FR-GID-3`, `FR-GST-1`,
`FR-GST-2`, `FR-GST-4`, `NFR-I18N-1`, and `AC-GID-1`..`AC-GID-6` plus
`AC-GID-7`, without adding behaviour beyond those sources, and BR-64
states the administration obligation the existing settings operations
owe their caller — the session check before the body read on every
operation except `SignIn`, so an unauthenticated request answers 401
ahead of every body or field refusal and the role 403 follows a
well-formed body, and one per-key shape table on the config write that
refuses the whole request naming the key with nothing written while a
key outside the table is written as sent — tracing `FR-CFG-1`..
`FR-CFG-3`, `FR-ADM-1`, `FR-ADM-2`, `FR-ADM-4`, `FR-CUS-1`,
`FR-CUS-2`, `NFR-SEC-2`, `NFR-BND-1`, `NFR-AUD-1`, and
`AC-CFG-1`..`AC-CFG-5`, without adding behaviour beyond those sources,
and BR-65 states the audit-actor provenance obligation every audited
write owes the trail — the recorded actor is the authenticated session
rather than the request's string, the request value demoted to the
additive `requestActor` annotation instead of a refusal, the Admin config
write recording the resolved caller's identity, and every recorded shape
additive with no migration, backfill, or reader-visible desk change —
tracing `FR-SEC-1`..`FR-SEC-4`, `FR-ADM-1`, `FR-ADM-4`, `FR-DEP-1`,
`FR-DEP-5`, `NFR-AUD-1`, `NFR-SEC-2`, and `AC-SEC-1`..`AC-SEC-5`,
without adding behaviour beyond those sources, and BR-66 states the
reporting read-model obligation a rebuild owes the desk — only a fully
replayed projection set is published, in one swap, an aborted rebuild
leaves the last good set with its offsets and as-of stamp in place and
reports through the returned refusal rather than a read, a report read
answers one complete set without a staleness refusal, and a successful
rebuild stays exactly today's output — tracing `FR-RPT-1`..`FR-RPT-7`,
`NFR-PERF-1`, `NFR-PERF-2`, `NFR-RPT-1`, and
`AC-RPT-8`..`AC-RPT-10`, without adding behaviour beyond those sources,
and BR-67 states the sellability-state obligation the availability read
owes the desk — a room is sellable only when no block covers the range
and its recorded state is neither `out-of-order` nor `occupied`, the
aggregate count subtracts each room once while `totalCount` and
`blockedRooms` keep their meaning, every vacant state stays sellable, a
block-free non-sellable single room answers `sellableCount: 0` without
claiming availability, a block-covered room keeps the `STATE_ILLEGAL`
refusal and its precedence, blocks and the state vocabulary are
unchanged, and the #631 ceiling keeps reading `totalCount` and
`blockedRooms` only — tracing `FR-RTE-2`, `FR-RMS-1`, `FR-RMS-3`,
`FR-SEL-1`..`FR-SEL-4`, `NFR-CON-1`, and
`AC-SEL-1`..`AC-SEL-4`, without adding behaviour beyond those sources,
and BR-68 states the fail-closed input obligation the four Rates
operations owe their callers — a present `closedToArrival` is a boolean
or the write is refused naming the field, a restriction binds only to a
room type Pricing prices with nothing stored otherwise, the availability
read's `totalUnits` is advisory and never sets a count while an unpriced
type refuses `NOT_FOUND`, a quote that would overflow refuses
`STATE_ILLEGAL` naming `roomTypeId` with `details.reason` `total_overflow`
and serves no total, and rate-plan `name` and `description` carry one
declared bound each with a non-string refused — tracing `FR-RTE-1`,
`FR-RTE-2`, `FR-RTE-4`, `FR-RTE-5`, `FR-RTE-6`..`FR-RTE-10`,
`NFR-I18N-1`, `NFR-BND-1`, and `AC-RTE-6`..`AC-RTE-10` plus the #631
ceiling and the #632 price basis, without adding behaviour beyond those
sources.
Policies with no decided source appear as open questions
OQ-1..OQ-5. No rule introduces behaviour beyond the traced
FRs/NFRs/stories. Later capabilities from requirements section 6
(waitlist, split folios, integrated payments, automated workflow
rules, multi-property operation, and the rest) carry no rule here.

Counts: 62 business rules, 5 open questions.

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-1079

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-934

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-1116

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-1129

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-1174

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-1206

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-1215

<!-- ao-role: business-analyst -->
Role: business-analyst · AO session hotel-mgmt-1247
