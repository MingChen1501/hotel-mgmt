# Product roadmap — small-hotel property management system

Status: active. Sequenced product direction for the hotel-mgmt
small-hotel PMS, owned by `product-owner`. Horizons are
quarter-neutral: they state order and outcomes, never calendar
dates. Capabilities repeat the verdicts of the MVP product scope
(`docs/product/mvp-scope.md`, active) and the PRD
(`docs/product/prd.md`, active); nothing new is scoped here. No
numbered requirements wording (owned by `business-analyst` in
`docs/requirements/`), no architecture content, no stack choice, no
pricing, and no market data appear in this document.

Owner correction 2026-10-22 (issue #30): architecture work is frozen
(ADR-0001 stays proposed) until the product picture is clear. The
roadmap, personas (`docs/product/personas.md`), and user stories
(`docs/product/user-stories.md`) are the corrective step that comes
first.

Superseded 2026-10-23 (issue #91): ADR-0001 was accepted (owner
acceptance "Option A" on #28, recorded as D-7 in
`docs/project/decision-log.md`). The freeze note above is historical
and no longer applies — architecture work proceeds under the accepted
direction. (Append-only note; the original wording is preserved.)

## Horizon 1 — MVP: the daily front-desk loop end to end

Outcome: one small hotel (under 50 rooms, one building, one
on-premise instance for one property) runs its whole day on one
shared record of reservations, rooms, guests, and money, operable by
the existing team with minimal training.

Capability milestones (all MVP per the scope, section 4):

- Reservations: direct reservations, modifications and
  cancellations with a recorded reason, walk-in bookings, the
  reservation calendar, and no-show handling.
- Front desk: check-in against a ready room, check-out with a
  settled folio, mid-stay room moves with history, early/late
  recording, and daily arrivals and departures lists.
- Rooms: live room inventory, housekeeping status updates
  (dirty, clean, inspected), out-of-order blocks with reason and
  date range, and room and room-type setup.
- Rates: rate plans per room type, season, and day; availability
  overview; named discounts; stay restrictions.
- Guests: profiles with stay history, preferences and notes
  visible at booking time, repeat-guest recognition, and a
  shareable booking confirmation record.
- Billing: one folio per stay, room and extra charges, cash and
  card payment recording, printable invoices and receipts,
  hotel-set taxes and fees, and day-close totals.
- Reporting: occupancy report, revenue summary, front-desk daily
  sheet, and housekeeping status report.
- Administration: hotel profile, user accounts for the three
  roles, room and room-type setup, rate-plan and policy setup,
  and on-premise data export and backup.
- Customisation without code changes: required guest fields,
  stay policies, and hotel-defined charge items.

Exit signal: the MVP success criteria in the scope (section 6)
hold on a demo instance — book, check in, move, check out,
housekeeping transitions, seasonal pricing, repeat-guest
recognition, folio with part-payments and matching prints,
agreeing reports, self-configuration, and single-property data
isolation.

Dependencies before implementation starts on each slice: the
requiring specs are written and marked `active` in
`docs/README.md`, and the `spec-reviewer` gate verdict is PASS
(see the `spec-gate` skill). The architecture direction is decided
(ADR-0001 accepted 2026-10-23); slices proceed through the spec
gate under that direction.

## Horizon 2 — Next: depth in payments, reporting, and per-hotel workflow

Outcome: hotels that run the MVP daily loop get fewer workarounds
where the MVP is thinnest — money handling, reporting depth, and
per-hotel variation — still within one property per installation.

Candidate capabilities (all Later per the scope; order within this
horizon is not decided):

- Payments: integrated payment processing and split and shared
  folios.
- Reporting depth: custom report builder and the on-screen
  activity and audit log view (recording of actor and timestamp
  is already an MVP requirement, `NFR-AUD-1`; only the view is
  Next).
- Per-hotel workflow variants: custom roles beyond the three
  defaults, customisable folio layout, automated workflow rules,
  and housekeeping task assignment.
- Guest contact: automated guest messaging.

Dependencies: Horizon 1 exit signal holds in trial operation;
the open product questions reused here (payment methods OQ-1,
day-close meaning OQ-3, backup story OQ-5 in the PRD, section
10) are decided before their slices; each slice passes the
spec gate before implementation.

## Horizon 3 — Later: commercial reach and multi-property operation

Outcome: the product grows beyond the single-property daily loop
toward demand-side tooling and chain operation — only if the MVP
and Horizon 2 prove the core record trustworthy.

Candidate capabilities (Later or out of scope for the MVP per the
scope, sections 4–5; order within this horizon is not decided):

- Commercial reach: guest self-service online booking, channel
  manager and OTA integration, express and self-service
  check-in, waitlist for unplaced demand, dynamic pricing and
  yield rules, multi-currency rates, loyalty programme and
  campaigns.
- Chain operation: multi-property management of any kind,
  cross-property and trend analytics, and a shared guest
  database across hotels.
- Back-office links: accounting-system integration and
  multi-language operation.

Dependencies: Horizon 2 outcomes hold; multi-property work
additionally depends on per-hotel customisation records from
MVP operation being available as design input (scope,
section 2). The former "frozen architecture decision revisited
and accepted" precondition is satisfied by the accepted
ADR-0001 (2026-10-23, D-7) — no fresh revisit is required;
chain implementation itself stays out of MVP scope and needs
its own issue and slice before any chain work merges.

## Explicit non-commitments

- No calendar dates, quarters, or deadlines are stated or
  implied anywhere in this roadmap; horizons are order only.
- Order within Horizon 2 and within Horizon 3 is not decided;
  rows are candidates, not a sequence.
- No Horizon 2 or Horizon 3 capability is promised to any
  hotel; each is re-scoped by `product-owner` when its horizon
  approaches.
- MVP exclusions stay excluded until re-scoped: OTA
  connectivity, guest self-service, multi-property operation,
  integrated payments, dynamic pricing, marketing automation,
  and multi-currency and multi-language operation (scope,
  section 5; PRD non-goals, section 8).

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-129
