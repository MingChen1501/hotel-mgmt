# ADR-0004: Versioned REST API — versioning, auth/session, and error envelope

Status: proposed (Closes #414). Owned by `architect`.

Date: 2026-10-28 (proposed).

## Context

The owner lifted the post-pilot deferral on the REST API migration and
asked for a versioned REST API design in three companion issues. This
record covers the cross-cutting decisions for issue #414: how the REST
API is versioned, how callers authenticate, and what a failed call looks
like. The per-module resource surface is companion issue #415 and the
migration path and rollout plan is companion issue #416; neither is
decided here.

Inputs this record builds on:

- Issue #368 (REST API migration plan — strangler per-resource phasing,
  error-model mapping of envelope code to HTTP status plus problem+json
  with `details` preserved, contract-as-source-of-truth extension,
  dual-run CI, no-behaviour-change rule). Still open; its ADR is the
  migration record, this ADR is the cross-cutting design under it.
- Issue #369 (versioning and upgrade strategy — identifier placement,
  breaking-change rules, deprecation policy, client compatibility
  expectations, fail-closed contract-check). Still open; this ADR
  decides the items in its scope that belong to #414.
- As built today: synchronous calls are `POST /v1/<contract>/<Operation>`
  behind Nginx with an opaque Bearer session token and the shared error
  envelope (`docs/architecture/lld.md` section 0;
  `docs/technical/integration.md` section 0 rule). Contracts in
  `contracts/` carry `major.minor` versions sent as `Contract-Version`
  on sync calls, with additive changes bumping minor and removals,
  renames, type changes, and new required fields bumping major plus a
  deprecation window of at least one system release
  (`docs/technical/integration.md` section 8). The envelope-code to
  HTTP-status mapping already exists in
  `contracts/errors/envelope.json` (`statusMapping`). Contract-check in
  CI today enforces JSON parse plus manifest match only; the
  major-bump gate is planned, not implemented
  (`docs/technical/integration.md` section 9).

## Decision

Three decisions, each with its rule and its enforcement point.

### D1 — Versioning: URL path major plus versioned contracts (both)

REST resources are versioned twice, at two different granularities,
because the two identifiers do different jobs:

- The URL path carries the major version (`/v2/...`, later `/v3/...`).
  It is the routing identifier: visible, cache-safe, and routable in
  Nginx. A new major means a new path; the old path keeps serving for
  the whole deprecation window.
- The contract keeps its `major.minor` version field and the
  `Contract-Version` header (`docs/technical/integration.md`
  section 8). It governs schema evolution: additive changes (new
  optional fields, new operations, new event types) bump minor and stay
  on the same path; removals, renames, type changes, and new required
  fields bump major. Extended to REST, the following are also major:
  path changes, HTTP method changes, response-status changes, and error
  code removals.

Relationship to the existing `v1` prefix: the current RPC-style surface
(`POST /v1/<contract>/<Operation>`) is frozen at v1. It receives bug
fixes only — no new operations, no shape changes — from the day the
first `/v2` resource ships until decommission. The REST surface starts
at `/v2`; there is no `/v1` REST projection, so routers and clients can
tell the two styles apart by path alone.

Enforcement (fail closed): the planned compatibility gate in
`docs/technical/integration.md` section 9 is extended to the REST
surface — CI fails on any breaking `contracts/` change that lacks a
major bump plus a deprecation note. An undeclared breaking change never
merges silently, on either style.

### D2 — Auth/session: keep the current session model unchanged

The REST API reuses the existing session model with no new token type,
no new issuer, and no behaviour change:

- Every call carries the opaque HMAC-signed session token issued by
  Admin in the `Authorization: Bearer <token>` header, exactly as
  today (`docs/architecture/lld.md` section 0). Providers validate
  locally (signature plus expiry) and re-check revocation with Admin
  at least every 5 minutes, always on sensitive operations
  (user/role changes, open-balance approvals, day-close).
