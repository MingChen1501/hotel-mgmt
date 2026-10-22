# Domain consistency audit — product vs requirements

Status: active. Business-analyst audit of domain consistency across
the product and requirements docs, owned by `business-analyst`.
Scope of this audit is issue #41 only: it checks pairs for
contradictions and gaps, deduplicates open questions, and fixes
terminology to one recommended term per concept. The audit itself
changes no other doc: every finding that requires a doc fix is
recorded in section 7 and left for follow-up issues.

Out of scope for this audit (per issue #41): architecture, ADRs,
stack, business numbers, and rewriting specs. No document under
`docs/architecture/` or `docs/technical/` was opened for this audit.

## Documents checked

| Doc | Path | Role |
|---|---|---|
| Scope | `docs/product/mvp-scope.md` | `product-owner` |
| PRD | `docs/product/prd.md` | `product-owner` |
| Roadmap | `docs/product/roadmap.md` | `product-owner` |
| Personas | `docs/product/personas.md` | `product-owner` |
| User stories | `docs/product/user-stories.md` | `product-owner` |
| MVP requirements | `docs/requirements/mvp-requirements.md` | `business-analyst` |

Method: every MVP capability in the scope (section 4) was traced to
the PRD capability map (section 5), to at least one user story, and
to at least one FR; every FR was traced back to a story or a stated
non-story reason; every NFR target was checked against
roadmap/scope wording; open questions were collected from all docs
and deduplicated; domain terms were compared across all six docs.

## 1. Coverage: scope capability → PRD map → story → FR

The scope carries 40 MVP capabilities. All 40 appear in the PRD
map, in at least one story, and in at least one FR. There are no
coverage gaps in the MVP: the gap column is empty by design and kept
so a future re-audit can reuse this table.

| # | Scope MVP capability | PRD map | Story | FR | Verdict |
|---|---|---|---|---|---|
| 1 | Create direct reservation | 5.1 MVP | US-RES-1 | FR-RES-1, FR-RTE-5 | Covered |
| 2 | Modify and cancel reservation | 5.1 MVP | US-RES-2, US-RES-3 | FR-RES-2, FR-RES-3 | Covered (one capability, two stories, two FRs) |
| 3 | Walk-in booking | 5.1 MVP | US-RES-4 | FR-RES-4 | Covered |
| 4 | Reservation calendar | 5.1 MVP | US-RES-5 | FR-RES-5 | Covered |
| 5 | No-show handling | 5.1 MVP | US-RES-6 | FR-RES-6 | Covered |
| 6 | Check-in | 5.2 MVP | US-FDK-1 | FR-FDK-1 | Covered |
| 7 | Check-out | 5.2 MVP | US-FDK-2 | FR-FDK-2, FR-BIL-7 | Covered |
| 8 | Room moves | 5.2 MVP | US-FDK-3 | FR-FDK-3 | Covered |
| 9 | Early check-in and late check-out | 5.2 MVP | US-FDK-4 | FR-FDK-4 | Covered |
| 10 | Arrivals and departures list | 5.2 MVP | US-FDK-5 | FR-FDK-5 | Covered |
| 11 | Room inventory with live status | 5.3 MVP | US-RMS-1 | FR-RMS-1 | Covered |
| 12 | Housekeeping status updates | 5.3 MVP | US-RMS-2 | FR-RMS-2 | Covered |
| 13 | Out-of-order and maintenance blocks | 5.3 MVP | US-RMS-3 | FR-RMS-3 | Covered |
| 14 | Room setup and attributes | 5.3 MVP | US-RMS-4 | FR-RMS-4 | Covered (role overlap noted, C-8) |
| 15 | Rate plans per room type | 5.4 MVP | US-RTE-1 | FR-RTE-1 | Covered |
| 16 | Availability overview | 5.4 MVP | US-RTE-2 | FR-RTE-2 | Covered |
| 17 | Manual discounts and special rates | 5.4 MVP | US-RTE-3 | FR-RTE-3 | Covered |
| 18 | Stay restrictions | 5.4 MVP | US-RTE-4 | FR-RTE-4 | Covered |
| 19 | (price basis of a reservation) | 5.1/5.4 MVP | US-RES-1, US-RTE-5 | FR-RTE-5 | Covered (capability rows 1 covers it; two stories share the FR; wording noted, T-6) |
| 20 | Guest profiles with stay history | 5.5 MVP | US-GST-1 | FR-GST-1 | Covered |
| 21 | Guest preferences and notes | 5.5 MVP | US-GST-2 | FR-GST-2 | Covered |
| 22 | Repeat-guest recognition | 5.5 MVP | US-GST-3 | FR-GST-3 | Covered |
| 23 | Booking confirmation record | 5.5 MVP | US-GST-4 | FR-GST-4 | Covered |
| 24 | Guest folio | 5.6 MVP | US-BIL-1 | FR-BIL-1 | Covered |
| 25 | Room and extra charges | 5.6 MVP | US-BIL-2 | FR-BIL-2 | Covered (term noted, T-5) |
| 26 | Payment recording | 5.6 MVP | US-BIL-3 | FR-BIL-3 | Covered |
| 27 | Invoice and receipt | 5.6 MVP | US-BIL-4 | FR-BIL-4 | Covered (term noted, C-6/T-3) |
| 28 | Configurable taxes and fees | 5.6 MVP | US-BIL-5 | FR-BIL-5 | Covered |
| 29 | Day-close totals | 5.6 MVP | US-BIL-6 | FR-BIL-6 | Covered |
| 30 | (settlement gate on check-out) | 5.2/5.6 MVP | US-FDK-2, US-BIL-7 | FR-BIL-7 | Covered (cross-domain story link, no standalone scope row) |
| 31 | Occupancy report | 5.7 MVP | US-RPT-1 | FR-RPT-1 | Covered |
| 32 | Revenue summary | 5.7 MVP | US-RPT-2 | FR-RPT-2 | Covered |
| 33 | Front-desk daily sheet | 5.7 MVP | US-RPT-3 | FR-RPT-3 | Covered |
| 34 | Housekeeping status report | 5.7 MVP | US-RPT-4 | FR-RPT-4 | Covered |
| 35 | Hotel profile setup | 5.8 MVP | US-ADM-1 | FR-ADM-1 | Covered |
| 36 | User accounts and roles | 5.8 MVP | US-ADM-2 | FR-ADM-2 | Covered |
| 37 | Room and room-type setup | 5.8 MVP | US-ADM-3 | FR-ADM-3 | Covered (role overlap noted, C-8) |
| 38 | Rate-plan and policy setup | 5.8 MVP | US-ADM-4 | FR-ADM-4 | Covered (overlap noted, C-9) |
| 39 | Data export and backup | 5.8 MVP | US-ADM-5 | FR-ADM-5 | Covered |
| 40 | Customisable required guest fields | 5.9 MVP | US-CUS-1 | FR-CUS-1 | Covered |
| 41 | Customisable stay policies | 5.9 MVP | US-CUS-2 | FR-CUS-2 | Covered (overlap noted, C-9) |
| 42 | Custom charge items | 5.9 MVP | US-CUS-3 | FR-CUS-3 | Covered |

Result: 40 MVP capabilities checked, 0 coverage gaps. Every one of
the 43 FRs (FR-RES-1 through FR-CUS-3) maps to at least one MVP
story; no FR needs a non-story reason because none is story-less.
The 8 Later stories (US-LATER-1 through US-LATER-8) correctly carry
an explicit no-matching-FR statement each.

## 2. NFR targets vs roadmap and scope wording

All 14 NFRs were checked against the roadmap and the scope. None
contradicts a roadmap or scope promise; three findings (C-4, C-5,
C-7) are recorded as contradictions in section 3 because the
conflict is with the PRD or the domain model, not with the roadmap.

| NFR | Target | Roadmap/scope wording | Verdict |
|---|---|---|---|
| NFR-DEP-1 | One installation serves exactly one property; 100% of sampled records belong to it | Scope section 2 (one on-premise instance per property); PRD non-goals and assumptions; roadmap Horizon 1 outcome | Consistent |
| NFR-BKP-1 | RPO at most 24h; scheduled backup succeeds at least 6 days out of 7 | Scope data-export-and-backup row plus success criteria; roadmap Horizon 1 administration milestone | Consistent (numeric targets are new here; nothing upstream promises otherwise) |
| NFR-BKP-2 | RTO at most 4h; 100% of backup runs produce a visible report | Same as above; personas P1 jobs require knowing success or failure | Consistent |
| NFR-AUD-1 | 100% of sampled changes carry an unaltered actor and timestamp; recording only, no on-screen view | Scope activity-and-audit-log row is Later; roadmap Horizon 2 states recording is already an MVP requirement and only the view is Next | Consistent |
| NFR-CON-1 | 0 double-bookings across paired simultaneous attempts | Personas P2 pains; PRD double-booking metric with direction zero | Consistent in intent; "or bed" wording contradicts the domain model (C-5) |
| NFR-CON-2 | 0 double assignments across paired simultaneous attempts | Same as above | Consistent |
| NFR-PERF-1 | 2s for named views; 3s for named actions | Roadmap and scope state no timing promises | Consistent with roadmap/scope; conflicts with the PRD success-metrics wording (C-4) |
| NFR-PERF-2 | 5s per standard report | Same as above | Same as above (C-4) |
| NFR-SEC-1 | 100% of out-of-role attempts refused; 0 guest sign-ins | Scope section 3 (guests are not system users); personas reach note; FR-ADM-2 | Consistent |
| NFR-SEC-2 | Lockout after 5 failures; sign-out after 15 idle minutes | Roadmap and scope are silent on authentication detail | Consistent (new measurable detail; no conflicting promise upstream) |
| NFR-RET-1 | 24 months minimum retrievable history; 0 records removed from within the floor | Scope guests-slice question on retention; PRD OQ-4 | Consistent in intent; OQ pointer is wrong (C-7) |
| NFR-TZ-1 | 100% of sampled records carry an offset and render on the correct local date | FR-ADM-1 local settings; scope local-settings wording | Consistent (elaboration, no conflict) |
| NFR-I18N-1 | 100% of user-visible strings from a catalogue; Vietnamese by catalogue content alone | Scope excludes multi-language operation; requirements section 6 excludes multi-language operation (readiness only) | Consistent |
| NFR-AVL-1 | 100% of named desk actions succeed with no outside connectivity | PRD assumption that the desk keeps working without internet; personas P2 offline note | Consistent |

## 3. Contradictions

Each item cites `file:line` on both sides and recommends a
resolution. Nothing was silently resolved: the other docs are
unchanged and the fixes are collected in section 7.

- C-1 (medium) — Wrong story count in the traceability summary.
  `docs/product/user-stories.md:319` claims "40 MVP stories trace
  to 40 MVP capabilities", but the document holds 43 MVP story
  bullets (`docs/product/user-stories.md:22-276`: 6 RES + 5 FDK +
  4 RMS + 5 RTE + 4 GST + 7 BIL + 4 RPT + 5 ADM + 3 CUS = 43)
  against 40 capabilities and 43 FRs. The extra stories come from
  a legitimate split (modify vs cancel: US-RES-2/US-RES-3) and a
  legitimate shared FR (FR-RTE-5 under US-RES-1 and US-RTE-5), so
  coverage is complete and only the sentence is wrong.
  Recommended resolution: correct the sentence to 43 MVP stories
  covering 40 capabilities and 43 FRs.
- C-2 (high) — Open-question numbers OQ-2 and OQ-4 are swapped
  between the PRD and the requirements.
  `docs/product/prd.md:316-324` defines OQ-2 as the reservation
  reason format and OQ-4 as guest-field deletion and retention,
  while `docs/requirements/mvp-requirements.md:562-571` defines
  OQ-2 as deletion and retention (with the legal-minimum
  retention period) and OQ-4 as the reason format. The stories
  use an explicit "PRD OQ-n" prefix
  (`docs/product/user-stories.md:34,40,151,185,201,256,275`) and
  are unambiguous, but any bare "OQ-2"/"OQ-4" reference is now
  ambiguous across the two docs.
  Recommended resolution: renumber the requirements list to the
  PRD numbers (canonical list in section 5 of this audit) or
  prefix every requirements reference as "PRD OQ-n"; never reuse
  bare OQ numbers with different meanings.
- C-3 (medium) — Open-question ownership differs.
  `docs/product/mvp-scope.md:230` and `docs/product/prd.md:310`
  state the open questions are owned by `product-owner`, while
  `docs/requirements/mvp-requirements.md:557` heads its list as
  "owned by `business-analyst`" for the same questions.
  Recommended resolution: `product-owner` owns each decision;
  `business-analyst` owns the requirements-wording impact once
  decided.
- C-4 (medium) — Performance targets vs deferred targets.
  `docs/product/prd.md:258-259` states the booking-time metric is
  recorded during the demo with "durations are recorded, not yet
  targeted", while `docs/requirements/mvp-requirements.md:395-407`
  already sets 2-second view, 3-second action (NFR-PERF-1) and
  5-second report (NFR-PERF-2) targets.
  Recommended resolution: either the PRD notes the NFR figures
  as initial bounds to be validated in trial operation, or the
  NFRs mark the figures provisional pending trial baselines.
- C-5 (medium) — "Room or bed" as a sellable unit.
  `docs/requirements/mvp-requirements.md:377` (NFR-CON-1) speaks
  of "booking the last sellable room or bed", but beds exist in
  the domain only as attributes of rooms and room types
  (`docs/requirements/mvp-requirements.md:137-139`,
  `docs/product/mvp-scope.md:102`, `docs/product/prd.md:121`);
  no capability, story, or FR sells a bed separately.
  Recommended resolution: delete "or bed" so the sellable unit
  is the room throughout.
- C-6 (low) — "Invoice" vs "bill" for the same artefact.
  `docs/requirements/mvp-requirements.md:225` titles FR-BIL-4
  "Invoice and receipt" but its body specifies a "printable
  bill" (`:225`) and "the printed bill" (`:228`); the scope row
  pairs "Invoice and receipt" with "a printable bill"
  (`docs/product/mvp-scope.md:134`); the story asks for "a
  printable bill and receipt"
  (`docs/product/user-stories.md:187-191`); the PRD map says
  "Invoice and receipt printing" (`docs/product/prd.md:153`).
  Recommended resolution: adopt the section 6 trio (folio,
  invoice, receipt) and reword FR-BIL-4, the scope row, and
  US-BIL-4 to it.
- C-7 (medium) — Wrong open-question pointer in NFR-RET-1.
  `docs/requirements/mvp-requirements.md:432` defers the legal
  minimum period to "open question OQ-2", which in PRD numbering
  is the reservation reason-format question, not retention
  (PRD OQ-4, `docs/product/prd.md:322-324`).
  Recommended resolution: repoint to the retention question once
  C-2 renumbering lands (single edit, same follow-up).
- C-8 (low) — Room-inventory editing granted to two roles without
  a stated division. `docs/requirements/mvp-requirements.md:296-300`
  (FR-ADM-3) lets the owner define rooms, room types, floors, and
  capacity, while `:136-141` (FR-RMS-4) lets the manager save
  floor, bed type, capacity, and features for the same objects,
  and `:287-294` (FR-ADM-2) summarises the manager as controlling
  "rates, rooms, and reports" and the owner as controlling "users
  and hotel setup".
  Recommended resolution: state that room inventory is
  co-editable by owner and manager (or name a primary) and align
  the FR-ADM-2 summary with that division.
- C-9 (low) — Standard-times setting reachable from two FRs.
  `docs/requirements/mvp-requirements.md:302-307` (FR-ADM-4, manager)
  and `:323-327` (FR-CUS-2, owner) both cover the hotel's
  check-in and check-out times.
  Recommended resolution: state one shared setting co-editable by
  owner and manager (consistent with personas, where the manager
  may be the owner in the smallest hotels:
  `docs/product/personas.md:96-97`).

## 4. Gaps

- G-1 — Waitlist has no roadmap horizon. Waitlist is Later in the
  scope (`docs/product/mvp-scope.md:80`), in the PRD map
  (`docs/product/prd.md:99`), and in the requirements
  no-FR list (`docs/requirements/mvp-requirements.md:581`), but
  neither Horizon 2 (`docs/product/roadmap.md:66-90`) nor
  Horizon 3 (`docs/product/roadmap.md:92-116`) mentions it, and
  no Later story covers it. Every other Later capability has at
  least a horizon or a story.
  Recommended resolution: assign waitlist to Horizon 2 or
  Horizon 3 in a roadmap follow-up.
- G-2 — Requirements open questions are a subset. The
  requirements list (`docs/requirements/mvp-requirements.md:557-576`)
  covers the equivalents of PRD OQ-1 through OQ-5 but has no
  counterpart for PRD OQ-6 (which variations become standard
  options, referenced by US-CUS-3 at
  `docs/product/user-stories.md:274-276`) or PRD OQ-7 (evidence
  of market parity). Both are product-owned decisions with no
  FR/NFR wording at stake.
  Recommended resolution: add a requirements-side note that OQ-6
  and OQ-7 are product-owned with no requirements impact, or
  record their requirements touchpoints if any appear.
- G-3 — Later-story sample reads as exhaustive but is not.
  `docs/product/user-stories.md:278-316` introduces 8 Later
  stories; 10 further Later capabilities have neither a story
  nor an FR (waitlist, express check-in, housekeeping task
  assignment, dynamic pricing, multi-currency rates, automated
  guest messaging, accounting integration, audit log view,
  folio layout, automated workflow rules).
  Recommended resolution: add one line stating section 10 is a
  non-exhaustive sample and that the absence of a Later story
  implies nothing.

## 5. Open questions (deduplicated, canonical PRD numbering)

One list replaces the three partial lists (7 unnumbered scope
bullets in `docs/product/mvp-scope.md:227-253`, PRD OQ-1..OQ-7 in
`docs/product/prd.md:308-333`, 5 requirements questions in
`docs/requirements/mvp-requirements.md:557-576`). Owner for each
decision is `product-owner` (see C-3); `business-analyst` owns the
requirements-wording impact once decided.

| ID | Question | Sources | Owner | Decide before |
|---|---|---|---|---|
| OQ-1 | Which payment methods beyond cash and card must payment recording support on day one (e.g. bank transfer, hotel credit)? | Scope; PRD; requirements; US-BIL-3; roadmap Horizon 2 | `product-owner` | Billing slice |
| OQ-2 | Free text, fixed list, or both for reservation change and cancellation reasons? | Scope; PRD; requirements (as its OQ-4); US-RES-2, US-RES-3 | `product-owner` | Reservations slice |
| OQ-3 | What does day-close mean for a hotel that never fully closes: which totals must balance and who signs them off? | Scope; PRD; requirements; US-BIL-6; roadmap Horizon 2 | `product-owner` | Billing slice |
| OQ-4 | Which guest fields, if any, must the system refuse to delete, and for how long are past stays kept (including any legal minimum beyond 24 months)? | Scope; PRD; requirements (as its OQ-2); US-GST-1; NFR-RET-1 | `product-owner` | Guests slice |
| OQ-5 | Minimum operable backup-and-restore story: who triggers a backup and how do they know it worked? | Scope; PRD; requirements; US-ADM-5; roadmap Horizon 2 | `product-owner` | Administration slice |
| OQ-6 | Which per-hotel variations observed in early hotels become standard options vs staying one-off customisation? | Scope; PRD; US-CUS-3 | `product-owner` | Customisation slice |
| OQ-7 | What evidence is enough to declare an MVP domain complete: owner walkthrough, trial operation in a real hotel, or both? | Scope; PRD | `product-owner` | First demo |

## 6. Terminology (one recommended term per concept)

- T-1 — reservation vs booking. Recommended: **reservation** for
  the stored record and its lifecycle (states, calendar, FR and
  story ids all use it); **booking** only for the act of creating
  one ("walk-in booking", "at booking time", "booking-time").
  Mismatch: `docs/product/user-stories.md:22-24` (US-RES-1: "record
  a reservation … so that the booking holds a room") uses
  "booking" for the record. The fixed artefact name "booking
  confirmation record" (scope, FR-GST-4) is kept as is.
- T-2 — room vs room type. Recommended: **room** for the physical
  sellable unit; **room type** for the priced category; **bed
  type** for an attribute only, never a sellable unit (see C-5).
  No "room category/class" occurrences were found; usage is
  otherwise disciplined across all six docs. No change needed
  beyond C-5.
- T-3 — folio vs bill vs invoice vs receipt. Recommended:
  **folio** for the running account per stay; **invoice** for the
  final printed bill presented at check-out; **receipt** for the
  proof of one payment; bare **bill** deprecated as a synonym.
  Mismatches: scope "one running bill per stay" (`:131`),
  "a printable bill" (`:134`), "printed bill and receipt"
  (`:174`), "bill and receipt" (`:218`); PRD "one running bill
  per stay" (`:150`); stories "a correct bill" (personas `:64`
  via P2 goals), "one running bill" (`:171-175`), "printable
  bill" (`:187-191`); requirements "final bill" (`:90`), "one
  running bill" (`:207-208`), FR-BIL-4 body (`:225-229`),
  "bills, and receipts" (`:284`), "appears on bills"
  (`:333`), "print bills" (`:458`).
- T-4 — guest vs customer. No mismatch found: **guest** is used
  uniformly across all six docs (zero occurrences of customer,
  visitor, or client as a domain term). Recommended term:
  **guest**. No change needed.
- T-5 — extra vs charge item. Recommended: **charge item** for the
  hotel-defined sellable entity (FR-CUS-3); **charge** for a
  posted folio line; **extra/extras** kept only as informal prose
  shorthand, never in FR-normative wording. FR-BIL-2 "extra
  items" (`:213-216`), FR-BIL-5-adjacent "billable extras"
  (scope `:173`; stories `:271-274`), and "hotel-defined extra"
  (scope `:216`; requirements `:216`) should converge on
  "charge item" in normative text.
- T-6 — price basis vs rate basis. Recommended: **price basis**
  (scope `:75`; PRD `:94`; FR-RES-1 `:34-38`; FR-RTE-5 title
  `:171`). Mismatch: US-RTE-5 "quoted rate basis"
  (`docs/product/user-stories.md:138-143`). Reword to
  "price basis".
- T-7 — hotel vs property. Recommended: **hotel** for the
  business and customer-facing settings; **property** only for
  deployment and data-isolation context (one property per
  installation; multi-property operation). Current usage already
  follows this split (scope section 2; NFR-DEP-1); keep it.
- T-8 — on-premise spelling. Recommended: **on-premise**
  everywhere (adjective and adverb). Mismatches: "written on
  premise" (`docs/product/user-stories.md:255`), "backup on
  premise" (`docs/product/prd.md:179`), "copies on premise"
  (`docs/product/mvp-scope.md:160`). "day-close" and "check-in /
  check in" (noun vs verb) are already used correctly and need
  no change.

## 7. Fix list (follow-up issues; no doc changed here)

| ID | Fix | Target doc(s) | From |
|---|---|---|---|
| F-1 | Correct the traceability summary to 43 MVP stories / 40 capabilities / 43 FRs | user-stories.md | C-1 |
| F-2 | Renumber requirements open questions to canonical PRD OQ-1..OQ-7 (section 5) and repoint NFR-RET-1 | mvp-requirements.md | C-2, C-7 |
| F-3 | Confirm decision ownership: `product-owner` decides, `business-analyst` words the impact | mvp-scope.md / prd.md / mvp-requirements.md headers | C-3 |
| F-4 | Reconcile PRD "not yet targeted" with NFR-PERF-1/2 figures (initial bounds vs provisional) | prd.md and/or mvp-requirements.md | C-4 |
| F-5 | Delete "or bed" from NFR-CON-1 | mvp-requirements.md | C-5 |
| F-6 | Reword FR-BIL-4, the scope invoice row, and US-BIL-4 to folio/invoice/receipt (T-3) | all three docs | C-6 |
| F-7 | State the owner/manager division for room inventory (FR-ADM-3 vs FR-RMS-4) and align FR-ADM-2 | mvp-requirements.md | C-8 |
| F-8 | State one shared check-in/check-out-times setting (FR-ADM-4 vs FR-CUS-2) | mvp-requirements.md | C-9 |
| F-9 | Assign waitlist to a roadmap horizon | roadmap.md | G-1 |
| F-10 | Note OQ-6/OQ-7 requirements impact (or explicit no-impact) | mvp-requirements.md | G-2 |
| F-11 | Mark the Later-story section as a non-exhaustive sample | user-stories.md | G-3 |
| F-12 | Apply terminology decisions T-1, T-3, T-5, T-6, T-8 to the flagged lines | scope, PRD, stories, requirements | T-1..T-8 |

## 8. Acceptance-criteria mapping (issue #41)

- AC1 — 40 MVP capabilities traced scope → PRD → story → FR in
  section 1; 0 gaps. All 43 FRs map to at least one story; all 14
  NFR targets checked against roadmap/scope wording in section 2.
- AC2 — every FR maps to a story (section 1, result paragraph);
  no non-story reason was needed.
- AC3 — 9 contradictions (C-1..C-9) listed with `file:line` on
  both sides plus a recommended resolution each; no doc edited.
- AC4 — 7 open questions deduplicated with owners and
  decide-before notes (section 5); 8 terminology concepts with
  one recommended term each (section 6).
- AC5 — this audit adds its row to `docs/README.md` as active;
  CI checks for this docs-only change are shell syntax, required
  paths, conflict markers, and secrets scans (no build/test
  targets exist for prose).

## 9. Counts

Capabilities checked: 40 (0 gaps). FRs mapped: 43/43 to stories.
NFRs checked: 14 (consistent with roadmap/scope; 3 carry
PRD/model-level findings). Contradictions: 9 (1 high, 5 medium,
3 low). Gaps: 3. Open questions deduplicated: 7. Terminology
decisions: 8 concepts.
