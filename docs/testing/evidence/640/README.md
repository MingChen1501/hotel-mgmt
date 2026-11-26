# #640 guest identity ambiguity and payload bounds — evidence

Before/after reproduction record for
[issue #640](https://github.com/MingChen1501/hotel-mgmt/issues/640)
(audit findings G1, G2, G3; `AC-GID-1`..`AC-GID-7`, `FR-GID-1`..`FR-GID-3`,
`BR-63`, LLD [section 32](../../../architecture/lld.md#32-guest-identity-lookups-refuse-an-ambiguous-name-and-guest-payloads-carry-declared-bounds-refs-640),
guards `GID1`–`GID14` and evidence rule `GID-E1` in
[the test traceability](../../guest-identity-test-traceability.md)).
Left column is the pre-change build; right column is this change. Every
answer below was captured from a running `guests` process over HTTP (the
in-memory store, no `DATABASE_URL`), not from a test assertion.

## Finding

- **G1 — a name lookup served the first match.** With two guests named
  `Same Name Guest`, `IdentifyGuest` returned one guest's profile and
  stay links as a `200`, with no sign that a choice was made
  (`services/guests/src/store.ts`, first-match loop; the Postgres twin's
  `LIMIT 1`).
- **G2 — the guest write stored any object and any note.** `contact`
  accepted a 17-field object, `notes` a 2 001-character string, both with
  no bound (`asObject` and the unbounded `notes` assignment).
- **G3 — the confirmation date was shape-checked, not
  calendar-checked.** `AttachReservation` accepted `2026-13-45` and a
  later `ProduceConfirmation` returned it.

## Capture method

- Pre-change build: `git archive origin/master` extracted to
  `/tmp/opencode/pre640` (the spec PRs touched `docs/` only, so its code
  tree is the pre-change tree) and built with `npm run build` using this
  worktree's `services/guests/node_modules`.
- Post-change build: this branch, built the same way.
- Each build ran as its own process on a dedicated loopback port
  (`23760` pre-change, `23761` post-change) with a lab-only Bearer token;
  no shared compose lab, volume, or database was touched.
- Payloads: two `UpsertGuest` calls with the same `fullName`; one
  `UpsertGuest` with a 17-field `contact`; one with a 2 001-character
  `notes`; one `AttachReservation` with `dates.checkIn: "2026-13-45"`
  followed by `ProduceConfirmation` for the same ref.

## Before/after

| Case | Pre-change build | This change |
|---|---|---|
| Two guests, one name: `IdentifyGuest` by that name | `200` with guest A's `guestId`, `fullName`, `contact`, `notes`, `returningFlag`, `pastStayCount`, and `stayLinks` — the first match, served as a success | `400 {"code":"VALIDATION_FAILED","message":"The name Same Name Guest matches more than one guest; identify the guest by id.","details":{"field":"fullName","fullName":"Same Name Guest","matches":2},"traceId":"…"}` — no profile key in the body |
| `UpsertGuest` with a 17-field `contact` | `200` — the object stored as sent | `400 VALIDATION_FAILED` "contact must be an object of at most 16 fields whose values are text up to 256 characters, numbers, or true/false." `details.field` `contact` |
| `UpsertGuest` with a 2 001-character `notes` | `200` — the whole note stored as sent | `400 VALIDATION_FAILED` "notes must be at most 2,000 characters." `details.field` `notes` |
| `AttachReservation` with `dates.checkIn: "2026-13-45"` | `200` — the calendar-invalid date stored in the snapshot | `400 VALIDATION_FAILED` "dates.checkIn must be a YYYY-MM-DD date." `details.field` `dates.checkIn` |
| `ProduceConfirmation` for that ref after the refused attach | `200` — the invalid snapshot produced | `404 NOT_FOUND` "Unknown reservation RSV-EVID640." — nothing was stored |

Every post-change answer is one complete JSON object with exactly
`code`, `message`, `details`, `traceId`; the match count is the real
count (`2`), and the bounds sentences are the catalogue's (the notes
sentence renders the bound as `2,000` through `formatNumber`). No
refusal writes a guest row, a stay link, an outbox event, or a
confirmation snapshot.

The unchanged outcomes (a unique name, a name with no match, and every
`guestId` read) are pinned by the existing suites re-run untouched and by
the new `GID4`/`GID5` guards; see
[the test traceability](../../guest-identity-test-traceability.md)
section 4.

<!-- ao-role: dev -->
Role: dev · AO session hotel-mgmt-1156