- Idle sessions end after 15 minutes without activity; identities lock
  after 5 consecutive wrong secrets (`NFR-SEC-2`; enforcement points
  in `docs/technical/security-threat-model.md`).
- Every provider enforces role checks before any business logic; there
  is no anonymous path and no guest sign-in (`NFR-SEC-1`). Tokens never
  travel in URLs. The per-module requirements follow the RBAC matrix
  in `docs/technical/security-threat-model.md` section 3:

| Module | Front-desk | Manager | Owner |
|---|---|---|---|
| Reservations (book, modify, cancel, walk-in, no-show, calendar) | yes | yes | yes |
| Stay (check-in, check-out, moves, times, arrivals lists) | yes | yes | yes |
| Rooms (housekeeping states, inventory view) | yes | yes | yes |
| Rooms setup (room/room-type setup, out-of-order blocks) | no | yes | yes |
| Rates (plans, restrictions, discounts, day-close inputs) | no | yes | yes |
| Guests (profile CRUD, preferences, confirmation record) | yes | yes | yes |
| Billing (charges, payments, invoices, receipts) | yes | yes | yes |
| Billing day-close | no | yes | yes |
| Reporting (daily sheet, housekeeping) | yes | yes | yes |
| Reporting (occupancy, revenue) | no | yes | yes |
| Admin (users, roles, hotel setup, export, backup) | no | backup view only | yes |

Provenance note: the Guests row (front-desk yes on profile CRUD)
has no direct counterpart row in the section 3 matrix; it is
derived from the booking and check-in flows, where front desk
identifies and upserts the guest profile before confirming
(`docs/requirements/sequence-diagrams.md` sections 2, 6, 7;
FR-GST-1..4).

- Server-to-server calls inside a desk flow carry the originating desk
  session token, so provider-side `ValidateSession`/`CheckRole`
  (`docs/technical/integration.md` C10) keeps working unchanged.
- No OAuth2 or external identity provider: the installation is
  offline by design with no inbound internet and no guest sign-in, so
  an external issuer would add a dependency the property cannot reach
  (`docs/technical/security-threat-model.md` section 7).
- Session-expiry refusals keep code `UNAUTHENTICATED` and
  locked-identity refusals keep code `IDENTITY_LOCKED`
  (`docs/architecture/lld.md` section 0; registered in
  `contracts/errors/envelope.json`).

### D3 — Error envelope: RFC 9457 problem+json over the existing codes

The existing envelope codes stay the stable contract; only the wire
shape gains an HTTP-native framing. The status mapping in
`contracts/errors/envelope.json` (`statusMapping`) is normative for
REST:

| Code | HTTP status |
|---|---|
| `VALIDATION_FAILED` | 400 |
| `UNAUTHENTICATED`, `IDENTITY_LOCKED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT`, `SETTLEMENT_REQUIRED` | 409 |
| `STATE_ILLEGAL` | 422 |

Wire shape: `application/problem+json` (RFC 9457) with the existing
envelope fields preserved as extensions, so desk clients keep acting on
the same data:

| problem+json field | Value |
|---|---|
| `type` | Stable per-code identifier, `urn:hotel-mgmt:<CODE>` |
| `status` | The mapped HTTP status above |
| `title` | The human-readable sentence naming what was refused and why (today's `message`) |
| `detail` | Occurrence-specific explanation (may refine `title`) |
| `code` (extension) | The existing stable token (`VALIDATION_FAILED`, `NOT_FOUND`, …) — required |
| `details` (extension) | Today's `details` object verbatim (named field, restriction, room, conflicting entity) — required, never dropped or renamed |
| `traceId` (extension) | Hotel-local correlation id linking to the audit entry — required |

Rules: every refusal carries the mapped status (never 200 with an
error body); 401 responses carry `WWW-Authenticate: Bearer`;
`details` is preserved exactly so the desk can act on it (for example
naming the room type and dates on `CONFLICT`, the restriction on
`STATE_ILLEGAL`); all user-visible strings come from the message
catalogue (`NFR-I18N-1`).

## Consistency with #368 and #369

No contradicting decisions. This ADR adopts #368 wholesale (strangler
phasing as input — sequencing itself is #416; the error-model mapping
made normative in D3; dual-run CI and the no-behaviour-change rule
restated as constraints on the later implementation slices) and decides
the #369 items in #414 scope (both-identifier placement in D1;
breaking rules as the section 8 rules extended to REST; deprecation as
a `Sunset` response header plus release-notes announcement with a
dual-serve period of at least one system release; desk UI ships lockstep
while external consumers get the window).

