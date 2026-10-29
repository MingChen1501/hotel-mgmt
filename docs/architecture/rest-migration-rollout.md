# Versioned REST API — migration path and rollout plan

Status: proposed (Closes #416). Owned by `architect`.

Date: 2026-10-29 (proposed).

## Context

The owner lifted the post-pilot deferral on the REST API migration and
asked for a versioned REST API design in three companion issues. This
record covers the migration path and rollout plan for issue #416: how
the current RPC-style surface (`POST /v1/<contract>/<Operation>`)
strangles over to `/v2` REST, in what phases, under which exit gates,
with what rollback story, and how clients are carried across.

Inputs this record builds on:

- Issue #368 (ADR: REST API migration plan — strangler
  per-resource phasing, read-only GETs first, booking/stay writes with
  `Idempotency-Key` next, admin last, no-behaviour-change rule,
  dual-run CI, decommission with deprecation window). Still open; its
  ADR is the migration record, this plan sits under it. The owner-cited
  input draft `rest-migration-plan.md` (§3 strangler recommendation,
  §4 slice order, §5 technical rules, §6 risks, §7 gates) is an
  orchestrator artifact, not on disk; this plan cites the #368 issue
  body as the input record.
- Issue #369 (versioning and upgrade strategy — deprecation policy and
  window, dual-serve period, client compatibility expectations). Still
  open; the signalling it asked about is decided in ADR-0004 and
  applied here.
