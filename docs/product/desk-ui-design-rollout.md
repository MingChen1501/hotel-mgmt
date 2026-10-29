# Desk UI design rollout — six-screen Claude UI (Refs #419)

Status: active. Product-owner rollout spec for the owner-supplied
Claude desk UI design, owned by `product-owner` (Closes #419).
Proposed tier T2 (reader-visible UI change across six screens; no
new subsystem, no data-model change, no refusal-semantics change).
This document sets scope, the per-screen breakdown, the shared
design tokens, the T2 UI contract section, and the acceptance
conditions; the matching Given/When/Then done-conditions live in
`docs/product/acceptance-criteria.md` [section 11](acceptance-criteria.md).
FR/NFR wording is owned by `business-analyst`, flow diagrams and
technical design by `architect`, and guard mapping by `qa-lead`
(section 8 points at each landed handoff without repeating it).

## 1. Scope in / out

In:

- All six screens per the supplied design with the shared tokens
  in section 3: Main desk board, Stay check-in/out, Onboarding
  setup wizard, Rooms visual map, Book, Folio.
- The new VI strings the screens need, added through the normal
  catalogue process with `script/catalogue-coverage-check.sh`
  green (section 7).
- Tracking the six per-screen sub-issues to done
  (#420–#425, section 2).

Out:

- Print, admin, and gate/sign-in screens (not in this design
  batch; they keep their current presentation and stay
  reachable).
- Catalogue restructuring (new keys only, same key shape).
- Backend or API changes beyond what the screens need; anything
  discovered is filed as a follow-up, never snuck into a
  restyle PR.

## 2. Per-screen breakdown

One small task and one PR per screen, in any order except where
noted. The design files below are the owner-supplied static HTML
screens plus the canvas manifest (workspace-local copies from the
owner request); each implementation PR is reviewed against its
design file. Where the design conflicts with the #412 journey
record, the design wins and the conflict is recorded on the
affected sub-issue with the owner decision (section 6).

| # | Screen | Design file | Sub-issue | Size | Risk | Notes |
|---|---|---|---|---|---|---|
| 1 | Main desk board | Main desk board (Bang le tan) | #420 | M | risk-low | Restyle of the existing desk screen, plus the two housekeeping clean/inspect buttons on the rooms-to-clean card (fills the #412 QA housekeeping gap). |
| 2 | Stay check-in/out | Stay check-in/out (Nhan phong) | #422 | M | risk-low | Restyle plus one behaviour-relevant detail: the room select defaults to an explicit empty placeholder with a hint, so staff pick a ready room first (resolves #411; never a phantom selection). Checkout stays gated on a fully-paid folio. |
| 3 | Onboarding setup wizard | 4-step first-run setup (Thiet lap lan dau) | #425 | M | risk-medium | New screen and new feature: a guided first-run wizard addressing the empty-database path from the #412 QA findings. Step 1 (hotel-name input with example placeholder, invoice/receipt helper, 25 percent progress bar, continue action) shipped in PR #437; steps 2–4 are specified in section 10 (Refs #438). Gated to launch on empty database only. |
| 4 | Rooms visual map | Rooms visual map (So do phong) | #424 | M | risk-medium | New screen: floor-grouped visual map (18 rooms across 3 floors in the design) with a status-chip summary row and per-room cards. The static design shows only a refresh action and no per-card buttons, so action placement needs a product-owner decision before building; no actions are invented. |
| 5 | Book | Book screen (Dat phong) | #421 | S | risk-low | Restyle only; the booking flow itself is unchanged. |
| 6 | Folio | Folio screen (Hoa don) | #423 | S | risk-low | Restyle only; folio logic is unchanged. |

Sequencing: the four restyles (#420–#423) are independent of each
other. The Rooms map (#424) should land after the Main board
(#420) so the two housekeeping surfaces agree on status wording.
The Onboarding wizard shipped step 1 first (PR #437) with steps
2–4 explicitly deferred; the steps 2–4 decision is recorded in
section 10 (Refs #438) and the steps 2–4 implementation follows
it in one small task and one PR.

## 3. Shared design tokens

Every screen uses exactly these tokens; a token or layout mistake
propagates into every follow-up, so token changes land in one
place and all six screens pick them up together:

- Header teal `#0F4C47`; primary buttons `#0F766E`.
- Background `#F4F6F5`; ink `#1B2B2A`.
- Minimum touch/keyboard target 44px on every interactive
  element.
- Card radius 12px.
- VI-primary copy throughout (section 7); the hotel name in the
  design is example content and must stay configurable, never
  hardcoded.
- One shared shell owns the top nav tabs plus the locale toggle
  on all six screens (section 4).

## 4. UI contract (T2 reader-visible UI change)

### 4.1 Layout shell and navigation scope

- One shell wraps all six screens: teal header carrying the
  configurable hotel name, top nav tabs, locale toggle
  (EN/VI), and the existing sign-in gate behaviour unchanged.
- Nav tabs follow the canvas-manifest order — Main, Stay,
  Onboarding, Rooms, Book, Folio — with the active screen
  highlighted so staff always know where they are. Print and
  admin destinations stay reachable as today; they are out of
  the restyle batch and keep their current presentation.
- Onboarding is reachable from the nav but launches
  unprompted only on an empty database; it never interrupts a
  seeded desk.

### 4.2 Component mapping per pattern

- Cards: 12px radius, one idea per card matching the design
  groupings (e.g. Book keeps guest card above quote card on the
  left; dates/room/discount card on the right).
- Status chips: one chip vocabulary shared by the Main board
  and the Rooms map — ready, occupied, needs-cleaning,
  awaiting-inspection, out-of-service — with identical wording
  and colour meaning on both surfaces.
- Forms keep their existing fields, order, and actions; only
  presentation changes, except the Stay room-select placeholder
  (section 2, row 2).
- Per-room cards on the Rooms map show status chip, room type,
  and one note line: occupant plus checkout date, out-of-service
  reason plus date, or upcoming arrival.

### 4.3 Design-token scope

Section 3 is the complete token set. No per-screen colour,
radius, or target-size deviations; a screen that needs one
files it as a follow-up instead of forking a token.

### 4.4 States in plain words

Every screen states loading, empty, error, and refusal cases as
non-technical sentences naming what is happening and the next
step, reusing the `FR-DSP-3` plain-words rule from the #338
styling pass:

- Loading names the affected region while the rest stays
  visible; repeat-write buttons stay disabled until the call
  returns.
- Every list has an explicit empty state (e.g. departures
  empty state on the Main board; no-arrivals hint in Stay).
- Errors never surface technical codes.
- Refusals keep their existing conditions — check-in stays
  blocked until a ready room is chosen; checkout stays blocked
  on an unsettled folio without approval — only the wording is
  stand-in readable.

### 4.5 Print rules

Screen styling does not leak into print: receipts, invoices,
and confirmations print exactly as today (the `FR-DSP-4`
preservation rule holds), and the configured hotel name
appears on every printed document.

## 5. Acceptance criteria summary

The binding done-conditions are `AC-DSK-1` through `AC-DSK-11`
in `docs/product/acceptance-criteria.md` [section 11](acceptance-criteria.md)
(`AC-DSK-9`..`AC-DSK-11` cover the steps 2–4 follow-up, Refs
#438; see section 10).
In short: shared shell/tokens/nav/locale behave identically on
all six screens; each screen matches its design file closely
enough for a reviewer to check it card by card; the Stay
placeholder blocks check-in until a ready room is chosen;
checkout still requires a settled folio; Rooms summary counts
always match the rendered cards; the wizard launches on empty
database only and the configured hotel name surfaces across
desk and folio; all copy comes from the VI-primary catalogue.

## 6. Conflict rule with #412

#412 stays the journey/spec record. Where this design conflicts
with it, the design wins, and each conflict found during
implementation is recorded on the affected sub-issue with the
owner decision — never silently, never in a code comment only.
Known candidate touchpoints (not pre-decided conflicts): the Stay
placeholder wording against the J1/S3 wireframe hint text, and
the Rooms-map action placement against the J2 inline-action
rule.

## 7. Catalogue and locale rule

- Single source of truth stays `messages/` (`messages/README.md`):
  every user-visible string resolves through `t()`; behaviour
  switches on envelope codes, never on wording.
- The pilot desk is VI-primary: new or changed copy ships in
  both `messages/vi.json` and `messages/en.json` with
  `{param}` placeholders intact, and
  `script/catalogue-coverage-check.sh` is green on every
  screen PR.
- New keys this rollout implies (land through the normal
  catalogue process, none added here):
  `desk.rooms.*` (map summary chips and card notes),
  `desk.onboarding.*` (wizard steps, placeholders, helper
  text), `stay.checkin.room_placeholder` and hint (already
  named in the #412 record), `desk.empty.*` per-list empty
  states where the design needs one with no key yet.
- The hotel name is configuration (persisted through the
  existing hotel-configuration surface, `FR-ADM-1`), shown in
  the shell header and on printed documents; the design's hotel
  name is example content only.

## 8. Spec handoffs (landed)

Each owning role's slice has landed on `master` and is referenced
here by section, not repeated:

- `business-analyst`: FR/NFR delta in
  `docs/requirements/mvp-requirements.md` section 10 ("Desk UI
  design rollout (Refs #419)"): `FR-DSK-1`..`FR-DSK-7` plus
  `NFR-DSK-1`..`NFR-DSK-3` — a no-change statement for the four
  restyles plus narrow presentation-scoped items for the Stay
  room-select placeholder (#422), the Rooms map live-state
  rendering (#424), and the wizard gating plus hotel-name
  persistence (#425) — merged via PR #427.
- `architect`: subsystem-boundary note in
  `docs/architecture/hld.md` section 13 ("Desk UI design rollout
  (Refs #419) — six-screen Claude UI"; map and wizard as
  presentation over existing rooms/admin-config surfaces, no new
  subsystem or contract), plus the four per-flow diagrams with
  happy path and failure/rollback path in
  `docs/architecture/lld.md` section 13 ("Desk UI
  design-rollout flows (Refs #419)") — 13.1 Stay explicit empty
  placeholder blocking check-in (#422), 13.2 Main housekeeping buttons with
  count refresh (#420), 13.3 Rooms counts-match-cards invariant
  (#424), 13.4 Onboarding gating with hotel-name persistence
  (#425) — merged via PR #429.
- `qa-lead`: test strategy and guard mapping in
  `docs/testing/desk-ui-rollout-test-traceability.md` (parity
  guards by `file:line` for all six screens plus new guards
  D1–D9 created by the screen PRs #420–#425), with the
  AC-DSK-1..8 rollout slice in
  `docs/testing/traceability-matrix.md` section 4 ("Desk UI
  rollout slice (Refs #419)") — merged via PR #428.
- `spec-reviewer`: gates each screen on the tier minimum set
  before its implementation PR opens.

## 9. Acceptance mapping (issue #419)

| Criterion | Evidence in this spec |
|---|---|
| Six per-screen sub-issues filed, linked, each closing with its implementation PR | Section 2 table (#420–#425); each closes with its own merged PR |
| Every screen matches tokens and layout; reviewer can check against the design file | Sections 3–4; AC-DSK-1..7 |
| All new/changed copy from the VI-primary catalogue; hotel name configurable example content | Section 7; AC-DSK-8 |
| #412 conflicts recorded on the affected sub-issue with the owner decision | Section 6 |
| Shared top nav and locale toggle consistent across all six screens | Section 4.1; AC-DSK-1 |
| Onboarding steps 2–4 scope decided; each step maps to an existing FR path with no new capability | Section 10 (Refs #438); AC-DSK-9..11 |

## 10. Onboarding steps 2–4 scope (Refs #438)

Status: product-owner scope decision for the deferred wizard steps.
Step 1 shipped in PR #437; this section specifies steps 2–4 per the
owner UI design (4-step first-run setup) so the steps 2–4
implementation runs as one small task in one PR. Tier T2
(reader-visible UI change): the binding done-conditions are
`AC-DSK-9` through `AC-DSK-11` in
`docs/product/acceptance-criteria.md` [section 11](acceptance-criteria.md).
This section sets scope, priority, and the wizard UI-contract
extension; FR/NFR wording is owned by `business-analyst`, flow
diagrams and technical design by `architect`, and guard mapping by
`qa-lead` (handoffs in section 10.6, named here, not written here).

Priority P1 (next); Size M (one worker session, one PR).

### 10.1 Scope in / out

In:

- Step 2 (hotel config details) per the owner UI design,
  persisted through the existing hotel-configuration path
  (`FR-ADM-1`): the remaining hotel identity, contact
  details, and local settings not collected in step 1.
- Step 3 (rooms/room-types seed) per the owner UI design,
  persisted through the existing seed path (`FR-ADM-3`):
  rooms with numbers, room types, floors, and capacity.
- Step 4 (users/admin setup) per the owner UI design,
  persisted through the existing admin user path
  (`FR-ADM-2`): the first owner account, so the hotel ends
  setup with a working owner sign-in.
- Wiring all four steps into the shipped wizard shell:
  progress indicator at 25/50/75/100 percent, back/continue
  navigation on every step, per-step validation that keeps
  staff on the failing step and names the missing field.
- The new VI strings steps 2–4 need, added through the
  normal catalogue process (`desk.onboarding.*`, en + vi,
  coverage check green).

Out:

- Changes to the shipped gate + step 1 behaviour (empty-database
  launch gating, hotel-name persistence, seeded-database
  redirect) — unchanged.
- Rate-plan and stay-policy setup (`FR-ADM-4`): after the
  wizard completes, the manager enters rate plans, standard
  times, and stay policies in Admin as today; the wizard
  does not collect them.
- Changes to existing screens beyond surfacing configured
  values (shell header brand, printed documents); other
  screens are untouched.

### 10.2 Step definitions (existing capabilities only)

No step adds an MVP capability and no step invents an FR:
each step operationalises first-run entry of an existing
admin capability, and the referenced FR acceptance criteria
govern field meaning and persistence.

- Step 1 (shipped, unchanged): hotel name via
  `UpdateHotelConfig` (`FR-ADM-1`, actor + timestamp);
  the name appears in the shell header and on printed
  documents.
- Step 2: the remaining `FR-ADM-1` hotel profile —
  identity, contact details, and local settings. Saved
  details appear on confirmations, invoices, and receipts,
  and the local settings govern dates, times, and stay
  policies hotel-wide. Exact field wording is owned by
  `business-analyst`; the wizard collects exactly what
  `FR-ADM-1` defines, nothing assumed.
- Step 3: the `FR-ADM-3` room and room-type setup — rooms
  with numbers, room types, floors, and capacity. Saved
  rooms appear in the inventory, availability, and
  calendar with the defined capacity and type. The
  implementation seeds through the existing seed path;
  no new endpoint decides seed shape.
- Step 4: the `FR-ADM-2` first owner account — name,
  sign-in identity, and the owner role, created through
  the existing admin user surface. The wizard completes
  only when a working owner sign-in exists; the owner
  then reaches exactly the owner-permitted functions
  (users and hotel setup) with manager and front-desk
  accounts creatable in Admin afterwards.

### 10.3 Navigation and progress

- Four steps, one idea per step, in fixed order 1–4 with
  the progress indicator showing 25/50/75/100 percent.
- Back and continue actions on every step: back returns
  to the previous step with already-entered values kept;
  continue validates the current step first.
- Validation failure keeps staff on the failing step and
  names the missing or invalid field in plain words;
  nothing persists for a failing step.
- Completion routes to the desk; the wizard never shows
  again on the now-seeded database.

### 10.4 Gate (unchanged from #425)

- The wizard launches on an empty database only: the
  unconfigured-hotel-identity predicate over
  `GetHotelConfig` is unchanged, and seeded desks never
  see the wizard.
- Deep-linking `/onboarding` on a seeded database
  redirects to the shell, as today.
- Setup stays owner-or-manager pathing with server-side
  role enforcement unchanged; a front-desk attempt reads
  as the existing refusal.

### 10.5 UI-contract extension (T2 wizard steps)

Section 4 stays the rollout-wide contract; for steps 2–4:

- Layout: the shipped wizard shell owns the progress
  indicator plus back/continue navigation; each step
  renders one card matching the design grouping, reusing
  the Admin field order where the step reuses an Admin
  surface.
- Component mapping: inputs, selects, and buttons follow
  the section 4.2 patterns (12px cards, 44px targets);
  no per-step token deviations (section 4.3 holds).
- States in plain words: loading names the wizard region
  while the shell stays visible; each step carries an
  explicit empty-state hint; errors never surface
  technical codes; refusals keep existing conditions
  with stand-in readable wording.
- Print: section 4.5 holds — configured values collected
  in the wizard (hotel identity, room inventory) surface
  on prints through the existing print paths; styling
  does not leak into print.

### 10.6 Spec handoffs (pending, owned elsewhere)

- `business-analyst`: FR/NFR delta for #438 — expected
  shape is a no-change statement (steps reuse
  `FR-ADM-1`, `FR-ADM-3`, `FR-ADM-2` with no new FR),
  or a narrow delta if the design implies one.
- `architect`: extend LLD section 13.4 with the steps
  2–4 flow (happy path + failure/rollback path) and the
  edge trace to the config/seed/admin call sites.
- `qa-lead`: extend guard D7 with steps 2–4 assertions
  (per-step persist + surfacing, back/continue, gate,
  catalogue) in the rollout traceability note.
- `spec-reviewer`: gates the steps 2–4 implementation PR
  on this section plus the three handoffs above.

## 11. Acceptance mapping (issue #438)

| Criterion | Evidence in this spec |
|---|---|
| Step 2 matches the design and persists via the existing config path | Sections 10.1–10.2; AC-DSK-9 |
| Step 3 matches the design and persists via the existing seed path | Sections 10.1–10.2; AC-DSK-10 |
| Step 4 matches the design and persists via the existing admin path | Sections 10.1–10.2; AC-DSK-11 |
| Progress indicator and continue/back navigation work across all four steps | Section 10.3; AC-DSK-9..11 (navigation half) |
| Wizard still launches on empty database only and does not interrupt existing data | Section 10.4; AC-DSK-7 (gate half, unchanged) |
| All new copy from the VI-primary catalogue with the coverage check green | Section 10.1; AC-DSK-8 (unchanged) |

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-576