Deltas made explicit (decisions #368/#369 left open, pinned here):

1. Deprecation signalling: #369 asked "headers? sunset notes?" — this
   ADR decides `Sunset` (RFC 8594) plus a `Deprecation: true`
   response header on every deprecated path, announced in release
   notes, served dual for at least one system release.
2. The v1 freeze rule (bug fixes only, no new operations) is new:
   neither issue states it, and it is required to give `/v2` meaning.
3. The problem shape is pinned to RFC 9457 field-for-field (#368 said
   "problem+json" generically); `type` as `urn:hotel-mgmt:<CODE>` is
   new and keeps the existing `code` token as the programmatic key.
4. `IDENTITY_LOCKED` to 401 is recorded here as normative; the mapping
   already exists in `contracts/errors/envelope.json` and no contract
   file changes in this issue.

## Out of scope

Resource naming, HTTP methods, and request/response shapes per module
(companion #415); migration phases, exit gates, rollout order, and
decommission timing (companion #416); any code, contract, or CI change.

## Consequences

- The #415 resource surface and the #416 rollout plan must follow
  D1–D3; any deviation needs a superseding ADR, not silent drift.
- Enforcement points: the extended fail-closed contract-check (D1),
  a `/v2` OpenAPI mirror check modelled on
  `script/openapi-route-check.sh` when the #415 spec lands, and
  dual-run CI per #368. The #415 resource-surface spec restates the
  D1 rule that response-status changes are major, giving that mirror
  check its direct normative hook. No enforcement code changes in
  this issue.
- This ADR starts at `proposed`; only the owner flips it to
  `accepted`. Implementation slices start only after owner acceptance
  plus the T3 spec-gate PASS recorded on #368.

## Options considered

### Versioning: URL path only vs contract versions only vs both (chosen)

- URL path only: routable and obvious, but says nothing about schema
  evolution inside a major; every additive field would need
  out-of-band coordination.
- Contract versions only: precise schema evolution, but invisible to
  routers, caches, and Nginx; clients cannot tell majors apart from
  the path.
- Both (chosen): path routes the major, contracts evolve the schema.
  Downside: two places to bump — mitigated by the rule that minor
  bumps never change the path, so clients watching the path see only
  real breaking changes.

### Auth: keep session tokens (chosen) vs OAuth2/OIDC

- OAuth2/OIDC: standard for internet APIs, but needs a reachable
  issuer and token endpoint; the property is offline by design and
  remote access already enters through the same session model over
  Tailscale. Rejected: new infrastructure for zero desk gain.
- Keep session tokens (chosen): no behaviour change, existing
  revocation, idle-sign-out, and lockout controls apply unchanged.

### Errors: bare statuses vs 200-with-envelope vs problem+json (chosen)

- Bare HTTP statuses: loses the `details` the desk acts on; rejected.
- 200 with the old envelope body: keeps `details` but breaks HTTP
  semantics (retries, caches, and generic clients misread failures);
  rejected.
- problem+json with preserved extensions (chosen): standard framing,
  existing codes and `details` untouched, `traceId` retained for audit
  linkage.

<!-- ao-role: architect -->
Role: architect · AO session hotel-mgmt-533