- ADR-0004 (`docs/architecture/decisions/
  adr-0004-rest-versioning-auth-errors.md`, Closes #414): `/v2` path
  plus versioned contracts, v1 freeze (bug fixes only from the first
  `/v2` ship), unchanged session auth, RFC 9457 problem+json errors,
  `Sunset` plus `Deprecation: true` headers with a dual-serve period of
  at least one system release, desk UI lockstep versus external
  consumers on the window.
- The per-module surface (`docs/architecture/rest-resource-surface.md`,
  Closes #415): every operation mapped to an endpoint, reads as GETs,
  keyed writes with `Idempotency-Key`, admin paths reserved to land
  last. Phase references below (surface §§1–8) point at that record.

## 0. Standing rules (inherited, not re-decided)

These constrain every phase. They are restated here so the plan reads
alone; the normative hooks stay where they were decided.

- No-behaviour-change rule (#368): the migration changes transport
  only. Business outcomes — guards, totals, states, printable records —
  are identical on both styles. A divergence is a defect, never an
  accepted delta.
- v1 freeze (ADR-0004 D1): from the day the first `/v2` resource ships,
  the RPC surface takes bug fixes only — no new operations, no shape
  changes.
- Dual-run (#368): both styles serve the same behaviour through every
  migration phase; CI compares outcomes, not just status codes.
- Contract-as-source-of-truth with fail-closed checking (ADR-0004 D1):
  an undeclared breaking change never merges silently, on either style.
- Implementation slices start only after pilot sign-off, owner ACCEPT
  of the #368 ADR, and the T3 spec-gate PASS recorded on #368. Nothing
  in this plan moves that gate earlier.

## 1. Migration path: strangler in four phases

Each phase ships one slice of the surface (section references below
are to `docs/architecture/rest-resource-surface.md` §§1–8), dual-serves
it with v1, flips the desk UI to it, then exits through its gate. v1 is
removed only in Phase 4, after the deprecation window.

### Phase 0 — Preparation (no traffic shifts)

- Declare the v1 freeze at the first `/v2` ship; announce it in
  release notes.
- Land the enforcement substrate before any `/v2` traffic: the
  extended fail-closed contract-check (ADR-0004 D1), the `/v2` OpenAPI
  mirror check modelled on `script/openapi-route-check.sh`, and the
  dual-run comparator in CI.
- Record the three #368 gates (pilot sign-off, owner ACCEPT,
  spec-gate PASS) before any slice ships.

Exit gate: substrate green in CI plus all three #368 gates recorded.
No client moves until then.

### Phase 1 — Read slice (GETs first, per #368)

Every safe read dual-serves first: reservation lookup and calendar
(surface §1), stay reads including arrivals/departures and the stay-ref
link (§2), room and sellability reads (§3), quote/availability/
restriction checks (§4), guest reads and the confirmation record (§5),
folio/invoice/receipt reads (§6), all four reports (§7), and the admin
reads (§8: user list, hotel config, audit log). The session endpoints
(`POST /v2/sessions`, `DELETE /v2/sessions/current`) ship here too:
every `/v2` call needs a token from day one, and issuing one changes no
behaviour. User, role, secret, and config management stay v1-only until
Phase 3.

The desk UI flips its reads to `/v2` first (lockstep, same release as
the backend). External readers keep v1 with no deadline pressure yet.

Exit gate: dual-run comparator clean on the read slice for one full
release; desk loop green with reads on `/v2`; v1 read traffic from the
desk UI at zero.

### Phase 2 — Desk-write slice (booking/stay writes, per #368)

The keyed writes: reservation create/modify/cancel/no-show/check-in-link
(§1), stay check-in/check-out/moves/actual-times (§2), folio charges,
payments, and open-balance approvals (§6), and `AssignRoom`/`ReleaseRoom`
(§3). Every one of them requires `Idempotency-Key` with the surface §0
semantics: missing key is `400 VALIDATION_FAILED`; same key plus same
payload replays the stored result; same key plus different payload is
`422 STATE_ILLEGAL`.

Deprecation signalling starts here on the v1 write paths the slice
replaces: `Sunset` (RFC 8594) plus `Deprecation: true` response headers
and a release-notes announcement, per ADR-0004. The headers mark intent;
removal waits for Phase 4.

Exit gate: comparator clean on the write slice including key-replay and
key-mismatch cases; desk loop green with desk writes on `/v2`; the
dual-serve window for the replaced v1 writes formally open and dated.

### Phase 3 — Setup and admin slice (admin last, per #368)

Everything remaining, in this order: rooms and rates setup upserts
(§§3–4), guest upsert/attach (§5), charge-item and tax-fee setup plus
day-close (§6), the export/backup async jobs (§8), and finally the admin
writes — user creation, role updates, unlocks, secret changes, hotel
config updates (§8). Admin lands last because it guards identities,
roles, and hotel settings: the smallest blast radius stays latest.

Exit gate: comparator clean on the remaining slice; desk loop green
fully on `/v2`; explicit owner sign-off for the admin cutover recorded
before the admin writes flip.

### Phase 4 — Decommission

v1 serves dual through the deprecation window of at least one system
release from the Phase 2/3 announcements (ADR-0004). Removal needs two
facts, both checkable: the window expired, and v1 traffic (desk plus
external) at zero for the window. Then the v1 RPC routes, their tests,
and their docs go in one removal change; the `Sunset` headers retire
with the routes they marked.

## 2. Dual-run and the no-behaviour-change rule

Dual-run means both styles serve the same behaviour at once: the desk UI
(or a dual-run client) issues the same business intent on both paths and
CI compares business outcomes — resulting state, totals, guard
decisions, printable bytes — not just HTTP statuses. Transport-only
differences (path, method, status code per the normative
`statusMapping`, problem+json framing with `details` preserved) are
expected and whitelisted in the comparator; anything else fails the
slice.

What counts as behaviour change (forbidden in every phase): new guards,
changed totals or rounding, changed state transitions, changed printable
content, changed auth or RBAC outcomes. What counts as transport change
(allowed): URL, method, status code per mapping, `Idempotency-Key`
plumbing, pagination or query-param rendering of existing filters.

## 3. Rollback

Rollback is a client-routing revert, never a data repair: this
migration moves no stored data and changes no storage schema, so there
is nothing to migrate back. Per phase:

- Phases 1–3: route the desk UI (or the affected client) back to the v1
  operation. `/v2` stays deployed but unrouted while the divergence is
  fixed; v1 never stopped serving, so the revert is a switch, not a
  rebuild.
- Idempotency keys make write rollback safe to retry: a `/v2` write
  already applied replays its stored result on re-delivery instead of
  double-applying, so a client that straddles the revert cannot charge
  or book twice.
- Phase 4 has no rollback by design: removal happens only after the
  window expired with v1 traffic at zero. The gate is the safety; once
  the routes are gone, re-adding them is a new change, not a rollback.

## 4. Client compatibility matrix

Two client classes with different contracts:

| | Desk UI | External consumers |
|---|---|---|
| Release coupling | Lockstep: ships with the backend, flips per phase in the same release | Independent: migrate inside the window at their own pace |
| Phase 1–3 expectation | Reads flip first, then desk writes, then setup/admin — each behind its phase gate | No forced move until Phase 4; v1 keeps serving with identical behaviour |
| Deprecation signal | Release notes plus phase gates (the team flips the switch) | `Sunset` plus `Deprecation: true` headers on replaced v1 paths, release-notes announcement, dated window of at least one system release |
| Auth | Unchanged session token on both styles from Phase 1 (ADR-0004 D2) | Same token, same RBAC matrix; no new issuer, no OAuth |
| Errors | problem+json on `/v2` with `code` and `details` preserved — existing handling keys off the same tokens | Same: the `code` extension stays the programmatic key across styles |
| End of window | N/A (already flipped) | v1 removed only after window expiry with v1 traffic at zero |

## 5. Dual-serve period and decommission signalling

- Every replaced v1 path serves dual with its `/v2` successor from the
  slice ship until Phase 4 — at least one system release, announced
  with a date in the release notes (ADR-0004).
- Signalling on deprecated paths: `Sunset` (RFC 8594) plus
  `Deprecation: true` on every response from a deprecated v1 operation,
  starting in Phase 2 for writes (Phase 3 for the remainder). The
  headers are machine-readable intent; the release-notes date is the
  commitment.
- No early removal: a slice's v1 paths are removed only when the window
  expired and observed v1 traffic is zero. Removal is one change with
  its own review, not a side effect of a slice.

## 6. Consistency with #368, #369, and ADR-0004

No contradicting decisions. This plan adopts #368 wholesale (strangler,
slice order, dual-run, no-behaviour-change, gates), applies the #369
items ADR-0004 decided (deprecation headers, dual-serve period, lockstep
versus windowed clients), and phases against the #415 surface without
renaming anything.

Deltas made explicit (decisions #368/#369 left open, pinned here):

1. Phase count: #368 names slices, not phases — this plan pins four
   phases plus a Phase 0, with per-phase exit gates, so a slice knows
   when it is done.
2. Session endpoints ship in Phase 1 as auth substrate while the rest of
   admin lands last: no prior record splits admin this way, and `/v2`
   calls need tokens from day one.
3. Rollback defined as routing revert with no data repair (no storage
   migration exists to roll back), plus the Phase 4 no-rollback rule:
   neither issue states a rollback story.
4. The decommission bar is pinned to two checkable facts (window expired
   plus v1 traffic at zero); #368/#369 require a window but no removal
   bar.
5. `Idempotency-Key` replay is what makes a mid-write client revert
   safe: the surface defines the key semantics, this plan states the
   rollback consequence.

## Out of scope

Versioning/auth/error-envelope decisions (companion #414, decided in
ADR-0004); per-module resource naming and shapes (companion #415,
decided in the resource surface); any code, contract, or CI change.

## Consequences

- Implementation slices phase against this plan: GETs, then keyed desk
  writes, then setup, then admin, then decommission — in that order,
  each exiting through its gate.
- Enforcement points (for the implementation slices, not this issue):
  the extended fail-closed contract-check, the `/v2` OpenAPI mirror
  check, and dual-run CI — all live from Phase 0.
- This record starts at `proposed`; only the owner flips it to
  `accepted`. Implementation slices start only after owner acceptance
  plus the T3 spec-gate PASS recorded on #368.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-594
