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
| 3 | Onboarding setup wizard | 4-step first-run setup (Thiet lap lan dau) | #425 | M | risk-medium | New screen and new feature: a guided first-run wizard addressing the empty-database path from the #412 QA findings. The design shows step 1 only (hotel-name input with example placeholder, invoice/receipt helper, 25 percent progress bar, continue action); steps 2–4 need a product-owner spec or owner decision before building beyond step 1. Gated to launch on empty database only. |
| 4 | Rooms visual map | Rooms visual map (So do phong) | #424 | M | risk-medium | New screen: floor-grouped visual map (18 rooms across 3 floors in the design) with a status-chip summary row and per-room cards. The static design shows only a refresh action and no per-card buttons, so action placement needs a product-owner decision before building; no actions are invented. |
| 5 | Book | Book screen (Dat phong) | #421 | S | risk-low | Restyle only; the booking flow itself is unchanged. |
| 6 | Folio | Folio screen (Hoa don) | #423 | S | risk-low | Restyle only; folio logic is unchanged. |

Sequencing: the four restyles (#420–#423) are independent of each
other. The Rooms map (#424) should land after the Main board
(#420) so the two housekeeping surfaces agree on status wording.
The Onboarding wizard (#425) needs its steps 2–4 decision before
implementation starts; step 1 may not merge on an assumed
steps 2–4 design.

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

The binding done-conditions are `AC-DSK-1` through `AC-DSK-8`
in `docs/product/acceptance-criteria.md` [section 11](acceptance-criteria.md).
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

<!-- ao-role: product-owner -->
Role: product-owner · AO session hotel-mgmt-547
