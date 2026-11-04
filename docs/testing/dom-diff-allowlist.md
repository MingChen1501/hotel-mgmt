# DOM diff dynamic-data allowlist (Closes #482)

Status: active. Owner-approved dynamic-data exemptions for the
node-by-node DOM diff gate (`app/e2e/dom-diff.ts` plus
`app/e2e/dom-diff.spec.ts`, Closes #480), owned by `qa-lead`.
The gate diffs the owner design HTML (`docs/design/*.dc.html`)
against the running desk UI node-by-node; nodes carrying dynamic
data (dates, counts, names) would otherwise fail on every run, so
they are exempted only through this allowlist. No exemption exists
outside this document: when the gate exempts a node, the exemption
is traceable to an entry in section 3, and section 5 states the
owner-approval path to add one. Docs only; no product behaviour
change, no gate script change, no CI workflow change.

## 1. Rule

The gate exempts dynamic data only via the owner-approved
allowlist in section 3. Concretely:

- Every `skipPaths` entry wired into the gate MUST cite one entry
  ID from section 3 (e.g. `DD-01`) in a code comment next to it.
- A diff on an allowlisted node path is a gate-harness bug, not a
  product regression: it means the hook or the entry drifted.
- A diff on a non-allowlisted node is a real gate failure, even
  when the text looks "obviously dynamic" (a date, a count, a
  name). The fix is to propose an entry via section 5, never to
  widen the hook or to edit the design files.

## 2. How the gate references this document

The hook lives in `app/e2e/dom-diff.ts` and this module only owns
the mechanism; the approved data list lives here:

- `DomDiffAllowlist.skipPaths`: each entry is a node path of the
  form `/html[0]/body[0]/...`. An entry exempts that node and its
  whole subtree (the entry itself plus anything under
  `entry + '/'`).
- `isAllowlisted(path, allowlist)`: the prefix check the diff
  applies on both sides (design nodes in section order first,
  then app-side extras).
- `unusedAllowlistEntries(design, actual, allowlist)`: reports
  entries that match zero nodes on either side. The gate logs
  these as warnings; a stale entry (after unrelated structural
  drift) silently stops exempting anything, so a warning here is
  the signal to re-point or retire the entry.
- `EMPTY_ALLOWLIST` (`skipPaths: []`): the default. The gate
  runs with no exemptions until section 3 approves entries and a
  follow-up wires them in with their entry IDs.

## 3. Approved entries

| ID | Screen | Node path | Exempted field | Dynamic data | Why exempt | Approved |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

No entries are approved yet: the gate runs with
`EMPTY_ALLOWLIST`, so every dynamic node currently diffs visibly
instead of being silently exempted. Full parity and the first
approved data remain follow-ups; each approval adds a row here
with its owner reference before any `skipPaths` entry may cite
it.

## 4. Eligible categories

These categories may be proposed as entries; none is exempt until
it has a row in section 3 with owner approval:

- Dates and timestamps (business date, check-in/out dates,
  "today" labels): differ between the static design snapshot and
  any live run.
- Counts and totals (room counts, occupancy numbers, folio
  totals): depend on lab seed data and actions taken during the
  run.
- Names and identifiers (guest names, staff names, room
  references): depend on lab seed data.
- Locale-formatted values (date/number/currency renderings of
  the above): vary with the desk locale under test, not with
  product correctness.

Out of scope for exemption: styling, layout, visibility, fonts,
colours, static copy, and structure. Those always diff as real
failures.

## 5. Owner-approval path to add an entry

1. Propose: open (or comment on) a Testing issue naming the
   screen, the node path, the dynamic data, and which category
   from section 4 it falls under, with the gate output showing
   the failure.
2. Owner approves: the owner records approval on the issue
   (explicit approval comment). No entry is valid without it.
3. Record: add a row to section 3 with the next `DD-NN` ID, the
   approval issue/comment reference, and the date.
4. Wire: add the node path to the gate `skipPaths` with a code
   comment citing the entry ID, in the same or a follow-up PR.
5. Retire: when an entry goes stale (the gate reports it via
   `unusedAllowlistEntries`) or the data becomes static, remove
   the `skipPaths` entry and mark the row retired with the
   reason. Rollback of this document is a single-PR revert.

## 6. Traceability

- Gate source of truth: `app/e2e/dom-diff.ts` (hook) and
  `app/e2e/dom-diff.spec.ts` (gate spec, Closes #480).
- Design source of truth: `docs/design/*.dc.html`
  (`docs/design/README.md`, Closes #462).
- Rollout done-conditions: `docs/product/acceptance-criteria.md`
  section 11; rollout traceability:
  `docs/testing/desk-ui-rollout-test-traceability.md`.
